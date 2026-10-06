/**
 * Box 3 overbruggingsstelsel (forfaitair rendement per categorie), aangiftemethode.
 *
 * Rekenwijze (plan hoofdstuk 2.1 en 5):
 *  - forfaitair rendement per aangifterubriek (Box3Categorie), elke regel apart afgerond:
 *    bezittingen AFRONDING.box3Bezitting, schulden AFRONDING.box3Schuld, schuldendrempel AFRONDING.box3Drempel;
 *  - bank = bankNL + bankBuitenland (+ contant boven de vrijstelling), overig = beleggingen + crypto +
 *    vorderingen + onroerend + overig (+ groen boven de vrijstelling, + nettolijfrente als die niet is vrijgesteld);
 *  - aftrekbare schulden = schulden − schuldendrempel × (partners ? 2 : 1);
 *  - rendementsgrondslag = bezittingen − aftrekbare schulden;
 *  - grondslag = max(0, rendementsgrondslag − heffingsvrij vermogen × personen);
 *  - effectiefPct = AFRONDING.box3EffectiefPct(rendement / rendementsgrondslag) (afgekapt op 2 decimalen);
 *  - voordeel per persoon = AFRONDING.box3Voordeel(grondslagDeel × effectiefPct), grondslagDeel volgens aandeelA
 *    in hele euro's (verdeelGrondslag: A afgerond, B = grondslag − A);
 *  - belasting per persoon = AFRONDING.box3Belasting(tarief × voordeel) − verrekenbare bronbelasting (per land tot het
 *    verdragstarief en hooguit bronbelastingMaxPct, plus wat uit eerdere jaren is voortgewenteld; modules/box3/bronbelasting.ts).
 *
 * Vermogen op naam van een kind ('kind:*') telt mee bij de ouders (art. 2.15 Wet IB 2001) en in de
 * vermogenstoets van de toeslagen.
 *
 * Voorbeeld 2024 (lib/voorbeeld, partners, aandeelA = 1): 732 + 141 + 4.517 + 129 − 627 + 193 = 5.085; rendementsgrondslag
 * 121.050; grondslag 7.050; effectief 4,20%; voordeel 296; belasting 106, na verrekening van de bronbelasting 43.
 *
 * Dit bestand bevat ook de gedeelde hulpfuncties van de box 3-modules.
 */
import type { Box3Categorie, Box3Invoer, Box3Resultaat, Box3SchijfRegel, BronbelastingLand, BronbelastingRegelUitkomst, PersoonId, TaxYearParams, Uitlegregel, VermogensPositie, Waarschuwing, Eigenaar } from '../../types'
import { AFRONDING, box3Aandeel } from '../../rounding'
import { eur, euro, pct, regel, waarschuwing, datumNL } from '../../uitleg'
import { isoDatum, parseDatum } from '../../datum'
import { bronbelastingRegels } from './bronbelasting-invoer'
import { bronbelastingPerLand, fondsZonderInhouding, verrekenbaarPerRegel } from './bronbelasting'

export interface Box3Context {
  params: TaxYearParams
  jaar: number
  fiscaalPartner: boolean
  /** Aandeel van persoon A in de grondslag (0..1); alleen bij fiscale partners. */
  aandeelA: number
  personen: PersoonId[]
  /**
   * Ronde 2 (A5). Buitenlandse bronbelasting uit eerdere jaren per persoon (`PersoonInvoer.voortgewenteldeBronbelasting`);
   * telt mee als beschikbaar voor verrekening met de box 3-belasting van die persoon (art. 25a Bvdb).
   */
  voortgewenteld?: Partial<Record<PersoonId, number>>
  /** Ronde 2 (A5). Posities die ter beschikking zijn gesteld aan de onderneming van de partner (art. 3.91): niet in box 3. */
  buitenBox3?: string[]
  /** Ronde 2 (A5). Landentabel voor de bronbelasting; standaard die uit years/data (tests geven hun eigen tabel mee). */
  bronbelastingTabel?: readonly BronbelastingLand[]
}

/**
 * Box3Resultaat plus wat de engine verder nodig heeft. Additief: past overal waar een Box3Resultaat wordt verwacht.
 */
