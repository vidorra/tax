/**
 * Box 3 schijvenstelsel (regime 'schijven2017', belastingjaren 2017 t/m 2022).
 *
 * rendementsgrondslag = bezittingen − (schulden − schuldendrempel); grondslag = max(0, rendementsgrondslag −
 * heffingsvrij vermogen × personen). Partners verdelen de grondslag (aandeelA, in hele euro's via
 * verdeelGrondslag); per persoon geldt de schijventabel `box3.schijven2017` (effectief rendement per schijf
 * van de grondslag): voordeel = AFRONDING.box3Voordeel(Σ pct_i × deel_i), belasting =
 * AFRONDING.box3Belasting(tarief × voordeel). Het voordeel per schijf staat in `voordeelPerSchijf`.
 */
import type { Box3Invoer, Box3SchijfRegel, PersoonId, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { eur, pct, regel, waarschuwing } from '../../uitleg'
import {
  aantalPersonen,
  belastingPerPersoon,
  bronbelastingVelden,
  controleWaarschuwingen,
  leegPP,
  uitlegVermogen,
  verdeel,
  verdeelGrondslag,
  verzamelVermogen,
  type Box3Context,
  type Box3ResultaatUitgebreid,
} from './forfaitair'

/**
 * Voordeel over een grondslag volgens de schijventabel (`bedrag` vóór afronding), met de regels per schijf.
 * Het bedrag per schijf is cumulatief afgerond (afgerond totaal tot en met deze schijf min dat tot en met de
 * vorige), zodat de schijven samen precies AFRONDING.box3Voordeel(bedrag) zijn.
 */
export function voordeelSchijven(grondslag: number, schijven: Array<{ tot: number | null; pct: number }>): { bedrag: number; formule: string; regels: Box3SchijfRegel[] } {
  let van = 0
  let bedrag = 0
  let afgerondTotNu = 0
  const delen: string[] = []
  const regels: Box3SchijfRegel[] = []
  for (const s of schijven) {
    const tot = s.tot ?? Infinity
    const over = Math.max(0, Math.min(grondslag, tot) - van)
    if (over > 0) {
      bedrag += over * s.pct
      delen.push(`${pct(s.pct, 3)} × ${eur(over)}`)
      const afgerond = AFRONDING.box3Voordeel(bedrag)
      regels.push({ van, tot: s.tot, grondslag: over, pct: s.pct, bedrag: afgerond - afgerondTotNu })
      afgerondTotNu = afgerond
    }
    van = tot
  }
  return { bedrag, formule: delen.join(' + ') || '0', regels }
}

export function berekenSchijven2017(invoer: Box3Invoer, ctx: Box3Context): Box3ResultaatUitgebreid {
  const b = ctx.params.box3.waarde
  const n = aantalPersonen(ctx)
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const schijven = b.schijven2017 ?? []
  if (schijven.length === 0) {
    waarschuwingen.push(waarschuwing('box3-schijven-ontbreken', 'actie', 'De schijventabel voor box 3 ontbreekt in de parameters van dit jaar; het voordeel is op nul gezet.'))
  }

  const v = verzamelVermogen(invoer, ctx)
  uitleg.push(...uitlegVermogen(v, ctx))

  const heffingsvrij = b.heffingsvrijVermogen * n
  const grondslag = Math.max(0, v.rendementsgrondslag - heffingsvrij)
  uitleg.push(
    regel('box3-heffingsvrij', 'Heffingsvrij vermogen', Math.min(heffingsvrij, Math.max(0, v.rendementsgrondslag)), 'min', {
      formule: `${eur(b.heffingsvrijVermogen)} × ${n}`,
      parameter: 'box3.heffingsvrijVermogen',
    }),
  )
  uitleg.push(regel('box3-grondslag', 'Grondslag sparen en beleggen', grondslag, 'subtotaal', { niveau: 0 }))

  const deel = verdeelGrondslag(grondslag, ctx)
  const voordeel = leegPP()
  const voordeelPerSchijf: Partial<Record<PersoonId, Box3SchijfRegel[]>> = {}
  for (const id of ctx.personen) {
    const r = voordeelSchijven(deel[id], schijven)
    voordeel[id] = AFRONDING.box3Voordeel(r.bedrag)
    if (r.regels.length > 0) voordeelPerSchijf[id] = r.regels
    if (deel[id] > 0) {
      uitleg.push(
        regel(`box3-voordeel-${id}`, `Voordeel uit sparen en beleggen partner ${id}`, voordeel[id], 'subtotaal', {
          formule: r.formule,
          parameter: 'box3.schijven2017',
        }),
      )
    }
  }
  const totaalVoordeel = voordeel.A + voordeel.B
  const effectiefPct = grondslag > 0 ? AFRONDING.box3EffectiefPct(totaalVoordeel / grondslag) : 0

  const bel = belastingPerPersoon(voordeel, v.posities, ctx, b.tarief)
  uitleg.push(...bel.uitleg)
  waarschuwingen.push(...bel.waarschuwingen, ...controleWaarschuwingen(v.posities, ctx))

  return {
    bezittingen: v.bezittingen,
    aftrekbareSchulden: v.aftrekbareSchulden,
    rendementsgrondslag: v.rendementsgrondslag,
    grondslag,
    forfaitairRendement: totaalVoordeel,
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
    rendementRegels: [],
    voordeelPerSchijf,
    uitleg,
    waarschuwingen,
  }
}
