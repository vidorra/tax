/**
 * Ronde 2 (A6): pure hulpfuncties voor de regelingen van de onderneming in de editor (staking, herinvesteringsreserve,
 * kostenegalisatiereserve, de vraag `winstBron`). Geen React, geen I/O; getest in components/dossier/__tests__.
 */
import type {
  ActiefInvoer,
  AfschrijvingActief,
  EgalisatiereserveInvoer,
  HerinvesteringsreserveInvoer,
  HerinvesteringsreserveUitkomst,
  InvesteringInvoer,
  OndernemingInvoer,
  StakingInvoer,
  StakingPost,
  TaxYearParams,
} from '@/lib/tax/types'
import { hirUiterlijkJaar, isLanglopend } from '@/lib/tax/modules/onderneming/reserves'
import { postResultaat } from '@/lib/tax/modules/onderneming/staking'
import { parseDatum } from '@/lib/tax/datum'

/** Regelingen waarvan de standaard "zit al in je winst?" uit `winstBron` volgt (ontwerp 2.5). */
export type WinstBronRegeling = 'hir' | 'egalisatie' | 'autoBtw' | 'staking' | 'partner'

/**
 * Welke regelingen die van `winstBron` afhangen, spelen bij deze onderneming? Alleen dan toont de editor de vraag
 * "Waar komt de winst vandaan?" (rommelbudget). `partnerActief` komt van de situatie van A5.
 */
export function regelingenMetWinstBron(o: OndernemingInvoer, partnerActief = false): WinstBronRegeling[] {
  const uit: WinstBronRegeling[] = []
  if ((o.herinvesteringsreserves ?? []).length > 0) uit.push('hir')
  if ((o.egalisatiereserves ?? []).length > 0) uit.push('egalisatie')
  if (o.auto?.btw) uit.push('autoBtw')
  if (o.staking) uit.push('staking')
  if (partnerActief) uit.push('partner')
  return uit
}

/** "je boekhouding" of "een fiscaal rapport" (copy: "volgt uit: winst uit je boekhouding"). */
export const winstBronTekst = (o: Pick<OndernemingInvoer, 'winstBron'>): string => (o.winstBron === 'fiscaal-rapport' ? 'een fiscaal rapport' : 'je boekhouding')

// Staking

export type StakingWat = NonNullable<StakingInvoer['gebeurtenis']>

/** Wat er gebeurde, voor de chips; oudere invoer zonder `gebeurtenis` leidt het af uit `soort`. */
export function stakingWat(s: StakingInvoer): StakingWat {
  if (s.gebeurtenis) return s.gebeurtenis
  const soort = s.soort ?? (s.gedeeltelijk ? 'gedeeltelijk' : 'geheel')
  return soort === 'geruisloosBV' ? 'bv' : soort === 'gedeeltelijk' ? 'deel' : 'gestopt'
}

/**
 * Zet wat er gebeurde. Gestopt en verkocht zijn een staking van de hele onderneming; geruisloos (bij een BV) en
 * doorschuiving (bij verkocht) blijven staan als ze bij de nieuwe keuze passen.
 */
export function zetStakingWat(s: StakingInvoer, wat: StakingWat): void {
  s.gebeurtenis = wat
  delete s.gedeeltelijk
  if (wat === 'deel') s.soort = 'gedeeltelijk'
  else if (wat === 'bv') s.soort = s.soort === 'geruisloosBV' ? 'geruisloosBV' : 'geheel'
  else if (wat === 'verkocht') s.soort = s.soort === 'doorschuiving' ? 'doorschuiving' : 'geheel'
  else s.soort = 'geheel'
}

/** Som van de posten plus goodwill min stakingskosten. */
export function stakingsSom(s: Pick<StakingInvoer, 'posten' | 'goodwill' | 'stakingskosten'>): number {
  return (s.posten ?? []).reduce((t, p) => t + postResultaat(p), 0) + Math.max(0, s.goodwill ?? 0) - Math.max(0, s.stakingskosten ?? 0)
}

/** Met posten houdt de invoer `stakingswinst` gelijk aan de som (contract `StakingInvoer.stakingswinst`). */
export function houdStakingswinstGelijk(s: StakingInvoer): void {
  if ((s.posten ?? []).length > 0) s.stakingswinst = Math.round(stakingsSom(s))
}

const jaarVan = (iso: string | undefined): number | null => {
  if (!iso) return null
  const j = parseDatum(iso).getUTCFullYear()
  return Number.isFinite(j) ? j : null
}

