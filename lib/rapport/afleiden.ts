/**
 * Afleidingen die geen engineveld kunnen zijn: optellingen van ingevoerde jaarrekeningposten (hoofdstuk 5),
 * de indeling van box 3-posities in de groepen van het rapport en kleine sommen van engineuitkomsten.
 * Hier staat geen fiscale rekenregel; alles wat belasting bepaalt, komt uit de engine.
 */
import type { BalansPost, BalansStand, Box3Categorie, Box3RendementRegel, JaarrekeningInvoer, OndernemingInvoer, PersoonResultaat, WvRubriek } from '@/lib/tax/types'
import { activaregisterTeltMee } from '@/lib/tax/modules/onderneming'

/** Verzamelinkomen uit werk en woning: het verzamelinkomen zonder box 2 en box 3 (art. 2.18 Wet IB 2001). */
export const verzamelinkomenBox1 = (p: PersoonResultaat): number => p.verzamelinkomen - p.box2Inkomen - p.box3Inkomen

/**
 * Telt het activaregister mee in de winst (het contract bij `OndernemingInvoer.activaVolledig`)? Alleen als alle
 * bedrijfsmiddelen erin staan en de afschrijving te vervangen ('uitgesplitst') of te corrigeren is ('saldo' met de
 * afschrijving in het saldo). Anders is het register een fiscale controle zonder effect op de winst, en toont het
 * rapport de geboekte afschrijving en de balanspost.
 */
export function registerTeltMee(oi: OndernemingInvoer): boolean {
  return activaregisterTeltMee(oi)
}

// ---------------------------------------------------------------------------
// Box 3: groepen van het rapport
// ---------------------------------------------------------------------------

export type Box3Groep = 'bankNL' | 'bankBuitenland' | 'contant' | 'groen' | 'beleggingen' | 'vorderingen' | 'onroerend' | 'overig' | 'nettolijfrente'

/** Volgorde en koppen van de groepen in 3.2.1. Cryptovaluta staan, zoals in het rapport van de accountant, bij de vorderingen. */
export const BOX3_GROEPEN: Array<{ groep: Box3Groep; kop: string; rendement: string }> = [
  { groep: 'bankNL', kop: 'Vermogen op bank- en spaarrekeningen in Nederland', rendement: 'Vermogen op bank- en spaarrekeningen in Nederland' },
  { groep: 'bankBuitenland', kop: 'Vermogen op bank- en spaarrekeningen in het buitenland', rendement: 'Vermogen op bank- en spaarrekeningen in het buitenland' },
  { groep: 'contant', kop: 'Contant geld', rendement: 'Contant geld' },
  { groep: 'groen', kop: 'Groene beleggingen', rendement: 'Groene beleggingen' },
  { groep: 'beleggingen', kop: 'Beleggingen', rendement: 'Beleggingen' },
  { groep: 'vorderingen', kop: 'Vorderingen en uitgeleend geld', rendement: 'Uitgeleend geld en andere vorderingen' },
  { groep: 'onroerend', kop: 'Onroerende zaken', rendement: 'Onroerende zaken' },
  { groep: 'overig', kop: 'Overige bezittingen', rendement: 'Overige bezittingen' },
  { groep: 'nettolijfrente', kop: 'Nettolijfrente en nettopensioen', rendement: 'Nettolijfrente en nettopensioen' },
]

export function box3Groep(c: Box3Categorie): Box3Groep {
  return c === 'crypto' ? 'vorderingen' : c
}

/**
 * Rendementsregels per groep van het rapport: de regels van de engine, met cryptovaluta en vorderingen samen
 * (grondslag en rendement opgeteld; het percentage is gelijk). Schulden en schuldendrempel blijven apart.
 */
