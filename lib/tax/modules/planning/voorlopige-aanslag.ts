/**
 * Voorlopige aanslag per persoon (ronde 2, onderdeel A2): termijnen, advies en het rente-scenario voor Planning.
 *
 * Termijnen (Invorderingswet 1990 art. 9):
 *  - dagtekening vóór het belastingjaar: `termijnenVoorJaar` (12) termijnen, de eerste aan het eind van januari;
 *  - dagtekening in het jaar: zoveel termijnen als er na de maand van dagtekening maanden over zijn, de eerste een maand
 *    na de dagtekening en daarna elke maand; bij hooguit één termijn in één keer, invorderbaar `invorderbaarWeken` na
 *    de dagtekening;
 *  - voorlopige teruggaaf in het jaar: termijnen inclusief de maand van dagtekening, de eerste aan het eind van die maand;
 *  - dagtekening na afloop van het jaar: in één keer.
 * Een verhoging op verzoek is een nieuwe voorlopige aanslag met eigen termijnen, naast de lopende (T5).
 *
 * Advies per persoon en per heffing (IB/PVV en Zvw): verschil = verwacht − voorheffingen − opgelegd. Binnen de
 * aanslaggrens (te weinig) of de teruggaafgrens (te veel) is aanpassen niet nodig. De Zvw kent geen eigen aanslaggrens;
 * de tool gebruikt dezelfde grenzen als drempel om te zeggen dat aanpassen niet nodig is. Het rente-scenario rekent de
 * belastingrente over het verschil met belastingrente.ts bij de verwachte dagtekening van de definitieve aanslag.
 *
 * Puur: `vandaag` komt als argument mee.
 */
