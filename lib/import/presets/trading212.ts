/**
 * Ronde 2 (A4): Trading 212, geschiedenis exporteren (broker-import.md 3.4). Kolommen verschillen per export (lege
 * kolommen vallen weg, de volgorde wisselt): altijd op naam lezen. Tijden zijn UTC; een regel op 31 december 23:30 UTC
 * hoort bij 1 januari.
 *
 * Dividend: bruto lokaal = aantal × dividend per aandeel; de belasting staat in "Withholding tax" (valuta in de kolom
 * erna); Total is netto in euro's. De koers is impliciet: (bruto − belasting) / Total. Het afrondingsverschil tussen
 * bruto − belasting in euro's en Total komt op het geld.
 */
import type { Gebeurtenis, GebeurtenisSoort, Preset } from '../types'
import { centen, leesDatum, leesGetal } from '../getallen'
import { gebeurtenis, kolom, onbekendMelding, regelNummer, uitkomst, veld } from './hulp'

function soortVan(actie: string): GebeurtenisSoort | null {
  const a = actie.trim().toLowerCase()
  if (a === 'deposit') return 'storting'
  if (a === 'withdrawal') return 'opname'
  if (/\bbuy$/.test(a)) return 'koop'
  if (/\bsell$/.test(a)) return 'verkoop'
  if (a.startsWith('dividend')) return 'dividend'
  if (/interest/.test(a)) return 'rente'
  if (a === 'currency conversion') return 'valutaIntern'
  if (/^(stock distribution|stock split|corporate action|custom stock split)/.test(a)) return 'corporateAction'
  if (/^(spending cashback|cashback)/.test(a)) return 'storting'
  return null
}

