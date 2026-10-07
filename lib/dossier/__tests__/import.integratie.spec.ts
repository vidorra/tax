/**
 * Ronde 2 (A4): JSON-import en herstel (taak-A4 7, test 8) en het geheim voor de rekeningsleutel.
 *
 * - Altijd, zonder database: sessie (401), herkomst (403), te groot (413), ongeldige invoer (422) en het geheim met
 *   `Cache-Control: no-store`.
 * - Met een database (per test een eigen SQLite-bestand, zie lib/db/testdb.ts): (a) faalt één jaar, dan wordt niets geschreven;
 *   (b) Ingediend blijft Ingediend, Gecontroleerd wordt Concept; (c) herstel zonder latere wijziging zet terug, na een
 *   opslag meldt het voorstel `gewijzigdNaImport` en voert de route pas uit met `bevestigd`; (d) een herstelpunt van
 *   31 dagen oud is weg na de volgende import. (8e, het verzoek uit de browser, staat in lib/import/__tests__.)
 */
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { JsonImportVerzoek } from '@/lib/import/types'
import { leegInvoer } from '@/lib/dossier/leeg'

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
const importRoute = await import('@/app/api/dossier/import/route')
const herstelRoute = await import('@/app/api/dossier/import/herstel/route')
const sleutelRoute = await import('@/app/api/dossier/import/sleutel/route')

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'
const SLEUTEL = randomBytes(32).toString('base64')
/** Zonder database: een plek die schrijfbaar is maar nooit wordt geopend (en nooit ./data van de werkmap). */
const GEEN_DB = join(tmpdir(), 'ib-test-geen-db', 'ibcalculator.db')
const DAG_MS = 24 * 60 * 60 * 1000

