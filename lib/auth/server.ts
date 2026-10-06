/**
 * Sessie lezen en zetten in route handlers en server components (next/headers).
 */
import { cookies } from 'next/headers'
import { gebruikerOpId } from './gebruiker'
import { SESSIE_COOKIE, SESSIE_DUUR, cookieOpties, maakToken, verifieerToken, type TokenSoort } from './sessie'

export interface Sessie {
  userId: number
  generatie: number
}

/**
 * Geldige sessie uit de cookie, of null. Controleert het token en, als de database bereikbaar is,
 * ook of het account nog bestaat, 2FA aan heeft en de sessie niet door uitloggen is ingetrokken.
 * Zo stuurt de loginpagina een ingetrokken sessie niet terug naar het dossier (geen redirect-lus).
 * Is de database niet bereikbaar, dan geeft dit de sessie op basis van alleen het token terug;
 * vereisGebruiker en paginaContext lezen het account daarna opnieuw en melden de databasefout.
 */
export async function getSessie(): Promise<Sessie | null> {
  if (!process.env.AUTH_SECRET?.trim()) return null
  const store = await cookies()
  const inhoud = await verifieerToken(store.get(SESSIE_COOKIE)?.value, 'sessie')
  if (!inhoud) return null
  const sessie = { userId: inhoud.userId, generatie: inhoud.generatie }
  let gebruiker
  try {
    gebruiker = await gebruikerOpId(sessie.userId)
  } catch {
    return sessie
  }
  if (!gebruiker || !gebruiker.totpEnabled || !sessieNogGeldig(sessie, gebruiker)) return null
  return sessie
}

/** Is het token niet ingetrokken door uitloggen (sessiegeneratie van het account is niet verhoogd)? */
export function sessieNogGeldig(sessie: Pick<Sessie, 'generatie'>, gebruiker: { sessieGeneratie?: number | null }): boolean {
  return sessie.generatie === (gebruiker.sessieGeneratie ?? 0)
}

export async function leesToken(naam: string, soort: TokenSoort) {
  const store = await cookies()
  return verifieerToken(store.get(naam)?.value, soort)
}

export async function zetTokenCookie(naam: string, userId: number, soort: TokenSoort, duur: number, generatie = 0): Promise<void> {
  const store = await cookies()
  store.set(naam, await maakToken(userId, soort, { generatie }), cookieOpties(duur))
}

export async function zetSessie(userId: number, generatie = 0): Promise<void> {
  await zetTokenCookie(SESSIE_COOKIE, userId, 'sessie', SESSIE_DUUR, generatie)
}

export async function wisCookie(naam: string): Promise<void> {
  const store = await cookies()
  store.set(naam, '', { ...cookieOpties(0), maxAge: 0 })
}
