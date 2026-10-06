/**
 * Gedeelde hulp voor de integratietests van de back-up: omgeving, nep-Resend, testgegevens met de
 * gevoelige velden van het echte schema, de inhoud van alle tabellen en het vangen van de log.
 * Geen spec-bestand, dus vitest draait dit niet los.
 */
import type { Client } from 'pg'
import { vi } from 'vitest'

import { versleutel } from '@/lib/crypto'
import { zetResendFetch } from '@/lib/mail'

export const ONTVANGER = 'backup.ontvanger@example.nl'
export const RESEND_SLEUTEL = 're_test_9f8e7d6c5b4a3210GEHEIM'
export const GEBRUIKER_MAIL = 'eigenaar.dossier@example.nl'
export const TOTP_GEHEIM = 'JBSWY3DPEHPK3PXPGEHEIM'
export const MB_TOKEN = 'mb-token-0123456789abcdefGEHEIM'

/** Tabellen van het dossier (alles behalve backups en _migrations). */
export const TABELLEN = ['users', 'households', 'dossier_years', 'snapshots', 'accountant_docs', 'koppelingen', 'aangifte_staat', 'herstelpunten'] as const

export function metSchema(basis: string, schema: string): string {
  const u = new URL(basis)
  u.searchParams.set('options', `-c search_path=${schema}`)
  return u.toString()
}

/** Complete back-upconfiguratie met Resend; SMTP-variabelen weg. */
export function zetBackupEnv(url: string, sleutel: string): void {
  process.env.DATABASE_URL = url
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

/** Een account met huishouden, twee jaren, snapshot, accountantsregels en een koppeling. Vraagt DOSSIER_KEY in de omgeving. */
export async function vulDatabase(db: Client): Promise<void> {
  const u = await db.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, totp_secret, totp_enabled, sessie_generatie) VALUES ($1, $2, $3, true, 2) RETURNING id`,
    [GEBRUIKER_MAIL, '$2a$12$abcdefghijklmnopqrstuuJ5c1Zr0g8nC2bq5yQwV0b8m3hS6d2e', TOTP_GEHEIM],
  )
  const hh = await db.query<{ id: number }>(`INSERT INTO households (user_id, naam, gegevens_enc) VALUES ($1, 'Huishouden "Noord"\n2e regel', $2) RETURNING id`, [
    u.rows[0].id,
    versleutel({ naam: 'Anna', iban: 'NL00TEST0123456789' }, 'households:1'),
  ])
  const hid = hh.rows[0].id
  const jaren = await db.query<{ id: number }>(
    `INSERT INTO dossier_years (household_id, jaar, variant, invoer_enc, status, versie)
     VALUES ($1, 2025, NULL, $2, 'gecontroleerd', 3), ($1, 2026, 'brief-29-09', $3, 'concept', 1) RETURNING id`,
    [hid, versleutel({ winst: 81234 }, `dossier_years:${hid}:2025`), versleutel({ winst: 90000 }, `dossier_years:${hid}:2026`)],
  )
  await db.query(`INSERT INTO snapshots (dossier_year_id, params_hash, uitkomst_enc) VALUES ($1, $2, $3)`, [jaren.rows[0].id, 'f'.repeat(64), versleutel({ ib: 12345 })])
  await db.query(`INSERT INTO accountant_docs (dossier_year_id, regels_enc) VALUES ($1, $2)`, [jaren.rows[0].id, versleutel([{ regel: 'winst', bedrag: 81234 }])])
  await db.query(`INSERT INTO koppelingen (household_id, label, token_enc, administratie_id, administratie_naam) VALUES ($1, 'Studio ☀️', $2, '100000000000000001', 'Studio Voorbeeld')`, [
    hid,
    versleutel(MB_TOKEN, 'koppelingen:1'),
  ])
}

/** Alle rijen van de dossiertabellen als JSON, op id gesorteerd. */
export async function tabelInhoud(db: Client, opties: { zonderSessie?: boolean } = {}): Promise<Record<string, unknown[]>> {
  const uit: Record<string, unknown[]> = {}
  for (const t of TABELLEN) {
    // Na herstel is de sessiegeneratie bewust anders (alle sessies ingetrokken); die kolom kan worden weggelaten.
    const expr = opties.zonderSessie && t === 'users' ? `to_jsonb(t) - 'sessie_generatie'` : 'to_jsonb(t)'
    const { rows } = await db.query<{ r: unknown }>(`SELECT ${expr} AS r FROM ${t} t ORDER BY id`)
    uit[t] = rows.map((x) => x.r)
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
