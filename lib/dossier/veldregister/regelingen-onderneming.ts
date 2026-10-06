/**
 * Ronde 2 (A6): velden en regelingen van OndernemingSectie, ActivaInvoer, de bijzondere situaties van de onderneming
 * (staking, herinvesteringsreserve, kostenegalisatiereserve), de auto en de stakingslijfrente. Eén eigenaar per veld
 * (ontwerp 6.4): `naam` en `winstberekening.saldo` van de onderneming registreert A3 (basis.ts), niet hier.
 *
 * De patronen volgen de veld-id's die de editor als `data-veld` zet (lib/dossier/veld.ts):
 *   persoon:A/onderneming:ond-1/<veld>
 *   persoon:A/onderneming:ond-1/activa:<index>/<veld>
 *   persoon:A/onderneming:ond-1/investering:<id>/<veld>
 *   persoon:A/onderneming:ond-1/desinvestering:<index>/<veld>
 *   persoon:A/onderneming:ond-1/opdrachtgever:<index>/<veld>
 *   persoon:A/onderneming:ond-1/herinvesteringsreserve:<id>/<veld>
 *   persoon:A/onderneming:ond-1/egalisatiereserve:<id>/<veld>
 *   persoon:A/onderneming:ond-1/stakingspost:<index>/<veld>
 *   persoon:A/inkomensvoorziening.stakingslijfrente.<veld>
 */
import type { HuishoudenInvoer, OndernemingInvoer, PersoonInvoer, TaxYearParams } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { itemSleutel } from '../ids'
import { autoStand } from '../auto-velden'
import type { RegelingItem, VeldMatch, VeldregisterItem } from './types'

// Sectie-ankers op de jaarpagina zijn per persoon ('ondernemingen-A'); sectieVan() vult '{persoon}' in.
const ONDERNEMINGEN = { sectie: 'ondernemingen-{persoon}', sectieNaam: 'Ondernemingen' } as const
const PENSIOEN = { sectie: 'pensioen-{persoon}', sectieNaam: 'Pensioen en AOV' } as const

const persoonNaam = (p: PersoonInvoer | undefined, id: string | undefined) => (p?.naam?.trim() ? p.naam.trim() : `Persoon ${id ?? ''}`.trim())

/** "Label, Ontwerpstudio, Persoon A" (de onderneming uit de tweede sleutel van het patroon). */
function metOnderneming(label: string): (m: VeldMatch, invoer: HuishoudenInvoer) => string {
  return (m, invoer) => {
    const p = invoer.personen.find((x) => x.id === m.persoon)
    const o = p?.ondernemingen.find((x, i) => itemSleutel(x, i) === m.sleutels[1])
    return [label, o?.naam.trim() || undefined, persoonNaam(p, m.persoon)].filter(Boolean).join(', ')
  }
}

function metPersoon(label: string): (m: VeldMatch, invoer: HuishoudenInvoer) => string {
  return (m, invoer) => `${label}, ${persoonNaam(invoer.personen.find((x) => x.id === m.persoon), m.persoon)}`
}

/** De onderneming van een veld (persoon en onderneming uit de eerste twee sleutels). */
function ondernemingVan(m: VeldMatch, invoer: HuishoudenInvoer): OndernemingInvoer | undefined {
  const p = invoer.personen.find((x) => x.id === m.persoon)
  return p?.ondernemingen.find((x, i) => itemSleutel(x, i) === m.sleutels[1])
}

/** Een item uit een lijst van de onderneming op zijn sleutel (vaste id of index). */
const itemVan = <T,>(lijst: T[] | undefined, sleutel: string | undefined): T | undefined => lijst?.find((x, i) => itemSleutel(x as { id?: string }, i) === sleutel)

function paramsVan(invoer: HuishoudenInvoer): TaxYearParams | null {
  try {
    return getJaar(invoer.jaar, invoer.variant)
  } catch {
    return null
  }
}

type Voorwaarde = (o: OndernemingInvoer, m: VeldMatch, invoer: HuishoudenInvoer) => boolean

