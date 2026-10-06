/**
 * Ronde 2: alleen-lezen regels die uit een ander deel van de invoer volgen, zodat niets dubbel wordt ingevuld.
 * Bijvoorbeeld bij Persoon B onder Loon en uitkeringen: "Van de onderneming van Persoon A · Beloning voor meewerken
 * € 6.000 · Aanpassen bij Ontwerpstudio", of in box 3 bij de schulden het deel van de hypotheek dat geen
 * eigenwoningschuld is.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn, formatEuro } from '@/components/ui'

export interface AfgeleideRegelProps {
  titel: ReactNode
  regels: Array<{ label: ReactNode; bedrag: number }>
  /** Link naar de plek waar je het aanpast (meestal veldHref uit lib/dossier/veld.ts). */
  aanpassen?: { label: string; href: string }
  className?: string
}

export function AfgeleideRegel({ titel, regels, aanpassen, className }: AfgeleideRegelProps) {
  return (
    <div className={cn('rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm', className)}>
      <p className="mb-2 font-medium text-gray-900">{titel}</p>
      <dl className="space-y-1">
        {regels.map((r, i) => (
          <div key={i} className="flex justify-between gap-3">
            <dt className="text-gray-600">{r.label}</dt>
            <dd className="font-medium tabular-nums text-gray-900">{formatEuro(r.bedrag)}</dd>
          </div>
        ))}
      </dl>
      {aanpassen && (
        <Link href={aanpassen.href} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline">
          {aanpassen.label}
        </Link>
      )}
    </div>
  )
}
