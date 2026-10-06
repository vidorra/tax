/**
 * Back-up van de database op de opdrachtregel.
 *
 *   npm run backup -- maak [--uit <map>] [--mail]        back-up van DATABASE_URL naar een bestand en/of mailen
 *   npm run backup -- bekijk <bestand>                   metadata en aantallen rijen per tabel tonen
 *   npm run backup -- herstel <bestand> [--overschrijf] [--schema-opnieuw]
 *                                                        terugzetten in DATABASE_URL
 *   npm run backup -- ontsleutel <bestand> <uit.json>    de ontsleutelde inhoud als JSON wegschrijven
 *
 * maak zonder opties schrijft naar ./backups/ (staat in .gitignore). Met --mail gaat de back-up naar
 * BACKUP_MAIL_TO en telt hij als back-up op verzoek in het dossier; met --mail én --uit gebeuren beide.
 * Elk commando heeft DOSSIER_KEY nodig; voor bekijk, herstel en ontsleutel dezelfde sleutel als waarmee de
 * back-up is gemaakt.
 *
 * herstel weigert een database met tabellen van een andere app. Is de doeldatabase al verder gemigreerd dan
 * de back-up (de app is al gestart en start.sh heeft gemigreerd), dan is --schema-opnieuw nodig: die verwijdert
 * de tabellen van ibcalculator in de doeldatabase en bouwt ze opnieuw op tot de stand van de back-up, zodat
 * latere migraties ook over de teruggezette gegevens lopen. Gevulde tabellen worden alleen met --overschrijf
 * vervangen. Na elk herstel zijn alle bestaande sessies ingetrokken.
 *
 * Toont nooit inhoud van rijen, sleutels of het volledige mailadres.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from 'pg'

import { quoteIdent, herstelDump, HerstelFout, tabellenIn } from '@/lib/backup/dump'
import { BackupFout, leesKop, ontsleutelBackup, sha256Hex, sleutelId } from '@/lib/backup/formaat'
import { backupConfig, handmatigeBackup, maakBackupBestand, type BackupBestand } from '@/lib/backup/service'
import { UITGESLOTEN_TABELLEN, type BackupInhoud, type RijTelling } from '@/lib/backup/types'
import { formatGrootte, tijdstipNL } from '@/lib/backup/weergave'
import { DossierSleutelFout, dossierSleutel } from '@/lib/crypto'
import { maskeerAdres, maskeerFout } from '@/lib/mail'

import { MigratieFout, migreer } from './migrate'

type Uit = (regel: string) => void

const GEBRUIK = [
  'Gebruik:',
  '  npm run backup -- maak [--uit <map>] [--mail]',
  '  npm run backup -- bekijk <bestand>',
  '  npm run backup -- herstel <bestand> [--overschrijf] [--schema-opnieuw]',
  '  npm run backup -- ontsleutel <bestand> <uit.json>',
].join('\n')

class GebruiksFout extends Error {}

interface Argumenten {
  los: string[]
  vlaggen: Set<string>
  waarden: Map<string, string>
}

function leesArgumenten(args: string[], vlaggen: string[], waarden: string[]): Argumenten {
  const uit: Argumenten = { los: [], vlaggen: new Set(), waarden: new Map() }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (vlaggen.includes(a)) uit.vlaggen.add(a)
    else if (waarden.includes(a)) {
      const w = args[++i]
      if (!w || w.startsWith('--')) throw new GebruiksFout(`${a} heeft een waarde nodig.`)
      uit.waarden.set(a, w)
    } else if (a.startsWith('--')) throw new GebruiksFout(`Onbekende optie: ${a}`)
    else uit.los.push(a)
  }
  return uit
}

function vereisDatabase(): string {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new GebruiksFout('DATABASE_URL ontbreekt. Zet de verbinding met de database in de omgeving.')
  return url
}

/** Host, poort en database zonder gebruiker of wachtwoord. */
function doelNaam(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`
  } catch {
    return 'de database uit DATABASE_URL'
  }
}

function rijenTabel(rijen: RijTelling, uit: Uit): void {
  const namen = Object.keys(rijen)
  const breedte = Math.max(5, ...namen.map((n) => n.length))
  for (const n of namen) uit(`  ${n.padEnd(breedte)}  ${rijen[n].toLocaleString('nl-NL')}`)
  const totaal = namen.reduce((s, n) => s + rijen[n], 0)
  uit(`  ${'totaal'.padEnd(breedte)}  ${totaal.toLocaleString('nl-NL')} rijen in ${namen.length} tabellen`)
}

async function schrijfBestand(map: string, b: BackupBestand): Promise<string> {
  await mkdir(map, { recursive: true, mode: 0o700 })
  const pad = join(map, b.bestandsnaam)
  try {
    await writeFile(pad, b.bestand, { flag: 'wx', mode: 0o600 })
  } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') throw new GebruiksFout(`${pad} bestaat al. Wacht een minuut of kies een andere map met --uit.`)
    throw e
  }
  return pad
}

async function maak(args: string[], uit: Uit): Promise<number> {
  const a = leesArgumenten(args, ['--mail'], ['--uit'])
  if (a.los.length) throw new GebruiksFout(`Onverwacht argument: ${a.los[0]}`)
  vereisDatabase()
  dossierSleutel()
  const mail = a.vlaggen.has('--mail')
  const map = a.waarden.has('--uit') ? resolve(a.waarden.get('--uit')!) : mail ? null : resolve('backups')

  if (!mail) {
    const b = await maakBackupBestand('handmatig')
    const pad = await schrijfBestand(map!, b)
    uit(`Back-up geschreven naar ${pad} (${formatGrootte(b.bytes)}).`)
    uit(`SHA-256: ${b.sha256}`)
    rijenTabel(b.rijen, uit)
    return 0
  }

  const cfg = backupConfig()
  if (!cfg.klaar || !cfg.ontvanger) {
    uit(`Mailen kan niet: de back-up is niet ingericht (ontbreekt: ${cfg.ontbreekt.join(', ')}).`)
    return 1
  }
  const geschreven: { pad?: string } = {}
  const bewaar = map
    ? async (b: BackupBestand) => {
        geschreven.pad = await schrijfBestand(map, b)
      }
    : undefined
  const r = await handmatigeBackup(new Date(), { bewaar })
  if ('geweigerd' in r) {
    uit(r.geweigerd === 'bezig' ? 'Er loopt al een back-up. Probeer het over een paar minuten opnieuw.' : 'Er zijn het afgelopen uur al drie back-ups op verzoek gemaakt. Probeer het later opnieuw.')
    return 1
  }
  if (geschreven.pad) uit(`Back-up geschreven naar ${geschreven.pad}.`)
  if (r.status === 'verstuurd') {
    uit(`Back-up gemaild naar ${maskeerAdres(cfg.ontvanger)} (${r.bestandsnaam}, ${formatGrootte(r.bytes ?? 0)}).`)
    uit(`SHA-256: ${r.sha256}`)
    if (r.rijen) rijenTabel(r.rijen, uit)
    return 0
  }
  uit(r.status === 'te-groot' ? `Niet gemaild: ${r.reden}` : `Mislukt: ${r.reden}`)
  return 1
}

async function leesBackup(pad: string): Promise<{ bestand: Buffer; inhoud: BackupInhoud }> {
  let bestand: Buffer
  try {
    bestand = await readFile(pad)
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') throw new GebruiksFout(`Bestand niet gevonden: ${pad}`)
    throw e
  }
  return { bestand, inhoud: ontsleutelBackup(bestand, dossierSleutel()) }
}

async function bekijk(args: string[], uit: Uit): Promise<number> {
  const [pad, ...rest] = leesArgumenten(args, [], []).los
  if (!pad || rest.length) throw new GebruiksFout('Geef precies één bestand op.')
  const ruw = await readFile(pad).catch((e: { code?: string }) => {
    throw e.code === 'ENOENT' ? new GebruiksFout(`Bestand niet gevonden: ${pad}`) : e
  })
  const kop = leesKop(ruw)
  uit(`Bestand:        ${basename(pad)}`)
  uit(`Grootte:        ${formatGrootte(ruw.length)}`)
  uit(`SHA-256:        ${sha256Hex(ruw)}`)
  uit(`Formaatversie:  ${kop.versie}`)
  uit(`Sleutel-id:     ${kop.sleutelId}`)
  const eigen = sleutelId(dossierSleutel())
  if (eigen !== kop.sleutelId) uit(`Je DOSSIER_KEY heeft sleutel-id ${eigen}.`)
  const inhoud = ontsleutelBackup(ruw, dossierSleutel())
  uit(`Gemaakt op:     ${tijdstipNL(inhoud.gemaaktOp)} (Nederlandse tijd)`)
  uit(`Versie app:     ${inhoud.gitSha ?? 'onbekend'}`)
  uit(`Migraties:      ${inhoud.migraties.length ? inhoud.migraties.join(', ') : 'geen'}`)
  uit('Rijen per tabel:')
  rijenTabel(Object.fromEntries(inhoud.tabellen.map((t) => [t.naam, t.rijen.length])), uit)
  return 0
}

/** Tabellen in het schema die rijen bevatten. */
async function gevuldeTabellen(client: Client, schema: string, namen: string[]): Promise<string[]> {
  const gevuld: string[] = []
  for (const naam of namen) {
    const r = await client.query<{ gevuld: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${quoteIdent(schema)}.${quoteIdent(naam)}) AS gevuld`)
    if (r.rows[0]?.gevuld) gevuld.push(naam)
  }
  return gevuld
}