export interface Box3ResultaatUitgebreid extends Box3Resultaat {
  /** Vrijgestelde groene beleggingen per persoon (grondslag heffingskorting groen beleggen). */
  groenVrijgesteld: Record<PersoonId, number>
  /** Voordeel per persoon vóór een eventuele keuze voor het werkelijk rendement. */
  voordeelForfaitair: Record<PersoonId, number>
  /** Rendement per regel (alleen forfaitair stelsel), voor de uitleg en de accountantscheck. */
  rendementRegels: Array<{ categorie: Box3Categorie | 'schulden' | 'schuldendrempel'; grondslag: number; pct: number; bedrag: number }>
  /** Schijvenstelsel: voordeel per schijf per persoon (voor het fiscaal rapport). */
  voordeelPerSchijf?: Partial<Record<PersoonId, Box3SchijfRegel[]>>
  /**
   * Ronde 2 (A5). Verrekenbare buitenlandse bronbelasting van dit jaar per persoon, na verdeling volgens de grondslag en
   * vóór het plafond (zonder voortwenteling). De engine rekent hiermee de verrekening per persoon (BronbelastingPersoon).
   */
  bronbelastingVerrekenbaar?: Record<PersoonId, number>
}

export const leegPP = (): Record<PersoonId, number> => ({ A: 0, B: 0 })

export const isPartnerPot = (ctx: Box3Context): boolean => ctx.fiscaalPartner && ctx.personen.includes('A') && ctx.personen.includes('B')

export const aantalPersonen = (ctx: Box3Context): number => (isPartnerPot(ctx) ? 2 : 1)

/** Hoort een positie in de pot die hier wordt berekend? Partners: alles. Alleenstaand: eigen posities en die van kinderen. */
export function inPot(eigenaar: Eigenaar, ctx: Box3Context): boolean {
  if (isPartnerPot(ctx)) return true
  if (eigenaar.startsWith('kind:')) return true
  return ctx.personen.includes(eigenaar as PersoonId)
}

/** Verdeelt een totaal over de personen: partners volgens aandeelA, anders alles naar de eerste persoon. */
export function verdeel(totaal: number, ctx: Box3Context): Record<PersoonId, number> {
  const uit = leegPP()
  if (isPartnerPot(ctx)) {
    const aandeel = Math.min(1, Math.max(0, ctx.aandeelA))
    uit.A = totaal * aandeel
    uit.B = totaal - uit.A
  } else if (ctx.personen.length > 0) {
    uit[ctx.personen[0]] = totaal
  }
  return uit
}

/**
 * Verdeelt de grondslag in hele euro's, zoals in de aangifte: bij partners krijgt A het afgeronde deel en B de
 * rest (grondslag − A), zodat de delen altijd optellen tot de grondslag en beide partners hetzelfde getal zien.
 * Zonder partner gaat alles naar de eerste persoon.
 */
export function verdeelGrondslag(grondslag: number, ctx: Box3Context): Record<PersoonId, number> {
  const deel = verdeel(grondslag, ctx)
  if (!isPartnerPot(ctx)) return deel
  // Hele euro's, ook als de waarden centen hebben (via de API): eerst het totaal naar beneden (ten gunste van
  // de belastingplichtige, zoals bezittingen), dan A afgerond en B het restant, zodat de delen optellen.
  const totaal = AFRONDING.box3Bezitting(grondslag)
  const A = Math.min(AFRONDING.verdeling(deel.A), totaal)
  return { A, B: totaal - A }
}

const BANK: Box3Categorie[] = ['bankNL', 'bankBuitenland', 'contant']
export const CATEGORIE_VOLGORDE: Box3Categorie[] = ['bankNL', 'bankBuitenland', 'contant', 'groen', 'beleggingen', 'crypto', 'vorderingen', 'onroerend', 'overig', 'nettolijfrente']

export const CATEGORIE_LABEL: Record<Box3Categorie, string> = {
  bankNL: 'Bank- en spaartegoeden in Nederland',
  bankBuitenland: 'Bank- en spaartegoeden in het buitenland',
  contant: 'Contant geld boven de vrijstelling',
  groen: 'Groene beleggingen boven de vrijstelling',
  beleggingen: 'Aandelen, obligaties en fondsen',
  crypto: 'Cryptovaluta',
  vorderingen: 'Uitgeleend geld en andere vorderingen',
  onroerend: 'Onroerende zaken',
  overig: 'Overige bezittingen',
  nettolijfrente: 'Nettolijfrente en nettopensioen (niet vrijgesteld)',
}

