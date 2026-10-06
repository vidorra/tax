'use client'

/**
 * Saldi uit het vorige jaar opnieuw overnemen. Vraagt bij het laden (en na elke opslag) aan de server wat er zou
 * veranderen, toont dat als lijst van oud naar nieuw en slaat het pas op na bevestigen. Werkt op de opgeslagen
 * versie: met niet-opgeslagen wijzigingen moet je eerst opslaan.
 */
import { useCallback, useEffect, useState } from 'react'
import { History } from 'lucide-react'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { DoorrolWijziging } from '@/lib/dossier/doorrol'
import { Alert, Button, Card } from '@/components/ui'
import { api } from './api'

interface Voorbeeld {
  vorigJaar: number
  versie: number
  wijzigingen: DoorrolWijziging[]
  meldingen: string[]
}

interface Overgenomen {
  opgeslagen: boolean
  versie: number
  updatedAt: string
  invoer: HuishoudenInvoer
  wijzigingen: DoorrolWijziging[]
  meldingen: string[]
}

export interface DoorrolKaartProps {
  jaar: number
  versie: number
  /** Er zijn niet-opgeslagen wijzigingen in de editor. */
  gewijzigd: boolean
  /** Namen per persoon, voor de lijst bij twee personen. */
  persoonNamen: Record<string, string>
  onOvergenomen: (d: { invoer: HuishoudenInvoer; versie: number; updatedAt: string }) => void
}

export function DoorrolKaart({ jaar, versie, gewijzigd, persoonNamen, onOvergenomen }: DoorrolKaartProps) {
  const vorigJaar = jaar - 1
  const [voorbeeld, setVoorbeeld] = useState<Voorbeeld | null>(null)
  const [geenVorig, setGeenVorig] = useState(false)
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<{ melding: string; fouten?: string[] } | null>(null)
  const [klaar, setKlaar] = useState<string | null>(null)
  const [laadFout, setLaadFout] = useState<string | null>(null)

  const laad = useCallback(async () => {
    const r = await api<Voorbeeld>(`/api/dossier/jaren/${jaar}/doorrollen`)
    if (r.ok && r.data) {
      setVoorbeeld(r.data)
      setGeenVorig(false)
      setLaadFout(null)
    } else if (r.status === 404) {
      setGeenVorig(true)
    } else {
      // Bijvoorbeeld: de berekening van het vorige jaar lukt niet. Dan kan overnemen ook niet.
      setVoorbeeld(null)
      setLaadFout(r.fout)
    }
  }, [jaar])

  useEffect(() => {
    void laad()
  }, [laad, versie])

  if (geenVorig) return null

  const aantal = voorbeeld?.wijzigingen.length ?? 0
  const tweePersonen = new Set(voorbeeld?.wijzigingen.map((w) => w.persoon)).size > 1 || Object.keys(persoonNamen).length > 1

  async function neemOver() {
    setBezig(true)
    setFout(null)
    setKlaar(null)
    const r = await api<Overgenomen>(`/api/dossier/jaren/${jaar}/doorrollen`, { method: 'POST', body: { versie } })
    setBezig(false)
    if (!r.ok || !r.data) return setFout({ melding: r.fout ?? 'Overnemen is niet gelukt.', fouten: r.fouten })
    setOpen(false)
    setKlaar(r.data.opgeslagen ? `De saldi uit ${vorigJaar} zijn overgenomen en opgeslagen.` : `Er veranderde niets: de saldi waren al gelijk aan ${vorigJaar}.`)
    onOvergenomen({ invoer: r.data.invoer, versie: r.data.versie, updatedAt: r.data.updatedAt })
  }

  return (
    <Card className="mb-6" padding="klein">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 flex-shrink-0 text-primary [&>svg]:h-5 [&>svg]:w-5">
            <History />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-gray-900">Saldi uit {vorigJaar}</h2>
            <p className="mt-1 text-sm text-gray-600">
              Verliezen, niet-benutte zelfstandigenaftrek, restant persoonsgebonden aftrek, lijfrentehistorie, oudedagsreserve, urencriterium, beginbalans en bedrijfsmiddelen komen
              uit de uitkomst van {vorigJaar}. Pas je {vorigJaar} later aan, neem ze dan opnieuw over. De rest van je invoer blijft staan, en een bedrijfsmiddel dat je hier
              verwijderde, komt niet terug.
            </p>
            {voorbeeld && (
              <p className="mt-1 text-sm" aria-live="polite">
                {aantal === 0 ? (
                  <span className="text-gray-600">Alles is gelijk aan de uitkomst van {vorigJaar}.</span>
                ) : (
                  <span className="font-medium text-amber-800">
                    {aantal === 1 ? `Eén saldo wijkt af van de uitkomst van ${vorigJaar}.` : `${aantal} saldi wijken af van de uitkomst van ${vorigJaar}.`}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-stretch gap-1 sm:items-end">
          <Button variant="secundair" onClick={() => setOpen((x) => !x)} disabled={gewijzigd || bezig || !voorbeeld} aria-expanded={open}>
            Saldi uit {vorigJaar} opnieuw overnemen
          </Button>
          {gewijzigd && <p className="text-xs text-gray-500">Sla eerst je wijzigingen op.</p>}
        </div>
      </div>

      {laadFout && <p className="mt-3 text-sm text-amber-800">{laadFout}</p>}

      {voorbeeld && voorbeeld.meldingen.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-600">
          {voorbeeld.meldingen.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {open && voorbeeld && !gewijzigd && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          {aantal === 0 ? (
            <p className="text-sm text-gray-600">Er verandert niets: de saldi zijn al gelijk aan de uitkomst van {vorigJaar}.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-gray-700">Dit verandert er:</p>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                <li aria-hidden="true" className="hidden gap-3 px-3 py-2 text-xs uppercase tracking-wide text-gray-400 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <span>Saldo</span>
                  <span>Nu</span>
                  <span>Wordt</span>
                </li>
                {voorbeeld.wijzigingen.map((w, i) => (
                  <li key={i} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
                    <span className="font-medium text-gray-900">
                      {w.label}
                      {(w.onderneming || tweePersonen) && (
                        <span className="block text-xs font-normal text-gray-500">{[tweePersonen ? persoonNamen[w.persoon] ?? `Persoon ${w.persoon}` : null, w.onderneming].filter(Boolean).join(' · ')}</span>
                      )}
                    </span>
                    <span className="text-gray-500">
                      <span className="sr-only">Nu: </span>
                      <span aria-hidden="true" className="text-xs uppercase tracking-wide text-gray-400 sm:hidden">
                        Nu{' '}
                      </span>
                      {w.oud}
                    </span>
                    <span className="text-gray-900">
                      <span className="sr-only">Wordt: </span>
                      <span aria-hidden="true" className="text-xs uppercase tracking-wide text-gray-400 sm:hidden">
                        Wordt{' '}
                      </span>
                      {w.nieuw}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={neemOver} disabled={bezig || aantal === 0}>
              {bezig ? 'Bezig met overnemen' : 'Overnemen en opslaan'}
            </Button>
            <Button variant="kaal" onClick={() => setOpen(false)} disabled={bezig}>
              Annuleren
            </Button>
          </div>
        </div>
      )}

      {fout && (
        <Alert variant="let-op" role="alert" className="mt-3" titel={fout.melding}>
          {fout.fouten && fout.fouten.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {fout.fouten.slice(0, 8).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {klaar && (
        <p className="mt-3 text-sm text-gray-700" role="status">
          {klaar}
        </p>
      )}
    </Card>
  )
}
