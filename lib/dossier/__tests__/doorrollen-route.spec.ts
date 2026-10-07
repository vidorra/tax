/**
 * GET/POST /api/dossier/jaren/[jaar]/doorrollen: saldi uit het vorige jaar opnieuw overnemen.
 *
 * - Altijd: sessie (401), herkomst (403), niet ingericht (503), onbekend jaar (404) en een ontbrekende versie (400),
 *   zonder database.
 * - Met een database (per test een eigen SQLite-bestand, zie lib/db/testdb.ts): voorbeeld zonder opslaan, 409 bij
 *   een oude versie, overnemen en opslaan, twee keer overnemen geeft hetzelfde zonder nieuwe versie, 404 zonder vorig
 *   jaar en geen toegang tot het dossier van een ander huishouden.
 */
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
import type { HuishoudenInvoer } from '@/lib/tax/types'

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
const route = await import('@/app/api/dossier/jaren/[jaar]/doorrollen/route')

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'
const SLEUTEL = randomBytes(32).toString('base64')
/** Zonder database: een plek die schrijfbaar is maar nooit wordt geopend (en nooit ./data van de werkmap). */
const GEEN_DB = join(tmpdir(), 'ib-test-geen-db', 'ibcalculator.db')

function verzoek(methode: string, jaar: string, body?: unknown, headers: Record<string, string> = {}): [Request, { params: Promise<{ jaar: string }> }] {
  const req = new Request(`https://ib.example.nl/api/dossier/jaren/${jaar}/doorrollen/`, {
    method: methode,
    headers: { 'content-type': 'application/json', host: 'ib.example.nl', 'sec-fetch-site': 'same-origin', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return [req, { params: Promise.resolve({ jaar }) }]
}
const get = (jaar: string) => route.GET(...verzoek('GET', jaar))
const post = (jaar: string, body?: unknown, headers?: Record<string, string>) => route.POST(...verzoek('POST', jaar, body, headers))

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
  process.env.DOSSIER_KEY = SLEUTEL
  process.env.DATABASE_PATH = GEEN_DB
  cookieStore.clear()
  gebruikers.clear()
})
afterEach(() => {
  process.env = envKopie
})

describe('route: controles vóór de database', () => {
  it('zonder sessie 401, van een andere site 403', async () => {
    expect((await get('2026')).status).toBe(401)
    expect((await post('2026', { versie: 1 })).status).toBe(401)
    await inloggen(1)
    expect((await post('2026', { versie: 1 }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post('2026', { versie: 1 }, { 'sec-fetch-site': 'same-site' })).status).toBe(403)
  })

  it('zonder versie 400, onbekend jaar 404, niet ingericht 503', async () => {
    await inloggen(1)
    const r = await lees(await post('2026', {}))
    expect(r.status).toBe(400)
    expect(r.data.fout).toMatch(/versie/)
    expect((await post('2026', { versie: 'een' })).status).toBe(400)
    expect((await get('1999')).status).toBe(404)
    expect((await post('abc', { versie: 1 })).status).toBe(404)
    delete process.env.AUTH_SECRET
    expect((await post('2026', { versie: 1 })).status).toBe(503)
  })
})

function vorig2025(): HuishoudenInvoer {
  return {
    jaar: 2025,
    personen: [
      {
        id: 'A',
        geboortedatum: '1988-03-01',
        loon: [],
        // De vrijwillige afname van de FOR is ten hoogste de afgetrokken lijfrentepremie: hier omgezet in een lijfrente.
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, forOmzetting: 2000 },
        verliezen: [{ jaar: 2023, bedrag: 70000 }],
        ondernemingen: [
          {
            naam: 'zaak',
            winstberekening: { soort: 'saldo', saldo: 60000 },
            uren: { onderneming: 1400, urencriteriumGehaald: true },
            startjaar: 2015,
            for: { stand: 20000, vrijwilligeAfname: 2000 },
            investeringen: [{ omschrijving: 'laptop', datum: '2025-07-15', bedrag: 3000, regeling: 'kia' }],
          },
        ],
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

describe('doorrollen op een echte database', () => {
  gebruikTijdelijkeDb()
  beforeAll(() => {
    h.echt = true
  })
  afterAll(() => {
    h.echt = false
  })

  async function gebruikerMetHuishouden(email: string): Promise<{ userId: number; hh: number }> {
    const { getDb } = await import('@/lib/db')
    const { users } = await import('@/lib/db/schema')
    const { huishoudenVan } = await import('@/lib/dossier/opslag')
    const u = getDb().insert(users).values({ email, passwordHash: 'x', totpEnabled: true }).returning().get()!
    return { userId: u.id, hh: await huishoudenVan(u.id) }
  }

  it('voorbeeld, 409 bij een oude versie, overnemen en opslaan, twee keer overnemen geeft hetzelfde', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const { nieuwJaarUitVorig } = await import('@/lib/dossier/nieuw-jaar')
    const { userId, hh } = await gebruikerMetHuishouden('doorrol@example.nl')
    await inloggen(userId)

    const vorig = vorig2025()
    await opslag.maakJaar(hh, vorig)
    const nieuw = nieuwJaarUitVorig(vorig, 2026, opslag.reken(vorig, null).resultaat)
    nieuw.personen[0].loon = [{ omschrijving: 'Baan', soort: 'loon', bruto: 12000, ingehoudenLoonheffing: 1500 }]
    await opslag.maakJaar(hh, nieuw)
    expect(nieuw.personen[0].ondernemingen[0].for!.stand).toBe(18000)

    // Niets gewijzigd: een leeg voorbeeld.
    let r = await lees(await get('2026'))
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ vorigJaar: 2025, versie: 1, wijzigingen: [] })

    // 2025 wijzigt later: meer vrijwillige afneming en meer winst.
    const v2 = vorig2025()
    v2.personen[0].ondernemingen[0].for!.vrijwilligeAfname = 5000
    v2.personen[0].inkomensvoorziening.forOmzetting = 5000
    v2.personen[0].ondernemingen[0].winstberekening = { soort: 'saldo', saldo: 65000 }
    await opslag.bewaarJaar(hh, 2025, { invoer: v2, status: 'concept', variant: null })

    r = await lees(await get('2026'))
    expect(r.status).toBe(200)
    const labels = (r.data.wijzigingen as Array<{ label: string }>).map((w) => w.label)
    expect(labels).toEqual(expect.arrayContaining(['Oudedagsreserve begin', 'Verliezen box 1', 'Premiegrondslag-inkomen 2025']))
    expect((await opslag.laadJaar(hh, 2026))!.versie).toBe(1)

    // Een oude versie: 409, niets opgeslagen.
    r = await lees(await post('2026', { versie: 7 }))
    expect(r.status).toBe(409)
    expect((await opslag.laadJaar(hh, 2026))!.versie).toBe(1)

    // Overnemen.
    r = await lees(await post('2026', { versie: 1 }))
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ opgeslagen: true, versie: 2 })
    expect(r.data.invoer.personen[0].ondernemingen[0].for.stand).toBe(15000)
    const opgeslagen = (await opslag.laadJaar(hh, 2026))!
    expect(opgeslagen.versie).toBe(2)
    expect(opgeslagen.invoer.personen[0].ondernemingen[0].for!.stand).toBe(15000)
    // Ronde 2: laadJaar geeft lijstitems een vaste id (lib/dossier/ids.ts); de rest is ongewijzigd.
    expect(opgeslagen.invoer.personen[0].loon.map(({ id: _id, ...l }) => l)).toEqual(nieuw.personen[0].loon)
    expect(opgeslagen.invoer.personen[0].loon.map((l) => l.id)).toEqual(['loon-1'])
    expect(opgeslagen.invoer).toEqual(r.data.invoer)

    // Nog een keer: niets te doen, geen nieuwe versie.
    r = await lees(await post('2026', { versie: 2 }))
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ opgeslagen: false, versie: 2, wijzigingen: [] })
    expect((await opslag.laadJaar(hh, 2026))!.versie).toBe(2)
    expect((await lees(await get('2026'))).data.wijzigingen).toEqual([])
  })

  it('zonder vorig jaar 404; het dossier van een ander huishouden is niet te zien of te wijzigen', async () => {
    const opslag = await import('@/lib/dossier/opslag')
    const a = await gebruikerMetHuishouden('a-doorrol@example.nl')
    const b = await gebruikerMetHuishouden('b-doorrol@example.nl')
    await opslag.maakJaar(a.hh, vorig2025())
    const nieuw = vorig2025()
    nieuw.jaar = 2026
    await opslag.maakJaar(a.hh, nieuw)

    await inloggen(a.userId)
    const zonder = await lees(await get('2025'))
    expect(zonder.status).toBe(404)
    expect(zonder.data.fout).toMatch(/geen dossier voor 2024/)

    await inloggen(b.userId)
    expect((await get('2026')).status).toBe(404)
    expect((await post('2026', { versie: 1 })).status).toBe(404)
    expect((await opslag.laadJaar(a.hh, 2026))!.versie).toBe(1)
  })
})
