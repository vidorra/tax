/**
 * Ronde 2 (A2): de zinnen van de sectie Voorlopige aanslag en belastingrente in Planning (ux-ronde2.md 5.6). Puur, geen
 * React: grenzen, datums en percentages komen uit de params en de uitkomst van de modules, nooit uit de copy zelf.
 */
import type { BelastingrentePeriode, TaxYearParams, VaHeffing, VoorlopigeAanslagAdvies } from '@/lib/tax/types'
import type { PlanningFase } from '@/lib/dossier/planning-fase'
import { formatDatum, formatEuro, formatPct } from '@/components/ui/format'

/** Voor UitlegLijst: de eigen uitleg bij regels over de belastingrente (parameter noemt de belastingrente). */
export function renteStatusUitleg(tabel: readonly BelastingrentePeriode[]): (r: { parameter?: string }) => string | undefined {
  const tekst = renteSchattingUitleg(tabel) ?? undefined
  return (r) => (r.parameter && /belastingrente/i.test(r.parameter) ? tekst : undefined)
}

/**
 * Uitleg bij het label Geschat van de belastingrente (in plaats van de algemene tekst over indexatie, want belastingrente
 * wordt niet geïndexeerd): "Het percentage vanaf 1 januari 2027 is nog niet bekendgemaakt. We rekenen met 5,5%."
 * Datum en percentage uit de periodetabel; null als alle perioden definitief zijn.
 */
export function renteSchattingUitleg(tabel: readonly BelastingrentePeriode[]): string | null {
  const p = tabel.find((x) => x.status !== 'definitief')
  if (!p) return null
  return `Het percentage vanaf ${formatDatum(p.vanaf)} is nog niet bekendgemaakt. We rekenen met ${formatPct(p.pct, 2)}.`
}

export const VA_BADGE: Record<VoorlopigeAanslagAdvies['status'], { label: string; let: boolean }> = {
  'te-laag': { label: 'Te laag', let: true },
  'te-hoog': { label: 'Te hoog', let: false },
  past: { label: 'Past', let: false },
  'niet-nodig': { label: 'Niet nodig', let: false },
}

/** Wat er bij de aanslag nog bij moet (IB en Zvw samen, alleen de positieve delen). */
export const nogBij = (a: Pick<VoorlopigeAanslagAdvies, 'ib' | 'zvw'>): number => Math.max(0, a.ib.verschil) + Math.max(0, a.zvw.verschil)
/** Wat er te veel is betaald (IB en Zvw samen, alleen de negatieve delen, als positief bedrag). */
export const teVeel = (a: Pick<VoorlopigeAanslagAdvies, 'ib' | 'zvw'>): number => Math.max(0, -a.ib.verschil) + Math.max(0, -a.zvw.verschil)

/** "€ 14.200 IB", of "een voorlopige teruggaaf van € 300 IB" bij een negatief advies. */
function adviesDeel(h: VaHeffing, heffing: 'IB' | 'Zvw'): string {
  return h.advies < 0 ? `een voorlopige teruggaaf van ${formatEuro(-h.advies)} ${heffing}` : `${formatEuro(h.advies)} ${heffing}`
}

/** Er is een voorlopige aanslag opgelegd (IB of Zvw, positief). */
export const heeftVa = (a: Pick<VoorlopigeAanslagAdvies, 'ib' | 'zvw'>): boolean => a.ib.opgelegd > 0 || a.zvw.opgelegd > 0

/** De zin onder de streep van een persoonkaart, per status (en na afloop van het jaar: aangifte in plaats van verzoek). */
export function vaAdviesZin(a: Pick<VoorlopigeAanslagAdvies, 'ib' | 'zvw' | 'status'>, params: TaxYearParams, fase: PlanningFase = 'lopend'): string {
  const o = params.overig.waarde
  if (a.status === 'te-hoog') {
    const bedrag = formatEuro(teVeel(a))
    if (fase === 'na-afloop' || fase === 'ingediend') {
      return heeftVa(a) ? `Je hebt waarschijnlijk ${bedrag} te veel betaald. Dien de aangifte in, dan krijg je het terug.` : `Je krijgt waarschijnlijk ${bedrag} terug. Dien de aangifte in, dan krijg je het terug.`
    }
    if (!heeftVa(a)) return `Je krijgt waarschijnlijk ${bedrag} terug. Vraag een voorlopige teruggaaf aan, dan krijg je het al in de loop van het jaar.`
  }
  switch (a.status) {
    case 'te-laag': {
      const zvw = a.zvw.advies !== 0 || a.zvw.opgelegd !== 0
      return `Vraag een voorlopige aanslag aan van ${adviesDeel(a.ib, 'IB')}${zvw ? ` en ${adviesDeel(a.zvw, 'Zvw')}` : ''}.`
    }
    case 'te-hoog':
      return `Je betaalt waarschijnlijk ${formatEuro(teVeel(a))} te veel. Vraag een lagere voorlopige aanslag aan, dan krijg je dat eerder terug.`
    case 'niet-nodig': {
      const bij = nogBij(a)
      if (bij > 0) return `Verschil ${formatEuro(bij)}, onder de aanslaggrens van ${formatEuro(o.aanslaggrens)}. Een voorlopige aanslag is niet nodig.`
      return 'Er is niets bij te betalen. Een voorlopige aanslag is niet nodig.'
    }
    case 'past': {
      const bij = nogBij(a)
      const terug = teVeel(a)
      if (bij > 0) return `Verschil ${formatEuro(bij)}, onder de aanslaggrens van ${formatEuro(o.aanslaggrens)}. Aanpassen is niet nodig.`
      if (terug > 0) return `Verschil ${formatEuro(terug)} te veel, onder de teruggaafgrens van ${formatEuro(o.teruggaafgrens)}. Aanpassen is niet nodig.`
      return 'Je voorlopige aanslag past bij de berekening. Aanpassen is niet nodig.'
    }
  }
}

