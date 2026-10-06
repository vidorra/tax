'use client'

/**
 * Ronde 2 (A2): inhoud van Box2Sectie. De belangen zoals in ronde 1 (met `veld`-props op de vaste id), daaronder:
 * - de uitleg bij een negatief box 2-inkomen (trigger, Box2Verlies);
 * - alleen als er box 2 is of een saldo: een kale knop "Bijzondere situatie toevoegen" met Verlies uit eerdere jaren
 *   (VerliezenLijst per persoon) en Ik heb geen aanmerkelijk belang meer (belastingkorting, art. 4.53), elk als
 *   SituatieBlok met Weghalen en Ongedaan maken.
 * Belastingkorting: de engine volgt de wet (`uiterlijkJaar`); `praktijkUiterlijkJaar` staat er als grijze melding
 * (besluit na de nacontrole, ontwerp 9.6). Geen controle, geen rekenverschil.
 */
import { useMemo, useState } from 'react'
import type { Box2Invoer, HuishoudenInvoer, HuishoudenResultaat, PersoonInvoer } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { ID_PREFIX, itemSleutel, willekeurigeId } from '@/lib/dossier/ids'
import { Disclosure, Select, StatLijst, StatRow, Toggle, formatEuro, formatPct } from '@/components/ui'
import { Bedrag, Getal, Lijst, Rij, Subkop } from '../velden'
import { persoonNaam, type Wijzig } from '../secties/types'
import { SituatieKiezer, type SituatieOptie } from '../regelingen/SituatieKiezer'
import { OngedaanMelding, SituatieBlok } from '../regelingen/SituatieBlok'
import { Box2Verlies } from './Box2Verlies'
import { VerliezenLijst } from './VerliezenLijst'

type SituatieId = 'box2-verlies' | 'box2-korting'
type Korting = NonNullable<NonNullable<PersoonInvoer['box2Belastingkorting']>['lopend']>[number]

const OPTIES: Record<SituatieId, SituatieOptie> = {
  'box2-verlies': { id: 'box2-verlies', label: 'Verlies uit eerdere jaren', uitleg: 'Een verlies uit aanmerkelijk belang dat je nog kunt verrekenen met box 2-inkomen.' },
  'box2-korting': { id: 'box2-korting', label: 'Ik heb geen aanmerkelijk belang meer', uitleg: 'Een verlies dat je niet meer kunt verrekenen, omzetten in een korting op de belasting in box 1.' },
}

const heeftVerliezen = (p: PersoonInvoer) => (p.box2Verliezen ?? []).length > 0
const heeftKorting = (p: PersoonInvoer) => Boolean(p.box2Belastingkorting?.verzoek || (p.box2Belastingkorting?.lopend ?? []).length > 0)

