/** Ronde 2 (A4): hulp voor de importtests: een fixture lezen, herkennen en met een rekeningsleutel uitlezen. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CsvBestand, PresetUitkomst } from '../types'
import { bestandHash, isCsvFout, leesCsv } from '../csv'
import { herkenPreset } from '../presets'
import { metRekening } from '../presets/hulp'

export const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))

export function fixtureTekst(naam: string): string {
  return readFileSync(join(FIXTURES, naam), 'utf8')
}

export function csv(naam: string, tekst = fixtureTekst(naam)): CsvBestand {
  const b = leesCsv(naam, tekst)
  if (isCsvFout(b)) throw new Error(b.tekst)
  return b
}

/** Leest een fixture met de preset die hem herkent; `rekening` is de sleutel. */
export function lees(naam: string, rekening = 'degiro:r-test0001', jaar = 2025, tekst?: string): PresetUitkomst {
  const b = csv(naam, tekst)
  const p = herkenPreset(b)
  if (!p) throw new Error(`Niet herkend: ${naam}`)
  return metRekening({ ...p.lees(b, { jaar }), bestand: { naam, hash: bestandHash(b), regels: b.regels.length } }, rekening)
}

/** Som van een veld over gebeurtenissen van een soort (in euro's, op centen). */
export function som(u: PresetUitkomst, soort: string, veld: 'eur' | 'bedrag' = 'eur'): number {
  return Math.round(u.gebeurtenissen.filter((g) => g.soort === soort).reduce((s, g) => s + (g[veld] ?? 0), 0) * 100) / 100
}

/** Aantal per activum na alle gebeurtenissen. */
export function aantallen(u: PresetUitkomst): Record<string, number> {
  const uit: Record<string, number> = {}
  for (const g of u.gebeurtenissen) if (g.activum && g.aantal !== undefined) uit[g.activum] = Math.round(((uit[g.activum] ?? 0) + g.aantal) * 1e8) / 1e8
  return uit
}

/** Werkelijk rendement van een positie: opbrengst + eind − begin − stortingen + onttrekkingen. */
export function rendement(p: { directeOpbrengsten?: number; waardeEind?: number; waardeBegin: number; stortingen?: number; onttrekkingen?: number }): number {
  return (p.directeOpbrengsten ?? 0) + (p.waardeEind ?? 0) - p.waardeBegin - (p.stortingen ?? 0) + (p.onttrekkingen ?? 0)
}
