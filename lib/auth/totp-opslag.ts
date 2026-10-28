/**
 * Het TOTP-geheim staat versleuteld in de database (AES-256-GCM met DOSSIER_KEY, zie lib/crypto.ts), met de rij als
 * context: `users:<id>:totp` of, tijdens het instellen, `uitnodigingen:<id>:totp`. Zo is een geheim dat naar een andere
 * rij wordt gekopieerd onbruikbaar.
 *
 * Oude installaties bewaarden het geheim leesbaar. `leesTotp` leest beide vormen; `versleutelOudeTotpGeheimen`
 * zet de oude vorm bij de start van de server om (instrumentation.ts), en een geslaagde login doet dat ook voor dat ene
 * account.
 */
import { and, eq, ne, not, like } from 'drizzle-orm'
import { schrijf } from '@/lib/db'
import { users, type Gebruiker } from '@/lib/db/schema'
import { ontsleutel, versleutel } from '@/lib/crypto'

const VOORVOEGSEL = 'enc:'

export const aadTotp = {
  gebruiker: (id: number) => `users:${id}:totp`,
  uitnodiging: (id: number) => `uitnodigingen:${id}:totp`,
}

export function versleutelTotp(geheim: string, context: string): string {
  return VOORVOEGSEL + versleutel(geheim, context)
}

export function isVersleuteld(opgeslagen: string): boolean {
  return opgeslagen.startsWith(VOORVOEGSEL)
}

/** Het geheim in leesbare vorm (base32), uit de versleutelde of de oude, leesbare vorm. Leeg blijft leeg. */
export function leesTotp(opgeslagen: string, context: string): string {
  if (!opgeslagen) return ''
  if (!isVersleuteld(opgeslagen)) return opgeslagen
  return ontsleutel<string>(opgeslagen.slice(VOORVOEGSEL.length), context)
}

export function totpGeheimVan(g: Pick<Gebruiker, 'id' | 'totpSecret'>): string {
  return leesTotp(g.totpSecret, aadTotp.gebruiker(g.id))
}

/** Versleutelt het geheim van één account als dat nog in de oude vorm staat. */
export function versleutelTotpVan(g: Pick<Gebruiker, 'id' | 'totpSecret'>): void {
  if (!g.totpSecret || isVersleuteld(g.totpSecret)) return
  const nieuw = versleutelTotp(g.totpSecret, aadTotp.gebruiker(g.id))
  schrijf((tx) => {
    tx.update(users)
      .set({ totpSecret: nieuw })
      .where(and(eq(users.id, g.id), eq(users.totpSecret, g.totpSecret)))
      .run()
  })
}

/** Zet alle geheimen in de oude, leesbare vorm om. Geeft het aantal omgezette accounts. */
export function versleutelOudeTotpGeheimen(): number {
  return schrijf((tx) => {
    const oud = tx
      .select({ id: users.id, totpSecret: users.totpSecret })
      .from(users)
      .where(and(ne(users.totpSecret, ''), not(like(users.totpSecret, `${VOORVOEGSEL}%`))))
      .all()
    for (const g of oud) {
      tx.update(users)
        .set({ totpSecret: versleutelTotp(g.totpSecret, aadTotp.gebruiker(g.id)) })
        .where(eq(users.id, g.id))
        .run()
    }
    return oud.length
  })
}
