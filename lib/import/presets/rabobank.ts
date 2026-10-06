/**
 * Ronde 2 (A4): Rabobank, transacties beleggen (broker-import.md 3.9). Puntkomma, komma als decimaal, BOM, CRLF.
 * Bij "Contant dividend" is Waarde bruto en Bedrag netto; het verschil is de ingehouden belasting (Rabo-fondsen zijn
 * Nederlands: dividendbelasting). "Storting / opname": het teken van Bedrag bepaalt de richting. Het
 * portefeuillenummer wordt alleen een HMAC-sleutel.
 */
import type { Gebeurtenis, GebeurtenisSoort, Preset } from '../types'
import { centen, leesDatum, leesGetal } from '../getallen'
import { gebeurtenis, kolom, onbekendMelding, regelNummer, uitkomst, veld } from './hulp'

function soortVan(type: string, bedrag: number): GebeurtenisSoort | null {
  const t = type.toLowerCase()
  if (/^koop/.test(t)) return 'koop'
  if (/^verkoop/.test(t)) return 'verkoop'
  if (/^storting\s*\/\s*opname/.test(t)) return bedrag >= 0 ? 'storting' : 'opname'
  if (/^storting/.test(t)) return 'storting'
  if (/^opname/.test(t)) return 'opname'
  if (/(tarieven|kosten|services|provisie)/.test(t)) return 'kosten'
  if (/rente/.test(t)) return 'rente'
  if (/dividend/.test(t)) return 'dividend'
  if (/(fusie|splitsing|claim|conversie|omwisseling)/.test(t)) return 'corporateAction'
  return null
}

export const rabobank: Preset = {
  formaat: 'rabobank',
  naam: 'Rabobank beleggen',
  zekerheid: 'geverifieerd',
  herken: (b) => kolom(b.kop, 'portefeuille') === 0 && kolom(b.kop, 'type mutatie') >= 0,
  rekeningnummer: (b) => b.regels.find((r) => (r[0] ?? '').trim())?.[0]?.trim() || null,
  lees: (b) => {
    const k = {
      datum: kolom(b.kop, 'datum'),
      type: kolom(b.kop, 'type mutatie'),
      valuta: kolom(b.kop, 'valuta mutatie'),
      volume: kolom(b.kop, 'volume'),
      waarde: kolom(b.kop, 'waarde'),
      bedrag: kolom(b.kop, 'bedrag'),
      isin: kolom(b.kop, 'isin code', 'isin'),
    }
    const g: Gebeurtenis[] = []
    const onbekend: number[] = []
    let voorbeeld: string | undefined
    b.regels.forEach((r, index) => {
      const regel = regelNummer(b, index)
      const datum = leesDatum(veld(r, k.datum))
      const bedrag = leesGetal(veld(r, k.bedrag), b.decimaal)
      if (!datum || bedrag === null) return
      const type = veld(r, k.type)
      const soort = soortVan(type, bedrag)
      if (soort === null) {
        onbekend.push(regel)
        voorbeeld ??= type
        return
      }
      if (soort === 'corporateAction') return
      const valuta = (veld(r, k.valuta) || 'EUR').toUpperCase()
      const isin = veld(r, k.isin).toUpperCase() || undefined
      const basis = { formaat: 'rabobank' as const, regel, datum, valuta, ...(isin ? { isin, activum: isin } : {}) }
      const eur = (x: number) => (valuta === 'EUR' ? { eur: x } : {})
      if (soort === 'dividend') {
        const bruto = leesGetal(veld(r, k.waarde), b.decimaal)
        if (bruto !== null && bruto > 0) {
          const belasting = centen(bruto - bedrag)
          g.push(gebeurtenis({ ...basis, soort: 'dividend', bedrag: bruto, ...eur(bruto), omschrijving: type }))
          if (belasting > 0) g.push(gebeurtenis({ ...basis, soort: 'dividendbelasting', bedrag: -belasting, ...eur(-belasting), omschrijving: 'Ingehouden dividendbelasting' }))
        } else {
          g.push(gebeurtenis({ ...basis, soort: 'dividend', bedrag, ...eur(bedrag), brutoOnbekend: true, omschrijving: type }))
        }
        return
      }
      const volume = leesGetal(veld(r, k.volume), b.decimaal)
      g.push(
        gebeurtenis({
          ...basis,
          soort,
          bedrag,
          ...eur(bedrag),
          ...(volume !== null && (soort === 'koop' || soort === 'verkoop') ? { aantal: soort === 'verkoop' ? -Math.abs(volume) : Math.abs(volume) } : {}),
          omschrijving: type,
        }),
      )
    })
    return uitkomst('rabobank', g, [], [onbekendMelding(onbekend, voorbeeld)])
  },
}
