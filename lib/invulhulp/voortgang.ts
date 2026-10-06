/**
 * Ronde 2 (A1): voortgang van de invulhulp. Vingerafdrukken, status per veld, tellingen per persoon en per scherm, de
 * wijzigingen voor de aangiftestaat (Klopt, Wijkt af?, afvinken) en de eindcontrole.
 *
 * Bewaard per persoon per veldsleutel (lib/dossier/aangiftestaat.ts). Een scherm 'samen' (woning, bezittingen,
 * verdelen) hoort bij de eerste persoon (`InvulhulpOpbouw.samenBij`), die de aangifte voor beide partners invult: de
 * voortgang staat daar en telt daar mee. Zo telt de badge (de som over de personen) niets dubbel.
 *
 * Puur: geen React, geen I/O; het tijdstip `op` komt van buiten.
 */
import type { PersoonId, PersoonResultaat, TaxYearParams } from '@/lib/tax/types'
import type { StaatWijziging } from '@/lib/dossier/aangiftestaat'
import { formatEuro } from '@/components/ui/format'
import {
  EINDCONTROLE_TOLERANTIE,
  TELT_MEE,
  VIA_TOLERANTIE,
  type InvulhulpKolom,
  type InvulhulpOpbouw,
  type InvulhulpTelling,
  type InvulhulpVeldStatus,
  type InvulhulpVoortgang,
  type Scherm,
  type Veld,
  type VeldVoortgang,
  type VeldWaarde,
  type VerschilKeuze,
} from './types'

// ---------------------------------------------------------------------------
// Vingerafdruk
// ---------------------------------------------------------------------------

const KOLOM_VOLGORDE: readonly InvulhulpKolom[] = ['begin', 'eind', 'kosten', 'restwaarde', 'nominaal']

/**
 * De waarde als tekst: een bedrag in hele euro's ("12000"), kolommen ("begin=4200|eind=3100"), of het antwoord of de
 * tekst zelf. Verandert die na het afvinken, dan is het veld 'gewijzigd'.
 */
export function vingerafdruk(w: VeldWaarde): string {
  switch (w.soort) {
    case 'bedrag':
      return w.bedrag === null ? '' : String(Math.round(w.bedrag) + 0)
    case 'kolommen':
      return KOLOM_VOLGORDE.filter((k) => k in w.bedragen)
        .map((k) => `${k}=${w.bedragen[k] === null || w.bedragen[k] === undefined ? '' : Math.round(w.bedragen[k] as number) + 0}`)
        .join('|')
    case 'antwoord':
      return w.antwoord ?? ''
    case 'tekst':
      return w.tekst ?? ''
  }
}

const KOLOM_LABEL: Record<InvulhulpKolom, string> = {
  begin: 'begin',
  eind: 'einde',
  kosten: 'kosten',
  restwaarde: 'restwaarde',
  nominaal: 'nominaal',
}

