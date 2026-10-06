/**
 * Neemt een Moneybird-import over in een onderneming uit het dossier (puur, draait ook in de browser).
 *
 * Keuzes:
 *  - De winst- en verliesrekening uit Moneybird is leidend: winstberekening 'uitgesplitst' met omzet,
 *    kosten, afschrijvingen (zoals geboekt) en financiële baten en lasten.
 *  - De bedrijfsmiddelen uit de activamodule worden het activaregister (bron 'moneybird') en dat register geldt als
 *    volledig (activaVolledig). De engine vervangt de geboekte afschrijving dan door de fiscale afschrijving uit het
 *    register (maximaal 20% per jaar, goodwill 10%, onder de grens direct) en laat het verschil zien. Een middel dat
 *    in Moneybird is afgestoten, krijgt de verkoop in het register als het er al stond. Zie activaNaOvername.
 *  - De oudedagsreserve begint met de stand op de beginbalans (1 januari); de eindbalans is een controle.
 *  - Beperkt aftrekbare kosten gaan apart, zodat de engine de 80%-regel of de drempel toepast.
 *  - Autokosten gaan naar de auto van de zaak als die is ingevuld, anders naar de kosten.
 *  - Kilometervergoedingen staan als kosten in Moneybird; kmAftrekAlInSaldo wordt daarom true.
 *  - Het urencriterium blijft standaard 'gehaald' tenzij de gebruiker kiest voor de uren uit Moneybird.
 *  - Onderhanden werk wordt niet uit de balans bijgeteld: de mutatie staat al in de winst- en verliesrekening.
 *  - De jaarrekening voor het rapport (bron 'moneybird') wordt opnieuw samengesteld uit de regels met de
 *    categorie van dat moment: zo kloppen de rubrieken en de privéboekingen ook na een andere indeling in
 *    de browser. De omschrijving van de activiteiten blijft staan; die komt niet uit Moneybird.
 */
import type { ActiefInvoer, DesinvesteringInvoer, JaarrekeningInvoer, OndernemingInvoer, OndernemingResultaat, TaxYearParams, Waarschuwing } from '../tax/types'
import { BESCHIKBARE_JAREN, getJaar } from '../tax/years'
import { leegOnderneming } from '../dossier/leeg'
import { jaarrekeningMetIndeling, normaliseer } from './indeling'
import { datumNl, euro } from './jaarrekening'
import type { MbJaarImport, MbOvernameOpties } from './types'

/** Bedrijfsmiddel uit de activamodule van Moneybird, zoals de import het aanlevert. */
export type MbActief = MbJaarImport['activa'][number]

/** Het deel van de uitkomst van de engine dat de overname gebruikt: de investeringsaftrek per bedrijfsmiddel. */
export type UitkomstVoorOvername = Pick<OndernemingResultaat, 'investeringsaftrekPerMiddel'>

/** Parameters van het jaar, of van het laatste jaar dat er is (alleen voor de standaardlevensduur). */
export function paramsVoorActiva(jaar: number): TaxYearParams | null {
  for (const j of [jaar, Math.max(...BESCHIKBARE_JAREN())]) {
    try {
      return getJaar(j)
    } catch {
      /* volgende */
    }
  }
  return null
}

/** Wijst de naam van een bedrijfsmiddel op goodwill? */
export function noemtGoodwill(naam: string): boolean {
  return normaliseer(naam).includes('goodwill')
}

/**
 * Levensduur als Moneybird geen afschrijvingsplan heeft: de kortste die fiscaal mag zonder restwaarde
 * (1 / maximaal percentage per jaar, dus 5 jaar bij 20% en 10 jaar voor goodwill bij 10%).
 */
export function standaardLevensduur(params: TaxYearParams | null, goodwill: boolean): number {
  const af = params?.ondernemer.waarde.afschrijving
  const pct = af ? (goodwill ? af.goodwillPct : af.maxPctPerJaar) : 0
  return pct > 0 ? Math.ceil(1 / pct - 1e-9) : 1
}

/** Hetzelfde bedrijfsmiddel: zelfde aanschafdatum en aanschafwaarde (in hele euro's). De naam mag verschillen. */
function zelfdeMiddel(a: ActiefInvoer, m: MbActief): boolean {
  return a.aanschafdatum === m.aanschafdatum && Math.round(a.aanschafwaarde) === Math.round(m.aanschafwaarde)
}

