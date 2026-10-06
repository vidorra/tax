import { herkomstFout, json, nietGeconfigureerd } from '@/lib/auth/api'
import { gebruikerOpId, verhoogSessieGeneratie } from '@/lib/auth/gebruiker'
import { SESSIE_COOKIE, TWEEFA_COOKIE } from '@/lib/auth/sessie'
import { leesToken, sessieNogGeldig, wisCookie } from '@/lib/auth/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Uitloggen wist de cookies én trekt de sessie server-side in door de sessiegeneratie van het
 * account te verhogen. Daarmee werkt ook een gekopieerd token niet meer; dat geldt voor alle
 * apparaten van dit account.
 */
export async function POST(req: Request) {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = herkomstFout(req)
  if (herkomst) return herkomst
  let ingetrokken = false
  try {
    const token = await leesToken(SESSIE_COOKIE, 'sessie')
    if (token) {
      const gebruiker = await gebruikerOpId(token.userId)
      if (gebruiker && sessieNogGeldig(token, gebruiker)) {
        await verhoogSessieGeneratie(gebruiker.id)
        ingetrokken = true
      }
    }
  } catch (e) {
    console.error(`[auth/logout] fout: ${e instanceof Error ? e.name : 'onbekend'}`)
  }
  await wisCookie(SESSIE_COOKIE)
  await wisCookie(TWEEFA_COOKIE)
  return json({ ok: true, ingetrokken })
}
