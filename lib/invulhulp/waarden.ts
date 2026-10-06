/**
 * Ronde 2 (A1): kleine lezers voor de invulhulp. Waarden van velden (bedrag, kolommen, antwoord, tekst), de invoer en
 * uitkomst bij een context (persoon, onderneming, item), herkomst met het veld om naartoe te springen, plaatshouders in
 * labels en de verdeling in hele euro's.
 *
 * Puur: geen React, geen I/O. Geen fiscale getallen: alles wat in een label een bedrag of grens is, komt uit de params
 * (zie PLAATSHOUDERS).
 */
import type {
  HuishoudenInvoer,
  OndernemingInvoer,
  OndernemingResultaat,
  PersoonInvoer,
  PersoonResultaat,
} from '@/lib/tax/types'
import { itemSleutel } from '@/lib/dossier/ids'
import { veld as veldPad, veldHref, veldVan, type VeldId } from '@/lib/dossier/veld'
import { formatEuro, formatGetal, formatPct } from '@/components/ui/format'
import { datumNL as datumTekst } from '@/lib/tax/uitleg'
import { plusDagen, plusMaanden } from '@/lib/tax/modules/planning/belastingrente'
import type { InvulhulpContext, InvulhulpKolom, Veld, VeldHerkomst, VeldWaarde } from './types'

// ---------------------------------------------------------------------------
// Waarden
// ---------------------------------------------------------------------------

/** Hele euro's, zoals het aangifteprogramma ze vraagt (en zoals de kopieerknop ze kopieert). */
export function heleEuro(n: number): number {
  return Math.round(n) + 0
}

const getal = (n: number | null | undefined): number | null => (typeof n === 'number' && Number.isFinite(n) ? heleEuro(n) : null)

export const bedrag = (n: number | null | undefined): VeldWaarde => ({ soort: 'bedrag', bedrag: getal(n) })

export const kolommen = (b: Partial<Record<InvulhulpKolom, number | null | undefined>>): VeldWaarde => {
  const bedragen: Partial<Record<InvulhulpKolom, number | null>> = {}
  for (const [k, v] of Object.entries(b) as Array<[InvulhulpKolom, number | null | undefined]>) bedragen[k] = getal(v)
  return { soort: 'kolommen', bedragen }
}

export const antwoord = (s: string | null | undefined): VeldWaarde => ({ soort: 'antwoord', antwoord: s?.trim() ? s.trim() : null })

export const jaNee = (b: boolean): VeldWaarde => antwoord(b ? 'Ja' : 'Nee')

export const tekst = (s: string | null | undefined): VeldWaarde => ({ soort: 'tekst', tekst: s?.trim() ? s.trim() : null })

/** Het bedrag van een veld met één bedrag; null bij kolommen, antwoord of tekst. */
export function bedragVan(w: VeldWaarde): number | null {
  return w.soort === 'bedrag' ? w.bedrag : null
}

/** Leeg = niets in te vullen: geen bedrag of 0, geen antwoord, geen tekst. Lege velden verbergt de invulhulp (behalve V). */
export function isLeeg(w: VeldWaarde): boolean {
  switch (w.soort) {
    case 'bedrag':
      return w.bedrag === null || w.bedrag === 0
    case 'kolommen':
      return Object.values(w.bedragen).every((v) => v === null || v === undefined || v === 0)
    case 'antwoord':
      return w.antwoord === null
    case 'tekst':
      return w.tekst === null
  }
}

/** Som over een lijst; leeg geeft null (dan is het veld leeg, niet 0). */
export function som<T>(xs: readonly T[] | undefined, f: (x: T) => number | undefined | null): number | null {
  if (!xs || xs.length === 0) return null
  let s = 0
  let iets = false
  for (const x of xs) {
    const v = f(x)
    if (typeof v === 'number' && Number.isFinite(v)) {
      s += v
      iets = true
    }
  }
  return iets ? s : null
}

