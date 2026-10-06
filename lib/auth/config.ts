/**
 * Welke omgevingsvariabelen het dossier nodig heeft. Edge-veilig (geen node-modules), zodat ook
 * de middleware en server components dit kunnen gebruiken.
 */

export const MIN_AUTH_SECRET = 32

export interface ConfigStatus {
  geconfigureerd: boolean
  /** Namen van ontbrekende of ongeldige variabelen. */
  ontbreekt: Array<'DATABASE_URL' | 'AUTH_SECRET' | 'DOSSIER_KEY'>
}

function base64Lengte(s: string): number {
  const schoon = s.trim().replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/_-]*$/.test(schoon)) return -1
  return Math.floor((schoon.length * 3) / 4)
}

export function configStatus(env: Record<string, string | undefined> = process.env): ConfigStatus {
  const ontbreekt: ConfigStatus['ontbreekt'] = []
  if (!env.DATABASE_URL?.trim()) ontbreekt.push('DATABASE_URL')
  if ((env.AUTH_SECRET?.trim().length ?? 0) < MIN_AUTH_SECRET) ontbreekt.push('AUTH_SECRET')
  if (!env.DOSSIER_KEY?.trim() || base64Lengte(env.DOSSIER_KEY) !== 32) ontbreekt.push('DOSSIER_KEY')
  return { geconfigureerd: ontbreekt.length === 0, ontbreekt }
}

export const NIET_GECONFIGUREERD_MELDING =
  'Het dossier is nog niet ingericht. Zet DATABASE_URL, AUTH_SECRET (minimaal 32 tekens) en DOSSIER_KEY (32 bytes als base64) in de omgeving en voer daarna npm run db:migrate uit.'
