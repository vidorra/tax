/**
 * Ronde 2 (A4): CSV lezen volgens RFC 4180, met sniffing van scheidingsteken, decimaalteken, BOM, regeleinden (CRLF,
 * LF, CR) en voorloopregels (Coinbase begint met "Transactions" en "User,<naam>,<id>"). Puur; draait in de browser.
 *
 * Voorloopregels staan in `CsvBestand.voorloop` zodat een preset ze kan herkennen, maar komen nooit in een voorstel of
 * de invoer: ze kunnen een naam bevatten. Velden worden getrimd (alleen spaties aan de randen, zoals "84,2637 " bij
 * Rabobank); verder blijft de tekst zoals hij is.
 */
import type { CsvBestand } from './types'
import { IMPORT_GRENZEN } from './types'

export type Scheiding = CsvBestand['scheiding']

export interface CsvFout {
  fout: 'leeg' | 'te-groot' | 'te-veel-regels' | 'geen-csv'
  tekst: string
}

/** Meer dan zoveel regels vóór de kopregel zijn geen voorloopregels meer maar een ander formaat. */
const MAX_VOORLOOP = 5

/** Splitst tekst in regels en velden (RFC 4180): aanhalingstekens, "" als escape, regeleinden binnen een veld. */
export function parseRegels(tekst: string, scheiding: Scheiding, maxRegels = Infinity): string[][] {
  const regels: string[][] = []
  let veld = ''
  let regel: string[] = []
  let inQuote = false
  let i = 0
  const n = tekst.length
  const sluitRegel = () => {
    regel.push(veld)
    veld = ''
    // Helemaal lege regels (ook ",,," niet: die hebben velden) slaan we over.
    if (!(regel.length === 1 && regel[0] === '')) regels.push(regel)
    regel = []
  }
  while (i < n) {
    const c = tekst[i]
    if (inQuote) {
      if (c === '"') {
        if (tekst[i + 1] === '"') {
          veld += '"'
          i += 2
          continue
        }
        inQuote = false
        i++
        continue
      }
      veld += c
      i++
      continue
    }
    if (c === '"' && veld.trim() === '') {
      veld = ''
      inQuote = true
      i++
      continue
    }
    if (c === scheiding) {
      regel.push(veld)
      veld = ''
      i++
      continue
    }
    if (c === '\r' || c === '\n') {
      sluitRegel()
      if (regels.length > maxRegels) return regels
      i += c === '\r' && tekst[i + 1] === '\n' ? 2 : 1
      continue
    }
    veld += c
    i++
  }
  if (veld !== '' || regel.length > 0) sluitRegel()
  return regels
}

const KANDIDATEN: Scheiding[] = [',', ';', '\t']

/** Kiest het scheidingsteken dat de meeste regels met hetzelfde aantal velden (meer dan één) geeft. */
export function snifScheiding(tekst: string): Scheiding {
  const proef = tekst.slice(0, 20_000)
  let beste: { s: Scheiding; f: number; m: number } = { s: ',', f: 0, m: 0 }
  for (const s of KANDIDATEN) {
    const regels = parseRegels(proef, s, 40).slice(0, 40)
    const tel = new Map<number, number>()
    for (const r of regels) if (r.length > 1) tel.set(r.length, (tel.get(r.length) ?? 0) + 1)
    let m = 0
    let f = 0
    for (const [lengte, aantal] of tel) if (aantal > f || (aantal === f && lengte > m)) [m, f] = [lengte, aantal]
    if (f > beste.f || (f === beste.f && m > beste.m)) beste = { s, f, m }
  }
  return beste.s
}

const NL_GROEP = /^[-+−]?[€$£]?\s?\d{1,3}(\.\d{3})+,\d+$/
const EN_GROEP = /^[-+−]?[€$£]?\s?\d{1,3}(,\d{3})+\.\d+$/
const KOMMA = /^[-+−]?[€$£]?\s?\d+,(\d{1,2}|\d{4,})$/
const PUNT = /^[-+−]?[€$£]?\s?\d+\.(\d{1,2}|\d{4,})$/

/** Kiest het decimaalteken op grond van de getallen in de regels; bij twijfel komma bij ';' en punt bij ','. */
export function snifDecimaal(regels: string[][], scheiding: Scheiding): CsvBestand['decimaal'] {
  let komma = 0
  let punt = 0
  let gezien = 0
  for (const r of regels) {
    for (const v of r) {
      if (++gezien > 5000) break
      const t = v.trim()
      if (NL_GROEP.test(t) || KOMMA.test(t)) komma++
      else if (EN_GROEP.test(t) || PUNT.test(t)) punt++
    }
  }
  if (komma === punt) return scheiding === ';' ? ',' : '.'
  return komma > punt ? ',' : '.'
}

