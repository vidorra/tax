/**
 * Opslag en API-routes van de Moneybird-koppelingen.
 *
 * - Pure onderdelen (id's, token, label, bron in het dossier) en de route-controles die vóór de opslag
 *   gebeuren (sessie, herkomst, validatie).
 * - De opslag op een echt SQLite-bestand (per test een eigen, gemigreerd bestand via gebruikTijdelijkeDb):
 *   versleuteling, het maximum en de indeling bij gelijktijdige verzoeken, de omgevingskoppeling, en een
 *   end-to-end-test van alle routes met een nagebootste Moneybird.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { and, count, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb, getSqlite, openSqlite } from '@/lib/db'
import { households, koppelingen, users } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
import { OntsleutelFout, versleutel } from '@/lib/crypto'
import { NEP_ADM, NEP_TOKEN, nepMoneybird } from './fixtures/nep'

/** echt: de echte huishoudenVan (voor de samenwerking met het dossier); anders het huishouden uit `huishoudens`. */
const h = vi.hoisted(() => ({ echt: false, huishoudens: new Map<number, number>() }))

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
  return { ...echt, huishoudenVan: (userId: number) => (h.echt ? echt.huishoudenVan(userId) : Promise.resolve(h.huishoudens.get(userId) ?? userId * 10)) }
})

const { maakToken, SESSIE_COOKIE } = await import('@/lib/auth/sessie')
const { zetMoneybirdFetch } = await import('../client')
const { MAX_INDELING_REGELS } = await import('../indeling')
const opslag = await import('../opslag')
const { aad } = await import('@/lib/dossier/opslag')
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
  process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
  delete process.env.MONEYBIRD_TOKEN
  delete process.env.MONEYBIRD_ADMINISTRATION_ID
  cookieStore.clear()
  gebruikers.clear()
  h.echt = false
  h.huishoudens.clear()
  const g = globalThis as Record<string, unknown>
  delete g.__ibMbImportLimiter
  delete g.__ibMbToevoegLimiter
})
afterEach(() => {
  process.env = envKopie
  zetMoneybirdFetch(null)
})

// Elke test een eigen, gemigreerd databasebestand; DATABASE_PATH wijst ernaar, dus configStatus is ook in
// de routetests zonder opslag in orde.
const testDb = gebruikTijdelijkeDb()

