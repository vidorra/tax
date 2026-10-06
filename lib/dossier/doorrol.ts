/**
 * Saldi die van het ene dossierjaar naar het volgende doorrollen, afgeleid uit de uitkomst van het vorige jaar.
 *
 * Per persoon:
 *  - verliezen box 1: wat na de verrekening van vorig jaar overblijft (zelfde volgorde als de engine, oudste eerst);
 *    vervallen jaren vallen weg. Een nieuw verlies van vorig jaar gaat eerst terug naar eerdere jaren, dus dat vult
 *    de gebruiker zelf in na de verliesbeschikking (er volgt een melding).
 *  - niet-benutte zelfstandigenaftrek: de rest per jaar uit het overzicht van vorig jaar plus wat vorig jaar
 *    niet benut is.
 *  - restant persoonsgebonden aftrek: wat vorig jaar niet in het inkomen paste.
 *  - premiegrondslag-inkomen en toename van de oudedagsreserve voor de jaarruimte, en de lijfrentehistorie (de
 *    regel van vorig jaar met de berekende jaarruimte, en wat vorig jaar op oudere jaren is benut).
 *  - urencriterium van vorig jaar, voor de FOR-afname na twee jaar zonder urencriterium. Het urencriterium geldt per
 *    persoon over al zijn ondernemingen samen, dus elke onderneming van de persoon krijgt dezelfde waarde.
 * Per onderneming:
 *  - oudedagsreserve: de stand aan het einde van vorig jaar;
 *  - eindbalans van vorig jaar als beginbalans;
 *  - activa: het register van vorig jaar (in of vóór vorig jaar verkocht valt weg), plus elke investering van vorig
 *    jaar die nog niet in het register stond, als nieuw bedrijfsmiddel met de genoten investeringsaftrek. Staat een
 *    investering wel al in het register, dan krijgt dat middel de genoten investeringsaftrek.
 *    De fiscale boekwaarde aan het einde rolt alleen door als het register vorig jaar meetelde in de winst
 *    (`activaVolledig` en de geboekte afschrijving ingevuld). Anders heeft de aangifte van vorig jaar met de
 *    geboekte afschrijving gerekend en past de fiscale boekwaarde daar niet bij: dan blijft de boekwaarde begin
 *    leeg, met een melding om hem uit de aangifte of jaarrekening van vorig jaar over te nemen. Een middel uit een
 *    investering krijgt nooit een boekwaarde begin (hoe er vorig jaar op is afgeschreven, weten we niet) en de
 *    snelste levensduur die fiscaal mag, met bron 'investering': zo lang die bron er staat, vraagt het dossier de
 *    gebruiker levensduur en restwaarde te bevestigen.
 *  - elk doorgerold middel krijgt een vaste herkomst ('act:<jaar>:<index>' of 'inv:<jaar>:<index>'); opnieuw
 *    overnemen koppelt daarop, zodat een aangepaste datum of een aangepast bedrag geen tweede middel geeft. Wat de
 *    gebruiker verwijderde (`doorrolUitgesloten`), komt niet terug.
 *  - `activaVolledig` blijft alleen staan als het register vorig jaar volledig was.
 *  - een investering die eind vorig jaar nog niet in gebruik was: bij een nieuw jaar staat de rest (bedrag min wat
 *    al betaald was) klaar bij de investeringen.
 *
 * `pasDoorrolToe` zet alleen deze velden in een bestaand jaar en laat de rest van de invoer staan. Twee keer
 * toepassen geeft hetzelfde. Puur: geen React, geen I/O.
 */
import type {
  ActiefInvoer,
  AfschrijvingActief,
  BalansStand,
  EgalisatiereserveInvoer,
  HerinvesteringsreserveInvoer,
  SchuldPositie,
  HuishoudenInvoer,
  HuishoudenResultaat,
  InvesteringInvoer,
  LijfrenteHistorieJaar,
  OndernemingInvoer,
  OndernemingResultaat,
  PersoonId,
  PersoonInvoer,
  PersoonResultaat,
  TaxYearParams,
} from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { berekenAfschrijvingen } from '@/lib/tax/modules/onderneming/afschrijving'
import { activaregisterTeltMee } from '@/lib/tax/modules/onderneming'
import { euro, pct } from '@/lib/tax/uitleg'
import { BALANS_POST_INFO, BALANS_POSTEN, jaarrekeningVoorNieuwJaar } from './jaarrekening'
import { box2SaldiNa, eigenWoningDoorrol, pasBox2SaldiToe, pasEigenWoningToe, wijzigingenPrive, type EigenWoningDoorrol } from './doorrol-prive'
import { bronbelastingWijzigingen, doorrolSaldiBronbelasting, pasDoorrolBronbelastingToe } from './doorrol-bronbelasting'
import { afboekingNaarActief, doorrolReserves, genotenStakingsaftrekNa, pasReservesToe, reserveWijzigingen, type HirAfboekingRegister } from './doorrol-reserves'

type JaarBedrag = { jaar: number; bedrag: number }
type Regeling = NonNullable<ActiefInvoer['investeringsaftrek']>['regeling']

const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

export interface DoorrolActief {
  /** Met een vaste `herkomst`-id ('act:<jaar>:<index>' of 'inv:<jaar>:<index>'). */
  actief: ActiefInvoer
  /** 'register': uit het activaregister van vorig jaar; 'investering': nieuw uit een investering van vorig jaar. */
  herkomst: 'register' | 'investering'
}

/** Rest van een investering die eind vorig jaar nog niet in gebruik was. */
export interface DoorrolRestInvestering {
  /** Klaar om dit jaar in te vullen: de rest van het bedrag, dezelfde omschrijving en regeling. */
  investering: InvesteringInvoer
  /** Het hele investeringsbedrag (de aanschafwaarde van het bedrijfsmiddel). */
  totaal: number
  /** Vorig jaar al betaald (en daarover investeringsaftrek gekregen). */
  betaald: number
}

export interface DoorrolOnderneming {
  naam: string
  /** Positie in de ondernemingen van vorig jaar. */
  index: number
  /** Stand van de oudedagsreserve aan het einde van vorig jaar; ontbreekt zonder FOR of zonder uitkomst. */
  forStand?: number
  /** Eindbalans van vorig jaar; ontbreekt als die niet is ingevuld. */
  beginbalans?: BalansStand
  activa: DoorrolActief[]
  /** In of vóór vorig jaar verkocht: hoort niet meer in het register (met hun herkomst-id). */
  verkocht: ActiefInvoer[]
  /** Telde het register vorig jaar mee in de winst? Alleen dan heeft een middel uit het register een boekwaarde begin. */
  registerTeldeMee: boolean
  /** Stonden vorig jaar alle bedrijfsmiddelen in het register? Dan blijft het register dit jaar volledig. */
  activaVolledig: boolean
  restInvesteringen: DoorrolRestInvestering[]
  /**
   * Ronde 2 (onderdeel regelingen onderneming): herinvesteringsreserves met de stand eind vorig jaar als `standBegin`;
   * vrijgevallen en opgebruikte reserves vallen weg. Ontbreekt zonder uitkomst.
   */
  herinvesteringsreserves?: HerinvesteringsreserveInvoer[]
  /** Ronde 2: kostenegalisatiereserves met de stand eind vorig jaar; dotatie en onttrekking beginnen leeg. */
  egalisatiereserves?: EgalisatiereserveInvoer[]
  /** Ronde 2 (A6): afboeking van een herinvesteringsreserve op een middel dat al in het register stond (op herkomst-id). */
  hirAfboekingRegister?: HirAfboekingRegister[]
}

