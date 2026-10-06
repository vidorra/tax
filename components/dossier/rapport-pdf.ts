/**
 * PDF-weergave van het fiscaal rapport (jsPDF, Times, A4 staand).
 *
 * Vormgeving volgens rapport-spec hoofdstuk 1: maten in mm vanaf linksboven, korpsen 14/13/11/10 pt,
 * bedragkolommen per raster, strepen van 0,26 mm, dubbele streep met 0,8 mm tussenruimte.
 *
 * Twee doorlopen. Eerst de opmaak: elk onderdeel wordt een reeks atomen (een regel, een kop, een rij
 * kolomkoppen) met een hoogte en een tekenfunctie; de paginering verdeelt ze over pagina's en legt per
 * sectie het paginanummer vast. Daarna het tekenen, met de inhoudsopgave en de kopregel.
 *
 * Volgorde per document: voorblad, verantwoording, inhoudsopgave (alle drie zonder kopregel en zonder
 * nummer), daarna de rapportpagina's vanaf 'pagina: 1'. Meerdere documenten komen achter elkaar, elk
 * met een eigen voorblad en een eigen nummering.
 */
import type { jsPDF } from 'jspdf'
import type {
  GegevensBlok,
  Kolom,
  KolomKop,
  RapportDocument,
  Raster,
  Regel,
  Sectie,
  TabelBlok,
  TekstBlok,
  VraagBlok,
} from '@/lib/rapport/model'
import { isKolom, KOLOMMEN, kopTekst, platteSecties, tabelTekstKolommen } from '@/lib/rapport/plat'
import { formatDatum } from '@/components/ui/format'
import { SITE } from '@/lib/site'
import { percentage } from '@/lib/rapport/notatie'
import { pdfTekst } from './pdf'

// ---------------------------------------------------------------------------
// Maten (mm) en notatie
// ---------------------------------------------------------------------------

type Stijl = 'normal' | 'bold' | 'italic' | 'bolditalic'

const M = {
  links: 20.4,
  rechts: 193.9,
  kopRechts: 199.8,
  paginaRechts: 199.5,
  /** Bovenkant van de regels in de kopregel en de lijn eronder. */
  kopPagina: 8.3,
  kopMidden: 13.1,
  kopTitel: 17.6,
  kopLijn: 25.3,
  /**
   * Tekstgebied rapportpagina's, gemeten op een fiscaal rapport uit een accountantspakket (pdftotext -bbox).
   * Boven: de eerste kop staat met de basislijn op 42,1 mm (13 en 11 pt), dus bovenkant 38,5 mm.
   * Onder: de laagste tekst eindigt rond 245 mm. Met onze verticale maten geeft een ondergrens van 246 mm de
   * paginaverdeling van spec 1.13.
   */
  bodyBoven: 38.5,
  bodyOnder: 246,
  /** Verantwoording en inhoudsopgave. */
  losBoven: 31.1,
  losOnder: 270,
  /** Laagste regel van de inhoudsopgave in het gemeten rapport: basislijn 270,2 mm, dus de regel loopt tot 272,7. */
  inhoudOnder: 273,
  inhoudEersteRegel: 47.2,
  inhoudPagina: 189.7,
  /** Verticale maten (bovenkant tot bovenkant, spec 1.10). */
  regel: 5.3,
  vervolg: 4.2,
  wit: 2.6,
  wit2: 5.3,
  naDubbel: 3.4,
  streepExtra: 0.25,
  /** Strepen (spec 1.9). */
  streep: 0.26,
  streepBoven: 3.9,
  streepOnder: 1.5,
  dubbel1: 1.2,
  dubbel2: 2.0,
  /** Ruimte tussen de labelkolom en de eerste gebruikte bedragkolom. */
  labelMarge: 0.5,
  tekstMarge: 2,
  /** Waardekolom van gegevensblokken en voorblad. */
  waardeX: 79.1,
  /** Ja/nee-vragen breken af rond 160 mm. */
  vraagRechts: 160,
}

/** Extra ruimte (mm) na een euroteken, zie zetMetEuro. */
const EURO_EXTRA = 0.7

/** Basislijn onder de bovenkant van de tekst: 0,78 x korps (spec 1.2). */
const basis = (pt: number) => 0.28 * pt
/** Afstand tussen afgebroken regels: 1,2 x korps. */
const regelafstand = (pt: number) => (pt * 1.2 * 25.4) / 72

interface Cel {
  van: number
  tot: number
}

interface RasterMaat {
  kolommen: Record<Kolom, Cel>
  /** Vaste linkerposities van de tekstkolommen (alleen investeringsaftrek). */
  tekstX?: number[]
}

/** Kolomposities per raster (spec 0.1 en 5.6.2). */
const RASTERS: Record<Raster, RasterMaat> = {
  standaard: {
    kolommen: {
      N: { van: 46.3, tot: 75.4 },
      Z: { van: 75.9, tot: 105.0 },
      A: { van: 105.6, tot: 134.7 },
      B: { van: 135.2, tot: 164.3 },
      C: { van: 164.8, tot: 193.9 },
    },
  },
  lijfrente: {
    kolommen: {
      N: { van: 48.1, tot: 77.0 },
      Z: { van: 77.5, tot: 106.4 },
      A: { van: 106.9, tot: 135.7 },
      B: { van: 136.2, tot: 164.6 },
      C: { van: 165.1, tot: 193.4 },
    },
  },
  balans: {
    kolommen: {
      N: { van: 64.9, tot: 90.3 },
      Z: { van: 90.8, tot: 116.2 },
      A: { van: 116.7, tot: 142.1 },
      B: { van: 142.6, tot: 168.0 },
      C: { van: 168.5, tot: 193.9 },
    },
  },
  investeringsaftrek: {
    kolommen: {
      N: { van: 61.1, tot: 86.8 },
      Z: { van: 87.8, tot: 111.0 },
      A: { van: 112.0, tot: 140.5 },
      B: { van: 141.0, tot: 166.2 },
      C: { van: 166.7, tot: 193.9 },
    },
    tekstX: [20.4, 41.8, 61.1, 87.8],
  },
}

function raster(r: Raster | undefined): RasterMaat {
  return (r && RASTERS[r]) || RASTERS.standaard
}

/** Hele euro's, punt als duizendtalscheiding, minteken ervoor, nul als '0' (spec 1.11). */
function bedragTekst(n: number): string {
  const r = Math.round(n)
  if (r === 0) return '0'
  const abs = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return r < 0 ? `-${abs}` : abs
}

/** Fractie als '1,44%': komma, twee decimalen, geen spatie. */
/** Percentages in een tabel zoals in een rapport uit een accountantspakket (box 3-rendementstabel): '1,44 %'. */
function percentageTekst(f: number): string {
  return percentage(f, 'tabel')
}

/** Alleen tekens die jsPDF met Times kan zetten (WinAnsi); andere letters worden getranslitereerd (pdfTekst). */
function schoon(s: string | undefined | null): string {
  if (!s) return ''
  return pdfTekst(s)
}

function datumTijd(iso: string): string {
  const datum = formatDatum(iso)
  const tijd = /T(\d{2}):(\d{2})/.exec(iso)
  return tijd ? `${datum} om ${tijd[1]}:${tijd[2]}` : datum
}

// ---------------------------------------------------------------------------
// Opmaak: tekenopdrachten, atomen en paginering
// ---------------------------------------------------------------------------

type Op =
  | { soort: 'tekst'; x: number; y: number; tekst: string; pt: number; stijl: Stijl; rechts?: boolean }
  | { soort: 'lijn'; x1: number; x2: number; y: number }
  /** Ronde 2 (A3): groot, lichtgrijs en schuin over de pagina (CONCEPT), onder de tekst. */
  | { soort: 'stempel'; tekst: string }

const lijn = (x1: number, x2: number, y: number): Op => ({ soort: 'lijn', x1, x2, y })

