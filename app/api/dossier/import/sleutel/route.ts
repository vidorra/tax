import { json } from '@/lib/auth/api'
import { rekeningGeheim } from '@/lib/dossier/import-opslag'
import { metDossier } from '@/lib/dossier/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Ronde 2 (A4): het geheim voor de rekeningsleutel van de broker-import (lib/import/sleutel.ts). Alleen met een
 * sessie; nooit in een cache. De browser rekent er de sleutel mee uit, het rekeningnummer komt hier nooit.
 */
export async function GET() {
  return metDossier('dossier/import/sleutel GET', async ({ householdId }) => json({ geheim: rekeningGeheim(householdId) }, 200, { 'Cache-Control': 'no-store, private' }))
}