export interface DoorrolPersoonSaldi {
  verliezen: JaarBedrag[]
  nietBenutteZelfstandigenaftrek: JaarBedrag[]
  restantPga: number
  premiegrondslagInkomen: number
  forToename: number
  /** Verlies in box 1 dat vorig jaar is ontstaan (gaat eerst terug, wordt niet vanzelf overgenomen). */
  nieuwVerlies: number
  /**
   * Lijfrentehistorie na vorig jaar: wat vorig jaar per jaar is benut telt op bij `alGebruikt`, en vorig jaar komt
   * erbij met de berekende jaarruimte. Bij toepassen gaat de regel van vorig jaar er helemaal in; van oudere jaren
   * alleen `alGebruikt`, zodat een opgegeven jaarruimte uit een rapport blijft staan.
   */
  lijfrenteHistorie: LijfrenteHistorieJaar[]
  /** Ronde 2 (onderdeel bronbelasting): niet verrekende bronbelasting die doorschuift (PersoonResultaat.bronbelasting.naarVolgendJaar). */
  voortgewenteldeBronbelasting?: number
  /** Ronde 2 (onderdeel box 2-verlies): openstaande box 2-verliezen na vorig jaar, het box 2-inkomen van vorig jaar en lopende kortingen. */
  box2Verliezen?: JaarBedrag[]
  box2InkomenVorigJaar?: number
  box2Belastingkortingen?: Array<{ verliesjaar: number; eersteJaar: number; restant: number }>
  /** Ronde 2 (A5): boekwaarde aan het einde van vorig jaar per terbeschikkingstelling (op id), als boekwaarde begin. */
  tbsBoekwaarden?: Record<string, number>
  /** Ronde 2 (A6): stakingsaftrek die in eerdere jaren is genoten, met die van vorig jaar erbij (art. 3.79 lid 4). */
  genotenStakingsaftrek?: number
}

export interface DoorrolPersoon {
  id: PersoonId
  /** Alleen met een uitkomst van vorig jaar; ontbreekt = deze velden blijven zoals ze zijn. */
  saldi?: DoorrolPersoonSaldi
  /** Urencriterium van de persoon vorig jaar (over al zijn ondernemingen samen); ontbreekt zonder uitkomst of onderneming. */
  urencriteriumVorigJaar?: boolean
  ondernemingen: DoorrolOnderneming[]
}

export interface Doorrol {
  vorigJaar: number
  nieuwJaar: number
  personen: DoorrolPersoon[]
  meldingen: string[]
  /** Aantal jaren dat een nieuw verlies terug gaat (uit de parameters van vorig jaar). */
  verliesTerug?: number
  /** Ronde 2 (onderdeel eigen woning): eigenwoningreserve per toevoeging na vorig jaar (vervallen toevoegingen vallen weg). */
  eigenwoningreserve?: Array<{ eigenaar: PersoonId; datumToevoeging: string; bedrag: number }>
  /**
   * Ronde 2: het niet-kwalificerende deel van de hypotheek als box 3-schuld (met `herkomst.bron` 'eigenwoningschuld'),
   * stand eind vorig jaar als `waardeBegin`. Een tweede doorrol werkt deze schulden bij op `herkomst.sleutel`.
   */
  box3SchuldenUitEigenWoning?: SchuldPositie[]
  /** Ronde 2 (A2): per leningdeel (op de vaste id, oude invoer: omschrijving) het deel eigenwoningschuld op 1 januari. */
  eigenwoningschuldPerLeningdeel?: EigenWoningDoorrol['eigenwoningschuldPerLeningdeel']
}

/** Eén zichtbare wijziging bij het opnieuw overnemen, van oud naar nieuw, in gewone taal. */
export interface DoorrolWijziging {
  persoon: PersoonId
  onderneming?: string
  label: string
  oud: string
  nieuw: string
}

// ---------------------------------------------------------------------------
// Jaarruimte: premiegrondslag-inkomen en toename van de oudedagsreserve
// ---------------------------------------------------------------------------

/**
 * Toename van de oudedagsreserve voor de jaarruimte van het volgende jaar: de toevoeging min de verplichte
 * afneming aan het einde van het jaar (art. 3.127 lid 4 onder b, zoals dat eind 2022 luidde; art. 10a.29 lid 11).
 * Een toevoeging bestaat alleen in jaren met dotatie, dus dit is daarna vanzelf 0.
 */
export function forToename(p: PersoonResultaat): number {
  const dotatie = p.ondernemingen.reduce((s, o) => s + (o.forDotatie ?? 0), 0)
  const verplicht = p.ondernemingen.reduce((s, o) => s + (o.verplichteForAfname ?? 0), 0)
  return Math.max(0, Math.round(dotatie - verplicht))
}

/**
 * Premiegrondslag-inkomen voor de jaarruimte van het volgende jaar, zoals de engine het verwacht: de jaarruimte
 * telt de toename van de oudedagsreserve er zelf weer bij op (`berekenJaarruimte`). Samen moet dat de winst vóór
 * elke afneming en vóór toevoeging aan de oudedagsreserve zijn (art. 3.127 lid 3 onder a, zoals dat eind 2022
 * luidde; art. 10a.29 lid 10), plus loon, resultaat overige werkzaamheden en periodieke uitkeringen.
 *
 *   winst vóór FOR = winst − verplichte afneming − vrijwillige afneming + toevoeging
 *   inkomen        = winst vóór FOR − toename FOR
 */
export function premiegrondslagInkomen(p: PersoonResultaat): number {
  const som = (f: (o: OndernemingResultaat) => number | undefined) => p.ondernemingen.reduce((s, o) => s + (f(o) ?? 0), 0)
  const winstVoorFor = p.winstUitOnderneming - som((o) => o.verplichteForAfname) - som((o) => o.forVrijwilligeAfname) + som((o) => o.forDotatie)
  return Math.max(0, Math.round(winstVoorFor - forToename(p) + p.loon + p.overigWerk + p.periodiekeUitkeringen))
}

// ---------------------------------------------------------------------------
// Afleiden uit het vorige jaar
// ---------------------------------------------------------------------------

function paramsVan(invoer: HuishoudenInvoer): TaxYearParams | null {
  try {
    return getJaar(invoer.jaar, invoer.variant)
  } catch {
    try {
      return getJaar(invoer.jaar)
    } catch {
      return null
    }
  }
}

