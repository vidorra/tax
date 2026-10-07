/**
 * Alleen voor ontwikkelen (ronde 2: elke bouwagent in een eigen worktree met een eigen database). Voert de migraties
 * uit op het databasebestand van de worktree (DATABASE_PATH, standaard ./data/ibcalculator.db in de werkmap, dus
 * vanzelf per worktree) en maakt het account voor schermafbeeldingen met 2FA aan. De inloggegevens en het
 * TOTP-geheim komen in .dev-account.json in de worktree (staat in .gitignore). Er is geen omweg om 2FA heen: inloggen
 * gaat zoals altijd, met de code die `--code` print (een code werkt één keer per 30 seconden).
 *
 *   npx tsx --env-file=.env.local scripts/dev-account.ts          # migraties, account
 *   npx tsx --env-file=.env.local scripts/dev-account.ts --code   # huidige TOTP-code
 *
 * Weigert te draaien met NODE_ENV=production of met een database onder /app/data (de map van de container), zodat
 * het nooit een echte installatie raakt. Heeft de database al een account met 2FA dat niet van dit script is, dan
 * stopt het ook.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, sep } from 'node:path'

import { dbPad } from '../lib/db/pad'

const BESTAND = join(process.cwd(), '.dev-account.json')
const CONTAINER_MAP = '/app/data'

interface DevAccount {
  email: string
  wachtwoord: string
  secret: string
  /** Het databasebestand waarin het account staat. */
  pad: string
}

/** Korte naam voor e-mail en wachtwoord, uit de map van de worktree (bijvoorbeeld ibcalculator-a1). */
function naamVanWerkmap(): string {
  const naam = basename(process.cwd())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return naam || 'ontwikkel'
}

function codeOpdracht(): string {
  return 'npx tsx --env-file=.env.local scripts/dev-account.ts --code'
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
  const pad = dbPad()
  if (pad === CONTAINER_MAP || pad.startsWith(CONTAINER_MAP + sep)) {
    throw new Error(`De database staat onder ${CONTAINER_MAP}, de map van de container. Dit script is alleen voor een lokale worktree.`)
  }

  const { migreer } = await import('../lib/db/migreer')
  const { sluitDb } = await import('../lib/db')
  try {
    console.log(`Database: ${pad}`)
    migreer(pad)
    await maakAccount(pad)
  } finally {
    sluitDb()
  }
}

async function maakAccount(pad: string): Promise<void> {
  const { maakGebruiker, activeerTotp, eersteGebruiker } = await import('../lib/auth/gebruiker')
  const bestaand = await eersteGebruiker()
  if (bestaand?.totpEnabled && existsSync(BESTAND)) {
    const acc = JSON.parse(readFileSync(BESTAND, 'utf8')) as DevAccount
    if (acc.email === bestaand.email) {
      console.log(`Account bestaat al: ${acc.email} / ${acc.wachtwoord}. Code: ${codeOpdracht()}`)
      return
    }
  }
  if (bestaand?.totpEnabled) {
    throw new Error(
      `Er is al een account met 2FA in ${pad} dat niet in .dev-account.json staat. Is dit een database om weg te gooien, verwijder dan het bestand (met -wal en -shm ernaast) en draai opnieuw.`,
    )
  }
  const naam = naamVanWerkmap()
  const email = `${naam}@example.nl`
  const wachtwoord = `ontwikkel-${naam}-wachtwoord`
  const r = await maakGebruiker(email, wachtwoord)
  if (!r) throw new Error('Account maken lukte niet.')
  if (!(await activeerTotp(r.id))) throw new Error('2FA aanzetten lukte niet.')
  const acc: DevAccount = { email, wachtwoord, secret: r.secret, pad }
  writeFileSync(BESTAND, JSON.stringify(acc, null, 2))
  console.log(`Account: ${email} / ${wachtwoord}. Code: ${codeOpdracht()}`)
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