export function rendementPerGroep(regels: Box3RendementRegel[]): Array<{ sleutel: string; label: string; grondslag: number; pct: number; bedrag: number }> {
  const uitkomst: Array<{ sleutel: string; label: string; grondslag: number; pct: number; bedrag: number }> = []
  for (const g of BOX3_GROEPEN) {
    const deze = regels.filter((r) => r.categorie !== 'schulden' && r.categorie !== 'schuldendrempel' && box3Groep(r.categorie) === g.groep)
    if (deze.length === 0) continue
    uitkomst.push({
      sleutel: g.groep,
      label: g.rendement,
      grondslag: deze.reduce((s, r) => s + r.grondslag, 0),
      pct: deze[0].pct,
      bedrag: deze.reduce((s, r) => s + r.bedrag, 0),
    })
  }
  for (const r of regels) {
    if (r.categorie === 'schulden') uitkomst.push({ sleutel: 'schulden', label: 'Schulden voor andere bezittingen', grondslag: r.grondslag, pct: r.pct, bedrag: r.bedrag })
    if (r.categorie === 'schuldendrempel') uitkomst.push({ sleutel: 'schuldendrempel', label: 'Schuldendrempel', grondslag: r.grondslag, pct: r.pct, bedrag: r.bedrag })
  }
  return uitkomst
}

// ---------------------------------------------------------------------------
// Jaarrekening (hoofdstuk 5): optellingen van ingevoerde posten
// ---------------------------------------------------------------------------

export const ACTIVA_POSTEN: BalansPost[] = ['materieleVasteActiva', 'voorraden', 'handelsdebiteuren', 'overigeVorderingen', 'liquideMiddelen']
export const SCHULD_POSTEN: BalansPost[] = ['voorzieningen', 'langlopendeSchulden', 'crediteuren', 'omzetbelasting', 'overigeKortlopendeSchulden']
export const KORTLOPEND: BalansPost[] = ['crediteuren', 'omzetbelasting', 'overigeKortlopendeSchulden']

const waarde = (s: BalansStand | undefined, post: BalansPost) => s?.[post] ?? 0

export const somPosten = (s: BalansStand | undefined, posten: BalansPost[]) => posten.reduce((t, p) => t + waarde(s, p), 0)

/** Heeft deze stand ten minste één ingevulde post? */
export const standIngevuld = (s: BalansStand | undefined): s is BalansStand => !!s && Object.values(s).some((v) => typeof v === 'number')

export interface BalansTotalen {
  activa: number
  schulden: number
  kortlopend: number
  /** Ondernemingsvermogen = activa min schulden (inclusief de oudedagsreserve). */
  ondernemingsvermogen: number
}

export function balansTotalen(s: BalansStand | undefined): BalansTotalen {
  const activa = somPosten(s, ACTIVA_POSTEN)
  const schulden = somPosten(s, SCHULD_POSTEN)
  return { activa, schulden, kortlopend: somPosten(s, KORTLOPEND), ondernemingsvermogen: activa - schulden }
}

export const somBedragen = (xs: Array<{ bedrag: number }> | undefined) => (xs ?? []).reduce((s, x) => s + x.bedrag, 0)

/** Bedrag van een rubriek van de winst- en verliesrekening (som als een rubriek vaker voorkomt); undefined als die ontbreekt. */
export function rubriek(jr: JaarrekeningInvoer | undefined, r: WvRubriek): number | undefined {
  const regels = (jr?.winstEnVerlies ?? []).filter((x) => x.rubriek === r)
  return regels.length > 0 ? regels.reduce((s, x) => s + x.bedrag, 0) : undefined
}

export const OVERIGE_KOSTEN_RUBRIEKEN: Array<{ rubriek: WvRubriek; label: string }> = [
  { rubriek: 'auto', label: 'Auto- en transportkosten' },
  { rubriek: 'huisvesting', label: 'Huisvestingskosten' },
  { rubriek: 'verkoop', label: 'Verkoopkosten' },
  { rubriek: 'kantoor', label: 'Kantoorkosten' },
  { rubriek: 'beperktAftrekbaar', label: 'Beperkt aftrekbare kosten' },
  { rubriek: 'overig', label: 'Overige kosten' },
]

/** Saldo van de rubrieken: opbrengsten min kosten plus financiële baten min lasten. */
export function saldoRubrieken(jr: JaarrekeningInvoer | undefined): number {
  const r = (x: WvRubriek) => rubriek(jr, x) ?? 0
  const kosten = r('inkoop') + r('afschrijvingen') + r('personeel') + OVERIGE_KOSTEN_RUBRIEKEN.reduce((s, x) => s + r(x.rubriek), 0)
  return r('omzet') + r('onderhandenWerk') - kosten + r('financieleBaten') - r('financieleLasten')
}
