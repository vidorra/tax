'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Download, Link2 } from 'lucide-react'
import { MB_CATEGORIEEN, type MbCategorie, type MbIndeling, type MbJaarImport, type MbOvernameOpties } from '@/lib/moneybird/types'
import { forControle, overnameMeldingen } from '@/lib/moneybird/overname'
import type { InvesteringInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { balansTotalen, heeftBalans, kapitaalsvergelijking, somBedragen } from '@/lib/dossier/jaarrekening'
import { Alert, Button, Disclosure, Select, StatLijst, StatRow, Toggle, WaarschuwingLijst, cn, formatDatum, formatEuro, formatGetal } from '@/components/ui'
import { koppelingenApi } from '../api'
import { bruikbareKoppelingen, echteWijzigingen, formatMoment, importMetKeuzes, teBewarenIndeling, voorkeurKoppeling } from './indeling'
import type { KoppelingenStaat } from './useKoppelingen'

const REGELING_LABEL: Record<NonNullable<InvesteringInvoer['regeling']>, string> = {
  kia: 'KIA',
  eia: 'EIA',
  'mia-1': 'MIA I',
  'mia-2': 'MIA II',
  'mia-3': 'MIA III',
  geen: 'geen aftrek',
}

const CATEGORIE_OPTIES = MB_CATEGORIEEN.map((c) => ({ value: c.waarde, label: c.label }))

/** Meldingen over de jaarrekening (balans en kapitaalsvergelijking die niet sluiten en dergelijke) staan bij het overzicht ervan. */
const isJaarrekeningMelding = (id: string) => id.startsWith('mb-jaarrekening-')

export interface MoneybirdImportProps {
  onderneming: OndernemingInvoer
  jaar: number
  koppelingen: KoppelingenStaat
  /** Krijgt de import met de keuzes van de gebruiker en de overname-opties; de sectie past neemOver toe. */
  onOvernemen: (imp: MbJaarImport, opties: MbOvernameOpties) => void
}

export function MoneybirdImport({ onderneming, jaar, koppelingen, onOvernemen }: MoneybirdImportProps) {
  const basis = useId().replace(/:/g, '')
  const bruikbaar = bruikbareKoppelingen(koppelingen.koppelingen)
  const [gekozen, setGekozen] = useState<string>('')
  const [bezig, setBezig] = useState<'ophalen' | 'bewaren' | 'overnemen' | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [melding, setMelding] = useState<string | null>(null)
  const [imp, setImp] = useState<MbJaarImport | null>(null)
  const [keuzes, setKeuzes] = useState<MbIndeling>({})
  const [opties, setOpties] = useState<Required<MbOvernameOpties>>({ investeringen: true, opdrachtgevers: true, balans: true, uren: false })
  const kopRef = useRef<HTMLHeadingElement>(null)
  /** Telt het openen van het controlepaneel, zodat de focus alleen dan naar de kop gaat. */
  const [geopend, setGeopend] = useState(0)

  const koppelingId = gekozen || voorkeurKoppeling(koppelingen.koppelingen, onderneming.bron) || ''

  useEffect(() => {
    if (geopend > 0) kopRef.current?.focus()
  }, [geopend])

  // Regels, totalen en jaarrekening met de keuzes van nu; dezelfde import gaat naar het overnemen.
  const metKeuzes = useMemo(() => (imp ? importMetKeuzes(imp, keuzes) : null), [imp, keuzes])
  const regels = metKeuzes?.regels ?? []
  const totalen = metKeuzes?.totalen ?? null
  const jaarrekening = metKeuzes?.jaarrekening
  const kapitaal = kapitaalsvergelijking(jaarrekening)
  const kapitaalVerschil = kapitaal && totalen ? kapitaal.winst - totalen.nettoWinstIndeling : 0
  const bijJaarrekening = (id: string) => Boolean(jaarrekening) && isJaarrekeningMelding(id)
  const jaarrekeningMeldingen = imp?.waarschuwingen.filter((w) => bijJaarrekening(w.id)) ?? []
  const overigeMeldingen = imp?.waarschuwingen.filter((w) => !bijJaarrekening(w.id)) ?? []
  const negerenAlsPrive = Boolean(imp?.priveMutaties) && regels.some((r) => r.categorie === 'negeren')
  // Wat de overname met het activaregister van deze onderneming doet (verkochte middelen, mogelijk dubbele regels).
  const registerMeldingen = useMemo(() => (metKeuzes ? overnameMeldingen(onderneming, metKeuzes, opties) : []), [metKeuzes, onderneming, opties])
  const vrijwilligeAfname = onderneming.for?.vrijwilligeAfname ?? 0
  const forStand = imp ? forControle(imp, vrijwilligeAfname) : null
  const forBegin = forStand?.begin ?? null
  const forEind = forStand?.eind ?? null
  const gewijzigd = imp ? Object.keys(echteWijzigingen(imp, keuzes)).length > 0 : false

  if (koppelingen.laden) return null

  if (bruikbaar.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-gray-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          {koppelingen.koppelingen.length > 0
            ? 'Kies bij je Moneybird-koppeling nog een administratie, dan kun je de cijfers hier ophalen.'
            : 'Boekhouden in Moneybird? Koppel je administratie, dan haal je de cijfers van dit jaar hier op.'}
        </p>
        <Link
          href="/dossier/koppelingen/"
          className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Link2 aria-hidden="true" className="h-4 w-4" />
          Naar koppelingen
        </Link>
      </div>
    )
  }

  async function haalOp() {
    if (!koppelingId) return
    setBezig('ophalen')
    setFout(null)
    setMelding(null)
    const r = await koppelingenApi.importeer(koppelingId, jaar)
    setBezig(null)
    if (!r.ok || !r.data) return setFout(r.fout ?? 'Ophalen uit Moneybird is niet gelukt.')
    setKeuzes({})
    setOpties({ investeringen: true, opdrachtgevers: true, balans: true, uren: false })
    setImp(r.data.import)
    setGeopend((n) => n + 1)
  }

  function sluit() {
    setImp(null)
    setKeuzes({})
    document.getElementById(`${basis}-knop`)?.focus()
  }

  async function bewaarIndeling(huidig: MbJaarImport): Promise<MbJaarImport | null> {
    const nieuw = importMetKeuzes(huidig, keuzes)
    const r = await koppelingenApi.bewaarIndeling(huidig.koppelingId, teBewarenIndeling(nieuw.regels))
    if (!r.ok) {
      setFout(`De indeling kon niet worden bewaard. ${r.fout ?? ''}`.trim())
      return null
    }
    setImp(nieuw)
    setKeuzes({})
    return nieuw
  }

  async function bewaar() {
    if (!imp) return
    setBezig('bewaren')
    setFout(null)
    const ok = await bewaarIndeling(imp)
    setBezig(null)
    if (ok) setMelding('De indeling is bewaard. Bij een volgende import gebruiken we deze keuzes.')
  }

  async function neemOverKlik() {
    if (!imp) return
    setBezig('overnemen')
    setFout(null)
    let klaar: MbJaarImport | null = importMetKeuzes(imp, keuzes)
    if (gewijzigd) {
      klaar = await bewaarIndeling(imp)
      if (!klaar) {
        setBezig(null)
        setFout((f) => `${f ?? 'De indeling kon niet worden bewaard.'} Er is nog niets overgenomen.`)
        return
      }
    }
    onOvernemen(klaar, opties)
    setBezig(null)
    sluit()
    setMelding('De cijfers staan in deze onderneming. Controleer ze en druk bovenaan op Opslaan om ze te bewaren.')
  }

  function kies(id: string, categorie: MbCategorie) {
    setKeuzes((k) => ({ ...k, [id]: categorie }))
    setMelding(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-end">
        {bruikbaar.length > 1 ? (
          <Select
            label="Moneybird-koppeling"
            value={koppelingId}
            onChange={setGekozen}
            options={bruikbaar.map((k) => ({ value: k.id, label: `${k.label}${k.administratieNaam ? ` (${k.administratieNaam})` : ''}` }))}
            wrapperClassName="sm:flex-1"
          />
        ) : (
          <p className="text-sm text-gray-600 sm:flex-1">
            Haal omzet, kosten, investeringen en opdrachtgevers van {jaar} op uit Moneybird
            {bruikbaar[0]?.administratieNaam ? ` (administratie ${bruikbaar[0].administratieNaam})` : ''}.
          </p>
        )}
        <Button id={`${basis}-knop`} variant="secundair" onClick={haalOp} disabled={bezig !== null || !koppelingId} aria-describedby={`${basis}-status`}>
          <Download aria-hidden="true" className="h-4 w-4" />
          {bezig === 'ophalen' ? 'Bezig met ophalen' : 'Importeer uit Moneybird'}
        </Button>
      </div>

      <div id={`${basis}-status`} aria-live="polite" className="space-y-3">
        {fout && (
          <Alert variant="let-op" role="alert">
            {fout}
          </Alert>
        )}
        {melding && <Alert variant="info">{melding}</Alert>}
      </div>

      {imp && totalen && (
        <section aria-labelledby={`${basis}-kop`} className="space-y-5 rounded-2xl border border-primary/30 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <h4 id={`${basis}-kop`} ref={kopRef} tabIndex={-1} className="text-base font-semibold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Controleer de cijfers uit Moneybird
            </h4>
            <p className="mt-1 text-sm text-gray-600">
              Administratie {imp.administratie.naam}, boekjaar {imp.jaar}, opgehaald op {formatMoment(imp.opgehaaldOp, true)}. Er verandert niets in Moneybird.
            </p>
          </div>

          <div>
            <h5 className="mb-1 text-sm font-medium text-gray-900">Winst- en verliesrekening</h5>
            <StatLijst aria-label="Totalen volgens de indeling">
              <StatRow label="Omzet" bedrag={totalen.omzet} />
              <StatRow label="Kosten" bedrag={totalen.kosten} />
              <StatRow label="Afschrijvingen" bedrag={totalen.afschrijvingen} />
              <StatRow label="Beperkt aftrekbare kosten" bedrag={totalen.beperktAftrekbaar} toelichting="Het volledige bedrag; de correctie rekenen we zelf." />
              <StatRow
                label="Autokosten"
                bedrag={totalen.autokosten}
                toelichting={onderneming.auto ? 'Gaan naar de auto van de zaak.' : 'Geen auto van de zaak ingevuld: telt mee bij de kosten.'}
              />
              <StatRow label="Financiële baten en lasten" bedrag={totalen.financieel} />
              <StatRow label="Netto winst volgens Moneybird" bedrag={totalen.nettoWinstMoneybird} variant="subtotaal" />
              <StatRow label="Netto winst volgens de indeling" bedrag={totalen.nettoWinstIndeling} variant="subtotaal" />
              <StatRow
                label="Verschil"
                bedrag={totalen.verschil}
                className={cn(totalen.verschil !== 0 && 'rounded-lg bg-amber-50 px-2 text-amber-900')}
                toelichting={totalen.verschil !== 0 ? 'Door regels op Niet meenemen, of door afronding. Controleer of dat klopt.' : 'De indeling sluit aan op Moneybird.'}
              />
            </StatLijst>
          </div>

          <Disclosure variant="kaal" defaultOpen titel={`Grootboekrekeningen (${regels.length})`} subtitel="Kies per rekening hoe die fiscaal meetelt. Je keuzes gelden ook voor volgende jaren.">
            {regels.length === 0 ? (
              <p className="text-sm text-gray-600">Geen boekingen in de winst- en verliesrekening van dit jaar.</p>
            ) : (
              <ul className="divide-y divide-gray-100" aria-label="Grootboekrekeningen">
                {regels.map((r) => (
                  <li key={r.ledgerAccountId} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_13rem] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-gray-900">
                        {r.naam}
                        {r.aangepast && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">eigen keuze</span>}
                      </p>
                      <p className="mt-0.5 break-words text-xs text-gray-500">
                        {r.rgsCode ? `RGS ${r.rgsCode}. ` : ''}
                        {r.reden}
                      </p>
                    </div>
                    <p className="text-sm tabular-nums text-gray-900 sm:text-right">{formatEuro(r.bedrag)}</p>
                    <Select<MbCategorie>
                      label={`Categorie van ${r.naam}`}
                      labelVerborgen
                      value={r.categorie}
                      onChange={(c) => kies(r.ledgerAccountId, c)}
                      options={CATEGORIE_OPTIES}
                    />
                  </li>
                ))}
              </ul>
            )}
            <Disclosure variant="kaal" titel="Wat betekenen de categorieën?" className="mt-2">
              <dl className="space-y-2 text-sm">
                {MB_CATEGORIEEN.map((c) => (
                  <div key={c.waarde}>
                    <dt className="font-medium text-gray-900">{c.label}</dt>
                    <dd className="text-gray-600">{c.uitleg}</dd>
                  </div>
                ))}
              </dl>
            </Disclosure>
          </Disclosure>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="min-w-0">
              <h5 className="mb-1 text-sm font-medium text-gray-900">Investeringen in {imp.jaar}</h5>
              {imp.investeringen.length === 0 ? (
                <p className="text-sm text-gray-600">Geen nieuwe vaste activa.</p>
              ) : (
                <StatLijst aria-label="Investeringen">
                  {imp.investeringen.map((inv, i) => (
                    <StatRow
                      key={`${inv.omschrijving}-${i}`}
                      label={inv.omschrijving}
                      toelichting={`${formatDatum(inv.datum)}${inv.uitgesloten ? ', uitgesloten van investeringsaftrek' : inv.regeling ? `, ${REGELING_LABEL[inv.regeling]}` : ''}`}
                      bedrag={inv.bedrag}
                    />
                  ))}
                </StatLijst>
              )}
              {imp.desinvesteringen.length > 0 && (
                <>
                  <h5 className="mb-1 mt-4 text-sm font-medium text-gray-900">Verkocht of afgestoten</h5>
                  <StatLijst aria-label="Desinvesteringen">
                    {imp.desinvesteringen.map((d, i) => (
                      <StatRow key={`${d.omschrijving}-${i}`} label={d.omschrijving} toelichting={`Gekocht in ${d.investeringsjaar}`} bedrag={d.verkoopprijs} />
                    ))}
                  </StatLijst>
                </>
              )}
            </div>
            <div className="min-w-0">
              <h5 className="mb-1 text-sm font-medium text-gray-900">Balans</h5>
              <StatLijst aria-label="Balans">
                <StatRow label="Ondernemingsvermogen begin" bedrag={imp.balans.ondernemingsvermogenBegin} />
                <StatRow label="Ondernemingsvermogen einde" bedrag={imp.balans.ondernemingsvermogenEinde} />
                <StatRow
                  label="Oudedagsreserve op 1 januari"
                  bedrag={forBegin}
                  toelichting={
                    forBegin !== null
                      ? 'Van de beginbalans. Hiermee rekenen we.'
                      : forEind !== null
                        ? 'Niet gevonden op de beginbalans. Vul de stand op 1 januari zelf in bij de oudedagsreserve.'
                        : 'Geen oudedagsreserve gevonden op de balans.'
                  }
                />
                {forStand && forEind !== null && (
                  <StatRow
                    label="Oudedagsreserve eind (controle)"
                    bedrag={forEind}
                    className={cn(forStand.sluitAan === false && 'rounded-lg bg-amber-50 px-2 text-amber-900')}
                    toelichting={
                      forStand.sluitAan === null || forStand.daling === null
                        ? 'Alleen ter controle; we rekenen met de stand op 1 januari.'
                        : forStand.daling === 0
                          ? 'Gelijk aan de stand op 1 januari: in Moneybird is niets afgenomen.'
                          : forStand.sluitAan
                            ? 'Sluit aan: de stand op 1 januari min je vrijwillige afname.'
                            : `In Moneybird ${forStand.daling > 0 ? 'daalt' : 'stijgt'} de stand met ${formatEuro(Math.abs(forStand.daling))}; bij de oudedagsreserve staat ${vrijwilligeAfname > 0 ? `een vrijwillige afname van ${formatEuro(vrijwilligeAfname)}` : 'geen vrijwillige afname'}. Een verplichte afname rekenen we zelf; controleer of de afname klopt.`
                    }
                  />
                )}
                {(imp.balans.onderhandenWerkBegin !== null || imp.balans.onderhandenWerkEind !== null) && (
                  <>
                    <StatRow label="Onderhanden werk begin" bedrag={imp.balans.onderhandenWerkBegin} />
                    <StatRow label="Onderhanden werk einde" bedrag={imp.balans.onderhandenWerkEind} toelichting="De mutatie zit al in de winst." />
                  </>
                )}
              </StatLijst>
            </div>
          </div>

          {jaarrekening && (
            <div>
              <h5 className="mb-1 text-sm font-medium text-gray-900">Jaarrekening voor het rapport</h5>
              <StatLijst aria-label="Jaarrekening">
                <StatRow
                  label="Balanstotaal begin"
                  bedrag={heeftBalans(jaarrekening.begin) ? balansTotalen(jaarrekening.begin).activa : null}
                  toelichting={heeftBalans(jaarrekening.begin) ? undefined : 'Geen beginbalans in Moneybird.'}
                />
                <StatRow
                  label="Balanstotaal einde"
                  bedrag={heeftBalans(jaarrekening.eind) ? balansTotalen(jaarrekening.eind).activa : null}
                  toelichting={heeftBalans(jaarrekening.eind) ? undefined : 'Geen eindbalans in Moneybird.'}
                />
                <StatRow
                  label="Privé-onttrekkingen"
                  bedrag={jaarrekening.onttrekkingen ? somBedragen(jaarrekening.onttrekkingen) : null}
                  toelichting={negerenAlsPrive ? 'Met de regels op Niet meenemen: kosten tellen als onttrekking, opbrengsten als storting.' : undefined}
                />
                <StatRow label="Privéstortingen" bedrag={jaarrekening.stortingen ? somBedragen(jaarrekening.stortingen) : null} />
                {kapitaal && (
                  <StatRow
                    label="Winst volgens de kapitaalsvergelijking"
                    bedrag={kapitaal.winst}
                    variant="subtotaal"
                    className={cn(kapitaalVerschil !== 0 && 'rounded-lg bg-amber-50 px-2 text-amber-900')}
                    toelichting={
                      kapitaalVerschil === 0
                        ? 'Sluit op de netto winst volgens de indeling.'
                        : `Sluit niet: ${formatEuro(Math.abs(kapitaalVerschil))} verschil met de netto winst volgens de indeling.`
                    }
                  />
                )}
              </StatLijst>
              {jaarrekeningMeldingen.length > 0 && <WaarschuwingLijst waarschuwingen={jaarrekeningMeldingen} className="mt-3" />}
            </div>
          )}

          <div>
            <h5 className="mb-1 text-sm font-medium text-gray-900">Opdrachtgevers</h5>
            {imp.opdrachtgevers.length === 0 ? (
              <p className="text-sm text-gray-600">Geen omzet per klant gevonden.</p>
            ) : (
              <StatLijst aria-label="Opdrachtgevers">
                {imp.opdrachtgevers.map((og, i) => (
                  <StatRow
                    key={`${og.naam}-${i}`}
                    label={og.naam}
                    toelichting={og.uurtarief !== undefined ? `Uurtarief ${formatEuro(og.uurtarief, { decimalen: 2 })}` : undefined}
                    bedrag={og.omzet}
                  />
                ))}
              </StatLijst>
            )}
          </div>

          <div>
            <h5 className="mb-1 text-sm font-medium text-gray-900">Uren</h5>
            {imp.uren ? (
              <>
                <p className="text-sm text-gray-700">In Moneybird staan {formatGetal(imp.uren.totaal)} uur geregistreerd in {imp.jaar}.</p>
                <Toggle
                  className="mt-3"
                  label="Uren uit Moneybird gebruiken"
                  description="Uit: je antwoord op de vraag over het urencriterium blijft staan. Aan: we toetsen het urencriterium aan deze uren. Schrijf je indirecte uren zoals administratie en acquisitie niet in Moneybird, laat dit dan uit."
                  checked={opties.uren}
                  onChange={(aan) => setOpties((o) => ({ ...o, uren: aan }))}
                />
              </>
            ) : (
              <p className="text-sm text-gray-600">Geen uren gevonden. Je antwoord op de vraag over het urencriterium blijft staan.</p>
            )}
          </div>

          <div className="space-y-3">
            <h5 className="text-sm font-medium text-gray-900">Wat neem je over?</h5>
            <p className="text-sm text-gray-600">
              De winstberekening wordt altijd vervangen door de cijfers hierboven. De bedrijfsmiddelen uit de activamodule van Moneybird vormen het activaregister. We gaan ervan uit dat daar al je bedrijfsmiddelen in staan, dus de fiscale afschrijving uit het register vervangt de afschrijving die in Moneybird is geboekt. Wat je zelf aan het register hebt toegevoegd, blijft staan. Is een bedrijfsmiddel uit het register in Moneybird verkocht, dan zetten we de verkoop bij dat middel.
            </p>
            <Toggle
              label="Investeringen en verkochte bedrijfsmiddelen"
              description="Vervangt de lijsten in deze onderneming."
              checked={opties.investeringen}
              onChange={(aan) => setOpties((o) => ({ ...o, investeringen: aan }))}
            />
            <Toggle label="Opdrachtgevers" description="Vervangt de lijst in deze onderneming." checked={opties.opdrachtgevers} onChange={(aan) => setOpties((o) => ({ ...o, opdrachtgevers: aan }))} />
            <Toggle
              label="Oudedagsreserve en ondernemingsvermogen"
              description={
                jaarrekening
                  ? 'De oudedagsreserve op 1 januari en het ondernemingsvermogen aan het eind, met de balans van de jaarrekening: posten, specificaties, onttrekkingen en stortingen.'
                  : 'De oudedagsreserve op 1 januari en het ondernemingsvermogen aan het eind.'
              }
              checked={opties.balans}
              onChange={(aan) => setOpties((o) => ({ ...o, balans: aan }))}
            />
          </div>

          {overigeMeldingen.length + registerMeldingen.length > 0 && <WaarschuwingLijst waarschuwingen={[...overigeMeldingen, ...registerMeldingen]} />}

          <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:flex-wrap">
            <Button onClick={neemOverKlik} disabled={bezig !== null}>
              {bezig === 'overnemen' ? 'Bezig' : 'Overnemen in deze onderneming'}
            </Button>
            <Button variant="secundair" onClick={bewaar} disabled={bezig !== null || !gewijzigd}>
              {bezig === 'bewaren' ? 'Bezig met bewaren' : 'Indeling bewaren'}
            </Button>
            <Button variant="kaal" onClick={sluit} disabled={bezig !== null}>
              Sluiten zonder overnemen
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
