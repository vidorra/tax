/**
 * Administratie van de back-ups in de tabel backups (migratie 0004).
 *
 * Een geplande back-up heeft per periode ('JJJJ-MM') precies één rij. claimGepland zet die rij atomair op
 * 'bezig', zodat twee servers (of twee tikken van de scheduler) nooit allebei dezelfde back-up mailen.
 * Een handmatige back-up krijgt steeds een nieuwe rij; startHandmatig bewaakt dat er niet te vaak of
 * dubbel wordt gestart.
 *
 * Foutmeldingen in de tabel zijn kort en zonder geheimen; dat bewaakt de aanroeper, rondAf kapt alleen af.
 */
import { getPool } from '@/lib/db'
import { LOCK } from '@/lib/db/locks'

import type { BackupRun, BackupSoort, BackupStatus, RijTelling } from './types'

/** Advisory lock voor startHandmatig; alle sleutels staan in lib/db/locks.ts. */
const HANDMATIG_LOCK = LOCK.backupHandmatig

/** Een run die zo lang 'bezig' is, is vastgelopen (bijvoorbeeld een herstart midden in het mailen). */
const VASTGELOPEN_NA = "interval '1 hour'"

/** Binnen deze tijd telt een lopende run als bezig voor startHandmatig. */
const BEZIG_BINNEN = "interval '10 minutes'"

/** Maximaal aantal handmatige back-ups per uur. */
const HANDMATIG_PER_UUR = 3

const MAX_FOUT = 300

interface Rij {
  id: number
  soort: BackupSoort
  periode: string | null
  status: BackupStatus
  pogingen: number
  gestart_op: Date
  afgerond_op: Date | null
  bytes: number | null
  sha256: string | null
  rijen: RijTelling | null
  fout: string | null
}

function naarRun(r: Rij): BackupRun {
  return {
    id: r.id,
    soort: r.soort,
    periode: r.periode,
    status: r.status,
    pogingen: r.pogingen,
    gestartOp: r.gestart_op.toISOString(),
    afgerondOp: r.afgerond_op ? r.afgerond_op.toISOString() : null,
    bytes: r.bytes,
    sha256: r.sha256,
    rijen: r.rijen,
    fout: r.fout,
  }
}

const KOLOMMEN = 'id, soort, periode, status, pogingen, gestart_op, afgerond_op, bytes, sha256, rijen, fout'

/**
 * Claimt de geplande back-up van een periode ('JJJJ-MM'). Eén statement, dus atomair: bij gelijktijdige
 * aanroepen krijgt er precies één een claim. Geeft null als de periode al gedaan is (verstuurd of
 * te-groot), nu bezig is, of na een mislukte poging nog in de wachttijd zit.
 *
 * De wachttijd na een mislukte poging is gelijk aan wachttijdUren(pogingen) in lib/backup/planning.ts:
 * 1, 2, 4, 8, 16 en daarna 24 uur, gerekend vanaf de start van de vorige poging. De exponent is begrensd
 * op 5, zodat power(2, ...) ook na heel veel pogingen niet buiten het bereik van integer valt.
 * Een run die langer dan een uur 'bezig' is, telt als vastgelopen en mag opnieuw.
 */
export async function claimGepland(periode: string): Promise<{ id: number; poging: number } | null> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) throw new Error('Periode moet de vorm JJJJ-MM hebben.')
  const { rows } = await getPool().query<{ id: number; pogingen: number }>(
    `INSERT INTO backups (soort, periode, status) VALUES ('gepland', $1, 'bezig')
     ON CONFLICT (periode) WHERE soort = 'gepland' DO UPDATE
        SET status = 'bezig', pogingen = backups.pogingen + 1, gestart_op = now(), afgerond_op = NULL,
            fout = NULL, bytes = NULL, sha256 = NULL, rijen = NULL
      WHERE (backups.status = 'mislukt'
             AND backups.gestart_op <= now() - make_interval(hours => least(power(2, least(greatest(backups.pogingen - 1, 0), 5)), 24)::int))
         OR (backups.status = 'bezig' AND backups.gestart_op <= now() - ${VASTGELOPEN_NA})
     RETURNING id, pogingen`,
    [periode],
  )
  const r = rows[0]
  return r ? { id: r.id, poging: r.pogingen } : null
}

/**
 * Start een handmatige back-up. Geweigerd met 'bezig' als er in de afgelopen 10 minuten een run (gepland of
 * handmatig) is gestart die nog bezig is, en met 'te-vaak' bij 3 of meer handmatige runs in het afgelopen
 * uur. Een advisory lock in de transactie maakt controle en invoegen samen atomair.
 */
