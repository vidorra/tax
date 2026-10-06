'use client'

/**
 * Ronde 2 (A2): inhoud van het blok "Verhuisd, gekocht of verkocht" in WoningSectie (ux-ronde2.md 8.5, taak-A2 6.4).
 *
 * - Vorige woning verkocht in het dossierjaar: `vorigeWoning` (de engine rekent het vervreemdingssaldo en de reserve).
 * - Verkocht in een eerder jaar: het blok rekent het vervreemdingssaldo uit de verkoopgegevens en bewaart alleen de
 *   toevoeging aan de reserve (datum en bedrag per persoon) in `eigenwoningreserve`.
 * - Nieuwe woning (`aankoop`) en verbouwing (`verbeteringen`); de uitkomst van de bijleenregeling komt uit de engine.
 * Datums zijn verplicht in de invoer; tot de datum er staat, blijft een gekozen verkoop of aankoop een concept in de
 * pagina (de engine en de opslag zien hem dan nog niet).
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { EigenWoningInvoer, HuishoudenInvoer, HuishoudenResultaat, PersoonId, TaxYearParams } from '@/lib/tax/types'
import { reserveVervaltOp, vervreemdingssaldo } from '@/lib/tax/modules/eigen-woning'
import { opsomming } from '@/lib/import/ongedaan'
import { Alert, Disclosure, Select, StatLijst, StatRow, formatDatum, formatEuro } from '@/components/ui'
import { Bedrag, Datum, Getal, Rij, Subkop } from '../velden'
import { persoonNaam, type Wijzig } from '../secties/types'

type Verkoop = NonNullable<EigenWoningInvoer['vorigeWoning']>
type Aankoop = NonNullable<EigenWoningInvoer['aankoop']>
type Toevoeging = NonNullable<EigenWoningInvoer['eigenwoningreserve']>[number]

const isDatum = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)

export interface VerhuisdSituatieProps {
  invoer: HuishoudenInvoer
  wijzig: Wijzig
  resultaat: HuishoudenResultaat | null | undefined
  params: TaxYearParams | null
}

/** Reserve per persoon in één regel: "Persoon A € 71.000 · Persoon B € 71.000", of één bedrag bij één persoon. */
function reserveTekst(toevoegingen: Array<{ eigenaar: PersoonId; bedrag: number }>, invoer: HuishoudenInvoer): string {
  const per = (id: PersoonId) => toevoegingen.filter((t) => t.eigenaar === id).reduce((s, t) => s + t.bedrag, 0)
  if (invoer.personen.length < 2) return formatEuro(per('A') + per('B'))
  return invoer.personen.map((p) => `${persoonNaam(p)} ${formatEuro(per(p.id))}`).join(' · ')
}

