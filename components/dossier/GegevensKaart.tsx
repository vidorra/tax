'use client'

/**
 * Persoonlijke gegevens van het huishouden voor het rapport: adres (voorblad) en samenlevingsvorm
 * (hoofdstuk 1). Opslaan via PUT /api/dossier/gegevens; de server controleert en normaliseert (postcode
 * als 1234 AB) en geeft de opgeslagen gegevens terug. Geen BSN.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { House, Save } from 'lucide-react'
import type { HuishoudenGegevens } from '@/lib/rapport/model'
import { Alert, Button, ChipGroup, Field, INVOER_KLASSE, Section, beschrijvingIds, cn, veldIds } from '@/components/ui'
import { invoerRand } from '@/components/ui/Field'
import { gegevensApi } from './api'

type Vorm = NonNullable<HuishoudenGegevens['samenlevingsvorm']>
type AdresVeld = 'straat' | 'postcode' | 'plaats'

const VORMEN: Array<{ value: Vorm; label: string }> = [
  { value: 'gehuwd', label: 'Getrouwd' },
  { value: 'geregistreerd-partner', label: 'Geregistreerd partnerschap' },
  { value: 'samenwonend-met-contract', label: 'Samenwonend met contract' },
  { value: 'samenwonend', label: 'Samenwonend zonder contract' },
  { value: 'alleenstaand', label: 'Alleenstaand' },
]

interface Formulier {
  straat: string
  postcode: string
  plaats: string
  samenlevingsvorm: Vorm | null
}

const LEEG: Formulier = { straat: '', postcode: '', plaats: '', samenlevingsvorm: null }

function naarFormulier(g: HuishoudenGegevens): Formulier {
  return { straat: g.adres?.straat ?? '', postcode: g.adres?.postcode ?? '', plaats: g.adres?.plaats ?? '', samenlevingsvorm: g.samenlevingsvorm ?? null }
}

/** Drie lege adresvelden betekenen geen adres; de rest controleert de server. */
function naarGegevens(f: Formulier): HuishoudenGegevens {
  const uit: HuishoudenGegevens = {}
  if (f.straat.trim() || f.postcode.trim() || f.plaats.trim()) uit.adres = { straat: f.straat, postcode: f.postcode, plaats: f.plaats }
  if (f.samenlevingsvorm) uit.samenlevingsvorm = f.samenlevingsvorm
  return uit
}

/** 'adres.postcode: vul de postcode in' wordt { veld: 'postcode', tekst: 'Vul de postcode in' }. */
function leesFout(f: string): { veld: AdresVeld | 'samenlevingsvorm' | null; tekst: string } {
  const i = f.indexOf(': ')
  const pad = i >= 0 ? f.slice(0, i) : ''
  const melding = i >= 0 ? f.slice(i + 2) : f
  const tekst = melding.charAt(0).toUpperCase() + melding.slice(1)
  if (pad === 'adres.straat' || pad === 'adres.postcode' || pad === 'adres.plaats') return { veld: pad.slice(6) as AdresVeld, tekst }
  if (pad === 'samenlevingsvorm') return { veld: 'samenlevingsvorm', tekst }
  return { veld: null, tekst }
}

function AdresInvoer({
  label,
  value,
  onChange,
  fout,
  autoComplete,
  maxLength,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  fout?: string
  autoComplete: string
  maxLength: number
  className?: string
}) {
  const ids = veldIds(`gegevens-${useId().replace(/:/g, '')}`)
  return (
    <Field ids={ids} label={label} error={fout} className={className}>
      <input
        id={ids.invoer}
        type="text"
        value={value}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-invalid={fout ? true : undefined}
        aria-describedby={beschrijvingIds(ids, undefined, fout)}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INVOER_KLASSE, invoerRand(Boolean(fout)), 'px-3.5')}
      />
    </Field>
  )
}

export interface GegevensKaartProps {
  /** Na het laden en na elke opslag, bijvoorbeeld om het rapport met het adres te vullen. */
  onGegevens?: (gegevens: HuishoudenGegevens) => void
  id?: string
  className?: string
}

