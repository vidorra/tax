import type { Status } from '@/lib/tax/types'

/**
 * Register van kennisbankartikelen. Index, sitemap, gerelateerde artikelen en
 * de metadata van elke artikelpagina lezen hieruit.
 */
export interface KennisbankArtikel {
  slug: string
  titel: string
  /** Kortere titel voor kaarten en kruimelpad. */
  kortTitel: string
  /** Meta-description en intro op de kaart (max. circa 160 tekens). */
  beschrijving: string
  categorie: 'Jaarwisseling' | 'Heffingskortingen' | 'Box 3' | 'Pensioen' | 'Ondernemer' | 'Toeslagen'
  bijgewerkt: string
  leestijdMinuten: number
  /** Zet als de inhoud (deels) afhangt van een voorstel of schatting. */
  status?: Status
  calculator: { href: string; label: string }
  gerelateerd: string[]
}

export const ARTIKELEN: KennisbankArtikel[] = [
  {
    slug: 'wat-verandert-er-in-2027',
    titel: "Wat verandert er in 2027 voor zzp'ers?",
    kortTitel: 'Wat verandert er in 2027',
    beschrijving:
      'Zelfstandigenaftrek naar € 900, nieuwe tarieven in box 1, lagere combinatiekorting en twee varianten voor box 3. Per maatregel wat vaststaat en wat nog voorstel is.',
    categorie: 'Jaarwisseling',
    bijgewerkt: '2026-10-04',
    leestijdMinuten: 8,
    status: 'voorstel',
    calculator: { href: '/2027', label: 'Bereken 2027 naast 2026' },
    gerelateerd: ['box-3-2027-twee-varianten', 'zelfstandigenaftrek-en-mkb-vrijstelling', 'combinatiekorting-iack'],
  },
  {
    slug: 'combinatiekorting-iack',
    titel: 'Inkomensafhankelijke combinatiekorting (IACK) voor zzp-ouders',
    kortTitel: 'Combinatiekorting (IACK)',
    beschrijving:
      'Wie heeft recht op de IACK, hoe werkt de zesmaandenregel en waarom krijgt alleen de minstverdienende partner de korting? Met de bedragen 2024 tot en met 2027 en de afbouw tot 2035.',
    categorie: 'Heffingskortingen',
    bijgewerkt: '2026-10-04',
    leestijdMinuten: 6,
    status: 'voorstel',
    calculator: { href: '/', label: 'Reken je combinatiekorting uit' },
    gerelateerd: ['kinderopvangtoeslag-voor-zzpers', 'wat-verandert-er-in-2027'],
  },
  {
    slug: 'box-3-2027-twee-varianten',
    titel: 'Box 3 in 2027: twee varianten naast elkaar',
    kortTitel: 'Box 3 in 2027',
    beschrijving:
      'Het Belastingplan 2027 en de brief van 29 september 2026 rekenen box 3 heel anders. Wat het verschil is, hoe tegenbewijs werkt en wat er vanaf 2028 op tafel ligt.',
    categorie: 'Box 3',
    bijgewerkt: '2026-10-04',
    leestijdMinuten: 7,
    status: 'voorstel',
    calculator: { href: '/box-3', label: 'Bereken je box 3' },
    gerelateerd: ['wat-verandert-er-in-2027', 'jaarruimte-en-reserveringsruimte'],
  },
  {
    slug: 'jaarruimte-en-reserveringsruimte',
    titel: 'Jaarruimte en reserveringsruimte: zo werkt lijfrenteaftrek voor zzp’ers',
    kortTitel: 'Jaarruimte en reserveringsruimte',
    beschrijving:
      'Hoe je jaarruimte berekent, waarom je eerst je oudste reserveringsruimte gebruikt, wat de FOR-omzetting doet en hoe de aftrek van AOV-premies werkt.',
    categorie: 'Pensioen',
    bijgewerkt: '2026-10-04',
    leestijdMinuten: 7,
    calculator: { href: '/jaarruimte', label: 'Bereken je jaarruimte' },
    gerelateerd: ['zelfstandigenaftrek-en-mkb-vrijstelling', 'urencriterium'],
  },
  {
    slug: 'zelfstandigenaftrek-en-mkb-vrijstelling',
    titel: 'Zelfstandigenaftrek en MKB-winstvrijstelling: van € 3.750 naar € 900',
    kortTitel: 'Zelfstandigenaftrek en MKB',
    beschrijving:
      'De zelfstandigenaftrek daalt van € 3.750 in 2024 naar € 900 in 2027. Hoe de MKB-winstvrijstelling werkt, wat de tariefmaatregel doet en waarom extra winst zo’n 44,7% kost.',
    categorie: 'Ondernemer',
    bijgewerkt: '2026-10-04',
    leestijdMinuten: 6,
    calculator: { href: '/', label: 'Bereken je belastbare winst' },
    gerelateerd: ['urencriterium', 'wat-verandert-er-in-2027'],
  },
  {
    slug: 'kinderopvangtoeslag-voor-zzpers',
    titel: "Kinderopvangtoeslag voor zzp'ers",
    kortTitel: 'Kinderopvangtoeslag',
    beschrijving:
      'Hoe de kinderopvangtoeslag werkt als je inkomen schommelt, wat er in 2026 en 2027 verandert, de grens van 230 uur en de nieuwe financiering die per 2029 gepland is.',
    categorie: 'Toeslagen',
    bijgewerkt: '2026-10-04',
    leestijdMinuten: 6,
    status: 'voorstel',
    calculator: { href: '/kinderopvangtoeslag', label: 'Bereken je kinderopvangtoeslag' },
    gerelateerd: ['combinatiekorting-iack', 'jaarruimte-en-reserveringsruimte'],
  },
  {
    slug: 'urencriterium',
    titel: 'Het urencriterium: 1.225 uur, verlof en bewijs',
    kortTitel: 'Urencriterium',
    beschrijving:
      'Wat telt mee voor de 1.225 uur, hoe het grotendeelscriterium werkt, wat zwangerschapsverlof doet en waarom je uren moet kunnen aantonen. Plus de stand van de Wet DBA.',
    categorie: 'Ondernemer',
    bijgewerkt: '2026-10-04',
    leestijdMinuten: 6,
    calculator: { href: '/', label: 'Bereken je ondernemersaftrek' },
    gerelateerd: ['zelfstandigenaftrek-en-mkb-vrijstelling', 'jaarruimte-en-reserveringsruimte'],
  },
]

export function vindArtikel(slug: string): KennisbankArtikel {
  const artikel = ARTIKELEN.find((a) => a.slug === slug)
  if (!artikel) throw new Error(`Onbekend kennisbankartikel: ${slug}`)
  return artikel
}

export function artikelHref(slug: string): string {
  return `/kennisbank/${slug}`
}
