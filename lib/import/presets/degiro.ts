/**
 * Ronde 2 (A4): DEGIRO. Twee formaten (broker-import.md 3.2):
 *
 * - Rekeningoverzicht (Account.csv): twaalf kolommen, Mutatie en Saldo zijn elk valuta plus een naamloze bedragkolom.
 *   Herkenning op het patroon (kolom 9 en 11 leeg), niet op de tekst: er bestaan Nederlandse, Engelse en andere koppen.
 *   Nieuwste regel eerst. Dividend en belasting in vreemde valuta worden omgerekend met de FX van de eerstvolgende
 *   "Valuta Debitering" in die valuta (per regel op centen); het verschil met het bedrag van de bijbehorende
 *   "Valuta Creditering" in euro's is een afrondingsverschil op het geld (in het voorbeeld € 0,02).
 * - Portefeuille op een gekozen datum: de stand van de effecten en de regel CASH & CASH FUND (het geld). Twee exports
 *   (31-12 van het vorige jaar en van het jaar) geven de waarde begin en eind. De datum staat in de bestandsnaam of
 *   wordt gevraagd.
 *
 * In het bestand staat geen rekeningnummer: de gebruiker kiest een bestaande DEGIRO-rekening of "Nieuwe rekening".
 */
import type { CsvBestand, Gebeurtenis, GebeurtenisSoort, Preset, Stand } from '../types'
import { centen, datumUitNaam, leesDatum, leesGetal } from '../getallen'
import { aantalUitOmschrijving, gebeurtenis, kolom, onbekendMelding, regelNummer, uitkomst, veld } from './hulp'

/** Omschrijving naar soort, hoofdletterongevoelig, de eerste die past. */
const REGELS: Array<[RegExp, GebeurtenisSoort]> = [
  [/^(reservation|reservering)\b/i, 'negeren'],
  [/^(valuta (creditering|debitering)|fx (credit|debit)|degiro cash sweep|cash sweep|overboeking (van|naar) uw geldrekening|transfer (from|to) your cash account)/i, 'valutaIntern'],
  [/(terugstorting|withdrawal|opname)/i, 'opname'],
  [/^((ideal|sofort|flatex|bancontact|giropay)\s+)?(storting|deposit)\b/i, 'storting'],
  [/^(koop|buy)\b/i, 'koop'],
  [/^(verkoop|sell)\b/i, 'verkoop'],
  [/^(dividendbelasting|dividend tax)/i, 'dividendbelasting'],
  [/^dividend\b/i, 'dividend'],
  [/^(kapitaalsuitkering|capital return|return of capital)/i, 'kapitaalterugbetaling'],
  [/(interest|rente)/i, 'rente'],
  [/(transactiekosten|aansluitingskosten|transactiebelasting|externe kosten|service-?fee|b\.t\.w|\bfees?\b|kosten|stamp duty|transaction tax)/i, 'kosten'],
  [/^(wijziging isin|isin change|fusie|merger|spin-?off|conversie geldmarktfonds|money market fund conversion|stock split|splitsing)/i, 'corporateAction'],
]

export function degiroSoort(omschrijving: string): GebeurtenisSoort | null {
  for (const [re, soort] of REGELS) if (re.test(omschrijving.trim())) return soort
  return null
}

const isFxRegel = (omschrijving: string) => /^(valuta (creditering|debitering)|fx (credit|debit))/i.test(omschrijving.trim())

interface Rij {
  regel: number
  index: number
  datum: string
  tijd: string
  isin: string
  omschrijving: string
  fx: number | null
  valuta: string
  bedrag: number
}

export const degiroRekening: Preset = {
  formaat: 'degiro-rekening',
  naam: 'DEGIRO rekeningoverzicht',
  zekerheid: 'geverifieerd',
  herken: (b) => b.kop.length >= 12 && b.kop[8] === '' && b.kop[10] === '' && /^(datum|date|data|fecha)$/i.test(b.kop[0]),
  lees: (b) => leesRekening(b),
}