const jaarVan = (iso: string): number => Number(iso.slice(0, 4))
const sleutel = (a: { aanschafdatum: string; aanschafwaarde: number }) => `${a.aanschafdatum}|${Math.round(a.aanschafwaarde)}`
const normOmschrijving = (x: string | undefined) => (x ?? '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ')
const zelfdeOmschrijving = (a: { omschrijving?: string }, b: { omschrijving?: string }) => normOmschrijving(a.omschrijving) !== '' && normOmschrijving(a.omschrijving) === normOmschrijving(b.omschrijving)
/** Na een correctie van datum of bedrag nog hetzelfde middel: omschrijving, aanschafdatum of aanschafwaarde is gelijk gebleven. */
const lijktOp = (a: ActiefInvoer, b: ActiefInvoer) => zelfdeOmschrijving(a, b) || a.aanschafdatum === b.aanschafdatum || Math.round(a.aanschafwaarde) === Math.round(b.aanschafwaarde)

/** "a", "a en b", "a, b en c". */
function opsomming(namen: string[]): string {
  if (namen.length <= 1) return namen.join('')
  return `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`
}

/**
 * Telt het activaregister mee in de winst? Alleen als alle bedrijfsmiddelen erin staan (`activaVolledig`) en, bij
 * 'saldo', de afschrijving in het saldo is ingevuld. Anders rekent de winst met de geboekte afschrijving en is het
 * register een fiscale controle zonder effect op de winst (OndernemingInvoer.activaVolledig).
 */
export function registerTeltMee(o: OndernemingInvoer): boolean {
  return activaregisterTeltMee(o)
}

/**
 * Urencriterium van de persoon in het jaar: over al zijn ondernemingen samen (art. 3.6; voor de FOR-afname art. 3.70
 * lid 1 onder b, 'de belastingplichtige'). Uit `PersoonResultaat.urencriteriumGehaald`; een oudere uitkomst zonder dat
 * veld valt terug op de ondernemingen (gehaald als er één is die het haalt).
 */
export function urencriteriumPersoon(r: PersoonResultaat): boolean | undefined {
  if (typeof r.urencriteriumGehaald === 'boolean') return r.urencriteriumGehaald
  if (r.ondernemingen.length === 0) return undefined
  return r.ondernemingen.some((o) => o.urencriteriumGehaald)
}

/**
 * Openstaande verliezen na de verrekening van vorig jaar. Uit de uitkomst (`verliezenResterend`); zonder dat veld
 * nagerekend in dezelfde volgorde als `verrekenVerliezen`. Wat na vorig jaar vervalt, valt weg.
 */
function verliezenNa(p: PersoonInvoer, r: PersoonResultaat, vorigJaar: number, vooruit: number): JaarBedrag[] {
  if (r.verliezenResterend) return r.verliezenResterend.filter((v) => v.bedrag > 0 && v.vervaltNa > vorigJaar).map((v) => ({ jaar: v.jaar, bedrag: v.bedrag }))
  const open = (p.verliezen ?? []).filter((v) => v.bedrag > 0 && v.jaar < vorigJaar).sort((a, b) => a.jaar - b.jaar)
  let teVerdelen = Math.max(0, r.verliesverrekening)
  const uit: JaarBedrag[] = []
  for (const v of open) {
    if (vorigJaar > v.jaar + vooruit) continue
    const neem = Math.min(teVerdelen, v.bedrag)
    teVerdelen -= neem
    const rest = v.bedrag - neem
    // Na vorig jaar nog te gebruiken: niet in vorig jaar voor het laatst.
    if (rest > 0 && v.jaar + vooruit > vorigJaar) uit.push({ jaar: v.jaar, bedrag: rest })
  }
  return uit
}

function historieNa(p: PersoonInvoer, r: PersoonResultaat, vorigJaar: number): LijfrenteHistorieJaar[] {
  const iv = p.inkomensvoorziening
  const tabel = r.inkomensvoorziening.tabel
  const historie: LijfrenteHistorieJaar[] = (iv.historie ?? []).map((h) => {
    const rij = tabel.find((t) => t.jaar === h.jaar)
    return rij && rij.ditJaarBenut > 0 ? { ...kopie(h), alGebruikt: Math.max(0, h.alGebruikt) + rij.ditJaarBenut } : kopie(h)
  })
  if (!historie.some((h) => h.jaar === vorigJaar)) {
    const eigen = tabel.find((t) => t.jaar === vorigJaar)
    historie.push({
      jaar: vorigJaar,
      premiegrondslagInkomen: iv.premiegrondslagInkomenVorigJaar ?? 0,
      ...(iv.forToenameVorigJaar ? { forToenameVorigJaar: iv.forToenameVorigJaar } : {}),
      ...(iv.pensioencorrectieVorigJaar ? { pensioencorrectie: kopie(iv.pensioencorrectieVorigJaar) } : {}),
      alGebruikt: eigen?.ditJaarBenut ?? 0,
      ...(eigen ? { jaarruimteOverride: eigen.jaarruimte } : {}),
    })
  }
  return historie.sort((a, b) => a.jaar - b.jaar)
}

function nietBenutNa(r: PersoonResultaat, vorigJaar: number): JaarBedrag[] {
  const oa = r.ondernemersaftrek
  const uit: JaarBedrag[] = (oa.nietBenutOverzicht ?? []).filter((x) => x.rest > 0 && x.laatsteJaar > vorigJaar).map((x) => ({ jaar: x.jaar, bedrag: x.rest }))
  if (oa.nietBenutteZelfstandigenaftrekNieuw > 0) uit.push({ jaar: vorigJaar, bedrag: Math.round(oa.nietBenutteZelfstandigenaftrekNieuw) })
  return uit
}

/**
 * Fiscale boekwaarde aan het einde van vorig jaar per actief uit het register (zelfde volgorde als `activa`). Uit de
 * afschrijvingen in de uitkomst; staat een actief daar niet in (bijvoorbeeld bij een saldo zonder geboekte
 * afschrijving), dan met dezelfde afschrijvingsregels zelf gerekend. Begin min afschrijving, zodat een verkoop
 * later dan vorig jaar de boekwaarde niet op 0 zet.
 */
function boekwaardenEind(activa: ActiefInvoer[], ro: OndernemingResultaat | undefined, params: TaxYearParams | null, vorigJaar: number): Array<number | undefined> {
  const telt = (a: ActiefInvoer) => jaarVan(a.aanschafdatum) <= vorigJaar && !(a.verkocht && jaarVan(a.verkocht.datum) < vorigJaar)
  const regels = ro?.afschrijvingen ?? []
  const perIndex = new Map<number, AfschrijvingActief>()
  if (regels.every((x) => x.invoerIndex !== undefined)) {
    for (const x of regels) perIndex.set(x.invoerIndex!, x)
  } else {
    // Oudere uitkomst zonder positie: één regel per meegeteld actief, in dezelfde volgorde.
    const meegeteld = activa.map((a, i) => ({ a, i })).filter(({ a }) => telt(a))
    if (regels.length === meegeteld.length && meegeteld.every(({ a }, k) => regels[k].omschrijving === a.omschrijving && regels[k].aanschafwaarde === a.aanschafwaarde)) {
      meegeteld.forEach(({ i }, k) => perIndex.set(i, regels[k]))
    }
  }
  return activa.map((a, i) => {
    if (!telt(a)) return undefined
    const x = perIndex.get(i) ?? (params ? berekenAfschrijvingen([a], { params, jaar: vorigJaar, isStarter: ro?.isStarter ?? false }).perActief[0] : undefined)
    return x ? x.boekwaardeBegin - x.afschrijving : undefined
  })
}

