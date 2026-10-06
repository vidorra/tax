/**
 * Volledige dump en herstel van de database, generiek over alle tabellen van het huidige schema.
 *
 * De dump leest alles binnen één REPEATABLE READ-transactie, zodat de back-up één consistent moment is, en
 * houdt zolang de migratielock gedeeld vast, zodat er geen migratie tussendoor kan lopen.
 * Tabellen staan in volgorde van foreign keys (ouders eerst), zodat herstel ze in die volgorde kan invoegen.
 * Elke waarde gaat als tekst mee (de tekstvorm van Postgres zelf, SQL NULL als JSON null). Herstel zet de
 * tekst met een expliciete cast terug naar het type van de doelkolom. Zo komen jsonb (ook een JSON-null in
 * een NOT NULL-kolom), grote getallen, decimalen met hun schaal, bytea, arrays en tijdstempels exact terug.
 * Een oudere dump met JSON-waarden in plaats van tekst wordt op dezelfde manier teruggezet.
 *
 * Identifiers gaan altijd via quoteIdent; foutmeldingen bevatten alleen namen van tabellen, kolommen en
 * constraints, nooit inhoud van rijen.
 */
import type { ClientBase } from 'pg'

import { LOCK } from '@/lib/db/locks'

import { BACKUP_FORMAAT, BACKUP_VERSIE, UITGESLOTEN_TABELLEN, type BackupInhoud, type BackupTabel, type RijTelling } from './types'

/** Fout bij herstel die je als gebruiker kunt oplossen (verkeerde doeldatabase, ontbrekende migratie). */
export class HerstelFout extends Error {
  constructor(bericht: string) {
    super(bericht)
    this.name = 'HerstelFout'
  }
}

/** Aantal rijen per INSERT bij herstel. */
const PORTIE = 500

export function quoteIdent(naam: string): string {
  if (naam.length === 0 || naam.includes('\u0000')) throw new Error('Ongeldige naam voor een tabel of kolom.')
  return `"${naam.replace(/"/g, '""')}"`
}

function tabelRef(schema: string, tabel: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(tabel)}`
}

export function telRijen(inhoud: BackupInhoud): RijTelling {
  const telling: RijTelling = {}
  for (const t of inhoud.tabellen) telling[t.naam] = t.rijen.length
  return telling
}

async function huidigSchema(client: ClientBase): Promise<string> {
  const { rows } = await client.query<{ schema: string | null }>('SELECT current_schema() AS schema')
  const schema = rows[0]?.schema
  if (!schema) throw new Error('Er is geen schema gekozen: controleer search_path van de verbinding.')
  return schema
}

/** Gewone (en gepartitioneerde) tabellen in het schema, zonder losse partities. */
export async function tabellenIn(client: ClientBase, schema: string): Promise<string[]> {
  const { rows } = await client.query<{ naam: string }>(
    `SELECT c.relname AS naam
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      ORDER BY c.relname`,
    [schema],
  )
  return rows.map((r) => r.naam)
}

interface KolomInfo {
  naam: string
  /** Type zoals format_type het geeft ('integer', 'numeric(12,2)', 'jsonb', 'text[]'); voor de cast bij herstel. */
  type: string
}

interface TabelKolommen {
  /** Kolommen die in de dump gaan, op volgorde van de tabel. */
  gewoon: KolomInfo[]
  /** Gegenereerde kolommen; die berekent Postgres zelf en gaan niet mee. */
  gegenereerd: string[]
}

/** Kolommen per tabel op volgorde, met de gegenereerde apart. */
async function kolommenVan(client: ClientBase, schema: string, tabellen: string[]): Promise<Map<string, TabelKolommen>> {
  const { rows } = await client.query<{ tabel: string; kolom: string; type: string; gegenereerd: boolean }>(
    `SELECT c.relname AS tabel, a.attname AS kolom, format_type(a.atttypid, a.atttypmod) AS type, a.attgenerated <> '' AS gegenereerd
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = ANY($2::text[]) AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
    [schema, tabellen],
  )
  const uit = new Map<string, TabelKolommen>(tabellen.map((t) => [t, { gewoon: [], gegenereerd: [] }]))
  for (const r of rows) {
    const tabel = uit.get(r.tabel)
    if (!tabel) continue
    if (r.gegenereerd) {
      tabel.gegenereerd.push(r.kolom)
      continue
    }
    tabel.gewoon.push({ naam: r.kolom, type: r.type })
  }
  return uit
}