export function Box2SectieInhoud({ invoer, wijzig, resultaat }: { invoer: HuishoudenInvoer; wijzig: Wijzig; resultaat?: HuishoudenResultaat | null }) {
  const jaar = invoer.jaar
  const params = useMemo(() => {
    try {
      return getJaar(jaar)
    } catch {
      return null
    }
  }, [jaar])
  const personen = invoer.personen.map((p) => ({ value: p.id, label: persoonNaam(p) }))
  const twee = invoer.personen.length > 1
  const [gekozen, setGekozen] = useState<ReadonlySet<SituatieId>>(() => new Set())
  const [nieuw, setNieuw] = useState<SituatieId | null>(null)
  const [ongedaan, setOngedaan] = useState<{ tekst: string; herstel: () => void } | null>(null)

  const actief: Record<SituatieId, boolean> = {
    'box2-verlies': invoer.personen.some(heeftVerliezen) || gekozen.has('box2-verlies'),
    'box2-korting': invoer.personen.some(heeftKorting) || gekozen.has('box2-korting'),
  }
  const kiezerZichtbaar = (invoer.box2 ?? []).length > 0 || actief['box2-verlies'] || actief['box2-korting']
  const opties = (Object.keys(OPTIES) as SituatieId[]).filter((id) => !actief[id]).map((id) => OPTIES[id])

  const wijzigPersoon = (id: string, fn: (p: PersoonInvoer) => void) =>
    wijzig((d) => {
      const p = d.personen.find((q) => q.id === id)
      if (p) fn(p)
    })

  function kies(id: string) {
    const s = id as SituatieId
    setGekozen((g) => new Set(g).add(s))
    setNieuw(s)
    setOngedaan(null)
  }

  function haalWeg(s: SituatieId) {
    const oud = invoer.personen.map((p) => ({ id: p.id, verliezen: structuredClone(p.box2Verliezen), korting: structuredClone(p.box2Belastingkorting) }))
    setGekozen((g) => {
      const n = new Set(g)
      n.delete(s)
      return n
    })
    if (nieuw === s) setNieuw(null)
    wijzig((d) => {
      for (const p of d.personen) {
        if (s === 'box2-verlies') delete p.box2Verliezen
        else delete p.box2Belastingkorting
      }
    })
    setOngedaan({
      tekst: `${OPTIES[s].label} is weggehaald.`,
      herstel: () => {
        wijzig((d) => {
          for (const p of d.personen) {
            const o = oud.find((x) => x.id === p.id)
            if (!o) continue
            if (s === 'box2-verlies' && o.verliezen) p.box2Verliezen = o.verliezen
            if (s === 'box2-korting' && o.korting) p.box2Belastingkorting = o.korting
          }
        })
        setGekozen((g) => new Set(g).add(s))
        setOngedaan(null)
      },
    })
  }

  const eersteTarief = params?.box2.waarde.schijven[0]?.tarief

  return (
    <div className="space-y-5">
      <Lijst<Box2Invoer>
        items={invoer.box2}
        onChange={(l) => wijzig((d) => (l.length ? (d.box2 = l) : delete d.box2))}
        nieuw={() => ({ id: willekeurigeId(ID_PREFIX.box2), eigenaar: 'A', dividend: 0, ingehoudenDividendbelasting: 0 })}
        titel={(b) => `BV van ${persoonNaam(invoer.personen.find((p) => p.id === b.eigenaar) ?? { id: b.eigenaar })}`}
        toevoegLabel="Aanmerkelijk belang toevoegen"
        leegTekst="Geen aanmerkelijk belang."
      >
        {(b, pas, i) => {
          const v = (veld: string) => `box2:${itemSleutel(b, i)}/${veld}`
          return (
            <Rij>
              <div data-veld={v('eigenaar')}>
                <Select<'A' | 'B'> label="Aandeelhouder" value={b.eigenaar} onChange={(x) => pas((d) => void (d.eigenaar = x))} options={personen as Array<{ value: 'A' | 'B'; label: string }>} />
              </div>
              <Bedrag label="Dividend" veld={v('dividend')} value={b.dividend} onChange={(x) => pas((d) => void (d.dividend = x ?? 0))} />
              <Bedrag label="Ingehouden dividendbelasting" veld={v('ingehoudenDividendbelasting')} value={b.ingehoudenDividendbelasting} onChange={(x) => pas((d) => void (d.ingehoudenDividendbelasting = x ?? 0))} />
              <Bedrag label="Vervreemdingsvoordeel" negatief veld={v('vervreemdingsvoordeel')} value={b.vervreemdingsvoordeel} onChange={(x) => pas((d) => void (d.vervreemdingsvoordeel = x))} />
              <Bedrag label="Schuld aan de BV" veld={v('schuldAanBV')} value={b.schuldAanBV} onChange={(x) => pas((d) => void (d.schuldAanBV = x))} />
            </Rij>
          )
        }}
      </Lijst>

      <Box2Verlies invoer={invoer} wijzig={wijzig} resultaat={resultaat} params={params} />

      {ongedaan && <OngedaanMelding tekst={ongedaan.tekst} onOngedaan={ongedaan.herstel} onSluit={() => setOngedaan(null)} />}

      {actief['box2-verlies'] && (
        <SituatieBlok
          id="situatie-box2-verlies"
          titel={OPTIES['box2-verlies'].label}
          situatie="verlies uit eerdere jaren"
          heeftBedragen={invoer.personen.some((p) => (p.box2Verliezen ?? []).some((x) => x.bedrag !== 0))}
          onWeghalen={() => haalWeg('box2-verlies')}
          focusBijTonen={nieuw === 'box2-verlies'}
        >
          <p className="mb-3 text-xs text-gray-500">Per jaar waarin het verlies ontstond: wat volgens de verliesbeschikking nog openstaat. De oudste verliezen gaan eerst.</p>
          <div className="space-y-4">
            {invoer.personen.map((p) => {
              const r = resultaat?.personen.find((x) => x.id === p.id)?.box2Verlies
              return (
                <div key={p.id} data-veld={`persoon:${p.id}/box2Verliezen`}>
                  {twee && <Subkop>{persoonNaam(p)}</Subkop>}
                  <VerliezenLijst
                    items={p.box2Verliezen}
                    onChange={(l) => wijzigPersoon(p.id, (q) => (l.length ? (q.box2Verliezen = l) : delete q.box2Verliezen))}
                    jaar={jaar}
                    params={params}
                  />
                  {r && r.verrekend > 0 && <p className="mt-2 text-sm text-gray-700">Dit jaar verrekend met je box 2-inkomen: {formatEuro(r.verrekend)}.</p>}
                </div>
              )
            })}
          </div>
        </SituatieBlok>
      )}

      {actief['box2-korting'] && (
        <SituatieBlok
          id="situatie-box2-korting"
          titel={OPTIES['box2-korting'].label}
          situatie="geen aanmerkelijk belang meer"
          heeftBedragen={invoer.personen.some((p) => (p.box2Belastingkorting?.lopend ?? []).some((k) => k.restant !== 0))}
          onWeghalen={() => haalWeg('box2-korting')}
          focusBijTonen={nieuw === 'box2-korting'}
        >
          <div className="space-y-5">
            {invoer.personen.map((p) => {
              const k = resultaat?.personen.find((x) => x.id === p.id)?.box2Verlies?.belastingkorting
              return (
                <div key={p.id} className="space-y-3">
                  {twee && <Subkop>{persoonNaam(p)}</Subkop>}
                  <div data-veld={`persoon:${p.id}/box2Belastingkorting.verzoek`}>
                    <Toggle
                      label="Verlies omzetten in een belastingkorting"
                      description={`Dat kan als je dit jaar en vorig jaar geen aanmerkelijk belang had, je fiscale partner ook niet. Je krijgt dan ${eersteTarief !== undefined ? formatPct(eersteTarief, 2) : 'het tarief van de eerste schijf box 2'} van het verlies als korting op de belasting in box 1.`}
                      checked={Boolean(p.box2Belastingkorting?.verzoek)}
                      onChange={(aan) =>
                        wijzigPersoon(p.id, (q) => {
                          const kort = { ...(q.box2Belastingkorting ?? {}) }
                          if (aan) kort.verzoek = true
                          else delete kort.verzoek
                          if (Object.keys(kort).length > 0) q.box2Belastingkorting = kort
                          else delete q.box2Belastingkorting
                        })
                      }
                    />
                  </div>
                  <LopendeKortingen
                    items={p.box2Belastingkorting?.lopend}
                    jaar={jaar}
                    onChange={(l) =>
                      wijzigPersoon(p.id, (q) => {
                        const kort = { ...(q.box2Belastingkorting ?? {}) }
                        if (l.length > 0) kort.lopend = l
                        else delete kort.lopend
                        if (Object.keys(kort).length > 0) q.box2Belastingkorting = kort
                        else delete q.box2Belastingkorting
                      })
                    }
                  />
                  {k && (k.ditJaar > 0 || k.resterend.length > 0) && (
                    <div className="space-y-2">
                      <StatLijst aria-label={`Belastingkorting box 2${twee ? `, ${persoonNaam(p)}` : ''}`}>
                        {k.ditJaar > 0 && <StatRow label="Dit jaar van je belasting in box 1 af" bedrag={k.ditJaar} />}
                        {k.resterend.map((x) => (
                          <StatRow key={`${x.verliesjaar}-${x.eersteJaar}`} label={`Nog over uit het verlies van ${x.verliesjaar}`} bedrag={x.restant} toelichting={`Volgens de wet tot en met ${x.uiterlijkJaar}`} />
                        ))}
                      </StatLijst>
                      {k.resterend
                        .filter((x) => x.praktijkUiterlijkJaar !== undefined)
                        .map((x) => (
                          <p key={`p-${x.verliesjaar}-${x.eersteJaar}`} className="text-xs text-gray-500">
                            Volgens de wet loopt de korting tot en met {x.uiterlijkJaar}. Een rekenvoorbeeld van de Belastingdienst eindigt een jaar eerder, in {x.praktijkUiterlijkJaar}. Wij rekenen met de wet; houd
                            er rekening mee dat de Belastingdienst het restant in {x.uiterlijkJaar} mogelijk niet meer verrekent.
                          </p>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SituatieBlok>
      )}

      {kiezerZichtbaar && <SituatieKiezer id="situaties-box2" opties={opties} onKies={kies} />}
    </div>
  )
}

/** Eerder omgezette kortingen (de doorrol vult ze; zonder dossier van vorig jaar vul je ze hier in). */
function LopendeKortingen({ items, jaar, onChange }: { items: Korting[] | undefined; jaar: number; onChange: (l: Korting[]) => void }) {
  if (!items?.length) {
    return (
      <Disclosure variant="kaal" titel="Al eerder een korting gekregen?" subtitel="Een korting die doorloopt uit een eerder jaar">
        <div className="pt-2">
          <KortingLijst items={items} jaar={jaar} onChange={onChange} />
        </div>
      </Disclosure>
    )
  }
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-900">Korting uit eerdere jaren</p>
      <KortingLijst items={items} jaar={jaar} onChange={onChange} />
    </div>
  )
}

function KortingLijst({ items, jaar, onChange }: { items: Korting[] | undefined; jaar: number; onChange: (l: Korting[]) => void }) {
  return (
    <Lijst<Korting>
      items={items}
      onChange={onChange}
      nieuw={() => ({ verliesjaar: jaar - 2, eersteJaar: jaar - 1, restant: 0 })}
      titel={(k) => `Korting uit verlies ${k.verliesjaar} · ${formatEuro(k.restant)}`}
      toevoegLabel="Korting toevoegen"
    >
      {(k, pas) => (
        <Rij kolommen={3}>
          <Getal label="Verliesjaar" min={jaar - 15} max={jaar - 1} value={k.verliesjaar} onChange={(n) => pas((x) => void (x.verliesjaar = n ?? jaar - 1))} />
          <Getal label="Eerste jaar met korting" min={jaar - 15} max={jaar} value={k.eersteJaar} onChange={(n) => pas((x) => void (x.eersteJaar = n ?? jaar))} />
          <Bedrag label="Nog over aan korting" hint="In euro's, zoals op de beschikking." value={k.restant} onChange={(n) => pas((x) => void (x.restant = n ?? 0))} />
        </Rij>
      )}
    </Lijst>
  )
}
