import { clientIp, fout, herkomstFout, json, leesJson, nietGeconfigureerd, serverFout } from '@/lib/auth/api'
import { gebruikerOpEmail, normaliseerEmail } from '@/lib/auth/gebruiker'
import { ipLimiter, loginLimiter } from '@/lib/auth/rate-limit'
import { TWEEFA_COOKIE, TWEEFA_DUUR } from '@/lib/auth/sessie'
import { zetTokenCookie } from '@/lib/auth/server'
import { controleerWachtwoord } from '@/lib/auth/wachtwoord'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FOUT = 'E-mailadres of wachtwoord klopt niet.'

/** Stap 1: wachtwoord. Bij succes een tijdelijke 2FA-cookie van 5 minuten. */
export async function POST(req: Request) {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = herkomstFout(req)
  if (herkomst) return herkomst
  try {
    const body = await leesJson<{ email?: unknown; wachtwoord?: unknown }>(req, 10_000)
    if (!body) return fout(400, 'Ongeldig verzoek.')
    const email = normaliseerEmail(body.email) ?? ''
    const ip = clientIp(req)
    const limiet = loginLimiter()
    const perIp = ipLimiter()
    const sleutel = `login|${ip}|${email}`
    const ipSleutel = `login-ip|${ip}`
    const check = limiet.controleer(sleutel)
    const ipCheck = perIp.controleer(ipSleutel)
    const geblokkeerd = !check.toegestaan ? check : !ipCheck.toegestaan ? ipCheck : null
    if (geblokkeerd) return fout(429, `Te veel mislukte pogingen. Probeer het over ${Math.ceil(geblokkeerd.wachtSeconden / 60)} minuten opnieuw.`, {}, { 'Retry-After': String(geblokkeerd.wachtSeconden) })

    const gebruiker = email ? await gebruikerOpEmail(email) : null
    const wachtwoord = typeof body.wachtwoord === 'string' ? body.wachtwoord.slice(0, 200) : ''
    const goed = await controleerWachtwoord(wachtwoord, gebruiker?.passwordHash)
    if (!gebruiker || !goed) {
      limiet.mislukt(sleutel)
      perIp.mislukt(ipSleutel)
      return fout(401, FOUT)
    }
    if (!gebruiker.totpEnabled) return fout(403, 'De installatie is nog niet afgerond. Ga naar de installatiepagina en stel tweestapsverificatie in.')
    limiet.reset(sleutel)
    await zetTokenCookie(TWEEFA_COOKIE, gebruiker.id, '2fa', TWEEFA_DUUR)
    return json({ stap: '2fa' })
  } catch (e) {
    return serverFout(e, 'auth/login')
  }
}
