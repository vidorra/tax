/**
 * Wat het dossier nodig heeft: AUTH_SECRET, DOSSIER_KEY en een plek voor het databasebestand waar de app kan
 * schrijven (DATABASE_PATH, standaard data/ibcalculator.db in de werkmap; in de container /app/data, een Persistent
 * Directory in CapRover). Er is geen aparte databaseserver en geen DATABASE_URL.
 *
 * Alleen de Node-runtime: dit kijkt op het bestandssysteem. De edge-middleware gebruikt het niet; die haalt
 * MIN_AUTH_SECRET uit grenzen.ts.
 */
import { databasemapSchrijfbaar, dbPad } from '@/lib/db/pad'

import { MIN_AUTH_SECRET } from './grenzen'

export { MIN_AUTH_SECRET } from './grenzen'

/** DATABASE_PATH staat voor: de map van de database is niet schrijfbaar (of het pad wijst naar iets anders dan een bestand). */
export type ConfigOnderdeel = 'AUTH_SECRET' | 'DOSSIER_KEY' | 'DATABASE_PATH'

export interface ConfigStatus {
  geconfigureerd: boolean
  /** Ontbrekende of ongeldige onderdelen, in deze volgorde: AUTH_SECRET, DOSSIER_KEY, DATABASE_PATH. */
  ontbreekt: ConfigOnderdeel[]
}

function base64Lengte(s: string): number {
  const schoon = s.trim().replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/_-]*$/.test(schoon)) return -1
  return Math.floor((schoon.length * 3) / 4)
}

/**
 * Is het dossier ingericht? `schrijfbaar` is te vervangen in tests; standaard kijkt hij of het databasebestand
 * (of de map waar het komt) schrijfbaar is.
 */
export function configStatus(
  env: Record<string, string | undefined> = process.env,
  schrijfbaar: (pad: string) => boolean = databasemapSchrijfbaar,
): ConfigStatus {
  const ontbreekt: ConfigOnderdeel[] = []
  if ((env.AUTH_SECRET?.trim().length ?? 0) < MIN_AUTH_SECRET) ontbreekt.push('AUTH_SECRET')
  if (!env.DOSSIER_KEY?.trim() || base64Lengte(env.DOSSIER_KEY) !== 32) ontbreekt.push('DOSSIER_KEY')
  if (!schrijfbaar(dbPad(env))) ontbreekt.push('DATABASE_PATH')
  return { geconfigureerd: ontbreekt.length === 0, ontbreekt }
}

export const NIET_GECONFIGUREERD_MELDING =
  'Het dossier is nog niet ingericht. Zet AUTH_SECRET (minimaal 32 tekens) en DOSSIER_KEY (32 bytes als base64) in de omgeving en zorg dat de app kan schrijven in de map van de database (DATABASE_PATH, standaard data/ibcalculator.db). Voer daarna npm run db:migrate uit.'
