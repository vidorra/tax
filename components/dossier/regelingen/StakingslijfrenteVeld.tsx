'use client'

/**
 * Ronde 2 (A6): stakingslijfrente in Pensioen en AOV (art. 3.129, 3.130 lid 2). Alleen bij een staking dit jaar of als
 * er al iets is ingevuld (ingevulde gegevens worden nooit verborgen). Premie, betaald op, het maximum (standaard uit de
 * leeftijd) en wat je al opbouwde. De ruimte en de aftrek komen uit de engine
 * (`InkomensvoorzieningResultaat.stakingslijfrente`), net als de verlaging van het inkomen voor de Zvw-bijdrage.
 */
import { useMemo } from 'react'
import type { PersoonInvoer, PersoonResultaat, StakingslijfrenteInvoer, TaxYearParams } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { veldVan } from '@/lib/dossier/veld'
import { eerderAfgetrokkenUitHistorie } from '@/lib/tax/modules/stakingslijfrente'
import { Alert, Disclosure, Select, StatLijst, StatRow, WaarschuwingLijst, formatEuro } from '@/components/ui'
import { Bedrag, Datum, Rij, Subkop } from '../velden'
import type { WijzigPersoon } from '../secties/types'

type Categorie = NonNullable<StakingslijfrenteInvoer['categorie']>

export interface StakingslijfrenteVeldProps {
  persoon: PersoonInvoer
  wijzigPersoon: WijzigPersoon
  jaar: number
  /** Ontbreekt = de parameters van `jaar`. */
  params?: TaxYearParams | null
  /** Uitkomst van deze persoon; ontbreekt als de berekening niet lukt. */
  resultaat: PersoonResultaat | null | undefined
}

/** Speelt de stakingslijfrente bij deze persoon (een staking dit jaar, of al iets ingevuld)? */
export const stakingslijfrenteSpeelt = (p: PersoonInvoer): boolean => p.inkomensvoorziening.stakingslijfrente !== undefined || p.ondernemingen.some((o) => o.staking !== undefined)

function paramsVan(jaar: number): TaxYearParams | null {
  try {
    return getJaar(jaar)
  } catch {
    return null
  }
}

