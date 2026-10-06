/**
 * Ronde 2 (A5): veldregister en regelingen van VermogenSectie (posities, bronbelastingregels, schulden, tegenbewijs),
 * de voortwenteling in AanslagSectie en de partnersituatie bij de onderneming (beloning, werkruimte,
 * terbeschikkingstellingen). Eén eigenaar per veld (ontwerp 6.4): deze velden registreert alleen dit bestand.
 */
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import { itemSleutel } from '../ids'
import { veldVan } from '../veld'
import { bronbelastingRegels } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { landVanRegel } from '@/lib/tax/modules/box3/bronbelasting'
import { metPartner } from '@/lib/tax/modules/partner'
import type { RegelingItem, VeldMatch, VeldregisterItem } from './types'

const naamPersoon = (invoer: HuishoudenInvoer, id: string | undefined) => {
  const p = invoer.personen.find((x) => x.id === id)
  return p?.naam?.trim() ? p.naam.trim() : `Persoon ${id ?? ''}`.trim()
}
const positieNaam = (invoer: HuishoudenInvoer, id: string | undefined) => invoer.box3.posities.find((x) => x.id === id)?.omschrijving.trim() || 'bezitting'
const schuldNaam = (invoer: HuishoudenInvoer, id: string | undefined) => invoer.box3.schulden.find((x) => x.id === id)?.omschrijving.trim() || 'schuld'
const ondernemingNaam = (invoer: HuishoudenInvoer, m: VeldMatch) => {
  const p = invoer.personen.find((x) => x.id === m.sleutels[0])
  const o = p?.ondernemingen.find((x, i) => itemSleutel(x, i) === m.sleutels[1])
  return `${o?.naam?.trim() || 'onderneming'}, ${naamPersoon(invoer, m.sleutels[0])}`
}
const tbsNaam = (invoer: HuishoudenInvoer, m: VeldMatch) => {
  const p = invoer.personen.find((x) => x.id === m.sleutels[0])
  const t = p?.terbeschikkingstellingen?.find((x) => x.id === m.sleutels[1])
  return `${t?.omschrijving?.trim() || 'terbeschikkingstelling'}, ${naamPersoon(invoer, m.sleutels[0])}`
}
const regelLand = (invoer: HuishoudenInvoer, m: VeldMatch) => {
  const x = invoer.box3.posities.find((p) => p.id === m.sleutels[0])
  const r = x ? bronbelastingRegels(x).find((b) => b.id === m.sleutels[1]) : undefined
  const land = r ? landVanRegel(r).land?.naam ?? r.land : ''
  return `${positieNaam(invoer, m.sleutels[0])}${land ? `, ${land}` : ''}`
}

const VERMOGEN = { sectie: 'vermogen', sectieNaam: 'Vermogen' }
const positie = (veld: string, label: string, synoniemen?: string[]): VeldregisterItem => ({
  patroon: `box3/positie:*/${veld}`,
  label: (m, invoer) => `${label}, ${positieNaam(invoer, m.sleutels[0])}`,
  ...VERMOGEN,
  ...(synoniemen ? { synoniemen } : {}),
})
const bron = (veld: string, label: string, synoniemen?: string[]): VeldregisterItem => ({
  patroon: `box3/positie:*/bronbelasting:*/${veld}`,
  label: (m, invoer) => `${label}, ${regelLand(invoer, m)}`,
  ...VERMOGEN,
  synoniemen: ['buitenlandse bronbelasting', 'dividendbelasting buitenland', ...(synoniemen ?? [])],
})
const schuld = (veld: string, label: string): VeldregisterItem => ({
  patroon: `box3/schuld:*/${veld}`,
  label: (m, invoer) => `${label}, ${schuldNaam(invoer, m.sleutels[0])}`,
  ...VERMOGEN,
  synoniemen: ['schulden box 3'],
})
const partner = (veld: string, label: string, synoniemen?: string[]): VeldregisterItem => ({
  patroon: `persoon:*/onderneming:*/${veld}`,
  label: (m, invoer) => `${label}, ${ondernemingNaam(invoer, m)}`,
  sectie: 'ondernemingen-{persoon}',
  sectieNaam: 'Ondernemingen',
  synoniemen: ['partner', 'meewerkende partner', ...(synoniemen ?? [])],
})
const tbs = (veld: string, label: string): VeldregisterItem => ({
  patroon: `persoon:*/terbeschikkingstelling:*/${veld}`,
  label: (m, invoer) => `${label}, ${tbsNaam(invoer, m)}`,
  sectie: 'ondernemingen-{persoon}',
  sectieNaam: 'Ondernemingen',
  synoniemen: ['terbeschikkingstelling', 'verhuur aan de zaak', 'lening aan de zaak', 'tbs'],
})