function zelfdeNaam(a: ActiefInvoer, m: MbActief): boolean {
  return normaliseer(a.omschrijving).trim() === normaliseer(m.naam).trim()
}

/** Eerste vrije kandidaat voor dit middel: liefst met dezelfde naam, anders alleen op datum en bedrag. */
function zoekMiddel(kandidaten: ActiefInvoer[], m: MbActief, bezet: Set<ActiefInvoer>): ActiefInvoer | undefined {
  const vrij = kandidaten.filter((a) => !bezet.has(a) && zelfdeMiddel(a, m))
  return vrij.find((a) => zelfdeNaam(a, m)) ?? vrij[0]
}

/**
 * Investeringsaftrek voor een investering uit het importjaar, met het genoten percentage uit de uitkomst
 * van de engine (het toegepaste percentage, anders de aftrek gedeeld door het bedrag waarover die is
 * berekend). Ook 0% wordt vastgelegd: dan volgt bij verkoop geen bijtelling. Zonder uitkomst, of als de
 * investering daar nog niet in stond, blijft het leeg: dan stelt de engine het vast.
 */
function investeringsaftrekUitUitkomst(m: MbActief, imp: MbJaarImport, uitkomst: UitkomstVoorOvername | null | undefined): ActiefInvoer['investeringsaftrek'] {
  if (!m.aanschafdatum.startsWith(`${imp.jaar}-`)) return undefined
  const inv = imp.investeringen.find((i) => i.datum === m.aanschafdatum && Math.round(i.bedrag) === Math.round(m.aanschafwaarde))
  if (!inv || inv.uitgesloten || inv.regeling === 'geen') return undefined
  const kandidaten = (uitkomst?.investeringsaftrekPerMiddel ?? []).filter((x) => x.datum === inv.datum && Math.round(x.bedrag) === Math.round(inv.bedrag) && x.betaald > 0)
  const middel = kandidaten.find((x) => normaliseer(x.omschrijving).trim() === normaliseer(inv.omschrijving).trim()) ?? kandidaten[0]
  if (!middel) return undefined
  const pct = middel.genotenPct ?? Math.max(0, middel.aftrek) / middel.betaald
  return { regeling: middel.regeling, jaar: imp.jaar, genotenPct: Math.round(pct * 10000) / 10000 }
}

/**
 * Desinvesteringen uit Moneybird met het genoten percentage uit het register van vóór de overname, als het
 * bedrijfsmiddel daar met zijn investeringsaftrek stond (zelfde omschrijving en investeringsjaar). De import
 * zelf kan alleen uitgaan van het KIA-percentage van dat jaar.
 */
function desinvesteringenMetRegister(lijst: DesinvesteringInvoer[], register: ActiefInvoer[] | undefined): DesinvesteringInvoer[] {
  return lijst.map((d) => {
    const a = (register ?? []).find(
      (x) => x.investeringsaftrek !== undefined && x.investeringsaftrek.jaar === d.investeringsjaar && normaliseer(x.omschrijving).trim() === normaliseer(d.omschrijving).trim(),
    )
    return a?.investeringsaftrek ? { ...d, genotenPct: a.investeringsaftrek.genotenPct } : d
  })
}

/** Velden die niet uit Moneybird komen en bij een nieuwe import van een bekend middel blijven staan. */
const EIGEN_KEUZES = ['soort', 'woz', 'boekwaardeBegin', 'verkocht', 'willekeurigBedrag', 'herkomst'] as const

