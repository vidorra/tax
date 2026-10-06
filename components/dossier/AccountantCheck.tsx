'use client'

import { useMemo, useState } from 'react'
import { Save } from 'lucide-react'
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import { berekenDossier } from '@/lib/dossier/bereken'
import { accountantVergelijking, RAPPORT_REGELS, type AccountantRegels } from '@/lib/dossier/accountant'
import { Alert, Button, Card, ChipGroup, MoneyInput, cn, formatEuro } from '@/components/ui'
import { api } from './api'
import { persoonNaam } from './secties/types'
import { Disclaimer } from './Disclaimer'

export interface AccountantCheckProps {
  jaar: number
  invoer: HuishoudenInvoer
  variant: string | null
  regels: AccountantRegels
}

export function AccountantCheck({ jaar, invoer, variant, regels: start }: AccountantCheckProps) {
  const [regels, setRegels] = useState<AccountantRegels>(start)
  const [actief, setActief] = useState<PersoonId>(invoer.personen[0]?.id ?? 'A')
  const [gewijzigd, setGewijzigd] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<{ soort: 'ok' | 'fout'; tekst: string } | null>(null)

  const resultaat = useMemo(() => {
    try {
      const v = variant ?? undefined
      return berekenDossier({ ...invoer, variant: v }, { variant: v, zonderMarginaleDruk: true })
    } catch {
      return null
    }
  }, [invoer, variant])

  if (!resultaat) return <Alert variant="let-op">De berekening lukt niet met de opgeslagen invoer. Controleer de invoer van dit jaar.</Alert>
  const vergelijking = accountantVergelijking(resultaat, regels)
  const rijen = vergelijking.regels.filter((r) => r.persoon === actief)

  function zet(id: string, waarde: number | null) {
    setRegels((r) => ({ ...r, [actief]: { ...(r[actief] ?? {}), [id]: waarde } }))
    setGewijzigd(true)
    setMelding(null)
  }

  async function bewaar() {
    setBezig(true)
    const r = await api<{ regels: AccountantRegels }>(`/api/dossier/jaren/${jaar}/accountant`, { method: 'PUT', body: { regels } })
    setBezig(false)
    if (!r.ok) return setMelding({ soort: 'fout', tekst: r.fout ?? 'Opslaan is niet gelukt.' })
    setGewijzigd(false)
    setMelding({ soort: 'ok', tekst: 'De bedragen van je accountant zijn opgeslagen.' })
  }

  return (
    <div className="space-y-6">
      <Card padding="klein">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {invoer.personen.length > 1 ? (
            <ChipGroup<PersoonId> label="Persoon" kolommen={2} value={actief} onChange={setActief} options={invoer.personen.map((p) => ({ value: p.id, label: persoonNaam(p) }))} className="sm:w-80" />
          ) : (
            <p className="text-sm text-gray-700">{persoonNaam(invoer.personen[0])}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-600" aria-live="polite">
              {vergelijking.aantalIngevuld === 0
                ? 'Nog geen bedragen ingevuld'
                : vergelijking.aantalAfwijkend === 0
                  ? `${vergelijking.aantalIngevuld} regels, geen verschillen`
                  : `${vergelijking.aantalAfwijkend} van ${vergelijking.aantalIngevuld} regels wijken af`}
            </p>
            <Button onClick={bewaar} disabled={bezig || !gewijzigd}>
              <Save aria-hidden="true" className="h-4 w-4" />
              {bezig ? 'Bezig met opslaan' : 'Opslaan'}
            </Button>
          </div>
        </div>
      </Card>
      {melding && (
        <Alert variant={melding.soort === 'ok' ? 'info' : 'let-op'} role="status">
          {melding.tekst}
        </Alert>
      )}

      <Card padding="geen">
        <div className="hidden grid-cols-[minmax(0,1fr)_10rem_8rem_8rem] gap-4 border-b border-gray-200 px-5 py-3 text-xs font-medium text-gray-500 md:grid">
          <span>Rapportregel</span>
          <span>Accountant</span>
          <span className="text-right">Berekening</span>
          <span className="text-right">Verschil</span>
        </div>
        <ul className="divide-y divide-gray-100">
          {rijen.map((r) => {
            const def = RAPPORT_REGELS.find((d) => d.id === r.id)!
            return (
              <li key={r.id} className={cn('grid gap-3 px-5 py-3 md:grid-cols-[minmax(0,1fr)_10rem_8rem_8rem] md:items-center md:gap-4', r.afwijkend && 'bg-amber-50')}>
                <span className="text-sm font-medium text-gray-900 md:font-normal md:text-gray-800">{def.label}</span>
                <MoneyInput label={`${def.label}, bedrag accountant`} labelVerborgen negatief value={r.accountant} onChange={(v) => zet(r.id, v)} placeholder="Accountant" />
                <div className="flex justify-between text-sm md:block md:text-right">
                  <span className="text-gray-500 md:hidden">Berekening</span>
                  <span className="tabular-nums text-gray-900">{formatEuro(r.engine)}</span>
                </div>
                <div className="flex justify-between text-sm md:block md:text-right">
                  <span className="text-gray-500 md:hidden">Verschil</span>
                  <span className={cn('tabular-nums', r.afwijkend ? 'font-semibold text-amber-900' : 'text-gray-500')}>
                    {r.verschil === null ? '–' : formatEuro(r.verschil, { teken: true })}
                    {r.afwijkend && <span className="sr-only"> (wijkt af)</span>}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
      <p className="text-xs text-gray-500">
        Verschil is de berekening min het bedrag van de accountant. Kleine verschillen van een paar euro ontstaan vaak door afrondingen per regel. Bij grotere verschillen loont het om de onderliggende regels na te lopen op de invoerpagina.
      </p>
      <Disclaimer />
    </div>
  )
}
