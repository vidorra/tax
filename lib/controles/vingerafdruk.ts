/**
 * Ronde 2 (A3): vingerafdrukken van controles. Een vingerafdruk bevat alleen het beslissende gegeven, zodat een
 * negering blijft gelden zolang dat gegeven gelijk blijft (lib/controles/negeren.ts, `beoordeelNegering`). Puur.
 *
 *   bedragVingerafdruk('verschil', 312.4)      'verschil=312'
 *   lijstVingerafdruk(['ond-2', 'ond-1'])       'ond-1|ond-2'
 *   delenVingerafdruk({ land: 'ZA', bruto: 1000 }) 'bruto=1000|land=ZA'
 */

/** Hele euro's, zonder punten: een ander bedrag op centen na geeft dezelfde vingerafdruk. */
export function bedragVingerafdruk(naam: string, bedrag: number): string {
  const r = Number.isFinite(bedrag) ? Math.round(bedrag) + 0 : 0
  return `${naam}=${r}`
}

/** Een lijst sleutels (id's, paden, labels), gesorteerd en ontdubbeld, zodat de volgorde niet uitmaakt. */
export function lijstVingerafdruk(items: readonly string[]): string {
  return [...new Set(items.map((x) => x.trim()).filter(Boolean))].sort().join('|')
}

/** Meer gegevens tegelijk ('afboeking=7000|max=5000'); getallen afgerond op hele euro's, op naam gesorteerd. */
export function delenVingerafdruk(delen: Record<string, string | number | boolean | null | undefined>): string {
  return Object.keys(delen)
    .filter((k) => delen[k] !== undefined)
    .sort()
    .map((k) => {
      const v = delen[k]
      return typeof v === 'number' ? bedragVingerafdruk(k, v) : `${k}=${v === null ? 'leeg' : String(v)}`
    })
    .join('|')
}
