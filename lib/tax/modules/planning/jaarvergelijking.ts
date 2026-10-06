/**
 * Twee uitkomsten naast elkaar (twee jaren, twee varianten of twee scenario's).
 * Uitlegregels worden per persoon en op huishoudniveau gekoppeld op hun id;
 * daarnaast een vaste set kerngetallen per persoon en de huishoudtotalen.
 */
import type { HuishoudenResultaat, PersoonResultaat, Uitlegregel } from '../../types'

export interface VergelijkRegel {
  id: string
  label: string
  a: number
  b: number
  verschil: number
}

const KERNGETALLEN: Array<{ id: string; label: string; waarde: (p: PersoonResultaat) => number }> = [
  { id: 'arbeidsinkomen', label: 'Arbeidsinkomen', waarde: (p) => p.arbeidsinkomen },
  { id: 'box1-inkomen', label: 'Belastbaar inkomen box 1', waarde: (p) => p.box1.inkomen },
  { id: 'verzamelinkomen', label: 'Verzamelinkomen', waarde: (p) => p.verzamelinkomen },
  { id: 'heffingskortingen', label: 'Verrekende heffingskortingen', waarde: (p) => p.heffingskortingen.verzilverd },
  { id: 'verschuldigd-ib', label: 'Verschuldigde inkomstenbelasting', waarde: (p) => p.verschuldigdIB },
  { id: 'zvw', label: 'Zvw-bijdrage', waarde: (p) => p.zvw.bijdrage },
]

const TOTALEN: Array<{ id: keyof HuishoudenResultaat['totaal']; label: string }> = [
  { id: 'verschuldigdIB', label: 'Huishouden: verschuldigde inkomstenbelasting' },
  { id: 'verschuldigdZvw', label: 'Huishouden: verschuldigde Zvw' },
  { id: 'teBetalenIB', label: 'Huishouden: te betalen inkomstenbelasting' },
  { id: 'teBetalenZvw', label: 'Huishouden: te betalen Zvw' },
  { id: 'toeslagen', label: 'Huishouden: toeslagen en kinderbijslag' },
]

/** Uitlegregels op id; dubbele ids krijgen een volgnummer zodat niets wegvalt. */
function opId(regels: Uitlegregel[], prefix: string): Map<string, Uitlegregel> {
  const uit = new Map<string, Uitlegregel>()
  for (const r of regels) {
    let id = `${prefix}${r.id}`
    let n = 2
    while (uit.has(id)) id = `${prefix}${r.id}#${n++}`
    uit.set(id, r)
  }
  return uit
}

function koppel(a: Map<string, Uitlegregel>, b: Map<string, Uitlegregel>, labelPrefix: string): VergelijkRegel[] {
  const ids = [...a.keys(), ...[...b.keys()].filter((k) => !a.has(k))]
  return ids.map((id) => {
    const ra = a.get(id)
    const rb = b.get(id)
    const va = ra?.bedrag ?? 0
    const vb = rb?.bedrag ?? 0
    return { id, label: `${labelPrefix}${(rb ?? ra)!.label}`, a: va, b: vb, verschil: vb - va }
  })
}

export function vergelijkJaren(a: HuishoudenResultaat, b: HuishoudenResultaat): VergelijkRegel[] {
  const uit: VergelijkRegel[] = []
  const persoonIds = [...new Set([...a.personen.map((p) => p.id), ...b.personen.map((p) => p.id)])]

  for (const id of persoonIds) {
    const pa = a.personen.find((p) => p.id === id)
    const pb = b.personen.find((p) => p.id === id)
    for (const k of KERNGETALLEN) {
      const va = pa ? k.waarde(pa) : 0
      const vb = pb ? k.waarde(pb) : 0
      uit.push({ id: `${id}.kern.${k.id}`, label: `Persoon ${id}: ${k.label}`, a: va, b: vb, verschil: vb - va })
    }
    uit.push(...koppel(opId(pa?.uitleg ?? [], `${id}.`), opId(pb?.uitleg ?? [], `${id}.`), `Persoon ${id}: `))
  }

  uit.push(...koppel(opId(a.uitleg, 'huishouden.'), opId(b.uitleg, 'huishouden.'), 'Huishouden: '))
  for (const t of TOTALEN) {
    const va = (a.totaal[t.id] as number | null) ?? 0
    const vb = (b.totaal[t.id] as number | null) ?? 0
    uit.push({ id: `totaal.${t.id}`, label: t.label, a: va, b: vb, verschil: vb - va })
  }
  return uit
}
