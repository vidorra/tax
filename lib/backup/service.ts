/**
 * Back-up van de database: configuratie uit de omgeving, dump, versleutelen, mailen en de run vastleggen.
 *
 *  - geplandeTik: elke tik van de scheduler (scheduler.ts). Doet alleen iets als het moment van 1 februari
 *    of 1 augustus nog binnen de inhaaltermijn ligt en de periode te claimen is (runs.ts).
 *  - handmatigeBackup: de knop in het dossier en `npm run backup -- maak --mail`.
 *  - backupStatus: de kaart in het dossier (GET /api/dossier/backup).
 *
 * Server-only. Logt nooit inhoud van rijen, sleutels, tokens of het volledige mailadres. Foutmeldingen in
 * de tabel backups en in de log zijn kort en geheimvrij.
 */
import { DossierSleutelFout, dossierSleutel, sleutelGeldig } from '@/lib/crypto'
import { getPool } from '@/lib/db'
import { ruimVerlopenHerstelpuntenOp } from '@/lib/dossier/import-opslag'
import { geldigAdres, maskeerAdres, maskeerFout, ontbrekendeMailVariabelen, verstuurMail } from '@/lib/mail'

import { HerstelFout, maakDump, telRijen } from './dump'
import { BackupFout, bestandsnaam, sha256Hex, sleutelId, versleutelBackup } from './formaat'
import { actueelMoment, amsterdamDatum, BACKUP_MOMENTEN, datumNLLang, volgendMoment } from './planning'
import { claimGepland, gedanePeriodes, laatsteGeslaagd, laatsteRun, markeerAfgebroken, rondAf, startHandmatig } from './runs'
import type { BackupConfig, BackupInhoud, BackupResultaat, BackupSoort, BackupStatusPubliek, RijTelling } from './types'
import { formatGrootte, momentenNL, tijdstipNL } from './weergave'

type Omgeving = Record<string, string | undefined>

/** Grootste bijlage die we mailen. Daarboven weigeren de meeste mailboxen het bericht (na base64 ruim 26 MB). */
export const MAX_MAIL_BYTES = 20 * 1024 * 1024

const BIJLAGE_TYPE = 'application/octet-stream'

/**
 * Wat er nodig is om een back-up te maken én te mailen: DATABASE_URL, een geldige DOSSIER_KEY, een geldig
 * adres in BACKUP_MAIL_TO en een complete mailer (Resend of SMTP, zie lib/mail).
 */
export function backupConfig(env: Omgeving = process.env): BackupConfig {
  const ontbreekt: string[] = []
  if (!env.DATABASE_URL?.trim()) ontbreekt.push('DATABASE_URL')
  // Expliciet een tekst meegeven: bij undefined valt sleutelGeldig terug op process.env.
  if (!env.DOSSIER_KEY?.trim()) ontbreekt.push('DOSSIER_KEY')
  else if (!sleutelGeldig(env.DOSSIER_KEY)) ontbreekt.push('DOSSIER_KEY (ongeldig: 32 bytes als base64)')
  const aan = env.BACKUP_MAIL_TO?.trim() ?? ''
  const ontvanger = aan && geldigAdres(aan) ? aan : null
  if (!aan) ontbreekt.push('BACKUP_MAIL_TO')
  else if (!ontvanger) ontbreekt.push('BACKUP_MAIL_TO (geen geldig adres: gebruik één kaal mailadres, zonder naam of komma)')
  ontbreekt.push(...ontbrekendeMailVariabelen(env))
  return { klaar: ontbreekt.length === 0, ontbreekt, ontvanger }
}

/** Een versleutelde back-up, klaar om te mailen of op te slaan. Alleen de velden naast `bestand` zijn veilig om te tonen. */
export interface BackupBestand {
  bestand: Buffer
  bestandsnaam: string
  bytes: number
  sha256: string
  rijen: RijTelling
  gemaaktOp: string
  gitSha: string | null
  migraties: string[]
  /** Vingerafdruk van DOSSIER_KEY, geen geheim. */
  sleutelId: string
}

export interface UitvoerOpties {
  /** Grens voor de bijlage in bytes; standaard MAX_MAIL_BYTES. Vooral voor tests van het te-groot-pad. */
  maxMailBytes?: number
  /** Krijgt het versleutelde bestand vóór het mailen, bijvoorbeeld om het ook op schijf te zetten (CLI). */
  bewaar?: (b: BackupBestand) => Promise<void>
}

