/**
 * Kinderopvangtoeslag (KOT) per kind en per opvangsoort.
 *
 * Regels (Wet kinderopvang, Besluit kinderopvangtoeslag van het jaar):
 *  - Het kind met de meeste opvanguren is het eerste kind (rang 1, pctKind1);
 *    elk volgend kind krijgt pctKind2. Bij gelijke uren telt de invoervolgorde.
 *  - Per opvangregel: uren begrensd op maxUrenPerMaand, uurprijs begrensd op de
 *    maximum uurprijs van de opvangsoort; toeslag = uren × min(tarief, max) × pct × maanden.
 *  - Het percentage komt uit de eerste tabelrij met totInkomen ≥ toetsingsinkomen
 *    (totInkomen null = laatste rij).
 *  - Aanvragen kan tot `terugwerkendeMaanden` terug: uiterlijk op de laatste dag van
 *    de zoveelste maand na de startmaand.
 *  - Regime 'directeFinanciering' (stelselwijziging): vergoeding = vergoedingPct van de
 *    begrensde prijs, eigen bijdrage = eigenBijdragePct daarvan plus alles boven de
 *    maximum uurprijs; geen inkomenstoets en geen aanvraagtermijn.
 */
import type { KindInvoer, KotResultaat, KotTabelRij, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { regel, waarschuwing, eur, pct, datumNL } from '../../uitleg'
import { isoDatum, parseDatum } from '../../datum'

type OpvangSoort = 'dagopvang' | 'bso' | 'gastouder'

const SOORT_LABEL: Record<OpvangSoort, string> = {
  dagopvang: 'dagopvang',
  bso: 'buitenschoolse opvang',
  gastouder: 'gastouderopvang',
}

/** Euro's met centen: 11,23 */
export const eurCent = (n: number): string =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Percentage uit de KOT-tabel voor een toetsingsinkomen. */
export function kotPercentage(tabel: KotTabelRij[], toetsingsinkomen: number): { rij: KotTabelRij | null; index: number } {
  for (let i = 0; i < tabel.length; i++) {
    const rij = tabel[i]
    if (rij.totInkomen === null || rij.totInkomen >= toetsingsinkomen) return { rij, index: i }
  }
  return { rij: tabel.length > 0 ? tabel[tabel.length - 1] : null, index: tabel.length - 1 }
}

/** Laatste dag van de maand die `maanden` na de maand van `datum` ligt. */
export function laatsteDagNaMaanden(datum: string, maanden: number): string {
  const d = parseDatum(datum)
  // Dag 0 van de maand daarna = laatste dag van de doelmaand.
  return isoDatum(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + maanden + 1, 0)))
}

const totaalUrenPerJaar = (kind: KindInvoer, maxUren: number): number =>
  (kind.opvang ?? []).reduce((s, o) => s + Math.min(o.urenPerMaand, maxUren) * o.maanden, 0)

