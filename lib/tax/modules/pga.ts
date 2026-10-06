/**
 * Persoonsgebonden aftrek: giften, specifieke zorgkosten, scholingsuitgaven en partneralimentatie.
 *
 * - Gewone giften: drempel max(drempelMin, drempelPct × drempelinkomen), maximum maxPct × drempelinkomen.
 *   Culturele giften tellen als gewone gift; over het aftrekbare deel daarvan komt een verhoging van
 *   (cultureelMultiplier − 1), maximaal cultureelMaxExtra. De drempel wordt eerst op de overige giften
 *   toegepast, zodat de verhoging zo groot mogelijk is.
 * - Periodieke giften: zonder drempel en zonder maximum, tot periodiekMax.
 * - Specifieke zorgkosten (alleen als actief): verhoging bij een drempelinkomen tot
 *   verhogingTotInkomen, daarna de drempel uit de tabel. Bij fiscale partners geldt het gezamenlijke
 *   drempelinkomen en verdubbelen de laagste drempel en de grens van de laagste band.
 * - Scholingsuitgaven (alleen als actief): boven de drempel, tot het maximum.
 * - Partneralimentatie: volledig aftrekbaar als `pga.alimentatie` aan staat.
 *
 * Voorbeeld 2021 (scholing): 2.640 − 250 = 2.390.
 */
