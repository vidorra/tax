/**
 * Indicatieve vergelijking eenmanszaak tegenover BV voor één persoon.
 *
 * Eenmanszaak: belasting = (IB + Zvw van het huishouden) − (IB + Zvw zonder deze onderneming);
 *              netto = winst vóór ondernemersaftrek − belasting.
 * BV:          de onderneming verdwijnt uit de IB-invoer en de persoon krijgt dga-loon
 *              (LoonInvoer); box 1 = extra IB door dat loon; Zvw = ingehouden bijdrage
 *              (pctOndernemer) over het loon tot het maximum;
 *              Vpb laag/hoog over (winst − dga-loon − kosten BV);
 *              dividend in box 2 (partners samen tweemaal de eerste schijf), dividendbelasting
 *              als voorheffing; netto privé = loon − box 1 − Zvw + dividend − box 2.
 * Verschil:    (netto BV + ingehouden winst − latente box 2 daarover + box 3-besparing) − netto eenmanszaak.
 *              Positief = BV voordeliger. Toeslagen tellen niet mee in het verschil.
 * Overstap:    stakingswinst, FOR-vrijval en stakingsaftrek bij een ruisende inbreng.
 *
 * De engine wordt geïnjecteerd (`bereken`); params komen uit opties.params of getJaar.
 */
