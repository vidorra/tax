/**
 * Auth en dossier op een echte SQLite-database: per test een eigen, gemigreerd bestand in een tijdelijke map
 * (lib/db/testdb.ts). Draaien altijd.
 *
 * Gelijktijdigheid: schrijf() maakt lezen, beslissen en schrijven ondeelbaar (BEGIN IMMEDIATE). De Promise.all-tests
 * hieronder bewaken dat: twee installaties, zes eerste verzoeken, twee opslagen met dezelfde versie en twee
 * wijzigingen van de aangiftestaat. Een tweede verbinding speelt een ander proces (migreren, back-up, herstel).
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { activeerTotp, eersteGebruiker, gebruikerOpId, maakGebruiker, setupAfgerond, verhoogSessieGeneratie } from '@/lib/auth/gebruiker'
import { serverFout } from '@/lib/auth/api'
import { versleutel } from '@/lib/crypto'
import { getDb, getSqlite, openSqlite, probeerLeegWal, sluitDb } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
import * as opslag from '@/lib/dossier/opslag'
import { laadAangifteStaat, wijzigAangifteStaat } from '@/lib/dossier/aangiftestaat-opslag'
import { databaseMelding } from '@/lib/dossier/pagina'
import { voorbeeldInvoer } from '@/lib/voorbeeld'

const vorigeSleutel = process.env.DOSSIER_KEY
beforeAll(() => {
  process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
})
afterAll(() => {
  if (vorigeSleutel === undefined) delete process.env.DOSSIER_KEY
  else process.env.DOSSIER_KEY = vorigeSleutel
})

const testDb = gebruikTijdelijkeDb()

/** Een account met 2FA, rechtstreeks in de database (zonder bcrypt, dat is traag). */
function account(email: string): schema.Gebruiker {
  return getDb().insert(schema.users).values({ email, passwordHash: 'x', totpEnabled: true }).returning().get()!
}

async function metHuishouden(email: string): Promise<{ userId: number; hh: number }> {
  const u = account(email)
  return { userId: u.id, hh: await opslag.huishoudenVan(u.id) }
}

const tel = (tabel: string, waar = '1 = 1', ...params: unknown[]): number =>
  (getSqlite().prepare(`SELECT count(*) AS n FROM ${tabel} WHERE ${waar}`).get(...params) as { n: number }).n

