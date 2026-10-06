/**
 * Belastingrente op één aanslag, voorlopige aanslag of navorderingsaanslag (ronde 2, onderdeel A2).
 *
 * De wettekst gaat voor (AWR art. 30f tot en met 30fe, Invorderingswet 1990 art. 9). T = het belastingjaar.
 *
 * Te betalen (aanslag, navordering, voorlopige aanslag na afloop van het jaar):
 *  - alleen bij vaststelling na 30 juni T+1 (`vanafMaandDag`); begin 1 juli T+1;
 *  - einde: de dag vóór de dag waarop de aanslag invorderbaar is (dagtekening + `invorderbaarWeken` weken − 1 dag;
 *    navordering: dagtekening + `navorderingInvorderbaarMaanden` maanden − 1 dag);
 *  - conform de aangifte: einde uiterlijk `conformAangifteMaxWeken` weken na ontvangst, en geen rente als de aangifte
 *    vóór 1 mei T+1 (`geenRenteAangifteVoor`) is ontvangen;
 *  - voorlopige aanslag conform een verzoek: einde uiterlijk `conformVerzoekMaxWeken` weken na ontvangst van het
 *    verzoek, geen rente bij een verzoek vóór 1 mei T+1;
 *  - navordering op verzoek (AWR art. 30fc lid 5): einde uiterlijk `navorderingVerzoekMaxWeken` weken na ontvangst.
 * Teruggaaf (art. 30fa en 30fd): alleen conform, vastgesteld na 30 juni T+1 en meer dan `vergoedingNaWekenAangifte`
 * (verzoek: `vergoedingNaWekenVerzoek`) weken na ontvangst; van die termijn (niet vóór 1 juli T+1) tot en met 6 weken
 * na de dagtekening. Met een verrekende voorlopige aanslag volgt de rente de regels voor herziening; dat rekent de
 * module niet (reden 'herziening-niet-berekend').
 *
 * Dagtelling zoals de Belastingdienst: 30 dagen per maand, de laatste dag van een maand telt als dag 30, begin- en
 * einddag tellen allebei mee (`dagen360`). Per periode van de tabel BELASTINGRENTE_IB een eigen percentage. Betalen naar
 * beneden afgerond, ontvangen naar boven (AFRONDING.belastingrente en belastingrenteVergoeding).
 *
 * `praktijk` (alleen te betalen): de rekenwijze van de rekenvoorbeelden van de Belastingdienst, als die een ander
 * bedrag geeft. Twee verschillen: ook rente bij een dagtekening vóór 1 juli, en het einde ligt 42 dagen na de
 * dagtekening, geteld in maanden van 30 dagen (27-6 + 42 = 9-8). De grenzen van 19, 14 en 12 weken gelden ook daar.
 */
import type { BelastingrenteInvoer, BelastingrentePeriode, BelastingrenteUitkomst, Status, TaxYearParams, Uitlegregel } from '../../types'
import { STATUS_RANG } from '../../types'
import { AFRONDING } from '../../rounding'
import { isoDatum, parseDatum } from '../../datum'
import { datumNL, eur, pct, regel } from '../../uitleg'

export interface BelastingrenteContext {
  /** Parameters van het belastingjaar (overig.belastingrenteRegels en overig.invordering). */
  params: TaxYearParams
  /** Periodetabel, oplopend en aansluitend (BELASTINGRENTE_IB). */
  tabel: readonly BelastingrentePeriode[]
}

type Periode = { van: string; tot: string; dagen: number; pct: number; rente: number }

const DAG_MS = 86_400_000
/** Dagen in een week (termijnen in weken). */
export const DAGEN_PER_WEEK = 7
/** 30/360-telling: elke maand 30 dagen, het jaar 360 (rekenconventie van de Belastingdienst, geen fiscaal getal). */
const MAAND_30 = 30
const JAAR_360 = MAAND_30 * 12

const laatsteDag = (jaar: number, maand0: number): number => new Date(Date.UTC(jaar, maand0 + 1, 0)).getUTCDate()

/** Dag in de maand volgens de 30/360-telling: de laatste dag van de maand telt als 30. */
function dag30(d: Date): number {
  const dag = d.getUTCDate()
  return dag === laatsteDag(d.getUTCFullYear(), d.getUTCMonth()) ? MAAND_30 : Math.min(dag, MAAND_30)
}

