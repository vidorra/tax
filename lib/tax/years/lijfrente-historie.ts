/**
 * Lijfrenteparameters per jaar voor de tienjaarsterugblik van de reserveringsruimte.
 *
 * Elk jaar wordt met de regels van dát jaar berekend (2022: 13,3% en het oude maximum,
 * vanaf 2023: 30%). Voor jaren met een jaarmodule komen de parameters uit die module;
 * voor oudere jaren (2014 t/m 2020) uit `data/lijfrente-historie.json`.
 */
import type { LijfrenteParams, Status } from '../types'
import { JAREN } from './index'
import historie from './data/lijfrente-historie.json'

interface HistorieJaar {
  status: string
  pct: number
  factorA: number
  franchise: number
  inkomensgrens: number
  maxJaarruimte: number
  maxReserveringsruimte: number
}

const DATA = historie.jaren as Record<string, HistorieJaar>
const GEMEENSCHAPPELIJK = historie.gemeenschappelijk

/** Eerste jaar waarvoor parameters beschikbaar zijn. */
export const EERSTE_LIJFRENTEJAAR = Math.min(...Object.keys(DATA).map(Number))

/** Bron van de historische tabel (voor uitlegregels). */
export const LIJFRENTE_HISTORIE_BRON = historie._bron

/**
 * Lijfrenteparameters van een jaar, of undefined als het jaar niet bekend is.
 * Geeft een kopie terug, zodat de aanroeper de jaarmodule niet kan wijzigen.
 */
export function lijfrenteParamsVoorJaar(jaar: number): LijfrenteParams | undefined {
  const jaarModule = JAREN[jaar]
  if (jaarModule) {
    const l = jaarModule.inkomensvoorziening.waarde.lijfrente
    return { ...l, factorA: { ...l.factorA } }
  }
  const d = DATA[String(jaar)]
  if (!d) return undefined
  return {
    regime: GEMEENSCHAPPELIJK.regime as LijfrenteParams['regime'],
    pct: d.pct,
    franchise: d.franchise,
    inkomensgrens: d.inkomensgrens,
    maxJaarruimte: d.maxJaarruimte,
    maxReserveringsruimte: d.maxReserveringsruimte,
    reserveringsruimtePctGrondslag: GEMEENSCHAPPELIJK.reserveringsruimtePctGrondslag,
    terugkijkJaren: GEMEENSCHAPPELIJK.terugkijkJaren,
    factorA: { toegestaan: true, factor: d.factorA },
    maxJarenNaAOW: GEMEENSCHAPPELIJK.maxJarenNaAOW,
    saldomethodeMax: GEMEENSCHAPPELIJK.saldomethodeMax,
  }
}

/** Status van de lijfrenteparameters van een jaar (geschat voor afgeleide oude jaren). */
export function lijfrenteStatusVoorJaar(jaar: number): Status | undefined {
  const jaarModule = JAREN[jaar]
  if (jaarModule) {
    const b = jaarModule.inkomensvoorziening
    return b.veldStatus?.lijfrente ?? b.status
  }
  return DATA[String(jaar)]?.status as Status | undefined
}
