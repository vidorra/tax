import { clientIp, fout, herkomstFout, json, leesJson, nietGeconfigureerd, serverFout } from '@/lib/auth/api'
import { activeerTotp, gebruikerOpId } from '@/lib/auth/gebruiker'
import { loginLimiter } from '@/lib/auth/rate-limit'
import { SETUP_COOKIE } from '@/lib/auth/sessie'
import { leesToken, wisCookie, zetSessie } from '@/lib/auth/server'
import { codeAlGebruikt, verifieerTotp } from '@/lib/auth/totp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Bevestigt de eerste TOTP-code, zet 2FA aan en logt direct in. */
export async function POST(req: Request) {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = herkomstFout(req)
  if (herkomst) return herkomst
  try {
    const token = await leesToken(SETUP_COOKIE, 'setup')
    if (!token) return fout(401, 'De installatie is verlopen. Begin opnieuw.')
    const limiet = loginLimiter()
    const sleutel = `setup-code|${clientIp(req)}|${token.userId}`
    const check = limiet.controleer(sleutel)
    if (!check.toegestaan) return fout(429, `Te veel pogingen. Probeer het over ${Math.ceil(check.wachtSeconden / 60)} minuten opnieuw.`, {}, { 'Retry-After': String(check.wachtSeconden) })

    const body = await leesJson<{ code?: unknown }>(req, 2_000)
    const gebruiker = await gebruikerOpId(token.userId)
    if (!gebruiker) return fout(401, 'De installatie is verlopen. Begin opnieuw.')
    if (gebruiker.totpEnabled) return fout(403, 'Tweestapsverificatie staat al aan. Log in om verder te gaan.')
    const stap = verifieerTotp(gebruiker.totpSecret, body?.code)
    if (stap === null || codeAlGebruikt(gebruiker.id, stap)) {
      limiet.mislukt(sleutel)
      return fout(401, 'Deze code klopt niet. Controleer de tijd op je telefoon en probeer de volgende code.')
    }
    limiet.reset(sleutel)
    // Ondeelbaar: lukt alleen als dit account nog bestaat en niemand de installatie intussen heeft afgerond.
    if (!(await activeerTotp(gebruiker.id))) return fout(401, 'De installatie is verlopen. Begin opnieuw.')
    await wisCookie(SETUP_COOKIE)
    await zetSessie(gebruiker.id, gebruiker.sessieGeneratie)
    return json({ ok: true })
  } catch (e) {
    return serverFout(e, 'auth/setup/bevestig')
  }
}
