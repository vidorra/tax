'use client'

/**
 * Ronde 2 (A2): inhoud van WoningSectie. Zoals in ronde 1 (WOZ, rente, financieringskosten, erfpacht, leningdelen), met:
 * - `veld`-props (data-veld) op alle velden, leningdelen op hun vaste id;
 * - per leningdeel het label Eigen woning of Box 3 met de reden, en de standen op 1 januari en 31 december in een
 *   uitklap, alleen bij twee of meer leningdelen, een splitsing of al ingevulde standen;
 * - een kale knop "Bijzondere situatie toevoegen" met Verhuisd, gekocht of verkocht en Niet het hele jaar in deze
 *   woning; een gekozen situatie wordt een SituatieBlok met Weghalen (met bevestiging) en Ongedaan maken.
 */
import { useMemo, useState } from 'react'
import type { EigenWoningInvoer, HuishoudenInvoer, HuishoudenResultaat, LeningdeelInvoer } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { itemSleutel, willekeurigeId, ID_PREFIX } from '@/lib/dossier/ids'
import { Disclosure, Select, Toggle, formatEuro } from '@/components/ui'
import { Bedrag, Datum, Lijst, Rij, Subkop, Tekst } from '../velden'
import type { Wijzig } from '../secties/types'
import { SituatieKiezer, type SituatieOptie } from '../regelingen/SituatieKiezer'
import { OngedaanMelding, SituatieBlok } from '../regelingen/SituatieBlok'
import { LeningdeelLabel, leningdeelSoort } from './LeningdeelLabel'
import { VerhuisdSituatie } from './VerhuisdSituatie'

const AFLOSSINGSVORM: Array<{ value: LeningdeelInvoer['aflossingsvorm']; label: string }> = [
  { value: 'annuitair', label: 'Annuïtair' },
  { value: 'lineair', label: 'Lineair' },
  { value: 'aflossingsvrij', label: 'Aflossingsvrij' },
  { value: 'overig', label: 'Anders' },
]

type SituatieId = 'verhuisd' | 'periode-hoofdverblijf'

const OPTIES: Record<SituatieId, SituatieOptie> = {
  verhuisd: { id: 'verhuisd', label: 'Verhuisd, gekocht of verkocht', uitleg: 'Overwaarde van je vorige woning, een nieuwe woning of een verbouwing met een nieuwe lening.' },
  'periode-hoofdverblijf': { id: 'periode-hoofdverblijf', label: 'Niet het hele jaar in deze woning', uitleg: 'Het eigenwoningforfait telt alleen voor de dagen dat dit je hoofdverblijf was.' },
}

const verhuisdActief = (ew: EigenWoningInvoer) => Boolean(ew.vorigeWoning || ew.aankoop || ew.eigenwoningreserve?.length || ew.verbeteringen?.length)
const verhuisdBedragen = (ew: EigenWoningInvoer) =>
  Boolean(ew.vorigeWoning || ew.aankoop || (ew.eigenwoningreserve ?? []).some((t) => t.bedrag !== 0) || (ew.verbeteringen ?? []).some((v) => v.kosten !== 0))