import type { BelastingrenteUitkomst, HuishoudenInvoer, HuishoudenResultaat, PersoonId, PersoonInvoer, PersoonResultaat, TaxYearParams, Termijnschema, Uitlegregel, VaHeffing, VoorlopigeAanslagAdvies, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { parseDatum, isoDatum } from '../../datum'
import { datumNL, euro, regel, waarschuwing } from '../../uitleg'
import { berekenBelastingrente, DAGEN_PER_WEEK, geenRenteVoor, plusDagen, plusMaanden, rentePerMaand, type BelastingrenteContext } from './belastingrente'

/** December als maandindex (0 = januari). */
const DECEMBER = 11

const eindVanMaand = (jaar: number, maand0: number): string => isoDatum(new Date(Date.UTC(jaar, maand0 + 1, 0)))

/** Termijnen van een voorlopige aanslag (bedrag > 0) of voorlopige teruggaaf (bedrag < 0) met deze dagtekening. */
export function termijnen(bedrag: number, dagtekening: string, belastingjaar: number, params: TaxYearParams): Termijnschema {
  const inv = params.overig.waarde.invordering
  const d = parseDatum(dagtekening)
  const dj = d.getUTCFullYear()
  const dm = d.getUTCMonth()
  const eenKeer = (regelSoort: Termijnschema['regel']): Termijnschema => ({
    regel: regelSoort,
    termijnen: [{ vervaldatum: plusDagen(dagtekening, inv.invorderbaarWeken * DAGEN_PER_WEEK), bedrag: AFRONDING.vaTermijn(bedrag) }],
  })
  const verdeel = (n: number, datum: (k: number) => string) => {
    const per = AFRONDING.vaTermijn(Math.abs(bedrag) / n) * Math.sign(bedrag)
    return Array.from({ length: n }, (_, k) => ({ vervaldatum: datum(k), bedrag: per + 0 }))
  }
  if (bedrag === 0) return { regel: 'een-keer', termijnen: [] }
  if (dj > belastingjaar) return eenKeer('na-jaar')
  if (dj < belastingjaar) {
    return { regel: 'voor-jaar', termijnen: verdeel(inv.termijnenVoorJaar, (k) => eindVanMaand(belastingjaar, k)) }
  }
  if (bedrag < 0) {
    const n = 12 - dm
    return { regel: 'teruggaaf-in-jaar', termijnen: verdeel(n, (k) => eindVanMaand(belastingjaar, dm + k)) }
  }
  const n = DECEMBER - dm
  if (n <= 1) return eenKeer('een-keer')
  return { regel: 'in-jaar', termijnen: verdeel(n, (k) => plusMaanden(dagtekening, k + 1)) }
}

export interface VaHeffingInvoer {
  /** Verwachte verschuldigde belasting voor deze heffing (IB/PVV na heffingskortingen, of de Zvw-bijdrage). */
  verwacht: number
  /** Voorheffingen (loonheffing en dividendbelasting; voor de Zvw 0). */
  voorheffingen: number
  /** Opgelegde voorlopige aanslag; negatief is een voorlopige teruggaaf. */
  opgelegd: number
}

export interface VoorlopigeAanslagInvoer {
  persoon: PersoonId
  belastingjaar: number
  ib: VaHeffingInvoer
  zvw: VaHeffingInvoer
  /** ISO-datum van vandaag (van de server); bepaalt of er nog termijnen in het jaar over zijn. */
  vandaag: string
  /** Rente-scenario uit de aangiftestaat (planning). */
  scenario?: { verwachteDagtekening?: string; indieningsdatum?: string; verwachtConform?: boolean }
  /** Velden van het formulier Voorlopige aanslag aanvragen of wijzigen (vaFormulier). */
  formulier?: VoorlopigeAanslagAdvies['formulier']
}

function heffing(h: VaHeffingInvoer, invoer: VoorlopigeAanslagInvoer, params: TaxYearParams): VaHeffing {
  const o = params.overig.waarde
  const verschil = h.verwacht - h.voorheffingen - h.opgelegd
  const binnenGrens = verschil >= 0 ? verschil <= o.aanslaggrens : -verschil <= o.teruggaafgrens
  const lopend = parseDatum(invoer.vandaag).getUTCFullYear() === invoer.belastingjaar
  return {
    verwacht: h.verwacht,
    voorheffingen: h.voorheffingen,
    opgelegd: h.opgelegd,
    verschil: verschil + 0,
    binnenGrens,
    advies: h.verwacht - h.voorheffingen + 0,
    ...(lopend && verschil !== 0 && !binnenGrens ? { termijnenBijVerzoek: termijnen(verschil, invoer.vandaag, invoer.belastingjaar, params) } : {}),
  }
}

export function adviesVoorlopigeAanslag(invoer: VoorlopigeAanslagInvoer, ctx: BelastingrenteContext): VoorlopigeAanslagAdvies {
  const { params } = ctx
  const ib = heffing(invoer.ib, invoer, params)
  const zvw = heffing(invoer.zvw, invoer, params)
  const status: VoorlopigeAanslagAdvies['status'] =
    (ib.verschil > 0 && !ib.binnenGrens) || (zvw.verschil > 0 && !zvw.binnenGrens)
      ? 'te-laag'
      : (ib.verschil < 0 && !ib.binnenGrens) || (zvw.verschil < 0 && !zvw.binnenGrens)
        ? 'te-hoog'
        : ib.opgelegd === 0 && zvw.opgelegd === 0
          ? 'niet-nodig'
          : 'past'

  // Rente-scenario over wat er bij de aanslag nog bij moet.
  let rente: VoorlopigeAanslagAdvies['rente'] = null
  const dag = invoer.scenario?.verwachteDagtekening
  const bijIB = Math.max(0, ib.verschil)
  const bijZvw = Math.max(0, zvw.verschil)
  if (dag && bijIB + bijZvw > 0) {
    const reken = (bedrag: number): BelastingrenteUitkomst | null =>
      bedrag > 0
        ? berekenBelastingrente(
            {
              belastingjaar: invoer.belastingjaar,
              soort: 'aanslag',
              bedrag,
              dagtekening: dag,
              conform: invoer.scenario?.verwachtConform ?? true,
              ...(invoer.scenario?.indieningsdatum ? { ontvangstAangifte: invoer.scenario.indieningsdatum } : {}),
            },
            ctx,
          )
        : null
    const start = `${invoer.belastingjaar + 1}-${params.overig.waarde.belastingrenteRegels.vanafMaandDag}`
    rente = { ib: reken(bijIB), zvw: reken(bijZvw), perMaand: rentePerMaand(bijIB + bijZvw, dag > start ? dag : start, ctx).bedrag }
  }

  const uitleg: Uitlegregel[] = []
  for (const [naam, h] of [
    ['IB', ib],
    ['Zvw', zvw],
  ] as const) {
    uitleg.push(regel(`va-${naam}-verwacht`, `${naam}: verschuldigd volgens de berekening`, h.verwacht, 'plus', { niveau: 1 }))
    if (h.voorheffingen !== 0) uitleg.push(regel(`va-${naam}-voorheffingen`, `${naam}: voorheffingen`, -h.voorheffingen, 'min', { niveau: 2 }))
    uitleg.push(regel(`va-${naam}-opgelegd`, `${naam}: voorlopige aanslag nu`, -h.opgelegd, 'min', { niveau: 2 }))
    uitleg.push(
      regel(`va-${naam}-verschil`, h.verschil >= 0 ? `${naam}: nog bij te betalen` : `${naam}: te veel betaald`, h.verschil, 'subtotaal', {
        niveau: 1,
        formule: h.binnenGrens ? 'binnen de grens, aanpassen is niet nodig' : undefined,
        parameter: h.verschil >= 0 ? 'overig.aanslaggrens' : 'overig.teruggaafgrens',
      }),
    )
  }

  const waarschuwingen: Waarschuwing[] = []
  const mei = geenRenteVoor(invoer.belastingjaar, params)
  if (status === 'te-laag' && invoer.vandaag < mei) {
    waarschuwingen.push(
      waarschuwing(
        'va-te-laag-mei',
        'info',
        `Vraag vóór ${datumNL(mei)} een hogere voorlopige aanslag aan, of dien de aangifte vóór ${datumNL(mei).replace(/ \d{4}$/, '')} in. Dan betaal je geen belastingrente over het verschil van ${euro(bijIB + bijZvw)}.`,
      ),
    )
  }
  return { persoon: invoer.persoon, ib, zvw, status, formulier: invoer.formulier ?? [], rente, uitleg, waarschuwingen }
}

/** IB en Zvw van één persoon voor het advies, uit de uitkomst van de engine en de ingevulde voorlopige aanslagen. */
export function vaHeffingenUitResultaat(
  p: Pick<PersoonResultaat, 'verschuldigdIB' | 'voorheffingen' | 'zvw'>,
  pi: Pick<PersoonInvoer, 'voorlopigeAanslagIB' | 'voorlopigeAanslagZvw'>,
): { ib: VaHeffingInvoer; zvw: VaHeffingInvoer } {
  return {
    ib: { verwacht: p.verschuldigdIB, voorheffingen: p.voorheffingen, opgelegd: pi.voorlopigeAanslagIB ?? 0 },
    zvw: { verwacht: p.zvw.bijdrage, voorheffingen: 0, opgelegd: pi.voorlopigeAanslagZvw ?? 0 },
  }
}

/**
 * Bedragen voor het formulier Voorlopige aanslag aanvragen of wijzigen (belastingdienst-volgorde.md 7), per persoon.
 * Werktitels; nakijken tegen het formulier van het jaar. Gezamenlijke posten (woning, box 3) staan bij beide personen;
 * de verdeling noemt de UI apart. Alleen velden met een bedrag, behalve de winst en het loon.
 */
export function vaFormulier(pi: PersoonInvoer, p: PersoonResultaat, invoer: HuishoudenInvoer, r: HuishoudenResultaat): VoorlopigeAanslagAdvies['formulier'] {
  const uit: VoorlopigeAanslagAdvies['formulier'] = []
  pi.ondernemingen.forEach((o, i) => {
    const ro = p.ondernemingen[i]
    if (ro) uit.push({ id: `winst-${o.id ?? i}`, label: `Winst vóór ondernemersaftrek, ${o.naam || `onderneming ${i + 1}`}`, bedrag: Math.round(ro.winst) })
  })
  const loon = pi.loon.reduce((s, l) => s + l.bruto, 0)
  if (loon !== 0 || pi.ondernemingen.length === 0) uit.push({ id: 'loon', label: `Loon over heel ${invoer.jaar}`, bedrag: Math.round(loon) })
  if (invoer.eigenWoning) {
    uit.push({ id: 'woz', label: 'Eigen woning: WOZ-waarde', bedrag: invoer.eigenWoning.woz })
    if (r.eigenWoning && r.eigenWoning.rente) uit.push({ id: 'rente', label: 'Eigen woning: betaalde rente', bedrag: Math.round(r.eigenWoning.rente) })
  }
  const bezittingen = invoer.box3.posities.reduce((s, x) => s + x.waardeBegin, 0)
  const schulden = invoer.box3.schulden.reduce((s, x) => s + x.waardeBegin, 0)
  if (bezittingen !== 0) uit.push({ id: 'bezittingen', label: `Bezittingen op 1 januari ${invoer.jaar}`, bedrag: Math.round(bezittingen) })
  if (schulden !== 0) uit.push({ id: 'schulden', label: `Schulden op 1 januari ${invoer.jaar}`, bedrag: Math.round(schulden) })
  const lijfrente = p.inkomensvoorziening.totaal
  if (lijfrente !== 0) uit.push({ id: 'lijfrente', label: 'Lijfrente en arbeidsongeschiktheidsverzekering', bedrag: Math.round(lijfrente) })
  return uit
}