/** Genoten investeringsaftrek per investering, als fractie van het bedrag waarover de aftrek is berekend. */
function genotenAftrek(inv: InvesteringInvoer, ro: OndernemingResultaat | undefined): { regeling: Regeling; genotenPct: number } | undefined {
  const per = ro?.investeringsaftrekPerMiddel ?? []
  const eigen = per.filter((m) => m.omschrijving === inv.omschrijving && m.datum === inv.datum && m.bedrag === inv.bedrag)
  if (eigen.length === 0) return undefined
  let fractie = 0
  for (const m of eigen) {
    if (m.genotenPct !== undefined) {
      fractie += m.genotenPct
    } else if (m.regeling === 'kia') {
      // De KIA is naar rato verdeeld; het percentage van de hele KIA voorkomt afrondingsruis per middel.
      const kia = per.filter((x) => x.regeling === 'kia')
      const betaald = kia.reduce((s, x) => s + x.betaald, 0)
      if (betaald > 0) fractie += kia.reduce((s, x) => s + x.aftrek, 0) / betaald
    } else if (m.betaald > 0) {
      fractie += m.aftrek / m.betaald
    }
  }
  // Ook 0% wordt vastgelegd (zoals bij de Moneybird-overname): dan is zichtbaar dat verkoop geen bijtelling geeft.
  const genotenPct = Math.max(0, Math.round(fractie * 10_000) / 10_000)
  const regeling: Regeling = inv.regeling && inv.regeling !== 'geen' ? inv.regeling : eigen[0].regeling
  return { regeling, genotenPct }
}

function doorrolOnderneming(
  o: OndernemingInvoer,
  index: number,
  ro: OndernemingResultaat | undefined,
  params: TaxYearParams | null,
  vorigJaar: number,
  nieuwJaar: number,
): DoorrolOnderneming {
  const register = o.activa ?? []
  const teldeMee = registerTeltMee(o)
  const volledig = o.activaVolledig === true
  // De fiscale boekwaarde aan het einde past alleen bij de aangifte van vorig jaar als het register daar meetelde.
  const eindwaarden = teldeMee ? boekwaardenEind(register, ro, params, vorigJaar) : register.map(() => undefined)

  // Investeringen die al in het register staan: eerst zelfde datum en bedrag, dan zelfde omschrijving in hetzelfde jaar
  // (bijvoorbeeld 2.050 in het register tegen 2.000 bij de investeringen). Elk registermiddel hoort bij één investering.
  const investeringen = o.investeringen ?? []
  const inRegister = new Map<number, number>()
  const bezet = new Set<number>()
  const koppel = (past: (inv: InvesteringInvoer, a: ActiefInvoer) => boolean) =>
    investeringen.forEach((inv, k) => {
      if (inRegister.has(k) || !(inv.bedrag > 0)) return
      const i = register.findIndex((a, j) => !bezet.has(j) && past(inv, a))
      if (i < 0) return
      bezet.add(i)
      inRegister.set(k, i)
    })
  koppel((inv, a) => a.aanschafdatum === inv.datum && Math.round(a.aanschafwaarde) === Math.round(inv.bedrag))
  koppel((inv, a) => zelfdeOmschrijving(a, inv) && jaarVan(a.aanschafdatum) === jaarVan(inv.datum))
  // Zo'n registermiddel krijgt de investeringsaftrek die over de investering is genoten (voor de desinvesteringsbijtelling).
  const aftrekRegister = new Map<number, NonNullable<ActiefInvoer['investeringsaftrek']>>()
  for (const [k, i] of inRegister) {
    if (register[i].investeringsaftrek || investeringen[k].uitgesloten) continue
    const aftrek = genotenAftrek(investeringen[k], ro)
    if (aftrek) aftrekRegister.set(i, { regeling: aftrek.regeling, jaar: vorigJaar, genotenPct: aftrek.genotenPct })
  }

  const activa: DoorrolActief[] = []
  const verkocht: ActiefInvoer[] = []
  register.forEach((a, i) => {
    const actief: ActiefInvoer = { ...kopie(a), herkomst: a.herkomst ?? `act:${vorigJaar}:${i}` }
    if (a.verkocht && jaarVan(a.verkocht.datum) <= vorigJaar) return void verkocht.push(actief)
    // De boekwaarde begin van vorig jaar hoort bij vorig jaar. Alleen een register dat meetelde geeft een nieuwe.
    delete actief.boekwaardeBegin
    const eind = eindwaarden[i]
    if (eind !== undefined) actief.boekwaardeBegin = Math.round(eind)
    const aftrek = aftrekRegister.get(i)
    if (aftrek) actief.investeringsaftrek = aftrek
    activa.push({ actief, herkomst: 'register' })
  })

  const af = params?.ondernemer.waarde.afschrijving
  // De kortste levensduur die de maximale afschrijving per jaar toelaat; de gebruiker bevestigt of past hem aan.
  const levensduur = af && af.maxPctPerJaar > 0 ? Math.ceil(1 / af.maxPctPerJaar - 1e-9) : 1
  const restInvesteringen: DoorrolRestInvestering[] = []
  investeringen.forEach((inv, k) => {
    if (!(inv.bedrag > 0) || inRegister.has(k)) return
    // Uitgesloten van investeringsaftrek (zoals een personenauto) is wel een bedrijfsmiddel: nodig in een volledig register.
    if (inv.uitgesloten && !volledig) return
    // Onder de grens voor directe aftrek is alles in het aanschafjaar afgeschreven: geen boekwaarde om door te rollen.
    if (af && inv.bedrag < af.directAftrekbaarTot) return
    if (inv.inGebruik === false) {
      const betaald = Math.max(0, Math.min(inv.bedrag, inv.betaald ?? 0))
      const rest = Math.round(inv.bedrag - betaald)
      restInvesteringen.push({
        totaal: inv.bedrag,
        betaald,
        investering: {
          omschrijving: inv.omschrijving,
          datum: `${nieuwJaar}-01-01`,
          bedrag: Math.max(0, rest),
          ...(inv.regeling ? { regeling: inv.regeling } : {}),
          ...(inv.uitgesloten ? { uitgesloten: true } : {}),
          ...(inv.gekochtVanPartner ? { gekochtVanPartner: true } : {}),
          ...(inv.gemeld ? { gemeld: true } : {}),
        },
      })
      return
    }
    const aftrek = inv.uitgesloten ? undefined : genotenAftrek(inv, ro)
    activa.push({
      herkomst: 'investering',
      actief: {
        omschrijving: inv.omschrijving,
        aanschafdatum: inv.datum,
        aanschafwaarde: inv.bedrag,
        restwaarde: 0,
        levensduurJaren: levensduur,
        methode: 'lineair',
        soort: 'bedrijfsmiddel',
        bron: 'investering',
        herkomst: `inv:${vorigJaar}:${k}`,
        ...(aftrek ? { investeringsaftrek: { regeling: aftrek.regeling, jaar: vorigJaar, genotenPct: aftrek.genotenPct } } : {}),
        ...afboekingNaarActief(inv, k, ro),
      },
    })
  })

  const beginbalans = jaarrekeningVoorNieuwJaar(o.jaarrekening)?.begin
  return {
    naam: o.naam,
    index,
    ...(o.for && ro?.forStandEind !== undefined ? { forStand: Math.max(0, Math.round(ro.forStandEind)) } : {}),
    ...(beginbalans ? { beginbalans } : {}),
    activa,
    verkocht,
    registerTeldeMee: teldeMee,
    activaVolledig: volledig,
    restInvesteringen,
    ...doorrolReserves(o, ro, params, vorigJaar, nieuwJaar, inRegister),
  }
}

