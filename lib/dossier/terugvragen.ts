/**
 * Ronde 2 (A5): de lijst "Terugvragen in het buitenland": bronbelasting die boven het verdragstarief is ingehouden en die
 * je terugvraagt bij de belastingdienst van het bronland (niet via de Nederlandse aangifte). Per regel land, bedrag,
 * uiterste datum (of "termijn nakijken"), procedure en de status uit de aangiftestaat (`terugvragen` op
 * `${positieId}/${regelId}`). Regels die binnen zes maanden verlopen en nog open staan, komen bovenaan.
 *
 * Puur: geen React, geen I/O, geen Date.now(): `vandaag` komt van de aanroeper (server).
 */
import type { BronbelastingRegelUitkomst, Eigenaar, HuishoudenInvoer, HuishoudenResultaat, TaxYearParams } from '@/lib/tax/types'
import type { AangifteStaat, TerugvraagStatus } from './aangiftestaat'
import { bronbelastingRegels } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { verrekenbaarPerRegel } from '@/lib/tax/modules/box3/bronbelasting'

/** Tooldrempel (geen fiscaal getal): onder dit bedrag per land loont terugvragen waarschijnlijk niet. */
export const TERUGVRAAG_KLEIN = 25
/** Tooldrempel: een termijn die binnen zoveel maanden afloopt, komt bovenaan en geeft de let op bron-termijn. */
export const TERUGVRAAG_TERMIJN_MAANDEN = 6

export const TERUGVRAAG_STATUS_LABEL: Record<TerugvraagStatus['status'], string> = {
  open: 'Nog doen',
  aangevraagd: 'Aangevraagd',
  ontvangen: 'Ontvangen',
  laten: 'Laat ik zitten',
}

export interface TerugvraagItem {
  /** Sleutel in de aangiftestaat: `${positieId}/${regelId}`. */
  sleutel: string
  jaar: number
  positieId: string
  regelId: string
  land: string
  landNaam: string
  soort: 'dividend' | 'rente'
  bedrag: number
  /** Uiterste datum (ISO); null = termijn nakijken. */
  uiterlijk: string | null
  procedure?: string
  url?: string
  positieNaam: string
  eigenaar: Eigenaar
  status: TerugvraagStatus['status']
  /** Open, niet klein, en de termijn loopt binnen zes maanden af (nog niet verlopen). Een klein bedrag geeft geen let op. */
  binnenkort: boolean
  verlopen: boolean
  /** Onder TERUGVRAAG_KLEIN: "Terugvragen loont waarschijnlijk niet." */
  klein: boolean
}

export const terugvraagSleutel = (positieId: string, regelId: string): string => `${positieId}/${regelId}`

/** ISO-datum plus n maanden (dag begrensd op de laatste dag van de maand). */
export function plusMaanden(iso: string, n: number): string {
  const [j, m, d] = iso.slice(0, 10).split('-').map(Number)
  const totaal = m - 1 + n
  const jaar = j + Math.floor(totaal / 12)
  const maand = (totaal % 12) + 1
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate()
  return `${jaar}-${String(maand).padStart(2, '0')}-${String(Math.min(d, laatste)).padStart(2, '0')}`
}

/** De bronbelastingregels van een jaar: uit de uitkomst, anders uit de invoer (zelfde functie als de engine). */
export function bronbelastingRegelsVan(invoer: HuishoudenInvoer, resultaat: HuishoudenResultaat | null | undefined, params: TaxYearParams | null): BronbelastingRegelUitkomst[] {
  if (resultaat?.box3.bronbelastingRegels) return resultaat.box3.bronbelastingRegels
  if (!params) return []
  return invoer.box3.posities.flatMap((x) => bronbelastingRegels(x).map((r) => verrekenbaarPerRegel(r, x, { params, jaar: invoer.jaar })))
}

/**
 * De terugvraaglijst van één jaar, gesorteerd: open en binnen zes maanden eerst, kleine bedragen (die terugvragen
 * waarschijnlijk niet lonen) achteraan, verder op datum (zonder datum achteraan).
 */
export function terugvraagLijst(
  invoer: HuishoudenInvoer,
  regels: readonly BronbelastingRegelUitkomst[],
  staat: AangifteStaat | null | undefined,
  vandaag: string,
): TerugvraagItem[] {
  const grens = plusMaanden(vandaag, TERUGVRAAG_TERMIJN_MAANDEN)
  const items = regels
    .filter((r) => r.terugTeVragen > 0)
    .map((r): TerugvraagItem => {
      const sleutel = terugvraagSleutel(r.positieId, r.regelId)
      const status = staat?.terugvragen?.[sleutel]?.status ?? 'open'
      const positie = invoer.box3.posities.find((x) => x.id === r.positieId)
      const verlopen = r.terugvraagUiterlijk !== null && r.terugvraagUiterlijk < vandaag
      const klein = r.terugTeVragen < TERUGVRAAG_KLEIN
      return {
        sleutel,
        jaar: invoer.jaar,
        positieId: r.positieId,
        regelId: r.regelId,
        land: r.land,
        landNaam: r.landNaam ?? r.land,
        soort: r.soort,
        bedrag: r.terugTeVragen,
        uiterlijk: r.terugvraagUiterlijk,
        ...(r.procedure ? { procedure: r.procedure } : {}),
        ...(r.url ? { url: r.url } : {}),
        positieNaam: positie?.omschrijving.trim() || 'Bezitting',
        eigenaar: r.eigenaar,
        status,
        binnenkort: status === 'open' && !klein && !verlopen && r.terugvraagUiterlijk !== null && r.terugvraagUiterlijk <= grens,
        verlopen,
        klein,
      }
    })
  const datum = (x: TerugvraagItem) => x.uiterlijk ?? '9999-12-31'
  return items.sort((a, b) => Number(b.binnenkort) - Number(a.binnenkort) || Number(a.klein) - Number(b.klein) || datum(a).localeCompare(datum(b)) || a.landNaam.localeCompare(b.landNaam, 'nl'))
}

export interface OpenTerugvragen {
  /** Open verzoeken (Nog doen, termijn niet verlopen, niet klein) over alle jaren. */
  aantal: number
  bedrag: number
  /** De eerste termijn die afloopt (alleen verzoeken met een datum). */
  eerste: { datum: string; landNaam: string; jaar: number } | null
  /** Jaar met de eerste termijn, of anders het eerste jaar met een open verzoek: daar gaat "Bekijk in {jaar}" heen. */
  jaar: number | null
}

/** Wat over de jaren nog openstaat (overzicht). Bedragen onder TERUGVRAAG_KLEIN tellen niet mee: dat loont niet. */
export function openTerugvragen(lijsten: ReadonlyArray<readonly TerugvraagItem[]>): OpenTerugvragen {
  const open = lijsten.flat().filter((x) => x.status === 'open' && !x.verlopen && !x.klein)
  const metDatum = open.filter((x) => x.uiterlijk !== null).sort((a, b) => (a.uiterlijk as string).localeCompare(b.uiterlijk as string))
  const eerste = metDatum[0] ? { datum: metDatum[0].uiterlijk as string, landNaam: metDatum[0].landNaam, jaar: metDatum[0].jaar } : null
  const jaar = eerste?.jaar ?? (open.length > 0 ? Math.min(...open.map((x) => x.jaar)) : null)
  return { aantal: open.length, bedrag: Math.round(open.reduce((s, x) => s + x.bedrag, 0) * 100) / 100, eerste, jaar }
}