export function VerhuisdSituatie({ invoer, wijzig, resultaat, params }: VerhuisdSituatieProps) {
  const jaar = invoer.jaar
  const ew = invoer.eigenWoning ?? { woz: 0 }
  const twee = invoer.personen.length > 1
  const termijn = params?.eigenWoning.waarde.reserveTermijnJaren ?? 0
  const standaardAandeel = twee ? 0.5 : 1

  const [verkoopjaar, setVerkoopjaar] = useState<string>(ew.vorigeWoning ? String(jaar) : 'geen')
  const [verkoopConcept, setVerkoopConcept] = useState<Partial<Verkoop> | null>(null)
  const [eerder, setEerder] = useState<Partial<Verkoop> & { geschreven?: string }>({})
  const [aankoopConcept, setAankoopConcept] = useState<Partial<Aankoop> | null>(null)
  const [verbeterConcept, setVerbeterConcept] = useState<{ datum?: string; kosten?: number } | null>(null)

  const zetEw = (fn: (e: EigenWoningInvoer) => void) => wijzig((d) => void (d.eigenWoning && fn(d.eigenWoning)))

  // Vorige woning verkocht in het dossierjaar.
  const verkoop: Partial<Verkoop> = ew.vorigeWoning ?? verkoopConcept ?? {}
  function zetVerkoop(patch: Partial<Verkoop>) {
    const v = { ...verkoop, ...patch }
    if (isDatum(v.leverdatum)) {
      setVerkoopConcept(null)
      const vol: Verkoop = { leverdatum: v.leverdatum, verkoopprijs: v.verkoopprijs ?? 0, verkoopkosten: v.verkoopkosten ?? 0, eigenwoningschuld: v.eigenwoningschuld ?? 0, aandeelA: v.aandeelA ?? standaardAandeel }
      zetEw((e) => void (e.vorigeWoning = vol))
    } else {
      setVerkoopConcept(v)
      if (ew.vorigeWoning) zetEw((e) => void delete e.vorigeWoning)
    }
  }

  // Verkocht in een eerder jaar: alleen de toevoeging aan de reserve wordt bewaard.
  function zetEerder(patch: Partial<Verkoop>) {
    const v = { ...eerder, ...patch }
    const geldig = isDatum(v.leverdatum) && v.leverdatum < `${jaar}-01-01` && v.verkoopprijs !== undefined
    const nieuw: Toevoeging[] = geldig
      ? vervreemdingssaldo({ leverdatum: v.leverdatum!, verkoopprijs: v.verkoopprijs ?? 0, verkoopkosten: v.verkoopkosten ?? 0, eigenwoningschuld: v.eigenwoningschuld ?? 0, aandeelA: v.aandeelA ?? standaardAandeel }).toevoegingen
      : []
    const weg = v.geschreven
    zetEw((e) => {
      const rest = (e.eigenwoningreserve ?? []).filter((t) => t.datumToevoeging !== weg && (!geldig || t.datumToevoeging !== v.leverdatum))
      const lijst = [...rest, ...nieuw]
      if (lijst.length > 0) e.eigenwoningreserve = lijst
      else delete e.eigenwoningreserve
    })
    setEerder({ ...v, geschreven: geldig && nieuw.length > 0 ? v.leverdatum : undefined })
  }

  function kiesVerkoopjaar(k: string) {
    setVerkoopjaar(k)
    if (k !== String(jaar)) {
      setVerkoopConcept(null)
      if (ew.vorigeWoning) zetEw((e) => void delete e.vorigeWoning)
    }
    if (eerder.geschreven && k !== String(Number(eerder.leverdatum?.slice(0, 4)))) {
      const weg = eerder.geschreven
      zetEw((e) => {
        const rest = (e.eigenwoningreserve ?? []).filter((t) => t.datumToevoeging !== weg)
        if (rest.length > 0) e.eigenwoningreserve = rest
        else delete e.eigenwoningreserve
      })
      setEerder({})
    }
  }

  // Nieuwe woning.
  const aankoop: Partial<Aankoop> = ew.aankoop ?? aankoopConcept ?? {}
  function zetAankoop(patch: Partial<Aankoop>) {
    const a = { ...aankoop, ...patch }
    const leeg = !a.leverdatum && a.koopsom === undefined && a.kostenKoper === undefined
    if (isDatum(a.leverdatum)) {
      setAankoopConcept(null)
      const vol: Aankoop = { leverdatum: a.leverdatum, koopsom: a.koopsom ?? 0, kostenKoper: a.kostenKoper ?? 0, aandeelA: a.aandeelA ?? standaardAandeel }
      zetEw((e) => void (e.aankoop = vol))
    } else {
      setAankoopConcept(leeg ? null : a)
      if (ew.aankoop) zetEw((e) => void delete e.aankoop)
    }
  }

  // Verbouwing (één regel).
  const verbetering = ew.verbeteringen?.[0] ?? verbeterConcept ?? {}
  function zetVerbetering(patch: { datum?: string; kosten?: number }) {
    const v = { ...verbetering, ...patch }
    if (isDatum(v.datum)) {
      setVerbeterConcept(null)
      zetEw((e) => void (e.verbeteringen = [{ datum: v.datum!, kosten: v.kosten ?? 0 }, ...(e.verbeteringen ?? []).slice(1)]))
    } else {
      setVerbeterConcept(v.datum === undefined && v.kosten === undefined ? null : v)
      if (ew.verbeteringen?.length) zetEw((e) => void delete e.verbeteringen)
    }
  }

  const jaren = [String(jaar), ...Array.from({ length: termijn }, (_, i) => String(jaar - 1 - i))]
  const verkoopOpties = [{ value: 'geen', label: 'Niet verkocht' }, ...jaren.map((j) => ({ value: j, label: j }))]

  // Reserve uit de verkoop van dit jaar (pure rekensom, ook vóór de engine).
  const saldoDitJaar = ew.vorigeWoning ? vervreemdingssaldo(ew.vorigeWoning) : null
  const eerderSaldo = isDatum(eerder.leverdatum) && eerder.verkoopprijs !== undefined ? vervreemdingssaldo({ leverdatum: eerder.leverdatum, verkoopprijs: eerder.verkoopprijs, verkoopkosten: eerder.verkoopkosten ?? 0, eigenwoningschuld: eerder.eigenwoningschuld ?? 0, aandeelA: eerder.aandeelA ?? standaardAandeel }) : null

  // Toevoegingen in de invoer (doorrol of eerder ingevuld), per datum; zonder de toevoeging die dit blok net schreef.
  const groepen = [...new Set((ew.eigenwoningreserve ?? []).map((t) => t.datumToevoeging))].filter((d) => d !== eerder.geschreven).sort()

  const bl = resultaat?.eigenWoning?.bijleenregeling
  const reserveNa = resultaat?.eigenWoning?.eigenwoningreserve ?? []
  const vroegsteVerval = reserveNa
    .filter((t) => t.datumToevoeging > (ew.aankoop?.leverdatum ?? ''))
    .map((t) => t.vervaltOp)
    .sort()[0]

  const aandeelVeld = (waarde: number | undefined, zet: (x: number | undefined) => void, veld: string) =>
    twee ? (
      <Getal
        label={`Deel ${persoonNaam(invoer.personen[0])}`}
        suffix="%"
        max={100}
        veld={veld}
        value={waarde === undefined ? standaardAandeel * 100 : Math.round(waarde * 100)}
        onChange={(v) => zet(v === undefined ? undefined : Math.min(100, Math.max(0, v)) / 100)}
      />
    ) : null

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <Rij>
          <Select label="Vorige woning verkocht in" value={verkoopjaar} onChange={kiesVerkoopjaar} options={verkoopOpties} />
          {verkoopjaar === String(jaar) && (
            <Datum label="Leverdatum" verplicht veld="eigenWoning/vorigeWoning.leverdatum" value={verkoop.leverdatum} onChange={(v) => zetVerkoop({ leverdatum: v })} hint={verkoop.leverdatum ? undefined : 'Nodig om de reserve uit te rekenen.'} />
          )}
          {verkoopjaar !== 'geen' && verkoopjaar !== String(jaar) && (
            <Datum label="Leverdatum" verplicht value={eerder.leverdatum} onChange={(v) => zetEerder({ leverdatum: v })} hint={`Een datum in ${verkoopjaar}.`} />
          )}
        </Rij>
        {verkoopjaar === String(jaar) && (
          <>
            <Rij>
              <Bedrag label="Verkoopprijs" veld="eigenWoning/vorigeWoning.verkoopprijs" value={verkoop.verkoopprijs} onChange={(v) => zetVerkoop({ verkoopprijs: v })} />
              <Bedrag label="Verkoopkosten" hint="Makelaar en andere kosten van de verkoop." veld="eigenWoning/vorigeWoning.verkoopkosten" value={verkoop.verkoopkosten} onChange={(v) => zetVerkoop({ verkoopkosten: v })} />
              <Bedrag label="Eigenwoningschuld bij verkoop" veld="eigenWoning/vorigeWoning.eigenwoningschuld" value={verkoop.eigenwoningschuld} onChange={(v) => zetVerkoop({ eigenwoningschuld: v })} />
              {aandeelVeld(verkoop.aandeelA, (x) => zetVerkoop({ aandeelA: x }), 'eigenWoning/vorigeWoning.aandeelA')}
            </Rij>
            {saldoDitJaar && params && <ReserveRegel saldo={saldoDitJaar} invoer={invoer} vervaltOp={reserveVervaltOp(ew.vorigeWoning!.leverdatum, termijn)} />}
          </>
        )}
        {verkoopjaar !== 'geen' && verkoopjaar !== String(jaar) && (
          <>
            <Rij>
              <Bedrag label="Verkoopprijs" value={eerder.verkoopprijs} onChange={(v) => zetEerder({ verkoopprijs: v })} />
              <Bedrag label="Verkoopkosten" value={eerder.verkoopkosten} onChange={(v) => zetEerder({ verkoopkosten: v })} />
              <Bedrag label="Eigenwoningschuld bij verkoop" value={eerder.eigenwoningschuld} onChange={(v) => zetEerder({ eigenwoningschuld: v })} />
              {aandeelVeld(eerder.aandeelA, (x) => zetEerder({ aandeelA: x }), '')}
            </Rij>
            <p className="text-xs text-gray-500">We bewaren alleen de eigenwoningreserve die hieruit volgt, met de datum.</p>
            {eerderSaldo && isDatum(eerder.leverdatum) && eerder.leverdatum < `${jaar}-01-01` && (
              <p className="text-sm text-gray-700">
                Eigenwoningreserve uit {eerder.leverdatum.slice(0, 4)}: {eerderSaldo.saldo > 0 ? reserveTekst(eerderSaldo.toevoegingen, invoer) : formatEuro(0)} · Geldt tot{' '}
                {formatDatum(reserveVervaltOp(eerder.leverdatum, termijn))}
              </p>
            )}
          </>
        )}
        {groepen.length > 0 && (
          <div data-veld="eigenWoning/eigenwoningreserve">
            <Subkop>Eigenwoningreserve uit eerdere jaren</Subkop>
            <ul className="space-y-1">
              {groepen.map((d) => {
                const t = (ew.eigenwoningreserve ?? []).filter((x) => x.datumToevoeging === d)
                return (
                  <li key={d} className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-gray-700">
                    <span>
                      Eigenwoningreserve uit {d.slice(0, 4)}: {reserveTekst(t, invoer)} · Geldt tot {formatDatum(reserveVervaltOp(d, termijn))}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        zetEw((e) => {
                          const rest = (e.eigenwoningreserve ?? []).filter((x) => x.datumToevoeging !== d)
                          if (rest.length > 0) e.eigenwoningreserve = rest
                          else delete e.eigenwoningreserve
                        })
                      }
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      Verwijder<span className="sr-only"> eigenwoningreserve uit {d.slice(0, 4)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div>
        <Subkop>Nieuwe woning</Subkop>
        <p className="-mt-2 mb-3 text-xs text-gray-500">Laat leeg als je in {jaar} geen woning kocht.</p>
        <Rij>
          <Datum label="Leverdatum" veld="eigenWoning/aankoop.leverdatum" value={aankoop.leverdatum} onChange={(v) => zetAankoop({ leverdatum: v })} hint={aankoop.koopsom !== undefined && !aankoop.leverdatum ? 'Nodig om de bijleenregeling te rekenen.' : undefined} />
          <Bedrag label="Koopsom" veld="eigenWoning/aankoop.koopsom" value={aankoop.koopsom} onChange={(v) => zetAankoop({ koopsom: v })} />
          <Bedrag label="Kosten koper" hint="Overdrachtsbelasting, notaris, taxatie en makelaar." veld="eigenWoning/aankoop.kostenKoper" value={aankoop.kostenKoper} onChange={(v) => zetAankoop({ kostenKoper: v })} />
          {aandeelVeld(aankoop.aandeelA, (x) => zetAankoop({ aandeelA: x }), 'eigenWoning/aankoop.aandeelA')}
        </Rij>
      </div>

      <Disclosure variant="kaal" titel={`Verbouwing of verbetering in ${jaar}`} subtitel="Met een nieuwe lening; de reserve gaat er eerst af" defaultOpen={Boolean(ew.verbeteringen?.length)}>
        <div data-veld="eigenWoning/verbeteringen" className="pt-2">
          <Rij>
            <Datum label="Datum" value={verbetering.datum} onChange={(v) => zetVerbetering({ datum: v })} />
            <Bedrag label="Kosten" value={verbetering.kosten} onChange={(v) => zetVerbetering({ kosten: v })} />
          </Rij>
        </div>
      </Disclosure>

      {bl && (
        <div className="space-y-3 border-t border-gray-200 pt-4">
          {bl.soort === 'aankoop' && bl.reserveVoor > 0 && (
            <p className="text-sm text-gray-700">
              Je overwaarde van {formatEuro(bl.reserveVoor)} gaat af van wat je met renteaftrek mag lenen: tot {formatEuro(bl.maxEigenwoningschuld)}. Leen je meer, dan is dat deel een box 3-schuld.
            </p>
          )}
          {bl.soort === 'aankoop' && bl.reserveVoor === 0 && bl.reserveNaAankoop > 0 && (
            <p className="text-sm text-gray-700">
              Je oude woning is na de nieuwe verkocht. De overwaarde verlaagt de lening voor deze woning niet; de reserve geldt tot {vroegsteVerval ? formatDatum(vroegsteVerval) : `${termijn} jaar na de verkoop`} voor een
              verbouwing of een volgende woning.
            </p>
          )}
          {bl.soort === 'aankoop' && bl.reserveVoor === 0 && bl.reserveNaAankoop === 0 && (
            <p className="text-sm text-gray-700">
              Je hebt geen eigenwoningreserve. Met renteaftrek mag je voor deze woning lenen tot {formatEuro(bl.maxEigenwoningschuld)}:{' '}
              {opsomming(['de koopsom', 'de kosten koper', bl.financieringskosten > 0 ? 'de financieringskosten' : '', (bl.kostenVerbetering ?? 0) > 0 ? `de verbouwing van ${formatEuro(bl.kostenVerbetering ?? 0)}` : ''].filter(Boolean))}.
            </p>
          )}
          {bl.soort === 'verbetering' && (
            <p className="text-sm text-gray-700">
              De verbouwing van {formatEuro(bl.kosten)} gaat eerst af van je eigenwoningreserve ({formatEuro(bl.reserveGebruikt)}). Met renteaftrek mag je voor de verbouwing lenen tot{' '}
              {formatEuro(bl.maxEigenwoningschuld)}.
            </p>
          )}
          {bl.leningen > 0 ? (
            <StatLijst>
              <StatRow label="Je leningdelen samen" bedrag={bl.leningen} toelichting={`Leningdelen met een startdatum in ${jaar}`} />
            </StatLijst>
          ) : (
            <p className="text-sm text-gray-600">Vul bij Leningdelen de nieuwe lening in, met de startdatum in {jaar}.</p>
          )}
          {bl.ander > 0 && (
            <Alert variant="let-op">
              {formatEuro(bl.ander)} is geen eigenwoningschuld. Dat deel staat vanaf 1 januari {jaar + 1} bij de schulden in box 3, met de rente die erbij hoort.{' '}
              <a href="#vermogen" className="font-medium underline underline-offset-2 transition-colors hover:text-amber-950">
                Naar box 3
              </a>
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}

function ReserveRegel({ saldo, invoer, vervaltOp }: { saldo: ReturnType<typeof vervreemdingssaldo>; invoer: HuishoudenInvoer; vervaltOp: string }) {
  if (saldo.saldo <= 0) {
    return <p className="text-sm text-gray-700">Er is geen overwaarde (saldo {formatEuro(saldo.saldo)}), dus geen eigenwoningreserve.</p>
  }
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium text-gray-900">Eigenwoningreserve</span>
        <span className="tabular-nums text-gray-900">{reserveTekst(saldo.toevoegingen, invoer)}</span>
      </div>
      <p className="mt-1 text-xs text-gray-600">Geldt tot {formatDatum(vervaltOp)}. Zolang je die niet in een nieuwe woning stopt, verlaagt hij je maximale eigenwoningschuld.</p>
    </div>
  )
}
