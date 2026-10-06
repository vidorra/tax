/**
 * Ronde 2 (A4): van gelezen bestanden naar een voorstel per rekening, en het voorstel toepassen op de invoer. Puur.
 *
 * Per rekening twee of drie bezittingen: effecten (Beleggingen), geld (bank of overige bezitting) en crypto. Stromen
 * (broker-import.md 2.2):
 *
 *   | Gebeurtenis                       | Effecten / crypto      | Geld                   |
 *   | Storting / opname van buiten      |                        | storting / opname      |
 *   | Koop / verkoop                    | storting / opname      | opname / storting      |
 *   | Bruto dividend                    | directe opbrengst      |                        |
 *   | Netto dividend en rente op geld   |                        | storting               |
 *   | Ingehouden NL-dividendbelasting   | dividendbelasting      |                        |
 *   | Ingehouden buitenlandse belasting | bronbelasting per land |                        |
 *   | Rente                             |                        | directe opbrengst      |
 *   | Kosten                            |                        | opname                 |
 *   | Staking                           | opbrengst en storting  |                        |
 *
 * Zo telt dividend één keer, is de ingehouden belasting geen verlies en zijn kosten niet aftrekbaar. De som van het
 * werkelijk rendement over de bezittingen is het rendement van de rekening als geheel (DEGIRO-voorbeeld: € 367,25).
 *
 * Een import vervangt de jaartotalen van de rekening (stortingen, opnames, opbrengsten, dividendbelasting,
 * bronbelasting en, als bekend, de waarde begin en eind) door wat alle bestanden die je in één keer kiest samen geven.
 * Niet optellen, niet ontdubbelen: overlap geeft een melding.
 */
import type { BronbelastingLand, BronbelastingRegel, Box3Categorie, Eigenaar, HuishoudenInvoer, VermogensPositie } from '@/lib/tax/types'
import type { BrokerOngedaan, Gebeurtenis, ImportMelding, ImportRol, ImportVoorstel, ImportVraag, ImportWijziging, OntbreektItem, PresetUitkomst } from './types'
import { centen } from './getallen'
import { bepaalLand, landNaam, landUitIsin } from './land'
import { BROKERS, FAMILIE, type BrokerFamilie, type BrokerInfo } from './presets'
import { FIAT } from './presets/hulp'
import { familieUitSleutel } from './sleutel'

export interface RekeningKeuzes {
  /** Van wie de rekening is; 'samen' splitst bij twee personen zonder fiscaal partnerschap in twee helften. */
  eigenaar?: Eigenaar | 'samen'
  /** Doelbezitting per rol (bij 'samen' per `${rol}:${eigenaar}`): id van een bestaande positie, of 'nieuw'. */
  doel?: Record<string, string>
  /** Antwoorden op vragen, op vraag-id. */
  antwoorden?: Record<string, string>
  /** Ingevulde waarden voor wat ontbreekt, per rol (voor de hele rekening, ook bij 'samen'). */
  standen?: Partial<Record<ImportRol, { waardeBegin?: number; waardeEind?: number }>>
  /** Koers per valuta of munt in euro's per eenheid; null = die regels weglaten. */
  koersen?: Record<string, number | null>
  /** "Toch opnieuw inlezen": een al ingelezen bestand toch toepassen. */
  opnieuw?: boolean
}

export interface VoorstelOpties {
  invoer: HuishoudenInvoer
  jaar: number
  keuzes?: Record<string, RekeningKeuzes>
  /** Datum van vandaag (yyyy-mm-dd) voor `herkomst.geimporteerdOp`. */
  vandaag?: string
  /** Landentabel (standaard BRONBELASTING_LANDEN; tests geven een eigen tabel). */
  tabel?: readonly BronbelastingLand[]
  /** Id voor een nieuwe bezitting; standaard `imp-<rol>-<n>` met de laagste vrije n. */
  nieuwId?: (rol: ImportRol, bezet: Set<string>) => string
}

const ROLLEN: ImportRol[] = ['effecten', 'geld', 'crypto']
const ROL_NAAM: Record<ImportRol, string> = { effecten: 'de effecten', geld: 'het geld', crypto: 'de crypto' }

/** Categorieën die bij een rol passen, voor "Bij welke bezitting?". */
export const ROL_CATEGORIEEN: Record<ImportRol, Box3Categorie[]> = {
  effecten: ['beleggingen', 'groen'],
  geld: ['bankNL', 'bankBuitenland', 'contant', 'overig'],
  crypto: ['crypto', 'overig'],
}

interface Acc {
  st: number
  ont: number
  directe: number
  divbel: number
  bron: Map<string, { land: string; soort: 'dividend' | 'rente'; bruto: number; bedrag: number; datum?: string }>
}
const acc = (): Acc => ({ st: 0, ont: 0, directe: 0, divbel: 0, bron: new Map() })

function standaardId(rol: ImportRol, bezet: Set<string>): string {
  let n = 1
  while (bezet.has(`imp-${rol}-${n}`)) n++
  return `imp-${rol}-${n}`
}

