/**
 * GET /api/health: status van de dienst en de beschikbare parameterjaren.
 */
import { NextResponse } from 'next/server'
import { BESCHIKBARE_JAREN, CONCEPT_JAREN, getJaar, laatsteDefinitieveJaar } from '@/lib/tax/years'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  const jaren = BESCHIKBARE_JAREN()
  const varianten: Record<string, string[]> = {}
  for (const jaar of jaren) {
    const ids = getJaar(jaar).varianten.map((v) => v.id)
    if (ids.length > 0) varianten[jaar] = ids
  }
  return NextResponse.json(
    {
      ok: true,
      laatsteDefinitieveJaar: laatsteDefinitieveJaar(),
      jaren,
      concept: CONCEPT_JAREN,
      varianten,
      versie: process.env.GIT_SHA ?? 'dev',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
