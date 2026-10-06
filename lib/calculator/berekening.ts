/**
 * Alles wat de publieke calculator uitrekent voor één state: het gekozen jaar,
 * optioneel het jaar erna, en de belastingpot. Puur en zonder React, zodat het
 * zowel in een Web Worker als op de hoofdthread (fallback, SSR) draait.
 * De uitkomst bevat alleen gewone data (structured clone).
 */
import { berekenHuishouden } from '@/lib/tax/engine'
import { belastingpot } from '@/lib/tax/modules/planning/belastingpot'
import type { HuishoudenResultaat, Status, Waarschuwing } from '@/lib/tax/types'
import { CONCEPT_JAREN, getJaar, laagsteStatus } from '@/lib/tax/years'
import { type CalculatorState, jaarBestaat, naarInvoerMetNotities, variantVoor } from './formulier'

export interface JaarUitkomst {
  jaar: number
  variant?: string
  variantLabel?: string
  status: Status
  concept: boolean
  resultaat: HuishoudenResultaat | null
  fout: string | null
  notities: string[]
  /** Som van de omzet (jaarbasis) van alle ondernemingen. */
  omzet: number
  /** Winst uit onderneming plus loon, vóór belasting. */
  brutoInkomen: number
  /** brutoInkomen min verschuldigde IB en Zvw. */
  nettoOver: number | null
}

export type PotUitkomst = ReturnType<typeof belastingpot>

export interface Uitkomst {
  hoofd: JaarUitkomst
  volgend: JaarUitkomst | null
  pot: PotUitkomst | null
}

export function berekenJaar(state: CalculatorState, jaar: number): JaarUitkomst {
  const variant = variantVoor(jaar, state.variant)
  let status: Status = 'geschat'
  let variantLabel: string | undefined
  try {
    const params = getJaar(jaar, variant)
    status = laagsteStatus(params)
    if (variant) variantLabel = params.varianten.find((v) => v.id === variant)?.label
  } catch {
    // jaar of variant onbekend; de fout volgt hieronder uit de berekening
  }
  const basis = { jaar, variant, variantLabel, status, concept: CONCEPT_JAREN.includes(jaar) }
  try {
    const { invoer, notities } = naarInvoerMetNotities(state, jaar)
    const resultaat = berekenHuishouden(invoer)
    const omzet = invoer.personen
      .flatMap((p) => p.ondernemingen)
      .reduce((s, o) => s + (o.winstberekening.soort === 'uitgesplitst' ? o.winstberekening.omzet : o.winstberekening.saldo), 0)
    const brutoInkomen = resultaat.personen.reduce((s, p) => s + p.winstUitOnderneming + p.loon, 0)
    const nettoOver = brutoInkomen - resultaat.totaal.verschuldigdIB - resultaat.totaal.verschuldigdZvw
    return { ...basis, resultaat, fout: null, notities, omzet, brutoInkomen, nettoOver }
  } catch (e) {
    const fout = e instanceof Error ? e.message : 'Onbekende fout in de berekening.'
    return { ...basis, resultaat: null, fout, notities: [], omzet: 0, brutoInkomen: 0, nettoOver: null }
  }
}

export function berekenPot(state: CalculatorState, hoofd: JaarUitkomst): PotUitkomst | null {
  if (!hoofd.resultaat) return null
  try {
    const ids = state.partner ? (['A', 'B'] as const) : (['A'] as const)
    const voorlopigBetaald = ids.reduce((s, id) => s + state.personen[id].voorlopigeAanslag.ib + state.personen[id].voorlopigeAanslag.zvw, 0)
    return belastingpot({
      verschuldigdIB: hoofd.resultaat.totaal.verschuldigdIB,
      verschuldigdZvw: hoofd.resultaat.totaal.verschuldigdZvw,
      voorlopigBetaald,
      saldoPot: state.belastingpot.saldo,
      maandenVerstreken: state.belastingpot.maandenVerstreken,
      params: getJaar(hoofd.jaar, hoofd.variant),
      jaar: hoofd.jaar,
    })
  } catch {
    return null
  }
}

export function berekenAlles(state: CalculatorState): Uitkomst {
  const hoofd = berekenJaar(state, state.jaar)
  const volgendJaar = state.jaar + 1
  const volgend = state.vergelijk && jaarBestaat(volgendJaar) ? berekenJaar(state, volgendJaar) : null
  return { hoofd, volgend, pot: berekenPot(state, hoofd) }
}

const ERNST_VOLGORDE: Record<Waarschuwing['ernst'], number> = { 'let-op': 0, actie: 1, info: 2 }

/** Alle meldingen van het huishouden en de personen, ontdubbeld en op ernst gesorteerd. */
export function alleWaarschuwingen(r: HuishoudenResultaat): Waarschuwing[] {
  const gezien = new Set<string>()
  return [...r.waarschuwingen, ...r.personen.flatMap((p) => p.waarschuwingen)]
    .filter((w) => (gezien.has(w.tekst) ? false : (gezien.add(w.tekst), true)))
    .sort((a, b) => ERNST_VOLGORDE[a.ernst] - ERNST_VOLGORDE[b.ernst])
}
