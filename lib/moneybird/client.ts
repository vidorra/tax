/**
 * Moneybird API v2 (alleen lezen) met een persoonlijk token (Bearer).
 *
 * Server-only: het token komt nooit in een foutmelding, log of response. Fouten zijn een
 * MoneybirdFout met een Nederlandse uitleg; de status is die van Moneybird (0 bij een netwerkfout
 * of time-out). Eén nieuwe poging bij een netwerkfout en bij 429 (met Retry-After tot 30 seconden).
 *
 * Voor tests: geef `fetch` en `wacht` mee in de opties of zet een fetch met zetMoneybirdFetch().
 */
import type { MbAdministratie } from './types'

export const MB_BASIS = 'https://moneybird.com/api/v2'

/**
 * API-basis. Alleen voor end-to-end-tests mag MONEYBIRD_API_BASE naar een nep-Moneybird op localhost
 * wijzen (http://127.0.0.1:<poort>/api/v2); elk ander adres wordt genegeerd, zodat dit geen SSRF-route is.
 */
export function mbBasis(env: Record<string, string | undefined> = process.env): string {
  const o = env.MONEYBIRD_API_BASE?.trim()
  if (o && /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?\/api\/v2$/.test(o)) return o
  return MB_BASIS
}
export const MB_TIMEOUT_MS = 20_000
export const MB_MAX_RETRY_AFTER_S = 30
export const MB_PER_PAGINA = 100
export const MB_MAX_PAGINAS = 50
/** Maximaal aantal losse contactopvragingen per import (rate limit van Moneybird: 150 per 5 minuten). */
export const MB_MAX_CONTACTEN = 40

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export class MoneybirdFout extends Error {
  readonly status: number
  readonly melding: string
  /** Scope die ontbreekt bij een 403, als die bekend is. */
  readonly scope: string | null
  constructor(status: number, melding: string, scope: string | null = null) {
    super(melding)
    this.name = 'MoneybirdFout'
    this.status = status
    this.melding = melding
    this.scope = scope
  }
}

let fetchOverride: FetchFn | null = null

/** Vervangt fetch voor alle clients (tests). null zet de echte fetch terug. */
export function zetMoneybirdFetch(f: FetchFn | null): void {
  fetchOverride = f
}

export interface MbOpties {
  fetch?: FetchFn
  /** Wachtfunctie voor Retry-After (tests geven een directe functie mee). */
  wacht?: (ms: number) => Promise<void>
  timeoutMs?: number
}

const standaardWacht = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Welke scope een endpoint nodig heeft (voor de uitleg bij een 403). */
export function scopeVoor(pad: string): string | null {
  if (/\/ledger_accounts/.test(pad)) return 'settings'
  if (/\/reports\/balance_sheet/.test(pad)) return 'bank'
  if (/\/reports\/(profit_loss|revenue_by_contact)/.test(pad)) return 'sales_invoices of documents'
  if (/\/assets/.test(pad)) return 'documents'
  if (/\/time_entries/.test(pad)) return 'time_entries'
  if (/\/contacts/.test(pad)) return 'sales_invoices'
  return null
}

function foutVoorStatus(status: number, pad: string): MoneybirdFout {
  if (status === 401) return new MoneybirdFout(401, 'Moneybird accepteert het token niet: het is ongeldig of ingetrokken. Maak in Moneybird een nieuw token en voeg de koppeling opnieuw toe.')
  if (status === 403) {
    const scope = scopeVoor(pad)
    return new MoneybirdFout(
      403,
      scope
        ? `Het Moneybird-token mist de scope ${scope} voor dit onderdeel. Maak een token met de scopes sales_invoices, documents, bank, time_entries en settings.`
        : 'Het Moneybird-token heeft geen toegang tot dit onderdeel.',
      scope,
    )
  }
  if (status === 404) return new MoneybirdFout(404, 'Moneybird vindt de administratie of het onderdeel niet. Controleer de gekozen administratie.')
  if (status === 429) return new MoneybirdFout(429, 'Te veel verzoeken naar Moneybird. Probeer het over een paar minuten opnieuw.')
  if (status >= 500) return new MoneybirdFout(status, 'Moneybird is niet bereikbaar. Probeer het later opnieuw.')
  return new MoneybirdFout(status, `Moneybird gaf een onverwachte fout (${status}).`)
}

/** Retry-After in seconden (getal of HTTP-datum); null als onbekend. */
export function leesRetryAfter(waarde: string | null, nu = Date.now()): number | null {
  if (!waarde) return null
  const s = Number(waarde.trim())
  if (Number.isFinite(s) && s >= 0) return s
  const t = Date.parse(waarde)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.ceil((t - nu) / 1000))
}

