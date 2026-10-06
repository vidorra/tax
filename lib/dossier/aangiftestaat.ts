/**
 * Ronde 2, contract en opslagvorm: de aangiftestaat van één dossierjaar.
 *
 * Wat erin staat (en waarom niet in de invoer): vinkjes, VIA-bedragen en keuzes van de invulhulp, genegeerde
 * controles, de status van terugvragen in het buitenland en de datums van de planning. Dat is werkvoortgang, geen
 * invoer voor de engine; het slaat zichzelf op (de invulhulp na 800 ms rust) zonder de knop Opslaan en zonder de
 * versie van de invoer te verhogen, zodat een vinkje in een tweede venster nooit een versieconflict in de editor geeft.
 *
 * Opslag: tabel aangifte_staat (migratie 0005), versleuteld met context `aangifte_staat:<dossier_year_id>`; server in
 * lib/dossier/aangiftestaat-opslag.ts, API GET/PATCH /api/dossier/jaren/[jaar]/aangiftestaat, client
 * components/dossier/useAangifteStaat.ts. Wijzigen gaat altijd met kleine wijzigingen (`StaatWijziging`) die de server
 * onder een rijlock toepast: twee vensters overschrijven elkaars vinkjes dan niet.
 *
 * Dit bestand is puur (geen React, geen I/O) en wordt door client en server gebruikt.
 */
import type { PersoonId } from '@/lib/tax/types'
import type { GenegeerdeControle, ControleErnst } from '@/lib/controles/types'
import type { InvulhulpTelling, InvulhulpVoortgang, VeldVoortgang, VerschilKeuze } from '@/lib/invulhulp/types'

/** Status van één verzoek om bronbelasting terug te vragen in het bronland. */
export interface TerugvraagStatus {
  status: 'open' | 'aangevraagd' | 'ontvangen' | 'laten'
  /** ISO-tijdstip van de laatste wijziging. */
  op: string
  /** Ontvangen bedrag in euro's (alleen bij 'ontvangen'). */
  ontvangen?: number
  notitie?: string
}

export interface PlanningStaat {
  /** Verwachte dagtekening van de definitieve aanslag (rente-scenario). */
  verwachteDagtekening?: string
  /** Verwachte datum waarop de aangifte binnen is (vóór of na 1 mei). */
  indieningsdatum?: string
  /** De aanslag wordt naar verwachting conform de aangifte opgelegd (standaard ja). */
  verwachtConform?: boolean
}

export interface AangifteStaat {
  versie: 1
  invulhulp?: InvulhulpVoortgang
  /** Bewust genegeerde of als gezien afgevinkte controles, op controle-id. */
  genegeerd?: Record<string, GenegeerdeControle>
  /** Terugvraagstatus op `${positieId}/${regelId}` (BronbelastingRegel). */
  terugvragen?: Record<string, TerugvraagStatus>
  planning?: PlanningStaat
  /**
   * Telling per persoon die de invulhulp bijhoudt, zodat het overzicht de voortgang kan tonen zonder de schermen op te
   * bouwen. Geen bedragen.
   */
  samenvatting?: { invulhulp?: Partial<Record<PersoonId, InvulhulpTelling>> }
  /**
   * Ronde 2 (na de toets): rustig invullen. `streng` wordt gezet zodra de gebruiker het jaar op Gecontroleerd wil
   * zetten, de invulhulp of de export opent, of het controlepaneel openklapt; daarna tonen de controles fouten in rood
   * (zie `controlesStreng` in lib/controles/negeren.ts). Een gezette `streng` blijft staan.
   */
  controles?: { streng?: ControlesStreng }
}

/** Ronde 2: wanneer en waardoor de controles in dit jaar nadrukkelijk werden. */
export interface ControlesStreng {
  op: string
  door: 'status' | 'invulhulp' | 'export' | 'paneel'
}

export const LEGE_STAAT: AangifteStaat = { versie: 1 }

/** Eén wijziging; `waarde: null` verwijdert. */
export type StaatWijziging =
  | { soort: 'veld'; persoon: PersoonId; sleutel: string; waarde: VeldVoortgang | null }
  | { soort: 'programma'; persoon: PersoonId; waarde: { ib?: number | null; zvw?: number | null } | null }
  | { soort: 'genegeerd'; id: string; waarde: GenegeerdeControle | null }
  | { soort: 'terugvraag'; sleutel: string; waarde: TerugvraagStatus | null }
  | { soort: 'planning'; waarde: PlanningStaat | null }
  | { soort: 'samenvatting-invulhulp'; persoon: PersoonId; waarde: InvulhulpTelling | null }
  /** Zet `controles.streng` als die nog niet staat (een tweede keer verandert niets). */
  | { soort: 'controles-streng'; waarde: ControlesStreng }