function actiefUitMoneybird(m: MbActief, vorig: ActiefInvoer | undefined, imp: MbJaarImport, params: TaxYearParams | null, uitkomst: UitkomstVoorOvername | null | undefined): ActiefInvoer {
  const goodwill = vorig?.soort ? vorig.soort === 'goodwill' : noemtGoodwill(m.naam)
  const levensduur = m.levensduurJaren !== null && m.levensduurJaren > 0 ? m.levensduurJaren : (vorig?.levensduurJaren ?? standaardLevensduur(params, goodwill))
  const a: ActiefInvoer = {
    omschrijving: m.naam,
    aanschafdatum: m.aanschafdatum,
    aanschafwaarde: m.aanschafwaarde,
    restwaarde: m.restwaarde ?? vorig?.restwaarde ?? 0,
    levensduurJaren: levensduur,
    methode: vorig?.methode ?? 'lineair',
  }
  if (!vorig?.soort && goodwill) a.soort = 'goodwill'
  for (const k of EIGEN_KEUZES) {
    const v = vorig?.[k]
    if (v !== undefined) (a as unknown as Record<string, unknown>)[k] = structuredClone(v)
  }
  const aftrek = investeringsaftrekUitUitkomst(m, imp, uitkomst) ?? vorig?.investeringsaftrek
  if (aftrek) a.investeringsaftrek = { ...aftrek }
  a.bron = 'moneybird'
  return a
}

/** Een in Moneybird afgestoten bedrijfsmiddel, zoals de import het aanlevert (zie MbJaarImport.afgestoten). */
export type MbAfgestoten = NonNullable<MbJaarImport['afgestoten']>[number]

/** Is het actief al vóór dit jaar verkocht? Dan kan het niet nog eens worden afgestoten. */
const verkochtVoor = (a: ActiefInvoer, jaar: number) => a.verkocht !== undefined && a.verkocht.datum < `${jaar}-01-01`

/** Register-actief bij een afgestoten middel: zelfde aanschafdatum en -waarde (liefst ook dezelfde naam), anders dezelfde naam en hetzelfde aanschafjaar. */
function zoekAfgestoten(kandidaten: ActiefInvoer[], d: MbAfgestoten, jaar: number, bezet: Set<ActiefInvoer>): ActiefInvoer | undefined {
  const vrij = kandidaten.filter((a) => !bezet.has(a) && !verkochtVoor(a, jaar))
  const naam = normaliseer(d.naam).trim()
  const zelfdeNaam = (a: ActiefInvoer) => normaliseer(a.omschrijving).trim() === naam
  const opDatum = vrij.filter((a) => a.aanschafdatum === d.aanschafdatum && Math.round(a.aanschafwaarde) === Math.round(d.aanschafwaarde))
  return opDatum.find(zelfdeNaam) ?? opDatum[0] ?? vrij.find((a) => zelfdeNaam(a) && a.aanschafdatum.slice(0, 4) === d.aanschafdatum.slice(0, 4))
}

/**
 * Het register-actief met de verkoop uit Moneybird. De datum en prijs uit Moneybird gaan voor; staat er in Moneybird
 * geen prijs, dan blijft een verkoop die al in dit jaar in het register stond staan (de gebruiker vulde die in).
 * Ontbreekt de genoten investeringsaftrek, dan komt de aanname van de import erbij, zodat de bijtelling via het
 * register blijft meetellen nu het middel uit de lijst met verkochte bedrijfsmiddelen gaat.
 */
function verkochtUitMoneybird(a: ActiefInvoer, d: MbAfgestoten, des: DesinvesteringInvoer, jaar: number): ActiefInvoer {
  const uit = structuredClone(a)
  const eerder = a.verkocht && a.verkocht.datum.startsWith(`${jaar}-`) ? a.verkocht : undefined
  uit.verkocht = !d.prijsBekend && eerder ? { ...eerder } : { datum: d.datum, verkoopprijs: d.verkoopprijs }
  if (!uit.investeringsaftrek && des.genotenPct > 0) uit.investeringsaftrek = { regeling: 'kia', jaar: des.investeringsjaar, genotenPct: des.genotenPct }
  uit.bron = 'moneybird'
  return uit
}

/** Activaregister na de overname, met wat er met de afgestoten middelen en de middelen uit investeringen is gebeurd. */
interface RegisterNaOvername {
  activa: ActiefInvoer[] | undefined
  /** De activa uit Moneybird zijn niet opgehaald (scope ontbreekt): het register is ongewijzigd. */
  ongewijzigd: boolean
  /** Index in imp.afgestoten → het actief in het register dat de verkoop kreeg. */
  gekoppeld: Map<number, ActiefInvoer>
  /** Index in imp.afgestoten → een eigen regel (bron 'handmatig') die hetzelfde middel lijkt, zonder verkoop dit jaar. */
  eigenRegel: Map<number, ActiefInvoer>
  /** Indexen in imp.afgestoten zonder middel in het register. */
  nietGekoppeld: number[]
  /** Middelen uit een investering van een eerder jaar die niet in de activamodule van Moneybird zijn teruggevonden. */
  losseInvesteringen: ActiefInvoer[]
}

