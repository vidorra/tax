/**
 * Opslag en API-routes van de Moneybird-koppelingen.
 *
 * - Altijd: pure onderdelen (id's, token, label, bron in het dossier) en de route-controles die vóór de
 *   opslag gebeuren (sessie, herkomst, validatie).
 * - Met IB_TEST_DATABASE_URL (wegwerpcluster, zie lib/dossier/__tests__/db.integratie.spec.ts): de
 *   opslag op een echte Postgres in een eigen schema, en een end-to-end-test van alle routes met een
 *   nagebootste Moneybird.
 */
import { randomBytes } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEP_ADM, NEP_TOKEN, nepMoneybird } from './fixtures/nep'

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
const { zetMoneybirdFetch } = await import('../client')
const opslag = await import('../opslag')
const { valideerInvoer } = await import('@/lib/dossier/valideer')
const routes = {
  lijst: await import('@/app/api/dossier/koppelingen/route'),
  een: await import('@/app/api/dossier/koppelingen/[id]/route'),
  administraties: await import('@/app/api/dossier/koppelingen/[id]/administraties/route'),
  importeer: await import('@/app/api/dossier/koppelingen/[id]/import/route'),
  indeling: await import('@/app/api/dossier/koppelingen/[id]/indeling/route'),
}

const BASIS = 'https://ib.example.nl'
const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'

