import { clientIp, fout, herkomstFout, json, leesJson, nietGeconfigureerd, serverFout } from '@/lib/auth/api'
import { maakGebruiker, normaliseerEmail, setupAfgerond } from '@/lib/auth/gebruiker'
import { loginLimiter } from '@/lib/auth/rate-limit'
import { SETUP_COOKIE, SETUP_DUUR } from '@/lib/auth/sessie'
import { zetTokenCookie } from '@/lib/auth/server'
import { qrDataUrl } from '@/lib/auth/totp'
import { wachtwoordProbleem } from '@/lib/auth/wachtwoord'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Maakt het enige account aan (alleen als er nog geen account met 2FA is) en geeft de QR-code voor de authenticator-app. */
export async function POST(req: Request) {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = herkomstFout(req)
  if (herkomst) return herkomst
  try {
    const limiet = loginLimiter()
    const sleutel = `setup|${clientIp(req)}`
    const check = limiet.controleer(sleutel)
    if (!check.toegestaan) return fout(429, `Te veel pogingen. Probeer het over ${Math.ceil(check.wachtSeconden / 60)} minuten opnieuw.`, {}, { 'Retry-After': String(check.wachtSeconden) })

    if (await setupAfgerond()) return fout(403, 'Er bestaat al een account. Log in om verder te gaan.')
    const body = await leesJson<{ email?: unknown; wachtwoord?: unknown }>(req, 10_000)
    if (!body) return fout(400, 'Ongeldig verzoek.')
    const email = normaliseerEmail(body.email)
    if (!email) {
      limiet.mislukt(sleutel)
      return fout(400, 'Vul een geldig e-mailadres in.')
    }
    const probleem = wachtwoordProbleem(body.wachtwoord)
    if (probleem) {
      limiet.mislukt(sleutel)
      return fout(400, probleem)
    }
    const gemaakt = await maakGebruiker(email, body.wachtwoord as string)
    if (!gemaakt) return fout(403, 'Er bestaat al een account. Log in om verder te gaan.')
    await zetTokenCookie(SETUP_COOKIE, gemaakt.id, 'setup', SETUP_DUUR)
    return json({ qr: await qrDataUrl(gemaakt.uri), secret: gemaakt.secret })
  } catch (e) {
    return serverFout(e, 'auth/setup')
  }
}
