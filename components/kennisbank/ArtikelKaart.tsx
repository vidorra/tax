import { Clock } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from '../ui/StatusBadge'
import { artikelHref } from './artikelen'
import type { KennisbankArtikel } from './artikelen'

/** Kaart voor een artikel in de index en bij gerelateerde artikelen. */
export function ArtikelKaart({ artikel, kopNiveau = 'h2' }: { artikel: KennisbankArtikel; kopNiveau?: 'h2' | 'h3' }) {
  const Kop = kopNiveau
  return (
    <article className="relative flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors focus-within:border-primary hover:border-primary/60">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-primary">{artikel.categorie}</span>
        {artikel.status && <StatusBadge status={artikel.status} klein tooltip={false} />}
      </div>
      <Kop className="text-base font-medium leading-snug text-gray-900">
        <Link href={artikelHref(artikel.slug)} className="after:absolute after:inset-0 after:rounded-2xl hover:text-primary focus-visible:outline-none">
          {artikel.kortTitel}
        </Link>
      </Kop>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">{artikel.beschrijving}</p>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
        <Clock aria-hidden="true" className="h-3.5 w-3.5" />
        {artikel.leestijdMinuten} minuten lezen
      </p>
    </article>
  )
}