function registerNaOvername(bestaand: ActiefInvoer[] | undefined, imp: MbJaarImport, uitkomst?: UitkomstVoorOvername | null): RegisterNaOvername {
  const lijst = bestaand ?? []
  const leeg = { gekoppeld: new Map<number, ActiefInvoer>(), eigenRegel: new Map<number, ActiefInvoer>(), nietGekoppeld: [] as number[], losseInvesteringen: [] as ActiefInvoer[] }
  if (imp.waarschuwingen.some((w) => w.id === 'mb-scope-activa')) return { activa: lijst.length > 0 ? lijst : undefined, ongewijzigd: true, ...leeg }
  const params = paramsVoorActiva(imp.jaar)
  const vorigeMoneybird = lijst.filter((a) => a.bron === 'moneybird')
  const uitInvestering = lijst.filter((a) => a.bron === 'investering')
  const handmatig = lijst.filter((a) => a.bron !== 'moneybird' && a.bron !== 'investering')
  const bezet = new Set<ActiefInvoer>()
  const verrijkt = new Map<ActiefInvoer, ActiefInvoer>()
  const nieuw: ActiefInvoer[] = []
  for (const m of imp.activa) {
    const eigen = zoekMiddel(handmatig, m, bezet)
    if (eigen) {
      bezet.add(eigen)
      const aftrek = eigen.investeringsaftrek ? undefined : investeringsaftrekUitUitkomst(m, imp, uitkomst)
      if (aftrek) verrijkt.set(eigen, { ...eigen, investeringsaftrek: aftrek })
      continue
    }
    const vorig = zoekMiddel(vorigeMoneybird, m, bezet) ?? zoekMiddel(uitInvestering, m, bezet)
    if (vorig) bezet.add(vorig)
    nieuw.push(actiefUitMoneybird(m, vorig, imp, params, uitkomst))
  }
  // Afgestoten middelen: de verkoop komt bij het middel in het register (uit Moneybird of uit een investering).
  const uit = { ...leeg }
  const afgestoten = imp.afgestoten && imp.afgestoten.length === imp.desinvesteringen.length ? imp.afgestoten : []
  for (const [i, d] of afgestoten.entries()) {
    const vorig = zoekAfgestoten(vorigeMoneybird, d, imp.jaar, bezet) ?? zoekAfgestoten(uitInvestering, d, imp.jaar, bezet)
    if (vorig) {
      bezet.add(vorig)
      const verkocht = verkochtUitMoneybird(vorig, d, imp.desinvesteringen[i], imp.jaar)
      nieuw.push(verkocht)
      uit.gekoppeld.set(i, verkocht)
      continue
    }
    const eigen = zoekAfgestoten(handmatig, d, imp.jaar, bezet)
    if (eigen) {
      bezet.add(eigen)
      if (!eigen.verkocht) uit.eigenRegel.set(i, eigen)
    } else uit.nietGekoppeld.push(i)
  }
  if (imp.activa.length > 0) uit.losseInvesteringen = uitInvestering.filter((a) => !bezet.has(a) && !verkochtVoor(a, imp.jaar))
  const blijft = lijst.filter((a) => a.bron !== 'moneybird' && !(a.bron === 'investering' && bezet.has(a))).map((a) => verrijkt.get(a) ?? a)
  const activa = [...nieuw, ...blijft]
  return { activa: activa.length > 0 ? activa : undefined, ongewijzigd: false, ...uit }
}

