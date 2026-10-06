/**
 * Ronde 2 (A3): zoeken in het veldregister en de regelingen (lib/dossier/veldregister), voor het zoekveld op de
 * jaarpagina (RegelingZoeker) en voor de labels bij springen naar een veld. Puur: geen React, geen I/O.
 *
 * - `matchPatroon(patroon, id)`: past een veld-id op een patroon ('persoon:*\/onderneming:*\/winstberekening.saldo')?
 * - `vindVeld(id)`: het registeritem van een veld-id, met label, plaats ("Ontwerpstudio, Persoon A") en de sectie.
 * - `instanties(patroon, invoer)`: de veld-id's die bij een patroon in deze invoer bestaan (per persoon, onderneming,
 *   werkgever, bezitting, ...). Een lijst die het register niet kent, wordt op naam in de invoer gezocht (meervoud),
 *   zodat ook de velden van de andere onderdelen na de integratie gevonden worden.
 * - `zoek(term, velden, regelingen, invoer)`: resultaten gerangschikt op label, synoniemen en uitleg; zonder accenten
 *   (privé = prive), zonder dubbelen, met de persoon erbij als er twee zijn. Alleen velden die nu op de pagina staan
 *   (`opPagina`, met `bestaat` uit het register); een ingang naar iets dat nog leeg is, krijgt "nog niet ingevuld".
 * - `catalogus(regelingen, invoer)`: alle regelingen per plaats, voor "Alle regelingen bekijken".
 */
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import { ID_PATROON, itemSleutel } from './ids'
import { leesVeldId, type VeldId } from './veld'
import type { RegelingItem, RegelingPlaats, VeldMatch, VeldregisterItem } from './veldregister/types'

// ---------------------------------------------------------------------------
// Tekst
// ---------------------------------------------------------------------------

