/**
 * Buitenlandse bronbelasting in box 3 (ronde 2, onderdeel A5): verrekening per regel tot het verdragstarief en hooguit
 * `box3.bronbelastingMaxPct`, het plafond per persoon met voortwenteling, en de termijn om het meerdere terug te vragen.
 *
 * Kader (fiscaal-ronde2.md 2.1 en 2.2):
 *  - art. 25 Bvdb 2001 en het besluit van 13 december 2024 §3.2.1: in box 3 per inkomst
 *      verrekenbaar = min(ingehouden, verdragstarief × bruto, bronbelastingMaxPct × bruto)
 *    geen tweede limiet (evenredigheid). Wat boven het verdragstarief is ingehouden, vraag je terug in het bronland.
 *  - art. 25 lid 4: per persoon ten hoogste de box 3-belasting (na andere verminderingen);
 *  - art. 25a (en §3.4.1 van het besluit voor verdragslanden): wat daardoor niet wordt verrekend, schuift door naar het
 *    volgende jaar, zonder vervaltermijn. Alleen het deel dat op het plafond stuit, niet het deel boven het verdrag.
 *
 * Land:
 *  - in de tabel (years/data/bronbelasting-landen.ts): het verdragstarief van de soort (dividend of rente);
 *  - in de tabel met `verdrag: null`: niets verrekend (let op bron-onbekend-land);
 *  - niet in de tabel (ook oude vrije tekst die `landCode` niet herkent): verrekenen tot `bronbelastingMaxPct`, zoals in
 *    ronde 1, met de let op bron-onbekend-land. Zo veranderen bestaande dossiers niet ongemerkt.
 *  - een ingevuld `verdragstarief` op de regel gaat altijd voor.
 * Zonder bruto inkomsten rekent de module zoals ronde 1: het hele ingehouden bedrag (fout bron-bruto in de controles).
 *
 * Puur: geen React, geen I/O, geen datum van vandaag. Afrondingen via AFRONDING.
 */
import type { Box3Resultaat, BronbelastingLand, BronbelastingPersoon, BronbelastingRegel, BronbelastingRegelUitkomst, Eigenaar, TaxYearParams } from '../../types'
import { AFRONDING } from '../../rounding'
import { BRONBELASTING_LANDEN, landUitTabel } from '../../years/data/bronbelasting-landen'
import { landCode } from './bronbelasting-invoer'

export interface BronbelastingContext {
  params: TaxYearParams
  jaar: number
  /** Landentabel; standaard die uit years/data (tests geven hun eigen tabel mee). */
  tabel?: readonly BronbelastingLand[]
}

const maanden = (iso: string, n: number): string => {
  const [j, m, d] = iso.split('-').map(Number)
  const totaal = (m - 1) + n
  const jaar = j + Math.floor(totaal / 12)
  const maand = (totaal % 12) + 1
  // Bestaat de dag niet in de doelmaand (31 augustus + 6 maanden), dan de laatste dag van die maand.
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate()
  return `${jaar}-${String(maand).padStart(2, '0')}-${String(Math.min(d, laatste)).padStart(2, '0')}`
}

/**
 * Uiterste datum om terug te vragen in het bronland (ISO), of null als de termijn onzeker is ('termijn nakijken') of het
 * land geen terugvraag kent. `datum` is de datum van inhouding; ontbreekt die, dan 31 december van het jaar.
 *  - eindJaarPlus n:        31-12 van (jaar van uitkering + n)
 *  - vanaf1JanPlus n:       n jaar vanaf 1 januari van het jaar: 31-12 van (jaar + n − 1)
 *  - maandenNaInhouding n:  datum + n maanden
 *  - jarenNaUitkering n:    datum + n jaar
 */
export function terugvraagDatum(terugvragen: BronbelastingLand['terugvragen'] | undefined, datum: string | undefined, jaar: number): string | null {
  if (!terugvragen || terugvragen.regel === 'onzeker') return null
  const d = datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : `${jaar}-12-31`
  const j = Number(d.split('-')[0])
  switch (terugvragen.regel) {
    case 'eindJaarPlus':
      return `${j + terugvragen.n}-12-31`
    case 'vanaf1JanPlus':
      return `${j + terugvragen.n - 1}-12-31`
    case 'maandenNaInhouding':
      return maanden(d, terugvragen.n)
    case 'jarenNaUitkering':
      return maanden(d, terugvragen.n * 12)
    default:
      return null
  }
}

/** Het land van een regel: code uit de tabel als die er is (ook voor oude vrije tekst), anders de tekst zelf. */
export function landVanRegel(regel: Pick<BronbelastingRegel, 'land'>, tabel: readonly BronbelastingLand[] = BRONBELASTING_LANDEN): { code: string; land: BronbelastingLand | undefined } {
  const code = landCode(regel.land) ?? regel.land.trim()
  return { code, land: code ? landUitTabel(code, tabel) : undefined }
}

/**
 * Uitkomst van één regel: toegepast tarief, verrekenbaar (AFRONDING.bronbelasting, naar beneden), terug te vragen
 * (ingehouden − verdragstarief × bruto, op centen) en de uiterste datum om terug te vragen.
 */
