/**
 * Tijdelijke database voor tests. Alleen voor *.spec.ts; de app importeert dit niet.
 *
 * Elke database is een eigen map in de tmp-map van het systeem met daarin ibcalculator.db. DATABASE_PATH wijst
 * ernaartoe (ook voor processen die een test start, zoals de back-up-CLI), de verbinding van het proces gaat naar
 * het nieuwe bestand en de migraties zijn gedraaid. Opruimen sluit de verbinding, zet DATABASE_PATH terug en
 * verwijdert de map.
 *
 *   import { gebruikTijdelijkeDb } from '@/lib/db/testdb'
 *   const testDb = gebruikTijdelijkeDb()            // per test een leeg, gemigreerd bestand
 *   it('...', () => { getDb().insert(users)...; expect(testDb.pad).toMatch(/ibcalculator\.db$/) })
 *
 *   gebruikTijdelijkeDb({ per: 'bestand' })          // één database voor alle tests in het bestand
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'

import { DB_BESTANDSNAAM, getSqlite, sluitDb } from './index'
import { migreer } from './migreer'

export interface TijdelijkeDb {
  /** Pad van het databasebestand (DATABASE_PATH). */
  pad: string
  /** Map waarin het bestand staat; leeg en alleen van deze database. */
  map: string
  /** Sluit de verbinding, zet DATABASE_PATH terug en verwijdert de map. Mag vaker worden aangeroepen. */
  opruimen(): void
}

/** Opent een nieuwe tijdelijke database en maakt hem de database van dit proces. */
export function openTijdelijkeDb(opties: { migreren?: boolean } = {}): TijdelijkeDb {
  const vorige = process.env.DATABASE_PATH
  const map = mkdtempSync(join(tmpdir(), 'ib-test-'))
  const pad = join(map, DB_BESTANDSNAAM)
  sluitDb()
  process.env.DATABASE_PATH = pad
  if (opties.migreren ?? true) migreer(getSqlite(), { log: () => undefined })
  let opgeruimd = false
  return {
    pad,
    map,
    opruimen() {
      if (opgeruimd) return
      opgeruimd = true
      sluitDb()
      if (vorige === undefined) delete process.env.DATABASE_PATH
      else process.env.DATABASE_PATH = vorige
      rmSync(map, { recursive: true, force: true })
    },
  }
}

/**
 * Registreert de hooks van vitest: standaard per test een nieuwe database (beforeEach/afterEach), met
 * `per: 'bestand'` één voor het hele bestand (beforeAll/afterAll). Roep aan op het hoogste niveau van het
 * bestand of in een describe. Het teruggegeven object wijst steeds naar de database van dat moment.
 */
export function gebruikTijdelijkeDb(opties: { per?: 'test' | 'bestand'; migreren?: boolean } = {}): { readonly pad: string; readonly map: string } {
  let huidig: TijdelijkeDb | null = null
  const voor = () => {
    huidig = openTijdelijkeDb({ migreren: opties.migreren })
  }
  const na = () => {
    huidig?.opruimen()
    huidig = null
  }
  if ((opties.per ?? 'test') === 'test') {
    beforeEach(voor)
    afterEach(na)
  } else {
    beforeAll(voor)
    afterAll(na)
  }
  const actief = (): TijdelijkeDb => {
    if (!huidig) throw new Error('Er is nu geen tijdelijke database (alleen binnen een test).')
    return huidig
  }
  return {
    get pad() {
      return actief().pad
    },
    get map() {
      return actief().map
    },
  }
}
