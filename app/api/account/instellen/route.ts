import { clientIp, fout, herkomstFout, json, leesJson, nietGeconfigureerd, serverFout } from '@/lib/auth/api'
import { AccountFout } from '@/lib/auth/gebruiker'
import { loginLimiter } from '@/lib/auth/rate-limit'
import { INSTELLEN_COOKIE, INSTELLEN_DUUR } from '@/lib/auth/sessie'
import { zetTokenCookie } from '@/lib/auth/server'
import { qrDataUrl } from '@/lib/auth/totp'
import { schoonToken, startInstellen, VERLOPEN_MELDING } from '@/lib/auth/uitnodiging'
import { wachtwoordProbleem } from '@/lib/auth/wachtwoord'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stap 2: wachtwoord kiezen. Body: { token, wachtwoord }. Zet een tijdelijke cookie (15 minuten) voor stap 3 en geeft
 * de QR-code voor de authenticator-app. Het account bestaat pas na stap 3.
 */
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
    const body = await leesJson<{ token?: unknown; wachtwoord?: unknown }>(req, 10_000)
    const token = schoonToken(body?.token)
    if (!token) {
      limiet.mislukt(sleutel)
      return fout(410, VERLOPEN_MELDING)
    }
    const probleem = wachtwoordProbleem(body?.wachtwoord)
    if (probleem) return fout(400, probleem)
    const gestart = await startInstellen(token, body!.wachtwoord as string)
    await zetTokenCookie(INSTELLEN_COOKIE, gestart.id, 'instellen', INSTELLEN_DUUR, gestart.poging)
    return json({ qr: await qrDataUrl(gestart.uri), secret: gestart.secret })
  } catch (e) {
    if (e instanceof AccountFout) return fout(e.status, e.message)
    return serverFout(e, 'account/instellen')
  }
}