export interface VermogenOverzicht {
  /** Belastbare waarde per categorie op de peildatum (na vrijstellingen). */
  perCategorie: Record<Box3Categorie, number>
  bezittingen: number
  schulden: number
  schuldendrempel: number
  aftrekbareSchulden: number
  rendementsgrondslag: number
  groenTotaal: number
  groenVrijgesteld: number
  contantVrijgesteld: number
  nettolijfrenteVrijgesteld: number
  kindVermogen: number
  posities: VermogensPositie[]
  dividendbelasting: number
}

/** Telt de posities in de pot op per categorie, past de vrijstellingen en de schuldendrempel toe. */
export function verzamelVermogen(invoer: Box3Invoer, ctx: Box3Context): VermogenOverzicht {
  const b = ctx.params.box3.waarde
  const n = aantalPersonen(ctx)
  const posities = invoer.posities.filter((x) => inPot(x.eigenaar, ctx))
  const schuldPosities = invoer.schulden.filter((x) => inPot(x.eigenaar, ctx))

  const ruw = Object.fromEntries(CATEGORIE_VOLGORDE.map((c) => [c, 0])) as Record<Box3Categorie, number>
  let kindVermogen = 0
  let dividendbelasting = 0
  for (const x of posities) {
    ruw[x.categorie] += Math.max(0, x.waardeBegin)
    if (x.eigenaar.startsWith('kind:')) kindVermogen += x.waardeBegin
    dividendbelasting += Math.max(0, x.dividendbelasting ?? 0)
  }

  const perCategorie = { ...ruw }
  const contantVrijgesteld = Math.min(ruw.contant, b.vrijstellingen.contant * n)
  perCategorie.contant = ruw.contant - contantVrijgesteld
  const groenVrijgesteld = Math.min(ruw.groen, b.vrijstellingen.groen * n)
  perCategorie.groen = ruw.groen - groenVrijgesteld
  const nettolijfrenteVrijgesteld = b.vrijstellingen.nettolijfrente ? ruw.nettolijfrente : 0
  perCategorie.nettolijfrente = ruw.nettolijfrente - nettolijfrenteVrijgesteld

  const bezittingen = CATEGORIE_VOLGORDE.reduce((s, c) => s + perCategorie[c], 0)
  const schulden = schuldPosities.reduce((s, x) => s + Math.max(0, x.waardeBegin), 0)
  const schuldendrempel = b.schuldendrempel * n
  const aftrekbareSchulden = Math.max(0, schulden - schuldendrempel)
  const rendementsgrondslag = bezittingen - aftrekbareSchulden

  return {
    perCategorie,
    bezittingen,
    schulden,
    schuldendrempel,
    aftrekbareSchulden,
    rendementsgrondslag,
    groenTotaal: ruw.groen,
    groenVrijgesteld,
    contantVrijgesteld,
    nettolijfrenteVrijgesteld,
    kindVermogen,
    posities,
    dividendbelasting,
  }
}

