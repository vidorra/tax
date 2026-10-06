'use client'

/**
 * Kleine invoerbouwstenen voor het dossier, bovenop components/ui. Lege velden worden
 * `undefined`, zodat optionele velden uit de invoer verdwijnen in plaats van 0 te worden.
 */
import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { Button, Field, INVOER_KLASSE, MoneyInput, NumberInput, cn, veldIds } from '@/components/ui'
import { invoerRand } from '@/components/ui/Field'
import { useVeldMelding } from './controles/veld-context'

/**
 * Ronde 2: met `veld` (een VeldId, lib/dossier/veld.ts) krijgt de wrapper `data-veld`, zodat controles, de invulhulp en
 * het zoekveld naar dit veld kunnen springen. Zonder `veld` verandert er niets.
 *
 * Ronde 2 (A3): `fout` en `melding` naast `veld`. Een fout (rood, via de bestaande `error`) staat bij het veld zodra het
 * jaar streng is of de gebruiker het veld heeft verlaten (besluit na de nacontrole: gewone veldvalidatie, ook in een
 * rustig jaar); een let op (`melding`, amber onder het veld) alleen in een streng jaar. Zonder eigen `fout` of `melding`
 * komen ze uit de open controles van de editor (components/dossier/controles/veld-context.tsx).
 */
export function MetVeld({ veld, children, onVerlaten }: { veld?: string; children: ReactNode; onVerlaten?: () => void }) {
  if (!veld) return <>{children}</>
  return (
    <div data-veld={veld} className="scroll-mt-24 rounded-xl" onBlur={onVerlaten}>
      {children}
    </div>
  )
}

/** Ronde 2 (A3): een veld-wrapper met de fout en let op uit de controles, voor invoer die geen Tekst, Datum, Bedrag of Getal is. */
export function VeldVak({ veld, children }: { veld?: string; children: (m: { fout?: string; melding?: ReactNode }) => ReactNode }) {
  const m = useVeldMelding(veld)
  return (
    <MetVeld veld={veld} onVerlaten={m.opVerlaten}>
      {children({ fout: m.fout, melding: meldingTekst(m.melding) })}
    </MetVeld>
  )
}

/** De let op als regel onder het veld (in de hint, zodat aria-describedby hem meeneemt). */
function meldingTekst(melding: string | undefined): ReactNode {
  if (!melding) return undefined
  return (
    <span className="mt-1 block font-medium text-amber-900">
      <span className="sr-only">Let op: </span>
      {melding}
    </span>
  )
}

function metMelding(hint: ReactNode, melding: string | undefined): ReactNode {
  if (!melding) return hint
  return (
    <>
      {hint}
      {meldingTekst(melding)}
    </>
  )
}

interface VeldMeldingProps {
  veld?: string
  /** Ronde 2 (A3): eigen fout bij dit veld (rood), zichtbaar na verlaten of in een streng jaar. */
  fout?: string
  /** Ronde 2 (A3): eigen let op bij dit veld (amber), zichtbaar in een streng jaar. */
  melding?: string
}

