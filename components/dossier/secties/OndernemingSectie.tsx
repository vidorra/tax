'use client'

import { useMemo } from 'react'
import { Briefcase } from 'lucide-react'
import type { DesinvesteringInvoer, InvesteringInvoer, OndernemingInvoer, OndernemingResultaat, OpdrachtgeverInvoer, PersoonResultaat, TaxYearParams } from '@/lib/tax/types'
import { leegOnderneming } from '@/lib/dossier/leeg'
import { itemSleutel } from '@/lib/dossier/ids'
import { veldVan } from '@/lib/dossier/veld'
import { neemOver } from '@/lib/moneybird/overname'
import { berekenOnderneming } from '@/lib/tax/modules/onderneming'
import { toetsUrencriterium } from '@/lib/tax/modules/onderneming/urencriterium'
import { JAREN, getJaar } from '@/lib/tax/years'
import { Alert, ChipGroup, Disclosure, Section, Select, Toggle, WaarschuwingLijst, formatEuro, formatGetal } from '@/components/ui'
import { Bedrag, Datum, Getal, Lijst, Rij, Subkop, Tekst } from '../velden'
import { MoneybirdImport } from '../koppelingen/MoneybirdImport'
import { bronTekst } from '../koppelingen/indeling'
import { useKoppelingen } from '../koppelingen/useKoppelingen'
import { ActivaInvoer } from './ActivaInvoer'
import { wisselWinstberekening } from './activaregister'
import { JaarrekeningInvoer } from './JaarrekeningInvoer'
import { persoonNaam, type PersoonSectieProps } from './types'
import { AutoBlok } from '../regelingen/AutoBlok'
import { HirAfboeking } from '../regelingen/HirSituatie'
import { OndernemingSituatieLijst, situatieAnker } from '../regelingen/OndernemingSituatieLijst'
import { ReservesBlok } from '../regelingen/ReservesBlok'
import { WinstBronVraag } from '../regelingen/WinstBronVraag'
import { ONDERNEMING_SITUATIES, type OndernemingSituatieContext } from '../regelingen/onderneming-situaties'
import { regelingenMetWinstBron } from '../regelingen/onderneming-regelingen'

const REGELING: Array<{ value: NonNullable<InvesteringInvoer['regeling']>; label: string }> = [
  { value: 'kia', label: 'Kleinschaligheidsinvesteringsaftrek (KIA)' },
  { value: 'eia', label: 'Energie-investeringsaftrek (EIA)' },
  { value: 'mia-1', label: 'Milieu-investeringsaftrek, categorie I' },
  { value: 'mia-2', label: 'Milieu-investeringsaftrek, categorie II' },
  { value: 'mia-3', label: 'Milieu-investeringsaftrek, categorie III' },
  { value: 'geen', label: 'Geen investeringsaftrek' },
]

type UrenAntwoord = 'ja' | 'nee' | 'uren'

/** Het antwoord op de vraag; zonder antwoord en zonder uren geldt ja (zo rekent de engine ook). */
function urenAntwoord(o: OndernemingInvoer): UrenAntwoord {
  if (o.uren.urencriteriumGehaald === true) return 'ja'
  if (o.uren.urencriteriumGehaald === false) return 'nee'
  return heeftUren(o) ? 'uren' : 'ja'
}

function heeftUren(o: OndernemingInvoer): boolean {
  return o.uren.onderneming > 0 || (o.uren.zwangerschapWeken ?? 0) > 0
}

function paramsVan(jaar: number): TaxYearParams | null {
  try {
    return getJaar(jaar)
  } catch {
    return null
  }
}

