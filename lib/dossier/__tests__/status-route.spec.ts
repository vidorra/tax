/**
 * Ronde 2 (A3): de statusregel in PUT /api/dossier/jaren/[jaar] (taak-A3 hoofdstuk 7 en 12, test 4), en de telling van
 * de controles in laadJaar en lijstJaren (badge bij de tab Invoer, jaarkaart).
 *
 * - Zonder database: de telling en de badge op de pure delen (controle-telling.ts, jaar-tabs.ts).
 * - Met IB_TEST_DATABASE_URL (eigen schema per bestand): (a) Gecontroleerd met een open fout geeft 200, status Concept
 *   en een melding met de titel; (b) dezelfde fout met een geldige negering: Gecontroleerd; (c) Ingediend met een open
 *   fout: Ingediend, ingediend_op gezet; (d) daarna gewijzigde invoer met Ingediend: blijft Ingediend,
 *   gewijzigd_na_indienen, ingediend-gewijzigd in de controles; (e) een negering met ernst let-op voor een fout telt niet.
 */
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { GenegeerdeControle } from '@/lib/controles/types'
import { jaarBadges } from '../jaar-tabs'
import { controlesVanJaar, telControles } from '../controle-telling'
import { metJaarrekening, reken } from '@/lib/controles/__tests__/hulp'

const h = vi.hoisted(() => ({ echt: false }))

type Opties = { httpOnly?: boolean; path?: string; maxAge?: number }
const cookieStore = new Map<string, { value: string; opties: Opties }>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (naam: string) => (cookieStore.has(naam) ? { name: naam, value: cookieStore.get(naam)!.value } : undefined),
    set: (naam: string, value: string, opties: Opties) => {
      if (!value) cookieStore.delete(naam)
      else cookieStore.set(naam, { value, opties })
    },
  }),
}))

const gebruikers = new Map<number, { id: number; email: string; passwordHash: string; totpSecret: string; totpEnabled: boolean; sessieGeneratie: number; createdAt: Date }>()
vi.mock('@/lib/auth/gebruiker', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/gebruiker')>()),
  gebruikerOpId: async (id: number) => gebruikers.get(id) ?? null,
}))

vi.mock('@/lib/dossier/opslag', async (orig) => {
  const echt = await orig<typeof import('@/lib/dossier/opslag')>()
  return { ...echt, huishoudenVan: (userId: number) => (h.echt ? echt.huishoudenVan(userId) : Promise.resolve(userId * 10)) }
})

const { maakToken, SESSIE_COOKIE } = await import('@/lib/auth/sessie')
const route = await import('@/app/api/dossier/jaren/[jaar]/route')

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'
const KV = 'kapitaalsvergelijking:A:ond-1'

function verzoek(jaar: string, body: unknown): [Request, { params: Promise<{ jaar: string }> }] {
  const req = new Request(`https://ib.example.nl/api/dossier/jaren/${jaar}/`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', host: 'ib.example.nl', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify(body),
  })
  return [req, { params: Promise.resolve({ jaar }) }]
}
const put = (jaar: string, body: unknown) => route.PUT(...verzoek(jaar, body))

async function inloggen(userId: number) {
  gebruikers.set(userId, { id: userId, email: `u${userId}@example.nl`, passwordHash: 'x', totpSecret: '', totpEnabled: true, sessieGeneratie: 0, createdAt: new Date() })
  cookieStore.set(SESSIE_COOKIE, { value: await maakToken(userId, 'sessie'), opties: {} })
}

async function lees(res: Response): Promise<{ status: number; data: Record<string, any> }> {
  return { status: res.status, data: JSON.parse(await res.text()) }
}

let envKopie: NodeJS.ProcessEnv
beforeEach(() => {
  envKopie = { ...process.env }
  process.env.AUTH_SECRET = SECRET
  if (!h.echt) {
    process.env.DATABASE_URL = 'postgres://niet-gebruikt'
    process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
  }
  cookieStore.clear()
  gebruikers.clear()
})
afterEach(() => {
  process.env = envKopie
})

/** 2025 met een kapitaalsvergelijking die € 300 niet sluit (een fout) en een tweede fout naar keuze. */
function metFout(saldo = 34700): HuishoudenInvoer {
  return metJaarrekening(saldo)
}

