/**
 * Pure hulpfuncties voor het activaregister in het dossier (ActivaInvoer). Geen React, zodat ze te testen zijn.
 * De afschrijving zelf rekent de engine; hier alleen koppelen, controleren en omzetten.
 */
import type { ActiefInvoer, AfschrijvingActief, OndernemingInvoer, TaxYearParams, Uitlegregel, Winstberekening } from '@/lib/tax/types'
import { standaardLevensduur } from '@/lib/moneybird/overname'
import { registerTeltMee } from '@/lib/dossier/doorrol'

/** Telt het register mee in de winst? Eén regel voor dossier en doorrol (lib/dossier/doorrol.ts). */
export { registerTeltMee }

/** Nieuw bedrijfsmiddel dat de gebruiker zelf toevoegt: lineair, met de kortste levensduur die fiscaal mag. */
export function nieuwActief(jaar: number, params: TaxYearParams | null): ActiefInvoer {
  return {
    omschrijving: '',
    aanschafdatum: `${jaar}-01-01`,
    aanschafwaarde: 0,
    restwaarde: 0,
    levensduurJaren: standaardLevensduur(params, false),
    methode: 'lineair',
    bron: 'handmatig',
  }
}

/**
 * Per regel van het register de positie van zijn afschrijving in de uitkomst (of -1). De engine laat middelen
 * weg die nog niet of niet meer meetellen. Met `invoerIndex` uit de engine is dat de positie in het register;
 * zonder (oudere uitkomst) koppelen we op omschrijving en aanschafwaarde, in volgorde, zodat twee gelijke regels
 * elk hun eigen uitkomst krijgen.
 */
function posities(activa: ReadonlyArray<ActiefInvoer>, perActief: ReadonlyArray<AfschrijvingActief>): number[] {
  if (perActief.length > 0 && perActief.every((r) => r.invoerIndex !== undefined)) {
    return activa.map((a, i) => perActief.findIndex((r) => r.invoerIndex === i && r.omschrijving === a.omschrijving))
  }
  const bezet = new Set<number>()
  return activa.map((a) => {
    const k = perActief.findIndex((r, j) => !bezet.has(j) && r.omschrijving === a.omschrijving && r.aanschafwaarde === a.aanschafwaarde)
    if (k >= 0) bezet.add(k)
    return k
  })
}

/** Koppelt de afschrijving per actief uit de uitkomst aan de regels van het register. */
export function koppelAfschrijvingen(activa: ReadonlyArray<ActiefInvoer>, perActief: ReadonlyArray<AfschrijvingActief> | undefined): Array<AfschrijvingActief | undefined> {
  const lijst = perActief ?? []
  return posities(activa, lijst).map((k) => (k >= 0 ? lijst[k] : undefined))
}

/**
 * De berekening per bedrijfsmiddel uit de uitleg van de engine: de regels '<prefix>.afschrijving.item' staan in
 * dezelfde volgorde als de afschrijvingen in de uitkomst.
 */
export function koppelFormules(activa: ReadonlyArray<ActiefInvoer>, perActief: ReadonlyArray<AfschrijvingActief> | undefined, uitleg: ReadonlyArray<Uitlegregel> | undefined): Array<string | undefined> {
  const lijst = perActief ?? []
  const regels = (uitleg ?? []).filter((r) => r.id.endsWith('.afschrijving.item'))
  if (regels.length !== lijst.length) return activa.map(() => undefined)
  return posities(activa, lijst).map((k) => (k >= 0 ? regels[k].formule : undefined))
}

/** Jaartal van een ISO-datum, of null als die niet klopt. */
function jaarVan(iso: string | undefined): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(iso ?? '')
  return m ? Number(m[1]) : null
}

/** Waarom een bedrijfsmiddel dit jaar geen afschrijving in de uitkomst heeft. */
export type Afwezig = 'later' | 'verkocht' | 'saldo' | 'onbekend'

export function waaromAfwezig(a: ActiefInvoer, jaar: number, wb: Winstberekening): Afwezig {
  const aanschaf = jaarVan(a.aanschafdatum)
  if (aanschaf !== null && aanschaf > jaar) return 'later'
  const verkocht = a.verkocht ? jaarVan(a.verkocht.datum) : null
  if (verkocht !== null && verkocht < jaar) return 'verkocht'
  if (wb.soort === 'saldo' && wb.afschrijvingenInSaldo === undefined) return 'saldo'
  return 'onbekend'
}

const DAG = 24 * 60 * 60 * 1000
/** Hoe dicht datum of bedrag bij elkaar moeten liggen om bij dezelfde omschrijving op een dubbele regel te wijzen. */
export const DUBBEL_DAGEN = 31
export const DUBBEL_BEDRAG_PCT = 0.1

const normOmschrijving = (x: string | undefined) => (x ?? '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ')
const dagenTussen = (a: string, b: string) => {
  const x = Date.parse(`${a}T00:00:00Z`)
  const y = Date.parse(`${b}T00:00:00Z`)
  return Number.isNaN(x) || Number.isNaN(y) ? Number.POSITIVE_INFINITY : Math.abs(x - y) / DAG
}

/**
 * Paren regels die hetzelfde bedrijfsmiddel lijken: zelfde aanschafdatum en aanschafwaarde (boven nul), of dezelfde
 * omschrijving met een aanschafdatum binnen een maand of een aanschafwaarde die minder dan 10% afwijkt (bijvoorbeeld
 * een doorgerold middel naast een eigen regel met de datum van ingebruikname of de installatiekosten erbij).
 */
