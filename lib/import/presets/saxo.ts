/**
 * Ronde 2 (A4): Saxo, transacties (broker-import.md 3.5; zekerheid "deels": kop geverifieerd, de dividend- en
 * belastingregels niet aan een echte Nederlandse export). Waarden volgen de taal van het platform (Trade/Transactie,
 * Buy/Koop, maand Apr/mrt); Amount soms met komma, soms met punt.
 *
 * Saxo boekt dividend na inhouding van belasting: de preset neemt het netto bedrag als opbrengst en meldt dat het bruto
 * dividend en de ingehouden belasting in het Fiscaal Jaaroverzicht staan.
 */
import type { Gebeurtenis, GebeurtenisSoort, Preset } from '../types'
import { leesDatum, leesGetal } from '../getallen'
import { aantalUitOmschrijving, gebeurtenis, kolom, onbekendMelding, regelNummer, uitkomst, veld } from './hulp'

function soortVan(type: string, event: string, bedrag: number): GebeurtenisSoort | null {
  const t = type.toLowerCase()
  const e = event.toLowerCase()
  if (/^(trade|transactie)/.test(t)) {
    if (/^(buy|koop)\b/.test(e)) return 'koop'
    if (/^(sell|verkoop)\b/.test(e)) return 'verkoop'
    return null
  }
  if (/^(cash transfer|kasoverboeking|overboeking|geldoverboeking)/.test(t)) {
    if (/(deposit|storting)/.test(e)) return 'storting'
    if (/(withdrawal|opname)/.test(e)) return 'opname'
    return bedrag >= 0 ? 'storting' : 'opname'
  }
  if (/^(corporate action|bedrijfsactie|corporate actie)/.test(t)) {
    if (/(dividend|coupon)/.test(e)) return 'dividend'
    return 'corporateAction'
  }
  if (/^(cash amount|kasbedrag|bedrag)/.test(t)) {
    if (/(fee|kosten|commission|commissie|custody|bewaarloon|service)/.test(e)) return 'kosten'
    if (/(interest|rente)/.test(e)) return 'rente'
    return null
  }
  return null
}

export const saxo: Preset = {
  formaat: 'saxo',
  naam: 'Saxo transacties',
  zekerheid: 'deels',
  herken: (b) => kolom(b.kop, 'client id') === 0 && kolom(b.kop, 'trade date') >= 0 && kolom(b.kop, 'value date') >= 0,
  lees: (b) => {
    const k = {
      datum: kolom(b.kop, 'trade date'),
      type: kolom(b.kop, 'type'),
      isin: kolom(b.kop, 'instrument isin'),
      valuta: kolom(b.kop, 'instrument currency'),
      event: kolom(b.kop, 'event'),
      bedrag: kolom(b.kop, 'amount'),
      koers: kolom(b.kop, 'conversion rate'),
    }
    const g: Gebeurtenis[] = []
    const onbekend: number[] = []
    let voorbeeld: string | undefined
    b.regels.forEach((r, index) => {
      const regel = regelNummer(b, index)
      const datum = leesDatum(veld(r, k.datum))
      const bedrag = leesGetal(veld(r, k.bedrag), b.decimaal)
      if (!datum || bedrag === null) return
      const event = veld(r, k.event)
      const soort = soortVan(veld(r, k.type), event, bedrag)
      if (soort === null) {
        onbekend.push(regel)
        voorbeeld ??= event || veld(r, k.type)
        return
      }
      if (soort === 'corporateAction') return
      const valuta = (veld(r, k.valuta) || 'EUR').toUpperCase()
      // De koers naar euro's staat bij elke regel (1 bij euro's).
      const koers = leesGetal(veld(r, k.koers))
      const eur = koers !== null && koers > 0 ? bedrag * koers : valuta === 'EUR' ? bedrag : undefined
      const isin = veld(r, k.isin).toUpperCase() || undefined
      const aantal = soort === 'koop' || soort === 'verkoop' ? aantalUitOmschrijving(event) : undefined
      g.push(
        gebeurtenis({
          formaat: 'saxo',
          regel,
          datum,
          soort,
          bedrag,
          valuta,
          ...(eur !== undefined ? { eur, koersBron: 'broker' as const } : {}),
          ...(isin ? { isin, activum: isin } : {}),
          ...(aantal !== undefined ? { aantal: soort === 'verkoop' ? -aantal : aantal } : {}),
          ...(soort === 'dividend' ? { brutoOnbekend: true } : {}),
          omschrijving: event || soort,
        }),
      )
    })
    const meldingen = [onbekendMelding(onbekend, voorbeeld)]
    if (g.some((x) => x.brutoOnbekend)) {
      meldingen.push({
        id: 'bruto-onbekend',
        ernst: 'let-op',
        tekst: 'Saxo boekt dividend na inhouding van belasting. We nemen het netto bedrag over; het bruto dividend en de ingehouden belasting staan in je Fiscaal Jaaroverzicht van Saxo. Vul ze daaruit in.',
      })
    }
    return uitkomst('saxo', g, [], meldingen)
  },
}