/** Leidt de doorgerolde saldi af uit het vorige jaar en de uitkomst daarvan (ontbreekt die, dan alleen balans en activa). */
export function berekenDoorrol(vorig: HuishoudenInvoer, vorigResultaat: HuishoudenResultaat | undefined, nieuwJaar: number): Doorrol {
  const vorigJaar = vorig.jaar
  const params = paramsVan(vorig)
  const vooruit = params?.box1.waarde.verliesverrekening.vooruit ?? Number.POSITIVE_INFINITY
  const meldingen: string[] = []
  const personen = vorig.personen.map((p): DoorrolPersoon => {
    const r = vorigResultaat?.personen.find((x) => x.id === p.id)
    const ondernemingen = p.ondernemingen.map((o, i) => doorrolOnderneming(o, i, r?.ondernemingen[i], params, vorigJaar, nieuwJaar))
    if (!r) return { id: p.id, ondernemingen }
    const uren = urencriteriumPersoon(r)
    return {
      id: p.id,
      ...(uren !== undefined ? { urencriteriumVorigJaar: uren } : {}),
      ondernemingen,
      saldi: {
        verliezen: verliezenNa(p, r, vorigJaar, vooruit),
        nietBenutteZelfstandigenaftrek: nietBenutNa(r, vorigJaar),
        restantPga: Math.max(0, Math.round(r.pgaToerekening?.restant ?? 0)),
        premiegrondslagInkomen: premiegrondslagInkomen(r),
        lijfrenteHistorie: historieNa(p, r, vorigJaar),
        forToename: forToename(r),
        nieuwVerlies: Math.max(0, Math.round(r.verliesDitJaar ?? -(r.drempelinkomenBox1 ?? 0))),
        ...doorrolSaldiBronbelasting(r),
        ...(genotenStakingsaftrekNa(p, r) !== undefined ? { genotenStakingsaftrek: genotenStakingsaftrekNa(p, r) } : {}),
        ...box2SaldiNa(r, nieuwJaar),
      },
    }
  })
  const eigenWoningA2 = eigenWoningDoorrol(vorig, vorigResultaat)
  const terug = params?.box1.waarde.verliesverrekening.terug
  return { vorigJaar, nieuwJaar, personen, meldingen, ...(terug !== undefined ? { verliesTerug: terug } : {}), ...(eigenWoningA2 ?? {}) }
}

// ---------------------------------------------------------------------------
// Toepassen op een jaar
// ---------------------------------------------------------------------------

const normaal = (naam: string) => naam.trim().toLocaleLowerCase('nl-NL')
const naamVan = (p: { id: string; naam?: string }) => (p.naam?.trim() ? p.naam.trim() : `Persoon ${p.id}`)

/** Koppelt de ondernemingen van dit jaar aan die van vorig jaar: op naam, anders op dezelfde plek. */
function koppelOndernemingen(huidig: OndernemingInvoer[], vorig: DoorrolOnderneming[]): Array<DoorrolOnderneming | undefined> {
  const bezet = new Set<number>()
  const opNaam = huidig.map((o) => {
    const v = vorig.find((x) => !bezet.has(x.index) && normaal(x.naam) === normaal(o.naam))
    if (v) bezet.add(v.index)
    return v
  })
  return opNaam.map((v, i) => {
    if (v) return v
    const opPlek = vorig.find((x) => x.index === i)
    if (!opPlek || bezet.has(i) || huidig.some((o) => normaal(o.naam) === normaal(opPlek.naam))) return undefined
    bezet.add(i)
    return opPlek
  })
}

/**
 * Zet het doorgerolde register in de activa van dit jaar. Koppelen gaat op de vaste herkomst (zolang omschrijving,
 * datum of bedrag nog klopt), dan op aanschafdatum en aanschafwaarde, dan op omschrijving bij een middel dat eerder
 * is doorgerold. Wat de gebruiker verwijderde (`uitgesloten`) komt niet terug. Een eerder doorgerold middel dat in
 * vorig jaar niet meer bestaat, gaat eruit; eigen middelen van dit jaar blijven staan.
 */
function voegActivaSamen(huidig: ActiefInvoer[] | undefined, d: DoorrolOnderneming, uitgesloten: ReadonlySet<string>, nieuwJaar: boolean): ActiefInvoer[] {
  const pool = huidig ?? []
  const bezet = new Set<number>()
  const items = d.activa.filter((x) => !(x.actief.herkomst && uitgesloten.has(x.actief.herkomst)))
  const koppeling: Array<number | undefined> = items.map(() => undefined)
  const zoek = (past: (a: ActiefInvoer, d: ActiefInvoer) => boolean) =>
    items.forEach((x, k) => {
      if (koppeling[k] !== undefined) return
      const j = pool.findIndex((a, i) => !bezet.has(i) && past(a, x.actief))
      if (j < 0) return
      bezet.add(j)
      koppeling[k] = j
    })
  zoek((a, x) => a.herkomst !== undefined && a.herkomst === x.herkomst && lijktOp(a, x))
  zoek((a, x) => sleutel(a) === sleutel(x))
  zoek((a, x) => a.herkomst !== undefined && zelfdeOmschrijving(a, x))

  const uit: ActiefInvoer[] = items.map(({ actief, herkomst }, k) => {
    const j = koppeling[k]
    if (j === undefined) return kopie(actief)
    const bestaand = pool[j]
    if (herkomst === 'investering') {
      // Een bedrijfsmiddel uit een investering: levensduur, restwaarde, methode en boekwaarde heeft de gebruiker hier ingevuld.
      return { ...kopie(bestaand), herkomst: actief.herkomst, ...(actief.investeringsaftrek ? { investeringsaftrek: kopie(actief.investeringsaftrek) } : {}) }
    }
    // Gegevens en boekwaarde uit vorig jaar. Een verkoop in dit jaar hoort bij dit jaar en blijft staan, en zonder
    // fiscale boekwaarde uit vorig jaar ook de boekwaarde begin die de gebruiker hier invulde.
    const eigenBoekwaarde = !nieuwJaar && actief.boekwaardeBegin === undefined && bestaand.boekwaardeBegin !== undefined
    return {
      ...kopie(actief),
      ...(bestaand.verkocht ? { verkocht: kopie(bestaand.verkocht) } : {}),
      ...(eigenBoekwaarde ? { boekwaardeBegin: bestaand.boekwaardeBegin } : {}),
    }
  })

  // Verkocht in of vóór vorig jaar: eruit.
  for (const v of d.verkocht) {
    const j = pool.findIndex((a, i) => !bezet.has(i) && ((a.herkomst !== undefined && a.herkomst === v.herkomst && lijktOp(a, v)) || sleutel(a) === sleutel(v)))
    if (j >= 0) bezet.add(j)
  }
  // Eigen middelen van dit jaar blijven; een doorgerold middel zonder bron meer in vorig jaar niet.
  const rest = pool.filter((a, i) => !bezet.has(i) && (a.herkomst === undefined || uitgesloten.has(a.herkomst)))
  return [...uit, ...rest.map((a) => kopie(a))]
}