describe('telling en badge (zonder database)', () => {
  const basis = (i: HuishoudenInvoer, streng: boolean) => ({
    jaar: i.jaar,
    variant: null,
    status: 'concept' as const,
    invoer: i,
    resultaat: reken(i),
    staat: { versie: 1 as const, ...(streng ? { controles: { streng: { op: '2026-10-05T10:00:00.000Z', door: 'export' as const } } } : {}) },
    vandaag: '2026-10-05',
  })

  it('twee open fouten in een streng jaar geven de badge "2" bij Invoer; rustig geen badge', () => {
    const i = metFout()
    i.personen[0].ondernemingen[0].naam = ''
    const streng = telControles(basis(i, true))
    expect(streng).toMatchObject({ controlesStreng: true, controles: { fouten: 2 } })
    expect(jaarBadges({ status: 'concept', controles: streng.controles, staat: basis(i, true).staat }).invoer).toEqual({ tekst: '2', srTekst: '2 fouten open' })
    const rustig = telControles(basis(i, false))
    expect(rustig.controlesStreng).toBe(false)
    expect(jaarBadges({ status: 'concept', controles: rustig.controles, staat: basis(i, false).staat }).invoer).toBeUndefined()
  })

  it('zonder te lezen jaar geen telling, wel de strengheid', () => {
    const b = { ...basis(metFout(), false), jaar: 1995 }
    expect(controlesVanJaar(b)).toBeNull()
    expect(telControles(b)).toEqual({ controlesStreng: false })
  })
})

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const SCHEMA = `ib_r2_a3_status_${Date.now()}_${randomBytes(3).toString('hex')}`