/**
 * Fiscale boekwaarde op de stakingsdatum, uit de uitkomst van het register: bij een verkoop in dit jaar de boekwaarde
 * vlak vóór de verkoop, anders de boekwaarde op 1 januari min de afschrijving naar rato van de maanden tot en met de
 * maand van de staking (zoals de engine afschrijft tot en met de maand van verkoop). Een schatting om voor te vullen.
 */
export function boekwaardeOpDatum(r: AfschrijvingActief, datum: string | undefined, jaar: number): number {
  if (r.verkochtDitJaar) return Math.max(0, Math.round(r.boekwaardeBegin - r.afschrijving))
  const maand = datum && jaarVan(datum) === jaar ? parseDatum(datum).getUTCMonth() + 1 : 12
  return Math.max(0, Math.round(r.boekwaardeBegin - (r.afschrijving * maand) / 12))
}

const POST_SOORT = (a: ActiefInvoer): StakingPost['soort'] => (a.soort === 'gebouw' ? 'onroerend' : a.soort === 'goodwill' ? 'immaterieel' : 'overigeActiva')

/**
 * Posten voor "Specificeren per onderdeel", uit het activaregister: alles wat in dit jaar nog in de onderneming zat,
 * met de fiscale boekwaarde op de stakingsdatum. De opbrengst is de verkoopprijs als die in het register staat, anders
 * leeg (0) om in te vullen.
 */
export function postenUitRegister(o: OndernemingInvoer, afschrijvingen: AfschrijvingActief[] | undefined, datum: string | undefined, jaar: number): StakingPost[] {
  return (o.activa ?? []).flatMap((a, i): StakingPost[] => {
    const aanschaf = jaarVan(a.aanschafdatum)
    const verkoop = jaarVan(a.verkocht?.datum)
    if (aanschaf !== null && aanschaf > jaar) return []
    if (verkoop !== null && verkoop < jaar) return []
    const r = afschrijvingen?.find((x) => x.invoerIndex === i)
    const boekwaarde = r ? boekwaardeOpDatum(r, a.verkocht?.datum ?? datum, jaar) : Math.max(0, Math.round(a.boekwaardeBegin ?? a.aanschafwaarde))
    return [
      {
        soort: POST_SOORT(a),
        omschrijving: a.omschrijving.trim() || `Bedrijfsmiddel ${i + 1}`,
        ...(a.herkomst ? { actiefHerkomst: a.herkomst } : {}),
        waardeOfOpbrengst: Math.round(a.verkocht?.verkoopprijs ?? 0),
        fiscaleBoekwaarde: boekwaarde,
      },
    ]
  })
}

// Herinvesteringsreserve en kostenegalisatiereserve

