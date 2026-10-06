/**
 * Ronde 2 (A4): BUX, Transaction history (broker-import.md 3.7). Tijden in CET (lokaal). Bij dividend is Transaction
 * Amount netto; Dividend Gross/Net/Tax Amount zijn niet altijd gevuld. Zonder bruto neemt de preset het netto bedrag
 * en meldt dat het bruto in het jaaroverzicht staat. Een welkomstbonus (Promotional) is een storting van buiten.
 */
import type { Gebeurtenis, GebeurtenisSoort, Preset } from '../types'
import { leesDatum, leesGetal } from '../getallen'
import { gebeurtenis, kolom, onbekendMelding, regelNummer, uitkomst, veld } from './hulp'

function soortVan(categorie: string, type: string, bedrag: number): GebeurtenisSoort | null {
  const c = categorie.toLowerCase()
  const t = type.toLowerCase()
  if (c === 'deposits') return 'storting'
  if (c === 'withdrawals') return 'opname'
  if (c === 'trades') return /sell/.test(t) ? 'verkoop' : /buy/.test(t) ? 'koop' : null
  if (c === 'fees') return 'kosten'
  if (c === 'dividends') return 'dividend'
  if (c === 'interest') return 'rente'
  if (c === 'corporate_actions') return 'corporateAction'
  if (c === 'others') return bedrag >= 0 ? 'storting' : 'opname'
  return null
}

export const bux: Preset = {
  formaat: 'bux',
  naam: 'BUX transacties',
  zekerheid: 'geverifieerd',
  herken: (b) => kolom(b.kop, /^transaction time/) === 0 && kolom(b.kop, 'transaction category') >= 0,
  lees: (b) => {
    const k = {
      tijd: kolom(b.kop, /^transaction time/),
      categorie: kolom(b.kop, 'transaction category'),
      type: kolom(b.kop, 'transaction type'),
      bedrag: kolom(b.kop, 'transaction amount'),
      valuta: kolom(b.kop, 'transaction currency'),
      isin: kolom(b.kop, 'asset id'),
      aantal: kolom(b.kop, 'asset quantity'),
      bruto: kolom(b.kop, 'dividend gross amount'),
      belasting: kolom(b.kop, 'dividend tax amount'),
    }
    const g: Gebeurtenis[] = []
    const onbekend: number[] = []
    let voorbeeld: string | undefined
    let bonus = false
    b.regels.forEach((r, index) => {
      const regel = regelNummer(b, index)
      const datum = leesDatum(veld(r, k.tijd))
      const bedrag = leesGetal(veld(r, k.bedrag), '.')
      if (!datum || bedrag === null) return
      const categorie = veld(r, k.categorie)
      const type = veld(r, k.type)
      const soort = soortVan(categorie, type, bedrag)
      if (soort === null) {
        onbekend.push(regel)
        voorbeeld ??= type || categorie
        return
      }
      if (soort === 'corporateAction') return
      if (categorie.toLowerCase() === 'others') bonus = true
      const valuta = (veld(r, k.valuta) || 'EUR').toUpperCase()
      const isin = veld(r, k.isin).toUpperCase() || undefined
      const basis = { formaat: 'bux' as const, regel, datum, valuta, ...(isin ? { isin, activum: isin } : {}) }
      const eur = (x: number) => (valuta === 'EUR' ? { eur: x } : {})
      if (soort === 'dividend') {
        const bruto = leesGetal(veld(r, k.bruto), '.')
        const belasting = leesGetal(veld(r, k.belasting), '.')
        if (bruto !== null && bruto > 0) {
          g.push(gebeurtenis({ ...basis, soort: 'dividend', bedrag: bruto, ...eur(bruto), omschrijving: type }))
          if (belasting) g.push(gebeurtenis({ ...basis, soort: 'dividendbelasting', bedrag: -Math.abs(belasting), ...eur(-Math.abs(belasting)), omschrijving: 'Ingehouden belasting op dividend' }))
        } else {
          g.push(gebeurtenis({ ...basis, soort: 'dividend', bedrag, ...eur(bedrag), brutoOnbekend: true, omschrijving: type }))
        }
        return
      }
      const aantal = leesGetal(veld(r, k.aantal), '.')
      g.push(
        gebeurtenis({
          ...basis,
          soort,
          bedrag,
          ...eur(bedrag),
          ...(aantal !== null && (soort === 'koop' || soort === 'verkoop') ? { aantal: soort === 'verkoop' ? -Math.abs(aantal) : Math.abs(aantal) } : {}),
          omschrijving: type || categorie,
        }),
      )
    })
    const meldingen = [onbekendMelding(onbekend, voorbeeld)]
    const zonderBruto = g.filter((x) => x.brutoOnbekend)
    if (zonderBruto.length > 0) {
      meldingen.push({
        id: 'bruto-onbekend',
        ernst: 'let-op',
        tekst: `Bij ${zonderBruto.length === 1 ? 'één dividend' : `${zonderBruto.length} dividenden`} ontbreekt het bruto bedrag in de export. We nemen het netto bedrag over; het bruto dividend en de ingehouden belasting staan in het fiscaal jaaroverzicht van BUX.`,
        regels: zonderBruto.map((x) => x.regel),
      })
    }
    if (bonus) meldingen.push({ id: 'bonus', ernst: 'info', tekst: 'Een bonus of correctie van BUX telt als storting van buiten, niet als rendement.' })
    return uitkomst('bux', g, [], meldingen)
  },
}
