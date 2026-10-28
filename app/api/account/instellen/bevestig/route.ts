import { clientIp, fout, herkomstFout, json, leesJson, nietGeconfigureerd, serverFout } from '@/lib/auth/api'
import { AccountFout, raakIngelogd } from '@/lib/auth/gebruiker'
import { accountLimiter, loginLimiter } from '@/lib/auth/rate-limit'
import { INSTELLEN_COOKIE } from '@/lib/auth/sessie'
import { leesToken, wisCookie, zetSessie } from '@/lib/auth/server'
import { codeAlGebruikt, verifieerTotp } from '@/lib/auth/totp'
import { geheimInInstellen, pogingNummer, rondAf } from '@/lib/auth/uitnodiging'
import { meldHerstelAfgerond } from '@/lib/auth/uitnodiging-mail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VERLOPEN = 'Het instellen is verlopen. Open de link uit de mail opnieuw.'

/** Stap 3: eerste code uit de authenticator-app. Maakt het account (of zet het herstel door) en logt direct in. */
export async function POST(req: Request) {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = herkomstFout(req)
  if (herkomst) return herkomst
  try {
    const token = await leesToken(INSTELLEN_COOKIE, 'instellen')
    if (!token) return fout(401, VERLOPEN)
    const uitnodigingId = token.userId
    const limiet = loginLimiter()
    const perUitnodiging = accountLimiter()
    const sleutel = `instellen-code|${clientIp(req)}|${uitnodigingId}`
    const uitnodigingSleutel = `instellen-uitnodiging|${uitnodigingId}`
    const check = limiet.controleer(sleutel)
    const uCheck = perUitnodiging.controleer(uitnodigingSleutel)
    const geblokkeerd = !check.toegestaan ? check : !uCheck.toegestaan ? uCheck : null
    if (geblokkeerd) return fout(429, `Te veel pogingen. Probeer het over ${Math.ceil(geblokkeerd.wachtSeconden / 60)} minuten opnieuw.`, {}, { 'Retry-After': String(geblokkeerd.wachtSeconden) })

    const body = await leesJson<{ code?: unknown }>(req, 2_000)
    const bezig = geheimInInstellen(uitnodigingId)
    // De cookie hoort bij één poging: na een nieuwe start of opnieuw versturen werkt een oude cookie niet meer.
    if (!bezig || pogingNummer(bezig.rij.totpEnc!) !== token.generatie) {
      await wisCookie(INSTELLEN_COOKIE)
      return fout(401, VERLOPEN)
    }
    const stap = verifieerTotp(bezig.geheim, body?.code)
    // Eigen sleutelruimte voor replay: negatief id, zodat het nooit samenvalt met een account-id.
    if (stap === null || codeAlGebruikt(-uitnodigingId, stap)) {
      limiet.mislukt(sleutel)
      perUitnodiging.mislukt(uitnodigingSleutel)
      return fout(401, 'Deze code klopt niet. Controleer de tijd op je telefoon en probeer de volgende code.')
    }
    const { userId, generatie, soort, email } = rondAf(bezig.rij)
    limiet.reset(sleutel)
    perUitnodiging.reset(uitnodigingSleutel)
    // De code is al gebruikt voor het instellen; ook als account mag hij niet nog een keer werken.
    codeAlGebruikt(userId, stap)
    await wisCookie(INSTELLEN_COOKIE)
    await zetSessie(userId, generatie)
    await raakIngelogd(userId)
    if (soort === 'herstel') await meldHerstelAfgerond(email).catch(() => console.warn('[account/herstel] bevestigingsmail mislukt'))
    return json({ ok: true })
  } catch (e) {
    if (e instanceof AccountFout) return fout(e.status, e.message)
    return serverFout(e, 'account/instellen/bevestig')
  }
}