async function huidigSchema(client: Client): Promise<string> {
  const { rows } = await client.query<{ schema: string | null }>('SELECT current_schema() AS schema')
  if (!rows[0]?.schema) throw new HerstelFout('Er is geen schema gekozen: controleer search_path in DATABASE_URL.')
  return rows[0].schema
}

/** Uitgevoerde migraties in het doel; [] als de tabel _migrations er niet is. */
async function doelMigraties(client: Client, schema: string, tabellen: string[]): Promise<string[]> {
  if (!tabellen.includes('_migrations')) return []
  const { rows } = await client.query<{ naam: string }>(`SELECT naam FROM ${quoteIdent(schema)}.${quoteIdent('_migrations')}`)
  return rows.map((r) => r.naam).sort()
}

/**
 * Trekt alle sessies in: een sessietoken is alleen geldig met de sessiegeneratie van het account
 * (lib/auth/server.ts). Een willekeurige hoge generatie maakt tokens van vóór de back-up en tokens die iemand
 * in de doeldatabase heeft verkregen (bijvoorbeeld door een lege installatie te claimen) allemaal ongeldig.
 * Doet niets zolang de kolom nog niet bestaat (back-up van vóór migratie 0002); daarom draait dit ook na de
 * laatste migratie nog een keer.
 */
