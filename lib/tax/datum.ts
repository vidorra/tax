/** Datumhulpjes voor leeftijds- en periodetoetsen. Alle datums als ISO 'YYYY-MM-DD'. */

export function parseDatum(iso: string): Date {
  const [j, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(j, (m ?? 1) - 1, d ?? 1))
}

export function isoDatum(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Leeftijd in hele jaren op een peildatum. */
export function leeftijdOp(geboortedatum: string, peildatum: string): number {
  const g = parseDatum(geboortedatum)
  const p = parseDatum(peildatum)
  let leeftijd = p.getUTCFullYear() - g.getUTCFullYear()
  const nogNietJarig = p.getUTCMonth() < g.getUTCMonth() || (p.getUTCMonth() === g.getUTCMonth() && p.getUTCDate() < g.getUTCDate())
  if (nogNietJarig) leeftijd -= 1
  return leeftijd
}

/** Datum waarop iemand de AOW-leeftijd bereikt. */
export function aowDatum(geboortedatum: string, aowLeeftijd: { jaren: number; maanden: number }): string {
  const g = parseDatum(geboortedatum)
  const d = new Date(Date.UTC(g.getUTCFullYear() + aowLeeftijd.jaren, g.getUTCMonth() + aowLeeftijd.maanden, g.getUTCDate()))
  return isoDatum(d)
}

/**
 * Persoonlijke AOW-datum: de AOW-leeftijd geldt voor wie die leeftijd in dat kalenderjaar bereikt.
 * Zoekt het eerste jaar j waarin geboortedatum + leeftijdVoorJaar(j) in j valt.
 */
export function persoonlijkeAowDatum(geboortedatum: string, leeftijdVoorJaar: (jaar: number) => { jaren: number; maanden: number }): string {
  const geboortejaar = parseDatum(geboortedatum).getUTCFullYear()
  for (let j = geboortejaar + 60; j <= geboortejaar + 75; j++) {
    const d = aowDatum(geboortedatum, leeftijdVoorJaar(j))
    if (Number(d.slice(0, 4)) === j) return d
  }
  return aowDatum(geboortedatum, leeftijdVoorJaar(geboortejaar + 67))
}

/** AOW-leeftijd bereikt op 1 januari van het jaar. */
export function aowBereiktBegin(geboortedatum: string, jaar: number, aowLeeftijd: { jaren: number; maanden: number }): boolean {
  return aowDatum(geboortedatum, aowLeeftijd) <= `${jaar}-01-01`
}

/** AOW-leeftijd bereikt vóór of in het jaar (heel jaar AOW-tarief vereist: bereikt vóór 1 januari). */
export function aowBereiktInJaar(geboortedatum: string, jaar: number, aowLeeftijd: { jaren: number; maanden: number }): boolean {
  return aowDatum(geboortedatum, aowLeeftijd) <= `${jaar}-12-31`
}

/** Aantal hele en gedeeltelijke maanden van `vanaf` tot en met 31 december van `jaar` (0..12). */
export function maandenTotEindeJaar(vanaf: string, jaar: number): number {
  const v = parseDatum(vanaf)
  if (v.getUTCFullYear() > jaar) return 0
  if (v.getUTCFullYear() < jaar) return 12
  return 12 - v.getUTCMonth()
}

/**
 * Aantal dagen van `vanaf` tot en met 31 december van `jaar`, begrensd op het jaar.
 * Voor de IACK-toets "ten minste zes maanden tot het huishouden": gebruik hele maanden
 * vanaf de dag na de geboorte; 14-08-2025 geeft 4 maanden en 17 dagen, dus geen recht in 2025.
 */
export function heleMaandenInJaar(vanaf: string, jaar: number): number {
  const v = parseDatum(vanaf)
  if (v.getUTCFullYear() > jaar) return 0
  if (v.getUTCFullYear() < jaar) return 12
  const eind = Date.UTC(jaar, 11, 31)
  let maanden = 0
  let cursor = new Date(v.getTime())
  while (true) {
    const volgende = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()))
    if (volgende.getTime() - 86400000 > eind) break
    maanden += 1
    cursor = volgende
  }
  return maanden
}

/** Eerste dag van elk kwartaal in een jaar. */
export const kwartaalStarts = (jaar: number): string[] => [`${jaar}-01-01`, `${jaar}-04-01`, `${jaar}-07-01`, `${jaar}-10-01`]