/** Kleinste eenheid van de opmaak: wordt nooit over twee pagina's gesplitst. */
interface Atoom {
  /** Van de bovenkant van dit atoom tot de bovenkant van het volgende (zonder extra witruimte). */
  hoogte: number
  /** Extra witruimte erboven; vervalt bovenaan een pagina. */
  voor: number
  teken: (boven: number) => Op[]
  /** Kop of groepskop: niet als laatste op een pagina laten staan. */
  bijVolgende?: boolean
  /** Optelling: niet als eerste op een pagina; bij een breuk gaat het vorige atoom mee. */
  bijVorige?: boolean
  /** Atomen die bovenaan een vervolgpagina terugkomen als de pagina vóór dit atoom breekt. */
  herhaal?: Atoom[]
  nieuwePagina?: boolean
  /** Sectie waarvan dit de kop is (paginanummer voor de inhoudsopgave). */
  sectie?: Sectie
}

/** Atomen [van, tot) die bij elkaar blijven als ze samen op een pagina passen. */
interface Groep {
  van: number
  tot: number
}

interface Opmaak {
  atomen: Atoom[]
  groepen: Groep[]
}

/** Wat het vorige atoom was; bepaalt de witruimte (spec 1.10). */
type Vorige = 'begin' | 'kop' | 'groep' | 'koppen' | 'koppenStreep' | 'regel' | 'dubbel'

class Opbouw implements Opmaak {
  atomen: Atoom[] = []
  groepen: Groep[] = []
  vorige: Vorige = 'begin'

  voeg(a: Atoom, vorige: Vorige): Atoom {
    this.atomen.push(a)
    this.vorige = vorige
    return a
  }

  bijElkaar(fn: () => void): void {
    const van = this.atomen.length
    fn()
    const tot = this.atomen.length
    if (tot - van > 1) this.groepen.push({ van, tot })
  }
}

const witMm = (w: 1 | 2 | undefined) => (w === 2 ? M.wit2 : w === 1 ? M.wit : 0)
const naVorige = (v: Vorige) => (v === 'dubbel' ? M.naDubbel : 0)

function voorRegel(v: Vorige, witVoor: 1 | 2 | undefined, streepBoven: boolean): number {
  return Math.max(witMm(witVoor), naVorige(v)) + (streepBoven ? M.streepExtra : 0)
}

function voorKop(v: Vorige): number {
  return v === 'begin' || v === 'kop' ? 0 : Math.max(M.wit, naVorige(v))
}

/** Een tabel met kolomkoppen na gewone regels krijgt een witregel; direct na een kop of groepskop niet. */
function voorKoppen(v: Vorige): number {
  return v === 'begin' || v === 'kop' || v === 'groep' || v === 'koppen' ? 0 : Math.max(M.wit, naVorige(v))
}

interface Vlak {
  boven: number
  onder: number
}

interface Paginering {
  paginas: Op[][]
  /** Paginanummer (1-gebaseerd binnen deze opmaak) per sectiekop. */
  sectiePagina: Map<Sectie, number>
}

function pagineer(opmaak: Opmaak, vlak: Vlak): Paginering {
  const { atomen, groepen } = opmaak
  const beschikbaar = vlak.onder - vlak.boven
  const groepenOp = new Map<number, Groep[]>()
  for (const g of groepen) {
    const lijst = groepenOp.get(g.van) ?? []
    lijst.push(g)
    groepenOp.set(g.van, lijst)
  }
  for (const lijst of groepenOp.values()) lijst.sort((a, b) => b.tot - a.tot)

  const hoogteVan = (van: number, tot: number, bovenaan: boolean) => {
    let h = 0
    for (let i = van; i < tot; i++) h += (i === van && bovenaan ? 0 : atomen[i].voor) + atomen[i].hoogte
    return h
  }
  /** Eerste groep die hier begint en op een lege pagina past. */
  const passendeGroep = (i: number) => (groepenOp.get(i) ?? []).find((g) => hoogteVan(g.van, g.tot, true) <= beschikbaar)
  /**
   * Einde van de keten kop + wat erop volgt: de koppen en groepskoppen erna, het eerste gewone atoom, en een
   * groep die binnen die keten begint (een subparagraaf onder een paragraafkop) als het geheel op een pagina past.
   */
  const ketenEinde = (i: number) => {
    let j = i
    while (j < atomen.length && atomen[j].bijVolgende) j++
    if (j >= atomen.length) return atomen.length
    let eind = j + 1
    for (let k = i + 1; k <= j; k++) {
      const g = passendeGroep(k)
      if (g && g.tot > eind) eind = g.tot
    }
    return eind > j + 1 && hoogteVan(i, eind, true) > beschikbaar ? j + 1 : eind
  }

  const paginas: Op[][] = [[]]
  const sectiePagina = new Map<Sectie, number>()
  let y = vlak.boven
  let leeg = true
  /** Aantal atomen op deze pagina, zonder de herhaalde koppen bovenaan. */
  let opPagina = 0
  /** Direct na de herhaalde koppen bovenaan een vervolgpagina: dan vervalt de witruimte van het volgende atoom. */
  let naHerhaal = false
  /** Het laatst geplaatste atoom, om het bij een optelling mee te nemen naar de volgende pagina. */
  let laatste: { atoom: Atoom; opsVan: number; eersteOpPagina: boolean } | null = null
  const past = (h: number) => y + h <= vlak.onder + 0.01
  const plaats = (a: Atoom, herhaald = false) => {
    const pagina = paginas[paginas.length - 1]
    if (!herhaald) laatste = { atoom: a, opsVan: pagina.length, eersteOpPagina: opPagina === 0 }
    if (!leeg && !naHerhaal) y += a.voor
    naHerhaal = herhaald
    pagina.push(...a.teken(y))
    if (a.sectie) sectiePagina.set(a.sectie, paginas.length)
    y += a.hoogte
    leeg = false
    if (!herhaald) opPagina++
  }
  const breek = (a: Atoom, metHerhaal: boolean) => {
    paginas.push([])
    y = vlak.boven
    leeg = true
    opPagina = 0
    if (metHerhaal) for (const h of a.herhaal ?? []) plaats(h, true)
  }

  atomen.forEach((a, i) => {
    if (!leeg) {
      if (a.nieuwePagina) {
        breek(a, false)
      } else {
        let nodig = false
        const g = passendeGroep(i)
        if (g && !past(hoogteVan(g.van, g.tot, false))) nodig = true
        if (!nodig && a.bijVolgende) {
          const tot = ketenEinde(i)
          if (hoogteVan(i, tot, true) <= beschikbaar && !past(hoogteVan(i, tot, false))) nodig = true
        }
        if (!nodig && !past(a.voor + a.hoogte)) nodig = true
        if (nodig) {
          const vorige = laatste
          if (a.bijVorige && vorige && !vorige.eersteOpPagina && i > 0 && vorige.atoom === atomen[i - 1] && !vorige.atoom.sectie) {
            paginas[paginas.length - 1].splice(vorige.opsVan)
            breek(vorige.atoom, true)
            plaats(vorige.atoom)
          } else {
            breek(a, true)
          }
        }
      }
    }
    plaats(a)
  })
  return { paginas, sectiePagina }
}

// ---------------------------------------------------------------------------
// Meten en bouwstenen
// ---------------------------------------------------------------------------

class Meter {
  constructor(private readonly pdf: jsPDF) {}

  private zet(pt: number, stijl: Stijl) {
    this.pdf.setFont('times', stijl)
    this.pdf.setFontSize(pt)
  }

  breedte(tekst: string, pt = 10, stijl: Stijl = 'normal'): number {
    if (!tekst) return 0
    this.zet(pt, stijl)
    return this.pdf.getTextWidth(tekst) + this.euroExtra(tekst)
  }

  /** Extra ruimte na elk euroteken dat niet aan het eind staat (zetMetEuro). */
  private euroExtra(tekst: string): number {
    return (tekst.match(/€(?=.)/g)?.length ?? 0) * EURO_EXTRA
  }