import type { ModuleUitkomst, PgaInvoer, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { AFRONDING } from '../rounding'
import { eur, pct, regel, waarschuwing } from '../uitleg'

/**
 * rounding.ts heeft (nog) geen eigen regel voor de persoonsgebonden aftrek. Rekenkundig, net als
 * de andere posten die niet door een fixture zijn gedekt; zie contractwijziging `AFRONDING.pga`.
 */
const rondPga = AFRONDING.korting

export interface PgaResultaat extends ModuleUitkomst {
  giften: number
  zorgkosten: number
  scholing: number
  alimentatie: number
  totaal: number
}

export interface PgaContext {
  params: TaxYearParams
  /** Gezamenlijk drempelinkomen van de partners (of van de alleenstaande). */
  gezamenlijkDrempelinkomen: number
  aowBereikt: boolean
  partneralimentatie?: number
  /** Optioneel: fiscale partners het hele jaar (partnertabel zorgkostendrempel). Standaard false. */
  fiscaalPartner?: boolean
}

/** Drempel specifieke zorgkosten volgens de tabel van het jaar. */
export function zorgkostenDrempel(drempelinkomen: number, params: TaxYearParams, fiscaalPartner: boolean): { drempel: number; formule: string } {
  const z = params.pga.waarde.zorgkosten
  const factor = fiscaalPartner ? 2 : 1
  const laagGrens = z.drempelMinTotInkomen * factor
  const minimum = z.drempelMinPP * factor
  const ink = Math.max(0, drempelinkomen)
  if (ink <= laagGrens) return { drempel: minimum, formule: `drempelinkomen tot ${eur(laagGrens)}: vaste drempel ${eur(minimum)}` }
  if (ink <= z.grensHoog) return { drempel: z.pctLaag * ink, formule: `${pct(z.pctLaag)} × ${eur(ink)}` }
  return { drempel: z.vastHoog + z.pctHoog * (ink - z.grensHoog), formule: `${eur(z.vastHoog)} + ${pct(z.pctHoog)} × (${eur(ink)} − ${eur(z.grensHoog)})` }
}

export function berekenPga(pga: PgaInvoer | undefined, ctx: PgaContext): PgaResultaat {
  const p = ctx.params.pga.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const ink = Math.max(0, ctx.gezamenlijkDrempelinkomen)
  const invoer = pga ?? {}

  // Giften.
  const g = p.giften
  const gewoonOverig = Math.max(0, invoer.giftenGewoon ?? 0)
  const cultureel = Math.max(0, invoer.giftenCultureel ?? 0)
  const periodiekInvoer = Math.max(0, invoer.giftenPeriodiek ?? 0)
  let giften = 0
  if (gewoonOverig + cultureel > 0) {
    const drempel = Math.max(g.drempelMin, g.drempelPct * ink)
    const maximum = g.maxPct * ink
    const gewoon = gewoonOverig + cultureel
    const aftrekbaarGewoon = rondPga(Math.min(Math.max(0, gewoon - drempel), maximum))
    // Drempel eerst op de niet-culturele giften: zo blijft het culturele deel zo groot mogelijk.
    const cultureelAftrekbaar = Math.min(cultureel, aftrekbaarGewoon)
    const verhoging = rondPga(Math.min(g.cultureelMaxExtra, (g.cultureelMultiplier - 1) * cultureelAftrekbaar))
    giften += aftrekbaarGewoon + verhoging
    uitleg.push(
      regel('pga-giften-gewoon', 'Gewone giften boven de drempel', aftrekbaarGewoon, 'min', {
        formule: `min(${eur(gewoon)} − ${eur(drempel)}, ${pct(g.maxPct, 0)} × ${eur(ink)} = ${eur(maximum)})`,
        parameter: 'pga.giften',
      }),
    )
    if (verhoging > 0) {
      uitleg.push(
        regel('pga-giften-cultureel', 'Extra aftrek giften aan culturele instellingen', verhoging, 'min', {
          formule: `${pct(g.cultureelMultiplier - 1, 0)} × ${eur(cultureelAftrekbaar)}, maximaal ${eur(g.cultureelMaxExtra)}`,
          parameter: 'pga.giften.cultureelMultiplier',
        }),
      )
    }
    if (gewoon - drempel > maximum) {
      waarschuwingen.push(
        waarschuwing('pga-giften-max', 'info', `Gewone giften boven ${pct(g.maxPct, 0)} van het drempelinkomen zijn niet aftrekbaar. Een periodieke gift (vastgelegd in een notariële of onderhandse akte) heeft geen drempel en geen maximum.`),
      )
    }
  }
  if (periodiekInvoer > 0) {
    const periodiek = Math.min(periodiekInvoer, g.periodiekMax)
    giften += periodiek
    uitleg.push(
      regel('pga-giften-periodiek', 'Periodieke giften', periodiek, 'min', {
        formule: periodiekInvoer > g.periodiekMax ? `maximaal ${eur(g.periodiekMax)}` : 'zonder drempel',
        parameter: 'pga.giften.periodiekMax',
      }),
    )
  }

  // Specifieke zorgkosten.
  let zorgkosten = 0
  const zorgInvoer = Math.max(0, invoer.specifiekeZorgkosten ?? 0)
  if (zorgInvoer > 0) {
    const z = p.zorgkosten
    if (!z.actief) {
      uitleg.push(regel('pga-zorgkosten', 'Specifieke zorgkosten: aftrek bestaat niet in dit jaar', 0, 'info', { parameter: 'pga.zorgkosten.actief' }))
    } else {
      const verhoogd = ink <= z.verhogingTotInkomen
      const verhogingPct = ctx.aowBereikt ? z.verhogingPctAow : z.verhogingPct
      const metVerhoging = verhoogd ? zorgInvoer * (1 + verhogingPct) : zorgInvoer
      const d = zorgkostenDrempel(ink, ctx.params, ctx.fiscaalPartner ?? false)
      zorgkosten = rondPga(Math.max(0, metVerhoging - d.drempel))
      if (verhoogd) {
        uitleg.push(
          regel('pga-zorg-verhoging', 'Verhoging specifieke zorgkosten', rondPga(metVerhoging - zorgInvoer), 'plus', {
            niveau: 2,
            formule: `${pct(verhogingPct, 0)} × ${eur(zorgInvoer)}`,
            parameter: ctx.aowBereikt ? 'pga.zorgkosten.verhogingPctAow' : 'pga.zorgkosten.verhogingPct',
          }),
        )
        waarschuwingen.push(
          waarschuwing(
            'pga-zorg-verhoging',
            'info',
            'De verhoging geldt alleen voor geneesmiddelen, hulpmiddelen, extra gezinshulp, dieetkosten en extra kleding en beddengoed. Hier is uitgegaan van het hele bedrag.',
          ),
        )
      }
      uitleg.push(
        regel('pga-zorgkosten', 'Specifieke zorgkosten boven de drempel', zorgkosten, 'min', {
          formule: `${eur(metVerhoging)} − drempel (${d.formule})`,
          parameter: 'pga.zorgkosten',
        }),
      )
    }
  }

  // Scholingsuitgaven.
  let scholing = 0
  const scholingInvoer = Math.max(0, invoer.scholing ?? 0)
  if (scholingInvoer > 0) {
    const s = p.scholing
    if (!s.actief) {
      uitleg.push(regel('pga-scholing', 'Scholingsuitgaven: aftrek bestaat niet in dit jaar', 0, 'info', { parameter: 'pga.scholing.actief' }))
    } else {
      scholing = rondPga(Math.min(s.max, Math.max(0, scholingInvoer - s.drempel)))
      uitleg.push(
        regel('pga-scholing', 'Scholingsuitgaven boven de drempel', scholing, 'min', {
          formule: `min(${eur(s.max)}, ${eur(scholingInvoer)} − ${eur(s.drempel)})`,
          parameter: 'pga.scholing',
        }),
      )
    }
  }

  // Partneralimentatie.
  let alimentatie = 0
  const alimentatieInvoer = Math.max(0, ctx.partneralimentatie ?? 0)
  if (alimentatieInvoer > 0) {
    if (p.alimentatie) {
      alimentatie = alimentatieInvoer
      uitleg.push(regel('pga-alimentatie', 'Partneralimentatie', alimentatie, 'min', { parameter: 'pga.alimentatie' }))
    } else {
      uitleg.push(regel('pga-alimentatie', 'Partneralimentatie: niet aftrekbaar in dit jaar', 0, 'info', { parameter: 'pga.alimentatie' }))
    }
  }

  const totaal = giften + zorgkosten + scholing + alimentatie
  uitleg.push(regel('pga-totaal', 'Persoonsgebonden aftrek', totaal, 'totaal', { niveau: 0 }))

  return { giften, zorgkosten, scholing, alimentatie, totaal, uitleg, waarschuwingen }
}