/** Kolommen van de primaire sleutel per tabel, in de volgorde van de sleutel. */
async function primaireSleutels(client: ClientBase, schema: string): Promise<Map<string, string[]>> {
  const { rows } = await client.query<{ tabel: string; kolom: string }>(
    `SELECT c.relname AS tabel, a.attname AS kolom
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, positie)
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
      WHERE i.indisprimary AND n.nspname = $1
      ORDER BY c.relname, k.positie`,
    [schema],
  )
  const uit = new Map<string, string[]>()
  for (const r of rows) {
    const lijst = uit.get(r.tabel) ?? []
    lijst.push(r.kolom)
    uit.set(r.tabel, lijst)
  }
  return uit
}

/**
 * Sorteert tabellen zo dat elke tabel na de tabellen komt waarnaar ze verwijst. Verwijzingen naar zichzelf
 * en naar tabellen buiten de lijst tellen niet. Bij gelijke stand alfabetisch, zodat de volgorde vast ligt.
 */
export function sorteerOpVerwijzingen(tabellen: string[], verwijzingen: Array<{ kind: string; ouder: string }>): string[] {
  const inLijst = new Set(tabellen)
  const ouders = new Map<string, Set<string>>(tabellen.map((t) => [t, new Set()]))
  for (const { kind, ouder } of verwijzingen) {
    if (kind === ouder || !inLijst.has(kind) || !inLijst.has(ouder)) continue
    ouders.get(kind)!.add(ouder)
  }
  const volgorde: string[] = []
  const geplaatst = new Set<string>()
  const rest = [...tabellen].sort()
  while (rest.length > 0) {
    const i = rest.findIndex((t) => [...ouders.get(t)!].every((o) => geplaatst.has(o)))
    if (i === -1) {
      throw new Error(`Er zit een kring van foreign keys tussen (een deel van) de tabellen ${rest.join(', ')}; daarvoor is geen volgorde om in te voegen.`)
    }
    const [t] = rest.splice(i, 1)
    volgorde.push(t)
    geplaatst.add(t)
  }
  return volgorde
}

async function verwijzingenIn(client: ClientBase, schema: string): Promise<Array<{ kind: string; ouder: string }>> {
  const { rows } = await client.query<{ kind: string; ouder: string }>(
    `SELECT kind.relname AS kind, ouder.relname AS ouder
       FROM pg_constraint con
       JOIN pg_class kind ON kind.oid = con.conrelid
       JOIN pg_class ouder ON ouder.oid = con.confrelid
       JOIN pg_namespace kn ON kn.oid = kind.relnamespace
       JOIN pg_namespace onm ON onm.oid = ouder.relnamespace
      WHERE con.contype = 'f' AND kn.nspname = $1 AND onm.nspname = $1`,
    [schema],
  )
  return rows
}

function tekstLiteral(waarde: string): string {
  return `'${waarde.replace(/'/g, "''")}'`
}

/**
 * Het JSON-object van één rij: precies de opgegeven kolommen (geen gegenereerde), elke waarde in de tekstvorm
 * van Postgres en SQL NULL als JSON null. jsonb_build_object heeft maximaal 100 argumenten; daarom in stukken.
 */
function rijExpressie(kolommen: TabelKolommen, alias: string): string {
  if (kolommen.gewoon.length === 0) return `'{}'::jsonb`
  const delen: string[] = []
  for (let i = 0; i < kolommen.gewoon.length; i += 40) {
    const paren = kolommen.gewoon.slice(i, i + 40).map((k) => `${tekstLiteral(k.naam)}, ${alias}.${quoteIdent(k.naam)}::text`)
    delen.push(`jsonb_build_object(${paren.join(', ')})`)
  }
  return delen.join(' || ')
}

/**
 * Maakt een volledige dump van alle tabellen in het huidige schema, behalve UITGESLOTEN_TABELLEN.
 * Werkt met een losse Client of een client uit een Pool; de verbinding moet vrij zijn (geen open transactie).
 */
export async function maakDump(client: ClientBase, opties: { gitSha?: string | null; nu?: Date } = {}): Promise<BackupInhoud> {
  // Gedeeld: meerdere dumps mogen tegelijk, een migratie (exclusief, scripts/migrate.ts) wacht tot ze klaar zijn
  // en een dump wacht op een lopende migratie. Zo leest de dump nooit een schema dat halverwege verandert.
  await client.query('SELECT pg_advisory_lock_shared($1)', [LOCK.migraties])
  try {
    return await dumpInTransactie(client, opties)
  } finally {
    await client.query('SELECT pg_advisory_unlock_shared($1)', [LOCK.migraties]).catch(() => undefined)
  }
}