export async function startHandmatig(): Promise<{ id: number } | { geweigerd: 'bezig' | 'te-vaak' }> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [HANDMATIG_LOCK])
    // clock_timestamp: de tijd na het wachten op de lock, niet het begin van de transactie.
    const { rows } = await client.query<{ bezig: number; handmatig: number }>(
      `SELECT count(*) FILTER (WHERE status = 'bezig' AND gestart_op > clock_timestamp() - ${BEZIG_BINNEN})::int AS bezig,
              count(*) FILTER (WHERE soort = 'handmatig')::int AS handmatig
         FROM backups
        WHERE gestart_op > clock_timestamp() - interval '1 hour'`,
    )
    const { bezig, handmatig } = rows[0] ?? { bezig: 0, handmatig: 0 }
    let uitkomst: { id: number } | { geweigerd: 'bezig' | 'te-vaak' }
    if (bezig > 0) {
      uitkomst = { geweigerd: 'bezig' }
    } else if (handmatig >= HANDMATIG_PER_UUR) {
      uitkomst = { geweigerd: 'te-vaak' }
    } else {
      const ins = await client.query<{ id: number }>(
        `INSERT INTO backups (soort, status, gestart_op) VALUES ('handmatig', 'bezig', clock_timestamp()) RETURNING id`,
      )
      uitkomst = { id: ins.rows[0].id }
    }
    await client.query('COMMIT')
    return uitkomst
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

/**
 * Legt de uitkomst van een run vast. Alleen een run die nog 'bezig' is wordt bijgewerkt, zodat een
 * vastgelopen poging die alsnog afloopt de uitkomst van een latere poging niet overschrijft.
 */
export async function rondAf(
  id: number,
  uitkomst: { status: 'verstuurd' | 'mislukt' | 'te-groot'; bytes?: number; sha256?: string; rijen?: RijTelling; fout?: string },
): Promise<void> {
  const fout = uitkomst.fout ? Array.from(uitkomst.fout).slice(0, MAX_FOUT).join('') : null
  await getPool().query(
    `UPDATE backups
        SET status = $2, afgerond_op = now(), bytes = $3, sha256 = $4, rijen = $5::jsonb, fout = $6
      WHERE id = $1 AND status = 'bezig'`,
    [id, uitkomst.status, uitkomst.bytes ?? null, uitkomst.sha256 ?? null, uitkomst.rijen ? JSON.stringify(uitkomst.rijen) : null, fout],
  )
}

/**
 * Zet runs die langer dan een uur 'bezig' zijn op 'mislukt', zodat de kaart niet maandenlang 'Bezig' toont
 * na een herstart midden in een run. Een geplande run blijft daarna gewoon opnieuw te claimen (de wachttijd
 * na één poging is een uur, gerekend vanaf de start). Geeft het aantal bijgewerkte runs.
 */
export async function markeerAfgebroken(): Promise<number> {
  const r = await getPool().query(
    `UPDATE backups
        SET status = 'mislukt', afgerond_op = now(), fout = 'Afgebroken, bijvoorbeeld door een herstart van de server.'
      WHERE status = 'bezig' AND gestart_op <= now() - ${VASTGELOPEN_NA}`,
  )
  return r.rowCount ?? 0
}

/** De laatst gestarte run, van welke soort ook. */
export async function laatsteRun(): Promise<BackupRun | null> {
  const { rows } = await getPool().query<Rij>(`SELECT ${KOLOMMEN} FROM backups ORDER BY gestart_op DESC, id DESC LIMIT 1`)
  return rows[0] ? naarRun(rows[0]) : null
}

/** De laatste run die is verstuurd. */
export async function laatsteGeslaagd(): Promise<BackupRun | null> {
  const { rows } = await getPool().query<Rij>(
    `SELECT ${KOLOMMEN} FROM backups WHERE status = 'verstuurd' ORDER BY afgerond_op DESC NULLS LAST, id DESC LIMIT 1`,
  )
  return rows[0] ? naarRun(rows[0]) : null
}

/** Periodes waarvan de geplande back-up klaar is: verstuurd of te groot om te mailen. */
export async function gedanePeriodes(): Promise<Set<string>> {
  const { rows } = await getPool().query<{ periode: string }>(
    `SELECT periode FROM backups WHERE soort = 'gepland' AND status IN ('verstuurd', 'te-groot')`,
  )
  return new Set(rows.map((r) => r.periode))
}