describe('account en installatie', () => {
  it('twee gelijktijdige installaties leveren één account op; na 2FA is setup dicht', async () => {
    const [x, y] = await Promise.all([maakGebruiker('een@example.nl', 'wachtwoord-van-12'), maakGebruiker('twee@example.nl', 'wachtwoord-van-12')])
    expect(x && y).toBeTruthy()
    // AUTOINCREMENT: het vervangen account krijgt nooit hetzelfde id, dus een setup-token van het oude past niet.
    expect(x!.id).not.toBe(y!.id)
    const rijen = getDb().select().from(schema.users).all()
    expect(rijen).toHaveLength(1)
    const blijft = rijen[0].id
    const vervangen = x!.id === blijft ? y!.id : x!.id
    expect(await setupAfgerond()).toBe(false)

    // Het vervangen account kan de installatie niet meer claimen; het overgebleven account wel, één keer.
    expect(await activeerTotp(vervangen)).toBe(false)
    expect(await activeerTotp(blijft)).toBe(true)
    expect(await activeerTotp(blijft)).toBe(false)
    expect(await setupAfgerond()).toBe(true)
    expect(await maakGebruiker('derde@example.nl', 'wachtwoord-van-12')).toBeNull()
    expect(getDb().select().from(schema.users).all()).toHaveLength(1)
    expect((await eersteGebruiker())!.id).toBe(blijft)
  })

  it('activeren lukt niet als een ander account de installatie al heeft geclaimd', async () => {
    const eerst = getDb().insert(schema.users).values({ email: 'eerst@example.nl', passwordHash: 'x' }).returning().get()!
    const later = getDb().insert(schema.users).values({ email: 'later@example.nl', passwordHash: 'x' }).returning().get()!
    const [a, b] = await Promise.all([activeerTotp(eerst.id), activeerTotp(later.id)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(getDb().select().from(schema.users).where(eq(schema.users.totpEnabled, true)).all()).toHaveLength(1)
  })

  it('uitloggen verhoogt de sessiegeneratie, ook twee keer tegelijk', async () => {
    const u = account('sessie@example.nl')
    expect(u.sessieGeneratie).toBe(0)
    await verhoogSessieGeneratie(u.id)
    expect((await gebruikerOpId(u.id))!.sessieGeneratie).toBe(1)
    await Promise.all([verhoogSessieGeneratie(u.id), verhoogSessieGeneratie(u.id)])
    expect((await gebruikerOpId(u.id))!.sessieGeneratie).toBe(3)
  })
})

describe('dossier', () => {
  it('gelijktijdige eerste verzoeken maken één huishouden', async () => {
    const u = account('race@example.nl')
    const ids = await Promise.all(Array.from({ length: 6 }, () => opslag.huishoudenVan(u.id)))
    expect(new Set(ids).size).toBe(1)
    expect(getDb().select().from(schema.households).where(eq(schema.households.userId, u.id)).all()).toHaveLength(1)
  })

  it('twee gelijktijdige opslagen met dezelfde versie: één wint, de ander krijgt VersieConflict', async () => {
    const { hh } = await metHuishouden('versie@example.nl')
    const invoer = voorbeeldInvoer(2024)
    await opslag.maakJaar(hh, invoer)
    const a = { ...invoer, personen: invoer.personen.map((p, i) => (i === 0 ? { ...p, naam: 'Venster A' } : p)) }
    const b = { ...invoer, personen: invoer.personen.map((p, i) => (i === 0 ? { ...p, naam: 'Venster B' } : p)) }
    const uit = await Promise.allSettled([
      opslag.bewaarJaar(hh, 2024, { invoer: a, status: 'concept', variant: null, versie: 1 }),
      opslag.bewaarJaar(hh, 2024, { invoer: b, status: 'concept', variant: null, versie: 1 }),
    ])
    expect(uit.map((u) => u.status).sort()).toEqual(['fulfilled', 'rejected'])
    const afgewezen = uit.find((u) => u.status === 'rejected') as PromiseRejectedResult
    expect(afgewezen.reason).toBeInstanceOf(opslag.VersieConflict)
    const jaar = (await opslag.laadJaar(hh, 2024))!
    expect(jaar.versie).toBe(2)
    expect(jaar.invoer.personen[0].naam).toBe('Venster A')
    // Het verloren venster heeft ook geen snapshot achtergelaten: één bij aanmaken, één bij de opslag.
    expect(tel('snapshots')).toBe(2)
  })

  it('maakJaar twee keer tegelijk: één jaar, de tweede krijgt BestaatAl', async () => {
    const { hh } = await metHuishouden('dubbel@example.nl')
    const uit = await Promise.allSettled([opslag.maakJaar(hh, voorbeeldInvoer(2024)), opslag.maakJaar(hh, voorbeeldInvoer(2024))])
    expect(uit.map((u) => u.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((uit.find((u) => u.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(opslag.BestaatAl)
    expect(tel('dossier_years')).toBe(1)
    expect(tel('snapshots')).toBe(1)
  })

  it('wijzigingen van de aangiftestaat uit twee vensters gaan allebei mee', async () => {
    const { hh } = await metHuishouden('staat@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    const op = '2026-10-05T10:00:00.000Z'
    await Promise.all([
      wijzigAangifteStaat(hh, 2024, [{ soort: 'terugvraag', sleutel: 'positie/a', waarde: { status: 'aangevraagd', op } }]),
      wijzigAangifteStaat(hh, 2024, [{ soort: 'terugvraag', sleutel: 'positie/b', waarde: { status: 'laten', op } }]),
    ])
    const staat = (await laadAangifteStaat(hh, 2024))!.staat
    expect(Object.keys(staat.terugvragen ?? {}).sort()).toEqual(['positie/a', 'positie/b'])
    expect(getDb().select({ versie: schema.aangifteStaat.versie }).from(schema.aangifteStaat).get()).toEqual({ versie: 2 })
  })

  it('bewaart hooguit MAX_SNAPSHOTS snapshots per jaar, de nieuwste', async () => {
    const { hh } = await metHuishouden('snapshots@example.nl')
    const invoer = voorbeeldInvoer(2024)
    await opslag.maakJaar(hh, invoer)
    for (let i = 0; i < opslag.MAX_SNAPSHOTS + 3; i++) await opslag.bewaarJaar(hh, 2024, { invoer, status: 'concept', variant: null })
    const ids = getDb().select({ id: schema.snapshots.id }).from(schema.snapshots).all().map((s) => s.id)
    expect(ids).toHaveLength(opslag.MAX_SNAPSHOTS)
    // De nieuwste blijft staan: het hoogste id is dat van de laatste opslag.
    expect(Math.max(...ids)).toBe(opslag.MAX_SNAPSHOTS + 4)
  })

  it('scheidt huishoudens (geen IDOR) en verwijder-alles wist alleen de eigen rijen', async () => {
    const db = getDb()
    const een = await metHuishouden('u1@example.nl')
    const twee = await metHuishouden('u2@example.nl')
    const [h1, h2] = [een.hh, twee.hh]
    const invoer = voorbeeldInvoer(2024)
    await opslag.maakJaar(h1, invoer)
    await opslag.maakJaar(h2, invoer)
    await opslag.bewaarJaar(h1, 2024, { invoer, status: 'concept', variant: null })
    await opslag.bewaarAccountant(h1, 2024, { A: { winst: 1 } })
    await opslag.bewaarAccountant(h2, 2024, { A: { winst: 2 } })
    await wijzigAangifteStaat(h1, 2024, [{ soort: 'controles-streng', waarde: { op: '2026-10-05T10:00:00.000Z', door: 'export' } }])
    db.insert(schema.koppelingen).values({ householdId: h1, label: 'Boekhouding', tokenEnc: versleutel('nep-token', 'koppelingen:test') }).run()
    db.insert(schema.herstelpunten).values({ householdId: h1, sleutel: 'test-sleutel', reden: 'json-import', inhoudEnc: 'v2.x' }).run()

    // Huishouden 2 ziet alleen de eigen gegevens.
    expect((await opslag.laadAccountant(h2, 2024))!.regels).toEqual({ A: { winst: 2 } })
    expect(await opslag.laadJaar(h2, 2025)).toBeNull()
    expect(await opslag.verwijderJaar(h2, 2025)).toBe(false)

    const jaarIds = (h: number) => db.select({ id: schema.dossierYears.id }).from(schema.dossierYears).where(eq(schema.dossierYears.householdId, h)).all().map((r) => r.id)
    const telRijen = (h: number) => {
      const ids = jaarIds(h)
      return {
        huishoudens: tel('households', 'id = ?', h),
        jaren: ids.length,
        snapshots: ids.length ? db.select().from(schema.snapshots).where(inArray(schema.snapshots.dossierYearId, ids)).all().length : 0,
        accountant: ids.length ? db.select().from(schema.accountantDocs).where(inArray(schema.accountantDocs.dossierYearId, ids)).all().length : 0,
        staat: ids.length ? db.select().from(schema.aangifteStaat).where(inArray(schema.aangifteStaat.dossierYearId, ids)).all().length : 0,
        koppelingen: tel('koppelingen', 'household_id = ?', h),
        herstelpunten: tel('herstelpunten', 'household_id = ?', h),
      }
    }
    expect(telRijen(h1)).toEqual({ huishoudens: 1, jaren: 1, snapshots: 2, accountant: 1, staat: 1, koppelingen: 1, herstelpunten: 1 })
    const ids1 = jaarIds(h1)

    await opslag.verwijderAlles(een.userId, false)
    expect(telRijen(h1)).toEqual({ huishoudens: 0, jaren: 0, snapshots: 0, accountant: 0, staat: 0, koppelingen: 0, herstelpunten: 0 })
    expect(db.select().from(schema.snapshots).where(inArray(schema.snapshots.dossierYearId, ids1)).all()).toHaveLength(0)
    expect(db.select().from(schema.users).where(eq(schema.users.id, een.userId)).all()).toHaveLength(1)
    // Het andere huishouden blijft intact.
    expect(telRijen(h2)).toEqual({ huishoudens: 1, jaren: 1, snapshots: 1, accountant: 1, staat: 0, koppelingen: 0, herstelpunten: 0 })

    await opslag.verwijderAlles(een.userId, true)
    expect(db.select().from(schema.users).where(eq(schema.users.id, een.userId)).all()).toHaveLength(0)
  })

  it('de export bevat jaren, accountantsregels, aangiftestaat en koppelingen, zonder token', async () => {
    const { userId, hh } = await metHuishouden('export@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    await opslag.bewaarAccountant(hh, 2024, { A: { winst: 7 } })
    await wijzigAangifteStaat(hh, 2024, [{ soort: 'controles-streng', waarde: { op: '2026-10-05T10:00:00.000Z', door: 'export' } }])
    getDb().insert(schema.koppelingen).values({ householdId: hh, label: 'Boekhouding', tokenEnc: versleutel('nep-token-export', 'koppelingen:test') }).run()
    const exp = await opslag.exporteer(userId)
    expect(exp.account?.email).toBe('export@example.nl')
    expect(exp.huishoudens).toHaveLength(1)
    const [h] = exp.huishoudens
    expect(h.jaren.map((j) => [j.jaar, j.versie, j.accountant])).toEqual([[2024, 1, { A: { winst: 7 } }]])
    expect(h.jaren[0].aangiftestaat).toMatchObject({ controles: { streng: { door: 'export' } } })
    expect(h.jaren[0].laatsteBerekening?.berekend).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(h.koppelingen.map((k) => k.label)).toEqual(['Boekhouding'])
    expect(JSON.stringify(exp)).not.toContain('nep-token-export')
    expect(JSON.stringify(h.koppelingen)).not.toMatch(/token/i)
  })

  it('verwijder-alles is alles of niets: faalt het account, dan blijft ook het dossier staan', async () => {
    const { userId, hh } = await metHuishouden('heel@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    getSqlite().exec(`CREATE TRIGGER weiger_account BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'test: account blijft'); END`)
    await expect(opslag.verwijderAlles(userId, true)).rejects.toThrow(/account blijft/)
    expect(tel('households', 'id = ?', hh)).toBe(1)
    expect(tel('dossier_years', 'household_id = ?', hh)).toBe(1)
    getSqlite().exec('DROP TRIGGER weiger_account')
    await opslag.verwijderAlles(userId, true)
    expect(tel('households')).toBe(0)
    expect(tel('users')).toBe(0)
  })

  it('na verwijder-alles staat de versleutelde inhoud niet meer in het databasebestand', async () => {
    const { userId, hh } = await metHuishouden('wis@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    const rij = getDb().select({ invoerEnc: schema.dossierYears.invoerEnc }).from(schema.dossierYears).get()!
    const merk = rij.invoerEnc.slice(10, 80)
    getSqlite().pragma('wal_checkpoint(TRUNCATE)')
    expect(readFileSync(testDb.pad).includes(merk)).toBe(true)
    await opslag.verwijderAlles(userId, true)
    getSqlite().pragma('wal_checkpoint(TRUNCATE)')
    expect(readFileSync(testDb.pad).includes(merk)).toBe(false)
  })

  it('na verwijder-alles staat de inhoud ook niet meer in -wal, terwijl de verbinding open blijft', async () => {
    const { userId, hh } = await metHuishouden('wal@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    const merk = getDb().select({ invoerEnc: schema.dossierYears.invoerEnc }).from(schema.dossierYears).get()!.invoerEnc.slice(10, 80)
    const wal = `${testDb.pad}-wal`
    // Zonder checkpoint staat het nieuwe jaar alleen nog in -wal.
    expect(readFileSync(wal).includes(merk)).toBe(true)
    await opslag.verwijderAlles(userId, true)
    expect(getSqlite().open).toBe(true)
    expect(statSync(wal).size).toBe(0)
    expect(readFileSync(testDb.pad).includes(merk)).toBe(false)
  })

  it('verwijder-alles probeert -wal opnieuw te legen zolang een ander proces nog leest', async () => {
    const { userId, hh } = await metHuishouden('lezer@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    const merk = getDb().select({ invoerEnc: schema.dossierYears.invoerEnc }).from(schema.dossierYears).get()!.invoerEnc.slice(10, 80)
    // Een tweede verbinding (de back-up-CLI, een tweede container) houdt een leestransactie open op de WAL.
    const ander = openSqlite(testDb.pad)
    try {
      ander.prepare('BEGIN').run()
      ander.prepare('SELECT count(*) AS n FROM dossier_years').get()
      expect(probeerLeegWal()).toBe(false)
      setTimeout(() => ander.prepare('COMMIT').run(), 250)
      await opslag.verwijderAlles(userId, true)
      expect(ander.inTransaction).toBe(false)
      expect(statSync(`${testDb.pad}-wal`).size).toBe(0)
      expect(readFileSync(testDb.pad).includes(merk)).toBe(false)
    } finally {
      ander.close()
    }
  })

  it('blijft een ander proces lezen, dan is het dossier toch weg en logt verwijder-alles alleen een waarschuwing', async () => {
    const { userId, hh } = await metHuishouden('blijft@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    const ander = openSqlite(testDb.pad)
    const waarschuwingen: string[] = []
    const spion = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => void waarschuwingen.push(a.join(' ')))
    vi.useFakeTimers()
    try {
      ander.prepare('BEGIN').run()
      ander.prepare('SELECT count(*) AS n FROM dossier_years').get()
      const klaar = opslag.verwijderAlles(userId, true)
      await vi.runAllTimersAsync()
      await expect(klaar).resolves.toBeUndefined()
      expect(tel('households')).toBe(0)
      expect(tel('users')).toBe(0)
      expect(waarschuwingen).toEqual(['Database: -wal na Alles verwijderen nog niet leeg, een ander proces gebruikt de WAL'])
      expect(getSqlite().pragma('busy_timeout', { simple: true })).toBe(5000)
    } finally {
      vi.useRealTimers()
      spion.mockRestore()
      ander.close()
    }
  })

  it('een versleutelde invoer werkt niet in de rij van een ander huishouden (AAD)', async () => {
    const db = getDb()
    const a = await metHuishouden('aad-a@example.nl')
    const b = await metHuishouden('aad-b@example.nl')
    const geheim = { ...voorbeeldInvoer(2024) }
    geheim.personen = geheim.personen.map((p) => ({ ...p, naam: p.id === 'A' ? 'Alleen van A' : p.naam }))
    await opslag.maakJaar(a.hh, geheim)
    await opslag.maakJaar(b.hh, voorbeeldInvoer(2024))
    // Iemand met schrijftoegang tot de database (maar zonder DOSSIER_KEY) kopieert de rij van A naar B.
    const rijA = db.select().from(schema.dossierYears).where(and(eq(schema.dossierYears.householdId, a.hh), eq(schema.dossierYears.jaar, 2024))).get()!
    db.update(schema.dossierYears).set({ invoerEnc: rijA.invoerEnc }).where(and(eq(schema.dossierYears.householdId, b.hh), eq(schema.dossierYears.jaar, 2024))).run()
    await expect(opslag.laadJaar(b.hh, 2024)).rejects.toThrow(/Ontsleutelen mislukt/)
    // A zelf leest gewoon.
    expect((await opslag.laadJaar(a.hh, 2024))!.invoer.personen[0].naam).toBe('Alleen van A')
  })

  it('leest een oude v1-rij en herschrijft die bij opslaan als v2', async () => {
    const db = getDb()
    const { hh } = await metHuishouden('legacy@example.nl')
    const invoer = voorbeeldInvoer(2024)
    await opslag.maakJaar(hh, invoer)
    const waar = and(eq(schema.dossierYears.householdId, hh), eq(schema.dossierYears.jaar, 2024))
    db.update(schema.dossierYears).set({ invoerEnc: versleutel(invoer) }).where(waar).run()
    expect((await opslag.laadJaar(hh, 2024))!.invoer.jaar).toBe(2024)
    await opslag.bewaarJaar(hh, 2024, { invoer, status: 'concept', variant: null })
    expect(db.select().from(schema.dossierYears).where(waar).get()!.invoerEnc.startsWith('v2.')).toBe(true)
  })

  it('slaat invoer, snapshot en accountantsregels versleuteld op', async () => {
    const { hh } = await metHuishouden('versleuteld@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    await opslag.bewaarAccountant(hh, 2024, { A: { winst: 152340 } })
    const ruw = getSqlite().prepare('SELECT d.invoer_enc AS invoer, s.uitkomst_enc AS uitkomst, a.regels_enc AS regels FROM dossier_years d JOIN snapshots s ON s.dossier_year_id = d.id JOIN accountant_docs a ON a.dossier_year_id = d.id').all() as Array<Record<string, string>>
    expect(ruw).toHaveLength(1)
    for (const waarde of Object.values(ruw[0])) {
      expect(waarde.startsWith('v2.')).toBe(true)
      expect(waarde).not.toContain('152340')
    }
  })
})

describe('databasefouten', () => {
  const stil = () => vi.spyOn(console, 'error').mockImplementation(() => undefined)

  it('ontbrekende tabellen: 503 met de opdracht om te migreren', async () => {
    const log = stil()
    getSqlite().exec('DROP TABLE herstelpunten; DROP TABLE koppelingen; DROP TABLE households')
    const fout = await opslag.huishoudenVan(1).catch((e: unknown) => e)
    const res = serverFout(fout, 'test')
    expect(res.status).toBe(503)
    expect((await res.json()).fout).toMatch(/npm run db:migrate/)
    expect(databaseMelding(fout)).toMatch(/npm run db:migrate/)
    expect(log.mock.calls.flat().join(' ')).toMatch(/\(SQLITE_ERROR\)/)
    log.mockRestore()
  })

  it('een ander proces houdt de schrijflock vast: lezen gaat door (WAL), schrijven geeft na het wachten 503 "bezet"', async () => {
    const log = stil()
    const { hh } = await metHuishouden('bezet@example.nl')
    await opslag.maakJaar(hh, voorbeeldInvoer(2024))
    getSqlite().pragma('busy_timeout = 30')
    const ander = openSqlite(testDb.pad, { busyTimeoutMs: 0 })
    try {
      ander.prepare('BEGIN IMMEDIATE').run()
      expect((await opslag.laadJaar(hh, 2024))!.versie).toBe(1)
      const fout = await opslag.bewaarJaar(hh, 2024, { invoer: voorbeeldInvoer(2024), status: 'concept', variant: null, versie: 1 }).catch((e: unknown) => e)
      const res = serverFout(fout, 'test')
      expect(res.status).toBe(503)
      expect((await res.json()).fout).toMatch(/even bezet/)
      ander.prepare('ROLLBACK').run()
    } finally {
      ander.close()
    }
    // Daarna lukt dezelfde opslag gewoon; er was niets half geschreven.
    expect((await opslag.bewaarJaar(hh, 2024, { invoer: voorbeeldInvoer(2024), status: 'concept', variant: null, versie: 1 }))!.overzicht.versie).toBe(2)
    log.mockRestore()
  })

  it('een databasebestand dat niet te openen is: 503 met DATABASE_PATH in de melding', async () => {
    const log = stil()
    sluitDb()
    process.env.DATABASE_PATH = testDb.map
    const fout = await opslag.huishoudenVan(1).catch((e: unknown) => e)
    process.env.DATABASE_PATH = testDb.pad
    const res = serverFout(fout, 'test')
    expect(res.status).toBe(503)
    expect((await res.json()).fout).toMatch(/DATABASE_PATH/)
    expect(databaseMelding(fout)).toMatch(/DATABASE_PATH/)
    log.mockRestore()
  })

  it('andere fouten: de gewone melding, zonder inhoud in de log', async () => {
    const log = stil()
    const res = serverFout(new Error('Voorbeeldstraat 12 lekt niet'), 'test')
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('Voorbeeldstraat')
    expect(log.mock.calls.flat().join(' ')).not.toContain('Voorbeeldstraat')
    expect(databaseMelding(new Error('x'))).toBe('Er ging iets mis bij het laden van het dossier.')
    log.mockRestore()
  })
})
