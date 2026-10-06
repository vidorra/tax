/**
 * Investeringsregelingen: kleinschaligheidsinvesteringsaftrek (KIA), energie-investeringsaftrek (EIA),
 * milieu-investeringsaftrek (MIA) en de desinvesteringsbijtelling.
 *
 * Alle bedragen en percentages komen uit `params.ondernemer`. Puur: geen I/O.
 */
import type { ActiefInvoer, DesinvesteringInvoer, InvesteringInvoer, InvesteringsaftrekMiddel, KiaParams, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { parseDatum } from '../../datum'
import { eur, euro, pct, regel, waarschuwing, datumNL } from '../../uitleg'

export interface InvesteringsaftrekResultaat {
  /** Som van de investeringen die voor de KIA meetellen. */
  kiaGrondslag: number
  kia: number
  eia: number
  mia: number
  /** Aftrek per bedrijfsmiddel en regeling; de KIA naar rato verdeeld, de afrondingsrest op het laatste middel. */
  perMiddel: InvesteringsaftrekMiddel[]
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

export interface DesinvesteringResultaat {
  /** Som van de verkoopprijzen van alle in het jaar vervreemde bedrijfsmiddelen (de toets aan de drempel). */
  verkoopprijzen: number
  bijtelling: number
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

/**
 * Bedrag waarover aftrek wordt berekend: het betaalde deel zolang het bedrijfsmiddel nog niet in gebruik is.
 * Ronde 2 (A6): min de afgeboekte herinvesteringsreserve (art. 3.54; hoofdregel), tenzij `kiaOverVolBedrag`.
 */
export function investeringsbedrag(inv: InvesteringInvoer, afboekingHir = 0): number {
  return investeringsbedragMetAfboeking(inv, afboekingHir)
}

function investeringsbedragMetAfboeking(inv: InvesteringInvoer, afboekingHir: number): number {
  const bedrag = inv.inGebruik === false ? Math.max(0, inv.betaald ?? 0) : Math.max(0, inv.bedrag)
  const af = inv.herinvesteringsreserve?.kiaOverVolBedrag ? 0 : Math.max(0, afboekingHir)
  return Math.max(0, bedrag - af)
}

/** KIA volgens de bandentabel, zonder afronding. */
export function kiaUitTabel(totaal: number, kia: KiaParams): number {
  if (totaal <= kia.ondergrens) return 0
  if (totaal <= kia.pctTot) return kia.pct * totaal
  if (totaal <= kia.vastTot) return kia.vastBedrag
  if (totaal <= kia.nulBoven) return Math.max(0, kia.vastBedrag - kia.afbouwPct * (totaal - kia.vastTot))
  return 0
}

function kiaFormule(totaal: number, kia: KiaParams): string {
  if (totaal <= kia.ondergrens) return `${eur(totaal)} is niet meer dan ${eur(kia.ondergrens)}: geen KIA`
  if (totaal <= kia.pctTot) return `${pct(kia.pct)} × ${eur(totaal)}`
  if (totaal <= kia.vastTot) return `vast bedrag bij investeringen tot en met ${eur(kia.vastTot)}`
  if (totaal <= kia.nulBoven) return `${eur(kia.vastBedrag)} − ${pct(kia.afbouwPct)} × (${eur(totaal)} − ${eur(kia.vastTot)})`
  return `${eur(totaal)} is meer dan ${eur(kia.nulBoven)}: geen KIA`
}

export function berekenInvesteringsaftrek(
  investeringen: InvesteringInvoer[],
  ctx: {
    params: TaxYearParams
    prefix?: string
    /** Ronde 2 (A6): afgeboekte herinvesteringsreserve per investering (zelfde volgorde). */
    afboekingHir?: number[]
  },
): InvesteringsaftrekResultaat {
  const o = ctx.params.ondernemer.waarde
  const afboeking = new Map<InvesteringInvoer, number>(investeringen.map((inv, i) => [inv, ctx.afboekingHir?.[i] ?? 0]))
  const investeringsbedrag = (inv: InvesteringInvoer) => investeringsbedragMetAfboeking(inv, afboeking.get(inv) ?? 0)
  const status = ctx.params.ondernemer.status
  const prefix = ctx.prefix ?? 'onderneming'
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []

  // KIA: regeling 'kia' of 'eia' (EIA is cumuleerbaar met KIA, MIA niet).
  const kiaItems: InvesteringInvoer[] = []
  for (const inv of investeringen) {
    const regeling = inv.regeling ?? 'kia'
    if (regeling !== 'kia' && regeling !== 'eia') continue
    if (inv.uitgesloten) {
      waarschuwingen.push(
        waarschuwing(`${prefix}.kia.uitgesloten`, 'info', `${inv.omschrijving} telt niet mee voor de KIA: personenauto's, woningen, grond en goodwill zijn uitgesloten.`),
      )
      continue
    }
    if (inv.gekochtVanPartner) {
      waarschuwingen.push(
        waarschuwing(`${prefix}.kia.partner`, 'info', `${inv.omschrijving} telt niet mee voor de KIA: een aankoop van je fiscale partner geeft geen investeringsaftrek.`),
      )
      continue
    }
    if (inv.bedrag < o.kia.minPerBedrijfsmiddel) continue
    kiaItems.push(inv)
  }
  const kiaGrondslag = kiaItems.reduce((s, inv) => s + investeringsbedrag(inv), 0)
  const kia = AFRONDING.kia(kiaUitTabel(kiaGrondslag, o.kia))
  const perMiddel: InvesteringsaftrekMiddel[] = []
  // KIA per middel: in de percentagezone het percentage per middel, daarboven naar rato van het bedrag.
  // De som is altijd gelijk aan de KIA van de onderneming: de afrondingsrest komt op het laatste middel.
  const kiaRegels = kiaItems.filter((inv) => investeringsbedrag(inv) > 0)
  // Toegepast KIA-percentage: in de percentagezone het percentage, daarboven de KIA gedeeld door de investeringen.
  const kiaPct = kia === 0 ? 0 : kiaGrondslag <= o.kia.pctTot ? o.kia.pct : kia / kiaGrondslag
  let kiaVerdeeld = 0
  kiaRegels.forEach((inv, i) => {
    const bedrag = investeringsbedrag(inv)
    // Geen KIA (onder de ondergrens of boven de bovengrens): dan ook per middel 0, geen 28% met een negatieve rest.
    const aftrek =
      kia === 0
        ? 0
        : i === kiaRegels.length - 1
          ? kia - kiaVerdeeld
          : kiaGrondslag <= o.kia.pctTot
            ? AFRONDING.kia(o.kia.pct * bedrag)
            : AFRONDING.kia((kia * bedrag) / kiaGrondslag)
    kiaVerdeeld += aftrek
    perMiddel.push({ omschrijving: inv.omschrijving, datum: inv.datum, regeling: 'kia', bedrag: inv.bedrag, betaald: bedrag, aftrek, genotenPct: kiaPct })
  })
  for (const inv of kiaItems) {
    const bedrag = investeringsbedrag(inv)
    uitleg.push(
      regel(`${prefix}.kia.item`, inv.omschrijving, bedrag, 'info', {
        niveau: 2,
        formule:
          inv.inGebruik === false
            ? `nog niet in gebruik: alleen het betaalde deel telt (${eur(bedrag)} van ${eur(inv.bedrag)})`
            : (afboeking.get(inv) ?? 0) > 0 && !inv.herinvesteringsreserve?.kiaOverVolBedrag
              ? `investering ${datumNL(inv.datum)}: ${eur(inv.bedrag)} min afgeboekte herinvesteringsreserve ${eur(afboeking.get(inv) ?? 0)}`
              : `investering ${datumNL(inv.datum)}`,
      }),
    )
    if (inv.inGebruik === false) {
      waarschuwingen.push(
        waarschuwing(
          `${prefix}.kia.nietInGebruik`,
          'info',
          `${inv.omschrijving} is nog niet in gebruik genomen. Over het nog niet betaalde deel krijg je de KIA in het jaar van ingebruikname.`,
        ),
      )
    }
  }
  if (kiaItems.length > 0) {
    uitleg.push(
      regel(`${prefix}.kia`, 'Kleinschaligheidsinvesteringsaftrek', kia, 'min', {
        formule: kiaFormule(kiaGrondslag, o.kia),
        parameter: 'ondernemer.kia',
        status,
      }),
    )
  }
  const teKlein = investeringen.filter((inv) => (inv.regeling ?? 'kia') === 'kia' && inv.bedrag < o.kia.minPerBedrijfsmiddel)
  if (teKlein.length > 0) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.kia.minimum`,
        'info',
        `${teKlein.map((i) => i.omschrijving).join(', ')}: minder dan ${euro(o.kia.minPerBedrijfsmiddel)} per bedrijfsmiddel, dus geen KIA.`,
      ),
    )
  }

  // EIA
  let eia = 0
  for (const inv of investeringen.filter((i) => i.regeling === 'eia' && !i.uitgesloten)) {
    if (inv.bedrag < o.eia.minPerBedrijfsmiddel) {
      waarschuwingen.push(
        waarschuwing(`${prefix}.eia.minimum`, 'info', `${inv.omschrijving}: voor de EIA moet een bedrijfsmiddel minstens ${euro(o.eia.minPerBedrijfsmiddel)} kosten.`),
      )
      continue
    }
    const bedrag = investeringsbedrag(inv)
    const aftrek = AFRONDING.investeringsaftrek(o.eia.pct * bedrag)
    eia += aftrek
    perMiddel.push({ omschrijving: inv.omschrijving, datum: inv.datum, regeling: 'eia', bedrag: inv.bedrag, betaald: bedrag, aftrek, genotenPct: o.eia.pct })
    uitleg.push(
      regel(`${prefix}.eia`, `Energie-investeringsaftrek: ${inv.omschrijving}`, aftrek, 'min', {
        formule: `${pct(o.eia.pct)} × ${eur(bedrag)}`,
        parameter: 'ondernemer.eia.pct',
        status,
      }),
    )
    if (!inv.gemeld) {
      waarschuwingen.push(
        waarschuwing(
          `${prefix}.eia.melding`,
          'actie',
          `${inv.omschrijving}: de EIA geldt alleen als je de investering binnen ${o.eia.meldTermijnMaanden} maanden na de opdracht bij RVO hebt gemeld.`,
        ),
      )
    }
  }

  // MIA
  let mia = 0
  for (const inv of investeringen) {
    const m = inv.regeling?.match(/^mia-(\d)$/)
    if (!m || inv.uitgesloten) continue
    const n = Number(m[1])
    const p = o.mia.pcts[n - 1]
    if (p === undefined) continue
    if (inv.bedrag < o.mia.minPerBedrijfsmiddel) {
      waarschuwingen.push(
        waarschuwing(`${prefix}.mia.minimum`, 'info', `${inv.omschrijving}: voor de MIA moet een bedrijfsmiddel minstens ${euro(o.mia.minPerBedrijfsmiddel)} kosten.`),
      )
      continue
    }
    const bedrag = investeringsbedrag(inv)
    const aftrek = AFRONDING.investeringsaftrek(p * bedrag)
    mia += aftrek
    perMiddel.push({ omschrijving: inv.omschrijving, datum: inv.datum, regeling: `mia-${n}` as InvesteringsaftrekMiddel['regeling'], bedrag: inv.bedrag, betaald: bedrag, aftrek, genotenPct: p })
    uitleg.push(
      regel(`${prefix}.mia`, `Milieu-investeringsaftrek: ${inv.omschrijving}`, aftrek, 'min', {
        formule: `${pct(p)} × ${eur(bedrag)} (categorie ${n})`,
        parameter: 'ondernemer.mia.pcts',
        status,
      }),
    )
    if (!inv.gemeld) {
      waarschuwingen.push(
        waarschuwing(`${prefix}.mia.melding`, 'actie', `${inv.omschrijving}: de MIA geldt alleen na een tijdige melding bij RVO (binnen ${o.eia.meldTermijnMaanden} maanden).`),
      )
    }
  }

  return { kiaGrondslag, kia, eia, mia, perMiddel, uitleg, waarschuwingen }
}

/**
 * Omschrijving genormaliseerd om hetzelfde bedrijfsmiddel in twee lijsten te herkennen. Null-veilig: een dossier uit
 * de API of een oude back-up kan een regel zonder omschrijving hebben.
 */
const normOmschrijving = (x: string | null | undefined) => (typeof x === 'string' ? x : '').trim().toLowerCase().replace(/\s+/g, ' ')

export interface DesinvesteringenUitActivaResultaat {
  /** Verkopen uit het register met genoten investeringsaftrek (zonder dubbele regels uit de handmatige lijst). */
  desinvesteringen: DesinvesteringInvoer[]
  /** Verkoopprijzen van registermiddelen zonder investeringsaftrek die dit jaar zijn verkocht: alleen voor de drempel. */
  overigeVerkoopprijzen: number
  waarschuwingen: Waarschuwing[]
}

/**
 * Verkopen uit het activaregister in dit jaar. Een actief met `investeringsaftrek` wordt een desinvestering (de
 * termijn en de bijtelling toetst `berekenDesinvesteringsbijtelling`); een actief zonder telt alleen mee voor de
 * drempel van art. 3.47 lid 1 (die telt alle vervreemde goederen). Staat dezelfde verkoop ook in de handmatige lijst,
 * dan telt alleen die: herkend aan dezelfde omschrijving, of aan hetzelfde investeringsjaar plus dezelfde
 * verkoopprijs (met een melding). Elke handmatige regel hoort bij ten hoogste één actief. De genoten aftrek is het
 * genoten percentage van de aanschafwaarde: de bijtelling is nooit hoger.
 */
export function desinvesteringenUitActiva(
  activa: ActiefInvoer[],
  handmatig: DesinvesteringInvoer[],
  ctx: { jaar: number; prefix?: string },
): DesinvesteringenUitActivaResultaat {
  const prefix = ctx.prefix ?? 'onderneming'
  const desinvesteringen: DesinvesteringInvoer[] = []
  const waarschuwingen: Waarschuwing[] = []
  let overigeVerkoopprijzen = 0
  const gekoppeld = new Set<number>()
  for (const a of activa) {
    if (!a.verkocht) continue
    if (parseDatum(a.verkocht.datum).getUTCFullYear() !== ctx.jaar) continue
    const prijs = Math.max(0, a.verkocht.verkoopprijs)
    const investeringsjaar = a.investeringsaftrek?.jaar ?? parseDatum(a.aanschafdatum).getUTCFullYear()
    const naam = normOmschrijving(a.omschrijving)
    const opNaam = naam === '' ? -1 : handmatig.findIndex((d, i) => !gekoppeld.has(i) && normOmschrijving(d.omschrijving) === naam)
    const opPrijs =
      opNaam >= 0 ? -1 : handmatig.findIndex((d, i) => !gekoppeld.has(i) && d.investeringsjaar === investeringsjaar && Math.max(0, d.verkoopprijs) === prijs)
    if (opNaam >= 0) {
      gekoppeld.add(opNaam)
      waarschuwingen.push(
        waarschuwing(`${prefix}.desinvestering.dubbel`, 'info', `${a.omschrijving} staat ook bij de desinvesteringen. We tellen deze verkoop één keer, met de gegevens uit die lijst.`),
      )
      continue
    }
    if (opPrijs >= 0) {
      gekoppeld.add(opPrijs)
      const d = handmatig[opPrijs]
      const andere = normOmschrijving(d.omschrijving) === '' ? 'een regel zonder omschrijving' : d.omschrijving
      waarschuwingen.push(
        waarschuwing(
          `${prefix}.desinvestering.dubbelVermoed`,
          'let-op',
          `${naam === '' ? 'Een bedrijfsmiddel' : a.omschrijving} in het activaregister en ${andere} bij de desinvesteringen hebben hetzelfde investeringsjaar (${investeringsjaar}) en dezelfde verkoopprijs (${euro(prijs)}). We gaan ervan uit dat het dezelfde verkoop is en tellen die één keer, met de gegevens uit de desinvesteringslijst. Zijn het twee verschillende bedrijfsmiddelen, zet ze dan allebei in het activaregister.`,
        ),
      )
      continue
    }
    if (!a.investeringsaftrek) {
      overigeVerkoopprijzen += prijs
      continue
    }
    const ia = a.investeringsaftrek
    desinvesteringen.push({
      omschrijving: a.omschrijving,
      verkoopprijs: prijs,
      investeringsjaar: ia.jaar,
      genotenPct: ia.genotenPct,
      // Ronde 2 (A6): na afboeking van een herinvesteringsreserve is de aftrek over een lager bedrag genoten.
      genotenAftrek: AFRONDING.investeringsaftrek(ia.genotenPct * Math.max(0, a.investeringsaftrekGrondslag ?? a.aanschafwaarde)),
    })
  }
  return { desinvesteringen, overigeVerkoopprijzen, waarschuwingen }
}

/**
 * Desinvesteringsbijtelling (art. 3.47): verkoop binnen `desinvestering.jaren` na het begin van het investeringsjaar
 * van een bedrijfsmiddel waarover investeringsaftrek is genoten, als in het jaar voor meer dan de drempel aan goederen
 * is vervreemd.
 *
 * Lezing van lid 1: de drempel telt de verkoopprijzen van ALLE in het jaar vervreemde goederen (de wet zegt
 * "voor een bedrag van meer dan de drempel aan goederen wordt vervreemd"), ook die van buiten de termijn, zonder
 * investeringsaftrek of van buiten het register (`overigeVerkopen`). De bijtelling zelf telt alleen middelen binnen de
 * termijn met genoten aftrek: het genoten percentage van de verkoopprijs, nooit meer dan de destijds genoten aftrek
 * (het percentage van het investeringsbedrag).
 */
export function berekenDesinvesteringsbijtelling(
  desinvesteringen: DesinvesteringInvoer[],
  ctx: {
    params: TaxYearParams
    jaar: number
    prefix?: string
    /** Verkoopprijzen van andere vervreemde goederen in dit jaar (register zonder aftrek, `overigeVerkopen`): alleen voor de drempel. */
    overigeVerkopen?: number
  },
): DesinvesteringResultaat {
  const d = ctx.params.ondernemer.waarde.desinvestering
  const prefix = ctx.prefix ?? 'onderneming'
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const prijs = (x: DesinvesteringInvoer) => Math.max(0, Number.isFinite(x.verkoopprijs) ? x.verkoopprijs : 0)
  const overig = Math.max(0, ctx.overigeVerkopen ?? 0)
  const verkoopprijzen = desinvesteringen.reduce((s, x) => s + prijs(x), 0) + overig
  const binnenTermijn = desinvesteringen.filter((x) => x.genotenPct > 0 && ctx.jaar - x.investeringsjaar < d.jaren && ctx.jaar >= x.investeringsjaar)
  if (binnenTermijn.length === 0) return { verkoopprijzen, bijtelling: 0, uitleg, waarschuwingen }
  const binnen = binnenTermijn.reduce((s, x) => s + prijs(x), 0)
  const drempelFormule =
    verkoopprijzen > binnen
      ? `alle verkopen dit jaar samen ${eur(verkoopprijzen)} (waarvan ${eur(binnen)} binnen de termijn met investeringsaftrek)`
      : `verkoopprijzen ${eur(verkoopprijzen)}`
  if (verkoopprijzen <= d.drempel) {
    uitleg.push(
      regel(`${prefix}.desinvestering`, 'Desinvesteringsbijtelling', 0, 'info', {
        formule: `${drempelFormule} niet boven de drempel van ${eur(d.drempel)}`,
        parameter: 'ondernemer.desinvestering.drempel',
      }),
    )
    return { verkoopprijzen, bijtelling: 0, uitleg, waarschuwingen }
  }
  // Per bedrijfsmiddel het genoten percentage van de verkoopprijs, nooit meer dan de destijds genoten aftrek.
  const delen = binnenTermijn.map((x) => {
    const bruto = x.genotenPct * prijs(x)
    const max = x.genotenAftrek !== undefined ? Math.max(0, x.genotenAftrek) : undefined
    const bedrag = max !== undefined ? Math.min(bruto, max) : bruto
    const formule = max !== undefined && max < bruto ? `${pct(x.genotenPct)} × ${eur(x.verkoopprijs)}, maximaal de genoten aftrek ${eur(max)}` : `${pct(x.genotenPct)} × ${eur(x.verkoopprijs)}`
    return { bedrag, formule }
  })
  const bijtelling = AFRONDING.investeringsaftrek(delen.reduce((s, x) => s + x.bedrag, 0))
  uitleg.push(
    regel(`${prefix}.desinvestering`, 'Desinvesteringsbijtelling', bijtelling, 'plus', {
      formule: delen.map((x) => x.formule).join(' + '),
      parameter: 'ondernemer.desinvestering',
    }),
  )
  if (binnenTermijn.some((x) => x.genotenAftrek === undefined)) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.desinvestering.max`,
        'info',
        'De desinvesteringsbijtelling is nooit hoger dan de investeringsaftrek die je destijds over het bedrijfsmiddel hebt gekregen. Controleer dat bedrag in de aangifte van het investeringsjaar.',
      ),
    )
  }
  return { verkoopprijzen, bijtelling, uitleg, waarschuwingen }
}