/**
 * Index van de kopregel. Een regel is een voorloopregel als hij één veld heeft, of korter is dan een blok van
 * gelijke regels erna (Coinbase: "Transactions", "User,<naam>,<id>", dan de kop met elf kolommen).
 */
function kopIndex(regels: string[][]): number {
  let i = 0
  while (i < Math.min(regels.length - 1, MAX_VOORLOOP)) {
    const r = regels[i]
    const volgende = regels[i + 1]
    const blok = i + 2 >= regels.length || regels[i + 2].length === volgende.length
    if (r.length < 2 || (r.length < volgende.length && blok)) i++
    else break
  }
  return i
}

/**
 * Leest een CSV-bestand. `naam` is de bestandsnaam (alleen voor de herkenning van een peildatum en de meldingen).
 * Scheiding en decimaal mogen worden opgegeven (generieke koppeling met een eigen keuze); anders gesnift.
 */
export function leesCsv(naam: string, tekst: string, opties: { scheiding?: Scheiding; decimaal?: CsvBestand['decimaal'] } = {}): CsvBestand | CsvFout {
  if (tekst.length > IMPORT_GRENZEN.maxBytes) return { fout: 'te-groot', tekst: `${naam} is groter dan ${IMPORT_GRENZEN.maxBytes / 1024 / 1024} MB. Kies een kortere periode.` }
  let t = tekst.charCodeAt(0) === 0xfeff ? tekst.slice(1) : tekst
  // Een Excel- of PDF-bestand is geen CSV (PK = zip, %PDF), en tekst met nul-tekens ook niet.
  if (/^(PK\u0003\u0004|%PDF|ÐÏ)/.test(t) || t.slice(0, 2000).includes('\u0000')) {
    return { fout: 'geen-csv', tekst: `${naam} is geen CSV-bestand. Exporteer het overzicht bij je bank of broker als CSV.` }
  }
  t = t.replace(/^\s+/, '')
  if (!t.trim()) return { fout: 'leeg', tekst: `In ${naam} staan geen regels.` }
  const scheiding = opties.scheiding ?? snifScheiding(t)
  const alle = parseRegels(t, scheiding, IMPORT_GRENZEN.maxRegels + MAX_VOORLOOP + 1)
  if (alle.length > IMPORT_GRENZEN.maxRegels + MAX_VOORLOOP) {
    return { fout: 'te-veel-regels', tekst: `${naam} heeft meer dan ${IMPORT_GRENZEN.maxRegels.toLocaleString('nl-NL')} regels. Kies een kortere periode.` }
  }
  if (alle.every((r) => r.length < 2)) return { fout: 'geen-csv', tekst: `${naam} is geen CSV-bestand. Exporteer het overzicht bij je bank of broker als CSV.` }
  const k = kopIndex(alle)
  const trim = (r: string[]) => r.map((v) => v.trim())
  const kop = trim(alle[k])
  const regels = alle.slice(k + 1).map(trim)
  if (regels.length === 0) return { fout: 'leeg', tekst: `In ${naam} staan geen regels.` }
  const decimaal = opties.decimaal ?? snifDecimaal(regels, scheiding)
  return { naam, scheiding, decimaal, voorloop: alle.slice(0, k).map(trim), kop, regels }
}

export function isCsvFout(x: CsvBestand | CsvFout): x is CsvFout {
  return 'fout' in x
}

/**
 * Hash van de genormaliseerde regels (kop en regels, getrimd, gesorteerd; zonder voorloopregels): hetzelfde bestand
 * opnieuw geëxporteerd geeft dezelfde hash, ook met andere regeleinden of een BOM. 64 bits (twee FNV-1a-banen) in
 * hex; genoeg om een bestand te herkennen, niet om de inhoud terug te vinden.
 */
export function bestandHash(b: Pick<CsvBestand, 'kop' | 'regels'>): string {
  const regels = b.regels.map((r) => r.join('\u001f')).sort()
  const tekst = [b.kop.join('\u001f'), ...regels].join('\n')
  return fnv64(tekst)
}

/** Hash van een kopregel, voor de onthouden kolomkoppeling. */
export function kopHash(kop: string[]): string {
  return fnv64(kop.map((k) => k.trim().toLowerCase()).join('\u001f'))
}

function fnv64(tekst: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c ^ (i & 0xff), 0x5bd1e995)
    b ^= b >>> 15
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}