/** Datum als dd-mm-jjjj, zoals het programma ze vraagt; null als het geen datum is. */
export function datumNL(iso: string | undefined | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** Verdeling over fiscale partners in hele euro's: deel A = afgerond totaal × aandeel A, deel B = totaal − deel A. */
export function verdeelEuro(totaal: number, aandeelA: number): { a: number; b: number; totaal: number } {
  const t = heleEuro(totaal)
  const fractie = Number.isFinite(aandeelA) ? Math.min(1, Math.max(0, aandeelA)) : 0
  const a = heleEuro(t * fractie)
  return { a, b: t - a + 0, totaal: t }
}

// ---------------------------------------------------------------------------
// Invoer en uitkomst bij een context
// ---------------------------------------------------------------------------

/** Naam van een persoon voor in kopjes en labels ("Persoon A" als er geen naam is). */
export function persoonNaam(p: { id: string; naam?: string } | undefined): string {
  if (!p) return 'je partner'
  return p.naam?.trim() ? p.naam.trim() : `Persoon ${p.id}`
}

export function persoonVan(ctx: Pick<InvulhulpContext, 'invoer' | 'persoon'>): PersoonInvoer | undefined {
  return ctx.invoer.personen.find((p) => p.id === ctx.persoon)
}

/** De fiscale partner van de persoon in de context (de andere persoon), als die er is. */
export function partnerVan(ctx: Pick<InvulhulpContext, 'invoer' | 'persoon'>): PersoonInvoer | undefined {
  return ctx.invoer.personen.find((p) => p.id !== ctx.persoon)
}

export function persoonResultaatVan(ctx: Pick<InvulhulpContext, 'resultaat' | 'persoon'>): PersoonResultaat | undefined {
  return ctx.resultaat.personen.find((p) => p.id === ctx.persoon)
}

export function ondernemingVan(ctx: InvulhulpContext): OndernemingInvoer | undefined {
  return ctx.ondernemingIndex === undefined ? undefined : persoonVan(ctx)?.ondernemingen[ctx.ondernemingIndex]
}

/** Uitkomst van de onderneming in de context (zelfde positie als in de invoer). */
export function ondernemingResultaatVan(ctx: InvulhulpContext): OndernemingResultaat | undefined {
  return ctx.ondernemingIndex === undefined ? undefined : persoonResultaatVan(ctx)?.ondernemingen[ctx.ondernemingIndex]
}

export const heeftPartner = (invoer: HuishoudenInvoer): boolean => invoer.fiscaalPartner && invoer.personen.length > 1

/** Aandelen van persoon A in de verdeling waarmee de uitkomst rekent (ook bij 'optimaal' de gekozen verdeling). */
export function verdelingVan(ctx: Pick<InvulhulpContext, 'resultaat'>) {
  return ctx.resultaat.verdeling
}

// ---------------------------------------------------------------------------
// Herkomst en springen
// ---------------------------------------------------------------------------

export function herkomst(label: string, veld?: VeldId): VeldHerkomst {
  return veld ? { label, veld } : { label }
}

/** Veld-id binnen de onderneming van de context (met de vaste id; de index alleen voor oude invoer). */
export function ondernemingVeld(ctx: InvulhulpContext, ...rest: string[]): VeldId {
  const o = ondernemingVan(ctx)
  return veldVan.onderneming(ctx.persoon, ctx.ondernemingId ?? itemSleutel(o, ctx.ondernemingIndex ?? 0), ...rest)
}

export function persoonVeld(ctx: Pick<InvulhulpContext, 'persoon'>, ...rest: string[]): VeldId {
  return veldVan.persoon(ctx.persoon, ...rest)
}

export { veldPad }

/** Link voor Aanpassen: naar het veld op de invoerpagina, met een knop terug naar de invulhulp. Null zonder veld. */
export function veldHrefVoor(jaar: number, veld: Pick<Veld, 'herkomst'>): string | null {
  return veld.herkomst?.veld ? veldHref(jaar, veld.herkomst.veld, 'aangifte') : null
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * Plaatshouders voor bedragen en grenzen in labels, uit de params (nooit vast in de indeling). Gebruik: `{uren}` in
 * "Werkte u minimaal {uren} uur in de onderneming?".
 */
export const PLAATSHOUDERS: Record<string, (ctx: InvulhulpContext) => string> = {
  uren: (c) => formatGetal(c.params.ondernemer.waarde.urencriterium.uren),
  grotendeels: (c) => formatPct(c.params.ondernemer.waarde.urencriterium.grotendeelsPct, 0),
  meewerkuren: (c) => formatGetal(c.params.ondernemer.waarde.meewerkaftrek.staffel[0]?.vanafUren ?? 0),
  meewerkvergoeding: (c) => formatEuro(c.params.ondernemer.waarde.meewerkaftrek.maxVergoeding),
  /** "voor 2010": het jaar van eerste toelating waarop een auto in dit jaar youngtimer wordt. */
  youngtimerjaar: (c) => String(c.jaar - c.params.ondernemer.waarde.auto.youngtimerLeeftijd),
  privekm: (c) => formatGetal(c.params.ondernemer.waarde.auto.priveKmGrens),
  /** Contant geld telt mee boven de vrijstelling per persoon (fiscale partners samen het dubbele). */
  contant: (c) => formatEuro(c.params.box3.waarde.vrijstellingen.contant * (heeftPartner(c.invoer) ? 2 : 1)),
  /** Grensvraag bij de bezittingen: de grens van art. 9.4 lid 1 onder c (fiscale partners samen het dubbele). */
  grenstoeslagen: (c) => formatEuro(grensBezittingen(c)),
  aflosjaren: (c) => String(c.params.eigenWoning.waarde.maxAftrekJaren),
  /** Eerste jaar van "Was u in de periode … elk jaar ondernemer". */
  startersvan: (c) => String(c.jaar - c.params.ondernemer.waarde.startersaftrekBinnenJaren),
  starterskeer: (c) => String(Math.max(0, c.params.ondernemer.waarde.startersaftrekMaxKeer - 1)),
  /** Eerste jaar waaruit een verlies uit werk en woning nog te verrekenen is. */
  verliesvan: (c) => String(c.jaar - c.params.box1.waarde.verliesverrekening.vooruit),
  /** Laatste dag waarop een premie voor een stakingslijfrente nog meetelt in dit jaar (art. 3.130 lid 2), bijvoorbeeld "30 juni 2026". */
  stakingslijfrentetot: (c) =>
    datumTekst(plusDagen(plusMaanden(`${c.jaar + 1}-01-01`, c.params.inkomensvoorziening.waarde.stakingslijfrenteRegels.betaaltermijnMaanden), -1)),
}

export function grensBezittingen(c: Pick<InvulhulpContext, 'params' | 'invoer'>): number {
  return c.params.overig.waarde.aanslagRendementsgrondslag * (heeftPartner(c.invoer) ? 2 : 1)
}

/**
 * Vult een label: <persoon> en <aangever> (de persoon van de context), <partner> (de andere persoon), <onderneming>,
 * [jaar], [j-1], [jaar-N] en [jaar+N], en de plaatshouders hierboven. Zonder partner valt " of <partner>" en
 * " en <partner>" weg.
 */
export function vulLabel(label: string, ctx: InvulhulpContext): string {
  const partner = partnerVan(ctx)
  let s = label
  if (!partner || !heeftPartner(ctx.invoer)) s = s.replace(/(?:,| of| en) <partner>/g, '')
  s = s
    .replace(/<persoon>|<aangever>/g, persoonNaam(persoonVan(ctx)))
    .replace(/<partner>/g, persoonNaam(partner))
    .replace(/<onderneming>/g, ondernemingVan(ctx)?.naam?.trim() || 'je onderneming')
    .replace(/\[j-1\]/g, String(ctx.jaar - 1))
    .replace(/\[jaar([+-])(\d+)\]/g, (_, teken: string, n: string) => String(teken === '+' ? ctx.jaar + Number(n) : ctx.jaar - Number(n)))
    .replace(/\[jaar\]/g, String(ctx.jaar))
  return s.replace(/\{([a-z]+)\}/g, (heel: string, naam: string) => (PLAATSHOUDERS[naam] ? PLAATSHOUDERS[naam](ctx) : heel))
}
