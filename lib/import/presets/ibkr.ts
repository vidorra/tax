/**
 * Ronde 2 (A4): Interactive Brokers, Activity Statement (jaar, CSV). Eén bestand met secties: kolom 1 de sectie, kolom 2
 * het regeltype (Header, Data, Total, SubTotal); elke Header geldt voor de Data erna (broker-import.md 3.3).
 *
 * - Waarde begin en eind: Net Asset Value, Prior Total en Current Total in de basisvaluta; Cash naar het geld, de rest
 *   (aandelen, opgebouwd dividend) naar de effecten.
 * - Bedragen in euro's: per valuta de regel "Total in EUR", naar rato over de regels verdeeld (grootste rest).
 * - Land van de bronbelasting uit het achtervoegsel " - XX Tax", niet uit het ISIN (een GDR met een US-ISIN had
 *   "- KR Tax"). Belasting op rente ("Withholding @ 20% on Credit Interest") heeft geen land: de gebruiker kiest.
 * - Terugboeking en herinhouding op dezelfde dag heffen elkaar op: per effect en datum gesaldeerd.
 * - Payment in Lieu of Dividend is opbrengst maar geen dividend in verdragszin; Return of Capital is geen opbrengst.
 * - Aankopen min verkopen staan niet in dit overzicht zonder de sectie Trades: ze volgen uit de kasstand (kas eind min
 *   kas begin, min stortingen, netto dividend en rente, plus kosten). Koersverschillen op vreemde valuta in de kas
 *   tellen daarin mee. Het rendement van de rekening als geheel klopt daarmee altijd.
 *
 * De naam van de rekeninghouder (Account Information, ook in "Disbursement Initiated by …") wordt nergens bewaard.
 */
import type { CsvBestand, Gebeurtenis, ImportMelding, Preset, Stand } from '../types'
import { centen, leesDatum, leesGetal, verdeelNaarRato, verschuifDag } from '../getallen'
import { landUitBrokerTekst } from '../land'
import { gebeurtenis, uitkomst } from './hulp'

type Rij = { regel: number; velden: Record<string, string> }

/** Secties met hun Data-regels, elk als object op de kop die ervoor gold. */
function secties(b: CsvBestand): Map<string, Rij[]> {
  const uit = new Map<string, Rij[]>()
  const koppen = new Map<string, string[]>()
  const alle = [b.kop, ...b.regels]
  alle.forEach((r, i) => {
    const sectie = (r[0] ?? '').trim()
    const soort = (r[1] ?? '').trim()
    if (!sectie) return
    if (soort === 'Header') {
      koppen.set(sectie, r.slice(2).map((k) => k.trim()))
      return
    }
    const kop = koppen.get(sectie)
    if (!kop) return
    const velden: Record<string, string> = { __soort: soort }
    kop.forEach((k, j) => (velden[k] = (r[j + 2] ?? '').trim()))
    const lijst = uit.get(sectie) ?? []
    lijst.push({ regel: b.voorloop.length + 1 + i, velden })
    uit.set(sectie, lijst)
  })
  return uit
}

const getal = (s: string | undefined) => leesGetal(s, '.')

/** ISIN en symbool uit "VT(US9220427424) Cash Dividend ...". */
function effectUit(omschrijving: string): { symbool?: string; isin?: string } {
  const m = /^([A-Z0-9.]+)\s*\(([A-Z0-9]+)\)/.exec(omschrijving)
  if (!m) return {}
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(m[2]) ? { symbool: m[1], isin: m[2] } : { symbool: m[1] }
}

/**
 * Data-regels per valuta met hun euro-bedrag: in de basisvaluta het bedrag zelf, anders naar rato van de regel
 * "Total in EUR" van die valuta. Zonder die regel blijft `eur` leeg (de import vraagt dan een koers).
 */
function inEuro(rijen: Rij[], bedragVeld: string, basis: string): Array<{ rij: Rij; valuta: string; bedrag: number; eur?: number }> {
  const uit: Array<{ rij: Rij; valuta: string; bedrag: number; eur?: number }> = []
  let groep: typeof uit = []
  const sluit = (totaalEur: number | null) => {
    if (groep.length === 0) return
    const valuta = groep[0].valuta
    if (valuta === basis && basis === 'EUR') for (const g of groep) g.eur = g.bedrag
    else if (totaalEur !== null) {
      const delen = verdeelNaarRato(totaalEur, groep.map((g) => g.bedrag))
      groep.forEach((g, i) => (g.eur = delen[i]))
    }
    uit.push(...groep)
    groep = []
  }
  for (const rij of rijen) {
    const valuta = rij.velden.Currency ?? ''
    if (valuta === 'Total') continue
    if (valuta === 'Total in EUR' || valuta === `Total in ${basis}`) {
      sluit(basis === 'EUR' || valuta === 'Total in EUR' ? getal(rij.velden[bedragVeld]) : null)
      continue
    }
    if (/^Total/.test(valuta)) continue
    const bedrag = getal(rij.velden[bedragVeld])
    if (bedrag === null) continue
    if (groep.length > 0 && groep[0].valuta !== valuta) sluit(null)
    groep.push({ rij, valuta, bedrag })
  }
  sluit(null)
  return uit
}

