/**
 * Sessietokens (JWT HS256 met AUTH_SECRET). Alleen jose en Web Crypto, dus ook bruikbaar in de
 * edge-middleware. Het token bevat alleen het gebruikers-id, geen e-mailadres.
 *
 *  ib-sessie  volledige sessie na wachtwoord en 2FA, 7 dagen
 *  ib-2fa     tussenstap na een goed wachtwoord, 5 minuten
 *  ib-setup   tussenstap bij het aanmaken van het account, 15 minuten
 */
import { SignJWT, jwtVerify } from 'jose'
import { MIN_AUTH_SECRET } from './grenzen'

export const SESSIE_COOKIE = 'ib-sessie'
export const TWEEFA_COOKIE = 'ib-2fa'
export const SETUP_COOKIE = 'ib-setup'

export const SESSIE_DUUR = 60 * 60 * 24 * 7
export const TWEEFA_DUUR = 60 * 5
export const SETUP_DUUR = 60 * 15

export type TokenSoort = 'sessie' | '2fa' | 'setup'

const DUUR: Record<TokenSoort, number> = { sessie: SESSIE_DUUR, '2fa': TWEEFA_DUUR, setup: SETUP_DUUR }

const ISSUER = 'ibcalculator'

function sleutel(secret: string | undefined = process.env.AUTH_SECRET): Uint8Array {
  const s = secret?.trim()
  if (!s) throw new Error('AUTH_SECRET ontbreekt.')
  // Een kort geheim is met brute force te raden; dan liever geen tokens dan zwakke tokens.
  if (s.length < MIN_AUTH_SECRET) throw new Error(`AUTH_SECRET moet minimaal ${MIN_AUTH_SECRET} tekens zijn.`)
  return new TextEncoder().encode(s)
}

export interface TokenOpties {
  secret?: string
  /** Afwijkende geldigheid in seconden (tests). */
  duurSeconden?: number
  /** Tijdstip van uitgifte (tests). */
  nu?: Date
  /** Sessiegeneratie van het account; uitloggen verhoogt die en maakt oudere tokens ongeldig. */
  generatie?: number
}

export async function maakToken(userId: number, soort: TokenSoort, opties: TokenOpties = {}): Promise<string> {
  const nu = Math.floor((opties.nu ?? new Date()).getTime() / 1000)
  return new SignJWT({ typ: soort, gen: opties.generatie ?? 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setIssuedAt(nu)
    .setExpirationTime(nu + (opties.duurSeconden ?? DUUR[soort]))
    .sign(sleutel(opties.secret))
}

export interface TokenInhoud {
  userId: number
  soort: TokenSoort
  /** Sessiegeneratie bij uitgifte; tokens van voor deze claim tellen als 0. */
  generatie: number
}

/** Geeft de inhoud terug, of null bij een ongeldig, verlopen of verkeerd soort token. */
export async function verifieerToken(
  token: string | undefined | null,
  soort: TokenSoort,
  opties: { secret?: string; nu?: Date } = {},
): Promise<TokenInhoud | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, sleutel(opties.secret), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      currentDate: opties.nu,
    })
    if (payload.typ !== soort) return null
    const userId = Number(payload.sub)
    if (!Number.isInteger(userId) || userId <= 0) return null
    const generatie = payload.gen === undefined ? 0 : Number(payload.gen)
    if (!Number.isInteger(generatie) || generatie < 0) return null
    return { userId, soort, generatie }
  } catch {
    return null
  }
}

export function cookieOpties(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
