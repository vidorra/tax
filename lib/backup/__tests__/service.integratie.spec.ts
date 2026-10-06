/**
 * De back-upservice als geheel.
 *
 * - Altijd: backupConfig (puur) en een controle van de broncode dat geen console-aanroep in lib/backup,
 *   lib/mail, het CLI of instrumentation.ts een adres, sleutel of token logt.
 * - Met IB_TEST_DATABASE_URL (wegwerpcluster, eigen schema): geplande tik met een nep-Resend, ontsleutelen en
 *   terugzetten in een leeg schema, tweede tik, tik buiten de termijn, mislukte mail met wachttijd, te groot,
 *   back-ups op verzoek, gelijke wachttijden in planning.ts en runs.ts, en de log zonder geheimen.
 */
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { zetResendFetch } from '@/lib/mail'

import { backupConfig } from '../service'
import {
  GEBRUIKER_MAIL,
  MB_TOKEN,
  metSchema,
  nepResend,
  ONTVANGER,
  RESEND_SLEUTEL,
  tabelInhoud,
  TOTP_GEHEIM,
  vangLog,
  vulDatabase,
  zetBackupEnv,
  type ResendVerzoek,
} from './hulp'

describe('backupConfig', () => {
  const sleutel = randomBytes(32).toString('base64')
  const resend = { DATABASE_URL: 'postgres://ib@db/ib', DOSSIER_KEY: sleutel, BACKUP_MAIL_TO: ' jan@example.nl ', RESEND_API_KEY: 're_x', MAIL_FROM: 'noreply@example.nl' }

  it('klaar met Resend of met SMTP', () => {
    expect(backupConfig(resend)).toEqual({ klaar: true, ontbreekt: [], ontvanger: 'jan@example.nl' })
    const smtp = { ...resend, RESEND_API_KEY: undefined, SMTP_HOST: 'smtp.example.nl', SMTP_USER: 'u', SMTP_PASS: 'p' }
    expect(backupConfig(smtp)).toEqual({ klaar: true, ontbreekt: [], ontvanger: 'jan@example.nl' })
  })

  it('noemt alles wat ontbreekt', () => {
    expect(backupConfig({})).toEqual({
      klaar: false,
      ontbreekt: ['DATABASE_URL', 'DOSSIER_KEY', 'BACKUP_MAIL_TO', 'MAIL_FROM', 'RESEND_API_KEY of SMTP_HOST, SMTP_USER en SMTP_PASS'],
      ontvanger: null,
    })
    expect(backupConfig({ ...resend, SMTP_HOST: 'x', RESEND_API_KEY: '' }).ontbreekt).toEqual(['SMTP_USER', 'SMTP_PASS'])
  })

  it('een ongeldige sleutel of een ongeldig adres telt als ontbrekend', () => {
    // Gezet maar ongeldig: de melding zegt waarom, zodat je niet denkt dat de variabele ontbreekt.
    expect(backupConfig({ ...resend, DOSSIER_KEY: 'te-kort' }).ontbreekt).toEqual(['DOSSIER_KEY (ongeldig: 32 bytes als base64)'])
    expect(backupConfig({ ...resend, DOSSIER_KEY: '' }).ontbreekt).toEqual(['DOSSIER_KEY'])
    for (const adres of ['Jan <jan@example.nl>', 'jan@example', 'jan@example.nl, piet@example.nl', 'jan@example.nl\nBcc: x@y.nl']) {
      expect(backupConfig({ ...resend, BACKUP_MAIL_TO: adres })).toEqual({
        klaar: false,
        ontbreekt: ['BACKUP_MAIL_TO (geen geldig adres: gebruik één kaal mailadres, zonder naam of komma)'],
        ontvanger: null,
      })
    }
    expect(backupConfig({ ...resend, BACKUP_MAIL_TO: ' ' }).ontbreekt).toEqual(['BACKUP_MAIL_TO'])
  })

  it('valt voor DOSSIER_KEY niet terug op process.env', () => {
    const oud = process.env.DOSSIER_KEY
    process.env.DOSSIER_KEY = sleutel
    try {
      expect(backupConfig({ ...resend, DOSSIER_KEY: undefined }).ontbreekt).toEqual(['DOSSIER_KEY'])
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
    const verboden = /\b(ontvanger|aan|adres|sleutel|token|wachtwoord|geheim\w*|process|env|inhoud|bestand|tekst|body|DOSSIER_KEY|RESEND_API_KEY|SMTP_PASS)\b/
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

const BASIS_URL = process.env.IB_TEST_DATABASE_URL?.trim()
const SCHEMA = `ib_svc_${Date.now()}_${randomBytes(3).toString('hex')}`
const DOEL = `${SCHEMA}_doel`

describe.skipIf(!BASIS_URL)('back-upservice op een echte database', () => {
  let url = ''
  let sleutel = ''
  let beheer: Client
  let db: Client
  let resend: ReturnType<typeof nepResend>
  let log: ReturnType<typeof vangLog>

  const service = () => import('../service')
  const verzoeken = (): ResendVerzoek[] => resend.verzoeken
  const rij = async (periode: string) =>
    (await db.query(`SELECT soort, status, pogingen, bytes, sha256, rijen, fout FROM backups WHERE periode = $1`, [periode])).rows[0]

  beforeAll(async () => {
    url = metSchema(BASIS_URL!, SCHEMA)
    sleutel = randomBytes(32).toString('base64')
    beheer = new Client({ connectionString: BASIS_URL })
    await beheer.connect()
    await beheer.query(`CREATE SCHEMA ${SCHEMA}`)
    zetBackupEnv(url, sleutel)
    delete (globalThis as Record<string, unknown>).__ibDb
    const { migreer } = await import('@/scripts/migrate')
    await migreer(url, undefined, () => undefined)
    db = new Client({ connectionString: url })
    await db.connect()
    await vulDatabase(db)
    log = vangLog()
  })

  beforeEach(() => {
    zetBackupEnv(url, sleutel)
    resend = nepResend()
  })
  afterEach(() => zetResendFetch(null))

  afterAll(async () => {
    log?.herstel()
    const { getPool } = await import('@/lib/db')
    await getPool().end().catch(() => undefined)
    delete (globalThis as Record<string, unknown>).__ibDb
    await db?.end().catch(() => undefined)
    await beheer.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await beheer.query(`DROP SCHEMA IF EXISTS ${DOEL} CASCADE`)
    await beheer.end()
  })

  it('een geplande tik op 1 februari mailt één versleutelde back-up die volledig terug te zetten is', async () => {
    const { geplandeTik } = await service()
    const r = await geplandeTik(new Date('2027-02-01T09:00:00+01:00'))
    expect(r).toMatchObject({
      status: 'verstuurd',
      bestandsnaam: expect.stringMatching(/^ibcalculator-backup-\d{4}-\d{2}-\d{2}\.ibcbak$/),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      rijen: { users: 1, households: 1, dossier_years: 2, snapshots: 1, accountant_docs: 1, koppelingen: 1 },
    })
    expect(verzoeken()).toHaveLength(1)
    const [v] = verzoeken()
    expect(v.url).toBe('https://api.resend.com/emails')
    expect(v.body).toMatchObject({ to: [ONTVANGER], from: 'noreply@example.nl', subject: 'Back-up ibcalculator · 1 februari 2027' })
    expect(v.body.attachments).toHaveLength(1)
    const bijlage = v.body.attachments![0]
    expect(bijlage).toMatchObject({ filename: r.bestandsnaam, content_type: 'application/octet-stream' })

    // Het bestand: precies wat de run vastlegt, en niets leesbaars.
    const { sha256Hex, ontsleutelBackup } = await import('../formaat')
    const bestand = Buffer.from(bijlage.content, 'base64')
    expect(bestand.length).toBe(r.bytes)
    expect(sha256Hex(bestand)).toBe(r.sha256)
    for (const leesbaar of [GEBRUIKER_MAIL, TOTP_GEHEIM, 'households', 'password_hash']) expect(bestand.includes(leesbaar)).toBe(false)
    expect(await rij('2027-02')).toEqual({ soort: 'gepland', status: 'verstuurd', pogingen: 1, bytes: r.bytes, sha256: r.sha256, rijen: r.rijen, fout: null })

    // De tekst: uitleg, aantallen, SHA-256 en herstel; geen adressen, geheimen of bedragen.
    const tekst = v.body.text
    for (const moet of ['volledige back-up', 'DOSSIER_KEY', 'bewust niet in deze mail', r.sha256!, 'npm run backup -- bekijk', 'npm run backup -- herstel', '--overschrijf', 'Versie app:  abc1234', '1 februari en 1 augustus']) {
      expect(tekst).toContain(moet)
    }
    expect(tekst).toMatch(/dossier_years\s+2\n/)
    for (const nooit of [GEBRUIKER_MAIL, ONTVANGER, sleutel, RESEND_SLEUTEL, TOTP_GEHEIM, MB_TOKEN, '€', '81234', '\u2014', '\u2192']) expect(tekst).not.toContain(nooit)

    // Ontsleutelen met DOSSIER_KEY en terugzetten in een leeg schema geeft exact dezelfde rijen.
    const { dossierSleutel } = await import('@/lib/crypto')
    const inhoud = ontsleutelBackup(bestand, dossierSleutel())
    expect(inhoud.migraties).toEqual(readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort())
    expect(inhoud.gitSha).toBe('abc1234')
    expect(inhoud.tabellen.map((t) => t.naam)).not.toContain('backups')
    await beheer.query(`CREATE SCHEMA ${DOEL}`)
    const doelUrl = metSchema(BASIS_URL!, DOEL)
    const { migreer } = await import('@/scripts/migrate')
    await migreer(doelUrl, undefined, () => undefined, { alleen: inhoud.migraties })
    const { herstelDump } = await import('../dump')
    const doel = new Client({ connectionString: doelUrl })
    await doel.connect()
    try {
      expect(await herstelDump(doel, inhoud)).toEqual(r.rijen)
      expect(await tabelInhoud(doel)).toEqual(await tabelInhoud(db))
      const { rows } = await doel.query(`SELECT count(*)::int AS n FROM backups`)
      expect(rows[0].n).toBe(0)
    } finally {
      await doel.end()
    }
  })

  it('een tweede tik voor hetzelfde moment stuurt niets, ook niet binnen de inhaaltermijn', async () => {
    const { geplandeTik } = await service()
    expect(await geplandeTik(new Date('2027-02-01T10:00:00+01:00'))).toMatchObject({ status: 'overgeslagen', reden: expect.stringContaining('1 februari 2027') })
    expect((await geplandeTik(new Date('2027-02-20T09:00:00+01:00'))).status).toBe('overgeslagen')
    expect(verzoeken()).toHaveLength(0)
    expect((await rij('2027-02')).pogingen).toBe(1)
  })

  it('een tik op 15 maart doet niets', async () => {
    const { geplandeTik } = await service()
    const voor = (await db.query(`SELECT count(*)::int AS n FROM backups`)).rows[0].n
    expect(await geplandeTik(new Date('2027-03-15T09:00:00+01:00'))).toEqual({
      status: 'overgeslagen',
      reden: 'Er staat nu geen back-up gepland. De volgende is op 1 augustus 2027.',
    })
    expect(verzoeken()).toHaveLength(0)
    expect((await db.query(`SELECT count(*)::int AS n FROM backups`)).rows[0].n).toBe(voor)
  })

  it('een mislukte mail geeft status mislukt; een nieuwe poging volgt pas na de wachttijd', async () => {
    const { geplandeTik, backupStatus } = await service()
    resend.zetAntwoord(() => new Response(JSON.stringify({ message: `Domein niet geverifieerd voor ${ONTVANGER} (sleutel ${RESEND_SLEUTEL})` }), { status: 403 }))
    const r = await geplandeTik(new Date('2027-08-01T10:00:00+02:00'))
    expect(r).toMatchObject({ status: 'mislukt', reden: expect.stringMatching(/^Mailen mislukt: resend 403/) })
    expect(verzoeken()).toHaveLength(1)
    const mislukt = await rij('2027-08')
    expect(mislukt).toMatchObject({ status: 'mislukt', pogingen: 1, bytes: null, sha256: null })
    for (const tekst of [r.reden!, mislukt.fout]) {
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
    await db.query(`UPDATE backups SET gestart_op = gestart_op - interval '61 minutes' WHERE periode = '2027-08'`)
    expect((await geplandeTik(new Date('2027-08-01T11:31:00+02:00'))).status).toBe('verstuurd')
    expect(verzoeken()).toHaveLength(2)
    expect(await rij('2027-08')).toMatchObject({ status: 'verstuurd', pogingen: 2, fout: null })

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
    const { geplandeTik } = await service()
    const r = await geplandeTik(new Date('2028-02-01T09:00:00+01:00'), { maxMailBytes: 64 })
    expect(r).toMatchObject({ status: 'te-groot', reden: expect.stringContaining('groter dan de mailgrens van 64 bytes'), bytes: expect.any(Number) })
    expect(r.bytes!).toBeGreaterThan(64)
    expect(verzoeken()).toHaveLength(0)
    expect(await rij('2028-02')).toMatchObject({ status: 'te-groot', bytes: r.bytes, sha256: r.sha256, rijen: r.rijen, fout: r.reden })
    expect(log.regels.some((l) => l.includes('te groot om te mailen'))).toBe(true)
    expect((await geplandeTik(new Date('2028-02-02T09:00:00+01:00'))).status).toBe('overgeslagen')
    expect(verzoeken()).toHaveLength(0)
  })

  it('back-up op verzoek: eigen onderwerp, en geweigerd als er een loopt of bij drie per uur', async () => {
    const { handmatigeBackup } = await service()
    const nu = new Date('2026-10-04T15:32:00+02:00')
    const r1 = await handmatigeBackup(nu)
    expect(r1).toMatchObject({ status: 'verstuurd', bestandsnaam: expect.stringMatching(/^ibcalculator-backup-\d{4}-\d{2}-\d{2}-\d{4}\.ibcbak$/) })
    expect(verzoeken()[0].body.subject).toBe('Back-up ibcalculator · op verzoek, 4 oktober 2026')
    expect(verzoeken()[0].body.text).toContain('zelf aangevraagd op 4 oktober 2026 om 15:32')

    const { rows } = await db.query<{ id: number }>(`INSERT INTO backups (soort, status) VALUES ('handmatig', 'bezig') RETURNING id`)
    expect(await handmatigeBackup(nu)).toEqual({ geweigerd: 'bezig' })
    await db.query(`UPDATE backups SET status = 'mislukt', afgerond_op = now() WHERE id = $1`, [rows[0].id])

    expect(await handmatigeBackup(nu)).toMatchObject({ status: 'verstuurd' })
    expect(await handmatigeBackup(nu)).toEqual({ geweigerd: 'te-vaak' })
    expect(verzoeken()).toHaveLength(2)
  })

  it('niet ingericht: de tik slaat over en op verzoek wordt geweigerd met wat er ontbreekt', async () => {
    const { geplandeTik, handmatigeBackup, backupStatus } = await service()
    process.env.BACKUP_MAIL_TO = 'geen-adres'
    const ongeldig = 'BACKUP_MAIL_TO (geen geldig adres: gebruik één kaal mailadres, zonder naam of komma)'
    expect(await geplandeTik(new Date('2029-02-01T09:00:00+01:00'))).toEqual({ status: 'overgeslagen', reden: `De back-up is niet ingericht (ontbreekt: ${ongeldig}).` })
    expect(await handmatigeBackup()).toEqual({ geweigerd: 'niet-ingericht', ontbreekt: [ongeldig] })
    expect(await backupStatus()).toMatchObject({ geconfigureerd: false, ontbreekt: [ongeldig], ontvanger: null })
    expect(verzoeken()).toHaveLength(0)
    expect(await rij('2029-02')).toBeUndefined()
  })

  it('wachttijdUren en de SQL in claimGepland geven voor pogingen 1 tot en met 10 dezelfde wachttijd', async () => {
    const { claimGepland } = await import('../runs')
    const { wachttijdUren } = await import('../planning')
    const eerste = await claimGepland('2031-02')
    expect(eerste).toEqual({ id: expect.any(Number), poging: 1 })
    const id = eerste!.id
    for (let p = 1; p <= 10; p++) {
      const minuten = wachttijdUren(p) * 60
      await db.query(`UPDATE backups SET status = 'mislukt', pogingen = $2, gestart_op = now() - make_interval(mins => $3::int) WHERE id = $1`, [id, p, minuten - 1])
      expect(await claimGepland('2031-02'), `na poging ${p}, een minuut voor ${wachttijdUren(p)} uur`).toBeNull()
      await db.query(`UPDATE backups SET gestart_op = now() - make_interval(mins => $2::int) WHERE id = $1`, [id, minuten + 1])
      expect(await claimGepland('2031-02'), `na poging ${p}, een minuut na ${wachttijdUren(p)} uur`).toEqual({ id, poging: p + 1 })
    }
    expect(Array.from({ length: 10 }, (_, i) => wachttijdUren(i + 1))).toEqual([1, 2, 4, 8, 16, 24, 24, 24, 24, 24])
  })

  it('een herstelpunt van de JSON-import ouder dan 30 dagen gaat vóór de dump weg; een nieuwer blijft', async () => {
    const { rows } = await db.query<{ id: number }>(`SELECT id FROM households ORDER BY id LIMIT 1`)
    const hh = rows[0].id
    await db.query(`INSERT INTO herstelpunten (household_id, sleutel, reden, inhoud_enc, aangemaakt) VALUES ($1, 'svc-oud', 'json-import', 'x', now() - interval '45 days'), ($1, 'svc-nieuw', 'json-import', 'x', now() - interval '2 days')`, [hh])
    try {
      const { maakBackupBestand } = await service()
      const b = await maakBackupBestand('handmatig')
      expect(b.rijen.herstelpunten).toBe(1)
      const over = await db.query<{ sleutel: string }>(`SELECT sleutel FROM herstelpunten WHERE sleutel LIKE 'svc-%'`)
      expect(over.rows.map((r) => r.sleutel)).toEqual(['svc-nieuw'])
    } finally {
      await db.query(`DELETE FROM herstelpunten WHERE sleutel LIKE 'svc-%'`)
    }
  })

  it('niets in de log bevat een volledig adres, een sleutel, een token of inhoud van rijen', () => {
    expect(log.regels.length).toBeGreaterThan(0)
    const alles = log.regels.join('\n')
    for (const nooit of [ONTVANGER, GEBRUIKER_MAIL, sleutel, RESEND_SLEUTEL, TOTP_GEHEIM, MB_TOKEN, 'noreply@example.nl']) expect(alles).not.toContain(nooit)
  })
})
