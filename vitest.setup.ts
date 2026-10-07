/**
 * Vangnet voor de hele testsuite (setupFiles in vitest.config.ts). Per testbestand wijst DATABASE_PATH naar een
 * bestand in een eigen, nog niet bestaande tijdelijke map. Een test die de database opent zonder
 * gebruikTijdelijkeDb() (lib/db/testdb.ts) of een eigen pad, raakt zo nooit de standaarddatabase
 * ./data/ibcalculator.db, waarin lokaal echte gegevens kunnen staan.
 *
 * Bestaat die map na het bestand toch, dan heeft een test de database zonder eigen pad geopend. Dat is een fout in
 * de test: de map gaat weg en het testbestand faalt met een melding.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll } from 'vitest'

const map = join(tmpdir(), `ib-vangnet-${process.pid}-${randomBytes(6).toString('hex')}`)
process.env.DATABASE_PATH = join(map, 'ibcalculator.db')

afterAll(() => {
  if (!existsSync(map)) return
  rmSync(map, { recursive: true, force: true })
  throw new Error('Een test in dit bestand opende de database zonder eigen pad. Gebruik gebruikTijdelijkeDb() uit lib/db/testdb.ts of boots de databasecode na.')
})