export function Rij({ children, kolommen = 2, className }: { children: ReactNode; kolommen?: 2 | 3; className?: string }) {
  return <div className={cn('grid gap-4', kolommen === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2', className)}>{children}</div>
}

export function Tekst({
  label,
  value,
  onChange,
  placeholder,
  hint,
  verplicht,
  veld,
  fout,
  melding,
}: { label: ReactNode; value: string | undefined; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode; verplicht?: boolean } & VeldMeldingProps) {
  const ids = veldIds(`tekst-${useId().replace(/:/g, '')}`)
  const m = useVeldMelding(veld, { fout, melding })
  const uitleg = metMelding(hint, m.melding)
  return (
    <MetVeld veld={veld} onVerlaten={m.opVerlaten}>
      <Field ids={ids} label={label} hint={uitleg} error={m.fout} verplicht={verplicht}>
        <input
          id={ids.invoer}
          type="text"
          value={value ?? ''}
          placeholder={placeholder}
          maxLength={200}
          aria-invalid={m.fout ? true : undefined}
          aria-describedby={[uitleg ? ids.hint : null, m.fout ? ids.fout : null].filter(Boolean).join(' ') || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(INVOER_KLASSE, invoerRand(Boolean(m.fout)), 'px-3.5')}
        />
      </Field>
    </MetVeld>
  )
}

export function Datum({
  label,
  value,
  onChange,
  hint,
  verplicht,
  veld,
  fout,
  melding,
}: { label: ReactNode; value: string | undefined; onChange: (v: string | undefined) => void; hint?: ReactNode; verplicht?: boolean } & VeldMeldingProps) {
  const ids = veldIds(`datum-${useId().replace(/:/g, '')}`)
  const m = useVeldMelding(veld, { fout, melding })
  const uitleg = metMelding(hint, m.melding)
  return (
    <MetVeld veld={veld} onVerlaten={m.opVerlaten}>
      <Field ids={ids} label={label} hint={uitleg} error={m.fout} verplicht={verplicht}>
        <input
          id={ids.invoer}
          type="date"
          value={value ?? ''}
          aria-invalid={m.fout ? true : undefined}
          aria-describedby={[uitleg ? ids.hint : null, m.fout ? ids.fout : null].filter(Boolean).join(' ') || undefined}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={cn(INVOER_KLASSE, invoerRand(Boolean(m.fout)), 'min-h-[44px] px-3.5')}
        />
      </Field>
    </MetVeld>
  )
}

export function Bedrag({
  label,
  value,
  onChange,
  hint,
  negatief,
  decimalen,
  veld,
  fout,
  melding,
}: {
  label: ReactNode
  value: number | undefined
  onChange: (v: number | undefined) => void
  hint?: ReactNode
  negatief?: boolean
  decimalen?: number
} & VeldMeldingProps) {
  const m = useVeldMelding(veld, { fout, melding })
  return (
    <MetVeld veld={veld} onVerlaten={m.opVerlaten}>
      <MoneyInput label={label} value={value ?? null} onChange={(v) => onChange(v ?? undefined)} hint={metMelding(hint, m.melding)} error={m.fout} negatief={negatief} decimalen={decimalen} />
    </MetVeld>
  )
}

export function Getal({
  label,
  value,
  onChange,
  hint,
  suffix,
  decimalen,
  min = 0,
  max,
  veld,
  fout,
  melding,
}: {
  label: ReactNode
  value: number | undefined
  onChange: (v: number | undefined) => void
  hint?: ReactNode
  suffix?: ReactNode
  decimalen?: number
  min?: number
  max?: number
} & VeldMeldingProps) {
  const m = useVeldMelding(veld, { fout, melding })
  return (
    <MetVeld veld={veld} onVerlaten={m.opVerlaten}>
      <NumberInput label={label} value={value ?? null} onChange={(v) => onChange(v ?? undefined)} hint={metMelding(hint, m.melding)} error={m.fout} suffix={suffix} decimalen={decimalen} min={min} max={max} />
    </MetVeld>
  )
}

/** Herhaalbare lijst met een kaartje per item, verwijderknop en een knop om toe te voegen. */
export function Lijst<T>({
  items,
  onChange,
  nieuw,
  titel,
  toevoegLabel,
  leegTekst,
  toevoegVeld,
  children,
}: {
  items: T[] | undefined
  onChange: (items: T[]) => void
  nieuw: () => T
  /** Kop per item, bijvoorbeeld de omschrijving. */
  titel: (item: T, index: number) => ReactNode
  toevoegLabel: string
  leegTekst?: string
  /** Veld-id van de knop Toevoegen, zodat zoeken en springen er in een lege lijst naartoe kunnen ("kia" zonder investeringen). */
  toevoegVeld?: string
  children: (item: T, wijzig: (fn: (item: T) => void) => void, index: number) => ReactNode
}) {
  const lijst = items ?? []
  return (
    <div className="space-y-3">
      {lijst.length === 0 && leegTekst && <p className="text-sm text-gray-500">{leegTekst}</p>}
      {lijst.map((item, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-gray-900">{titel(item, i)}</p>
            <button
              type="button"
              onClick={() => onChange(lijst.filter((_, j) => j !== i))}
              className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              Verwijder<span className="sr-only"> {String(titel(item, i))}</span>
            </button>
          </div>
          {children(
            item,
            (fn) =>
              onChange(
                lijst.map((x, j) => {
                  if (j !== i) return x
                  const kopie = structuredClone(x)
                  fn(kopie)
                  return kopie
                }),
              ),
            i,
          )}
        </div>
      ))}
      <MetVeld veld={toevoegVeld}>
        <Button variant="secundair" grootte="sm" onClick={() => onChange([...lijst, nieuw()])}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          {toevoegLabel}
        </Button>
      </MetVeld>
    </div>
  )
}

/** Kleine kop binnen een sectie. */
export function Subkop({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 mt-6 text-sm font-medium text-gray-900 first:mt-0">{children}</h3>
}

export function nieuwId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}