export const ibkr: Preset = {
  formaat: 'ibkr-activity',
  naam: 'Interactive Brokers Activity Statement',
  zekerheid: 'geverifieerd',
  herken: (b) => (b.kop[0] ?? '').trim() === 'Statement' && (b.kop[1] ?? '').trim() === 'Header',
  rekeningnummer: (b) => {
    const s = secties(b).get('Account Information') ?? []
    const r = s.find((x) => x.velden['Field Name'] === 'Account')
    return r?.velden['Field Value'] || null
  },
  lees: (b) => {
    const s = secties(b)
    const meldingen: Array<ImportMelding | null> = []
    const info = (sectie: string, naam: string) => s.get(sectie)?.find((x) => x.velden['Field Name'] === naam)?.velden['Field Value']
    const basis = (info('Account Information', 'Base Currency') ?? 'EUR').toUpperCase()
    const periode = info('Statement', 'Period') ?? ''
    const [vanTekst, totTekst] = periode.split(/\s+-\s+/)
    const van = leesDatum(vanTekst?.trim())
    const tot = leesDatum(totTekst?.trim())
    const g: Gebeurtenis[] = []
    const eindDatum = tot ?? ''
    if (basis !== 'EUR') meldingen.push({ id: 'basisvaluta', ernst: 'let-op', tekst: `De basisvaluta van deze rekening is ${basis}. Vul de koers naar euro's in.` })

    // Standen uit Net Asset Value.
    const nav = (s.get('Net Asset Value') ?? []).filter((r) => r.velden['Asset Class'] && r.velden['Asset Class'] !== 'Total')
    const standen: Stand[] = []
    if (nav.length > 0 && van && tot) {
      for (const [veld, datum] of [['Prior Total', verschuifDag(van, -1)], ['Current Total', tot]] as const) {
        standen.push({
          rekening: '',
          datum,
          regels: nav.map((r) => ({
            activum: r.velden['Asset Class'],
            naam: r.velden['Asset Class'],
            eur: centen(getal(r.velden[veld]) ?? 0),
            soort: /^(cash|interest accruals)$/i.test(r.velden['Asset Class']) ? 'geld' : 'effect',
          })),
        })
      }
    }

    // Stortingen en opnames (de omschrijving kan de naam van de rekeninghouder bevatten: niet overnemen).
    for (const x of inEuro(s.get('Deposits & Withdrawals') ?? [], 'Amount', basis)) {
      const datum = leesDatum(x.rij.velden['Settle Date'])
      if (!datum) continue
      g.push(gebeurtenis({ formaat: 'ibkr-activity', regel: x.rij.regel, datum, soort: x.bedrag >= 0 ? 'storting' : 'opname', bedrag: x.bedrag, valuta: x.valuta, ...(x.eur !== undefined ? { eur: x.eur, koersBron: 'broker' as const } : {}), omschrijving: x.bedrag >= 0 ? 'Storting' : 'Opname' }))
    }

    // Bronbelasting: eerst salderen per omschrijving, valuta en datum (terugboeking en herinhouding), dan naar euro's.
    const wt = s.get('Withholding Tax') ?? []
    const gesaldeerd = new Map<string, Rij>()
    for (const r of wt) {
      const valuta = r.velden.Currency ?? ''
      if (/^Total/.test(valuta)) {
        gesaldeerd.set(`totaal-${r.regel}`, r)
        continue
      }
      const sleutel = `${valuta}|${r.velden.Date}|${r.velden.Description}`
      const bestaand = gesaldeerd.get(sleutel)
      if (bestaand) bestaand.velden.Amount = String((getal(bestaand.velden.Amount) ?? 0) + (getal(r.velden.Amount) ?? 0))
      else gesaldeerd.set(sleutel, { regel: r.regel, velden: { ...r.velden } })
    }
    const wtRijen = [...gesaldeerd.values()].filter((r) => /^Total/.test(r.velden.Currency ?? '') || Math.abs(getal(r.velden.Amount) ?? 0) > 0.0001)
    const belasting = inEuro(wtRijen, 'Amount', basis)
    /** Land per effect en datum, voor het dividend dat erbij hoort. */
    const landBij = new Map<string, string>()
    for (const x of belasting) {
      const omschrijving = x.rij.velden.Description ?? ''
      const datum = leesDatum(x.rij.velden.Date)
      if (!datum) continue
      const { isin } = effectUit(omschrijving)
      const land = landUitBrokerTekst(omschrijving)
      const opRente = /credit interest|interest/i.test(omschrijving) && !isin
      if (isin && land) landBij.set(`${isin}|${datum}`, land)
      g.push(
        gebeurtenis({
          formaat: 'ibkr-activity',
          regel: x.rij.regel,
          datum,
          soort: 'dividendbelasting',
          bedrag: x.bedrag,
          valuta: x.valuta,
          ...(x.eur !== undefined ? { eur: x.eur, koersBron: 'broker' as const } : {}),
          ...(isin ? { isin, activum: isin } : {}),
          ...(land ? { land, landBron: 'broker' as const } : {}),
          ...(opRente ? { opRente: true } : {}),
          omschrijving: opRente ? 'Belasting op rente' : 'Ingehouden belasting op dividend',
        }),
      )
    }

    // Dividend (bruto); land van de bijbehorende inhouding als de broker die meldt.
    for (const x of inEuro(s.get('Dividends') ?? [], 'Amount', basis)) {
      const omschrijving = x.rij.velden.Description ?? ''
      const datum = leesDatum(x.rij.velden.Date)
      if (!datum) continue
      const { isin } = effectUit(omschrijving)
      const pil = /payment in lieu/i.test(omschrijving)
      const roc = /return of capital/i.test(omschrijving)
      const land = isin ? landBij.get(`${isin}|${datum}`) : undefined
      g.push(
        gebeurtenis({
          formaat: 'ibkr-activity',
          regel: x.rij.regel,
          datum,
          soort: roc ? 'kapitaalterugbetaling' : 'dividend',
          bedrag: x.bedrag,
          valuta: x.valuta,
          ...(x.eur !== undefined ? { eur: x.eur, koersBron: 'broker' as const } : {}),
          ...(isin ? { isin, activum: isin } : {}),
          ...(land ? { land, landBron: 'broker' as const } : {}),
          ...(pil ? { geenVerdragsdividend: true } : {}),
          omschrijving: pil ? 'Vergoeding voor dividend (payment in lieu)' : roc ? 'Terugbetaling van kapitaal' : 'Dividend',
        }),
      )
    }
    if (g.some((x) => x.geenVerdragsdividend)) {
      meldingen.push({ id: 'payment-in-lieu', ernst: 'info', tekst: 'Een vergoeding voor dividend over uitgeleende aandelen (payment in lieu) telt als opbrengst, maar niet als dividend voor de verrekening van bronbelasting.' })
    }

    // Rente.
    for (const x of inEuro(s.get('Interest') ?? [], 'Amount', basis)) {
      const datum = leesDatum(x.rij.velden.Date)
      if (!datum) continue
      g.push(gebeurtenis({ formaat: 'ibkr-activity', regel: x.rij.regel, datum, soort: 'rente', bedrag: x.bedrag, valuta: x.valuta, ...(x.eur !== undefined ? { eur: x.eur, koersBron: 'broker' as const } : {}), omschrijving: 'Rente' }))
    }

    // Kosten uit Change in NAV (in de basisvaluta), op de laatste dag van de periode.
    for (const r of s.get('Change in NAV') ?? []) {
      const naam = r.velden['Field Name'] ?? ''
      if (!/^(commissions|other fees|fees|sales tax|transaction fees|broker fees)$/i.test(naam)) continue
      const bedrag = getal(r.velden['Field Value'])
      if (!bedrag || !eindDatum) continue
      g.push(gebeurtenis({ formaat: 'ibkr-activity', regel: r.regel, datum: eindDatum, soort: 'kosten', bedrag: -Math.abs(bedrag), valuta: basis, ...(basis === 'EUR' ? { eur: -Math.abs(bedrag) } : {}), omschrijving: 'Kosten' }))
    }

    // Aankopen min verkopen uit de kasstand.
    const kas = (veld: 'Prior Total' | 'Current Total') => {
      const r = nav.find((x) => /^cash$/i.test(x.velden['Asset Class']))
      return r ? getal(r.velden[veld]) : null
    }
    const kasBegin = kas('Prior Total')
    const kasEind = kas('Current Total')
    if (basis === 'EUR' && kasBegin !== null && kasEind !== null && eindDatum && g.every((x) => x.eur !== undefined)) {
      const kasStromen = g.reduce((t, x) => t + (x.eur ?? 0), 0)
      const netto = centen(kasEind - kasBegin - kasStromen)
      if (Math.abs(netto) >= 0.01) {
        g.push(gebeurtenis({ formaat: 'ibkr-activity', regel: 0, datum: eindDatum, soort: netto < 0 ? 'koop' : 'verkoop', bedrag: netto, valuta: 'EUR', eur: netto, omschrijving: netto < 0 ? 'Aankopen min verkopen (uit de kasstand)' : 'Verkopen min aankopen (uit de kasstand)' }))
        meldingen.push({
          id: 'afgeleid',
          ernst: 'info',
          tekst: `In dit overzicht staan de aankopen en verkopen niet apart. Wat je per saldo ${netto < 0 ? 'kocht' : 'verkocht'} (€ ${Math.abs(netto).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) volgt uit de kasstand; koersverschillen op vreemde valuta tellen daarin mee.`,
        })
      }
    }
    return uitkomst('ibkr-activity', g, standen, meldingen, van && tot ? { van, tot } : undefined)
  },
}
