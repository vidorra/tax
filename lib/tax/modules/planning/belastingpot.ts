/**
 * Belastingpot: hoeveel moet er opzij voor de aanslag IB en Zvw?
 *
 *  doel        = verschuldigd IB + Zvw − al betaalde voorlopige aanslagen (nooit onder nul)
 *  doelNu      = doel × maandenVerstreken / 12
 *  achterstand = max(0, doelNu − saldo pot)
 *  perMaand    = (doel − saldo pot) / resterende maanden
 *  renteRisico = belastingrente per persoon en per heffing (IB en Zvw) over wat er nog bij moet, per periode uit de
 *                tabel BELASTINGRENTE_IB (belastingrente.ts): met een verwachte aanslagdatum tot de dag vóór de aanslag
 *                invorderbaar is (de aanslag gerekend als afwijkend van de aangifte, dus zonder de grens van 19 weken);
 *                zonder datum de rente per jaar dat de aanslag na 1 juli van het jaar erna komt (loopt de rente al
 *                op `vandaag`, dan tegen het percentage van vandaag; ook de tekst noemt dan het percentage van nu).
 *
 * Ronde 2 (A2): de rente komt niet meer uit het oude compatibiliteitsveld in `overig` (één percentage per belastingjaar) maar uit de
 * periodetabel, per persoon en per heffing (besluit F15b). Zonder `personen` rekent de pot het huishouden als één persoon.
 *
 * De waarschuwing "voorlopige aanslag te laag" bij meer dan 10% bijbetaling is een eigen
 * vuistregel, geen wettelijke grens.
 */
