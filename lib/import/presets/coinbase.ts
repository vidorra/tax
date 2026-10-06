/**
 * Ronde 2 (A4): Coinbase, Transaction history (broker-import.md 3.11). Het nieuwe formaat begint met twee voorloopregels
 * ("Transactions" en "User,<naam>,<id>"): die blijven in `CsvBestand.voorloop` en worden nergens bewaard. Bedragen met
 * valutateken ("-€86.00"); tijden in UTC. Convert heeft één regel: de doelkant staat alleen in Notes ("Converted 0.0005
 * BTC to 13.2 XRP"); een omwisseling blijft binnen de crypto en telt niet als storting of opname.
 */
import type { Gebeurtenis, GebeurtenisSoort, ImportMelding, Preset } from '../types'
import { leesDatum, leesGetal } from '../getallen'
import { FIAT, gebeurtenis, kolom, onbekendMelding, regelNummer, uitkomst, veld } from './hulp'

function soortVan(type: string, geld: boolean): GebeurtenisSoort | null {
  const t = type.toLowerCase()
  if (/^(deposit|fiat deposit)$/.test(t)) return geld ? 'storting' : 'cryptoIn'
  if (/^(withdrawal|fiat withdrawal)$/.test(t)) return geld ? 'opname' : 'cryptoUit'
  if (/^(buy|advanced trade buy|advance trade buy)$/.test(t)) return 'koop'
  if (/^(sell|advanced trade sell|advance trade sell)$/.test(t)) return 'verkoop'
  if (/(staking income|rewards income|learning reward|inflation reward|coinbase earn|reward)/.test(t)) return 'staking'
  if (t === 'send') return 'cryptoUit'
  if (t === 'receive') return 'cryptoIn'
  if (t === 'convert') return 'valutaIntern'
  return null
}

export const coinbase: Preset = {
  formaat: 'coinbase',
  naam: 'Coinbase transacties',
  zekerheid: 'deels',
  herken: (b) => kolom(b.kop, 'timestamp') >= 0 && kolom(b.kop, 'transaction type') >= 0 && kolom(b.kop, 'quantity transacted') >= 0,
  lees: (b) => {
    const k = {
      tijd: kolom(b.kop, 'timestamp'),
      type: kolom(b.kop, 'transaction type'),
      munt: kolom(b.kop, 'asset'),
      aantal: kolom(b.kop, 'quantity transacted'),
      prijsValuta: kolom(b.kop, 'price currency', 'spot price currency'),
      subtotaal: kolom(b.kop, 'subtotal'),
      totaal: kolom(b.kop, /^total/),
      kosten: kolom(b.kop, /^fees/),
      notes: kolom(b.kop, 'notes'),
      id: kolom(b.kop, 'id'),
    }
    const g: Gebeurtenis[] = []
    const onbekend: number[] = []
    let voorbeeld: string | undefined
    let omgewisseld = 0
    b.regels.forEach((r, index) => {
      const regel = regelNummer(b, index)
      const datum = leesDatum(veld(r, k.tijd), { utc: true })
      const munt = veld(r, k.munt).toUpperCase()
      const aantal = leesGetal(veld(r, k.aantal), '.')
      if (!datum || !munt || aantal === null) return
      const type = veld(r, k.type)
      const geld = FIAT.has(munt)
      const soort = soortVan(type, geld)
      if (soort === null) {
        onbekend.push(regel)
        voorbeeld ??= type
        return
      }
      const valuta = (veld(r, k.prijsValuta) || 'EUR').toUpperCase()
      const inEur = valuta === 'EUR'
      const subtotaal = leesGetal(veld(r, k.subtotaal), '.')
      const totaal = leesGetal(veld(r, k.totaal), '.')
      const kosten = Math.abs(leesGetal(veld(r, k.kosten), '.') ?? 0)
      const basis = { formaat: 'coinbase' as const, regel, datum, ...(veld(r, k.id) ? { id: veld(r, k.id) } : {}) }
      const kostenRegel = () => {
        if (kosten > 0) g.push(gebeurtenis({ ...basis, soort: 'kosten', bedrag: -kosten, valuta, ...(inEur ? { eur: -kosten } : {}), omschrijving: 'Kosten' }))
      }
      if (soort === 'valutaIntern') {
        // "Converted 0.0005 BTC to 13.2 XRP": de bron gaat eraf, het doel erbij; geen storting of opname.
        omgewisseld++
        const m = /converted\s+([\d.,]+)\s+([A-Z0-9]+)\s+to\s+([\d.,]+)\s+([A-Z0-9]+)/i.exec(veld(r, k.notes))
        g.push(gebeurtenis({ ...basis, soort: 'valutaIntern', bedrag: 0, valuta: munt, eur: 0, activum: munt, aantal: -Math.abs(aantal), omschrijving: 'Omwisseling (van)' }))
        if (m) g.push(gebeurtenis({ ...basis, soort: 'valutaIntern', bedrag: 0, valuta: m[4].toUpperCase(), eur: 0, activum: m[4].toUpperCase(), aantal: leesGetal(m[3], '.') ?? 0, omschrijving: 'Omwisseling (naar)' }))
        return
      }
      if (soort === 'storting' || soort === 'opname') {
        const bedrag = (soort === 'opname' ? -1 : 1) * Math.abs(totaal ?? aantal)
        g.push(gebeurtenis({ ...basis, soort, bedrag, valuta: munt, ...(munt === 'EUR' ? { eur: bedrag } : {}), omschrijving: type }))
        return
      }
      if (soort === 'koop' || soort === 'verkoop') {
        const som = Math.abs(subtotaal ?? 0)
        const bedrag = soort === 'koop' ? -som : som
        g.push(gebeurtenis({ ...basis, soort, bedrag, valuta, ...(inEur ? { eur: bedrag } : {}), activum: munt, aantal: soort === 'koop' ? Math.abs(aantal) : -Math.abs(aantal), omschrijving: type }))
        kostenRegel()
        return
      }
      // Staking, Send en Receive: in munten, met de waarde in euro's uit Subtotal.
      const teken = soort === 'cryptoUit' ? -1 : 1
      const waarde = subtotaal !== null ? Math.abs(subtotaal) : null
      g.push(
        gebeurtenis({
          ...basis,
          soort,
          bedrag: teken * Math.abs(aantal),
          valuta: munt,
          activum: munt,
          aantal: teken * Math.abs(aantal),
          ...(waarde !== null && inEur ? { eur: teken * waarde, koersBron: 'broker' as const } : {}),
          ...(soort === 'cryptoUit' || soort === 'cryptoIn' ? { extern: true } : {}),
          omschrijving: type,
        }),
      )
    })
    const meldingen: Array<ImportMelding | null> = [onbekendMelding(onbekend, voorbeeld)]
    if (omgewisseld > 0) {
      meldingen.push({ id: 'omwisseling', ernst: 'info', tekst: `${omgewisseld === 1 ? 'Eén omwisseling' : `${omgewisseld} omwisselingen`} tussen munten (Convert) ${omgewisseld === 1 ? 'blijft' : 'blijven'} binnen je crypto en ${omgewisseld === 1 ? 'telt' : 'tellen'} niet als storting of opname.` })
    }
    return uitkomst('coinbase', g, [], meldingen)
  },
}
