/**
 * Scheduler en instrumentation.ts: idempotent starten, één logregel, eerste tik na een minuut en daarna elk
 * uur, geen overlappende tikken, alleen de uitkomststatus in de log, en geen start tijdens next build of
 * in de edge-runtime. De service en markeerAfgebroken uit runs zijn nagebootst, dus deze tests openen geen
 * database (ook niet de standaarddatabase ./data/ibcalculator.db).
 */
import { existsSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbPad } from '@/lib/db/pad'

import type { BackupConfig, BackupResultaat } from '../types'

const nep = vi.hoisted(() => ({
  config: { klaar: true, ontbreekt: [], ontvanger: 'backup.ontvanger@example.nl' } as BackupConfig,
  tik: async (): Promise<BackupResultaat> => ({ status: 'overgeslagen' }),
  tikken: 0,
  afgebroken: async (): Promise<number> => 0,
  volgorde: [] as string[],
}))

vi.mock('../service', async (orig) => ({
  ...(await orig<typeof import('../service')>()),
  backupConfig: () => nep.config,
  geplandeTik: async () => {
    nep.tikken++
    nep.volgorde.push('tik')
    return nep.tik()
  },
}))

vi.mock('../runs', async (orig) => ({
  ...(await orig<typeof import('../runs')>()),
  markeerAfgebroken: async () => {
    nep.volgorde.push('afgebroken')
    return nep.afgebroken()
  },
}))

const { startBackupScheduler, stopBackupScheduler, EERSTE_TIK_MS, TIK_MS } = await import('../scheduler')
const { vangLog } = await import('./hulp')

let log: ReturnType<typeof vangLog>
beforeEach(() => {
  vi.useFakeTimers()
  log = vangLog()
  nep.config = { klaar: true, ontbreekt: [], ontvanger: 'backup.ontvanger@example.nl' }
  nep.tik = async () => ({ status: 'overgeslagen' })
  nep.tikken = 0
  nep.afgebroken = async () => 0
  nep.volgorde = []
})
afterEach(() => {
  stopBackupScheduler()
  log.herstel()
  vi.useRealTimers()
  delete process.env.NEXT_RUNTIME
  delete process.env.NEXT_PHASE
})

describe('startBackupScheduler', () => {
  it('niet ingericht: één logregel met wat ontbreekt en geen tikken', async () => {
    nep.config = { klaar: false, ontbreekt: ['BACKUP_MAIL_TO', 'MAIL_FROM'], ontvanger: null }
    startBackupScheduler()
    startBackupScheduler()
    await vi.advanceTimersByTimeAsync(3 * TIK_MS)
    expect(log.regels).toEqual(['Back-up: niet ingericht (ontbreekt: BACKUP_MAIL_TO, MAIL_FROM)'])
    expect(nep.tikken).toBe(0)
  })

  it('ingericht: één logregel met gemaskeerde ontvanger, eerste tik na een minuut, daarna elk uur', async () => {
    startBackupScheduler()
    startBackupScheduler()
    expect(log.regels).toEqual(['Back-up: gepland op 1 februari en 1 augustus (Europe/Amsterdam), naar b•••@example.nl'])
    await vi.advanceTimersByTimeAsync(EERSTE_TIK_MS - 1)
    expect(nep.tikken).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(nep.tikken).toBe(1)
    await vi.advanceTimersByTimeAsync(TIK_MS)
    expect(nep.tikken).toBe(2)
    await vi.advanceTimersByTimeAsync(2 * TIK_MS)
    expect(nep.tikken).toBe(4)
    // Overgeslagen tikken loggen niets.
    expect(log.regels).toHaveLength(1)
  })

  it('logt alleen de uitkomststatus, en een fout zonder melding', async () => {
    nep.tik = async () => ({ status: 'verstuurd', reden: 'geheim', bestandsnaam: 'x.ibcbak', sha256: 'a'.repeat(64) })
    startBackupScheduler()
    await vi.advanceTimersByTimeAsync(EERSTE_TIK_MS)
    nep.tik = async () => {
      throw Object.assign(new Error('disk I/O error in /app/data/ibcalculator.db (rij: geheim)'), { code: 'SQLITE_IOERR' })
    }
    await vi.advanceTimersByTimeAsync(TIK_MS)
    expect(log.regels.slice(1)).toEqual(['Back-up: verstuurd', 'Back-up: tik mislukt (Error, SQLITE_IOERR)'])
  })

  it('elke tik markeert eerst vastgelopen runs, en gaat door als dat mislukt; er gaat geen database open', async () => {
    const g = globalThis as unknown as { __ibDb?: unknown }
    expect(g.__ibDb).toBeUndefined()
    startBackupScheduler()
    await vi.advanceTimersByTimeAsync(EERSTE_TIK_MS)
    nep.afgebroken = async () => {
      throw Object.assign(new Error('no such table: backups'), { code: 'SQLITE_ERROR' })
    }
    await vi.advanceTimersByTimeAsync(TIK_MS)
    expect(nep.volgorde).toEqual(['afgebroken', 'tik', 'afgebroken', 'tik'])
    expect(log.regels).toHaveLength(1)
    expect(g.__ibDb).toBeUndefined()
    expect(existsSync(dbPad())).toBe(false)
  })

  it('start geen tweede tik zolang de vorige nog loopt', async () => {
    let klaar: () => void = () => undefined
    nep.tik = () => new Promise((resolve) => (klaar = () => resolve({ status: 'verstuurd' })))
    startBackupScheduler()
    await vi.advanceTimersByTimeAsync(EERSTE_TIK_MS + 3 * TIK_MS)
    expect(nep.tikken).toBe(1)
    klaar()
    await vi.advanceTimersByTimeAsync(TIK_MS)
    expect(nep.tikken).toBe(2)
  })
})

describe('instrumentation.ts', () => {
  it('start de scheduler alleen in de Node-runtime en niet tijdens next build', async () => {
    const { register } = await import('@/instrumentation')
    process.env.NEXT_RUNTIME = 'edge'
    await register()
    process.env.NEXT_RUNTIME = 'nodejs'
    process.env.NEXT_PHASE = 'phase-production-build'
    await register()
    expect(log.regels).toEqual([])
    delete process.env.NEXT_PHASE
    await register()
    await register()
    expect(log.regels).toEqual(['Back-up: gepland op 1 februari en 1 augustus (Europe/Amsterdam), naar b•••@example.nl'])
  })
})