/** Urencriterium als vraag (standaard ja), met de uren als optionele onderbouwing. */
function UrenVraag({
  o,
  pas,
  jaar,
  params,
  urenLoondienst,
  v,
}: {
  o: OndernemingInvoer
  pas: (fn: (x: OndernemingInvoer) => void) => void
  jaar: number
  params: TaxYearParams | null
  urenLoondienst: number
  v: (pad: string) => string
}) {
  const antwoord = urenAntwoord(o)
  const drempel = params?.ondernemer.waarde.urencriterium.uren
  const toets = useMemo(
    () =>
      params && heeftUren(o)
        ? toetsUrencriterium(o.uren, { params, jaar, startjaar: o.startjaar, urenLoondienst, arbeidsongeschiktStarter: o.arbeidsongeschiktStarter !== undefined })
        : null,
    [params, o, jaar, urenLoondienst],
  )
  const opties: Array<{ value: UrenAntwoord; label: string }> = [
    { value: 'ja', label: 'Ja' },
    { value: 'nee', label: 'Nee' },
  ]
  if (heeftUren(o) || antwoord === 'uren') opties.push({ value: 'uren', label: 'Uit mijn uren' })

  return (
    <div className="space-y-4">
      <div data-veld={v('uren.urencriteriumGehaald')}>
      <ChipGroup<UrenAntwoord>
        label="Voldoe je aan het urencriterium?"
        kolommen={opties.length === 3 ? 3 : 2}
        value={antwoord}
        onChange={(v) => pas((x) => (v === 'uren' ? delete x.uren.urencriteriumGehaald : (x.uren.urencriteriumGehaald = v === 'ja')))}
        options={opties}
        hint={`${drempel ? `Minstens ${formatGetal(drempel)} uur` : 'Het vereiste aantal uren'} per jaar aan je onderneming, inclusief indirecte uren zoals administratie, acquisitie en scholing, en meer dan de helft van je werktijd. De bewijslast ligt bij jou, dus houd bij waar je tijd naartoe gaat.`}
      />
      </div>
      {antwoord === 'nee' && (
        <Alert variant="info">
          Zonder urencriterium krijg je geen zelfstandigenaftrek en geen startersaftrek. De mkb-winstvrijstelling krijg je wel. Haal je het urencriterium twee jaar achter elkaar niet, dan neemt
          een oudedagsreserve (FOR) verplicht af met het deel dat hoger is dan je ondernemingsvermogen aan het einde van het jaar. Die afname telt mee in je winst.
        </Alert>
      )}
      {antwoord === 'uren' && <p className="text-sm text-gray-600">We toetsen het urencriterium aan de uren die je hieronder hebt ingevuld.</p>}
      {toets && toets.waarschuwingen.length > 0 && <WaarschuwingLijst waarschuwingen={toets.waarschuwingen} />}

      <Disclosure variant="kaal" titel="Uren invullen (optioneel)" subtitel="Uren aan de onderneming en in loondienst, en zwangerschapsverlof" defaultOpen={heeftUren(o)}>
        <Rij className="pt-2">
          <Getal label="Uren aan de onderneming" suffix="uur" veld={v('uren.onderneming')} hint="Directe en indirecte uren in het hele jaar." value={o.uren.onderneming || undefined} onChange={(w) => pas((x) => void (x.uren.onderneming = w ?? 0))} />
          <Getal label="Uren in loondienst" suffix="uur" veld={v('uren.loondienst')} value={o.uren.loondienst} onChange={(w) => pas((x) => void (x.uren.loondienst = w))} />
          <Getal label="Weken zwangerschaps- en bevallingsverlof" suffix="weken" max={52} veld={v('uren.zwangerschapWeken')} value={o.uren.zwangerschapWeken} onChange={(w) => pas((x) => void (x.uren.zwangerschapWeken = w))} />
          <Getal
            label="Gemiddelde uren per week vóór het verlof"
            suffix="uur"
            decimalen={1}
            veld={v('uren.gemiddeldeUrenPerWeekVoorVerlof')}
            value={o.uren.gemiddeldeUrenPerWeekVoorVerlof}
            onChange={(w) => pas((x) => void (x.uren.gemiddeldeUrenPerWeekVoorVerlof = w))}
          />
        </Rij>
        {antwoord !== 'uren' && heeftUren(o) && (
          <p className="mt-3 text-xs text-gray-500">Je antwoord op de vraag hierboven gaat voor. Wil je dat we het urencriterium uit deze uren afleiden, kies dan Uit mijn uren.</p>
        )}
      </Disclosure>
    </div>
  )
}

/** Saldo vóór fiscale correcties: bij 'uitgesplitst' alle ingevulde posten, zoals de engine het saldo opbouwt. */
function saldoVan(o: OndernemingInvoer): number {
  const w = o.winstberekening
  if (w.soort === 'saldo') return w.saldo
  return (
    w.omzet + (w.wijzigingOnderhandenWerk ?? 0) + (w.financieleBatenLasten ?? 0) - w.kosten - (w.afschrijvingen ?? 0) - (o.beperktAftrekbaar ?? 0) - (o.auto?.autokosten ?? 0)
  )
}

/**
 * Uitkomst van de engine voor één onderneming (voor de afschrijving per bedrijfsmiddel en de investeringsaftrek
 * bij een Moneybird-import). Komt uit het resultaat van het huishouden als dat is meegegeven, anders uit de
 * module van de engine zelf. null als de berekening met deze invoer niet lukt.
 */
