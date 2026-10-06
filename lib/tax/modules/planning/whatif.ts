/**
 * What-if: rekent het huishouden twee keer door (basis en scenario) met een
 * geïnjecteerde engine en toont het verschil in IB, Zvw én toeslagen.
 *
 * nettoEffect = verschil toeslagen − verschil IB − verschil Zvw
 * (positief = het huishouden houdt meer over; de kosten van de wijziging zelf,
 * zoals de lijfrentepremie of de investering, zitten er niet in).
 */
import type { BerekenHuishouden, EngineOpties, HuishoudenInvoer, HuishoudenResultaat, PersoonId, Uitlegregel } from '../../types'
import { regel, eur, pct } from '../../uitleg'
import { kloon } from '../../years'
import { rondPlanning } from './prognose'

export interface WhatIfUitkomst {
  basis: HuishoudenResultaat
  scenario: HuishoudenResultaat
  verschilIB: number
  verschilZvw: number
  verschilToeslagen: number
  nettoEffect: number
  uitleg: Uitlegregel[]
}

const optiesVoor = (invoer: HuishoudenInvoer, basisVariant: string | undefined, opties: EngineOpties): EngineOpties => {
  // Een scenario met een andere variant (bijv. box 3-variant) moet de params van die variant krijgen.
  if (invoer.variant !== basisVariant) {
    const { params: _vast, ...rest } = opties
    void _vast
    return { ...rest, variant: invoer.variant }
  }
  return opties
}

export function whatIf(
  basis: HuishoudenInvoer,
  wijziging: (i: HuishoudenInvoer) => HuishoudenInvoer,
  bereken: BerekenHuishouden,
  opties: EngineOpties = {},
): WhatIfUitkomst {
  const o: EngineOpties = { zonderMarginaleDruk: true, ...opties }
  const rBasis = bereken(basis, o)
  const scenarioInvoer = wijziging(kloon(basis))
  const rScenario = bereken(scenarioInvoer, optiesVoor(scenarioInvoer, basis.variant, o))

  const verschilIB = rScenario.totaal.verschuldigdIB - rBasis.totaal.verschuldigdIB
  const verschilZvw = rScenario.totaal.verschuldigdZvw - rBasis.totaal.verschuldigdZvw
  const verschilToeslagen = rScenario.totaal.toeslagen - rBasis.totaal.toeslagen
  const nettoEffect = verschilToeslagen - verschilIB - verschilZvw
  const verschilKot = rScenario.toeslagen.kot.totaal - rBasis.toeslagen.kot.totaal

  const uitleg: Uitlegregel[] = [
    regel('whatif.ib', 'Verschil inkomstenbelasting', verschilIB, verschilIB > 0 ? 'plus' : 'min', {
      niveau: 1,
      formule: `${eur(rScenario.totaal.verschuldigdIB)} − ${eur(rBasis.totaal.verschuldigdIB)}`,
    }),
    regel('whatif.zvw', 'Verschil Zvw-bijdrage', verschilZvw, verschilZvw > 0 ? 'plus' : 'min', {
      niveau: 1,
      formule: `${eur(rScenario.totaal.verschuldigdZvw)} − ${eur(rBasis.totaal.verschuldigdZvw)}`,
    }),
    regel('whatif.toeslagen', 'Verschil toeslagen', verschilToeslagen, verschilToeslagen >= 0 ? 'plus' : 'min', {
      niveau: 1,
      formule: `${eur(rScenario.totaal.toeslagen)} − ${eur(rBasis.totaal.toeslagen)}`,
    }),
  ]
  if (verschilKot !== 0) {
    uitleg.push(
      regel('whatif.kot', 'waarvan kinderopvangtoeslag', verschilKot, verschilKot >= 0 ? 'plus' : 'min', {
        niveau: 2,
        formule: `toetsingsinkomen ${eur(rBasis.toeslagen.toetsingsinkomen)} wordt ${eur(rScenario.toeslagen.toetsingsinkomen)}`,
      }),
    )
  }
  uitleg.push(
    regel('whatif.netto', nettoEffect >= 0 ? 'Netto voordeel voor het huishouden' : 'Netto nadeel voor het huishouden', nettoEffect, 'totaal', {
      niveau: 0,
      formule: `toeslagen ${eur(verschilToeslagen)} − IB ${eur(verschilIB)} − Zvw ${eur(verschilZvw)}`,
    }),
  )
  return { basis: rBasis, scenario: rScenario, verschilIB, verschilZvw, verschilToeslagen, nettoEffect, uitleg }
}

/** Voegt `bedrag` toe aan de winst (eerste onderneming) of, zonder onderneming, aan het resultaat overig werk. */
export function extraWinst(persoon: PersoonId, bedrag: number): (i: HuishoudenInvoer) => HuishoudenInvoer {
  return (i) => {
    const p = i.personen.find((x) => x.id === persoon)
    if (!p) return i
    const o = p.ondernemingen[0]
    if (!o) p.resultaatOverigWerk = (p.resultaatOverigWerk ?? 0) + bedrag
    else if (o.winstberekening.soort === 'saldo') o.winstberekening.saldo += bedrag
    else o.winstberekening.omzet += bedrag
    return i
  }
}

/**
 * Marginale druk: (Δ IB + Δ Zvw − Δ toeslagen) / bedrag bij `bedrag` extra winst voor `persoon`.
 * Inclusief het effect op kinderopvangtoeslag, kindgebonden budget en zorgtoeslag.
 */
export function marginaleDruk(invoer: HuishoudenInvoer, persoon: PersoonId, bedrag: number, bereken: BerekenHuishouden, opties: EngineOpties = {}): number {
  if (bedrag === 0) return 0
  const r = whatIf(invoer, extraWinst(persoon, bedrag), bereken, opties)
  return -r.nettoEffect / bedrag
}

/** Scenario: extra lijfrentepremie voor één persoon (lijfrente is persoonlijk, niet verdeelbaar). */
export function extraLijfrente(persoon: PersoonId, bedrag: number): (i: HuishoudenInvoer) => HuishoudenInvoer {
  return (i) => {
    const p = i.personen.find((x) => x.id === persoon)
    if (p) p.inkomensvoorziening.lijfrentePremies += bedrag
    return i
  }
}

/** Scenario: extra investering (KIA) in de eerste onderneming van een persoon, in gebruik genomen in december. */
export function extraInvestering(persoon: PersoonId, bedrag: number): (i: HuishoudenInvoer) => HuishoudenInvoer {
  return (i) => {
    const o = i.personen.find((x) => x.id === persoon)?.ondernemingen[0]
    if (!o) return i
    o.investeringen = [
      ...(o.investeringen ?? []),
      { omschrijving: 'Extra investering (scenario)', datum: `${i.jaar}-12-01`, bedrag, betaald: bedrag, inGebruik: true, regeling: 'kia' },
    ]
    return i
  }
}

/** Scenario: rekenen met een andere parametervariant van het jaar (bijv. de box 3-variant uit de brief van 29 september 2026). */
export function box3Variant(variantId: string | undefined): (i: HuishoudenInvoer) => HuishoudenInvoer {
  return (i) => ({ ...i, variant: variantId })
}

/** Leesbare samenvatting van een marginale druk voor uitlegregels. */
export function marginaleDrukRegel(id: string, persoon: PersoonId, druk: number, bedrag: number): Uitlegregel {
  return regel(id, `Marginale druk persoon ${persoon} op de volgende ${eur(bedrag)} winst`, rondPlanning(druk * bedrag), 'info', {
    niveau: 1,
    formule: `${pct(druk, 1)} inclusief Zvw en toeslagen`,
  })
}
