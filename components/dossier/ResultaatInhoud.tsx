'use client'

import type { HuishoudenResultaat, HuishoudenInvoer, Waarschuwing } from '@/lib/tax/types'
import { Disclosure, ResultBedrag, StatLijst, StatRow, UitlegLijst, WaarschuwingLijst, formatEuro, formatPct } from '@/components/ui'
import { persoonNaam } from './secties/types'
import { Disclaimer } from './Disclaimer'
import { GrensToelichting, PerPersoonNaGrenzen } from './planning/GrensRegels'
import type { ReactNode } from 'react'
import { BronbelastingSchuiftDoor } from './bronbelasting/BronbelastingSamenvatting'

export function alleWaarschuwingen(r: HuishoudenResultaat): Waarschuwing[] {
  const gezien = new Set<string>()
  return [...r.waarschuwingen, ...r.personen.flatMap((p) => p.waarschuwingen)].filter((w) => (gezien.has(w.id) ? false : (gezien.add(w.id), true)))
}

/** Ronde 2: te betalen IB na de grenzen als de engine die rekent, anders het berekende bedrag. */
export function teBetalenNaGrenzen(r: HuishoudenResultaat): number {
  return r.totaal.teBetalenIBNaGrenzen ?? r.totaal.teBetalenIB
}

const VERDEEL_LABEL: Record<string, string> = { eigenWoning: 'Eigen woning', pga: 'Persoonsgebonden aftrek', box3: 'Box 3', box2: 'Box 2', dividendbelasting: 'Dividendbelasting' }

export interface ResultaatInhoudProps {
  resultaat: HuishoudenResultaat
  invoer: HuishoudenInvoer
  /** Ronde 2 (A3): het blok Controles (ControlePaneel), direct onder het grote bedrag. */
  controles?: ReactNode
}

export function ResultaatInhoud(props: ResultaatInhoudProps) {
  const { resultaat: r, invoer } = props
  const naam = (id: string) => persoonNaam(invoer.personen.find((p) => p.id === id) ?? { id })
  const voorlopigIB = r.personen.reduce((s, p) => s + p.voorlopigeAanslag, 0)
  const partners = invoer.fiscaalPartner && r.personen.length === 2
  const waarschuwingen = alleWaarschuwingen(r)
  // Ronde 2: het grote bedrag volgt de aanslag- en teruggaafgrens (A2); de toelichting staat eronder (GrensRegels).
  const teBetalen = teBetalenNaGrenzen(r)
  return (
    <div className="space-y-5">
      <ResultBedrag
        label={teBetalen < 0 ? 'Terug inkomstenbelasting' : 'Te betalen inkomstenbelasting'}
        bedrag={Math.abs(teBetalen)}
        status={r.paramsStatus}
        toelichting={`${r.totaal.teBetalenZvw < 0 ? 'Terug' : 'Te betalen'} Zvw ${formatEuro(Math.abs(r.totaal.teBetalenZvw))}`}
      />
      <GrensToelichting resultaat={props.resultaat} invoer={props.invoer} />
      {props.controles}
      <StatLijst aria-label="Totalen">
        <StatRow label="Verschuldigde inkomstenbelasting" bedrag={r.totaal.verschuldigdIB} status={r.paramsStatus} />
        <StatRow label="Voorlopige aanslag inkomstenbelasting" bedrag={voorlopigIB} variant="min" />
        <StatRow label="Te betalen inkomstenbelasting" bedrag={r.totaal.teBetalenIB} variant="subtotaal" />
        <StatRow label="Bijdrage Zvw" bedrag={r.totaal.verschuldigdZvw} />
        <StatRow label="Te betalen Zvw" bedrag={r.totaal.teBetalenZvw} variant="subtotaal" />
        {r.totaal.toeslagen > 0 && <StatRow label="Toeslagen en kinderbijslag" bedrag={r.totaal.toeslagen} toelichting="Per jaar, op basis van het berekende toetsingsinkomen." />}
        {r.totaal.drukOpOmzet !== null && <StatRow label="IB en Zvw als deel van de omzet" bedrag={formatPct(r.totaal.drukOpOmzet, 1)} />}
      </StatLijst>

      {r.personen.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-gray-900">Per persoon</h3>
          <StatLijst>
            {r.personen.map((p) => (
              <StatRow
                key={p.id}
                label={naam(p.id)}
                bedrag={p.verschuldigdIB + p.zvw.bijdrage}
                toelichting={`Verzamelinkomen ${formatEuro(p.verzamelinkomen)}${p.marginaleDruk !== undefined ? ` · marginale druk ${formatPct(p.marginaleDruk, 1)}` : ''}`}
              />
            ))}
          </StatLijst>
          <PerPersoonNaGrenzen resultaat={props.resultaat} invoer={props.invoer} />
          <BronbelastingSchuiftDoor resultaat={r} jaar={invoer.jaar} naam={naam} />
        </div>
      )}

      {partners && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-gray-900">Verdeling {r.verdelingOptimaal ? '(optimaal)' : '(zelf gekozen)'}</h3>
          <StatLijst>
            {Object.entries(r.verdeling).map(([post, aandeel]) => (
              <StatRow key={post} label={VERDEEL_LABEL[post] ?? post} bedrag={`${naam('A')} ${formatPct(aandeel, 0)}`} />
            ))}
          </StatLijst>
        </div>
      )}

      {waarschuwingen.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-900">Meldingen ({waarschuwingen.length})</h3>
          <WaarschuwingLijst waarschuwingen={waarschuwingen} />
        </div>
      )}

      <div className="space-y-2">
        {r.personen.map((p) => (
          <Disclosure key={p.id} titel={`Berekening ${naam(p.id)}`} subtitel="In de volgorde van het fiscaal rapport" variant="kaal">
            <UitlegLijst regels={p.uitleg} aria-label={`Berekening ${naam(p.id)}`} />
          </Disclosure>
        ))}
        <Disclosure titel="Berekening huishouden" subtitel="Woning, box 3, verdeling en toeslagen" variant="kaal">
          <UitlegLijst regels={r.uitleg} aria-label="Berekening huishouden" />
        </Disclosure>
      </div>
      <Disclaimer />
    </div>
  )
}
