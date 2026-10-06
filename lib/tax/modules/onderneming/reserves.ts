/**
 * Ronde 2 (A6): herinvesteringsreserve (art. 3.54) en kostenegalisatiereserve (art. 3.53 lid 1 onder a).
 *
 * Herinvesteringsreserve, per reserve in dit jaar:
 *   uiterlijkJaar = termijnVerlengdTot ?? ontstaanJaar + hir.termijnJaren        (vrijval in dat jaar zelf, lid 5)
 *   dotatie       = in het ontstaansjaar bedragOntstaan, ten hoogste de boekwinst  (opbrengst − boekwaarde zonder
 *                   willekeurige afschrijving, lid 1 en 8; `begrensd`)
 *   maxAfboeking  = min(stand, Σ aanschaf van de investeringen − (boekwaardeOud − al gedekt))  (boekwaarde-eis, lid 2)
 *   afboeking     = min(gevraagd, maxAfboeking, aanschaf), per investering in volgorde  (geen winsteffect)
 * De boekwaarde-eis geldt voor alle vervangende middelen samen ("het gezamenlijke bedrag van de boekwaarden"): wordt
 * de reserve over meer jaren afgeboekt, dan telt het middel van een eerder jaar mee met aanschaf − afboeking. "Al
 * gedekt" komt uit `boekwaardeEisGedekt` (doorrol), en is in elk geval alles als er al eerder is afgeboekt (stand begin
 * lager dan de gevormde reserve): elke eerdere afboeking voldeed aan de eis.
 *   vrijval       = stand na afboeking bij staking (geheel of gedeeltelijk), zonder voornemen, of in uiterlijkJaar
 *   correctie     = zitInSaldo(mutatiesInSaldo, onderneming, 'hir') ? 0 : −dotatie + vrijval
 * Gelijke functie (lid 3 en 4): afboeken op een nieuw langlopend middel (gebouw, grond, of een levensduur boven
 * hir.langlopendVanafJaren) mag alleen met een reserve uit een middel met dezelfde economische functie
 * (`zelfdeFunctie`); de engine boekt het af en de controle hir-functie vraagt om een reden.
 *
 * Kostenegalisatiereserve, per reserve:
 *   onttrekking   = min(gevraagde onttrekking, stand begin + dotatie)   (het meerdere blijft kosten van dit jaar)
 *   vrijval       = de rest als het doel vervalt (`vervallen`) of bij staking (geheel of gedeeltelijk)
 *   standEind     = begin + dotatie − onttrekking − vrijval
 *   correctie     = zitInSaldo(inSaldo, onderneming, 'egalisatie') ? 0 : −dotatie + onttrekking + vrijval
 *
 * Bij geruisloze inbreng en doorschuiving gaan de reserves mee naar de overnemer: geen vrijval.
 * Reserves tellen niet mee in het ondernemingsvermogen voor de FOR (`standEind`, de aanroeper trekt het af).
 * Puur: geen I/O.
 */
import type {
  ActiefInvoer,
  EgalisatiereserveUitkomst,
  HerinvesteringsreserveUitkomst,
  InvesteringInvoer,
  OndernemingInvoer,
  StakingInvoer,
  TaxYearParams,
  Uitlegregel,
  Waarschuwing,
} from '../../types'
import { AFRONDING } from '../../rounding'
import { eur, euro, regel, waarschuwing } from '../../uitleg'
import { parseDatum } from '../../datum'
import { zitInSaldo } from './in-saldo'

export type StakingSoort = NonNullable<StakingInvoer['soort']>

/** Soort staking van de invoer (oude invoer: `gedeeltelijk`). */
export function stakingSoort(s: StakingInvoer | undefined): StakingSoort | undefined {
  if (!s) return undefined
  return s.soort ?? (s.gedeeltelijk ? 'gedeeltelijk' : 'geheel')
}

/** Bij deze soorten valt alles vrij in de stakingswinst; bij geruisloze inbreng en doorschuiving gaan de reserves mee. */
export const valtVrijBijStaking = (soort: StakingSoort | undefined): boolean => soort === 'geheel' || soort === 'gedeeltelijk'

