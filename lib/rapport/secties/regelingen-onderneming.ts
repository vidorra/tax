/**
 * Ronde 2 (A6): regels voor "Niet meegenomen" in de verantwoording, per regeling van de onderneming die in dit jaar
 * speelt maar (nog) niet apart in het rapport staat. Alleen als de regeling speelt (rommelbudget).
 */
import type { PersoonResultaat } from '@/lib/tax/types'
import { euro } from '../notatie'

export function nietMeegenomenRegelingenOnderneming(p: PersoonResultaat): string[] {
  const uit: string[] = []
  const hir = p.ondernemingen.flatMap((o) => o.herinvesteringsreserves ?? [])
  const eg = p.ondernemingen.flatMap((o) => o.egalisatiereserves ?? [])
  const hirStand = hir.reduce((s, r) => s + r.standEind, 0)
  const egStand = eg.reduce((s, r) => s + r.standEind, 0)
  if (hir.length > 0 && eg.length > 0) {
    uit.push(`De herinvesteringsreserve (stand ${euro(hirStand)}) en kostenegalisatiereserve (stand ${euro(egStand)}) staan niet uitgesplitst in dit rapport.`)
  } else if (hir.length > 0) {
    uit.push(`De herinvesteringsreserve (stand ${euro(hirStand)}) staat niet uitgesplitst in dit rapport.`)
  } else if (eg.length > 0) {
    uit.push(`De kostenegalisatiereserve (stand ${euro(egStand)}) staat niet uitgesplitst in dit rapport.`)
  }
  const stakingswinst = p.ondernemingen.reduce((s, o) => s + (o.staking?.totaal ?? 0), 0)
  if (p.ondernemingen.some((o) => o.staking)) {
    uit.push(
      p.inkomensvoorziening.stakingslijfrente
        ? `De stakingswinst (${euro(stakingswinst)}) en de stakingslijfrente staan niet uitgesplitst in dit rapport.`
        : `De stakingswinst (${euro(stakingswinst)}) staat niet uitgesplitst in dit rapport.`,
    )
  }
  const btw = p.ondernemingen.reduce((s, o) => s + (o.auto?.btwDetail ? o.auto.btwCorrectie : 0), 0)
  if (btw > 0) uit.push(`De btw-correctie privégebruik van de auto (${euro(btw)}) staat niet apart in dit rapport.`)
  return uit
}
