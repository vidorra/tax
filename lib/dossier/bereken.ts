/**
 * Rekenen met een dossierjaar dat nog niet af is. Een nieuwe persoon begint zonder geboortedatum (lib/dossier/leeg.ts),
 * zodat de controle "Geboortedatum ontbreekt" afgaat en niemand ongemerkt rekent met een verzonnen datum. De engine
 * heeft wel een datum nodig: zolang het veld leeg is, rekent `berekenDossier` met een veilige standaard (iemand van
 * veertig, zonder AOW). Die standaard komt alleen in de berekening, nooit in de opgeslagen invoer of het rapport.
 *
 * Gebruik `berekenDossier` overal waar een dossierjaar wordt doorgerekend (editor, planning, invulhulp, export, opslag).
 * Puur: geen React, geen I/O.
 */
import { berekenHuishouden } from '@/lib/tax/engine'
import type { HuishoudenInvoer } from '@/lib/tax/types'

/** Leeftijd waarmee gerekend wordt zolang de geboortedatum leeg is: ruim onder de AOW-leeftijd. */
export const REKENLEEFTIJD = 40

const leeg = (x: unknown) => typeof x !== 'string' || x.trim() === ''

/** Geboortedatum waarmee de engine rekent zolang het veld leeg is (1 januari, veertig jaar vóór het belastingjaar). */
export function rekenGeboortedatum(jaar: number): string {
  return `${jaar - REKENLEEFTIJD}-01-01`
}

/** Heeft een persoon in deze invoer nog geen geboortedatum? */
export function zonderGeboortedatum(invoer: HuishoudenInvoer): boolean {
  return invoer.personen.some((p) => leeg(p.geboortedatum))
}

/**
 * De invoer zoals de engine hem krijgt: een lege geboortedatum wordt de rekenstandaard. Zonder lege velden komt
 * hetzelfde object terug (geen kopie), zodat memo's en vergelijkingen blijven werken.
 */
export function metRekenStandaarden(invoer: HuishoudenInvoer): HuishoudenInvoer {
  if (!zonderGeboortedatum(invoer)) return invoer
  return { ...invoer, personen: invoer.personen.map((p) => (leeg(p.geboortedatum) ? { ...p, geboortedatum: rekenGeboortedatum(invoer.jaar) } : p)) }
}

/** `berekenHuishouden` voor een dossierjaar: zelfde handtekening, met de rekenstandaarden van hierboven. */
export const berekenDossier: typeof berekenHuishouden = (invoer, opties) => berekenHuishouden(metRekenStandaarden(invoer), opties)