export function WoningSectieInhoud({ invoer, wijzig, resultaat }: { invoer: HuishoudenInvoer; wijzig: Wijzig; resultaat?: HuishoudenResultaat | null }) {
  const ew = invoer.eigenWoning
  const jaar = invoer.jaar
  const params = useMemo(() => {
    try {
      return getJaar(jaar)
    } catch {
      return null
    }
  }, [jaar])
  const [gekozen, setGekozen] = useState<ReadonlySet<SituatieId>>(() => new Set())
  const [nieuw, setNieuw] = useState<SituatieId | null>(null)
  const [ongedaan, setOngedaan] = useState<{ tekst: string; herstel: () => void } | null>(null)

  const splitsing = resultaat?.eigenWoning?.leningsplitsing ?? []
  const zetEw = (fn: (e: EigenWoningInvoer) => void) => wijzig((d) => void (d.eigenWoning && fn(d.eigenWoning)))

  const actief: Record<SituatieId, boolean> = {
    verhuisd: Boolean(ew && (verhuisdActief(ew) || gekozen.has('verhuisd'))),
    'periode-hoofdverblijf': Boolean(ew && (ew.periodeHoofdverblijf || gekozen.has('periode-hoofdverblijf'))),
  }

  function kies(id: string) {
    const s = id as SituatieId
    setGekozen((g) => new Set(g).add(s))
    setNieuw(s)
    setOngedaan(null)
    if (s === 'periode-hoofdverblijf') zetEw((e) => void (e.periodeHoofdverblijf ??= { van: `${jaar}-01-01`, tot: `${jaar}-12-31` }))
  }

  function haalWeg(s: SituatieId) {
    if (!ew) return
    const oud = structuredClone(ew)
    setGekozen((g) => {
      const n = new Set(g)
      n.delete(s)
      return n
    })
    if (nieuw === s) setNieuw(null)
    if (s === 'verhuisd') {
      zetEw((e) => {
        delete e.vorigeWoning
        delete e.aankoop
        delete e.eigenwoningreserve
        delete e.verbeteringen
      })
    } else zetEw((e) => void delete e.periodeHoofdverblijf)
    setOngedaan({
      tekst: `${OPTIES[s].label} is weggehaald.`,
      herstel: () => {
        zetEw((e) => {
          if (s === 'verhuisd') {
            for (const k of ['vorigeWoning', 'aankoop', 'eigenwoningreserve', 'verbeteringen'] as const) {
              if (oud[k] !== undefined) (e as unknown as Record<string, unknown>)[k] = structuredClone(oud[k])
            }
          } else if (oud.periodeHoofdverblijf) e.periodeHoofdverblijf = { ...oud.periodeHoofdverblijf }
        })
        setGekozen((g) => new Set(g).add(s))
        setOngedaan(null)
      },
    })
  }

  const opties = (Object.keys(OPTIES) as SituatieId[]).filter((id) => !actief[id]).map((id) => OPTIES[id])
  const meerdereOfSplitsing = (ew?.leningdelen?.length ?? 0) > 1

  return (
    <div className="space-y-5">
      {/* Zonder woning is de schakelaar de ingang voor zoeken op "hypotheek" of "WOZ" (veldregister prive.ts). */}
      <div data-veld={ew ? undefined : 'eigenWoning'} className="scroll-mt-24 rounded-xl">
        <Toggle label="Eigen woning als hoofdverblijf" checked={Boolean(ew)} onChange={(aan) => wijzig((d) => (aan ? (d.eigenWoning = { woz: 0 }) : delete d.eigenWoning))} />
      </div>
      {ew && (
        <>
          <Rij>
            <Bedrag label="WOZ-waarde" veld="eigenWoning/woz" hint={`Waardepeildatum 1 januari ${jaar - 1}.`} value={ew.woz} onChange={(v) => zetEw((e) => void (e.woz = v ?? 0))} />
            <Bedrag
              label="Betaalde hypotheekrente"
              veld="eigenWoning/rente"
              hint={ew.leningdelen?.length ? 'Wordt genegeerd omdat er leningdelen zijn ingevuld.' : 'Eenvoudige invoer: alle rente kwalificeert.'}
              value={ew.rente}
              onChange={(v) => zetEw((e) => void (e.rente = v))}
            />
            <Bedrag label="Financieringskosten" veld="eigenWoning/financieringskosten" value={ew.financieringskosten} onChange={(v) => zetEw((e) => void (e.financieringskosten = v))} />
            <Bedrag label="Erfpacht" veld="eigenWoning/erfpacht" value={ew.erfpacht} onChange={(v) => zetEw((e) => void (e.erfpacht = v))} />
          </Rij>
          <div>
            <Subkop>Leningdelen</Subkop>
            <Lijst<LeningdeelInvoer>
              items={ew.leningdelen}
              onChange={(l) => zetEw((e) => void (l.length ? (e.leningdelen = l) : delete e.leningdelen))}
              nieuw={() => ({ id: willekeurigeId(ID_PREFIX.leningdeel), omschrijving: '', hoofdsom: 0, startdatum: `${jaar - 5}-01-01`, aflossingsvorm: 'annuitair', rente: 0 })}
              titel={(l, i) => l.omschrijving || `Leningdeel ${i + 1}`}
              toevoegLabel="Leningdeel toevoegen"
            >
              {(l, pas, i) => {
                const sleutel = itemSleutel(l, i)
                const v = (veld: string) => `eigenWoning/leningdeel:${sleutel}/${veld}`
                const s = splitsing[i] && (!splitsing[i].id || splitsing[i].id === l.id) ? splitsing[i] : undefined
                const gesplitst = Boolean(l.eigenwoningschuld) || (s ? leningdeelSoort(s) === 'deels' : false)
                const standen = meerdereOfSplitsing || gesplitst || l.standBegin !== undefined || l.standEind !== undefined
                return (
                  <div className="space-y-4">
                    <LeningdeelLabel splitsing={s} params={params} />
                    <Rij>
                      <Tekst label="Omschrijving" verplicht veld={v('omschrijving')} value={l.omschrijving} onChange={(x) => pas((d) => void (d.omschrijving = x))} />
                      <Bedrag label="Hoofdsom" veld={v('hoofdsom')} value={l.hoofdsom} onChange={(x) => pas((d) => void (d.hoofdsom = x ?? 0))} />
                      <Datum label="Startdatum" verplicht veld={v('startdatum')} value={l.startdatum} onChange={(x) => pas((d) => void (d.startdatum = x ?? ''))} />
                      <div data-veld={v('aflossingsvorm')}>
                        <Select label="Aflossingsvorm" value={l.aflossingsvorm} onChange={(x) => pas((d) => void (d.aflossingsvorm = x))} options={AFLOSSINGSVORM} />
                      </div>
                      <Bedrag label="Betaalde rente" veld={v('rente')} value={l.rente} onChange={(x) => pas((d) => void (d.rente = x ?? 0))} />
                    </Rij>
                    <div data-veld={v('overgangsrecht')}>
                      <Toggle label="Overgangsrecht (schuld van vóór 2013)" checked={Boolean(l.overgangsrecht)} onChange={(aan) => pas((d) => void (d.overgangsrecht = aan || undefined))} />
                    </div>
                    {standen && (
                      <Disclosure
                        variant="kaal"
                        titel="Schuld op 1 januari en 31 december"
                        subtitel={gesplitst ? 'Met het deel eigen woning en het deel box 3' : 'Zoals op het jaaroverzicht van de geldverstrekker'}
                      >
                        <div className="space-y-3 pt-2">
                          <Rij>
                            <Bedrag label={`Schuld op 1 januari ${jaar}`} veld={v('standBegin')} value={l.standBegin} onChange={(x) => pas((d) => void (d.standBegin = x))} hint="Leeg is de hoofdsom." />
                            <Bedrag label={`Schuld op 31 december ${jaar}`} veld={v('standEind')} value={l.standEind} onChange={(x) => pas((d) => void (d.standEind = x))} hint="Leeg is de hoofdsom." />
                          </Rij>
                          {l.eigenwoningschuld && (
                            <p className="text-xs text-gray-600">
                              Deel eigenwoningschuld op 1 januari: {formatEuro(l.eigenwoningschuld.begin)} (uit {jaar - 1}, {l.eigenwoningschuld.reden === 'bijleenregeling' ? 'bijleenregeling' : 'aflossingseis'}). De rest
                              staat als schuld in box 3.
                            </p>
                          )}
                          {s && leningdeelSoort(s) !== 'eigen' && (
                            <table className="w-full text-left text-xs text-gray-700">
                              <caption className="sr-only">Deel eigen woning en deel box 3 van {l.omschrijving || 'dit leningdeel'}</caption>
                              <thead className="text-gray-500">
                                <tr>
                                  <th scope="col" className="py-1 pr-3 font-medium">Deel</th>
                                  <th scope="col" className="py-1 pr-3 text-right font-medium">1 januari</th>
                                  <th scope="col" className="py-1 text-right font-medium">31 december</th>
                                </tr>
                              </thead>
                              <tbody className="tabular-nums">
                                <tr>
                                  <th scope="row" className="py-1 pr-3 font-normal">Eigen woning</th>
                                  <td className="py-1 pr-3 text-right">{formatEuro(s.eigenwoningBegin)}</td>
                                  <td className="py-1 text-right">{formatEuro(s.eigenwoningEind)}</td>
                                </tr>
                                <tr>
                                  <th scope="row" className="py-1 pr-3 font-normal">Box 3</th>
                                  <td className="py-1 pr-3 text-right">{formatEuro(s.anderBegin)}</td>
                                  <td className="py-1 text-right">{formatEuro(s.anderEind)}</td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      </Disclosure>
                    )}
                  </div>
                )
              }}
            </Lijst>
          </div>
          {ongedaan && <OngedaanMelding tekst={ongedaan.tekst} onOngedaan={ongedaan.herstel} onSluit={() => setOngedaan(null)} />}
          {actief.verhuisd && (
            <SituatieBlok
              id="situatie-verhuisd"
              titel={OPTIES.verhuisd.label}
              situatie={OPTIES.verhuisd.label.toLowerCase()}
              heeftBedragen={verhuisdBedragen(ew)}
              onWeghalen={() => haalWeg('verhuisd')}
              focusBijTonen={nieuw === 'verhuisd'}
            >
              <VerhuisdSituatie invoer={invoer} wijzig={wijzig} resultaat={resultaat} params={params} />
            </SituatieBlok>
          )}
          {actief['periode-hoofdverblijf'] && (
            <SituatieBlok
              id="situatie-periode-hoofdverblijf"
              titel={OPTIES['periode-hoofdverblijf'].label}
              situatie={OPTIES['periode-hoofdverblijf'].label.toLowerCase()}
              heeftBedragen={false}
              onWeghalen={() => haalWeg('periode-hoofdverblijf')}
              focusBijTonen={nieuw === 'periode-hoofdverblijf'}
            >
              <Rij>
                <Datum
                  label="Hoofdverblijf van"
                  verplicht
                  veld="eigenWoning/periodeHoofdverblijf.van"
                  value={ew.periodeHoofdverblijf?.van}
                  onChange={(x) => zetEw((e) => void (e.periodeHoofdverblijf = { van: x ?? `${jaar}-01-01`, tot: e.periodeHoofdverblijf?.tot ?? `${jaar}-12-31` }))}
                />
                <Datum
                  label="Tot en met"
                  verplicht
                  veld="eigenWoning/periodeHoofdverblijf.tot"
                  value={ew.periodeHoofdverblijf?.tot}
                  onChange={(x) => zetEw((e) => void (e.periodeHoofdverblijf = { van: e.periodeHoofdverblijf?.van ?? `${jaar}-01-01`, tot: x ?? `${jaar}-12-31` }))}
                />
              </Rij>
            </SituatieBlok>
          )}
          <SituatieKiezer id="situaties-woning" opties={opties} onKies={kies} />
        </>
      )}
    </div>
  )
}
