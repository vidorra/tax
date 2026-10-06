/** Databasefuncties voor het (enige) account. */
import { asc, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { users, type Gebruiker } from '@/lib/db/schema'
import { hashWachtwoord } from './wachtwoord'
import { nieuwTotpGeheim } from './totp'

export function normaliseerEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const e = email.trim().toLowerCase()
  if (e.length < 3 || e.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  return e
}

export async function eersteGebruiker(): Promise<Gebruiker | null> {
  const rijen = await getDb().select().from(users).orderBy(asc(users.id)).limit(1)
  return rijen[0] ?? null
}

/** Is er een account met ingeschakelde 2FA? Zo ja, dan is setup gesloten. */
export async function setupAfgerond(): Promise<boolean> {
  const u = await eersteGebruiker()
  return Boolean(u?.totpEnabled)
}

export async function gebruikerOpEmail(email: string): Promise<Gebruiker | null> {
  const rijen = await getDb().select().from(users).where(eq(users.email, email)).limit(1)
  return rijen[0] ?? null
}

export async function gebruikerOpId(id: number): Promise<Gebruiker | null> {
  const rijen = await getDb().select().from(users).where(eq(users.id, id)).limit(1)
  return rijen[0] ?? null
}

/**
 * Maakt het account. Alleen als er nog geen account met 2FA bestaat. Een eerder, niet
 * afgerond account (zonder 2FA, dus zonder dossiergegevens) wordt vervangen.
 */
export async function maakGebruiker(email: string, wachtwoord: string): Promise<{ id: number; secret: string; uri: string } | null> {
  const db = getDb()
  const passwordHash = await hashWachtwoord(wachtwoord)
  const { secret, uri } = nieuwTotpGeheim(email)
  return db.transaction(async (tx) => {
    // Twee gelijktijdige installaties mogen niet allebei een account maken.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724001)`)
    const bestaand = await tx.select().from(users).orderBy(asc(users.id)).for('update')
    if (bestaand.some((u) => u.totpEnabled)) return null
    if (bestaand.length > 0) await tx.delete(users)
    const [rij] = await tx.insert(users).values({ email, passwordHash, totpSecret: secret, totpEnabled: false }).returning({ id: users.id })
    return { id: rij.id, secret, uri }
  })
}

export async function activeerTotp(id: number): Promise<void> {
  await getDb().update(users).set({ totpEnabled: true }).where(eq(users.id, id))
}

export async function verwijderGebruiker(id: number): Promise<void> {
  await getDb().delete(users).where(eq(users.id, id))
}

/** Trekt alle bestaande sessies van dit account in (uitloggen op alle apparaten). */
export async function verhoogSessieGeneratie(id: number): Promise<void> {
  await getDb()
    .update(users)
    .set({ sessieGeneratie: sql`${users.sessieGeneratie} + 1` })
    .where(eq(users.id, id))
}