  /**
   * Breekt af op spaties. Een woord dat zelf niet past, wordt met een afbreekstreepje gesplitst
   * (jsPDF zou het zonder streepje op een willekeurige letter splitsen).
   */
  breek(tekst: string, breedte: number, pt = 10, stijl: Stijl = 'normal'): string[] {
    if (!tekst) return ['']
    this.zet(pt, stijl)
    const max = Math.max(breedte, 5)
    const w = (t: string) => this.pdf.getTextWidth(t) + this.euroExtra(t)
    const uit: string[] = []
    for (const alinea of tekst.split('\n')) {
      let regel = ''
      for (const woord of alinea.split(/ +/)) {
        const proef = regel ? `${regel} ${woord}` : woord
        if (w(proef) <= max) {
          regel = proef
          continue
        }
        if (regel) uit.push(regel)
        let rest = woord
        while (rest.length > 1 && w(rest) > max) {
          let n = rest.length - 1
          while (n > 1 && w(`${rest.slice(0, n)}-`) > max) n--
          uit.push(`${rest.slice(0, n)}-`)
          rest = rest.slice(n)
        }
        regel = rest
      }
      uit.push(regel)
    }
    return uit.length > 0 ? uit : ['']
  }
}

interface CelInvoer {
  tekst: string
  /** Linkerpositie, of de rechterrand bij `rechts`. */
  x: number
  /** Afbreken binnen deze breedte; zonder breedte één regel. */
  breedte?: number
  rechts?: boolean
  stijl?: Stijl
}

interface RijOpties {
  voor?: number
  /** Hoogte van een rij van één regel (standaard 5,3 mm). */
  hoogte?: number
  /** Strepen, gegeven de basislijn van de laatste en van de eerste regel. */
  lijnen?: (laatste: number, eerste: number) => Op[]
  bijVolgende?: boolean
  herhaal?: Atoom[]
  /** Afgebroken cellen bovenaan uitlijnen in plaats van onderaan (tekst naast tekst, opsommingen). */
  bovenaan?: boolean
}

/**
 * Een rij van cellen in 10 pt; afgebroken cellen zijn onderaan uitgelijnd (bedrag op de laatste regel), of met
 * `bovenaan` vanaf de eerste regel (twee tekstkolommen naast elkaar).
 */
function rij(m: Meter, cellen: CelInvoer[], o: RijOpties = {}): Atoom {
  const regels = cellen.map((c) => (c.breedte !== undefined ? m.breek(c.tekst, c.breedte, 10, c.stijl ?? 'normal') : [c.tekst]))
  const n = Math.max(1, ...regels.map((r) => r.length))
  return {
    hoogte: (o.hoogte ?? M.regel) + (n - 1) * M.vervolg,
    voor: o.voor ?? 0,
    bijVolgende: o.bijVolgende,
    herhaal: o.herhaal,
    teken: (boven) => {
      const eerste = boven + basis(10)
      const laatste = eerste + (n - 1) * M.vervolg
      const ops: Op[] = []
      cellen.forEach((c, i) => {
        const r = regels[i]
        r.forEach((t, j) => {
          const y = o.bovenaan ? eerste + j * M.vervolg : laatste - (r.length - 1 - j) * M.vervolg
          if (t) ops.push({ soort: 'tekst', x: c.x, y, tekst: t, pt: 10, stijl: c.stijl ?? 'normal', rechts: c.rechts })
        })
      })
      if (o.lijnen) ops.push(...o.lijnen(laatste, eerste))
      return ops
    },
  }
}

const KOP_PT: Record<1 | 2 | 3, number> = { 1: 14, 2: 13, 3: 11 }
/** Van de bovenkant van de kop tot de eerste regel eronder (spec 1.7). */
const KOP_NA: Record<1 | 2 | 3, number> = { 1: 8.8, 2: 7.8, 3: 6.6 }

interface KopOpties {
  voor: number
  /** Kolomkoppen op de regel van de kop zelf; x is de rechterrand of de linkerrand van de cel. */
  kolommen?: Array<{ regels: string[]; x: number; rechts: boolean; stijl: Stijl; streep?: Cel }>
  sectie?: Sectie
  nieuwePagina?: boolean
}

function kop(m: Meter, tekst: string, niveau: 1 | 2 | 3, o: KopOpties): Atoom {
  const pt = KOP_PT[niveau]
  const kolomStart = o.kolommen?.length ? Math.min(...o.kolommen.map((k) => (k.rechts ? k.x - Math.max(...k.regels.map((r) => m.breedte(r, 10, k.stijl))) : k.x))) : M.rechts
  const regels = m.breek(tekst, kolomStart - M.links - 2, pt, 'bold')
  const afstand = regelafstand(pt)
  return {
    hoogte: KOP_NA[niveau] + (regels.length - 1) * afstand,
    voor: o.voor,
    bijVolgende: true,
    nieuwePagina: o.nieuwePagina,
    sectie: o.sectie,
    teken: (boven) => {
      const eerste = boven + basis(pt)
      const laatste = eerste + (regels.length - 1) * afstand
      const ops: Op[] = regels.map((t, j) => ({ soort: 'tekst', x: M.links, y: eerste + j * afstand, tekst: t, pt, stijl: 'bold' }))
      for (const k of o.kolommen ?? []) {
        k.regels.forEach((t, j) => ops.push({ soort: 'tekst', x: k.x, y: laatste - (k.regels.length - 1 - j) * M.vervolg, tekst: t, pt: 10, stijl: k.stijl, rechts: k.rechts }))
        if (k.streep) ops.push(lijn(k.streep.van, k.streep.tot, laatste + M.streepOnder))
      }
      return ops
    },
  }
}

// ---------------------------------------------------------------------------
// Tabellen
// ---------------------------------------------------------------------------

interface TekstKolom {
  /** '' = de labelkolom zonder eigen naam (inhoud is het label van de regel). */
  naam: string
  x: number
  breedte: number
}

interface TabelMaat {
  raster: RasterMaat
  /** Tekstkolommen van links naar rechts; de eerste is de labelkolom op 20,4 mm. */
  tekst: TekstKolom[]
  /** Breedte van het label per regel (zelfde volgorde als blok.regels). */
  labelBreedte: number[]
}

/** Kolommen met een bedrag, percentage of streep in deze regel (tekst in een bedragkolom telt niet). */
function bedragKolommen(r: Regel): Kolom[] {
  const uit = new Set<Kolom>()
  for (const [k, v] of Object.entries(r.bedragen ?? {})) if (isKolom(k) && typeof v === 'number' && Number.isFinite(v)) uit.add(k)
  for (const [k, v] of Object.entries(r.percentages ?? {})) if (isKolom(k) && typeof v === 'number' && Number.isFinite(v)) uit.add(k)
  for (const k of [...(r.streepBoven ?? []), ...(r.streepOnder ?? []), ...(r.dubbelOnder ?? [])]) uit.add(k)
  return [...uit]
}

function gebruikteKolommen(blok: TabelBlok): Set<Kolom> {
  const s = new Set<Kolom>()
  for (const k of blok.koppen ?? []) if (isKolom(k.kolom)) s.add(k.kolom)
  for (const r of blok.regels) {
    for (const k of bedragKolommen(r)) s.add(k)
    for (const [k, v] of Object.entries(r.teksten ?? {})) if (isKolom(k) && v) s.add(k)
  }
  return s
}

/** Heeft de regel tekst buiten de labelkolom (een tekstkolom of tekst in een bedragkolom)? */
function heeftTekstcellen(r: Regel, labelNaam: string): boolean {
  return Object.entries(r.teksten ?? {}).some(([k, v]) => !!v && k !== labelNaam)
}

function celInhoud(r: Regel, naam: string, eerste: boolean): string {
  const t = naam ? r.teksten?.[naam] : undefined
  return schoon(t ?? (eerste ? r.label : undefined))
}

