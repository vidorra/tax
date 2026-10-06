'use client'

/**
 * Ronde 2 (A5): één land in de lijst "Buitenlandse bronbelasting" van een bezitting. Velden land, soort, bruto en
 * ingehouden; de uitkomst rekent live mee (verdragstarief, verrekenbaar, terugvragen) met dezelfde functie als de engine.
 * Alleen als het speelt: datum van inhouding (termijn telt vanaf de inhouding), een eigen verdragstarief en de meldingen.
 */
import { X } from 'lucide-react'
import { useId, useState, type Ref } from 'react'
import type { BronbelastingRegel, BronbelastingRegelUitkomst, TaxYearParams } from '@/lib/tax/types'
import { landUitTabel } from '@/lib/tax/years/data/bronbelasting-landen'
import { veldVan } from '@/lib/dossier/veld'
import { TERUGVRAAG_KLEIN } from '@/lib/dossier/terugvragen'
import { Alert, ChipGroup, StatusBadge, cn, formatDatum, formatPct } from '@/components/ui'
import { Bedrag, Datum, Getal, Rij } from '../velden'
import { LandSelect } from './LandSelect'
import { SOORT_LABEL, euroCent, inLand, tarief } from './notatie'

export interface BronbelastingRegelKaartProps {
  regel: BronbelastingRegel
  uitkomst: BronbelastingRegelUitkomst | null
  positieId: string
  jaar: number
  params: TaxYearParams | null
  /** Oude vrije tekst van het land die de tool niet herkende. */
  oudeTekst?: string
  onWijzig: (fn: (r: BronbelastingRegel) => void) => void
  onWeghalen: () => void
  landRef?: Ref<HTMLSelectElement>
}