/**
 * Activaregister na de overname.
 *  - Elk bedrijfsmiddel uit de activamodule komt erin met bron 'moneybird': omschrijving, aanschafdatum,
 *    aanschafwaarde, restwaarde en levensduur uit Moneybird. Zonder afschrijvingsplan de kortste
 *    levensduur die fiscaal mag.
 *  - Een middel dat al uit Moneybird in het register stond (zelfde datum en bedrag) houdt de keuzes die
 *    niet uit Moneybird komen: methode, soort, WOZ, boekwaarde begin, verkoop, willekeurig bedrag, de herkomst en
 *    de genoten investeringsaftrek. Een middel uit een investering van een vorig jaar (bron 'investering')
 *    wordt vervangen door het middel uit Moneybird, met dezelfde keuzes.
 *  - Een middel dat Moneybird dit jaar als afgestoten heeft, krijgt in het register de verkoopdatum en -prijs, als
 *    het daar al stond met bron 'moneybird' of 'investering' (zelfde aanschafdatum en -waarde, of dezelfde naam en
 *    hetzelfde aanschafjaar). Dan rekent het register de afschrijving tot de verkoop, het boekresultaat en de
 *    bijtelling, en haalt neemOver het uit de lijst met verkochte bedrijfsmiddelen. Staat het er niet in, dan komt
 *    het er niet bij en blijft het in die lijst (zie overnameMeldingen).
 *  - Wat de gebruiker met de hand toevoegde (bron 'handmatig' of zonder bron) blijft staan. Is het
 *    hetzelfde middel als een middel uit Moneybird, dan gaat de eigen regel voor en komt het middel uit
 *    Moneybird er niet bij, zodat er niets dubbel wordt afgeschreven. Ontbreekt bij die eigen regel de
 *    investeringsaftrek, dan komt die er wel bij (zie hieronder).
 *  - Investeringen uit het importjaar krijgen de investeringsaftrek met het genoten percentage uit de
 *    uitkomst, als die er is; anders blijft dat leeg en stelt de engine het vast.
 *  - Kon de import de activa niet ophalen (scope ontbreekt), dan blijft het register zoals het was.
 * Geeft undefined als het register leeg is.
 */
export function activaNaOvername(bestaand: ActiefInvoer[] | undefined, imp: MbJaarImport, uitkomst?: UitkomstVoorOvername | null): ActiefInvoer[] | undefined {
  return registerNaOvername(bestaand, imp, uitkomst).activa
}

/** Delen van de jaarrekening die uit de balans komen. */
const BALANSDELEN = ['begin', 'eind', 'specificaties', 'mva', 'onttrekkingen', 'stortingen'] as const

/**
 * Jaarrekening na de overname. De balansdelen komen uit Moneybird als die een balans heeft en de balans
 * wordt overgenomen; anders blijven die van de onderneming staan. undefined als er niets is.
 */
export function jaarrekeningNaOvername(bestaand: JaarrekeningInvoer | undefined, imp: MbJaarImport, metBalans = true): JaarrekeningInvoer | undefined {
  const mb = jaarrekeningMetIndeling(imp)
  if (!mb) return bestaand
  const balansUitMoneybird = metBalans && (mb.begin !== undefined || mb.eind !== undefined)
  const balansBron = balansUitMoneybird ? mb : bestaand
  const uit: JaarrekeningInvoer = {}
  for (const deel of BALANSDELEN) {
    const waarde = balansBron?.[deel]
    if (waarde !== undefined) (uit as Record<string, unknown>)[deel] = waarde
  }
  // Zonder balans uit Moneybird (bijvoorbeeld de scope bank ontbreekt) komt de aanschafwaarde nog wel uit de activa.
  if (metBalans && !balansUitMoneybird && mb.mva && !uit.mva) uit.mva = mb.mva
  if (mb.winstEnVerlies) uit.winstEnVerlies = mb.winstEnVerlies
  if (bestaand?.omschrijvingActiviteiten) uit.omschrijvingActiviteiten = bestaand.omschrijvingActiviteiten
  uit.bron = 'moneybird'
  return uit
}

/**
 * Neemt de import over in de onderneming. `uitkomst` is de uitkomst van de engine voor deze onderneming
 * vóór de overname (optioneel): daaruit komt het genoten percentage investeringsaftrek in het register.
 * Bij de desinvesteringen uit Moneybird gaat het percentage dat in het register stond voor op de aanname
 * van de import.
 */
