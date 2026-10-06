/**
 * Eenvoudige rate limiter in het geheugen: na `max` mislukte pogingen binnen `vensterMs` is de
 * sleutel geblokkeerd tot de oudste poging uit het venster valt. Per proces; voor één container
 * (CapRover) is dat voldoende. Sleutels worden gehasht opgeslagen, dus geen e-mailadressen in het geheugen.
 */
import { createHash } from 'node:crypto'

export interface RateLimiter {
  /** Mag deze sleutel het nog proberen? */
  controleer(sleutel: string, nu?: number): { toegestaan: boolean; wachtSeconden: number }
  mislukt(sleutel: string, nu?: number): void
  reset(sleutel: string): void
}

export function maakRateLimiter({ max = 5, vensterMs = 15 * 60 * 1000 }: { max?: number; vensterMs?: number } = {}): RateLimiter {
  const pogingen = new Map<string, number[]>()
  const id = (s: string) => createHash('sha256').update(s).digest('base64url')
  const actueel = (k: string, nu: number) => {
    const lijst = (pogingen.get(k) ?? []).filter((t) => nu - t < vensterMs)
    if (lijst.length === 0) pogingen.delete(k)
    else pogingen.set(k, lijst)
    return lijst
  }
  return {
    controleer(sleutel, nu = Date.now()) {
      const lijst = actueel(id(sleutel), nu)
      if (lijst.length < max) return { toegestaan: true, wachtSeconden: 0 }
      return { toegestaan: false, wachtSeconden: Math.max(1, Math.ceil((lijst[0] + vensterMs - nu) / 1000)) }
    },
    mislukt(sleutel, nu = Date.now()) {
      const k = id(sleutel)
      const lijst = actueel(k, nu)
      lijst.push(nu)
      pogingen.set(k, lijst)
      // Voorkom onbeperkte groei bij veel verschillende sleutels.
      if (pogingen.size > 10_000) {
        for (const sl of pogingen.keys()) {
          actueel(sl, nu)
          if (pogingen.size <= 5_000) break
        }
      }
    },
    reset(sleutel) {
      pogingen.delete(id(sleutel))
    },
  }
}

const g = globalThis as unknown as { __ibLoginLimiter?: RateLimiter; __ibIpLimiter?: RateLimiter; __ibAccountLimiter?: RateLimiter }

/** Gedeelde limiter voor inloggen, 2FA en setup: 5 mislukte pogingen per 15 minuten (per IP en e-mail of account). */
export function loginLimiter(): RateLimiter {
  return (g.__ibLoginLimiter ??= maakRateLimiter({ max: 5, vensterMs: 15 * 60 * 1000 }))
}

/**
 * Ruimere limiet per IP over alle e-mailadressen heen: 20 mislukte pogingen per 15 minuten. Voorkomt
 * dat één IP met steeds een ander adres onbeperkt wachtwoorden probeert (en de CPU bezighoudt met bcrypt).
 */
export function ipLimiter(): RateLimiter {
  return (g.__ibIpLimiter ??= maakRateLimiter({ max: 20, vensterMs: 15 * 60 * 1000 }))
}

/**
 * Limiet per account, los van het IP: 10 mislukte 2FA-codes per 15 minuten. Wie het wachtwoord al
 * heeft, kan de zes cijfers zo niet met wisselende IP-adressen raden.
 */
export function accountLimiter(): RateLimiter {
  return (g.__ibAccountLimiter ??= maakRateLimiter({ max: 10, vensterMs: 15 * 60 * 1000 }))
}