import type { BerekenHuishouden, EngineOpties, HuishoudenInvoer, PersoonId, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { regel, waarschuwing, eur, euro, pct } from '../../uitleg'
import { getJaar, kloon } from '../../years'
import { rondPlanning } from './prognose'

export interface RechtsvormUitkomst {
  eenmanszaak: { belasting: number; netto: number }
  bv: { vpb: number; box1: number; box2: number; zvw: number; kosten: number; netto: number }
  verschil: number
  overstap: { stakingswinst: number; stakingsaftrek: number; forVrijval: number }
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

/** Box 2-heffing over een bedrag, met een (eventueel verdubbelde) eerste schijf. */
export function box2Heffing(bedrag: number, params: TaxYearParams, partners: boolean): number {
  const b2 = params.box2.waarde
  const factor = partners && b2.grensPerPersoon ? 2 : 1
  let rest = Math.max(0, bedrag)
  let vorige = 0
  let heffing = 0
  for (const s of b2.schijven) {
    const grens = s.tot === null ? Infinity : s.tot * factor
    const deel = Math.min(rest, grens - vorige)
    if (deel <= 0) break
    heffing += deel * s.tarief
    rest -= deel
    vorige = grens
  }
  return AFRONDING.box2Belasting(heffing)
}

/** Vpb over een grondslag (laag tarief tot de grens, hoog daarboven). */
export function vpbHeffing(grondslag: number, params: TaxYearParams): number {
  const v = params.overig.waarde.vpb
  const g = Math.max(0, grondslag)
  // AFRONDING kent geen aparte Vpb-regel; naar beneden zoals de box 1-schijven.
  return AFRONDING.schijf(v.laag * Math.min(g, v.grens) + v.hoog * Math.max(0, g - v.grens))
}

const kosten = (r: { totaal: { verschuldigdIB: number; verschuldigdZvw: number } }) => r.totaal.verschuldigdIB + r.totaal.verschuldigdZvw

export function vergelijkRechtsvorm(
  input: {
    invoer: HuishoudenInvoer
    persoon: PersoonId
    dgaLoon: number
    kostenBV: number
    opgepotVermogen?: number
    /** Verwacht rendement (fractie) op het opgepotte vermogen in de BV; standaard het box 3-forfait overige bezittingen. */
    verwachtRendement?: number
    dividendUitkering: number
  },
  bereken: BerekenHuishouden,
  opties: EngineOpties = {},
): RechtsvormUitkomst {
  const { invoer, persoon } = input
  const params = opties.params ?? getJaar(invoer.jaar, opties.variant ?? invoer.variant)
  const o: EngineOpties = { zonderMarginaleDruk: true, ...opties }
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const partners = invoer.fiscaalPartner && invoer.personen.length === 2

  const pInvoer = invoer.personen.find((p) => p.id === persoon)
  const leeg: RechtsvormUitkomst = {
    eenmanszaak: { belasting: 0, netto: 0 },
    bv: { vpb: 0, box1: 0, box2: 0, zvw: 0, kosten: 0, netto: 0 },
    verschil: 0,
    overstap: { stakingswinst: 0, stakingsaftrek: 0, forVrijval: 0 },
    uitleg,
    waarschuwingen,
  }
  if (!pInvoer || pInvoer.ondernemingen.length === 0) {
    waarschuwingen.push(waarschuwing('rechtsvorm-geen-onderneming', 'actie', `Persoon ${persoon} heeft geen onderneming; een vergelijking met een BV is dan niet zinvol.`))
    return leeg
  }

  // 1. Eenmanszaak
  const rBasis = bereken(invoer, o)
  const pRes = rBasis.personen.find((p) => p.id === persoon)
  const winst = pRes ? pRes.ondernemingen.reduce((s, x) => s + x.winst, 0) : 0

  const nulInvoer = kloon(invoer)
  nulInvoer.personen.find((p) => p.id === persoon)!.ondernemingen = []
  const rNul = bereken(nulInvoer, o)

  const belastingEmz = kosten(rBasis) - kosten(rNul)
  const nettoEmz = winst - belastingEmz

  // 2. BV
  const bvInvoer = kloon(invoer)
  const bvPersoon = bvInvoer.personen.find((p) => p.id === persoon)!
  bvPersoon.ondernemingen = []
  bvPersoon.loon = [...bvPersoon.loon, { omschrijving: 'Loon als dga (scenario)', soort: 'loon', bruto: input.dgaLoon, ingehoudenLoonheffing: 0, zvwBijdrageloon: input.dgaLoon }]
  const rBv = bereken(bvInvoer, o)

  const zvwP = params.zvw.waarde
  const box1 = rBv.totaal.verschuldigdIB - rNul.totaal.verschuldigdIB
  const zvwDga = AFRONDING.zvw(zvwP.pctOndernemer * Math.min(input.dgaLoon, zvwP.maxBijdrageInkomen))
  const zvw = zvwDga + (rBv.totaal.verschuldigdZvw - rNul.totaal.verschuldigdZvw)

  const vpbGrondslag = winst - input.dgaLoon - input.kostenBV
  const vpb = vpbHeffing(vpbGrondslag, params)
  const winstNaVpb = Math.max(0, vpbGrondslag) - vpb

  const dividend = Math.max(0, input.dividendUitkering)
  const box2 = box2Heffing(dividend, params, partners)
  const dividendbelasting = AFRONDING.box2Belasting(dividend * params.box2.waarde.dividendbelasting)
  const nettoBv = input.dgaLoon - box1 - zvw + dividend - box2

  const ingehouden = winstNaVpb - dividend
  const latenteBox2 = ingehouden > 0 ? box2Heffing(dividend + ingehouden, params, partners) - box2 : 0

  // Box 3-besparing van vermogen dat in de BV blijft in plaats van privé.
  const b3 = params.box3.waarde
  const opgepot = Math.max(0, input.opgepotVermogen ?? 0)
  const rendement = input.verwachtRendement ?? b3.forfaitOverig
  const box3Prive = rondPlanning(opgepot * b3.forfaitOverig * b3.tarief)
  const vpbMarginaal = vpbGrondslag >= params.overig.waarde.vpb.grens ? params.overig.waarde.vpb.hoog : params.overig.waarde.vpb.laag
  const vpbRendement = rondPlanning(opgepot * rendement * vpbMarginaal)
  const box3Besparing = box3Prive - vpbRendement

  const verschil = nettoBv + ingehouden - latenteBox2 + box3Besparing - nettoEmz

  // 3. Overstap
  const stakingswinst = pInvoer.ondernemingen.reduce((s, x) => s + (x.staking?.stakingswinst ?? 0), 0)
  const forVrijval = pInvoer.ondernemingen.reduce((s, x) => s + (x.for?.stand ?? 0), 0)
  const eerderGebruikt = pInvoer.ondernemingen.some((x) => x.staking?.stakingsaftrekEerderGebruikt)
  const stakingsaftrek = eerderGebruikt ? 0 : Math.min(params.ondernemer.waarde.stakingsaftrek, Math.max(0, stakingswinst + forVrijval))
  const schijven = params.box1.waarde.schijven
  const toptarief = schijven[schijven.length - 1].tarief
  const overstapBelasting = rondPlanning(Math.max(0, stakingswinst + forVrijval - stakingsaftrek) * toptarief)

  // Uitleg
  uitleg.push(
    regel('rechtsvorm.winst', `Winst onderneming persoon ${persoon} (vóór ondernemersaftrek)`, winst, 'info', { niveau: 0 }),
    regel('rechtsvorm.emz', 'Eenmanszaak: inkomstenbelasting en Zvw over de winst', belastingEmz, 'min', {
      niveau: 1,
      formule: `${eur(kosten(rBasis))} − ${eur(kosten(rNul))} (huishouden met en zonder deze winst)`,
    }),
    regel('rechtsvorm.emz.netto', 'Eenmanszaak: netto', nettoEmz, 'subtotaal', { niveau: 1, formule: `${eur(winst)} − ${eur(belastingEmz)}` }),
    regel('rechtsvorm.bv.loon', 'BV: loon als dga', input.dgaLoon, 'plus', {
      niveau: 1,
      formule: `normbedrag gebruikelijk loon ${eur(params.box2.waarde.gebruikelijkLoonNorm)}`,
      parameter: 'box2.gebruikelijkLoonNorm',
    }),
    regel('rechtsvorm.bv.box1', 'BV: inkomstenbelasting over het loon', box1, 'min', { niveau: 2, formule: `${eur(rBv.totaal.verschuldigdIB)} − ${eur(rNul.totaal.verschuldigdIB)}` }),
    regel('rechtsvorm.bv.zvw', 'BV: Zvw-bijdrage ingehouden op het loon', zvw, 'min', {
      niveau: 2,
      formule: `${pct(zvwP.pctOndernemer)} × ${eur(Math.min(input.dgaLoon, zvwP.maxBijdrageInkomen))}`,
      parameter: 'zvw.pctOndernemer',
    }),
    regel('rechtsvorm.bv.kosten', 'BV: extra kosten (administratie, jaarrekening)', input.kostenBV, 'min', { niveau: 2 }),
    regel('rechtsvorm.bv.vpb', 'BV: vennootschapsbelasting', vpb, 'min', {
      niveau: 2,
      formule: `${pct(params.overig.waarde.vpb.laag)} tot ${eur(params.overig.waarde.vpb.grens)}, ${pct(params.overig.waarde.vpb.hoog)} daarboven, over ${eur(Math.max(0, vpbGrondslag))}`,
      parameter: 'overig.vpb',
    }),
    regel('rechtsvorm.bv.dividend', 'BV: dividenduitkering', dividend, 'plus', { niveau: 2 }),
    regel('rechtsvorm.bv.box2', 'BV: box 2 over het dividend', box2, 'min', {
      niveau: 2,
      formule: `waarvan ${eur(dividendbelasting)} dividendbelasting als voorheffing (${pct(params.box2.waarde.dividendbelasting, 0)}), ${eur(box2 - dividendbelasting)} in de aangifte`,
      parameter: 'box2.schijven',
    }),
    regel('rechtsvorm.bv.netto', 'BV: netto privé', nettoBv, 'subtotaal', {
      niveau: 1,
      formule: `${eur(input.dgaLoon)} − ${eur(box1)} − ${eur(zvw)} + ${eur(dividend)} − ${eur(box2)}`,
    }),
  )
  if (partners && params.box2.waarde.grensPerPersoon) {
    const s1 = params.box2.waarde.schijven[0]
    if (s1.tot !== null) {
      uitleg.push(
        regel('rechtsvorm.bv.box2-partners', 'Box 2: samen met je partner geldt het lage tarief tweemaal', s1.tot * 2, 'info', {
          niveau: 2,
          formule: `${pct(s1.tarief)} tot 2 × ${eur(s1.tot)}`,
          parameter: 'box2.schijven[0].tot',
        }),
      )
    }
  }
  if (ingehouden !== 0) {
    uitleg.push(
      regel('rechtsvorm.bv.ingehouden', ingehouden > 0 ? 'BV: winst die in de BV blijft' : 'BV: dividend boven de winst van dit jaar', ingehouden, 'info', {
        niveau: 1,
        formule: `${eur(winstNaVpb)} − ${eur(dividend)}${ingehouden > 0 ? `; bij latere uitkering circa ${eur(latenteBox2)} box 2` : ''}`,
      }),
    )
  }
  if (opgepot > 0) {
    uitleg.push(
      regel('rechtsvorm.box3', 'Box 3-besparing van vermogen in de BV', box3Besparing, box3Besparing >= 0 ? 'plus' : 'min', {
        niveau: 1,
        formule: `box 3 privé ${eur(box3Prive)} (${pct(b3.forfaitOverig)} × ${pct(b3.tarief, 0)} × ${eur(opgepot)}) − Vpb over het rendement ${eur(vpbRendement)}`,
        parameter: 'box3.forfaitOverig',
      }),
    )
  }
  uitleg.push(
    regel('rechtsvorm.verschil', verschil >= 0 ? 'BV voordeliger dan eenmanszaak (indicatief)' : 'Eenmanszaak voordeliger dan BV (indicatief)', verschil, 'totaal', {
      niveau: 0,
      formule: `netto BV ${eur(nettoBv)} + in de BV ${eur(ingehouden)} − latente box 2 ${eur(latenteBox2)} + box 3 ${eur(box3Besparing)} − netto eenmanszaak ${eur(nettoEmz)}`,
    }),
    regel('rechtsvorm.overstap', 'Overstap: belasting over stakingswinst en FOR bij een ruisende inbreng (indicatief)', overstapBelasting, 'info', {
      niveau: 1,
      formule: `(${eur(stakingswinst)} + FOR ${eur(forVrijval)} − stakingsaftrek ${eur(stakingsaftrek)}) × ${pct(toptarief, 1)}`,
      parameter: 'ondernemer.stakingsaftrek',
    }),
  )
  const toeslagVerschil = rBv.totaal.toeslagen - rBasis.totaal.toeslagen
  if (toeslagVerschil !== 0) {
    uitleg.push(
      regel('rechtsvorm.toeslagen', 'Verschil in toeslagen door het lagere box 1-inkomen (zonder dividend)', toeslagVerschil, 'info', {
        niveau: 2,
        formule: 'niet in het verschil opgenomen: dividend telt ook mee in het toetsingsinkomen',
      }),
    )
  }

  // Waarschuwingen
  if (input.dgaLoon < params.box2.waarde.gebruikelijkLoonNorm) {
    waarschuwingen.push(
      waarschuwing(
        'rechtsvorm-gebruikelijk-loon',
        'actie',
        `Het dga-loon van ${euro(input.dgaLoon)} ligt onder het normbedrag van ${euro(params.box2.waarde.gebruikelijkLoonNorm)}. De Belastingdienst gaat uit van ten minste dat bedrag, en kan een hoger, marktconform loon eisen.`,
      ),
    )
  } else {
    waarschuwingen.push(
      waarschuwing('rechtsvorm-marktconform', 'let-op', `Het normbedrag van ${euro(params.box2.waarde.gebruikelijkLoonNorm)} is een ondergrens. De Belastingdienst kan een hoger, marktconform loon eisen als vergelijkbare werknemers meer verdienen.`),
    )
  }
  if (vpbGrondslag < 0) {
    waarschuwingen.push(waarschuwing('rechtsvorm-bv-verlies', 'let-op', `Loon en kosten zijn hoger dan de winst; de BV maakt dan ${euro(-vpbGrondslag)} verlies.`))
  }
  if (ingehouden < 0) {
    waarschuwingen.push(waarschuwing('rechtsvorm-dividend-te-hoog', 'let-op', `Het dividend is ${euro(-ingehouden)} hoger dan de winst na Vpb van dit jaar. Dat kan alleen uit eerder opgebouwde reserves.`))
  }
  if (forVrijval > 0) {
    waarschuwingen.push(
      waarschuwing('rechtsvorm-for', 'info', `Bij de overstap valt de fiscale oudedagsreserve van ${euro(forVrijval)} vrij, tenzij je die omzet in een lijfrente of de onderneming geruisloos inbrengt.`),
    )
  }
  waarschuwingen.push(
    waarschuwing(
      'rechtsvorm-indicatief',
      'info',
      'Indicatieve berekening, geen advies. In een BV vervallen zelfstandigenaftrek, MKB-winstvrijstelling en de lijfrente-jaarruimte over winst; daar staan Vpb, gebruikelijk loon, box 2 en de kosten van de BV tegenover. Een geruisloze inbreng stelt de belasting over stakingswinst en FOR uit. Bespreek de overstap met uw adviseur.',
    ),
  )

  return {
    eenmanszaak: { belasting: belastingEmz, netto: nettoEmz },
    bv: { vpb, box1, box2, zvw, kosten: input.kostenBV, netto: nettoBv },
    verschil,
    overstap: { stakingswinst, stakingsaftrek, forVrijval },
    uitleg,
    waarschuwingen,
  }
}
