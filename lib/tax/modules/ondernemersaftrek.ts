/**
 * Ondernemersaftrek per persoon (art. 3.74 Wet IB 2001) in wettelijke volgorde, en de MKB-winstvrijstelling.
 *
 *  1. zelfstandigenaftrek (urencriterium over alle ondernemingen samen; factor aowFactor bij AOW-leeftijd op 1 januari),
 *     voor niet-starters begrensd op de winst; het restant is niet-benutte zelfstandigenaftrek die
 *     nietBenutteZelfstandigenaftrekJaren jaar vooruit gaat. Eerder niet-benutte aftrek wordt verrekend
 *     zodra de winst hoger is dan de zelfstandigenaftrek (oudste jaar eerst). Het verloop per jaar (begin,
 *     verrekend, vervallen, rest) staat in `nietBenutOverzicht`.
 *  2. startersaftrek (verhoging van de zelfstandigenaftrek; maximaal startersaftrekMaxKeer keer binnen
 *     startersaftrekBinnenJaren jaar na de start)
 *  3. startersaftrek bij arbeidsongeschiktheid (staffel per jaarNummer, verlaagd urencriterium, sluit 1 en 2 uit)
 *  4. S&O-aftrek (minimaal minUren S&O-uren; extra voor starters)
 *  5. meewerkaftrek (staffel naar uren van de partner × winst zonder stakingswinst (art. 3.78 lid 3), alleen bij een
 *     vergoeding onder maxVergoeding)
 *  6. stakingsaftrek (ronde 2, A6): uit de uitkomst van de staking per onderneming (`OndernemingResultaat.staking`),
 *     samen ten hoogste het maximum min wat eerder is genoten (art. 3.79 lid 4). Geen urencriterium.
 *
 * MKB-winstvrijstelling = mkbWinstvrijstelling × (winst − ondernemersaftrek), ook als dat negatief is.
 */