/** Uitlegregels voor het vermogen (bezittingen, vrijstellingen, schulden, drempel, rendementsgrondslag). */
export function uitlegVermogen(v: VermogenOverzicht, ctx: Box3Context): Uitlegregel[] {
  const b = ctx.params.box3.waarde
  const n = aantalPersonen(ctx)
  const uit: Uitlegregel[] = []
  for (const c of CATEGORIE_VOLGORDE) {
    if (v.perCategorie[c] > 0) uit.push(regel(`box3-waarde-${c}`, CATEGORIE_LABEL[c], v.perCategorie[c], 'plus', { niveau: 2 }))
  }
  if (v.contantVrijgesteld > 0) {
    uit.push(
      regel('box3-vrij-contant', 'Vrijgesteld contant geld', v.contantVrijgesteld, 'info', {
        niveau: 2,
        formule: `maximaal ${eur(b.vrijstellingen.contant)} × ${n}`,
        parameter: 'box3.vrijstellingen.contant',
      }),
    )
  }
  if (v.groenVrijgesteld > 0) {
    uit.push(
      regel('box3-vrij-groen', 'Vrijgestelde groene beleggingen', v.groenVrijgesteld, 'info', {
        niveau: 2,
        formule: `maximaal ${eur(b.vrijstellingen.groen)} × ${n}`,
        parameter: 'box3.vrijstellingen.groen',
      }),
    )
  }
  if (v.nettolijfrenteVrijgesteld > 0) {
    uit.push(regel('box3-vrij-nettolijfrente', 'Vrijgestelde nettolijfrente', v.nettolijfrenteVrijgesteld, 'info', { niveau: 2, parameter: 'box3.vrijstellingen.nettolijfrente' }))
  }
  if (v.kindVermogen > 0) {
    uit.push(regel('box3-kind', 'Vermogen op naam van een minderjarig kind (telt mee bij de ouders)', v.kindVermogen, 'info', { niveau: 2 }))
  }
  uit.push(regel('box3-bezittingen', 'Waarde van de bezittingen', v.bezittingen, 'subtotaal', { niveau: 1 }))
  if (v.schulden > 0) {
    uit.push(regel('box3-schulden', 'Schulden', v.schulden, 'info', { niveau: 2 }))
    uit.push(
      regel('box3-drempel', 'Drempel voor schulden', Math.min(v.schulden, v.schuldendrempel), 'info', {
        niveau: 2,
        formule: `${eur(b.schuldendrempel)} × ${n}`,
        parameter: 'box3.schuldendrempel',
      }),
    )
    uit.push(regel('box3-aftrekbare-schulden', 'Aftrekbare schulden', v.aftrekbareSchulden, 'min', { niveau: 1, formule: `max(0, ${eur(v.schulden)} − ${eur(v.schuldendrempel)})` }))
  }
  uit.push(regel('box3-rendementsgrondslag', 'Rendementsgrondslag', v.rendementsgrondslag, 'subtotaal', { niveau: 0 }))
  return uit
}