export function verrekenbaarPerRegel(
  regel: BronbelastingRegel,
  positie: { id: string; eigenaar: Eigenaar },
  ctx: BronbelastingContext,
): BronbelastingRegelUitkomst {
  const tabel = ctx.tabel ?? BRONBELASTING_LANDEN
  const maxPct = ctx.params.box3.waarde.bronbelastingMaxPct
  const { code, land } = landVanRegel(regel, tabel)
  const tarieven = land ? (regel.soort === 'rente' ? land.rente ?? land.dividend : land.dividend) : undefined
  const bruto = Math.max(0, regel.brutoInkomsten ?? 0)
  const ingehouden = Math.max(0, regel.bedrag ?? 0)

  let tariefBron: NonNullable<BronbelastingRegelUitkomst['tariefBron']>
  let verdrag: number | null
  if (regel.verdragstarief !== undefined && regel.verdragstarief !== null && Number.isFinite(regel.verdragstarief)) {
    tariefBron = 'eigen'
    verdrag = Math.min(1, Math.max(0, regel.verdragstarief))
  } else if (tarieven) {
    tariefBron = tarieven.verdrag === null ? 'geen-verdrag' : 'tabel'
    verdrag = tarieven.verdrag
  } else {
    tariefBron = 'buiten-tabel'
    verdrag = null
  }

  const zonderBruto = bruto <= 0 && ingehouden > 0
  let verrekenbaar: number
  let terugTeVragen = 0
  if (tariefBron === 'geen-verdrag') {
    verrekenbaar = 0
  } else if (zonderBruto) {
    // Zoals ronde 1: het hele ingehouden bedrag (de controle bron-bruto vraagt om de bruto inkomsten).
    verrekenbaar = AFRONDING.bronbelasting(ingehouden)
  } else {
    const limiet = tariefBron === 'buiten-tabel' ? maxPct : Math.min(verdrag ?? 0, maxPct)
    verrekenbaar = AFRONDING.bronbelasting(Math.min(ingehouden, limiet * bruto))
    // Terugvragen alleen als het verdragstarief bekend is (tabel of eigen invoer).
    if (tariefBron === 'tabel' || tariefBron === 'eigen') terugTeVragen = AFRONDING.bronbelastingTerugvragen(Math.max(0, ingehouden - (verdrag ?? 0) * bruto))
  }

  const terug = land?.terugvragen
  const terugvraagUiterlijk = terugTeVragen > 0 && land ? terugvraagDatum(terug, regel.datum, ctx.jaar) : null
  return {
    positieId: positie.id,
    regelId: regel.id,
    land: code,
    ...(land ? { landNaam: land.naam } : {}),
    soort: regel.soort,
    eigenaar: positie.eigenaar,
    bruto,
    ingehouden,
    verdragstarief: tariefBron === 'buiten-tabel' ? null : verdrag,
    verrekenbaar,
    terugTeVragen,
    terugvraagUiterlijk,
    ...(terugTeVragen > 0 && terug ? { procedure: terug.procedure, ...(terug.url ? { url: terug.url } : {}) } : {}),
    ...(land ? { landStatus: land.status } : {}),
    tariefBron,
    ...(zonderBruto ? { zonderBruto: true } : {}),
  }
}

/** Per land opgeteld (samenvatting en aangifte 2.21), in de volgorde waarin de landen voor het eerst voorkomen. */
export function bronbelastingPerLand(regels: readonly BronbelastingRegelUitkomst[]): NonNullable<Box3Resultaat['bronbelastingPerLand']> {
  const uit = new Map<string, { land: string; bruto: number; ingehouden: number; verrekenbaar: number; terugTeVragen: number }>()
  for (const r of regels) {
    const k = r.land || '?'
    const x = uit.get(k) ?? { land: r.land, bruto: 0, ingehouden: 0, verrekenbaar: 0, terugTeVragen: 0 }
    x.bruto += r.bruto
    x.ingehouden += r.ingehouden
    x.verrekenbaar += r.verrekenbaar
    x.terugTeVragen = AFRONDING.bronbelastingTerugvragen(x.terugTeVragen + r.terugTeVragen)
    uit.set(k, x)
  }
  return [...uit.values()]
}

/**
 * Verrekening per persoon (art. 25 lid 4 en 25a Bvdb): beschikbaar = verrekenbaar dit jaar (na verdeling) +
 * voortgewenteld uit eerdere jaren; verrekend = min(beschikbaar, plafond); de rest schuift door naar volgend jaar.
 * Het plafond is de box 3-belasting van deze persoon na andere verminderingen.
 */
export function bronbelastingPersoon(x: { verrekenbaar: number; voortgewenteld: number; plafond: number }): BronbelastingPersoon {
  const verrekenbaar = Math.max(0, x.verrekenbaar)
  const voortgewenteldIn = Math.max(0, x.voortgewenteld)
  const plafond = Math.max(0, x.plafond)
  const beschikbaar = verrekenbaar + voortgewenteldIn
  const verrekend = Math.min(beschikbaar, plafond)
  return { verrekenbaar, voortgewenteldIn, plafond, verrekend, naarVolgendJaar: beschikbaar - verrekend }
}

/**
 * Een fonds uit een fondsland (Ierland, Luxemburg) zonder inhouding: de bronbelasting die het fonds zelf lijdt, kun je
 * niet verrekenen (melding, geen controle).
 */
export function fondsZonderInhouding(r: Pick<BronbelastingRegelUitkomst, 'land' | 'ingehouden' | 'bruto'>, tabel: readonly BronbelastingLand[] = BRONBELASTING_LANDEN): boolean {
  return r.ingehouden <= 0 && r.bruto > 0 && landUitTabel(r.land, tabel)?.fondsland === true
}
