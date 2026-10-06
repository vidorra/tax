/**
 * Bouwstenen voor de secties van het fiscaal rapport: de context van één rapport (persoon, partner, uitkomst,
 * parameters) en kleine hulpfuncties om regels, tabellen en secties op te bouwen.
 *
 * Afspraken voor de weergave (PDF en Excel lezen dezelfde regels):
 *  - Een bedrag staat in een kolom van het raster (N, Z, A, B, C); posten in A tellen op naar B, posten in B naar C.
 *  - `streepBoven` sluit de lijst in die kolom af; `dubbelOnder` is een eindtotaal.
 *  - `teksten` met een kolomletter als sleutel ('Z', 'A') is tekst in die bedragkolom (polisnummer, '100%',
 *    '01-01 t/m 31-12'); een andere sleutel ('land', 'soort', 'datum', 'aandeel') is een vrije tekstkolom, in de
 *    volgorde van de kolomkoppen. De kop 'omschrijving' staat boven de labelkolom.
 *  - Regel-id's volgen de nummering van het volledige rapport uit de spec ('2.2.1.schijf-1'), niet de nummering in
 *    dit document: als een paragraaf wegvalt, schuift de nummering in de koppen, maar de id's blijven gelijk.
 *    Hoofdstuk 5 krijgt de naam van de onderneming in het id ('5.meubelmakerij.1.1.eindvermogen').
 *  - `herkomst` is een pad in de uitkomst ('personen[0].box1.premie'), in de invoer ('invoer.personen[0]...') of in
 *    de parameters ('params.box3.tarief'); een afgeleid bedrag krijgt de formule met paden.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId, PersoonInvoer, PersoonResultaat, TaxYearParams } from '@/lib/tax/types'
import type { Blok, Kolom, KolomKop, RapportOpties, Regel, Sectie, TabelBlok, TekstBlok, Verantwoording } from '../model'

export interface Ander {
  id: PersoonId
  naam: string
  p?: PersoonResultaat
  pi?: PersoonInvoer
}

export interface RapportContext {
  invoer: HuishoudenInvoer
  r: HuishoudenResultaat
  P: TaxYearParams
  opties: RapportOpties
  jaar: number
  id: PersoonId
  naam: string
  p: PersoonResultaat
  pi: PersoonInvoer
  /** Index van de persoon in `r.personen` en in `invoer.personen` (voor de herkomstpaden). */
  pIndex: number
  piIndex: number
  /** Fiscale partners het hele jaar (en twee personen in het dossier). */
  partners: boolean
  ander?: Ander
  /** Weggelaten onderdelen met de reden; komt in de verantwoording. */
  weggelaten: string[]
  /** Meldingen uit de controles van het rapport zelf (kapitaalsvergelijking, balans). */
  meldingen: Verantwoording['meldingen']
}

/** Pad in de uitkomst van deze persoon. */
export const uit = (c: RapportContext, pad: string) => `personen[${c.pIndex}].${pad}`
/** Pad in de invoer van deze persoon. */
export const inv = (c: RapportContext, pad: string) => `invoer.personen[${c.piIndex}].${pad}`

export type MogelijkeRegel = Regel | null | undefined | false

const KOLOMMEN: Kolom[] = ['N', 'Z', 'A', 'B', 'C']

function rond(bedragen: Partial<Record<Kolom, number>> | undefined): Partial<Record<Kolom, number>> | undefined {
  if (!bedragen) return undefined
  const uitkomst: Partial<Record<Kolom, number>> = {}
  for (const k of KOLOMMEN) {
    const v = bedragen[k]
    if (v === undefined || !Number.isFinite(v)) continue
    uitkomst[k] = Math.round(v) + 0
  }
  return Object.keys(uitkomst).length > 0 ? uitkomst : undefined
}

type Extra = Omit<Partial<Regel>, 'id' | 'label' | 'soort' | 'bedragen'>