export interface BelastingPerPersoon {
  /** Box 3-belasting na verrekening van buitenlandse bronbelasting. */
  belasting: Record<PersoonId, number>
  /** Box 3-belasting vóór verrekening. */
  bruto: Record<PersoonId, number>
  /** Verrekende bronbelasting per persoon (dit jaar plus voortgewenteld, tot het plafond). */
  bronbelasting: Record<PersoonId, number>
  /** Ronde 2 (A5). Verrekenbaar van dit jaar per persoon, na verdeling (zonder voortwenteling). */
  verrekenbaar: Record<PersoonId, number>
  /** Ronde 2 (A5). Uitkomst per regel; leeg zonder bronbelasting. */
  regels: BronbelastingRegelUitkomst[]
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

/** De uitkomstvelden van de bronbelasting voor een Box3Resultaat (alleen als er regels zijn, zodat er niets bijkomt). */
export function bronbelastingVelden(bel: Pick<BelastingPerPersoon, 'regels' | 'verrekenbaar'>): Pick<Box3ResultaatUitgebreid, 'bronbelastingRegels' | 'bronbelastingPerLand' | 'bronbelastingVerrekenbaar'> {
  if (bel.regels.length === 0) return { bronbelastingVerrekenbaar: bel.verrekenbaar }
  return { bronbelastingRegels: bel.regels, bronbelastingPerLand: bronbelastingPerLand(bel.regels), bronbelastingVerrekenbaar: bel.verrekenbaar }
}

/**
 * Belasting per persoon over het voordeel, minus verrekenbare buitenlandse bronbelasting (ronde 2: per land).
 * Per regel (bronbelastingRegels, ook het oude veld): min(ingehouden, verdragstarief × bruto, bronbelastingMaxPct × bruto),
 * naar beneden afgerond; een land buiten de tabel tot bronbelastingMaxPct; zonder bruto inkomsten het hele bedrag
 * (zoals ronde 1). De pot gaat volgens dezelfde verdeling als de grondslag; per persoon komt de voortgewentelde
 * bronbelasting erbij en is de verrekening begrensd op diens box 3-belasting (art. 25 lid 4 en 25a Bvdb). Wat niet
 * past, schuift door (BronbelastingPersoon in de engine).
 */
export function belastingPerPersoon(voordeel: Record<PersoonId, number>, posities: VermogensPositie[], ctx: Box3Context, tarief: number): BelastingPerPersoon {
  const b = ctx.params.box3.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const bruto = leegPP()
  const belasting = leegPP()
  const bronbelasting = leegPP()

  const tabel = ctx.bronbelastingTabel
  const regels = posities.flatMap((x) =>
    bronbelastingRegels(x)
      .filter((r) => (r.bedrag ?? 0) > 0 || (r.brutoInkomsten ?? 0) > 0)
      .map((r) => verrekenbaarPerRegel(r, x, { params: ctx.params, jaar: ctx.jaar, ...(tabel ? { tabel } : {}) })),
  )
  const ingehouden = regels.reduce((s, r) => s + r.ingehouden, 0)
  const pot = regels.reduce((s, r) => s + r.verrekenbaar, 0)
  const potVerdeeld = verdeel(pot, ctx)
  if (isPartnerPot(ctx)) {
    potVerdeeld.A = AFRONDING.bronbelasting(potVerdeeld.A)
    potVerdeeld.B = pot - potVerdeeld.A
  }

  for (const id of ctx.personen) {
    bruto[id] = AFRONDING.box3Belasting(tarief * Math.max(0, voordeel[id]))
    const voortgewenteld = Math.max(0, ctx.voortgewenteld?.[id] ?? 0)
    bronbelasting[id] = Math.min(potVerdeeld[id] + voortgewenteld, bruto[id])
    belasting[id] = bruto[id] - bronbelasting[id]
    if (bruto[id] > 0 || voordeel[id] !== 0) {
      uitleg.push(
        regel(`box3-belasting-${id}`, `Belasting box 3 partner ${id}`, bruto[id], 'plus', {
          formule: `${pct(tarief, 0)} × ${eur(voordeel[id])}`,
          parameter: 'box3.tarief',
        }),
      )
    }
    if (bronbelasting[id] > 0) {
      uitleg.push(
        regel(`box3-bronbelasting-${id}`, `Verrekening buitenlandse bronbelasting partner ${id}`, bronbelasting[id], 'min', {
          formule: `min(verrekenbaar ${eur(potVerdeeld[id])}${voortgewenteld > 0 ? ` + uit eerdere jaren ${eur(voortgewenteld)}` : ''}; box 3-belasting ${eur(bruto[id])})`,
          parameter: 'box3.bronbelastingMaxPct',
        }),
      )
    }
  }

  // Per regel de limieten in de formule: min(ingehouden; verdragstarief × bruto; 15% × bruto).
  for (const r of regels) {
    if (r.ingehouden <= 0) continue
    const naam = r.landNaam ?? (r.land || 'land onbekend')
    const limieten =
      r.zonderBruto
        ? `${eur(r.ingehouden)} ingehouden, zonder bruto inkomsten`
        : r.tariefBron === 'geen-verdrag'
          ? 'geen verdrag dat verrekening toestaat'
          : `min(${eur(r.ingehouden)} ingehouden; ${r.verdragstarief === null ? 'verdragstarief onbekend' : `${pct(r.verdragstarief)} × ${eur(r.bruto)} verdrag`}; ${pct(b.bronbelastingMaxPct, 0)} × ${eur(r.bruto)})`
    uitleg.push(
      regel(`box3-bronbelasting-regel-${r.positieId}-${r.regelId}`, `Verrekenbare bronbelasting ${naam} (${r.soort})`, r.verrekenbaar, 'info', {
        niveau: 2,
        formule: limieten,
        parameter: 'box3.bronbelastingMaxPct',
        ...(r.landStatus && r.landStatus !== 'definitief' ? { status: r.landStatus } : {}),
      }),
    )
  }

  if (ingehouden > pot + 0.5) {
    // Eén percentage als alle regels met hetzelfde tarief rekenen; anders het verdragstarief in het algemeen.
    const pcts = [...new Set(regels.filter((r) => r.ingehouden > 0 && !r.zonderBruto).map((r) => (r.verdragstarief === null ? b.bronbelastingMaxPct : Math.min(r.verdragstarief, b.bronbelastingMaxPct))))]
    const grens = pcts.length === 1 ? pct(pcts[0], 2) : `het verdragstarief (hooguit ${pct(b.bronbelastingMaxPct, 0)})`
    waarschuwingen.push(
      waarschuwing(
        'box3-bronbelasting-max',
        'let-op',
        `Er is ${euro(ingehouden)} aan buitenlandse bronbelasting ingehouden, maar verrekenbaar is maximaal ${grens} van de bruto-inkomsten (${euro(pot)}). Het meerdere kun je soms terugvragen in het bronland.`,
      ),
    )
  }
  if (regels.some((r) => r.zonderBruto)) {
    waarschuwingen.push(
      waarschuwing('box3-bronbelasting-bruto', 'info', 'Bij een deel van de bronbelasting ontbreken de bruto-inkomsten. Dat deel is volledig meegenomen; controleer of het binnen het verdragspercentage valt.'),
    )
  }
  if (regels.some((r) => fondsZonderInhouding(r, tabel))) {
    waarschuwingen.push(
      waarschuwing(
        'box3-bronbelasting-fonds',
        'info',
        'Bronbelasting binnen het fonds kun je niet verrekenen. Een Iers of Luxemburgs fonds houdt op zijn eigen uitkering meestal niets in; wat het fonds zelf aan bronbelasting betaalt, telt niet mee.',
      ),
    )
  }

  return { belasting, bruto, bronbelasting, verrekenbaar: potVerdeeld, regels, uitleg, waarschuwingen }
}

/** Waarschuwingen voor peildatumarbitrage en DAC8. */
export function controleWaarschuwingen(posities: VermogensPositie[], ctx: Box3Context): Waarschuwing[] {
  const b = ctx.params.box3.waarde
  const uit: Waarschuwing[] = []
  const maanden = b.arbitrageMaanden
  for (const x of posities) {
    if (!x.categoriewisselDatum) continue
    const d = parseDatum(x.categoriewisselDatum).getTime()
    for (const peiljaar of [ctx.jaar, ctx.jaar + 1]) {
      const laag = Date.UTC(peiljaar, -maanden, 1)
      const hoog = Date.UTC(peiljaar, maanden, 1)
      if (d >= laag && d < hoog) {
        uit.push(
          waarschuwing(
            `box3-arbitrage-${x.id}`,
            'let-op',
            `${x.omschrijving}: de categorie wisselde op ${datumNL(x.categoriewisselDatum)}, binnen ${maanden} maanden rond de peildatum ${datumNL(isoDatum(new Date(Date.UTC(peiljaar, 0, 1))))}. Zonder zakelijke reden negeert de Belastingdienst die omzetting (peildatumarbitrage) en geldt het hoge forfait.`,
          ),
        )
        break
      }
    }
  }
  if (b.dac8Rapportage && posities.some((x) => x.categorie === 'crypto')) {
    uit.push(
      waarschuwing('box3-dac8', 'info', 'Cryptoplatforms geven saldi en transacties door aan de Belastingdienst (DAC8). Gebruik voor de peildatum de koers van het platform waar je de crypto aanhoudt.'),
    )
  }
  return uit
}

export interface ForfaitairDetail extends Box3ResultaatUitgebreid {
  vermogen: VermogenOverzicht
}

/** Forfaitair rendement en belasting volgens de aangiftemethode (zonder tegenbewijs). */
export function berekenForfaitair(invoer: Box3Invoer, ctx: Box3Context): ForfaitairDetail {
  const b = ctx.params.box3.waarde
  const n = aantalPersonen(ctx)
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []

  const v = verzamelVermogen(invoer, ctx)
  uitleg.push(...uitlegVermogen(v, ctx))

  // Rendement per regel.
  const rendementRegels: ForfaitairDetail['rendementRegels'] = []
  for (const c of CATEGORIE_VOLGORDE) {
    const waarde = v.perCategorie[c]
    if (waarde <= 0) continue
    const p = BANK.includes(c) ? b.forfaitBank : b.forfaitOverig
    rendementRegels.push({ categorie: c, grondslag: waarde, pct: p, bedrag: AFRONDING.box3Bezitting(waarde * p) })
  }
  if (v.schulden > v.schuldendrempel) {
    rendementRegels.push({ categorie: 'schulden', grondslag: v.schulden, pct: b.forfaitSchulden, bedrag: -AFRONDING.box3Schuld(v.schulden * b.forfaitSchulden) })
    rendementRegels.push({ categorie: 'schuldendrempel', grondslag: v.schuldendrempel, pct: b.forfaitSchulden, bedrag: AFRONDING.box3Drempel(v.schuldendrempel * b.forfaitSchulden) })
  }
  for (const r of rendementRegels) {
    const label = r.categorie === 'schulden' ? 'Rendement op schulden' : r.categorie === 'schuldendrempel' ? 'Correctie voor de schuldendrempel' : `Rendement ${CATEGORIE_LABEL[r.categorie].toLowerCase()}`
    const parameter = r.categorie === 'schulden' || r.categorie === 'schuldendrempel' ? 'box3.forfaitSchulden' : BANK.includes(r.categorie) ? 'box3.forfaitBank' : 'box3.forfaitOverig'
    uitleg.push(
      regel(`box3-rendement-${r.categorie}`, label, r.bedrag, r.bedrag < 0 ? 'min' : 'plus', {
        niveau: 2,
        formule: `${pct(r.pct)} × ${eur(r.grondslag)}`,
        parameter,
        status: ctx.params.box3.veldStatus?.[parameter.replace('box3.', '') as keyof typeof b] ?? undefined,
      }),
    )
  }
  const rendement = rendementRegels.reduce((s, r) => s + r.bedrag, 0)
  uitleg.push(regel('box3-rendement', 'Forfaitair rendement over de rendementsgrondslag', rendement, 'subtotaal', { niveau: 1 }))

  const heffingsvrij = b.heffingsvrijVermogen * n
  const grondslag = Math.max(0, v.rendementsgrondslag - heffingsvrij)
  uitleg.push(
    regel('box3-heffingsvrij', 'Heffingsvrij vermogen', Math.min(heffingsvrij, Math.max(0, v.rendementsgrondslag)), 'min', {
      formule: `${eur(b.heffingsvrijVermogen)} × ${n}`,
      parameter: 'box3.heffingsvrijVermogen',
    }),
  )
  uitleg.push(regel('box3-grondslag', 'Grondslag sparen en beleggen', grondslag, 'subtotaal', { niveau: 0 }))

  const effectiefPct = v.rendementsgrondslag > 0 ? Math.max(0, AFRONDING.box3EffectiefPct(rendement / v.rendementsgrondslag)) : 0
  uitleg.push(
    regel('box3-effectief', 'Effectief rendementspercentage', 0, 'info', {
      niveau: 2,
      formule: `${eur(rendement)} / ${eur(v.rendementsgrondslag)} = ${pct(effectiefPct)} (afgekapt op twee decimalen)`,
    }),
  )

  const grondslagDeel = verdeelGrondslag(grondslag, ctx)
  const voordeel = leegPP()
  for (const id of ctx.personen) {
    voordeel[id] = AFRONDING.box3Voordeel(grondslagDeel[id] * effectiefPct)
    if (grondslag > 0) {
      uitleg.push(
        regel(`box3-voordeel-${id}`, `Voordeel uit sparen en beleggen partner ${id}`, voordeel[id], 'subtotaal', {
          formule: `${eur(grondslagDeel[id])} × ${pct(effectiefPct)}`,
        }),
      )
    }
  }
  // Ter controle: de webuitleg van de Belastingdienst rekent met het aandeel van de grondslag.
  if (grondslag > 0) {
    const web = box3Aandeel(rendement, grondslag, v.rendementsgrondslag)
    const totaal = voordeel.A + voordeel.B
    if (web !== totaal) {
      uitleg.push(
        regel('box3-webmethode', 'Voordeel volgens de rekenwijze op de website van de Belastingdienst', web, 'info', {
          niveau: 2,
          formule: `${eur(rendement)} × (${eur(grondslag)} / ${eur(v.rendementsgrondslag)}); verschil met de aangifte ${eur(web - totaal)}`,
        }),
      )
    }
  }

  const bel = belastingPerPersoon(voordeel, v.posities, ctx, b.tarief)
  uitleg.push(...bel.uitleg)
  waarschuwingen.push(...bel.waarschuwingen, ...controleWaarschuwingen(v.posities, ctx))

  return {
    bezittingen: v.bezittingen,
    aftrekbareSchulden: v.aftrekbareSchulden,
    rendementsgrondslag: v.rendementsgrondslag,
    grondslag,
    forfaitairRendement: rendement,
    effectiefPct,
    werkelijkRendement: null,
    gekozen: 'forfaitair',
    voordeel,
    belasting: bel.belasting,
    bronbelasting: bel.bronbelasting,
    ...bronbelastingVelden(bel),
    dividendbelasting: v.dividendbelasting,
    vermogenToeslagen: v.rendementsgrondslag,
    groenVrijgesteld: verdeel(v.groenVrijgesteld, ctx),
    voordeelForfaitair: { ...voordeel },
    rendementRegels,
    vermogen: v,
    uitleg,
    waarschuwingen,
  }
}
