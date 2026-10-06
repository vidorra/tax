/**
 * Ronde 2 (A2): veldregister en regelingen van WoningSectie (met leningdelen, eigenwoningreserve en bijleenregeling),
 * Box2Sectie (met box 2-verlies en belastingkorting) en AanslagSectie (zonder de voortwenteling, die registreert A5).
 * Eén eigenaar per veld (ontwerp 6.4): wie de sectie bezit, registreert de velden.
 *
 * Sectie-ankers: 'woning', 'box2', en voor de persoonsvelden 'aanslag-{persoon}' (in de editor `aanslag-A`; de persoon
 * staat in de match).
 */
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import type { RegelingItem, VeldMatch, VeldregisterItem } from './types'

const naam = (invoer: HuishoudenInvoer, id?: PersoonId) => {
  const n = invoer.personen.find((p) => p.id === id)?.naam?.trim()
  return n ? n : `Persoon ${id ?? 'A'}`
}
const metPersoon = (label: string) => (m: VeldMatch, invoer: HuishoudenInvoer) => (invoer.personen.length > 1 ? `${label}, ${naam(invoer, m.persoon)}` : label)
const lening = (label: string) => (m: VeldMatch, invoer: HuishoudenInvoer) => {
  const l = invoer.eigenWoning?.leningdelen?.find((x, i) => (x.id ?? String(i)) === m.sleutels[0])
  return `${label}, ${l?.omschrijving?.trim() || 'leningdeel'}`
}
const box2 = (label: string) => (m: VeldMatch, invoer: HuishoudenInvoer) => {
  const b = invoer.box2?.find((x, i) => (x.id ?? String(i)) === m.sleutels[0])
  return invoer.personen.length > 1 && b ? `${label}, BV van ${naam(invoer, b.eigenaar)}` : label
}

const WONING = { sectie: 'woning', sectieNaam: 'Eigen woning' }

// Wat er op de pagina staat, zoals WoningSectieInhoud en VerhuisdSituatie het tekenen: het blok Verhuisd zodra een van
// zijn onderdelen bestaat, de verkoop alleen met een vorige woning, de periode alleen als die is ingevuld.
type Bestaat = NonNullable<VeldregisterItem['bestaat']>
const verhuisd: Bestaat = (_m, i) => Boolean(i.eigenWoning && (i.eigenWoning.vorigeWoning || i.eigenWoning.aankoop || i.eigenWoning.eigenwoningreserve?.length || i.eigenWoning.verbeteringen?.length))
const metVorige: Bestaat = (_m, i) => Boolean(i.eigenWoning?.vorigeWoning)
const metPeriode: Bestaat = (_m, i) => Boolean(i.eigenWoning?.periodeHoofdverblijf)
const twee = (b: Bestaat): Bestaat => (m, i) => i.personen.length > 1 && b(m, i)
const BOX2 = { sectie: 'box2', sectieNaam: 'Aanmerkelijk belang (box 2)' }
const AANSLAG = { sectie: 'aanslag-{persoon}', sectieNaam: 'Voorlopige aanslag en verliezen' }
const VERHUISD = ['verhuizen', 'verhuisd', 'overwaarde', 'bijleenregeling', 'eigenwoningreserve', 'verkoop woning', 'hypotheek']

