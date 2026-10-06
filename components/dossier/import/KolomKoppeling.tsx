'use client'

/**
 * Ronde 2 (A4): kolommen zelf koppelen voor een formaat dat we niet herkennen. Per kolom de kopnaam, een voorbeeld en
 * "Wat staat erin?"; scheidingsteken, decimaal en wat het bestand is (stand of transacties) als chips; per waarde in
 * de kolom Soort een soort. Op mobiel een kaartje per kolom. Onthouden gebeurt in de browser, binnen de grenzen van
 * KOPPELING_WAARDEN (lib/import/generiek.ts); nooit bedragen.
 */
import type { CsvBestand, GebeurtenisSoort, KolomBetekenis, KolomKoppeling as Koppeling } from '@/lib/import/types'
import { KOLOM_BETEKENISSEN, WAARDE_SOORTEN, koppelingFout, onthoudbareWaarden, uniekeWaarden } from '@/lib/import/generiek'
import { Alert, ChipGroup, Select, Toggle } from '@/components/ui'

/** Zoveel waarden uit de kolom Soort tonen we om te koppelen. */
const MAX_WAARDEN = 40

export interface KolomKoppelingProps {
  bestand: CsvBestand
  koppeling: Koppeling
  jaar: number
  onthouden: boolean
  onChange: (k: Koppeling) => void
  onScheiding: (s: CsvBestand['scheiding']) => void
  onOnthouden: (aan: boolean) => void
}

function voorbeeld(b: CsvBestand, kolom: number): string {
  const v = b.regels.slice(0, 5).map((r) => (r[kolom] ?? '').trim()).find((x) => x !== '')
  return v ? (v.length > 40 ? `${v.slice(0, 40)}…` : v) : ''
}

export function KolomKoppeling({ bestand, koppeling: k, jaar, onthouden, onChange, onScheiding, onOnthouden }: KolomKoppelingProps) {
  const zet = (kolom: number, b: KolomBetekenis) => {
    const kolommen = { ...k.kolommen, [kolom]: b }
    // Elke betekenis één keer: een andere kolom met dezelfde betekenis gaat naar Niet gebruiken.
    if (b !== 'negeren') for (const [i, x] of Object.entries(kolommen)) if (Number(i) !== kolom && x === b) kolommen[Number(i)] = 'negeren'
    const uit: Koppeling = { ...k, kolommen }
    if (b === 'soort') {
      const waarden: Record<string, GebeurtenisSoort> = {}
      for (const w of uniekeWaarden(bestand, kolom).slice(0, 200)) waarden[w] = k.waarden?.[w] ?? 'negeren'
      uit.waarden = waarden
    }
    onChange(uit)
  }
  const soortKolom = Number(Object.entries(k.kolommen).find(([, b]) => b === 'soort')?.[0] ?? -1)
  const waarden = soortKolom >= 0 ? uniekeWaarden(bestand, soortKolom) : []
  const fout = koppelingFout(k)
  const teVeel = waarden.length > 0 && !onthoudbareWaarden(k.waarden)

  return (
    <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-3 sm:p-4">
      <p className="text-sm text-amber-900">
        <span className="sr-only">Let op: </span>Dit formaat herkennen we niet. Koppel de kolommen zelf.
      </p>

      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Kolom
            </th>
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Voorbeeld
            </th>
            <th scope="col" className="py-1.5 font-medium">
              Wat staat erin?
            </th>
          </tr>
        </thead>
        <tbody>
          {bestand.kop.map((naam, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-gray-800">
                {naam || `Kolom ${i + 1}`}
              </th>
              <td className="max-w-[16rem] truncate py-1.5 pr-3 text-gray-600">{voorbeeld(bestand, i)}</td>
              <td className="py-1.5">
                <Select label={`Wat staat er in ${naam || `kolom ${i + 1}`}?`} labelVerborgen value={k.kolommen[i] ?? 'negeren'} onChange={(b) => zet(i, b)} options={KOLOM_BETEKENISSEN} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-3 sm:hidden">
        {bestand.kop.map((naam, i) => (
          <li key={i} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-sm font-medium text-gray-900">{naam || `Kolom ${i + 1}`}</p>
            {voorbeeld(bestand, i) && <p className="mt-0.5 break-words text-xs text-gray-500">Bijvoorbeeld: {voorbeeld(bestand, i)}</p>}
            <Select label="Wat staat erin?" value={k.kolommen[i] ?? 'negeren'} onChange={(b) => zet(i, b)} options={KOLOM_BETEKENISSEN} wrapperClassName="mt-2" />
          </li>
        ))}
      </ul>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChipGroup<CsvBestand['scheiding']>
          label="Scheidingsteken"
          value={bestand.scheiding}
          onChange={onScheiding}
          options={[
            { value: ';', label: ';', ariaLabel: 'Puntkomma' },
            { value: ',', label: ',', ariaLabel: 'Komma' },
            { value: '\t', label: 'Tab' },
          ]}
        />
        <ChipGroup<CsvBestand['decimaal']>
          label="Bedragen"
          value={k.decimaal}
          onChange={(decimaal) => onChange({ ...k, decimaal })}
          options={[
            { value: ',', label: '1.250,00' },
            { value: '.', label: '1,250.00' },
          ]}
        />
      </div>
      <ChipGroup<Koppeling['inhoud']>
        label="Wat staat er in het bestand?"
        value={k.inhoud}
        onChange={(inhoud) => onChange({ ...k, inhoud })}
        options={[
          { value: 'stand-begin', label: `Waarde op 1 januari ${jaar}` },
          { value: 'stand-eind', label: `Waarde op 1 januari ${jaar + 1}` },
          { value: 'transacties', label: `Transacties over ${jaar}` },
        ]}
      />

      {k.inhoud === 'transacties' && waarden.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-900">Wat betekent elke soort?</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {waarden.slice(0, MAX_WAARDEN).map((w) => (
              <li key={w}>
                <Select
                  label={w.length > 60 ? `${w.slice(0, 60)}…` : w}
                  value={k.waarden?.[w] ?? 'negeren'}
                  onChange={(s) => onChange({ ...k, waarden: { ...k.waarden, [w]: s } })}
                  options={WAARDE_SOORTEN}
                />
              </li>
            ))}
          </ul>
          {waarden.length > MAX_WAARDEN && <p className="mt-2 text-xs text-gray-500">Er zijn nog {waarden.length - MAX_WAARDEN} andere waarden; die tellen niet mee. Kies als soort liever een kolom met minder verschillende waarden.</p>}
        </div>
      )}
      {k.inhoud === 'transacties' && soortKolom < 0 && (
        <p className="text-xs text-gray-600">Zonder kolom Soort telt een positief bedrag als storting en een negatief bedrag als opname. Dividend en rente tellen dan ook als storting.</p>
      )}

      {fout && <Alert variant="let-op">{fout}</Alert>}

      <Toggle
        label="Deze koppeling onthouden voor volgende bestanden in dit formaat"
        description={
          teVeel
            ? 'We onthouden alleen welke kolom wat is, niet de waarden uit de kolom Soort: daar staan te veel verschillende of te lange waarden in. Bedragen onthouden we nooit.'
            : 'Alleen in deze browser: welke kolom wat is en wat de soorten betekenen. Geen bedragen.'
        }
        checked={onthouden}
        onChange={onOnthouden}
      />
    </div>
  )
}