/** Kleine letters, zonder accenten, alleen letters en cijfers met enkele spaties. */
export function normaliseer(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('nl-NL')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const naamPersoon = (p: { id: string; naam?: string }) => (p.naam?.trim() ? p.naam.trim() : `Persoon ${p.id}`)

// ---------------------------------------------------------------------------
// Patronen en veld-id's
// ---------------------------------------------------------------------------

/** Past `id` op `patroon`? '*' past op precies één sleutel; de rest moet gelijk zijn. */
export function matchPatroon(patroon: string, id: string): VeldMatch | null {
  const p = patroon.split('/')
  const v = leesVeldId(id)
  if (!v || p.length !== v.segmenten.length) return null
  const sleutels: string[] = []
  for (let i = 0; i < p.length; i++) {
    const s = v.segmenten[i]
    const k = p[i].indexOf(':')
    const naam = k < 0 ? p[i] : p[i].slice(0, k)
    const sleutel = k < 0 ? undefined : p[i].slice(k + 1)
    if (naam !== s.naam) return null
    if (sleutel === undefined) {
      if (s.sleutel !== undefined) return null
    } else if (s.sleutel === undefined) return null
    else if (sleutel === '*') sleutels.push(s.sleutel)
    else if (sleutel !== s.sleutel) return null
  }
  return { id, ...(v.persoon ? { persoon: v.persoon } : {}), sleutels }
}

/** Het registeritem bij een veld-id (het eerste patroon dat past). */
export function vindItem(id: VeldId, register: readonly VeldregisterItem[]): { item: VeldregisterItem; match: VeldMatch } | null {
  for (const item of register) {
    const match = matchPatroon(item.patroon, id)
    if (match) return { item, match }
  }
  return null
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Waar een veld staat, in gewone taal: "Ontwerpstudio, Persoon A", "Spaarrekening", "Persoon B". */
export function waarVanVeld(id: VeldId, invoer: HuishoudenInvoer): string {
  const v = leesVeldId(id)
  if (!v) return ''
  const delen: string[] = []
  const p = v.persoon ? invoer.personen.find((x) => x.id === v.persoon) : undefined
  for (const s of v.segmenten) {
    if (s.sleutel === undefined) continue
    if (s.naam === 'onderneming' && p) {
      const o = p.ondernemingen.find((x, i) => itemSleutel(x, i) === s.sleutel)
      if (o) delen.push(o.naam?.trim() || 'Onderneming zonder naam')
    } else if (s.naam === 'loon' && p) {
      const l = p.loon.find((x, i) => itemSleutel(x, i) === s.sleutel)
      if (l?.omschrijving?.trim()) delen.push(l.omschrijving.trim())
    } else if (s.naam === 'positie') {
      const x = invoer.box3.posities.find((q) => q.id === s.sleutel)
      if (x?.omschrijving?.trim()) delen.push(x.omschrijving.trim())
    } else if (s.naam === 'schuld') {
      const x = invoer.box3.schulden.find((q) => q.id === s.sleutel)
      if (x?.omschrijving?.trim()) delen.push(x.omschrijving.trim())
    } else if (s.naam === 'kind') {
      const k = invoer.kinderen.findIndex((q) => q.id === s.sleutel)
      if (k >= 0) delen.push(invoer.kinderen[k].naam?.trim() || `Kind ${k + 1}`)
    }
  }
  if (p && invoer.personen.length > 1) delen.push(naamPersoon(p))
  return delen.join(', ')
}

/** Sectie-id van een registeritem; '{persoon}' wordt de persoon van het veld. */
export function sectieVan(item: Pick<VeldregisterItem, 'sectie'>, persoon?: PersoonId): string {
  return persoon ? item.sectie.replace('{persoon}', persoon) : item.sectie.replace('-{persoon}', '')
}

export interface VeldInfo {
  label: string
  waar: string
  sectie: string
  sectieNaam: string
}

/** Label, plaats en sectie van een veld uit het register; null als geen patroon past. */
export function vindVeld(id: VeldId, invoer: HuishoudenInvoer, register: readonly VeldregisterItem[]): VeldInfo | null {
  const gevonden = vindItem(id, register)
  if (!gevonden) return null
  const { item, match } = gevonden
  let label: string
  try {
    label = typeof item.label === 'function' ? item.label(match, invoer) : item.label
  } catch {
    label = typeof item.label === 'string' ? item.label : id
  }
  return { label, waar: waarVanVeld(id, invoer), sectie: sectieVan(item, match.persoon), sectieNaam: item.sectieNaam }
}

// ---------------------------------------------------------------------------
// Instanties van een patroon in de invoer
// ---------------------------------------------------------------------------

interface Knoop {
  obj: unknown
  pad: string[]
}

/** Lijsten die het register kent; de rest wordt op naam gezocht (meervoud). */
const LIJSTEN: Record<string, (ouder: Obj, invoer: HuishoudenInvoer) => unknown[] | undefined> = {
  persoon: (_o, i) => i.personen,
  kind: (_o, i) => i.kinderen,
  box2: (_o, i) => i.box2,
  onderneming: (o) => o.ondernemingen as unknown[] | undefined,
  activa: (o) => o.activa as unknown[] | undefined,
  lijfrentehistorie: (o) => (isObj(o.inkomensvoorziening) ? (o.inkomensvoorziening.historie as unknown[] | undefined) : undefined),
  positie: (o) => o.posities as unknown[] | undefined,
  schuld: (o) => o.schulden as unknown[] | undefined,
  leningdeel: (o) => o.leningdelen as unknown[] | undefined,
}

/** Sleutel van een item: persoon-id, vaste id, jaar (lijfrentehistorie) of index. */
function sleutelVan(naam: string, item: unknown, index: number): string {
  if (isObj(item)) {
    if (naam === 'lijfrentehistorie' && typeof item.jaar === 'number') return String(item.jaar)
    if (typeof item.id === 'string' && ID_PATROON.test(item.id)) return item.id
  }
  return itemSleutel(undefined, index)
}

function lijstVan(naam: string, ouder: Obj, invoer: HuishoudenInvoer): unknown[] | undefined {
  const vast = LIJSTEN[naam]
  if (vast) return vast(ouder, invoer)
  // Onbekende lijst: zoek op naam, ook als pad met punten ('jaarrekening.onttrekkingen'), en in het meervoud.
  const kandidaten = [naam, `${naam}s`, `${naam}en`, `${naam}n`]
  for (const k of kandidaten) {
    const waarde = k.split('.').reduce<unknown>((o, d) => (isObj(o) ? o[d] : undefined), ouder)
    if (Array.isArray(waarde)) return waarde
  }
  return undefined
}

/** Delen zonder sleutel: bestaat het onderdeel in deze invoer (en dus op de pagina)? */
function deelVan(naam: string, ouder: unknown, invoer: HuishoudenInvoer): unknown {
  if (naam === 'huishouden') return invoer
  if (naam === 'pga') return invoer.pga ?? {}
  if (naam === 'verdeling') return invoer.fiscaalPartner && invoer.personen.length === 2 ? (isObj(invoer.verdeling) ? invoer.verdeling : {}) : undefined
  if (naam === 'eigenWoning') return invoer.eigenWoning
  if (naam === 'box3') return invoer.box3
  return isObj(ouder) ? ouder[naam] : undefined
}

/** Alle veld-id's van een patroon die in deze invoer bestaan. Het laatste segment (het veld zelf) wordt niet gecontroleerd. */
export function instanties(patroon: string, invoer: HuishoudenInvoer): VeldMatch[] {
  const delen = patroon.split('/')
  let knopen: Knoop[] = [{ obj: invoer, pad: [] }]
  for (let i = 0; i < delen.length - 1; i++) {
    const d = delen[i]
    const k = d.indexOf(':')
    const volgende: Knoop[] = []
    for (const kn of knopen) {
      if (k < 0) {
        const deel = deelVan(d, kn.obj, invoer)
        if (deel !== undefined && deel !== null) volgende.push({ obj: deel, pad: [...kn.pad, d] })
        continue
      }
      const naam = d.slice(0, k)
      const sleutel = d.slice(k + 1)
      const lijst = isObj(kn.obj) ? lijstVan(naam, kn.obj, invoer) : undefined
      if (!Array.isArray(lijst)) continue
      lijst.forEach((item, idx) => {
        const s = naam === 'persoon' && isObj(item) && typeof item.id === 'string' ? item.id : sleutelVan(naam, item, idx)
        if (sleutel !== '*' && sleutel !== s) return
        volgende.push({ obj: item, pad: [...kn.pad, `${naam}:${s}`] })
      })
    }
    knopen = volgende
    if (knopen.length === 0) return []
  }
  const veld = delen[delen.length - 1]
  return knopen.map((kn) => matchPatroon(patroon, [...kn.pad, veld].join('/'))).filter((m): m is VeldMatch => m !== null)
}

// ---------------------------------------------------------------------------
// Zoeken
// ---------------------------------------------------------------------------

export type ZoekResultaat =
  | { soort: 'veld'; sleutel: string; label: string; waar: string; veld: VeldId; sectie: string; sectieNaam: string; score: number }
  | { soort: 'regeling'; sleutel: string; regeling: string; label: string; waar: string; actief: true; veld: VeldId; score: number }
  | { soort: 'regeling'; sleutel: string; regeling: string; label: string; waar: string; actief: false; elementId: string; score: number }

/** Score van een tekst voor een zoekterm (0 = geen treffer). */
function treffer(tekst: string, term: string, woorden: string[]): number {
  if (!tekst) return 0
  if (tekst === term) return 100
  if (tekst.startsWith(term)) return 80
  if (tekst.split(' ').some((w) => w.startsWith(term))) return 65
  if (tekst.includes(term)) return 50
  if (woorden.length > 1 && woorden.every((w) => tekst.includes(w))) return 35
  return 0
}

function score(label: string, synoniemen: readonly string[], uitleg: string | undefined, term: string): number {
  const woorden = term.split(' ').filter(Boolean)
  const viaLabel = treffer(normaliseer(label), term, woorden)
  const viaSynoniem = Math.max(0, ...synoniemen.map((s) => treffer(normaliseer(s), term, woorden) - 5))
  const viaUitleg = uitleg && normaliseer(uitleg).includes(term) ? 10 : 0
  return Math.max(viaLabel, viaSynoniem, viaUitleg)
}

function veilig<T>(f: () => T[]): T[] {
  try {
    return f()
  } catch {
    return []
  }
}

function veiligWaar(f: () => boolean | undefined): boolean {
  try {
    return Boolean(f())
  } catch {
    return false
  }
}

/** Staat dit veld nu op de pagina (zie `VeldregisterItem.bestaat`)? Zonder voorwaarde: ja. */
export function opPagina(item: Pick<VeldregisterItem, 'bestaat'>, m: VeldMatch, invoer: HuishoudenInvoer): boolean {
  if (!item.bestaat) return true
  try {
    return item.bestaat(m, invoer)
  } catch {
    return false
  }
}

export const ZOEK_MAX = 8

/**
 * Zoekt velden en regelingen. Een regeling die al actief is, springt naar het veld; een die nog niet is toegevoegd, opent
 * de kiezer (elementId); een regeling die hier niet kan (bijvoorbeeld geen onderneming), komt niet in de resultaten.
 */
export function zoek(term: string, velden: readonly VeldregisterItem[], regelingen: readonly RegelingItem[], invoer: HuishoudenInvoer, max = ZOEK_MAX): ZoekResultaat[] {
  const t = normaliseer(term)
  if (t.length < 2) return []
  const uit: ZoekResultaat[] = []
  const tweePersonen = invoer.personen.length > 1

  regelingen.forEach((r) => {
    const s = score(r.naam, r.synoniemen, r.uitleg, t)
    if (s === 0) return
    const actief = veilig(() => r.actiefBij(invoer))
    if (actief.length > 0) {
      for (const a of actief) uit.push({ soort: 'regeling', sleutel: `regeling:${r.id}:${a.veld}`, regeling: r.id, label: r.naam, waar: a.waar, actief: true, veld: a.veld, score: s + 5 })
      return
    }
    for (const k of veilig(() => r.kiezers(invoer))) {
      uit.push({ soort: 'regeling', sleutel: `regeling:${r.id}:${k.elementId}`, regeling: r.id, label: r.naam, waar: k.waar ? `${k.waar} · nog niet toegevoegd` : 'nog niet toegevoegd', actief: false, elementId: k.elementId, score: s + 5 })
    }
  })

  velden.forEach((v) => {
    const vast = typeof v.label === 'string' ? v.label : ''
    const s0 = score(vast || v.sectieNaam, v.synoniemen ?? [], undefined, t)
    if (s0 === 0 && vast) return
    for (const m of veilig(() => instanties(v.patroon, invoer).filter((x) => opPagina(v, x, invoer)))) {
      let label = vast
      if (!label) {
        try {
          label = typeof v.label === 'function' ? v.label(m, invoer) : v.label
        } catch {
          label = v.sectieNaam
        }
      }
      const s = vast ? s0 : score(label, v.synoniemen ?? [], undefined, t)
      if (s === 0) continue
      let waar = waarVanVeld(m.id, invoer)
      if (!waar && tweePersonen && m.persoon) waar = naamPersoon(invoer.personen.find((p) => p.id === m.persoon) ?? { id: m.persoon })
      if (!waar) waar = v.sectieNaam
      if (veiligWaar(() => v.nogNietIngevuld?.(m, invoer))) waar = `${waar} · nog niet ingevuld`
      uit.push({ soort: 'veld', sleutel: `veld:${m.id}`, label, waar, veld: m.id, sectie: sectieVan(v, m.persoon), sectieNaam: v.sectieNaam, score: s })
    }
  })

  const gezien = new Set<string>()
  return uit
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.score - a.r.score || a.i - b.i)
    .map(({ r }) => r)
    .filter((r) => {
      // Geen dubbelen: hetzelfde veld via een regeling en via het register telt één keer.
      const sleutel = r.soort === 'regeling' && r.actief ? `veld:${r.veld}` : r.sleutel
      if (gezien.has(sleutel) || gezien.has(r.sleutel)) return false
      gezien.add(sleutel)
      gezien.add(r.sleutel)
      return true
    })
    .slice(0, max)
}

// ---------------------------------------------------------------------------
// Catalogus
// ---------------------------------------------------------------------------

export const PLAATS_LABEL: Record<RegelingPlaats, string> = {
  onderneming: 'Onderneming',
  woning: 'Eigen woning',
  box3: 'Vermogen',
  box2: 'Box 2',
  aanslag: 'Persoon',
  pensioen: 'Persoon',
  loon: 'Persoon',
}

const PLAATS_VOLGORDE = ['Onderneming', 'Eigen woning', 'Vermogen', 'Box 2', 'Persoon']

export interface CatalogusRegeling {
  id: string
  naam: string
  uitleg: string
  /** Waar "Ga erheen" naartoe gaat: het eerste actieve veld, anders de eerste kiezer; null als het hier niet kan. */
  doel: { soort: 'veld'; veld: VeldId; waar: string } | { soort: 'kiezer'; elementId: string; waar: string } | null
}

export function catalogus(regelingen: readonly RegelingItem[], invoer: HuishoudenInvoer): Array<{ plaats: string; regelingen: CatalogusRegeling[] }> {
  const groepen = new Map<string, CatalogusRegeling[]>()
  for (const r of regelingen) {
    const plaats = PLAATS_LABEL[r.plaats] ?? 'Overig'
    const actief = veilig(() => r.actiefBij(invoer))[0]
    const kiezer = actief ? undefined : veilig(() => r.kiezers(invoer))[0]
    const doel: CatalogusRegeling['doel'] = actief ? { soort: 'veld', veld: actief.veld, waar: actief.waar } : kiezer ? { soort: 'kiezer', elementId: kiezer.elementId, waar: kiezer.waar } : null
    groepen.set(plaats, [...(groepen.get(plaats) ?? []), { id: r.id, naam: r.naam, uitleg: r.uitleg, doel }])
  }
  const rang = (plaats: string) => {
    const i = PLAATS_VOLGORDE.indexOf(plaats)
    return i < 0 ? PLAATS_VOLGORDE.length : i
  }
  return [...groepen.entries()].sort(([a], [b]) => rang(a) - rang(b)).map(([plaats, lijst]) => ({ plaats, regelingen: lijst }))
}