function tekstKolommen(m: Meter, blok: TabelBlok, rm: RasterMaat, einde: number, namen: string[]): TekstKolom[] {
  if (namen.length === 1) return [{ naam: namen[0], x: M.links, breedte: einde - M.links }]

  if (rm.tekstX && namen.length <= rm.tekstX.length) {
    // Vaste posities (spec 5.6.2), maar een kolomkop schuift de volgende kolom op als hij er anders overheen loopt.
    const xs = rm.tekstX.slice(0, namen.length)
    for (let i = 1; i < xs.length; i++) {
      const kopje = (blok.koppen ?? []).find((k) => k.kolom === namen[i - 1])
      const kopBreedte = Math.max(0, ...(kopje?.regels ?? []).map((t) => m.breedte(schoon(t), 10, kopje?.stijl === 'datum' ? 'bold' : 'bolditalic')))
      xs[i] = Math.max(xs[i], xs[i - 1] + kopBreedte + M.tekstMarge)
    }
    return namen.map((naam, i) => ({ naam, x: xs[i], breedte: Math.max(5, (i + 1 < namen.length ? xs[i + 1] - M.tekstMarge : einde) - xs[i]) }))
  }

  // Automatisch, zoals een HTML-tabel: natuurlijke breedte per kolom, de rest naar verhouding verdeeld.
  const natuurlijk = namen.map((naam, i) => {
    let w = 0
    const kopje = (blok.koppen ?? []).find((k) => k.kolom === naam)
    for (const t of kopje?.regels ?? []) w = Math.max(w, m.breedte(schoon(t), 10, kopje?.stijl === 'datum' ? 'bold' : 'bolditalic'))
    for (const r of blok.regels) {
      if (r.soort === 'groepskop' || r.soort === 'subkop') continue
      if (i === 0 && !heeftTekstcellen(r, namen[0])) continue
      w = Math.max(w, m.breedte(celInhoud(r, naam, i === 0), 10, r.vet === 'regel' ? 'bold' : 'normal'))
    }
    return w + M.tekstMarge + 1
  })
  const totaal = natuurlijk.reduce((a, b) => a + b, 0)
  const factor = (einde - M.links) / Math.max(totaal, 1)
  const uit: TekstKolom[] = []
  let x = M.links
  namen.forEach((naam, i) => {
    const w = natuurlijk[i] * factor
    const laatste = i === namen.length - 1
    uit.push({ naam, x, breedte: Math.max(5, laatste ? einde - x : w - M.tekstMarge) })
    x += w
  })
  return uit
}

/**
 * Kolomindeling van een tabel. Tekstkolommen staan tussen 20,4 mm en de eerste gebruikte bedragkolom.
 * Een label zonder tekstcellen loopt door tot de eerste bedragkolom van zijn groep: de regels tussen twee
 * groepskoppen of witregels (zo breekt 'Maximaal toepasbare heffingskortingen' af naast de kolommen
 * Belastingdeel en Premiedeel, en 'Berekende inkomstenbelasting ...' na een witregel niet).
 */
function tabelMaat(m: Meter, blok: TabelBlok): TabelMaat {
  const rm = raster(blok.raster)
  const gebruikt = gebruikteKolommen(blok)
  const einde = gebruikt.size > 0 ? Math.min(...[...gebruikt].map((k) => rm.kolommen[k].van)) - M.labelMarge : M.rechts
  const namen = tabelTekstKolommen(blok)
  const tekst = tekstKolommen(m, blok, rm, einde, namen)

  const labelBreedte: number[] = []
  const groepen: Array<[number, number]> = []
  let start = 0
  blok.regels.forEach((r, i) => {
    if (i > 0 && (r.soort === 'groepskop' || r.soort === 'subkop' || r.witVoor)) {
      groepen.push([start, i])
      start = i
    }
  })
  groepen.push([start, blok.regels.length])
  for (const [van, tot] of groepen) {
    const kolommen = new Set<Kolom>()
    for (let i = van; i < tot; i++) for (const k of bedragKolommen(blok.regels[i])) kolommen.add(k)
    const groepEinde = kolommen.size > 0 ? Math.min(...[...kolommen].map((k) => rm.kolommen[k].van)) - M.labelMarge : M.rechts
    for (let i = van; i < tot; i++) labelBreedte[i] = heeftTekstcellen(blok.regels[i], namen[0]) ? tekst[0].breedte : groepEinde - M.links
  }
  return { raster: rm, tekst, labelBreedte }
}

function koppenAtoom(m: Meter, koppen: KolomKop[], maat: TabelMaat, voor: number): Atoom {
  const n = Math.max(1, ...koppen.map((k) => k.regels.length))
  return {
    hoogte: M.regel + (n - 1) * M.vervolg,
    voor,
    bijVolgende: true,
    teken: (boven) => {
      const laatste = boven + basis(10) + (n - 1) * M.vervolg
      const ops: Op[] = []
      for (const k of koppen) {
        const stijl: Stijl = k.stijl === 'datum' ? 'bold' : 'bolditalic'
        let x: number
        let rechts = false
        let streep: Cel
        if (isKolom(k.kolom)) {
          const cel = maat.raster.kolommen[k.kolom]
          rechts = k.uitlijning !== 'links'
          x = rechts ? cel.tot : cel.van
          streep = cel
        } else {
          const tk = maat.tekst.find((t) => t.naam === k.kolom) ?? maat.tekst[0]
          x = tk.x
          streep = { van: tk.x, tot: tk.x + tk.breedte }
        }
        k.regels.forEach((t, j) => ops.push({ soort: 'tekst', x, y: laatste - (k.regels.length - 1 - j) * M.vervolg, tekst: schoon(t), pt: 10, stijl, rechts }))
        if (k.streepOnder) ops.push(lijn(streep.van, streep.tot, laatste + M.streepOnder))
      }
      return ops
    },
  }
}

function regelAtoom(m: Meter, r: Regel, index: number, maat: TabelMaat, voor: number): Atoom {
  const kopRegel = r.soort === 'groepskop' || r.soort === 'subkop'
  const vet = r.soort === 'groepskop' || r.soort === 'subkop' || r.vet === 'regel'
  const cursief = r.soort === 'subkop' || !!r.cursief
  const labelStijl: Stijl = vet ? (cursief ? 'bolditalic' : 'bold') : cursief ? 'italic' : 'normal'
  const bedragStijl: Stijl = r.vet ? (r.cursief ? 'bolditalic' : 'bold') : r.cursief ? 'italic' : 'normal'

  const kolomCellen: CelInvoer[] = []
  for (const k of KOLOMMEN) {
    const cel = maat.raster.kolommen[k]
    const bedrag = r.bedragen?.[k]
    const pct = r.percentages?.[k]
    const tekst = r.teksten?.[k]
    const isBedrag = bedrag !== undefined && bedrag !== null && Number.isFinite(bedrag)
    const isPct = !isBedrag && pct !== undefined && pct !== null && Number.isFinite(pct)
    const inhoud = isBedrag ? bedragTekst(bedrag) : isPct ? percentageTekst(pct) : schoon(tekst)
    if (!inhoud) continue
    // Tekst in een bedragkolom staat rechts, tenzij de regel hem links op de rand van de cel zet (5.6.1, datums).
    const links = !isBedrag && !isPct && !!r.tekstLinks?.includes(k)
    kolomCellen.push(links ? { tekst: inhoud, x: cel.van, breedte: cel.tot - cel.van, stijl: bedragStijl } : { tekst: inhoud, x: cel.tot, rechts: true, stijl: bedragStijl })
  }
  const tekstCellen: CelInvoer[] = []
  maat.tekst.forEach((tk, i) => {
    if (i === 0) return
    const inhoud = celInhoud(r, tk.naam, false)
    if (inhoud) tekstCellen.push({ tekst: inhoud, x: tk.x, breedte: tk.breedte, stijl: r.vet === 'regel' ? labelStijl : cursief ? 'italic' : 'normal' })
  })
  const volleBreedte = kopRegel && kolomCellen.length === 0 && tekstCellen.length === 0
  let labelBreedte = maat.labelBreedte[index]
  if (heeftTekstcellen(r, maat.tekst[0].naam)) {
    // Naast tekstcellen mag het label doorlopen tot de eerste tekst die er in deze regel rechts van staat.
    const randen = [...tekstCellen.map((c) => c.x), ...kolomCellen.map((c) => (c.rechts ? c.x - m.breedte(c.tekst, 10, c.stijl) : c.x))]
    if (randen.length > 0) labelBreedte = Math.max(labelBreedte, Math.min(...randen) - M.tekstMarge - M.links)
  }
  const label: CelInvoer = { tekst: celInhoud(r, maat.tekst[0].naam, true), x: M.links, breedte: volleBreedte ? M.rechts - M.links : labelBreedte, stijl: labelStijl }

  return rij(m, [label, ...tekstCellen, ...kolomCellen], {
    voor,
    bijVolgende: kopRegel,
    lijnen: (b, eerste) => {
      // Streep boven op de bovenkant van de rij (zoals de bovenrand van een tabelcel), ook als het label afbreekt.
      const ops: Op[] = []
      const k = maat.raster.kolommen
      for (const x of r.streepBoven ?? []) ops.push(lijn(k[x].van, k[x].tot, eerste - M.streepBoven))
      for (const x of r.streepOnder ?? []) ops.push(lijn(k[x].van, k[x].tot, b + M.streepOnder))
      for (const x of r.dubbelOnder ?? []) ops.push(lijn(k[x].van, k[x].tot, b + M.dubbel1), lijn(k[x].van, k[x].tot, b + M.dubbel2))
      return ops
    },
  })
}