export const PRIVE_VELDEN: VeldregisterItem[] = [
  // Zonder woning: de schakelaar "Eigen woning als hoofdverblijf" is de ingang (WoningSectieInhoud zet dan data-veld).
  {
    patroon: 'eigenWoning',
    label: 'Eigen woning als hoofdverblijf',
    ...WONING,
    synoniemen: ['eigen woning', 'hypotheek', 'hypotheekrente', 'woz', 'woz-waarde', 'huis', 'koopwoning', 'eigenwoningforfait', 'leningdeel', 'verhuizen', 'verhuisd', 'gekocht'],
    bestaat: (_m, i) => !i.eigenWoning,
    nogNietIngevuld: () => true,
  },
  // Eigen woning
  { patroon: 'eigenWoning/woz', label: 'WOZ-waarde', ...WONING, synoniemen: ['woz', 'eigen woning', 'eigenwoningforfait'] },
  { patroon: 'eigenWoning/rente', label: 'Betaalde hypotheekrente', ...WONING, synoniemen: ['hypotheek', 'hypotheekrente', 'rente'] },
  { patroon: 'eigenWoning/financieringskosten', label: 'Financieringskosten', ...WONING, synoniemen: ['hypotheek', 'advieskosten', 'notaris'] },
  { patroon: 'eigenWoning/erfpacht', label: 'Erfpacht', ...WONING, synoniemen: ['canon'] },
  { patroon: 'eigenWoning/periodeHoofdverblijf.van', label: 'Hoofdverblijf van', ...WONING, bestaat: metPeriode, synoniemen: ['verhuizen', 'deel van het jaar'] },
  { patroon: 'eigenWoning/periodeHoofdverblijf.tot', label: 'Hoofdverblijf tot en met', ...WONING, bestaat: metPeriode, synoniemen: ['verhuizen', 'deel van het jaar'] },
  { patroon: 'eigenWoning/leningdeel:*/omschrijving', label: lening('Omschrijving'), ...WONING, synoniemen: ['hypotheek', 'leningdeel'] },
  { patroon: 'eigenWoning/leningdeel:*/hoofdsom', label: lening('Hoofdsom'), ...WONING, synoniemen: ['hypotheek', 'leningdeel', 'lening'] },
  { patroon: 'eigenWoning/leningdeel:*/startdatum', label: lening('Startdatum'), ...WONING, synoniemen: ['hypotheek', 'leningdeel'] },
  { patroon: 'eigenWoning/leningdeel:*/aflossingsvorm', label: lening('Aflossingsvorm'), ...WONING, synoniemen: ['hypotheek', 'aflossingsvrij', 'annuïtair', 'lineair'] },
  { patroon: 'eigenWoning/leningdeel:*/rente', label: lening('Betaalde rente'), ...WONING, synoniemen: ['hypotheek', 'hypotheekrente'] },
  { patroon: 'eigenWoning/leningdeel:*/overgangsrecht', label: lening('Overgangsrecht'), ...WONING, synoniemen: ['hypotheek', 'oude lening', 'vóór 2013'] },
  { patroon: 'eigenWoning/leningdeel:*/standBegin', label: lening('Schuld op 1 januari'), ...WONING, synoniemen: ['hypotheek', 'stand', 'restschuld'] },
  { patroon: 'eigenWoning/leningdeel:*/standEind', label: lening('Schuld op 31 december'), ...WONING, synoniemen: ['hypotheek', 'stand', 'restschuld'] },
  { patroon: 'eigenWoning/vorigeWoning.leverdatum', label: 'Leverdatum vorige woning', ...WONING, bestaat: metVorige, synoniemen: VERHUISD },
  { patroon: 'eigenWoning/vorigeWoning.verkoopprijs', label: 'Verkoopprijs vorige woning', ...WONING, bestaat: metVorige, synoniemen: VERHUISD },
  { patroon: 'eigenWoning/vorigeWoning.verkoopkosten', label: 'Verkoopkosten vorige woning', ...WONING, bestaat: metVorige, synoniemen: VERHUISD },
  { patroon: 'eigenWoning/vorigeWoning.eigenwoningschuld', label: 'Eigenwoningschuld bij verkoop', ...WONING, bestaat: metVorige, synoniemen: VERHUISD },
  { patroon: 'eigenWoning/vorigeWoning.aandeelA', label: 'Deel van de vorige woning', ...WONING, bestaat: twee(metVorige), synoniemen: VERHUISD },
  { patroon: 'eigenWoning/eigenwoningreserve', label: 'Eigenwoningreserve', ...WONING, bestaat: (_m, i) => (i.eigenWoning?.eigenwoningreserve?.length ?? 0) > 0, synoniemen: VERHUISD },
  { patroon: 'eigenWoning/aankoop.leverdatum', label: 'Leverdatum nieuwe woning', ...WONING, bestaat: verhuisd, synoniemen: [...VERHUISD, 'aankoop', 'gekocht'] },
  { patroon: 'eigenWoning/aankoop.koopsom', label: 'Koopsom nieuwe woning', ...WONING, bestaat: verhuisd, synoniemen: [...VERHUISD, 'aankoop', 'gekocht', 'aankoopprijs'] },
  { patroon: 'eigenWoning/aankoop.kostenKoper', label: 'Kosten koper', ...WONING, bestaat: verhuisd, synoniemen: [...VERHUISD, 'aankoop', 'overdrachtsbelasting'] },
  { patroon: 'eigenWoning/aankoop.aandeelA', label: 'Deel van de nieuwe woning', ...WONING, bestaat: twee(verhuisd), synoniemen: VERHUISD },
  { patroon: 'eigenWoning/verbeteringen', label: 'Verbouwing of onderhoud', ...WONING, bestaat: verhuisd, synoniemen: ['verbouwing', 'verbetering', 'onderhoud', 'eigenwoningreserve'] },
  // Box 2
  { patroon: 'box2:*/eigenaar', label: box2('Aandeelhouder'), ...BOX2, synoniemen: ['aanmerkelijk belang', 'bv', 'dga'] },
  { patroon: 'box2:*/dividend', label: box2('Dividend'), ...BOX2, synoniemen: ['aanmerkelijk belang', 'bv', 'dga', 'dividend'] },
  { patroon: 'box2:*/ingehoudenDividendbelasting', label: box2('Ingehouden dividendbelasting'), ...BOX2, synoniemen: ['aanmerkelijk belang', 'dividendbelasting'] },
  { patroon: 'box2:*/vervreemdingsvoordeel', label: box2('Vervreemdingsvoordeel'), ...BOX2, synoniemen: ['aanmerkelijk belang', 'verkoop aandelen', 'verlies box 2'] },
  { patroon: 'box2:*/schuldAanBV', label: box2('Schuld aan de BV'), ...BOX2, synoniemen: ['aanmerkelijk belang', 'excessief lenen', 'rekening-courant'] },
  { patroon: 'persoon:*/box2Verliezen', label: metPersoon('Verlies box 2 uit eerdere jaren'), ...BOX2, bestaat: (_m, i) => i.personen.some((p) => (p.box2Verliezen ?? []).length > 0), synoniemen: ['verlies box 2', 'aanmerkelijk belang', 'verliesverrekening'] },
  { patroon: 'persoon:*/box2InkomenVorigJaar', label: metPersoon('Box 2-inkomen vorig jaar'), ...BOX2, bestaat: (m, i) => (i.box2 ?? []).some((b) => b.eigenaar === m.persoon && (b.vervreemdingsvoordeel ?? 0) < 0), synoniemen: ['verlies box 2', 'terugwenteling'] },
  { patroon: 'persoon:*/box2Belastingkorting.verzoek', label: metPersoon('Geen aanmerkelijk belang meer (belastingkorting)'), ...BOX2, bestaat: (_m, i) => i.personen.some((p) => Boolean(p.box2Belastingkorting?.verzoek || (p.box2Belastingkorting?.lopend ?? []).length > 0)), synoniemen: ['verlies box 2', 'aanmerkelijk belang', 'belastingkorting'] },
  // Aanslag (zonder de voortwenteling)
  { patroon: 'persoon:*/voorlopigeAanslagIB', label: metPersoon('Voorlopige aanslag inkomstenbelasting'), ...AANSLAG, synoniemen: ['voorlopige aanslag', 'va', 'voorlopige teruggaaf'] },
  { patroon: 'persoon:*/voorlopigeAanslagZvw', label: metPersoon('Voorlopige aanslag Zvw'), ...AANSLAG, synoniemen: ['voorlopige aanslag', 'zorgverzekeringswet', 'zvw'] },
  { patroon: 'persoon:*/voorlopigeAanslagDetails.ib.dagtekening', label: metPersoon('Dagtekening voorlopige aanslag inkomstenbelasting'), ...AANSLAG, bestaat: (m, i) => (i.personen.find((p) => p.id === m.persoon)?.voorlopigeAanslagIB ?? 0) !== 0, synoniemen: ['voorlopige aanslag', 'termijnen'] },
  { patroon: 'persoon:*/voorlopigeAanslagDetails.ib.betaald', label: metPersoon('Al betaald op de voorlopige aanslag inkomstenbelasting'), ...AANSLAG, bestaat: (m, i) => (i.personen.find((p) => p.id === m.persoon)?.voorlopigeAanslagIB ?? 0) !== 0, synoniemen: ['voorlopige aanslag', 'termijnen'] },
  { patroon: 'persoon:*/voorlopigeAanslagDetails.zvw.dagtekening', label: metPersoon('Dagtekening voorlopige aanslag Zvw'), ...AANSLAG, bestaat: (m, i) => (i.personen.find((p) => p.id === m.persoon)?.voorlopigeAanslagZvw ?? 0) !== 0, synoniemen: ['voorlopige aanslag', 'zvw'] },
  { patroon: 'persoon:*/voorlopigeAanslagDetails.zvw.betaald', label: metPersoon('Al betaald op de voorlopige aanslag Zvw'), ...AANSLAG, bestaat: (m, i) => (i.personen.find((p) => p.id === m.persoon)?.voorlopigeAanslagZvw ?? 0) !== 0, synoniemen: ['voorlopige aanslag', 'zvw'] },
  { patroon: 'persoon:*/verliezen', label: metPersoon('Verliezen uit eerdere jaren (box 1)'), ...AANSLAG, synoniemen: ['verlies', 'verliesverrekening'] },
  { patroon: 'persoon:*/nietBenutteZelfstandigenaftrek', label: metPersoon('Niet-benutte zelfstandigenaftrek'), ...AANSLAG, synoniemen: ['zelfstandigenaftrek'] },
  { patroon: 'persoon:*/restantPgaVorigJaar', label: metPersoon('Persoonsgebonden aftrek die vorig jaar niet paste'), ...AANSLAG, synoniemen: ['persoonsgebonden aftrek', 'zorgkosten', 'giften'] },
]