export const STAAT_GRENZEN = {
  /** Wijzigingen per verzoek. */
  wijzigingen: 200,
  /** Velden per persoon in de invulhulp. */
  veldenPerPersoon: 3000,
  genegeerd: 500,
  terugvragen: 500,
  sleutel: 200,
  tekst: 500,
  bedrag: 1e12,
} as const

const SLEUTEL = /^[A-Za-z0-9:/._-]+$/
const ERNST: readonly ControleErnst[] = ['fout', 'let-op', 'info']
const KEUZE: readonly VerschilKeuze[] = ['mijn-bedrag', 'bedrag-belastingdienst', 'uitzoeken']
const TERUG: readonly TerugvraagStatus['status'][] = ['open', 'aangevraagd', 'ontvangen', 'laten']
const STRENG_DOOR: readonly ControlesStreng['door'][] = ['status', 'invulhulp', 'export', 'paneel']

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isPersoon = (x: unknown): x is PersoonId => x === 'A' || x === 'B'
const isSleutel = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= STAAT_GRENZEN.sleutel && SLEUTEL.test(x)
const isTekst = (x: unknown): x is string => typeof x === 'string' && x.length <= STAAT_GRENZEN.tekst
const isBedrag = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= STAAT_GRENZEN.bedrag
const isDatum = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`))
const isTijdstip = (x: unknown): x is string => typeof x === 'string' && x.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(x) && !Number.isNaN(Date.parse(x))
const VERBODEN = new Set(['__proto__', 'constructor', 'prototype'])

function schoonVeld(x: unknown): VeldVoortgang | string {
  if (!isObj(x)) return 'veld moet een object zijn'
  const uit: VeldVoortgang = {}
  for (const k of Object.keys(x)) if (!['afgevinkt', 'via', 'keuze', 'notitie'].includes(k)) return `onbekend veld '${k.slice(0, 40)}'`
  if (x.afgevinkt !== undefined) {
    const a = x.afgevinkt
    if (!isObj(a) || typeof a.vingerafdruk !== 'string' || a.vingerafdruk.length > 200 || !isTijdstip(a.op)) return 'afgevinkt moet een vingerafdruk en tijdstip hebben'
    uit.afgevinkt = { vingerafdruk: a.vingerafdruk, op: a.op }
  }
  if (x.via !== undefined) {
    if (x.via !== null && !isBedrag(x.via)) return 'via moet een bedrag of leeg zijn'
    uit.via = x.via === null ? null : Math.round(x.via as number)
  }
  if (x.keuze !== undefined) {
    if (!KEUZE.includes(x.keuze as VerschilKeuze)) return 'onbekende keuze'
    uit.keuze = x.keuze as VerschilKeuze
  }
  if (x.notitie !== undefined) {
    if (!isTekst(x.notitie)) return 'notitie is te lang'
    uit.notitie = x.notitie
  }
  return uit
}

function schoonGenegeerd(id: string, x: unknown): GenegeerdeControle | string {
  if (!isObj(x)) return 'negering moet een object zijn'
  if (x.id !== id) return 'id van de negering past niet'
  if (!ERNST.includes(x.ernst as ControleErnst)) return 'onbekende ernst'
  if (typeof x.titel !== 'string' || x.titel.length > 200) return 'titel ontbreekt of is te lang'
  if (typeof x.vingerafdruk !== 'string' || x.vingerafdruk.length > 2000) return 'vingerafdruk ontbreekt of is te lang'
  if (!isTijdstip(x.op)) return 'tijdstip ontbreekt'
  if (x.reden !== undefined && !isTekst(x.reden)) return 'reden is te lang'
  if (x.ernst === 'fout' && (typeof x.reden !== 'string' || x.reden.trim().length === 0)) return 'een fout negeer je alleen met een reden'
  return { id, ernst: x.ernst as ControleErnst, titel: x.titel, vingerafdruk: x.vingerafdruk, op: x.op, ...(typeof x.reden === 'string' ? { reden: x.reden } : {}) }
}

function schoonTerugvraag(x: unknown): TerugvraagStatus | string {
  if (!isObj(x)) return 'terugvraag moet een object zijn'
  if (!TERUG.includes(x.status as TerugvraagStatus['status'])) return 'onbekende status'
  if (!isTijdstip(x.op)) return 'tijdstip ontbreekt'
  if (x.ontvangen !== undefined && !(isBedrag(x.ontvangen) && x.ontvangen >= 0)) return 'ontvangen moet een bedrag zijn'
  if (x.notitie !== undefined && !isTekst(x.notitie)) return 'notitie is te lang'
  return {
    status: x.status as TerugvraagStatus['status'],
    op: x.op,
    ...(x.ontvangen !== undefined ? { ontvangen: Math.round(x.ontvangen as number) } : {}),
    ...(x.notitie !== undefined ? { notitie: x.notitie as string } : {}),
  }
}

function schoonPlanning(x: unknown): PlanningStaat | string {
  if (!isObj(x)) return 'planning moet een object zijn'
  const uit: PlanningStaat = {}
  for (const k of Object.keys(x)) if (!['verwachteDagtekening', 'indieningsdatum', 'verwachtConform'].includes(k)) return `onbekend veld '${k.slice(0, 40)}'`
  if (x.verwachteDagtekening !== undefined) {
    if (!isDatum(x.verwachteDagtekening)) return 'verwachte dagtekening moet een datum zijn'
    uit.verwachteDagtekening = x.verwachteDagtekening
  }
  if (x.indieningsdatum !== undefined) {
    if (!isDatum(x.indieningsdatum)) return 'indieningsdatum moet een datum zijn'
    uit.indieningsdatum = x.indieningsdatum
  }
  if (x.verwachtConform !== undefined) {
    if (typeof x.verwachtConform !== 'boolean') return 'verwacht conform moet ja of nee zijn'
    uit.verwachtConform = x.verwachtConform
  }
  return uit
}

function schoonTelling(x: unknown): InvulhulpTelling | string {
  if (!isObj(x)) return 'telling moet een object zijn'
  const n = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000
  if (!n(x.afgevinkt) || !n(x.totaal) || !n(x.verschillen) || !n(x.gewijzigd)) return 'telling moet hele getallen hebben'
  return { afgevinkt: x.afgevinkt as number, totaal: x.totaal as number, verschillen: x.verschillen as number, gewijzigd: x.gewijzigd as number }
}

function schoonStreng(x: unknown): ControlesStreng | string {
  if (!isObj(x)) return 'streng moet een object zijn'
  if (!isTijdstip(x.op)) return 'tijdstip ontbreekt'
  if (!STRENG_DOOR.includes(x.door as ControlesStreng['door'])) return 'onbekende aanleiding'
  return { op: x.op, door: x.door as ControlesStreng['door'] }
}

function schoonProgramma(x: unknown): { ib?: number | null; zvw?: number | null } | string {
  if (!isObj(x)) return 'programma moet een object zijn'
  const uit: { ib?: number | null; zvw?: number | null } = {}
  for (const k of ['ib', 'zvw'] as const) {
    const v = x[k]
    if (v === undefined) continue
    if (v !== null && !isBedrag(v)) return `${k} moet een bedrag of leeg zijn`
    uit[k] = v === null ? null : Math.round(v as number)
  }
  return uit
}

/** Vormcontrole van wijzigingen uit de API; geeft opgeschoonde wijzigingen of een melding. */
export function schoonWijzigingen(x: unknown): { wijzigingen: StaatWijziging[] } | { fout: string } {
  if (!Array.isArray(x)) return { fout: 'wijzigingen moet een lijst zijn' }
  if (x.length === 0) return { fout: 'geen wijzigingen' }
  if (x.length > STAAT_GRENZEN.wijzigingen) return { fout: `maximaal ${STAAT_GRENZEN.wijzigingen} wijzigingen per keer` }
  const uit: StaatWijziging[] = []
  for (let i = 0; i < x.length; i++) {
    const w = x[i]
    const fout = (m: string) => ({ fout: `wijziging ${i + 1}: ${m}` })
    if (!isObj(w)) return fout('moet een object zijn')
    switch (w.soort) {
      case 'veld': {
        if (!isPersoon(w.persoon)) return fout('onbekende persoon')
        if (!isSleutel(w.sleutel) || VERBODEN.has(w.sleutel)) return fout('ongeldige sleutel')
        if (w.waarde === null) uit.push({ soort: 'veld', persoon: w.persoon, sleutel: w.sleutel, waarde: null })
        else {
          const v = schoonVeld(w.waarde)
          if (typeof v === 'string') return fout(v)
          uit.push({ soort: 'veld', persoon: w.persoon, sleutel: w.sleutel, waarde: v })
        }
        break
      }
      case 'programma': {
        if (!isPersoon(w.persoon)) return fout('onbekende persoon')
        if (w.waarde === null) uit.push({ soort: 'programma', persoon: w.persoon, waarde: null })
        else {
          const v = schoonProgramma(w.waarde)
          if (typeof v === 'string') return fout(v)
          uit.push({ soort: 'programma', persoon: w.persoon, waarde: v })
        }
        break
      }
      case 'genegeerd': {
        if (!isSleutel(w.id) || VERBODEN.has(w.id)) return fout('ongeldige controle-id')
        if (w.waarde === null) uit.push({ soort: 'genegeerd', id: w.id, waarde: null })
        else {
          const v = schoonGenegeerd(w.id, w.waarde)
          if (typeof v === 'string') return fout(v)
          uit.push({ soort: 'genegeerd', id: w.id, waarde: v })
        }
        break
      }
      case 'terugvraag': {
        if (!isSleutel(w.sleutel) || VERBODEN.has(w.sleutel)) return fout('ongeldige sleutel')
        if (w.waarde === null) uit.push({ soort: 'terugvraag', sleutel: w.sleutel, waarde: null })
        else {
          const v = schoonTerugvraag(w.waarde)
          if (typeof v === 'string') return fout(v)
          uit.push({ soort: 'terugvraag', sleutel: w.sleutel, waarde: v })
        }
        break
      }
      case 'planning': {
        if (w.waarde === null) uit.push({ soort: 'planning', waarde: null })
        else {
          const v = schoonPlanning(w.waarde)
          if (typeof v === 'string') return fout(v)
          uit.push({ soort: 'planning', waarde: v })
        }
        break
      }
      case 'samenvatting-invulhulp': {
        if (!isPersoon(w.persoon)) return fout('onbekende persoon')
        if (w.waarde === null) uit.push({ soort: 'samenvatting-invulhulp', persoon: w.persoon, waarde: null })
        else {
          const v = schoonTelling(w.waarde)
          if (typeof v === 'string') return fout(v)
          uit.push({ soort: 'samenvatting-invulhulp', persoon: w.persoon, waarde: v })
        }
        break
      }
      case 'controles-streng': {
        const v = schoonStreng(w.waarde)
        if (typeof v === 'string') return fout(v)
        uit.push({ soort: 'controles-streng', waarde: v })
        break
      }
      default:
        return fout('onbekende soort')
    }
  }
  return { wijzigingen: uit }
}

/** Past wijzigingen toe op een kopie; de invoer blijft ongewijzigd. Grenzen: zie STAAT_GRENZEN. */
export function pasStaatToe(staat: AangifteStaat, wijzigingen: StaatWijziging[]): { staat: AangifteStaat } | { fout: string } {
  const s: AangifteStaat = JSON.parse(JSON.stringify(staat ?? LEGE_STAAT)) as AangifteStaat
  s.versie = 1
  for (const w of wijzigingen) {
    switch (w.soort) {
      case 'veld': {
        const ih = (s.invulhulp ??= { velden: {} })
        const per = (ih.velden[w.persoon] ??= {})
        if (w.waarde === null) delete per[w.sleutel]
        else {
          if (!(w.sleutel in per) && Object.keys(per).length >= STAAT_GRENZEN.veldenPerPersoon) return { fout: 'te veel velden in de invulhulp' }
          per[w.sleutel] = w.waarde
        }
        break
      }
      case 'programma': {
        const ih = (s.invulhulp ??= { velden: {} })
        if (w.waarde === null) {
          if (ih.programma) delete ih.programma[w.persoon]
        } else (ih.programma ??= {})[w.persoon] = w.waarde
        break
      }
      case 'genegeerd': {
        const g = (s.genegeerd ??= {})
        if (w.waarde === null) delete g[w.id]
        else {
          if (!(w.id in g) && Object.keys(g).length >= STAAT_GRENZEN.genegeerd) return { fout: 'te veel genegeerde controles' }
          g[w.id] = w.waarde
        }
        break
      }
      case 'terugvraag': {
        const t = (s.terugvragen ??= {})
        if (w.waarde === null) delete t[w.sleutel]
        else {
          if (!(w.sleutel in t) && Object.keys(t).length >= STAAT_GRENZEN.terugvragen) return { fout: 'te veel terugvragen' }
          t[w.sleutel] = w.waarde
        }
        break
      }
      case 'planning':
        if (w.waarde === null) delete s.planning
        else s.planning = { ...(s.planning ?? {}), ...w.waarde }
        break
      case 'samenvatting-invulhulp': {
        const sv = (s.samenvatting ??= {})
        if (w.waarde === null) {
          if (sv.invulhulp) delete sv.invulhulp[w.persoon]
        } else (sv.invulhulp ??= {})[w.persoon] = w.waarde
        break
      }
      case 'controles-streng': {
        const c = (s.controles ??= {})
        c.streng ??= w.waarde
        break
      }
    }
  }
  return { staat: s }
}

/**
 * Vormcontrole van een hele staat (JSON-import, of een rij die niet meer past). Geeft de opgeschoonde staat; onbekende
 * of kapotte onderdelen vallen weg in plaats van alles te weigeren, met een lijst van wat er wegviel.
 */
export function schoonStaat(x: unknown): { staat: AangifteStaat; weggelaten: string[] } {
  const weggelaten: string[] = []
  if (!isObj(x)) return { staat: { ...LEGE_STAAT }, weggelaten: x === undefined || x === null ? [] : ['aangiftestaat'] }
  const wijzigingen: StaatWijziging[] = []
  const ih = x.invulhulp
  if (isObj(ih)) {
    if (isObj(ih.velden)) {
      for (const [p, velden] of Object.entries(ih.velden)) {
        if (!isPersoon(p) || !isObj(velden)) {
          weggelaten.push(`invulhulp.velden.${p.slice(0, 10)}`)
          continue
        }
        for (const [k, v] of Object.entries(velden)) {
          const sv = isSleutel(k) && !VERBODEN.has(k) ? schoonVeld(v) : 'sleutel'
          if (typeof sv === 'string') weggelaten.push(`invulhulp.${p}.${k.slice(0, 60)}`)
          else wijzigingen.push({ soort: 'veld', persoon: p, sleutel: k, waarde: sv })
        }
      }
    }
    if (isObj(ih.programma)) {
      for (const [p, v] of Object.entries(ih.programma)) {
        const sv = isPersoon(p) ? schoonProgramma(v) : 'persoon'
        if (typeof sv === 'string' || !isPersoon(p)) weggelaten.push(`invulhulp.programma.${p.slice(0, 10)}`)
        else wijzigingen.push({ soort: 'programma', persoon: p, waarde: sv })
      }
    }
  }
  if (isObj(x.genegeerd)) {
    for (const [id, v] of Object.entries(x.genegeerd)) {
      const sv = isSleutel(id) && !VERBODEN.has(id) ? schoonGenegeerd(id, v) : 'id'
      if (typeof sv === 'string') weggelaten.push(`genegeerd.${id.slice(0, 60)}`)
      else wijzigingen.push({ soort: 'genegeerd', id, waarde: sv })
    }
  }
  if (isObj(x.terugvragen)) {
    for (const [k, v] of Object.entries(x.terugvragen)) {
      const sv = isSleutel(k) && !VERBODEN.has(k) ? schoonTerugvraag(v) : 'sleutel'
      if (typeof sv === 'string') weggelaten.push(`terugvragen.${k.slice(0, 60)}`)
      else wijzigingen.push({ soort: 'terugvraag', sleutel: k, waarde: sv })
    }
  }
  if (x.planning !== undefined) {
    const sv = schoonPlanning(x.planning)
    if (typeof sv === 'string') weggelaten.push('planning')
    else wijzigingen.push({ soort: 'planning', waarde: sv })
  }
  const sam = isObj(x.samenvatting) ? x.samenvatting.invulhulp : undefined
  if (isObj(sam)) {
    for (const [p, v] of Object.entries(sam)) {
      const sv = isPersoon(p) ? schoonTelling(v) : 'persoon'
      if (typeof sv === 'string' || !isPersoon(p)) weggelaten.push(`samenvatting.${p.slice(0, 10)}`)
      else wijzigingen.push({ soort: 'samenvatting-invulhulp', persoon: p, waarde: sv })
    }
  }
  const streng = isObj(x.controles) ? x.controles.streng : undefined
  if (streng !== undefined) {
    const sv = schoonStreng(streng)
    if (typeof sv === 'string') weggelaten.push('controles.streng')
    else wijzigingen.push({ soort: 'controles-streng', waarde: sv })
  }
  const r = pasStaatToe(LEGE_STAAT, wijzigingen)
  if ('fout' in r) return { staat: { ...LEGE_STAAT }, weggelaten: ['aangiftestaat (te groot)'] }
  return { staat: r.staat, weggelaten }
}