function uitkomstOnderneming(o: OndernemingInvoer, index: number, resultaat: PersoonResultaat | null | undefined, params: TaxYearParams | null, jaar: number, urenLoondienst: number): OndernemingResultaat | null {
  const uitResultaat = resultaat?.ondernemingen[index]
  if (uitResultaat && uitResultaat.naam === o.naam) return uitResultaat
  if (!params) return null
  try {
    // Zelfde context als de engine (zonder AOW, dat raakt alleen de FOR); eerdere jaren met hun eigen parameters.
    return berekenOnderneming(o, { params, jaar, aowBereikt: false, urenLoondienst, paramsVoorJaar: (j) => JAREN[j] })
  } catch {
    return null
  }
}

export function OndernemingSectie({ persoon, wijzigPersoon, jaar, resultaat, huishouden }: PersoonSectieProps & { resultaat?: PersoonResultaat | null }) {
  const koppelingen = useKoppelingen()
  const params = useMemo(() => paramsVan(jaar), [jaar])
  const urenLoondienst = persoon.ondernemingen.reduce((m, o) => Math.max(m, o.uren.loondienst ?? 0), 0)
  const drempel = params?.ondernemer.waarde.desinvestering.drempel
  return (
    <Section id={`ondernemingen-${persoon.id}`} icon={<Briefcase />} title="Ondernemingen" subtitle={`Winst, investeringen, uren en opdrachtgevers van ${persoonNaam(persoon)}`}>
      <Lijst<OndernemingInvoer>
        items={persoon.ondernemingen}
        onChange={(o) => wijzigPersoon((p) => void (p.ondernemingen = o))}
        nieuw={() => leegOnderneming(jaar)}
        titel={(o) => `${o.naam || 'Onderneming'} · ${formatEuro(saldoVan(o))}`}
        toevoegLabel="Onderneming toevoegen"
        leegTekst="Geen onderneming. Voeg er een toe als deze persoon winst uit onderneming heeft."
        toevoegVeld={persoon.ondernemingen.length === 0 ? veldVan.persoon(persoon.id, 'ondernemingen') : undefined}
      >
        {(o, pas, index) => {
          const ondId = itemSleutel(o, index)
          const v = (pad: string) => veldVan.onderneming(persoon.id, ondId, pad)
          const uitkomst = uitkomstOnderneming(o, index, resultaat, params, jaar, urenLoondienst)
          const ctx: OndernemingSituatieContext = {
            jaar,
            params,
            persoon,
            ondernemingIndex: index,
            ondernemingId: ondId,
            onderneming: o,
            pas,
            ...(huishouden ? { huishouden } : {}),
            uitkomst: { onderneming: uitkomst, persoon: resultaat ?? null },
          }
          // De vraag naar de herkomst van de winst alleen als een regeling die ervan afhangt speelt (of als hij al is beantwoord).
          const partnerActief = ONDERNEMING_SITUATIES.find((s) => s.id === 'partner')?.actief(ctx) ?? false
          const winstBronNodig = o.winstBron !== undefined || regelingenMetWinstBron(o, partnerActief).length > 0
          const metReserves = (o.herinvesteringsreserves?.length ?? 0) + (o.egalisatiereserves?.length ?? 0) > 0
          return (
          <div className="space-y-5">
            {o.bron && <p className="-mt-1 text-xs text-gray-500">{bronTekst(o.bron)}</p>}
            <MoneybirdImport
              onderneming={o}
              jaar={jaar}
              koppelingen={koppelingen}
              onOvernemen={(imp, opties) =>
                pas((x) => {
                  const nieuw = neemOver(x, imp, opties, uitkomstOnderneming(x, index, resultaat, params, jaar, urenLoondienst))
                  for (const k of Object.keys(x)) delete (x as unknown as Record<string, unknown>)[k]
                  Object.assign(x, nieuw)
                })
              }
            />
            <Rij>
              {/* Ronde 2 (contract): veld-id's van naam en saldo, zodat de controles (A3) er al naartoe kunnen springen. */}
              <Tekst label="Naam" verplicht veld={veldVan.onderneming(persoon.id, itemSleutel(o, index), 'naam')} value={o.naam} onChange={(v) => pas((x) => void (x.naam = v))} />
              <Getal
                label="Startjaar"
                min={1900}
                max={jaar}
                veld={v('startjaar')}
                value={o.startjaar}
                onChange={(w) => pas((x) => void (x.startjaar = w ?? jaar))}
                hint="Starter ben je de eerste 5 jaar, als je in de 5 jaar daarvoor geen onderneming had. Dat geeft startersaftrek."
              />
            </Rij>

            <div>
              <div data-veld={v('winstberekening.soort')}>
              <ChipGroup<'saldo' | 'uitgesplitst'>
                label="Winstberekening"
                kolommen={2}
                value={o.winstberekening.soort}
                onChange={(s) =>
                  pas((x) => {
                    if (s === x.winstberekening.soort) return
                    x.winstberekening = wisselWinstberekening(x.winstberekening, s, saldoVan(x))
                  })
                }
                options={[
                  { value: 'saldo', label: 'Saldo uit het rapport', beschrijving: 'Eén bedrag' },
                  { value: 'uitgesplitst', label: 'Uitgesplitst', beschrijving: 'Omzet en kosten' },
                ]}
              />
              </div>
              <div className="mt-4">
                {o.winstberekening.soort === 'saldo' ? (
                  <Rij>
                    <Bedrag
                      label="Saldo fiscale winstberekening"
                      veld={veldVan.onderneming(persoon.id, itemSleutel(o, index), 'winstberekening.saldo')}
                      negatief
                      hint="Na aftrek van alle kosten, inclusief de beperkt aftrekbare kosten."
                      value={o.winstberekening.saldo}
                      onChange={(v) => pas((x) => void (x.winstberekening.soort === 'saldo' ? (x.winstberekening.saldo = v ?? 0) : (x.winstberekening = { soort: 'saldo', saldo: v ?? 0 })))}
                    />
                    {(o.activa?.length ?? 0) > 0 && (
                      <Bedrag
                        label="Afschrijving in dit saldo, zoals geboekt"
                        veld={v('winstberekening.afschrijvingenInSaldo')}
                        hint={
                          o.activaVolledig === true
                            ? 'Wat je boekhouding in dit saldo aan afschrijving heeft afgetrokken, op al je bedrijfsmiddelen samen. We vervangen dat door de fiscale afschrijving van de bedrijfsmiddelen hieronder. Laat je dit leeg, dan telt het register niet mee.'
                            : 'Wat je boekhouding in dit saldo aan afschrijving heeft afgetrokken. Staan niet al je bedrijfsmiddelen in het register hieronder, dan blijft dit bedrag staan en vergelijken we het alleen met de fiscale afschrijving.'
                        }
                        value={o.winstberekening.afschrijvingenInSaldo}
                        onChange={(v) =>
                          pas((x) => {
                            if (x.winstberekening.soort !== 'saldo') return
                            if (v === undefined) delete x.winstberekening.afschrijvingenInSaldo
                            else x.winstberekening.afschrijvingenInSaldo = v
                          })
                        }
                      />
                    )}
                  </Rij>
                ) : (
                  <Rij>
                    <Bedrag label="Omzet" veld={v('winstberekening.omzet')} value={o.winstberekening.omzet} onChange={(w) => pas((x) => void (x.winstberekening.soort === 'uitgesplitst' && (x.winstberekening.omzet = w ?? 0)))} />
                    <Bedrag
                      label="Kosten"
                      veld={v('winstberekening.kosten')}
                      hint="Zonder afschrijvingen, beperkt aftrekbare kosten en autokosten."
                      value={o.winstberekening.kosten}
                      onChange={(v) => pas((x) => void (x.winstberekening.soort === 'uitgesplitst' && (x.winstberekening.kosten = v ?? 0)))}
                    />
                    <Bedrag
                      label="Afschrijvingen"
                      veld={v('winstberekening.afschrijvingen')}
                      hint={
                        (o.activa?.length ?? 0) === 0
                          ? undefined
                          : o.activaVolledig === true
                            ? 'Zoals geboekt. Al je bedrijfsmiddelen staan hieronder, dus we rekenen met hun fiscale afschrijving.'
                            : 'Zoals geboekt. Hiermee rekenen we, tenzij je hieronder aangeeft dat al je bedrijfsmiddelen in het register staan.'
                      }
                      value={o.winstberekening.afschrijvingen}
                      onChange={(v) => pas((x) => void (x.winstberekening.soort === 'uitgesplitst' && (x.winstberekening.afschrijvingen = v)))}
                    />
                    <Bedrag
                      label="Wijziging onderhanden werk"
                      veld={v('winstberekening.wijzigingOnderhandenWerk')}
                      negatief
                      value={o.winstberekening.wijzigingOnderhandenWerk}
                      onChange={(v) => pas((x) => void (x.winstberekening.soort === 'uitgesplitst' && (x.winstberekening.wijzigingOnderhandenWerk = v)))}
                    />
                    <Bedrag
                      label="Financiële baten en lasten"
                      veld={v('winstberekening.financieleBatenLasten')}
                      negatief
                      value={o.winstberekening.financieleBatenLasten}
                      onChange={(v) => pas((x) => void (x.winstberekening.soort === 'uitgesplitst' && (x.winstberekening.financieleBatenLasten = v)))}
                    />
                  </Rij>
                )}
              </div>
            </div>
            {winstBronNodig && <WinstBronVraag onderneming={o} pas={pas} veld={v('winstBron')} />}
            <Bedrag
              label="Beperkt aftrekbare kosten"
              veld={v('beperktAftrekbaar')}
              hint="Eten, drinken, representatie en congressen, het volledige bedrag. De correctie rekenen we zelf."
              value={o.beperktAftrekbaar}
              onChange={(v) => pas((x) => void (x.beperktAftrekbaar = v))}
            />

            <ActivaInvoer onderneming={o} pas={pas} jaar={jaar} params={params} uitkomst={uitkomst} veldVoor={(pad) => v(pad)} />

            <div>
              <Subkop>Investeringen</Subkop>
              <Lijst<InvesteringInvoer>
                items={o.investeringen}
                onChange={(l) => pas((x) => (l.length ? (x.investeringen = l) : delete x.investeringen))}
                nieuw={() => ({ omschrijving: '', datum: `${jaar}-01-01`, bedrag: 0, regeling: 'kia' })}
                titel={(inv, i) => inv.omschrijving || `Investering ${i + 1}`}
                toevoegLabel="Investering toevoegen"
                toevoegVeld={(o.investeringen?.length ?? 0) === 0 ? v('investeringen') : undefined}
              >
                {(inv, pasI, i) => {
                  const iv = (pad: string) => v(`investering:${itemSleutel(inv, i)}/${pad}`)
                  const regeling = inv.regeling ?? 'kia'
                  const melden = regeling !== 'kia' && regeling !== 'geen'
                  const meldTermijn = params?.ondernemer.waarde.eia.meldTermijnMaanden
                  return (
                    <div className="space-y-4">
                      <Rij>
                        <Tekst label="Omschrijving" verplicht veld={iv('omschrijving')} value={inv.omschrijving} onChange={(w) => pasI((x) => void (x.omschrijving = w))} />
                        <Datum label="Datum" verplicht veld={iv('datum')} value={inv.datum} onChange={(w) => pasI((x) => void (x.datum = w ?? ''))} />
                        <Bedrag label="Bedrag (exclusief btw)" veld={iv('bedrag')} value={inv.bedrag} onChange={(w) => pasI((x) => void (x.bedrag = w ?? 0))} />
                        <div data-veld={iv('regeling')}>
                          <Select label="Regeling" value={regeling} onChange={(w) => pasI((x) => void (x.regeling = w))} options={REGELING} />
                        </div>
                        <div data-veld={iv('uitgesloten')}>
                          <Toggle
                            label="Uitgesloten van investeringsaftrek"
                            description="Personenauto, woning, grond of goodwill: geen KIA, EIA of MIA."
                            checked={Boolean(inv.uitgesloten)}
                            onChange={(aan) => pasI((x) => void (aan ? (x.uitgesloten = true) : delete x.uitgesloten))}
                          />
                        </div>
                      </Rij>
                      <HirAfboeking onderneming={o} investering={inv} index={i} jaar={jaar} params={params} pasI={pasI} uitkomst={uitkomst?.herinvesteringsreserves} veldVoor={iv} />
                      <Disclosure
                        variant="kaal"
                        titel="Betaling en ingebruikname"
                        subtitel={melden ? 'Nog niet in gebruik, gekocht van je partner, melding bij RVO' : 'Nog niet in gebruik of gekocht van je partner'}
                        defaultOpen={inv.inGebruik === false || Boolean(inv.gekochtVanPartner) || (melden && !inv.gemeld)}
                      >
                        <div className="space-y-4 pt-2">
                          <div data-veld={iv('inGebruik')}>
                          <Toggle
                            label={`Eind ${jaar} nog niet in gebruik`}
                            description="Dan telt voor de investeringsaftrek dit jaar alleen wat je al betaalde. De rest telt in het jaar waarin je het in gebruik neemt: bij een nieuw jaar zetten we die rest klaar bij de investeringen. Zet het bedrijfsmiddel bij de bedrijfsmiddelen zodra je het in gebruik neemt."
                            checked={inv.inGebruik === false}
                            onChange={(aan) =>
                              pasI((x) => {
                                if (aan) x.inGebruik = false
                                else {
                                  delete x.inGebruik
                                  delete x.betaald
                                }
                              })
                            }
                          />
                          </div>
                          {inv.inGebruik === false && (
                            <Rij>
                              <Bedrag label={`Betaald in ${jaar}`} veld={iv('betaald')} hint="Exclusief btw." value={inv.betaald} onChange={(w) => pasI((x) => void (x.betaald = w))} />
                            </Rij>
                          )}
                          <div data-veld={iv('gekochtVanPartner')}>
                          <Toggle
                            label="Gekocht van je fiscale partner"
                            description="Een aankoop van je fiscale partner geeft geen investeringsaftrek."
                            checked={Boolean(inv.gekochtVanPartner)}
                            onChange={(aan) => pasI((x) => void (aan ? (x.gekochtVanPartner = true) : delete x.gekochtVanPartner))}
                          />
                          </div>
                          {melden && (
                            <div data-veld={iv('gemeld')}>
                            <Toggle
                              label="Gemeld bij RVO"
                              description={`EIA en MIA krijg je alleen als je de investering${meldTermijn ? ` binnen ${meldTermijn} maanden na de opdracht` : ''} bij RVO hebt gemeld.`}
                              checked={Boolean(inv.gemeld)}
                              onChange={(aan) => pasI((x) => void (aan ? (x.gemeld = true) : delete x.gemeld))}
                            />
                            </div>
                          )}
                        </div>
                      </Disclosure>
                    </div>
                  )
                }}
              </Lijst>
            </div>

            <Disclosure
              variant="kaal"
              titel="Verkochte bedrijfsmiddelen buiten het register"
              subtitel="Voor de desinvesteringsbijtelling"
              defaultOpen={(o.desinvesteringen?.length ?? 0) > 0 || o.overigeVerkopen !== undefined}
            >
              <div className="pt-2">
                <p className="mb-3 text-xs text-gray-500">
                  Staat het bedrijfsmiddel bij de bedrijfsmiddelen hierboven, vul de verkoop dan daar in: de bijtelling volgt vanzelf uit de investeringsaftrek die je toen kreeg. Gebruik deze lijst
                  voor een verkoop die niet in het register staat.
                </p>
                <Lijst<DesinvesteringInvoer>
                  items={o.desinvesteringen}
                  onChange={(l) => pas((x) => (l.length ? (x.desinvesteringen = l) : delete x.desinvesteringen))}
                  nieuw={() => ({ omschrijving: '', verkoopprijs: 0, investeringsjaar: jaar - 1, genotenPct: 0 })}
                  titel={(d, i) => `${d.omschrijving || `Verkoop ${i + 1}`} · ${formatEuro(d.verkoopprijs)}`}
                  toevoegLabel="Verkoop toevoegen"
                  leegTekst="Geen verkopen buiten het register met investeringsaftrek."
                >
                  {(d, pasD, di) => (
                    <Rij>
                      <Tekst label="Omschrijving" verplicht veld={v(`desinvestering:${di}/omschrijving`)} value={d.omschrijving} onChange={(w) => pasD((x) => void (x.omschrijving = w))} />
                      <Bedrag label="Verkoopprijs (exclusief btw)" veld={v(`desinvestering:${di}/verkoopprijs`)} value={d.verkoopprijs} onChange={(w) => pasD((x) => void (x.verkoopprijs = w ?? 0))} />
                      <Getal
                        label="Jaar van de investering"
                        min={jaar - 10}
                        max={jaar}
                        veld={v(`desinvestering:${di}/investeringsjaar`)}
                        value={d.investeringsjaar}
                        onChange={(w) => pasD((x) => void (x.investeringsjaar = w ?? jaar - 1))}
                      />
                      <Getal
                        label="Investeringsaftrek die je toen kreeg"
                        veld={v(`desinvestering:${di}/genotenPct`)}
                        suffix="%"
                        decimalen={2}
                        max={100}
                        hint="Het percentage uit de aangifte van dat jaar."
                        value={Math.round(d.genotenPct * 10000) / 100}
                        onChange={(v) => pasD((x) => void (x.genotenPct = Math.round((v ?? 0) * 100) / 10000))}
                      />
                      <Bedrag
                        label="Investeringsaftrek in euro's"
                        veld={v(`desinvestering:${di}/genotenAftrek`)}
                        hint="Wat je toen over dit bedrijfsmiddel aftrok. De bijtelling is nooit hoger."
                        value={d.genotenAftrek}
                        onChange={(v) => pasD((x) => (v === undefined ? delete x.genotenAftrek : (x.genotenAftrek = v)))}
                      />
                    </Rij>
                  )}
                </Lijst>
                <Rij className="mt-4">
                  <Bedrag
                    label="Opbrengst van andere verkochte bedrijfsmiddelen"
                    veld={v('overigeVerkopen')}
                    hint={`Verkocht je dit jaar nog meer bedrijfsmiddelen die niet in het register of in deze lijst staan, ook zonder investeringsaftrek? Vul de opbrengst samen in. Die telt mee voor de grens${drempel !== undefined ? ` van ${formatEuro(drempel)}` : ''}: daarboven volgt de desinvesteringsbijtelling.`}
                    value={o.overigeVerkopen}
                    onChange={(v) => pas((x) => void (v === undefined ? delete x.overigeVerkopen : (x.overigeVerkopen = v)))}
                  />
                </Rij>
              </div>
            </Disclosure>

            <div>
              <Subkop>Urencriterium</Subkop>
              <UrenVraag o={o} pas={pas} jaar={jaar} params={params} urenLoondienst={urenLoondienst} v={v} />
            </div>

            <div>
              <Subkop>{metReserves ? 'Reserves en vermogen' : 'Oudedagsreserve en vermogen'}</Subkop>
              <ReservesBlok onderneming={o} uitkomst={uitkomst} jaar={jaar} params={params} anker={(sit) => situatieAnker(sit, persoon.id, ondId)} />
              <Rij>
                <Bedrag
                  label="Stand oudedagsreserve (FOR)"
                  veld={v('for.stand')}
                  value={o.for?.stand}
                  onChange={(v) => pas((x) => (v === undefined && !x.for?.ondernemingsvermogenEinde ? delete x.for : (x.for = { ...x.for, stand: v ?? 0 })))}
                />
                <Bedrag
                  label="Ondernemingsvermogen aan het einde van het jaar"
                  veld={v('for.ondernemingsvermogenEinde')}
                  negatief
                  value={o.for?.ondernemingsvermogenEinde}
                  onChange={(v) => pas((x) => (x.for = { ...(x.for ?? { stand: 0 }), ondernemingsvermogenEinde: v }))}
                />
                {(o.for?.stand ?? 0) > 0 && (
                  <Bedrag
                    label="Vrijwillige afname"
                    veld={v('for.vrijwilligeAfname')}
                    hint="Kan alleen tot de lijfrentepremie die je dit jaar aftrekt, bijvoorbeeld om de FOR om te zetten in een lijfrente. Die premie vul je in bij pensioen. De afname telt als winst."
                    value={o.for?.vrijwilligeAfname}
                    onChange={(v) =>
                      pas((x) => {
                        if (!x.for) return
                        if (v === undefined) delete x.for.vrijwilligeAfname
                        else x.for.vrijwilligeAfname = v
                      })
                    }
                  />
                )}
              </Rij>
              {(o.for?.stand ?? 0) > 0 && urenAntwoord(o) !== 'ja' && (
                <div data-veld={v('uren.urencriteriumVorigJaar')}>
                <ChipGroup<'ja' | 'nee' | 'onbekend'>
                  className="mt-4"
                  label={`Haalde je het urencriterium in ${jaar - 1}?`}
                  kolommen={3}
                  value={o.uren.urencriteriumVorigJaar === undefined ? 'onbekend' : o.uren.urencriteriumVorigJaar ? 'ja' : 'nee'}
                  onChange={(v) =>
                    // Het urencriterium geldt per persoon over al zijn ondernemingen samen: het antwoord geldt voor allemaal.
                    wijzigPersoon((p) => {
                      for (const x of p.ondernemingen) {
                        if (v === 'onbekend') delete x.uren.urencriteriumVorigJaar
                        else x.uren.urencriteriumVorigJaar = v === 'ja'
                      }
                    })
                  }
                  options={[
                    { value: 'ja', label: 'Ja' },
                    { value: 'nee', label: 'Nee' },
                    { value: 'onbekend', label: 'Weet ik niet' },
                  ]}
                  hint={`Over al je ondernemingen samen. Twee jaar achter elkaar geen urencriterium is een reden voor een verplichte afname van de FOR. Bij een nieuw jaar nemen we dit over uit ${jaar - 1}.`}
                />
                </div>
              )}
            </div>

            <div>
              <Subkop>Vervoer</Subkop>
              <Rij>
                <Getal label="Zakelijke kilometers met een privéauto" suffix="km" veld={v('zakelijkeKmPrive')} value={o.zakelijkeKmPrive} onChange={(w) => pas((x) => void (x.zakelijkeKmPrive = w))} />
              </Rij>
              <div data-veld={v('kmAftrekAlInSaldo')} className="mt-4">
                <Toggle
                  label="De kilometervergoeding zit al in het saldo"
                  checked={Boolean(o.kmAftrekAlInSaldo)}
                  onChange={(aan) => pas((x) => (aan ? (x.kmAftrekAlInSaldo = true) : delete x.kmAftrekAlInSaldo))}
                />
              </div>
              <div data-veld={v('auto')} className="mt-4">
                <Toggle
                  label="Auto van de zaak"
                  checked={Boolean(o.auto)}
                  onChange={(aan) => pas((x) => (aan ? (x.auto = { cataloguswaarde: 0, datumEersteToelating: `${jaar - 1}-01-01`, nulEmissie: false, autokosten: 0 }) : delete x.auto))}
                />
              </div>
              {o.auto && (
                <div className="mt-4">
                  <AutoBlok onderneming={o} pas={pas} jaar={jaar} params={params} uitkomst={uitkomst?.auto} veld={v} />
                </div>
              )}
            </div>

            <div>
              <Subkop>Opdrachtgevers</Subkop>
              <p className="mb-3 text-xs text-gray-500">Voor signalen over de arbeidsrelatie op de planningpagina. Geen oordeel, alleen aandachtspunten.</p>
              <Lijst<OpdrachtgeverInvoer>
                items={o.opdrachtgevers}
                onChange={(l) => pas((x) => (l.length ? (x.opdrachtgevers = l) : delete x.opdrachtgevers))}
                nieuw={() => ({ naam: '', omzet: 0 })}
                titel={(og, i) => og.naam || `Opdrachtgever ${i + 1}`}
                toevoegLabel="Opdrachtgever toevoegen"
              >
                {(og, pasO, oi) => {
                  const ov = (pad: string) => v(`opdrachtgever:${oi}/${pad}`)
                  return (
                    <div className="space-y-4">
                      <Rij>
                        <Tekst label="Naam" verplicht veld={ov('naam')} value={og.naam} onChange={(w) => pasO((x) => void (x.naam = w))} />
                        <Bedrag label="Omzet" veld={ov('omzet')} value={og.omzet} onChange={(w) => pasO((x) => void (x.omzet = w ?? 0))} />
                        <Bedrag label="Uurtarief" decimalen={2} veld={ov('uurtarief')} value={og.uurtarief} onChange={(w) => pasO((x) => void (x.uurtarief = w))} />
                        <Getal label="Duur van de opdracht" suffix="mnd" veld={ov('duurMaanden')} value={og.duurMaanden} onChange={(w) => pasO((x) => void (x.duurMaanden = w))} />
                      </Rij>
                      <div data-veld={ov('viaPlatform')}>
                        <Toggle label="Via een platform" checked={Boolean(og.viaPlatform)} onChange={(aan) => pasO((x) => void (x.viaPlatform = aan || undefined))} />
                      </div>
                    </div>
                  )
                }}
              </Lijst>
            </div>

            <JaarrekeningInvoer onderneming={o} pas={pas} jaar={jaar} saldo={saldoVan(o)} />

            <OndernemingSituatieLijst ctx={ctx} />
            <Disclosure variant="kaal" titel="Overig" subtitel="Prognose en startersaftrek">
              <Rij className="pt-2">
                <Getal
                  label="Maanden gewerkt tot nu"
                  hint="Alleen voor een prognose in een lopend jaar; leeg is het hele jaar."
                  suffix="mnd"
                  max={12}
                  veld={v('maandenGewerkt')}
                  value={o.maandenGewerkt}
                  onChange={(w) => pas((x) => void (x.maandenGewerkt = w))}
                />
                <Getal label="Startersaftrek eerder gebruikt" suffix="keer" max={10} veld={v('startersaftrekEerderGebruikt')} value={o.startersaftrekEerderGebruikt} onChange={(w) => pas((x) => void (x.startersaftrekEerderGebruikt = w))} />
              </Rij>
            </Disclosure>
          </div>
          )
        }}
      </Lijst>
    </Section>
  )
}
