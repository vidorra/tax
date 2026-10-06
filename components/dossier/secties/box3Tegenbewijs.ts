/**
 * Stand van het tegenbewijs in box 3 voor de vermogenssectie van het dossier: kan het in dit jaar,
 * geeft de engine de melding 'tegenbewijs loont' of past hij het werkelijk rendement al toe, en welke
 * bezittingen missen stortingen of opnames. Puur: geen React, rekent met dezelfde box 3-module en
 * dezelfde context als de engine vóór de verdeling (alles bij de eerste persoon, zoals box3Vooraf).
 */
import { berekenBox3 } from '@/lib/tax/modules/box3'
import type { Box3Categorie, HuishoudenInvoer, TaxYearParams, VermogensPositie } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'

export interface TegenbewijsStand {
  /** Het jaar rekent met het forfait en staat tegenbewijs toe; alleen dan rekent de engine het door. */
  mogelijk: boolean
  /** Stelsel waarin altijd het werkelijk rendement telt (voorstel vanaf 2028): de velden zijn dan altijd nodig. */
  altijdWerkelijk: boolean
  /** De engine meldt dat tegenbewijs loont terwijl het nog niet aan staat. */
  loont: boolean
  /**
   * Het werkelijk rendement lijkt lager dan het forfait, maar een bezitting daalde zonder ingevulde opname: de
   * engine meldt dan 'onvolledig' in plaats van 'loont'.
   */
  onvolledig: boolean
  /** Tegenbewijs staat aan en het werkelijk rendement is toegepast. */
  toegepast: boolean
  /**
   * De engine meldt een stijging zonder ingevulde storting ('box3-tegenbewijs-storting'): het werkelijk rendement is
   * dan misschien te hoog gerekend, omdat geld dat je erbij zette als rendement telt.
   */
  storting: boolean
  /** Deel van de waarde dat bij eigen gebruik van vastgoed als rendement telt (0 als dat in dit jaar niet geldt). */
  eigenGebruikPct: number
  /** Er staan al stortingen, opnames, opbrengsten, dagen eigen gebruik of betaalde rente in de invoer. */
  heeftGegevens: boolean
  /** Bezittingen waarvan de waarde daalde zonder ingevulde opname. Een opname of verkoop telt dan als verlies. */
  dalingZonderOpname: VermogensPositie[]
  /** Bezittingen waarvan de waarde steeg zonder ingevulde storting. Een storting telt dan als rendement. */
  stijgingZonderStorting: VermogensPositie[]
}

/** Grens voor de dagen eigen gebruik, gelijk aan de validatie van het dossier (schrikkeljaar). */
const MAX_DAGEN = 366

const LEEG: TegenbewijsStand = {
  mogelijk: false,
  altijdWerkelijk: false,
  loont: false,
  onvolledig: false,
  toegepast: false,
  storting: false,
  eigenGebruikPct: 0,
  heeftGegevens: false,
  dalingZonderOpname: [],
  stijgingZonderStorting: [],
}

/** Welke velden voor het werkelijk rendement per positie bestaan; gedeeld met de sectie. */
export function heeftRendementGegevens(p: VermogensPositie): boolean {
  return p.stortingen !== undefined || p.onttrekkingen !== undefined || p.directeOpbrengsten !== undefined || Boolean(p.woz?.dagenEigenGebruik)
}

export function tegenbewijsStand(invoer: HuishoudenInvoer, params?: TaxYearParams): TegenbewijsStand {
  const heeftGegevens = invoer.box3.posities.some(heeftRendementGegevens) || invoer.box3.schulden.some((s) => s.betaaldeRente !== undefined)
  let p: TaxYearParams
  try {
    p = params ?? getJaar(invoer.jaar, invoer.variant)
  } catch {
    return { ...LEEG, heeftGegevens }
  }
  const b3 = p.box3.waarde
  const mogelijk = b3.regime === 'forfaitair' && b3.tegenbewijs.beschikbaar && b3.tegenbewijs.kanaal !== 'geen'
  const altijdWerkelijk = b3.regime === 'werkelijkRendement'
  const eigenGebruikPct = b3.tegenbewijs.eigenGebruikPct

  let loont = false
  let onvolledig = false
  let toegepast = false
  let storting = false
  if (mogelijk && invoer.box3.posities.length > 0) {
    const ids = invoer.personen.map((x) => x.id)
    const partners = invoer.fiscaalPartner && ids.length === 2
    try {
      const r = berekenBox3(invoer.box3, { params: p, jaar: invoer.jaar, fiscaalPartner: partners, aandeelA: partners || ids[0] === 'A' ? 1 : 0, personen: ids })
      const melding = (id: string) => r.waarschuwingen.some((w) => w.id === id || w.id.endsWith(`-${id}`))
      loont = melding('box3-tegenbewijs-loont')
      onvolledig = melding('box3-tegenbewijs-onvolledig')
      storting = melding('box3-tegenbewijs-storting')
      toegepast = r.gekozen === 'werkelijk' || (r.potten ?? []).some((x) => x.gekozen === 'werkelijk')
    } catch {
      // Halve invoer: de editor toont de rekenfout al; hier alleen geen melding.
    }
  }

  const dalingZonderOpname = invoer.box3.posities.filter((x) => x.waardeEind !== undefined && x.waardeEind < x.waardeBegin && x.onttrekkingen === undefined)
  // Zelfde selectie als de engine bij 'box3-tegenbewijs-storting': vastgoed en vrijgestelde nettolijfrente tellen niet.
  const stijgingZonderStorting = storting
    ? invoer.box3.posities.filter(
        (x) =>
          x.categorie !== 'onroerend' &&
          !(x.categorie === 'nettolijfrente' && b3.vrijstellingen.nettolijfrente) &&
          x.waardeEind !== undefined &&
          x.waardeEind > x.waardeBegin &&
          x.stortingen === undefined,
      )
    : []
  return { mogelijk, altijdWerkelijk, loont, onvolledig, toegepast, storting, eigenGebruikPct, heeftGegevens, dalingZonderOpname, stijgingZonderStorting }
}

/**
 * Houdt `woz` van vastgoed gelijk aan de waarden van de positie. De engine gebruikt `woz` alleen voor eigen
 * gebruik en rekent met woz.eind als bekende eindwaarde, dus `woz` bestaat alleen bij vastgoed met dagen eigen
 * gebruik en een ingevulde waarde aan het einde van het jaar. Leeg of 0 dagen haalt `woz` weg.
 */
export function zetEigenGebruik(x: VermogensPositie, dagen: number | undefined): void {
  if (x.categorie !== 'onroerend' || !dagen || dagen <= 0 || x.waardeEind === undefined) {
    delete x.woz
    return
  }
  x.woz = { begin: x.waardeBegin, eind: x.waardeEind, dagenEigenGebruik: Math.min(MAX_DAGEN, Math.round(dagen)) }
}

/** Na een wijziging van categorie of waarden: `woz` opnieuw afleiden met de dagen die er al stonden. */
export function volgEigenGebruik(x: VermogensPositie): void {
  zetEigenGebruik(x, x.woz?.dagenEigenGebruik)
}

/** Label van de directe opbrengsten per soort bezitting. */
export function opbrengstLabel(c: Box3Categorie): string {
  switch (c) {
    case 'bankNL':
    case 'bankBuitenland':
    case 'vorderingen':
      return 'Ontvangen rente'
    case 'beleggingen':
    case 'groen':
      return 'Dividend en rente, bruto'
    case 'onroerend':
      return 'Ontvangen huur'
    default:
      return 'Rente, dividend of huur'
  }
}
