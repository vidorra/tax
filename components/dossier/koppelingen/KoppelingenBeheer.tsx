'use client'

import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, Link2, Plus, Trash2 } from 'lucide-react'
import type { MbAdministratie, MbKoppelingPubliek } from '@/lib/moneybird/types'
import { Alert, Button, Card, Field, INVOER_KLASSE, Section, Select, cn, veldIds } from '@/components/ui'
import { koppelingenApi } from '../api'
import { formatMoment } from './indeling'
import { useKoppelingen } from './useKoppelingen'

const SCOPES: Array<{ scope: string; waarvoor: string }> = [
  { scope: 'sales_invoices', waarvoor: 'omzet per klant en de winst- en verliesrekening' },
  { scope: 'documents', waarvoor: 'vaste activa en de winst- en verliesrekening' },
  { scope: 'bank', waarvoor: 'de balans, met ondernemingsvermogen en oudedagsreserve' },
  { scope: 'time_entries', waarvoor: 'je geregistreerde uren' },
  { scope: 'settings', waarvoor: 'de namen en RGS-codes van je grootboekrekeningen' },
]

function administratieOpties(lijst: MbAdministratie[]) {
  return lijst.map((a) => ({ value: a.id, label: a.naam }))
}

export type PersoonNamen = { A: string; B: string }

type Persoon = 'A' | 'B'

function persoonOpties(namen: PersoonNamen) {
  return [
    { value: 'A', label: namen.A },
    { value: 'B', label: namen.B },
  ]
}

