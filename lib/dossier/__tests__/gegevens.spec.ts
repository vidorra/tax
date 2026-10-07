/**
 * Persoonlijke gegevens van het huishouden (lib/dossier/gegevens.ts) en GET/PUT /api/dossier/gegevens.
 *
 * - Altijd: validatie en normalisatie, het lezen van wat er in de database staat, en de route-controles
 *   die vóór de opslag gebeuren (sessie, herkomst, bodylimiet, validatie).
 * - Met een database (per test een eigen SQLite-bestand, zie lib/db/testdb.ts): opslaan en ontsleutelen, binding
 *   van de ciphertext aan het huishouden, export en verwijderen.
 * Testgegevens zijn verzonnen.
 */
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'

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
const { gegevensUitOpslag, normaliseerPostcode, schoonGegevens, SAMENLEVINGSVORMEN } = await import('../gegevens')
const route = await import('@/app/api/dossier/gegevens/route')

const BASIS = 'https://ib.example.nl'
const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'
const SLEUTEL = randomBytes(32).toString('base64')
/** Zonder database: een plek die schrijfbaar is maar nooit wordt geopend (en nooit ./data van de werkmap). */
const GEEN_DB = join(tmpdir(), 'ib-test-geen-db', 'ibcalculator.db')
const ADRES = { straat: 'Voorbeeldstraat 12', postcode: '1234 AB', plaats: 'Voorbeeldstad' }