function leesRekening(b: CsvBestand) {
  const rijen: Rij[] = []
  const onbekend: number[] = []
  let voorbeeld: string | undefined
  b.regels.forEach((r, index) => {
    const bedrag = leesGetal(r[8], b.decimaal)
    const datum = leesDatum(r[0])
    // Regels zonder bedrag (de info-regel "Overboeking van uw geldrekening bij flatexDEGIRO Bank ...") tellen niet.
    if (bedrag === null || !datum || !r[7]) return
    rijen.push({ regel: regelNummer(b, index), index, datum, tijd: veld(r, 1), isin: veld(r, 4).toUpperCase(), omschrijving: veld(r, 5), fx: leesGetal(r[6], b.decimaal), valuta: veld(r, 7).toUpperCase(), bedrag })
  })
  // Chronologisch: oudste eerst; binnen dezelfde minuut omgekeerd aan de volgorde in het bestand (nieuwste eerst).
  rijen.sort((a, c) => a.datum.localeCompare(c.datum) || a.tijd.localeCompare(c.tijd) || c.index - a.index)

  const gebeurtenissen: Gebeurtenis[] = []
  /** Regels in vreemde valuta die op een omwisseling wachten. */
  const wachtend = new Map<string, Gebeurtenis[]>()
  const verwerkt = new Set<number>()

  for (const rij of rijen) {
    if (verwerkt.has(rij.index)) continue
    if (isFxRegel(rij.omschrijving)) {
      // Een omwisseling: de regel met de koers is de vreemde valuta, de andere (zelfde minuut) is de euro-kant.
      const paar = rijen.filter((x) => x.datum === rij.datum && x.tijd === rij.tijd && isFxRegel(x.omschrijving) && !verwerkt.has(x.index))
      const vreemd = paar.find((x) => x.valuta !== 'EUR' && x.fx !== null && x.fx > 0)
      const euro = paar.find((x) => x.valuta === 'EUR')
      for (const x of paar) verwerkt.add(x.index)
      if (vreemd) {
        const lijst = wachtend.get(vreemd.valuta) ?? []
        let som = 0
        for (const g of lijst) {
          g.eur = centen(g.bedrag / vreemd.fx!)
          g.koersBron = 'broker'
          som += g.eur
        }
        wachtend.set(vreemd.valuta, [])
        const verschil = euro ? centen(euro.bedrag - som) : 0
        gebeurtenissen.push(
          gebeurtenis({
            formaat: 'degiro-rekening',
            regel: euro?.regel ?? vreemd.regel,
            datum: rij.datum,
            soort: 'valutaIntern',
            bedrag: euro?.bedrag ?? 0,
            valuta: 'EUR',
            // Alleen het afrondingsverschil telt: de omgerekende regels zelf staan er al.
            eur: lijst.length > 0 ? verschil : 0,
            omschrijving: 'Omwisseling van vreemde valuta',
          }),
        )
      }
      continue
    }
    verwerkt.add(rij.index)
    const soort = degiroSoort(rij.omschrijving)
    if (soort === null) {
      onbekend.push(rij.regel)
      voorbeeld ??= rij.omschrijving
      continue
    }
    if (soort === 'negeren' || soort === 'valutaIntern') continue
    const aantal = soort === 'koop' || soort === 'verkoop' ? aantalUitOmschrijving(rij.omschrijving, b.decimaal) : undefined
    const g = gebeurtenis({
      formaat: 'degiro-rekening',
      regel: rij.regel,
      datum: rij.datum,
      soort,
      bedrag: rij.bedrag,
      valuta: rij.valuta,
      ...(rij.valuta === 'EUR' ? { eur: rij.bedrag } : {}),
      ...(rij.isin ? { isin: rij.isin, activum: rij.isin } : {}),
      ...(aantal !== undefined ? { aantal: soort === 'verkoop' ? -aantal : aantal } : {}),
      omschrijving: rij.omschrijving,
    })
    if (rij.valuta !== 'EUR') {
      // GBX (Londense pence) is een honderdste pond.
      if (rij.valuta === 'GBX') {
        g.bedrag = rij.bedrag / 100
        g.valuta = 'GBP'
      }
      const lijst = wachtend.get(g.valuta) ?? []
      lijst.push(g)
      wachtend.set(g.valuta, lijst)
    }
    gebeurtenissen.push(g)
  }
  return uitkomst('degiro-rekening', gebeurtenissen, [], [onbekendMelding(onbekend, voorbeeld)])
}

const CASH = /^(cash\b|cash & cash fund|ftx cash)|cash fund/i

export const degiroPortefeuille: Preset = {
  formaat: 'degiro-portefeuille',
  naam: 'DEGIRO portefeuille',
  zekerheid: 'geverifieerd',
  herken: (b) => /^product$/i.test(b.kop[0] ?? '') && /^(symbool|symbol)\s*\/\s*isin$/i.test(b.kop[1] ?? ''),
  lees: (b) => {
    const iEur = (() => {
      const i = kolom(b.kop, /waarde in eur/, /value in eur/, /wert in eur/)
      return i >= 0 ? i : b.kop.length - 1
    })()
    const iAantal = kolom(b.kop, 'aantal', 'quantity', 'anzahl')
    const datum = datumUitNaam(b.naam) ?? ''
    const regels: Stand['regels'] = []
    for (const r of b.regels) {
      const product = veld(r, 0)
      const eur = leesGetal(r[iEur], b.decimaal)
      if (!product || eur === null) continue
      const isin = veld(r, 1).toUpperCase()
      const geld = CASH.test(product) && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)
      const aantal = leesGetal(r[iAantal], b.decimaal)
      regels.push({ activum: isin || product, naam: product, ...(aantal !== null ? { aantal } : {}), eur: centen(eur), soort: geld ? 'geld' : 'effect' })
    }
    return uitkomst('degiro-portefeuille', [], [{ rekening: '', datum, regels }], [], null)
  },
}
