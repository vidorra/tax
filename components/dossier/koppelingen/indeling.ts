/**
 * Pure hulpfuncties voor de Moneybird-import in het dossier (geen React, geen fetch).
 *
 * Herindelen in de browser: de totalen van de server zijn het vertrekpunt. Alleen regels die de
 * gebruiker hier een andere categorie geeft, worden uit hun oude categorie gehaald en bij de nieuwe
 * opgeteld. Zo blijven de totalen gelijk aan die van de server zolang er niets verandert.
 *
 * Teken van `bedrag` (contract): positief voor opbrengsten en voor kosten, het teken volgt de categorie.
 * Bij omzet en financiële baten en lasten verhoogt een positief bedrag de winst, bij de kostensoorten
 * verlaagt het de winst. Het effect op de winst (`bijdrage`) blijft bij herindelen gelijk; schuift een
 * regel tussen een opbrengst- en een kostencategorie, dan draait het teken van `bedrag` om, net als bij
 * herindeel op de server (lib/moneybird/indeling.ts). Daarna volgt de jaarrekening de nieuwe indeling.
 */
import { bedragVoor, bijdrageVanRegel, jaarrekeningMetIndeling } from '@/lib/moneybird/indeling'
import type { MbCategorie, MbGrootboekRegel, MbIndeling, MbIndelingWijziging, MbJaarImport, MbKoppelingPubliek } from '@/lib/moneybird/types'
import type { OndernemingInvoer } from '@/lib/tax/types'

export type MbTotalen = MbJaarImport['totalen']

type KostenCategorie = Exclude<MbCategorie, 'omzet' | 'financieel' | 'negeren'>

const KOSTEN_VELD: Record<KostenCategorie, 'kosten' | 'afschrijvingen' | 'beperktAftrekbaar' | 'autokosten'> = {
  kosten: 'kosten',
  afschrijving: 'afschrijvingen',
  beperktAftrekbaar: 'beperktAftrekbaar',
  autokosten: 'autokosten',
}

/**
 * Effect van een regel op de winst (+ verhoogt de winst): de vaste bijdrage van de import, anders uit
 * bedrag en categorie. Dezelfde regel als op de server (bijdrageVanRegel).
 */
export function winstEffect(r: Pick<MbGrootboekRegel, 'bedrag' | 'categorie' | 'voorstel' | 'soort' | 'bijdrage'>): number {
  return bijdrageVanRegel(r)
}

function telOp(t: MbTotalen, categorie: MbCategorie, effect: number): void {
  if (categorie === 'negeren') return
  if (categorie === 'omzet') t.omzet += effect
  else if (categorie === 'financieel') t.financieel += effect
  else t[KOSTEN_VELD[categorie]] -= effect
}

export function nettoWinstVolgensIndeling(t: Pick<MbTotalen, 'omzet' | 'kosten' | 'afschrijvingen' | 'beperktAftrekbaar' | 'autokosten' | 'financieel'>): number {
  return t.omzet - t.kosten - t.afschrijvingen - t.beperktAftrekbaar - t.autokosten + t.financieel
}

/**
 * Past lokale keuzes (ledgerAccountId → categorie) toe op de regels, zonder de totalen. Een regel met een
 * andere categorie houdt zijn bijdrage aan de winst; het bedrag krijgt het teken van de nieuwe categorie.
 */
export function regelsMetKeuzes(regels: MbGrootboekRegel[], keuzes: MbIndeling): MbGrootboekRegel[] {
  return regels.map((r) => {
    const keuze = keuzes[r.ledgerAccountId]
    if (keuze === undefined || keuze === r.categorie) return r
    const bijdrage = bijdrageVanRegel(r)
    return { ...r, categorie: keuze, aangepast: keuze !== r.voorstel, bedrag: bedragVoor(bijdrage, { categorie: keuze, voorstel: r.voorstel, soort: r.soort }), bijdrage }
  })
}

