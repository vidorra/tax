/**
 * Ronde 2 (A3): kleur, icoon en verborgen voorvoegsel per niveau, zodat kleur nooit het enige signaal is
 * (ux-ronde2.md 9). Rood alleen voor fouten.
 */
import { CircleX, Info, TriangleAlert } from 'lucide-react'
import type { ControleErnst } from '@/lib/controles/types'

export const NIVEAU: Record<ControleErnst, { Icoon: typeof Info; icoon: string; voorvoegsel: string; enkel: string; meer: string; kop: string }> = {
  fout: { Icoon: CircleX, icoon: 'text-red-700', voorvoegsel: 'Fout: ', enkel: 'fout', meer: 'fouten', kop: 'Fouten' },
  'let-op': { Icoon: TriangleAlert, icoon: 'text-amber-600', voorvoegsel: 'Let op: ', enkel: 'let op', meer: 'let op', kop: 'Let op' },
  info: { Icoon: Info, icoon: 'text-slate-500', voorvoegsel: 'Info: ', enkel: 'info', meer: 'info', kop: 'Info' },
}

export function NiveauIcoon({ ernst, className }: { ernst: ControleErnst; className?: string }) {
  const { Icoon, icoon } = NIVEAU[ernst]
  return <Icoon aria-hidden="true" className={`${className ?? 'h-4 w-4'} flex-shrink-0 ${icoon}`} />
}

/** "1 fout", "2 fouten", "3 let op". */
export function aantalTekst(ernst: ControleErnst, n: number): string {
  return `${n} ${n === 1 ? NIVEAU[ernst].enkel : NIVEAU[ernst].meer}`
}

/** "1 controle", "3 controles". */
export const controlesTekst = (n: number) => `${n} ${n === 1 ? 'controle' : 'controles'}`
