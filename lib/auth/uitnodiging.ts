/**
 * Uitnodigingen voor nieuwe accounts en herstellinks voor bestaande accounts.
 *
 * Verloop:
 *  1. Een beheerder maakt een uitnodiging (of herstellink). Het token (32 willekeurige bytes) gaat alleen in de mail;
 *     de database bewaart de SHA-256 ervan. De link zet het token achter een # (`/account/instellen#<token>`), zodat
 *     het niet in serverlogs of de Referer-header komt.
 *  2. De ontvanger kiest een wachtwoord (`startInstellen`): de bcrypt-hash en een nieuw, versleuteld TOTP-geheim staan
 *     dan klaar in de uitnodiging. Er is nog geen account en bij een herstel werkt het oude wachtwoord nog.
 *  3. De eerste goede code uit de authenticator-app (`rondAf`) maakt het account (of zet bij een herstel het nieuwe
 *     wachtwoord en geheim en trekt alle oude sessies in) en markeert de uitnodiging als gebruikt.
 *
 * Een uitnodiging werkt één keer, verloopt (7 dagen; een herstellink 48 uur) en is in te trekken. Een nieuwe uitnodiging
 * of herstellink voor hetzelfde adres trekt de vorige in. Alles wat leest en dan schrijft, gebeurt in één schrijf()
 * (BEGIN IMMEDIATE); hashen gebeurt ervoor.
 */
import { randomBytes } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { getDb, schrijf, type Tx } from '@/lib/db'
import { uitnodigingen, users, type Rol, type UitnodigingRij, type UitnodigingSoort } from '@/lib/db/schema'
import { sha256 } from '@/lib/crypto'
import { AccountFout } from './gebruiker'
import { hashWachtwoord } from './wachtwoord'
import { nieuwTotpGeheim } from './totp'
import { aadTotp, leesTotp, versleutelTotp } from './totp-opslag'

export const UITNODIGING_GELDIG_MS = 7 * 24 * 60 * 60 * 1000
export const HERSTEL_GELDIG_MS = 48 * 60 * 60 * 1000

const geldigheid = (soort: UitnodigingSoort) => (soort === 'herstel' ? HERSTEL_GELDIG_MS : UITNODIGING_GELDIG_MS)

/** Nieuw token voor in de link, en de hash voor de database. */
export function nieuwToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: sha256(token) }
}

