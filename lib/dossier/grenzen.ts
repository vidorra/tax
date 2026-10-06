/**
 * Grenzen op invoer van buiten (publieke /api/calc en het dossier), vóór de engine draait.
 *
 * De engine is puur en snel voor een normaal huishouden, maar de rekentijd groeit met het aantal
 * kinderen, box 3-posities en andere lijsten (bij verdeling 'optimaal' tientallen keren). Zonder
 * grens kost één verzoek van 100 KB met honderden kinderen bijna tien seconden CPU en blokkeert het
 * de hele server. Daarnaast weigeren we sleutels die prototypes raken, absurde bedragen en diepe nesting.
 * Foutmeldingen noemen paden en grenzen, nooit bedragen.
 */

/** Maximale lengte per lijst, ruim boven wat een echt huishouden nodig heeft. */
export const LIJST_GRENZEN: Readonly<Record<string, number>> = {
  personen: 2,
  kinderen: 20,
  opvang: 12,
  ondernemingen: 10,
  investeringen: 200,
  activa: 200,
  desinvesteringen: 100,
  opdrachtgevers: 100,
  loon: 25,
  historie: 50,
  verliezen: 50,
  leningdelen: 20,
  posities: 150,
  schulden: 50,
  box2: 10,
  // Ronde 2
  bronbelastingen: 40,
  herinvesteringsreserves: 20,
  egalisatiereserves: 20,
  posten: 200,
  terbeschikkingstellingen: 20,
  box2Verliezen: 50,
  eigenwoningreserve: 20,
  verbeteringen: 50,
  bestanden: 20,
}
/** Voor lijsten die hierboven niet staan. */
export const STANDAARD_LIJST_GRENS = 100
/** Elk getal moet eindig zijn en binnen ± dit bedrag liggen (duizend miljard). */
export const MAX_BEDRAG = 1e12
export const MAX_DIEPTE = 12
export const MAX_KNOPEN = 25_000
export const MAX_TEKST = 2_000

const VERBODEN_SLEUTELS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_FOUTEN = 20

/** Controleert de grenzen; een lege lijst betekent binnen de grenzen. */
export function controleerGrenzen(invoer: unknown): string[] {
  const fouten: string[] = []
  const fout = (m: string) => {
    if (fouten.length < MAX_FOUTEN) fouten.push(m)
  }
  let knopen = 0
  // Iteratief, zodat diepe nesting geen stack overflow kan geven.
  const stapel: Array<{ waarde: unknown; pad: string; sleutel: string; diepte: number }> = [{ waarde: invoer, pad: 'invoer', sleutel: '', diepte: 0 }]
  while (stapel.length > 0) {
    const { waarde, pad, sleutel, diepte } = stapel.pop()!
    if (++knopen > MAX_KNOPEN) {
      fout(`invoer: meer dan ${MAX_KNOPEN} velden`)
      break
    }
    if (typeof waarde === 'number') {
      if (!Number.isFinite(waarde) || Math.abs(waarde) > MAX_BEDRAG) fout(`${pad}: getal buiten het toegestane bereik`)
      continue
    }
    if (typeof waarde === 'string') {
      if (waarde.length > MAX_TEKST) fout(`${pad}: tekst is langer dan ${MAX_TEKST} tekens`)
      continue
    }
    if (typeof waarde !== 'object' || waarde === null) continue
    if (diepte >= MAX_DIEPTE) {
      fout(`${pad}: te diep genest`)
      continue
    }
    if (Array.isArray(waarde)) {
      const max = LIJST_GRENZEN[sleutel] ?? STANDAARD_LIJST_GRENS
      if (waarde.length > max) {
        fout(`${pad}: maximaal ${max} items`)
        continue
      }
      for (let i = waarde.length - 1; i >= 0; i--) stapel.push({ waarde: waarde[i], pad: `${pad}[${i}]`, sleutel, diepte: diepte + 1 })
      continue
    }
    const sleutels = Object.keys(waarde)
    for (let i = sleutels.length - 1; i >= 0; i--) {
      const k = sleutels[i]
      if (VERBODEN_SLEUTELS.has(k)) {
        fout(`${pad}: sleutel '${k}' is niet toegestaan`)
        continue
      }
      stapel.push({ waarde: (waarde as Record<string, unknown>)[k], pad: `${pad}.${k.slice(0, 60)}`, sleutel: k, diepte: diepte + 1 })
    }
  }
  return fouten
}
