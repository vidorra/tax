/**
 * De back-upadministratie (tabel backups, runs.ts) op een echte, tijdelijke SQLite-database: claimen met
 * wachttijd, vastgelopen runs, afronden, status lezen en handmatige runs. Gelijktijdigheid binnen het proces
 * (Promise.all) en tussen processen: zes processen die tegelijk claimen, krijgen er samen precies één.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { getDb, getSqlite } from '@/lib/db'
import { backups } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'

import { wachttijdUren } from '../planning'
import { claimGepland, gedanePeriodes, laatsteGeslaagd, laatsteRun, markeerAfgebroken, rondAf, startHandmatig } from '../runs'
import { MINUUT, terug, UUR, DAG } from './hulp'

const testDb = gebruikTijdelijkeDb()

const rij = (id: number) => getSqlite().prepare('SELECT soort, periode, status, pogingen, fout, afgerond_op, bytes FROM backups WHERE id = ?').get(id) as Record<string, unknown>
const aantal = () => (getSqlite().prepare('SELECT count(*) AS n FROM backups').get() as { n: number }).n

describe('geplande runs', () => {
  it('vijf gelijktijdige claims op dezelfde periode leveren precies één claim op', async () => {
    const uitkomsten = await Promise.all(Array.from({ length: 5 }, () => claimGepland('2027-02')))
    const claims = uitkomsten.filter((u) => u !== null)
    expect(claims).toHaveLength(1)
    expect(claims[0]!.poging).toBe(1)
    expect(getSqlite().prepare(`SELECT soort, periode, status, pogingen FROM backups`).all()).toEqual([{ soort: 'gepland', periode: '2027-02', status: 'bezig', pogingen: 1 }])
    // Zolang hij bezig is, claimt niemand anders.
    expect(await claimGepland('2027-02')).toBeNull()
  })

  it('na een mislukte poging pas opnieuw na de wachttijd, met oplopende pogingen', async () => {
    const { id } = (await claimGepland('2027-02'))!
    await rondAf(id, { status: 'mislukt', fout: 'Mailserver weigerde de verbinding. ' + 'x'.repeat(400) })
    const na = rij(id)
    expect(na.fout).toHaveLength(300)
    expect(na.afgerond_op).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(await claimGepland('2027-02')).toBeNull()

    expect(wachttijdUren(1)).toBe(1)
    terug(id, 2 * UUR)
    expect(await claimGepland('2027-02')).toEqual({ id, poging: 2 })
    expect(rij(id)).toMatchObject({ status: 'bezig', fout: null, afgerond_op: null, pogingen: 2 })

    // Na poging 2 is de wachttijd 2 uur: na 90 minuten nog niet, na ruim 2 uur wel.
    expect(wachttijdUren(2)).toBe(2)
    await rondAf(id, { status: 'mislukt', fout: 'opnieuw mis' })
    terug(id, 90 * MINUUT)
    expect(await claimGepland('2027-02')).toBeNull()
    terug(id, 31 * MINUUT)
    expect(await claimGepland('2027-02')).toEqual({ id, poging: 3 })
  })

  it('na heel veel pogingen blijft de wachttijd 24 uur', async () => {
    const eerste = (await claimGepland('2030-08'))!
    await rondAf(eerste.id, { status: 'mislukt', fout: 'mis' })
    getDb().update(backups).set({ pogingen: 1000 }).where(eq(backups.id, eerste.id)).run()
    terug(eerste.id, 23 * UUR)
    expect(await claimGepland('2030-08')).toBeNull()
    terug(eerste.id, 2 * UUR)
    expect(await claimGepland('2030-08')).toEqual({ id: eerste.id, poging: 1001 })
  })

  it('wachttijdUren en claimGepland geven voor pogingen 1 tot en met 10 dezelfde wachttijd', async () => {
    const { id } = (await claimGepland('2031-02'))!
    for (let p = 1; p <= 10; p++) {
      const ms = wachttijdUren(p) * UUR
      getDb().update(backups).set({ status: 'mislukt', pogingen: p, gestartOp: new Date(Date.now() - ms + MINUUT) }).where(eq(backups.id, id)).run()
      expect(await claimGepland('2031-02'), `na poging ${p}, een minuut voor ${wachttijdUren(p)} uur`).toBeNull()
      getDb().update(backups).set({ status: 'mislukt', gestartOp: new Date(Date.now() - ms - MINUUT) }).where(eq(backups.id, id)).run()
      expect(await claimGepland('2031-02'), `na poging ${p}, een minuut na ${wachttijdUren(p)} uur`).toEqual({ id, poging: p + 1 })
    }
    expect(Array.from({ length: 10 }, (_, i) => wachttijdUren(i + 1))).toEqual([1, 2, 4, 8, 16, 24, 24, 24, 24, 24])
  })

  it('een run die langer dan een uur bezig is, mag opnieuw', async () => {
    const eerste = (await claimGepland('2027-08'))!
    expect(eerste.poging).toBe(1)
    terug(eerste.id, 59 * MINUUT)
    expect(await claimGepland('2027-08')).toBeNull()
    terug(eerste.id, 2 * MINUUT)
    expect(await claimGepland('2027-08')).toEqual({ id: eerste.id, poging: 2 })
  })

  it('verstuurd en te-groot worden nooit meer geclaimd, ook niet veel later', async () => {
    const v = (await claimGepland('2028-02'))!
    await rondAf(v.id, { status: 'verstuurd', bytes: 12345, sha256: 'a'.repeat(64), rijen: { users: 1, households: 1 } })
    const g = (await claimGepland('2028-08'))!
    await rondAf(g.id, { status: 'te-groot', bytes: 30_000_000, sha256: 'b'.repeat(64), rijen: { users: 1 } })
    terug(v.id, 400 * DAG)
    terug(g.id, 400 * DAG)
    expect(await claimGepland('2028-02')).toBeNull()
    expect(await claimGepland('2028-08')).toBeNull()
    expect(await gedanePeriodes()).toEqual(new Set(['2028-02', '2028-08']))
  })

  it('rondAf verandert een run die al klaar is niet meer', async () => {
    const r = (await claimGepland('2029-02'))!
    await rondAf(r.id, { status: 'verstuurd', bytes: 10 })
    await rondAf(r.id, { status: 'mislukt', fout: 'te laat' })
    expect(rij(r.id)).toMatchObject({ status: 'verstuurd', fout: null, bytes: 10 })
  })

  it('weigert een periode in de verkeerde vorm en de database bewaakt soort, status en periode', async () => {
    await expect(claimGepland('2027-2')).rejects.toThrow(/JJJJ-MM/)
    await expect(claimGepland('2027-13')).rejects.toThrow(/JJJJ-MM/)
    const voeg = (sql: string) => () => getSqlite().prepare(sql).run()
    expect(voeg(`INSERT INTO backups (soort, status) VALUES ('gepland', 'bezig')`)).toThrow(/backups_periode_bij_gepland/)
    expect(voeg(`INSERT INTO backups (soort, periode, status) VALUES ('handmatig', '2027-02', 'bezig')`)).toThrow(/backups_periode_bij_gepland/)
    expect(voeg(`INSERT INTO backups (soort, status) VALUES ('handmatig', 'klaar')`)).toThrow(/backups_status_check/)
    // Twee rijen voor dezelfde geplande periode kan niet; handmatige runs hebben geen periode.
    await claimGepland('2032-02')
    expect(voeg(`INSERT INTO backups (soort, periode, status) VALUES ('gepland', '2032-02', 'bezig')`)).toThrow(/UNIQUE/)
  })
})

describe('status lezen en afgebroken runs', () => {
  it('laatsteRun en laatsteGeslaagd geven nette BackupRun-objecten', async () => {
    expect(await laatsteRun()).toBeNull()
    expect(await laatsteGeslaagd()).toBeNull()
    getDb()
      .insert(backups)
      .values([
        {
          soort: 'gepland',
          periode: '2027-02',
          status: 'verstuurd',
          pogingen: 2,
          gestartOp: new Date('2027-02-01T02:00:00.000Z'),
          afgerondOp: new Date('2027-02-01T02:00:05.500Z'),
          bytes: 2048,
          sha256: 'abc',
          rijen: { users: 1, households: 2 },
        },
        { soort: 'handmatig', status: 'mislukt', gestartOp: new Date('2027-03-01T09:00:00.000Z'), fout: 'Mailen mislukt' },
        // Verstuurd maar zonder afrondmoment: komt bij laatsteGeslaagd achteraan.
        { soort: 'handmatig', status: 'verstuurd', gestartOp: new Date('2026-01-01T09:00:00.000Z') },
      ])
      .run()

    expect(await laatsteRun()).toEqual({
      id: expect.any(Number),
      soort: 'handmatig',
      periode: null,
      status: 'mislukt',
      pogingen: 1,
      gestartOp: '2027-03-01T09:00:00.000Z',
      afgerondOp: null,
      bytes: null,
      sha256: null,
      rijen: null,
      fout: 'Mailen mislukt',
    })
    expect(await laatsteGeslaagd()).toEqual({
      id: expect.any(Number),
      soort: 'gepland',
      periode: '2027-02',
      status: 'verstuurd',
      pogingen: 2,
      gestartOp: '2027-02-01T02:00:00.000Z',
      afgerondOp: '2027-02-01T02:00:05.500Z',
      bytes: 2048,
      sha256: 'abc',
      rijen: { users: 1, households: 2 },
      fout: null,
    })
    // JSON staat als tekst in de database.
    expect(getSqlite().prepare(`SELECT rijen FROM backups WHERE periode = '2027-02'`).get()).toEqual({ rijen: '{"users":1,"households":2}' })
  })

  it('markeerAfgebroken zet runs die langer dan een uur bezig zijn op mislukt', async () => {
    getDb()
      .insert(backups)
      .values([
        { soort: 'handmatig', status: 'bezig', gestartOp: new Date(Date.now() - 2 * UUR) },
        { soort: 'handmatig', status: 'bezig', gestartOp: new Date() },
      ])
      .run()
    expect(await markeerAfgebroken()).toBe(1)
    expect(getSqlite().prepare('SELECT status, fout FROM backups ORDER BY id').all()).toEqual([
      { status: 'mislukt', fout: 'Afgebroken, bijvoorbeeld door een herstart van de server.' },
      { status: 'bezig', fout: null },
    ])
    expect((await laatsteRun())?.status).toBe('bezig')
    expect(await markeerAfgebroken()).toBe(0)
  })
})

describe('handmatige runs', () => {
  it('weigert bezig zolang een run van de laatste 10 minuten loopt, ook een geplande', async () => {
    const gepland = (await claimGepland('2031-02'))!
    expect(await startHandmatig()).toEqual({ geweigerd: 'bezig' })
    // Langer dan 10 minuten bezig telt niet meer als blokkade.
    terug(gepland.id, 11 * MINUUT)
    const eerste = await startHandmatig()
    expect(eerste).toEqual({ id: expect.any(Number) })
    expect(await startHandmatig()).toEqual({ geweigerd: 'bezig' })
    await rondAf((eerste as { id: number }).id, { status: 'verstuurd' })
    expect(await startHandmatig()).toEqual({ id: expect.any(Number) })
  })

  it('gelijktijdige aanroepen starten er precies één', async () => {
    const uitkomsten = await Promise.all(Array.from({ length: 5 }, () => startHandmatig()))
    expect(uitkomsten.filter((u) => 'id' in u)).toHaveLength(1)
    expect(uitkomsten.filter((u) => 'geweigerd' in u && u.geweigerd === 'bezig')).toHaveLength(4)
    expect(aantal()).toBe(1)
  })

  it('weigert te-vaak bij drie handmatige runs in het afgelopen uur, ook bij gelijktijdige aanroepen', async () => {
    // Twee eerdere runs dit uur, waarvan één mislukt: die tellen allebei mee. Die van 61 minuten geleden niet.
    getDb()
      .insert(backups)
      .values([
        { soort: 'handmatig', status: 'verstuurd', gestartOp: new Date(Date.now() - 50 * MINUUT) },
        { soort: 'handmatig', status: 'mislukt', gestartOp: new Date(Date.now() - 20 * MINUUT) },
        { soort: 'handmatig', status: 'verstuurd', gestartOp: new Date(Date.now() - 61 * MINUUT) },
      ])
      .run()

    const uitkomsten = await Promise.all(Array.from({ length: 5 }, () => startHandmatig()))
    const gestart = uitkomsten.filter((u): u is { id: number } => 'id' in u)
    expect(gestart).toHaveLength(1)
    await rondAf(gestart[0].id, { status: 'verstuurd' })

    expect(await startHandmatig()).toEqual({ geweigerd: 'te-vaak' })
    expect(await Promise.all(Array.from({ length: 5 }, () => startHandmatig()))).toEqual(Array.from({ length: 5 }, () => ({ geweigerd: 'te-vaak' })))
    expect(aantal()).toBe(4)

    // Als de oudste run uit het uur valt, mag het weer.
    const oudste = getSqlite().prepare(`SELECT id FROM backups WHERE gestart_op < ? ORDER BY gestart_op DESC LIMIT 1`).get(new Date(Date.now() - 45 * MINUUT).toISOString()) as { id: number }
    terug(oudste.id, 15 * MINUUT)
    expect(await startHandmatig()).toEqual({ id: expect.any(Number) })
  })
})

describe('gelijktijdig uit verschillende processen', () => {
  /** Start `n` processen die tegelijk claimen en geeft hun uitkomsten. */
  async function inProcessen(soort: 'gepland' | 'handmatig', n: number): Promise<unknown[]> {
    const startbestand = join(testDb.map, `start-${soort}`)
    const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx')
    const script = join(process.cwd(), 'lib', 'backup', '__tests__', 'claim-proces.ts')
    let klaar = 0
    let allemaalKlaar: () => void = () => undefined
    const gereed = new Promise<void>((r) => (allemaalKlaar = r))
    const processen = Array.from({ length: n }, () => {
      const p = spawn(tsx, [script, soort, startbestand], { cwd: process.cwd(), env: { ...process.env, DATABASE_PATH: testDb.pad }, stdio: ['ignore', 'pipe', 'pipe'] })
      let uit = ''
      let fout = ''
      p.stdout.on('data', (d: Buffer) => {
        const voor = uit
        uit += d.toString()
        if (!voor.includes('klaar\n') && uit.includes('klaar\n') && ++klaar === n) allemaalKlaar()
      })
      p.stderr.on('data', (d: Buffer) => (fout += d.toString()))
      return new Promise<unknown>((resolve, reject) =>
        p.on('exit', (code) => (code === 0 ? resolve(JSON.parse(uit.split('\n').filter(Boolean).at(-1)!)) : reject(new Error(`proces stopte met ${code}: ${fout}`)))),
      )
    })
    await gereed
    writeFileSync(startbestand, '')
    return Promise.all(processen)
  }

  it('zes processen claimen dezelfde geplande periode: precies één claim', async () => {
    const uitkomsten = await inProcessen('gepland', 6)
    expect(uitkomsten.filter((u) => u !== null)).toEqual([{ id: expect.any(Number), poging: 1 }])
    expect(uitkomsten.filter((u) => u === null)).toHaveLength(5)
    expect(getSqlite().prepare(`SELECT periode, status, pogingen FROM backups`).all()).toEqual([{ periode: '2027-02', status: 'bezig', pogingen: 1 }])
  }, 60_000)

  it('zes processen starten een back-up op verzoek: er start er precies één', async () => {
    const uitkomsten = (await inProcessen('handmatig', 6)) as Array<{ id?: number; geweigerd?: string }>
    expect(uitkomsten.filter((u) => u.id !== undefined)).toHaveLength(1)
    expect(uitkomsten.filter((u) => u.geweigerd === 'bezig')).toHaveLength(5)
    expect(aantal()).toBe(1)
  }, 60_000)
})