describe('pure onderdelen', () => {
  it('id uit het pad', () => {
    expect(opslag.koppelingIdUitPad('12')).toBe(12)
    for (const x of ['env', '0', '-1', '1.5', 'abc', '1234567890', '']) expect(opslag.koppelingIdUitPad(x)).toBeNull()
  })
  it('token en label', () => {
    expect(opslag.schoonToken(`  ${NEP_TOKEN} `)).toBe(NEP_TOKEN)
    for (const x of ['kort', 'met spatie in het token', 'x'.repeat(201), 12, null, 'token"<script>']) expect(opslag.schoonToken(x)).toBeNull()
    expect(opslag.schoonLabel(' Studio\n ')).toBe('Studio')
    expect(opslag.schoonLabel('')).toBeNull()
    expect(opslag.schoonLabel('x'.repeat(81))).toBeNull()
  })
  it('persoon: A, B of leeg; de rest is ongeldig', () => {
    expect(opslag.schoonPersoon('A')).toBe('A')
    expect(opslag.schoonPersoon('B')).toBe('B')
    expect(opslag.schoonPersoon(null)).toBeNull()
    expect(opslag.schoonPersoon('')).toBeNull()
    for (const x of ['C', 'a', 1, {}]) expect(opslag.schoonPersoon(x)).toBeUndefined()
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
// Opslag in een SQLite-bestand
// ---------------------------------------------------------------------------

/** Gebruiker met een eigen huishouden, rechtstreeks in de database (de mock van huishoudenVan vindt het terug). */
function gebruikerMetHuishouden(email: string): { userId: number; hh: number } {
  const db = getDb()
  const u = db.insert(users).values({ email, passwordHash: 'x', totpEnabled: true }).returning().get()
  const hh = db.insert(households).values({ userId: u.id, gegevensEnc: versleutel({}, aad.huishouden(u.id)) }).returning().get()
  h.huishoudens.set(u.id, hh.id)
  return { userId: u.id, hh: hh.id }
}

const rijVan = (id: string | number) => getDb().select().from(koppelingen).where(eq(koppelingen.id, Number(id))).get()
const aantalRijen = (hh: number, soort?: string) =>
  getDb()
    .select({ n: count() })
    .from(koppelingen)
    .where(soort ? and(eq(koppelingen.householdId, hh), eq(koppelingen.soort, soort)) : eq(koppelingen.householdId, hh))
    .get()!.n

/** Alle bytes van de database op schijf (bestand en WAL). */
function bytesOpSchijf(): Buffer {
  const delen = [testDb.pad, `${testDb.pad}-wal`].filter((p) => existsSync(p)).map((p) => readFileSync(p))
  return Buffer.concat(delen)
}

/** Fetch die bij de eerste vraag naar de administraties eerst `tussendoor` uitvoert (een ander verzoek of proces). */
function metTussendoor(tussendoor: () => void) {
  const nep = nepMoneybird()
  let gedaan = false
  zetMoneybirdFetch(async (input, init) => {
    if (!gedaan && String(input).includes('/administrations.json')) {
      gedaan = true
      tussendoor()
    }
    return nep.fetch(input, init)
  })
}

describe('koppelingen in de database', () => {
  it('bewaart het token versleuteld, gebonden aan huishouden en rij', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    const a = gebruikerMetHuishouden('a@example.nl')
    const b = gebruikerMetHuishouden('b@example.nl')

    const { koppeling, administraties } = await opslag.maakKoppeling(a.hh, { token: NEP_TOKEN, label: 'Studio' })
    expect(administraties).toHaveLength(2)
    expect(koppeling).toMatchObject({ label: 'Studio', bron: 'dossier', tokenMasker: '••••••abcd', administratieId: null, laatstGebruikt: null })
    expect(new Date(koppeling.aangemaakt!).toISOString()).toBe(koppeling.aangemaakt)
    const rij = rijVan(koppeling.id)!
    expect(rij.tokenEnc.startsWith('v2.')).toBe(true)
    expect(rij.tokenEnc).not.toContain(NEP_TOKEN)
    expect((await opslag.laadKoppeling(a.hh, Number(koppeling.id)))?.token).toBe(NEP_TOKEN)
    // Het token staat nergens leesbaar in het bestand, ook niet tijdelijk in de WAL.
    expect(bytesOpSchijf().includes(NEP_TOKEN)).toBe(false)

    // Ciphertext kopiëren naar een rij van een ander huishouden werkt niet.
    const { koppeling: kb } = await opslag.maakKoppeling(b.hh, { token: NEP_TOKEN, label: 'B' })
    getDb().update(koppelingen).set({ tokenEnc: rij.tokenEnc }).where(eq(koppelingen.id, Number(kb.id))).run()
    await expect(opslag.laadKoppeling(b.hh, Number(kb.id))).rejects.toBeInstanceOf(OntsleutelFout)
    expect((await opslag.lijstKoppelingen(b.hh))[0].tokenMasker).toBe('••••••')

    // Geen toegang tot de koppeling van een ander huishouden.
    expect(await opslag.laadKoppeling(b.hh, Number(koppeling.id))).toBeNull()
    expect(await opslag.laadIndeling(b.hh, Number(koppeling.id))).toBeNull()
    expect(await opslag.kiesAdministratie(b.hh, Number(koppeling.id), NEP_ADM, undefined)).toBeNull()
    expect(await opslag.verwijderKoppeling(b.hh, Number(koppeling.id))).toBe(false)
    expect(await opslag.bewaarIndeling(b.hh, Number(koppeling.id), { '1': 'kosten' })).toBeNull()
    await opslag.raakAan(b.hh, Number(koppeling.id))
    expect(rijVan(koppeling.id)?.laatstGebruikt).toBeNull()

    // Administratie kiezen: alleen een van het token.
    await expect(opslag.kiesAdministratie(a.hh, Number(koppeling.id), '999', undefined)).rejects.toMatchObject({ status: 422 })
    const gekozen = await opslag.kiesAdministratie(a.hh, Number(koppeling.id), NEP_ADM, 'Mijn studio')
    expect(gekozen).toMatchObject({ administratieId: NEP_ADM, administratieNaam: 'Studio Voorbeeld', label: 'Mijn studio' })

    // Indeling versleuteld bewaren en terugladen; een wijziging voegt samen, null wist.
    await opslag.bewaarIndeling(a.hh, Number(koppeling.id), { '603': 'negeren', '604': 'kosten' })
    expect(await opslag.bewaarIndeling(a.hh, Number(koppeling.id), { '604': null, '605': 'omzet' })).toEqual({ '603': 'negeren', '605': 'omzet' })
    expect(await opslag.laadIndeling(a.hh, Number(koppeling.id))).toEqual({ '603': 'negeren', '605': 'omzet' })
    const na = rijVan(koppeling.id)!
    expect(na.indelingEnc?.startsWith('v2.')).toBe(true)
    expect(na.indelingEnc).not.toContain('negeren')

    // laatst_gebruikt als ISO-tekst in UTC in het bestand, als Date in de code.
    await opslag.raakAan(a.hh, Number(koppeling.id))
    const ruw = getSqlite().prepare('SELECT laatst_gebruikt AS t FROM koppelingen WHERE id = ?').get(Number(koppeling.id)) as { t: string }
    expect(ruw.t).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
    expect(rijVan(koppeling.id)?.laatstGebruikt).toBeInstanceOf(Date)
  })

  it('verwijderen haalt het versleutelde token ook uit het bestand', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    const { hh } = gebruikerMetHuishouden('weg@example.nl')
    const { koppeling } = await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Weg' })
    const tokenEnc = rijVan(koppeling.id)!.tokenEnc
    getSqlite().pragma('wal_checkpoint(TRUNCATE)')
    expect(bytesOpSchijf().includes(tokenEnc)).toBe(true)
    expect(await opslag.verwijderKoppeling(hh, Number(koppeling.id))).toBe(true)
    expect(await opslag.verwijderKoppeling(hh, Number(koppeling.id))).toBe(false)
    getSqlite().pragma('wal_checkpoint(TRUNCATE)')
    expect(bytesOpSchijf().includes(tokenEnc)).toBe(false)
  })

  it('maximaal tien koppelingen, ook bij gelijktijdige verzoeken', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    const { hh } = gebruikerMetHuishouden('max@example.nl')
    for (let i = 0; i < 8; i++) await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: `K${i}` })
    const r = await Promise.allSettled([1, 2, 3].map((i) => opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: `P${i}` })))
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(2)
    const afgewezen = r.find((x) => x.status === 'rejected') as PromiseRejectedResult
    expect(afgewezen.reason).toBeInstanceOf(opslag.KoppelingFout)
    expect(afgewezen.reason).toMatchObject({ status: 409 })
    expect((await opslag.lijstKoppelingen(hh)).length).toBe(10)
    // De afgewezen poging is volledig teruggedraaid: geen rij met de tijdelijke waarde.
    expect(aantalRijen(hh)).toBe(10)
    expect(getSqlite().prepare("SELECT count(*) AS n FROM koppelingen WHERE token_enc = 'tijdelijk'").get()).toEqual({ n: 0 })
  })

  it('telt koppelingen mee die een ander proces tijdens de controle bij Moneybird toevoegt', async () => {
    const { hh } = gebruikerMetHuishouden('ander@example.nl')
    metTussendoor(() => {
      // Een tweede verbinding op hetzelfde bestand, zoals een ander proces: tien koppelingen in één transactie.
      const ander = openSqlite(testDb.pad)
      try {
        const zet = ander.prepare("INSERT INTO koppelingen (household_id, soort, label, token_enc) VALUES (?, 'moneybird', ?, 'x')")
        ander.transaction(() => {
          for (let i = 0; i < 10; i++) zet.run(hh, `Ander ${i}`)
        }).immediate()
      } finally {
        ander.close()
      }
    })
    await expect(opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Te laat' })).rejects.toMatchObject({ status: 409 })
    expect(aantalRijen(hh)).toBe(10)
  })

  it('administratie kiezen op een koppeling die tijdens de vraag aan Moneybird verdwijnt, geeft null', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    const { hh } = gebruikerMetHuishouden('verdwijnt@example.nl')
    const { koppeling } = await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Eerste' })
    const id = Number(koppeling.id)
    metTussendoor(() => {
      getDb().delete(koppelingen).where(eq(koppelingen.id, id)).run()
    })
    expect(await opslag.kiesAdministratie(hh, id, NEP_ADM, 'Nieuw')).toBeNull()
    // AUTOINCREMENT: een nieuwe koppeling krijgt nooit het id van de verwijderde.
    zetMoneybirdFetch(nepMoneybird().fetch)
    const { koppeling: tweede } = await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Tweede' })
    expect(Number(tweede.id)).toBeGreaterThan(id)
  })

  it('gelijktijdige wijzigingen van de indeling gaan allebei mee', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    const { hh } = gebruikerMetHuishouden('indeling@example.nl')
    const { koppeling } = await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Studio' })
    const id = Number(koppeling.id)
    await Promise.all([
      opslag.bewaarIndeling(hh, id, { '601': 'kosten' }),
      opslag.bewaarIndeling(hh, id, { '602': 'omzet' }),
      opslag.bewaarIndeling(hh, id, { '603': 'negeren' }),
    ])
    expect(await opslag.laadIndeling(hh, id)).toEqual({ '601': 'kosten', '602': 'omzet', '603': 'negeren' })
  })

  it('te grote indeling: 422 en niets bewaard', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    process.env.MONEYBIRD_TOKEN = NEP_TOKEN
    process.env.MONEYBIRD_ADMINISTRATION_ID = NEP_ADM
    const { hh } = gebruikerMetHuishouden('groot@example.nl')
    const { koppeling } = await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Studio' })
    const id = Number(koppeling.id)
    await opslag.bewaarIndeling(hh, id, { '1': 'kosten' })
    const teVeel = Object.fromEntries(Array.from({ length: MAX_INDELING_REGELS + 1 }, (_, i) => [String(1000 + i), 'kosten' as const]))
    await expect(opslag.bewaarIndeling(hh, id, teVeel)).rejects.toMatchObject({ status: 422 })
    expect(await opslag.laadIndeling(hh, id)).toEqual({ '1': 'kosten' })
  })

  it('van wie: bij toevoegen en later te wijzigen, mee in de lijst en de export', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    const { hh } = gebruikerMetHuishouden('partner@example.nl')
    const { koppeling: eigen } = await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Eigen', persoon: 'A' })
    const { koppeling: partner } = await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Partner' })
    expect(eigen.persoon).toBe('A')
    expect(partner.persoon).toBeNull()
    expect(await opslag.wijzigKoppeling(hh, Number(partner.id), { persoon: 'B' })).toMatchObject({ persoon: 'B', label: 'Partner' })
    expect(await opslag.wijzigKoppeling(hh, Number(partner.id), { label: 'Studio partner' })).toMatchObject({ persoon: 'B', label: 'Studio partner' })
    expect((await opslag.lijstKoppelingen(hh)).map((k) => k.persoon)).toEqual(['A', 'B'])
    expect(opslag.exporteerKoppelingen(hh).map((k) => k.persoon)).toEqual(['A', 'B'])
    // Een koppeling van een ander huishouden is niet te wijzigen.
    const { hh: ander } = gebruikerMetHuishouden('ander@example.nl')
    expect(await opslag.wijzigKoppeling(ander, Number(partner.id), { persoon: 'A' })).toBeNull()
  })

  it('token uit de serverinstellingen: alleen naar het huishouden met de oude omgevingsrij, één keer', async () => {
    const { zetOmgevingskoppelingOver } = await import('../omgeving-overzetten')
    const { aadKoppeling } = opslag
    expect(await zetOmgevingskoppelingOver({})).toBe('geen-variabelen')
    const env = { MONEYBIRD_TOKEN: NEP_TOKEN, MONEYBIRD_ADMINISTRATION_ID: NEP_ADM }
    // Een (latere) beheerder met het laagste id krijgt niets: alleen de oude omgevingsrij wijst het huishouden aan.
    const { userId: beheerderId, hh: beheerderHh } = gebruikerMetHuishouden('beheer@example.nl')
    getDb().update(users).set({ rol: 'beheerder' }).where(eq(users.id, beheerderId)).run()
    expect(await zetOmgevingskoppelingOver(env)).toBe('geen-oude-koppeling')
    expect(aantalRijen(beheerderHh)).toBe(0)

    const { hh } = gebruikerMetHuishouden('eigenaar@example.nl')
    const oud = getDb().insert(koppelingen).values({ householdId: hh, soort: 'moneybird-env', label: 'Moneybird (server)', tokenEnc: '', administratieNaam: 'Studio Voorbeeld' }).returning().get()
    getDb().update(koppelingen).set({ indelingEnc: versleutel({ '606': 'kosten' }, aadKoppeling.indeling(hh, oud.id)) }).where(eq(koppelingen.id, oud.id)).run()

    expect(await zetOmgevingskoppelingOver(env)).toBe('overgezet')
    expect(aantalRijen(beheerderHh)).toBe(0)
    const lijst = await opslag.lijstKoppelingen(hh)
    expect(lijst).toHaveLength(1)
    expect(lijst[0]).toMatchObject({ persoon: 'A', administratieId: NEP_ADM, administratieNaam: 'Studio Voorbeeld', tokenMasker: '••••••abcd', bron: 'dossier' })
    const id = Number(lijst[0].id)
    expect(await opslag.laadKoppeling(hh, id)).toMatchObject({ token: NEP_TOKEN })
    expect(await opslag.laadIndeling(hh, id)).toEqual({ '606': 'kosten' })
    expect(aantalRijen(hh, 'moneybird-env')).toBe(0)
    expect(JSON.stringify(getDb().select().from(koppelingen).all())).not.toContain(NEP_TOKEN)

    // Herstart: de oude rij is weg, dus er gebeurt niets meer; ook niet nadat de koppeling is verwijderd.
    expect(await zetOmgevingskoppelingOver(env)).toBe('geen-oude-koppeling')
    expect(await opslag.verwijderKoppeling(hh, id)).toBe(true)
    expect(await zetOmgevingskoppelingOver(env)).toBe('geen-oude-koppeling')
    expect(await opslag.lijstKoppelingen(hh)).toHaveLength(0)
    expect(aantalRijen(beheerderHh)).toBe(0)
  })

  it('samen met het dossier: koppelingen in de export, weg met Alles verwijderen', async () => {
    zetMoneybirdFetch(nepMoneybird().fetch)
    h.echt = true
    const { exporteer, huishoudenVan, verwijderAlles } = await import('@/lib/dossier/opslag')
    const u = getDb().insert(users).values({ email: 'dossier@example.nl', passwordHash: 'x', totpEnabled: true }).returning().get()
    const hh = await huishoudenVan(u.id)
    const { koppeling } = await opslag.maakKoppeling(hh, { token: NEP_TOKEN, label: 'Eigen', persoon: 'A' })
    await opslag.bewaarIndeling(hh, Number(koppeling.id), { '606': 'kosten' })

    const exp = await exporteer(u.id)
    expect(JSON.stringify(exp)).not.toContain(NEP_TOKEN)
    const uitExport = exp.huishoudens[0].koppelingen
    expect(uitExport).toHaveLength(1)
    expect(uitExport[0]).toMatchObject({ id: koppeling.id, soort: 'moneybird', persoon: 'A', indeling: { '606': 'kosten' } })

    await verwijderAlles(u.id, false)
    expect(aantalRijen(hh)).toBe(0)
  })

  it('end-to-end via de routes: toevoegen, administratie kiezen, importeren, indeling bewaren, verwijderen', async () => {
    const nep = nepMoneybird()
    zetMoneybirdFetch(nep.fetch)
    const { userId } = gebruikerMetHuishouden('e2e@example.nl')
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
    expect((await routes.een.PATCH(verzoek('PATCH', '/x', { administratieId: NEP_ADM }), params(id))).status).toBe(404)
    expect((await lees(await routes.lijst.GET())).data.koppelingen).toEqual([])

    // Het token komt in geen enkele response voor.
    for (const t of teksten) expect(t).not.toContain(NEP_TOKEN)
  })

  it('zonder tabellen: 503 met de opdracht om te migreren', async () => {
    const { userId } = gebruikerMetHuishouden('schema@example.nl')
    await inloggen(userId)
    getSqlite().exec('DROP TABLE koppelingen')
    const res = await routes.lijst.GET()
    expect(res.status).toBe(503)
    expect(JSON.stringify(await res.json())).toMatch(/db:migrate/)
  })
})