function verzoek(methode: string, pad: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASIS}${pad}`, {
    method: methode,
    headers: { 'content-type': 'application/json', host: 'ib.example.nl', 'sec-fetch-site': 'same-origin', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

async function inloggen(userId: number) {
  gebruikers.set(userId, { id: userId, email: `u${userId}@example.nl`, passwordHash: 'x', totpSecret: '', totpEnabled: true, sessieGeneratie: 0, createdAt: new Date() })
  cookieStore.set(SESSIE_COOKIE, { value: await maakToken(userId, 'sessie'), opties: {} })
}

let envKopie: NodeJS.ProcessEnv
beforeEach(() => {
  envKopie = { ...process.env }
  process.env.AUTH_SECRET = SECRET
  if (!h.echt) {
    process.env.DATABASE_URL = 'postgres://niet-gebruikt'
    process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
  }
  delete process.env.MONEYBIRD_TOKEN
  delete process.env.MONEYBIRD_ADMINISTRATION_ID
  cookieStore.clear()
  gebruikers.clear()
  const g = globalThis as Record<string, unknown>
  delete g.__ibMbImportLimiter
  delete g.__ibMbToevoegLimiter
})
afterEach(() => {
  process.env = envKopie
  zetMoneybirdFetch(null)
})

describe('pure onderdelen', () => {
  it('id uit het pad', () => {
    expect(opslag.koppelingIdUitPad('env')).toBe('env')
    expect(opslag.koppelingIdUitPad('12')).toBe(12)
    for (const x of ['0', '-1', '1.5', 'abc', '1234567890', '']) expect(opslag.koppelingIdUitPad(x)).toBeNull()
  })
  it('token en label', () => {
    expect(opslag.schoonToken(`  ${NEP_TOKEN} `)).toBe(NEP_TOKEN)
    for (const x of ['kort', 'met spatie in het token', 'x'.repeat(201), 12, null, 'token"<script>']) expect(opslag.schoonToken(x)).toBeNull()
    expect(opslag.schoonLabel(' Studio\n ')).toBe('Studio')
    expect(opslag.schoonLabel('')).toBeNull()
    expect(opslag.schoonLabel('x'.repeat(81))).toBeNull()
  })
  it('koppeling uit de omgeving alleen met token en een geldig administratienummer', () => {
    expect(opslag.envKoppeling({ MONEYBIRD_TOKEN: NEP_TOKEN, MONEYBIRD_ADMINISTRATION_ID: NEP_ADM })).toEqual({ token: NEP_TOKEN, administratieId: NEP_ADM })
    expect(opslag.envKoppeling({ MONEYBIRD_TOKEN: NEP_TOKEN })).toBeNull()
    expect(opslag.envKoppeling({ MONEYBIRD_TOKEN: NEP_TOKEN, MONEYBIRD_ADMINISTRATION_ID: 'abc' })).toBeNull()
  })
})

describe('dossiervalidatie van OndernemingInvoer.bron', () => {
  const invoer = (bron: unknown) => ({
    jaar: 2025,
    fiscaalPartner: false,
    kinderen: [],
    personen: [{ id: 'A', geboortedatum: '1988-01-01', ondernemingen: [{ naam: 'X', startjaar: 2020, winstberekening: { soort: 'saldo', saldo: 1 }, uren: { onderneming: 0 }, bron }], loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 } }],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  })
  const goed = { soort: 'moneybird', koppelingId: '7', administratieId: NEP_ADM, administratieNaam: 'Studio', jaar: 2025, geimporteerdOp: '2026-02-01T10:00:00.000Z' }
  it('accepteert een geldige bron en geen bron', () => {
    expect(valideerInvoer(invoer(goed))).toEqual([])
    expect(valideerInvoer(invoer({ ...goed, koppelingId: 'env', administratieNaam: undefined }))).toEqual([])
    expect(valideerInvoer(invoer(undefined))).toEqual([])
  })
  it('weigert een afwijkende vorm', () => {
    expect(valideerInvoer(invoer('moneybird'))[0]).toMatch(/bron: moet een object zijn/)
    expect(valideerInvoer(invoer({ ...goed, soort: 'exact' })).join()).toMatch(/bron\.soort/)
    expect(valideerInvoer(invoer({ ...goed, koppelingId: 7 })).join()).toMatch(/bron\.koppelingId/)
    expect(valideerInvoer(invoer({ ...goed, administratieId: '../1' })).join()).toMatch(/bron\.administratieId/)
    expect(valideerInvoer(invoer({ ...goed, jaar: '2025' })).join()).toMatch(/bron\.jaar/)
    expect(valideerInvoer(invoer({ ...goed, geimporteerdOp: 'gisteren' })).join()).toMatch(/bron\.geimporteerdOp/)
    expect(valideerInvoer(invoer({ ...goed, token: NEP_TOKEN })).join()).toMatch(/bron\.token: onbekend veld/)
  })
})

describe('routes: controles vóór de opslag', () => {
  it('zonder sessie 401, van een andere site 403', async () => {
    expect((await routes.lijst.GET()).status).toBe(401)
    await inloggen(1)
    const anders = await routes.lijst.POST(verzoek('POST', '/api/dossier/koppelingen', { token: NEP_TOKEN }, { 'sec-fetch-site': 'cross-site' }))
    expect(anders.status).toBe(403)
    const del = await routes.een.DELETE(verzoek('DELETE', '/api/dossier/koppelingen/1', undefined, { 'sec-fetch-site': 'same-site' }), params('1'))
    expect(del.status).toBe(403)
  })

  it('valideert body en id zonder Moneybird te vragen', async () => {
    await inloggen(1)
    const nep = nepMoneybird()
    zetMoneybirdFetch(nep.fetch)
    expect((await routes.lijst.POST(verzoek('POST', '/x', { token: 'kort' }))).status).toBe(422)
    expect((await routes.lijst.POST(verzoek('POST', '/x', { token: NEP_TOKEN, label: 'x'.repeat(100) }))).status).toBe(422)
    const groot = await routes.lijst.POST(verzoek('POST', '/x', { token: NEP_TOKEN, label: 'x'.repeat(3000) }))
    expect(groot.status).toBe(400)
    expect((await routes.een.PATCH(verzoek('PATCH', '/x', { administratieId: '../1' }), params('3'))).status).toBe(422)
    expect((await routes.een.PATCH(verzoek('PATCH', '/x', { administratieId: NEP_ADM }), params('abc'))).status).toBe(404)
    expect((await routes.indeling.PUT(verzoek('PUT', '/x', { indeling: { '1': 'iets' } }), params('3'))).status).toBe(422)
    expect((await routes.importeer.POST(verzoek('POST', '/x', { jaar: 1999 }), params('3'))).status).toBe(422)
    expect((await routes.administraties.GET(verzoek('GET', '/x'), params('-1'))).status).toBe(404)
    expect(nep.verzoeken).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Echte database
// ---------------------------------------------------------------------------

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const SCHEMA = `ib_mb_${Date.now()}_${randomBytes(3).toString('hex')}`

describe.skipIf(!BASIS_URL)('koppelingen op een echte database', () => {
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
    const { migreer } = await import('@/scripts/migrate')
    expect(await migreer(url, undefined, () => undefined)).toBe(readdirSync('migrations').filter((f) => f.endsWith('.sql')).length)
    expect(await migreer(url, undefined, () => undefined)).toBe(0)
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
    dbEnv()
    const { getDb } = await import('@/lib/db')
    const { users } = await import('@/lib/db/schema')
    const { huishoudenVan } = await import('@/lib/dossier/opslag')
    const [u] = await getDb().insert(users).values({ email, passwordHash: 'x', totpEnabled: true }).returning()
    return { userId: u.id, hh: await huishoudenVan(u.id) }
  }

  it('bewaart het token versleuteld, gebonden aan huishouden en rij', async () => {
    const { getDb } = await import('@/lib/db')
    const { koppelingen } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const { OntsleutelFout } = await import('@/lib/crypto')
    zetMoneybirdFetch(nepMoneybird().fetch)
    const a = await gebruikerMetHuishouden('a@example.nl')
    const b = await gebruikerMetHuishouden('b@example.nl')

    const { koppeling, administraties } = await opslag.maakKoppeling(a.hh, { token: NEP_TOKEN, label: 'Studio' })
    expect(administraties).toHaveLength(2)
    expect(koppeling).toMatchObject({ label: 'Studio', bron: 'dossier', tokenMasker: '••••••abcd', administratieId: null })
    const [rij] = await getDb().select().from(koppelingen).where(eq(koppelingen.id, Number(koppeling.id)))
    expect(rij.tokenEnc.startsWith('v2.')).toBe(true)
    expect(rij.tokenEnc).not.toContain(NEP_TOKEN)
    expect((await opslag.laadKoppeling(a.hh, Number(koppeling.id)))?.token).toBe(NEP_TOKEN)

    // Ciphertext kopiëren naar een rij van een ander huishouden werkt niet.
    const { koppeling: kb } = await opslag.maakKoppeling(b.hh, { token: NEP_TOKEN, label: 'B' })
    await getDb().update(koppelingen).set({ tokenEnc: rij.tokenEnc }).where(eq(koppelingen.id, Number(kb.id)))
    await expect(opslag.laadKoppeling(b.hh, Number(kb.id))).rejects.toBeInstanceOf(OntsleutelFout)
    expect((await opslag.lijstKoppelingen(b.hh))[0].tokenMasker).toBe('••••••')

    // Geen toegang tot de koppeling van een ander huishouden.
    expect(await opslag.laadKoppeling(b.hh, Number(koppeling.id))).toBeNull()
    expect(await opslag.verwijderKoppeling(b.hh, Number(koppeling.id))).toBe(false)
    expect(await opslag.bewaarIndeling(b.hh, Number(koppeling.id), { '1': 'kosten' })).toBeNull()

    // Administratie kiezen: alleen een van het token.
    await expect(opslag.kiesAdministratie(a.hh, Number(koppeling.id), '999', undefined)).rejects.toMatchObject({ status: 422 })
    const gekozen = await opslag.kiesAdministratie(a.hh, Number(koppeling.id), NEP_ADM, 'Mijn studio')
    expect(gekozen).toMatchObject({ administratieId: NEP_ADM, administratieNaam: 'Studio Voorbeeld', label: 'Mijn studio' })

    // Indeling versleuteld bewaren en terugladen.
    await opslag.bewaarIndeling(a.hh, Number(koppeling.id), { '603': 'negeren' })
    expect(await opslag.laadIndeling(a.hh, Number(koppeling.id))).toEqual({ '603': 'negeren' })
    const [na] = await getDb().select().from(koppelingen).where(eq(koppelingen.id, Number(koppeling.id)))
    expect(na.indelingEnc?.startsWith('v2.')).toBe(true)
    expect(na.indelingEnc).not.toContain('negeren')
  })

  it('maximaal tien koppelingen, ook bij gelijktijdige verzoeken', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    const { hh } = await gebruikerMetHuishouden('max@example.nl')
    for (let i = 0; i < 8; i++) await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: `K${i}` })
    const r = await Promise.allSettled([1, 2, 3].map((i) => opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: `P${i}` })))
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(2)
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    expect((await opslag.lijstKoppelingen(hh)).length).toBe(10)
  })

  it('koppeling uit de omgeving: niet te verwijderen, indeling in een eigen rij, mee in export, weg met verwijder-alles', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    process.env.MONEYBIRD_TOKEN = NEP_TOKEN
    process.env.MONEYBIRD_ADMINISTRATION_ID = NEP_ADM
    const { userId, hh } = await gebruikerMetHuishouden('env@example.nl')
    await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Eigen' })
    const lijst = await opslag.lijstKoppelingen(hh)
    expect(lijst.map((k) => [k.id, k.bron])).toEqual([['env', 'env'], [expect.any(String), 'dossier']])
    expect(lijst[0]).toMatchObject({ administratieId: NEP_ADM, tokenMasker: '••••••abcd' })
    await expect(opslag.verwijderKoppeling(hh, 'env')).rejects.toMatchObject({ status: 409 })
    await expect(opslag.kiesAdministratie(hh, 'env', '100000000000000002', undefined)).rejects.toMatchObject({ status: 409 })
    expect(await opslag.laadIndeling(hh, 'env')).toEqual({})
    await opslag.bewaarIndeling(hh, 'env', { '606': 'kosten' })
    expect(await opslag.laadIndeling(hh, 'env')).toEqual({ '606': 'kosten' })
    await opslag.raakAan(hh, 'env', 'Studio Voorbeeld')
    expect((await opslag.lijstKoppelingen(hh)).length).toBe(2)
    expect((await opslag.lijstKoppelingen(hh))[0].administratieNaam).toBe('Studio Voorbeeld')

    const { exporteer, verwijderAlles } = await import('@/lib/dossier/opslag')
    const exp = await exporteer(userId)
    const tekst = JSON.stringify(exp)
    expect(tekst).not.toContain(NEP_TOKEN)
    expect(tekst).not.toContain('abcd')
    const uitExport = exp.huishoudens[0].koppelingen
    expect(uitExport.map((k) => k.id).sort()).toEqual([expect.stringMatching(/^\d+$/), 'env'])
    expect(uitExport.find((k) => k.id === 'env')).toMatchObject({ soort: 'moneybird-env', indeling: { '606': 'kosten' }, administratieNaam: 'Studio Voorbeeld' })
    expect(uitExport.find((k) => k.id !== 'env')).toMatchObject({ soort: 'moneybird', label: 'Eigen', indeling: {} })
    for (const k of uitExport) expect(Object.keys(k)).not.toContain('token')

    const { getDb } = await import('@/lib/db')
    const { koppelingen } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    await verwijderAlles(userId, false)
    expect(await getDb().select().from(koppelingen).where(eq(koppelingen.householdId, hh))).toHaveLength(0)
  })

  it('end-to-end via de routes: toevoegen, administratie kiezen, importeren, indeling bewaren, verwijderen', async () => {
    const nep = nepMoneybird()
    zetMoneybirdFetch(nep.fetch)
    const { userId } = await gebruikerMetHuishouden('e2e@example.nl')
    await inloggen(userId)
    const teksten: string[] = []
    const lees = async (res: Response) => {
      const t = await res.text()
      teksten.push(t)
      return { status: res.status, data: JSON.parse(t) }
    }

    // Een verkeerd token: 502 met de uitleg van Moneybird.
    const fout = await lees(await routes.lijst.POST(verzoek('POST', '/x', { token: 'verkeerd-token-1234567890', label: 'Fout' })))
    expect(fout.status).toBe(502)
    expect(fout.data.fout).toMatch(/ongeldig of ingetrokken/)

    const toegevoegd = await lees(await routes.lijst.POST(verzoek('POST', '/x', { token: NEP_TOKEN, label: 'Studio' })))
    expect(toegevoegd.status).toBe(201)
    expect(toegevoegd.data.administraties).toHaveLength(2)
    const id: string = toegevoegd.data.koppeling.id

    // Importeren zonder gekozen administratie kan niet.
    expect((await routes.importeer.POST(verzoek('POST', '/x', { jaar: 2025 }), params(id))).status).toBe(409)

    const adms = await lees(await routes.administraties.GET(verzoek('GET', '/x'), params(id)))
    expect(adms.data.administraties.map((a: { id: string }) => a.id)).toEqual([NEP_ADM, '100000000000000002'])
    expect((await routes.een.PATCH(verzoek('PATCH', '/x', { administratieId: '123' }), params(id))).status).toBe(422)
    const gepatcht = await lees(await routes.een.PATCH(verzoek('PATCH', '/x', { administratieId: NEP_ADM }), params(id)))
    expect(gepatcht.data.koppeling).toMatchObject({ id, administratieId: NEP_ADM, administratieNaam: 'Studio Voorbeeld' })

    const imp1 = await lees(await routes.importeer.POST(verzoek('POST', '/x', { jaar: 2025 }), params(id)))
    expect(imp1.status).toBe(200)
    expect(imp1.data.import.totalen).toMatchObject({ omzet: 105000, nettoWinstMoneybird: 94679, verschil: 0 })
    expect(imp1.data.import.koppelingId).toBe(id)

    const ind = await lees(await routes.indeling.PUT(verzoek('PUT', '/x', { indeling: { '603': 'kosten' } }), params(id)))
    expect(ind.data.indeling).toEqual({ '603': 'kosten' })
    const imp2 = await lees(await routes.importeer.POST(verzoek('POST', '/x', { jaar: '2025' }), params(id)))
    expect(imp2.data.import.regels.find((r: { ledgerAccountId: string }) => r.ledgerAccountId === '603')).toMatchObject({ categorie: 'kosten', aangepast: true })

    const lijst = await lees(await routes.lijst.GET())
    expect(lijst.data.koppelingen[0].laatstGebruikt).toEqual(expect.any(String))

    // Moneybird-fout tijdens de import: 502.
    zetMoneybirdFetch(nepMoneybird({ weiger: { 'profit_loss': 500 } }).fetch)
    const kapot = await lees(await routes.importeer.POST(verzoek('POST', '/x', { jaar: 2025 }), params(id)))
    expect(kapot.status).toBe(502)
    expect(kapot.data.fout).toMatch(/niet bereikbaar/)
    zetMoneybirdFetch(nep.fetch)

    // Eigen limiet: tien imports per vijf minuten per huishouden.
    const statussen: number[] = []
    for (let i = 0; i < 8; i++) statussen.push((await routes.importeer.POST(verzoek('POST', '/x', { jaar: 2025 }), params(id))).status)
    expect(statussen.slice(0, 7).every((s) => s === 200)).toBe(true)
    expect(statussen[7]).toBe(429)

    expect((await lees(await routes.een.DELETE(verzoek('DELETE', '/x'), params(id)))).data).toEqual({ ok: true })
    expect((await routes.een.DELETE(verzoek('DELETE', '/x'), params(id))).status).toBe(404)
    expect((await lees(await routes.lijst.GET())).data.koppelingen).toEqual([])

    // Het token komt in geen enkele response voor.
    for (const t of teksten) expect(t).not.toContain(NEP_TOKEN)
  })
})
