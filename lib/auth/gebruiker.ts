/**
 * Databasefuncties voor de accounts. Het eerste account (via /dossier/setup) wordt beheerder; daarna komen er accounts
 * bij via een uitnodiging van een beheerder (lib/auth/uitnodiging.ts).
 *
 * Gelijktijdigheid: de installatie claimen (maakGebruiker, activeerTotp) gebeurt in één schrijf() (BEGIN IMMEDIATE),
 * zodat lezen, beslissen en schrijven ondeelbaar zijn, ook tegenover een ander proces. Hashen gebeurt vooraf, buiten de
 * transactie. id's zijn AUTOINCREMENT: een vervangen, niet afgerond account krijgt nooit hetzelfde id terug, dus een
 * setup-token van dat oude account past nooit op het nieuwe.
 */
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { dbFoutSoort, getDb, leegWal, schrijf, type Tx } from '@/lib/db'
import { households, koppelingen, uitnodigingen, users, type Gebruiker, type Rol } from '@/lib/db/schema'
import { hashWachtwoord } from './wachtwoord'
import { nieuwTotpGeheim } from './totp'
import { aadTotp, versleutelTotp } from './totp-opslag'

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
    const rij = tx.insert(users).values({ email, passwordHash, totpSecret: '', totpEnabled: false, rol: 'beheerder' }).returning({ id: users.id }).get()
    if (!rij) throw new Error('Het account is niet aangemaakt.')
    tx.update(users)
      .set({ totpSecret: versleutelTotp(secret, aadTotp.gebruiker(rij.id)) })
      .where(eq(users.id, rij.id))
      .run()
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
    // Wie de installatie claimt, is beheerder (ook een account uit een setup die openstond tijdens een update).
    const r = tx
      .update(users)
      .set({ totpEnabled: true, rol: 'beheerder' })
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

export const isBeheerder = (g: Pick<Gebruiker, 'rol'> | null | undefined): boolean => g?.rol === 'beheerder'

/** Fout met een HTTP-status voor de beheerroutes (404, 409, 422). */
export class AccountFout extends Error {
  readonly status: number
  constructor(status: number, melding: string) {
    super(melding)
    this.name = 'AccountFout'
    this.status = status
  }
}

export interface AccountPubliek {
  id: number
  email: string
  naam: string | null
  rol: Rol
  aangemaakt: string
  laatstIngelogd: string | null
}

/** Alle afgeronde accounts (met 2FA), voor de beheerpagina. Geen hashes of geheimen. */
export async function lijstAccounts(): Promise<AccountPubliek[]> {
  return getDb()
    .select({ id: users.id, email: users.email, naam: users.naam, rol: users.rol, createdAt: users.createdAt, laatstIngelogd: users.laatstIngelogd })
    .from(users)
    .where(eq(users.totpEnabled, true))
    .orderBy(asc(users.id))
    .all()
    .map((u) => ({ id: u.id, email: u.email, naam: u.naam, rol: u.rol, aangemaakt: u.createdAt.toISOString(), laatstIngelogd: u.laatstIngelogd ? u.laatstIngelogd.toISOString() : null }))
}

const aantalBeheerders = (tx: Tx) =>
  tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.rol, 'beheerder'), eq(users.totpEnabled, true)))
    .all().length

/**
 * Trekt de open uitnodigingen en herstellinks in die dit account heeft gemaakt (binnen een transactie). Hoort bij
 * verwijderen en degraderen: een (oud-)beheerder mag niet via een eerder gemaakte link terugkomen of een ander
 * account overnemen. Zonder `doorId`: alle open links (het laatste account gaat weg en setup gaat weer open).
 */
export function trekUitnodigingenIn(tx: Tx, doorId: number | null, nu: Date = new Date()): void {
  const open = and(isNull(uitnodigingen.gebruiktOp), isNull(uitnodigingen.ingetrokkenOp))
  tx.update(uitnodigingen)
    .set({ ingetrokkenOp: nu })
    .where(doorId === null ? open : and(open, eq(uitnodigingen.aangemaaktDoor, doorId)))
    .run()
}

/**
 * Zet de rol van een account. Er blijft altijd minstens één beheerder over: anders kan niemand meer accounts
 * uitnodigen of herstellen. Wie geen beheerder meer is, verliest ook zijn open uitnodigingen en herstellinks.
 */
export async function zetRol(id: number, rol: Rol): Promise<void> {
  schrijf((tx) => {
    const g = tx.select({ id: users.id, rol: users.rol }).from(users).where(and(eq(users.id, id), eq(users.totpEnabled, true))).get()
    if (!g) throw new AccountFout(404, 'Dit account bestaat niet (meer).')
    if (g.rol === rol) return
    if (g.rol === 'beheerder' && aantalBeheerders(tx) <= 1) throw new AccountFout(409, 'Er moet minstens één beheerder overblijven.')
    tx.update(users).set({ rol }).where(eq(users.id, id)).run()
    if (rol === 'gebruiker') trekUitnodigingenIn(tx, id)
  })
}

/**
 * Verwijdert een account met alles wat erbij hoort. Niet het eigen account en niet de laatste beheerder. Open links
 * die dit account maakte, worden eerst ingetrokken (aangemaakt_door wordt bij het verwijderen NULL). De koppelingen
 * gaan er expliciet uit en de WAL wordt geleegd, net als bij Alles verwijderen, zodat er geen (versleutelde) pagina's
 * van het dossier achterblijven.
 */
export async function verwijderAccount(id: number, doorId: number): Promise<void> {
  if (id === doorId) throw new AccountFout(409, 'Je kunt je eigen account hier niet verwijderen.')
  schrijf((tx) => {
    const g = tx.select({ id: users.id, rol: users.rol }).from(users).where(eq(users.id, id)).get()
    if (!g) throw new AccountFout(404, 'Dit account bestaat niet (meer).')
    if (g.rol === 'beheerder' && aantalBeheerders(tx) <= 1) throw new AccountFout(409, 'Er moet minstens één beheerder overblijven.')
    trekUitnodigingenIn(tx, id)
    tx.delete(koppelingen).where(inArray(koppelingen.householdId, tx.select({ id: households.id }).from(households).where(eq(households.userId, id)))).run()
    tx.delete(users).where(eq(users.id, id)).run()
  })
  try {
    if (!(await leegWal())) console.warn('Database: -wal na het verwijderen van een account nog niet leeg, een ander proces gebruikt de WAL')
  } catch (e) {
    console.warn(`Database: -wal legen na het verwijderen van een account mislukt (${dbFoutSoort(e) ?? 'onbekende fout'})`)
  }
}

/** Moment van de laatste geslaagde login (na 2FA). */
export async function raakIngelogd(id: number, nu: Date = new Date()): Promise<void> {
  getDb().update(users).set({ laatstIngelogd: nu }).where(eq(users.id, id)).run()
}
