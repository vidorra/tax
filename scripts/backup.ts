/**
 * Back-up van de database op de opdrachtregel.
 *
 *   npm run backup -- maak [--uit <map>] [--mail]        back-up van het databasebestand naar een bestand en/of mailen
 *   npm run backup -- bekijk <bestand>                   metadata, aantallen rijen en een controle van het bestand
 *   npm run backup -- herstel <bestand> [--overschrijf]  terugzetten in het databasebestand (DATABASE_PATH)
 *   npm run backup -- ontsleutel <bestand> <uit.db>      het SQLite-bestand uit de back-up wegschrijven
 *
 * Het databasebestand is DATABASE_PATH (standaard ./data/ibcalculator.db, in de container /app/data/ibcalculator.db).
 * maak zonder opties schrijft naar ./backups/ (staat in .gitignore). Met --mail gaat de back-up naar BACKUP_MAIL_TO
 * en telt hij als back-up op verzoek in het dossier; met --mail én --uit gebeuren beide. Elk commando heeft
 * DOSSIER_KEY nodig; voor bekijk, herstel en ontsleutel dezelfde sleutel als waarmee de back-up is gemaakt.
 *
 * herstel werkt ook terwijl de app draait (zie lib/backup/herstel.ts). Een lege database (ook een die start.sh na de
 * eerste deploy heeft gemigreerd) wordt zonder meer gevuld; staan er al gegevens in, dan is --overschrijf nodig.
 * Daarna lopen de migraties van deze versie van de app en zijn alle bestaande sessies ingetrokken.
 *
 * In de container draai je het script als de gebruiker van de app (docker exec -u node), anders zijn nieuwe
 * bestanden van root en kan de app er niet meer in schrijven; als root weigert het script.
 *
 * Toont nooit inhoud van rijen, sleutels of het volledige mailadres.
 */
import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { BackupFout, leesKop, ontsleutelBackup, sha256Hex, sleutelId } from '@/lib/backup/formaat'
import { HerstelFout, herstelBackup, openBackupDatabase } from '@/lib/backup/herstel'
import { backupConfig, handmatigeBackup, maakBackupBestand, type BackupBestand } from '@/lib/backup/service'
import { SnapshotFout } from '@/lib/backup/snapshot'
import type { BackupInhoud } from '@/lib/backup/types'
import { formatGrootte, rijenRegels, tijdstipNL } from '@/lib/backup/weergave'
import { DossierSleutelFout, dossierSleutel } from '@/lib/crypto'
import { dbPad, sluitDb } from '@/lib/db'
import { MigratieFout } from '@/lib/db/migreer'
import { maskeerAdres, maskeerFout } from '@/lib/mail'

type Uit = (regel: string) => void