function gitShaUit(env: Omgeving): string | null {
  const s = env.GIT_SHA?.trim()
  return s && /^[\w.-]{1,64}$/.test(s) ? s : null
}

/**
 * Volledige dump van DATABASE_URL, versleuteld met een sleutel afgeleid van DOSSIER_KEY. Gooit bij een fout. Ruimt eerst
 * verlopen herstelpunten van de JSON-import op: die horen na 30 dagen niet meer in een back-up. Lukt dat niet, dan gaat
 * de back-up toch door.
 */
export async function maakBackupBestand(soort: BackupSoort): Promise<BackupBestand> {
  const sleutel = dossierSleutel(process.env.DOSSIER_KEY ?? '')
  await ruimVerlopenHerstelpuntenOp().catch(() => undefined)
  const client = await getPool().connect()
  let inhoud: BackupInhoud
  try {
    inhoud = await maakDump(client, { gitSha: gitShaUit(process.env) })
  } catch (e) {
    // Een verbinding met een fout gaat weg in plaats van terug in de pool.
    client.release(e instanceof Error ? e : true)
    throw e
  }
  client.release()
  const bestand = versleutelBackup(inhoud, sleutel)
  return {
    bestand,
    bestandsnaam: bestandsnaam(new Date(inhoud.gemaaktOp), soort),
    bytes: bestand.length,
    sha256: sha256Hex(bestand),
    rijen: telRijen(inhoud),
    gemaaktOp: inhoud.gemaaktOp,
    gitSha: inhoud.gitSha,
    migraties: inhoud.migraties,
    sleutelId: sleutelId(sleutel),
  }
}

/** Haalt geheimen uit een tekst: wachtwoorden in verbindings-URL's, DOSSIER_KEY, DATABASE_URL, mailgeheimen en mailadressen. */
function zonderGeheimen(tekst: string): string {
  let s = tekst.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]*@/gi, '$1***@')
  for (const naam of ['DATABASE_URL', 'DOSSIER_KEY']) {
    const v = process.env[naam]?.trim()
    if (v && v.length >= 8) s = s.split(v).join('***')
  }
  return maskeerFout(s)
}

/** Korte, geheimvrije omschrijving van een fout, voor de tabel backups, de log en de browser. */
function veiligeFout(e: unknown): string {
  if (e instanceof DossierSleutelFout) return 'DOSSIER_KEY ontbreekt of is ongeldig.'
  if (e instanceof BackupFout || e instanceof HerstelFout) return zonderGeheimen(e.message)
  if (e instanceof RangeError && /string length/i.test(e.message)) return 'De database is te groot om in één keer als back-up te maken.'
  const code = (e as { code?: unknown } | null)?.code
  // SQLSTATE: alleen de code, want een melding van Postgres kan in theorie een waarde bevatten.
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return `Databasefout (code ${code}).`
  if (typeof code === 'string' && /^E[A-Z]+$/.test(code)) return `De database is niet bereikbaar (${code}).`
  if (e instanceof Error) return zonderGeheimen(`${e.name}: ${e.message}`)
  return 'Onbekende fout.'
}

/** Naam en code van een fout, voor één logregel. */
export function foutLabel(e: unknown): string {
  const naam = e instanceof Error ? e.name : 'onbekend'
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'string' && /^[\w-]{1,40}$/.test(code) ? `${naam}, ${code}` : naam
}

async function rondAfVeilig(id: number, uitkomst: Parameters<typeof rondAf>[1]): Promise<void> {
  try {
    await rondAf(id, uitkomst)
  } catch (e) {
    console.warn(`Back-up: uitkomst van run ${id} vastleggen mislukt (${foutLabel(e)}).`)
  }
}

function onderwerp(soort: BackupSoort, nu: Date, moment: string | null): string {
  return soort === 'gepland' && moment
    ? `Back-up ibcalculator · ${datumNLLang(moment)}`
    : `Back-up ibcalculator · op verzoek, ${datumNLLang(amsterdamDatum(nu))}`
}

