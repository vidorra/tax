/**
 * De back-upservice als geheel.
 *
 * - backupConfig (puur, met een nagebootste controle van de databasemap) en een controle van de broncode dat geen
 *   console-aanroep in lib/backup, lib/mail, het CLI of instrumentation.ts een adres, sleutel of token logt.
 * - Op een echte, tijdelijke SQLite-database: geplande tik met een nep-Resend, ontsleutelen en terugzetten in een nieuw
 *   bestand, tweede tik, tik buiten de termijn, mislukte mail met wachttijd, te groot, back-ups op verzoek, niet
 *   ingericht, opruimen van herstelpunten vóór de back-up, een database die niet in orde is, en de log zonder geheimen.
 */
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { dossierSleutel } from '@/lib/crypto'
import { getDb, getSqlite } from '@/lib/db'
import { backups, herstelpunten } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
import { zetResendFetch } from '@/lib/mail'

import { ontsleutelBackup, sha256Hex } from '../formaat'
import { herstelBackup } from '../herstel'
import { backupConfig, backupStatus, DATABASE_ONTBREEKT, geplandeTik, handmatigeBackup, maakBackupBestand } from '../service'
import { DAG, GEBRUIKER_MAIL, MB_TOKEN, nepResend, ONTVANGER, RESEND_SLEUTEL, tabelInhoud, terug, TOTP_GEHEIM, vangLog, vulDatabase, zetBackupEnv, type ResendVerzoek } from './hulp'

describe('backupConfig', () => {
  const sleutel = randomBytes(32).toString('base64')
  const resend = { DOSSIER_KEY: sleutel, BACKUP_MAIL_TO: ' jan@example.nl ', RESEND_API_KEY: 're_x', MAIL_FROM: 'noreply@example.nl' }
  const ja = () => true

  it('klaar met Resend of met SMTP', () => {
    expect(backupConfig(resend, ja)).toEqual({ klaar: true, ontbreekt: [], ontvanger: 'jan@example.nl' })
    const smtp = { ...resend, RESEND_API_KEY: undefined, SMTP_HOST: 'smtp.example.nl', SMTP_USER: 'u', SMTP_PASS: 'p' }
    expect(backupConfig(smtp, ja)).toEqual({ klaar: true, ontbreekt: [], ontvanger: 'jan@example.nl' })
  })

  it('noemt alles wat ontbreekt, ook een databasemap die niet schrijfbaar is', () => {
    expect(backupConfig({}, () => false)).toEqual({
      klaar: false,
      ontbreekt: [DATABASE_ONTBREEKT, 'DOSSIER_KEY', 'BACKUP_MAIL_TO', 'MAIL_FROM', 'RESEND_API_KEY of SMTP_HOST, SMTP_USER en SMTP_PASS'],
      ontvanger: null,
    })
    expect(DATABASE_ONTBREEKT).toBe('DATABASE_PATH (map niet schrijfbaar)')
    expect(backupConfig({ ...resend, SMTP_HOST: 'x', RESEND_API_KEY: '' }, ja).ontbreekt).toEqual(['SMTP_USER', 'SMTP_PASS'])
  })

  it('controleert de map van DATABASE_PATH uit de meegegeven omgeving', () => {
    const gezien: string[] = []
    backupConfig({ ...resend, DATABASE_PATH: '/srv/ib/data/ib.db' }, (pad) => (gezien.push(pad), true))
    expect(gezien).toEqual(['/srv/ib/data/ib.db'])
    // Zonder controle-functie: een echte map die niet bestaat onder een bestand kan niet.
    expect(backupConfig({ ...resend, DATABASE_PATH: '/dev/null/ib.db' }).ontbreekt).toEqual([DATABASE_ONTBREEKT])
  })

  it('een ongeldige sleutel of een ongeldig adres telt als ontbrekend', () => {
    // Gezet maar ongeldig: de melding zegt waarom, zodat je niet denkt dat de variabele ontbreekt.
    expect(backupConfig({ ...resend, DOSSIER_KEY: 'te-kort' }, ja).ontbreekt).toEqual(['DOSSIER_KEY (ongeldig: 32 bytes als base64)'])
    expect(backupConfig({ ...resend, DOSSIER_KEY: '' }, ja).ontbreekt).toEqual(['DOSSIER_KEY'])
    for (const adres of ['Jan <jan@example.nl>', 'jan@example', 'jan@example.nl, piet@example.nl', 'jan@example.nl\nBcc: x@y.nl']) {
      expect(backupConfig({ ...resend, BACKUP_MAIL_TO: adres }, ja)).toEqual({
        klaar: false,
        ontbreekt: ['BACKUP_MAIL_TO (geen geldig adres: gebruik één kaal mailadres, zonder naam of komma)'],
        ontvanger: null,
      })
    }
    expect(backupConfig({ ...resend, BACKUP_MAIL_TO: ' ' }, ja).ontbreekt).toEqual(['BACKUP_MAIL_TO'])
  })

  it('valt voor DOSSIER_KEY niet terug op process.env', () => {
    const oud = process.env.DOSSIER_KEY
    process.env.DOSSIER_KEY = sleutel
    try {
      expect(backupConfig({ ...resend, DOSSIER_KEY: undefined }, ja).ontbreekt).toEqual(['DOSSIER_KEY'])
    } finally {
      if (oud === undefined) delete process.env.DOSSIER_KEY
      else process.env.DOSSIER_KEY = oud
    }
  })
})