/**
 * Aantal rentedagen van `van` tot en met `tot` (beide inclusief), 30 dagen per maand en 360 per jaar. 1 juli tot en met
 * 26 augustus geeft 56; 1 juli tot en met 31 december 180. 0 als `tot` vóór `van` ligt.
 */
export function dagen360(van: string, tot: string): number {
  if (tot < van) return 0
  const a = parseDatum(van)
  const b = parseDatum(tot)
  return (b.getUTCFullYear() - a.getUTCFullYear()) * JAAR_360 + (b.getUTCMonth() - a.getUTCMonth()) * MAAND_30 + (dag30(b) - dag30(a)) + 1
}

/** `n` echte dagen na `iso`. */
export function plusDagen(iso: string, n: number): string {
  return isoDatum(new Date(parseDatum(iso).getTime() + n * DAG_MS))
}

/** `n` kalendermaanden na `iso` (31 januari + 1 maand = 28 of 29 februari). */
export function plusMaanden(iso: string, n: number): string {
  const d = parseDatum(iso)
  const j = d.getUTCFullYear()
  const m = d.getUTCMonth() + n
  const dag = Math.min(d.getUTCDate(), laatsteDag(j, m))
  return isoDatum(new Date(Date.UTC(j, m, dag)))
}

/**
 * De dag `n` dagen na `iso`, geteld in maanden van 30 dagen (de rekenwijze van de voorbeelden van de Belastingdienst):
 * `dagen360(iso, uitkomst) − 1 = n`. 27 juni + 42 = 9 augustus. Valt dag 30 in februari, dan de laatste dag van februari.
 */
export function plus30(iso: string, n: number): string {
  const d = parseDatum(iso)
  let dag = dag30(d) + n
  let maand = d.getUTCMonth()
  let jaar = d.getUTCFullYear()
  while (dag > MAAND_30) {
    dag -= MAAND_30
    maand += 1
  }
  jaar += Math.floor(maand / 12)
  maand %= 12
  return isoDatum(new Date(Date.UTC(jaar, maand, Math.min(dag, laatsteDag(jaar, maand)))))
}

const minDatum = (...d: Array<string | undefined>): string => d.filter((x): x is string => !!x).sort()[0]
const maxDatum = (...d: string[]): string => [...d].sort()[d.length - 1]

const laagste = (statussen: Status[], begin: Status = 'definitief'): Status =>
  statussen.reduce((l, s) => (STATUS_RANG[s] < STATUS_RANG[l] ? s : l), begin)

/** Splitst [van, tot] over de perioden van de tabel en rekent per periode de rente (niet afgerond). */
function perPeriode(bedrag: number, van: string, tot: string, ctx: BelastingrenteContext): { perioden: Periode[]; status: Status; ontbreekt: boolean } {
  const perioden: Periode[] = []
  const statussen: Status[] = []
  const per = ctx.params.overig.waarde.belastingrenteRegels.dagenPerJaar
  let gedekt = 0
  for (const p of ctx.tabel) {
    const pv = maxDatum(van, p.vanaf)
    const pt = minDatum(tot, p.tot ?? undefined)
    if (pt < pv) continue
    const dagen = dagen360(pv, pt)
    if (dagen <= 0) continue
    gedekt += dagen
    statussen.push(p.status)
    perioden.push({ van: pv, tot: pt, dagen, pct: p.pct, rente: (Math.abs(bedrag) * p.pct * dagen) / per })
  }
  return { perioden, status: laagste(statussen), ontbreekt: gedekt < dagen360(van, tot) }
}

const centen = (x: number) => Math.round(x * 100) / 100

interface Grenzen {
  /** Begin van de rente (1 juli T+1). */
  start: string
  /** 1 mei T+1. */
  meiGrens: string
  /** Uiterste einde door een termijn na ontvangst (19, 14 of 12 weken); undefined zonder. */
  plafond?: string
  /** Geen rente omdat de aangifte of het verzoek vóór 1 mei binnen was en de aanslag conform is. */
  voorMei: boolean
}