/**
 * Meldingen over de bedrijfsmiddelen na het doorrollen, op basis van wat er nu in het jaar staat: levensduur en
 * restwaarde nog te bevestigen (bron 'investering'), of een boekwaarde begin die de gebruiker zelf moet invullen
 * omdat het register vorig jaar niet meetelde of het middel uit een investering komt.
 */
function activaMeldingen(o: OndernemingInvoer, dv: DoorrolOnderneming, d: Doorrol): string[] {
  const uit: string[] = []
  const activa = o.activa ?? []
  const naam = (a: ActiefInvoer) => a.omschrijving.trim() || 'een bedrijfsmiddel zonder omschrijving'
  const bevestigen = activa.filter((a) => a.bron === 'investering')
  if (bevestigen.length > 0) {
    const een = bevestigen.length === 1
    uit.push(
      `${o.naam}: controleer de levensduur en restwaarde van ${opsomming(bevestigen.map(naam))}. ${een ? 'Dat bedrijfsmiddel komt' : 'Die bedrijfsmiddelen komen'} uit je investeringen en we namen de snelste afschrijving die fiscaal mag, zonder restwaarde. Bij een bus of machine die je 8 tot 10 jaar gebruikt, is dat te veel aftrek.`,
    )
  }
  const soort = new Map(dv.activa.map((x) => [x.actief.herkomst, x.herkomst]))
  const zonderBoekwaarde = activa.filter((a) => {
    const herkomst = a.herkomst ? soort.get(a.herkomst) : undefined
    if (!herkomst || a.boekwaardeBegin !== undefined || a.methode === 'direct') return false
    if (!(jaarVan(a.aanschafdatum) < d.nieuwJaar) || (a.verkocht && jaarVan(a.verkocht.datum) < d.nieuwJaar)) return false
    return herkomst === 'investering' || a.bron === 'investering' || !dv.registerTeldeMee
  })
  if (zonderBoekwaarde.length > 0) {
    const registerNiet = !dv.registerTeldeMee && zonderBoekwaarde.some((a) => a.bron !== 'investering' && soort.get(a.herkomst!) === 'register')
    uit.push(
      `${o.naam}: vul bij ${opsomming(zonderBoekwaarde.map(naam))} de fiscale boekwaarde op 1 januari ${d.nieuwJaar} in. Dat is de boekwaarde eind ${d.vorigJaar} uit je aangifte of jaarrekening van ${d.vorigJaar}.${registerNiet ? ` Het activaregister telde in ${d.vorigJaar} niet mee in de winst, dus je aangifte rekende met de afschrijving uit je boekhouding.` : ''} Zonder dat bedrag rekenen we de boekwaarde uit vanaf de aanschaf, alsof je altijd fiscaal zo afschreef.`,
    )
  }
  return uit
}

/** Rest van een investering die eind vorig jaar nog niet in gebruik was: bij een nieuw jaar klaarzetten, anders melden. */
function restInvesteringen(o: OndernemingInvoer, dv: DoorrolOnderneming, d: Doorrol, nieuwJaar: boolean): string[] {
  const uit: string[] = []
  for (const r of dv.restInvesteringen) {
    const inv = r.investering
    const oms = inv.omschrijving.trim() || 'Een investering'
    const inRegister = (o.activa ?? []).some((a) => zelfdeOmschrijving(a, inv))
    const heel = inRegister ? '' : ` Neem je het in gebruik, zet het dan bij de bedrijfsmiddelen met de hele aanschafwaarde van ${euro(r.totaal)}.`
    const al = (o.investeringen ?? []).some((x) => zelfdeOmschrijving(x, inv))
    if (inv.bedrag <= 0 || al) {
      if (heel) uit.push(`${oms} was eind ${d.vorigJaar} nog niet in gebruik.${heel}`)
      continue
    }
    const opbouw = `${euro(inv.bedrag)} (${euro(r.totaal)} min de ${euro(r.betaald)} die je in ${d.vorigJaar} al betaalde)`
    if (nieuwJaar) {
      o.investeringen = [...(o.investeringen ?? []), kopie(inv)]
      uit.push(
        `${oms} was eind ${d.vorigJaar} nog niet in gebruik. De rest van de investering, ${opbouw}, staat klaar bij de investeringen van ${d.nieuwJaar}. Was het eind ${d.nieuwJaar} nog steeds niet in gebruik, zet dat dan bij die investering aan.${heel}`,
      )
    } else {
      uit.push(`${oms} was eind ${d.vorigJaar} nog niet in gebruik. Neem je het in ${d.nieuwJaar} in gebruik, vul dan bij de investeringen de rest in: ${opbouw}.${heel}`)
    }
  }
  return uit
}

function historieToepassen(huidig: LijfrenteHistorieJaar[] | undefined, afgeleid: LijfrenteHistorieJaar[], vorigJaar: number): LijfrenteHistorieJaar[] {
  const uit = (huidig ?? []).map((h) => kopie(h))
  for (const a of afgeleid) {
    const i = uit.findIndex((h) => h.jaar === a.jaar)
    if (i < 0) uit.push(kopie(a))
    else if (a.jaar === vorigJaar) uit[i] = kopie(a)
    else uit[i] = { ...uit[i], alGebruikt: a.alGebruikt }
  }
  return uit.sort((a, b) => a.jaar - b.jaar)
}

const lijstOfWeg = <K extends 'verliezen' | 'nietBenutteZelfstandigenaftrek'>(p: PersoonInvoer, veld: K, lijst: JaarBedrag[]) => {
  if (lijst.length > 0) p[veld] = lijst
  else delete p[veld]
}

