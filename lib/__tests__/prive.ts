/**
 * Privé-fixtures voor de regressietests tegen echte aangiftes. Die staan in mappen `prive/` die git negeert
 * (.gitignore: `**\/prive/`) en draaien alleen lokaal. In een schone kloon ontbreken ze: `laadPrive` geeft dan null
 * en de test slaat zich over met `describe.skipIf(!fixture)`. Nooit een privé-JSON statisch importeren.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** Leest een JSON-bestand relatief aan de root van de repository, of null als het er niet is. */
export function laadPrive<T>(pad: string): T | null {
  const vol = join(ROOT, pad)
  if (!existsSync(vol)) return null
  return JSON.parse(readFileSync(vol, 'utf8')) as T
}
