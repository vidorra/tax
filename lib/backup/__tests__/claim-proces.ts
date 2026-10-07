/**
 * Hulpproces voor runs.integratie.spec.ts: claimt een back-up in een eigen proces, tegelijk met andere processen.
 * Meldt 'klaar' zodra het geladen is, wacht tot het startbestand bestaat en schrijft dan de uitkomst als JSON.
 *
 *   tsx lib/backup/__tests__/claim-proces.ts <gepland|handmatig> <startbestand>
 */
import { existsSync } from 'node:fs'

import { getSqlite, sluitDb } from '@/lib/db'

import { claimGepland, startHandmatig } from '../runs'

const [soort, startbestand] = process.argv.slice(2)
// Verbinding vooraf openen, zodat alle processen bij de start alleen nog claimen.
getSqlite()
process.stdout.write('klaar\n')
while (!existsSync(startbestand)) {
  // Bewust bezig wachten: zo starten de processen zo gelijk mogelijk.
}
const uitkomst = soort === 'gepland' ? await claimGepland('2027-02') : await startHandmatig()
sluitDb()
process.stdout.write(`${JSON.stringify(uitkomst)}\n`)