/** De situatie "Partner werkt mee" is actief (zoals PARTNER_SITUATIE.actief in de editor). */
function partnerActief(o: OndernemingInvoer, m: VeldMatch, invoer: HuishoudenInvoer): boolean {
  if (o.samenwerkingMetPartner !== undefined || o.meewerkendePartner !== undefined) return true
  const p = invoer.personen.find((x) => x.id === m.persoon)
  const index = p ? p.ondernemingen.indexOf(o) : -1
  const partner = invoer.personen.find((x) => x.id !== m.persoon)
  return (partner?.terbeschikkingstellingen ?? []).some((t) => {
    if (t.aan.persoon !== m.persoon) return false
    if (t.aan.ondernemingId) return t.aan.ondernemingId === itemSleutel(o, index)
    if (t.aan.ondernemingIndex !== undefined) return t.aan.ondernemingIndex === index
    return (p?.ondernemingen.length ?? 0) === 1
  })
}

const UITGESPLITST = new Set(['omzet', 'kosten', 'afschrijvingen', 'wijzigingOnderhandenWerk', 'financieleBatenLasten'])
const btwDetails = (o: OndernemingInvoer) => Boolean(o.auto?.btw && o.auto.btw.aftrekOpKosten !== false)

/**
 * Blokken van de onderneming die alleen op de pagina staan als het onderdeel bestaat of de keuze is gemaakt, zoals de
 * editor ze tekent (OndernemingSectie, AutoBlok, ActivaInvoer, HirSituatie). Zo toont het zoekveld geen veld dat er
 * niet staat ("Auto: dagwaarde" zonder auto).
 */
function voorwaarde(pad: string): Voorwaarde | undefined {
  const veld = pad.split('/').pop() ?? pad
  if (pad === 'auto.dagwaarde') return (o, _m, invoer) => Boolean(o.auto && autoStand(o.auto, paramsVan(invoer), invoer.jaar).toonDagwaarde)
  if (pad === 'auto.youngtimerOvergang') return (o, _m, invoer) => Boolean(o.auto && autoStand(o.auto, paramsVan(invoer), invoer.jaar).toonOvergang)
  if (pad === 'auto.btw.btwBijAanschaf') return (o) => btwDetails(o) && Boolean(o.auto?.btw?.aftrekBijAanschaf)
  if (pad === 'auto.btw.priveKmInclWoonWerk' || pad === 'auto.btw.totaalKm') return (o) => btwDetails(o) && o.auto?.btw?.methode === 'kilometers'
  if (pad.startsWith('auto.btw.') && pad !== 'auto.btw.aftrekOpKosten') return btwDetails
  if (pad.startsWith('auto.')) return (o) => Boolean(o.auto)
  if (pad.startsWith('staking.')) return (o) => Boolean(o.staking)
  if (pad.startsWith('winstberekening.') && UITGESPLITST.has(pad.slice('winstberekening.'.length))) return (o) => o.winstberekening.soort === 'uitgesplitst'
  if (pad === 'winstberekening.afschrijvingenInSaldo') return (o) => o.winstberekening.soort === 'saldo' && (o.activa?.length ?? 0) > 0
  if (pad === 'for.vrijwilligeAfname') return (o) => (o.for?.stand ?? 0) > 0
  if (pad === 'activaVolledig') return (o) => (o.activa?.length ?? 0) > 0
  // OndernemingSectie: alleen bij een oudedagsreserve en als het urencriterium dit jaar niet op ja staat.
  if (pad === 'uren.urencriteriumVorigJaar') return (o) => (o.for?.stand ?? 0) > 0 && !(o.uren.urencriteriumGehaald === true || (o.uren.urencriteriumGehaald === undefined && !(o.uren.onderneming > 0 || (o.uren.zwangerschapWeken ?? 0) > 0)))
  // De vraag "Waar komt de winst vandaan?" alleen als er een regeling is die ervan afhangt (regelingenMetWinstBron).
  if (pad === 'winstBron') return (o, m, invoer) => o.winstBron !== undefined || (o.herinvesteringsreserves?.length ?? 0) > 0 || (o.egalisatiereserves?.length ?? 0) > 0 || Boolean(o.auto?.btw) || Boolean(o.staking) || partnerActief(o, m, invoer)
  if (pad.startsWith('activa:*/')) {
    if (veld.startsWith('verkocht.')) return (o, m) => Boolean(itemVan(o.activa, m.sleutels[2])?.verkocht)
    if (veld === 'woz') return (o, m) => itemVan(o.activa, m.sleutels[2])?.soort === 'gebouw'
    if (veld === 'willekeurigBedrag') return (o, m) => ['willekeurig-starter', 'vamil'].includes(itemVan(o.activa, m.sleutels[2])?.methode ?? '')
    if (veld === 'herinvesteringsreserve') return (o, m) => Boolean(itemVan(o.activa, m.sleutels[2])?.verkocht)
  }
  if (pad.startsWith('investering:*/herinvesteringsreserve.')) {
    if (veld === 'herinvesteringsreserve.afboeking') return (o) => (o.herinvesteringsreserves?.length ?? 0) > 0
    if (veld === 'herinvesteringsreserve.reserveId') return (o) => (o.herinvesteringsreserves?.length ?? 0) > 1
    return (o, m) => (itemVan(o.investeringen, m.sleutels[2])?.herinvesteringsreserve?.afboeking ?? 0) > 0
  }
  if (pad === 'investering:*/betaald') return (o, m) => itemVan(o.investeringen, m.sleutels[2])?.inGebruik === false
  if (pad === 'investering:*/gemeld') return (o, m) => !['kia', 'geen', undefined].includes(itemVan(o.investeringen, m.sleutels[2])?.regeling)
  return undefined
}