/** De onderneming van een veld met 'persoon:*\/onderneming:*'. */
function ondernemingVan(m: VeldMatch, invoer: HuishoudenInvoer) {
  const p = invoer.personen.find((x) => x.id === m.sleutels[0])
  const index = p ? p.ondernemingen.findIndex((x, i) => itemSleutel(x, i) === m.sleutels[1]) : -1
  return p && index >= 0 ? { p, o: p.ondernemingen[index], index } : null
}

/** Terbeschikkingstellingen van de partner aan deze onderneming (zoals tbsVoorOnderneming in PartnerSituatie). */
function tbsAan(invoer: HuishoudenInvoer, m: VeldMatch) {
  const x = ondernemingVan(m, invoer)
  if (!x) return []
  const partner = invoer.personen.find((q) => q.id !== x.p.id)
  return (partner?.terbeschikkingstellingen ?? []).filter((t) => {
    if (t.aan.persoon !== x.p.id) return false
    if (t.aan.ondernemingId) return t.aan.ondernemingId === itemSleutel(x.o, x.index)
    if (t.aan.ondernemingIndex !== undefined) return t.aan.ondernemingIndex === x.index
    return x.p.ondernemingen.length === 1
  })
}

/** De situatie "Partner werkt mee" staat op de pagina (PARTNER_SITUATIE.actief). */
const partnerSituatie: NonNullable<VeldregisterItem['bestaat']> = (m, invoer) => {
  const x = ondernemingVan(m, invoer)
  return Boolean(x && (x.o.samenwerkingMetPartner !== undefined || x.o.meewerkendePartner !== undefined || tbsAan(invoer, m).length > 0))
}
const metWerkruimte: NonNullable<VeldregisterItem['bestaat']> = (m, invoer) => partnerSituatie(m, invoer) && tbsAan(invoer, m).some((t) => t.soort === 'werkruimte')

/** De velden van de beloning staan er alleen bij meewerkaftrek of een arbeidsbeloning (PartnerSituatie, keuzeVan). */
const meewerkend: NonNullable<VeldregisterItem['bestaat']> = (m, invoer) => {
  const o = ondernemingVan(m, invoer)?.o
  if (!o) return false
  if (o.samenwerkingMetPartner) return o.samenwerkingMetPartner === 'meewerkaftrek' || o.samenwerkingMetPartner === 'arbeidsbeloning'
  return Boolean(o.meewerkendePartner)
}

