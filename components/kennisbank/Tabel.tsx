import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

export interface TabelProps {
  /** Kolomkoppen; de eerste kolom is de rijkop. */
  kop: ReactNode[]
  rijen: ReactNode[][]
  bijschrift?: ReactNode
  /** Vanaf deze kolom rechts uitlijnen (bedragen). Standaard 1. */
  getallenVanaf?: number
  /** Kleine noot onder de tabel. */
  noot?: ReactNode
  className?: string
}

/**
 * Tabel voor de kennisbank. Breder dan het scherm? Dan scrolt alleen de tabel
 * horizontaal, nooit de pagina.
 */
export function Tabel({ kop, rijen, bijschrift, getallenVanaf = 1, noot, className }: TabelProps) {
  return (
    <figure className={className}>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm" tabIndex={0} role="region" aria-label={typeof bijschrift === 'string' ? bijschrift : 'Tabel'}>
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          {bijschrift && <caption className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{bijschrift}</caption>}
          <thead>
            <tr className="bg-gray-50">
              {kop.map((k, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn('whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-gray-500', i >= getallenVanaf ? 'text-right' : 'text-left')}
                >
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rijen.map((rij, r) => (
              <tr key={r} className="border-t border-gray-100">
                {rij.map((cel, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="px-4 py-2.5 text-left font-normal text-gray-800">
                      {cel}
                    </th>
                  ) : (
                    <td key={i} className={cn('px-4 py-2.5 tabular-nums text-gray-800', i >= getallenVanaf ? 'whitespace-nowrap text-right' : 'text-left')}>
                      {cel}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {noot && <figcaption className="mt-2 text-xs leading-relaxed text-gray-500">{noot}</figcaption>}
    </figure>
  )
}