function verzoek(pad: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://ib.example.nl${pad}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', host: 'ib.example.nl', 'sec-fetch-site': 'same-origin', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}
const importeer = (body: unknown, headers?: Record<string, string>) => importRoute.POST(verzoek('/api/dossier/import/', body, headers))
const herstel = (body: unknown) => herstelRoute.POST(verzoek('/api/dossier/import/herstel/', body))

async function inloggen(userId: number) {
  gebruikers.set(userId, { id: userId, email: `u${userId}@example.nl`, passwordHash: 'x', totpSecret: '', totpEnabled: true, sessieGeneratie: 0, createdAt: new Date() })
  cookieStore.set(SESSIE_COOKIE, { value: await maakToken(userId, 'sessie'), opties: {} })
}

async function lees(res: Response): Promise<{ status: number; data: Record<string, any> }> {
  return { status: res.status, data: JSON.parse(await res.text()) }
}

const invoer2024 = (): HuishoudenInvoer => voorbeeldInvoer(2024)
function invoer2025(omschrijving = 'Spaarrekening'): HuishoudenInvoer {
  const i = leegInvoer(2025)
  i.box3.posities = [{ id: 'p-1', omschrijving, categorie: 'bankNL', eigenaar: 'A', waardeBegin: 80_000 }]
  return i
}

let envKopie: NodeJS.ProcessEnv
beforeEach(() => {
  envKopie = { ...process.env }
  process.env.AUTH_SECRET = SECRET
  process.env.DOSSIER_KEY = SLEUTEL
  process.env.DATABASE_PATH = GEEN_DB
  cookieStore.clear()
  gebruikers.clear()
})
afterEach(() => {
  process.env = envKopie
})

describe('routes: controles vóór de database', () => {
  it('zonder sessie 401; van een andere site 403', async () => {
    expect((await sleutelRoute.GET()).status).toBe(401)
    expect((await importeer({})).status).toBe(401)
    expect((await herstel({ herstelpuntId: 1 })).status).toBe(401)
    await inloggen(1)
    expect((await importeer({}, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
  })

  it('het geheim voor de rekeningsleutel: per huishouden, niet in een cache', async () => {
    const { rekeningGeheim } = await import('@/lib/dossier/import-opslag')
    await inloggen(1)
    const res = await sleutelRoute.GET()
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
    const { data } = await lees(res)
    expect(data.geheim).toBe(rekeningGeheim(10))
    expect(data.geheim).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(rekeningGeheim(20)).not.toBe(data.geheim)
  })

  it('te groot 413; ongeldige invoer 422 met de fouten per jaar; een nieuwere versie 422', async () => {
    await inloggen(1)
    expect((await importeer('{}', { 'content-length': String(6_000_000) })).status).toBe(413)
    const r = await lees(await importeer({ formaat: 'ibcalculator-dossier-export', versie: 1, jaren: [{ jaar: 2025, actie: 'toevoegen', invoer: { jaar: 2025 } }] }))
    expect(r.status).toBe(422)
    expect(r.data.fouten[0]).toMatch(/^2025: /)
    const nieuwer = await lees(await importeer({ formaat: 'ibcalculator-dossier-export', versie: 9, jaren: [] }))
    expect(nieuwer.status).toBe(422)
    expect(nieuwer.data.fout).toMatch(/nieuwere versie/)
    expect((await herstel({ herstelpuntId: 'een' })).status).toBe(400)
  })
})

describe('JSON-import op een echte database', () => {
  gebruikTijdelijkeDb()
  beforeAll(() => {
    h.echt = true
  })
  afterAll(() => {
    h.echt = false
  })

  async function huishouden(email: string): Promise<{ userId: number; householdId: number }> {
    const { getDb } = await import('@/lib/db')
    const { users } = await import('@/lib/db/schema')
    const { huishoudenVan } = await import('@/lib/dossier/opslag')
    const u = getDb().insert(users).values({ email, passwordHash: 'x', totpEnabled: true }).returning().get()!
    return { userId: u.id, householdId: await huishoudenVan(u.id) }
  }

  async function jaren(householdId: number) {
    const { getDb } = await import('@/lib/db')
    const { dossierYears } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    return getDb().select().from(dossierYears).where(eq(dossierYears.householdId, householdId)).all().sort((a, b) => a.jaar - b.jaar)
  }

  /** Zet het moment van de herstelpunten van een huishouden `dagen` terug (ruwe SQL: ISO-tekst in UTC). */
  async function verouder(householdId: number, dagen: number) {
    const { getSqlite } = await import('@/lib/db')
    getSqlite().prepare('UPDATE herstelpunten SET aangemaakt = ? WHERE household_id = ?').run(new Date(Date.now() - dagen * DAG_MS).toISOString(), householdId)
  }

  it('(a) faalt één jaar, dan wordt niets geschreven: ook geen herstelpunt', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const { controleerVerzoek, importeerJson, ImportFout, telHerstelpunten } = await import('@/lib/dossier/import-opslag')
    const ctx = await huishouden('a@example.nl')
    await opslag.maakJaar(ctx.householdId, invoer2025())

    // Eén ongeldig jaar: de controle weigert het hele verzoek.
    const ongeldig: JsonImportVerzoek = {
      formaat: 'ibcalculator-dossier-export',
      versie: 1,
      jaren: [
        { jaar: 2024, actie: 'toevoegen', invoer: invoer2024() },
        { jaar: 2025, actie: 'vervangen', invoer: { ...invoer2025(), personen: 'geen lijst' } },
      ],
    }
    expect(() => controleerVerzoek(ongeldig)).toThrow(ImportFout)

    // Geldig, maar 2025 bestaat al: 2024 was al geschreven in de transactie en gaat terug.
    const botsing = controleerVerzoek({ ...ongeldig, jaren: [ongeldig.jaren[0], { jaar: 2025, actie: 'toevoegen', invoer: invoer2025('Ander') }] })
    const fout = await importeerJson(ctx, botsing).catch((e) => e)
    expect(fout).toBeInstanceOf(ImportFout)
    expect((fout as InstanceType<typeof ImportFout>).status).toBe(409)
    expect((await jaren(ctx.householdId)).map((j) => j.jaar)).toEqual([2025])
    expect((await opslag.laadJaar(ctx.householdId, 2025))!.invoer.box3.posities[0].omschrijving).toBe('Spaarrekening')
    expect(await telHerstelpunten(ctx.householdId)).toBe(0)
  })

  it('(b) Ingediend uit het bestand blijft Ingediend, Gecontroleerd wordt Concept; (c) herstel zet alles terug', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const { laadAangifteStaat, vervangAangifteStaat } = await import('@/lib/dossier/aangiftestaat-opslag')
    const { controleerVerzoek, importeerJson, herstelVoorstel, herstelImport, telHerstelpunten } = await import('@/lib/dossier/import-opslag')
    const ctx = await huishouden('b@example.nl')
    await opslag.maakJaar(ctx.householdId, invoer2025())
    await opslag.bewaarAccountant(ctx.householdId, 2025, { A: { winst: 1 } })

    const r = await importeerJson(
      ctx,
      controleerVerzoek({
        formaat: 'ibcalculator-dossier-export',
        versie: 1,
        jaren: [
          { jaar: 2024, actie: 'toevoegen', invoer: invoer2024(), status: 'ingediend', accountant: { A: { winst: 5 } } },
          { jaar: 2025, actie: 'vervangen', invoer: invoer2025('Uit het bestand'), status: 'gecontroleerd', aangiftestaat: { versie: 1, controles: { streng: { op: '2026-10-01T10:00:00.000Z', door: 'paneel' } } } },
        ],
      }),
      { nu: new Date('2026-10-05T10:00:00Z') },
    )
    expect(r).toMatchObject({ toegevoegd: [2024], vervangen: [2025], herstelpuntTot: '2026-11-04' })
    expect(r.meldingen).toEqual([
      '2024 is toegevoegd en staat op Ingediend, zoals in het bestand.',
      '2025 is vervangen; de vorige versie is bewaard. Het stond op Gecontroleerd en staat nu op Concept, omdat de controles met de huidige regels anders kunnen uitkomen.',
    ])
    const [j24, j25] = await jaren(ctx.householdId)
    expect([j24.status, j24.ingediendOp !== null, j25.status]).toEqual(['ingediend', true, 'concept'])
    expect((await opslag.laadAccountant(ctx.householdId, 2024))!.regels).toEqual({ A: { winst: 5 } })
    expect((await laadAangifteStaat(ctx.householdId, 2025))!.staat.controles?.streng?.door).toBe('paneel')

    // Het herstelpunt is versleuteld: geen omschrijving in de database.
    const { getSqlite } = await import('@/lib/db')
    const rijen = getSqlite().prepare('SELECT inhoud_enc FROM herstelpunten WHERE household_id = ?').all(ctx.householdId) as Array<{ inhoud_enc: string }>
    expect(rijen).toHaveLength(1)
    expect(rijen[0].inhoud_enc.startsWith('v2.')).toBe(true)
    expect(rijen[0].inhoud_enc).not.toContain('Spaarrekening')

    // (c) Zonder latere wijziging: het voorstel meldt niets, herstel zet terug en verwijdert het toegevoegde jaar.
    const voorstel = await herstelVoorstel(ctx, r.herstelpuntId!)
    expect(voorstel!.jaren).toEqual([
      { jaar: 2024, actie: 'verwijderen', gewijzigdNaImport: false },
      { jaar: 2025, actie: 'terugzetten', gewijzigdNaImport: false },
    ])
    const terug = await herstelImport(ctx, r.herstelpuntId!)
    expect(terug).toMatchObject({ teruggezet: [2025], verwijderd: [2024] })
    expect((await jaren(ctx.householdId)).map((j) => [j.jaar, j.status])).toEqual([[2025, 'concept']])
    expect((await opslag.laadJaar(ctx.householdId, 2025))!.invoer.box3.posities[0].omschrijving).toBe('Spaarrekening')
    expect((await opslag.laadAccountant(ctx.householdId, 2025))!.regels).toEqual({ A: { winst: 1 } })
    expect((await laadAangifteStaat(ctx.householdId, 2025))!.bijgewerkt).toBeNull()
    expect(await telHerstelpunten(ctx.householdId)).toBe(0)

    // Een tweede import, daarna slaat de gebruiker 2025 nog op: het voorstel meldt de latere wijziging.
    await vervangAangifteStaat(ctx.householdId, 2025, { versie: 1 })
    const r2 = await importeerJson(ctx, controleerVerzoek({ formaat: 'ibcalculator-jaar', versie: 1, jaren: [{ jaar: 2025, actie: 'vervangen', invoer: invoer2025('Tweede import') }] }))
    const na = invoer2025('Later aangepast')
    await opslag.bewaarJaar(ctx.householdId, 2025, { invoer: na, status: 'concept', variant: null })

    await inloggen(ctx.userId)
    const zonder = await lees(await herstel({ herstelpuntId: r2.herstelpuntId }))
    expect(zonder.status).toBe(200)
    expect(zonder.data.voorstel.jaren).toEqual([{ jaar: 2025, actie: 'terugzetten', gewijzigdNaImport: true }])
    // Zonder bevestiging is er niets veranderd.
    expect((await opslag.laadJaar(ctx.householdId, 2025))!.invoer.box3.posities[0].omschrijving).toBe('Later aangepast')
    const met = await lees(await herstel({ herstelpuntId: r2.herstelpuntId, bevestigd: true }))
    expect(met.status).toBe(200)
    expect(met.data.resultaat.meldingen).toEqual(['2025 staat weer zoals vóór de import.'])
    expect((await opslag.laadJaar(ctx.householdId, 2025))!.invoer.box3.posities[0].omschrijving).toBe('Spaarrekening')
    expect((await herstel({ herstelpuntId: r2.herstelpuntId, bevestigd: true })).status).toBe(404)
  })

  it('(d) een herstelpunt van 31 dagen oud is weg na de volgende import; per huishouden blijft alleen het laatste', async () => {
    const { controleerVerzoek, importeerJson, telHerstelpunten } = await import('@/lib/dossier/import-opslag')
    const een = await huishouden('d1@example.nl')
    const twee = await huishouden('d2@example.nl')
    const v = (jaar: number, actie: 'toevoegen' | 'vervangen') => controleerVerzoek({ formaat: 'ibcalculator-jaar', versie: 1, jaren: [{ jaar, actie, invoer: jaar === 2024 ? invoer2024() : invoer2025() }] })

    const r1 = await importeerJson(een, v(2025, 'toevoegen'))
    await importeerJson(een, v(2025, 'vervangen'))
    expect(await telHerstelpunten(een.householdId)).toBe(1)

    await verouder(een.householdId, 31)
    await importeerJson(twee, v(2024, 'toevoegen'))
    expect(await telHerstelpunten(een.householdId)).toBe(0)
    expect(await telHerstelpunten(twee.householdId)).toBe(1)

    await inloggen(een.userId)
    expect((await herstel({ herstelpuntId: r1.herstelpuntId })).status).toBe(404)
  })

  it('een huishouden kan het herstelpunt van een ander niet gebruiken (geen IDOR)', async () => {
    const { controleerVerzoek, importeerJson, telHerstelpunten } = await import('@/lib/dossier/import-opslag')
    const eigenaar = await huishouden('e1@example.nl')
    const ander = await huishouden('e2@example.nl')
    const r = await importeerJson(eigenaar, controleerVerzoek({ formaat: 'ibcalculator-jaar', versie: 1, jaren: [{ jaar: 2025, actie: 'toevoegen', invoer: invoer2025() }] }))
    await inloggen(ander.userId)
    expect((await herstel({ herstelpuntId: r.herstelpuntId, bevestigd: true })).status).toBe(404)
    expect(await telHerstelpunten(eigenaar.householdId)).toBe(1)
    expect((await jaren(eigenaar.householdId)).map((j) => j.jaar)).toEqual([2025])
  })
})