/** Laatste jaar van een herinvesteringsreserve (in dat jaar valt de rest vrij). */
export function hirUiterlijkJaar(r: { ontstaanJaar: number; termijnVerlengdTot?: number }, params: TaxYearParams): number {
  return r.termijnVerlengdTot ?? r.ontstaanJaar + params.ondernemer.waarde.hir.termijnJaren
}

/**
 * Kan de boekwinst op dit middel in een herinvesteringsreserve (art. 3.54 lid 7)? Niet voor beleggingen en niet voor
 * middelen tot `afschrijving.directAftrekbaarTot` of die direct zijn afgeschreven.
 */
export function kanReserveren(a: Pick<ActiefInvoer, 'aanschafwaarde' | 'methode'> & { belegging?: boolean }, params: TaxYearParams): boolean {
  if (a.belegging) return false
  if (a.methode === 'direct') return false
  return a.aanschafwaarde > params.ondernemer.waarde.afschrijving.directAftrekbaarTot
}

/** Een middel waarop niet of in meer dan `hir.langlopendVanafJaren` jaar wordt afgeschreven (art. 3.54 lid 3 en 4). */
export function isLanglopend(a: Pick<ActiefInvoer, 'soort' | 'levensduurJaren'>, params: TaxYearParams): boolean {
  return a.soort === 'gebouw' || a.levensduurJaren > params.ondernemer.waarde.hir.langlopendVanafJaren
}

const norm = (x: string | undefined) => (x ?? '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ')

/**
 * Het middel in het activaregister dat bij een investering hoort: zelfde aanschafdatum en bedrag, anders dezelfde
 * omschrijving in hetzelfde jaar. -1 als er geen is.
 */
export function actiefVoorInvestering(inv: Pick<InvesteringInvoer, 'datum' | 'bedrag' | 'omschrijving'>, activa: ActiefInvoer[] | undefined, bezet: ReadonlySet<number> = new Set()): number {
  const lijst = activa ?? []
  const op = lijst.findIndex((a, j) => !bezet.has(j) && a.aanschafdatum === inv.datum && Math.round(a.aanschafwaarde) === Math.round(inv.bedrag))
  if (op >= 0) return op
  return lijst.findIndex((a, j) => !bezet.has(j) && norm(a.omschrijving) !== '' && norm(a.omschrijving) === norm(inv.omschrijving) && parseDatum(a.aanschafdatum).getUTCFullYear() === parseDatum(inv.datum).getUTCFullYear())
}

/** Is het nieuwe middel langlopend? Expliciet bij de investering, anders afgeleid uit het register; anders nee. */
export function nieuwLanglopend(inv: InvesteringInvoer, activa: ActiefInvoer[] | undefined, params: TaxYearParams): boolean {
  if (inv.herinvesteringsreserve?.nieuwLanglopend !== undefined) return inv.herinvesteringsreserve.nieuwLanglopend
  const j = actiefVoorInvestering(inv, activa)
  return j >= 0 ? isLanglopend((activa ?? [])[j], params) : false
}

