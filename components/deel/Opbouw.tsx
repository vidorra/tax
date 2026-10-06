import { BookOpen, Calculator } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/components/ui/cn'
import { SITE } from '@/lib/site'

/** Disclaimer die op elke deelcalculator zichtbaar is. */
export function Disclaimer({ className }: { className?: string }) {
  return <p className={cn('text-xs leading-relaxed text-gray-500', className)}>{SITE.disclaimer}.</p>
}

/**
 * Twee kolommen: invoer en details links, het resultaatpaneel rechts (sticky op desktop).
 * Op mobiel: invoer, resultaat, details onder elkaar.
 */
export function CalculatorGrid({ invoer, resultaat, details }: { invoer: ReactNode; resultaat: ReactNode; details?: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">{invoer}</div>
      <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-stretch">{resultaat}</div>
      {details && <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">{details}</div>}
    </div>
  )
}

export interface DeelLink {
  href: string
  label: string
}

export interface DeelPaginaProps {
  kicker?: string
  titel: string
  intro: ReactNode
  badge?: ReactNode
  /** Kennisbankartikelen die bij deze berekening horen. */
  lezen: DeelLink[]
  children: ReactNode
  /** Extra uitleg onder de calculator (server-rendered, goed voor zoekmachines). */
  naschrift?: ReactNode
}

/** Paginaopbouw van een deelcalculator: kop, calculator, verder lezen, disclaimer. */
export function DeelPagina({ kicker = 'Rekenhulp', titel, intro, badge, lezen, children, naschrift }: DeelPaginaProps) {
  return (
    <Container breedte="breed">
      <PageHeader kicker={kicker} titel={titel} intro={intro} badge={badge} />
      {children}
      {naschrift && <div className="kb-prose mt-10 max-w-3xl">{naschrift}</div>}
      <section aria-labelledby="verder-titel" className="mt-10 bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <h2 id="verder-titel" className="text-base font-medium text-gray-900">
          Verder lezen en rekenen
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {lezen.map((l) => (
            <li key={l.href} className="flex items-start gap-2">
              <BookOpen aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
              <Link href={l.href} className="text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <ButtonLink href="/" variant="secundair">
            <Calculator aria-hidden="true" className="h-4 w-4" />
            Naar de volledige calculator
          </ButtonLink>
        </div>
        <Disclaimer className="mt-4" />
      </section>
    </Container>
  )
}

/** Compacte tabel die binnen haar kaart horizontaal scrolt in plaats van de pagina. */
export function DataTabel({
  bijschrift,
  kop,
  rijen,
  rijKlasse,
  className,
}: {
  bijschrift: string
  kop: ReactNode[]
  rijen: ReactNode[][]
  rijKlasse?: (index: number) => string | undefined
  className?: string
}) {
  return (
    <div className={cn('-mx-1 overflow-x-auto px-1', className)}>
      <table className="w-full min-w-[18rem] border-collapse text-sm">
        <caption className="sr-only">{bijschrift}</caption>
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
            {kop.map((k, i) => (
              <th key={i} scope="col" className={cn('py-2 pr-3 font-medium last:pr-0', i > 0 && 'text-right')}>
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rijen.map((r, ri) => (
            <tr key={ri} className={cn('border-b border-gray-100 last:border-0', rijKlasse?.(ri))}>
              {r.map((c, ci) =>
                ci === 0 ? (
                  <th key={ci} scope="row" className="py-2 pr-3 text-left font-normal text-gray-800">
                    {c}
                  </th>
                ) : (
                  <td key={ci} className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-gray-800 last:pr-0">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