export const BRONBELASTING_PARTNER_VELDEN: VeldregisterItem[] = [
  // Zonder bezittingen: de knop Bezitting toevoegen is de ingang voor "bankrekening" of "spaarrekening".
  {
    patroon: 'box3/posities',
    label: 'Bezitting toevoegen',
    ...VERMOGEN,
    synoniemen: ['bankrekening', 'spaarrekening', 'sparen', 'beleggingen', 'aandelen', 'crypto', 'box 3', 'vermogen'],
    bestaat: (_m, invoer) => invoer.box3.posities.length === 0,
    nogNietIngevuld: () => true,
  },
  positie('omschrijving', 'Omschrijving', ['bankrekening', 'spaarrekening', 'beleggingen', 'box 3']),
  positie('categorie', 'Categorie'),
  positie('eigenaar', 'Eigenaar'),
  positie('waardeBegin', 'Waarde 1 januari', ['peildatum', 'saldo', 'bankrekening', 'spaarrekening']),
  positie('waardeEind', 'Waarde 1 januari volgend jaar'),
  positie('stortingen', 'Gestort', ['werkelijk rendement']),
  positie('onttrekkingen', 'Opgenomen', ['werkelijk rendement']),
  positie('directeOpbrengsten', 'Rente, dividend of huur', ['werkelijk rendement']),
  // Alleen bij vastgoed (VermogenSectie toont het verder alleen als er eigen gebruik is; dat weten we hier niet zeker).
  { ...positie('woz.dagenEigenGebruik', 'Dagen eigen gebruik'), bestaat: (m, invoer) => invoer.box3.posities.find((x) => x.id === m.sleutels[0])?.categorie === 'onroerend' },
  positie('dividendbelasting', 'Ingehouden Nederlandse dividendbelasting', ['dividendbelasting']),
  bron('land', 'Land bronbelasting', ['W-8BEN', 'verdrag']),
  bron('soort', 'Soort bronbelasting'),
  bron('brutoInkomsten', 'Bruto inkomsten'),
  bron('bedrag', 'Ingehouden bronbelasting'),
  bron('datum', 'Datum van inhouding'),
  bron('verdragstarief', 'Verdragstarief', ['verdrag']),
  schuld('omschrijving', 'Omschrijving schuld'),
  schuld('eigenaar', 'Eigenaar schuld'),
  schuld('waardeBegin', 'Schuld 1 januari'),
  schuld('waardeEind', 'Schuld 1 januari volgend jaar'),
  schuld('betaaldeRente', 'Betaalde rente'),
  { patroon: 'box3/tegenbewijs', label: 'Tegenbewijs: werkelijk rendement', ...VERMOGEN, synoniemen: ['werkelijk rendement', 'opgaaf werkelijk rendement'] },
  {
    patroon: 'persoon:*/voortgewenteldeBronbelasting',
    label: (m, invoer) => `Bronbelasting uit eerdere jaren, ${naamPersoon(invoer, m.persoon ?? m.sleutels[0])}`,
    sectie: 'aanslag-{persoon}',
    sectieNaam: 'Voorlopige aanslag en verliezen',
    synoniemen: ['voortwenteling', 'voortgewentelde bronbelasting', 'beschikking bronbelasting'],
    // Zoals toonVoortwenteling: alleen met een bedrag uit eerdere jaren of met ingehouden bronbelasting dit jaar.
    bestaat: (m, invoer) =>
      (invoer.personen.find((p) => p.id === m.persoon)?.voortgewenteldeBronbelasting ?? 0) > 0 || invoer.box3.posities.some((x) => bronbelastingRegels(x).some((r) => r.bedrag > 0)),
  },
  { ...partner('samenwerkingMetPartner', 'Hoe werkt je partner mee?', ['meewerkaftrek', 'arbeidsbeloning']), bestaat: partnerSituatie },
  { ...partner('meewerkendePartner.vergoeding', 'Beloning partner per jaar', ['arbeidsbeloning', 'beloning partner']), bestaat: meewerkend },
  { ...partner('meewerkendePartner.uren', 'Uren meewerken partner', ['meewerkaftrek']), bestaat: meewerkend },
  { ...partner('meewerkendePartner.vergoedingInKosten', 'Beloning zit al in de winst'), bestaat: meewerkend },
  { ...partner('werkruimte.zelfstandig', 'Zelfstandige werkruimte', ['werkruimte']), bestaat: metWerkruimte },
  { ...partner('werkruimte.werkplekElders', 'Werkplek elders', ['werkruimte']), bestaat: metWerkruimte },
  { ...partner('werkruimte.deelInkomenIn', 'Deel van het inkomen in de werkruimte', ['werkruimte']), bestaat: metWerkruimte },
  { ...partner('werkruimte.deelInkomenInOfVanuit', 'Deel van het inkomen in of vanuit de werkruimte', ['werkruimte']), bestaat: metWerkruimte },
  tbs('omschrijving', 'Omschrijving'),
  tbs('soort', 'Soort'),
  tbs('vergoeding', 'Vergoeding per jaar'),
  tbs('kosten', 'Kosten'),
  tbs('afschrijving', 'Afschrijving'),
  tbs('waardeBijAanvang', 'Waarde bij aanvang'),
  tbs('boekwaardeBegin', 'Boekwaarde 1 januari'),
  tbs('box3PositieId', 'Bezitting in box 3'),
  tbs('vergoedingInKosten', 'Vergoeding zit al in de winst'),
  tbs('einde.datum', 'Einde'),
  { ...tbs('einde.opbrengst', 'Opbrengst bij einde'), bestaat: (m, invoer) => Boolean(invoer.personen.find((p) => p.id === m.sleutels[0])?.terbeschikkingstellingen?.find((t) => t.id === m.sleutels[1])?.einde) },
]

