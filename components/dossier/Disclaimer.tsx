import { SITE } from '@/lib/site'
import { cn } from '@/components/ui'

export function Disclaimer({ className }: { className?: string }) {
  return <p className={cn('text-xs leading-relaxed text-gray-500', className)}>{SITE.disclaimer}. Controleer je aangifte altijd zelf of met je adviseur.</p>
}
