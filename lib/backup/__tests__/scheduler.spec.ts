/**
 * Scheduler en instrumentation.ts: idempotent starten, één logregel, eerste tik na een minuut en daarna elk
 * uur, geen overlappende tikken, alleen de uitkomststatus in de log, en geen start tijdens next build of
 * in de edge-runtime. De service is nagebootst.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BackupConfig, BackupResultaat } from '../types'

const nep = vi.hoisted(() => ({
  config: { klaar: true, ontbreekt: [], ontvanger: 'backup.ontvanger@example.nl' } as BackupConfig,
  tik: async (): Promise<BackupResultaat> => ({ status: 'overgeslagen' }),
  tikken: 0,
}))

vi.mock('../service', async (orig) => ({
  ...(await orig<typeof import('../service')>()),
  backupConfig: () => nep.config,
  geplandeTik: async () => {
    nep.tikken++
    return nep.tik()
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
      throw Object.assign(new Error(`verbinding met postgres://ib:wachtwoord@db mislukt`), { code: 'ECONNREFUSED' })
    }
    await vi.advanceTimersByTimeAsync(TIK_MS)
    expect(log.regels.slice(1)).toEqual(['Back-up: verstuurd', 'Back-up: tik mislukt (Error, ECONNREFUSED)'])
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