export function KoppelingenBeheer({ namen = { A: 'Persoon A', B: 'Persoon B' } }: { namen?: PersoonNamen }) {
  const { koppelingen, laden, fout: laadFout, vernieuw } = useKoppelingen()

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-base font-semibold text-gray-900">Wat doet de koppeling?</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Met een koppeling haal je per belastingjaar de cijfers uit je Moneybird-administratie op: de winst- en verliesrekening per grootboekrekening, de balans, je vaste activa,
          de omzet per klant en je geregistreerde uren. Je controleert de indeling en neemt de cijfers daarna over in een onderneming in je dossier.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">De koppeling leest alleen. Er wordt niets aangemaakt, gewijzigd of verwijderd in Moneybird.</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Heeft je partner een eigen Moneybird-administratie? Voeg dan een tweede koppeling toe met het token van je partner en kies bij Van wie? je partner. De onderneming van je partner
          gebruikt dan die koppeling.
        </p>

        <h3 className="mt-5 text-sm font-medium text-gray-900">Een token maken in Moneybird</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">
          <li>Log in bij Moneybird en ga naar Instellingen, dan Ontwikkelaars, dan Persoonlijke API-tokens.</li>
          <li>Maak een nieuw token en geef het een naam die je herkent, bijvoorbeeld IB-calculator.</li>
          <li>
            Zet deze rechten aan:
            <ul className="mt-1 space-y-1">
              {SCOPES.map((s) => (
                <li key={s.scope}>
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-900">{s.scope}</code> voor {s.waarvoor}
                </li>
              ))}
            </ul>
          </li>
          <li>Kopieer het token en plak het hieronder.</li>
        </ol>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">
          We bewaren het token versleuteld en laten het daarna nooit meer zien; je ziet alleen de laatste tekens. Intrekken kan altijd in Moneybird, bij dezelfde instelling.
        </p>
      </Card>

      <Section icon={<Link2 />} title="Je koppelingen" subtitle="Per koppeling één administratie, dus één onderneming.">
        {laden && koppelingen.length === 0 ? (
          <p className="text-sm text-gray-600" aria-live="polite">
            Koppelingen laden
          </p>
        ) : laadFout ? (
          <Alert variant="let-op" role="alert">
            {laadFout}
          </Alert>
        ) : koppelingen.length === 0 ? (
          <p className="text-sm text-gray-600">Nog geen koppeling. Voeg er hieronder een toe.</p>
        ) : (
          <ul className="space-y-4" aria-label="Moneybird-koppelingen">
            {koppelingen.map((k) => (
              <li key={k.id}>
                <KoppelingKaart koppeling={k} namen={namen} onGewijzigd={vernieuw} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <NieuweKoppeling namen={namen} onGewijzigd={vernieuw} />
    </div>
  )
}

function KoppelingKaart({ koppeling: k, namen, onGewijzigd }: { koppeling: MbKoppelingPubliek; namen: PersoonNamen; onGewijzigd: () => Promise<void> }) {
  const basis = useId().replace(/:/g, '')
  const [modus, setModus] = useState<'rust' | 'administratie' | 'verwijderen'>('rust')
  const [administraties, setAdministraties] = useState<MbAdministratie[] | null>(null)
  const [keuze, setKeuze] = useState('')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function zetPersoon(p: string) {
    setFout(null)
    const r = await koppelingenApi.zetPersoon(k.id, p === 'A' || p === 'B' ? p : null)
    if (!r.ok) return setFout(r.fout ?? 'Opslaan is niet gelukt.')
    await onGewijzigd()
  }

  async function openAdministraties() {
    setModus('administratie')
    setFout(null)
    setBezig(true)
    const r = await koppelingenApi.administraties(k.id)
    setBezig(false)
    if (!r.ok || !r.data) return setFout(r.fout ?? 'De administraties konden niet worden opgehaald.')
    setAdministraties(r.data.administraties)
    setKeuze(k.administratieId ?? r.data.administraties[0]?.id ?? '')
  }

  async function bewaarAdministratie() {
    if (!keuze) return
    setBezig(true)
    setFout(null)
    const r = await koppelingenApi.kiesAdministratie(k.id, keuze)
    setBezig(false)
    if (!r.ok) return setFout(r.fout ?? 'Opslaan is niet gelukt.')
    setModus('rust')
    await onGewijzigd()
  }

  async function verwijder() {
    setBezig(true)
    setFout(null)
    const r = await koppelingenApi.verwijder(k.id)
    setBezig(false)
    if (!r.ok) return setFout(r.fout ?? 'Verwijderen is niet gelukt.')
    await onGewijzigd()
  }

  return (
    <Card as="article" padding="klein" aria-labelledby={`${basis}-naam`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${basis}-naam`} className="min-w-0 break-words text-base font-medium text-gray-900">
          {k.label}
        </h3>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-gray-500">Token</dt>
          <dd className="break-all font-mono text-gray-900">{k.tokenMasker}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-gray-500">Administratie</dt>
          <dd className={cn('break-words', k.administratieNaam || k.administratieId ? 'text-gray-900' : 'font-medium text-amber-800')}>
            {k.administratieNaam ?? k.administratieId ?? 'Nog niet gekozen'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Laatst gebruikt</dt>
          <dd className="text-gray-900">{k.laatstGebruikt ? formatMoment(k.laatstGebruikt, true) : 'Nog niet gebruikt'}</dd>
        </div>
        {k.aangemaakt && (
          <div>
            <dt className="text-xs text-gray-500">Toegevoegd</dt>
            <dd className="text-gray-900">{formatMoment(k.aangemaakt)}</dd>
          </div>
        )}
      </dl>
      <div className="mt-3 max-w-xs">
        <Select
          label="Van wie?"
          value={k.persoon ?? ''}
          onChange={(v) => void zetPersoon(v)}
          options={[{ value: '', label: 'Nog niet gekozen' }, ...persoonOpties(namen)]}
        />
      </div>

      <>
          {modus === 'rust' && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
              <Button variant="secundair" grootte="sm" onClick={openAdministraties}>
                {k.administratieId ? 'Andere administratie kiezen' : 'Administratie kiezen'}
              </Button>
              <Button variant="kaal" grootte="sm" onClick={() => setModus('verwijderen')} className="text-red-700 hover:bg-red-50 hover:text-red-800">
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Verwijderen<span className="sr-only"> {k.label}</span>
              </Button>
            </div>
          )}

          {modus === 'administratie' && (
            <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
              {bezig && !administraties ? (
                <p className="text-sm text-gray-600" aria-live="polite">
                  Administraties ophalen uit Moneybird
                </p>
              ) : administraties && administraties.length === 0 ? (
                <p className="text-sm text-gray-600">Dit token heeft geen toegang tot een administratie.</p>
              ) : administraties ? (
                <Select label="Administratie" value={keuze} onChange={setKeuze} options={administratieOpties(administraties)} />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button grootte="sm" onClick={bewaarAdministratie} disabled={bezig || !keuze}>
                  {bezig && administraties ? 'Bezig' : 'Bewaren'}
                </Button>
                <Button
                  variant="kaal"
                  grootte="sm"
                  onClick={() => {
                    setModus('rust')
                    setFout(null)
                  }}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          )}

          {modus === 'verwijderen' && (
            <div className="mt-4 space-y-3 rounded-xl border border-red-200 bg-red-50/50 p-4" role="group" aria-labelledby={`${basis}-verwijder`}>
              <p id={`${basis}-verwijder`} className="text-sm text-gray-800">
                Koppeling {k.label} verwijderen? We wissen het token uit je dossier. Cijfers die je al hebt overgenomen, blijven staan. Trek het token ook in bij Moneybird als je het niet
                meer gebruikt.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button grootte="sm" onClick={verwijder} disabled={bezig} className="bg-red-700 hover:bg-red-800">
                  {bezig ? 'Bezig' : 'Ja, verwijderen'}
                </Button>
                <Button variant="secundair" grootte="sm" onClick={() => setModus('rust')} disabled={bezig}>
                  Annuleren
                </Button>
              </div>
            </div>
          )}
      </>

      {fout && (
        <Alert variant="let-op" role="alert" className="mt-3">
          {fout}
        </Alert>
      )}
    </Card>
  )
}

function NieuweKoppeling({ namen, onGewijzigd }: { namen: PersoonNamen; onGewijzigd: () => Promise<void> }) {
  const labelIds = veldIds('koppeling-label')
  const tokenIds = veldIds('koppeling-token')
  const [label, setLabel] = useState('Moneybird')
  const [token, setToken] = useState('')
  const [persoon, setPersoon] = useState<Persoon>('A')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [nieuw, setNieuw] = useState<{ koppeling: MbKoppelingPubliek; administraties: MbAdministratie[] } | null>(null)
  const [keuze, setKeuze] = useState('')

  async function voegToe(e: FormEvent) {
    e.preventDefault()
    if (!token.trim()) return setFout('Plak eerst het token uit Moneybird.')
    setBezig(true)
    setFout(null)
    setMelding(null)
    const r = await koppelingenApi.voegToe(token.trim(), label.trim() || 'Moneybird', persoon)
    setBezig(false)
    if (!r.ok || !r.data) return setFout(r.fout ?? 'Toevoegen is niet gelukt.')
    setToken('')
    setNieuw(r.data)
    setKeuze(r.data.administraties[0]?.id ?? '')
    await onGewijzigd()
  }

  async function koppel() {
    if (!nieuw || !keuze) return
    setBezig(true)
    setFout(null)
    const r = await koppelingenApi.kiesAdministratie(nieuw.koppeling.id, keuze)
    setBezig(false)
    if (!r.ok) return setFout(r.fout ?? 'Opslaan is niet gelukt.')
    setNieuw(null)
    setLabel('Moneybird')
    setMelding('De koppeling is klaar. Open een jaar en kies bij je onderneming Importeer uit Moneybird.')
    await onGewijzigd()
  }

  return (
    <Section icon={<Plus />} title="Koppeling toevoegen" subtitle="Met een persoonlijk API-token uit Moneybird.">
      <div className="space-y-4">
        <div aria-live="polite" className="space-y-3">
          {fout && (
            <Alert variant="let-op" role="alert">
              {fout}
            </Alert>
          )}
          {melding && <Alert variant="info">{melding}</Alert>}
        </div>

        {nieuw ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Het token werkt. Kies welke administratie bij koppeling {nieuw.koppeling.label} hoort.
            </p>
            {nieuw.administraties.length === 0 ? (
              <p className="text-sm text-gray-600">Dit token heeft geen toegang tot een administratie. Controleer in Moneybird bij welke administratie je het token hebt gemaakt.</p>
            ) : (
              <Select label="Administratie" value={keuze} onChange={setKeuze} options={administratieOpties(nieuw.administraties)} />
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={koppel} disabled={bezig || !keuze}>
                {bezig ? 'Bezig' : 'Administratie koppelen'}
              </Button>
              <Button variant="kaal" onClick={() => setNieuw(null)} disabled={bezig}>
                Later kiezen
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={voegToe} className="space-y-4" autoComplete="off">
            <Field ids={labelIds} label="Naam van de koppeling" hint="Voor jezelf, bijvoorbeeld de naam van je bedrijf.">
              <input
                id={labelIds.invoer}
                type="text"
                value={label}
                maxLength={80}
                aria-describedby={labelIds.hint}
                onChange={(e) => setLabel(e.target.value)}
                className={cn(INVOER_KLASSE, 'border-gray-200 px-3.5 hover:border-gray-300')}
              />
            </Field>
            <Select label="Van wie?" hint="De onderneming van deze persoon gebruikt deze koppeling." value={persoon} onChange={(v) => setPersoon(v === 'B' ? 'B' : 'A')} options={persoonOpties(namen)} />
            <Field ids={tokenIds} label="Persoonlijk API-token" verplicht hint="Wordt versleuteld opgeslagen en daarna niet meer getoond.">
              <input
                id={tokenIds.invoer}
                type="password"
                value={token}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={500}
                aria-describedby={tokenIds.hint}
                aria-required
                onChange={(e) => setToken(e.target.value)}
                className={cn(INVOER_KLASSE, 'border-gray-200 px-3.5 font-mono hover:border-gray-300')}
              />
            </Field>
            <Button type="submit" disabled={bezig || !token.trim()}>
              <KeyRound aria-hidden="true" className="h-4 w-4" />
              {bezig ? 'Token controleren' : 'Token controleren en toevoegen'}
            </Button>
          </form>
        )}
      </div>
    </Section>
  )
}