function maak(id: string, label: string | undefined, soort: Regel['soort'], bedragen?: Partial<Record<Kolom, number>>, extra: Extra = {}): Regel {
  const regel: Regel = { id, soort }
  if (label !== undefined) regel.label = label
  const b = rond(bedragen)
  if (b) regel.bedragen = b
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) continue
    if (Array.isArray(v) && v.length === 0) continue
    ;(regel as unknown as Record<string, unknown>)[k] = v
  }
  return regel
}

/** Gewone regel met bedragen. */
export const post = (id: string, label: string | undefined, bedragen: Partial<Record<Kolom, number>>, extra: Extra = {}) => maak(id, label, 'post', bedragen, extra)
/** Groepskop zonder bedrag (vet, 10 pt). */
export const groepskop = (id: string, label: string, extra: Extra = {}) => maak(id, label, 'groepskop', undefined, extra)
/** Subkop van een rekentabel (vet cursief). */
export const subkop = (id: string, label: string, extra: Extra = {}) => maak(id, label, 'subkop', undefined, { cursief: true, ...extra })
/** Optelling van een lijst (streep erboven). */
export const subtotaal = (id: string, label: string | undefined, bedragen: Partial<Record<Kolom, number>>, extra: Extra = {}) =>
  maak(id, label, 'subtotaal', bedragen, extra)
/** Eindtotaal: vet, streep erboven, dubbele streep eronder in de kolom van het bedrag (tenzij anders opgegeven). */
export function totaal(id: string, label: string | undefined, bedragen: Partial<Record<Kolom, number>>, extra: Extra = {}): Regel {
  const kolommen = (Object.keys(bedragen) as Kolom[]).filter((k) => bedragen[k] !== undefined)
  return maak(id, label, 'totaal', bedragen, { vet: 'regel', streepBoven: kolommen, dubbelOnder: kolommen, ...extra })
}

/** Tabel van regels; null, undefined en false vallen weg. */
export function tabel(regels: MogelijkeRegel[], extra: Partial<Omit<TabelBlok, 'soort' | 'regels'>> = {}): TabelBlok {
  return { soort: 'tabel', raster: extra.raster ?? 'standaard', ...extra, regels: regels.filter((x): x is Regel => !!x) }
}

/** Groepskop als tekstblok, voor een groep met eigen kolomkoppen (de kolomkoppen staan dan onder de kop). */
export const kopTekst = (tekst: string, witVoor?: 1 | 2): TekstBlok => ({ soort: 'tekst', tekst, stijl: 'vet', ...(witVoor ? { witVoor } : {}) })

/** Kolomkop vet cursief; meerdere regels onderaan uitgelijnd. */
export const kk = (kolom: KolomKop['kolom'], ...regels: string[]): KolomKop => ({ kolom, regels, stijl: 'kop' })

/** Kolomkop als peildatum of 'Fiscaal begin': vet, niet cursief. */
export const kd = (kolom: KolomKop['kolom'], tekst: string, streepOnder = false): KolomKop => ({ kolom, regels: [tekst], stijl: 'datum', ...(streepOnder ? { streepOnder } : {}) })

export function sectie(titel: string, niveau: Sectie['niveau'], blokken: Array<Blok | null | undefined | false>, secties: Array<Sectie | null | undefined> = [], extra: Partial<Sectie> = {}): Sectie {
  return {
    titel,
    niveau,
    ...extra,
    blokken: blokken.filter((x): x is Blok => !!x),
    secties: secties.filter((x): x is Sectie => !!x),
  }
}

/** Een sectie zonder blokken en zonder subsecties heeft geen inhoud en valt weg. */
export const heeftInhoud = (s: Sectie | null | undefined): s is Sectie => !!s && (s.blokken.length > 0 || s.secties.length > 0)

/** Slug voor id's: kleine letters, cijfers en streepjes. */
export function slug(tekst: string): string {
  return (
    tekst
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'x'
  )
}

/** Unieke slugs voor een lijst namen: bij een dubbele naam volgt '-2', '-3'. */
export function uniekeSlugs(namen: string[]): string[] {
  const gezien = new Map<string, number>()
  return namen.map((n) => {
    const s = slug(n)
    const k = (gezien.get(s) ?? 0) + 1
    gezien.set(s, k)
    return k === 1 ? s : `${s}-${k}`
  })
}

export const som = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