async function dumpInTransactie(client: ClientBase, opties: { gitSha?: string | null; nu?: Date }): Promise<BackupInhoud> {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const { rows: tijd } = await client.query<{ nu: Date }>('SELECT transaction_timestamp() AS nu')
    const schema = await huidigSchema(client)

    const { rows: mig } = await client.query<{ bestaat: boolean }>(
      `SELECT to_regclass(format('%I.%I', $1::text, '_migrations')) IS NOT NULL AS bestaat`,
      [schema],
    )
    let migraties: string[] = []
    if (mig[0]?.bestaat) {
      const { rows } = await client.query<{ naam: string }>(`SELECT naam FROM ${tabelRef(schema, '_migrations')}`)
      migraties = rows.map((r) => r.naam).sort()
    }

    const uitgesloten = new Set<string>(UITGESLOTEN_TABELLEN)
    const tabellen = (await tabellenIn(client, schema)).filter((t) => !uitgesloten.has(t))
    const volgorde = sorteerOpVerwijzingen(tabellen, await verwijzingenIn(client, schema))
    const kolommen = await kolommenVan(client, schema, volgorde)
    const sleutels = await primaireSleutels(client, schema)

    const uit: BackupTabel[] = []
    for (const naam of volgorde) {
      const kols = kolommen.get(naam) ?? { gewoon: [], gegenereerd: [] }
      const pk = sleutels.get(naam)
      const sortering = pk && pk.length > 0 ? pk.map((k) => `_r.${quoteIdent(k)}`).join(', ') : '_r.ctid'
      const { rows } = await client.query<{ rijen: Array<Record<string, unknown>> }>(
        `SELECT coalesce(json_agg(${rijExpressie(kols, '_r')} ORDER BY ${sortering}), '[]'::json) AS rijen
           FROM ${tabelRef(schema, naam)} AS _r`,
      )
      uit.push({ naam, kolommen: kols.gewoon.map((k) => k.naam), rijen: rows[0]?.rijen ?? [] })
    }

    await client.query('COMMIT')
    return {
      formaat: BACKUP_FORMAAT,
      versie: BACKUP_VERSIE,
      gemaaktOp: (opties.nu ?? tijd[0].nu).toISOString(),
      gitSha: opties.gitSha ?? null,
      migraties,
      tabellen: uit,
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  }
}

const POSTGRES_FOUTEN: Record<string, string> = {
  '23505': 'dubbele waarde in een unieke sleutel',
  '23503': 'verwijzing naar een rij die niet bestaat',
  '23502': 'lege waarde in een verplichte kolom',
  '23514': 'waarde voldoet niet aan een controle',
  '22P02': 'waarde past niet bij het kolomtype',
  '22003': 'getal buiten het bereik van de kolom',
  '22001': 'tekst te lang voor de kolom',
  '22007': 'ongeldige datum of tijd',
  '22008': 'datum of tijd buiten bereik',
}

/** Postgres-fout zonder waarden uit rijen: alleen code, soort en namen van tabel, kolom en constraint. */
function veiligeFout(tabel: string, e: unknown): HerstelFout {
  const f = e as { code?: string; constraint?: string; column?: string }
  const soort = (f.code && POSTGRES_FOUTEN[f.code]) || 'databasefout'
  const extra = [f.code ? `code ${f.code}` : null, f.constraint ? `constraint ${f.constraint}` : null, f.column ? `kolom ${f.column}` : null]
    .filter(Boolean)
    .join(', ')
  return new HerstelFout(`Invoegen in tabel ${tabel} mislukt: ${soort}${extra ? ` (${extra})` : ''}.`)
}

