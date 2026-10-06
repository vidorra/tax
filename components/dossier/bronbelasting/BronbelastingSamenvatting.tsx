'use client'

/**
 * Ronde 2 (A5): samenvatting van de buitenlandse bronbelasting onderaan Vermogen, alleen als er bronbelasting is.
 * Ingehouden en verrekenbaar per regel; verrekend en doorgeschoven per persoon uit de live uitkomst (die kan ontbreken:
 * dan staat er een streepje).
 */
import type { HuishoudenInvoer, HuishoudenResultaat, TaxYearParams } from '@/lib/tax/types'
import { bronbelastingRegelsVan } from '@/lib/dossier/terugvragen'
import { StatLijst, StatRow } from '@/components/ui'
import { euroCent } from './notatie'

export function BronbelastingSamenvatting({ invoer, resultaat, params }: { invoer: HuishoudenInvoer; resultaat: HuishoudenResultaat | null | undefined; params: TaxYearParams | null }) {
  const regels = bronbelastingRegelsVan(invoer, resultaat, params).filter((r) => r.ingehouden > 0)
  const voortgewenteld = invoer.personen.reduce((s, p) => s + Math.max(0, p.voortgewenteldeBronbelasting ?? 0), 0)
  if (regels.length === 0 && voortgewenteld === 0) return null
  const som = (f: (r: (typeof regels)[number]) => number) => regels.reduce((s, r) => s + f(r), 0)
  const personen = resultaat?.personen ?? null
  const verrekend = personen ? personen.reduce((s, p) => s + (p.bronbelasting?.verrekend ?? p.box3Bronbelasting ?? 0), 0) : null
  const door = personen ? personen.reduce((s, p) => s + (p.bronbelasting?.naarVolgendJaar ?? 0), 0) : null
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-gray-900">Buitenlandse bronbelasting</h3>
      <StatLijst aria-label="Buitenlandse bronbelasting">
        <StatRow label="Ingehouden" bedrag={euroCent(som((r) => r.ingehouden))} />
        <StatRow label="Verrekenbaar volgens de verdragen" bedrag={euroCent(som((r) => r.verrekenbaar))} />
        {voortgewenteld > 0 && <StatRow label="Uit eerdere jaren" bedrag={euroCent(voortgewenteld)} />}
        <StatRow label={`Verrekend in ${invoer.jaar}`} bedrag={verrekend === null ? null : euroCent(verrekend)} />
        <StatRow label="Schuift door naar volgende jaren" bedrag={door === null ? null : euroCent(door)} />
        <StatRow label="Terug te vragen in het buitenland" bedrag={euroCent(som((r) => r.terugTeVragen))} />
      </StatLijst>
    </div>
  )
}

/**
 * Per persoon in de uitkomst (markering resultaat-per-persoon-A5): "Schuift door naar {jaar+1}: € …", alleen als er
 * bronbelasting doorschuift. Leest `PersoonResultaat.bronbelasting` defensief.
 */
export function BronbelastingSchuiftDoor({ resultaat, jaar, naam }: { resultaat: HuishoudenResultaat; jaar: number; naam: (id: string) => string }) {
  const door = resultaat.personen.filter((p) => (p.bronbelasting?.naarVolgendJaar ?? 0) > 0)
  if (door.length === 0) return null
  const meer = resultaat.personen.length > 1
  return (
    <ul className="mt-2 space-y-1 text-xs text-gray-600">
      {door.map((p) => (
        <li key={p.id}>
          Bronbelasting{meer ? ` van ${naam(p.id)}` : ''} die doorschuift naar {jaar + 1}: {euroCent(p.bronbelasting?.naarVolgendJaar ?? 0)}
        </li>
      ))}
    </ul>
  )
}
