/**
 * Scheduler van de geplande back-up. Start één keer per proces (instrumentation.ts): de eerste tik na een
 * minuut, daarna elk uur. Elke tik vraagt geplandeTik of er iets te doen is; meestal is het antwoord
 * 'overgeslagen' en dat logt hij niet. Twee servers of een herstart midden in een tik geven geen dubbele
 * mail, want claimGepland in runs.ts is atomair.
 *
 * De timers houden het proces niet in leven (unref). Logt alleen de uitkomststatus, nooit het volledige adres.
 */
import { maskeerAdres } from '@/lib/mail'

import { BACKUP_MOMENTEN, TIJDZONE } from './planning'
import { markeerAfgebroken } from './runs'
import { backupConfig, foutLabel, geplandeTik } from './service'
import { momentenNL } from './weergave'

export const EERSTE_TIK_MS = 60_000
export const TIK_MS = 60 * 60_000

interface Staat {
  timers: Array<ReturnType<typeof setTimeout>>
}

const g = globalThis as unknown as { __ibBackupScheduler?: Staat }

function losVanProces(t: ReturnType<typeof setTimeout>): void {
  ;(t as { unref?: () => void }).unref?.()
}

/** Start de scheduler. Idempotent: een tweede aanroep (hot reload, dubbele register) doet niets. */
export function startBackupScheduler(): void {
  if (g.__ibBackupScheduler) return
  const staat: Staat = { timers: [] }
  g.__ibBackupScheduler = staat

  const cfg = backupConfig()
  if (!cfg.klaar || !cfg.ontvanger) {
    console.log(`Back-up: niet ingericht (ontbreekt: ${cfg.ontbreekt.join(', ')})`)
    return
  }
  console.log(`Back-up: gepland op ${momentenNL(BACKUP_MOMENTEN)} (${TIJDZONE}), naar ${maskeerAdres(cfg.ontvanger)}`)

  let bezig = false
  const tik = async (): Promise<void> => {
    // Een tik die nog loopt (grote dump, trage mailserver) krijgt geen tweede ernaast.
    if (bezig) return
    bezig = true
    try {
      await markeerAfgebroken().catch(() => 0)
      const r = await geplandeTik()
      if (r.status !== 'overgeslagen') console.log(`Back-up: ${r.status}`)
    } catch (e) {
      console.warn(`Back-up: tik mislukt (${foutLabel(e)})`)
    } finally {
      bezig = false
    }
  }

  const eerste = setTimeout(() => {
    void tik()
    const elkUur = setInterval(() => void tik(), TIK_MS)
    losVanProces(elkUur)
    staat.timers.push(elkUur)
  }, EERSTE_TIK_MS)
  losVanProces(eerste)
  staat.timers.push(eerste)
}

/** Stopt de timers en wist de vlag, zodat startBackupScheduler opnieuw kan starten. Voor tests. */
export function stopBackupScheduler(): void {
  const staat = g.__ibBackupScheduler
  if (!staat) return
  for (const t of staat.timers) clearTimeout(t)
  delete g.__ibBackupScheduler
}