const ew = (invoer: HuishoudenInvoer) => invoer.eigenWoning

export const PRIVE_REGELINGEN: RegelingItem[] = [
  {
    id: 'verhuisd',
    naam: 'Verhuisd, gekocht of verkocht',
    uitleg: 'Overwaarde van je vorige woning (eigenwoningreserve) en de bijleenregeling bij een nieuwe woning of verbouwing.',
    synoniemen: VERHUISD,
    plaats: 'woning',
    actiefBij: (invoer) => {
      const w = ew(invoer)
      if (!w) return []
      if (w.vorigeWoning) return [{ veld: 'eigenWoning/vorigeWoning.verkoopprijs', waar: 'Eigen woning' }]
      if (w.aankoop) return [{ veld: 'eigenWoning/aankoop.koopsom', waar: 'Eigen woning' }]
      if ((w.eigenwoningreserve ?? []).length > 0) return [{ veld: 'eigenWoning/eigenwoningreserve', waar: 'Eigen woning' }]
      if ((w.verbeteringen ?? []).length > 0) return [{ veld: 'eigenWoning/verbeteringen', waar: 'Eigen woning' }]
      return []
    },
    kiezers: (invoer) => (ew(invoer) ? [{ elementId: 'situaties-woning', waar: 'Eigen woning' }] : []),
  },
  {
    id: 'periode-hoofdverblijf',
    naam: 'Niet het hele jaar in deze woning',
    uitleg: 'Het eigenwoningforfait telt alleen voor de dagen dat de woning je hoofdverblijf was.',
    synoniemen: ['verhuizen', 'deel van het jaar', 'hoofdverblijf'],
    plaats: 'woning',
    actiefBij: (invoer) => (ew(invoer)?.periodeHoofdverblijf ? [{ veld: 'eigenWoning/periodeHoofdverblijf.van', waar: 'Eigen woning' }] : []),
    kiezers: (invoer) => (ew(invoer) ? [{ elementId: 'situaties-woning', waar: 'Eigen woning' }] : []),
  },
  {
    id: 'box2-verlies',
    naam: 'Verlies box 2 uit eerdere jaren',
    uitleg: 'Een verlies uit aanmerkelijk belang dat je nog kunt verrekenen met box 2-inkomen.',
    synoniemen: ['verlies box 2', 'aanmerkelijk belang', 'verliesverrekening'],
    plaats: 'box2',
    actiefBij: (invoer) => invoer.personen.filter((p) => (p.box2Verliezen ?? []).length > 0).map((p) => ({ veld: `persoon:${p.id}/box2Verliezen`, waar: naam(invoer, p.id) })),
    kiezers: () => [{ elementId: 'situaties-box2', waar: 'Aanmerkelijk belang (box 2)' }],
  },
  {
    id: 'box2-korting',
    naam: 'Geen aanmerkelijk belang meer',
    uitleg: 'Een verlies dat je niet meer kunt verrekenen, omzetten in een korting op de belasting in box 1.',
    synoniemen: ['belastingkorting', 'verlies box 2', 'aanmerkelijk belang', 'bv verkocht'],
    plaats: 'box2',
    actiefBij: (invoer) =>
      invoer.personen
        .filter((p) => p.box2Belastingkorting?.verzoek || (p.box2Belastingkorting?.lopend ?? []).length > 0)
        .map((p) => ({ veld: `persoon:${p.id}/box2Belastingkorting.verzoek`, waar: naam(invoer, p.id) })),
    kiezers: () => [{ elementId: 'situaties-box2', waar: 'Aanmerkelijk belang (box 2)' }],
  },
]