export function StakingslijfrenteVeld({ persoon, wijzigPersoon, jaar, params: gegeven, resultaat }: StakingslijfrenteVeldProps) {
  const eigen = useMemo(() => (gegeven === undefined ? paramsVan(jaar) : null), [gegeven, jaar])
  const params = gegeven ?? eigen
  if (!stakingslijfrenteSpeelt(persoon)) return null
  const sl = persoon.inkomensvoorziening.stakingslijfrente
  const uit = resultaat?.inkomensvoorziening.stakingslijfrente
  const veld = (pad: string) => veldVan.persoon(persoon.id, `inkomensvoorziening.stakingslijfrente.${pad}`)
  const maxima = params?.inkomensvoorziening.waarde.stakingslijfrente
  const regels = params?.inkomensvoorziening.waarde.stakingslijfrenteRegels
  const uitHistorie = eerderAfgetrokkenUitHistorie(persoon.inkomensvoorziening.historie)
  const meldingen = (resultaat?.inkomensvoorziening.waarschuwingen ?? []).filter((w) => w.id.startsWith('stakingslijfrente.'))
  const zvw = resultaat?.zvwCorrectieFor ?? 0
  const pas = (fn: (s: StakingslijfrenteInvoer) => void) =>
    wijzigPersoon((p) => {
      const s = p.inkomensvoorziening.stakingslijfrente ?? { premie: 0 }
      fn(s)
      const leeg = s.premie === 0 && Object.keys(s).every((k) => k === 'premie')
      if (leeg) delete p.inkomensvoorziening.stakingslijfrente
      else p.inkomensvoorziening.stakingslijfrente = s
    })
  const opties: Array<{ value: Categorie | ''; label: string }> = [
    { value: '', label: uit && !sl?.categorie ? `Uit je leeftijd: ${uit.categorie} (${formatEuro(uit.maximum)})` : 'Uit je leeftijd' },
    { value: 'hoog', label: `Hoog${maxima ? `: ${formatEuro(maxima.hoog)}` : ''} (AOW binnen ${regels?.hoogBinnenJarenVoorAow ?? 5} jaar, of arbeidsongeschikt)` },
    { value: 'midden', label: `Midden${maxima ? `: ${formatEuro(maxima.midden)}` : ''} (AOW binnen ${regels?.middenBinnenJarenVoorAow ?? 15} jaar)` },
    { value: 'laag', label: `Laag${maxima ? `: ${formatEuro(maxima.laag)}` : ''}` },
  ]

  return (
    <div className="mt-5">
      <Subkop>Stakingslijfrente</Subkop>
      <p className="mb-3 text-xs leading-relaxed text-gray-500">
        Met de stakingswinst en de vrijval van je oudedagsreserve kun je een lijfrente kopen, naast je jaarruimte. Betaal je de premie
        {regels ? ` uiterlijk ${regels.betaaltermijnMaanden} maanden na het einde van ${jaar}` : ' kort na het einde van het jaar'}, dan mag je hem in {jaar} aftrekken.
      </p>
      <div className="space-y-4">
        <Rij>
          <Bedrag label="Premie stakingslijfrente" veld={veld('premie')} value={sl?.premie || undefined} onChange={(v) => pas((s) => void (s.premie = v ?? 0))} />
          <Datum
            label="Betaald op"
            veld={veld('betaaldOp')}
            hint={`Ook een betaling in ${jaar + 1} telt mee als die binnen de termijn valt.`}
            value={sl?.betaaldOp}
            onChange={(v) => pas((s) => (v ? (s.betaaldOp = v) : delete s.betaaldOp))}
          />
          <div data-veld={veld('categorie')}>
            <Select<Categorie | ''>
              label="Maximum"
              value={sl?.categorie ?? ''}
              onChange={(v) => pas((s) => (v === '' ? delete s.categorie : (s.categorie = v)))}
              options={opties}
              hint="Hoe dichter bij je AOW-leeftijd, hoe hoger het maximum."
            />
          </div>
          <Bedrag
            label="Eerder afgetrokken lijfrentepremies"
            veld={veld('eerderAfgetrokkenLijfrentepremies')}
            hint={
              uitHistorie > 0
                ? `Leeg: ${formatEuro(uitHistorie)}, wat in je lijfrentehistorie als gebruikt staat. Dat is een benadering; het gaat om alle premies die je ooit aftrok.`
                : 'Alle lijfrentepremies die je ooit aftrok op grond van je jaar- of reserveringsruimte.'
            }
            value={sl?.eerderAfgetrokkenLijfrentepremies}
            onChange={(v) => pas((s) => (v === undefined ? delete s.eerderAfgetrokkenLijfrentepremies : (s.eerderAfgetrokkenLijfrentepremies = v)))}
          />
        </Rij>
        <Disclosure
          variant="kaal"
          titel="Andere voorzieningen voor je oude dag"
          subtitel="Pensioen, eerdere stakingslijfrenten en omgezette oudedagsreserve"
          defaultOpen={sl?.waardePensioenaanspraken !== undefined || sl?.eerdereStakingslijfrenten !== undefined || sl?.eerdereForOmzettingen !== undefined}
        >
          <Rij className="pt-2">
            <Bedrag
              label="Waarde van je pensioenaanspraken"
              veld={veld('waardePensioenaanspraken')}
              hint="Uit je pensioenoverzicht. Gaat af van het maximum."
              value={sl?.waardePensioenaanspraken}
              onChange={(v) => pas((s) => (v === undefined ? delete s.waardePensioenaanspraken : (s.waardePensioenaanspraken = v)))}
            />
            <Bedrag
              label="Eerdere stakingslijfrenten"
              veld={veld('eerdereStakingslijfrenten')}
              value={sl?.eerdereStakingslijfrenten}
              onChange={(v) => pas((s) => (v === undefined ? delete s.eerdereStakingslijfrenten : (s.eerdereStakingslijfrenten = v)))}
            />
            <Bedrag
              label="Eerder omgezette oudedagsreserve"
              veld={veld('eerdereForOmzettingen')}
              value={sl?.eerdereForOmzettingen}
              onChange={(v) => pas((s) => (v === undefined ? delete s.eerdereForOmzettingen : (s.eerdereForOmzettingen = v)))}
            />
          </Rij>
        </Disclosure>
        {uit ? (
          <StatLijst className="rounded-xl border border-gray-200 bg-white px-4">
            <StatRow label="Ruimte voor een stakingslijfrente" bedrag={uit.ruimte} toelichting={`Maximum ${formatEuro(uit.maximum)} min ${formatEuro(uit.voorzieningen)} die je al opbouwde, en niet meer dan de stakingswinst.`} />
            <StatRow label="Aftrek dit jaar" variant="subtotaal" bedrag={uit.aftrek} />
          </StatLijst>
        ) : (
          <p className="text-xs text-gray-500">
            {persoon.ondernemingen.some((o) => o.staking) ? 'De ruimte verschijnt zodra de staking een uitkomst heeft.' : 'Geen staking in dit jaar: dan is een stakingslijfrente niet aftrekbaar.'}
          </p>
        )}
        {zvw > 0 && (
          <Alert variant="info">
            Je inkomen voor de Zvw-bijdrage gaat {formatEuro(zvw)} omlaag, omdat je de vrijval van je oudedagsreserve omzet in een lijfrente. Voor de rest van de stakingswinst geldt dat niet.
          </Alert>
        )}
        {meldingen.length > 0 && <WaarschuwingLijst waarschuwingen={meldingen} />}
      </div>
    </div>
  )
}