/** Id van de SituatieKiezer per onderneming (OndernemingSectie, A6) en het anker van het blok. */
export const kiezerId = (persoon: PersoonId, ondernemingId: string) => `situaties-${persoon}-${ondernemingId}`

export const BRONBELASTING_PARTNER_REGELINGEN: RegelingItem[] = [
  {
    id: 'partner',
    naam: 'Partner werkt mee of stelt iets ter beschikking',
    uitleg: 'Beloning, meewerkaftrek, of iets dat je partner verhuurt of uitleent aan de zaak',
    synoniemen: ['meewerkende partner', 'meewerkaftrek', 'arbeidsbeloning', 'beloning partner', 'verhuur aan de zaak', 'terbeschikkingstelling', 'tbs', 'lening aan de zaak'],
    plaats: 'onderneming',
    actiefBij: (invoer) =>
      invoer.personen.flatMap((p) =>
        p.ondernemingen.flatMap((o, i) => {
          const sleutel = itemSleutel(o, i)
          const partnerTbs = invoer.personen.some((x) => x.id !== p.id && (x.terbeschikkingstellingen ?? []).some((t) => t.aan.persoon === p.id && (t.aan.ondernemingId ?? String(t.aan.ondernemingIndex)) === sleutel))
          return o.samenwerkingMetPartner !== undefined || partnerTbs ? [{ veld: veldVan.onderneming(p.id, sleutel, 'samenwerkingMetPartner'), waar: `${o.naam || 'Onderneming'} · ${naamPersoon(invoer, p.id)}` }] : []
        }),
      ),
    kiezers: (invoer) =>
      metPartner(invoer)
        ? invoer.personen.flatMap((p) => p.ondernemingen.map((o, i) => ({ elementId: kiezerId(p.id, itemSleutel(o, i)), waar: `${o.naam || 'Onderneming'} · ${naamPersoon(invoer, p.id)}` })))
        : [],
  },
  {
    id: 'bronbelasting',
    naam: 'Buitenlandse bronbelasting',
    uitleg: 'Dividendbelasting die in het buitenland is ingehouden, per land verrekenen of terugvragen',
    synoniemen: ['dividendbelasting buitenland', 'W-8BEN', 'verdrag', 'verdragstarief', 'terugvragen', 'buitenlands dividend'],
    plaats: 'box3',
    actiefBij: (invoer) =>
      invoer.box3.posities.flatMap((x) => bronbelastingRegels(x).slice(0, 1).map((r) => ({ veld: veldVan.positie(x.id, `bronbelasting:${r.id}`, 'land'), waar: x.omschrijving.trim() || 'Bezitting' }))),
    kiezers: () => [],
  },
  {
    id: 'voortwenteling',
    naam: 'Bronbelasting uit eerdere jaren',
    uitleg: 'Buitenlandse bronbelasting die in een eerder jaar niet in je box 3-belasting paste en doorschuift',
    synoniemen: ['voortwenteling', 'voortgewentelde bronbelasting', 'beschikking bronbelasting'],
    plaats: 'aanslag',
    actiefBij: (invoer) =>
      invoer.personen.filter((p) => (p.voortgewenteldeBronbelasting ?? 0) > 0).map((p) => ({ veld: veldVan.persoon(p.id, 'voortgewenteldeBronbelasting'), waar: naamPersoon(invoer, p.id) })),
    kiezers: () => [],
  },
]
