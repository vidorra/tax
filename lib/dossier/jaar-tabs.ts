/**
 * Ronde 2 (contract, na de nacontrole): de tabs van een dossierjaar, hun badges en de knop terug. Puur: geen React,
 * geen I/O, dus bruikbaar op de server (lib/dossier/jaar-pagina.ts) en in JaarNav.
 *
 * Badges (ontwerp-ronde2.md 2.3 en 4): elke jaarpagina krijgt ze van `laadJaarPagina` (`p.badges`) en geeft ze aan
 * JaarKop. Zo staan ze op Invoer, Planning, Accountantscheck, Aangifte invullen en Export zonder dat een pagina zelf
 * iets hoeft te tellen. JaarNav (A1) tekent ze en laat de badge van de actieve tab weg.
 *  - Invoer: het aantal open fouten, alleen als de controles streng zijn (`controlesStreng`). De telling komt uit
 *    `JaarOverzicht.controles`, die A3 vult in `overzicht()` (ook voor `laadJaar`); zonder telling geen badge.
 *  - Aangifte invullen: de voortgang van de invulhulp ("18/42") uit `staat.samenvatting.invulhulp`, die A1 schrijft;
 *    pas zodra er iets is afgevinkt.
 */
import type { ControleTelling } from '@/lib/controles/types'
import type { AangifteStaat } from './aangiftestaat'
import type { DossierStatus } from './status'
import type { TerugTab } from './veld'
import { controlesStreng } from '@/lib/controles/negeren'

/** De tabs van een dossierjaar (gelijk aan de tabs waar je na springen naar terug kunt). */
export type JaarTab = TerugTab

/** Volgorde van de tabs in de tabrij. */
export const JAAR_TABS: readonly JaarTab[] = ['invoer', 'planning', 'accountant', 'aangifte', 'export']

/** Volledig label van een tab (ook voor "Terug naar {label}"). */
export const JAAR_TAB_LABEL: Record<JaarTab, string> = {
  invoer: 'Invoer en resultaat',
  planning: 'Planning',
  accountant: 'Accountantscheck',
  aangifte: 'Aangifte invullen',
  export: 'Export',
}

/** Pad van een tab onder /dossier/[jaar]/ (paden eindigen op een slash, trailingSlash in next.config). */
export const JAAR_TAB_PAD: Record<JaarTab, string> = {
  invoer: '',
  planning: 'planning/',
  accountant: 'accountant/',
  aangifte: 'aangifte/',
  export: 'export/',
}

export const jaarTabHref = (jaar: number, tab: JaarTab): string => `/dossier/${jaar}/${JAAR_TAB_PAD[tab]}`

/** Badge naast een tab: korte zichtbare tekst ("2", "18/42") en de tekst voor schermlezers. */
export interface TabBadge {
  tekst: string
  srTekst: string
}

export type JaarBadges = Partial<Record<JaarTab, TabBadge>>

/** Knop terug na springen naar een veld: "Terug naar {label}". */
export interface JaarTerug {
  tab: JaarTab
  label: string
}

const isJaarTab = (x: unknown): x is JaarTab => typeof x === 'string' && (JAAR_TABS as readonly string[]).includes(x)

/** Leest `?terug=` van de jaarpagina; ongeldig of 'invoer' geeft undefined. */
export function leesTerug(x: unknown): JaarTerug | undefined {
  const w = Array.isArray(x) ? x[0] : x
  if (!isJaarTab(w) || w === 'invoer') return undefined
  return { tab: w, label: JAAR_TAB_LABEL[w] }
}

export interface BadgeInvoer {
  status: DossierStatus
  /** Open controles van het opgeslagen jaar (`JaarOverzicht.controles`); ontbreekt = onbekend, dan geen badge. */
  controles?: ControleTelling
  staat: AangifteStaat | null
}

/** De badges van een jaar. Zie de kop van dit bestand. */
export function jaarBadges({ status, controles, staat }: BadgeInvoer): JaarBadges {
  const badges: JaarBadges = {}
  const fouten = controles?.fouten ?? 0
  if (fouten > 0 && controlesStreng(status, staat)) {
    badges.invoer = { tekst: String(fouten), srTekst: `${fouten} ${fouten === 1 ? 'fout' : 'fouten'} open` }
  }
  const tellingen = Object.values(staat?.samenvatting?.invulhulp ?? {})
  const afgevinkt = tellingen.reduce((s, t) => s + Math.max(0, t?.afgevinkt ?? 0), 0)
  const totaal = tellingen.reduce((s, t) => s + Math.max(0, t?.totaal ?? 0), 0)
  if (afgevinkt > 0 && totaal > 0) {
    badges.aangifte = { tekst: `${afgevinkt}/${totaal}`, srTekst: `${afgevinkt} van ${totaal} ingevuld en gecontroleerd` }
  }
  return badges
}