/** Leesbare tekst van een vingerafdruk, voor "was € 12.000, nu € 12.400". */
export function vingerafdrukTekst(w: VeldWaarde, v: string): string {
  if (w.soort === 'bedrag') return v === '' ? 'leeg' : formatEuro(Number(v))
  if (w.soort === 'kolommen') {
    return v
      .split('|')
      .filter(Boolean)
      .map((deel) => {
        const [k, b] = deel.split('=')
        return `${KOLOM_LABEL[k as InvulhulpKolom] ?? k} ${b === '' || b === undefined ? 'leeg' : formatEuro(Number(b))}`
      })
      .join(', ')
  }
  return v === '' ? 'leeg' : v
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Dossierbedrag min het bedrag van de Belastingdienst; null zonder VIA-bedrag of bij een veld zonder bedrag. */
export function viaVerschil(veld: Pick<Veld, 'rij' | 'waarde'>, vg: VeldVoortgang | undefined): number | null {
  if (veld.rij !== 'controleren' || veld.waarde.soort !== 'bedrag') return null
  if (vg?.via === undefined || vg.via === null) return null
  return (veld.waarde.bedrag ?? 0) - vg.via
}

/** Is er een verschil met de VIA dat nog een keuze vraagt ('Nog uitzoeken' telt als open)? */
export function heeftOpenVerschil(veld: Pick<Veld, 'rij' | 'waarde'>, vg: VeldVoortgang | undefined): boolean {
  const v = viaVerschil(veld, vg)
  if (v === null || Math.abs(v) <= VIA_TOLERANTIE) return false
  return vg?.keuze !== 'mijn-bedrag' && vg?.keuze !== 'bedrag-belastingdienst'
}

/**
 * Status van één veld:
 * - 'gewijzigd': afgevinkt, maar de waarde is sindsdien veranderd (het vinkje telt niet meer);
 * - 'verschil': een open verschil met de VIA (zonder keuze, of 'Nog uitzoeken');
 * - 'afgevinkt': ingevuld of gecontroleerd;
 * - 'leeg': geen waarde en standaard verborgen (`Veld.leeg`), of een berekende rij zonder bedrag;
 * - 'te-doen': de rest.
 */
export function veldStatus(veld: Pick<Veld, 'rij' | 'waarde' | 'vingerafdruk' | 'leeg'>, vg: VeldVoortgang | undefined): InvulhulpVeldStatus {
  if (vg?.afgevinkt && vg.afgevinkt.vingerafdruk !== veld.vingerafdruk) return 'gewijzigd'
  if (heeftOpenVerschil(veld, vg)) return 'verschil'
  if (vg?.afgevinkt) return 'afgevinkt'
  if (veld.leeg) return 'leeg'
  return 'te-doen'
}

/**
 * Staat de rij standaard in beeld? Lege velden niet ("{n} velden zonder bedrag verborgen"), behalve een veld dat leeg
 * werd nadat het was afgevinkt: dat moet je in de aangifte nog aanpassen.
 */
export function standaardZichtbaar(veld: Pick<Veld, 'rij' | 'waarde' | 'vingerafdruk' | 'leeg'>, vg: VeldVoortgang | undefined): boolean {
  return !veld.leeg || veldStatus(veld, vg) === 'gewijzigd'
}

/** Telt deze rij mee in de voortgang (invullen of controleren, en niet leeg verborgen)? */
export function teltMee(veld: Pick<Veld, 'rij' | 'waarde' | 'vingerafdruk' | 'leeg'>, vg?: VeldVoortgang): boolean {
  return TELT_MEE[veld.rij] && standaardZichtbaar(veld, vg)
}

/** Nog iets te doen aan deze rij (voor het filter "Nog te doen")? */
export function nogTeDoen(veld: Veld, vg: VeldVoortgang | undefined): boolean {
  if (!teltMee(veld, vg)) return false
  const s = veldStatus(veld, vg)
  return s === 'te-doen' || s === 'gewijzigd' || s === 'verschil'
}

export type InvulhulpFilter = 'alles' | 'te-doen' | 'verschillen'

export function inFilter(veld: Veld, vg: VeldVoortgang | undefined, filter: InvulhulpFilter): boolean {
  if (filter === 'alles') return true
  if (filter === 'te-doen') return nogTeDoen(veld, vg)
  return heeftOpenVerschil(veld, vg) || (veld.rij === 'controleren' && veldStatus(veld, vg) === 'gewijzigd')
}

// ---------------------------------------------------------------------------
// Tellingen
// ---------------------------------------------------------------------------

/** De persoon bij wie de gezamenlijke schermen horen. */
export const samenBij = (opbouw: Pick<InvulhulpOpbouw, 'samenBij'>): PersoonId => opbouw.samenBij ?? 'A'

/**
 * De schermen in de aangifte van een persoon: zijn eigen schermen, die van zijn ondernemingen en, bij de eerste persoon,
 * de gezamenlijke.
 */
export function schermenVan(opbouw: Pick<InvulhulpOpbouw, 'schermen' | 'samenBij'>, persoon: PersoonId): Scherm[] {
  const samen = persoon === samenBij(opbouw)
  return opbouw.schermen.filter((s) => s.persoon === persoon || (samen && s.persoon === 'samen'))
}

/** Onder welke persoon de voortgang van dit scherm staat. */
export function persoonVoorScherm(opbouw: Pick<InvulhulpOpbouw, 'samenBij'>, scherm: Pick<Scherm, 'persoon'>): PersoonId {
  return scherm.persoon === 'samen' ? samenBij(opbouw) : scherm.persoon
}

export function veldenVan(scherm: Scherm): Veld[] {
  return scherm.rubrieken.flatMap((r) => r.velden)
}

const LEGE_TELLING = (): InvulhulpTelling => ({ afgevinkt: 0, totaal: 0, verschillen: 0, gewijzigd: 0 })

function telVelden(velden: Veld[], vgs: Record<string, VeldVoortgang> | undefined, t: InvulhulpTelling): InvulhulpTelling {
  for (const v of velden) {
    const vg = vgs?.[v.sleutel]
    if (heeftOpenVerschil(v, vg)) t.verschillen++
    if (!teltMee(v, vg)) continue
    t.totaal++
    const s = veldStatus(v, vg)
    if (s === 'afgevinkt') t.afgevinkt++
    else if (s === 'gewijzigd') t.gewijzigd++
  }
  return t
}

/** Telling voor één persoon: alleen rijen die meetellen (`TELT_MEE`), lege verborgen rijen niet. */
export function telling(opbouw: Pick<InvulhulpOpbouw, 'schermen' | 'samenBij'>, voortgang: InvulhulpVoortgang | undefined, persoon: PersoonId): InvulhulpTelling {
  const vgs = voortgang?.velden?.[persoon]
  const t = LEGE_TELLING()
  for (const s of schermenVan(opbouw, persoon)) telVelden(veldenVan(s), vgs, t)
  return t
}

export function schermTelling(scherm: Scherm, vgs: Record<string, VeldVoortgang> | undefined): InvulhulpTelling {
  return telVelden(veldenVan(scherm), vgs, LEGE_TELLING())
}

/** Status van een onderdeel in de lijst Onderdelen: ✓ klaar, ◐ deels, ○ niet begonnen, ! verschil of fout. */
export type SchermStatus = 'klaar' | 'deels' | 'niet-begonnen' | 'aandacht' | 'geen'

export function schermStatus(t: InvulhulpTelling, fout = false): SchermStatus {
  if (fout || t.verschillen > 0 || t.gewijzigd > 0) return 'aandacht'
  if (t.totaal === 0) return 'geen'
  if (t.afgevinkt >= t.totaal) return 'klaar'
  return t.afgevinkt > 0 ? 'deels' : 'niet-begonnen'
}

export const tellingGelijk = (a: InvulhulpTelling | undefined, b: InvulhulpTelling): boolean =>
  !!a && a.afgevinkt === b.afgevinkt && a.totaal === b.totaal && a.verschillen === b.verschillen && a.gewijzigd === b.gewijzigd

// ---------------------------------------------------------------------------
// Wijzigingen voor de aangiftestaat
// ---------------------------------------------------------------------------

function opgeschoond(v: VeldVoortgang): VeldVoortgang | null {
  const uit: VeldVoortgang = {}
  if (v.afgevinkt) uit.afgevinkt = v.afgevinkt
  if (v.via !== undefined) uit.via = v.via
  if (v.keuze) uit.keuze = v.keuze
  if (v.notitie) uit.notitie = v.notitie.slice(0, 500)
  return Object.keys(uit).length ? uit : null
}

function wijzigingen(sleutel: string, personen: readonly PersoonId[], waarde: VeldVoortgang | null): StaatWijziging[] {
  return personen.map((persoon) => ({ soort: 'veld' as const, persoon, sleutel, waarde }))
}

export interface WijzigOpties {
  /** Personen onder wie het wordt bewaard (meestal één: `persoonVoorScherm`). */
  personen: readonly PersoonId[]
  /** De huidige voortgang van het veld (van de persoon die je bekijkt). */
  huidig?: VeldVoortgang
  /** ISO-tijdstip, van buiten (geen Date.now() in een pure module). */
  op?: string
}

/** Klopt: afgevinkt met de huidige vingerafdruk en `via` gelijk aan het dossierbedrag. Keuze en notitie blijven. */
export function naKlopt(veld: Pick<Veld, 'waarde' | 'vingerafdruk'>, huidig: VeldVoortgang | undefined, op: string): VeldVoortgang {
  const uit: VeldVoortgang = { ...(huidig ?? {}), afgevinkt: { vingerafdruk: veld.vingerafdruk, op } }
  if (veld.waarde.soort === 'bedrag') uit.via = veld.waarde.bedrag ?? 0
  delete uit.keuze
  return uit
}

export function klopt(veld: Veld, opties: WijzigOpties & { op: string }): StaatWijziging[] {
  return wijzigingen(veld.sleutel, opties.personen, opgeschoond(naKlopt(veld, opties.huidig, opties.op)))
}

/** Ongedaan maken van Klopt: vinkje en VIA-bedrag weg; een notitie blijft. */
export function ongedaan(veld: Veld, opties: WijzigOpties): StaatWijziging[] {
  const v: VeldVoortgang = { ...(opties.huidig ?? {}) }
  delete v.afgevinkt
  delete v.via
  delete v.keuze
  return wijzigingen(veld.sleutel, opties.personen, opgeschoond(v))
}

/**
 * Wijkt af?: het bedrag van de Belastingdienst. Ontstaat er een open verschil terwijl het veld was afgevinkt, dan gaat
 * het vinkje eraf (afvinken kan pas na een keuze).
 */
export function naVia(veld: Pick<Veld, 'rij' | 'waarde'>, huidig: VeldVoortgang | undefined, via: number | null): VeldVoortgang {
  const v: VeldVoortgang = { ...(huidig ?? {}) }
  if (via === null) delete v.via
  else v.via = Math.round(via) + 0
  if (v.afgevinkt && heeftOpenVerschil(veld, v)) delete v.afgevinkt
  return v
}

export function wijktAf(veld: Veld, via: number | null, opties: WijzigOpties): StaatWijziging[] {
  return wijzigingen(veld.sleutel, opties.personen, opgeschoond(naVia(veld, opties.huidig, via)))
}

export function naKeuze(veld: Pick<Veld, 'rij' | 'waarde'>, huidig: VeldVoortgang | undefined, keuze: VerschilKeuze | null): VeldVoortgang {
  const v: VeldVoortgang = { ...(huidig ?? {}) }
  if (keuze) v.keuze = keuze
  else delete v.keuze
  if (v.afgevinkt && heeftOpenVerschil(veld, v)) delete v.afgevinkt
  return v
}

export function kiesVerschil(veld: Veld, keuze: VerschilKeuze | null, opties: WijzigOpties): StaatWijziging[] {
  return wijzigingen(veld.sleutel, opties.personen, opgeschoond(naKeuze(veld, opties.huidig, keuze)))
}

export function zetNotitie(veld: Veld, notitie: string, opties: WijzigOpties): StaatWijziging[] {
  const v: VeldVoortgang = { ...(opties.huidig ?? {}) }
  if (notitie.trim()) v.notitie = notitie.slice(0, 500)
  else delete v.notitie
  return wijzigingen(veld.sleutel, opties.personen, opgeschoond(v))
}

/** Kan het vinkje aan? Niet bij een open verschil (eerst een keuze) en niet bij een berekende rij. */
export function kanAfvinken(veld: Veld, vg: VeldVoortgang | undefined): boolean {
  return TELT_MEE[veld.rij] && !heeftOpenVerschil(veld, vg)
}

/** Vinkje Ingevuld of Gecontroleerd aan of uit (een Controleren-rij met getypt VIA-bedrag houdt dat bedrag). */
export function vink(veld: Veld, aan: boolean, opties: WijzigOpties & { op: string }): StaatWijziging[] {
  const v: VeldVoortgang = { ...(opties.huidig ?? {}) }
  if (aan) {
    if (!kanAfvinken(veld, v)) return []
    v.afgevinkt = { vingerafdruk: veld.vingerafdruk, op: opties.op }
  } else delete v.afgevinkt
  return wijzigingen(veld.sleutel, opties.personen, opgeschoond(v))
}

/**
 * "Alles op dit scherm afvinken": Ingevuld op Invullen-rijen, Klopt op Controleren-rijen zonder getypt VIA-bedrag.
 * Alleen zonder open verschil op het scherm (de pagina kijkt ook naar open fouten).
 */
export function allesAfvinken(scherm: Scherm, vgs: Record<string, VeldVoortgang> | undefined, opties: { personen: readonly PersoonId[]; op: string }): StaatWijziging[] {
  const velden = veldenVan(scherm)
  if (velden.some((v) => heeftOpenVerschil(v, vgs?.[v.sleutel]))) return []
  const uit: StaatWijziging[] = []
  for (const v of velden) {
    const huidig = vgs?.[v.sleutel]
    if (!teltMee(v, huidig)) continue
    if (veldStatus(v, huidig) === 'afgevinkt') continue
    if (v.rij === 'controleren' && (huidig?.via === undefined || huidig.via === null)) uit.push(...klopt(v, { ...opties, huidig }))
    else uit.push(...vink(v, true, { ...opties, huidig }))
  }
  return uit
}

// ---------------------------------------------------------------------------
// Eindcontrole (scherm Overzicht belasting en premies)
// ---------------------------------------------------------------------------

export interface EindVergelijking {
  tool: number
  programma: number | null
  /** Programma min tool; null zolang het programma leeg is. */
  verschil: number | null
  /** Gelijk binnen EINDCONTROLE_TOLERANTIE; null zolang het programma leeg is. */
  gelijk: boolean | null
}

export function vergelijkEind(tool: number, programma: number | null | undefined): EindVergelijking {
  const t = Math.round(tool) + 0
  if (programma === null || programma === undefined || !Number.isFinite(programma)) return { tool: t, programma: null, verschil: null, gelijk: null }
  const p = Math.round(programma) + 0
  return { tool: t, programma: p, verschil: p - t, gelijk: Math.abs(p - t) <= EINDCONTROLE_TOLERANTIE }
}

/**
 * Vergelijkt wat het aangifteprogramma berekent met `teBetalenIB` en `zvw.teBetalen` (niet met het bedrag na de
 * grenzen: het programma toont het berekende bedrag; de grens past de Belastingdienst pas toe bij het opleggen).
 */
export function eindcontrole(p: Pick<PersoonResultaat, 'teBetalenIB' | 'zvw'>, programma: { ib?: number | null; zvw?: number | null } | undefined) {
  return { ib: vergelijkEind(p.teBetalenIB, programma?.ib), zvw: vergelijkEind(p.zvw.teBetalen, programma?.zvw) }
}

/**
 * De grens apart, alleen als de uitkomst hem toepast (`aanslag.vervallenDoorGrens`): "Je krijgt waarschijnlijk geen
 * aanslag: € 40 is minder dan de aanslaggrens van € 58." Grenzen uit de params, nooit vast.
 */
export function grensZin(p: Pick<PersoonResultaat, 'aanslag'>, params: TaxYearParams): string | null {
  const v = p.aanslag?.vervallenDoorGrens
  if (!v || v.bedrag === 0) return null
  const o = params.overig.waarde
  return v.soort === 'aanslaggrens'
    ? `Je krijgt waarschijnlijk geen aanslag: ${formatEuro(Math.abs(v.bedrag))} is minder dan de aanslaggrens van ${formatEuro(o.aanslaggrens)}.`
    : `Je krijgt waarschijnlijk geen teruggaaf: ${formatEuro(Math.abs(v.bedrag))} is minder dan de teruggaafgrens van ${formatEuro(o.teruggaafgrens)}.`
}