export const trading212: Preset = {
  formaat: 'trading212',
  naam: 'Trading 212 geschiedenis',
  zekerheid: 'geverifieerd',
  herken: (b) => kolom(b.kop, 'action') >= 0 && kolom(b.kop, 'time') >= 0 && (kolom(b.kop, 'currency (total)') >= 0 || kolom(b.kop, /^total \(\w{3}\)$/) >= 0),
  lees: (b) => {
    const k = {
      actie: kolom(b.kop, 'action'),
      tijd: kolom(b.kop, 'time'),
      isin: kolom(b.kop, 'isin'),
      aantal: kolom(b.kop, 'no. of shares'),
      prijs: kolom(b.kop, 'price / share'),
      prijsValuta: kolom(b.kop, 'currency (price / share)'),
      totaal: kolom(b.kop, 'total', /^total \(\w{3}\)$/),
      totaalValuta: kolom(b.kop, 'currency (total)'),
      belasting: kolom(b.kop, 'withholding tax'),
      belastingValuta: kolom(b.kop, 'currency (withholding tax)'),
      fxKosten: kolom(b.kop, 'currency conversion fee', /^currency conversion fee \(\w{3}\)$/),
      fxKostenValuta: kolom(b.kop, 'currency (currency conversion fee)'),
    }
    /** Overige kostenkolommen ("Stamp duty reserve tax (GBP)", "Transaction fee", "Finra fee", "French transaction tax"). */
    const kostKolommen = b.kop
      .map((naam, i) => ({ naam: naam.toLowerCase(), i }))
      .filter((x) => /(stamp duty|transaction fee|finra fee|french transaction tax|transaction tax)/.test(x.naam) && !x.naam.startsWith('currency ('))
    const totaalValutaUitKop = /\((\w{3})\)$/.exec(b.kop[k.totaal] ?? '')?.[1]
    const g: Gebeurtenis[] = []
    const onbekend: number[] = []
    let voorbeeld: string | undefined
    b.regels.forEach((r, index) => {
      const regel = regelNummer(b, index)
      const actie = veld(r, k.actie)
      if (!actie) return
      const datum = leesDatum(veld(r, k.tijd), { utc: true })
      const soort = soortVan(actie)
      if (!datum || soort === null) {
        onbekend.push(regel)
        voorbeeld ??= actie
        return
      }
      const totaalValuta = (veld(r, k.totaalValuta) || totaalValutaUitKop || 'EUR').toUpperCase()
      const totaal = leesGetal(veld(r, k.totaal), '.') ?? 0
      const isin = veld(r, k.isin).toUpperCase() || undefined
      const aantal = leesGetal(veld(r, k.aantal), '.') ?? undefined
      const metEur = (eur: number) => (totaalValuta === 'EUR' ? { eur } : {})
      const basis = { formaat: 'trading212' as const, regel, datum, ...(isin ? { isin, activum: isin } : {}) }
      if (soort === 'valutaIntern' || soort === 'corporateAction') return
      if (soort === 'storting' || soort === 'opname' || soort === 'rente') {
        // Notes kan een rekeningnummer bevatten ("Sent to Bank Account …"): niet overnemen.
        g.push(gebeurtenis({ ...basis, soort, bedrag: soort === 'opname' ? -Math.abs(totaal) : totaal, valuta: totaalValuta, ...metEur(soort === 'opname' ? -Math.abs(totaal) : totaal), omschrijving: actie }))
        return
      }
      if (soort === 'koop' || soort === 'verkoop') {
        let kosten = 0
        if (totaalValuta === 'EUR') {
          const fx = leesGetal(veld(r, k.fxKosten), '.')
          const fxValuta = (veld(r, k.fxKostenValuta) || 'EUR').toUpperCase()
          if (fx && fxValuta === 'EUR') kosten += Math.abs(fx)
          for (const kk of kostKolommen) {
            const v = leesGetal(veld(r, kk.i), '.')
            if (v && /\(eur\)$|^[^(]*$/.test(kk.naam)) kosten += Math.abs(v)
          }
        }
        kosten = centen(kosten)
        // Bij een aankoop is Total inclusief kosten, bij een verkoop na aftrek van kosten.
        const som = soort === 'koop' ? centen(Math.abs(totaal) - kosten) : centen(Math.abs(totaal) + kosten)
        const bedrag = soort === 'koop' ? -som : som
        g.push(gebeurtenis({ ...basis, soort, bedrag, valuta: totaalValuta, ...metEur(bedrag), ...(aantal !== undefined ? { aantal: soort === 'koop' ? aantal : -aantal } : {}), omschrijving: actie }))
        if (kosten > 0) g.push(gebeurtenis({ ...basis, soort: 'kosten', bedrag: -kosten, valuta: 'EUR', eur: -kosten, omschrijving: 'Kosten van de transactie' }))
        return
      }
      // Dividend: bruto lokaal, belasting lokaal, netto in euro's.
      const prijs = leesGetal(veld(r, k.prijs), '.') ?? 0
      const lokaal = (veld(r, k.prijsValuta) || totaalValuta).toUpperCase()
      const brutoLokaal = centen((aantal ?? 0) * prijs)
      const belastingLokaal = Math.abs(leesGetal(veld(r, k.belasting), '.') ?? 0)
      const belastingValuta = (veld(r, k.belastingValuta) || lokaal).toUpperCase()
      let brutoEur: number | undefined
      let belastingEur: number | undefined
      if (lokaal === 'EUR' && totaalValuta === 'EUR') {
        brutoEur = brutoLokaal
        belastingEur = belastingValuta === 'EUR' ? belastingLokaal : undefined
      } else if (totaalValuta === 'EUR' && totaal > 0 && belastingValuta === lokaal) {
        const koers = (brutoLokaal - belastingLokaal) / totaal
        if (koers > 0) {
          brutoEur = centen(brutoLokaal / koers)
          belastingEur = centen(belastingLokaal / koers)
        }
      }
      g.push(gebeurtenis({ ...basis, soort: 'dividend', bedrag: brutoLokaal, valuta: lokaal, ...(brutoEur !== undefined ? { eur: brutoEur, koersBron: 'broker' as const } : {}), omschrijving: 'Dividend' }))
      if (belastingLokaal > 0) {
        g.push(gebeurtenis({ ...basis, soort: 'dividendbelasting', bedrag: -belastingLokaal, valuta: belastingValuta, ...(belastingEur !== undefined ? { eur: -belastingEur, koersBron: 'broker' as const } : {}), omschrijving: 'Ingehouden belasting op dividend' }))
      }
      if (brutoEur !== undefined && belastingEur !== undefined && totaalValuta === 'EUR') {
        const verschil = centen(totaal - (brutoEur - belastingEur))
        if (verschil !== 0) g.push(gebeurtenis({ ...basis, soort: 'valutaIntern', bedrag: verschil, valuta: 'EUR', eur: verschil, omschrijving: 'Afrondingsverschil bij de omrekening' }))
      }
    })
    return uitkomst('trading212', g, [], [onbekendMelding(onbekend, voorbeeld)])
  },
}