const ond = (pad: string, label: string, synoniemen?: string[], extra: Partial<Pick<VeldregisterItem, 'nogNietIngevuld' | 'bestaat'>> = {}): VeldregisterItem => {
  const v = voorwaarde(pad)
  return {
    patroon: `persoon:*/onderneming:*/${pad}`,
    label: metOnderneming(label),
    ...ONDERNEMINGEN,
    ...(synoniemen ? { synoniemen } : {}),
    ...(v
      ? {
          bestaat: (m: VeldMatch, invoer: HuishoudenInvoer) => {
            const o = ondernemingVan(m, invoer)
            return Boolean(o && v(o, m, invoer))
          },
        }
      : {}),
    ...extra,
  }
}

const lijst = (soort: string, velden: Array<[string, string, string[]?]>): VeldregisterItem[] => velden.map(([veld, label, syn]) => ond(`${soort}:*/${veld}`, label, syn))

export const VELDEN_REGELINGEN_ONDERNEMING: VeldregisterItem[] = [
  ond('startjaar', 'Startjaar', ['starter', 'startersaftrek']),
  ond('winstBron', 'Waar komt de winst vandaan?', ['boekhouding', 'fiscaal rapport', 'accountant']),
  ond('winstberekening.soort', 'Winstberekening', ['saldo', 'uitgesplitst']),
  ond('winstberekening.afschrijvingenInSaldo', 'Afschrijving in het saldo, zoals geboekt'),
  ond('winstberekening.omzet', 'Omzet', ['netto-omzet']),
  ond('winstberekening.kosten', 'Kosten'),
  ond('winstberekening.afschrijvingen', 'Afschrijvingen'),
  ond('winstberekening.wijzigingOnderhandenWerk', 'Wijziging onderhanden werk'),
  ond('winstberekening.financieleBatenLasten', 'Financiële baten en lasten', ['rente']),
  ond('beperktAftrekbaar', 'Beperkt aftrekbare kosten', ['representatie', 'eten en drinken']),
  ond('activaVolledig', 'Al mijn bedrijfsmiddelen staan in dit register'),
  ...lijst('activa', [
    ['omschrijving', 'Bedrijfsmiddel: omschrijving', ['activa', 'bedrijfsmiddel']],
    ['aanschafdatum', 'Bedrijfsmiddel: aanschafdatum'],
    ['aanschafwaarde', 'Bedrijfsmiddel: aanschafwaarde'],
    ['restwaarde', 'Bedrijfsmiddel: restwaarde'],
    ['levensduurJaren', 'Bedrijfsmiddel: levensduur', ['afschrijven']],
    ['boekwaardeBegin', 'Bedrijfsmiddel: fiscale boekwaarde op 1 januari'],
    ['soort', 'Bedrijfsmiddel: soort', ['goodwill', 'gebouw']],
    ['woz', 'Bedrijfsmiddel: WOZ-waarde', ['bodemwaarde']],
    ['methode', 'Bedrijfsmiddel: methode', ['willekeurig', 'vamil']],
    ['willekeurigBedrag', 'Bedrijfsmiddel: vrij afgeschreven in het aanschafjaar'],
    ['verkocht', 'Bedrijfsmiddel: verkocht of uit gebruik genomen', ['verkoop']],
    ['verkocht.datum', 'Bedrijfsmiddel: verkoopdatum'],
    ['verkocht.verkoopprijs', 'Bedrijfsmiddel: verkoopprijs', ['boekwinst']],
    ['herinvesteringsreserve', 'Reserveren voor een nieuwe investering', ['HIR', 'herinvestering', 'boekwinst']],
  ]),
  ...lijst('investering', [
    ['omschrijving', 'Investering: omschrijving', ['KIA', 'kleinschaligheidsinvesteringsaftrek', 'investeringsaftrek', 'investering']],
    ['datum', 'Investering: datum'],
    ['bedrag', 'Investering: bedrag'],
    ['regeling', 'Investering: regeling', ['EIA', 'MIA']],
    ['uitgesloten', 'Investering: uitgesloten van investeringsaftrek'],
    ['inGebruik', 'Investering: nog niet in gebruik'],
    ['betaald', 'Investering: betaald'],
    ['gekochtVanPartner', 'Investering: gekocht van je fiscale partner'],
    ['gemeld', 'Investering: gemeld bij RVO'],
    ['herinvesteringsreserve.afboeking', 'Herinvesteringsreserve afboeken', ['HIR', 'herinvestering']],
    ['herinvesteringsreserve.reserveId', 'Herinvesteringsreserve: welke reserve'],
    ['herinvesteringsreserve.nieuwLanglopend', 'Herinvesteringsreserve: het nieuwe middel is langlopend', ['pand', 'grond']],
    ['herinvesteringsreserve.zelfdeFunctie', 'Het nieuwe middel heeft dezelfde functie als het verkochte'],
    ['herinvesteringsreserve.kiaOverVolBedrag', 'KIA over het volle bedrag'],
  ]),
  ...lijst('desinvestering', [
    ['omschrijving', 'Verkoop buiten het register: omschrijving', ['desinvesteringsbijtelling']],
    ['verkoopprijs', 'Verkoop buiten het register: verkoopprijs'],
    ['investeringsjaar', 'Verkoop buiten het register: jaar van de investering'],
    ['genotenPct', 'Verkoop buiten het register: investeringsaftrek die je toen kreeg'],
    ['genotenAftrek', "Verkoop buiten het register: investeringsaftrek in euro's"],
  ]),
  ond('overigeVerkopen', 'Opbrengst van andere verkochte bedrijfsmiddelen'),
  ond('uren.urencriteriumGehaald', 'Voldoe je aan het urencriterium?', ['1225 uur', 'uren']),
  ond('uren.onderneming', 'Uren aan de onderneming', ['urencriterium']),
  ond('uren.loondienst', 'Uren in loondienst'),
  ond('uren.zwangerschapWeken', 'Weken zwangerschaps- en bevallingsverlof'),
  ond('uren.gemiddeldeUrenPerWeekVoorVerlof', 'Gemiddelde uren per week vóór het verlof'),
  ond('uren.urencriteriumVorigJaar', 'Urencriterium vorig jaar'),
  ond('for.stand', 'Stand oudedagsreserve (FOR)', ['FOR', 'oudedagsreserve']),
  ond('for.ondernemingsvermogenEinde', 'Ondernemingsvermogen aan het einde van het jaar'),
  ond('for.vrijwilligeAfname', 'Vrijwillige afname oudedagsreserve', ['omzetting FOR']),
  ond('zakelijkeKmPrive', 'Zakelijke kilometers met een privéauto', ['kilometervergoeding']),
  ond('kmAftrekAlInSaldo', 'De kilometervergoeding zit al in het saldo'),
  ond('auto', 'Auto van de zaak', ['auto', 'zakelijke auto', 'bijtelling', 'leaseauto', 'youngtimer', 'oude auto', 'btw privé'], {
    nogNietIngevuld: (m, invoer) => !ondernemingVan(m, invoer)?.auto,
  }),
  ond('auto.cataloguswaarde', 'Auto: cataloguswaarde'),
  ond('auto.datumEersteToelating', 'Auto: datum eerste toelating', ['youngtimer', 'bouwjaar']),
  ond('auto.dagwaarde', 'Auto: dagwaarde op 1 januari', ['youngtimer', 'oude auto', 'dagwaarde']),
  ond('auto.terBeschikkingSinds', 'Auto: ter beschikking sinds'),
  ond('auto.terBeschikkingTot', 'Auto: ter beschikking tot en met', ['verkocht', 'naar privé']),
  ond('auto.youngtimerOvergang', 'Auto: stond al vóór de nieuwe grens tot je beschikking', ['overgangsrecht', 'youngtimer']),
  ond('auto.eigenBijdrage', 'Auto: privé betaalde autokosten', ['eigen bijdrage']),
  ond('auto.autokosten', 'Auto: autokosten in de winstberekening'),
  ond('auto.priveKm', 'Auto: privékilometers'),
  ond('auto.nulEmissie', 'Auto: elektrisch (nulemissie)'),
  ond('auto.rittenregistratie', 'Auto: sluitende rittenregistratie', ['500 km']),
  ond('auto.btw', 'Btw-correctie privégebruik', ['btw privé', 'btw auto']),
  ond('auto.btw.aftrekOpKosten', 'Btw-correctie: trek je btw af op de kosten van deze auto?', ['KOR']),
  ond('auto.btw.aftrekBijAanschaf', 'Btw-correctie: btw teruggekregen bij aankoop?', ['marge-auto']),
  ond('auto.btw.jaarIngebruikname', 'Btw-correctie: in gebruik genomen in'),
  ond('auto.btw.methode', 'Btw-correctie: methode', ['forfait', 'kilometers']),
  ond('auto.btw.btwOpKosten', 'Btw-correctie: btw op de autokosten dit jaar'),
  ond('auto.btw.btwBijAanschaf', 'Btw-correctie: btw bij aankoop'),
  ond('auto.btw.priveKmInclWoonWerk', 'Btw-correctie: privékilometers met woon-werk'),
  ond('auto.btw.totaalKm', 'Btw-correctie: totaal aantal kilometers'),
  ond('auto.btw.inAutokosten', 'Btw-correctie: zit al in de autokosten'),
  ...lijst('opdrachtgever', [
    ['naam', 'Opdrachtgever: naam', ['klant', 'arbeidsrelatie']],
    ['omzet', 'Opdrachtgever: omzet'],
    ['uurtarief', 'Opdrachtgever: uurtarief'],
    ['duurMaanden', 'Opdrachtgever: duur van de opdracht'],
    ['viaPlatform', 'Opdrachtgever: via een platform'],
  ]),
  ond('maandenGewerkt', 'Maanden gewerkt tot nu', ['prognose']),
  ond('startersaftrekEerderGebruikt', 'Startersaftrek eerder gebruikt'),
  ...lijst('herinvesteringsreserve', [
    ['herkomst.omschrijving', 'Herinvesteringsreserve: verkocht of verloren bedrijfsmiddel', ['HIR', 'herinvestering']],
    ['ontstaanJaar', 'Herinvesteringsreserve: jaar van de verkoop'],
    ['herkomst.opbrengst', 'Herinvesteringsreserve: opbrengst of vergoeding', ['schadevergoeding', 'verzekering']],
    ['herkomst.boekwaardeOud', 'Herinvesteringsreserve: boekwaarde zonder willekeurige afschrijving'],
    ['herkomst.schadeloosstelling', 'Herinvesteringsreserve: vergoeding voor schade of verlies', ['verzekering', 'total loss']],
    ['herkomst.langlopend', 'Herinvesteringsreserve: het verkochte middel was langlopend'],
    ['bedragOntstaan', 'Herinvesteringsreserve: gereserveerd bedrag', ['boekwinst']],
    ['standBegin', 'Herinvesteringsreserve: stand op 1 januari'],
    ['voornemen', 'Herinvesteringsreserve: je bent nog van plan opnieuw te investeren'],
    ['termijnVerlengdTot', 'Herinvesteringsreserve: termijn verlengd tot'],
    ['mutatiesInSaldo', 'Herinvesteringsreserve: zit al in je winst'],
  ]),
  ...lijst('egalisatiereserve', [
    ['omschrijving', 'Kostenegalisatiereserve: waarvoor', ['onderhoud pand', 'groot onderhoud']],
    ['standBegin', 'Kostenegalisatiereserve: stand op 1 januari'],
    ['dotatie', 'Kostenegalisatiereserve: toevoeging'],
    ['onttrekking', 'Kostenegalisatiereserve: gebruikt voor onderhoud'],
    ['vervallen', 'Kostenegalisatiereserve: vervallen'],
    ['inSaldo', 'Kostenegalisatiereserve: zit al in je winst'],
  ]),
  ond('staking.soort', 'Staking: wat is er gebeurd?', ['stoppen', 'verkopen', 'BV', 'geruisloos']),
  ond('staking.datum', 'Staking: datum', ['stoppen']),
  ond('staking.stakingswinst', 'Stakingswinst', ['stoppen', 'goodwill']),
  ond('staking.stakingswinstInSaldo', 'Stakingswinst: zit al in je winst'),
  ond('staking.goodwill', 'Staking: goodwill'),
  ond('staking.stakingskosten', 'Staking: stakingskosten'),
  ond('staking.eerderGenotenStakingsaftrek', 'Stakingsaftrek eerder gebruikt'),
  ond('staking.posten', 'Stakingswinst per onderdeel'),
  ...lijst('stakingspost', [
    ['omschrijving', 'Stakingswinst: onderdeel'],
    ['soort', 'Stakingswinst: soort onderdeel'],
    ['waardeOfOpbrengst', 'Stakingswinst: opbrengst of waarde'],
    ['fiscaleBoekwaarde', 'Stakingswinst: fiscale boekwaarde'],
    ['naarPrive', 'Stakingswinst: naar privé'],
    ['inSaldo', 'Stakingswinst: zit al in je boekhouding'],
  ]),
  ...(
    [
      ['premie', 'Premie stakingslijfrente', ['stakingslijfrente', 'lijfrente bij stoppen']],
      ['betaaldOp', 'Stakingslijfrente: betaald op'],
      ['categorie', 'Stakingslijfrente: maximum'],
      ['eerderAfgetrokkenLijfrentepremies', 'Stakingslijfrente: eerder afgetrokken lijfrentepremies'],
      ['waardePensioenaanspraken', 'Stakingslijfrente: waarde pensioenaanspraken'],
      ['eerdereStakingslijfrenten', 'Stakingslijfrente: eerdere stakingslijfrenten'],
      ['eerdereForOmzettingen', 'Stakingslijfrente: eerder omgezette oudedagsreserve', ['FOR omzetten']],
    ] as Array<[string, string, string[]?]>
  ).map(
    ([veld, label, syn]): VeldregisterItem => ({
      patroon: `persoon:*/inkomensvoorziening.stakingslijfrente.${veld}`,
      label: metPersoon(label),
      ...PENSIOEN,
      ...(syn ? { synoniemen: syn } : {}),
      // Zoals StakingslijfrenteVeld: alleen bij een staking of een stakingslijfrente die al is ingevuld.
      bestaat: (m, invoer) => {
        const p = invoer.personen.find((x) => x.id === m.persoon)
        return Boolean(p && (p.inkomensvoorziening.stakingslijfrente !== undefined || p.ondernemingen.some((o) => o.staking !== undefined)))
      },
    }),
  ),
  // Ingangen voor wat nog leeg is: de knoppen Investering toevoegen en Onderneming toevoegen (OndernemingSectie).
  ond('investeringen', 'Investering toevoegen', ['KIA', 'kleinschaligheidsinvesteringsaftrek', 'investeringsaftrek', 'investering', 'EIA', 'MIA', 'Vamil', 'aanschaf'], {
    bestaat: (m, invoer) => (ondernemingVan(m, invoer)?.investeringen?.length ?? 0) === 0,
    nogNietIngevuld: () => true,
  }),
  {
    patroon: 'persoon:*/ondernemingen',
    label: metPersoon('Onderneming toevoegen'),
    ...ONDERNEMINGEN,
    synoniemen: ['onderneming', 'eenmanszaak', 'zzp', 'zelfstandige', 'winst uit onderneming', 'KIA', 'investeringsaftrek', 'auto van de zaak', 'youngtimer', 'urencriterium', 'zelfstandigenaftrek', 'staking', 'stoppen'],
    bestaat: (m, invoer) => (invoer.personen.find((p) => p.id === m.persoon)?.ondernemingen.length ?? 0) === 0,
    nogNietIngevuld: () => true,
  },
]