/**
 * Zet de doorgerolde velden uit `d` in een kopie van `doel` en laat de rest staan. Wat de gebruiker zelf hoort in te
 * vullen blijft: een verlies van vorig jaar zelf (na de verliesbeschikking), activa die niet uit vorig jaar komen,
 * de gegevens van een bedrijfsmiddel dat uit een investering van vorig jaar is gemaakt, verwijderde doorgerolde
 * middelen en een bewust gekozen antwoord op 'alle bedrijfsmiddelen in het register'.
 *
 * `nieuwJaar`: het jaar wordt net aangemaakt uit vorig jaar. Dan volgt `activaVolledig` vorig jaar helemaal en staat
 * de rest van een nog niet in gebruik genomen investering klaar bij de investeringen.
 */
export function pasDoorrolToe(doel: HuishoudenInvoer, d: Doorrol, opties: { nieuwJaar?: boolean } = {}): { invoer: HuishoudenInvoer; meldingen: string[] } {
  const nieuwJaar = opties.nieuwJaar === true
  const uit = kopie(doel)
  const meldingen = [...d.meldingen]
  for (const p of uit.personen) {
    const dp = d.personen.find((x) => x.id === p.id)
    if (!dp) continue
    const s = dp.saldi
    if (s) {
      const zelf = (p.verliezen ?? []).filter((v) => v.jaar >= d.vorigJaar)
      lijstOfWeg(p, 'verliezen', [...s.verliezen, ...zelf].sort((a, b) => a.jaar - b.jaar))
      lijstOfWeg(p, 'nietBenutteZelfstandigenaftrek', s.nietBenutteZelfstandigenaftrek)
      if (s.restantPga > 0) p.restantPgaVorigJaar = s.restantPga
      else delete p.restantPgaVorigJaar
      p.inkomensvoorziening.premiegrondslagInkomenVorigJaar = s.premiegrondslagInkomen
      if (s.forToename > 0) p.inkomensvoorziening.forToenameVorigJaar = s.forToename
      else delete p.inkomensvoorziening.forToenameVorigJaar
      p.inkomensvoorziening.historie = historieToepassen(p.inkomensvoorziening.historie, s.lijfrenteHistorie, d.vorigJaar)
      pasDoorrolBronbelastingToe(p, s)
      if (s.genotenStakingsaftrek !== undefined) p.genotenStakingsaftrek = s.genotenStakingsaftrek
      pasBox2SaldiToe(p, s)
      if (s.nieuwVerlies > 0 && !zelf.some((v) => v.jaar === d.vorigJaar)) {
        meldingen.push(
          `${naamVan(p)} had in ${d.vorigJaar} een verlies in box 1 van ${euro(s.nieuwVerlies)}. Dat gaat eerst terug naar ${d.verliesTerug ? `de ${d.verliesTerug} jaar daarvoor` : 'eerdere jaren'}. Wat na de verliesbeschikking overblijft, vul je hier zelf in bij de verliezen (jaar ${d.vorigJaar}).`,
        )
      }
    }
    // Het urencriterium geldt per persoon: elke onderneming van de persoon krijgt dezelfde waarde.
    if (dp.urencriteriumVorigJaar !== undefined) for (const o of p.ondernemingen) o.uren = { ...o.uren, urencriteriumVorigJaar: dp.urencriteriumVorigJaar }
    const gekoppeld = koppelOndernemingen(p.ondernemingen, dp.ondernemingen)
    p.ondernemingen.forEach((o, i) => {
      const dv = gekoppeld[i]
      if (!dv) {
        if (dp.ondernemingen.length > 0) meldingen.push(`Voor ${o.naam} is er in ${d.vorigJaar} geen onderneming met dezelfde naam. Oudedagsreserve, beginbalans en bedrijfsmiddelen zijn daar niet overgenomen.`)
        return
      }
      if (dv.forStand !== undefined) o.for = { ...(o.for ?? {}), stand: dv.forStand }
      if (dv.beginbalans) o.jaarrekening = { ...(o.jaarrekening ?? {}), begin: { ...dv.beginbalans } }
      const activa = voegActivaSamen(o.activa, dv, new Set(o.doorrolUitgesloten ?? []), nieuwJaar)
      if (activa.length > 0) o.activa = activa
      else delete o.activa
      if (nieuwJaar) {
        if (dv.activaVolledig && activa.length > 0) o.activaVolledig = true
        else delete o.activaVolledig
      } else if (dv.activaVolledig && o.activaVolledig === undefined && activa.length > 0) {
        // Vorig jaar volledig en hier nog niet beantwoord; een bewust 'nee' blijft staan.
        o.activaVolledig = true
      }
      meldingen.push(...activaMeldingen(o, dv, d), ...restInvesteringen(o, dv, d, nieuwJaar))
      pasReservesToe(o, dv, d.nieuwJaar)
    })
  }
  if (d.eigenwoningreserve && d.eigenwoningschuldPerLeningdeel && d.box3SchuldenUitEigenWoning) {
    pasEigenWoningToe(uit, { eigenwoningreserve: d.eigenwoningreserve, eigenwoningschuldPerLeningdeel: d.eigenwoningschuldPerLeningdeel, box3SchuldenUitEigenWoning: d.box3SchuldenUitEigenWoning })
  }
  return { invoer: uit, meldingen }
}

// ---------------------------------------------------------------------------
// Wijzigingen tonen
// ---------------------------------------------------------------------------

const lijstTekst = (l: JaarBedrag[] | undefined) => (l && l.length > 0 ? l.map((x) => `${x.jaar}: ${euro(x.bedrag)}`).join(', ') : 'geen')
const bedragTekst = (n: number | undefined, leeg = 'leeg') => (n === undefined ? leeg : euro(n))
const jaNee = (b: boolean | undefined) => (b === undefined ? 'onbekend' : b ? 'gehaald' : 'niet gehaald')
const gelijk = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function actiefVelden(a: ActiefInvoer): Array<[string, string]> {
  return [
    ['boekwaarde begin', a.boekwaardeBegin === undefined ? 'berekend vanaf de aanschaf' : euro(a.boekwaardeBegin)],
    ['levensduur', `${a.levensduurJaren} jaar`],
    ['restwaarde', euro(a.restwaarde)],
    ['methode', a.methode],
    ['investeringsaftrek', a.investeringsaftrek ? `${pct(a.investeringsaftrek.genotenPct)} (${a.investeringsaftrek.jaar})` : 'geen'],
  ]
}

/** Koppelt de activa van twee versies van een jaar: op herkomst, dan op aanschafdatum en aanschafwaarde. */
function koppelActiva(oud: ActiefInvoer[], nieuw: ActiefInvoer[]): Array<number | undefined> {
  const bezet = new Set<number>()
  const paren: Array<number | undefined> = nieuw.map(() => undefined)
  const zoek = (past: (a: ActiefInvoer, b: ActiefInvoer) => boolean) =>
    nieuw.forEach((a, k) => {
      if (paren[k] !== undefined) return
      const j = oud.findIndex((b, i) => !bezet.has(i) && past(a, b))
      if (j < 0) return
      bezet.add(j)
      paren[k] = j
    })
  zoek((a, b) => a.herkomst !== undefined && a.herkomst === b.herkomst)
  zoek((a, b) => sleutel(a) === sleutel(b))
  return paren
}