const GEBRUIK = [
  'Gebruik:',
  '  npm run backup -- maak [--uit <map>] [--mail]',
  '  npm run backup -- bekijk <bestand>',
  '  npm run backup -- herstel <bestand> [--overschrijf]',
  '  npm run backup -- ontsleutel <bestand> <uit.db>',
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

/**
 * Als root een database van een andere gebruiker aanraken maakt bestanden (-wal, -shm, een nieuw databasebestand)
 * die de app daarna niet kan schrijven. Dan weigeren, met de juiste opdracht erbij.
 */
function controleerGebruiker(pad: string): void {
  if (process.getuid?.() !== 0) return
  let eigenaar: number
  try {
    eigenaar = statSync(existsSync(pad) ? pad : dirname(pad)).uid
  } catch {
    return
  }
  if (eigenaar !== 0) {
    throw new GebruiksFout(
      `Je draait dit script als root, maar de database is van een andere gebruiker (uid ${eigenaar}). Bestanden die root nu aanmaakt, kan de app daarna niet meer schrijven. Draai het als de gebruiker van de app, in de container met docker exec -u node.`,
    )
  }
}

/** Het databasebestand voor maak: moet bestaan, anders is er niets om te bewaren. */
function bestaandeDatabase(): string {
  const pad = dbPad()
  if (!existsSync(pad)) throw new GebruiksFout(`Er is geen database op ${pad}. Zet DATABASE_PATH op het databasebestand, of voer eerst npm run db:migrate uit.`)
  controleerGebruiker(pad)
  return pad
}

function rijenTabel(rijen: Record<string, number>, uit: Uit): void {
  for (const regel of rijenRegels(rijen)) uit(regel)
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
  bestaandeDatabase()
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

async function leesBestand(pad: string): Promise<Buffer> {
  try {
    return await readFile(pad)
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') throw new GebruiksFout(`Bestand niet gevonden: ${pad}`)
    throw e
  }
}

async function leesBackup(pad: string): Promise<BackupInhoud> {
  return ontsleutelBackup(await leesBestand(pad), dossierSleutel())
}

async function bekijk(args: string[], uit: Uit): Promise<number> {
  const [pad, ...rest] = leesArgumenten(args, [], []).los
  if (!pad || rest.length) throw new GebruiksFout('Geef precies één bestand op.')
  const ruw = await leesBestand(pad)
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
  uit(`Database:       ${formatGrootte(inhoud.database.length)} (SQLite)`)
  uit('Rijen per tabel:')
  rijenTabel(inhoud.rijen, uit)
  // Alleen in het geheugen: bekijken schrijft niets naar schijf.
  try {
    openBackupDatabase(inhoud, null).opruimen()
  } catch (e) {
    if (e instanceof HerstelFout) {
      uit(`Controle:       niet in orde. ${e.message}`)
      return 1
    }
    throw e
  }
  uit('Controle:       in orde (integriteit, verwijzingen en migraties van deze app)')
  return 0
}

async function herstel(args: string[], uit: Uit): Promise<number> {
  const a = leesArgumenten(args, ['--overschrijf'], [])
  const [pad, ...rest] = a.los
  if (!pad || rest.length) throw new GebruiksFout('Geef precies één bestand op.')
  const doel = dbPad()
  controleerGebruiker(doel)
  const inhoud = await leesBackup(pad)
  uit(`Back-up van ${tijdstipNL(inhoud.gemaaktOp)} terugzetten in ${doel}.`)
  await herstelBackup(inhoud, { doel, overschrijf: a.vlaggen.has('--overschrijf'), log: uit })
  uit('Alle bestaande sessies zijn ingetrokken.')
  uit('Klaar. Log in met het account uit de back-up; de app hoeft niet opnieuw te starten.')
  return 0
}

async function ontsleutel(args: string[], uit: Uit): Promise<number> {
  const [pad, doel, ...rest] = leesArgumenten(args, [], []).los
  if (!pad || !doel || rest.length) throw new GebruiksFout('Geef een back-up en een doelbestand op.')
  const inhoud = await leesBackup(pad)
  try {
    await writeFile(doel, inhoud.database, { flag: 'wx', mode: 0o600 })
  } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') throw new GebruiksFout(`${doel} bestaat al. Kies een ander doelbestand.`)
    throw e
  }
  uit(`Ontsleutelde database geschreven naar ${doel} (${formatGrootte(inhoud.database.length)}, SQLite).`)
  uit('Let op: dit bestand bevat gevoelige gegevens, waaronder e-mailadressen, wachtwoordhashes en de geheimen voor tweestapsverificatie. Dossiers en tokens staan er nog versleuteld met DOSSIER_KEY in. Verwijder het zodra je klaar bent.')
  return 0
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
    if (e instanceof BackupFout || e instanceof HerstelFout || e instanceof SnapshotFout || e instanceof DossierSleutelFout) {
      uit(e.message)
      return 1
    }
    if (e instanceof MigratieFout) {
      uit(`De back-up staat terug, maar migreren is mislukt: ${e.message} Los dit op en voer daarna npm run db:migrate uit.`)
      return 1
    }
    const code = (e as { code?: unknown } | null)?.code
    const melding = e instanceof Error ? `${e.name}${typeof code === 'string' ? ` (${code})` : ''}: ${e.message}` : 'onbekende fout'
    uit(`Mislukt: ${maskeerFout(melding.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, '$1***@'))}`)
    return 1
  } finally {
    // De verbinding van lib/db (maak), zodat het proces kan stoppen.
    sluitDb()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  voerUit(process.argv.slice(2)).then((code) => process.exit(code))
}