import type { NietBenutJaar, OndernemersaftrekResultaat, OndernemingInvoer, OndernemingResultaat, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { AFRONDING } from '../rounding'
import { eur, euro, pct, regel, waarschuwing } from '../uitleg'
import { toetsUrencriterium, type UrencriteriumResultaat } from './onderneming/urencriterium'

/**
 * Urencriterium over alle ondernemingen van één persoon samen (art. 3.6 geldt per belastingplichtige): de uren
 * tellen op, de loondienst-uren en het verlof per persoon (hoogste opgave), en een opgegeven keuze telt als gehaald
 * zodra die bij één onderneming ja is.
 */
export function toetsUrencriteriumSamen(
  ondernemingen: OndernemingInvoer[],
  ctx: { params: TaxYearParams; jaar: number; prefix?: string },
): UrencriteriumResultaat {
  const opgegeven = ondernemingen.map((o) => o.uren.urencriteriumGehaald).filter((x): x is boolean => x !== undefined)
  const startjaar = Math.min(...ondernemingen.map((o) => o.startjaar))
  const aoStarter = ondernemingen.some((o) => o.arbeidsongeschiktStarter !== undefined)
  return toetsUrencriterium(
    {
      onderneming: ondernemingen.reduce((s, o) => s + Math.max(0, o.uren.onderneming), 0),
      loondienst: Math.max(0, ...ondernemingen.map((o) => o.uren.loondienst ?? 0)),
      zwangerschapWeken: Math.max(0, ...ondernemingen.map((o) => o.uren.zwangerschapWeken ?? 0)),
      gemiddeldeUrenPerWeekVoorVerlof: ondernemingen.some((o) => o.uren.gemiddeldeUrenPerWeekVoorVerlof !== undefined)
        ? ondernemingen.reduce((s, o) => s + (o.uren.gemiddeldeUrenPerWeekVoorVerlof ?? 0), 0)
        : undefined,
      urencriteriumGehaald: opgegeven.length === 0 ? undefined : opgegeven.some(Boolean),
    },
    { params: ctx.params, jaar: ctx.jaar, startjaar, arbeidsongeschiktStarter: aoStarter, prefix: ctx.prefix ?? 'ondernemersaftrek' },
  )
}

/**
 * Urencriterium van de persoon bij meer ondernemingen: gehaald zodra de uren samen of één onderneming afzonderlijk
 * het halen. Bij één onderneming undefined: dan is de toets van die onderneming leidend (die kent ook de uren in
 * loondienst uit de context). De engine geeft dit als `urencriteriumPersoon` aan elke onderneming door, zodat de
 * FOR-afname en de dotatie per persoon toetsen en niet per onderneming.
 */
export function urencriteriumVanPersoon(
  ondernemingen: OndernemingInvoer[],
  ctx: { params: TaxYearParams; jaar: number; urenLoondienst: number },
): boolean | undefined {
  if (ondernemingen.length <= 1) return undefined
  if (toetsUrencriteriumSamen(ondernemingen, ctx).gehaald) return true
  return ondernemingen.some(
    (o) =>
      toetsUrencriterium(o.uren, {
        params: ctx.params,
        jaar: ctx.jaar,
        startjaar: o.startjaar,
        urenLoondienst: ctx.urenLoondienst,
        arbeidsongeschiktStarter: o.arbeidsongeschiktStarter !== undefined,
      }).gehaald,
  )
}

/**
 * Urencriterium van de persoon in het vorige jaar, uit de opgave per onderneming: ja zodra één onderneming ja zegt
 * (het criterium gold voor de persoon), nee als er alleen nee staat, anders onbekend.
 */
export function urencriteriumVorigJaarVanPersoon(ondernemingen: OndernemingInvoer[]): boolean | undefined {
  const vorig = ondernemingen.map((o) => o.uren.urencriteriumVorigJaar)
  if (vorig.some((x) => x === true)) return true
  if (vorig.some((x) => x === false)) return false
  return undefined
}

/** Meewerkaftrek is een percentage van de winst; rekenkundig afgerond. Contractwens: AFRONDING.ondernemersaftrek. */
const afrondAftrek = AFRONDING.investeringsaftrek

export function berekenMkbVrijstelling(winstNaOndernemersaftrek: number, params: TaxYearParams): { bedrag: number; uitleg: Uitlegregel[] } {
  const p = params.ondernemer.waarde.mkbWinstvrijstelling
  const bedrag = AFRONDING.mkb(p * winstNaOndernemersaftrek) + 0 // + 0 maakt van −0 een gewone 0
  return {
    bedrag,
    uitleg: [
      regel('mkbVrijstelling', 'MKB-winstvrijstelling', bedrag, 'min', {
        niveau: 0,
        formule: `${pct(p)} × ${eur(winstNaOndernemersaftrek)}`,
        parameter: 'ondernemer.mkbWinstvrijstelling',
        status: params.ondernemer.veldStatus?.mkbWinstvrijstelling ?? params.ondernemer.status,
      }),
    ],
  }
}

export function berekenOndernemersaftrek(
  invoer: { ondernemingen: OndernemingInvoer[]; resultaten: OndernemingResultaat[]; nietBenut?: Array<{ jaar: number; bedrag: number }> },
  ctx: { params: TaxYearParams; jaar: number; aowBereikt: boolean },
): OndernemersaftrekResultaat {
  const op = ctx.params.ondernemer.waarde
  const status = ctx.params.ondernemer.status
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const leeg: OndernemersaftrekResultaat = {
    zelfstandigenaftrek: 0,
    startersaftrek: 0,
    soAftrek: 0,
    meewerkaftrek: 0,
    stakingsaftrek: 0,
    startersaftrekAO: 0,
    totaal: 0,
    nietBenutteZelfstandigenaftrekNieuw: 0,
    verrekendNietBenut: 0,
    uitleg,
    waarschuwingen,
  }
  const ondernemingen = invoer.ondernemingen
  if (ondernemingen.length === 0) return leeg

  const totaleWinst = invoer.resultaten.reduce((s, r) => s + r.winst, 0)
  const factor = ctx.aowBereikt ? op.aowFactor : 1
  const factorTekst = ctx.aowBereikt ? ` × ${pct(op.aowFactor)} (AOW-leeftijd)` : ''

  // Urencriterium per persoon: uren van alle ondernemingen samen.
  const startjaar = Math.min(...ondernemingen.map((o) => o.startjaar))
  const aoStarter = ondernemingen.find((o) => o.arbeidsongeschiktStarter)?.arbeidsongeschiktStarter
  const samen = toetsUrencriteriumSamen(ondernemingen, { params: ctx.params, jaar: ctx.jaar })
  // Eén onderneming: de toets van berekenOnderneming (die ook de loondienstUren uit de context kent) is leidend.
  // Meer ondernemingen: de uren tellen samen; gehaald zodra de som of één onderneming afzonderlijk het haalt.
  const urencriterium =
    ondernemingen.length === 1 && invoer.resultaten[0]
      ? invoer.resultaten[0].urencriteriumGehaald
      : samen.gehaald || invoer.resultaten.some((r) => r.urencriteriumGehaald)
  const urenSamen = samen.uren
  if (ondernemingen.length > 1) {
    uitleg.push(
      regel('ondernemersaftrek.uren', urencriterium ? 'Urencriterium gehaald over al je ondernemingen samen' : 'Urencriterium niet gehaald over al je ondernemingen samen', urenSamen, 'info', {
        formule: `${eur(urenSamen)} uur`,
        parameter: 'ondernemer.urencriterium.uren',
      }),
    )
  }

  // Starter voor de startersaftrek: in een of meer van de voorgaande jaren binnen de termijn geen ondernemer,
  // en de aftrek nog niet het maximale aantal keren gebruikt.
  const eerderGebruikt = Math.max(0, ...ondernemingen.map((o) => o.startersaftrekEerderGebruikt ?? 0))
  const binnenTermijn = ctx.jaar - startjaar < op.startersaftrekBinnenJaren
  const starterRecht = binnenTermijn && eerderGebruikt < op.startersaftrekMaxKeer

  let zelfstandigenaftrek = 0
  let startersaftrek = 0
  let startersaftrekAO = 0
  let nietBenutNieuw = 0
  let verrekendNietBenut = 0
  const termijn = op.nietBenutteZelfstandigenaftrekJaren
  // Eerder niet-benutte zelfstandigenaftrek die dit jaar openstaat, oudste jaar eerst; verrekend vult de verrekening.
  const eerder = (invoer.nietBenut ?? [])
    .filter((x) => x.bedrag > 0 && x.jaar < ctx.jaar)
    .sort((a, b) => a.jaar - b.jaar)
    .map((x) => ({ ...x, laatsteJaar: x.jaar + termijn, verrekend: 0 }))

  // 3. Startersaftrek bij arbeidsongeschiktheid (sluit zelfstandigen- en startersaftrek uit)
  const aoAftrekMogelijk = aoStarter !== undefined && op.startersaftrekAO.actief && samen.uren >= op.urencriterium.verlaagdAO
  if (aoAftrekMogelijk) {
    const staffelBedrag = op.startersaftrekAO.staffel[aoStarter!.jaarNummer - 1] ?? 0
    startersaftrekAO = Math.min(staffelBedrag, Math.max(0, totaleWinst))
    uitleg.push(
      regel('ondernemersaftrek.startersaftrekAO', 'Startersaftrek bij arbeidsongeschiktheid', startersaftrekAO, 'min', {
        formule: `jaar ${aoStarter!.jaarNummer}: ${eur(staffelBedrag)}${startersaftrekAO < staffelBedrag ? `, maximaal de winst ${eur(totaleWinst)}` : ''}`,
        parameter: 'ondernemer.startersaftrekAO.staffel',
        status,
      }),
    )
    waarschuwingen.push(
      waarschuwing('ondernemersaftrek.ao', 'info', 'De startersaftrek bij arbeidsongeschiktheid vervangt de zelfstandigenaftrek en de startersaftrek.'),
    )
  } else if (urencriterium) {
    // 1. Zelfstandigenaftrek
    const vol = op.zelfstandigenaftrek * factor
    if (starterRecht) {
      zelfstandigenaftrek = vol
    } else {
      zelfstandigenaftrek = Math.min(vol, Math.max(0, totaleWinst))
      nietBenutNieuw = vol - zelfstandigenaftrek
    }
    uitleg.push(
      regel('ondernemersaftrek.zelfstandigenaftrek', 'Zelfstandigenaftrek', zelfstandigenaftrek, 'min', {
        formule:
          nietBenutNieuw > 0
            ? `${eur(op.zelfstandigenaftrek)}${factorTekst}, maximaal de winst ${eur(Math.max(0, totaleWinst))}`
            : `${eur(op.zelfstandigenaftrek)}${factorTekst}${starterRecht && vol > totaleWinst ? ' (starter: mag hoger zijn dan de winst)' : ''}`,
        parameter: 'ondernemer.zelfstandigenaftrek',
        status: ctx.params.ondernemer.veldStatus?.zelfstandigenaftrek ?? status,
      }),
    )
    if (nietBenutNieuw > 0) {
      uitleg.push(
        regel('ondernemersaftrek.nietBenutNieuw', 'Niet-benutte zelfstandigenaftrek (naar volgende jaren)', nietBenutNieuw, 'info', {
          niveau: 2,
          formule: `${eur(vol)} − ${eur(zelfstandigenaftrek)}, te verrekenen tot en met ${ctx.jaar + op.nietBenutteZelfstandigenaftrekJaren}`,
          parameter: 'ondernemer.nietBenutteZelfstandigenaftrekJaren',
        }),
      )
    }

    // Verrekening van eerder niet-benutte zelfstandigenaftrek (oudste jaar eerst); een vervallen jaar telt niet mee.
    const ruimte = Math.max(0, totaleWinst - zelfstandigenaftrek)
    let rest = ruimte
    for (const nb of eerder) {
      if (ctx.jaar > nb.laatsteJaar) continue
      const neem = Math.min(rest, nb.bedrag)
      if (neem <= 0) continue
      nb.verrekend = neem
      verrekendNietBenut += neem
      rest -= neem
      uitleg.push(
        regel('ondernemersaftrek.nietBenutVerrekend', `Niet-benutte zelfstandigenaftrek uit ${nb.jaar}`, neem, 'min', {
          formule: `${eur(neem)} van ${eur(nb.bedrag)}`,
          parameter: 'ondernemer.nietBenutteZelfstandigenaftrekJaren',
        }),
      )
    }

    // 2. Startersaftrek
    if (starterRecht) {
      startersaftrek = op.startersaftrek * factor
      uitleg.push(
        regel('ondernemersaftrek.startersaftrek', 'Startersaftrek', startersaftrek, 'min', {
          formule: `${eur(op.startersaftrek)}${factorTekst}; ${eerderGebruikt + 1}e keer van maximaal ${op.startersaftrekMaxKeer}`,
          parameter: 'ondernemer.startersaftrek',
          status,
        }),
      )
      if (zelfstandigenaftrek + startersaftrek > totaleWinst) {
        waarschuwingen.push(
          waarschuwing(
            'ondernemersaftrek.starterVerlies',
            'info',
            'Als starter mag je de volledige zelfstandigen- en startersaftrek nemen, ook als je daardoor verlies hebt. Dat verlies kun je verrekenen met andere jaren.',
          ),
        )
      }
    } else if (binnenTermijn && eerderGebruikt >= op.startersaftrekMaxKeer) {
      waarschuwingen.push(
        waarschuwing('ondernemersaftrek.startersaftrekOp', 'info', `Je hebt de startersaftrek al ${op.startersaftrekMaxKeer} keer gebruikt.`),
      )
    }
  } else {
    uitleg.push(
      regel('ondernemersaftrek.geenUrencriterium', 'Geen zelfstandigenaftrek: urencriterium niet gehaald', 0, 'info', {
        formule: `${eur(urenSamen)} uur, nodig ${eur(op.urencriterium.uren)}`,
        parameter: 'ondernemer.urencriterium.uren',
      }),
    )
    const open = (invoer.nietBenut ?? []).filter((x) => x.bedrag > 0 && ctx.jaar - x.jaar <= termijn)
    if (open.length > 0) {
      waarschuwingen.push(
        waarschuwing(
          'ondernemersaftrek.nietBenutGeenUren',
          'let-op',
          'Je hebt nog niet-benutte zelfstandigenaftrek, maar die kun je alleen verrekenen in een jaar waarin je het urencriterium haalt.',
        ),
      )
    }
  }

  // Verloop per jaar. Vervallen is wat niet meer te verrekenen is: alles als de termijn al voorbij was, en het
  // restant als dit het laatste jaar van de termijn is. De rest schuift door naar volgend jaar.
  const nietBenutOverzicht: NietBenutJaar[] = eerder.map((nb) => {
    const vervallen = ctx.jaar > nb.laatsteJaar ? nb.bedrag : ctx.jaar === nb.laatsteJaar ? nb.bedrag - nb.verrekend : 0
    return { jaar: nb.jaar, begin: nb.bedrag, verrekend: nb.verrekend, vervallen, rest: nb.bedrag - nb.verrekend - vervallen, laatsteJaar: nb.laatsteJaar }
  })
  // Eén melding per soort (de engine houdt per id één melding), met alle jaren erin.
  const alVervallen = nietBenutOverzicht.filter((x) => ctx.jaar > x.laatsteJaar)
  if (alVervallen.length > 0) {
    const delen = alVervallen.map((x) => `${x.jaar} (${euro(x.begin)})`)
    const jaren = delen.length > 1 ? `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}` : delen[0]
    waarschuwingen.push(
      waarschuwing(
        'ondernemersaftrek.nietBenutVervallen',
        'info',
        `Niet-benutte zelfstandigenaftrek uit ${jaren} is vervallen: verrekenen kan tot ${termijn} jaar na het jaar waarin die is ontstaan.`,
      ),
    )
  }
  const vervaltNu = nietBenutOverzicht.filter((x) => ctx.jaar === x.laatsteJaar && x.vervallen > 0)
  if (vervaltNu.length > 0) {
    waarschuwingen.push(
      waarschuwing(
        'ondernemersaftrek.nietBenutVervaltDitJaar',
        'let-op',
        vervaltNu
          .map((x) => `Niet-benutte zelfstandigenaftrek uit ${x.jaar}: ${euro(x.vervallen)} is dit jaar niet verrekend en vervalt, want dit was het laatste jaar om die te verrekenen.`)
          .join(' '),
      ),
    )
  }

  // 4. S&O-aftrek
  let soAftrek = 0
  const soUren = ondernemingen.reduce((s, o) => s + (o.soUren ?? 0), 0)
  if (soUren > 0) {
    if (urencriterium && soUren >= op.soAftrek.minUren) {
      soAftrek = op.soAftrek.basis + (starterRecht ? op.soAftrek.starters : 0)
      uitleg.push(
        regel('ondernemersaftrek.soAftrek', 'Aftrek speur- en ontwikkelingswerk', soAftrek, 'min', {
          formule: starterRecht ? `${eur(op.soAftrek.basis)} + ${eur(op.soAftrek.starters)} voor starters` : `${eur(soUren)} uur S&O, minimaal ${eur(op.soAftrek.minUren)}`,
          parameter: 'ondernemer.soAftrek',
          status,
        }),
      )
      waarschuwingen.push(waarschuwing('ondernemersaftrek.soVerklaring', 'info', 'Voor de S&O-aftrek heb je een S&O-verklaring van RVO nodig.'))
    } else {
      waarschuwingen.push(
        waarschuwing(
          'ondernemersaftrek.soTeWeinig',
          'info',
          `Geen S&O-aftrek: ${!urencriterium ? 'het urencriterium is niet gehaald' : `minder dan ${eur(op.soAftrek.minUren)} uur speur- en ontwikkelingswerk`}.`,
        ),
      )
    }
  }

  // 5. Meewerkaftrek (per onderneming)
  let meewerkaftrek = 0
  ondernemingen.forEach((o, i) => {
    const mp = o.meewerkendePartner
    if (!mp) return
    // Art. 3.78 lid 3: de stakingswinst telt niet mee voor de meewerkaftrek.
    const winst = Math.max(0, (invoer.resultaten[i]?.winst ?? 0) - Math.max(0, invoer.resultaten[i]?.staking?.totaal ?? 0))
    if (!op.meewerkaftrek.actief) {
      waarschuwingen.push(waarschuwing('ondernemersaftrek.meewerkVervallen', 'info', 'De meewerkaftrek bestaat in dit jaar niet meer.'))
      return
    }
    if (mp.vergoeding >= op.meewerkaftrek.maxVergoeding) {
      waarschuwingen.push(
        waarschuwing(
          'ondernemersaftrek.arbeidsbeloning',
          'info',
          `Je partner krijgt ${euro(mp.vergoeding)} vergoeding (minstens ${euro(op.meewerkaftrek.maxVergoeding)}): dat is een aftrekbare arbeidsbeloning, geen meewerkaftrek.`,
        ),
      )
      return
    }
    if (!urencriterium) return
    const trede = [...op.meewerkaftrek.staffel].sort((a, b) => b.vanafUren - a.vanafUren).find((s) => mp.uren >= s.vanafUren)
    if (!trede) return
    const bedrag = afrondAftrek(trede.pct * winst)
    meewerkaftrek += bedrag
    uitleg.push(
      regel('ondernemersaftrek.meewerkaftrek', `Meewerkaftrek (${o.naam})`, bedrag, 'min', {
        formule: `${pct(trede.pct)} × ${eur(winst)} (${eur(mp.uren)} uur meewerken)`,
        parameter: 'ondernemer.meewerkaftrek.staffel',
        status,
      }),
    )
  })

  // 6. Stakingsaftrek (ronde 2, A6): per onderneming uit de uitkomst van de staking; samen niet meer dan wat er nog over is.
  let stakingsaftrek = 0
  const stakingen = invoer.resultaten.map((r, i) => ({ r, s: r.staking, naam: ondernemingen[i]?.naam ?? r.naam })).filter((x) => x.s)
  if (stakingen.length > 0) {
    const eerder = Math.max(...stakingen.map((x) => x.s!.eerderGenoten ?? 0))
    let rest = Math.max(0, op.stakingsaftrek - eerder)
    const delen: string[] = []
    for (const x of stakingen) {
      const neem = Math.min(Math.max(0, x.s!.stakingsaftrek ?? 0), rest)
      rest -= neem
      stakingsaftrek += neem
      if (neem > 0) delen.push(`${eur(neem)} (${x.naam})`)
    }
    const grondslag = stakingen.reduce((t, x) => t + Math.max(0, x.s!.soort === 'geruisloosBV' ? x.s!.forVrijval : x.s!.soort === 'geheel' ? x.s!.totaal : 0), 0)
    if (stakingsaftrek > 0) {
      uitleg.push(
        regel('ondernemersaftrek.stakingsaftrek', 'Stakingsaftrek', stakingsaftrek, 'min', {
          formule: `${eur(op.stakingsaftrek)}${eerder > 0 ? ` − eerder genoten ${eur(eerder)}` : ''}, maximaal de stakingswinst ${eur(grondslag)}${delen.length > 1 ? `: ${delen.join(' + ')}` : ''}`,
          parameter: 'ondernemer.stakingsaftrek',
          status,
        }),
      )
    } else if (eerder >= op.stakingsaftrek && op.stakingsaftrek > 0 && stakingen.some((x) => x.s!.soort === 'geheel' || x.s!.soort === 'geruisloosBV')) {
      waarschuwingen.push(waarschuwing('ondernemersaftrek.stakingEerder', 'info', `Je hebt de stakingsaftrek (${euro(op.stakingsaftrek)}) in eerdere jaren al helemaal gebruikt.`))
    }
  }

  const totaal = zelfstandigenaftrek + verrekendNietBenut + startersaftrek + startersaftrekAO + soAftrek + meewerkaftrek + stakingsaftrek
  uitleg.push(regel('ondernemersaftrek.totaal', 'Totaal ondernemersaftrek', totaal, 'subtotaal', { niveau: 0 }))
  if (ctx.aowBereikt && urencriterium) {
    waarschuwingen.push(
      waarschuwing('ondernemersaftrek.aow', 'info', `Omdat je op 1 januari de AOW-leeftijd had, krijg je ${pct(op.aowFactor, 0)} van de zelfstandigen- en startersaftrek.`),
    )
  }

  return {
    zelfstandigenaftrek,
    startersaftrek,
    soAftrek,
    meewerkaftrek,
    stakingsaftrek,
    startersaftrekAO,
    totaal,
    nietBenutteZelfstandigenaftrekNieuw: nietBenutNieuw,
    verrekendNietBenut,
    ...(nietBenutOverzicht.length > 0 ? { nietBenutOverzicht } : {}),
    uitleg,
    waarschuwingen,
  }
}