/**
 * Lopend jaar: wat een verzoek nu per maand kost of oplevert, uit de termijnen bij een verzoek van vandaag. Null als er
 * niets te verdelen is (geen termijnen of het verschil valt binnen de grens).
 */
export function perMaandZin(a: Pick<VoorlopigeAanslagAdvies, 'ib' | 'zvw' | 'status'>): string | null {
  if (a.status !== 'te-laag' && a.status !== 'te-hoog') return null
  const schema = [a.ib.termijnenBijVerzoek, a.zvw.termijnenBijVerzoek].filter((s) => s && s.termijnen.length > 0)
  if (schema.length === 0) return null
  const eenKeer = schema.every((s) => s!.termijnen.length === 1)
  if (eenKeer) {
    const bedrag = schema.reduce((s, x) => s + x!.termijnen[0].bedrag, 0)
    const datum = schema.map((x) => x!.termijnen[0].vervaldatum).sort()[0]
    return a.status === 'te-laag'
      ? `Vraag je nu aan, dan betaal je het verschil in één keer: ${formatEuro(Math.abs(bedrag))}, uiterlijk ${formatDatum(datum)}.`
      : `Vraag je nu aan, dan krijg je het verschil in één keer terug: ongeveer ${formatEuro(Math.abs(bedrag))}.`
  }
  const perMaand = schema.reduce((s, x) => s + x!.termijnen[0].bedrag, 0)
  return a.status === 'te-laag'
    ? `Vraag je nu aan, dan betaal je het verschil in de maanden die nog over zijn: ongeveer ${formatEuro(Math.round(Math.abs(perMaand)))} per maand.`
    : `Vraag je nu aan, dan krijg je het verschil in de maanden die nog over zijn terug: ongeveer ${formatEuro(Math.round(Math.abs(perMaand)))} per maand.`
}

/** Intro van de sectie per fase. */
export function faseIntro(fase: PlanningFase, jaar: number): string | null {
  if (fase === 'toekomst') return `De cijfers van ${jaar} zijn een concept; vraag pas een voorlopige aanslag aan als ze vaststaan.`
  return null
}

/** De zin boven "Wat kost uitstel?" na afloop van het jaar (niet ingediend). */
export function naAfloopZin(jaar: number, vandaag: string, meiGrens: string, renteStart: string): string {
  if (vandaag < meiGrens) {
    return `Je hebt over ${jaar} nog geen aangifte gedaan. Dien je die vóór ${formatDatum(meiGrens)} in en klopt de aanslag met je aangifte, dan betaal je geen belastingrente.`
  }
  return `Je hebt over ${jaar} nog geen aangifte gedaan. ${formatDatum(meiGrens)} is voorbij: over wat je nog moet bijbetalen loopt belastingrente vanaf ${formatDatum(renteStart)} tot de aanslag er is. Hoe eerder je aangifte doet, hoe korter de rente loopt.`
}

/** Grijze regel als de wet geen rente rekent maar de rekenvoorbeelden van de Belastingdienst wel. */
export function praktijkZin(wet: { bedrag: number; reden: string | null }, praktijk: number, start: string): string | null {
  if (wet.bedrag !== 0 || praktijk <= 0) return null
  if (wet.reden === 'vastgesteld-voor-1-juli') {
    return `Mogelijk rekent de Belastingdienst toch rente: ongeveer ${formatEuro(praktijk)}. De wet rekent geen rente bij een aanslag vóór ${formatDatum(start).replace(/ \d{4}$/, '')}; de rekenvoorbeelden van de Belastingdienst wel.`
  }
  return `Mogelijk rekent de Belastingdienst toch rente: ongeveer ${formatEuro(praktijk)}.`
}