const isCryptoActivum = (g: Gebeurtenis) => Boolean(g.activum) && (g.formaat === 'bitvavo' || g.formaat === 'coinbase') && !FIAT.has(g.activum!.toUpperCase())


const euro = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
export function datumTekst(iso: string): string {
  const [j, m, d] = iso.split('-').map(Number)
  return `${d} ${MAANDEN[m - 1]} ${j}`
}

/** Overlap van twee perioden, of null. */
function overlapVan(a: { van: string; tot: string }, b: { van: string; tot: string }): { van: string; tot: string } | null {
  const van = a.van > b.van ? a.van : b.van
  const tot = a.tot < b.tot ? a.tot : b.tot
  return van <= tot ? { van, tot } : null
}

function bronId(soort: 'dividend' | 'rente', land: string): string {
  return `bb-${soort === 'rente' ? 'r' : 'd'}-${land ? land.toLowerCase() : 'onbekend'}`
}

function bronTekst(r: { bruto: number; bedrag: number }): string {
  return `${euro(r.bedrag)} op ${euro(r.bruto)}`
}

/** Een voorstel per rekening (een sleutel). */
export function maakVoorstel(uitkomsten: PresetUitkomst[], opties: VoorstelOpties): ImportVoorstel[] {
  const perRekening = new Map<string, PresetUitkomst[]>()
  for (const u of uitkomsten) {
    const lijst = perRekening.get(u.rekening) ?? []
    lijst.push(u)
    perRekening.set(u.rekening, lijst)
  }
  const bezet = new Set(opties.invoer.box3.posities.map((p) => p.id))
  return [...perRekening.entries()].map(([rekening, lijst]) => voorstelVoorRekening(rekening, lijst, opties, bezet))
}