export function neemOver(o: OndernemingInvoer | undefined, imp: MbJaarImport, opties: MbOvernameOpties = {}, uitkomst?: UitkomstVoorOvername | null): OndernemingInvoer {
  const t = imp.totalen
  const heeftAuto = Boolean(o?.auto)
  // Nieuwe onderneming: dezelfde standaard als in het dossier (urencriterium ja, geen starter tenzij ingevuld).
  const basis: OndernemingInvoer = o ?? leegOnderneming(imp.jaar, imp.administratie.naam)

  const uit: OndernemingInvoer = {
    ...basis,
    winstberekening: {
      soort: 'uitgesplitst',
      omzet: t.omzet,
      kosten: t.kosten + (heeftAuto ? 0 : t.autokosten),
      afschrijvingen: t.afschrijvingen,
      financieleBatenLasten: t.financieel,
    },
    beperktAftrekbaar: t.beperktAftrekbaar,
    kmAftrekAlInSaldo: true,
    maandenGewerkt: undefined,
    bron: {
      soort: 'moneybird',
      koppelingId: imp.koppelingId,
      administratieId: imp.administratie.id,
      administratieNaam: imp.administratie.naam,
      jaar: imp.jaar,
      geimporteerdOp: imp.opgehaaldOp,
    },
  }

  if (heeftAuto && basis.auto) uit.auto = { ...basis.auto, autokosten: t.autokosten }

  const register = registerNaOvername(basis.activa, imp, uitkomst)
  if (register.activa) uit.activa = register.activa
  else delete uit.activa
  // Een register uit de activamodule van Moneybird geldt als volledig: de fiscale afschrijving vervangt de geboekte.
  if (!register.ongewijzigd && (register.activa ?? []).some((a) => a.bron === 'moneybird')) uit.activaVolledig = true

  if (opties.investeringen !== false) {
    uit.investeringen = imp.investeringen
    // Een afgestoten middel met de verkoop in het register gaat uit de lijst: de bijtelling telt dan één keer, via het register.
    uit.desinvesteringen = desinvesteringenMetRegister(
      imp.desinvesteringen.filter((_, i) => !register.gekoppeld.has(i)),
      basis.activa,
    )
  }
  if (opties.opdrachtgevers !== false) uit.opdrachtgevers = imp.opdrachtgevers

  // Oudedagsreserve: de stand op 1 januari van de beginbalans. Staat die er niet op, dan blijft de stand die er was
  // (bijvoorbeeld doorgerold uit vorig jaar). De stand op de eindbalans is alleen een controle (forControle).
  const forBegin = imp.balans.forStandBegin ?? null
  if (opties.balans !== false && (forBegin !== null || basis.for)) {
    uit.for = {
      ...basis.for,
      stand: forBegin ?? basis.for?.stand ?? 0,
      ondernemingsvermogenEinde: imp.balans.ondernemingsvermogenEinde ?? basis.for?.ondernemingsvermogenEinde,
    }
  }

  const jaarrekening = jaarrekeningNaOvername(basis.jaarrekening, imp, opties.balans !== false)
  if (jaarrekening) uit.jaarrekening = jaarrekening

  if (opties.uren && imp.uren) {
    uit.uren = { ...basis.uren, onderneming: imp.uren.totaal, urencriteriumGehaald: undefined }
  } else {
    uit.uren = { ...basis.uren, urencriteriumGehaald: basis.uren.urencriteriumGehaald ?? true }
  }

  return uit
}

/**
 * Meldingen bij het overnemen van deze import in deze onderneming, voor het controlepaneel vóór de overname. Ze
 * gaan over wat de overname met het activaregister doet:
 *  - een afgestoten middel met de verkoop in het register: het boekresultaat uit Moneybird moet dan op 'niet
 *    meenemen', anders telt het dubbel;
 *  - een afgestoten middel dat als eigen regel in het register staat zonder verkoop;
 *  - een afgestoten middel dat niet in het register staat (de afschrijving tot de verkoop telt dan niet mee);
 *  - een middel uit een investering van een eerder jaar dat niet in de activamodule staat (mogelijk dubbel).
 */
