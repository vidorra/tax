/**
 * Box 3: dispatch op `params.box3.regime`.
 *
 *  - 'forfaitair'        overbruggingsstelsel (forfaitair.ts), met tegenbewijs (werkelijk.ts): als de
 *                        gebruiker tegenbewijs kiest, het jaar het toestaat en het werkelijk rendement lager is
 *                        dan het totale forfaitaire voordeel, geldt het werkelijk rendement (verdeeld volgens aandeelA).
 *  - 'schijven2017'      schijvenstelsel 2017 t/m 2022 (schijven2017.ts).
 *  - 'werkelijkRendement' stelsel vanaf 2028, voorstel (regime2028.ts).
 *
 * Zonder fiscaal partner en met twee personen in `personen` rekent elke persoon apart met de eigen
 * posities; vermogen van kinderen telt dan bij de eerste persoon (met een melding).
 */
import type { Box3Invoer, Box3Peildatum, Box3Pot, PersoonId, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { eur, euro, regel, waarschuwing } from '../../uitleg'
import { aantalPersonen, belastingPerPersoon, berekenForfaitair, bronbelastingVelden, inPot, isPartnerPot, leegPP, verdeel, verdeelGrondslag, verzamelVermogen, type Box3Context, type Box3ResultaatUitgebreid, type VermogenOverzicht } from './forfaitair'
import { berekenWerkelijkRendement } from './werkelijk'
import { berekenSchijven2017 } from './schijven2017'
import { berekenRegime2028 } from './regime2028'

export type { Box3Context, Box3ResultaatUitgebreid } from './forfaitair'

function berekenForfaitairMetTegenbewijs(invoer: Box3Invoer, ctx: Box3Context): Box3ResultaatUitgebreid {
  const b = ctx.params.box3.waarde
  const f = berekenForfaitair(invoer, ctx)
  const { vermogen, ...uit } = f
  const tb = b.tegenbewijs
  const gekozen = invoer.tegenbewijs === true

  if (!tb.beschikbaar || tb.kanaal === 'geen') {
    if (gekozen) {
      uit.waarschuwingen.push(waarschuwing('box3-tegenbewijs-niet', 'info', 'Tegenbewijs met het werkelijk rendement is in dit jaar niet mogelijk; het forfaitaire rendement blijft staan.'))
    }
    return uit
  }

  const posities = vermogen.posities
  const allesBekend = posities.length > 0 && posities.every((x) => x.waardeEind !== undefined || (x.categorie === 'onroerend' && x.woz))
  if (!gekozen && !allesBekend) return uit

  const w = berekenWerkelijkRendement(invoer, ctx)
  uit.werkelijkRendement = w.rendement
  const forfaitTotaal = f.voordeel.A + f.voordeel.B

  // Een stijging zonder ingevulde storting kan een storting zijn (geld erbij gezet): dan is het werkelijk rendement te
  // hoog gerekend en loont tegenbewijs misschien toch. Leeg en 0 zijn hier verschillend: 0 betekent geen storting.
  const stijgingZonderStorting = posities.filter(
    (x) =>
      x.categorie !== 'onroerend' &&
      !(x.categorie === 'nettolijfrente' && b.vrijstellingen.nettolijfrente) &&
      x.waardeEind !== undefined &&
      x.waardeEind > x.waardeBegin &&
      x.stortingen === undefined,
  )

  if (w.rendement >= forfaitTotaal) {
    // Alleen als er forfaitair voordeel is: zonder forfait valt er met tegenbewijs niets te winnen.
    if (stijgingZonderStorting.length > 0 && forfaitTotaal > 0) {
      const namen = stijgingZonderStorting.map((x) => (x.omschrijving ?? '').trim() || x.id).join(', ')
      uit.waarschuwingen.push(
        waarschuwing(
          'box3-tegenbewijs-storting',
          'info',
          `De waarde van ${namen} steeg, maar je hebt geen storting ingevuld. Zette je er geld bij, dan is dat geen rendement. Vul per bezitting in wat je erbij zette (0 als er niets was); misschien loont tegenbewijs dan wel.`,
        ),
      )
    }
    if (gekozen) {
      uit.uitleg.push(...w.uitleg)
      uit.waarschuwingen.push(...w.waarschuwingen)
      uit.uitleg.push(
        regel('box3-tegenbewijs-vergelijking', 'Werkelijk rendement is niet lager dan het forfaitaire voordeel; het forfait blijft staan', w.rendement, 'info', {
          formule: `${eur(w.rendement)} ≥ ${eur(forfaitTotaal)}`,
          parameter: 'box3.tegenbewijs',
        }),
      )
    }
    return uit
  }

  if (!gekozen) {
    // Een daling zonder ingevulde opname kan een opname of verkoop zijn: dan is het werkelijk rendement te laag
    // gerekend. Leeg en 0 zijn hier verschillend: 0 betekent dat de daling echt verlies is.
    const onzeker = posities.filter((x) => x.categorie !== 'onroerend' && x.waardeEind !== undefined && x.waardeEind < x.waardeBegin && x.onttrekkingen === undefined)
    if (onzeker.length > 0) {
      const namen = onzeker.map((x) => (x.omschrijving ?? '').trim() || x.id).join(', ')
      uit.waarschuwingen.push(
        waarschuwing(
          'box3-tegenbewijs-onvolledig',
          'let-op',
          `Het werkelijk rendement (${euro(w.rendement)}) lijkt lager dan het forfaitaire voordeel (${euro(forfaitTotaal)}), maar de waarde van ${namen} daalde zonder ingevulde opname. Een opname of verkoop is geen verlies. Vul per bezitting in wat je erbij zette en eraf haalde (0 als er niets was), dan zie je of tegenbewijs loont.`,
        ),
      )
      return uit
    }
    uit.waarschuwingen.push(
      waarschuwing(
        'box3-tegenbewijs-loont',
        'actie',
        `Het werkelijk rendement (${euro(w.rendement)}) is lager dan het forfaitaire voordeel (${euro(forfaitTotaal)}). Met tegenbewijs betaal je minder box 3-belasting.`,
      ),
    )
    return uit
  }

  // Werkelijk rendement toepassen.
  uit.uitleg.push(...w.uitleg)
  uit.waarschuwingen.push(...w.waarschuwingen)
  uit.uitleg.push(
    regel('box3-tegenbewijs-vergelijking', 'Werkelijk rendement is lager dan het forfaitaire voordeel en geldt als voordeel', w.rendement, 'info', {
      formule: `${eur(w.rendement)} < ${eur(forfaitTotaal)}`,
      parameter: 'box3.tegenbewijs',
    }),
  )
  const deel = verdeel(w.rendement, ctx)
  const voordeel = leegPP()
  for (const id of ctx.personen) voordeel[id] = AFRONDING.box3Voordeel(deel[id])
  if (isPartnerPot(ctx)) voordeel.B = w.rendement - voordeel.A
  for (const id of ctx.personen) {
    uit.uitleg.push(regel(`box3-voordeel-werkelijk-${id}`, `Voordeel uit sparen en beleggen partner ${id} (werkelijk rendement)`, voordeel[id], 'subtotaal'))
  }
  const bel = belastingPerPersoon(voordeel, posities, ctx, b.tarief)
  // De belastingregels van het forfait vervangen door die van het werkelijk rendement.
  uit.uitleg = uit.uitleg.filter((u) => !u.id.startsWith('box3-belasting-') && !u.id.startsWith('box3-bronbelasting-'))
  uit.uitleg.push(...bel.uitleg)
  uit.waarschuwingen = uit.waarschuwingen.filter((x) => !x.id.startsWith('box3-bronbelasting-')).concat(bel.waarschuwingen)

  return { ...uit, voordeel, belasting: bel.belasting, bronbelasting: bel.bronbelasting, ...bronbelastingVelden(bel), gekozen: 'werkelijk' }
}

function berekenEenPot(invoer: Box3Invoer, ctx: Box3Context): Box3ResultaatUitgebreid {
  switch (ctx.params.box3.waarde.regime) {
    case 'schijven2017': {
      const r = berekenSchijven2017(invoer, ctx)
      if (invoer.tegenbewijs === true) {
        r.waarschuwingen.push(
          waarschuwing(
            'box3-tegenbewijs-niet',
            'info',
            'Voor dit jaar rekent deze tool het werkelijk rendement niet door; het forfaitaire rendement blijft staan. Tegenbewijs kan wel via het formulier Opgaaf werkelijk rendement van de Belastingdienst.',
          ),
        )
      }
      return r
    }
    case 'werkelijkRendement':
      return berekenRegime2028(invoer, ctx)
    case 'forfaitair':
    default:
      return berekenForfaitairMetTegenbewijs(invoer, ctx)
  }
}

function telOp(a: Box3ResultaatUitgebreid, b: Box3ResultaatUitgebreid, id: PersoonId): Box3ResultaatUitgebreid {
  const label = (u: Uitlegregel): Uitlegregel => ({ ...u, id: `${id}-${u.id}` })
  const plus = (x: Record<PersoonId, number>, y: Record<PersoonId, number>): Record<PersoonId, number> => ({ A: x.A + y.A, B: x.B + y.B })
  return {
    bezittingen: a.bezittingen + b.bezittingen,
    aftrekbareSchulden: a.aftrekbareSchulden + b.aftrekbareSchulden,
    rendementsgrondslag: a.rendementsgrondslag + b.rendementsgrondslag,
    grondslag: a.grondslag + b.grondslag,
    forfaitairRendement: a.forfaitairRendement + b.forfaitairRendement,
    effectiefPct: b.effectiefPct,
    werkelijkRendement: a.werkelijkRendement === null && b.werkelijkRendement === null ? null : (a.werkelijkRendement ?? 0) + (b.werkelijkRendement ?? 0),
    gekozen: a.gekozen === b.gekozen ? b.gekozen : a.gekozen === 'nvt' ? b.gekozen : a.gekozen,
    voordeel: plus(a.voordeel, b.voordeel),
    belasting: plus(a.belasting, b.belasting),
    bronbelasting: plus(a.bronbelasting, b.bronbelasting),
    ...bronbelastingVelden({
      regels: [...(a.bronbelastingRegels ?? []), ...(b.bronbelastingRegels ?? [])],
      verrekenbaar: plus(a.bronbelastingVerrekenbaar ?? leegPP(), b.bronbelastingVerrekenbaar ?? leegPP()),
    }),
    dividendbelasting: a.dividendbelasting + b.dividendbelasting,
    vermogenToeslagen: a.vermogenToeslagen + b.vermogenToeslagen,
    groenVrijgesteld: plus(a.groenVrijgesteld, b.groenVrijgesteld),
    voordeelForfaitair: plus(a.voordeelForfaitair, b.voordeelForfaitair),
    rendementRegels: [...a.rendementRegels, ...b.rendementRegels],
    uitleg: [...a.uitleg, ...b.uitleg.map(label)],
    waarschuwingen: [...a.waarschuwingen, ...b.waarschuwingen.map((x) => ({ ...x, id: `${id}-${x.id}` }))],
  }
}

function leegResultaat(): Box3ResultaatUitgebreid {
  return {
    bezittingen: 0,
    aftrekbareSchulden: 0,
    rendementsgrondslag: 0,
    grondslag: 0,
    forfaitairRendement: 0,
    effectiefPct: 0,
    werkelijkRendement: null,
    gekozen: 'nvt',
    voordeel: leegPP(),
    belasting: leegPP(),
    bronbelasting: leegPP(),
    dividendbelasting: 0,
    vermogenToeslagen: 0,
    groenVrijgesteld: leegPP(),
    voordeelForfaitair: leegPP(),
    rendementRegels: [],
    uitleg: [],
    waarschuwingen: [],
  }
}

function peildatum(v: VermogenOverzicht): Box3Peildatum {
  return {
    bezittingen: v.bezittingen,
    vrijgesteld: v.contantVrijgesteld + v.groenVrijgesteld + v.nettolijfrenteVrijgesteld,
    schulden: v.schulden,
    schuldendrempel: v.schuldendrempel,
    aftrekbareSchulden: v.aftrekbareSchulden,
    rendementsgrondslag: v.rendementsgrondslag,
  }
}

/**
 * Beschrijving van één pot voor het fiscaal rapport: welke posities erin zitten, het vermogen op beide peildata
 * (de eindstand alleen als die van alle posities en schulden bekend is), de grondslag per persoon (onafgerond en
 * in hele euro's), het rendementspercentage, de methode en bij het schijvenstelsel het voordeel per schijf.
 */
function maakPot(invoer: Box3Invoer, ctx: Box3Context, r: Box3ResultaatUitgebreid): Box3Pot {
  const posities = invoer.posities.filter((x) => inPot(x.eigenaar, ctx))
  const schulden = invoer.schulden.filter((x) => inPot(x.eigenaar, ctx))
  const begin = verzamelVermogen(invoer, ctx)
  const eindBekend = posities.length + schulden.length > 0 && posities.every((x) => x.waardeEind !== undefined) && schulden.every((x) => x.waardeEind !== undefined)
  const eind = eindBekend
    ? verzamelVermogen(
        {
          ...invoer,
          posities: posities.map((x) => ({ ...x, waardeBegin: x.waardeEind ?? 0 })),
          schulden: schulden.map((x) => ({ ...x, waardeBegin: x.waardeEind ?? 0 })),
        },
        ctx,
      )
    : undefined
  const grondslagPerPersoon = leegPP()
  const deel = verdeel(r.grondslag, ctx)
  for (const id of ctx.personen) grondslagPerPersoon[id] = deel[id]
  const grondslagDeel = leegPP()
  const afgerond = verdeelGrondslag(r.grondslag, ctx)
  for (const id of ctx.personen) grondslagDeel[id] = afgerond[id]
  return {
    personen: isPartnerPot(ctx) ? ['A', 'B'] : [...ctx.personen],
    positieIds: posities.map((x) => x.id),
    schuldIds: schulden.map((x) => x.id),
    begin: peildatum(begin),
    ...(eind ? { eind: peildatum(eind) } : {}),
    heffingsvrijVermogen: ctx.params.box3.waarde.heffingsvrijVermogen * aantalPersonen(ctx),
    grondslag: r.grondslag,
    grondslagPerPersoon,
    grondslagDeel,
    forfaitairRendement: r.forfaitairRendement,
    effectiefPct: r.effectiefPct,
    rendementRegels: r.rendementRegels,
    ...(r.voordeelPerSchijf ? { voordeelPerSchijf: r.voordeelPerSchijf } : {}),
    gekozen: r.gekozen,
    werkelijkRendement: r.werkelijkRendement,
    dividendbelasting: begin.dividendbelasting,
  }
}

/**
 * Box 3 van het huishouden. Ronde 2 (A5): posities in `ctx.buitenBox3` (ter beschikking gesteld aan de onderneming van
 * de partner, art. 3.91) tellen niet mee; de uitkomst noemt ze in `buitenBox3`. De positie blijft in de invoer staan.
 */
export function berekenBox3(invoer: Box3Invoer, ctx: Box3Context): Box3ResultaatUitgebreid {
  const buiten = (ctx.buitenBox3 ?? []).filter((id) => invoer.posities.some((x) => x.id === id))
  if (buiten.length > 0) {
    const r = berekenBox3Zonder({ ...invoer, posities: invoer.posities.filter((x) => !buiten.includes(x.id)) }, ctx)
    const namen = invoer.posities.filter((x) => buiten.includes(x.id)).map((x) => x.omschrijving.trim() || x.id)
    return {
      ...r,
      buitenBox3: buiten,
      waarschuwingen: [
        ...r.waarschuwingen,
        waarschuwing(
          'box3-terbeschikkingstelling',
          'info',
          `${namen.join(', ')} ${namen.length === 1 ? 'staat' : 'staan'} ter beschikking van de onderneming van je partner en ${namen.length === 1 ? 'telt' : 'tellen'} daarom niet mee in box 3.`,
        ),
      ],
    }
  }
  return berekenBox3Zonder(invoer, ctx)
}

function berekenBox3Zonder(invoer: Box3Invoer, ctx: Box3Context): Box3ResultaatUitgebreid {
  if (ctx.fiscaalPartner || ctx.personen.length <= 1) {
    const r = berekenEenPot(invoer, ctx)
    return { ...r, potten: [maakPot(invoer, ctx, r)] }
  }

  // Geen fiscale partners: ieder een eigen pot. Kindvermogen bij de eerste persoon.
  const [eerste] = ctx.personen
  let totaal = leegResultaat()
  const potten: Box3Pot[] = []
  for (const id of ctx.personen) {
    const eigen: Box3Invoer = {
      ...invoer,
      posities: invoer.posities.filter((x) => x.eigenaar === id || (id === eerste && x.eigenaar.startsWith('kind:'))),
      schulden: invoer.schulden.filter((x) => x.eigenaar === id || (id === eerste && x.eigenaar.startsWith('kind:'))),
    }
    const potCtx: Box3Context = { ...ctx, personen: [id], fiscaalPartner: false }
    const r = berekenEenPot(eigen, potCtx)
    potten.push(maakPot(eigen, potCtx, r))
    totaal = telOp(totaal, r, id)
  }
  const waarschuwingen: Waarschuwing[] = []
  if (invoer.posities.some((x) => x.eigenaar.startsWith('kind:'))) {
    waarschuwingen.push(
      waarschuwing('box3-kind-gezag', 'info', `Vermogen van een minderjarig kind telt bij de ouder met het gezag. Hier is het meegeteld bij persoon ${eerste}; pas dat aan als het gezag anders ligt.`),
    )
  }
  return { ...totaal, effectiefPct: 0, potten, waarschuwingen: [...totaal.waarschuwingen, ...waarschuwingen] }
}
