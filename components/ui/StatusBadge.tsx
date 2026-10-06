import { CircleCheck, CircleDashed, Clock, FileText, Scale } from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'
import type { Status } from '@/lib/tax/types'
import { cn } from './cn'

export interface StatusInfo {
  label: string
  /** Korte uitleg voor tooltip en schermlezer. */
  uitleg: string
}

export const STATUS_INFO: Record<Status, StatusInfo> = {
  definitief: { label: 'Definitief', uitleg: 'Vastgesteld in wet of regeling.' },
  voorlopig: { label: 'Voorlopig', uitleg: 'Bekend, maar nog niet definitief vastgesteld. Kan nog wijzigen.' },
  voorstel: { label: 'Voorstel', uitleg: 'Staat in een wetsvoorstel dat nog in behandeling is. Kan nog veranderen.' },
  geschat: { label: 'Geschat', uitleg: 'Nog niet gepubliceerd of nog niet bij de officiële bron nagekeken. Door ons geschat, bijvoorbeeld met de indexatieregels.' },
  rechtspraak: { label: 'Rechtspraak', uitleg: 'Regel die berust op uitspraken van de rechter.' },
}

type Icoon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

const STIJL: Record<Status, { klasse: string; icoon: Icoon }> = {
  definitief: { klasse: 'border-gray-200 bg-gray-100 text-gray-700', icoon: CircleCheck },
  voorlopig: { klasse: 'border-dashed border-gray-400 bg-white text-gray-700', icoon: Clock },
  voorstel: { klasse: 'border-stone-300 bg-stone-100 text-stone-800', icoon: FileText },
  geschat: { klasse: 'border-dotted border-gray-400 bg-white italic text-gray-600', icoon: CircleDashed },
  rechtspraak: { klasse: 'border-slate-300 bg-slate-100 text-slate-700', icoon: Scale },
}

export interface StatusBadgeProps {
  status: Status
  /** Toon een tooltip met uitleg bij hover en focus (niet gebruiken binnen een knop). */
  tooltip?: boolean
  /** Kant waar de tooltip uitlijnt; 'rechts' bij badges aan de rechterrand. */
  tooltipKant?: 'links' | 'midden' | 'rechts'
  /** Lichte variant voor gebruik op een gekleurde (primaire) achtergrond. */
  opDonker?: boolean
  klein?: boolean
  /** Eigen label in plaats van de standaardnaam. */
  label?: string
  /** Eigen uitleg in plaats van de standaarduitleg van de status (bijvoorbeeld bij een geschat rentepercentage). */
  uitleg?: string
  className?: string
}

const KANT = {
  links: 'left-0',
  midden: 'left-1/2 -translate-x-1/2',
  rechts: 'right-0',
} as const

/** Label voor de zekerheid van een cijfer: definitief, voorlopig, voorstel, geschat of rechtspraak. */
export function StatusBadge({ status, tooltip = true, tooltipKant = 'midden', opDonker = false, klein = false, label, uitleg, className }: StatusBadgeProps) {
  const info = uitleg ? { ...STATUS_INFO[status], uitleg } : STATUS_INFO[status]
  const { klasse, icoon: Icoon } = STIJL[status]
  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium leading-none',
        klein ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        opDonker ? 'border-white/50 bg-white/15 text-white' : klasse,
        className,
      )}
    >
      <Icoon aria-hidden="true" className={klein ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {label ?? info.label}
    </span>
  )
  if (!tooltip) return badge
  return (
    <span className="group relative inline-flex align-middle" tabIndex={0}>
      {badge}
      <span className="sr-only">: {info.uitleg}</span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-full z-50 mb-2 hidden w-56 rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal not-italic leading-snug text-white shadow-lg group-hover:block group-focus-visible:block',
          KANT[tooltipKant],
        )}
      >
        <strong className="font-medium">{info.label}.</strong> {info.uitleg}
      </span>
    </span>
  )
}