async function trekSessiesIn(client: Pick<Client, 'query'>): Promise<boolean> {
  const { rows } = await client.query<{ bestaat: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'sessie_generatie') AS bestaat`,
  )
  if (!rows[0]?.bestaat) return false
  await client.query(`UPDATE users SET sessie_generatie = 1000000000 + floor(random() * 1000000000)::int`)
  return true
}

async function herstel(args: string[], uit: Uit): Promise<number> {
  const a = leesArgumenten(args, ['--overschrijf', '--schema-opnieuw'], [])
  const [pad, ...rest] = a.los
  if (!pad || rest.length) throw new GebruiksFout('Geef precies één bestand op.')
  const url = vereisDatabase()
  const overschrijf = a.vlaggen.has('--overschrijf')
  const schemaOpnieuw = a.vlaggen.has('--schema-opnieuw')
  const { inhoud } = await leesBackup(pad)
  uit(`Back-up van ${tijdstipNL(inhoud.gemaaktOp)} terugzetten in ${doelNaam(url)}.`)

  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const schema = await huidigSchema(client)
    const tabellen = await tabellenIn(client, schema)

    // 1. Is dit wel een database van ibcalculator (of een lege)?
    if (tabellen.length > 0 && !tabellen.includes('_migrations')) {
      uit(`De doeldatabase bevat al tabellen (${tabellen.slice(0, 8).join(', ')}${tabellen.length > 8 ? ', ...' : ''}) maar is geen database van ibcalculator. Er is niets gewijzigd. Kies een lege database.`)
      return 1
    }
    const bekend = new Set<string>([...inhoud.tabellen.map((t) => t.naam), ...UITGESLOTEN_TABELLEN])
    const doel = await doelMigraties(client, schema, tabellen)
    const opSchijf = new Set(await migratieBestanden())
    const vreemdeMigraties = doel.filter((m) => !opSchijf.has(m) && !inhoud.migraties.includes(m))
    if (vreemdeMigraties.length > 0) {
      uit(`De doeldatabase heeft migraties die deze versie van de app niet kent (${vreemdeMigraties.join(', ')}). Er is niets gewijzigd. Werk de app bij of kies een lege database.`)
      return 1
    }
    const nieuwer = doel.filter((m) => !inhoud.migraties.includes(m))
    const gevuld = await gevuldeTabellen(client, schema, tabellen.filter((t) => t !== '_migrations' && t !== 'backups'))

    // 2. Gevulde tabellen alleen met --overschrijf.
    if (gevuld.length > 0 && !overschrijf) {
      uit(`De doeldatabase is niet leeg (rijen in ${gevuld.join(', ')}). Er is niets gewijzigd.`)
      uit('Wil je de huidige gegevens vervangen, herhaal dan het commando met --overschrijf.')
      return 1
    }
    // 3. Een doel dat verder gemigreerd is dan de back-up: alleen opnieuw opbouwen geeft een juist resultaat.
    if (nieuwer.length > 0 && !schemaOpnieuw) {
      uit(`De doeldatabase is al bijgewerkt tot een nieuwere versie dan de back-up (migratie ${nieuwer.join(', ')}). Er is niets gewijzigd.`)
      uit('Zou je nu terugzetten, dan lopen die migraties niet over de teruggezette gegevens. Herhaal het commando met --schema-opnieuw:')
      uit('dan worden de tabellen van ibcalculator in deze database verwijderd en opnieuw opgebouwd tot de stand van de back-up.')
      return 1
    }
    if (overschrijf && gevuld.includes('users')) {
      const emails = new Set(
        (inhoud.tabellen.find((t) => t.naam === 'users')?.rijen ?? []).map((r) => String((r as Record<string, unknown>).email ?? '').toLowerCase()),
      )
      const { rows } = await client.query<{ email: string }>(`SELECT email FROM ${quoteIdent(schema)}.users`)
      const weg = rows.filter((r) => !emails.has(r.email.toLowerCase())).length
      if (weg > 0) uit(`Let op: in de doeldatabase staan ${weg} account(s) die niet in de back-up zitten. Die verdwijnen.`)
    }

    // 4. Opnieuw opbouwen: alle tabellen van ibcalculator weg (andere tabellen zijn hierboven al uitgesloten).
    if (schemaOpnieuw && tabellen.length > 0) {
      const onbekend = tabellen.filter((t) => !bekend.has(t))
      uit(`Tabellen van ibcalculator verwijderen: ${tabellen.join(', ')}.`)
      if (onbekend.length > 0) uit(`Daaronder tabellen uit latere migraties die niet in de back-up zitten: ${onbekend.join(', ')}. Die komen terug bij het migreren.`)
      await client.query('BEGIN')
      try {
        await client.query(`DROP TABLE ${tabellen.map((t) => `${quoteIdent(schema)}.${quoteIdent(t)}`).join(', ')} CASCADE`)
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw e
      }
    } else if (overschrijf && gevuld.length > 0) {
      uit('Let op: --overschrijf vervangt alle gegevens in de tabellen uit de back-up.')
    }

    uit('Schema van de back-up aanmaken:')
    await migreer(url, undefined, (m) => uit(`  ${m}`), { alleen: inhoud.migraties })
    const telling = await herstelDump(client, inhoud, { overschrijf, naHerstel: async (c) => void (await trekSessiesIn(c)) })
    uit('Teruggezet:')
    rijenTabel(telling, uit)
    uit('Latere migraties uitvoeren:')
    await migreer(url, undefined, (m) => uit(`  ${m}`))
    await trekSessiesIn(client)
    uit('Alle bestaande sessies zijn ingetrokken.')
    uit('Klaar. Start de app opnieuw; inloggen gaat met het account uit de back-up.')
    return 0
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** Namen van de migratiebestanden van deze versie van de app. */
async function migratieBestanden(): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  return (await readdir(join(process.cwd(), 'migrations'))).filter((f) => f.endsWith('.sql')).sort()
}

async function ontsleutel(args: string[], uit: Uit): Promise<number> {
  const [pad, doel, ...rest] = leesArgumenten(args, [], []).los
  if (!pad || !doel || rest.length) throw new GebruiksFout('Geef een back-up en een doelbestand op.')
  const { inhoud } = await leesBackup(pad)
  try {
    await writeFile(doel, `${JSON.stringify(inhoud, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') throw new GebruiksFout(`${doel} bestaat al. Kies een ander doelbestand.`)
    throw e
  }
  uit(`Ontsleutelde back-up geschreven naar ${doel}.`)
  uit('Let op: dit bestand bevat gevoelige gegevens, waaronder e-mailadressen, wachtwoordhashes en de geheimen voor tweestapsverificatie. Dossiers en tokens staan er nog versleuteld met DOSSIER_KEY in. Verwijder het zodra je klaar bent.')
  return 0
}

/** Sluit de pool van lib/db als het commando die heeft geopend, zodat het proces kan stoppen. */
async function sluitPool(): Promise<void> {
  const g = globalThis as unknown as { __ibDb?: { pool?: { end(): Promise<void> } } }
  const pool = g.__ibDb?.pool
  delete g.__ibDb
  await pool?.end().catch(() => undefined)
}

/** Voert een subcommando uit en geeft de exitcode terug. Gooit niet. */
export async function voerUit(argv: string[], uit: Uit = console.log): Promise<number> {
  const [commando, ...args] = argv
  try {
    switch (commando) {
      case 'maak':
        return await maak(args, uit)
      case 'bekijk':
        return await bekijk(args, uit)
      case 'herstel':
        return await herstel(args, uit)
      case 'ontsleutel':
        return await ontsleutel(args, uit)
      default:
        uit(commando ? `Onbekend commando: ${commando}\n${GEBRUIK}` : GEBRUIK)
        return 2
    }
  } catch (e) {
    if (e instanceof GebruiksFout) {
      uit(`${e.message}\n${GEBRUIK}`)
      return 2
    }
    if (e instanceof BackupFout || e instanceof HerstelFout || e instanceof DossierSleutelFout) {
      uit(e.message)
      return 1
    }
    if (e instanceof MigratieFout) {
      uit(`${e.message} Werk de app bij tot minstens de versie uit de back-up (zie Versie app bij bekijk).`)
      return 1
    }
    const code = (e as { code?: unknown } | null)?.code
    const melding = e instanceof Error ? `${e.name}${typeof code === 'string' ? ` (${code})` : ''}: ${e.message}` : 'onbekende fout'
    uit(`Mislukt: ${maskeerFout(melding.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, '$1***@'))}`)
    return 1
  } finally {
    await sluitPool()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  voerUit(process.argv.slice(2)).then((code) => process.exit(code))
}
