/**
 * Ronde 2 (A4): getallen en datums uit exports van banken en brokers. Puur: geen Date.now(), geen Intl-tijdzones.
 *
 * Getallen: "1.250,00", "1,250.00", "-€597.49846", "84,2637 ", "(12,50)", "EUR 3,91" en "1 250,00". Is het
 * scheidingsteken niet uit het getal zelf af te leiden ("1,250" kan 1250 of 1,25 zijn), dan beslist de decimaal van
 * het bestand (`CsvBestand.decimaal`); zonder die hint is het een decimaalteken.
 *
 * Datums: dd-MM-yyyy, yyyy-MM-dd met tijd, dd-MMM-yyyy met Nederlandse of Engelse maand ("02-Apr-2025", "18-mrt-2025"),
 * yyyyMMdd. UTC-tijden (Trading 212 met "+00:00", Coinbase met "UTC") worden omgezet naar Europe/Amsterdam vóór het jaar
 * telt: een regel op 31 december 23:30 UTC hoort in Nederland bij 1 januari.
 */

export type Decimaal = ',' | '.'

const MINTEKENS = /^[-−–]/
const VALUTA_TEKENS = /[€$£¥]/g
const VALUTA_CODE = /^[A-Z]{3}\s+|\s+[A-Z]{3}$/

/** Leest een getal; null als het geen getal is. */
export function leesGetal(ruw: string | number | undefined | null, decimaal?: Decimaal): number | null {
  if (typeof ruw === 'number') return Number.isFinite(ruw) ? ruw : null
  if (ruw === undefined || ruw === null) return null
  let s = String(ruw).replace(/[   ]/g, ' ').trim()
  if (!s) return null
  let negatief = false
  if (/^\(.*\)$/.test(s)) {
    negatief = true
    s = s.slice(1, -1).trim()
  }
  s = s.replace(VALUTA_CODE, '').trim()
  // Teken vóór of na het valutateken: "-€597.49", "€-5", "+ 3".
  s = s.replace(VALUTA_TEKENS, '').trim()
  if (MINTEKENS.test(s)) {
    negatief = !negatief
    s = s.slice(1).trim()
  } else if (s.startsWith('+')) s = s.slice(1).trim()
  if (/[-−]$/.test(s)) {
    negatief = !negatief
    s = s.slice(0, -1).trim()
  }
  // Spaties als duizendtalscheiding ("1 250,00").
  s = s.replace(/(\d) (?=\d{3}(\D|$))/g, '$1')
  if (!/^(\d[\d.,]*|[.,]\d+)$/.test(s)) return null
  const punten = (s.match(/\./g) ?? []).length
  const kommas = (s.match(/,/g) ?? []).length
  let schoon: string
  if (punten > 0 && kommas > 0) {
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
    const groep = dec === ',' ? '.' : ','
    const [heel, frac, ...rest] = s.split(dec)
    if (rest.length > 0 || frac === undefined || frac.includes(groep)) return null
    if (!/^\d{1,3}([.,]\d{3})*$/.test(heel)) return null
    schoon = `${heel.split(groep).join('')}.${frac}`
  } else if (punten + kommas === 0) {
    schoon = s
  } else {
    const sep = punten > 0 ? '.' : ','
    const aantal = punten + kommas
    if (aantal > 1) {
      // "1.250.000": alleen duizendtallen.
      if (!/^\d{1,3}([.,]\d{3})+$/.test(s)) return null
      schoon = s.split(sep).join('')
    } else {
      const [heel, frac] = s.split(sep)
      const isGroep = frac.length === 3 && heel.length > 0 && heel !== '0' && decimaal !== undefined && decimaal !== sep
      schoon = isGroep ? `${heel}${frac}` : `${heel || '0'}.${frac}`
    }
  }
  const n = Number(schoon)
  if (!Number.isFinite(n)) return null
  return negatief ? (n === 0 ? 0 : -n) : n
}

