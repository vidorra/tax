'use client'

import { Users } from 'lucide-react'
import type { KindInvoer } from '@/lib/tax/types'
import { leegPersoon } from '@/lib/dossier/leeg'
import { REKENLEEFTIJD } from '@/lib/dossier/bereken'
import { Button, ChipGroup, Disclosure, Section, Toggle } from '@/components/ui'
import { Bedrag, Datum, Getal, Lijst, Rij, Subkop, Tekst, VeldVak, nieuwId } from '../velden'
import { itemSleutel } from '@/lib/dossier/ids'
import { veld, veldVan } from '@/lib/dossier/veld'
import { persoonNaam, type SectieProps } from './types'

type Opvang = NonNullable<KindInvoer['opvang']>[number]

const OPVANG_LABEL: Record<Opvang['soort'], string> = { dagopvang: 'Dagopvang', bso: 'BSO', gastouder: 'Gastouder' }

export function HuishoudenSectie({ invoer, wijzig }: SectieProps) {
  const heeftB = invoer.personen.some((p) => p.id === 'B')
  return (
    <Section id="huishouden" icon={<Users />} title="Huishouden" subtitle="Personen, fiscaal partnerschap en kinderen">
      <div className="space-y-5">
        <VeldVak veld="huishouden/fiscaalPartner">
          {() => (
            <Toggle
              label="Fiscaal partner het hele jaar"
              description="Getrouwd, geregistreerd partner of samenwonend met een notarieel contract of een kind samen. Gemeenschappelijke posten kun je dan verdelen."
              checked={invoer.fiscaalPartner}
              onChange={(aan) =>
                wijzig((d) => {
                  d.fiscaalPartner = aan
                  if (aan && !d.personen.some((p) => p.id === 'B')) d.personen.push(leegPersoon('B', d.jaar))
                })
              }
            />
          )}
        </VeldVak>
        {invoer.personen.map((p) => (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">
                Persoon {p.id}
                {p.naam?.trim() ? `: ${p.naam.trim()}` : ''}
              </p>
              {p.id === 'B' && !invoer.fiscaalPartner && (
                <Button variant="kaal" grootte="sm" onClick={() => wijzig((d) => void (d.personen = d.personen.filter((x) => x.id !== 'B')))}>
                  Persoon B verwijderen
                </Button>
              )}
            </div>
            <Rij>
              <Tekst label="Naam of roepnaam" veld={veldVan.persoon(p.id, 'naam')} hint="Alleen voor jezelf, om de personen uit elkaar te houden." value={p.naam} onChange={(v) => wijzig((d) => void (d.personen.find((x) => x.id === p.id)!.naam = v))} />
              <Datum
                label="Geboortedatum"
                verplicht
                veld={veldVan.persoon(p.id, 'geboortedatum')}
                hint={p.geboortedatum ? undefined : `Nog niet ingevuld. Tot je hem invult, rekent de tool met iemand van ${REKENLEEFTIJD} jaar, zonder AOW.`}
                value={p.geboortedatum}
                onChange={(v) => wijzig((d) => void (d.personen.find((x) => x.id === p.id)!.geboortedatum = v ?? ''))}
              />
            </Rij>
          </div>
        ))}
        {!heeftB && !invoer.fiscaalPartner && (
          <Button variant="secundair" grootte="sm" onClick={() => wijzig((d) => void d.personen.push(leegPersoon('B', d.jaar)))}>
            Tweede persoon toevoegen
          </Button>
        )}

        <div>
          <Subkop>Kinderen</Subkop>
          <Lijst<KindInvoer>
            items={invoer.kinderen}
            onChange={(k) => wijzig((d) => void (d.kinderen = k))}
            nieuw={() => ({ id: nieuwId('kind'), geboortedatum: `${invoer.jaar - 2}-01-01` })}
            titel={(k, i) => k.naam?.trim() || `Kind ${i + 1}`}
            toevoegLabel="Kind toevoegen"
            leegTekst="Geen kinderen ingevuld."
          >
            {(k, pas, ki) => (
              <div className="space-y-4">
                <Rij kolommen={3}>
                  <Tekst label="Naam" veld={veld(`kind:${itemSleutel(k, ki)}`, 'naam')} value={k.naam} onChange={(v) => pas((x) => void (x.naam = v))} />
                  <Datum label="Geboortedatum" verplicht veld={veld(`kind:${itemSleutel(k, ki)}`, 'geboortedatum')} value={k.geboortedatum} onChange={(v) => pas((x) => void (x.geboortedatum = v ?? ''))} />
                  <Datum label="In het huishouden vanaf" veld={veld(`kind:${itemSleutel(k, ki)}`, 'inHuishoudenVanaf')} hint="Laat leeg als dat de geboortedatum is." value={k.inHuishoudenVanaf} onChange={(v) => pas((x) => (v ? (x.inHuishoudenVanaf = v) : delete x.inHuishoudenVanaf))} />
                </Rij>
                <Getal
                  label="Co-ouderschap: dagen per jaar in jullie huishouden"
                  veld={veld(`kind:${itemSleutel(k, ki)}`, 'coOuderschap.dagenInHuishouden')}
                  hint="Alleen invullen bij co-ouderschap."
                  suffix="dagen"
                  max={366}
                  value={k.coOuderschap?.dagenInHuishouden}
                  onChange={(v) => pas((x) => (v === undefined ? delete x.coOuderschap : (x.coOuderschap = { dagenInHuishouden: v })))}
                />
                <Disclosure variant="kaal" titel="Kinderopvang" subtitel={k.opvang?.length ? `${k.opvang.length} opvangsoort(en)` : 'Geen opvang ingevuld'} defaultOpen={Boolean(k.opvang?.length)}>
                  <Lijst<Opvang>
                    items={k.opvang}
                    onChange={(o) => pas((x) => (o.length ? (x.opvang = o) : delete x.opvang))}
                    nieuw={() => ({ soort: 'dagopvang', urenPerMaand: 0, uurtarief: 0, maanden: 12 })}
                    titel={(o) => OPVANG_LABEL[o.soort]}
                    toevoegLabel="Opvang toevoegen"
                  >
                    {(o, pasO, oi) => (
                      <div className="space-y-4">
                        <VeldVak veld={veld(`kind:${itemSleutel(k, ki)}`, `opvang:${oi}`, 'soort')}>
                          {() => (
                            <ChipGroup<Opvang['soort']>
                              label="Soort opvang"
                              kolommen={3}
                              value={o.soort}
                              onChange={(s) => pasO((x) => void (x.soort = s))}
                              options={(Object.keys(OPVANG_LABEL) as Opvang['soort'][]).map((s) => ({ value: s, label: OPVANG_LABEL[s] }))}
                            />
                          )}
                        </VeldVak>
                        <Rij>
                          <Getal label="Uren per maand" veld={veld(`kind:${itemSleutel(k, ki)}`, `opvang:${oi}`, 'urenPerMaand')} suffix="uur" value={o.urenPerMaand} onChange={(v) => pasO((x) => void (x.urenPerMaand = v ?? 0))} />
                          <Bedrag label="Uurtarief" veld={veld(`kind:${itemSleutel(k, ki)}`, `opvang:${oi}`, 'uurtarief')} decimalen={2} value={o.uurtarief} onChange={(v) => pasO((x) => void (x.uurtarief = v ?? 0))} />
                          <Getal label="Aantal maanden" veld={veld(`kind:${itemSleutel(k, ki)}`, `opvang:${oi}`, 'maanden')} suffix="mnd" max={12} value={o.maanden} onChange={(v) => pasO((x) => void (x.maanden = v ?? 0))} />
                          <Datum label="Startdatum" veld={veld(`kind:${itemSleutel(k, ki)}`, `opvang:${oi}`, 'startdatum')} hint="Voor de aanvraagtermijn van de toeslag." value={o.startdatum} onChange={(v) => pasO((x) => (v ? (x.startdatum = v) : delete x.startdatum))} />
                        </Rij>
                      </div>
                    )}
                  </Lijst>
                </Disclosure>
              </div>
            )}
          </Lijst>
        </div>
        {invoer.personen.length === 2 && !invoer.fiscaalPartner && (
          <p className="text-xs text-gray-500">
            {persoonNaam(invoer.personen[0])} en {persoonNaam(invoer.personen[1])} zijn geen fiscale partners; gemeenschappelijke posten worden dan niet verdeeld.
          </p>
        )}
      </div>
    </Section>
  )
}
