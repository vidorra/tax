/**
 * Kindgebonden budget (Wet op het kindgebonden budget).
 *
 * Regels:
 *  - Maximum per kind (tot12) met een verhoging voor kinderen van 12 tot en met 15
 *    (van12) of 16 en 17 jaar (van16); leeftijd op de eerste dag van elke maand.
 *  - Alleenstaande ouders krijgen daarbovenop de alleenstaande-ouderkop (aloKop).
 *  - Een kind telt mee vanaf het kwartaal waarin het recht op kinderbijslag ontstaat
 *    (kwartaal na de geboorte) en tot het 18 is (leeftijd op de eerste dag van de maand).
 *  - Afbouw over de afbouwpunten: elk percentage geldt vanaf zijn eigen punt tot het
 *    volgende punt; afbouw = Σ pct_i × max(0, min(inkomen, punt_{i+1}) − punt_i).
 *  - Geen recht als het vermogen (rendementsgrondslag op 1 januari, inclusief kinderen)
 *    boven de vermogensgrens van het huishouden ligt.
 *  - Per maand gerekend: maximum van die maand − afbouw / 12, nooit negatief.
 */
import type { KindInvoer, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { regel, waarschuwing, eur, euro, pct } from '../../uitleg'
import { leeftijdOp } from '../../datum'
import { LEEFTIJD_VOLWASSEN, startRechtKind } from './kinderbijslag'

/** Leeftijden waarop de verhogingen ingaan (afgeleid van de veldnamen maxPerKind.van12 en van16). */
const LEEFTIJD_VERHOGING_12 = 12
const LEEFTIJD_VERHOGING_16 = 16

const maandStart = (jaar: number, m: number): string => `${jaar}-${String(m + 1).padStart(2, '0')}-01`

/** Afbouwbedrag over alle afbouwpunten. */
export function kgbAfbouw(
  afbouw: Array<{ vanafAlleen: number; vanafPaar: number; pct: number }>,
  inkomen: number,
  partner: boolean,
): { totaal: number; delen: Array<{ van: number; tot: number | null; pct: number; bedrag: number }> } {
  const punten = afbouw.map((a) => ({ vanaf: partner ? a.vanafPaar : a.vanafAlleen, pct: a.pct })).sort((a, b) => a.vanaf - b.vanaf)
  const delen = punten.map((p, i) => {
    const tot = i + 1 < punten.length ? punten[i + 1].vanaf : null
    const boven = Math.max(0, (tot === null ? inkomen : Math.min(inkomen, tot)) - p.vanaf)
    return { van: p.vanaf, tot, pct: p.pct, bedrag: boven * p.pct }
  })
  return { totaal: delen.reduce((s, d) => s + d.bedrag, 0), delen }
}

export function berekenKgb(
  kinderen: KindInvoer[],
  toetsingsinkomen: number,
  vermogen: number,
  ctx: { params: TaxYearParams; jaar: number; partner: boolean },
): { bedrag: number; uitleg: Uitlegregel[]; waarschuwingen: Waarschuwing[] } {
  const p = ctx.params.toeslagen.waarde
  const status = ctx.params.toeslagen.status
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const peildatum = `${ctx.jaar}-01-01`
  const eindeJaar = `${ctx.jaar}-12-31`

  // Een kind telt in een maand mee als het op de eerste dag van die maand recht geeft en nog geen 18 is.
  const telt = (k: { kind: KindInvoer; start: string }, maand: string) => k.start <= maand && leeftijdOp(k.kind.geboortedatum, maand) < LEEFTIJD_VOLWASSEN
  const maanden = Array.from({ length: 12 }, (_, m) => maandStart(ctx.jaar, m))
  const relevant = kinderen
    .map((k, i) => ({ kind: k, naam: k.naam ?? `kind ${i + 1}`, leeftijd: leeftijdOp(k.geboortedatum, peildatum), start: startRechtKind(k) }))
    .filter((k) => k.start <= eindeJaar && maanden.some((m) => telt(k, m)))
  if (relevant.length === 0) return { bedrag: 0, uitleg, waarschuwingen }

  const grens = ctx.partner ? p.vermogensgrens.metPartner : p.vermogensgrens.alleen
  if (vermogen > grens) {
    uitleg.push(
      regel('kgb', 'Kindgebonden budget: geen recht door vermogen', 0, 'info', {
        niveau: 0,
        formule: `vermogen ${eur(vermogen)} boven de grens van ${eur(grens)}`,
        parameter: `toeslagen.vermogensgrens.${ctx.partner ? 'metPartner' : 'alleen'}`,
        status,
      }),
    )
    waarschuwingen.push(
      waarschuwing('kgb-vermogen', 'let-op', `Je vermogen op 1 januari (${euro(vermogen)}) ligt boven de vermogensgrens van ${euro(grens)}. Daardoor is er geen kindgebonden budget, ook niet bij een laag inkomen.`),
    )
    return { bedrag: 0, uitleg, waarschuwingen }
  }

  // Verhoging naar de leeftijd op de eerste dag van de maand (wie in maart 12 wordt, krijgt de verhoging vanaf april).
  const verhogingOp = (k: { kind: KindInvoer }, maand: string) => {
    const l = leeftijdOp(k.kind.geboortedatum, maand)
    return l >= LEEFTIJD_VERHOGING_16 ? p.kgb.maxPerKind.van16 : l >= LEEFTIJD_VERHOGING_12 ? p.kgb.maxPerKind.van12 : 0
  }
  const perKind = relevant.map((k) => {
    const actief = maanden.filter((m) => telt(k, m))
    const verhoging = actief.length > 0 ? actief.reduce((s, m) => s + verhogingOp(k, m), 0) / actief.length : 0
    return { ...k, jaarbedrag: p.kgb.maxPerKind.tot12 + verhoging, verhoging, maandenActief: actief.length, verhoogdeMaanden: actief.filter((m) => verhogingOp(k, m) > 0).length }
  })
  const alo = ctx.partner ? 0 : p.kgb.aloKop
  const afbouw = kgbAfbouw(p.kgb.afbouw, toetsingsinkomen, ctx.partner)

  let somMax = 0
  let somBedrag = 0
  for (const start of maanden) {
    const actief = perKind.filter((k) => telt(k, start))
    if (actief.length === 0) continue
    const maxMaand = (actief.reduce((s, k) => s + p.kgb.maxPerKind.tot12 + verhogingOp(k, start), 0) + alo) / 12
    somMax += maxMaand
    somBedrag += Math.max(0, maxMaand - afbouw.totaal / 12)
  }
  const bedrag = AFRONDING.toeslag(somBedrag)

  uitleg.push(
    regel('kgb', 'Kindgebonden budget', bedrag, 'subtotaal', {
      niveau: 0,
      formule: `maximum ${eur(somMax)} − afbouw ${eur(somMax - somBedrag)} (per maand gerekend, nooit onder nul)`,
      parameter: 'toeslagen.kgb',
      status,
    }),
  )
  for (const k of perKind) {
    const aantal = k.maandenActief
    const leeftijdEinde = leeftijdOp(k.kind.geboortedatum, maanden[11])
    uitleg.push(
      regel(`kgb.${k.kind.id}`, `${k.naam}: maximum per jaar`, AFRONDING.toeslag(k.jaarbedrag), 'plus', {
        niveau: 1,
        formule:
          (k.verhoging > 0
            ? `${eur(p.kgb.maxPerKind.tot12)} + verhoging ${eur(k.verhoging)}${k.verhoogdeMaanden < aantal ? ` (${k.verhoogdeMaanden} van de ${aantal} maanden)` : ''} (leeftijd op de eerste dag van de maand)`
            : `${eur(p.kgb.maxPerKind.tot12)}`) + (aantal < 12 ? `, ${aantal} van de 12 maanden recht` : ''),
        parameter: k.verhoging > 0 ? (leeftijdEinde >= LEEFTIJD_VERHOGING_16 ? 'toeslagen.kgb.maxPerKind.van16' : 'toeslagen.kgb.maxPerKind.van12') : 'toeslagen.kgb.maxPerKind.tot12',
      }),
    )
  }
  if (alo > 0) {
    uitleg.push(regel('kgb.alo', 'Alleenstaande-ouderkop', alo, 'plus', { niveau: 1, formule: `${eur(alo)} per jaar`, parameter: 'toeslagen.kgb.aloKop' }))
  }
  afbouw.delen.forEach((d, i) => {
    if (d.bedrag <= 0) return
    uitleg.push(
      regel(`kgb.afbouw.${i}`, `Afbouw boven ${eur(d.van)}`, AFRONDING.toeslag(d.bedrag), 'min', {
        niveau: 1,
        formule: `${pct(d.pct)} × (${eur(d.tot === null ? toetsingsinkomen : Math.min(toetsingsinkomen, d.tot))} − ${eur(d.van)})`,
        parameter: `toeslagen.kgb.afbouw[${i}]`,
      }),
    )
  })
  if (bedrag === 0) {
    waarschuwingen.push(waarschuwing('kgb-nul', 'info', `Bij een toetsingsinkomen van ${euro(toetsingsinkomen)} is het kindgebonden budget volledig afgebouwd.`))
  }
  return { bedrag, uitleg, waarschuwingen }
}