/** Wat er tussen twee versies van een jaar verandert in de doorgerolde velden. */
export function doorrolWijzigingen(oud: HuishoudenInvoer, nieuw: HuishoudenInvoer): DoorrolWijziging[] {
  const vorigJaar = nieuw.jaar - 1
  const uit: DoorrolWijziging[] = []
  for (const pn of nieuw.personen) {
    const po = oud.personen.find((x) => x.id === pn.id)
    if (!po) continue
    const w = (label: string, a: string, b: string, onderneming?: string) => {
      if (a !== b) uit.push({ persoon: pn.id, ...(onderneming ? { onderneming } : {}), label, oud: a, nieuw: b })
    }
    w('Verliezen box 1', lijstTekst(po.verliezen), lijstTekst(pn.verliezen))
    w('Niet-benutte zelfstandigenaftrek', lijstTekst(po.nietBenutteZelfstandigenaftrek), lijstTekst(pn.nietBenutteZelfstandigenaftrek))
    w(`Persoonsgebonden aftrek die in ${vorigJaar} niet paste`, bedragTekst(po.restantPgaVorigJaar, 'geen'), bedragTekst(pn.restantPgaVorigJaar, 'geen'))
    w(`Premiegrondslag-inkomen ${vorigJaar}`, bedragTekst(po.inkomensvoorziening.premiegrondslagInkomenVorigJaar), bedragTekst(pn.inkomensvoorziening.premiegrondslagInkomenVorigJaar))
    w(`Toename oudedagsreserve in ${vorigJaar}`, bedragTekst(po.inkomensvoorziening.forToenameVorigJaar, 'geen'), bedragTekst(pn.inkomensvoorziening.forToenameVorigJaar, 'geen'))
    for (const x of bronbelastingWijzigingen(po, pn)) w(x.label, x.oud, x.nieuw)
    w('Stakingsaftrek eerder genoten', bedragTekst(po.genotenStakingsaftrek, 'geen'), bedragTekst(pn.genotenStakingsaftrek, 'geen'))
    for (const x of wijzigingenPrive(po, pn, oud, nieuw)) w(x.label, x.oud, x.nieuw)
    const hOud = po.inkomensvoorziening.historie ?? []
    for (const h of pn.inkomensvoorziening.historie ?? []) {
      const o = hOud.find((x) => x.jaar === h.jaar)
      if (!o) {
        w(`Lijfrentehistorie ${h.jaar}`, 'niet in de lijst', `toegevoegd, jaarruimte ${bedragTekst(h.jaarruimteOverride, 'berekend')}`)
        continue
      }
      w(`Lijfrentehistorie ${h.jaar}: inkomen jaar ervoor`, bedragTekst(o.premiegrondslagInkomen), bedragTekst(h.premiegrondslagInkomen))
      w(`Lijfrentehistorie ${h.jaar}: toename FOR jaar ervoor`, bedragTekst(o.forToenameVorigJaar, 'geen'), bedragTekst(h.forToenameVorigJaar, 'geen'))
      w(`Lijfrentehistorie ${h.jaar}: jaarruimte`, bedragTekst(o.jaarruimteOverride, 'berekend'), bedragTekst(h.jaarruimteOverride, 'berekend'))
      w(`Lijfrentehistorie ${h.jaar}: al gebruikt`, bedragTekst(o.alGebruikt), bedragTekst(h.alGebruikt))
    }

    pn.ondernemingen.forEach((on, i) => {
      const oo = po.ondernemingen[i]
      if (!oo) return
      const naam = on.naam
      w('Oudedagsreserve begin', bedragTekst(oo.for?.stand, 'geen'), bedragTekst(on.for?.stand, 'geen'), naam)
      w(`Urencriterium ${vorigJaar}`, jaNee(oo.uren?.urencriteriumVorigJaar), jaNee(on.uren?.urencriteriumVorigJaar), naam)
      for (const post of BALANS_POSTEN) {
        const a = oo.jaarrekening?.begin?.[post]
        const b = on.jaarrekening?.begin?.[post]
        if (a !== b) w(`Beginbalans: ${BALANS_POST_INFO[post].label.toLocaleLowerCase('nl-NL')}`, bedragTekst(a), bedragTekst(b), naam)
      }
      w('Alle bedrijfsmiddelen in het register', oo.activaVolledig ? 'ja' : 'nee', on.activaVolledig ? 'ja' : 'nee', naam)
      for (const x of reserveWijzigingen(oo, on)) w(x.label, x.oud, x.nieuw, naam)
      const oudeActiva = oo.activa ?? []
      const paren = koppelActiva(oudeActiva, on.activa ?? [])
      ;(on.activa ?? []).forEach((a, k) => {
        const j = paren[k]
        if (j === undefined) {
          w(`Bedrijfsmiddel ${a.omschrijving}`, 'niet in de lijst', a.boekwaardeBegin === undefined ? `toegevoegd, aanschaf ${euro(a.aanschafwaarde)}` : `toegevoegd, boekwaarde begin ${euro(a.boekwaardeBegin)}`, naam)
          return
        }
        const b = oudeActiva[j]
        if (gelijk(a, b)) return
        const vo = actiefVelden(b)
        const vn = actiefVelden(a)
        vn.forEach(([veld, tekst], i) => w(`${a.omschrijving}: ${veld}`, vo[i][1], tekst, naam))
      })
      const gekoppeld = new Set(paren)
      oudeActiva.forEach((b, j) => {
        if (!gekoppeld.has(j)) w(`Bedrijfsmiddel ${b.omschrijving}`, 'in de lijst', b.verkocht ? `verkocht, uit de lijst` : 'uit de lijst', naam)
      })
    })
  }
  return uit
}

/**
 * Opnieuw overnemen: de doorgerolde saldi uit het (gewijzigde) vorige jaar in dit jaar zetten, zonder de rest van
 * de invoer te verliezen. Geeft de nieuwe invoer, wat er verandert en meldingen voor de gebruiker.
 */
export function saldiOpnieuwOvernemen(
  huidig: HuishoudenInvoer,
  vorig: HuishoudenInvoer,
  vorigResultaat: HuishoudenResultaat,
): { invoer: HuishoudenInvoer; wijzigingen: DoorrolWijziging[]; meldingen: string[] } {
  const { invoer, meldingen } = pasDoorrolToe(huidig, berekenDoorrol(vorig, vorigResultaat, huidig.jaar))
  const wijzigingen = doorrolWijzigingen(huidig, invoer)
  // Vangnet: elk verschil levert minstens één regel op, zodat 'geen wijzigingen' ook echt niets veranderen betekent.
  for (const pn of invoer.personen) {
    const po = huidig.personen.find((x) => x.id === pn.id)
    if (po && !gelijk(po, pn) && !wijzigingen.some((w) => w.persoon === pn.id)) {
      wijzigingen.push({ persoon: pn.id, label: `Overige gegevens uit ${vorig.jaar}`, oud: 'zoals nu', nieuw: `bijgewerkt uit ${vorig.jaar}` })
    }
  }
  return { invoer, wijzigingen, meldingen }
}