function grenzen(invoer: BelastingrenteInvoer, params: TaxYearParams): Grenzen {
  const r = params.overig.waarde.belastingrenteRegels
  const T1 = invoer.belastingjaar + 1
  const start = `${T1}-${r.vanafMaandDag}`
  const meiGrens = `${T1}-${r.geenRenteAangifteVoor}`
  const weken = (iso: string | undefined, n: number) => (iso ? plusDagen(iso, n * DAGEN_PER_WEEK) : undefined)
  let plafond: string | undefined
  let voorMei = false
  if (invoer.soort === 'navordering') {
    // Navordering op verzoek (AWR art. 30fc lid 5).
    plafond = weken(invoer.ontvangstVerzoek, r.navorderingVerzoekMaxWeken)
  } else if (invoer.conform) {
    if (invoer.soort === 'voorlopig' && invoer.ontvangstVerzoek) {
      plafond = weken(invoer.ontvangstVerzoek, r.conformVerzoekMaxWeken)
      voorMei = invoer.ontvangstVerzoek < meiGrens
    } else if (invoer.ontvangstAangifte) {
      plafond = weken(invoer.ontvangstAangifte, r.conformAangifteMaxWeken)
      voorMei = invoer.ontvangstAangifte < meiGrens
    }
  }
  return { start, meiGrens, plafond, voorMei }
}

/** Einde van de rente volgens de wet: de dag vóór de dag waarop de aanslag invorderbaar is. */
function eindeWet(invoer: BelastingrenteInvoer, params: TaxYearParams): string {
  const inv = params.overig.waarde.invordering
  if (invoer.soort === 'navordering') return plusDagen(plusMaanden(invoer.dagtekening, inv.navorderingInvorderbaarMaanden), -1)
  return plusDagen(invoer.dagtekening, inv.invorderbaarWeken * DAGEN_PER_WEEK - 1)
}

/** Einde volgens de rekenvoorbeelden van de Belastingdienst: 6 weken (42 dagen) na de dagtekening in maanden van 30 dagen. */
function eindePraktijk(invoer: BelastingrenteInvoer, params: TaxYearParams): string {
  const inv = params.overig.waarde.invordering
  if (invoer.soort === 'navordering') return plusDagen(plusMaanden(invoer.dagtekening, inv.navorderingInvorderbaarMaanden), -1)
  return plus30(invoer.dagtekening, inv.invorderbaarWeken * DAGEN_PER_WEEK)
}

function uitlegPerioden(perioden: Periode[], bedrag: number, ctx: BelastingrenteContext, idVoorvoegsel: string): Uitlegregel[] {
  const per = ctx.params.overig.waarde.belastingrenteRegels.dagenPerJaar
  return perioden.map((p) =>
    regel(`${idVoorvoegsel}-${p.van}`, `Rente van ${datumNL(p.van)} tot en met ${datumNL(p.tot)}`, centen(p.rente), 'info', {
      niveau: 1,
      formule: `${eur(Math.abs(bedrag))} × ${pct(p.pct, 2)} × ${p.dagen} dagen / ${per}`,
      status: ctx.tabel.find((t) => t.vanaf <= p.van && (t.tot === null || t.tot >= p.van))?.status,
    }),
  )
}

/** Te betalen rente over [start, einde]; 0 met de reden als er geen periode is. */
function rekenTeBetalen(bedrag: number, start: string, einde: string, ctx: BelastingrenteContext) {
  if (einde < start) return { bedrag: 0, perioden: [] as Periode[], status: 'definitief' as Status, ontbreekt: false }
  const r = perPeriode(bedrag, start, einde, ctx)
  const totaal = r.perioden.reduce((s, p) => s + p.rente, 0)
  return { bedrag: AFRONDING.belastingrente(totaal), perioden: r.perioden.map((p) => ({ ...p, rente: centen(p.rente) })), status: r.status, ontbreekt: r.ontbreekt }
}

