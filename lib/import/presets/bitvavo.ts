/**
 * Ronde 2 (A4): Bitvavo, transactiegeschiedenis (broker-import.md 3.10). Twee bezittingen: de crypto en de euro's op
 * Bitvavo. Koop en verkoop hebben het euro-bedrag in "Received / Paid Amount"; staking en crypto die naar een extern
 * adres gaat hebben geen koers in het bestand (de import vraagt die). Of een extern adres je eigen wallet is, weet
 * alleen jij. Het adres zelf wordt nooit bewaard.
 */
import type { Gebeurtenis, GebeurtenisSoort, Preset } from '../types'
import { leesDatum, leesGetal } from '../getallen'
import { FIAT, gebeurtenis, kolom, onbekendMelding, regelNummer, uitkomst, veld } from './hulp'

const STAKING = /^(staking|fixed_staking|affiliate|distribution|rebate|manually_assigned_bitvavo|manually_assigned)$/

export const bitvavo: Preset = {
  formaat: 'bitvavo',
  naam: 'Bitvavo transacties',
  zekerheid: 'geverifieerd',
  herken: (b) => kolom(b.kop, 'timezone') === 0 && kolom(b.kop, 'type') >= 0 && kolom(b.kop, 'currency') >= 0,
  lees: (b) => {
    const k = {
      zone: kolom(b.kop, 'timezone'),
      datum: kolom(b.kop, 'date'),
      tijd: kolom(b.kop, 'time'),
      type: kolom(b.kop, 'type'),
      munt: kolom(b.kop, 'currency'),
      aantal: kolom(b.kop, 'amount'),
      prijs: kolom(b.kop, 'quote price'),
      ontvangenValuta: kolom(b.kop, 'received / paid currency'),
      ontvangen: kolom(b.kop, 'received / paid amount'),
      feeValuta: kolom(b.kop, 'fee currency'),
      fee: kolom(b.kop, 'fee amount'),
      status: kolom(b.kop, 'status'),
      id: kolom(b.kop, 'transaction id'),
      adres: kolom(b.kop, 'address'),
    }
    const g: Gebeurtenis[] = []
    const onbekend: number[] = []
    let voorbeeld: string | undefined
    b.regels.forEach((r, index) => {
      const regel = regelNummer(b, index)
      const status = veld(r, k.status).toLowerCase()
      if (status && status !== 'completed') return
      const utc = /^utc$/i.test(veld(r, k.zone))
      const datum = leesDatum(`${veld(r, k.datum)} ${veld(r, k.tijd)}`.trim(), { utc })
      const type = veld(r, k.type).toLowerCase()
      const munt = veld(r, k.munt).toUpperCase()
      const aantal = leesGetal(veld(r, k.aantal), '.')
      if (!datum || aantal === null || !munt) return
      const geld = FIAT.has(munt)
      const basis = { formaat: 'bitvavo' as const, regel, datum, ...(veld(r, k.id) ? { id: veld(r, k.id) } : {}) }
      const prijs = leesGetal(veld(r, k.prijs), '.')
      const ontvangenValuta = veld(r, k.ontvangenValuta).toUpperCase()
      const ontvangen = leesGetal(veld(r, k.ontvangen), '.')
      // Kosten in euro's gaan van het geld af, kosten in crypto van de crypto.
      const fee = leesGetal(veld(r, k.fee), '.')
      const feeValuta = veld(r, k.feeValuta).toUpperCase()
      const kosten = () => {
        if (!fee) return
        const inGeld = FIAT.has(feeValuta)
        g.push(gebeurtenis({ ...basis, soort: 'kosten', bedrag: -Math.abs(fee), valuta: feeValuta || munt, ...(feeValuta === 'EUR' ? { eur: -Math.abs(fee) } : {}), ...(inGeld ? {} : { activum: feeValuta, aantal: -Math.abs(fee) }), omschrijving: 'Kosten' }))
      }
      let soort: GebeurtenisSoort | null = null
      if (type === 'deposit') soort = geld ? 'storting' : 'cryptoIn'
      else if (type === 'withdrawal') soort = geld ? 'opname' : 'cryptoUit'
      else if (type === 'buy') soort = 'koop'
      else if (type === 'sell') soort = 'verkoop'
      else if (STAKING.test(type)) soort = 'staking'
      else if (/^(internal_transfer|withdrawal_cancelled|loan)$/.test(type)) return
      if (soort === null) {
        onbekend.push(regel)
        voorbeeld ??= type
        return
      }
      if (soort === 'storting' || soort === 'opname') {
        const bedrag = soort === 'opname' ? -Math.abs(aantal) : Math.abs(aantal)
        g.push(gebeurtenis({ ...basis, soort, bedrag, valuta: munt, ...(munt === 'EUR' ? { eur: bedrag } : {}), omschrijving: type }))
        kosten()
        return
      }
      if (soort === 'koop' || soort === 'verkoop') {
        // Het euro-bedrag: negatief bij een aankoop (betaald), positief bij een verkoop (ontvangen).
        const eur = ontvangenValuta === 'EUR' && ontvangen !== null ? ontvangen : undefined
        g.push(gebeurtenis({ ...basis, soort, bedrag: eur ?? 0, valuta: 'EUR', ...(eur !== undefined ? { eur } : {}), activum: munt, aantal: soort === 'koop' ? Math.abs(aantal) : -Math.abs(aantal), omschrijving: type }))
        kosten()
        return
      }
      // Staking en crypto van of naar een ander adres: in munten, met een koers als het bestand die heeft.
      const extern = (soort === 'cryptoIn' || soort === 'cryptoUit') && Boolean(veld(r, k.adres))
      const teken = soort === 'cryptoUit' ? -1 : 1
      g.push(
        gebeurtenis({
          ...basis,
          soort,
          bedrag: teken * Math.abs(aantal),
          valuta: munt,
          activum: munt,
          aantal: teken * Math.abs(aantal),
          ...(prijs !== null && prijs > 0 ? { eur: teken * Math.abs(aantal) * prijs, koersBron: 'broker' as const } : {}),
          ...(extern ? { extern: true } : {}),
          omschrijving: type,
        }),
      )
      kosten()
    })
    return uitkomst('bitvavo', g, [], [onbekendMelding(onbekend, voorbeeld)])
  },
}
