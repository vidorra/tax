/**
 * Welk jaar staat voorgekozen bij "Nieuw jaar" op het overzicht. Een nieuwe gebruiker wil meestal de aangifte van het
 * vorige kalenderjaar doen (in oktober 2026 die over 2025), niet een conceptjaar met geschatte cijfers. Puur, op `vandaag`
 * die de server meegeeft (zo rendert de pagina op server en browser hetzelfde).
 */

export interface VrijJaar {
  jaar: number
  /** Conceptjaar: parameters op basis van plannen. */
  concept: boolean
}

/** yyyy-mm-dd in Europe/Amsterdam. */
export function vandaagAmsterdam(nu: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu)
}

/**
 * Het voorgekozen jaar:
 * 1. Staat er al een jaar in het dossier, dan het eerste vrije jaar direct daarna (zo kun je het vorige jaar kopiëren),
 *    zolang het geen conceptjaar is.
 * 2. Anders het vorige kalenderjaar (het jaar waarover je nu aangifte doet), als dat vrij is.
 * 3. Anders het laatste vrije jaar dat niet later is dan dat, dan het eerste vrije jaar dat geen concept is.
 * 4. Anders het eerste vrije (concept)jaar; zonder vrije jaren null.
 */
export function standaardNieuwJaar(vrij: readonly VrijJaar[], inDossier: ReadonlySet<number>, vandaag: string): number | null {
  if (vrij.length === 0) return null
  const naBestaand = vrij.find((b) => !b.concept && inDossier.has(b.jaar - 1))
  if (naBestaand) return naBestaand.jaar
  const aangiftejaar = Number(vandaag.slice(0, 4)) - 1
  const vorig = vrij.find((b) => b.jaar === aangiftejaar && !b.concept)
  if (vorig) return vorig.jaar
  const eerder = [...vrij].reverse().find((b) => !b.concept && b.jaar <= aangiftejaar)
  if (eerder) return eerder.jaar
  return (vrij.find((b) => !b.concept) ?? vrij[0]).jaar
}
