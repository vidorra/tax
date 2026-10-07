/**
 * Administratie van de back-ups in de tabel backups.
 *
 * Een geplande back-up heeft per periode ('JJJJ-MM') precies één rij. claimGepland zet die rij atomair op
 * 'bezig', zodat twee tikken van de scheduler, de CLI naast de app of een tweede container tijdens een deploy
 * nooit allebei dezelfde back-up mailen. Een handmatige back-up krijgt steeds een nieuwe rij; startHandmatig
 * bewaakt dat er niet te vaak of dubbel wordt gestart.
 *
 * Gelijktijdigheid: claimGepland en startHandmatig lezen, beslissen en schrijven binnen één schrijf() (BEGIN
 * IMMEDIATE). De schrijflock wordt bij de start genomen, dus tussen lezen en schrijven kan geen ander proces iets
 * wijzigen, en binnen het proces ook niet (better-sqlite3 is synchroon). rondAf en markeerAfgebroken zijn één
 * UPDATE en daarmee al atomair.
 *
 * Tijden: Date in de code, ISO-tekst (UTC) in de database. 'Nu' komt van de klok van de server (new Date()),
 * niet van het moment dat de scheduler meegeeft, net als now() voorheen in Postgres.
 *
 * Foutmeldingen in de tabel zijn kort en zonder geheimen; dat bewaakt de aanroeper, rondAf kapt alleen af.
 */
import { and, count, desc, eq, gt, inArray, lte } from 'drizzle-orm'

import { getDb, schrijf } from '@/lib/db'
import { backups, type BackupRij } from '@/lib/db/schema'

import { wachttijdUren } from './planning'
import type { BackupRun, BackupStatus, RijTelling } from './types'

/** Een run die zo lang 'bezig' is, is vastgelopen (bijvoorbeeld een herstart midden in het mailen). */
export const VASTGELOPEN_NA_MS = 60 * 60_000

/** Binnen deze tijd telt een lopende run als bezig voor startHandmatig. */
export const BEZIG_BINNEN_MS = 10 * 60_000

/** Maximaal aantal handmatige back-ups per uur. */
export const HANDMATIG_PER_UUR = 3

const UUR_MS = 60 * 60_000

const MAX_FOUT = 300

const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/

function naarRun(r: BackupRij): BackupRun {
  return {
    id: r.id,
    soort: r.soort,
    periode: r.periode,
    status: r.status,
    pogingen: r.pogingen,
    gestartOp: r.gestartOp.toISOString(),
    afgerondOp: r.afgerondOp ? r.afgerondOp.toISOString() : null,
    bytes: r.bytes,
    sha256: r.sha256,
    rijen: r.rijen ?? null,
    fout: r.fout,
  }
}

const voor = (nu: Date, ms: number) => new Date(nu.getTime() - ms)

/**
 * Mag een bestaande geplande run opnieuw? Na een mislukte poging pas na wachttijdUren(pogingen) (1, 2, 4, 8, 16 en
 * daarna 24 uur, gerekend vanaf de start van die poging); een run die langer dan een uur 'bezig' is, is
 * vastgelopen en mag ook opnieuw. Verstuurd en te-groot zijn klaar.
 */
function opnieuwTeClaimen(rij: Pick<BackupRij, 'status' | 'pogingen' | 'gestartOp'>, nu: Date): boolean {
  if (rij.status === 'mislukt') return rij.gestartOp.getTime() <= nu.getTime() - wachttijdUren(rij.pogingen) * UUR_MS
  if (rij.status === 'bezig') return rij.gestartOp.getTime() <= nu.getTime() - VASTGELOPEN_NA_MS
  return false
}

/**
 * Claimt de geplande back-up van een periode ('JJJJ-MM'): een nieuwe rij, of de bestaande rij opnieuw op 'bezig'
 * met een poging erbij. Lezen, beslissen en schrijven gebeuren in één transactie met de schrijflock (BEGIN
 * IMMEDIATE), dus bij gelijktijdige aanroepen, ook uit verschillende processen, krijgt er precies één een claim.
 * Geeft null als de periode al gedaan is (verstuurd of te-groot), nu bezig is, of na een mislukte poging nog in de
 * wachttijd zit. De partiële unieke index backups_periode_gepland_uniek blijft de vangrail.
 */
export async function claimGepland(periode: string, nu: Date = new Date()): Promise<{ id: number; poging: number } | null> {
  if (!PERIODE.test(periode)) throw new Error('Periode moet de vorm JJJJ-MM hebben.')
  return schrijf((tx) => {
    const bestaand = tx
      .select({ id: backups.id, status: backups.status, pogingen: backups.pogingen, gestartOp: backups.gestartOp })
      .from(backups)
      .where(and(eq(backups.soort, 'gepland'), eq(backups.periode, periode)))
      .get()
    if (!bestaand) {
      const nieuw = tx.insert(backups).values({ soort: 'gepland', periode, status: 'bezig', gestartOp: nu }).returning({ id: backups.id }).get()
      return { id: nieuw.id, poging: 1 }
    }
    if (!opnieuwTeClaimen(bestaand, nu)) return null
    const poging = bestaand.pogingen + 1
    tx.update(backups)
      .set({ status: 'bezig', pogingen: poging, gestartOp: nu, afgerondOp: null, fout: null, bytes: null, sha256: null, rijen: null })
      .where(eq(backups.id, bestaand.id))
      .run()
    return { id: bestaand.id, poging }
  })
}

