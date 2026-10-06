import { DOSSIER_STATUS_INFO, type DossierStatus } from '@/lib/dossier/status'
import { cn } from '@/components/ui'

const STIJL: Record<DossierStatus, string> = {
  concept: 'border-gray-200 bg-white text-gray-700',
  gecontroleerd: 'border-primary/30 bg-primary/5 text-primary-dark',
  ingediend: 'border-primary bg-primary text-white',
}

/** Status van het dossierjaar (concept, gecontroleerd, ingediend). */
export function DossierStatusLabel({ status, className }: { status: DossierStatus; className?: string }) {
  return (
    <span title={DOSSIER_STATUS_INFO[status].uitleg} className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium leading-none', STIJL[status], className)}>
      {DOSSIER_STATUS_INFO[status].label}
    </span>
  )
}