/** Laagste vrije id `${prefix}-${n}` (ID_PATROON). */
export function vrijeId(bestaand: ReadonlyArray<{ id: string }> | undefined, prefix: string): string {
  const bezet = new Set((bestaand ?? []).map((x) => x.id))
  let n = 1
  while (bezet.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

/** Nieuwe, lege herinvesteringsreserve (via Bijzondere situatie, bijvoorbeeld na een schadevergoeding). */
export function nieuweHir(o: OndernemingInvoer, jaar: number): HerinvesteringsreserveInvoer {
  return {
    id: vrijeId(o.herinvesteringsreserves, `hir-${jaar}`),
    ontstaanJaar: jaar,
    bedragOntstaan: 0,
    standBegin: 0,
    herkomst: { omschrijving: '', boekwaardeOud: 0, langlopend: false },
    voornemen: true,
  }
}

/** Nieuwe, lege kostenegalisatiereserve. */
export function nieuweEgalisatie(o: OndernemingInvoer): EgalisatiereserveInvoer {
  return { id: vrijeId(o.egalisatiereserves, 'eg'), omschrijving: '', standBegin: 0 }
}

/** De reserve die bij dit middel uit het register hoort (op de herkomst-id van het middel). */
export function hirVoorActief(o: OndernemingInvoer, a: ActiefInvoer): HerinvesteringsreserveInvoer | undefined {
  if (!a.herkomst) return undefined
  return (o.herinvesteringsreserves ?? []).find((r) => r.herkomst.actiefHerkomst === a.herkomst)
}

const HERKOMST = /^act:(\d{4}):(\d+)$/

/**
 * Herkomst-id voor een middel dat er nog geen heeft, zodat de reserve eraan vast blijft zitten (formaat
 * 'act:<jaar>:<nummer>', zoals de doorrol). Nummers vanaf 1000, zodat de doorrol van volgend jaar (die middelen zonder
 * herkomst op hun positie nummert) er nooit mee botst.
 */
export function nieuweHerkomst(o: OndernemingInvoer, jaar: number): string {
  const bezet = new Set([...(o.activa ?? []).map((a) => a.herkomst), ...(o.doorrolUitgesloten ?? [])].filter((h): h is string => typeof h === 'string'))
  let n = 1000
  while (bezet.has(`act:${jaar}:${n}`)) n++
  return `act:${jaar}:${n}`
}

/** Is dit een herkomst die de editor zelf in dit jaar zette (geen doorgerold middel)? */
export const eigenHerkomstDitJaar = (herkomst: string | undefined, jaar: number): boolean => {
  const m = HERKOMST.exec(herkomst ?? '')
  return m !== null && Number(m[1]) === jaar && Number(m[2]) >= 1000
}

/**
 * Herinvesteringsreserve uit een verkocht middel met boekwinst: gevormd bedrag = boekwinst, boekwaarde van het oude
 * middel = opbrengst min boekwinst (de boekwaarde vlak vóór de verkoop, zoals het register die rekent).
 */
export function hirUitActief(a: ActiefInvoer, r: Pick<AfschrijvingActief, 'boekwinst'>, herkomst: string, jaar: number, params: TaxYearParams, id: string): HerinvesteringsreserveInvoer {
  const opbrengst = Math.round(a.verkocht?.verkoopprijs ?? 0)
  const boekwinst = Math.max(0, Math.round(r.boekwinst))
  return {
    id,
    ontstaanJaar: jaar,
    bedragOntstaan: boekwinst,
    standBegin: 0,
    herkomst: { omschrijving: a.omschrijving.trim(), actiefHerkomst: herkomst, opbrengst, boekwaardeOud: Math.max(0, opbrengst - boekwinst), langlopend: isLanglopend(a, params) },
    voornemen: true,
  }
}

/** Stand die dit jaar beschikbaar is om af te boeken: stand begin plus de toevoeging in het ontstaansjaar. */
export function hirStandDitJaar(r: HerinvesteringsreserveInvoer, jaar: number, uitkomst?: Pick<HerinvesteringsreserveUitkomst, 'standBegin' | 'dotatie'>): number {
  if (uitkomst) return Math.max(0, uitkomst.standBegin + uitkomst.dotatie)
  return Math.max(0, r.ontstaanJaar === jaar ? r.bedragOntstaan : r.standBegin)
}

/** Reserves waarop je in dit jaar kunt afboeken: binnen de termijn, met voornemen en een stand. */
export function hirBeschikbaar(o: OndernemingInvoer, jaar: number, params: TaxYearParams, uitkomst?: HerinvesteringsreserveUitkomst[]): HerinvesteringsreserveInvoer[] {
  return (o.herinvesteringsreserves ?? []).filter((r) => {
    const u = uitkomst?.find((x) => x.id === r.id)
    return r.voornemen && jaar >= r.ontstaanJaar && jaar <= hirUiterlijkJaar(r, params) && hirStandDitJaar(r, jaar, u) > 0
  })
}

/**
 * Hoeveel je op deze investering hooguit kunt afboeken (de tekst "tot € …"): de stand min wat andere investeringen al
 * afboeken, en de boekwaarde-eis (Σ aanschaf van de investeringen met deze reserve, met deze erbij, min de boekwaarde
 * van het oude middel, min wat de andere al afboeken). Dezelfde regel als de engine (art. 3.54 lid 2).
 */
export function hirMaxVoorInvestering(r: HerinvesteringsreserveInvoer, investeringen: InvesteringInvoer[] | undefined, index: number, jaar: number, uitkomst?: Pick<HerinvesteringsreserveUitkomst, 'standBegin' | 'dotatie'>): number {
  const lijst = investeringen ?? []
  const andere = lijst.filter((inv, i) => i !== index && inv.herinvesteringsreserve?.reserveId === r.id)
  const andereAfboeking = andere.reduce((s, inv) => s + Math.max(0, inv.herinvesteringsreserve?.afboeking ?? 0), 0)
  const somAanschaf = andere.reduce((s, inv) => s + Math.max(0, inv.bedrag), 0) + Math.max(0, lijst[index]?.bedrag ?? 0)
  const stand = hirStandDitJaar(r, jaar, uitkomst)
  return Math.max(0, Math.round(Math.min(stand - andereAfboeking, somAanschaf - Math.max(0, r.herkomst.boekwaardeOud) - andereAfboeking)))
}

/** Hoe ver de termijn is (0 tot 1) voor de balk in de tijd: ontstaansjaar 0, het laatste jaar 1. */
export function hirVoortgang(ontstaanJaar: number, uiterlijkJaar: number, jaar: number): number {
  const totaal = uiterlijkJaar - ontstaanJaar
  if (totaal <= 0) return 1
  return Math.min(1, Math.max(0, (jaar - ontstaanJaar) / totaal))
}