/** Token uit een verzoek: base64url van 32 bytes (43 tekens). */
export function schoonToken(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const t = x.trim().replace(/^#/, '')
  return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null
}

export interface UitnodigingPubliek {
  id: number
  soort: UitnodigingSoort
  email: string
  naam: string | null
  rol: Rol
  aangemaakt: string
  verloopt: string
  gemaild: boolean
  status: 'open' | 'verlopen' | 'gebruikt' | 'ingetrokken'
}

function status(r: UitnodigingRij, nu: Date): UitnodigingPubliek['status'] {
  if (r.gebruiktOp) return 'gebruikt'
  if (r.ingetrokkenOp) return 'ingetrokken'
  if (r.verloopt.getTime() <= nu.getTime()) return 'verlopen'
  return 'open'
}

function publiek(r: UitnodigingRij, nu: Date): UitnodigingPubliek {
  return {
    id: r.id,
    soort: r.soort,
    email: r.email,
    naam: r.naam,
    rol: r.rol,
    aangemaakt: r.aangemaakt.toISOString(),
    verloopt: r.verloopt.toISOString(),
    gemaild: r.gemaildOp !== null,
    status: status(r, nu),
  }
}

/** Uitnodigingen en herstellinks van de laatste 30 dagen, nieuwste eerst, voor de beheerpagina. */
export async function lijstUitnodigingen(nu: Date = new Date()): Promise<UitnodigingPubliek[]> {
  const grens = new Date(nu.getTime() - 30 * 24 * 60 * 60 * 1000)
  return getDb()
    .select()
    .from(uitnodigingen)
    .where(gt(uitnodigingen.aangemaakt, grens))
    .orderBy(desc(uitnodigingen.id))
    .all()
    .map((r) => publiek(r, nu))
}

/** Trekt de open uitnodigingen en herstellinks voor dit adres in (binnen een transactie). */
function trekOpenIn(tx: Tx, email: string, nu: Date): void {
  tx.update(uitnodigingen)
    .set({ ingetrokkenOp: nu })
    .where(and(eq(uitnodigingen.email, email), isNull(uitnodigingen.gebruiktOp), isNull(uitnodigingen.ingetrokkenOp)))
    .run()
}

export interface NieuweUitnodiging {
  id: number
  token: string
  email: string
  naam: string | null
  soort: UitnodigingSoort
  verloopt: Date
}

/** Nieuwe uitnodiging voor een adres zonder account. Een eerdere open uitnodiging voor dit adres vervalt. */
export async function maakUitnodiging(invoer: { email: string; naam: string | null; rol: Rol; doorId: number }, nu: Date = new Date()): Promise<NieuweUitnodiging> {
  const { token, hash } = nieuwToken()
  const verloopt = new Date(nu.getTime() + UITNODIGING_GELDIG_MS)
  return schrijf((tx) => {
    const bestaand = tx.select({ id: users.id }).from(users).where(and(eq(users.email, invoer.email), eq(users.totpEnabled, true))).get()
    if (bestaand) throw new AccountFout(409, 'Er bestaat al een account met dit e-mailadres. Stuur een herstellink als die persoon er niet meer in kan.')
    trekOpenIn(tx, invoer.email, nu)
    const rij = tx
      .insert(uitnodigingen)
      .values({ soort: 'uitnodiging', email: invoer.email, naam: invoer.naam, rol: invoer.rol, tokenHash: hash, aangemaaktDoor: invoer.doorId, aangemaakt: nu, verloopt })
      .returning({ id: uitnodigingen.id })
      .get()
    return { id: rij.id, token, email: invoer.email, naam: invoer.naam, soort: 'uitnodiging', verloopt }
  })
}

/** Herstellink voor een bestaand account: nieuw wachtwoord en nieuwe authenticator-app. */
export async function maakHerstel(userId: number, doorId: number, nu: Date = new Date()): Promise<NieuweUitnodiging> {
  const { token, hash } = nieuwToken()
  const verloopt = new Date(nu.getTime() + HERSTEL_GELDIG_MS)
  return schrijf((tx) => {
    const g = tx.select().from(users).where(and(eq(users.id, userId), eq(users.totpEnabled, true))).get()
    if (!g) throw new AccountFout(404, 'Dit account bestaat niet (meer).')
    trekOpenIn(tx, g.email, nu)
    const rij = tx
      .insert(uitnodigingen)
      .values({ soort: 'herstel', email: g.email, naam: g.naam, rol: g.rol, userId: g.id, tokenHash: hash, aangemaaktDoor: doorId, aangemaakt: nu, verloopt })
      .returning({ id: uitnodigingen.id })
      .get()
    return { id: rij.id, token, email: g.email, naam: g.naam, soort: 'herstel', verloopt }
  })
}

/**
 * Nieuw token voor een open of verlopen uitnodiging (opnieuw versturen). Het oude token werkt daarna niet meer en een
 * half ingesteld wachtwoord vervalt.
 */
export async function vernieuw(id: number, nu: Date = new Date()): Promise<NieuweUitnodiging> {
  const { token, hash } = nieuwToken()
  return schrijf((tx) => {
    const r = tx.select().from(uitnodigingen).where(eq(uitnodigingen.id, id)).get()
    if (!r) throw new AccountFout(404, 'Deze uitnodiging bestaat niet (meer).')
    if (r.gebruiktOp) throw new AccountFout(409, 'Deze uitnodiging is al gebruikt.')
    if (r.ingetrokkenOp) throw new AccountFout(409, 'Deze uitnodiging is ingetrokken. Maak een nieuwe.')
    if (r.soort === 'uitnodiging') {
      const bestaand = tx.select({ id: users.id }).from(users).where(and(eq(users.email, r.email), eq(users.totpEnabled, true))).get()
      if (bestaand) throw new AccountFout(409, 'Er bestaat al een account met dit e-mailadres.')
    }
    const verloopt = new Date(nu.getTime() + geldigheid(r.soort))
    tx.update(uitnodigingen)
      .set({ tokenHash: hash, verloopt, gemaildOp: null, wachtwoordHash: null, totpEnc: null })
      .where(eq(uitnodigingen.id, id))
      .run()
    return { id: r.id, token, email: r.email, naam: r.naam, soort: r.soort, verloopt }
  })
}

export async function trekIn(id: number, nu: Date = new Date()): Promise<boolean> {
  const r = getDb()
    .update(uitnodigingen)
    .set({ ingetrokkenOp: nu })
    .where(and(eq(uitnodigingen.id, id), isNull(uitnodigingen.gebruiktOp), isNull(uitnodigingen.ingetrokkenOp)))
    .run()
  return r.changes === 1
}

export async function markeerGemaild(id: number, nu: Date = new Date()): Promise<void> {
  getDb().update(uitnodigingen).set({ gemaildOp: nu }).where(eq(uitnodigingen.id, id)).run()
}

/** De uitnodiging bij dit token, als die nog bruikbaar is (niet gebruikt, niet ingetrokken, niet verlopen). */
export function geldigeUitnodiging(token: string, nu: Date = new Date()): UitnodigingRij | null {
  const r = getDb().select().from(uitnodigingen).where(eq(uitnodigingen.tokenHash, sha256(token))).get()
  return r && status(r, nu) === 'open' ? r : null
}

export const VERLOPEN_MELDING = 'Deze link is verlopen, al gebruikt of ingetrokken. Vraag de beheerder om een nieuwe.'

/**
 * Stap 2: wachtwoord kiezen. Zet de hash en een nieuw TOTP-geheim klaar in de uitnodiging en geeft het geheim terug
 * voor de QR-code. Twee keer starten (bijvoorbeeld na het herladen van de pagina) vervangt de vorige poging.
 */
export async function startInstellen(token: string, wachtwoord: string, nu: Date = new Date()): Promise<{ id: number; secret: string; uri: string; poging: number }> {
  const vooraf = geldigeUitnodiging(token, nu)
  if (!vooraf) throw new AccountFout(410, VERLOPEN_MELDING)
  const wachtwoordHash = await hashWachtwoord(wachtwoord)
  const { secret, uri } = nieuwTotpGeheim(vooraf.email)
  const totpEnc = versleutelTotp(secret, aadTotp.uitnodiging(vooraf.id))
  schrijf((tx) => {
    const r = tx.select().from(uitnodigingen).where(eq(uitnodigingen.id, vooraf.id)).get()
    if (!r || r.tokenHash !== vooraf.tokenHash || status(r, nu) !== 'open') throw new AccountFout(410, VERLOPEN_MELDING)
    tx.update(uitnodigingen).set({ wachtwoordHash, totpEnc }).where(eq(uitnodigingen.id, r.id)).run()
  })
  return { id: vooraf.id, secret, uri, poging: pogingNummer(totpEnc) }
}

/** Het klaargezette TOTP-geheim van een uitnodiging in stap 3, of null als die niet (meer) in stap 3 is. */
export function geheimInInstellen(id: number, nu: Date = new Date()): { geheim: string; rij: UitnodigingRij } | null {
  const r = getDb().select().from(uitnodigingen).where(eq(uitnodigingen.id, id)).get()
  if (!r || status(r, nu) !== 'open' || !r.wachtwoordHash || !r.totpEnc) return null
  return { geheim: leesTotp(r.totpEnc, aadTotp.uitnodiging(r.id)), rij: r }
}

/**
 * Stap 3, na een goede code: maakt het account (uitnodiging) of zet het nieuwe wachtwoord en geheim (herstel), en
 * markeert de uitnodiging als gebruikt. Geeft het account en de sessiegeneratie voor de nieuwe sessie. `verwacht` is de
 * rij zoals die bij de controle van de code werd gelezen: is die intussen veranderd (opnieuw verstuurd, opnieuw
 * gestart, ingetrokken), dan gaat het niet door.
 */
export function rondAf(verwacht: UitnodigingRij, nu: Date = new Date()): { userId: number; generatie: number; soort: UitnodigingSoort; email: string } {
  return schrijf((tx) => {
    const r = tx.select().from(uitnodigingen).where(eq(uitnodigingen.id, verwacht.id)).get()
    if (!r || status(r, nu) !== 'open' || r.tokenHash !== verwacht.tokenHash || r.totpEnc !== verwacht.totpEnc || !r.wachtwoordHash || !r.totpEnc) {
      throw new AccountFout(410, VERLOPEN_MELDING)
    }
    const geheim = leesTotp(r.totpEnc, aadTotp.uitnodiging(r.id))
    let userId: number
    let generatie: number
    if (r.soort === 'uitnodiging') {
      const bestaand = tx.select().from(users).where(eq(users.email, r.email)).get()
      if (bestaand?.totpEnabled) throw new AccountFout(409, 'Er bestaat al een account met dit e-mailadres. Log in om verder te gaan.')
      // Een half afgerond account uit de eerste installatie met hetzelfde adres (zonder 2FA, dus zonder gegevens) gaat weg.
      if (bestaand) tx.delete(users).where(eq(users.id, bestaand.id)).run()
      const rij = tx
        .insert(users)
        .values({ email: r.email, naam: r.naam, rol: r.rol, passwordHash: r.wachtwoordHash, totpSecret: '', totpEnabled: true })
        .returning({ id: users.id, sessieGeneratie: users.sessieGeneratie })
        .get()
      tx.update(users).set({ totpSecret: versleutelTotp(geheim, aadTotp.gebruiker(rij.id)) }).where(eq(users.id, rij.id)).run()
      userId = rij.id
      generatie = rij.sessieGeneratie
    } else {
      const g = r.userId === null ? null : tx.select().from(users).where(eq(users.id, r.userId)).get()
      if (!g) throw new AccountFout(410, VERLOPEN_MELDING)
      const bij = tx
        .update(users)
        .set({
          passwordHash: r.wachtwoordHash,
          totpSecret: versleutelTotp(geheim, aadTotp.gebruiker(g.id)),
          totpEnabled: true,
          // Telefoon kwijt of wachtwoord uitgelekt: oude sessies werken niet meer.
          sessieGeneratie: sql`${users.sessieGeneratie} + 1`,
        })
        .where(eq(users.id, g.id))
        .returning({ sessieGeneratie: users.sessieGeneratie })
        .get()
      userId = g.id
      generatie = bij.sessieGeneratie
    }
    tx.update(uitnodigingen)
      .set({ gebruiktOp: nu, userId, wachtwoordHash: null, totpEnc: null })
      .where(eq(uitnodigingen.id, r.id))
      .run()
    return { userId, generatie, soort: r.soort, email: r.email }
  })
}

/**
 * Nummer van één instelpoging: afgeleid van het klaargezette, versleutelde geheim, dat bij elke start (en bij opnieuw
 * versturen) verandert. Gaat als `gen` in de instelcookie, zodat een cookie van een eerdere poging niet tegen het geheim
 * van een latere poging kan raden of de begrenzer van de echte ontvanger kan laten vollopen.
 */
export function pogingNummer(totpEnc: string): number {
  return Number.parseInt(sha256(totpEnc).slice(0, 8), 16)
}