/** De argumenten van alle console-aanroepen in een bronbestand. */
function consoleAanroepen(bron: string): string[] {
  const uit: string[] = []
  const re = /console\.(log|info|warn|error|debug)\(/g
  for (let m = re.exec(bron); m; m = re.exec(bron)) {
    let diepte = 1
    let i = re.lastIndex
    for (; i < bron.length && diepte > 0; i++) {
      if (bron[i] === '(') diepte++
      else if (bron[i] === ')') diepte--
    }
    uit.push(bron.slice(re.lastIndex, i - 1))
  }
  return uit
}

/** Alleen de expressies: tekst tussen aanhalingstekens en de vaste delen van template literals vallen weg. */
function expressies(arg: string): string {
  let uit = ''
  let i = 0
  while (i < arg.length) {
    const c = arg[i]
    if (c === "'" || c === '"') {
      i++
      while (i < arg.length && arg[i] !== c) i += arg[i] === '\\' ? 2 : 1
      i++
    } else if (c === '`') {
      i++
      while (i < arg.length && arg[i] !== '`') {
        if (arg[i] === '$' && arg[i + 1] === '{') {
          let diepte = 1
          const start = i + 2
          i += 2
          while (i < arg.length && diepte > 0) {
            if (arg[i] === '{') diepte++
            else if (arg[i] === '}') diepte--
            i++
          }
          uit += ` ${expressies(arg.slice(start, i - 1))} `
        } else i += arg[i] === '\\' ? 2 : 1
      }
      i++
    } else {
      uit += c
      i++
    }
  }
  return uit
}

describe('logregels in de broncode', () => {
  it('geen console-aanroep logt een adres, sleutel, token of inhoud', () => {
    const wortel = process.cwd()
    const bestanden = [
      ...readdirSync(join(wortel, 'lib/backup')).filter((f) => f.endsWith('.ts')).map((f) => join('lib/backup', f)),
      ...readdirSync(join(wortel, 'lib/mail')).filter((f) => f.endsWith('.ts')).map((f) => join('lib/mail', f)),
      'scripts/backup.ts',
      'instrumentation.ts',
      'app/api/dossier/backup/route.ts',
    ]
    const verboden = /\b(ontvanger|aan|adres|sleutel|token|wachtwoord|geheim\w*|process|env|inhoud|bestand|tekst|body|database|DOSSIER_KEY|RESEND_API_KEY|SMTP_PASS)\b/
    let aantal = 0
    for (const bestand of bestanden) {
      for (const arg of consoleAanroepen(readFileSync(join(wortel, bestand), 'utf8'))) {
        aantal++
        const rest = expressies(arg).replace(/maskeerAdres\([^()]*\)/g, '')
        expect(rest, `${bestand}: console(${arg})`).not.toMatch(verboden)
      }
    }
    // De controle moet ook echt aanroepen vinden (scheduler en service loggen).
    expect(aantal).toBeGreaterThanOrEqual(5)
  })
})

describe('back-upservice op een echte database', () => {
  const testDb = gebruikTijdelijkeDb({ per: 'bestand' })
  let sleutel = ''
  let resend: ReturnType<typeof nepResend>
  let log: ReturnType<typeof vangLog>

  const verzoeken = (): ResendVerzoek[] => resend.verzoeken
  const rij = (periode: string) => getSqlite().prepare(`SELECT soort, status, pogingen, bytes, sha256, rijen, fout FROM backups WHERE periode = ?`).get(periode) as Record<string, unknown> | undefined
  const aantalRuns = () => (getSqlite().prepare('SELECT count(*) AS n FROM backups').get() as { n: number }).n

  beforeAll(() => {
    sleutel = randomBytes(32).toString('base64')
    zetBackupEnv(sleutel)
    vulDatabase()
    log = vangLog()
  })

  beforeEach(() => {
    zetBackupEnv(sleutel)
    resend = nepResend()
  })
  afterEach(() => zetResendFetch(null))
  afterAll(() => log?.herstel())

  it('een geplande tik op 1 februari mailt één versleutelde back-up die volledig terug te zetten is', async () => {
    const r = await geplandeTik(new Date('2027-02-01T09:00:00+01:00'))
    expect(r).toMatchObject({
      status: 'verstuurd',
      bestandsnaam: expect.stringMatching(/^ibcalculator-backup-\d{4}-\d{2}-\d{2}\.ibcbak$/),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      rijen: { users: 1, households: 1, dossier_years: 2, snapshots: 1, accountant_docs: 1, aangifte_staat: 0, herstelpunten: 0, koppelingen: 1 },
    })
    expect(verzoeken()).toHaveLength(1)
    const [v] = verzoeken()
    expect(v.url).toBe('https://api.resend.com/emails')
    expect(v.body).toMatchObject({ to: [ONTVANGER], from: 'noreply@example.nl', subject: 'Back-up ibcalculator · 1 februari 2027' })
    expect(v.body.attachments).toHaveLength(1)
    const bijlage = v.body.attachments![0]
    expect(bijlage).toMatchObject({ filename: r.bestandsnaam, content_type: 'application/octet-stream' })

    // Het bestand: precies wat de run vastlegt, en niets leesbaars.
    const bestand = Buffer.from(bijlage.content, 'base64')
    expect(bestand.length).toBe(r.bytes)
    expect(sha256Hex(bestand)).toBe(r.sha256)
    for (const leesbaar of [GEBRUIKER_MAIL, TOTP_GEHEIM, 'households', 'password_hash', 'SQLite format']) expect(bestand.includes(leesbaar)).toBe(false)
    expect(rij('2027-02')).toEqual({ soort: 'gepland', status: 'verstuurd', pogingen: 1, bytes: r.bytes, sha256: r.sha256, rijen: JSON.stringify(r.rijen), fout: null })

    // De tekst: uitleg, aantallen, SHA-256 en herstel; geen adressen, geheimen of bedragen.
    const tekst = v.body.text
    for (const moet of ['volledige back-up', 'DOSSIER_KEY', 'bewust niet in deze mail', r.sha256!, 'npm run backup -- bekijk', 'npm run backup -- herstel', '--overschrijf', 'DATABASE_PATH', 'Versie app:  abc1234', '1 februari en 1 augustus']) {
      expect(tekst).toContain(moet)
    }
    expect(tekst).toMatch(/dossier_years\s+2\n/)
    for (const nooit of [GEBRUIKER_MAIL, ONTVANGER, sleutel, RESEND_SLEUTEL, TOTP_GEHEIM, MB_TOKEN, '€', '81234', '\u2014', '\u2192']) expect(tekst).not.toContain(nooit)

    // Ontsleutelen met DOSSIER_KEY en terugzetten in een nieuw bestand geeft exact dezelfde rijen, zonder de administratie.
    const inhoud = ontsleutelBackup(bestand, dossierSleutel())
    expect(inhoud.migraties).toEqual(readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort())
    expect(inhoud.gitSha).toBe('abc1234')
    expect(inhoud.rijen).toEqual(r.rijen)
    const doel = join(testDb.map, 'teruggezet', 'ibcalculator.db')
    const h = await herstelBackup(inhoud, { doel })
    expect(h.rijen).toEqual(r.rijen)
    const teruggezet = new Database(doel, { readonly: true })
    try {
      expect(tabelInhoud(teruggezet, { zonderSessie: true })).toEqual(tabelInhoud(getSqlite(), { zonderSessie: true }))
      expect(teruggezet.prepare('SELECT count(*) AS n FROM backups').get()).toEqual({ n: 0 })
    } finally {
      teruggezet.close()
    }
  })

  it('een tweede tik voor hetzelfde moment stuurt niets, ook niet binnen de inhaaltermijn', async () => {
    expect(await geplandeTik(new Date('2027-02-01T10:00:00+01:00'))).toMatchObject({ status: 'overgeslagen', reden: expect.stringContaining('1 februari 2027') })
    expect((await geplandeTik(new Date('2027-02-20T09:00:00+01:00'))).status).toBe('overgeslagen')
    expect(verzoeken()).toHaveLength(0)
    expect(rij('2027-02')?.pogingen).toBe(1)
  })

  it('een tik op 15 maart doet niets', async () => {
    const voor = aantalRuns()
    expect(await geplandeTik(new Date('2027-03-15T09:00:00+01:00'))).toEqual({
      status: 'overgeslagen',
      reden: 'Er staat nu geen back-up gepland. De volgende is op 1 augustus 2027.',
    })
    expect(verzoeken()).toHaveLength(0)
    expect(aantalRuns()).toBe(voor)
  })

  it('een mislukte mail geeft status mislukt; een nieuwe poging volgt pas na de wachttijd', async () => {
    resend.zetAntwoord(() => new Response(JSON.stringify({ message: `Domein niet geverifieerd voor ${ONTVANGER} (sleutel ${RESEND_SLEUTEL})` }), { status: 403 }))
    const r = await geplandeTik(new Date('2027-08-01T10:00:00+02:00'))
    expect(r).toMatchObject({ status: 'mislukt', reden: expect.stringMatching(/^Mailen mislukt: resend 403/) })
    expect(verzoeken()).toHaveLength(1)
    const mislukt = rij('2027-08')!
    expect(mislukt).toMatchObject({ status: 'mislukt', pogingen: 1, bytes: null, sha256: null })
    for (const tekst of [r.reden!, mislukt.fout as string]) {
      expect(tekst).not.toContain(ONTVANGER)
      expect(tekst).not.toContain(RESEND_SLEUTEL)
      expect(tekst).toContain('b•••@example.nl')
    }

    // Binnen de wachttijd (1 uur na de eerste poging): niets.
    resend.zetAntwoord(() => new Response(JSON.stringify({ id: 're_2' }), { status: 200 }))
    expect((await geplandeTik(new Date('2027-08-01T10:30:00+02:00'))).status).toBe('overgeslagen')
    expect(verzoeken()).toHaveLength(1)
    const open = await backupStatus(new Date('2027-08-01T10:30:00+02:00'))
    expect(open).toMatchObject({ volgende: '2027-08-01', laatste: { soort: 'gepland', periode: '2027-08', status: 'mislukt' } })
    expect(open.laatste?.fout).not.toContain(ONTVANGER)

    // Na de wachttijd lukt het, met poging 2.
    const id = (getSqlite().prepare(`SELECT id FROM backups WHERE periode = '2027-08'`).get() as { id: number }).id
    terug(id, 61 * 60_000)
    expect((await geplandeTik(new Date('2027-08-01T11:31:00+02:00'))).status).toBe('verstuurd')
    expect(verzoeken()).toHaveLength(2)
    expect(rij('2027-08')).toMatchObject({ status: 'verstuurd', pogingen: 2, fout: null })

    const daarna = await backupStatus(new Date('2027-08-02T09:00:00+02:00'))
    expect(daarna).toMatchObject({
      geconfigureerd: true,
      ontbreekt: [],
      ontvanger: 'b•••@example.nl',
      momenten: ['02-01', '08-01'],
      volgende: '2028-02-01',
      laatsteGeslaagd: { periode: '2027-08', status: 'verstuurd' },
    })
    expect(JSON.stringify(daarna)).not.toContain(ONTVANGER)
  })

  it('te groot om te mailen: geen mail, status te-groot, en de periode telt als gedaan', async () => {
    const r = await geplandeTik(new Date('2028-02-01T09:00:00+01:00'), { maxMailBytes: 64 })
    expect(r).toMatchObject({ status: 'te-groot', reden: expect.stringContaining('groter dan de mailgrens van 64 bytes'), bytes: expect.any(Number) })
    expect(r.bytes!).toBeGreaterThan(64)
    expect(verzoeken()).toHaveLength(0)
    expect(rij('2028-02')).toMatchObject({ status: 'te-groot', bytes: r.bytes, sha256: r.sha256, rijen: JSON.stringify(r.rijen), fout: r.reden })
    expect(log.regels.some((l) => l.includes('te groot om te mailen'))).toBe(true)
    expect((await geplandeTik(new Date('2028-02-02T09:00:00+01:00'))).status).toBe('overgeslagen')
    expect(verzoeken()).toHaveLength(0)
  })

  it('back-up op verzoek: eigen onderwerp, en geweigerd als er een loopt of bij drie per uur', async () => {
    const nu = new Date('2026-10-04T15:32:00+02:00')
    const r1 = await handmatigeBackup(nu)
    expect(r1).toMatchObject({ status: 'verstuurd', bestandsnaam: expect.stringMatching(/^ibcalculator-backup-\d{4}-\d{2}-\d{2}-\d{4}\.ibcbak$/) })
    expect(verzoeken()[0].body.subject).toBe('Back-up ibcalculator · op verzoek, 4 oktober 2026')
    expect(verzoeken()[0].body.text).toContain('zelf aangevraagd op 4 oktober 2026 om 15:32')

    const bezig = getDb().insert(backups).values({ soort: 'handmatig', status: 'bezig' }).returning().get()
    expect(await handmatigeBackup(nu)).toEqual({ geweigerd: 'bezig' })
    getSqlite().prepare(`UPDATE backups SET status = 'mislukt', afgerond_op = ? WHERE id = ?`).run(new Date().toISOString(), bezig.id)

    expect(await handmatigeBackup(nu)).toMatchObject({ status: 'verstuurd' })
    expect(await handmatigeBackup(nu)).toEqual({ geweigerd: 'te-vaak' })
    expect(verzoeken()).toHaveLength(2)
  })

  it('niet ingericht: de tik slaat over en op verzoek wordt geweigerd met wat er ontbreekt', async () => {
    process.env.BACKUP_MAIL_TO = 'geen-adres'
    const ongeldig = 'BACKUP_MAIL_TO (geen geldig adres: gebruik één kaal mailadres, zonder naam of komma)'
    expect(await geplandeTik(new Date('2029-02-01T09:00:00+01:00'))).toEqual({ status: 'overgeslagen', reden: `De back-up is niet ingericht (ontbreekt: ${ongeldig}).` })
    expect(await handmatigeBackup()).toEqual({ geweigerd: 'niet-ingericht', ontbreekt: [ongeldig] })
    expect(await backupStatus()).toMatchObject({ geconfigureerd: false, ontbreekt: [ongeldig], ontvanger: null })
    expect(verzoeken()).toHaveLength(0)
    expect(rij('2029-02')).toBeUndefined()
  })

  it('een herstelpunt van de JSON-import ouder dan 30 dagen gaat vóór de back-up weg; een nieuwer blijft', async () => {
    const hh = (getSqlite().prepare('SELECT id FROM households ORDER BY id LIMIT 1').get() as { id: number }).id
    getDb()
      .insert(herstelpunten)
      .values([
        { householdId: hh, sleutel: 'svc-oud', reden: 'json-import', inhoudEnc: 'x', aangemaakt: new Date(Date.now() - 45 * DAG) },
        { householdId: hh, sleutel: 'svc-nieuw', reden: 'json-import', inhoudEnc: 'x', aangemaakt: new Date(Date.now() - 2 * DAG) },
      ])
      .run()
    try {
      const b = await maakBackupBestand('handmatig')
      expect(b.rijen.herstelpunten).toBe(1)
      expect(getSqlite().prepare(`SELECT sleutel FROM herstelpunten WHERE sleutel LIKE 'svc-%'`).all()).toEqual([{ sleutel: 'svc-nieuw' }])
      const inhoud = ontsleutelBackup(b.bestand, dossierSleutel())
      expect(inhoud.database.includes('svc-oud')).toBe(false)
    } finally {
      getSqlite().exec(`DELETE FROM herstelpunten WHERE sleutel LIKE 'svc-%'`)
    }
  })

  it('een database die niet in orde is: run mislukt met een duidelijke reden, zonder inhoud', async () => {
    // De back-ups op verzoek van hierboven tellen anders mee voor de grens van drie per uur.
    getSqlite().exec(`DELETE FROM backups WHERE soort = 'handmatig'`)
    getSqlite().pragma('foreign_keys = OFF')
    const db = getSqlite()
    const { n } = db.prepare('SELECT max(id) + 1000 AS n FROM households').get() as { n: number }
    db.prepare(`INSERT INTO dossier_years (household_id, jaar, invoer_enc) VALUES (?, 2030, 'x')`).run(n)
    getSqlite().pragma('foreign_keys = ON')
    try {
      const r = await handmatigeBackup(new Date())
      expect(r).toMatchObject({ status: 'mislukt', reden: expect.stringContaining('De database is niet in orde') })
      expect((r as { reden: string }).reden).toContain('dossier_years')
      expect(verzoeken()).toHaveLength(0)
    } finally {
      getSqlite().exec(`DELETE FROM dossier_years WHERE jaar = 2030`)
    }
  })

  it('niets in de log bevat een volledig adres, een sleutel, een token of inhoud van rijen', () => {
    expect(log.regels.length).toBeGreaterThan(0)
    const alles = log.regels.join('\n')
    for (const nooit of [ONTVANGER, GEBRUIKER_MAIL, sleutel, RESEND_SLEUTEL, TOTP_GEHEIM, MB_TOKEN, 'noreply@example.nl', testDb.pad]) expect(alles).not.toContain(nooit)
  })
})
