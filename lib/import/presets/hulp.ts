/**
 * Ronde 2 (A4): gedeelde hulpjes voor de presets. Puur.
 */
import type { CsvBestand, Gebeurtenis, ImportMelding, PresetUitkomst, Stand } from '../types'
import { centen, leesGetal } from '../getallen'

/** Kolomindex op naam (hoofdletterongevoelig, getrimd); -1 als geen van de namen voorkomt. */
export function kolom(kop: string[], ...namen: Array<string | RegExp>): number {
  const k = kop.map((x) => x.trim().toLowerCase())
  for (const n of namen) {
    const i = typeof n === 'string' ? k.indexOf(n.toLowerCase()) : k.findIndex((x) => n.test(x))
    if (i >= 0) return i
  }
  return -1
}

/** Veld uit een regel, of '' als de kolom ontbreekt. */
export const veld = (r: string[], i: number): string => (i >= 0 ? (r[i] ?? '').trim() : '')

/** Regelnummer in het bestand (1 = eerste regel), voor "uit 4 dividendregels". */
export const regelNummer = (b: CsvBestand, index: number): number => b.voorloop.length + 2 + index

/** Eerste en laatste datum van de gebeurtenissen; null zonder datums. */
export function dekkingVan(g: Gebeurtenis[]): { van: string; tot: string } | null {
  const d = g.map((x) => x.datum).filter(Boolean).sort()
  return d.length ? { van: d[0], tot: d[d.length - 1] } : null
}

/** Meldt regels met een omschrijving die de preset niet kent, in plaats van ze stil te laten verdwijnen. */
export function onbekendMelding(regels: number[], voorbeeld: string | undefined): ImportMelding | null {
  if (regels.length === 0) return null
  const v = voorbeeld ? ` zoals "${voorbeeld.slice(0, 40)}"` : ''
  return {
    id: 'onbekend',
    ernst: 'let-op',
    tekst: `${regels.length === 1 ? 'Eén regel heeft' : `${regels.length} regels hebben`} een omschrijving die we niet kennen${v}. Die ${regels.length === 1 ? 'telt' : 'tellen'} niet mee; vul het zelf in als het bij je bezitting hoort.`,
    regels,
  }
}

/** Uitkomst zonder rekening (die zet de component met de HMAC-sleutel, zie `metRekening`). */
export function uitkomst(formaat: PresetUitkomst['formaat'], gebeurtenissen: Gebeurtenis[], standen: Stand[], meldingen: Array<ImportMelding | null>, dekking?: PresetUitkomst['dekking']): PresetUitkomst {
  return {
    formaat,
    rekening: '',
    gebeurtenissen,
    standen,
    dekking: dekking === undefined ? dekkingVan(gebeurtenissen) : dekking,
    meldingen: meldingen.filter((m): m is ImportMelding => m !== null),
  }
}

/** Zet de rekeningsleutel op de uitkomst, de gebeurtenissen en de standen. */
export function metRekening(u: PresetUitkomst, rekening: string): PresetUitkomst {
  return {
    ...u,
    rekening,
    gebeurtenissen: u.gebeurtenissen.map((g) => ({ ...g, rekening })),
    standen: u.standen.map((s) => ({ ...s, rekening })),
  }
}

/** Bouwt een gebeurtenis met de vaste velden; `eur` op centen. */
export function gebeurtenis(g: Omit<Gebeurtenis, 'rekening'>): Gebeurtenis {
  const uit: Gebeurtenis = { ...g, rekening: '' }
  if (uit.eur !== undefined) uit.eur = centen(uit.eur)
  return uit
}

/** Munten die geld zijn (de rest is crypto bij Bitvavo en Coinbase). */
export const FIAT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'DKK', 'SEK', 'NOK', 'PLN', 'CZK', 'HUF', 'JPY', 'CAD', 'AUD'])

/** Aantal tussen "Koop 4 @ 52,00 EUR" of "Buy 20 @ 104.10 EUR". */
export function aantalUitOmschrijving(tekst: string, decimaal?: CsvBestand['decimaal']): number | undefined {
  const m = /^(?:koop|verkoop|buy|sell)\s+([\d.,]+)/i.exec(tekst.trim())
  if (!m) return undefined
  return leesGetal(m[1], decimaal) ?? undefined
}
