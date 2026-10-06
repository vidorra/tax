/**
 * Voert migrations/*.sql in alfabetische volgorde uit, elk in een eigen transactie, en
 * registreert ze in _migrations. Idempotent: een migratie die al geregistreerd is, wordt
 * overgeslagen. Een advisory lock zorgt dat twee gelijktijdige starts (bijvoorbeeld een nieuwe
 * container naast een oude) niet tegelijk migreren. Zonder DATABASE_URL stopt het script netjes met code 0.
 *
 * Met `opties.alleen` worden uitsluitend die migraties uitgevoerd (in gesorteerde volgorde); de rest wordt
 * overgeslagen. Het herstel van een back-up gebruikt dit om eerst precies de migraties uit de back-up te
 * draaien, zodat het schema past bij de gegevens. Staat een naam niet op schijf, dan is de back-up van een
 * nieuwere versie van de app en stopt het met een fout.
 *
 *   npm run db:migrate
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from 'pg'

import { LOCK } from '../lib/db/locks'

/** Exclusief per sessie; maakDump in lib/backup/dump.ts neemt dezelfde sleutel gedeeld. */
export const MIGRATIE_LOCK = LOCK.migraties

/** Verwachte fout bij migreren (onbekende of mislukte migratie); de melding is voor de gebruiker bedoeld. */
export class MigratieFout extends Error {
  constructor(bericht: string) {
    super(bericht)
    this.name = 'MigratieFout'
  }
}

export interface MigreerOpties {
  /** Alleen deze migraties uitvoeren (namen van bestanden, zoals in _migrations). */
  alleen?: string[]
}

export async function migreer(
  url: string,
  map = join(process.cwd(), 'migrations'),
  log: (m: string) => void = console.log,
  opties: MigreerOpties = {},
): Promise<number> {
  const opSchijf = (await readdir(map)).filter((f) => f.endsWith('.sql')).sort()
  let bestanden = opSchijf
  if (opties.alleen) {
    const bekend = new Set(opSchijf)
    for (const naam of [...opties.alleen].sort()) {
      if (!bekend.has(naam)) throw new MigratieFout(`Deze back-up komt van een nieuwere versie van de app: migratie ${naam} ontbreekt.`)
    }
    const gevraagd = new Set(opties.alleen)
    bestanden = opSchijf.filter((f) => gevraagd.has(f))
  }
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATIE_LOCK])
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      naam text PRIMARY KEY,
      uitgevoerd_op timestamptz NOT NULL DEFAULT now()
    )`)
    const { rows } = await client.query<{ naam: string }>('SELECT naam FROM _migrations')
    const gedaan = new Set(rows.map((r) => r.naam))
    let aantal = 0
    for (const naam of bestanden) {
      if (gedaan.has(naam)) continue
      const sql = await readFile(join(map, naam), 'utf8')
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO _migrations (naam) VALUES ($1)', [naam])
        await client.query('COMMIT')
        aantal++
        log(`Migratie uitgevoerd: ${naam}`)
      } catch (e) {
        await client.query('ROLLBACK')
        throw new MigratieFout(`Migratie ${naam} mislukt: ${(e as Error).message}`)
      }
    }
    log(aantal === 0 ? 'Database is bijgewerkt; geen nieuwe migraties.' : `${aantal} migratie(s) uitgevoerd.`)
    const overgeslagen = opSchijf.length - bestanden.length
    if (overgeslagen > 0) log(`${overgeslagen} migratie(s) overgeslagen omdat ze niet gevraagd zijn.`)
    return aantal
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATIE_LOCK]).catch(() => undefined)
    await client.end()
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    console.log('DATABASE_URL ontbreekt; migraties overgeslagen. Het dossier werkt pas met een database.')
    return
  }
  await migreer(url)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error((e as Error).message)
    process.exit(1)
  })
}
