/**
 * Verlies uit aanmerkelijk belang (box 2), ronde 2 onderdeel A2 (art. 4.47 tot en met 4.53 Wet IB 2001).
 *
 * Verrekening (art. 4.49): een verlies van dit jaar gaat eerst terug naar het box 2-inkomen van vorig jaar
 * (`box2.verliesverrekening.terug`), daarna vooruit (`vooruit` jaar; verliezen tot en met
 * `oudeVerliezen.totEnMetJaar` `oudeVerliezen.vooruit` jaar). Verliezen uit eerdere jaren (`box2Verliezen`) worden
 * oudste eerst verrekend met het positieve inkomen van dit jaar: belastbaar = max(0, inkomen − verrekening). Een
 * verlies na zijn termijn wordt niet verrekend en rolt niet door (`vervallen`). Het verzamelinkomen verandert hier niet:
 * een negatief box 2-inkomen van dit jaar verlaagt het al (art. 2.18), verrekening met andere jaren niet.
 *
 * Terugwenteling: de geschatte teruggaaf over vorig jaar is de box 2-belasting van vorig jaar met de schijven van vorig
 * jaar zonder en met het verrekende bedrag (het verlies haalt eerst het bovenste deel weg). Zonder parameters van vorig
 * jaar: 0 met een uitlegregel. De Belastingdienst stelt het verlies vast bij beschikking.
 *
 * Belastingkorting (art. 4.53): op verzoek, als de persoon en zijn partner dit en vorig jaar geen aanmerkelijk belang
 * hebben, wordt een nog niet verrekend verlies omgezet in een korting = tarief van de eerste schijf box 2 van het eerste
 * jaar × verlies, in euro's vastgezet. Die gaat af van de belasting in box 1 van dat jaar en de `jarenNaEerste` jaren
 * erna, maar uiterlijk in het `uiterlijkJarenNaVerlies`e jaar na het verliesjaar (`uiterlijkJaar`, de wet; hiermee
 * rekent de module). Een rekenvoorbeeld van de Belastingdienst eindigt een jaar eerder ("het eerste jaar en de zes jaren
 * erna"); volgt `uiterlijkJaar` uit het eerste jaar, dan staat het jaar volgens dat voorbeeld in
 * `praktijkUiterlijkJaar` (melding, geen rekenverschil; open punt 16 in het ontwerp).
 *
 * Puur: geen React, geen I/O.
 */
