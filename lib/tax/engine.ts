/**
 * Orchestratie van de rekenkern: (invoer, jaar, variant) → HuishoudenResultaat.
 *
 * Volgorde (spiegelt het fiscaal rapport):
 *  per ondernemer  winst → ondernemersaftrek → MKB-vrijstelling → belastbare winst
 *  per persoon     + loon, UWV, ROW, periodieke uitkeringen − reisaftrek − inkomensvoorzieningen (persoonlijk)
 *  gezamenlijk     eigen woning, PGA, box 2, box 3 → verdeling over partners (vast of optimaal)
 *  per persoon     box 1 (schijven, premies, tariefmaatregel), verliesverrekening, box 2, box 3,
 *                  heffingskortingen (verzamelinkomen), voorheffingen, voorlopige aanslag, Zvw
 *  huishouden      toetsingsinkomen → toeslagen; marginale druk per ondernemer
 */
import type {
  EngineOpties,
  HuishoudenInvoer,
  HuishoudenResultaat,
  InkomensvoorzieningResultaat,
  OndernemersaftrekResultaat,
  OndernemingResultaat,
  PersoonId,
  PersoonInvoer,
  PersoonResultaat,
  TaxYearParams,
  Uitlegregel,
  Verdeling,
  Waarschuwing,
  Box3Resultaat,
  Box2Resultaat,
  EigenWoningResultaat,
  BronbelastingPersoon,
} from './types'
import { JAREN, getJaar, kloon } from './years'
import { lijfrenteParamsVoorJaar } from './years/lijfrente-historie'
import { parseDatum } from './datum'
import { persoonlijkeAowDatumVoor } from './years/aow'
import { AFRONDING } from './rounding'
import { regel, eur, euro, pct, waarschuwing, datumNL } from './uitleg'
import { berekenOnderneming } from './modules/onderneming'
import { berekenOndernemersaftrek, berekenMkbVrijstelling, urencriteriumVanPersoon, urencriteriumVorigJaarVanPersoon } from './modules/ondernemersaftrek'
import { verrekenVerliezen } from './modules/verlies'
import { berekenLoonEnOverig, metOverigWerkPartner, type LoonEnOverigResultaat } from './modules/loon-en-overig'
import { berekenInkomensvoorziening } from './modules/inkomensvoorziening'
import { berekenEigenWoning } from './modules/eigen-woning'
import { berekenPga, type PgaResultaat } from './modules/pga'
import { berekenBox1 } from './modules/box1'
import { berekenHeffingskortingen } from './modules/heffingskortingen'
import { berekenZvw } from './modules/zvw'
import { berekenBox2, box2BelastingRuw } from './modules/box2'
import { berekenBox3 } from './modules/box3'
import { berekenToeslagen } from './modules/toeslagen'
import { optimaliseerVerdeling } from './modules/partners'
import { berekenAanslag, aanslagUitleg } from './modules/aanslag'
import { heeftBox2Verlies, verrekenBox2Verliezen, box2Belastingkorting, type Box2Verrekening } from './modules/box2-verlies'
import { buitenBox3, metPartnerUitleg, partnerVoorPersoon, type PartnerPersoon } from './modules/partner'
import { bronbelastingPersoon } from './modules/box3/bronbelasting'
import { berekenStakingslijfrente, voegStakingslijfrenteToe } from './modules/stakingslijfrente'

/** Uitkomst per persoon vóór de verdeling van gemeenschappelijke posten. */
interface PersoonBasis {
  invoer: PersoonInvoer
  aowBereikt: boolean
  /** AOW-leeftijd wordt in de loop van het jaar bereikt (na 1 januari). */
  aowInJaar: boolean
  aowDatum: string
  geborenVoor1946: boolean
  ondernemingen: OndernemingResultaat[]
  /** Urencriterium van de persoon over al zijn ondernemingen samen; undefined zonder onderneming. */
  urencriteriumGehaald: boolean | undefined
  ondernemersaftrek: OndernemersaftrekResultaat
  winst: number
  mkb: { bedrag: number; uitleg: Uitlegregel[] }
  belastbareWinst: number
  loonEnOverig: LoonEnOverigResultaat
  arbeidsinkomen: number
  inkomensvoorziening: InkomensvoorzieningResultaat
  /** Box 1 vóór eigen woning, PGA en verliesverrekening. */
  box1Basis: number
  /** Ronde 2 (A5): beloning aan en terbeschikkingstelling door de partner (correcties, overig werk, meldingen). */
  partnerA5: PartnerPersoon
  /** Ronde 2 (A6): verlaging van het bijdrage-inkomen Zvw in het stakingsjaar en de FOR-vrijval waarop die is begrensd. */
  zvwCorrectieFor?: number
  zvwCorrectieForVrijval?: number
}

const ANDER: Record<PersoonId, PersoonId> = { A: 'B', B: 'A' }

const aandeel = (v: number, id: PersoonId) => (id === 'A' ? v : 1 - v)

function dedupe(w: Waarschuwing[]): Waarschuwing[] {
  const gezien = new Set<string>()
  return w.filter((x) => (gezien.has(x.id) ? false : (gezien.add(x.id), true)))
}

/** Parameters van een eerder jaar voor de afschrijving van activa uit dat jaar (geen variant; onbekend jaar = undefined). */
const paramsVoorJaar = (j: number): TaxYearParams | undefined => JAREN[j]