export function berekenBelastingrente(invoer: BelastingrenteInvoer, ctx: BelastingrenteContext): BelastingrenteUitkomst {
  const regels = ctx.params.overig.waarde.belastingrenteRegels
  const uitleg: Uitlegregel[] = []
  const g = grenzen(invoer, ctx.params)
  const leeg = (reden: BelastingrenteUitkomst['reden'], tekst: string, praktijk: BelastingrenteUitkomst['praktijk'] = null): BelastingrenteUitkomst => ({
    bedrag: 0,
    perioden: [],
    reden,
    praktijk,
    status: 'definitief',
    uitleg: [...uitleg, regel('rente-geen', tekst, 0, 'info', { niveau: 0 })],
  })

  if (invoer.bedrag === 0) return leeg('geen-bedrag', 'Geen bedrag te betalen of terug, dus geen belastingrente.')

  // ---------------------------------------------------------------------------------------------------------------
  // Teruggaaf: vergoeding van belastingrente (art. 30fa, 30fd).
  // ---------------------------------------------------------------------------------------------------------------
  if (invoer.bedrag < 0) {
    if (invoer.voorlopigeAanslagVerrekend) {
      return leeg('herziening-niet-berekend', 'De rente volgt hier de regels voor herziening van de voorlopige aanslag; die rekent de tool niet.')
    }
    if (!invoer.conform) return leeg(null, 'Een teruggaaf die afwijkt van je aangifte of verzoek geeft geen vergoeding van belastingrente.')
    if (invoer.dagtekening < g.start) return leeg('vastgesteld-voor-1-juli', `Vastgesteld vóór ${datumNL(g.start)}: geen vergoeding van belastingrente.`)
    const verzoek = invoer.soort === 'voorlopig' && !!invoer.ontvangstVerzoek
    const ontvangst = verzoek ? invoer.ontvangstVerzoek : invoer.ontvangstAangifte
    if (!ontvangst) return leeg(null, 'Zonder datum van ontvangst van de aangifte of het verzoek rekent de tool geen vergoeding.')
    const weken = verzoek ? regels.vergoedingNaWekenVerzoek : regels.vergoedingNaWekenAangifte
    const termijn = plusDagen(ontvangst, weken * DAGEN_PER_WEEK)
    if (invoer.dagtekening <= termijn) {
      return leeg('binnen-vergoedingstermijn', `Vastgesteld binnen ${weken} weken na ontvangst: geen vergoeding van belastingrente.`)
    }
    const van = maxDatum(termijn, g.start)
    const tot = plusDagen(invoer.dagtekening, ctx.params.overig.waarde.invordering.invorderbaarWeken * DAGEN_PER_WEEK)
    const r = perPeriode(invoer.bedrag, van, tot, ctx)
    const totaal = r.perioden.reduce((s, p) => s + p.rente, 0)
    const bedrag = -AFRONDING.belastingrenteVergoeding(totaal)
    uitleg.push(...uitlegPerioden(r.perioden, invoer.bedrag, ctx, 'rente'))
    uitleg.push(
      regel('rente-totaal', 'Vergoeding van belastingrente (naar boven afgerond)', bedrag, 'totaal', {
        niveau: 0,
        formule: `${datumNL(van)} tot en met ${datumNL(tot)}, ${weken} weken na ontvangst en niet vóór ${datumNL(g.start)}`,
        parameter: 'overig.belastingrenteRegels',
      }),
    )
    return { bedrag: bedrag + 0, perioden: r.perioden.map((p) => ({ ...p, rente: -centen(p.rente) })), reden: null, praktijk: null, status: r.status, uitleg }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Te betalen (art. 30f, 30fc).
  // ---------------------------------------------------------------------------------------------------------------
  const praktijk = (wetBedrag: number): BelastingrenteUitkomst['praktijk'] => {
    if (g.voorMei) return null
    const einde = minDatum(eindePraktijk(invoer, ctx.params), g.plafond)
    const p = rekenTeBetalen(invoer.bedrag, g.start, einde, ctx)
    if (p.bedrag === wetBedrag) return null
    const toelichting =
      invoer.dagtekening < g.start
        ? `De wet rekent geen rente bij een aanslag vóór ${datumNL(g.start)}; de rekenvoorbeelden van de Belastingdienst rekenen wel rente, tot en met ${datumNL(einde)}.`
        : `De rekenvoorbeelden van de Belastingdienst laten de rente lopen tot en met ${datumNL(einde)} (zes weken na de dagtekening, in maanden van 30 dagen); de wet tot de dag vóór de aanslag invorderbaar is.`
    return { bedrag: p.bedrag, perioden: p.perioden, toelichting }
  }

  if (g.voorMei) {
    const wat = invoer.soort === 'voorlopig' && invoer.ontvangstVerzoek ? 'het verzoek' : 'de aangifte'
    return leeg('geen-rente-voor-1-mei', `${wat.charAt(0).toUpperCase()}${wat.slice(1)} kwam vóór ${datumNL(g.meiGrens)} binnen en de aanslag volgt ${wat}: geen belastingrente.`)
  }
  if (invoer.dagtekening < g.start) {
    return leeg('vastgesteld-voor-1-juli', `Vastgesteld vóór ${datumNL(g.start)}: volgens de wet geen belastingrente.`, praktijk(0))
  }
  const einde = minDatum(eindeWet(invoer, ctx.params), g.plafond)
  const r = rekenTeBetalen(invoer.bedrag, g.start, einde, ctx)
  if (r.perioden.length === 0) return leeg('na-invorderbaar', 'De termijn na ontvangst was al voorbij vóór de rente zou beginnen: geen belastingrente.', praktijk(0))
  uitleg.push(...uitlegPerioden(r.perioden, invoer.bedrag, ctx, 'rente'))
  const waarom =
    g.plafond && einde === g.plafond
      ? invoer.soort === 'navordering'
        ? `${regels.navorderingVerzoekMaxWeken} weken na ontvangst van het verzoek`
        : invoer.soort === 'voorlopig' && invoer.ontvangstVerzoek
          ? `${regels.conformVerzoekMaxWeken} weken na ontvangst van het verzoek`
          : `${regels.conformAangifteMaxWeken} weken na ontvangst van de aangifte`
      : 'de dag vóór de aanslag invorderbaar is'
  uitleg.push(
    regel('rente-totaal', 'Belastingrente (naar beneden afgerond)', r.bedrag, 'totaal', {
      niveau: 0,
      formule: `${datumNL(g.start)} tot en met ${datumNL(einde)} (${waarom})`,
      parameter: 'overig.belastingrenteRegels',
    }),
  )
  if (r.ontbreekt) uitleg.push(regel('rente-tabel', 'Voor een deel van de periode staat nog geen percentage in de tabel', 0, 'info', { niveau: 2 }))
  const pr = praktijk(r.bedrag)
  if (pr) {
    uitleg.push(regel('rente-praktijk', 'Volgens de rekenvoorbeelden van de Belastingdienst', pr.bedrag, 'info', { niveau: 1, formule: pr.toelichting }))
  }
  return { bedrag: r.bedrag, perioden: r.perioden, reden: null, praktijk: pr, status: r.status, uitleg }
}

/**
 * Periode van de tabel die op `datum` geldt (percentage en status); na de tabel de laatste periode. Voor teksten over
 * de rente "nu": gebruik max(vandaag, renteVanaf), dan noemt de tekst het percentage van vandaag zodra de rente loopt
 * (en vóór die tijd dat van de startdatum).
 */
export function belastingrentePeriodeOp(tabel: readonly BelastingrentePeriode[], datum: string): BelastingrentePeriode | undefined {
  return tabel.find((t) => t.vanaf <= datum && (t.tot === null || t.tot >= datum)) ?? tabel[tabel.length - 1]
}

/**
 * Belastingrente per maand die een aanslag later komt, bij het percentage dat op `datum` geldt (30 dagen van 360).
 * Voor de regel "Per maand later" in Planning en het uitkomstpaneel. Naar beneden afgerond, zoals te betalen rente.
 */
export function rentePerMaand(bedrag: number, datum: string, ctx: BelastingrenteContext): { bedrag: number; pct: number; status: Status } {
  const per = ctx.params.overig.waarde.belastingrenteRegels.dagenPerJaar
  const p = belastingrentePeriodeOp(ctx.tabel, datum)
  if (!p || bedrag <= 0) return { bedrag: 0, pct: p?.pct ?? 0, status: p?.status ?? 'definitief' }
  return { bedrag: AFRONDING.belastingrente((bedrag * p.pct * MAAND_30) / per), pct: p.pct, status: p.status }
}

/** Datum waarop de belastingrente begint: 1 juli van het jaar na het belastingjaar (uit de params). */
export function renteVanaf(belastingjaar: number, params: TaxYearParams): string {
  return `${belastingjaar + 1}-${params.overig.waarde.belastingrenteRegels.vanafMaandDag}`
}

/** 1 mei van het jaar na het belastingjaar: aangifte of verzoek vóór deze datum en conform geeft geen rente. */
export function geenRenteVoor(belastingjaar: number, params: TaxYearParams): string {
  return `${belastingjaar + 1}-${params.overig.waarde.belastingrenteRegels.geenRenteAangifteVoor}`
}