function bouwUrl(pad: string, query?: Record<string, string | number | undefined>): string {
  if (!pad.startsWith('/') || pad.includes('..') || /[?#\s]/.test(pad)) throw new MoneybirdFout(400, 'Ongeldig Moneybird-pad.')
  const url = new URL(`${mbBasis()}${pad}`)
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v))
  return url.toString()
}

/** GET op de Moneybird API; geeft de geparste JSON terug of gooit een MoneybirdFout. */
export async function mbGet<T>(token: string, pad: string, query?: Record<string, string | number | undefined>, opties: MbOpties = {}): Promise<T> {
  if (typeof token !== 'string' || !token.trim()) throw new MoneybirdFout(401, 'Er is geen Moneybird-token ingesteld.')
  const f: FetchFn = opties.fetch ?? fetchOverride ?? ((input, init) => fetch(input, init))
  const wacht = opties.wacht ?? standaardWacht
  const timeoutMs = opties.timeoutMs ?? MB_TIMEOUT_MS
  const url = bouwUrl(pad, query)

  for (let poging = 0; poging < 2; poging++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let res: Response
    try {
      res = await f(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' },
        signal: ctrl.signal,
        cache: 'no-store',
      })
    } catch (e) {
      clearTimeout(timer)
      if (poging === 0) continue
      const timeout = ctrl.signal.aborted || (e as Error)?.name === 'AbortError'
      throw new MoneybirdFout(0, timeout ? `Moneybird reageerde niet binnen ${Math.round(timeoutMs / 1000)} seconden. Probeer het later opnieuw.` : 'Moneybird is niet bereikbaar. Probeer het later opnieuw.')
    }
    try {
      if (res.status === 429 && poging === 0) {
        const s = leesRetryAfter(res.headers.get('retry-after'))
        await res.body?.cancel().catch(() => undefined)
        if (s !== null && s <= MB_MAX_RETRY_AFTER_S) {
          await wacht(s * 1000)
          continue
        }
        throw foutVoorStatus(429, pad)
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        throw foutVoorStatus(res.status, pad)
      }
      try {
        return (await res.json()) as T
      } catch {
        throw new MoneybirdFout(502, 'Moneybird gaf een onleesbaar antwoord.')
      }
    } finally {
      clearTimeout(timer)
    }
  }
  /* c8 ignore next */
  throw new MoneybirdFout(0, 'Moneybird is niet bereikbaar. Probeer het later opnieuw.')
}

export interface MbLijstUitkomst<T> {
  items: T[]
  /** true als de grens van MB_MAX_PAGINAS is bereikt en er mogelijk meer is. */
  afgekapt: boolean
}

/**
 * Alle pagina's van een gepagineerd endpoint (per_page 100). Stopt bij een pagina met minder dan
 * 100 items, of na MB_MAX_PAGINAS pagina's. `items` haalt de lijst uit het antwoord als dat geen array is.
 */
export async function mbLijst<T>(
  token: string,
  pad: string,
  query: Record<string, string | number | undefined> = {},
  opties: MbOpties & { items?: (json: unknown) => unknown[] } = {},
): Promise<MbLijstUitkomst<T>> {
  const uit: T[] = []
  for (let pagina = 1; pagina <= MB_MAX_PAGINAS; pagina++) {
    const json = await mbGet<unknown>(token, pad, { ...query, page: pagina, per_page: MB_PER_PAGINA }, opties)
    const lijst = opties.items ? opties.items(json) : Array.isArray(json) ? json : []
    uit.push(...(lijst as T[]))
    if (lijst.length < MB_PER_PAGINA) return { items: uit, afgekapt: false }
  }
  return { items: uit, afgekapt: true }
}

// ---------------------------------------------------------------------------
// Ruwe vormen van Moneybird (alleen de velden die we gebruiken; de rest wordt genegeerd)
// ---------------------------------------------------------------------------

export interface MbRuwGrootboek {
  id: string
  name: string
  account_type: string
  parent_id?: string | null
  active?: boolean
  taxonomy_item?: { taxonomy_version?: string; code?: string | null; name?: string | null; name_english?: string | null; reference?: string | null } | null
}

export interface MbRuwRegelWaarde {
  ledger_account_id: string
  value: string | number
  children?: MbRuwRegelWaarde[]
}

