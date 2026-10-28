/**
 * Siteconstanten: naam, basis-URL en navigatie. Geen fiscale getallen hier;
 * die staan uitsluitend in lib/tax/years.
 */

const STANDAARD_URL = 'http://localhost:3000'

/** Basis-URL zonder slash aan het eind, uit NEXT_PUBLIC_SITE_URL. */
export function siteUrl(bron: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const ruw = (bron ?? '').trim()
  if (!ruw) return STANDAARD_URL
  try {
    const url = new URL(ruw)
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
  } catch {
    return STANDAARD_URL
  }
}

export const SITE = {
  naam: "IB-calculator voor zzp'ers",
  korteNaam: 'IB-calculator',
  titel: "IB-calculator voor zzp'ers: inkomstenbelasting 2026 en 2027 berekenen",
  beschrijving:
    "Reken je inkomstenbelasting als zzp'er na: winst, ondernemersaftrek, box 1, 2 en 3, heffingskortingen, Zvw en toeslagen. Met uitleg per regel en een status per cijfer. Indicatieve berekening, geen fiscaal advies.",
  url: siteUrl(),
  locale: 'nl_NL',
  taal: 'nl',
  disclaimer: 'Indicatieve berekening, geen fiscaal advies',
  themaKleur: '#0F766E',
} as const

/**
 * Pad met slash aan het eind (next.config heeft trailingSlash: true), zodat
 * canonicals en sitemap gelijk zijn aan de echte URL.
 */
export function pad(href: string): string {
  if (!href || href === '/') return '/'
  const [basis, rest] = splitHash(href)
  const schoon = basis.startsWith('/') ? basis : `/${basis}`
  return (schoon.endsWith('/') ? schoon : `${schoon}/`) + rest
}

function splitHash(href: string): [string, string] {
  const i = href.search(/[?#]/)
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)]
}

/** Absolute URL voor sitemap, canonical en JSON-LD. */
export function absoluteUrl(href: string, basis: string = SITE.url): string {
  return `${basis}${pad(href)}`
}

/** Is de navigatielink actief voor dit pad? `/` alleen exact, de rest ook voor subpagina's. */
export function isActief(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false
  const huidig = normaliseer(pathname)
  const doel = normaliseer(href)
  if (doel === '/') return huidig === '/'
  return huidig === doel || huidig.startsWith(`${doel}/`)
}

function normaliseer(p: string): string {
  const [basis] = splitHash(p)
  const zonder = basis.replace(/\/+$/, '')
  return zonder === '' ? '/' : zonder
}

export type NavIcoon = 'calculator' | 'jaar' | 'kennisbank' | 'dossier'

export interface NavItem {
  href: string
  label: string
  /** Korte toelichting (mobiel menu, title). */
  omschrijving?: string
  icoon: NavIcoon
}

export const NAVIGATIE: NavItem[] = [
  { href: '/', label: 'Calculator', omschrijving: 'Snelle berekening voor één persoon', icoon: 'calculator' },
  { href: '/2026', label: '2026', omschrijving: 'Inkomstenbelasting 2026', icoon: 'jaar' },
  { href: '/2027', label: '2027', omschrijving: 'Inkomstenbelasting 2027 (voorstel)', icoon: 'jaar' },
  { href: '/kennisbank', label: 'Kennisbank', omschrijving: 'Uitleg over regels en wijzigingen', icoon: 'kennisbank' },
  { href: '/dossier', label: 'Dossier', omschrijving: 'Privédossier voor je huishouden', icoon: 'dossier' },
]

export interface FooterLink {
  href: string
  label: string
}

export const FOOTER_LINKS: FooterLink[] = [
  { href: '/over', label: 'Over deze tool' },
  { href: '/handleiding', label: 'Handleiding' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/disclaimer', label: 'Disclaimer' },
  { href: '/kennisbank', label: 'Kennisbank' },
]

/** Rekentools die in de footer en op de homepage terugkomen. */
export const REKENTOOLS: FooterLink[] = [
  { href: '/', label: 'Inkomstenbelasting berekenen' },
  { href: '/jaarruimte', label: 'Jaarruimte en lijfrente' },
  { href: '/kinderopvangtoeslag', label: 'Kinderopvangtoeslag' },
  { href: '/box-3', label: 'Box 3' },
  { href: '/bv-of-eenmanszaak', label: 'BV of eenmanszaak' },
  { href: '/middeling', label: 'Middeling' },
]

/** Publieke routes voor de sitemap (kennisbankartikelen komen uit het register). */
export const PUBLIEKE_ROUTES: Array<{ href: string; prioriteit: number; frequentie: 'daily' | 'weekly' | 'monthly' | 'yearly' }> = [
  { href: '/', prioriteit: 1, frequentie: 'weekly' },
  { href: '/2026', prioriteit: 0.9, frequentie: 'weekly' },
  { href: '/2027', prioriteit: 0.9, frequentie: 'weekly' },
  { href: '/jaarruimte', prioriteit: 0.8, frequentie: 'monthly' },
  { href: '/kinderopvangtoeslag', prioriteit: 0.8, frequentie: 'monthly' },
  { href: '/box-3', prioriteit: 0.8, frequentie: 'monthly' },
  { href: '/bv-of-eenmanszaak', prioriteit: 0.7, frequentie: 'monthly' },
  { href: '/middeling', prioriteit: 0.6, frequentie: 'monthly' },
  { href: '/kennisbank', prioriteit: 0.7, frequentie: 'weekly' },
  { href: '/over', prioriteit: 0.3, frequentie: 'yearly' },
  { href: '/handleiding', prioriteit: 0.3, frequentie: 'monthly' },
  { href: '/privacy', prioriteit: 0.2, frequentie: 'yearly' },
  { href: '/disclaimer', prioriteit: 0.2, frequentie: 'yearly' },
]

/** Paden die niet geïndexeerd worden. */
export const NIET_INDEXEREN = ['/dossier', '/api', '/admin'] as const