function voorstelVoorRekening(rekening: string, lijst: PresetUitkomst[], opties: VoorstelOpties, bezet: Set<string>): ImportVoorstel {
  const { invoer, jaar } = opties
  const k = opties.keuzes?.[rekening] ?? {}
  const antwoorden = k.antwoorden ?? {}
  const vandaag = opties.vandaag ?? `${jaar + 1}-01-01`
  const transacties = lijst.filter((u) => u.gebeurtenissen.length > 0 || u.standen.length === 0)
  const standBestanden = lijst.filter((u) => u.gebeurtenissen.length === 0 && u.standen.length > 0)
  const formaat = (transacties[0] ?? lijst[0]).formaat
  const familie: BrokerFamilie = (familieUitSleutel(rekening) as BrokerFamilie) in BROKERS ? (familieUitSleutel(rekening) as BrokerFamilie) : FAMILIE[formaat]
  const info: BrokerInfo = BROKERS[familie]
  const meldingen: ImportMelding[] = []
  const vragen: ImportVraag[] = []
  const ontbreekt: OntbreektItem[] = []
  const voegMelding = (m: ImportMelding) => {
    if (!meldingen.some((x) => x.id === m.id && x.tekst === m.tekst)) meldingen.push(m)
  }
  for (const u of lijst) for (const m of u.meldingen) voegMelding(m)

  // Gebeurtenissen in het jaar (Europe/Amsterdam, al omgezet door de preset).
  const binnen = (d: string) => d.startsWith(`${jaar}-`)
  for (const u of transacties) {
    if (u.gebeurtenissen.length > 0 && !u.gebeurtenissen.some((g) => binnen(g.datum))) {
      const naam = u.bestand?.naam ?? 'dit bestand'
      voegMelding({ id: `buiten-jaar-${naam}`, ernst: 'let-op', tekst: `De datums in ${naam} vallen buiten ${jaar}. Kies het overzicht van ${jaar}, of lees het in bij het juiste jaar.` })
    }
  }
  const alle = transacties.flatMap((u) => u.gebeurtenissen.filter((g) => binnen(g.datum)))

  // Koersen: regels zonder euro-bedrag krijgen de koers van de gebruiker, of tellen niet mee.
  const zonderKoers = new Map<string, number>()
  const events: Gebeurtenis[] = []
  for (const g of alle) {
    if (g.eur !== undefined) {
      events.push(g)
      continue
    }
    const koers = k.koersen?.[g.valuta]
    if (koers === null) continue
    if (koers !== undefined && koers > 0) {
      events.push({ ...g, eur: centen(g.bedrag * koers), koersBron: 'gebruiker' })
      continue
    }
    zonderKoers.set(g.valuta, (zonderKoers.get(g.valuta) ?? 0) + 1)
  }
  for (const [valuta, aantal] of zonderKoers) {
    ontbreekt.push({ rol: info.crypto && !FIAT.has(valuta) ? 'crypto' : 'effecten', veld: 'koers', valuta, aantal, uitleg: `${aantal === 1 ? 'Eén regel' : `${aantal} regels`} in ${valuta} zonder koers. Vul een koers in of laat ze weg.` })
  }

  // Stromen per rol.
  const r: Record<ImportRol, Acc> = { effecten: acc(), geld: acc(), crypto: acc() }
  let netto = 0
  let aankopen = 0
  let verkopen = 0
  let kosten = 0
  let gestort = 0
  let opgenomen = 0
  let dividendBruto = 0
  let rente = 0
  const heeft = new Set<ImportRol>()
  /** Per effect: bruto dividend, ingehouden belasting en het land dat de broker meldt. */
  const perIsin = new Map<string, { bruto: number; belasting: number; brokerLand?: string; datum?: string }>()
  const isinGroep = (g: Gebeurtenis) => {
    const key = g.isin ?? `?${g.land ?? ''}`
    const x = perIsin.get(key) ?? { bruto: 0, belasting: 0 }
    perIsin.set(key, x)
    return x
  }
  let renteBelasting = 0
  let renteBelastingDatum: string | undefined
  const landenInBestand = new Set<string>()

  for (const g of events) {
    const eur = g.eur ?? 0
    const crypto = isCryptoActivum(g)
    const doel = crypto ? r.crypto : r.effecten
    switch (g.soort) {
      case 'storting':
        r.geld.st += eur
        gestort += eur
        heeft.add('geld')
        break
      case 'opname':
        r.geld.ont += -eur
        opgenomen += -eur
        heeft.add('geld')
        break
      case 'koop':
        doel.st += -eur
        r.geld.ont += -eur
        aankopen += -eur
        heeft.add(crypto ? 'crypto' : 'effecten').add('geld')
        break
      case 'verkoop':
        doel.ont += eur
        r.geld.st += eur
        verkopen += eur
        heeft.add(crypto ? 'crypto' : 'effecten').add('geld')
        break
      case 'kapitaalterugbetaling':
        r.effecten.ont += eur
        r.geld.st += eur
        heeft.add('effecten').add('geld')
        break
      case 'dividend': {
        r.effecten.directe += eur
        netto += eur
        dividendBruto += eur
        heeft.add('effecten').add('geld')
        if (!g.geenVerdragsdividend && !g.brutoOnbekend) {
          const x = isinGroep(g)
          x.bruto += eur
          if (g.land && g.landBron === 'broker') x.brokerLand = g.land
        }
        if (g.isin) {
          const l = landUitIsin(g.isin)
          if (l) landenInBestand.add(l)
        }
        break
      }
      case 'dividendbelasting':
        netto += eur
        heeft.add('geld')
        if (g.opRente) {
          renteBelasting += -eur
          renteBelastingDatum = renteBelastingDatum && renteBelastingDatum < g.datum ? renteBelastingDatum : g.datum
        } else {
          const x = isinGroep(g)
          x.belasting += -eur
          if (g.land && g.landBron === 'broker') {
            x.brokerLand = g.land
            landenInBestand.add(g.land)
          }
          x.datum = x.datum && x.datum < g.datum ? x.datum : g.datum
          heeft.add('effecten')
        }
        break
      case 'rente':
        r.geld.directe += eur
        netto += eur
        rente += eur
        heeft.add('geld')
        break
      case 'kosten':
        if (g.activum && isCryptoActivum(g)) r.crypto.ont += -eur
        else r.geld.ont += -eur
        kosten += -eur
        heeft.add(g.activum && isCryptoActivum(g) ? 'crypto' : 'geld')
        break
      case 'valutaIntern':
        netto += eur
        break
      case 'staking':
        r.crypto.directe += eur
        r.crypto.st += eur
        heeft.add('crypto')
        break
      case 'cryptoIn':
        r.crypto.st += eur
        heeft.add('crypto')
        break
      case 'cryptoUit':
        r.crypto.ont += -eur
        heeft.add('crypto')
        break
      default:
        break
    }
  }
  if (netto >= 0) r.geld.st += netto
  else r.geld.ont += -netto

  // Land van de ingehouden belasting per effect: broker, ISIN, of de gebruiker.
  for (const [key, x] of perIsin) {
    if (x.belasting === 0) continue
    const isin = key.startsWith('?') ? undefined : key
    const pct = x.bruto > 0 ? x.belasting / x.bruto : null
    const zonder = bepaalLand({ brokerLand: x.brokerLand, isin, percentage: pct }, { tabel: opties.tabel })
    const isinLand = landUitIsin(isin)
    const antwoord = isin ? antwoorden[`land:${isin}`] : undefined
    let land = zonder.land
    if (isinLand === 'NL' && !x.brokerLand) land = 'NL'
    if (zonder.vraag && isin) {
      vragen.push({
        id: `land:${isin}`,
        tekst: `Uit welk land komt dit dividend (${isin})? Het ingehouden percentage (${(zonder.vraag.percentage * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%) past niet bij ${landNaam(zonder.vraag.isinLand, opties.tabel)}.`,
        opties: [
          { waarde: zonder.vraag.isinLand, label: landNaam(zonder.vraag.isinLand, opties.tabel) },
          { waarde: 'anders', label: 'Ander land' },
        ],
        land: true,
        ...(antwoord ? { gekozen: antwoord } : {}),
      })
      land = antwoord && /^[A-Z]{2}$/.test(antwoord) ? antwoord : ''
    }
    if (!isin && key.length > 1) land = key.slice(1)
    if (land === 'NL') {
      r.effecten.divbel += x.belasting
      continue
    }
    const sleutel = `dividend|${land}`
    const b = r.effecten.bron.get(sleutel) ?? { land, soort: 'dividend' as const, bruto: 0, bedrag: 0 }
    b.bruto += x.bruto
    b.bedrag += x.belasting
    if (x.datum && (!b.datum || x.datum < b.datum)) b.datum = x.datum
    r.effecten.bron.set(sleutel, b)
  }
  if (renteBelasting > 0) {
    const antwoord = antwoorden['land-rente']
    const land = antwoord && /^[A-Z]{2}$/.test(antwoord) ? antwoord : ''
    const eerst = [...landenInBestand].filter((l) => l !== 'NL')
    vragen.push({
      id: 'land-rente',
      tekst: 'Uit welk land komt de belasting op rente? De broker noemt geen land.',
      opties: [...eerst.slice(0, 1).map((l) => ({ waarde: l, label: landNaam(l, opties.tabel) })), { waarde: 'anders', label: 'Ander land' }],
      land: true,
      ...(antwoord ? { gekozen: antwoord } : {}),
    })
    r.geld.bron.set(`rente|${land}`, { land, soort: 'rente', bruto: rente, bedrag: renteBelasting, ...(renteBelastingDatum ? { datum: renteBelastingDatum } : {}) })
  }

  // Standen: begin en eind per rol, uit de bestanden (een portefeuille vraagt altijd de peildatum).
  const standen: Record<ImportRol, { begin?: number; eind?: number }> = { effecten: {}, geld: {}, crypto: {} }
  const standDatum = (d: string): 'begin' | 'eind' | null => {
    if (d === `${jaar - 1}-12-31` || d === `${jaar}-01-01`) return 'begin'
    if (d === `${jaar}-12-31` || d === `${jaar + 1}-01-01`) return 'eind'
    return null
  }
  const zetStand = (rol: ImportRol, wanneer: 'begin' | 'eind', bedrag: number) => {
    standen[rol][wanneer] = centen((standen[rol][wanneer] ?? 0) + bedrag)
    heeft.add(rol)
  }
  for (const u of lijst) {
    const portefeuille = u.gebeurtenissen.length === 0
    u.standen.forEach((s, i) => {
      let wanneer = standDatum(s.datum)
      if (portefeuille) {
        const id = `peildatum:${u.bestand?.hash ?? `${u.formaat}-${i}`}`
        const gekozen = antwoorden[id]
        if (gekozen === 'begin' || gekozen === 'eind') wanneer = gekozen
        const naam = u.bestand?.naam ?? 'Portefeuille'
        vragen.push({
          id,
          tekst: s.datum ? `${naam}: stand op ${datumTekst(s.datum)}, eind van de dag. Welke waarde is dat?` : `${naam}: op welke datum is deze stand?`,
          opties: [
            { waarde: 'begin', label: `Waarde op 1 januari ${jaar}` },
            { waarde: 'eind', label: `Waarde op 1 januari ${jaar + 1}` },
          ],
          verplicht: true,
          ...(wanneer ? { gekozen: wanneer } : {}),
        })
      }
      if (!wanneer) return
      for (const regel of s.regels) zetStand(regel.soort === 'geld' ? 'geld' : regel.soort === 'crypto' ? 'crypto' : 'effecten', wanneer, regel.eur)
    })
  }

  // Eigenaar en doelbezittingen.
  const posities = invoer.box3.posities
  const metHerkomst = posities.filter((p) => p.herkomst?.sleutel === rekening)
  const tweePersonen = invoer.personen.length === 2
  /** Bestaande bezitting zonder herkomst met de naam van de broker en een passende categorie (ronde 1, met de hand ingevuld). */
  const opNaam = (rol: ImportRol) => posities.filter((p) => !p.herkomst && ROL_CATEGORIEEN[rol].includes(p.categorie) && p.omschrijving.toLowerCase().includes(info.naam.toLowerCase()))
  const gekozenEigenaar = k.eigenaar ?? metHerkomst[0]?.eigenaar ?? ROLLEN.map((rol) => opNaam(rol)).find((l) => l.length === 1)?.[0]?.eigenaar ?? invoer.personen[0]?.id ?? 'A'
  const splitsen = gekozenEigenaar === 'samen' && tweePersonen && !invoer.fiscaalPartner
  const eigenaren: Eigenaar[] = splitsen ? ['A', 'B'] : [gekozenEigenaar === 'samen' ? (invoer.personen[0]?.id ?? 'A') : gekozenEigenaar]
  if (gekozenEigenaar === 'samen' && !splitsen && invoer.fiscaalPartner) {
    voegMelding({ id: 'samen-partners', ernst: 'info', tekst: 'Jullie zijn fiscale partners: de bezitting komt op naam van de eerste persoon. Hoe box 3 tussen jullie verdeeld wordt, kies je bij Verdeling tussen partners.' })
  }

  const rollen = ROLLEN.filter((rol) => heeft.has(rol))
  const metTransacties = transacties.some((u) => u.gebeurtenissen.length > 0)
  const gebruikt = new Set<string>()
  const huidigeHashes = lijst.map((u) => u.bestand?.hash).filter((h): h is string => Boolean(h))
  const eerder = metHerkomst.flatMap((p) => p.herkomst?.bestanden ?? [])
  const eerderHashes = new Set(eerder.map((b) => b.hash))
  const alIngelezen = !k.opnieuw && huidigeHashes.length > 0 && huidigeHashes.every((h) => eerderHashes.has(h))
  const ingelezenOp = alIngelezen ? metHerkomst.map((p) => p.herkomst?.geimporteerdOp).filter(Boolean).sort().pop()?.slice(0, 10) : undefined

  const huidigeBestanden = lijst
    .filter((u) => u.bestand)
    .map((u) => ({ hash: u.bestand!.hash, regels: u.bestand!.regels, ...(u.gebeurtenissen.length > 0 && u.dekking ? { van: u.dekking.van, tot: u.dekking.tot } : {}) }))

  const viaJa = antwoorden.via === 'ja'
  const uitPosities: ImportVoorstel['posities'] = []
  const helft = (x: number, i: number) => (splitsen ? (i === 0 ? centen(x / 2) : centen(x - centen(x / 2))) : centen(x))

  for (const rol of rollen) {
    eigenaren.forEach((eigenaar, deel) => {
      const doelSleutel = splitsen ? `${rol}:${eigenaar}` : rol
      const gekozen = k.doel?.[doelSleutel]
      let bestaand: VermogensPositie | undefined
      if (gekozen && gekozen !== 'nieuw') bestaand = posities.find((p) => p.id === gekozen)
      if (!gekozen) {
        bestaand =
          metHerkomst.find((p) => p.herkomst?.rol === rol && (!splitsen || p.eigenaar === eigenaar) && !gebruikt.has(p.id)) ??
          (() => {
            const kandidaten = opNaam(rol).filter((p) => !gebruikt.has(p.id) && (!splitsen || p.eigenaar === eigenaar))
            return kandidaten.length === 1 ? kandidaten[0] : undefined
          })()
      }
      if (bestaand && gebruikt.has(bestaand.id)) bestaand = undefined
      if (bestaand) gebruikt.add(bestaand.id)

      const nieuw = !bestaand
      const id = bestaand?.id ?? (opties.nieuwId ?? standaardId)(rol, bezet)
      if (nieuw) bezet.add(id)
      const voor: VermogensPositie | null = bestaand ? structuredClone(bestaand) : null
      const categorie: Box3Categorie =
        bestaand?.categorie ??
        (rol === 'effecten' ? 'beleggingen' : rol === 'crypto' ? 'crypto' : (info.geldCategorie ?? (antwoorden['geld-bank'] === 'nee' ? 'overig' : info.bankCategorie)))
      const wordt: VermogensPositie = voor
        ? structuredClone(voor)
        : { id, omschrijving: splitsen ? `${info.namen[rol]} (${deel === 0 ? 'deel A' : 'deel B'})` : info.namen[rol], categorie, eigenaar, waardeBegin: 0 }
      wordt.eigenaar = eigenaar
      const a = r[rol]
      if (metTransacties) {
        wordt.stortingen = helft(a.st, deel)
        wordt.onttrekkingen = helft(a.ont, deel)
        wordt.directeOpbrengsten = helft(a.directe, deel)
        if (rol === 'effecten' && a.divbel !== 0) wordt.dividendbelasting = helft(a.divbel, deel)
        else delete wordt.dividendbelasting
        const regels: BronbelastingRegel[] = [...a.bron.values()]
          .sort((x, y) => x.soort.localeCompare(y.soort) || x.land.localeCompare(y.land))
          .map((b) => ({ id: bronId(b.soort, b.land), land: b.land, soort: b.soort, brutoInkomsten: helft(b.bruto, deel), bedrag: helft(b.bedrag, deel), ...(b.datum ? { datum: b.datum } : {}) }))
        delete wordt.bronbelasting
        if (regels.length > 0) wordt.bronbelastingen = regels
        else delete wordt.bronbelastingen
      }
      // Standen: uit het bestand, anders wat de gebruiker invulde, anders wat er al stond.
      const ingevuld = k.standen?.[rol]
      const begin = standen[rol].begin ?? ingevuld?.waardeBegin
      const eind = standen[rol].eind ?? ingevuld?.waardeEind
      if (begin !== undefined) wordt.waardeBegin = helft(begin, deel)
      if (eind !== undefined) wordt.waardeEind = helft(eind, deel)
      if (deel === 0) {
        if (standen[rol].begin === undefined && (nieuw || !voor?.waardeBegin)) {
          ontbreekt.push({ rol, veld: 'waardeBegin', uitleg: `De waarde van ${ROL_NAAM[rol]} op 31 december ${jaar - 1} ontbreekt.`, waar: info.standen })
        }
        if (standen[rol].eind === undefined && (nieuw || voor?.waardeEind === undefined)) {
          ontbreekt.push({ rol, veld: 'waardeEind', uitleg: `De waarde van ${ROL_NAAM[rol]} op 31 december ${jaar} ontbreekt.`, waar: info.standen })
        }
      }
      // Herkomst: deze rekening, deze rol; eerdere bestanden van een ander soort (stand of transacties) blijven staan.
      const bestanden = [
        ...huidigeBestanden,
        ...(voor?.herkomst?.bestanden ?? []).filter((b) => {
          if (huidigeBestanden.some((h) => h.hash === b.hash)) return false
          const isTransactie = b.van !== undefined
          return isTransactie ? !metTransacties : standBestanden.length === 0
        }),
      ].slice(0, 20)
      wordt.herkomst = { bron: 'import', formaat, sleutel: rekening, rol, geimporteerdOp: vandaag, ...(bestanden.length > 0 ? { bestanden } : {}) }

      const wijzigingen = alIngelezen ? [] : wijzigingenVan(voor, wordt, rol, jaar, rol === 'geld' ? kosten : 0, opties.tabel)
      uitPosities.push({ rol, bestaandId: bestaand?.id ?? null, wordt: alIngelezen && voor ? voor : wordt, wijzigingen })
    })
  }

  // Vragen over de rekening als geheel.
  const komtNieuw = uitPosities.some((p) => p.bestaandId === null && p.wijzigingen.length > 0)
  if (info.nederlands && (komtNieuw || antwoorden.via)) {
    vragen.unshift({
      id: 'via',
      tekst: 'Staat deze rekening al in je vooraf ingevulde aangifte? Dan staat hij misschien al bij je bezittingen; twee keer invullen telt hem dubbel.',
      opties: [
        { waarde: 'ja', label: 'Ja, hij staat erin' },
        { waarde: 'nee', label: 'Nee' },
      ],
      verplicht: true,
      ...(antwoorden.via ? { gekozen: antwoorden.via } : {}),
    })
    if (viaJa && komtNieuw) {
      voegMelding({ id: 'via-ja', ernst: 'let-op', tekst: 'We voegen geen nieuwe bezitting toe, anders telt de rekening dubbel. Kies hieronder bij welke bezitting hij al staat.' })
    }
  }
  const geldNieuw = uitPosities.some((p) => p.rol === 'geld' && p.bestaandId === null)
  if (info.geldCategorie === null && geldNieuw && heeft.has('geld')) {
    vragen.push({
      id: 'geld-bank',
      tekst:
        familie === 'generiek'
          ? 'Staat het geld van deze rekening bij een bank? Ja: het is banktegoed. Nee: het is een overige bezitting (een vordering op de aanbieder).'
          : `Staat het geld op je ${info.naam}-rekening bij een bank? Ja: het is banktegoed. Nee: het is een overige bezitting (een vordering op ${info.naam}).`,
      opties: [
        { waarde: 'ja', label: 'Ja, bij een bank' },
        { waarde: 'nee', label: 'Nee' },
      ],
      verplicht: true,
      ...(antwoorden['geld-bank'] ? { gekozen: antwoorden['geld-bank'] } : {}),
    })
  }
  const extern = alle.filter((g) => g.extern && (g.soort === 'cryptoUit' || g.soort === 'cryptoIn'))
  for (const g of extern.slice(0, 5)) {
    const id = `wallet:${g.regel}`
    const munt = g.activum ?? g.valuta
    const aantal = Math.abs(g.aantal ?? g.bedrag).toLocaleString('nl-NL', { maximumFractionDigits: 8 })
    vragen.push({
      id,
      tekst: g.soort === 'cryptoUit' ? `${aantal} ${munt} ging op ${datumTekst(g.datum)} naar een extern adres. Was dat je eigen wallet?` : `${aantal} ${munt} kwam op ${datumTekst(g.datum)} van een extern adres. Kwam het uit je eigen wallet?`,
      opties: [
        { waarde: 'ja', label: 'Ja, mijn eigen wallet' },
        { waarde: 'nee', label: 'Nee' },
      ],
      ...(antwoorden[id] ? { gekozen: antwoorden[id] } : {}),
    })
    if (antwoorden[id] === 'ja') {
      voegMelding({
        id: `wallet-${g.regel}`,
        ernst: 'info',
        tekst: g.soort === 'cryptoUit' ? `Zet de ${munt} van ${datumTekst(g.datum)} als storting bij je eigen wallet, zodat het een overboeking binnen box 3 blijft.` : `Zet de ${munt} van ${datumTekst(g.datum)} als opname bij je eigen wallet.`,
      })
    }
  }
  if (extern.length > 5) voegMelding({ id: 'wallet-meer', ernst: 'info', tekst: `Er zijn nog ${extern.length - 5} overboekingen van of naar een extern adres. Controleer of dat je eigen wallets waren.` })

  // Periode en overlap.
  const perioden = transacties.filter((u) => u.dekking && u.gebeurtenissen.length > 0).map((u) => u.dekking!)
  const periode = perioden.length ? { van: perioden.map((p) => p.van).sort()[0], tot: perioden.map((p) => p.tot).sort().pop()! } : null
  const overlap: ImportVoorstel['overlap'] = []
  for (let i = 0; i < perioden.length; i++) {
    for (let j = i + 1; j < perioden.length; j++) {
      const o = overlapVan(perioden[i], perioden[j])
      if (o) overlap.push({ ...o, bron: 'gekozen-bestanden' })
    }
  }
  // Alleen bestanden over dit jaar: een bezitting die uit vorig jaar is meegenomen, heeft ook de bestanden van toen.
  const eerderTransacties = eerder.filter((b) => b.van && b.tot && !huidigeHashes.includes(b.hash) && b.tot >= `${jaar}-01-01` && b.van <= `${jaar}-12-31`)
  if (metTransacties) {
    for (const e of eerderTransacties) {
      const o = perioden.map((p) => overlapVan(p, { van: e.van!, tot: e.tot! })).find(Boolean)
      if (o) overlap.push({ ...o, bron: 'eerder-ingelezen' })
      else {
        voegMelding({
          id: `eerder-${e.hash}`,
          ernst: 'let-op',
          tekst: `Eerder las je voor deze rekening ook een overzicht van ${datumTekst(e.van!)} tot en met ${datumTekst(e.tot!)} in. Een import vervangt de bedragen van het jaar: kies alle bestanden van ${jaar} tegelijk.`,
        })
      }
    }
  }
  for (const o of overlap) {
    voegMelding({ id: `overlap-${o.van}-${o.tot}`, ernst: 'let-op', tekst: `De bestanden overlappen van ${datumTekst(o.van)} tot en met ${datumTekst(o.tot)}. Bedragen in die periode kunnen dubbel zijn.` })
  }
  if (periode && (periode.van > `${jaar}-01-31` || periode.tot < `${jaar}-12-01`) && overlap.length === 0) {
    voegMelding({
      id: 'dekking',
      ernst: 'info',
      tekst: `De transacties lopen van ${datumTekst(periode.van)} tot en met ${datumTekst(periode.tot)}. Gebeurde er buiten die periode iets op deze rekening, exporteer dan het hele jaar.`,
    })
  }

  const totaal = (veld: 'waardeBegin' | 'waardeEind') => {
    if (uitPosities.length === 0) return null
    let som = 0
    for (const p of uitPosities) {
      const v = p.wordt[veld]
      if (v === undefined || (veld === 'waardeBegin' && v === 0 && standen[p.rol].begin === undefined)) return null
      som += v
    }
    return centen(som)
  }
  const bronTotaal = [...r.effecten.bron.values(), ...r.geld.bron.values()].reduce((s, b) => s + b.bedrag, 0)

  return {
    rekening,
    formaat,
    naam: info.naam,
    eigenaar: eigenaren[0],
    samenvatting: {
      gestort: centen(gestort),
      opgenomen: centen(opgenomen),
      dividendBruto: centen(dividendBruto),
      rente: centen(rente),
      kosten: centen(kosten),
      bronbelasting: centen(bronTotaal),
      dividendbelasting: centen(r.effecten.divbel),
      waardeBegin: totaal('waardeBegin'),
      waardeEind: totaal('waardeEind'),
    },
    periode,
    overlap,
    posities: uitPosities,
    ontbreekt,
    vragen,
    meldingen,
    alIngelezen,
    ...(ingelezenOp ? { ingelezenOp } : {}),
    stromen: { aankopen: centen(aankopen), verkopen: centen(verkopen), netto: centen(netto), kosten: centen(kosten) },
    ...(splitsen ? { samen: true } : {}),
  }
}

