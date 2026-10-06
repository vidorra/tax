'use client'

/**
 * Ronde 2 (A4): "Dit verandert er" als lijst Gegeven · Nu · Wordt, zoals de doorrol van saldi. Alleen wat verandert;
 * bronbelasting per land als eigen regel. Op mobiel per gegeven twee regels in plaats van een tabel.
 */
import type { ImportWijziging } from '@/lib/import/types'
import { formatEuro } from '@/components/ui'

/** Bedrag met centen als die er zijn: € 107,91, € 1.000. */
export function bedrag(n: number): string {
  return formatEuro(n, { decimalen: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 })
}

function waarde(w: number | string | null): string {
  if (w === null) return '–'
  return typeof w === 'number' ? bedrag(w) : w
}

export function WijzigingenLijst({ wijzigingen, kop = 'Dit verandert er' }: { wijzigingen: ImportWijziging[]; kop?: string }) {
  if (wijzigingen.length === 0) return <p className="text-sm text-gray-600">Er verandert niets aan deze bezitting.</p>
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-900">{kop}</p>
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Gegeven
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Nu
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Wordt
            </th>
          </tr>
        </thead>
        <tbody>
          {wijzigingen.map((w) => (
            <tr key={w.label} className="border-b border-gray-100 align-top last:border-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-gray-700">
                {w.label}
              </th>
              <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{waarde(w.nu)}</td>
              <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                {waarde(w.wordt)}
                {w.toelichting && <span className="block text-xs font-normal text-gray-500">{w.toelichting}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-2 text-sm sm:hidden">
        {wijzigingen.map((w) => (
          <li key={w.label}>
            <span className="block text-gray-700">{w.label}</span>
            <span className="block tabular-nums text-gray-600">
              Nu {waarde(w.nu)} · Wordt <span className="font-medium text-gray-900">{waarde(w.wordt)}</span>
            </span>
            {w.toelichting && <span className="block text-xs text-gray-500">{w.toelichting}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