export interface MbRuwWinstVerlies {
  revenue_by_ledger_account?: { ledger_accounts?: MbRuwRegelWaarde[] } | MbRuwRegelWaarde[]
  direct_costs_by_ledger_account?: { ledger_accounts?: MbRuwRegelWaarde[] } | MbRuwRegelWaarde[]
  expenses_by_ledger_account?: { ledger_accounts?: MbRuwRegelWaarde[] } | MbRuwRegelWaarde[]
  other_income_expenses_by_ledger_account?: { ledger_accounts?: MbRuwRegelWaarde[] } | MbRuwRegelWaarde[]
  gross_profit?: string | number
  operating_profit?: string | number
  net_profit?: string | number
  total_expenses?: string | number
  total_revenue?: string | number
}

export interface MbRuwBalans {
  debit?: { total?: string | number; current_assets?: MbRuwRegelWaarde[]; non_current_assets?: MbRuwRegelWaarde[] }
  credit?: {
    total?: string | number
    equity?: MbRuwRegelWaarde[]
    provisions?: MbRuwRegelWaarde[]
    non_current_liabilities?: MbRuwRegelWaarde[]
    current_liabilities?: MbRuwRegelWaarde[]
    open_years?: Array<{ year?: number | string; value?: string | number }>
  }
}

export interface MbRuwActief {
  id: string
  name?: string
  ledger_account_id?: string | null
  purchase_date?: string | null
  purchase_value?: string | number | null
  current_value?: string | number | null
  value_change_plan?: { lifespan_in_years?: number | string | null; residual_value?: string | number | null; monthly_depreciation?: string | number | null } | null
  disposal?: Record<string, unknown> | null
  value_changes?: Array<Record<string, unknown>> | null
}

export interface MbRuwUren {
  id?: string
  started_at?: string | null
  ended_at?: string | null
  paused_duration?: number | string | null
  contact_id?: string | null
  project_id?: string | null
  billable?: boolean
}

export interface MbOmzetContact {
  contactId: string | null
  /** Naam als het rapport die al meestuurt. */
  naam: string | null
  bedrag: number
}

// ---------------------------------------------------------------------------
// Getypeerde helpers
// ---------------------------------------------------------------------------

/** Moneybird-id's zijn cijfers; alles anders weigeren we, zodat er niets in het pad kan worden geplakt. */
export function geldigMbId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{1,30}$/.test(id)
}

/** 'YYYYMMDD..YYYYMMDD' voor de period-parameter. */
export function periode(van: string, tot: string): string {
  return `${van.replace(/-/g, '')}..${tot.replace(/-/g, '')}`
}

/** Getal uit een Moneybird-bedrag (decimale string). Onleesbaar wordt 0. */
export function bedragUit(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0
  if (typeof x === 'string') {
    const n = Number(x.trim())
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function tekstUit(x: unknown): string | null {
  return typeof x === 'string' && x.trim() ? x.trim() : null
}

function idUit(x: unknown): string | null {
  if (typeof x === 'number' && Number.isFinite(x)) return String(x)
  return typeof x === 'string' && x.trim() ? x.trim() : null
}

/** Leest een revenue_by_contact-antwoord in de waarschijnlijke vormen (lijst, of object met een lijst). */
export function omzetItemsUit(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    for (const k of ['revenue_by_contact', 'contacts', 'items', 'data']) if (Array.isArray(o[k])) return o[k] as unknown[]
  }
  return []
}

export function parseOmzetContact(x: unknown): MbOmzetContact | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const contact = o.contact && typeof o.contact === 'object' ? (o.contact as Record<string, unknown>) : null
  const contactId = idUit(o.contact_id) ?? idUit(contact?.id)
  const naam =
    tekstUit(o.contact_name) ??
    tekstUit(o.company_name) ??
    (contact ? contactNaamUit(contact) : null) ??
    tekstUit(o.name)
  const ruw = [o.value, o.revenue, o.total_price_excl_tax, o.total, o.amount, o.turnover].find((v) => v !== undefined && v !== null)
  if (ruw === undefined) return null
  return { contactId, naam, bedrag: bedragUit(ruw) }
}

export function contactNaamUit(c: Record<string, unknown>): string | null {
  const bedrijf = tekstUit(c.company_name)
  if (bedrijf) return bedrijf
  const persoon = [tekstUit(c.firstname), tekstUit(c.lastname)].filter(Boolean).join(' ')
  return persoon || null
}

