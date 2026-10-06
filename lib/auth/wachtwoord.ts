import { compare, hash } from 'bcryptjs'

export const BCRYPT_RONDES = 12
export const MIN_WACHTWOORD = 12

/** Een geldige bcrypt-hash om tegen te vergelijken als het e-mailadres niet bestaat (gelijke responstijd). */
const NEP_HASH = '$2b$12$PpTer0rcDCZ31juFYlQ5LuNyj5tYvdwJ8XULr/Vf8KTx8Mxe9itYy'

export function hashWachtwoord(wachtwoord: string): Promise<string> {
  return hash(wachtwoord, BCRYPT_RONDES)
}

export async function controleerWachtwoord(wachtwoord: string, hashWaarde: string | null | undefined): Promise<boolean> {
  if (!hashWaarde) {
    await compare(wachtwoord, NEP_HASH).catch(() => false)
    return false
  }
  return compare(wachtwoord, hashWaarde)
}

/** Foutmelding of null als het wachtwoord sterk genoeg is. */
export function wachtwoordProbleem(wachtwoord: unknown): string | null {
  if (typeof wachtwoord !== 'string' || wachtwoord.length < MIN_WACHTWOORD) return `Kies een wachtwoord van minimaal ${MIN_WACHTWOORD} tekens.`
  if (wachtwoord.length > 200) return 'Dit wachtwoord is te lang.'
  return null
}
