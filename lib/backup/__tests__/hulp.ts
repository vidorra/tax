/**
 * Gedeelde hulp voor de integratietests van de back-up: omgeving, nep-Resend, testgegevens met de
 * gevoelige velden van het echte schema, de inhoud van alle tabellen en het vangen van de log.
 * Geen spec-bestand, dus vitest draait dit niet los. De database is die van lib/db/testdb.ts (DATABASE_PATH).
 */
import { vi } from 'vitest'

import { versleutel } from '@/lib/crypto'
import { getDb, getSqlite, type Sqlite } from '@/lib/db'
import { accountantDocs, dossierYears, households, koppelingen, snapshots, users } from '@/lib/db/schema'
import { zetResendFetch } from '@/lib/mail'

export const ONTVANGER = 'backup.ontvanger@example.nl'
export const RESEND_SLEUTEL = 're_test_9f8e7d6c5b4a3210GEHEIM'
export const GEBRUIKER_MAIL = 'eigenaar.dossier@example.nl'
export const TOTP_GEHEIM = 'JBSWY3DPEHPK3PXPGEHEIM'
export const MB_TOKEN = 'mb-token-0123456789abcdefGEHEIM'

/** Tabellen van het dossier (alles behalve backups en _migrations), in de volgorde van de migratie. */
export const TABELLEN = ['users', 'households', 'dossier_years', 'snapshots', 'accountant_docs', 'aangifte_staat', 'herstelpunten', 'koppelingen', 'uitnodigingen'] as const

/** Complete back-upconfiguratie met Resend; SMTP-variabelen weg. DATABASE_PATH laat hij aan testdb.ts. */
export function zetBackupEnv(sleutel: string): void {
  process.env.DOSSIER_KEY = sleutel
  process.env.BACKUP_MAIL_TO = ONTVANGER
  process.env.RESEND_API_KEY = RESEND_SLEUTEL
  process.env.MAIL_FROM = 'noreply@example.nl'
  process.env.GIT_SHA = 'abc1234'
  for (const n of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_REPLY_TO', 'RESEND_API_BASE']) delete process.env[n]
}

export interface ResendVerzoek {
  url: string
  body: {
    from: string
    to: string[]
    subject: string
    text: string
    reply_to?: string
    attachments?: Array<{ filename: string; content: string; content_type?: string }>
  }
}

/** Vervangt fetch van de mailer; elk verzoek wordt bewaard. Standaard antwoordt hij 200 met een id. */
export function nepResend(): { verzoeken: ResendVerzoek[]; zetAntwoord(f: () => Response): void } {
  const verzoeken: ResendVerzoek[] = []
  let antwoord = () => new Response(JSON.stringify({ id: 're_test_1' }), { status: 200, headers: { 'content-type': 'application/json' } })
  zetResendFetch((async (url: string, init?: RequestInit) => {
    verzoeken.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return antwoord()
  }) as unknown as typeof fetch)
  return {
    verzoeken,
    zetAntwoord(f) {
      antwoord = f
    },
  }
}

/**
 * Een account met huishouden, twee jaren, snapshot, accountantsregels en een koppeling, in de database van dit
 * proces (getDb()). Vraagt DOSSIER_KEY in de omgeving. Geeft de id's terug.
 */
export function vulDatabase(email = GEBRUIKER_MAIL): { userId: number; householdId: number } {
  const db = getDb()
  const u = db
    .insert(users)
    .values({ email, passwordHash: '$2a$12$abcdefghijklmnopqrstuuJ5c1Zr0g8nC2bq5yQwV0b8m3hS6d2e', totpSecret: TOTP_GEHEIM, totpEnabled: true, sessieGeneratie: 2 })
    .returning({ id: users.id })
    .get()
  const hid = db
    .insert(households)
    .values({ userId: u.id, naam: 'Huishouden "Noord"\n2e regel', gegevensEnc: versleutel({ naam: 'Anna', iban: 'NL00TEST0123456789' }, `households:${u.id}`) })
    .returning({ id: households.id })
    .get().id
  const jaren = db
    .insert(dossierYears)
    .values([
      { householdId: hid, jaar: 2025, variant: null, invoerEnc: versleutel({ winst: 81234 }, `dossier_years:${hid}:2025`), status: 'gecontroleerd', versie: 3 },
      { householdId: hid, jaar: 2026, variant: 'brief-29-09', invoerEnc: versleutel({ winst: 90000 }, `dossier_years:${hid}:2026`), status: 'concept', versie: 1 },
    ])
    .returning({ id: dossierYears.id })
    .all()
  db.insert(snapshots).values({ dossierYearId: jaren[0].id, paramsHash: 'f'.repeat(64), uitkomstEnc: versleutel({ ib: 12345 }) }).run()
  db.insert(accountantDocs).values({ dossierYearId: jaren[0].id, regelsEnc: versleutel([{ regel: 'winst', bedrag: 81234 }]) }).run()
  db.insert(koppelingen)
    .values({ householdId: hid, label: 'Studio ☀️', tokenEnc: versleutel(MB_TOKEN, `koppelingen:${hid}`), administratieId: '100000000000000001', administratieNaam: 'Studio Voorbeeld' })
    .run()
  return { userId: u.id, householdId: hid }
}

/** Alle rijen van de dossiertabellen, op id gesorteerd, precies zoals SQLite ze teruggeeft. */
export function tabelInhoud(sqlite: Sqlite = getSqlite(), opties: { zonderSessie?: boolean } = {}): Record<string, unknown[]> {
  const uit: Record<string, unknown[]> = {}
  for (const t of TABELLEN) {
    const rijen = sqlite.prepare(`SELECT * FROM ${t} ORDER BY id`).all() as Array<Record<string, unknown>>
    // Na herstel is de sessiegeneratie bewust anders (alle sessies ingetrokken); die kolom kan worden weggelaten.
    uit[t] = opties.zonderSessie && t === 'users' ? rijen.map(({ sessie_generatie: _, ...rest }) => rest) : rijen
  }
  return uit
}

/** Vangt alles wat naar console.log/info/warn/error/debug gaat, zonder het te tonen. */
export function vangLog(): { regels: string[]; herstel(): void } {
  const regels: string[] = []
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      regels.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    }),
  )
  return {
    regels,
    herstel() {
      for (const s of spies) s.mockRestore()
    },
  }
}

/** Zet de start van een run terug in de tijd, alsof hij `ms` eerder begon. */
export function terug(id: number, ms: number): void {
  const r = getSqlite().prepare('SELECT gestart_op AS g FROM backups WHERE id = ?').get(id) as { g: string }
  getSqlite()
    .prepare('UPDATE backups SET gestart_op = ? WHERE id = ?')
    .run(new Date(new Date(r.g).getTime() - ms).toISOString(), id)
}

export const MINUUT = 60_000
export const UUR = 60 * MINUUT
export const DAG = 24 * UUR