/** Totalen na herindelen: serverbedragen plus de verschuivingen van de regels die een andere categorie kregen. */
export function herberekenTotalen(imp: MbJaarImport, regels: MbGrootboekRegel[]): MbTotalen {
  const t: MbTotalen = { ...imp.totalen }
  const oorspronkelijk = new Map(imp.regels.map((r) => [r.ledgerAccountId, r]))
  for (const r of regels) {
    const oud = oorspronkelijk.get(r.ledgerAccountId)
    if (!oud || oud.categorie === r.categorie) continue
    const effect = winstEffect(oud)
    telOp(t, oud.categorie, -effect)
    telOp(t, r.categorie, effect)
  }
  t.nettoWinstIndeling = nettoWinstVolgensIndeling(t)
  t.verschil = t.nettoWinstMoneybird - t.nettoWinstIndeling
  return t
}

/**
 * De import met de keuzes van de gebruiker, opnieuw berekende totalen en, als er iets veranderde, de
 * jaarrekening bij die indeling (rubrieken en privéboekingen; klaar voor neemOver en het overzicht).
 */
export function importMetKeuzes(imp: MbJaarImport, keuzes: MbIndeling): MbJaarImport {
  const regels = regelsMetKeuzes(imp.regels, keuzes)
  const uit: MbJaarImport = { ...imp, regels, totalen: herberekenTotalen(imp, regels) }
  if (imp.jaarrekening && regels.some((r, i) => r !== imp.regels[i])) {
    const jaarrekening = jaarrekeningMetIndeling(uit)
    if (jaarrekening) uit.jaarrekening = jaarrekening
    else delete uit.jaarrekening
  }
  return uit
}

/** Keuzes die afwijken van wat de server al toepaste. */
export function echteWijzigingen(imp: MbJaarImport, keuzes: MbIndeling): MbIndeling {
  const uit: MbIndeling = {}
  for (const r of imp.regels) {
    const k = keuzes[r.ledgerAccountId]
    if (k !== undefined && k !== r.categorie) uit[r.ledgerAccountId] = k
  }
  return uit
}

/** Indeling om te bewaren: alle regels die de gebruiker zelf heeft ingedeeld. */
/** Wijziging voor de server: eigen keuzes zetten, regels op het voorstel wissen (null). Andere jaren blijven staan. */
export function teBewarenIndeling(regels: MbGrootboekRegel[]): MbIndelingWijziging {
  const uit: MbIndelingWijziging = {}
  for (const r of regels) uit[r.ledgerAccountId] = r.aangepast ? r.categorie : null
  return uit
}

/** Koppelingen waarmee je kunt importeren (met een gekozen administratie). */
export function bruikbareKoppelingen(koppelingen: MbKoppelingPubliek[]): MbKoppelingPubliek[] {
  return koppelingen.filter((k) => Boolean(k.administratieId))
}

/** Voorkeur: de koppeling waaruit deze onderneming eerder is geïmporteerd, anders de eerste. */
export function voorkeurKoppeling(koppelingen: MbKoppelingPubliek[], bron: OndernemingInvoer['bron']): string | null {
  const bruikbaar = bruikbareKoppelingen(koppelingen)
  if (bron && bruikbaar.some((k) => k.id === bron.koppelingId)) return bron.koppelingId
  return bruikbaar[0]?.id ?? null
}

const DATUM = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric' })
const DATUM_TIJD = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** "1 februari 2027" (of met tijd: "1 februari 2027 om 11:00") in Nederlandse tijd; ongeldig blijft zoals het is. */
export function formatMoment(iso: string, metTijd = false): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (!metTijd) return DATUM.format(d)
  const delen = DATUM_TIJD.formatToParts(d)
  const waarde = (type: Intl.DateTimeFormatPartTypes) => delen.find((p) => p.type === type)?.value ?? ''
  return `${waarde('day')} ${waarde('month')} ${waarde('year')} om ${waarde('hour')}:${waarde('minute')}`
}

/** Herkomstregel onder de naam van de onderneming. */
export function bronTekst(bron: NonNullable<OndernemingInvoer['bron']>): string {
  const naam = bron.administratieNaam?.trim() || bron.administratieId
  return `Cijfers uit Moneybird (administratie ${naam}), opgehaald op ${formatMoment(bron.geimporteerdOp)}`
}