// ---------------------------------------------------------------------------
// Rapportpagina's
// ---------------------------------------------------------------------------

function eersteRaster(s: Sectie): Raster | undefined {
  for (const b of s.blokken) if (b.soort === 'tabel') return b.raster
  for (const sub of s.secties) {
    const r = eersteRaster(sub)
    if (r) return r
  }
  return undefined
}

function sectieKop(m: Meter, s: Sectie, nummer: string, voor: number): Atoom {
  const rm = raster(eersteRaster(s))
  // Kopkolommen staan boven bedragkolommen ('Fiscaal begin', 'Fiscaal 2024'); een tekstkolom heeft op de kopregel geen plek.
  const kolommen = (s.kopKolommen ?? []).flatMap((k) => {
    if (!isKolom(k.kolom)) return []
    const cel = rm.kolommen[k.kolom]
    const stijl: Stijl = k.stijl === 'datum' ? 'bold' : 'bolditalic'
    const rechts = k.uitlijning !== 'links'
    return [{ regels: k.regels.map(schoon), x: rechts ? cel.tot : cel.van, rechts, stijl, streep: k.streepOnder ? cel : undefined }]
  })
  return kop(m, schoon(kopTekst(nummer, s.titel)), s.niveau, {
    voor,
    kolommen,
    sectie: s,
    nieuwePagina: s.niveau === 1 || !!s.nieuwePagina,
  })
}

/**
 * @param kop in de rapportpagina's is een opsomming de kop van een blok ('• Studiekosten en andere
 *   scholingsuitgaven' in 3.3, spec: H), dus vet en bij het blok eronder; in de verantwoording een gewone lijst.
 */
function tekstAtoom(m: Meter, b: TekstBlok, voor: number, kop = false): Atoom {
  const stijl: Stijl = b.stijl === 'vet' ? 'bold' : b.stijl === 'cursief' ? 'italic' : 'normal'
  if (b.stijl === 'opsomming') {
    const s: Stijl = kop ? 'bold' : 'normal'
    return rij(m, [{ tekst: '•', x: M.links, stijl: s }, { tekst: schoon(b.tekst), x: M.links + 4, breedte: M.rechts - M.links - 4, stijl: s }], { voor, bovenaan: true, bijVolgende: kop })
  }
  return rij(m, [{ tekst: schoon(b.tekst), x: M.links, breedte: M.rechts - M.links, stijl }], { voor, bijVolgende: b.stijl === 'vet' })
}

/**
 * Vraag links, antwoord op de laatste regel: rechts op de rand van kolom C, of met antwoordKolom links op de
 * linkerrand van die kolom (5.6.1: 'nee' op 135,2 mm). De vraag breekt dan af voor die kolom.
 */
function vraagAtoom(m: Meter, b: VraagBlok, voor: number): Atoom {
  const cel = b.antwoordKolom ? RASTERS.standaard.kolommen[b.antwoordKolom] : undefined
  const vraagRechts = cel ? Math.min(M.vraagRechts, cel.van - M.tekstMarge) : M.vraagRechts
  return rij(m, [
    { tekst: schoon(b.vraag), x: M.links, breedte: vraagRechts - M.links },
    cel ? { tekst: schoon(b.antwoord), x: cel.van, breedte: M.rechts - cel.van } : { tekst: schoon(b.antwoord), x: M.rechts, rechts: true },
  ], { voor })
}

function gegevensRij(m: Meter, rijData: GegevensBlok['rijen'][number], voor: number): Atoom {
  const stijl: Stijl = rijData.kop ? 'bold' : 'normal'
  const cellen: CelInvoer[] = rijData.waarde !== undefined && rijData.waarde !== ''
    ? [
        { tekst: schoon(rijData.label), x: M.links, breedte: M.waardeX - M.links - M.tekstMarge, stijl },
        { tekst: schoon(rijData.waarde), x: M.waardeX, breedte: M.rechts - M.waardeX },
      ]
    : [{ tekst: schoon(rijData.label), x: M.links, breedte: M.rechts - M.links, stijl }]
  return rij(m, cellen, { voor, bijVolgende: !!rijData.kop, bovenaan: true })
}