export function BronbelastingRegelKaart({ regel, uitkomst, positieId, jaar, params, oudeTekst, onWijzig, onWeghalen, landRef }: BronbelastingRegelKaartProps) {
  const kopId = `${useId().replace(/:/g, '')}-kop`
  const land = regel.land ? landUitTabel(regel.land) : undefined
  const landNaam = uitkomst?.landNaam ?? land?.naam ?? (regel.land || 'Nieuw land')
  const [eigenTarief, setEigenTarief] = useState(false)
  const veld = (naam: string) => veldVan.positie(positieId, `bronbelasting:${regel.id}`, naam)
  const max = params?.box3.waarde.bronbelastingMaxPct
  const tariefBron = uitkomst?.tariefBron
  const toonTarief = eigenTarief || regel.verdragstarief !== undefined || tariefBron === 'buiten-tabel' || tariefBron === 'geen-verdrag'
  const termijnVanafInhouding = land?.terugvragen?.regel === 'maandenNaInhouding' || land?.terugvragen?.regel === 'jarenNaUitkering'
  const toonDatum = Boolean(regel.datum) || (termijnVanafInhouding && (uitkomst?.terugTeVragen ?? 0) > 0)
  const zonderBruto = regel.bedrag > 0 && !(regel.brutoInkomsten > 0)
  const terug = uitkomst?.terugTeVragen ?? 0

  return (
    <div role="group" aria-labelledby={kopId} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 id={kopId} className="min-w-0 break-words text-sm font-medium text-gray-900">
          {landNaam} · {SOORT_LABEL[regel.soort]}
        </h4>
        <button
          type="button"
          onClick={onWeghalen}
          className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          Weghalen<span className="sr-only"> {landNaam}</span>
        </button>
      </div>
      <div className="space-y-4">
        <Rij>
          <LandSelect ref={landRef} waarde={regel.land} oudeTekst={oudeTekst} veld={veld('land')} error={regel.land === '' && regel.bedrag > 0 ? 'Kies het land waar de bronbelasting is ingehouden.' : undefined} onChange={(code) => onWijzig((r) => void (r.land = code))} />
          <div data-veld={veld('soort')}>
            <ChipGroup<BronbelastingRegel['soort']>
              label="Soort"
              kolommen={2}
              value={regel.soort}
              onChange={(v) => onWijzig((r) => void (r.soort = v))}
              options={[
                { value: 'dividend', label: 'Dividend' },
                { value: 'rente', label: 'Rente' },
              ]}
            />
          </div>
          <Bedrag label="Bruto inkomsten" decimalen={2} veld={veld('brutoInkomsten')} hint="Het bruto dividend of de bruto rente, vóór inhouding." value={regel.brutoInkomsten || undefined} onChange={(v) => onWijzig((r) => void (r.brutoInkomsten = v ?? 0))} />
          <Bedrag label="Ingehouden" decimalen={2} veld={veld('bedrag')} value={regel.bedrag || undefined} onChange={(v) => onWijzig((r) => void (r.bedrag = v ?? 0))} />
          {toonDatum && (
            <Datum label="Datum van inhouding" veld={veld('datum')} hint={`De termijn om terug te vragen telt vanaf deze datum. Leeg is 31 december ${jaar}.`} value={regel.datum} onChange={(v) => onWijzig((r) => (v ? (r.datum = v) : delete r.datum))} />
          )}
          {toonTarief && (
            <Getal
              label="Verdragstarief"
              suffix="%"
              decimalen={3}
              max={100}
              veld={veld('verdragstarief')}
              hint={
                tariefBron === 'buiten-tabel' || (tariefBron === 'eigen' && !land)
                  ? `Het tarief uit het verdrag met dit land. Leeg: we rekenen met hoogstens ${max !== undefined ? formatPct(max, 0) : 'het maximum'}.`
                  : land
                    ? `Leeg is het tarief uit de tabel${land.dividend.verdrag !== null ? ` (${tarief(regel.soort === 'rente' ? (land.rente ?? land.dividend).verdrag ?? 0 : land.dividend.verdrag)})` : ''}.`
                    : undefined
              }
              value={regel.verdragstarief !== undefined ? Math.round(regel.verdragstarief * 100000) / 1000 : undefined}
              onChange={(v) => onWijzig((r) => (v === undefined ? delete r.verdragstarief : (r.verdragstarief = Math.min(100, Math.max(0, v)) / 100)))}
            />
          )}
        </Rij>
        {zonderBruto && <p className="text-xs font-medium text-red-700">Vul de bruto inkomsten in. Zonder bruto inkomsten rekenen we het hele ingehouden bedrag als verrekenbaar; het verdrag staat vaak minder toe.</p>}
        {uitkomst && (regel.bedrag > 0 || regel.brutoInkomsten > 0) && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-700">
            <span>
              Verdragstarief {uitkomst.verdragstarief === null ? (tariefBron === 'geen-verdrag' ? 'geen' : 'onbekend') : tarief(uitkomst.verdragstarief)}
            </span>
            {tariefBron === 'tabel' && uitkomst.landStatus && uitkomst.landStatus !== 'definitief' && <StatusBadge status={uitkomst.landStatus} klein tooltipKant="links" />}
            <span aria-hidden="true">·</span>
            <span>verrekenbaar {euroCent(uitkomst.verrekenbaar)}</span>
            {(tariefBron === 'tabel' || tariefBron === 'eigen') && (
              <>
                <span aria-hidden="true">·</span>
                <span>terugvragen {euroCent(terug)}</span>
              </>
            )}
          </p>
        )}
        {land && !toonTarief && (
          <button type="button" onClick={() => setEigenTarief(true)} className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary transition-colors hover:text-primary-dark">
            Ander verdragstarief invullen
          </button>
        )}
        {uitkomst && terug > 0 && terug >= TERUGVRAAG_KLEIN && (
          <Alert variant="let-op">
            <p>
              Er is {euroCent(terug)} meer ingehouden dan het verdrag toestaat.{' '}
              {uitkomst.terugvraagUiterlijk ? (
                <>
                  Vraag het terug {inLand(landNaam)}, uiterlijk {formatDatum(uitkomst.terugvraagUiterlijk)}.
                </>
              ) : (
                <>Vraag het terug {inLand(landNaam)}; de termijn staat niet vast, kijk hem na bij het bronland.</>
              )}
            </p>
            {uitkomst.procedure && <p className="mt-1 text-xs">{uitkomst.procedure}. Het verzoek staat op de terugvraaglijst bij Planning.</p>}
          </Alert>
        )}
        {uitkomst && terug > 0 && terug < TERUGVRAAG_KLEIN && (
          <Alert variant="info">
            Er is {euroCent(terug)} meer ingehouden dan het verdrag toestaat. Terugvragen loont waarschijnlijk niet.
          </Alert>
        )}
        {uitkomst && tariefBron === 'buiten-tabel' && regel.land !== '' && regel.bedrag > 0 && (
          <Alert variant="let-op">
            Voor dit land staat het verdragstarief niet in de tool. We rekenen met hoogstens {max !== undefined ? formatPct(max, 0) : '15%'}; vul het tarief in als het verdrag minder toestaat.
          </Alert>
        )}
        {uitkomst && tariefBron === 'geen-verdrag' && regel.bedrag > 0 && <Alert variant="let-op">Met dit land heeft Nederland geen verdrag dat verrekening toestaat. Vul een tarief in als dat wel kan.</Alert>}
        {land?.fondsland && regel.bedrag <= 0 && regel.brutoInkomsten > 0 && (
          <Alert variant="info" className={cn('py-3')}>
            Bronbelasting binnen het fonds kun je niet verrekenen. Een {land.naam === 'Ierland' ? 'Iers' : 'Luxemburgs'} fonds houdt op zijn eigen uitkering meestal niets in.
          </Alert>
        )}
      </div>
    </div>
  )
}
