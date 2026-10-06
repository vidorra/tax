/**
 * Box 2: inkomen uit aanmerkelijk belang (dividend en vervreemdingsvoordeel).
 *
 * - Fiscale partners: het inkomen van beiden vormt één pot die met `aandeelA` wordt verdeeld
 *   (vrije toerekening); de ingehouden dividendbelasting volgt dezelfde verdeling.
 * - Zonder fiscaal partner telt ieders eigen inkomen.
 * - Schijfgrens per persoon (`grensPerPersoon`): partners kunnen samen tweemaal de eerste schijf benutten.
 * - Belasting per persoon via AFRONDING.box2Belasting.
 * - Waarschuwing als de schuld aan de eigen BV boven de grens voor excessief lenen komt.
 * - Een negatief inkomen is een verlies uit aanmerkelijk belang: verrekening, terugwenteling en belastingkorting staan
 *   in box2-verlies.ts (ronde 2); hier alleen een melding.
 *
 * De verdeelde bedragen worden niet afgerond: rounding.ts heeft daar geen regel voor
 * (zie contractwijziging `AFRONDING.verdeling`); bij gangbare aandelen (0, ½, 1) ontstaan hele euro's of halve.
 */
import type { Box2Invoer, Box2Resultaat, PersoonId, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { AFRONDING } from '../rounding'
import { eur, euro, pct, regel, waarschuwing } from '../uitleg'

export interface Box2Context {
  params: TaxYearParams
  personen: PersoonId[]
  /** Aandeel van persoon A in de gemeenschappelijke box 2-pot (0..1); alleen bij fiscale partners. */
  aandeelA: number
  fiscaalPartner: boolean
}

const leeg = (): Record<PersoonId, number> => ({ A: 0, B: 0 })

/** Belasting box 2 over een inkomen volgens de schijven (vóór afronding). */
export function box2BelastingRuw(inkomen: number, params: TaxYearParams): { bedrag: number; delen: Array<{ over: number; tarief: number }> } {
  const schijven = params.box2.waarde.schijven
  const basis = Math.max(0, inkomen)
  let van = 0
  let bedrag = 0
  const delen: Array<{ over: number; tarief: number }> = []
  for (const s of schijven) {
    const tot = s.tot ?? Infinity
    const over = Math.max(0, Math.min(basis, tot) - van)
    if (over > 0) delen.push({ over, tarief: s.tarief })
    bedrag += over * s.tarief
    van = tot
  }
  return { bedrag, delen }
}

export function berekenBox2(invoer: Box2Invoer[] | undefined, ctx: Box2Context): Box2Resultaat {
  const p = ctx.params.box2.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const inkomen = leeg()
  const belasting = leeg()
  const dividendbelasting = leeg()
  const posten = invoer ?? []

  if (posten.length === 0) return { inkomen, belasting, dividendbelasting, uitleg, waarschuwingen }

  // Eigen bedragen per persoon.
  const eigenInkomen = leeg()
  const eigenDivbel = leeg()
  const schuld = leeg()
  for (const post of posten) {
    eigenInkomen[post.eigenaar] += post.dividend + (post.vervreemdingsvoordeel ?? 0)
    eigenDivbel[post.eigenaar] += Math.max(0, post.ingehoudenDividendbelasting)
    schuld[post.eigenaar] += Math.max(0, post.schuldAanBV ?? 0)
  }

  const partners = ctx.fiscaalPartner && ctx.personen.includes('A') && ctx.personen.includes('B')
  if (partners) {
    const aandeel = Math.min(1, Math.max(0, ctx.aandeelA))
    const pot = eigenInkomen.A + eigenInkomen.B
    const potDivbel = eigenDivbel.A + eigenDivbel.B
    inkomen.A = pot * aandeel
    inkomen.B = pot - inkomen.A
    dividendbelasting.A = potDivbel * aandeel
    dividendbelasting.B = potDivbel - dividendbelasting.A
    uitleg.push(
      regel('box2-pot', 'Inkomen uit aanmerkelijk belang van de partners samen', pot, 'subtotaal', {
        niveau: 0,
        formule: `verdeeld: ${pct(aandeel, 0)} naar partner A, ${pct(1 - aandeel, 0)} naar partner B`,
      }),
    )
  } else {
    for (const id of ctx.personen) {
      inkomen[id] = eigenInkomen[id]
      dividendbelasting[id] = eigenDivbel[id]
    }
  }

  for (const id of ctx.personen) {
    const ruw = box2BelastingRuw(inkomen[id], ctx.params)
    belasting[id] = AFRONDING.box2Belasting(ruw.bedrag)
    if (inkomen[id] !== 0 || belasting[id] !== 0) {
      uitleg.push(regel(`box2-inkomen-${id}`, `Inkomen box 2 partner ${id}`, inkomen[id], 'info', { niveau: 1 }))
      uitleg.push(
        regel(`box2-belasting-${id}`, `Belasting box 2 partner ${id}`, belasting[id], 'plus', {
          formule: ruw.delen.map((d) => `${pct(d.tarief, 1)} × ${eur(d.over)}`).join(' + ') || '0',
          parameter: 'box2.schijven',
        }),
      )
    }
    if (dividendbelasting[id] > 0) {
      uitleg.push(
        regel(`box2-divbel-${id}`, `Ingehouden dividendbelasting partner ${id} (voorheffing)`, dividendbelasting[id], 'min', {
          parameter: 'box2.dividendbelasting',
        }),
      )
    }
    if (inkomen[id] < 0) {
      waarschuwingen.push(
        waarschuwing(
          `box2-negatief-${id}`,
          'info',
          `Partner ${id} heeft een verlies in box 2 (${euro(inkomen[id])}). Dat verlaagt het verzamelinkomen van dit jaar. Je verrekent het met box 2-inkomen van vorig jaar en van latere jaren; de Belastingdienst stelt het verlies vast met een beschikking.`,
        ),
      )
    }
  }

  // Excessief lenen: partners samen, anders per persoon.
  const grens = p.excessiefLenen.grens
  const schuldGroepen: Array<{ label: string; bedrag: number }> = partners
    ? [{ label: 'De partners hebben samen', bedrag: schuld.A + schuld.B }]
    : ctx.personen.map((id) => ({ label: `Partner ${id} heeft`, bedrag: schuld[id] }))
  for (const g of schuldGroepen) {
    if (g.bedrag > grens) {
      waarschuwingen.push(
        waarschuwing(
          'box2-excessief-lenen',
          'actie',
          `${g.label} ${euro(g.bedrag)} schuld aan de eigen BV. Het deel boven ${euro(grens)} (${euro(g.bedrag - grens)}) wordt belast als inkomen uit aanmerkelijk belang.`,
        ),
      )
    }
  }

  return { inkomen, belasting, dividendbelasting, uitleg, waarschuwingen }
}