import type { Box2VerliesUitkomst, PersoonInvoer, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { AFRONDING } from '../rounding'
import { eur, pct, regel, waarschuwing } from '../uitleg'
import { box2BelastingRuw } from './box2'

type Resterend = Box2VerliesUitkomst['resterend']

export interface Box2VerliesContext {
  params: TaxYearParams
  jaar: number
  /** Parameters van vorig jaar, voor de geschatte teruggaaf bij terugwenteling; ontbreekt = schatting 0. */
  paramsVorigJaar?: TaxYearParams
}

export interface Box2Verrekening {
  verliesDitJaar: number
  terugwenteling: Box2VerliesUitkomst['terugwenteling']
  verrekend: number
  resterend: Resterend
  vervallen: Box2VerliesUitkomst['vervallen']
  /** Belastbaar inkomen box 2 na verrekening met verliezen uit eerdere jaren (nooit negatief). */
  belastbaar: number
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

/** Laatste jaar waarin een verlies uit `verliesjaar` vooruit kan worden verrekend. */
export function box2VervaltNa(verliesjaar: number, params: TaxYearParams): number {
  const v = params.box2.waarde.verliesverrekening
  return verliesjaar + (verliesjaar <= v.oudeVerliezen.totEnMetJaar ? v.oudeVerliezen.vooruit : v.vooruit)
}

/** Speelt er iets van het box 2-verlies bij deze persoon? Zonder verlies, saldo of korting rekent de engine niets extra. */
export function heeftBox2Verlies(p: Pick<PersoonInvoer, 'box2Verliezen' | 'box2Belastingkorting'>, inkomen: number): boolean {
  return inkomen < 0 || (p.box2Verliezen ?? []).some((v) => v.bedrag > 0) || Boolean(p.box2Belastingkorting?.verzoek) || (p.box2Belastingkorting?.lopend ?? []).some((k) => k.restant > 0)
}

export function verrekenBox2Verliezen(inkomen: number, p: Pick<PersoonInvoer, 'box2Verliezen' | 'box2InkomenVorigJaar'>, ctx: Box2VerliesContext): Box2Verrekening {
  const v = ctx.params.box2.waarde.verliesverrekening
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const vervallen: Box2VerliesUitkomst['vervallen'] = []
  const resterend: Resterend = []
  let rest = Math.max(0, inkomen)
  let verrekend = 0

  for (const verlies of [...(p.box2Verliezen ?? [])].filter((x) => x.bedrag > 0).sort((a, b) => a.jaar - b.jaar)) {
    const vervaltNa = box2VervaltNa(verlies.jaar, ctx.params)
    if (verlies.jaar >= ctx.jaar) continue
    if (vervaltNa < ctx.jaar) {
      vervallen.push({ jaar: verlies.jaar, bedrag: verlies.bedrag })
      uitleg.push(
        regel(`box2-verlies-vervallen-${verlies.jaar}`, `Verlies box 2 uit ${verlies.jaar} vervallen (verrekenen kon tot en met ${vervaltNa})`, verlies.bedrag, 'info', {
          niveau: 2,
          parameter: 'box2.verliesverrekening',
        }),
      )
      continue
    }
    const deel = Math.min(rest, verlies.bedrag)
    rest -= deel
    verrekend += deel
    if (deel > 0) {
      uitleg.push(regel(`box2-verlies-verrekend-${verlies.jaar}`, `Verrekend met het verlies box 2 uit ${verlies.jaar}`, -deel, 'min', { niveau: 1, parameter: 'box2.verliesverrekening' }))
    }
    if (verlies.bedrag - deel > 0) resterend.push({ jaar: verlies.jaar, bedrag: verlies.bedrag - deel, vervaltNa })
  }

  // Verlies van dit jaar: eerst terug naar vorig jaar (bij beschikking), de rest vooruit.
  const verliesDitJaar = Math.max(0, -inkomen)
  let terugwenteling: Box2VerliesUitkomst['terugwenteling'] = null
  if (verliesDitJaar > 0) {
    const vorig = Math.max(0, p.box2InkomenVorigJaar ?? 0)
    const terug = v.terug > 0 ? Math.min(verliesDitJaar, vorig) : 0
    if (terug > 0) {
      let geschatteTeruggaaf = 0
      if (ctx.paramsVorigJaar) {
        const zonder = box2BelastingRuw(vorig, ctx.paramsVorigJaar).bedrag
        const met = box2BelastingRuw(vorig - terug, ctx.paramsVorigJaar).bedrag
        geschatteTeruggaaf = AFRONDING.box2Terugwenteling(zonder - met)
        uitleg.push(
          regel('box2-terugwenteling', `Terug naar ${ctx.jaar - 1}: geschatte teruggaaf box 2`, geschatteTeruggaaf, 'info', {
            niveau: 1,
            formule: `belasting ${ctx.jaar - 1} over ${eur(vorig)} min over ${eur(vorig - terug)}, met de schijven van ${ctx.jaar - 1}`,
            parameter: 'box2.schijven',
          }),
        )
      } else {
        uitleg.push(regel('box2-terugwenteling', `Terug naar ${ctx.jaar - 1}: geen parameters van dat jaar, dus geen schatting van de teruggaaf`, 0, 'info', { niveau: 1 }))
      }
      terugwenteling = { bedrag: terug, geschatteTeruggaaf }
    }
    const vooruit = verliesDitJaar - terug
    if (vooruit > 0) resterend.push({ jaar: ctx.jaar, bedrag: vooruit, vervaltNa: box2VervaltNa(ctx.jaar, ctx.params) })
    uitleg.push(
      regel('box2-verlies-dit-jaar', `Verlies box 2 in ${ctx.jaar}`, verliesDitJaar, 'info', {
        niveau: 1,
        formule: terug > 0 ? `${eur(terug)} terug naar ${ctx.jaar - 1}, ${eur(vooruit)} vooruit tot en met ${box2VervaltNa(ctx.jaar, ctx.params)}` : `vooruit tot en met ${box2VervaltNa(ctx.jaar, ctx.params)}`,
        parameter: 'box2.verliesverrekening',
      }),
    )
  }

  const belastbaar = Math.max(0, inkomen) - verrekend
  if (verrekend > 0) uitleg.push(regel('box2-belastbaar', 'Belastbaar inkomen box 2 na verrekening van verliezen', belastbaar, 'subtotaal', { niveau: 1 }))
  return { verliesDitJaar, terugwenteling, verrekend, resterend: resterend.sort((a, b) => a.jaar - b.jaar), vervallen, belastbaar, uitleg, waarschuwingen }
}

export interface Box2KortingInvoer {
  box2Belastingkorting?: PersoonInvoer['box2Belastingkorting']
  /** Verliezen na de verrekening van dit jaar (uit verrekenBox2Verliezen). */
  resterend: Resterend
  /** Hoogste korting dit jaar: de belasting in box 1 (en nooit meer dan de verschuldigde belasting). */
  max: number
  /** De persoon of de partner heeft dit jaar aanmerkelijk belang (dan kan omzetten niet). */
  abDitJaar?: boolean
}

export interface Box2KortingUitkomst {
  belastingkorting: Box2VerliesUitkomst['belastingkorting']
  /** De verliezen die overblijven na omzetting in een korting. */
  resterend: Resterend
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

/** Laatste jaar van een korting volgens de wet, en volgens het rekenvoorbeeld van de Belastingdienst als dat eerder is. */
export function kortingTermijn(verliesjaar: number, eersteJaar: number, params: TaxYearParams): { uiterlijkJaar: number; praktijkUiterlijkJaar?: number } {
  const k = params.box2.waarde.belastingkorting
  const naEerste = eersteJaar + k.jarenNaEerste
  const naVerlies = verliesjaar + k.uiterlijkJarenNaVerlies
  return naEerste <= naVerlies ? { uiterlijkJaar: naEerste, praktijkUiterlijkJaar: naEerste - 1 } : { uiterlijkJaar: naVerlies }
}

export function box2Belastingkorting(invoer: Box2KortingInvoer, ctx: Box2VerliesContext): Box2KortingUitkomst {
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const tarief = ctx.params.box2.waarde.schijven[0]?.tarief ?? 0
  const kortingen = (invoer.box2Belastingkorting?.lopend ?? []).filter((k) => k.restant > 0).map((k) => ({ ...k }))
  let resterend = invoer.resterend

  if (invoer.box2Belastingkorting?.verzoek) {
    if (invoer.abDitJaar) {
      waarschuwingen.push(
        waarschuwing(
          'box2-korting-ab',
          'let-op',
          `Je vraagt de belastingkorting voor je box 2-verlies aan, maar in ${ctx.jaar} staat er nog aanmerkelijk belang. De korting kan alleen als jij en je partner in ${ctx.jaar} en ${ctx.jaar - 1} geen aanmerkelijk belang hebben.`,
        ),
      )
    }
    const omzetten = resterend.filter((r) => r.jaar < ctx.jaar)
    for (const r of omzetten) {
      const restant = AFRONDING.box2Korting(tarief * r.bedrag)
      kortingen.push({ verliesjaar: r.jaar, eersteJaar: ctx.jaar, restant })
      uitleg.push(
        regel(`box2-korting-omgezet-${r.jaar}`, `Verlies box 2 uit ${r.jaar} omgezet in een belastingkorting`, restant, 'info', {
          niveau: 1,
          formule: `${pct(tarief, 1)} × ${eur(r.bedrag)}`,
          parameter: 'box2.schijven[0].tarief',
        }),
      )
    }
    resterend = resterend.filter((r) => r.jaar >= ctx.jaar)
  }

  let ruimte = Math.max(0, invoer.max)
  let ditJaar = 0
  const open: Box2VerliesUitkomst['belastingkorting']['resterend'] = []
  const metTermijn = kortingen.map((k) => ({ ...k, ...kortingTermijn(k.verliesjaar, k.eersteJaar, ctx.params) })).sort((a, b) => a.uiterlijkJaar - b.uiterlijkJaar || a.verliesjaar - b.verliesjaar)
  for (const k of metTermijn) {
    if (k.uiterlijkJaar < ctx.jaar) {
      uitleg.push(regel(`box2-korting-vervallen-${k.verliesjaar}`, `Belastingkorting voor het verlies uit ${k.verliesjaar} vervallen (kon tot en met ${k.uiterlijkJaar})`, k.restant, 'info', { niveau: 2 }))
      continue
    }
    const deel = Math.min(ruimte, k.restant)
    ruimte -= deel
    ditJaar += deel
    const restant = k.restant - deel
    if (restant > 0) {
      open.push({
        verliesjaar: k.verliesjaar,
        eersteJaar: k.eersteJaar,
        restant,
        uiterlijkJaar: k.uiterlijkJaar,
        ...(k.praktijkUiterlijkJaar !== undefined ? { praktijkUiterlijkJaar: k.praktijkUiterlijkJaar } : {}),
      })
    }
  }
  if (ditJaar > 0) {
    uitleg.push(
      regel('box2-korting', 'Belastingkorting voor een box 2-verlies (op de belasting in box 1)', -ditJaar, 'min', {
        niveau: 1,
        parameter: 'box2.belastingkorting',
      }),
    )
  }
  return { belastingkorting: { ditJaar, resterend: open }, resterend, uitleg, waarschuwingen }
}

/** Verrekening en belastingkorting samen, zoals de engine ze per persoon zet (PersoonResultaat.box2Verlies). */
export function berekenBox2Verlies(
  inkomen: number,
  p: Pick<PersoonInvoer, 'box2Verliezen' | 'box2InkomenVorigJaar' | 'box2Belastingkorting'>,
  ctx: Box2VerliesContext & { maxKorting: number; abDitJaar?: boolean },
): Box2VerliesUitkomst & { belastbaar: number; uitleg: Uitlegregel[]; waarschuwingen: Waarschuwing[] } {
  const v = verrekenBox2Verliezen(inkomen, p, ctx)
  const k = box2Belastingkorting({ box2Belastingkorting: p.box2Belastingkorting, resterend: v.resterend, max: ctx.maxKorting, abDitJaar: ctx.abDitJaar }, ctx)
  return {
    verliesDitJaar: v.verliesDitJaar,
    terugwenteling: v.terugwenteling,
    verrekend: v.verrekend,
    resterend: k.resterend,
    vervallen: v.vervallen,
    belastingkorting: k.belastingkorting,
    belastbaar: v.belastbaar,
    uitleg: [...v.uitleg, ...k.uitleg],
    waarschuwingen: [...v.waarschuwingen, ...k.waarschuwingen],
  }
}