export interface MbClient {
  administraties(): Promise<MbAdministratie[]>
  grootboekrekeningen(): Promise<MbRuwGrootboek[]>
  winstEnVerlies(van: string, tot: string): Promise<MbRuwWinstVerlies>
  /** Balans per de einddatum van de periode. */
  balans(van: string, tot: string): Promise<MbRuwBalans>
  activa(): Promise<MbRuwActief[]>
  omzetPerContact(van: string, tot: string): Promise<MbOmzetContact[]>
  uren(van: string, tot: string): Promise<MbRuwUren[]>
  /** Naam van een contact; gecachet per client (één import). null als de grens van opvragingen is bereikt. */
  contactNaam(id: string): Promise<string | null>
  /** Endpoints waar de paginagrens is bereikt. */
  readonly afgekapt: string[]
}

/**
 * Client voor één token en (optioneel) één administratie. Maak er per verzoek een nieuwe; de
 * contactcache leeft zo lang als de client.
 */
export function maakClient(token: string, administratieId: string | null, opties: MbOpties = {}): MbClient {
  const afgekapt: string[] = []
  const namen = new Map<string, string | null>()
  let contactOpvragingen = 0
  const adm = () => {
    if (!geldigMbId(administratieId)) throw new MoneybirdFout(404, 'Er is geen geldige Moneybird-administratie gekozen.')
    return administratieId
  }
  const lijst = async <T>(pad: string, query: Record<string, string | number | undefined> = {}, items?: (j: unknown) => unknown[]) => {
    const r = await mbLijst<T>(token, pad, query, { ...opties, items })
    if (r.afgekapt) afgekapt.push(pad.replace(/^\/\d+/, ''))
    return r.items
  }

  return {
    afgekapt,
    async administraties() {
      const json = await mbGet<unknown>(token, '/administrations.json', undefined, opties)
      if (!Array.isArray(json)) return []
      return json
        .map((a): MbAdministratie | null => {
          if (!a || typeof a !== 'object') return null
          const o = a as Record<string, unknown>
          const id = idUit(o.id)
          if (!geldigMbId(id)) return null
          const uit: MbAdministratie = { id, naam: tekstUit(o.name) ?? `Administratie ${id}` }
          const valuta = tekstUit(o.currency)
          const land = tekstUit(o.country)
          if (valuta) uit.valuta = valuta
          if (land) uit.land = land
          return uit
        })
        .filter((a): a is MbAdministratie => a !== null)
    },
    async grootboekrekeningen() {
      const json = await mbGet<unknown>(token, `/${adm()}/ledger_accounts.json`, undefined, opties)
      if (!Array.isArray(json)) return []
      return json
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
        .map((o) => ({
          id: idUit(o.id) ?? '',
          name: tekstUit(o.name) ?? '',
          account_type: tekstUit(o.account_type) ?? '',
          parent_id: idUit(o.parent_id),
          active: o.active !== false,
          taxonomy_item: o.taxonomy_item && typeof o.taxonomy_item === 'object' ? (o.taxonomy_item as MbRuwGrootboek['taxonomy_item']) : null,
        }))
        .filter((r) => r.id)
    },
    async winstEnVerlies(van, tot) {
      return mbGet<MbRuwWinstVerlies>(token, `/${adm()}/reports/profit_loss.json`, { period: periode(van, tot) }, opties)
    },
    async balans(van, tot) {
      return mbGet<MbRuwBalans>(token, `/${adm()}/reports/balance_sheet.json`, { period: periode(van, tot) }, opties)
    },
    async activa() {
      return lijst<MbRuwActief>(`/${adm()}/assets.json`)
    },
    async omzetPerContact(van, tot) {
      const ruw = await lijst<unknown>(`/${adm()}/reports/revenue_by_contact.json`, { period: periode(van, tot) }, omzetItemsUit)
      return ruw.map(parseOmzetContact).filter((x): x is MbOmzetContact => x !== null)
    },
    async uren(van, tot) {
      return lijst<MbRuwUren>(`/${adm()}/time_entries.json`, { filter: `period:${periode(van, tot)},state:all` })
    },
    async contactNaam(id) {
      if (!geldigMbId(id)) return null
      if (namen.has(id)) return namen.get(id) ?? null
      if (contactOpvragingen >= MB_MAX_CONTACTEN) return null
      contactOpvragingen++
      const json = await mbGet<unknown>(token, `/${adm()}/contacts/${id}.json`, undefined, opties)
      const naam = json && typeof json === 'object' ? contactNaamUit(json as Record<string, unknown>) : null
      namen.set(id, naam)
      return naam
    },
  }
}

/** Gemaskeerd token voor de browser: alleen de laatste vier tekens. */
export function maskeer(token: string): string {
  const t = token.trim()
  return `••••••${t.length >= 12 ? t.slice(-4) : ''}`
}
