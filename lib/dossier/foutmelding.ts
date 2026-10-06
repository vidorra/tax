/**
 * Validatiefouten van de server ("personen[0].geboortedatum: datum ontbreekt", uit valideerInvoer) in gewone taal, met
 * het veld om naartoe te springen: "Geboortedatum (Persoon A): vul een datum in." Het pad wordt een veld-id
 * (lib/dossier/veld.ts) en het veldregister geeft het label en de plek. Een pad dat we niet kunnen thuisbrengen, blijft
 * leesbaar zonder sprong. Puur: geen React, geen I/O.
 */
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { itemSleutel } from './ids'
import { leesVeldId, type VeldId } from './veld'
import { VELDREGISTER } from './veldregister'
import { vindVeld } from './zoeken'

export interface LeesbareFout {
  tekst: string
  /** Veld om naartoe te springen, als het register het veld kent. */
  veld?: VeldId
}

/** Lijsten in de invoer en hun segment in het veld-id. */
const LIJST_SEGMENT: Record<string, string> = {
  personen: 'persoon',
  ondernemingen: 'onderneming',
  investeringen: 'investering',
  activa: 'activa',
  desinvesteringen: 'desinvestering',
  opdrachtgevers: 'opdrachtgever',
  herinvesteringsreserves: 'herinvesteringsreserve',
  egalisatiereserves: 'egalisatiereserve',
  loon: 'loon',
  kinderen: 'kind',
  posities: 'positie',
  schulden: 'schuld',
  leningdelen: 'leningdeel',
  box2: 'box2',
  terbeschikkingstellingen: 'terbeschikkingstelling',
}

/** Lijsten waarvan het veld-id de index gebruikt (geen vaste id), zoals de editor ze zet. */
const MET_INDEX = new Set(['activa', 'desinvestering', 'opdrachtgever'])

const MELDING: Record<string, string> = {
  'datum ontbreekt': 'vul een datum in',
  'moet een datum zijn (JJJJ-MM-DD)': 'vul een geldige datum in',
  'verplicht getal ontbreekt': 'vul een bedrag in',
  'moet een getal zijn': 'vul een getal in',
  'verplichte tekst ontbreekt': 'vul dit in',
  'moet tekst zijn': 'vul een tekst in',
  'tekst is te lang': 'de tekst is te lang',
  'mag niet negatief zijn': 'mag niet negatief zijn',
  'ja/nee ontbreekt': 'kies ja of nee',
  'keuze ontbreekt': 'maak een keuze',
}

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

/** "personen[0].ondernemingen[1].winstberekening.saldo" wordt "persoon:A/onderneming:ond-1/winstberekening.saldo". */
export function padNaarVeld(pad: string, invoer: HuishoudenInvoer): VeldId | null {
  // Sommige paden beginnen met 'invoer.' ('invoer.kinderen[0].geboortedatum'), andere niet ('personen[0].naam').
  const delen = pad.replace(/^invoer\./, '').split('.').filter(Boolean)
  const segmenten: string[] = []
  const rest: string[] = []
  let huidig: unknown = invoer
  let wortel: 'eigenWoning' | 'box3' | null = null
  for (let i = 0; i < delen.length; i++) {
    const m = /^([A-Za-z0-9]+)(?:\[(\d+)\])?$/.exec(delen[i])
    if (!m) return null
    const [, naam, idx] = m
    if (rest.length === 0 && i === 0 && (naam === 'eigenWoning' || naam === 'box3') && idx === undefined) {
      wortel = naam
      segmenten.push(naam)
      huidig = isObj(huidig) ? huidig[naam] : undefined
      continue
    }
    if (rest.length === 0 && idx !== undefined && LIJST_SEGMENT[naam]) {
      const lijst = isObj(huidig) ? huidig[naam] : undefined
      const item = Array.isArray(lijst) ? lijst[Number(idx)] : undefined
      const seg = LIJST_SEGMENT[naam]
      const sleutel = seg === 'persoon' ? (isObj(item) && typeof item.id === 'string' ? item.id : null) : MET_INDEX.has(seg) ? idx : itemSleutel(isObj(item) ? (item as { id?: string }) : undefined, Number(idx))
      if (sleutel === null) return null
      segmenten.push(`${seg}:${sleutel}`)
      huidig = item
      continue
    }
    rest.push(naam)
    if (idx !== undefined) return null
  }
  if (rest.length === 0) return null
  if (wortel === null && segmenten.length === 0) return null
  return [...segmenten, rest.join('.')].join('/')
}

/** Eén fout van de server in gewone taal, met het veld als we dat kennen. */
export function leesbareFout(regel: string, invoer: HuishoudenInvoer): LeesbareFout {
  const i = regel.indexOf(': ')
  if (i < 0) return { tekst: regel }
  const pad = regel.slice(0, i)
  const ruw = regel.slice(i + 2).trim()
  const melding = MELDING[ruw] ?? ruw
  const veld = padNaarVeld(pad, invoer)
  const info = veld && leesVeldId(veld) ? vindVeld(veld, invoer, VELDREGISTER) : null
  if (!veld || !info) return { tekst: `${melding.charAt(0).toLocaleUpperCase('nl-NL')}${melding.slice(1)} (${pad}).` }
  return { tekst: `${info.label}${info.waar && !info.label.includes(info.waar) ? ` (${info.waar})` : ''}: ${melding}.`, veld }
}
