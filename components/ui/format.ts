/**
 * Getal- en bedragnotatie voor de UI (nl-NL). Puur, zonder React, zodat de
 * functies ook in tests en server components bruikbaar zijn.
 */

const MIN = '−' // echt minteken, geen streepje

function nummer(n: number, decimalen: number, groeperen = true): string {
  return n.toLocaleString('nl-NL', {
    minimumFractionDigits: decimalen,
    maximumFractionDigits: decimalen,
    useGrouping: groeperen,
  })
}

export interface EuroOpties {
  /** Aantal decimalen (standaard 0: hele euro's, zoals in de aangifte). */
  decimalen?: number
  /** Toon ook een plusteken bij positieve bedragen. */
  teken?: boolean
}

/** € 1.234 · − € 1.234 · + € 1.234 (met teken: true). Spatie is een harde spatie. */
export function formatEuro(n: number, opties: EuroOpties = {}): string {
  const { decimalen = 0, teken = false } = opties
  if (!Number.isFinite(n)) return '€ –'
  const afgerond = Number(n.toFixed(decimalen))
  const abs = nummer(Math.abs(afgerond), decimalen)
  const voorteken = afgerond < 0 ? `${MIN} ` : teken && afgerond > 0 ? '+ ' : ''
  return `${voorteken}€ ${abs}`
}

/** 1.234 of 1.234,5 */
export function formatGetal(n: number, decimalen = 0): string {
  if (!Number.isFinite(n)) return '–'
  const s = nummer(Math.abs(n), decimalen)
  return n < 0 && Number(s.replace(/\./g, '').replace(',', '.')) !== 0 ? `${MIN}${s}` : s
}

/** 0.3756 wordt "37,56%"; decimalen is het maximum, nullen achteraan vallen weg. */
export function formatPct(fractie: number, decimalen = 2): string {
  if (!Number.isFinite(fractie)) return '–'
  return `${(fractie * 100).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: decimalen })}%`
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** '2026-10-04' wordt '4 oktober 2026' (zonder tijdzone-effecten). */
export function formatDatum(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const maand = MAANDEN[Number(m[2]) - 1]
  if (!maand) return iso
  return `${Number(m[3])} ${maand} ${m[1]}`
}

export interface InvoerOpties {
  decimalen?: number
  groeperen?: boolean
  negatief?: boolean
}

/** Leest een getal zoals een Nederlandse gebruiker het typt: "12.345,67" wordt 12345.67. */
export function parseInvoer(tekst: string, opties: InvoerOpties = {}): number | null {
  return formatTijdensTypen(tekst, { ...opties, groeperen: false }).getal
}

/**
 * Normaliseert invoer tijdens het typen: alleen cijfers, één komma (als er
 * decimalen zijn), optioneel een minteken vooraan, duizendtallen met punten.
 */
export function formatTijdensTypen(ruw: string, opties: InvoerOpties = {}): { tekst: string; getal: number | null } {
  const { decimalen = 0, groeperen = true, negatief = false } = opties
  const negatiefGetypt = negatief && /^\s*[-−]/.test(ruw)
  const schoon = ruw.replace(/[^\d,]/g, '')
  let heeftKomma = false
  let heel = schoon
  let deel = ''
  if (decimalen > 0) {
    const i = schoon.indexOf(',')
    if (i !== -1) {
      heeftKomma = true
      heel = schoon.slice(0, i)
      deel = schoon.slice(i + 1).replace(/,/g, '').slice(0, decimalen)
    }
  } else {
    heel = schoon.replace(/,/g, '')
  }
  heel = heel.replace(/^0+(?=\d)/, '')
  if (heeftKomma && heel === '') heel = '0'
  const gegroepeerd = groeperen ? heel.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : heel
  const tekst = `${negatiefGetypt ? '-' : ''}${gegroepeerd}${heeftKomma ? `,${deel}` : ''}`
  if (heel === '' && deel === '') return { tekst, getal: null }
  const getal = Number(`${negatiefGetypt ? '-' : ''}${heel || '0'}.${deel || '0'}`)
  return { tekst, getal: Object.is(getal, -0) ? 0 : getal }
}

/** Weergave van een getal in een invoerveld (zonder valuta, zonder harde spaties). */
export function formatVoorInvoer(waarde: number | null | undefined, opties: InvoerOpties = {}): string {
  if (waarde === null || waarde === undefined || !Number.isFinite(waarde)) return ''
  const { decimalen = 0, groeperen = true } = opties
  const s = Math.abs(waarde).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: decimalen, useGrouping: groeperen })
  return waarde < 0 ? `-${s}` : s
}

/**
 * Cursorpositie na herformatteren: tel de betekenisvolle tekens (cijfers,
 * komma, minteken) vóór de cursor in de ruwe tekst en zoek dezelfde plek in
 * de geformatteerde tekst.
 */
export function cursorNaFormat(ruw: string, cursor: number, geformatteerd: string): number {
  const betekenis = /[\d,\-−]/
  let n = 0
  for (let i = 0; i < Math.min(cursor, ruw.length); i++) if (betekenis.test(ruw[i])) n++
  if (n === 0) return 0
  let gezien = 0
  for (let i = 0; i < geformatteerd.length; i++) {
    if (betekenis.test(geformatteerd[i])) gezien++
    if (gezien >= n) return i + 1
  }
  return geformatteerd.length
}