/** Tekst van de mail: wat het is, aantallen, grootte, SHA-256 en hoe je terugzet. Geen adressen, geen bedragen. */
function mailTekst(b: BackupBestand, soort: BackupSoort, nu: Date, moment: string | null): string {
  const aanleiding =
    soort === 'gepland' && moment
      ? `Dit is de geplande back-up van ${datumNLLang(moment)}. De server maakt er twee per jaar, op ${momentenNL(BACKUP_MOMENTEN)}.`
      : `Je hebt deze back-up zelf aangevraagd op ${tijdstipNL(nu)}.`
  const namen = Object.keys(b.rijen)
  const breedte = Math.max(5, ...namen.map((n) => n.length))
  const tabellen = namen.length
    ? namen.map((n) => `  ${n.padEnd(breedte)}  ${b.rijen[n].toLocaleString('nl-NL')}`)
    : ['  (geen tabellen)']
  const pad = `backups/${b.bestandsnaam}`
  return [
    'Hoi,',
    '',
    `In de bijlage zit een volledige back-up van de database van ibcalculator: alle accounts, huishoudens, belastingjaren en koppelingen. ${aanleiding}`,
    '',
    'Het bestand is versleuteld met AES-256-GCM, met een sleutel die is afgeleid van DOSSIER_KEY. Zonder die sleutel heb je niets aan het bestand, en daarom staat hij bewust niet in deze mail. Bewaar DOSSIER_KEY apart, bijvoorbeeld in je wachtwoordmanager. Ben je de sleutel kwijt, dan is deze back-up niet meer te openen.',
    '',
    `Bestand:     ${b.bestandsnaam}`,
    `Gemaakt op:  ${tijdstipNL(b.gemaaktOp)} (Nederlandse tijd)`,
    `Grootte:     ${formatGrootte(b.bytes)}`,
    `SHA-256:     ${b.sha256}`,
    `Sleutel-id:  ${b.sleutelId} (vingerafdruk van DOSSIER_KEY, geen geheim)`,
    ...(b.gitSha ? [`Versie app:  ${b.gitSha}`] : []),
    '',
    'Rijen per tabel:',
    ...tabellen,
    '',
    'Terugzetten',
    `1. Sla de bijlage op in de map van ibcalculator, bijvoorbeeld als ${pad}.`,
    '2. Zet DATABASE_URL op de database waarin je wilt terugzetten en DOSSIER_KEY op dezelfde sleutel als nu.',
    `3. Controleer het bestand: npm run backup -- bekijk ${pad}`,
    `4. Zet het terug in een lege database: npm run backup -- herstel ${pad}`,
    '   Het script maakt eerst de tabellen aan die bij de back-up horen. Wil je de gegevens in een bestaande database vervangen, voeg dan --overschrijf toe. De huidige gegevens in die database gaan dan verloren.',
    '5. Start de app opnieuw en log in zoals je gewend bent.',
    '',
    'De stappen staan ook in de README, onder Back-up.',
    '',
    'Deze mail is automatisch verstuurd door ibcalculator. Er staan geen financiële gegevens in; die zitten alleen versleuteld in de bijlage.',
  ].join('\n')
}

/**
 * Voert een geclaimde run uit: dump, versleutelen, groottecontrole, mailen en afronden. Gooit nooit; elke
 * fout wordt een run met status 'mislukt' en een korte melding zonder geheimen.
 */
async function voerUit(
  runId: number,
  soort: BackupSoort,
  ontvanger: string,
  nu: Date,
  moment: string | null,
  opties: UitvoerOpties,
): Promise<BackupResultaat> {
  const label = soort === 'gepland' && moment ? `gepland ${moment.slice(0, 7)}` : 'op verzoek'
  let b: BackupBestand | undefined
  try {
    b = await maakBackupBestand(soort)
    const basis = { runId, bestandsnaam: b.bestandsnaam, bytes: b.bytes, sha256: b.sha256, rijen: b.rijen }
    if (opties.bewaar) await opties.bewaar(b)

    const grens = opties.maxMailBytes ?? MAX_MAIL_BYTES
    if (b.bytes > grens) {
      const reden = `De back-up is ${formatGrootte(b.bytes)}, groter dan de mailgrens van ${formatGrootte(grens)}. Maak een back-up naar een bestand met npm run backup -- maak.`
      await rondAfVeilig(runId, { status: 'te-groot', bytes: b.bytes, sha256: b.sha256, rijen: b.rijen, fout: reden })
      console.warn(`Back-up (${label}): te groot om te mailen (${formatGrootte(b.bytes)}, grens ${formatGrootte(grens)}).`)
      return { status: 'te-groot', reden, ...basis }
    }

    const mail = await verstuurMail({
      aan: ontvanger,
      onderwerp: onderwerp(soort, nu, moment),
      tekst: mailTekst(b, soort, nu, moment),
      bijlagen: [{ bestandsnaam: b.bestandsnaam, inhoud: b.bestand, type: BIJLAGE_TYPE }],
    })
    if (!mail.ok) {
      const reden = `Mailen mislukt: ${zonderGeheimen(mail.fout)}`
      await rondAfVeilig(runId, { status: 'mislukt', fout: reden })
      console.warn(`Back-up (${label}): ${reden}`)
      return { status: 'mislukt', reden, ...basis }
    }

    await rondAfVeilig(runId, { status: 'verstuurd', bytes: b.bytes, sha256: b.sha256, rijen: b.rijen })
    return { status: 'verstuurd', ...basis }
  } catch (e) {
    const reden = veiligeFout(e)
    await rondAfVeilig(runId, { status: 'mislukt', fout: reden })
    console.warn(`Back-up (${label}): mislukt. ${reden}`)
    return b ? { status: 'mislukt', reden, runId, bestandsnaam: b.bestandsnaam, bytes: b.bytes, sha256: b.sha256, rijen: b.rijen } : { status: 'mislukt', reden, runId }
  }
}