function controleerInhoud(inhoud: BackupInhoud): void {
  if (!inhoud || inhoud.formaat !== BACKUP_FORMAAT) throw new HerstelFout('Dit is geen back-up van ibcalculator.')
  if (inhoud.versie !== BACKUP_VERSIE) throw new HerstelFout(`Back-upversie ${String(inhoud.versie)} wordt niet ondersteund.`)
  if (!Array.isArray(inhoud.tabellen)) throw new HerstelFout('De back-up bevat geen tabellen.')
  const gezien = new Set<string>()
  const uitgesloten = new Set<string>(UITGESLOTEN_TABELLEN)
  for (const t of inhoud.tabellen) {
    if (typeof t?.naam !== 'string' || !Array.isArray(t.kolommen) || !Array.isArray(t.rijen)) {
      throw new HerstelFout('De back-up heeft een tabel zonder naam, kolommen of rijen.')
    }
    if (gezien.has(t.naam)) throw new HerstelFout(`De back-up bevat de tabel ${t.naam} twee keer.`)
    if (uitgesloten.has(t.naam)) throw new HerstelFout(`De back-up bevat de tabel ${t.naam}, die nooit in een back-up hoort.`)
    gezien.add(t.naam)
    const kolommen = new Set(t.kolommen)
    for (const rij of t.rijen) {
      if (rij === null || typeof rij !== 'object' || Array.isArray(rij)) throw new HerstelFout(`Tabel ${t.naam} bevat een ongeldige rij.`)
      for (const sleutel of Object.keys(rij)) {
        if (!kolommen.has(sleutel)) throw new HerstelFout(`Tabel ${t.naam} bevat een waarde voor kolom ${sleutel}, die niet in de kolomlijst staat.`)
      }
    }
  }
}

/**
 * Zet een dump terug in het huidige schema, in één transactie. De tabellen moeten al bestaan (migreer eerst
 * tot de migraties uit de back-up). Zonder `overschrijf` moet de doeldatabase leeg zijn; met `overschrijf`
 * worden alle tabellen uit de dump eerst geleegd. Geeft het aantal ingevoegde rijen per tabel terug.
 */
export interface HerstelOpties {
  overschrijf?: boolean
  /** Draait vlak vóór de COMMIT in dezelfde transactie, bijvoorbeeld om alle sessies in te trekken. */
  naHerstel?: (client: ClientBase) => Promise<void>
}