describe.skipIf(!BASIS_URL)('statusregel op een echte database', () => {
  let url = ''
  let beheer: Client
  let sleutel = ''
  const dbEnv = () => {
    process.env.DATABASE_URL = url
    process.env.DOSSIER_KEY = sleutel
  }

  beforeAll(async () => {
    const u = new URL(BASIS_URL!)
    u.searchParams.set('options', `-c search_path=${SCHEMA}`)
    url = u.toString()
    sleutel = randomBytes(32).toString('base64')
    beheer = new Client({ connectionString: BASIS_URL })
    await beheer.connect()
    await beheer.query(`CREATE SCHEMA ${SCHEMA}`)
    delete (globalThis as Record<string, unknown>).__ibDb
    h.echt = true
    dbEnv()
    const { migreer } = await import('@/scripts/migrate')
    await migreer(url, undefined, () => undefined)
  })
  beforeEach(dbEnv)

  afterAll(async () => {
    h.echt = false
    const { getPool } = await import('@/lib/db')
    await getPool().end().catch(() => undefined)
    delete (globalThis as Record<string, unknown>).__ibDb
    await beheer.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await beheer.end()
  })

  async function gebruikerMetHuishouden(email: string): Promise<{ userId: number; hh: number }> {
    const { getDb } = await import('@/lib/db')
    const { users } = await import('@/lib/db/schema')
    const { huishoudenVan } = await import('@/lib/dossier/opslag')
    const [u] = await getDb().insert(users).values({ email, passwordHash: 'x', totpEnabled: true }).returning()
    return { userId: u.id, hh: await huishoudenVan(u.id) }
  }

  const negering = (x: Partial<GenegeerdeControle> = {}): GenegeerdeControle => ({
    id: KV,
    ernst: 'fout',
    titel: 'Kapitaalsvergelijking sluit niet',
    vingerafdruk: 'verschil=300',
    reden: 'Afronding in Moneybird, besproken met de adviseur',
    op: '2026-10-05T10:00:00.000Z',
    ...x,
  })

  it('(a) Gecontroleerd met een open fout: 200, status Concept en een melding met de titel; (b) met een geldige negering: Gecontroleerd', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const staatOpslag = await import('@/lib/dossier/aangiftestaat-opslag')
    const { userId, hh } = await gebruikerMetHuishouden('status-a@example.nl')
    await inloggen(userId)
    await opslag.maakJaar(hh, metFout())

    let r = await lees(await put('2025', { invoer: metFout(), status: 'gecontroleerd', variant: null, versie: 1 }))
    expect(r.status).toBe(200)
    expect(r.data.jaar.status).toBe('concept')
    expect(r.data.melding).toBe('Opgeslagen. De status is Concept gebleven, omdat er nog een fout open staat: Kapitaalsvergelijking sluit niet.')
    expect((await opslag.laadJaar(hh, 2025))!.status).toBe('concept')

    // Twee fouten: het aantal in de melding.
    const twee = metFout()
    twee.personen[0].ondernemingen[0].naam = ''
    r = await lees(await put('2025', { invoer: twee, status: 'gecontroleerd', variant: null, versie: 2 }))
    expect(r.data.melding).toBe('Opgeslagen. De status is Concept gebleven, omdat er nog 2 fouten open staan.')

    // (b) De fout is geldig genegeerd (met reden, zelfde vingerafdruk): Gecontroleerd.
    await staatOpslag.wijzigAangifteStaat(hh, 2025, [{ soort: 'genegeerd', id: KV, waarde: negering() }])
    r = await lees(await put('2025', { invoer: metFout(), status: 'gecontroleerd', variant: null, versie: 3 }))
    expect(r.status).toBe(200)
    expect(r.data.jaar.status).toBe('gecontroleerd')
    expect(r.data.melding).toBeUndefined()

    // Een nieuwe fout bij een gecontroleerd jaar: terug naar Concept.
    r = await lees(await put('2025', { invoer: metFout(34690), status: 'gecontroleerd', variant: null, versie: 4 }))
    expect(r.data.jaar.status).toBe('concept')
    expect(r.data.melding).toBe('Opgeslagen. De status is terug naar Concept, omdat er nog een fout open staat: Kapitaalsvergelijking sluit niet.')
  })

  it('(c) Ingediend met een open fout blijft Ingediend; (d) daarna gewijzigd: blijft Ingediend met de let op ingediend-gewijzigd', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const staatOpslag = await import('@/lib/dossier/aangiftestaat-opslag')
    const { userId, hh } = await gebruikerMetHuishouden('status-c@example.nl')
    await inloggen(userId)
    await opslag.maakJaar(hh, metFout())

    let r = await lees(await put('2025', { invoer: metFout(), status: 'ingediend', variant: null, versie: 1 }))
    expect(r.status).toBe(200)
    expect(r.data.jaar.status).toBe('ingediend')
    expect(r.data.melding).toBeUndefined()
    let detail = (await opslag.laadJaar(hh, 2025))!
    expect(detail.ingediend).toMatchObject({ gewijzigdNa: false })
    expect(detail.ingediend!.op).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // Badge: Ingediend is altijd streng; één open fout.
    expect(detail.controlesStreng).toBe(true)
    expect(detail.controles?.fouten).toBe(1)

    // (d) Gewijzigde invoer, nog steeds Ingediend.
    const gewijzigd = metFout()
    gewijzigd.personen[0].ondernemingen[0].naam = 'Ontwerpstudio en partners'
    r = await lees(await put('2025', { invoer: gewijzigd, status: 'ingediend', variant: null, versie: 2 }))
    expect(r.data.jaar.status).toBe('ingediend')
    detail = (await opslag.laadJaar(hh, 2025))!
    expect(detail.status).toBe('ingediend')
    expect(detail.ingediend?.gewijzigdNa).toBe(true)
    const staat = (await staatOpslag.laadAangifteStaat(hh, 2025))?.staat ?? null
    const u = controlesVanJaar({ jaar: 2025, variant: null, status: detail.status, invoer: detail.invoer, resultaat: reken(detail.invoer), staat, ingediend: detail.ingediend, vandaag: '2026-10-05' })!
    expect(u.open.map((c) => c.id)).toEqual(expect.arrayContaining(['ingediend-gewijzigd', 'ingediend-met-fouten', KV]))
    expect(detail.controles).toMatchObject({ fouten: 1 })
    expect(detail.controles!.letOp).toBeGreaterThanOrEqual(2)

    // De jaarkaart op het overzicht telt hetzelfde.
    const [kaart] = await opslag.lijstJaren(hh)
    expect(kaart).toMatchObject({ jaar: 2025, controles: { fouten: 1 }, controlesStreng: true })
  })

  it('(e) een negering met ernst let-op voor een fout telt niet: Concept', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const staatOpslag = await import('@/lib/dossier/aangiftestaat-opslag')
    const { userId, hh } = await gebruikerMetHuishouden('status-e@example.nl')
    await inloggen(userId)
    await opslag.maakJaar(hh, metFout())
    await staatOpslag.wijzigAangifteStaat(hh, 2025, [{ soort: 'genegeerd', id: KV, waarde: negering({ ernst: 'let-op', reden: undefined }) }])
    const r = await lees(await put('2025', { invoer: metFout(), status: 'gecontroleerd', variant: null, versie: 1 }))
    expect(r.data.jaar.status).toBe('concept')
    expect(r.data.melding).toMatch(/Kapitaalsvergelijking sluit niet/)

    // Rustig concept zonder streng: geen badge; na controles.streng wel ("1").
    let detail = (await opslag.laadJaar(hh, 2025))!
    expect(detail.controlesStreng).toBe(false)
    expect(jaarBadges({ status: detail.status, controles: detail.controles, staat: null }).invoer).toBeUndefined()
    await staatOpslag.wijzigAangifteStaat(hh, 2025, [{ soort: 'controles-streng', waarde: { op: '2026-10-05T10:00:00.000Z', door: 'export' } }])
    detail = (await opslag.laadJaar(hh, 2025))!
    const staat = (await staatOpslag.laadAangifteStaat(hh, 2025))!.staat
    expect(detail.controlesStreng).toBe(true)
    expect(jaarBadges({ status: detail.status, controles: detail.controles, staat }).invoer).toEqual({ tekst: '1', srTekst: '1 fout open' })
  })
})