/** Ronde 2 (A5): voortwenteling per persoon en de posities die ter beschikking zijn gesteld, voor berekenBox3. */
function box3ContextA5(invoer: HuishoudenInvoer, params: TaxYearParams): { voortgewenteld: Partial<Record<PersoonId, number>>; buitenBox3: string[] } {
  return {
    voortgewenteld: Object.fromEntries(invoer.personen.map((p) => [p.id, Math.max(0, p.voortgewenteldeBronbelasting ?? 0)])),
    buitenBox3: buitenBox3(invoer, params),
  }
}

/** Ronde 2 (A5): uitleg bij de verrekening van buitenlandse bronbelasting met voortwenteling (alleen als die speelt). */
function bronbelastingUitlegA5(bron: BronbelastingPersoon, jaar: number): Uitlegregel[] {
  if (bron.voortgewenteldIn <= 0 && bron.naarVolgendJaar <= 0) return []
  return [
    ...(bron.voortgewenteldIn > 0 ? [regel('bronbelasting-voortgewenteld', 'Bronbelasting uit eerdere jaren (voortwenteling)', bron.voortgewenteldIn, 'info', { niveau: 2 })] : []),
    regel('bronbelasting-verrekend', 'Verrekende buitenlandse bronbelasting', bron.verrekend, 'info', {
      niveau: 2,
      formule: `min(${eur(bron.verrekenbaar)} dit jaar + ${eur(bron.voortgewenteldIn)} uit eerdere jaren; box 3-belasting ${eur(bron.plafond)})`,
    }),
    ...(bron.naarVolgendJaar > 0 ? [regel('bronbelasting-door', `Schuift door naar ${jaar + 1}`, bron.naarVolgendJaar, 'info', { niveau: 2 })] : []),
  ]
}

/** Ronde 2 (A5): melding als bronbelasting doorschuift naar volgend jaar. */
function bronbelastingWaarschuwingenA5(bron: BronbelastingPersoon, jaar: number): Waarschuwing[] {
  if (bron.naarVolgendJaar <= 0) return []
  return [
    waarschuwing(
      'bronbelasting-voortwenteling',
      'info',
      `${euro(bron.naarVolgendJaar)} buitenlandse bronbelasting past dit jaar niet in je box 3-belasting. Dat bedrag schuift door naar ${jaar + 1}; de Belastingdienst legt het vast in een beschikking bij de aanslag.`,
    ),
  ]
}

