import { NextResponse } from 'next/server'
import { exporteer } from '@/lib/dossier/opslag'
import { metDossier } from '@/lib/dossier/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Alle gegevens ontsleuteld als JSON-download. */
export async function GET() {
  return metDossier('dossier/export', async ({ userId }) => {
    const data = await exporteer(userId)
    const datum = data.geexporteerd.slice(0, 10)
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="ib-dossier-${datum}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  })
}