export function overnameMeldingen(o: OndernemingInvoer | undefined, imp: MbJaarImport, opties: MbOvernameOpties = {}): Waarschuwing[] {
  const register = registerNaOvername(o?.activa, imp, null)
  if (register.ongewijzigd) return []
  const w: Waarschuwing[] = []
  const afgestoten = imp.afgestoten ?? []
  const lijstUitImport = opties.investeringen !== false
  for (const [i, a] of register.gekoppeld) {
    const d = afgestoten[i]
    const v = a.verkocht ?? { datum: d.datum, verkoopprijs: d.verkoopprijs }
    w.push({
      id: `mb-verkoop-register-${i}`,
      ernst: 'let-op',
      tekst: `"${d.naam}" is op ${datumNl(v.datum)} verkocht voor ${euro(v.verkoopprijs)}. Die verkoop komt in het activaregister${normaliseer(a.omschrijving).trim() === normaliseer(d.naam).trim() ? '' : ` bij "${a.omschrijving}"`}: we rekenen de afschrijving tot de verkoop, het boekresultaat en de desinvesteringsbijtelling fiscaal uit${lijstUitImport ? ', en het staat niet meer apart bij de verkochte bedrijfsmiddelen' : ''}. Staat het boekresultaat op deze verkoop ook in de winst- en verliesrekening uit Moneybird, zet die rekening dan op 'niet meenemen', anders telt het dubbel.${lijstUitImport ? '' : ' Staat het ook in je eigen lijst met verkochte bedrijfsmiddelen, haal het daar dan weg.'}`,
    })
  }
  for (const [i, a] of register.eigenRegel) {
    const d = afgestoten[i]
    w.push({
      id: `mb-verkoop-eigen-${i}`,
      ernst: 'let-op',
      tekst: `"${d.naam}" is in Moneybird op ${datumNl(d.datum)} afgestoten. In het activaregister staat het als je eigen regel "${a.omschrijving}" zonder verkoop, dus daar schrijven we het nog een heel jaar af. Zet bij die regel de verkoopdatum en de verkoopprijs.`,
    })
  }
  // De afschrijving tot de verkoop valt alleen weg als het register na de overname de geboekte afschrijving vervangt.
  const registerTelt = (register.activa ?? []).some((a) => a.bron === 'moneybird') || (o?.activaVolledig === true && (register.activa ?? []).length > 0)
  if (registerTelt) {
    for (const i of register.nietGekoppeld) {
      const d = afgestoten[i]
      w.push({
        id: `mb-afschrijving-afgestoten-${i}`,
        ernst: 'info',
        tekst: `"${d.naam}" is dit jaar afgestoten en staat niet in het activaregister. Het staat bij de verkochte bedrijfsmiddelen, zodat de desinvesteringsbijtelling meetelt. De afschrijving die Moneybird er dit jaar nog op boekte, telt niet mee. Wil je die wel meetellen, voeg het dan met de hand toe aan het register met de verkoopdatum en de verkoopprijs, en zet het boekresultaat op de verkoop in Moneybird op 'niet meenemen'.`,
      })
    }
  }
  for (const [k, a] of register.losseInvesteringen.entries()) {
    w.push({
      id: `mb-register-los-${k}`,
      ernst: 'let-op',
      tekst: `"${a.omschrijving}" (gekocht op ${datumNl(a.aanschafdatum)} voor ${euro(a.aanschafwaarde)}) staat in het activaregister uit de investeringen van een eerder jaar, maar niet met die datum en dat bedrag in de activamodule van Moneybird. Staat het daar met een andere datum of een ander bedrag, dan staat het nu twee keer in het register; verwijder dan de regel die er te veel is.`,
    })
  }
  return w
}

/**
 * Controle van de oudedagsreserve uit Moneybird: de stand op 1 januari (waarmee de overname rekent) min de
 * vrijwillige afname tegenover de stand op de eindbalans. `sluitAan` is null als een van beide standen ontbreekt.
 * Een verplichte afname rekent de engine zelf; die zit dus niet in deze vergelijking.
 */
export function forControle(imp: MbJaarImport, vrijwilligeAfname = 0): { begin: number | null; eind: number | null; daling: number | null; sluitAan: boolean | null } {
  const begin = imp.balans.forStandBegin ?? null
  const eind = imp.balans.forStand
  if (begin === null || eind === null) return { begin, eind, daling: null, sluitAan: null }
  const daling = begin - eind
  return { begin, eind, daling, sluitAan: Math.round(daling) === Math.round(Math.max(0, vrijwilligeAfname)) }
}