export interface ReservesUitkomst {
  herinvesteringsreserves: HerinvesteringsreserveUitkomst[]
  egalisatiereserves: EgalisatiereserveUitkomst[]
  /** Som van de winstcorrecties (− dotatie + vrijval + onttrekking buiten het saldo). */
  correctieReserves: number
  /** Afgeboekte herinvesteringsreserve per investering (zelfde volgorde als `investeringen`). */
  afboekingPerInvestering: number[]
  /** Vrijval van beide soorten reserves door staking (deel van de stakingswinst). */
  stakingVrijval: number
  /** Stand eind van alle reserves samen (niet in het ondernemingsvermogen voor de FOR). */
  standEind: number
  /** Regels voor de winstcorrecties (plus en min). */
  correcties: Uitlegregel[]
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

export interface ReservesContext {
  params: TaxYearParams
  jaar: number
  prefix?: string
  /** Sleutel van een investering in veld-id's en uitkomsten: itemSleutel(investering, index). */
  investeringSleutel?: (inv: InvesteringInvoer, index: number) => string
}

const sleutelStandaard = (inv: InvesteringInvoer, i: number) => (typeof inv.id === 'string' && inv.id !== '' ? inv.id : String(i))

export function berekenReserves(o: OndernemingInvoer, ctx: ReservesContext): ReservesUitkomst {
  const p = ctx.params
  const jaar = ctx.jaar
  const prefix = ctx.prefix ?? 'onderneming'
  const sleutel = ctx.investeringSleutel ?? sleutelStandaard
  const soort = stakingSoort(o.staking)
  const staking = valtVrijBijStaking(soort)
  const investeringen = o.investeringen ?? []
  const afboekingPerInvestering = investeringen.map(() => 0)
  const correcties: Uitlegregel[] = []
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  let correctieReserves = 0
  let stakingVrijval = 0

  const herinvesteringsreserves: HerinvesteringsreserveUitkomst[] = (o.herinvesteringsreserves ?? []).map((r) => {
    const naam = r.herkomst.omschrijving.trim() || 'een verkocht bedrijfsmiddel'
    const uiterlijkJaar = hirUiterlijkJaar(r, p)
    const inSaldo = zitInSaldo(r.mutatiesInSaldo, o, 'hir')
    const ontstaanDitJaar = r.ontstaanJaar === jaar
    const standBegin = ontstaanDitJaar ? 0 : Math.max(0, r.standBegin)

    // 1. Dotatie in het ontstaansjaar, ten hoogste de boekwinst (lid 1 en 8).
    let dotatie = 0
    let begrensd: HerinvesteringsreserveUitkomst['begrensd']
    if (ontstaanDitJaar) {
      const gevraagd = Math.max(0, r.bedragOntstaan)
      dotatie = gevraagd
      if (r.herkomst.opbrengst !== undefined) {
        const boekwinst = Math.max(0, AFRONDING.reserve(r.herkomst.opbrengst - r.herkomst.boekwaardeOud))
        if (gevraagd > boekwinst) {
          begrensd = { gevraagd, boekwinst }
          dotatie = boekwinst
          waarschuwingen.push(
            waarschuwing(
              `${prefix}.hir.begrensd.${r.id}`,
              'let-op',
              `De herinvesteringsreserve uit ${naam} (${euro(gevraagd)}) is hoger dan de boekwinst: opbrengst ${euro(r.herkomst.opbrengst)} min de boekwaarde zonder willekeurige afschrijving ${euro(r.herkomst.boekwaardeOud)} is ${euro(boekwinst)}. We rekenen met ${euro(boekwinst)}; de rest van de boekwinst is gewone winst.`,
            ),
          )
        }
      }
    }
    const stand = standBegin + dotatie

    // 2. Afboeking op de investeringen van dit jaar (boekwaarde-eis over alle vervangende middelen samen, lid 2).
    const gekoppeld = investeringen.map((inv, i) => ({ inv, i })).filter(({ inv }) => inv.herinvesteringsreserve?.reserveId === r.id)
    const binnenTermijn = jaar >= r.ontstaanJaar && jaar <= uiterlijkJaar
    const somAanschaf = gekoppeld.reduce((s, { inv }) => s + Math.max(0, inv.bedrag), 0)
    const boekwaardeOud = Math.max(0, r.herkomst.boekwaardeOud)
    const gevormd = r.herkomst.opbrengst !== undefined ? Math.min(Math.max(0, r.bedragOntstaan), Math.max(0, AFRONDING.reserve(r.herkomst.opbrengst - boekwaardeOud))) : Math.max(0, r.bedragOntstaan)
    // Al eerder afgeboekt (stand begin lager dan gevormd) betekent: de eis was toen al helemaal gedekt. Dat gaat ook voor
    // een lager doorgerold bedrag (bijvoorbeeld een kopie van vorig jaar).
    const uitStand = !ontstaanDitJaar && standBegin < gevormd ? boekwaardeOud : 0
    const opgegeven = ontstaanDitJaar ? 0 : Math.max(0, r.boekwaardeEisGedekt ?? 0)
    const afgeleid = !ontstaanDitJaar && (r.boekwaardeEisGedekt === undefined || uitStand > opgegeven)
    const gedektBegin = Math.min(boekwaardeOud, Math.max(uitStand, opgegeven))
    const restEis = boekwaardeOud - gedektBegin
    const maxAfboeking = binnenTermijn ? Math.max(0, Math.min(stand, somAanschaf - restEis)) : 0
    let rest = maxAfboeking
    let begrensdOpAanschaf = false
    const perInvestering = gekoppeld.map(({ inv, i }) => {
      const gevraagd = Math.max(0, inv.herinvesteringsreserve?.afboeking ?? 0)
      const bedrag = Math.min(gevraagd, rest, Math.max(0, inv.bedrag))
      if (gevraagd > Math.max(0, inv.bedrag) && rest > Math.max(0, inv.bedrag)) begrensdOpAanschaf = true
      rest -= bedrag
      afboekingPerInvestering[i] += bedrag
      return {
        investering: sleutel(inv, i),
        omschrijving: inv.omschrijving,
        gevraagd,
        bedrag,
        nieuwLanglopend: nieuwLanglopend(inv, o.activa, p),
        zelfdeFunctie: inv.herinvesteringsreserve?.zelfdeFunctie === true,
      }
    })
    const afboeking = perInvestering.reduce((s, x) => s + x.bedrag, 0)
    const gevraagdTotaal = perInvestering.reduce((s, x) => s + x.gevraagd, 0)
    const gedektEind = Math.min(boekwaardeOud, gedektBegin + gekoppeld.reduce((s, { inv, i }) => s + Math.max(0, Math.max(0, inv.bedrag) - afboekingPerInvestering[i]), 0))
    if (gevraagdTotaal > afboeking) {
      const eis = gedektBegin > 0 ? `het deel van de boekwaarde van het oude dat nog niet gedekt is door eerdere vervangende middelen (${euro(restEis)} van ${euro(boekwaardeOud)})` : 'de boekwaarde van het oude'
      waarschuwingen.push(
        waarschuwing(
          `${prefix}.hir.afboeking.${r.id}`,
          'let-op',
          `Op de herinvesteringsreserve uit ${naam} kun je dit jaar ten hoogste ${euro(maxAfboeking)} afboeken${binnenTermijn ? `: de stand (${euro(stand)}) en de aanschafprijs van de nieuwe bedrijfsmiddelen min ${eis}, samen ${euro(Math.max(0, somAanschaf - restEis))}` : `, want de termijn liep tot en met ${uiterlijkJaar}`}.${begrensdOpAanschaf ? ' Op een bedrijfsmiddel boek je niet meer af dan de aanschafprijs.' : ''} We boeken ${euro(afboeking)} af in plaats van ${euro(gevraagdTotaal)}.`,
        ),
      )
    }

    // 3. Vrijval: staking, geen voornemen meer, of het laatste jaar van de termijn.
    const na = stand - afboeking
    const reden: HerinvesteringsreserveUitkomst['reden'] = staking ? 'staking' : !r.voornemen ? 'geen-voornemen' : jaar >= uiterlijkJaar ? 'termijn' : undefined
    const vrijval = reden ? na : 0
    const standEind = na - vrijval
    if (reden === 'staking') stakingVrijval += vrijval
    if (jaar > uiterlijkJaar && vrijval > 0) {
      waarschuwingen.push(
        waarschuwing(`${prefix}.hir.verlopen.${r.id}`, 'let-op', `De herinvesteringsreserve uit ${naam} had uiterlijk in ${uiterlijkJaar} gebruikt moeten zijn. We laten de stand van ${euro(vrijval)} dit jaar vrijvallen.`),
      )
    } else if (reden === 'termijn' && vrijval > 0) {
      waarschuwingen.push(
        waarschuwing(`${prefix}.hir.vervalt.${r.id}`, 'let-op', `${uiterlijkJaar} is het laatste jaar van de herinvesteringsreserve uit ${naam}. Wat je dit jaar niet afboekt (${euro(vrijval)}), valt vrij in de winst.`),
      )
    }

    // 4. Winstcorrectie buiten het saldo.
    const omschrijving = `Herinvesteringsreserve uit ${naam}`
    if (!inSaldo) {
      if (dotatie > 0) {
        correcties.push(regel(`${prefix}.hir.dotatie`, `Toevoeging aan de ${omschrijving.charAt(0).toLowerCase()}${omschrijving.slice(1)}`, dotatie, 'min', { formule: begrensd ? `boekwinst ${eur(begrensd.boekwinst)} (gevraagd ${eur(begrensd.gevraagd)})` : `boekwinst ${eur(dotatie)} niet belast zolang je opnieuw investeert`, parameter: 'ondernemer.hir.termijnJaren' }))
      }
      if (vrijval > 0) {
        correcties.push(regel(`${prefix}.hir.vrijval`, `Vrijval ${omschrijving.charAt(0).toLowerCase()}${omschrijving.slice(1)}`, vrijval, 'plus', { formule: redenTekst(reden, uiterlijkJaar) }))
      }
      correctieReserves += -dotatie + vrijval
    }
    uitleg.push(
      regel(`${prefix}.hir.stand`, omschrijving, standEind, 'info', {
        niveau: 2,
        formule: `begin ${eur(standBegin)} + toevoeging ${eur(dotatie)} − afgeboekt ${eur(afboeking)} − vrijval ${eur(vrijval)}${inSaldo ? ' (zit al in het saldo)' : ''}; uiterlijk gebruiken in ${uiterlijkJaar}${gedektBegin > 0 ? `; boekwaarde-eis: ${eur(gedektBegin)} van ${eur(boekwaardeOud)} al gedekt door eerdere vervangende middelen` : ''}`,
        parameter: 'ondernemer.hir',
      }),
    )
    return {
      id: r.id,
      omschrijving,
      ontstaanJaar: r.ontstaanJaar,
      standBegin,
      dotatie,
      afboeking,
      vrijval,
      standEind,
      uiterlijkJaar,
      ...(reden ? { reden } : {}),
      ...(begrensd ? { begrensd } : {}),
      perInvestering,
      maxAfboeking,
      inSaldo,
      boekwaardeEis: { boekwaardeOud, gedektBegin, gedektEind, afgeleid },
    }
  })

  const egalisatiereserves: EgalisatiereserveUitkomst[] = (o.egalisatiereserves ?? []).map((e) => {
    const naam = e.omschrijving.trim() || 'Kostenegalisatiereserve'
    const inSaldo = zitInSaldo(e.inSaldo, o, 'egalisatie')
    const standBegin = Math.max(0, e.standBegin)
    const dotatie = Math.max(0, e.dotatie ?? 0)
    const beschikbaar = standBegin + dotatie
    const gevraagd = Math.max(0, e.onttrekking ?? 0)
    const onttrekking = Math.min(gevraagd, beschikbaar)
    const onttrekkingBovenStand = gevraagd - onttrekking
    const na = beschikbaar - onttrekking
    const reden: EgalisatiereserveUitkomst['reden'] = staking ? 'staking' : e.vervallen ? 'vervallen' : undefined
    const vrijval = reden ? na : 0
    const standEind = na - vrijval
    if (reden === 'staking') stakingVrijval += vrijval
    const winstcorrectie = inSaldo ? 0 : -dotatie + onttrekking + vrijval
    if (!inSaldo) {
      if (dotatie > 0) correcties.push(regel(`${prefix}.egalisatie.dotatie`, `Toevoeging aan de kostenegalisatiereserve (${naam})`, dotatie, 'min'))
      if (onttrekking > 0)
        correcties.push(
          regel(`${prefix}.egalisatie.onttrekking`, `Onderhoud ten laste van de kostenegalisatiereserve (${naam})`, onttrekking, 'plus', {
            formule: onttrekkingBovenStand > 0 ? `${eur(onttrekking)} uit de reserve; ${eur(onttrekkingBovenStand)} blijft kosten van dit jaar` : `${eur(onttrekking)} uit de reserve in plaats van de kosten`,
          }),
        )
      if (vrijval > 0) correcties.push(regel(`${prefix}.egalisatie.vrijval`, `Vrijval kostenegalisatiereserve (${naam})`, vrijval, 'plus', { formule: reden === 'staking' ? 'staking' : 'het doel is vervallen' }))
    }
    correctieReserves += winstcorrectie
    uitleg.push(
      regel(`${prefix}.egalisatie.stand`, `Kostenegalisatiereserve (${naam})`, standEind, 'info', {
        niveau: 2,
        formule: `begin ${eur(standBegin)} + toevoeging ${eur(dotatie)} − gebruikt ${eur(onttrekking)} − vrijval ${eur(vrijval)}${inSaldo ? ' (zit al in het saldo)' : ''}`,
      }),
    )
    return {
      id: e.id,
      omschrijving: naam,
      standBegin,
      dotatie,
      onttrekking,
      vrijval,
      standEind,
      winstcorrectie,
      ...(onttrekkingBovenStand > 0 ? { onttrekkingBovenStand } : {}),
      inSaldo,
      ...(reden ? { reden } : {}),
    }
  })

  // Investeringsaftrek over het bedrag na afboeking, tenzij gekozen is voor het volle bedrag (goedkeuring).
  investeringen.forEach((inv, i) => {
    if (afboekingPerInvestering[i] > 0 && inv.herinvesteringsreserve?.kiaOverVolBedrag) {
      waarschuwingen.push(
        waarschuwing(
          `${prefix}.hir.kiaVol`,
          'info',
          `Je rekent de investeringsaftrek over het volle bedrag van ${inv.omschrijving.trim() || 'de investering'}, zonder vermindering met de herinvesteringsreserve. Een hoger investeringsbedrag in de afbouwzone kan de KIA verlagen.`,
        ),
      )
    }
  })

  const standEind = herinvesteringsreserves.reduce((s, r) => s + r.standEind, 0) + egalisatiereserves.reduce((s, e) => s + e.standEind, 0)
  return { herinvesteringsreserves, egalisatiereserves, correctieReserves, afboekingPerInvestering, stakingVrijval, standEind, correcties, uitleg, waarschuwingen }
}

function redenTekst(reden: HerinvesteringsreserveUitkomst['reden'], uiterlijkJaar: number): string {
  if (reden === 'staking') return 'staking van de onderneming'
  if (reden === 'geen-voornemen') return 'geen herinvesteringsvoornemen meer'
  return `laatste jaar van de termijn (${uiterlijkJaar})`
}

/**
 * Zet de afboeking van een herinvesteringsreserve op het middel in het register dat bij de investering hoort (zelfde
 * datum en bedrag, of omschrijving in hetzelfde jaar), als dat middel er nog geen heeft. Geeft een nieuwe lijst; de
 * invoer blijft ongewijzigd. Zo schrijft het register af over aanschaf − afboeking − restwaarde (lid 1).
 */
export function activaMetAfboeking(activa: ActiefInvoer[] | undefined, investeringen: InvesteringInvoer[] | undefined, afboeking: number[]): ActiefInvoer[] | undefined {
  if (!activa || activa.length === 0) return activa
  const lijst = investeringen ?? []
  if (!afboeking.some((x) => x > 0)) return activa
  const uit = [...activa]
  const bezet = new Set<number>()
  lijst.forEach((inv, i) => {
    if (!(afboeking[i] > 0)) return
    const j = actiefVoorInvestering(inv, uit, bezet)
    if (j < 0) return
    bezet.add(j)
    if (uit[j].herinvesteringsreserveAfboeking !== undefined) return
    uit[j] = { ...uit[j], herinvesteringsreserveAfboeking: afboeking[i] }
  })
  return uit
}