function bouwRapportpaginas(m: Meter, doc: RapportDocument): Opmaak {
  const o = new Opbouw()
  const nummers = new Map(platteSecties(doc).map((p) => [p.sectie, p.nummer]))

  /**
   * @param reeks herhaalKop van het vorige tabelblok in deze sectie (vervolg van een reeks jaarblokken)
   * @param vorigeKop tekst van de vette regel of groepskop direct voor dit blok
   */
  const tabel = (b: TabelBlok, reeks: string | undefined, vorigeKop: string | undefined) => {
    const maat = tabelMaat(m, b)
    const vervolg = !!b.herhaalKop && b.herhaalKop === reeks
    const herhaalKop = () => rij(m, [{ tekst: schoon(b.herhaalKop), x: M.links, breedte: M.rechts - M.links, stijl: 'bold' }], { bijVolgende: true })
    const heeftKoppen = (b.koppen?.length ?? 0) > 0
    const herhaal: Atoom[] = []
    if (b.herhaalKop) herhaal.push(herhaalKop())
    if (heeftKoppen) herhaal.push(koppenAtoom(m, b.koppen!, maat, 0))

    const inhoud = () => {
      // Het eerste atoom van een vervolgblok in een reeks (jaarblokken 4.1.1) krijgt bij een paginabreuk de
      // groepskop terug; de regels krijgen groepskop en kolomkoppen terug.
      let eerste = true
      const voeg = (a: Atoom, vorige: Vorige, regel: boolean) => {
        if (eerste && vervolg) a.herhaal = [herhaalKop()]
        else if (regel && !eerste && herhaal.length > 0) a.herhaal = herhaal
        eerste = false
        o.voeg(a, vorige)
      }
      const eersteRegel = b.regels[0]
      const alGetoond = b.herhaalKop === vorigeKop || (eersteRegel?.soort === 'groepskop' && eersteRegel.label === b.herhaalKop)
      if (b.herhaalKop && !vervolg && !alGetoond) {
        voeg({ ...herhaalKop(), voor: voorKoppen(o.vorige) }, 'groep', false)
      }
      if (heeftKoppen) {
        voeg(koppenAtoom(m, b.koppen!, maat, voorKoppen(o.vorige)), b.koppen!.some((k) => k.streepOnder) ? 'koppenStreep' : 'koppen', false)
      }
      b.regels.forEach((r, i) => {
        const a = regelAtoom(m, r, i, maat, voorRegel(o.vorige, r.witVoor, (r.streepBoven?.length ?? 0) > 0))
        // Een optelling (streep erboven) niet alleen bovenaan een pagina: de regel erboven gaat mee.
        if (i > 0 && (r.streepBoven?.length ?? 0) > 0 && !r.witVoor) a.bijVorige = true
        // Na een eindtotaal met dubbele streep komt extra ruimte (spec 1.10); na een dubbele streep zonder vet
        // (Premie-inkomen, Premiegrondslag) loopt de tabel gewoon door.
        const eindtotaal = (r.dubbelOnder?.length ?? 0) > 0 && (r.soort === 'totaal' || !!r.vet)
        voeg(a, r.soort === 'groepskop' || r.soort === 'subkop' ? 'groep' : eindtotaal ? 'dubbel' : 'regel', true)
      })
    }
    if (b.bijElkaar) o.bijElkaar(inhoud)
    else inhoud()
  }

  const sectie = (s: Sectie) => {
    const inhoud = () => {
      o.voeg(sectieKop(m, s, nummers.get(s) ?? '', voorKop(o.vorige)), 'kop')
      let reeks: string | undefined
      let vorigeKop: string | undefined
      for (const b of s.blokken) {
        switch (b.soort) {
          case 'tabel': {
            tabel(b, reeks, vorigeKop)
            reeks = b.herhaalKop
            const laatste = b.regels[b.regels.length - 1]
            vorigeKop = laatste && (laatste.soort === 'groepskop' || laatste.soort === 'subkop') ? laatste.label : undefined
            break
          }
          case 'tekst':
            reeks = undefined
            vorigeKop = b.stijl === 'vet' ? b.tekst : undefined
            o.voeg(tekstAtoom(m, b, voorRegel(o.vorige, b.witVoor, false), true), b.stijl === 'vet' || b.stijl === 'opsomming' ? 'groep' : 'regel')
            break
          case 'vraag':
            reeks = vorigeKop = undefined
            o.voeg(vraagAtoom(m, b, voorRegel(o.vorige, b.witVoor, false)), 'regel')
            break
          case 'gegevens':
            reeks = vorigeKop = undefined
            for (const r of b.rijen) o.voeg(gegevensRij(m, r, voorRegel(o.vorige, r.witVoor, false)), r.kop ? 'groep' : 'regel')
            break
        }
      }
      for (const sub of s.secties) sectie(sub)
    }
    // Spec 1.13: een paragraaf of subparagraaf wordt niet gesplitst als hij op een pagina past. Zonder
    // aanwijzing in het model geldt dat voor niveau 2 en 3; bijElkaar: false zet het uit.
    if (s.bijElkaar ?? s.niveau >= 2) o.bijElkaar(inhoud)
    else inhoud()
  }

  for (const h of doc.hoofdstukken) sectie(h)
  return o
}

function kopregel(m: Meter, doc: RapportDocument, pagina: number): Op[] {
  const ops: Op[] = []
  ops.push({ soort: 'tekst', x: M.paginaRechts, y: M.kopPagina + basis(10), tekst: `pagina: ${pagina}`, pt: 10, stijl: 'normal', rechts: true })
  const rechts = doc.kopregel.rechts.map(schoon).filter(Boolean)
  const onder = rechts.length > 0 ? rechts[rechts.length - 1] : ''
  const midden = rechts.length > 1 ? rechts.slice(0, -1).join(' · ') : ''
  if (onder) ops.push({ soort: 'tekst', x: M.kopRechts, y: M.kopTitel + basis(10), tekst: onder, pt: 10, stijl: 'normal', rechts: true })
  if (midden) ops.push({ soort: 'tekst', x: M.paginaRechts, y: M.kopMidden + basis(10), tekst: midden, pt: 10, stijl: 'normal', rechts: true })
  const ruimte = M.kopRechts - M.links - (onder ? m.breedte(onder) + 6 : 0)
  const links = m.breek(schoon(doc.kopregel.links), ruimte, 10, 'bold')
  links.forEach((t, j) => ops.push({ soort: 'tekst', x: M.links, y: M.kopTitel + basis(10) - (links.length - 1 - j) * M.vervolg, tekst: t, pt: 10, stijl: 'bold' }))
  ops.push(lijn(M.links, M.kopRechts, M.kopLijn))
  return ops
}

// ---------------------------------------------------------------------------
// Voorblad, verantwoording, inhoudsopgave
// ---------------------------------------------------------------------------

function voorblad(doc: RapportDocument): Op[] {
  const ops: Op[] = []
  const adres = doc.voorblad.adresregels.map(schoon).filter(Boolean)
  adres.forEach((t, i) => ops.push({ soort: 'tekst', x: M.links, y: 53.9 + i * M.regel + basis(10), tekst: t, pt: 10, stijl: 'normal' }))
  const titelBoven = Math.max(77.6, 53.9 + adres.length * M.regel + 7.9)
  ops.push({ soort: 'tekst', x: M.links, y: titelBoven + basis(13), tekst: schoon(doc.titel), pt: 13, stijl: 'bold' })
  const regelsBoven = titelBoven + (96.7 - 77.6)
  doc.voorblad.regels.forEach((r, i) => {
    const y = regelsBoven + i * M.regel + basis(10)
    const label = schoon(r.label)
    ops.push({ soort: 'tekst', x: M.links, y, tekst: label.endsWith(':') ? label : `${label}:`, pt: 10, stijl: 'normal' })
    ops.push({ soort: 'tekst', x: M.waardeX, y, tekst: schoon(r.waarde), pt: 10, stijl: 'normal' })
  })
  return ops
}

const ERNST: Record<'info' | 'let-op' | 'actie', string> = { info: 'Goed om te weten', 'let-op': 'Let op', actie: 'Te doen' }

