/**
 * AOW-leeftijd per kalenderjaar en de persoonlijke AOW-datum.
 *
 * De AOW-leeftijd hangt af van het jaar waarin iemand die leeftijd bereikt (art. 7a AOW). Wie in 2023 66 jaar en
 * 10 maanden werd, heeft vanaf dat moment AOW, ook al is de AOW-leeftijd in 2024 67 jaar. Daarom zoekt
 * `persoonlijkeAowDatumVoor` het eerste jaar waarin geboortedatum + AOW-leeftijd van dát jaar in dat jaar valt.
 * Jaren met een jaarmodule lezen `overig.aowLeeftijd`; oudere jaren komen uit `data/aow-leeftijd.json`.
 */
import { JAREN } from './index'
import historie from './data/aow-leeftijd.json'
import { persoonlijkeAowDatum } from '../datum'

type Leeftijd = { jaren: number; maanden: number }

const DATA = historie.jaren as Record<string, Leeftijd>

/** AOW-leeftijd van een kalenderjaar; buiten het bekende bereik de dichtstbijzijnde bekende waarde. */
export function aowLeeftijdVoorJaar(jaar: number): Leeftijd {
  const jaarModule = JAREN[jaar]
  if (jaarModule) return jaarModule.overig.waarde.aowLeeftijd
  const d = DATA[String(jaar)]
  if (d) return d
  const bekend = [...Object.keys(JAREN), ...Object.keys(DATA)].map(Number).sort((a, b) => a - b)
  const dichtst = jaar < bekend[0] ? bekend[0] : bekend[bekend.length - 1]
  return JAREN[dichtst]?.overig.waarde.aowLeeftijd ?? DATA[String(dichtst)]
}

/**
 * Persoonlijke AOW-datum. `huidig` is de AOW-leeftijd uit de params van het belastingjaar `jaar`
 * (wint voor dat jaar, zodat een variant of eigen params doorwerkt).
 */
export function persoonlijkeAowDatumVoor(geboortedatum: string, jaar: number, huidig: Leeftijd): string {
  return persoonlijkeAowDatum(geboortedatum, (j) => (j === jaar ? huidig : aowLeeftijdVoorJaar(j)))
}