/**
 * Start een handmatige back-up. Geweigerd met 'bezig' als er in de afgelopen 10 minuten een run (gepland of
 * handmatig) is gestart die nog bezig is, en met 'te-vaak' bij 3 of meer handmatige runs in het afgelopen uur.
 * Tellen en invoegen gebeuren in één transactie met de schrijflock, dus gelijktijdige aanroepen starten er
 * hooguit één.
 */
export async function startHandmatig(nu: Date = new Date()): Promise<{ id: number } | { geweigerd: 'bezig' | 'te-vaak' }> {
  return schrijf((tx) => {
    const bezig = tx
      .select({ n: count() })
      .from(backups)
      .where(and(eq(backups.status, 'bezig'), gt(backups.gestartOp, voor(nu, BEZIG_BINNEN_MS))))
      .get()!.n
    if (bezig > 0) return { geweigerd: 'bezig' as const }
    const handmatig = tx
      .select({ n: count() })
      .from(backups)
      .where(and(eq(backups.soort, 'handmatig'), gt(backups.gestartOp, voor(nu, UUR_MS))))
      .get()!.n
    if (handmatig >= HANDMATIG_PER_UUR) return { geweigerd: 'te-vaak' as const }
    const rij = tx.insert(backups).values({ soort: 'handmatig', status: 'bezig', gestartOp: nu }).returning({ id: backups.id }).get()
    return { id: rij.id }
  })
}

/**
 * Legt de uitkomst van een run vast. Alleen een run die nog 'bezig' is wordt bijgewerkt, zodat een
 * vastgelopen poging die alsnog afloopt de uitkomst van een latere poging niet overschrijft.
 */
export async function rondAf(
  id: number,
  uitkomst: { status: Exclude<BackupStatus, 'bezig'>; bytes?: number; sha256?: string; rijen?: RijTelling; fout?: string },
): Promise<void> {
  const fout = uitkomst.fout ? Array.from(uitkomst.fout).slice(0, MAX_FOUT).join('') : null
  getDb()
    .update(backups)
    .set({ status: uitkomst.status, afgerondOp: new Date(), bytes: uitkomst.bytes ?? null, sha256: uitkomst.sha256 ?? null, rijen: uitkomst.rijen ?? null, fout })
    .where(and(eq(backups.id, id), eq(backups.status, 'bezig')))
    .run()
}

/**
 * Zet runs die langer dan een uur 'bezig' zijn op 'mislukt', zodat de kaart niet maandenlang 'Bezig' toont
 * na een herstart midden in een run. Een geplande run blijft daarna gewoon opnieuw te claimen (de wachttijd
 * na één poging is een uur, gerekend vanaf de start). Geeft het aantal bijgewerkte runs.
 */
export async function markeerAfgebroken(nu: Date = new Date()): Promise<number> {
  return getDb()
    .update(backups)
    .set({ status: 'mislukt', afgerondOp: nu, fout: 'Afgebroken, bijvoorbeeld door een herstart van de server.' })
    .where(and(eq(backups.status, 'bezig'), lte(backups.gestartOp, voor(nu, VASTGELOPEN_NA_MS))))
    .run().changes
}

/** De laatst gestarte run, van welke soort ook. */
export async function laatsteRun(): Promise<BackupRun | null> {
  const r = getDb().select().from(backups).orderBy(desc(backups.gestartOp), desc(backups.id)).limit(1).get()
  return r ? naarRun(r) : null
}

/** De laatste run die is verstuurd. (In SQLite komt NULL bij DESC achteraan.) */
export async function laatsteGeslaagd(): Promise<BackupRun | null> {
  const r = getDb().select().from(backups).where(eq(backups.status, 'verstuurd')).orderBy(desc(backups.afgerondOp), desc(backups.id)).limit(1).get()
  return r ? naarRun(r) : null
}

/** Periodes waarvan de geplande back-up klaar is: verstuurd of te groot om te mailen. */
export async function gedanePeriodes(): Promise<Set<string>> {
  const rijen = getDb()
    .select({ periode: backups.periode })
    .from(backups)
    .where(and(eq(backups.soort, 'gepland'), inArray(backups.status, ['verstuurd', 'te-groot'])))
    .all()
  return new Set(rijen.map((r) => r.periode).filter((p): p is string => p !== null))
}
