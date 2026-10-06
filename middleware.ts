/**
 * Beveiliging van het dossier: /dossier/* (behalve login en setup) en /api/dossier/* vragen een
 * geldige sessie. Pagina's sturen door naar de login, de API geeft 401 in JSON. Zonder AUTH_SECRET
 * laat de middleware alles door: pagina's tonen dan uitleg over de configuratie, de API geeft 503.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { SESSIE_COOKIE, verifieerToken } from '@/lib/auth/sessie'

const OPEN = ['/dossier/login', '/dossier/setup']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next()
  if (!process.env.AUTH_SECRET?.trim()) return NextResponse.next()

  const sessie = await verifieerToken(req.cookies.get(SESSIE_COOKIE)?.value, 'sessie')
  if (sessie) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ fout: 'Je bent niet ingelogd of je sessie is verlopen. Log opnieuw in.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/dossier/login/'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/dossier', '/dossier/:path*', '/api/dossier/:path*'],
}
