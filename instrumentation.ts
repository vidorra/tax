/**
 * Draait één keer bij de start van de Next.js-server (next start en next dev): de opstarttaken (lib/opstart.ts) en de
 * scheduler van de halfjaarlijkse back-up, alleen in de Node-runtime en niet tijdens next build. Zonder volledige
 * configuratie loggen ze één regel en doen ze verder niets.
 */
export async function register(): Promise<void> {
  // NEXT_RUNTIME wordt bij het bouwen ingevuld, zodat de edge-bundel deze import niet meeneemt.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE === 'phase-production-build') return
    const { opstartTaken } = await import('./lib/opstart')
    await opstartTaken()
    const { startBackupScheduler } = await import('./lib/backup/scheduler')
    startBackupScheduler()
  }
}
