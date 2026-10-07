/**
 * Databasefuncties voor het (enige) account.
 *
 * Gelijktijdigheid: de installatie claimen (maakGebruiker, activeerTotp) gebeurt in één schrijf() (BEGIN IMMEDIATE),
 * zodat lezen, beslissen en schrijven ondeelbaar zijn, ook tegenover een ander proces. Hashen gebeurt vooraf, buiten de
 * transactie. id's zijn AUTOINCREMENT: een vervangen, niet afgerond account krijgt nooit hetzelfde id terug, dus een
 * setup-token van dat oude account past nooit op het nieuwe.
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { getDb, schrijf } from '@/lib/db'
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
  return getDb().select().from(users).orderBy(asc(users.id)).limit(1).get() ?? null
}

/** Is er een account met ingeschakelde 2FA? Zo ja, dan is setup gesloten. */
export async function setupAfgerond(): Promise<boolean> {
  return getDb().select({ id: users.id }).from(users).where(eq(users.totpEnabled, true)).limit(1).get() !== undefined
}

export async function gebruikerOpEmail(email: string): Promise<Gebruiker | null> {
  return getDb().select().from(users).where(eq(users.email, email)).limit(1).get() ?? null
}

export async function gebruikerOpId(id: number): Promise<Gebruiker | null> {
  return getDb().select().from(users).where(eq(users.id, id)).limit(1).get() ?? null
}

/**
 * Maakt het account. Alleen als er nog geen account met 2FA bestaat. Een eerder, niet afgerond account (zonder 2FA,
 * dus zonder dossiergegevens) wordt vervangen. Twee gelijktijdige installaties leveren samen één account op: de
 * tweede vervangt het niet afgeronde account van de eerste.
 */
export async function maakGebruiker(email: string, wachtwoord: string): Promise<{ id: number; secret: string; uri: string } | null> {
  const passwordHash = await hashWachtwoord(wachtwoord)
  const { secret, uri } = nieuwTotpGeheim(email)
  return schrijf((tx) => {
    const bestaand = tx.select({ id: users.id, totpEnabled: users.totpEnabled }).from(users).all()
    if (bestaand.some((u) => u.totpEnabled)) return null
    if (bestaand.length > 0) tx.delete(users).run()
    const rij = tx.insert(users).values({ email, passwordHash, totpSecret: secret, totpEnabled: false }).returning({ id: users.id }).get()
    if (!rij) throw new Error('Het account is niet aangemaakt.')
    return { id: rij.id, secret, uri }
  })
}

/**
 * Zet 2FA aan en claimt daarmee de installatie. Geeft false als dit account niet meer bestaat (vervangen door een
 * nieuwere installatie), 2FA al aan staat, of een ander account de installatie al heeft geclaimd.
 */
export async function activeerTotp(id: number): Promise<boolean> {
  return schrijf((tx) => {
    const ander = tx
      .select({ id: users.id })
      .from(users)
      .where(and(ne(users.id, id), eq(users.totpEnabled, true)))
      .limit(1)
      .get()
    if (ander) return false
    const r = tx
      .update(users)
      .set({ totpEnabled: true })
      .where(and(eq(users.id, id), eq(users.totpEnabled, false)))
      .run()
    return r.changes === 1
  })
}

export async function verwijderGebruiker(id: number): Promise<void> {
  getDb().delete(users).where(eq(users.id, id)).run()
}

/** Trekt alle bestaande sessies van dit account in (uitloggen op alle apparaten). Eén UPDATE, dus ondeelbaar. */
export async function verhoogSessieGeneratie(id: number): Promise<void> {
  getDb()
    .update(users)
    .set({ sessieGeneratie: sql`${users.sessieGeneratie} + 1` })
    .where(eq(users.id, id))
    .run()
}