/** Per onderneming in de invoer: persoon, vaste id en een leesbare plek. */
function ondernemingen(invoer: HuishoudenInvoer) {
  return invoer.personen.flatMap((p) => p.ondernemingen.map((o, i) => ({ p, o, id: itemSleutel(o, i), waar: `${o.naam.trim() || 'Onderneming'}, ${persoonNaam(p, p.id)}` })))
}

const kiezersOnderneming = (invoer: HuishoudenInvoer) => ondernemingen(invoer).map((x) => ({ elementId: `situaties-${x.p.id}-${x.id}`, waar: x.waar }))

export const REGELINGEN_ONDERNEMING: RegelingItem[] = [
  {
    id: 'staking',
    naam: 'Gestopt, verkocht of omgezet',
    uitleg: 'Stakingswinst, stakingsaftrek, vrijval van de oudedagsreserve en geruisloze inbreng in een BV.',
    synoniemen: ['staking', 'stoppen', 'gestopt', 'verkopen', 'verkocht', 'BV', 'geruisloze inbreng', 'stakingsaftrek', 'stakingswinst', 'doorschuiven'],
    plaats: 'onderneming',
    actiefBij: (invoer) => ondernemingen(invoer).filter((x) => x.o.staking).map((x) => ({ veld: `persoon:${x.p.id}/onderneming:${x.id}/staking.soort`, waar: x.waar })),
    kiezers: kiezersOnderneming,
  },
  {
    id: 'hir',
    naam: 'Herinvesteringsreserve',
    uitleg: 'Boekwinst reserveren voor een nieuwe investering, bijvoorbeeld na een verkoop of een schadevergoeding.',
    synoniemen: ['HIR', 'herinvestering', 'herinvesteringsreserve', 'boekwinst', 'schadevergoeding', 'total loss'],
    plaats: 'onderneming',
    actiefBij: (invoer) =>
      ondernemingen(invoer).flatMap((x) => (x.o.herinvesteringsreserves ?? []).map((r) => ({ veld: `persoon:${x.p.id}/onderneming:${x.id}/herinvesteringsreserve:${r.id}/bedragOntstaan`, waar: x.waar }))),
    kiezers: kiezersOnderneming,
  },
  {
    id: 'egalisatie',
    naam: 'Kostenegalisatiereserve',
    uitleg: 'Sparen voor groot onderhoud dat eens in de zoveel jaar terugkomt.',
    synoniemen: ['egalisatiereserve', 'kostenegalisatiereserve', 'onderhoud pand', 'groot onderhoud', 'onderhoudsreserve'],
    plaats: 'onderneming',
    actiefBij: (invoer) =>
      ondernemingen(invoer).flatMap((x) => (x.o.egalisatiereserves ?? []).map((e) => ({ veld: `persoon:${x.p.id}/onderneming:${x.id}/egalisatiereserve:${e.id}/standBegin`, waar: x.waar }))),
    kiezers: kiezersOnderneming,
  },
  {
    id: 'stakingslijfrente',
    naam: 'Stakingslijfrente',
    uitleg: 'Lijfrentepremie uit de stakingswinst en de vrijval van de oudedagsreserve, naast je jaarruimte.',
    synoniemen: ['stakingslijfrente', 'lijfrente bij stoppen', 'FOR omzetten', 'oudedagsreserve omzetten'],
    plaats: 'pensioen',
    actiefBij: (invoer) =>
      invoer.personen
        .filter((p) => p.inkomensvoorziening.stakingslijfrente || p.ondernemingen.some((o) => o.staking))
        .map((p) => ({ veld: `persoon:${p.id}/inkomensvoorziening.stakingslijfrente.premie`, waar: persoonNaam(p, p.id) })),
    // Geen eigen kiezer: verschijnt bij Pensioen en AOV zodra er een staking is (ontwerp 9); zonder staking eerst die toevoegen.
    kiezers: () => [],
  },
  {
    id: 'youngtimer',
    naam: 'Youngtimer',
    uitleg: 'Bijtelling over de dagwaarde voor een oude auto van de zaak, met het overgangsrecht.',
    synoniemen: ['youngtimer', 'oude auto', 'dagwaarde', 'bijtelling', 'btw privé', 'btw-correctie'],
    plaats: 'onderneming',
    actiefBij: (invoer) => ondernemingen(invoer).filter((x) => x.o.auto).map((x) => ({ veld: `persoon:${x.p.id}/onderneming:${x.id}/auto.datumEersteToelating`, waar: x.waar })),
    // Geen kiezer: de auto staat in het blok Vervoer van de onderneming.
    kiezers: () => [],
  },
]