function wijzigingenVan(voor: VermogensPositie | null, wordt: VermogensPositie, rol: ImportRol, jaar: number, kosten: number, tabel?: readonly BronbelastingLand[]): ImportWijziging[] {
  const uit: ImportWijziging[] = []
  const getal = (label: string, a: number | undefined, b: number | undefined, toelichting?: string) => {
    const nu = a === undefined ? null : centen(a)
    const wordtW = b === undefined ? null : centen(b)
    if (nu === wordtW) return
    // Bij stromen rekenen leeg en 0 hetzelfde: geen regel "– wordt € 0". Bij een waarde is leeg iets anders dan 0.
    if (!label.startsWith('Waarde') && (nu ?? 0) === (wordtW ?? 0)) return
    uit.push({ label, nu, wordt: wordtW, ...(toelichting ? { toelichting } : {}) })
  }
  getal(`Waarde 1 januari ${jaar}`, voor ? voor.waardeBegin : undefined, voor || wordt.waardeBegin !== 0 ? wordt.waardeBegin : undefined)
  getal(`Waarde 1 januari ${jaar + 1}`, voor?.waardeEind, wordt.waardeEind)
  getal('Gestort', voor?.stortingen, wordt.stortingen)
  getal('Opgenomen', voor?.onttrekkingen, wordt.onttrekkingen, kosten > 0 ? `waarvan kosten ${euro(kosten)}` : undefined)
  getal(rol === 'effecten' ? 'Dividend (bruto)' : rol === 'geld' ? 'Rente' : 'Opbrengst (staking)', voor?.directeOpbrengsten, wordt.directeOpbrengsten)
  getal('Nederlandse dividendbelasting', voor?.dividendbelasting, wordt.dividendbelasting)
  const oud = voor?.bronbelastingen ?? (voor?.bronbelasting ? [{ id: 'oud', land: voor.bronbelasting.land, soort: 'dividend' as const, brutoInkomsten: voor.bronbelasting.brutoInkomsten, bedrag: voor.bronbelasting.bedrag }] : [])
  const nieuw = wordt.bronbelastingen ?? []
  const landen = new Set([...oud.map((x) => `${x.soort}|${x.land}`), ...nieuw.map((x) => `${x.soort}|${x.land}`)])
  for (const sleutel of landen) {
    const [soort, land] = sleutel.split('|')
    const o = oud.find((x) => `${x.soort}|${x.land}` === sleutel)
    const n = nieuw.find((x) => `${x.soort}|${x.land}` === sleutel)
    const nuT = o ? bronTekst({ bruto: o.brutoInkomsten, bedrag: o.bedrag }) : null
    const wordtT = n ? bronTekst({ bruto: n.brutoInkomsten, bedrag: n.bedrag }) : null
    if (nuT === wordtT) continue
    const wat = soort === 'rente' ? 'Bronbelasting op rente' : 'Bronbelasting'
    uit.push({ label: land ? `${wat} ${landNaam(land, tabel)}` : `${wat}, land nog kiezen`, nu: nuT, wordt: wordtT })
  }
  return uit
}

