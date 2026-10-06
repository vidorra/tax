/**
 * Ronde 2 (A4): vormcontrole van `VermogensPositie.herkomst` (PositieHerkomst) voor valideerInvoer. Strikt: alleen de
 * bekende velden, een sleutel in de vorm van lib/import/sleutel.ts (nooit een rekeningnummer), een bekend formaat en
 * hooguit twintig bestanden met een hash, een aantal regels en een periode. Puur.
 */
import type { BrokerFormaat } from './types'
import { SLEUTEL_PATROON } from './sleutel'

const FORMATEN: readonly BrokerFormaat[] = ['degiro-rekening', 'degiro-portefeuille', 'ibkr-activity', 'trading212', 'saxo', 'bux', 'rabobank', 'bitvavo', 'coinbase', 'generiek']
const VELDEN = new Set(['bron', 'formaat', 'sleutel', 'rol', 'geimporteerdOp', 'bestanden'])
const BESTAND_VELDEN = new Set(['hash', 'regels', 'van', 'tot'])
/** Zoveel ingelezen bestanden onthoudt een bezitting (de import houdt de nieuwste). */
export const MAX_HERKOMST_BESTANDEN = 20

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isDatum = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`))
/** Datum (yyyy-mm-dd) of een ISO-tijdstip. */
const isMoment = (x: unknown): boolean => isDatum(x) || (typeof x === 'string' && x.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(x) && !Number.isNaN(Date.parse(x)))

/** Fouten in de vorm `${pad}.veld: melding`; leeg betekent geldig. */
export function herkomstFouten(x: unknown, pad: string): string[] {
  const f: string[] = []
  controleerHerkomst(x, pad, (p, m) => f.push(`${p}: ${m}`))
  return f
}

/** Meldt elke fout met pad en melding (zoals `Controle.fout` in lib/dossier/valideer.ts). */
export function controleerHerkomst(x: unknown, pad: string, meld: (pad: string, melding: string) => void): void {
  const fout = (veld: string, melding: string) => meld(`${pad}${veld ? `.${veld}` : ''}`, melding)
  if (!isObj(x)) return fout('', 'moet een object zijn')
  for (const k of Object.keys(x)) if (!VELDEN.has(k)) fout(k.slice(0, 40), 'onbekend veld')
  if (x.bron !== 'import') fout('bron', "moet 'import' zijn")
  if (typeof x.formaat !== 'string' || !FORMATEN.includes(x.formaat as BrokerFormaat)) fout('formaat', 'onbekend formaat')
  if (typeof x.sleutel !== 'string' || x.sleutel.length > 64 || !SLEUTEL_PATROON.test(x.sleutel)) fout('sleutel', 'moet een rekeningsleutel zijn (broker:16 hextekens of broker:r-8 tekens)')
  if (x.rol !== 'effecten' && x.rol !== 'geld' && x.rol !== 'crypto') fout('rol', "moet 'effecten', 'geld' of 'crypto' zijn")
  if (!isMoment(x.geimporteerdOp)) fout('geimporteerdOp', 'moet een datum zijn (JJJJ-MM-DD)')
  if (x.bestanden !== undefined) {
    if (!Array.isArray(x.bestanden)) fout('bestanden', 'moet een lijst zijn')
    else if (x.bestanden.length > MAX_HERKOMST_BESTANDEN) fout('bestanden', 'lijst is te lang')
    else
      x.bestanden.forEach((b, i) => {
        const bp = `bestanden[${i}]`
        if (!isObj(b)) return fout(bp, 'moet een object zijn')
        for (const k of Object.keys(b)) if (!BESTAND_VELDEN.has(k)) fout(`${bp}.${k.slice(0, 40)}`, 'onbekend veld')
        if (typeof b.hash !== 'string' || !/^[0-9a-f]{16,64}$/.test(b.hash)) fout(`${bp}.hash`, 'moet een hash zijn')
        if (typeof b.regels !== 'number' || !Number.isInteger(b.regels) || b.regels < 0 || b.regels > 1_000_000) fout(`${bp}.regels`, 'moet een aantal regels zijn')
        for (const d of ['van', 'tot'] as const) if (b[d] !== undefined && !isDatum(b[d])) fout(`${bp}.${d}`, 'moet een datum zijn (JJJJ-MM-DD)')
      })
  }
}