/**
 * Eén tik van de scheduler. Overgeslagen als de back-up niet is ingericht, als er geen moment binnen de
 * inhaaltermijn ligt, of als de periode al gedaan is, nu loopt of in de wachttijd na een mislukte poging zit.
 * Gooit alleen als de database niet bereikbaar is bij het claimen; de uitvoering zelf gooit nooit.
 */
export async function geplandeTik(nu: Date = new Date(), opties: UitvoerOpties = {}): Promise<BackupResultaat> {
  const cfg = backupConfig()
  if (!cfg.klaar || !cfg.ontvanger) return { status: 'overgeslagen', reden: `De back-up is niet ingericht (ontbreekt: ${cfg.ontbreekt.join(', ')}).` }
  const moment = actueelMoment(nu)
  if (!moment.binnenInhaaltermijn) {
    return { status: 'overgeslagen', reden: `Er staat nu geen back-up gepland. De volgende is op ${datumNLLang(volgendMoment(nu, () => true))}.` }
  }
  const claim = await claimGepland(moment.periode)
  if (!claim) return { status: 'overgeslagen', reden: `De back-up van ${datumNLLang(moment.datum)} is al gemaakt, loopt nog of wacht op een nieuwe poging.` }
  return voerUit(claim.id, 'gepland', cfg.ontvanger, nu, moment.datum, opties)
}

export type HandmatigGeweigerd = { geweigerd: 'bezig' | 'te-vaak' | 'niet-ingericht'; ontbreekt?: string[] }

/** Back-up op verzoek (de knop in het dossier). Geweigerd als hij niet is ingericht, er al een loopt of het te vaak is. */
export async function handmatigeBackup(nu: Date = new Date(), opties: UitvoerOpties = {}): Promise<BackupResultaat | HandmatigGeweigerd> {
  const cfg = backupConfig()
  if (!cfg.klaar || !cfg.ontvanger) return { geweigerd: 'niet-ingericht', ontbreekt: cfg.ontbreekt }
  const start = await startHandmatig()
  if ('geweigerd' in start) return start
  return voerUit(start.id, 'handmatig', cfg.ontvanger, nu, null, opties)
}

/** Status voor de kaart in het dossier. De ontvanger is gemaskeerd. */
export async function backupStatus(nu: Date = new Date()): Promise<BackupStatusPubliek> {
  const cfg = backupConfig()
  const basis = {
    geconfigureerd: cfg.klaar,
    ontbreekt: cfg.ontbreekt,
    ontvanger: cfg.ontvanger ? maskeerAdres(cfg.ontvanger) : null,
    momenten: [...BACKUP_MOMENTEN],
  }
  if (cfg.ontbreekt.includes('DATABASE_URL')) {
    return { ...basis, volgende: volgendMoment(nu, () => false), laatste: null, laatsteGeslaagd: null }
  }
  await markeerAfgebroken()
  const [laatste, geslaagd, gedaan] = await Promise.all([laatsteRun(), laatsteGeslaagd(), gedanePeriodes()])
  return { ...basis, volgende: volgendMoment(nu, (p) => gedaan.has(p)), laatste, laatsteGeslaagd: geslaagd }
}
