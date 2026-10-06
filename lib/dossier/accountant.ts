/**
 * Accountantsvergelijking: vaste rapportregels per persoon, het bedrag van de accountant naast het
 * bedrag van de engine, en het verschil.
 */
import type { HuishoudenResultaat, PersoonId, PersoonResultaat } from '@/lib/tax/types'

export interface RapportRegelDef {
  id: string
  label: string
  waarde: (p: PersoonResultaat) => number
}

export const RAPPORT_REGELS: readonly RapportRegelDef[] = [
  { id: 'winst', label: 'Winst uit onderneming', waarde: (p) => p.winstUitOnderneming },
  { id: 'zelfstandigenaftrek', label: 'Zelfstandigenaftrek', waarde: (p) => p.ondernemersaftrek.zelfstandigenaftrek },
  { id: 'mkb', label: 'MKB-winstvrijstelling', waarde: (p) => p.mkbVrijstelling },
  { id: 'belastbareWinst', label: 'Belastbare winst', waarde: (p) => p.belastbareWinst },
  { id: 'inkomensvoorziening', label: 'Uitgaven voor inkomensvoorziening', waarde: (p) => p.inkomensvoorziening.totaal },
  { id: 'box1Inkomen', label: 'Belastbaar inkomen box 1', waarde: (p) => p.box1.inkomen },
  { id: 'box1Belasting', label: 'Belasting box 1 (inclusief tariefmaatregel)', waarde: (p) => p.box1.belasting },
  { id: 'premie', label: 'Premie volksverzekeringen', waarde: (p) => p.box1.premie },
  { id: 'box3Belasting', label: 'Belasting box 3', waarde: (p) => p.box3Belasting },
  { id: 'heffingskortingen', label: 'Heffingskortingen', waarde: (p) => p.heffingskortingen.verzilverd },
  { id: 'verschuldigd', label: 'Verschuldigde inkomstenbelasting', waarde: (p) => p.verschuldigdIB },
  { id: 'teBetalen', label: 'Te betalen inkomstenbelasting', waarde: (p) => p.teBetalenIB },
  { id: 'zvw', label: 'Bijdrage Zvw', waarde: (p) => p.zvw.bijdrage },
  { id: 'zvwTeBetalen', label: 'Te betalen bijdrage Zvw', waarde: (p) => p.zvw.teBetalen },
]

/** Bedragen van de accountant per persoon per regel-id; null of ontbrekend = niet ingevuld. */
export type AccountantRegels = Partial<Record<PersoonId, Record<string, number | null>>>

export interface VergelijkingsRegel {
  persoon: PersoonId
  id: string
  label: string
  engine: number
  accountant: number | null
  /** engine − accountant; null als de accountant niets heeft ingevuld. */
  verschil: number | null
  afwijkend: boolean
}

export interface AccountantVergelijking {
  regels: VergelijkingsRegel[]
  aantalIngevuld: number
  aantalAfwijkend: number
  /** Grootste absolute verschil. */
  grootsteVerschil: number
}

/** Verschillen kleiner dan dit bedrag tellen niet als afwijking (afrondingen per regel). */
export const TOLERANTIE = 1

export function accountantVergelijking(resultaat: HuishoudenResultaat, regels: AccountantRegels | null | undefined): AccountantVergelijking {
  const uit: VergelijkingsRegel[] = []
  for (const p of resultaat.personen) {
    const ingevuld = regels?.[p.id] ?? {}
    for (const def of RAPPORT_REGELS) {
      const engine = Math.round(def.waarde(p))
      const ruw = ingevuld[def.id]
      const accountant = typeof ruw === 'number' && Number.isFinite(ruw) ? ruw : null
      const verschil = accountant === null ? null : engine - accountant
      uit.push({ persoon: p.id, id: def.id, label: def.label, engine, accountant, verschil, afwijkend: verschil !== null && Math.abs(verschil) >= TOLERANTIE })
    }
  }
  const metWaarde = uit.filter((r) => r.verschil !== null)
  return {
    regels: uit,
    aantalIngevuld: metWaarde.length,
    aantalAfwijkend: metWaarde.filter((r) => r.afwijkend).length,
    grootsteVerschil: metWaarde.reduce((m, r) => Math.max(m, Math.abs(r.verschil ?? 0)), 0),
  }
}

/** Vormcontrole voor regels uit de API. Geeft de opgeschoonde regels of een foutmelding. */
export function schoonAccountantRegels(x: unknown): { regels: AccountantRegels } | { fout: string } {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return { fout: 'regels moet een object per persoon zijn' }
  const ids = new Set(RAPPORT_REGELS.map((r) => r.id))
  const regels: AccountantRegels = {}
  for (const [persoon, waarden] of Object.entries(x as Record<string, unknown>)) {
    if (persoon !== 'A' && persoon !== 'B') return { fout: `onbekende persoon '${persoon}'` }
    if (typeof waarden !== 'object' || waarden === null || Array.isArray(waarden)) return { fout: `regels van persoon ${persoon} moeten een object zijn` }
    const schoon: Record<string, number | null> = {}
    for (const [id, w] of Object.entries(waarden as Record<string, unknown>)) {
      if (!ids.has(id)) return { fout: `onbekende rapportregel '${id}'` }
      if (w === null) schoon[id] = null
      else if (typeof w === 'number' && Number.isFinite(w) && Math.abs(w) < 1e10) schoon[id] = Math.round(w)
      else return { fout: `bedrag bij '${id}' moet een getal zijn` }
    }
    regels[persoon] = schoon
  }
  return { regels }
}