/** Ronde 2 (A5): opbouw van het resultaat uit overige werkzaamheden, alleen als de partnerregeling iets toevoegt. */
function overigWerkDetailA5(b: PersoonBasis): Pick<PersoonResultaat, 'overigWerkDetail'> {
  const o = b.partnerA5.overigWerk
  if (o.arbeidsbeloningPartner === 0 && !o.terbeschikkingstelling) return {}
  return { overigWerkDetail: { eigen: b.invoer.resultaatOverigWerk ?? 0, arbeidsbeloningPartner: o.arbeidsbeloningPartner, terbeschikkingstelling: o.terbeschikkingstelling } }
}
function berekenBasis(p: PersoonInvoer, params: TaxYearParams, jaar: number, huishouden?: HuishoudenInvoer): PersoonBasis {
  const overig = params.overig.waarde
  // Persoonlijke AOW-datum: de AOW-leeftijd van het jaar waarin iemand die bereikt (art. 7a AOW), niet die van dit jaar.
  const aowDatumPersoon = persoonlijkeAowDatumVoor(p.geboortedatum, jaar, overig.aowLeeftijd)
  const aowBereikt = aowDatumPersoon <= `${jaar}-01-01`
  const aowInJaar = !aowBereikt && aowDatumPersoon <= `${jaar}-12-31`
  const geborenVoor1946 = parseDatum(p.geboortedatum).getUTCFullYear() < 1946
  // Uren in loondienst gelden per persoon; neem de hoogste opgave, niet de som over ondernemingen.
  const urenLoondienst = p.ondernemingen.reduce((m, o) => Math.max(m, o.uren.loondienst ?? 0), 0)

  // Het urencriterium geldt per persoon (art. 3.6): bij meer ondernemingen toetsen we de uren samen en geven dat aan
  // elke onderneming door, ook voor de FOR-afname na twee jaar zonder urencriterium en de dotatie.
  const urencriteriumPersoon = urencriteriumVanPersoon(p.ondernemingen, { params, jaar, urenLoondienst })
  const urencriteriumVorigJaar = urencriteriumVorigJaarVanPersoon(p.ondernemingen)

  // Vrijwillige FOR-afname en omzetting hangen aan elkaar (art. 3.70 lid 1 onder a en art. 3.128 tekst 2022): de
  // omzettingspremie is ten hoogste de gewenste vrijwillige afname, en de vrijwillige afname ten hoogste de
  // lijfrentepremies die dit jaar worden afgetrokken. De lijfrenteaftrek hangt niet af van de winst van dit jaar.
  const gewensteAfname = p.ondernemingen.map((o) => (o.for ? Math.min(Math.max(0, o.for.vrijwilligeAfname ?? 0), Math.max(0, o.for.stand)) : 0))
  const inkomensvoorziening = berekenInkomensvoorziening(p.inkomensvoorziening, {
    params,
    jaar,
    geboortedatum: p.geboortedatum,
    aowDatum: aowDatumPersoon,
    premiegrondslagInkomenVorigJaar: p.inkomensvoorziening.premiegrondslagInkomenVorigJaar,
    historieParams: lijfrenteParamsVoorJaar,
    forVrijwilligeAfname: gewensteAfname.reduce((s, x) => s + x, 0),
  })
  let afnameRuimte = inkomensvoorziening.lijfrenteAftrek + inkomensvoorziening.forOmzettingAftrek
  const afnameMax = gewensteAfname.map((g) => {
    const deel = Math.min(g, afnameRuimte)
    afnameRuimte -= deel
    return deel
  })

  const partnerA5 = partnerVoorPersoon(huishouden, p, params)
  const ondernemingen = p.ondernemingen.map((o, i) =>
    berekenOnderneming(o, {
      params,
      jaar,
      aowBereikt,
      urenLoondienst,
      paramsVoorJaar,
      ...(urencriteriumPersoon !== undefined ? { urencriteriumPersoon } : {}),
      ...(urencriteriumVorigJaar !== undefined ? { urencriteriumVorigJaar } : {}),
      vrijwilligeAfnameMax: afnameMax[i],
      ...(partnerA5.correcties[i] ? { correctiePartner: partnerA5.correcties[i]!.bedrag } : {}),
      genotenStakingsaftrek: p.genotenStakingsaftrek,
    }),
  )
  const urencriteriumGehaald = ondernemingen.length > 0 ? (urencriteriumPersoon ?? ondernemingen[0].urencriteriumGehaald) : undefined
  const stakingA6 = berekenStakingslijfrente(p.inkomensvoorziening.stakingslijfrente, {
    params,
    jaar,
    aowDatum: aowDatumPersoon,
    ondernemingen,
    stakingsdatums: p.ondernemingen.map((o) => o.staking?.datum),
    historie: p.inkomensvoorziening.historie,
    forOmzettingAftrek: inkomensvoorziening.forOmzettingAftrek,
  })
  voegStakingslijfrenteToe(inkomensvoorziening, stakingA6)
  const ondernemersaftrek = berekenOndernemersaftrek(
    { ondernemingen: p.ondernemingen, resultaten: ondernemingen, nietBenut: p.nietBenutteZelfstandigenaftrek },
    { params, jaar, aowBereikt },
  )
  const winst = ondernemingen.reduce((s, o) => s + o.winst, 0)
  const mkb = p.ondernemingen.length > 0 ? berekenMkbVrijstelling(winst - ondernemersaftrek.totaal, params) : { bedrag: 0, uitleg: [] }
  const belastbareWinst = winst - ondernemersaftrek.totaal - mkb.bedrag

  const loonEnOverig = berekenLoonEnOverig(p, { params })
  Object.assign(loonEnOverig, metOverigWerkPartner(loonEnOverig, partnerA5.overigWerk))
  partnerA5.correcties.forEach((c, i) => {
    if (c && ondernemingen[i]) ondernemingen[i] = { ...ondernemingen[i], uitleg: metPartnerUitleg(ondernemingen[i].uitleg, c) }
  })
  const arbeidsinkomen = winst + loonEnOverig.arbeidsinkomenDeel

  const box1Basis =
    belastbareWinst +
    loonEnOverig.loon +
    loonEnOverig.uwv +
    loonEnOverig.overigWerk +
    loonEnOverig.periodiek -
    loonEnOverig.reisaftrek -
    inkomensvoorziening.totaal

  return {
    invoer: p,
    aowBereikt,
    aowInJaar,
    aowDatum: aowDatumPersoon,
    geborenVoor1946,
    ondernemingen,
    urencriteriumGehaald,
    ondernemersaftrek,
    winst,
    mkb,
    belastbareWinst,
    loonEnOverig,
    arbeidsinkomen,
    inkomensvoorziening,
    box1Basis,
    partnerA5,
    zvwCorrectieFor: stakingA6.zvwCorrectieFor,
    zvwCorrectieForVrijval: stakingA6.forVrijval,
  }
}

interface Gezamenlijk {
  eigenWoning: EigenWoningResultaat | null
  pga: PgaResultaat
}

interface Uitwerking {
  personen: PersoonResultaat[]
  box3: Box3Resultaat
  box2: Box2Resultaat
  kosten: number
}

