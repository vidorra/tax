/**
 * Alleen voor ontwikkelen (ronde 2: elke bouwagent in een eigen worktree met een eigen databaseschema). Maakt in de
 * database uit DATABASE_URL (met `options=-c search_path=<schema>`) het schema aan als dat nog niet bestaat, voert de
 * migraties uit en maakt het account voor schermafbeeldingen met 2FA aan. De inloggegevens en het TOTP-geheim komen in
 * .dev-account.json in de worktree (staat in .gitignore). Er is geen omweg om 2FA heen: inloggen gaat zoals altijd,
 * met de code die `--code` print (een code werkt één keer per 30 seconden).
 *
 *   npx tsx --env-file=.env.local scripts/dev-account.ts          # schema, migraties, account
 *   npx tsx --env-file=.env.local scripts/dev-account.ts --code   # huidige TOTP-code
 *
 * Weigert te draaien met NODE_ENV=production of zonder search_path in DATABASE_URL (zodat het nooit het gewone schema raakt).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'

const BESTAND = join(process.cwd(), '.dev-account.json')

interface DevAccount {
  email: string
  wachtwoord: string
  secret: string
  schema: string
}

function schemaUit(url: string): string | null {
  const opties = new URL(url).searchParams.get('options') ?? ''
  const m = /search_path=([A-Za-z_][A-Za-z0-9_]*)/.exec(opties)
  return m ? m[1] : null
}

async function main(): Promise<void> {
  if (process.argv.includes('--code')) {
    if (!existsSync(BESTAND)) throw new Error('Nog geen .dev-account.json; draai eerst dit script zonder --code.')
    const acc = JSON.parse(readFileSync(BESTAND, 'utf8')) as DevAccount
    const { totpCode } = await import('../lib/auth/totp')
    console.log(totpCode(acc.secret))
    return
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Niet in productie.')
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL ontbreekt (zet hem in .env.local van de worktree).')
  const schema = schemaUit(url)
  if (!schema || !/^ib_r2_/.test(schema)) throw new Error('DATABASE_URL moet een eigen schema hebben: ?options=-c%20search_path%3Dib_r2_<agent>.')

  const basis = new URL(url)
  basis.searchParams.delete('options')
  const beheer = new Client({ connectionString: basis.toString() })
  await beheer.connect()
  try {
    await beheer.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)
  } finally {
    await beheer.end()
  }

  const { migreer } = await import('./migrate')
  await migreer(url)

  const { getPool } = await import('../lib/db')
  try {
    await maakAccount(schema)
  } finally {
    await getPool()
      .end()
      .catch(() => undefined)
  }
}

async function maakAccount(schema: string): Promise<void> {
  const { maakGebruiker, activeerTotp, eersteGebruiker } = await import('../lib/auth/gebruiker')
  const bestaand = await eersteGebruiker()
  if (bestaand?.totpEnabled && existsSync(BESTAND)) {
    const acc = JSON.parse(readFileSync(BESTAND, 'utf8')) as DevAccount
    console.log(`Account bestaat al: ${acc.email} / ${acc.wachtwoord} (schema ${schema}). Code: npx tsx --env-file=.env.local scripts/dev-account.ts --code`)
    return
  }
  if (bestaand?.totpEnabled) throw new Error(`Er is al een account met 2FA in ${schema}, maar geen .dev-account.json. Verwijder het schema (DROP SCHEMA ${schema} CASCADE) en draai opnieuw.`)
  const email = `${schema.replace(/_/g, '-')}@example.nl`
  const wachtwoord = `ontwikkel-${schema}-wachtwoord`
  const r = await maakGebruiker(email, wachtwoord)
  if (!r) throw new Error('Account maken lukte niet.')
  await activeerTotp(r.id)
  const acc: DevAccount = { email, wachtwoord, secret: r.secret, schema }
  writeFileSync(BESTAND, JSON.stringify(acc, null, 2))
  console.log(`Account: ${email} / ${wachtwoord} (schema ${schema}). Code: npx tsx --env-file=.env.local scripts/dev-account.ts --code`)
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
