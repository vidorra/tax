import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import {
  BackupFout,
  type BackupFoutCode,
  bestandsnaam,
  leesKop,
  MAX_META_BYTES,
  ontsleutelBackup,
  sha256Hex,
  sleutelId,
  STANDAARD_MAX_BYTES,
  versleutelBackup,
} from '../formaat'
import type { BackupInhoud, BackupMeta } from '../types'

const SLEUTEL = Buffer.from('6Kq1y0sJ8m2Qv7tZ3cXn9bR4hW5eL1pA0dF6gU2iO8s=', 'base64')
const ANDERE_SLEUTEL = randomBytes(32)

// Indeling volgens de specificatie, onafhankelijk van de implementatie.
const MAGIC = Buffer.from('IBCBAK', 'ascii')
const POS = { versie: 6, sleutelId: 7, salt: 15, iv: 31, tag: 43, data: 59 } as const

/** Een echt SQLite-bestand met een paar rijen, zoals snapshot.ts het maakt (alleen dan in het geheugen). */
function database(rijen = 3, tekst = (i: number) => `rij ${i}`): Buffer {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL) STRICT`)
  const zet = db.prepare('INSERT INTO users (email) VALUES (?)')
  db.transaction(() => {
    for (let i = 0; i < rijen; i++) zet.run(i === 0 ? 'een@example.nl' : tekst(i))
  })()
  const buf = db.serialize()
  db.close()
  return buf
}

const DB = database()

function meta(extra: Partial<BackupMeta> = {}): BackupMeta {
  return {
    formaat: 'ibcalculator-backup',
    versie: 2,
    gemaaktOp: '2027-02-01T00:30:12.345Z',
    gitSha: 'abc1234',
    migraties: ['0001_init.sql'],
    rijen: { users: 3, households: 0 },
    ...extra,
  }
}

function inhoud(extra: Partial<BackupInhoud> = {}): BackupInhoud {
  return { ...meta(), database: DB, ...extra }
}

function code(fn: () => unknown): BackupFoutCode | 'geen fout' | 'andere fout' {
  try {
    fn()
    return 'geen fout'
  } catch (e) {
    return e instanceof BackupFout ? e.code : 'andere fout'
  }
}

function fout(fn: () => unknown): BackupFout {
  try {
    fn()
  } catch (e) {
    if (e instanceof BackupFout) return e
    throw e
  }
  throw new Error('verwachtte een BackupFout')
}

/** Bouwt een geldig versleutelde envelop om willekeurige plaintext, zodat ook de inhoudscontrole te testen is. */
function envelop(plaintext: Buffer, opties: { sleutel?: Buffer; versie?: number } = {}): Buffer {
  const sleutel = opties.sleutel ?? SLEUTEL
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const id = createHmac('sha256', sleutel).update('ibcalculator back-up sleutel-id').digest().subarray(0, 8)
  const kop = Buffer.concat([MAGIC, Buffer.from([opties.versie ?? 2]), id, salt, iv])
  const k = Buffer.from(hkdfSync('sha256', sleutel, salt, Buffer.from('ibcalculator back-up v1'), 32))
  const c = createCipheriv('aes-256-gcm', k, iv)
  c.setAAD(kop)
  const data = Buffer.concat([c.update(plaintext), c.final()])
  return Buffer.concat([kop, c.getAuthTag(), data])
}

/** Plaintext van versie 2: gzip(lengte (4, BE) | meta-JSON | database). */
function pakIn(m: unknown, db: Buffer = DB, metaTekst?: string): Buffer {
  const json = Buffer.from(metaTekst ?? JSON.stringify(m), 'utf8')
  const lengte = Buffer.alloc(4)
  lengte.writeUInt32BE(json.length)
  return gzipSync(Buffer.concat([lengte, json, db]))
}

describe('versleutelBackup en ontsleutelBackup', () => {
  it('rondreis geeft dezelfde metadata en precies dezelfde databasebytes terug', () => {
    const origineel = inhoud()
    const terug = ontsleutelBackup(versleutelBackup(origineel, SLEUTEL), SLEUTEL)
    expect(terug).toEqual(origineel)
    expect(terug.database.equals(DB)).toBe(true)
    // De database is weer een werkende SQLite-database.
    const db = new Database(terug.database)
    expect(db.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 3 })
    db.close()
  })

  it('rondreis met gitSha null, geen migraties en lege aantallen', () => {
    const origineel = inhoud({ gitSha: null, migraties: [], rijen: {} })
    expect(ontsleutelBackup(versleutelBackup(origineel, SLEUTEL), SLEUTEL)).toEqual(origineel)
  })

  it('rondreis met een grotere database, kleiner dan het origineel', () => {
    let x = 12345
    const willekeurig = () => (x = (x * 1103515245 + 12345) % 2147483648)
    const groot = database(20_000, (i) => `v2.${willekeurig().toString(36)}.${i}.${'x'.repeat(willekeurig() % 120)}`)
    const origineel = inhoud({ database: groot, rijen: { users: 20_000 } })
    const bestand = versleutelBackup(origineel, SLEUTEL)
    expect(bestand.length).toBeLessThan(groot.length)
    expect(ontsleutelBackup(bestand, SLEUTEL).database.equals(groot)).toBe(true)
  })

  it('twee keer versleutelen geeft verschillende bestanden met een eigen salt en iv', () => {
    const a = versleutelBackup(inhoud(), SLEUTEL)
    const b = versleutelBackup(inhoud(), SLEUTEL)
    expect(a.equals(b)).toBe(false)
    expect(a.subarray(POS.salt, POS.iv).equals(b.subarray(POS.salt, POS.iv))).toBe(false)
    expect(a.subarray(POS.iv, POS.tag).equals(b.subarray(POS.iv, POS.tag))).toBe(false)
    expect(a.subarray(0, POS.salt).equals(b.subarray(0, POS.salt))).toBe(true)
    expect(ontsleutelBackup(a, SLEUTEL)).toEqual(ontsleutelBackup(b, SLEUTEL))
  })

  it('volgt de beschreven indeling: kop als AAD, en in de plaintext lengte, meta-JSON en het SQLite-bestand', () => {
    const bestand = versleutelBackup(inhoud(), SLEUTEL)
    expect(bestand.subarray(0, 6).toString('ascii')).toBe('IBCBAK')
    expect(bestand[POS.versie]).toBe(2)
    const id = createHmac('sha256', SLEUTEL).update('ibcalculator back-up sleutel-id').digest().subarray(0, 8)
    expect(bestand.subarray(POS.sleutelId, POS.salt).equals(id)).toBe(true)
    const salt = bestand.subarray(POS.salt, POS.iv)
    const iv = bestand.subarray(POS.iv, POS.tag)
    const k = Buffer.from(hkdfSync('sha256', SLEUTEL, salt, Buffer.from('ibcalculator back-up v1'), 32))
    const d = createDecipheriv('aes-256-gcm', k, iv)
    d.setAAD(bestand.subarray(0, POS.tag))
    d.setAuthTag(bestand.subarray(POS.tag, POS.data))
    const plaintext = gunzipSync(Buffer.concat([d.update(bestand.subarray(POS.data)), d.final()]))
    const lengte = plaintext.readUInt32BE(0)
    expect(JSON.parse(plaintext.subarray(4, 4 + lengte).toString('utf8'))).toEqual(meta())
    expect(plaintext.subarray(4 + lengte).equals(DB)).toBe(true)
    expect(plaintext.subarray(4 + lengte, 4 + lengte + 16).toString('latin1')).toBe('SQLite format 3\u0000')
  })

  it('bevat geen leesbare inhoud', () => {
    const bestand = versleutelBackup(inhoud(), SLEUTEL)
    for (const leesbaar of ['een@example.nl', 'users', 'SQLite format', 'ibcalculator-backup', 'abc1234']) expect(bestand.includes(leesbaar), leesbaar).toBe(false)
  })

  it('weigert een sleutel die geen 32 bytes is', () => {
    expect(() => versleutelBackup(inhoud(), randomBytes(16))).toThrow(RangeError)
    expect(() => ontsleutelBackup(versleutelBackup(inhoud(), SLEUTEL), randomBytes(31))).toThrow(RangeError)
    expect(() => sleutelId(Buffer.alloc(0))).toThrow(RangeError)
  })

  it('weigert een ongeldige inhoud al bij het versleutelen', () => {
    expect(code(() => versleutelBackup({ ...inhoud(), gemaaktOp: 'gisteren' }, SLEUTEL))).toBe('inhoud')
    expect(code(() => versleutelBackup({ ...inhoud(), rijen: { users: -1 } }, SLEUTEL))).toBe('inhoud')
    expect(code(() => versleutelBackup({ ...inhoud(), database: randomBytes(4096) }, SLEUTEL))).toBe('inhoud')
    expect(code(() => versleutelBackup({ ...inhoud(), database: Buffer.alloc(0) }, SLEUTEL))).toBe('inhoud')
    expect(code(() => versleutelBackup({ ...inhoud(), migraties: ['x'.repeat(MAX_META_BYTES)] }, SLEUTEL))).toBe('inhoud')
  })
})

describe('foutcodes', () => {
  const geldig = versleutelBackup(inhoud(), SLEUTEL)

  it('formaat: leeg, te kort of geen back-up', () => {
    expect(code(() => ontsleutelBackup(Buffer.alloc(0), SLEUTEL))).toBe('formaat')
    expect(code(() => ontsleutelBackup(Buffer.from('IBC'), SLEUTEL))).toBe('formaat')
    expect(code(() => ontsleutelBackup(geldig.subarray(0, 14), SLEUTEL))).toBe('formaat')
    expect(code(() => ontsleutelBackup(geldig.subarray(0, 30), SLEUTEL))).toBe('formaat')
    expect(code(() => ontsleutelBackup(geldig.subarray(0, POS.data - 1), SLEUTEL))).toBe('formaat')
    expect(code(() => ontsleutelBackup(DB, SLEUTEL))).toBe('formaat')
    expect(code(() => ontsleutelBackup(Buffer.from('PK\u0003\u0004 dit is een zip'), SLEUTEL))).toBe('formaat')
    expect(fout(() => ontsleutelBackup(Buffer.from('%PDF-1.7 en nog veel meer tekst hier om lang genoeg te zijn voor de kop van een back-up'), SLEUTEL)).message).toBe(
      'Dit bestand is geen back-up van ibcalculator.',
    )
  })

  it('kop plus tag zonder ciphertext is wel lang genoeg, maar dan klopt de controle niet', () => {
    expect(code(() => ontsleutelBackup(geldig.subarray(0, POS.data), SLEUTEL))).toBe('beschadigd')
  })

  it('versie: een onbekende formaatversie', () => {
    for (const v of [0, 3, 255]) {
      const b = Buffer.from(geldig)
      b[POS.versie] = v
      const f = fout(() => ontsleutelBackup(b, SLEUTEL))
      expect(f.code).toBe('versie')
      expect(f.message).toContain(`formaatversie ${v}`)
      expect(f.message).toContain('kan alleen versie 2 lezen')
    }
  })

  it('versie 1 (de oude JSON-dump van Postgres) wordt geweigerd met een eigen melding', () => {
    const oud = envelop(gzipSync(Buffer.from(JSON.stringify({ formaat: 'ibcalculator-backup', versie: 1, gemaaktOp: '2026-10-04T12:00:00.000Z', gitSha: null, migraties: [], tabellen: [] }))), {
      versie: 1,
    })
    const f = fout(() => ontsleutelBackup(oud, SLEUTEL))
    expect(f.code).toBe('versie')
    expect(f.message).toContain('formaatversie 1')
    expect(f.message).toContain('Postgres')
    expect(leesKop(oud)).toEqual({ versie: 1, sleutelId: sleutelId(SLEUTEL) })
  })

  it('versie: een korte kop van een nieuwere versie geeft versie, geen formaat', () => {
    const b = Buffer.from(geldig.subarray(0, 20))
    b[POS.versie] = 3
    expect(code(() => ontsleutelBackup(b, SLEUTEL))).toBe('versie')
  })

  it('andere-sleutel: met een duidelijke melding', () => {
    const f = fout(() => ontsleutelBackup(geldig, ANDERE_SLEUTEL))
    expect(f.code).toBe('andere-sleutel')
    expect(f.name).toBe('BackupFout')
    expect(f.message).toContain('andere DOSSIER_KEY')
    expect(f.message).toContain(sleutelId(SLEUTEL))
    expect(f.message).not.toContain(sleutelId(ANDERE_SLEUTEL))
    expect(f.message).not.toContain(SLEUTEL.toString('base64'))
  })

  it('beschadigd: gewijzigde salt, iv, tag of ciphertext', () => {
    for (const plek of [POS.salt, POS.iv, POS.iv + 11, POS.tag, POS.tag + 15, POS.data, Math.floor((POS.data + geldig.length) / 2), geldig.length - 1]) {
      const b = Buffer.from(geldig)
      b[plek] ^= 0x01
      expect(code(() => ontsleutelBackup(b, SLEUTEL)), `byte ${plek}`).toBe('beschadigd')
    }
  })

  it('beschadigd: afgekapt of aangevuld', () => {
    expect(code(() => ontsleutelBackup(geldig.subarray(0, geldig.length - 1), SLEUTEL))).toBe('beschadigd')
    expect(code(() => ontsleutelBackup(Buffer.concat([geldig, Buffer.from([0])]), SLEUTEL))).toBe('beschadigd')
  })

  it('elke gewijzigde byte valt op, met de code die bij die plek hoort', () => {
    const verwacht = (i: number): BackupFoutCode =>
      i < POS.versie ? 'formaat' : i === POS.versie ? 'versie' : i < POS.salt ? 'andere-sleutel' : 'beschadigd'
    for (let i = 0; i < geldig.length; i++) {
      const b = Buffer.from(geldig)
      b[i] ^= 0x80
      expect(code(() => ontsleutelBackup(b, SLEUTEL)), `byte ${i}`).toBe(verwacht(i))
    }
  })

  it('inhoud: geldige versleuteling maar geen gzip, geen kop of een kop die niet klopt', () => {
    expect(fout(() => ontsleutelBackup(envelop(Buffer.from('gewoon tekst')), SLEUTEL)).code).toBe('inhoud')
    expect(fout(() => ontsleutelBackup(envelop(gzipSync(Buffer.from([0, 0]))), SLEUTEL)).code).toBe('inhoud')
    const teLang = Buffer.alloc(4)
    teLang.writeUInt32BE(1000)
    expect(fout(() => ontsleutelBackup(envelop(gzipSync(Buffer.concat([teLang, Buffer.from('{}')]))), SLEUTEL)).code).toBe('inhoud')
    const veelTeLang = Buffer.alloc(4)
    veelTeLang.writeUInt32BE(MAX_META_BYTES + 1)
    expect(fout(() => ontsleutelBackup(envelop(gzipSync(Buffer.concat([veelTeLang, Buffer.alloc(MAX_META_BYTES + 1), DB]))), SLEUTEL)).code).toBe('inhoud')
    const geenJson = fout(() => ontsleutelBackup(envelop(pakIn(null, DB, '{"geheim": "w8woord", kapot')), SLEUTEL))
    expect(geenJson.code).toBe('inhoud')
    expect(geenJson.message).not.toContain('w8woord')
    expect(geenJson.cause).toBeUndefined()
  })

  it('inhoud: de vorm van de metadata klopt niet', () => {
    const goed = meta()
    const fouten: unknown[] = [
      null,
      [],
      'tekst',
      { ...goed, formaat: 'iets-anders' },
      { ...goed, versie: 1 },
      { ...goed, versie: 3 },
      { ...goed, gemaaktOp: undefined },
      { ...goed, gemaaktOp: '2027-02-01' },
      { ...goed, gemaaktOp: '2027-02-30T10:00:00Z' },
      { ...goed, gemaaktOp: '2027-02-01 00:30:00+01' },
      { ...goed, gemaaktOp: 1785542400000 },
      { ...goed, gitSha: 123 },
      { ...goed, gitSha: undefined },
      { ...goed, migraties: '0001' },
      { ...goed, migraties: ['0001', 2] },
      { ...goed, rijen: undefined },
      { ...goed, rijen: [] },
      { ...goed, rijen: { users: '3' } },
      { ...goed, rijen: { users: 1.5 } },
      { ...goed, rijen: { users: -1 } },
      { ...goed, rijen: { '': 1 } },
    ]
    for (const [i, waarde] of fouten.entries()) {
      expect(code(() => ontsleutelBackup(envelop(pakIn(waarde)), SLEUTEL)), `geval ${i}`).toBe('inhoud')
    }
  })

  it('inhoud: het databasebestand is geen SQLite-bestand', () => {
    const kapotteKop = Buffer.from(DB)
    kapotteKop[0] = 0x73
    const vreemdePagina = Buffer.from(DB)
    vreemdePagina.writeUInt16BE(1000, 16)
    for (const [naam, db] of [
      ['leeg', Buffer.alloc(0)],
      ['willekeurig', randomBytes(8192)],
      ['kop', kapotteKop],
      ['paginagrootte', vreemdePagina],
      ['afgekapt', DB.subarray(0, DB.length - 100)],
      ['alleen de kop', DB.subarray(0, 100)],
    ] as const) {
      const f = fout(() => ontsleutelBackup(envelop(pakIn(meta(), db)), SLEUTEL))
      expect(f.code, naam).toBe('inhoud')
      expect(f.message, naam).toContain('geen geldig SQLite-bestand')
    }
  })

  it('inhoud: meldingen noemen geen inhoud', () => {
    const f = fout(() => ontsleutelBackup(envelop(pakIn({ ...meta(), gitSha: { geheim: 'geheim@example.nl' } })), SLEUTEL))
    expect(f.code).toBe('inhoud')
    expect(f.message).toContain('gitSha')
    expect(f.message).not.toContain('geheim')
  })

  it('inhoud: tijdstippen met microseconden en een offset zijn geldig', () => {
    for (const gemaaktOp of ['2027-02-01T00:30:12Z', '2027-02-01T00:30:12.123456+01:00', '2026-10-04T15:32:00.123-02:30']) {
      expect(ontsleutelBackup(envelop(pakIn(meta({ gemaaktOp }))), SLEUTEL)).toEqual(inhoud({ gemaaktOp }))
    }
  })

  it('zip-bom: uitpakken stopt bij maxBytes', () => {
    const groot = database(2, () => 'a'.repeat(3_000_000))
    const bestand = versleutelBackup(inhoud({ database: groot }), SLEUTEL)
    expect(bestand.length).toBeLessThan(40_000)
    const f = fout(() => ontsleutelBackup(bestand, SLEUTEL, { maxBytes: 1_000_000 }))
    expect(f.code).toBe('inhoud')
    expect(f.message).toContain('groter dan de grens')
    expect(ontsleutelBackup(bestand, SLEUTEL, { maxBytes: groot.length + 4096 }).database.equals(groot)).toBe(true)
    expect(ontsleutelBackup(bestand, SLEUTEL).database.equals(groot)).toBe(true)
  })

  it('zip-bom: ook een envelop van een vreemde maker wordt begrensd', () => {
    const bom = envelop(gzipSync(Buffer.alloc(5_000_000, 0x20)))
    expect(code(() => ontsleutelBackup(bom, SLEUTEL, { maxBytes: 64 * 1024 }))).toBe('inhoud')
  })

  it('standaardgrens is 512 MB en maxBytes moet een positief geheel getal zijn', () => {
    expect(STANDAARD_MAX_BYTES).toBe(512 * 1024 * 1024)
    expect(() => ontsleutelBackup(geldig, SLEUTEL, { maxBytes: 0 })).toThrow(RangeError)
    expect(() => ontsleutelBackup(geldig, SLEUTEL, { maxBytes: 1.5 })).toThrow(RangeError)
  })
})

describe('leesKop en sleutelId', () => {
  it('leest versie en sleutelId zonder sleutel', () => {
    expect(leesKop(versleutelBackup(inhoud(), SLEUTEL))).toEqual({ versie: 2, sleutelId: sleutelId(SLEUTEL) })
  })

  it('sleutelId is 16 hextekens, vast per sleutel en anders per sleutel', () => {
    expect(sleutelId(SLEUTEL)).toMatch(/^[0-9a-f]{16}$/)
    expect(sleutelId(SLEUTEL)).toBe(sleutelId(Buffer.from(SLEUTEL)))
    expect(sleutelId(ANDERE_SLEUTEL)).not.toBe(sleutelId(SLEUTEL))
    expect(sleutelId(SLEUTEL)).toBe(createHmac('sha256', SLEUTEL).update('ibcalculator back-up sleutel-id').digest('hex').slice(0, 16))
  })

  it('geeft een onbekende versie gewoon terug', () => {
    const b = versleutelBackup(inhoud(), SLEUTEL)
    b[POS.versie] = 3
    expect(leesKop(b).versie).toBe(3)
  })

  it('gooit formaat bij een ongeldig bestand', () => {
    expect(code(() => leesKop(Buffer.alloc(0)))).toBe('formaat')
    expect(code(() => leesKop(Buffer.from('IBCBAK')))).toBe('formaat')
    expect(code(() => leesKop(Buffer.from('ZIP-bestand met genoeg bytes voor een kop en meer, echt waar, nog meer bytes')))).toBe('formaat')
    expect(code(() => leesKop(versleutelBackup(inhoud(), SLEUTEL).subarray(0, 40)))).toBe('formaat')
    expect(code(() => leesKop('IBCBAK' as unknown as Buffer))).toBe('formaat')
  })
})

describe('bestandsnaam', () => {
  it('gepland: alleen de Amsterdamse datum', () => {
    expect(bestandsnaam(new Date('2027-01-31T23:30:00Z'), 'gepland')).toBe('ibcalculator-backup-2027-02-01.ibcbak')
    expect(bestandsnaam(new Date('2026-07-31T22:30:00Z'), 'gepland')).toBe('ibcalculator-backup-2026-08-01.ibcbak')
  })

  it('handmatig: datum met uur en minuut in Amsterdamse tijd', () => {
    expect(bestandsnaam(new Date('2026-10-04T13:32:00Z'), 'handmatig')).toBe('ibcalculator-backup-2026-10-04-1532.ibcbak')
    expect(bestandsnaam(new Date('2026-12-04T13:32:59Z'), 'handmatig')).toBe('ibcalculator-backup-2026-12-04-1432.ibcbak')
    expect(bestandsnaam(new Date('2026-10-04T22:05:00Z'), 'handmatig')).toBe('ibcalculator-backup-2026-10-05-0005.ibcbak')
    expect(bestandsnaam(new Date('2026-12-31T23:00:00Z'), 'handmatig')).toBe('ibcalculator-backup-2027-01-01-0000.ibcbak')
  })

  it('weigert een ongeldige datum', () => {
    expect(() => bestandsnaam(new Date('kapot'), 'gepland')).toThrow(RangeError)
  })
})

describe('sha256Hex', () => {
  it('bekende testvector', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hash van het bestand zelf', () => {
    const b = versleutelBackup(inhoud(), SLEUTEL)
    expect(sha256Hex(b)).toBe(createHash('sha256').update(b).digest('hex'))
    expect(sha256Hex(b)).toMatch(/^[0-9a-f]{64}$/)
  })
})