/** Rekent alles per persoon uit voor één vaste verdeling. */
function werkUit(
  invoer: HuishoudenInvoer,
  params: TaxYearParams,
  basis: PersoonBasis[],
  gez: Gezamenlijk,
  v: Verdeling,
): Uitwerking {
  const jaar = invoer.jaar
  const ids = basis.map((b) => b.invoer.id)
  const partners = invoer.fiscaalPartner && basis.length === 2
  const verdeling: Verdeling = partners ? v : { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 }
  const enkelId = ids[0]
  const deelVan = (veld: keyof Verdeling, id: PersoonId) => (partners ? aandeel(verdeling[veld], id) : id === enkelId ? 1 : 0)

  const box3 = berekenBox3(invoer.box3, { params, jaar, fiscaalPartner: partners, aandeelA: partners ? verdeling.box3 : enkelId === 'A' ? 1 : 0, personen: ids, ...box3ContextA5(invoer, params) })
  const box2 = berekenBox2(invoer.box2, { params, personen: ids, aandeelA: partners ? verdeling.box2 : enkelId === 'A' ? 1 : 0, fiscaalPartner: partners })
  // Ronde 2 (A2): per persoon de verrekening; de belasting box 2 gaat over het belastbare inkomen na verrekening.
  const box2Verrekening = new Map<PersoonId, Box2Verrekening>()
  for (const b of basis) {
    const id = b.invoer.id
    const inkomen = box2.inkomen[id] ?? 0
    if (!heeftBox2Verlies(b.invoer, inkomen)) continue
    const v = verrekenBox2Verliezen(inkomen, b.invoer, { params, jaar, paramsVorigJaar: paramsVoorJaar(jaar - 1) })
    box2Verrekening.set(id, v)
    if (v.verrekend > 0) box2.belasting[id] = AFRONDING.box2Belasting(box2BelastingRuw(v.belastbaar, params).bedrag)
  }

  const ewSaldo = gez.eigenWoning?.saldo ?? 0
  const dividendbelastingBox3 = box3.dividendbelasting

  // Eerste doorgang: box 1-inkomen en verzamelinkomen per persoon (voor minstverdienende-toets).
  const tussen = basis.map((b) => {
    const id = b.invoer.id
    const ewDeel = AFRONDING.eigenWoning(ewSaldo * deelVan('eigenWoning', id))
    // Persoonsgebonden aftrek van dit jaar (verdeeld) plus het eigen niet-verrekende restant uit eerdere jaren.
    const pgaDeel = AFRONDING.eigenWoning(gez.pga.totaal * deelVan('pga', id)) + Math.max(0, b.invoer.restantPgaVorigJaar ?? 0)
    let box3Inkomen = box3.voordeel[id] ?? 0
    let box2Inkomen = box2.inkomen[id] ?? 0

    const box1VoorPga = b.box1Basis + ewDeel
    const pgaBox1 = Math.min(pgaDeel, Math.max(0, box1VoorPga))
    let rest = pgaDeel - pgaBox1
    const pgaBox3 = Math.min(rest, Math.max(0, box3Inkomen))
    rest -= pgaBox3
    const pgaBox2 = Math.min(rest, Math.max(0, box2Inkomen))
    rest -= pgaBox2
    box3Inkomen -= pgaBox3
    box2Inkomen -= pgaBox2

    const verlies = verrekenVerliezen(box1VoorPga - pgaBox1, b.invoer.verliezen ?? [], { params, jaar })
    const box1Inkomen = Math.max(0, box1VoorPga - pgaBox1 - verlies.verrekend)

    return { b, id, ewDeel, pgaDeel, pgaBox1, pgaBox3, pgaBox2, pgaRestant: rest, box3Inkomen, box2Inkomen, verlies, box1Inkomen }
  })

  const personen: PersoonResultaat[] = tussen.map((t) => {
    const { b, id } = t
    const p = b.invoer
    const tariefmaatregelAftrek =
      b.ondernemersaftrek.totaal + b.mkb.bedrag + (t.ewDeel < 0 ? -t.ewDeel : 0) + t.pgaBox1

    const box1 = berekenBox1(t.box1Inkomen, tariefmaatregelAftrek, { params, aowBereikt: b.aowBereikt, geborenVoor1946: b.geborenVoor1946 })

    const tarief3 = params.box3.waarde.tarief
    // Het plafond is de box 3-belasting vóór verrekening (bij persoonsgebonden aftrek in box 3 over het inkomen daarna).
    const box3BelastingVoorVerrekening =
      t.pgaBox3 > 0 ? AFRONDING.box3Belasting(tarief3 * t.box3Inkomen) : (box3.belasting[id] ?? 0) + (box3.bronbelasting[id] ?? 0)
    const bron: BronbelastingPersoon = bronbelastingPersoon({
      verrekenbaar: box3.bronbelastingVerrekenbaar?.[id] ?? 0,
      voortgewenteld: p.voortgewenteldeBronbelasting ?? 0,
      plafond: box3BelastingVoorVerrekening,
    })
    const box3Belasting = box3BelastingVoorVerrekening - bron.verrekend
    // PGA in box 2: opnieuw over de schijven rekenen (de aftrek valt in de hoogste schijf, niet naar rato).
    const box2Belasting = t.pgaBox2 > 0 ? AFRONDING.box2Belasting(box2BelastingRuw(t.box2Inkomen, params).bedrag) : box2.belasting[id] ?? 0

    // Art. 2.18 Wet IB 2001: het verzamelinkomen telt het inkomen uit werk en woning (na PGA, vóór verrekening van
    // verliezen uit eerdere jaren) en het inkomen uit aanmerkelijk belang, plus het belastbare inkomen box 3.
    const inkomenWerkEnWoning = Math.max(0, t.box1Inkomen + t.verlies.verrekend)
    const verzamelinkomen = inkomenWerkEnWoning + t.box2Inkomen + t.box3Inkomen

    const ander = tussen.find((x) => x.id === ANDER[id])
    // Art. 8.14a lid 1 onder c en lid 3 Wet IB 2001: het laagste arbeidsinkomen; bij een gelijk arbeidsinkomen
    // alleen de oudste partner (vroegste geboortedatum). Zelfde geboortedatum: B, zodat er nooit twee zijn.
    const isMinstverdienende =
      !partners || !ander
        ? true
        : b.arbeidsinkomen < ander.b.arbeidsinkomen ||
          (b.arbeidsinkomen === ander.b.arbeidsinkomen &&
            (p.geboortedatum < ander.b.invoer.geboortedatum || (p.geboortedatum === ander.b.invoer.geboortedatum && id === 'B')))

    const groenWaarde = invoer.box3.posities.filter((x) => x.categorie === 'groen').reduce((s, x) => s + x.waardeBegin, 0)
    const groenVrijstelling = Math.min(groenWaarde, params.box3.waarde.vrijstellingen.groen * (partners ? 2 : 1)) * deelVan('box3', id)

    const maxVerzilverbaar = box1.belasting + box1.premie + box2Belasting + box3Belasting
    const heffingskortingen = berekenHeffingskortingen({
      params,
      jaar,
      arbeidsinkomen: b.arbeidsinkomen,
      box1Inkomen: t.box1Inkomen,
      verzamelinkomen,
      geboortedatum: p.geboortedatum,
      aowBereikt: b.aowBereikt,
      heeftFiscaalPartner: partners,
      isMinstverdienende,
      kinderen: invoer.kinderen,
      groenVrijstelling,
      maxVerzilverbaar,
    })

    const box2V = box2Verrekening.get(id)
    // Met persoonsgebonden aftrek in box 2 rekent de regel hierboven opnieuw over het inkomen vóór verrekening.
    const box2BelastingNaVerlies =
      box2V && t.pgaBox2 > 0 && box2V.verrekend > 0 ? AFRONDING.box2Belasting(box2BelastingRuw(Math.max(0, t.box2Inkomen - box2V.verrekend), params).bedrag) : box2Belasting
    const voorKorting = box1.totaal + box2BelastingNaVerlies + box3Belasting - heffingskortingen.verzilverd
    const abDitJaar = (invoer.box2 ?? []).some((x) => (x.eigenaar === id || partners) && (x.dividend !== 0 || (x.vervreemdingsvoordeel ?? 0) !== 0))
    const box2K = box2V
      ? box2Belastingkorting({ box2Belastingkorting: p.box2Belastingkorting, resterend: box2V.resterend, max: Math.min(box1.belasting, Math.max(0, voorKorting)), abDitJaar }, { params, jaar })
      : null
    const box2Verlies = box2V && box2K
      ? { verliesDitJaar: box2V.verliesDitJaar, terugwenteling: box2V.terugwenteling, verrekend: box2V.verrekend, resterend: box2K.resterend, vervallen: box2V.vervallen, belastingkorting: box2K.belastingkorting }
      : null
    const verschuldigdIB = voorKorting - (box2K?.belastingkorting.ditJaar ?? 0)
    // Partners verdelen de ingehouden dividendbelasting. Zonder fiscaal partnerschap hoort die bij de eigenaar van
    // de rekening: de box 3-pot van de persoon (vermogen van kinderen zit in de pot van de eerste persoon).
    const eigenPotten = (box3.potten ?? []).filter((x) => x.personen.includes(id))
    const dividendbelastingBox3Deel =
      partners || !box3.potten
        ? AFRONDING.eigenWoning(dividendbelastingBox3 * deelVan('dividendbelasting', id))
        : AFRONDING.eigenWoning(eigenPotten.reduce((s, x) => s + x.dividendbelasting, 0))
    const dividendbelastingBox2Deel = box2.dividendbelasting[id] ?? 0
    const dividendVoorheffing = dividendbelastingBox3Deel + dividendbelastingBox2Deel
    const voorheffingen = b.loonEnOverig.loonheffing + dividendVoorheffing
    const voorlopigeAanslag = p.voorlopigeAanslagIB ?? 0
    const teBetalenIB = verschuldigdIB - voorheffingen - voorlopigeAanslag
    const aanslag = berekenAanslag(
      { verschuldigd: verschuldigdIB, voorheffingen, voorlopigeAanslagIB: p.voorlopigeAanslagIB },
      {
        params,
        aangifteGedaan: invoer.aangifteGedaan,
        fiscaalPartner: partners,
        rendementsgrondslag: (box3.potten ?? []).filter((x) => x.personen.includes(id)).reduce((s, x) => s + x.begin.rendementsgrondslag, 0),
        groeneBeleggingen: invoer.box3.posities.some((x) => x.categorie === 'groen' && x.waardeBegin > 0 && (x.eigenaar === id || partners)),
      },
    )
    const aanslagTekst = aanslagUitleg(aanslag, params)

    const zvwCorrectieFor = b.zvwCorrectieFor ?? 0
    const zvw = berekenZvw({
      params,
      bijdrageInkomen: b.belastbareWinst + b.loonEnOverig.overigWerk + b.loonEnOverig.periodiek - zvwCorrectieFor,
      loonMetIngehoudenBijdrage: b.loonEnOverig.zvwBijdrageloon,
      voorlopig: p.voorlopigeAanslagZvw ?? 0,
    })

    const uitleg: Uitlegregel[] = [
      ...b.ondernemingen.flatMap((o) => o.uitleg),
      ...(b.ondernemingen.length > 0
        ? [regel('winst-totaal', 'Winst uit onderneming', b.winst, 'subtotaal', { niveau: 0 })]
        : []),
      ...b.ondernemersaftrek.uitleg,
      ...b.mkb.uitleg,
      ...(b.ondernemingen.length > 0 ? [regel('belastbare-winst', 'Belastbare winst uit onderneming', b.belastbareWinst, 'subtotaal', { niveau: 0 })] : []),
      ...b.loonEnOverig.uitleg,
      ...b.inkomensvoorziening.uitleg,
      ...(t.ewDeel !== 0 || gez.eigenWoning
        ? [regel('eigen-woning-deel', 'Eigen woning (jouw deel)', t.ewDeel, t.ewDeel < 0 ? 'min' : 'plus', { niveau: 0, formule: `${pct(deelVan('eigenWoning', id), 0)} van saldo ${eur(ewSaldo)}` })]
        : []),
      ...(t.pgaDeel !== 0 ? [regel('pga-deel', 'Persoonsgebonden aftrek (jouw deel)', -t.pgaBox1, 'min', { niveau: 0 })] : []),
      ...t.verlies.uitleg,
      regel('box1-inkomen', 'Belastbaar inkomen uit werk en woning (box 1)', t.box1Inkomen, 'subtotaal', { niveau: 0 }),
      ...box1.uitleg,
      ...(t.box3Inkomen !== 0 || box3Belasting !== 0
        ? [
            regel('box3-inkomen', 'Belastbaar inkomen uit sparen en beleggen (box 3)', t.box3Inkomen, 'subtotaal', { niveau: 0 }),
            regel('box3-belasting', 'Belasting box 3 (na verrekening bronbelasting)', box3Belasting, 'plus', { niveau: 1, formule: `${pct(tarief3, 0)} × ${eur(t.box3Inkomen)} − bronbelasting ${eur(bron.verrekend)}`, parameter: 'box3.tarief' }),
          ]
        : []),
      ...bronbelastingUitlegA5(bron, jaar),
      ...(t.box2Inkomen !== 0
        ? [regel('box2', 'Belasting box 2 (aanmerkelijk belang)', box2Belasting, 'plus', { niveau: 0, formule: `over ${eur(t.box2Inkomen)}` })]
        : []),
      ...(box2V?.uitleg ?? []),
      ...(box2K?.uitleg ?? []),
      ...heffingskortingen.uitleg,
      regel('verschuldigd', 'Verschuldigde inkomstenbelasting en premie volksverzekeringen', verschuldigdIB, 'totaal', { niveau: 0 }),
      ...(voorheffingen !== 0 ? [regel('voorheffingen', 'Voorheffingen (loonheffing, dividendbelasting)', -voorheffingen, 'min', { niveau: 1 })] : []),
      ...(voorlopigeAanslag !== 0 ? [regel('voorlopige-aanslag', 'Betaald via voorlopige aanslag', -voorlopigeAanslag, 'min', { niveau: 1 })] : []),
      regel('te-betalen-ib', teBetalenIB >= 0 ? 'Te betalen inkomstenbelasting' : 'Terug te ontvangen inkomstenbelasting', teBetalenIB, 'totaal', { niveau: 0 }),
      ...aanslagTekst.uitleg,
      ...zvw.uitleg,
      ...(zvwCorrectieFor > 0
        ? [
            regel('zvw-correctie-for', 'Aftrekbare lijfrentepremies voor ondernemers vanwege een afname van de oudedagsreserve bij staking', -zvwCorrectieFor, 'info', {
              niveau: 1,
              formule: `min(stakingslijfrente ${eur(b.inkomensvoorziening.stakingslijfrente?.aftrek ?? 0)} + omzetting ${eur(b.inkomensvoorziening.forOmzettingAftrek)}, vrijval oudedagsreserve ${eur(b.zvwCorrectieForVrijval ?? 0)}); al van het inkomen voor de Zvw-bijdrage af`,
            }),
          ]
        : []),
    ]

    const waarschuwingen = dedupe([
      ...(b.aowInJaar
        ? [
            waarschuwing(
              'aow-in-jaar',
              'let-op',
              `Je bereikt op ${datumNL(b.aowDatum)} de AOW-leeftijd. De Belastingdienst rekent dan per maand: na die datum geen AOW-premie en lagere heffingskortingen. Deze berekening rekent het hele jaar zonder AOW-tarief: de AOW-premie en de heffingskortingen zijn daardoor te hoog. Zie de uitkomst als benadering.`,
            ),
          ]
        : []),
      ...b.ondernemingen.flatMap((o) => o.waarschuwingen),
      ...(t.pgaRestant > 0
        ? [
            waarschuwing(
              'pga-restant',
              'info',
              `${euro(t.pgaRestant)} persoonsgebonden aftrek past dit jaar niet in je inkomen (box 1, 3 en 2). Dat restant schuift door naar volgend jaar.`,
            ),
          ]
        : []),
      ...b.ondernemersaftrek.waarschuwingen,
      ...b.loonEnOverig.waarschuwingen,
      ...b.inkomensvoorziening.waarschuwingen,
      ...t.verlies.waarschuwingen,
      ...box1.waarschuwingen,
      ...heffingskortingen.waarschuwingen,
      ...zvw.waarschuwingen,
      ...aanslagTekst.waarschuwingen,
      ...(box2V?.waarschuwingen ?? []),
      ...(box2K?.waarschuwingen ?? []),
      ...b.partnerA5.waarschuwingen,
      ...bronbelastingWaarschuwingenA5(bron, jaar),
    ])

    return {
      id,
      ondernemingen: b.ondernemingen,
      ...(b.urencriteriumGehaald !== undefined ? { urencriteriumGehaald: b.urencriteriumGehaald } : {}),
      ondernemersaftrek: b.ondernemersaftrek,
      winstUitOnderneming: b.winst,
      mkbVrijstelling: b.mkb.bedrag,
      belastbareWinst: b.belastbareWinst,
      verliesverrekening: t.verlies.verrekend,
      verliezenResterend: t.verlies.resterend,
      verliesDitJaar: t.verlies.nieuwVerlies,
      loon: b.loonEnOverig.loon + b.loonEnOverig.uwv,
      overigWerk: b.loonEnOverig.overigWerk,
      periodiekeUitkeringen: b.loonEnOverig.periodiek,
      reisaftrek: b.loonEnOverig.reisaftrek,
      arbeidsinkomen: b.arbeidsinkomen,
      inkomensvoorziening: b.inkomensvoorziening,
      eigenWoning: t.ewDeel,
      pga: t.pgaBox1 + t.pgaBox3 + t.pgaBox2,
      box1,
      box2Inkomen: t.box2Inkomen,
      box2Belasting,
      box3Inkomen: t.box3Inkomen,
      box3Belasting,
      verzamelinkomen,
      heffingskortingen,
      voorheffingen,
      verschuldigdIB,
      voorlopigeAanslag,
      teBetalenIB,
      zvw,
      drempelinkomenBox1: b.box1Basis + t.ewDeel,
      drempelinkomenBox2: box2.inkomen[id] ?? 0,
      drempelinkomenBox3: box3.voordeel[id] ?? 0,
      pgaToerekening: {
        toegerekend: t.pgaDeel,
        restantVorigJaar: Math.max(0, b.invoer.restantPgaVorigJaar ?? 0),
        box1: t.pgaBox1,
        box3: t.pgaBox3,
        box2: t.pgaBox2,
        restant: t.pgaRestant,
      },
      box3BelastingVoorVerrekening,
      box3Bronbelasting: box3BelastingVoorVerrekening - box3Belasting,
      voorheffingenDetail: { loonheffing: b.loonEnOverig.loonheffing, dividendbelastingBox3: dividendbelastingBox3Deel, dividendbelastingBox2: dividendbelastingBox2Deel },
      aanslag,
      ...(box2Verlies ? { box2Verlies } : {}),
      ...(box2BelastingNaVerlies !== box2Belasting ? { box2Belasting: box2BelastingNaVerlies } : {}),
      ...(bron.verrekenbaar + bron.voortgewenteldIn > 0 ? { bronbelasting: bron } : {}),
      ...overigWerkDetailA5(b),
      ...(zvwCorrectieFor > 0 ? { zvwCorrectieFor } : {}),
      uitleg,
      waarschuwingen,
    }
  })

  const kosten = personen.reduce((s, p) => s + p.verschuldigdIB + p.zvw.bijdrage, 0)
  return { personen, box3, box2, kosten }
}

