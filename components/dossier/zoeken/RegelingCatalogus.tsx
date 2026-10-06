'use client'

/**
 * Ronde 2 (A3): "Alle regelingen bekijken" onder het zoekveld (ux-ronde2.md 8.7): de regelingen gegroepeerd per plaats
 * (Onderneming, Eigen woning, Vermogen, Box 2, Persoon), per regeling één zin en "Ga erheen". Ga erheen springt naar het
 * veld als de regeling al actief is, en opent anders de kiezer met de optie (er wordt niets ongevraagd toegevoegd).
 */
import { useEffect, useRef } from 'react'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { RegelingItem } from '@/lib/dossier/veldregister/types'
import { catalogus, type CatalogusRegeling } from '@/lib/dossier/zoeken'
import { Button } from '@/components/ui'

export interface RegelingCatalogusProps {
  id: string
  regelingen: readonly RegelingItem[]
  invoer: HuishoudenInvoer
  onGa: (r: CatalogusRegeling) => void
  onSluit: () => void
}

export function RegelingCatalogus({ id, regelingen, invoer, onGa, onSluit }: RegelingCatalogusProps) {
  const kop = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    kop.current?.focus()
  }, [])
  const groepen = catalogus(regelingen, invoer)
  return (
    <div id={id} className="mt-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={kop} tabIndex={-1} className="text-base font-medium text-gray-900 focus-visible:outline-none">
          Alle regelingen
        </h2>
        <Button variant="kaal" grootte="sm" onClick={onSluit}>
          Sluiten
        </Button>
      </div>
      {groepen.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">Er zijn nog geen regelingen om te bekijken.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {groepen.map((g) => (
            <section key={g.plaats} aria-label={g.plaats}>
              <h3 className="mb-1 text-sm font-medium text-gray-900">{g.plaats}</h3>
              <ul className="divide-y divide-gray-100">
                {g.regelingen.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{r.naam}</p>
                      <p className="text-xs text-gray-600">{r.uitleg}</p>
                      {r.doel?.waar && <p className="text-xs text-gray-500">{r.doel.soort === 'veld' ? r.doel.waar : `${r.doel.waar} · nog niet toegevoegd`}</p>}
                    </div>
                    {r.doel ? (
                      <Button variant="secundair" grootte="sm" className="flex-shrink-0" onClick={() => onGa(r)}>
                        Ga erheen<span className="sr-only">: {r.naam}</span>
                      </Button>
                    ) : (
                      <p className="text-xs text-gray-500 sm:max-w-[12rem] sm:text-right">Past niet bij je invoer van dit jaar.</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