function bouwVerantwoording(m: Meter, doc: RapportDocument): Opmaak {
  const v = doc.verantwoording
  const o = new Opbouw()
  const tussenkop = (titel: string) => o.voeg(kop(m, titel, 3, { voor: voorKop(o.vorige) }), 'kop')
  /** Tussen rijen met tekst in twee of drie kolommen; afgebroken tekst blijft zo leesbaar per rij. */
  const RIJ_LUCHT = 1
  const tweeKolommen = (links: string, rechts: string, voor = 0) =>
    rij(m, [
      { tekst: schoon(links), x: M.links, breedte: M.waardeX - M.links - M.tekstMarge },
      { tekst: schoon(rechts), x: M.waardeX, breedte: M.rechts - M.waardeX },
    ], { voor, bovenaan: true })

  o.voeg(kop(m, 'Samenvatting en verantwoording', 1, { voor: 0 }), 'kop')
  o.voeg(rij(m, [{ tekst: schoon(`${doc.titel} van ${doc.naam}`), x: M.links, breedte: M.rechts - M.links }]), 'regel')

  // Ronde 2 (A3): bovenaan de kopregel over de controles en de lijst open fouten (concept) of open controles (ingediend).
  const ctl = v.controles
  if (ctl?.kop) o.voeg(rij(m, [{ tekst: schoon(ctl.kop), x: M.links, breedte: M.rechts - M.links, stijl: 'bold' }], { voor: M.wit }), 'regel')
  if (ctl?.openTitel && ctl.open.length > 0) {
    tussenkop(ctl.openTitel)
    ctl.open.forEach((x, i) => {
      o.voeg(rij(m, [{ tekst: schoon(x.waar ? `${x.titel} (${x.waar})` : x.titel), x: M.links, breedte: M.rechts - M.links, stijl: 'bold' }], { voor: i > 0 ? RIJ_LUCHT : 0, bijVolgende: true }), 'regel')
      o.voeg(rij(m, [{ tekst: schoon(x.uitleg), x: M.links, breedte: M.rechts - M.links }], { bovenaan: true }), 'regel')
    })
  }

  // Uitkomstenblok in het patroon van de brief (spec 1.5): label links, vet euroteken en bedrag, strepen onder het bedrag.
  v.uitkomsten.forEach((u, i) => {
    o.voeg(
      rij(m, [
        { tekst: schoon(u.label), x: M.links, breedte: 147 - M.links },
        { tekst: '€', x: 149.8, stijl: 'bold' },
        { tekst: bedragTekst(u.bedrag), x: 181.8, rechts: true, stijl: 'bold' },
      ], {
        voor: i === 0 ? M.wit2 : 0,
        hoogte: 10.3,
        lijnen: (b) =>
          u.afsluiting === 'dubbel'
            ? [lijn(154.5, 181.8, b + M.dubbel1), lijn(154.5, 181.8, b + M.dubbel2)]
            : u.afsluiting === 'enkel'
              ? [lijn(154.5, 181.8, b + M.streepOnder)]
              : [],
      }),
      'regel',
    )
  })

  if (v.statusZin) o.voeg(rij(m, [{ tekst: schoon(v.statusZin), x: M.links, breedte: M.rechts - M.links, stijl: 'bold' }], { voor: M.wit }), 'regel')

  if (v.bronnen.length > 0) {
    tussenkop('Bron van de cijfers')
    v.bronnen.forEach((b, i) => o.voeg(tweeKolommen(b.onderdeel, b.bron, i > 0 ? RIJ_LUCHT : 0), 'regel'))
  }

  if (v.parameters.length > 0) {
    tussenkop('Rekenparameters')
    o.voeg(rij(m, [
      { tekst: 'Onderdeel', x: M.links, stijl: 'bolditalic' },
      { tekst: 'Status', x: M.waardeX, stijl: 'bolditalic' },
      { tekst: 'Bron', x: 105.6, stijl: 'bolditalic' },
    ], { bijVolgende: true }), 'koppen')
    v.parameters.forEach((p, i) => {
      o.voeg(rij(m, [
        { tekst: schoon(p.blok), x: M.links, breedte: M.waardeX - M.links - M.tekstMarge },
        { tekst: schoon(p.status), x: M.waardeX, breedte: 105.6 - M.waardeX - M.tekstMarge },
        { tekst: schoon(p.bron ?? ''), x: 105.6, breedte: M.rechts - 105.6 },
      ], { voor: i > 0 ? RIJ_LUCHT : 0, bovenaan: true }), 'regel')
    })
  }

  if (v.methoden.length > 0) {
    tussenkop('Methoden en keuzes')
    v.methoden.forEach((x, i) => o.voeg(tweeKolommen(x.label, x.waarde, i > 0 ? RIJ_LUCHT : 0), 'regel'))
  }

  if (v.nietMeegenomen.length > 0) {
    tussenkop('Niet meegenomen of weggelaten')
    v.nietMeegenomen.forEach((t, i) => o.voeg(tekstAtoom(m, { soort: 'tekst', tekst: t, stijl: 'opsomming' }, i > 0 ? RIJ_LUCHT : 0), 'regel'))
  }

  // Ronde 2 (A3): bewust genegeerde controles, met reden en datum.
  if (ctl && ctl.genegeerd.length > 0) {
    tussenkop('Bewust genegeerde controles')
    ctl.genegeerd.forEach((g, i) =>
      o.voeg(tweeKolommen(g.waar ? `${g.titel} (${g.waar})` : g.titel, `${g.reden ?? ''} (${g.datum})`, i > 0 ? RIJ_LUCHT : 0), 'regel'),
    )
  }

  if (v.verschillen.length > 0) {
    tussenkop('Verschillen met het rapport van de accountant')
    const k = RASTERS.standaard.kolommen
    o.voeg(rij(m, [
      { tekst: 'Omschrijving', x: M.links, stijl: 'bolditalic' },
      { tekst: 'Accountant', x: k.A.tot, rechts: true, stijl: 'bolditalic' },
      { tekst: 'Berekend', x: k.B.tot, rechts: true, stijl: 'bolditalic' },
      { tekst: 'Verschil', x: k.C.tot, rechts: true, stijl: 'bolditalic' },
    ], { bijVolgende: true }), 'koppen')
    for (const x of v.verschillen) {
      const verschil = x.accountant === null ? '' : bedragTekst(x.berekend - x.accountant)
      o.voeg(rij(m, [
        { tekst: schoon(x.label), x: M.links, breedte: k.A.van - M.links - M.tekstMarge },
        { tekst: x.accountant === null ? '' : bedragTekst(x.accountant), x: k.A.tot, rechts: true },
        { tekst: bedragTekst(x.berekend), x: k.B.tot, rechts: true },
        { tekst: verschil, x: k.C.tot, rechts: true },
      ], { bijVolgende: !!x.toelichting }), 'regel')
      if (x.toelichting) o.voeg(rij(m, [{ tekst: schoon(x.toelichting), x: M.links + 4, breedte: M.rechts - M.links - 4, stijl: 'italic' }]), 'regel')
    }
  }

  if (v.meldingen.length > 0) {
    tussenkop('Meldingen')
    v.meldingen.forEach((x, i) => o.voeg(rij(m, [{ tekst: schoon(`${ERNST[x.ernst] ?? 'Melding'}: ${x.tekst}`), x: M.links, breedte: M.rechts - M.links }], { voor: i > 0 ? RIJ_LUCHT : 0, bovenaan: true }), 'regel'))
  }

  tussenkop('Over deze berekening')
  o.voeg(tweeKolommen('Berekend op', datumTijd(v.berekendOp)), 'regel')
  o.voeg(tweeKolommen('Opgesteld met', SITE.naam), 'regel')
  if (v.toolVersie) o.voeg(tweeKolommen('Versie', v.toolVersie), 'regel')
  return o
}

const INHOUD_TITEL_X: Record<1 | 2 | 3, number> = { 1: 34.4, 2: 41.0, 3: 47.6 }

function bouwInhoudsopgave(m: Meter, doc: RapportDocument, sectiePagina: Map<Sectie, number>): Opmaak {
  const o = new Opbouw()
  o.voeg(rij(m, [
    { tekst: 'Inhoudsopgave', x: M.links, stijl: 'bold' },
    { tekst: 'Pagina', x: M.inhoudPagina, rechts: true, stijl: 'bold' },
  ], { hoogte: M.inhoudEersteRegel - M.losBoven, bijVolgende: true }), 'kop')
  let eerste = true
  for (const ps of platteSecties(doc)) {
    const n = ps.niveau
    const titelX = INHOUD_TITEL_X[n]
    const pagina = sectiePagina.get(ps.sectie)
    o.voeg(rij(m, [
      { tekst: schoon(ps.nummer), x: M.links, stijl: n === 1 ? 'bold' : 'normal' },
      { tekst: schoon(ps.sectie.titel), x: titelX, breedte: M.inhoudPagina - 12 - titelX, stijl: n === 1 ? 'bold' : 'italic' },
      { tekst: pagina === undefined ? '' : String(pagina), x: M.inhoudPagina, rechts: true, stijl: n === 1 ? 'bold' : 'normal' },
    ], { voor: n === 1 && !eerste ? M.naDubbel : 0, bijVolgende: n === 1 }), 'regel')
    eerste = false
  }
  return o
}

// ---------------------------------------------------------------------------
// Tekenen en export
// ---------------------------------------------------------------------------

/** Breedte zoals jsPDF hem bij het uitlijnen rekent (zonder kerning; de PDF bevat ook geen kerning). */
function zetBreedte(pdf: jsPDF, tekst: string): number {
  return (pdf.getStringUnitWidth(tekst, { doKerning: false }) * pdf.getFontSize()) / pdf.internal.scaleFactor
}