export function berekenKot(
  kinderen: KindInvoer[],
  toetsingsinkomen: number,
  ctx: { params: TaxYearParams; jaar: number },
): KotResultaat {
  const kot = ctx.params.toeslagen.waarde.kot
  const status = ctx.params.toeslagen.status
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const perKind: KotResultaat['perKind'] = []

  const metOpvang = kinderen.filter((k) => (k.opvang ?? []).some((o) => o.urenPerMaand > 0 && o.maanden > 0))
  if (metOpvang.length === 0) return { perKind, totaal: 0, uitleg, waarschuwingen }

  // Rangorde: meeste opvanguren eerst; sort is stabiel, dus gelijke uren houden de invoervolgorde.
  const gerangschikt = [...metOpvang].sort((a, b) => totaalUrenPerJaar(b, kot.maxUrenPerMaand) - totaalUrenPerJaar(a, kot.maxUrenPerMaand))

  const directe = kot.regime === 'directeFinanciering'
  const { rij, index } = kotPercentage(kot.tabel, toetsingsinkomen)
  if (!directe && !rij) {
    waarschuwingen.push(waarschuwing('kot-geen-tabel', 'actie', `Er is geen kinderopvangtoeslagtabel voor ${ctx.jaar}; de toeslag is op nul gezet.`))
    return { perKind, totaal: 0, uitleg, waarschuwingen }
  }
  if (directe && kot.vergoedingPct === undefined) {
    waarschuwingen.push(waarschuwing('kot-geen-vergoedingspct', 'actie', `Het vergoedingspercentage voor de directe financiering in ${ctx.jaar} ontbreekt; de vergoeding is op nul gezet.`))
    return { perKind, totaal: 0, uitleg, waarschuwingen }
  }

  uitleg.push(
    regel('kot', directe ? 'Kinderopvang: vergoeding via de opvang (directe financiering)' : 'Kinderopvangtoeslag', 0, 'subtotaal', {
      niveau: 0,
      formule: directe
        ? `${pct(kot.vergoedingPct ?? 0, 1)} van de maximum uurprijs, zonder inkomenstoets`
        : `toetsingsinkomen ${eur(toetsingsinkomen)}: eerste kind ${pct(rij!.pctKind1, 1)}, volgende kinderen ${pct(rij!.pctKind2, 1)}`,
      parameter: directe ? 'toeslagen.kot.vergoedingPct' : `toeslagen.kot.tabel[${index}]`,
      status,
    }),
  )

  let totaal = 0
  gerangschikt.forEach((kind, i) => {
    const rang = i + 1
    const percentage = directe ? (kot.vergoedingPct ?? 0) : rang === 1 ? rij!.pctKind1 : rij!.pctKind2
    let kosten = 0
    let toeslag = 0
    let vroegsteStart: string | undefined
    const naam = kind.naam ?? `kind ${rang}`

    const somUren = (kind.opvang ?? []).reduce((s, o) => s + o.urenPerMaand, 0)
    if ((kind.opvang ?? []).length > 1 && somUren > kot.maxUrenPerMaand) {
      waarschuwingen.push(
        waarschuwing(
          `kot-uren-${kind.id}`,
          'let-op',
          `Voor ${naam} staan samen ${eur(somUren)} opvanguren per maand ingevuld. De toeslag geldt voor maximaal ${eur(kot.maxUrenPerMaand)} uur per kind per maand; vallen de soorten opvang in dezelfde maanden, dan is de toeslag lager dan hier berekend.`,
        ),
      )
    }

    for (const o of kind.opvang ?? []) {
      if (o.urenPerMaand <= 0 || o.maanden <= 0) continue
      const max = kot.maxUurprijs[o.soort]
      const uren = Math.min(o.urenPerMaand, kot.maxUrenPerMaand)
      const tarief = Math.min(o.uurtarief, max)
      const kostenJaar = o.urenPerMaand * o.uurtarief * o.maanden
      const perMaand = uren * tarief * percentage
      const toeslagJaar = AFRONDING.toeslag(perMaand * o.maanden)
      kosten += kostenJaar
      toeslag += toeslagJaar
      if (o.startdatum && (!vroegsteStart || o.startdatum < vroegsteStart)) vroegsteStart = o.startdatum

      uitleg.push(
        regel(`kot.${kind.id}.${o.soort}`, `${naam}: ${SOORT_LABEL[o.soort]}`, toeslagJaar, 'plus', {
          niveau: 2,
          formule: `${eur(uren)} uur × ${eurCent(tarief)} × ${pct(percentage, 1)} = ${eurCent(perMaand)} per maand × ${o.maanden} maanden`,
          parameter: `toeslagen.kot.maxUurprijs.${o.soort}`,
          status,
        }),
      )
      if (o.uurtarief > max) {
        uitleg.push(
          regel(`kot.${kind.id}.${o.soort}.boven-max`, `Uurprijs boven het maximum (betaal je zelf)`, AFRONDING.toeslag((o.uurtarief - max) * o.urenPerMaand * o.maanden), 'info', {
            niveau: 2,
            formule: `${eurCent(o.uurtarief)} − ${eurCent(max)} = ${eurCent(o.uurtarief - max)} per uur`,
            parameter: `toeslagen.kot.maxUurprijs.${o.soort}`,
          }),
        )
      }
      if (o.urenPerMaand > kot.maxUrenPerMaand) {
        waarschuwingen.push(
          waarschuwing(
            `kot-max-uren-${kind.id}-${o.soort}`,
            'info',
            `Voor ${naam} telt de toeslag over ${eur(kot.maxUrenPerMaand)} van de ${eur(o.urenPerMaand)} uur per maand; de rest betaal je volledig zelf.`,
          ),
        )
      }
    }

    const kostenAfgerond = AFRONDING.toeslag(kosten)
    const aanvraagUiterlijk = !directe && vroegsteStart ? laatsteDagNaMaanden(vroegsteStart, kot.terugwerkendeMaanden) : undefined
    perKind.push({
      kindId: kind.id,
      rang,
      pct: percentage,
      kostenPerJaar: kostenAfgerond,
      toeslagPerJaar: toeslag,
      eigenBijdragePerJaar: kostenAfgerond - toeslag,
      aanvraagUiterlijk,
    })
    totaal += toeslag

    uitleg.push(
      regel(`kot.${kind.id}`, `${naam} (${rang === 1 ? 'eerste kind, meeste opvanguren' : `kind ${rang}`})`, toeslag, 'subtotaal', {
        niveau: 1,
        formule: `kosten ${eur(kostenAfgerond)}, ${directe ? 'vergoeding' : 'toeslag'} ${eur(toeslag)}, eigen bijdrage ${eur(kostenAfgerond - toeslag)} per jaar`,
      }),
    )
    if (aanvraagUiterlijk) {
      waarschuwingen.push(
        waarschuwing(
          `kot-aanvraag-${kind.id}`,
          'info',
          `Vraag de kinderopvangtoeslag voor ${naam} uiterlijk ${datumNL(aanvraagUiterlijk)} aan. Je krijgt de toeslag maximaal ${kot.terugwerkendeMaanden} maanden terug.`,
        ),
      )
    }
  })

  if (!directe) {
    waarschuwingen.push(
      waarschuwing(
        'kot-definitief',
        'info',
        'De kinderopvangtoeslag is een voorschot. De definitieve toeslag volgt na de aanslag inkomstenbelasting, op basis van het werkelijke toetsingsinkomen van jou en je toeslagpartner.',
      ),
    )
  }

  uitleg[0] = { ...uitleg[0], bedrag: totaal }
  return { perKind, totaal, uitleg, waarschuwingen }
}