function toetsingsinkomenVan(invoer: HuishoudenInvoer, personen: PersoonResultaat[]): number {
  if (invoer.fiscaalPartner) return personen.reduce((s, p) => s + p.verzamelinkomen, 0)
  return personen[0]?.verzamelinkomen ?? 0
}

export function berekenHuishouden(invoer: HuishoudenInvoer, opties: EngineOpties = {}): HuishoudenResultaat {
  const variant = opties.variant ?? invoer.variant
  const params = opties.params ?? getJaar(invoer.jaar, variant)
  const jaar = invoer.jaar
  if (invoer.personen.length < 1 || invoer.personen.length > 2) throw new Error('Een huishouden heeft één of twee personen.')

  const basis = invoer.personen.map((p) => berekenBasis(p, params, jaar, invoer))

  const partners = invoer.fiscaalPartner && basis.length === 2
  const eigenWoning = invoer.eigenWoning ? berekenEigenWoning(invoer.eigenWoning, { params, jaar }) : null
  // Drempelinkomen (art. 6.2 Wet IB 2001) = verzamelinkomen vóór persoonsgebonden aftrek: box 1 + box 2 + box 3.
  // Het totaal van box 2 en box 3 hangt niet af van de verdeling; reken het hier met alles bij de eerste persoon.
  const ids = basis.map((b) => b.invoer.id)
  const aandeelVooraf = partners || ids[0] === 'A' ? 1 : 0
  const box3Vooraf = berekenBox3(invoer.box3, { params, jaar, fiscaalPartner: partners, aandeelA: aandeelVooraf, personen: ids, ...box3ContextA5(invoer, params) })
  const box2Vooraf = berekenBox2(invoer.box2, { params, personen: ids, aandeelA: aandeelVooraf, fiscaalPartner: partners })
  const box23Vooraf = ids.reduce((s, id) => s + Math.max(0, box3Vooraf.voordeel[id] ?? 0) + (box2Vooraf.inkomen[id] ?? 0), 0)
  const gezamenlijkDrempelinkomen = basis.reduce((s, b) => s + b.box1Basis, 0) + (eigenWoning?.saldo ?? 0) + box23Vooraf
  const pga = berekenPga(invoer.pga, {
    params,
    gezamenlijkDrempelinkomen,
    aowBereikt: basis.some((b) => b.aowBereikt),
    partneralimentatie: invoer.personen.reduce((s, p) => s + (p.partneralimentatie ?? 0), 0),
    fiscaalPartner: partners,
  })
  const gez: Gezamenlijk = { eigenWoning, pga }

  let verdeling: Verdeling
  let verdelingOptimaal = false
  if (invoer.verdeling === 'optimaal' && partners) {
    const toeslagKosten = (u: Uitwerking) => {
      const t = berekenToeslagen(invoer.kinderen, {
        params,
        jaar,
        toetsingsinkomen: toetsingsinkomenVan(invoer, u.personen),
        vermogenToets: u.box3.vermogenToeslagen,
        partner: partners,
      })
      return -t.totaal
    }
    const start: Verdeling = { eigenWoning: 0.5, pga: 0.5, box3: 0.5, box2: 0.5, dividendbelasting: 0.5 }
    const dimensies: Array<keyof Verdeling> = []
    if (eigenWoning && eigenWoning.saldo !== 0) dimensies.push('eigenWoning')
    if (invoer.box3.posities.length > 0) dimensies.push('box3')
    if (pga.totaal > 0) dimensies.push('pga')
    if ((invoer.box2 ?? []).length > 0) dimensies.push('box2')
    const r = optimaliseerVerdeling((v) => {
      const u = werkUit(invoer, params, basis, gez, v)
      return u.kosten + toeslagKosten(u)
    }, start, { dimensies })
    verdeling = { ...r.verdeling, dividendbelasting: r.verdeling.box3 }
    verdelingOptimaal = true
  } else if (invoer.verdeling === 'optimaal') {
    verdeling = { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 }
  } else {
    verdeling = invoer.verdeling
  }

  const u = werkUit(invoer, params, basis, gez, verdeling)

  const toeslagen = berekenToeslagen(invoer.kinderen, {
    params,
    jaar,
    toetsingsinkomen: toetsingsinkomenVan(invoer, u.personen),
    vermogenToets: u.box3.vermogenToeslagen,
    partner: partners,
    opgegevenToetsingsinkomen: invoer.opgegevenToetsingsinkomen,
  })

  // Marginale druk per persoon met een onderneming: effect van € 1.000 extra winst.
  if (!opties.zonderMarginaleDruk) {
    for (const p of u.personen) {
      const pi = invoer.personen.find((x) => x.id === p.id)
      if (!pi || pi.ondernemingen.length === 0) continue
      const metExtra = (bedrag: number) => {
        const extra = kloon(invoer)
        const doel = extra.personen.find((x) => x.id === p.id)!.ondernemingen[0]
        if (doel.winstberekening.soort === 'saldo') doel.winstberekening.saldo += bedrag
        else doel.winstberekening.omzet += bedrag
        extra.verdeling = verdeling
        return berekenHuishouden(extra, { ...opties, params, zonderMarginaleDruk: true })
      }
      const kostenVan = (r: { personen: PersoonResultaat[]; toeslagen: { totaal: number } }) =>
        r.personen.reduce((s, x) => s + x.verschuldigdIB + x.zvw.bijdrage, 0) - r.toeslagen.totaal
      const kosten1 = kostenVan({ personen: u.personen, toeslagen })
      const r2 = metExtra(1000)
      p.marginaleDruk = (kostenVan(r2) - kosten1) / 1000
      // Toeslagtabellen (kinderopvangtoeslag) werken met inkomensrijen: één stap van € 1.000 kan over een
      // rijgrens vallen en dan een sprong geven. Noem in dat geval ook het gemiddelde over € 5.000.
      if (Math.abs(r2.toeslagen.totaal - toeslagen.totaal) >= 1) {
        const r5 = metExtra(5000)
        const gemiddeld = (kostenVan(r5) - kosten1) / 5000
        p.waarschuwingen.push({
          id: 'marginale-druk-toeslagstap',
          ernst: 'info',
          tekst: `De volgende € 1.000 winst valt over een grens in de toeslagtabel: daardoor is de marginale druk voor die stap ${pct(p.marginaleDruk, 1)}. Gemiddeld over de volgende € 5.000 is het ${pct(gemiddeld, 1)}.`,
        })
      }
    }
  }

  const omzet = invoer.personen
    .flatMap((p) => p.ondernemingen)
    .reduce((s, o) => s + (o.winstberekening.soort === 'uitgesplitst' ? o.winstberekening.omzet : 0), 0)
  const verschuldigdIB = u.personen.reduce((s, p) => s + p.verschuldigdIB, 0)
  const verschuldigdZvw = u.personen.reduce((s, p) => s + p.zvw.bijdrage, 0)

  const uitleg: Uitlegregel[] = [
    ...(eigenWoning ? eigenWoning.uitleg : []),
    ...pga.uitleg,
    ...u.box3.uitleg,
    ...u.box2.uitleg,
    ...(partners
      ? [
          regel('verdeling', verdelingOptimaal ? 'Verdeling gemeenschappelijke posten (geoptimaliseerd)' : 'Verdeling gemeenschappelijke posten', 0, 'info', {
            niveau: 0,
            formule: `eigen woning ${pct(verdeling.eigenWoning, 0)} / box 3 ${pct(verdeling.box3, 0)} / PGA ${pct(verdeling.pga, 0)} bij partner A`,
          }),
        ]
      : []),
    ...toeslagen.uitleg,
  ]

  return {
    jaar,
    variant: variant ?? null,
    paramsStatus: params.status,
    personen: u.personen,
    verdeling,
    verdelingOptimaal,
    eigenWoning,
    box3: u.box3,
    box2: u.box2,
    pga: { giften: pga.giften, zorgkosten: pga.zorgkosten, scholing: pga.scholing, alimentatie: pga.alimentatie, totaal: pga.totaal },
    toeslagen,
    totaal: {
      teBetalenIB: u.personen.reduce((s, p) => s + p.teBetalenIB, 0),
      teBetalenZvw: u.personen.reduce((s, p) => s + p.zvw.teBetalen, 0),
      verschuldigdIB,
      verschuldigdZvw,
      toeslagen: toeslagen.totaal,
      drukOpOmzet: omzet > 0 ? (verschuldigdIB + verschuldigdZvw) / omzet : null,
      teBetalenIBNaGrenzen: u.personen.reduce((s, p) => s + (p.aanslag ? p.aanslag.teBetalen - p.aanslag.terug : p.teBetalenIB), 0),
    },
    uitleg,
    waarschuwingen: dedupe([
      ...(eigenWoning?.waarschuwingen ?? []),
      ...pga.waarschuwingen,
      ...u.box3.waarschuwingen,
      ...u.box2.waarschuwingen,
      ...toeslagen.waarschuwingen,
    ]),
  }
}