function verzoek(methode: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASIS}/api/dossier/gegevens/`, {
    method: methode,
    headers: { 'content-type': 'application/json', host: 'ib.example.nl', 'sec-fetch-site': 'same-origin', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function inloggen(userId: number) {
  gebruikers.set(userId, { id: userId, email: `u${userId}@example.nl`, passwordHash: 'x', totpSecret: '', totpEnabled: true, sessieGeneratie: 0, createdAt: new Date() })
  cookieStore.set(SESSIE_COOKIE, { value: await maakToken(userId, 'sessie'), opties: {} })
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

describe('schoonGegevens', () => {
  it('normaliseert adres en postcode', () => {
    expect(schoonGegevens({ adres: { straat: '  Voorbeeldstraat   12 ', postcode: '1234ab', plaats: 'Voorbeeldstad\n' }, samenlevingsvorm: 'samenwonend' })).toEqual({
      gegevens: { adres: ADRES, samenlevingsvorm: 'samenwonend' },
    })
    expect(normaliseerPostcode(' 1234 ab ')).toBe('1234 AB')
    for (const x of ['0123 AB', '123 AB', '1234 A', '1234-AB', 'AB 1234']) expect(normaliseerPostcode(x)).toBeNull()
  })

  it('leeg is leeg: geen adres, geen samenlevingsvorm', () => {
    expect(schoonGegevens({})).toEqual({ gegevens: {} })
    expect(schoonGegevens({ adres: { straat: ' ', postcode: '', plaats: '' } })).toEqual({ gegevens: {} })
    expect(schoonGegevens({ adres: null, samenlevingsvorm: null })).toEqual({ gegevens: {} })
  })

  it('alle samenlevingsvormen uit het model zijn geldig', () => {
    expect(SAMENLEVINGSVORMEN).toEqual(['gehuwd', 'geregistreerd-partner', 'samenwonend-met-contract', 'samenwonend', 'alleenstaand'])
    for (const v of SAMENLEVINGSVORMEN) expect(schoonGegevens({ samenlevingsvorm: v })).toEqual({ gegevens: { samenlevingsvorm: v } })
  })

  it('weigert een onvolledig adres, een buitenlandse postcode, onbekende velden en een BSN', () => {
    const fouten = (x: unknown) => {
      const r = schoonGegevens(x)
      return 'fouten' in r ? r.fouten : []
    }
    expect(fouten({ adres: { straat: 'Voorbeeldstraat 12', postcode: '', plaats: '' } })).toEqual(['adres.plaats: vul de woonplaats in', 'adres.postcode: vul de postcode in'])
    expect(fouten({ adres: { ...ADRES, postcode: '10115' } })).toEqual(['adres.postcode: vul een Nederlandse postcode in, zoals 1234 AB'])
    expect(fouten({ adres: { ...ADRES, straat: 'x'.repeat(101) } })).toEqual(['adres.straat: maximaal 100 tekens'])
    expect(fouten({ adres: { ...ADRES, plaats: 12 } })).toEqual(['adres.plaats: moet tekst zijn'])
    expect(fouten({ adres: { ...ADRES, straat: 'Straat\u0000 1' } })).toEqual(['adres.straat: bevat tekens die niet in een adres horen'])
    expect(fouten({ adres: { ...ADRES, huisnummer: '12' } })).toEqual(['adres.huisnummer: onbekend veld'])
    expect(fouten({ adres: 'Voorbeeldstraat 12' })).toEqual(['adres: moet een object zijn'])
    expect(fouten({ bsn: '123456782' })).toEqual(['bsn: onbekend veld'])
    expect(fouten({ samenlevingsvorm: 'verloofd' })[0]).toMatch(/^samenlevingsvorm: kies uit/)
    expect(fouten(null)).toEqual(['gegevens: moet een object zijn'])
    expect(fouten([ADRES])).toEqual(['gegevens: moet een object zijn'])
    // Foutmeldingen bevatten nooit de ingevulde waarden.
    expect(fouten({ adres: { ...ADRES, postcode: 'geheim-99' } }).join()).not.toContain('geheim')
  })

  it('gegevensUitOpslag neemt alleen de geldige, bekende delen', () => {
    expect(gegevensUitOpslag({})).toEqual({})
    expect(gegevensUitOpslag(null)).toEqual({})
    expect(gegevensUitOpslag({ adres: ADRES, samenlevingsvorm: 'gehuwd', bsn: '123456782' })).toEqual({ adres: ADRES, samenlevingsvorm: 'gehuwd' })
    expect(gegevensUitOpslag({ adres: { straat: 'x' }, samenlevingsvorm: 'gehuwd' })).toEqual({ samenlevingsvorm: 'gehuwd' })
  })
})

describe('route: controles vóór de opslag', () => {
  it('zonder sessie 401, van een andere site 403, zonder configuratie 503', async () => {
    expect((await route.GET()).status).toBe(401)
    expect((await route.PUT(verzoek('PUT', { gegevens: {} }))).status).toBe(401)
    await inloggen(1)
    expect((await route.PUT(verzoek('PUT', { gegevens: {} }, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect((await route.PUT(verzoek('PUT', { gegevens: {} }, { 'sec-fetch-site': 'same-site' }))).status).toBe(403)
    const zonderSiteHeader = { 'sec-fetch-site': '', origin: 'https://ander.example.nl' }
    const anders = new Request(`${BASIS}/api/dossier/gegevens/`, { method: 'PUT', headers: { host: 'ib.example.nl', ...zonderSiteHeader }, body: '{}' })
    expect((await route.PUT(anders)).status).toBe(403)
    delete process.env.DOSSIER_KEY
    expect((await route.GET()).status).toBe(503)
  })

  it('ongeldige of te grote body 400, ongeldige gegevens 422 met fouten per veld', async () => {
    await inloggen(1)
    expect((await route.PUT(verzoek('PUT', '{kapot'))).status).toBe(400)
    expect((await route.PUT(verzoek('PUT', '[]'))).status).toBe(400)
    expect((await route.PUT(verzoek('PUT', { gegevens: { adres: { ...ADRES, straat: 'x'.repeat(20_000) } } }))).status).toBe(400)
    const r = await route.PUT(verzoek('PUT', { gegevens: { adres: { ...ADRES, postcode: 'abc' }, bsn: '123456782' } }))
    expect(r.status).toBe(422)
    const data = await r.json()
    expect(data.fouten).toEqual(['bsn: onbekend veld', 'adres.postcode: vul een Nederlandse postcode in, zoals 1234 AB'])
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect((await route.PUT(verzoek('PUT', {}))).status).toBe(422)
  })
})

// ---------------------------------------------------------------------------
// Echte database
// ---------------------------------------------------------------------------

describe('gegevens op een echte database', () => {
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

  it('end-to-end: leeg bij een nieuw huishouden, opslaan, versleuteld in de database, weer ontsleutelen', async () => {
    const { userId, hh } = await gebruikerMetHuishouden('a@example.nl')
    await inloggen(userId)

    const leeg = await route.GET()
    expect(leeg.status).toBe(200)
    expect((await leeg.json()).gegevens).toEqual({})

    const put = await route.PUT(verzoek('PUT', { gegevens: { adres: { straat: 'Voorbeeldstraat 12', postcode: '1234ab', plaats: 'Voorbeeldstad' }, samenlevingsvorm: 'samenwonend-met-contract' } }))
    expect(put.status).toBe(200)
    const opgeslagen = await put.json()
    expect(opgeslagen).toEqual({ gegevens: { adres: ADRES, samenlevingsvorm: 'samenwonend-met-contract' }, updatedAt: expect.any(String) })

    const { getDb } = await import('@/lib/db')
    const { households } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const rij = getDb().select().from(households).where(eq(households.id, hh)).get()!
    expect(rij.gegevensEnc.startsWith('v2.')).toBe(true)
    for (const tekst of ['Voorbeeldstraat', '1234', 'Voorbeeldstad', 'samenwonend']) expect(rij.gegevensEnc).not.toContain(tekst)

    const terug = await route.GET()
    expect(await terug.json()).toEqual(opgeslagen)

    // Een PUT vervangt het geheel: zonder adres is het adres weg.
    const zonderAdres = await route.PUT(verzoek('PUT', { gegevens: { samenlevingsvorm: 'gehuwd' } }))
    expect((await zonderAdres.json()).gegevens).toEqual({ samenlevingsvorm: 'gehuwd' })
    expect((await (await route.GET()).json()).gegevens).toEqual({ samenlevingsvorm: 'gehuwd' })

    // Een ongeldige PUT laat de opgeslagen gegevens staan.
    expect((await route.PUT(verzoek('PUT', { gegevens: { samenlevingsvorm: 'verloofd' } }))).status).toBe(422)
    expect((await (await route.GET()).json()).gegevens).toEqual({ samenlevingsvorm: 'gehuwd' })
  })

  it('de ciphertext is gebonden aan het huishouden, en elk huishouden ziet alleen zijn eigen gegevens', async () => {
    const { bewaarGegevens, laadGegevens } = await import('../gegevens')
    const a = await gebruikerMetHuishouden('b@example.nl')
    const b = await gebruikerMetHuishouden('c@example.nl')
    await bewaarGegevens({ userId: a.userId, householdId: a.hh }, { adres: ADRES })
    expect((await laadGegevens({ userId: b.userId, householdId: b.hh }))?.gegevens).toEqual({})

    // Huishouden van een ander opvragen of overschrijven lukt niet.
    expect(await laadGegevens({ userId: b.userId, householdId: a.hh })).toBeNull()
    expect(await bewaarGegevens({ userId: b.userId, householdId: a.hh }, { samenlevingsvorm: 'alleenstaand' })).toBeNull()
    expect((await laadGegevens({ userId: a.userId, householdId: a.hh }))?.gegevens).toEqual({ adres: ADRES })

    // Ciphertext kopiëren naar het huishouden van B: ontsleutelen faalt, de route geeft een nette 500.
    const { getDb } = await import('@/lib/db')
    const { households } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const { OntsleutelFout } = await import('@/lib/crypto')
    const rijA = getDb().select().from(households).where(eq(households.id, a.hh)).get()!
    getDb().update(households).set({ gegevensEnc: rijA.gegevensEnc }).where(eq(households.id, b.hh)).run()
    await expect(laadGegevens({ userId: b.userId, householdId: b.hh })).rejects.toBeInstanceOf(OntsleutelFout)
    await inloggen(b.userId)
    const fout = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await route.GET()
    expect(res.status).toBe(500)
    const tekst = await res.text()
    expect(tekst).toMatch(/ontsleuteld/)
    expect(tekst).not.toContain('Voorbeeldstraat')
    // Alleen de naam van de fout in de log, geen inhoud.
    expect(fout.mock.calls.flat().join(' ')).not.toContain('Voorbeeldstraat')
    fout.mockRestore()
  })

  it('de gegevens staan in de export en verdwijnen met verwijder-alles', async () => {
    const { bewaarGegevens } = await import('../gegevens')
    const { exporteer, verwijderAlles } = await import('@/lib/dossier/opslag')
    const { userId, hh } = await gebruikerMetHuishouden('d@example.nl')
    await bewaarGegevens({ userId, householdId: hh }, { adres: ADRES, samenlevingsvorm: 'samenwonend' })
    const exp = await exporteer(userId)
    expect(exp.huishoudens[0].gegevens).toEqual({ adres: ADRES, samenlevingsvorm: 'samenwonend' })
    await verwijderAlles(userId, false)
    const { getDb } = await import('@/lib/db')
    const { households } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    expect(getDb().select().from(households).where(eq(households.userId, userId)).all()).toHaveLength(0)
  })
})