/**
 * Past de voorstellen toe op de invoer: bestaande bezittingen worden bijgewerkt, nieuwe toegevoegd. Een al ingelezen
 * bestand (zonder "Toch opnieuw inlezen") verandert niets; bij Ja op de vraag over de vooraf ingevulde aangifte komt er
 * geen nieuwe bezitting bij. Geeft ook wat nodig is om de import ongedaan te maken.
 */
export function pasVoorstelToe(invoer: HuishoudenInvoer, voorstel: ImportVoorstel | ImportVoorstel[]): { invoer: HuishoudenInvoer; ongedaan: BrokerOngedaan } {
  const uit = structuredClone(invoer)
  const posities: BrokerOngedaan['posities'] = []
  for (const v of Array.isArray(voorstel) ? voorstel : [voorstel]) {
    if (v.alIngelezen) continue
    const viaJa = v.vragen.find((q) => q.id === 'via')?.gekozen === 'ja'
    for (const p of v.posities) {
      if (p.wijzigingen.length === 0) continue
      const i = p.bestaandId ? uit.box3.posities.findIndex((x) => x.id === p.bestaandId) : -1
      if (i < 0 && viaJa) continue
      const nieuw = structuredClone(p.wordt)
      if (i >= 0) {
        posities.push({ id: nieuw.id, voor: structuredClone(uit.box3.posities[i]), naImport: structuredClone(nieuw) })
        uit.box3.posities[i] = nieuw
      } else {
        posities.push({ id: nieuw.id, voor: null, naImport: structuredClone(nieuw) })
        uit.box3.posities.push(nieuw)
      }
    }
  }
  return { invoer: uit, ongedaan: { posities } }
}

/** Kan dit voorstel worden overgenomen: iets verandert en alle verplichte vragen zijn beantwoord. */
export function kanOvernemen(voorstellen: ImportVoorstel[]): { kan: boolean; reden?: string } {
  const open = voorstellen.flatMap((v) => (v.alIngelezen ? [] : v.vragen.filter((q) => q.verplicht && !q.gekozen)))
  if (open.length > 0) return { kan: false, reden: 'Beantwoord eerst de vragen hierboven.' }
  const verandert = voorstellen.some((v) => !v.alIngelezen && v.posities.some((p) => p.wijzigingen.length > 0 && (p.bestaandId !== null || v.vragen.find((q) => q.id === 'via')?.gekozen !== 'ja')))
  if (!verandert) return { kan: false, reden: 'Er verandert niets.' }
  return { kan: true }
}

/** Vergelijkt twee posities los van de volgorde van de velden (staat in ongedaan.ts, licht voor de editor). */
export { zelfdePositie } from './ongedaan'