/** Kaart met adres en samenlevingsvorm van het huishouden, met opslaan en feedback. */
export function GegevensKaart({ onGegevens, id = 'persoonlijke-gegevens', className }: GegevensKaartProps) {
  const [formulier, setFormulier] = useState<Formulier>(LEEG)
  const [geladen, setGeladen] = useState(false)
  const [laadFout, setLaadFout] = useState<string | null>(null)
  const [gewijzigd, setGewijzigd] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [veldFouten, setVeldFouten] = useState<Partial<Record<AdresVeld | 'samenlevingsvorm', string>>>({})
  const [melding, setMelding] = useState<{ goed: boolean; tekst: string; details?: string[] } | null>(null)
  const terug = useRef(onGegevens)
  useEffect(() => {
    terug.current = onGegevens
  }, [onGegevens])

  useEffect(() => {
    let actief = true
    void gegevensApi.laad().then((r) => {
      if (!actief) return
      if (r.ok && r.data) {
        setFormulier(naarFormulier(r.data.gegevens))
        setGeladen(true)
        terug.current?.(r.data.gegevens)
      } else setLaadFout(r.fout ?? 'Je gegevens konden niet worden geladen.')
    })
    return () => {
      actief = false
    }
  }, [])

  function zet<K extends keyof Formulier>(veld: K, waarde: Formulier[K]) {
    setFormulier((f) => ({ ...f, [veld]: waarde }))
    setGewijzigd(true)
    setMelding(null)
    setVeldFouten((v) => (v[veld] ? { ...v, [veld]: undefined } : v))
  }

  async function bewaar() {
    setBezig(true)
    setMelding(null)
    const r = await gegevensApi.bewaar(naarGegevens(formulier))
    setBezig(false)
    if (!r.ok || !r.data) {
      const fouten = (r.fouten ?? []).map(leesFout)
      setVeldFouten(Object.fromEntries(fouten.filter((f) => f.veld).map((f) => [f.veld, f.tekst])))
      const overig = fouten.filter((f) => !f.veld).map((f) => f.tekst)
      setMelding({ goed: false, tekst: fouten.length > 0 ? 'Controleer de gemarkeerde velden.' : (r.fout ?? 'Opslaan is niet gelukt. Probeer het opnieuw.'), details: overig.length ? overig : undefined })
      return
    }
    setFormulier(naarFormulier(r.data.gegevens))
    setVeldFouten({})
    setGewijzigd(false)
    setMelding({ goed: true, tekst: 'Je gegevens zijn opgeslagen.' })
    terug.current?.(r.data.gegevens)
  }

  return (
    <Section id={id} className={className} icon={<House />} title="Persoonlijke gegevens" subtitle="Voor het voorblad en hoofdstuk 1 van het rapport. Versleuteld opgeslagen.">
      {!geladen && !laadFout && (
        <p role="status" className="text-sm text-gray-500">
          Gegevens laden
        </p>
      )}
      {laadFout && (
        <Alert variant="let-op" role="alert">
          {laadFout}
        </Alert>
      )}
      {geladen && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!bezig && gewijzigd) void bewaar()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,12rem)]">
            <AdresInvoer label="Straat en huisnummer" autoComplete="address-line1" maxLength={100} value={formulier.straat} onChange={(v) => zet('straat', v)} fout={veldFouten.straat} />
            <AdresInvoer label="Postcode" autoComplete="postal-code" maxLength={10} value={formulier.postcode} onChange={(v) => zet('postcode', v)} fout={veldFouten.postcode} />
            <AdresInvoer label="Woonplaats" autoComplete="address-level2" maxLength={80} value={formulier.plaats} onChange={(v) => zet('plaats', v)} fout={veldFouten.plaats} />
          </div>
          <p className="-mt-2 text-xs leading-relaxed text-gray-500">Laat je het adres leeg, dan staat op het voorblad alleen je naam.</p>

          <div>
            <ChipGroup<Vorm>
              label="Samenlevingsvorm"
              value={formulier.samenlevingsvorm}
              onChange={(v) => zet('samenlevingsvorm', v)}
              options={VORMEN}
              hint="Alleen voor het rapport. Of jullie fiscale partners zijn, stel je per jaar in bij het huishouden."
            />
            {veldFouten.samenlevingsvorm && <p className="mt-1.5 text-xs font-medium text-red-700">{veldFouten.samenlevingsvorm}</p>}
            {formulier.samenlevingsvorm && (
              <Button variant="kaal" grootte="sm" className="mt-1 -ml-3" onClick={() => zet('samenlevingsvorm', null)}>
                Keuze wissen
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={bezig || !gewijzigd} aria-busy={bezig}>
              <Save aria-hidden="true" className="h-4 w-4" />
              {bezig ? 'Bezig met opslaan' : 'Opslaan'}
            </Button>
            {gewijzigd && !bezig && <span className="text-sm text-gray-500">Niet opgeslagen wijzigingen</span>}
          </div>

          {melding && (
            <Alert variant={melding.goed ? 'info' : 'let-op'} role="status">
              {melding.tekst}
              {melding.details && (
                <ul className="mt-1 list-disc pl-5">
                  {melding.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

          <p className="text-xs leading-relaxed text-gray-500">Je burgerservicenummer vragen we niet. Dat is voor deze berekening niet nodig en komt niet in het rapport.</p>
        </form>
      )}
    </Section>
  )
}