/**
 * Zet een tekst met een euroteken erin. Times wordt niet ingebed; viewers (Voorvertoning, poppler) geven het
 * euroteken de standaardbreedte van 0,5 em, maar tekenen het met een vervangend lettertype waarin het teken ruim
 * 0,6 em breed is. Het valt dan over de spatie erna: gemeten op 300 dpi 0,5 mm tussen € en het eerste cijfer, in
 * een rapport uit een accountantspakket 1,2 mm. Daarom wordt de tekst na elk euroteken een los stuk dat
 * EURO_EXTRA verder staat. Het stuk tot en met het euroteken blijft één tekst, zodat de viewer de ruimte vóór het
 * teken zelf zet. Bij rechts uitlijnen telt de extra ruimte mee in de beginpositie.
 */
function zetMetEuro(pdf: jsPDF, op: Extract<Op, { soort: 'tekst' }>): void {
  const stukken = op.tekst.split(/(?<=€)/)
  const extra = (i: number) => (i < stukken.length - 1 ? EURO_EXTRA : 0)
  const breedtes = stukken.map((t, i) => zetBreedte(pdf, t) + extra(i))
  let x = op.rechts ? op.x - breedtes.reduce((a, b) => a + b, 0) : op.x
  stukken.forEach((t, i) => {
    pdf.text(t, x, op.y)
    x += breedtes[i]
  })
}

function zetTekst(pdf: jsPDF, op: Extract<Op, { soort: 'tekst' }>): void {
  if (/€./.test(op.tekst)) zetMetEuro(pdf, op)
  else pdf.text(op.tekst, op.x, op.y, op.rechts ? { align: 'right' } : undefined)
}

/** Ronde 2 (A3): het woord CONCEPT schuin over het midden van de pagina, lichtgrijs, onder de tekst. */
function zetStempel(pdf: jsPDF, tekst: string): void {
  const pt = 96
  pdf.setFont('times', 'bold')
  pdf.setFontSize(pt)
  pdf.setTextColor(225, 225, 225)
  const breedte = zetBreedte(pdf, tekst)
  const hoek = Math.PI / 4
  const [cx, cy] = [105, 160]
  pdf.text(tekst, cx - (breedte / 2) * Math.cos(hoek), cy + (breedte / 2) * Math.sin(hoek), { angle: 45 })
  pdf.setTextColor(0, 0, 0)
}

/** Ronde 2 (A3): CONCEPT op elke pagina van een concept: schuin over de pagina en klein in de kop. */
function conceptOps(): Op[] {
  return [
    { soort: 'stempel', tekst: 'CONCEPT' },
    { soort: 'tekst', x: M.links, y: M.kopPagina + basis(12), tekst: 'CONCEPT', pt: 12, stijl: 'bold' },
  ]
}

function teken(pdf: jsPDF, ops: Op[]): void {
  pdf.setTextColor(0, 0, 0)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(M.streep)
  for (const op of ops) {
    if (op.soort === 'lijn') {
      pdf.line(op.x1, op.y, op.x2, op.y)
    } else if (op.soort === 'stempel') {
      zetStempel(pdf, op.tekst)
    } else {
      pdf.setFont('times', op.stijl)
      pdf.setFontSize(op.pt)
      zetTekst(pdf, op)
    }
  }
}

async function bouwPdf(docs: RapportDocument[]): Promise<jsPDF> {
  if (docs.length === 0) throw new Error('Geen rapport om te exporteren.')
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const m = new Meter(pdf)

  // Doorloop 1: opmaak en paginanummers.
  const paginas: Op[][] = []
  for (const doc of docs) {
    // Ronde 2 (A3): een concept krijgt CONCEPT op elke pagina (voorblad, verantwoording, inhoud en rapport).
    const stempel = doc.concept ? conceptOps() : []
    const eigen: Op[][] = []
    eigen.push(voorblad(doc))
    eigen.push(...pagineer(bouwVerantwoording(m, doc), { boven: M.losBoven, onder: M.losOnder }).paginas)
    const rapport = pagineer(bouwRapportpaginas(m, doc), { boven: M.bodyBoven, onder: M.bodyOnder })
    eigen.push(...pagineer(bouwInhoudsopgave(m, doc, rapport.sectiePagina), { boven: M.losBoven, onder: M.inhoudOnder }).paginas)
    rapport.paginas.forEach((ops, i) => eigen.push([...kopregel(m, doc, i + 1), ...ops]))
    paginas.push(...eigen.map((ops) => [...stempel, ...ops]))
  }

  // Doorloop 2: tekenen.
  paginas.forEach((ops, i) => {
    if (i > 0) pdf.addPage('a4', 'portrait')
    teken(pdf, ops)
  })

  const namen = [...new Set(docs.map((d) => d.naam))]
  pdf.setProperties({
    title: schoon(`${docs[0].titel} van ${namen.join(' en ')}`),
    subject: schoon(SITE.disclaimer),
    author: schoon(SITE.naam),
    creator: schoon(SITE.naam),
    keywords: schoon(`inkomstenbelasting, ${[...new Set(docs.map((d) => d.jaar))].join(', ')}`),
  })
  const berekend = new Date(docs[0].verantwoording.berekendOp)
  if (!Number.isNaN(berekend.getTime())) pdf.setCreationDate(berekend)
  return pdf
}

/** PDF van één of meer rapporten (beide partners achter elkaar), voor de browser. */
/** Aandeel letters dat na pdfTekst overblijft; onder deze grens valt de naam terug op 'Persoon A'. */
const MIN_LEESBAAR = 0.5

function letters(s: string): number {
  return (s.match(/\p{L}/gu) ?? []).length
}

function vervangOveral<T>(waarde: T, oud: string, nieuw: string): T {
  if (typeof waarde === 'string') return waarde.split(oud).join(nieuw) as T
  if (Array.isArray(waarde)) return waarde.map((w) => vervangOveral(w, oud, nieuw)) as T
  if (waarde && typeof waarde === 'object') {
    return Object.fromEntries(Object.entries(waarde).map(([k, v]) => [k, vervangOveral(v, oud, nieuw)])) as T
  }
  return waarde
}

/**
 * Een naam in een schrift dat Times in de PDF niet kan zetten (Grieks, Cyrillisch, Chinees) zou na pdfTekst
 * leeg of onleesbaar worden. Dan staat in de PDF 'Persoon A' en zegt de verantwoording waarom; de Excel
 * houdt de naam zoals hij is.
 */
export function pdfVeiligeDocumenten(docs: RapportDocument[]): RapportDocument[] {
  return docs.map((doc) => {
    const naam = doc.naam.trim()
    if (!naam || letters(pdfTekst(naam)) >= letters(naam) * MIN_LEESBAAR) return doc
    const terugval = `Persoon ${doc.persoon}`
    const nieuw = vervangOveral(doc, naam, terugval)
    nieuw.verantwoording = {
      ...nieuw.verantwoording,
      meldingen: [
        ...nieuw.verantwoording.meldingen,
        { ernst: 'info', tekst: `De naam bevat tekens die deze PDF niet kan weergeven. Daarom staat er '${terugval}'. In de Excel-versie staat de naam wel.` },
      ],
    }
    return nieuw
  })
}

export async function maakRapportPdf(docs: RapportDocument[]): Promise<Blob> {
  const pdf = await bouwPdf(pdfVeiligeDocumenten(docs))
  return pdf.output('blob')
}

/** Dezelfde PDF als bytes; werkt ook in Node (tests, voorbeeldscript). */
export async function rapportPdfBytes(docs: RapportDocument[]): Promise<Uint8Array> {
  const pdf = await bouwPdf(pdfVeiligeDocumenten(docs))
  return new Uint8Array(pdf.output('arraybuffer'))
}
