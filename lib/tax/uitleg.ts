import type { Bron, RegelSoort, Status, Uitlegregel, Waarschuwing, Ernst } from './types'

/** Klein hulpmiddel om uitlegregels compact op te bouwen. */
export function regel(
  id: string,
  label: string,
  bedrag: number,
  soort: RegelSoort = 'info',
  extra: { niveau?: 0 | 1 | 2; formule?: string; parameter?: string; bron?: Bron; status?: Status } = {},
): Uitlegregel {
  return { id, label, bedrag, soort, niveau: extra.niveau ?? 1, formule: extra.formule, parameter: extra.parameter, bron: extra.bron, status: extra.status }
}

export function waarschuwing(id: string, ernst: Ernst, tekst: string, bron?: Bron): Waarschuwing {
  return { id, ernst, tekst, bron }
}

/** Euro-notatie voor formules in uitlegregels: 12.345 */
export const eur = (n: number): string => Math.round(n).toLocaleString('nl-NL')

/**
 * Bedrag in lopende tekst, zoals in meldingen: '€ 12.345', negatief '-€ 12.345'. Formules en tabellen houden
 * eur() zonder euroteken; aantallen (uren, kilometers) ook.
 */
export const euro = (n: number): string => {
  const r = Math.round(n) + 0
  return r < 0 ? `-€ ${eur(-r)}` : `€ ${eur(r)}`
}

/** Procentnotatie: 0.3756 → "37,56%" */
export const pct = (f: number, decimalen = 2): string =>
  `${(f * 100).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: decimalen })}%`

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** ISO-datum als leesbare Nederlandse datum: '2027-07-01' wordt '1 juli 2027'. Andere tekst blijft ongewijzigd. */
export const datumNL = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${MAANDEN[Number(m[2]) - 1]} ${m[1]}`
}