export async function herstelDump(client: ClientBase, inhoud: BackupInhoud, opties: HerstelOpties = {}): Promise<RijTelling> {
  controleerInhoud(inhoud)
  await client.query('BEGIN')
  try {
    const schema = await huidigSchema(client)
    const bestaand = new Set(await tabellenIn(client, schema))
    for (const t of inhoud.tabellen) {
      if (!bestaand.has(t.naam)) throw new HerstelFout(`Tabel ${t.naam} bestaat niet; migreer eerst tot de migraties uit de back-up.`)
    }
    const namen = inhoud.tabellen.map((t) => t.naam)
    const doelKolommen = await kolommenVan(client, schema, namen)
    for (const t of inhoud.tabellen) {
      const doel = doelKolommen.get(t.naam)!
      const gewoon = new Set(doel.gewoon.map((k) => k.naam))
      const gegenereerd = new Set(doel.gegenereerd)
      for (const k of t.kolommen) {
        if (gegenereerd.has(k)) throw new HerstelFout(`Kolom ${k} van tabel ${t.naam} is in de doeldatabase een berekende kolom; daar kan niets in worden teruggezet.`)
        if (!gewoon.has(k)) throw new HerstelFout(`Kolom ${k} van tabel ${t.naam} bestaat niet in de doeldatabase; herstellen zou gegevens kwijtraken.`)
      }
    }

    if (namen.length > 0) {
      const lijst = namen.map((n) => tabelRef(schema, n)).join(', ')
      if (opties.overschrijf) {
        // CASCADE zou ook tabellen legen die naar deze tabellen verwijzen maar niet in de back-up zitten.
        const { rows: mee } = await client.query<{ naam: string }>(
          `SELECT DISTINCT format('%I.%I', kn.nspname, kind.relname) AS naam
             FROM pg_constraint con
             JOIN pg_class kind ON kind.oid = con.conrelid
             JOIN pg_namespace kn ON kn.oid = kind.relnamespace
             JOIN pg_class ouder ON ouder.oid = con.confrelid
             JOIN pg_namespace onm ON onm.oid = ouder.relnamespace
            WHERE con.contype = 'f' AND onm.nspname = $1 AND ouder.relname = ANY($2::text[])
              AND NOT (kn.nspname = $1 AND kind.relname = ANY($2::text[]))
            ORDER BY 1`,
          [schema, namen],
        )
        if (mee.length > 0) {
          throw new HerstelFout(
            `Overschrijven zou ook ${mee.map((r) => r.naam).join(', ')} leegmaken, en die staan niet in de back-up. Zet de back-up terug in een lege database, bijvoorbeeld met herstel --schema-opnieuw.`,
          )
        }
        await client.query(`TRUNCATE TABLE ${lijst} RESTART IDENTITY CASCADE`)
      } else {
        // Niemand mag tussen de controle en het invoegen rijen toevoegen.
        await client.query(`LOCK TABLE ${lijst} IN EXCLUSIVE MODE`)
        for (const naam of namen) {
          const { rows } = await client.query<{ gevuld: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${tabelRef(schema, naam)}) AS gevuld`)
          if (rows[0]?.gevuld) {
            throw new HerstelFout(`De doeldatabase is niet leeg: tabel ${naam} bevat al rijen. Herstel met overschrijven als je de huidige gegevens wilt vervangen.`)
          }
        }
      }
    }

    const telling: RijTelling = {}
    for (const [index, t] of inhoud.tabellen.entries()) {
      telling[t.naam] = await voegTabelIn(client, schema, t, doelKolommen.get(t.naam)!, index)
    }

    // Sequences (serial en identity) weer achter het hoogste id zetten.
    for (const t of inhoud.tabellen) {
      const ref = tabelRef(schema, t.naam)
      const { rows } = await client.query<{ kolom: string; seq: string | null }>(
        `SELECT k.kolom, pg_get_serial_sequence($1, k.kolom) AS seq FROM unnest($2::text[]) AS k(kolom)`,
        [ref, doelKolommen.get(t.naam)!.gewoon.map((k) => k.naam)],
      )
      for (const { kolom, seq } of rows) {
        if (!seq) continue
        await client.query(
          `SELECT CASE WHEN m.max IS NULL OR m.max < s.seqmin THEN setval($1::regclass, s.seqmin, false)
                       ELSE setval($1::regclass, m.max, true) END
             FROM (SELECT max(${quoteIdent(kolom)})::bigint AS max FROM ${ref}) m, pg_sequence s
            WHERE s.seqrelid = $1::regclass`,
          [seq],
        )
      }
    }

    if (opties.naHerstel) await opties.naHerstel(client)
    await client.query('COMMIT')
    return telling
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  }
}

/**
 * Voegt de rijen van één tabel in. Eerst in porties in een tijdelijke tabel zonder constraints, met een
 * expliciete cast van de tekstwaarde naar het type van de doelkolom; daarna in één statement in de echte
 * tabel. Zo controleert Postgres foreign keys (ook naar de eigen tabel, vooruit over portiegrenzen heen) één
 * keer over alle rijen samen.
 */
async function voegTabelIn(client: ClientBase, schema: string, t: BackupTabel, doel: TabelKolommen, index: number): Promise<number> {
  const ref = tabelRef(schema, t.naam)
  if (t.kolommen.length === 0) {
    const r = await client.query(`INSERT INTO ${ref} SELECT FROM generate_series(1, $1::int)`, [t.rijen.length]).catch((e) => {
      throw veiligeFout(t.naam, e)
    })
    return r.rowCount ?? 0
  }
  const typeVan = new Map(doel.gewoon.map((k) => [k.naam, k.type]))
  const tijdelijk = quoteIdent(`_herstel_${index}`)
  const kols = t.kolommen.map(quoteIdent).join(', ')
  await client.query(`CREATE TEMP TABLE ${tijdelijk} (${t.kolommen.map((k) => `${quoteIdent(k)} ${typeVan.get(k)}`).join(', ')}) ON COMMIT DROP`)
  const casts = t.kolommen.map((k) => `(_e ->> ${tekstLiteral(k)})::${typeVan.get(k)}`).join(', ')
  for (let i = 0; i < t.rijen.length; i += PORTIE) {
    try {
      await client.query(`INSERT INTO ${tijdelijk} (${kols}) SELECT ${casts} FROM json_array_elements($1::json) AS _e`, [JSON.stringify(t.rijen.slice(i, i + PORTIE))])
    } catch (e) {
      throw veiligeFout(t.naam, e)
    }
  }
  try {
    const r = await client.query(`INSERT INTO ${ref} (${kols}) OVERRIDING SYSTEM VALUE SELECT ${kols} FROM ${tijdelijk}`)
    await client.query(`DROP TABLE ${tijdelijk}`)
    return r.rowCount ?? 0
  } catch (e) {
    throw veiligeFout(t.naam, e)
  }
}