export function dubbeleActiva(activa: ReadonlyArray<ActiefInvoer>): Array<[number, number]> {
  const paren: Array<[number, number]> = []
  for (let i = 0; i < activa.length; i++) {
    for (let j = i + 1; j < activa.length; j++) {
      const a = activa[i]
      const b = activa[j]
      if (!(a.aanschafwaarde > 0) || !(b.aanschafwaarde > 0)) continue
      const zelfdeSleutel = a.aanschafdatum === b.aanschafdatum && Math.round(a.aanschafwaarde) === Math.round(b.aanschafwaarde)
      const naam = normOmschrijving(a.omschrijving)
      const zelfdeNaam = naam !== '' && naam === normOmschrijving(b.omschrijving)
      const dichtbij =
        dagenTussen(a.aanschafdatum, b.aanschafdatum) <= DUBBEL_DAGEN || Math.abs(a.aanschafwaarde - b.aanschafwaarde) <= DUBBEL_BEDRAG_PCT * Math.max(a.aanschafwaarde, b.aanschafwaarde)
      if (zelfdeSleutel || (zelfdeNaam && dichtbij)) paren.push([i, j])
    }
  }
  return paren
}

/** Herkomst-id's van doorgerolde middelen die in `nieuw` niet meer voorkomen (de gebruiker verwijderde ze). */
export function verwijderdeHerkomsten(oud: ReadonlyArray<ActiefInvoer> | undefined, nieuw: ReadonlyArray<ActiefInvoer>): string[] {
  const blijft = new Set(nieuw.map((a) => a.herkomst).filter((h): h is string => h !== undefined))
  return [...new Set((oud ?? []).map((a) => a.herkomst).filter((h): h is string => h !== undefined && !blijft.has(h)))]
}

/** Na een wijziging van de lijst: verwijderde doorgerolde middelen onthouden in `doorrolUitgesloten`. */
export function zetActiva(x: OndernemingInvoer, lijst: ActiefInvoer[]): void {
  const weg = verwijderdeHerkomsten(x.activa, lijst)
  if (weg.length > 0) x.doorrolUitgesloten = [...new Set([...(x.doorrolUitgesloten ?? []), ...weg])]
  if (lijst.length > 0) x.activa = lijst
  else delete x.activa
}

/** Waar een doorgerold middel vandaan komt, uit de herkomst-id; undefined zonder (geldige) herkomst. */
export function herkomstTekst(a: ActiefInvoer): string | undefined {
  const m = /^(inv|act):(\d{4}):\d+$/.exec(a.herkomst ?? '')
  if (!m) return undefined
  return m[1] === 'inv' ? `Uit je investeringen van ${m[2]}.` : `Overgenomen uit ${m[2]}.`
}

/** Levensduur en restwaarde zijn aangenomen bij het doorrollen van een investering en nog niet bevestigd. */
export const levensduurTeBevestigen = (a: ActiefInvoer): boolean => a.bron === 'investering'

/**
 * Ontbreekt de fiscale boekwaarde op 1 januari bij een middel van een eerder jaar? Dan rekent de engine vanaf de
 * aanschaf, alsof er altijd fiscaal zo is afgeschreven; de gebruiker hoort de boekwaarde uit de aangifte over te nemen.
 */
export function boekwaardeOntbreekt(a: ActiefInvoer, jaar: number): boolean {
  const aanschaf = jaarVan(a.aanschafdatum)
  if (aanschaf === null || aanschaf >= jaar || a.boekwaardeBegin !== undefined || a.methode === 'direct') return false
  const verkocht = a.verkocht ? jaarVan(a.verkocht.datum) : null
  return verkocht === null || verkocht >= jaar
}

/** Waarom het register niet meetelt in de winst, of null als het meetelt (of leeg is). */
export function waaromTeltNiet(o: OndernemingInvoer): 'onvolledig' | 'saldo' | null {
  if (!o.activa || o.activa.length === 0 || registerTeltMee(o)) return null
  return o.activaVolledig === true ? 'saldo' : 'onvolledig'
}

/** Afschrijving zoals geboekt: de handmatige afschrijving (uitgesplitst) of de afschrijving in het saldo. */
export function geboekteAfschrijving(wb: Winstberekening): number | undefined {
  return wb.soort === 'uitgesplitst' ? wb.afschrijvingen : wb.afschrijvingenInSaldo
}

/**
 * Wisselt de soort winstberekening met hetzelfde saldo. De geboekte afschrijving gaat mee: van
 * uitgesplitst naar saldo wordt die de afschrijving in het saldo, en terug weer de afschrijving (de omzet
 * gaat dan met dat bedrag omhoog, zodat omzet min afschrijving het saldo blijft).
 */
export function wisselWinstberekening(wb: Winstberekening, naar: Winstberekening['soort'], saldo: number): Winstberekening {
  if (wb.soort === naar) return wb
  const afschrijving = geboekteAfschrijving(wb)
  if (naar === 'saldo') return afschrijving === undefined ? { soort: 'saldo', saldo } : { soort: 'saldo', saldo, afschrijvingenInSaldo: afschrijving }
  if (afschrijving === undefined) return { soort: 'uitgesplitst', omzet: Math.max(0, saldo), kosten: 0 }
  return { soort: 'uitgesplitst', omzet: Math.max(0, saldo + afschrijving), kosten: 0, afschrijvingen: afschrijving }
}

/**
 * Heeft het actief keuzes buiten de standaard (dan staat het blok met soort, methode en verkoop open)? De boekwaarde
 * op 1 januari staat buiten dat blok en telt hier niet mee.
 */
export function heeftEigenKeuzes(a: ActiefInvoer): boolean {
  return (
    (a.soort !== undefined && a.soort !== 'bedrijfsmiddel') ||
    a.methode !== 'lineair' ||
    a.verkocht !== undefined ||
    a.woz !== undefined ||
    a.willekeurigBedrag !== undefined
  )
}