/**
 * Schrijft een getal zoals een export het zou doen: 'nl' "1.250,00", 'en' "1,250.00". Voor de eigenschapstests (heen
 * en terug) en voorbeeldbestanden.
 */
export function schrijfGetal(n: number, stijl: 'nl' | 'en', decimalen = 2, groeperen = true): string {
  const [heel, frac] = Math.abs(n).toFixed(decimalen).split('.')
  const groep = stijl === 'nl' ? '.' : ','
  const dec = stijl === 'nl' ? ',' : '.'
  const metGroep = groeperen ? heel.replace(/\B(?=(\d{3})+(?!\d))/g, groep) : heel
  const teken = n < 0 && Number(Math.abs(n).toFixed(decimalen)) !== 0 ? '-' : ''
  return `${teken}${metGroep}${frac !== undefined ? dec + frac : ''}`
}

/** Afronden op centen, zonder 1,005-problemen. */
export function centen(n: number): number {
  return Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100
}

/**
 * Verdeelt `totaal` (in centen nauwkeurig) naar rato van `gewichten`, zodat de delen samen precies het totaal zijn
 * (grootste rest). IBKR geeft per valuta één "Total in EUR"; de regels en landen krijgen elk hun deel.
 */
export function verdeelNaarRato(totaal: number, gewichten: number[]): number[] {
  const som = gewichten.reduce((s, g) => s + g, 0)
  const totaalCent = Math.round(totaal * 100)
  if (gewichten.length === 0) return []
  if (som === 0) return gewichten.map((_, i) => (i === 0 ? totaalCent / 100 : 0))
  const ruw = gewichten.map((g) => (totaalCent * g) / som)
  const af = ruw.map((r) => Math.trunc(r))
  let rest = totaalCent - af.reduce((s, a) => s + a, 0)
  const stap = Math.sign(rest)
  const volgorde = ruw.map((r, i) => ({ i, f: Math.abs(r - Math.trunc(r)) })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (let k = 0; rest !== 0 && k < volgorde.length * 2; k++) {
    af[volgorde[k % volgorde.length].i] += stap
    rest -= stap
  }
  return af.map((a) => a / 100)
}

// ---------------------------------------------------------------------------
// Datums
// ---------------------------------------------------------------------------

const MAANDEN: Record<string, number> = {
  jan: 1, januari: 1, january: 1, jän: 1,
  feb: 2, februari: 2, february: 2,
  mrt: 3, maa: 3, maart: 3, mar: 3, march: 3, mär: 3,
  apr: 4, april: 4,
  mei: 5, may: 5, mai: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, augustus: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12, dez: 12,
}

/** Maandnummer uit een Nederlandse of Engelse naam of afkorting ("mrt", "Apr", "October"); null als onbekend. */
export function maandUitNaam(naam: string): number | null {
  const m = MAANDEN[naam.trim().toLowerCase().replace(/\.$/, '')]
  return m ?? null
}

const twee = (n: number) => String(n).padStart(2, '0')

function geldig(j: number, m: number, d: number): boolean {
  if (j < 1900 || j > 2200 || m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(j, m, 0)).getUTCDate()
}

function iso(j: number, m: number, d: number): string | null {
  return geldig(j, m, d) ? `${j}-${twee(m)}-${twee(d)}` : null
}

/** Laatste zondag van een maand (0-based maand) in UTC-milliseconden, om 01:00 UTC (wisseling zomertijd in de EU). */
function laatsteZondagEenUur(jaar: number, maand: number): number {
  const laatste = new Date(Date.UTC(jaar, maand + 1, 0))
  const dag = laatste.getUTCDate() - laatste.getUTCDay()
  return Date.UTC(jaar, maand, dag, 1)
}

/** Datum in Europe/Amsterdam (CET, CEST van de laatste zondag van maart tot de laatste zondag van oktober). */
export function amsterdamDatum(utcMs: number): string {
  const jaar = new Date(utcMs).getUTCFullYear()
  const zomer = utcMs >= laatsteZondagEenUur(jaar, 2) && utcMs < laatsteZondagEenUur(jaar, 9)
  const lokaal = new Date(utcMs + (zomer ? 2 : 1) * 3_600_000)
  return `${lokaal.getUTCFullYear()}-${twee(lokaal.getUTCMonth() + 1)}-${twee(lokaal.getUTCDate())}`
}

export interface DatumOpties {
  /** De tijd in het veld is UTC, ook zonder "Z", "UTC" of "+00:00" (Trading 212). */
  utc?: boolean
  /** Volgorde bij een datum met cijfers en twee korte delen: dag-maand-jaar (standaard) of maand-dag-jaar. */
  volgorde?: 'dmy' | 'mdy'
}

/**
 * Leest een datum (met of zonder tijd) en geeft yyyy-mm-dd in Europe/Amsterdam, of null. Een tijd met "Z", "UTC" of
 * een offset wordt omgezet; zonder tijdzone is de tijd lokaal (tenzij `utc`).
 */
export function leesDatum(ruw: string | undefined | null, opties: DatumOpties = {}): string | null {
  if (!ruw) return null
  const s = ruw.trim()
  // yyyy-MM-dd[ T]HH:mm[:ss[.fff]][ ][Z|UTC|+hh:mm]
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?(?:\s+[A-Z]{2,4})?$/i.exec(s)
  if (m) {
    const [j, mnd, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (!geldig(j, mnd, d)) return null
    const zone = m[7]
    if (m[4] !== undefined && (zone || opties.utc)) {
      let offsetMin = 0
      if (zone && /^[+-]/.test(zone)) {
        const z = zone.replace(':', '')
        offsetMin = (z.startsWith('-') ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5)))
      }
      const utc = Date.UTC(j, mnd - 1, d, Number(m[4]), Number(m[5]), Number(m[6] ?? 0)) - offsetMin * 60_000
      return amsterdamDatum(utc)
    }
    return iso(j, mnd, d)
  }
  // yyyyMMdd (IBKR Flex)
  m = /^(\d{4})(\d{2})(\d{2})(?:[;, ].*)?$/.exec(s)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  // dd-MM-yyyy, dd/MM/yyyy, dd.MM.yyyy (met optionele tijd)
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T,]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(s)
  if (m) {
    const [a, b] = opties.volgorde === 'mdy' ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])]
    return iso(Number(m[3]), b, a)
  }
  // dd-MMM-yyyy of dd MMM yyyy ("02-Apr-2025", "18-mrt-2025", "3 februari 2025")
  m = /^(\d{1,2})[-/. ]([A-Za-zäé]{3,10})\.?[-/. ](\d{4})$/.exec(s)
  if (m) {
    const mnd = maandUitNaam(m[2])
    return mnd ? iso(Number(m[3]), mnd, Number(m[1])) : null
  }
  // "January 1, 2025"
  m = /^([A-Za-z]{3,10})\.? (\d{1,2}), (\d{4})$/.exec(s)
  if (m) {
    const mnd = maandUitNaam(m[1])
    return mnd ? iso(Number(m[3]), mnd, Number(m[2])) : null
  }
  return null
}

/** Datum uit een bestandsnaam ("portefeuille-2024-12-31.csv", "Portfolio_31-12-2024.csv"); null als er geen in staat. */
export function datumUitNaam(naam: string): string | null {
  let m = /(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/.exec(naam)
  if (m) {
    const d = iso(Number(m[1]), Number(m[2]), Number(m[3]))
    if (d) return d
  }
  m = /(\d{2})[-_.](\d{2})[-_.](\d{4})/.exec(naam)
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]))
  return null
}

/** De dag ervoor of erna (yyyy-mm-dd). */
export function verschuifDag(datum: string, dagen: number): string {
  const [j, m, d] = datum.split('-').map(Number)
  const t = new Date(Date.UTC(j, m - 1, d + dagen))
  return `${t.getUTCFullYear()}-${twee(t.getUTCMonth() + 1)}-${twee(t.getUTCDate())}`
}
