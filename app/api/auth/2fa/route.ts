import { clientIp, fout, herkomstFout, json, leesJson, nietGeconfigureerd, serverFout } from '@/lib/auth/api'
import { gebruikerOpId, raakIngelogd } from '@/lib/auth/gebruiker'
import { accountLimiter, loginLimiter } from '@/lib/auth/rate-limit'
import { TWEEFA_COOKIE } from '@/lib/auth/sessie'
import { leesToken, wisCookie, zetSessie } from '@/lib/auth/server'
import { codeAlGebruikt, verifieerTotp } from '@/lib/auth/totp'
import { totpGeheimVan, versleutelTotpVan } from '@/lib/auth/totp-opslag'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Stap 2: code uit de authenticator-app. Bij succes de sessiecookie van 7 dagen. */
export async function POST(req: Request) {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = herkomstFout(req)
  if (herkomst) return herkomst
  try {
    const token = await leesToken(TWEEFA_COOKIE, '2fa')
    if (!token) return fout(401, 'Je inlogpoging is verlopen. Vul je wachtwoord opnieuw in.')
    const limiet = loginLimiter()
    const perAccount = accountLimiter()
    const sleutel = `2fa|${clientIp(req)}|${token.userId}`
    const accountSleutel = `2fa-account|${token.userId}`
    const check = limiet.controleer(sleutel)
    const accountCheck = perAccount.controleer(accountSleutel)
    const geblokkeerd = !check.toegestaan ? check : !accountCheck.toegestaan ? accountCheck : null
    if (geblokkeerd) {
      await wisCookie(TWEEFA_COOKIE)
      return fout(429, `Te veel mislukte pogingen. Probeer het over ${Math.ceil(geblokkeerd.wachtSeconden / 60)} minuten opnieuw.`, {}, { 'Retry-After': String(geblokkeerd.wachtSeconden) })
    }
    const body = await leesJson<{ code?: unknown }>(req, 2_000)
    const gebruiker = await gebruikerOpId(token.userId)
    if (!gebruiker || !gebruiker.totpEnabled) return fout(401, 'Je inlogpoging is verlopen. Vul je wachtwoord opnieuw in.')
    const stap = verifieerTotp(totpGeheimVan(gebruiker), body?.code)
    if (stap === null || codeAlGebruikt(gebruiker.id, stap)) {
      limiet.mislukt(sleutel)
      perAccount.mislukt(accountSleutel)
      return fout(401, 'Deze code klopt niet. Wacht op de volgende code en probeer het opnieuw.')
    }
    limiet.reset(sleutel)
    perAccount.reset(accountSleutel)
    await wisCookie(TWEEFA_COOKIE)
    await zetSessie(gebruiker.id, gebruiker.sessieGeneratie)
    // Bijwerken mag de login niet laten mislukken: de sessie staat al.
    try {
      await raakIngelogd(gebruiker.id)
      // Een geheim uit een oude installatie staat nog leesbaar: nu versleutelen (de start van de server doet dat ook).
      versleutelTotpVan(gebruiker)
    } catch (e) {
      console.error(`[auth/2fa] bijwerken na login: ${(e as Error)?.name ?? 'onbekend'}`)
    }
    return json({ ok: true })
  } catch (e) {
    return serverFout(e, 'auth/2fa')
  }
}
