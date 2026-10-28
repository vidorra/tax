import { clientIp, fout, herkomstFout, json, leesJson, nietGeconfigureerd, serverFout } from '@/lib/auth/api'
import { loginLimiter } from '@/lib/auth/rate-limit'
import { geldigeUitnodiging, schoonToken, VERLOPEN_MELDING } from '@/lib/auth/uitnodiging'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Stap 1: is de link nog bruikbaar? Body: { token }. Geeft het adres en de naam terug voor op de pagina. */
export async function POST(req: Request) {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = herkomstFout(req)
  if (herkomst) return herkomst
  try {
    const limiet = loginLimiter()
    const sleutel = `instellen|${clientIp(req)}`
    const check = limiet.controleer(sleutel)
    if (!check.toegestaan) return fout(429, `Te veel pogingen. Probeer het over ${Math.ceil(check.wachtSeconden / 60)} minuten opnieuw.`, {}, { 'Retry-After': String(check.wachtSeconden) })
    const body = await leesJson<{ token?: unknown }>(req, 1_000)
    const token = schoonToken(body?.token)
    const u = token ? geldigeUitnodiging(token) : null
    if (!u) {
      limiet.mislukt(sleutel)
      return fout(410, VERLOPEN_MELDING)
    }
    return json({ email: u.email, naam: u.naam, soort: u.soort, verloopt: u.verloopt.toISOString() })
  } catch (e) {
    return serverFout(e, 'account/instellen/controleer')
  }
}
