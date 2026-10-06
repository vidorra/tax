/**
 * Vergelijking van de parameters van twee belastingjaren (of een jaar en een variant).
 *
 * Puur: geen I/O. Gebruikt door scripts/tax-diff.ts (CLI) en de parameterviewer (/admin/jaren).
 *
 *  - plat(p)          alle parameterpaden van een jaar met hun waarde (blokmetadata en functies overgeslagen);
 *  - statusVan(p, pad) status van een pad: veldStatus van het blok wint van de blokstatus;
 *  - diff(a, b)       elk pad waarvan de waarde verschilt, met de status in beide jaren.
 */
import type { Status, TaxYearParams } from '../types'
import { BLOK_NAMEN } from '../types'

/** Paden die geen parameter zijn. */
const OVERSLAAN = new Set(['jaar', 'bijgewerkt', 'changelog', 'varianten'])
/** Metadata binnen een blok die niet als parameter telt. */
const BLOK_META = new Set(['bron', 'veldBron', 'toelichting', 'veldStatus', 'status'])

export interface DiffRegel {
  pad: string
  oud: unknown
  nieuw: unknown
  /** Status in het eerste jaar; '' als het pad daar ontbreekt. */
  statusOud: Status | ''
  /** Status in het tweede jaar; '' als het pad daar ontbreekt. */
  statusNieuw: Status | ''
}

/** Alle parameterpaden van een jaar met hun waarde, bijvoorbeeld 'box1.schijven[0].tarief' → 0.3575. */
export function plat(p: TaxYearParams): Map<string, unknown> {
  const uit = new Map<string, unknown>()
  const loop = (pad: string, x: unknown) => {
    if (typeof x === 'function') return
    if (Array.isArray(x)) {
      if (x.length === 0) uit.set(pad, '[]')
      x.forEach((v, i) => loop(`${pad}[${i}]`, v))
      return
    }
    if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) loop(pad ? `${pad}.${k}` : k, v)
      return
    }
    uit.set(pad, x)
  }
  for (const [k, v] of Object.entries(p)) {
    if (OVERSLAAN.has(k)) continue
    if ((BLOK_NAMEN as readonly string[]).includes(k)) {
      const blok = v as Record<string, unknown>
      for (const [bk, bv] of Object.entries(blok)) {
        if (BLOK_META.has(bk)) continue
        if (bk === 'waarde') loop(k, bv)
      }
      continue
    }
    loop(k, v)
  }
  return uit
}

/** Status van een pad: veldStatus van het blok wint van de blokstatus. */
export function statusVan(p: TaxYearParams, pad: string): Status | '' {
  const [blokNaam, veld] = pad.split(/[.[]/)
  if (!(BLOK_NAMEN as readonly string[]).includes(blokNaam)) return p.status
  const blok = p[blokNaam as (typeof BLOK_NAMEN)[number]] as { status: Status; veldStatus?: Record<string, Status | undefined> }
  return (veld && blok.veldStatus?.[veld]) || blok.status
}

/** Alle paden waarvan de waarde in a en b verschilt, alfabetisch op pad. */
export function diff(a: TaxYearParams, b: TaxYearParams): DiffRegel[] {
  const pa = plat(a)
  const pb = plat(b)
  const paden = [...new Set([...pa.keys(), ...pb.keys()])].sort()
  const uit: DiffRegel[] = []
  for (const pad of paden) {
    const oud = pa.get(pad)
    const nieuw = pb.get(pad)
    if (oud === nieuw || (typeof oud === 'number' && typeof nieuw === 'number' && Math.abs(oud - nieuw) < 1e-12)) continue
    uit.push({ pad, oud, nieuw, statusOud: pa.has(pad) ? statusVan(a, pad) : '', statusNieuw: pb.has(pad) ? statusVan(b, pad) : '' })
  }
  return uit
}