import type { BelastingrentePeriode, PersoonId, Status, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { STATUS_RANG } from '../../types'
import { BELASTINGRENTE_IB } from '../../years/data/belastingrente'
import { AFRONDING } from '../../rounding'
import { regel, waarschuwing, eur, euro, pct, datumNL } from '../../uitleg'
import { rondPlanning } from './prognose'
import { belastingrentePeriodeOp, berekenBelastingrente, geenRenteVoor, renteVanaf as renteVanafParams } from './belastingrente'

/** Eigen vuistregel: bijbetaling boven dit deel van het verschuldigde bedrag geeft een waarschuwing. */
export const VA_TE_LAAG_SIGNAAL = 0.1

export function belastingpot(input: {
  verschuldigdIB: number
  verschuldigdZvw: number
  voorlopigBetaald: number
  saldoPot: number
  maandenVerstreken: number
  params: TaxYearParams
  jaar: number
  /** ISO-datum van de verwachte definitieve aanslag; bepaalt de rentedagen. */
  verwachteAanslagdatum?: string
  /**
   * Ronde 2: per persoon wat er bij de aanslag nog bij moet (IB en Zvw apart, na voorheffingen en voorlopige aanslagen),
   * zodat de rente per persoon en per heffing gaat zoals op de aanslagen. Ontbreekt = het huishouden als één bedrag.
   */
  personen?: Array<{ id: PersoonId; teBetalenIB: number; teBetalenZvw: number }>
  /** Periodetabel belastingrente; standaard BELASTINGRENTE_IB. */
  tabel?: readonly BelastingrentePeriode[]
  /**
   * Integratie ronde 2: ISO-datum van vandaag. Na 1 mei van het jaar erna noemen de tips geen aangifte vóór 1 mei meer,
   * na het begin van de rente zeggen ze dat de rente al loopt. Ontbreekt = de tips zoals vóór 1 mei.
   */
  vandaag?: string
}): {
  doel: number
  doelNu: number
  achterstand: number
  perMaandRest: number
  renteRisico: number
  renteVanaf: string
  /** Laagste status van de gebruikte percentages belastingrente. */
  renteStatus: Status
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
} {
  const o = input.params.overig.waarde
  const tabel = input.tabel ?? BELASTINGRENTE_IB
  const verschuldigd = input.verschuldigdIB + input.verschuldigdZvw
  const saldo = verschuldigd - input.voorlopigBetaald
  const doel = Math.max(0, saldo)
  const maanden = Math.min(12, Math.max(0, input.maandenVerstreken))
  const doelNu = rondPlanning((doel * maanden) / 12)
  const achterstand = Math.max(0, doelNu - input.saldoPot)
  const restMaanden = 12 - maanden
  const nogNodig = Math.max(0, doel - input.saldoPot)
  const perMaandRest = rondPlanning(restMaanden > 0 ? nogNodig / restMaanden : nogNodig)
  const renteVanaf = renteVanafParams(input.jaar, input.params)
  // Loopt de rente al (vandaag na de startdatum), dan het percentage van vandaag: de rente per jaar dat de aanslag nog
  // later komt, en de tekst "nu". Anders het percentage op de startdatum.
  const renteLoopt = input.vandaag !== undefined && input.vandaag >= renteVanaf
  const startPct = belastingrentePeriodeOp(tabel, renteLoopt ? input.vandaag! : renteVanaf)

  // Bedragen waarover rente loopt: per persoon en per heffing, alleen wat er nog bij moet.
  const posten = (input.personen ?? [{ id: 'A' as PersoonId, teBetalenIB: doel, teBetalenZvw: 0 }]).flatMap((p) => [
    { id: p.id, heffing: 'IB', bedrag: Math.max(0, p.teBetalenIB) },
    { id: p.id, heffing: 'Zvw', bedrag: Math.max(0, p.teBetalenZvw) },
  ]).filter((x) => x.bedrag > 0)
  const statussen: Status[] = []
  let renteRisico = 0
  for (const post of posten) {
    if (input.verwachteAanslagdatum) {
      const r = berekenBelastingrente(
        { belastingjaar: input.jaar, soort: 'aanslag', bedrag: post.bedrag, dagtekening: input.verwachteAanslagdatum, conform: false },
        { params: input.params, tabel },
      )
      renteRisico += r.bedrag
      statussen.push(r.status)
    } else if (startPct) {
      renteRisico += AFRONDING.belastingrente(post.bedrag * startPct.pct)
      statussen.push(startPct.status)
    }
  }
  const renteStatus = statussen.reduce<Status>((l, s) => (STATUS_RANG[s] < STATUS_RANG[l] ? s : l), 'definitief')
  const pctTekst = startPct ? pct(startPct.pct, 1) : ''

  const uitleg: Uitlegregel[] = [
    regel('pot.verschuldigd', 'Verschuldigd aan inkomstenbelasting en Zvw', verschuldigd, 'plus', {
      niveau: 1,
      formule: `${eur(input.verschuldigdIB)} + ${eur(input.verschuldigdZvw)}`,
    }),
    regel('pot.voorlopig', 'Al betaald via voorlopige aanslagen', input.voorlopigBetaald, 'min', { niveau: 1 }),
    regel('pot.doel', 'Doel van de belastingpot', doel, 'subtotaal', { niveau: 0, formule: `${eur(verschuldigd)} − ${eur(input.voorlopigBetaald)}` }),
    regel('pot.doel-nu', `Nodig na ${maanden.toLocaleString('nl-NL')} maanden`, doelNu, 'info', { niveau: 1, formule: `${eur(doel)} × ${maanden.toLocaleString('nl-NL')} / 12` }),
    regel('pot.saldo', 'Saldo in de pot', input.saldoPot, 'info', { niveau: 1 }),
    regel('pot.achterstand', 'Achterstand', achterstand, achterstand > 0 ? 'min' : 'info', { niveau: 1, formule: `max(0, ${eur(doelNu)} − ${eur(input.saldoPot)})` }),
    regel('pot.per-maand', 'Opzij zetten per resterende maand', perMaandRest, 'info', {
      niveau: 1,
      formule: restMaanden > 0 ? `${eur(nogNodig)} / ${restMaanden} maanden` : 'het jaar is voorbij; het volledige restant is nodig',
    }),
    regel('pot.rente', 'Belastingrente als de aanslag later komt', renteRisico, 'info', {
      niveau: 1,
      formule: input.verwachteAanslagdatum
        ? `per persoon en per heffing, vanaf ${datumNL(renteVanaf)} tot de dag vóór de aanslag van ${datumNL(input.verwachteAanslagdatum)} invorderbaar is, per periode uit de tabel`
        : renteLoopt
          ? `${pctTekst} (het percentage van nu) per jaar dat de aanslag nog later komt, per persoon en per heffing; de rente loopt sinds ${datumNL(renteVanaf)}`
          : `${pctTekst} per jaar dat de aanslag na ${datumNL(renteVanaf)} komt, per persoon en per heffing`,
      parameter: 'belastingrente (periodetabel)',
      status: renteStatus,
    }),
  ]

  const naMei = input.vandaag !== undefined && input.vandaag >= geenRenteVoor(input.jaar, input.params)
  const waarschuwingen: Waarschuwing[] = []
  if (saldo < 0) {
    waarschuwingen.push(waarschuwing('pot-teruggaaf', 'info', `Je hebt via de voorlopige aanslag ${euro(-saldo)} meer betaald dan naar verwachting verschuldigd is. Een verzoek om de voorlopige aanslag te verlagen levert dat geld eerder op.`))
  } else if (doel > 0 && doel < o.aanslaggrens) {
    waarschuwingen.push(waarschuwing('pot-aanslaggrens', 'info', `Het verschil van ${euro(doel)} ligt onder de aanslaggrens van ${euro(o.aanslaggrens)}; een bijbetaling van dat bedrag wordt niet opgelegd.`))
  }
  if (verschuldigd > 0 && doel > VA_TE_LAAG_SIGNAAL * verschuldigd) {
    waarschuwingen.push(
      waarschuwing(
        'pot-va-te-laag',
        'let-op',
        `Je voorlopige aanslag lijkt te laag: je moet nog ${euro(doel)} bijbetalen, meer dan ${pct(VA_TE_LAAG_SIGNAAL, 0)} van het verschuldigde bedrag (een eigen vuistregel van deze tool, geen wettelijke grens). ${
          naMei ? 'Een hogere voorlopige aanslag beperkt de belastingrente.' : 'Vraag een hogere voorlopige aanslag aan of dien de aangifte vóór 1 mei in. Alleen dat voorkomt belastingrente; uitstel via de accountant voorkomt die niet.'
        }`,
      ),
    )
  }
  if (doel > 0) {
    waarschuwingen.push(
      waarschuwing(
        'pot-rente',
        'info',
        renteLoopt
          ? `Over een bijbetaling rekent de Belastingdienst belastingrente, nu ${pctTekst} per jaar; die loopt sinds ${datumNL(renteVanaf)} tot de aanslag er is. Een hogere voorlopige aanslag beperkt de rente.`
          : naMei
            ? `Over een bijbetaling rekent de Belastingdienst belastingrente van ${pctTekst} vanaf ${datumNL(renteVanaf)}. Een hogere voorlopige aanslag voorkomt die.`
            : `Over een bijbetaling rekent de Belastingdienst belastingrente van ${pctTekst} vanaf ${datumNL(renteVanaf)}. Je voorkomt die door vóór 1 mei aangifte te doen of een hogere voorlopige aanslag aan te vragen. Uitstel van de aangifte via een accountant voorkomt de rente niet.`,
      ),
    )
  }
  return { doel, doelNu, achterstand, perMaandRest, renteRisico, renteVanaf, renteStatus, uitleg, waarschuwingen }
}
