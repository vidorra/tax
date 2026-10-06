import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'

export const TOTP_ISSUER = 'IB-calculator'
const PERIODE = 30

function totp(secret: string, label = 'dossier'): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIODE,
    secret: OTPAuth.Secret.fromBase32(secret),
  })
}

export function nieuwTotpGeheim(email: string): { secret: string; uri: string } {
  const secret = new OTPAuth.Secret({ size: 20 }).base32
  return { secret, uri: totp(secret, email).toString() }
}

/** Code die nu geldig is (tests en eigen controle). */
export function totpCode(secret: string, nu: number = Date.now()): string {
  return totp(secret).generate({ timestamp: nu })
}

/**
 * Controleert een code met een venster van één periode ervoor en erna. Geeft de tijdstap terug
 * waarop de code hoort (voor replay-bescherming), of null.
 */
export function verifieerTotp(secret: string, code: unknown, nu: number = Date.now()): number | null {
  if (!secret || typeof code !== 'string') return null
  const schoon = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(schoon)) return null
  const delta = totp(secret).validate({ token: schoon, window: 1, timestamp: nu })
  if (delta === null) return null
  return Math.floor(nu / 1000 / PERIODE) + delta
}

export function qrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri, { width: 220, margin: 2, color: { dark: '#111827', light: '#ffffff' } })
}

/** Laatst gebruikte tijdstap per gebruiker, zodat een code niet twee keer werkt. */
const g = globalThis as unknown as { __ibTotpGebruikt?: Map<number, number> }

export function codeAlGebruikt(userId: number, tijdstap: number): boolean {
  const map = (g.__ibTotpGebruikt ??= new Map())
  const vorige = map.get(userId)
  if (vorige !== undefined && tijdstap <= vorige) return true
  map.set(userId, tijdstap)
  return false
}
