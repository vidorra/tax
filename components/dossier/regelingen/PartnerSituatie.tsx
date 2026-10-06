'use client'

/**
 * Ronde 2 (A5): bijzondere situatie "Partner werkt mee of stelt iets ter beschikking" bij een onderneming
 * (ONDERNEMING_SITUATIES, markering situaties-A5). Alleen met een fiscale partner en twee personen.
 *
 *  - "Hoe werkt {partner} mee?": Niet, Meewerkaftrek, Beloning of Anders (vof of loondienst, rekent de tool niet door).
 *    De keuze staat in `samenwerkingMetPartner`; uren en beloning in `meewerkendePartner`. Ingevulde bedragen blijven
 *    staan als je een andere keuze maakt (met de pijltjes door de chips lopen gooit niets weg); de engine rekent alleen
 *    met de gekozen vorm.
 *  - "Stelt {partner} iets ter beschikking aan de zaak?": de lijst staat hier, bij de onderneming die het gebruikt, maar
 *    wordt bij de partner opgeslagen (`PersoonInvoer.terbeschikkingstellingen`, `aan: { persoon, ondernemingId }`).
 *  - Per regel alleen het resultaat; de vrijstelling gaat over het saldo van alle regels van de partner.
 *
 * De bedragen (drempel, vrijstelling, eisen aan de werkruimte) komen uit de parameters van het jaar; de uitkomst rekent
 * live met dezelfde functies als de engine.
 */
import { Plus, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { HuishoudenInvoer, OndernemingInvoer, PersoonInvoer, TaxYearParams, TerbeschikkingstellingInvoer, TerbeschikkingstellingUitkomst } from '@/lib/tax/types'
import { metPartner, terbeschikkingstelling, werkruimteVoldoet } from '@/lib/tax/modules/partner'
import { standaardInSaldo, zitInSaldo, type InSaldoVraag } from '@/lib/tax/modules/onderneming/in-saldo'
import { veldVan } from '@/lib/dossier/veld'
import { willekeurigeId } from '@/lib/dossier/ids'
import { Alert, ChipGroup, Disclosure, Select, Toggle, formatEuro, formatPct, knopKlassen, kondigAan } from '@/components/ui'
import { Bedrag, Datum, Getal, Rij, Tekst } from '../velden'
import { persoonNaam, type Wijzig } from '../secties/types'
import type { OndernemingSituatie, OndernemingSituatieContext } from './onderneming-situaties'

type Keuze = 'geen' | 'meewerkaftrek' | 'arbeidsbeloning' | 'anders'

const KEUZES: Array<{ value: Keuze; label: string }> = [
  { value: 'geen', label: 'Niet' },
  { value: 'meewerkaftrek', label: 'Meewerkaftrek' },
  { value: 'arbeidsbeloning', label: 'Beloning' },
  { value: 'anders', label: 'Anders' },
]

const SOORTEN: Array<{ value: TerbeschikkingstellingInvoer['soort']; label: string }> = [
  { value: 'zaak', label: 'Zaak' },
  { value: 'lening', label: 'Lening' },
  { value: 'werkruimte', label: 'Werkruimte' },
  { value: 'overig', label: 'Anders' },
]
const GEEN_POSITIE = '__geen'
const SOORT_LABEL: Record<TerbeschikkingstellingInvoer['soort'], string> = { zaak: 'zaak', lening: 'lening', werkruimte: 'werkruimte', overig: 'anders' }

const WINSTBRON_LABEL: Record<NonNullable<OndernemingInvoer['winstBron']>, string> = {
  boekhouding: 'winst uit je boekhouding',
  'fiscaal-rapport': 'fiscaal rapport van je accountant',
}

/** De keuze bij "Hoe werkt {partner} mee?", ook voor oude invoer met alleen `meewerkendePartner`. */
export function keuzeVan(o: Pick<OndernemingInvoer, 'samenwerkingMetPartner' | 'meewerkendePartner'>, drempel: number | undefined): Keuze {
  const s = o.samenwerkingMetPartner
  if (s === 'vof' || s === 'loondienst') return 'anders'
  if (s) return s
  const mp = o.meewerkendePartner
  if (!mp) return 'geen'
  return drempel !== undefined && mp.vergoeding >= drempel ? 'arbeidsbeloning' : 'meewerkaftrek'
}

/** Terbeschikkingstellingen van de partner die naar deze onderneming wijzen (op id, terugval index). */
export function tbsVoorOnderneming(invoer: HuishoudenInvoer, persoonId: PersoonInvoer['id'], ondernemingId: string, ondernemingIndex: number): TerbeschikkingstellingInvoer[] {
  const partner = invoer.personen.find((p) => p.id !== persoonId)
  return (partner?.terbeschikkingstellingen ?? []).filter((t) => {
    if (t.aan.persoon !== persoonId) return false
    if (t.aan.ondernemingId) return t.aan.ondernemingId === ondernemingId
    if (t.aan.ondernemingIndex !== undefined) return t.aan.ondernemingIndex === ondernemingIndex
    return (invoer.personen.find((p) => p.id === persoonId)?.ondernemingen.length ?? 0) === 1
  })
}

const tbsVan = (ctx: OndernemingSituatieContext) => (ctx.huishouden ? tbsVoorOnderneming(ctx.huishouden.invoer, ctx.persoon.id, ctx.ondernemingId, ctx.ondernemingIndex) : [])

export const PARTNER_SITUATIE: OndernemingSituatie = {
  id: 'partner',
  optie: { id: 'partner', label: 'Partner werkt mee of stelt iets ter beschikking', uitleg: 'Beloning, meewerkaftrek, of iets dat je partner verhuurt of uitleent aan de zaak' },
  beschikbaar: (ctx) => !!ctx.huishouden && metPartner(ctx.huishouden.invoer),
  actief: (ctx) => ctx.onderneming.samenwerkingMetPartner !== undefined || ctx.onderneming.meewerkendePartner !== undefined || tbsVan(ctx).length > 0,
  voegToe: (ctx) => ctx.pas((o) => void (o.samenwerkingMetPartner = 'geen')),
  haalWeg: (ctx) => {
    ctx.pas((o) => {
      delete o.samenwerkingMetPartner
      delete o.meewerkendePartner
    })
    const weg = new Set(tbsVan(ctx).map((t) => t.id))
    if (weg.size === 0 || !ctx.huishouden) return
    ctx.huishouden.wijzig((d) => {
      const partner = d.personen.find((p) => p.id !== ctx.persoon.id)
      if (!partner?.terbeschikkingstellingen) return
      const rest = partner.terbeschikkingstellingen.filter((t) => !weg.has(t.id))
      if (rest.length > 0) partner.terbeschikkingstellingen = rest
      else delete partner.terbeschikkingstellingen
    })
  },
  heeftBedragen: (ctx) => (ctx.onderneming.meewerkendePartner?.vergoeding ?? 0) > 0 || (ctx.onderneming.meewerkendePartner?.uren ?? 0) > 0 || tbsVan(ctx).length > 0,
  titel: () => 'Partner werkt mee of stelt iets ter beschikking',
  blok: (ctx) => <PartnerSituatie ctx={ctx} />,
}

/** "Zit al in je winst: ja · volgt uit: winst uit je boekhouding · Aanpassen" (ontwerp 2.5). */
function InSaldoRegel({ expliciet, onderneming, vraag, wat, veld, onChange }: { expliciet: boolean | undefined; onderneming: OndernemingInvoer; vraag: InSaldoVraag; wat: string; veld?: string; onChange: (v: boolean | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const standaard = standaardInSaldo(onderneming, vraag)
  const antwoord = zitInSaldo(expliciet, onderneming, vraag)
  const paneel = `${useId().replace(/:/g, '')}-insaldo`
  return (
    <div data-veld={veld} className="text-sm text-gray-700">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <span>Zit al in je winst: {antwoord ? 'ja' : 'nee'}</span>
        <span aria-hidden="true">·</span>
        <span>{expliciet === undefined ? `volgt uit: ${WINSTBRON_LABEL[onderneming.winstBron ?? 'boekhouding']}` : 'zelf aangepast'}</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={paneel}
          onClick={() => setOpen((x) => !x)}
          className="inline-flex min-h-[44px] items-center font-medium text-primary transition-colors hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Aanpassen<span className="sr-only">: zit {wat} al in je winst?</span>
        </button>
      </p>
      <div id={paneel} hidden={!open} className="pb-1">
        <ChipGroup<'ja' | 'nee'>
          label={`Zit ${wat} al in je winst?`}
          kolommen={2}
          value={antwoord ? 'ja' : 'nee'}
          onChange={(v) => onChange(v === 'ja' ? (standaard ? undefined : true) : standaard ? false : undefined)}
          options={[
            { value: 'ja', label: 'Ja' },
            { value: 'nee', label: 'Nee' },
          ]}
          hint="Ja als het bedrag al als kosten in je boekhouding of jaarrekening staat. Nee als het daar nog niet in zit; dan trekt de tool het van je winst af."
        />
      </div>
    </div>
  )
}

export function PartnerSituatie({ ctx }: { ctx: OndernemingSituatieContext }) {
  const h = ctx.huishouden
  if (!h) return null
  return <PartnerBlok ctx={ctx} invoer={h.invoer} wijzig={h.wijzig} />
}

function PartnerBlok({ ctx, invoer, wijzig }: { ctx: OndernemingSituatieContext; invoer: HuishoudenInvoer; wijzig: Wijzig }) {
  const { persoon, onderneming: o, ondernemingId, pas, jaar, params } = ctx
  const wortel = useRef<HTMLDivElement>(null)
  const toevoegen = useRef<HTMLButtonElement>(null)
  const [focusOp, setFocusOp] = useState<string | null>(null)
  const partner = invoer.personen.find((p) => p.id !== persoon.id)
  const lijst = tbsVoorOnderneming(invoer, persoon.id, ondernemingId, ctx.ondernemingIndex)
  const uitkomstTbs = useMemo<TerbeschikkingstellingUitkomst | null>(() => (partner && params ? terbeschikkingstelling(partner, invoer, params) : null), [partner, invoer, params])

  useEffect(() => {
    if (!focusOp) return
    wortel.current?.querySelector<HTMLInputElement>(`[data-veld="${CSS.escape(veldVan.persoon(partner?.id ?? 'B', `terbeschikkingstelling:${focusOp}`, 'omschrijving'))}"] input`)?.focus()
    setFocusOp(null)
  }, [focusOp, partner?.id])

  if (!partner) return null
  const A = persoonNaam(persoon)
  const B = persoonNaam(partner)
  const drempel = params?.ondernemer.waarde.meewerkaftrek.maxVergoeding
  const minUren = params ? Math.min(...params.ondernemer.waarde.meewerkaftrek.staffel.map((s) => s.vanafUren)) : undefined
  const keuze = keuzeVan(o, drempel)
  const mp = o.meewerkendePartner
  const vergoeding = mp?.vergoeding ?? 0
  const veld = (naam: string) => veldVan.onderneming(persoon.id, ondernemingId, naam)
  const tbsVeld = (t: TerbeschikkingstellingInvoer, naam: string) => veldVan.persoon(partner.id, `terbeschikkingstelling:${t.id}`, naam)
  const meewerkaftrek = ctx.uitkomst?.persoon?.ondernemersaftrek.meewerkaftrek
  const urencriterium = ctx.uitkomst?.onderneming?.urencriteriumGehaald

  const kies = (k: Keuze) =>
    pas((x) => {
      x.samenwerkingMetPartner = k === 'anders' ? (x.samenwerkingMetPartner === 'loondienst' ? 'loondienst' : 'vof') : k
      if ((k === 'meewerkaftrek' || k === 'arbeidsbeloning') && !x.meewerkendePartner) x.meewerkendePartner = { uren: 0, vergoeding: 0 }
    })
  const zetBeloning = (fn: (m: NonNullable<OndernemingInvoer['meewerkendePartner']>) => void) =>
    pas((x) => {
      const m = x.meewerkendePartner ?? { uren: 0, vergoeding: 0 }
      fn(m)
      x.meewerkendePartner = m
    })

  const wijzigTbs = (id: string, fn: (t: TerbeschikkingstellingInvoer) => void) =>
    wijzig((d) => {
      const t = d.personen.find((p) => p.id === partner.id)?.terbeschikkingstellingen?.find((x) => x.id === id)
      if (t) fn(t)
    })
  const voegTbsToe = () => {
    const id = willekeurigeId('tbs')
    wijzig((d) => {
      const b = d.personen.find((p) => p.id === partner.id)
      if (!b) return
      const aan: TerbeschikkingstellingInvoer['aan'] = o.id ? { persoon: persoon.id, ondernemingId: o.id } : { persoon: persoon.id, ondernemingIndex: ctx.ondernemingIndex }
      b.terbeschikkingstellingen = [...(b.terbeschikkingstellingen ?? []), { id, omschrijving: '', aan, soort: 'zaak', vergoeding: 0 }]
    })
    setFocusOp(id)
  }
  const haalTbsWeg = (t: TerbeschikkingstellingInvoer) => {
    wijzig((d) => {
      const b = d.personen.find((p) => p.id === partner.id)
      if (!b?.terbeschikkingstellingen) return
      const rest = b.terbeschikkingstellingen.filter((x) => x.id !== t.id)
      if (rest.length > 0) b.terbeschikkingstellingen = rest
      else delete b.terbeschikkingstellingen
    })
    kondigAan(`${t.omschrijving.trim() || 'Terbeschikkingstelling'} is weggehaald.`)
    toevoegen.current?.focus()
  }

  const alleTbsHier = (partner.terbeschikkingstellingen ?? []).length === lijst.length
  const heeftWerkruimte = lijst.some((t) => t.soort === 'werkruimte')

  return (
    <div ref={wortel} className="space-y-5">
      <div data-veld={veld('samenwerkingMetPartner')}>
        <ChipGroup<Keuze> label={`Hoe werkt ${B} mee?`} value={keuze} onChange={kies} options={KEUZES} />
      </div>

      {(keuze === 'meewerkaftrek' || keuze === 'arbeidsbeloning') && (
        <div className="space-y-3">
          <Rij>
            {keuze === 'meewerkaftrek' && (
              <Getal
                label={`Uren dat ${B} meewerkt`}
                suffix="uur"
                veld={veld('meewerkendePartner.uren')}
                hint={minUren !== undefined ? `Meewerkaftrek kan vanaf ${minUren} uur per jaar.` : undefined}
                value={mp?.uren || undefined}
                onChange={(v) => zetBeloning((m) => void (m.uren = v ?? 0))}
              />
            )}
            <Bedrag
              label="Beloning per jaar"
              veld={veld('meewerkendePartner.vergoeding')}
              hint={keuze === 'meewerkaftrek' ? `Laat leeg als je ${B} niets betaalt.` : undefined}
              value={vergoeding || undefined}
              onChange={(v) => zetBeloning((m) => void (m.vergoeding = v ?? 0))}
            />
          </Rij>
          {vergoeding > 0 && (
            <InSaldoRegel
              expliciet={mp?.vergoedingInKosten}
              onderneming={o}
              vraag="partner"
              wat="de beloning"
              veld={veld('meewerkendePartner.vergoedingInKosten')}
              onChange={(v) => zetBeloning((m) => (v === undefined ? delete m.vergoedingInKosten : (m.vergoedingInKosten = v)))}
            />
          )}
          {drempel !== undefined && vergoeding >= drempel && (
            <p className="text-sm text-gray-700">
              {keuze === 'meewerkaftrek' ? `Vanaf ${formatEuro(drempel)} is het een beloning en geen meewerkaftrek. ` : ''}
              Aftrekbaar bij {A}: {formatEuro(vergoeding)}. Belast bij {B}: {formatEuro(vergoeding)}.
            </p>
          )}
          {drempel !== undefined && vergoeding > 0 && vergoeding < drempel && keuze === 'arbeidsbeloning' && (
            <p className="text-sm text-gray-700">
              Aftrekbaar vanaf {formatEuro(drempel)}. Daaronder is de beloning niet aftrekbaar en bij {B} niet belast; meewerkaftrek kan dan wel.
            </p>
          )}
          {drempel !== undefined && vergoeding > 0 && vergoeding < drempel && keuze === 'meewerkaftrek' && (
            <p className="text-sm text-gray-700">Een beloning onder {formatEuro(drempel)} is niet aftrekbaar en bij {B} niet belast.</p>
          )}
          {keuze === 'meewerkaftrek' && (drempel === undefined || vergoeding < drempel) && (mp?.uren ?? 0) >= (minUren ?? Infinity) && meewerkaftrek !== undefined && (
            <p className="text-sm text-gray-700">
              {meewerkaftrek > 0
                ? `Meewerkaftrek bij ${A}: ${formatEuro(meewerkaftrek)}.`
                : urencriterium === false
                  ? `Geen meewerkaftrek: daarvoor moet ${A} aan het urencriterium voldoen.`
                  : 'Geen meewerkaftrek.'}
            </p>
          )}
        </div>
      )}

      {keuze === 'anders' && <p className="text-sm text-gray-700">Een vof of loondienst bij je partner rekent de tool niet door. De winst van de vof vul je per persoon in als onderneming.</p>}

      <div className="space-y-3 border-t border-gray-200 pt-4">
        <div>
          <h5 className="text-sm font-medium text-gray-900">Stelt {B} iets ter beschikking aan de zaak?</h5>
          <p className="mt-0.5 text-xs text-gray-500">Bijvoorbeeld een bus die {B} verhuurt, geld dat {B} uitleent of een werkruimte in het huis van {B}. Ook zonder vergoeding.</p>
        </div>
        {lijst.map((t) => (
          <TbsKaart
            key={t.id}
            t={t}
            A={A}
            B={B}
            jaar={jaar}
            onderneming={o}
            invoer={invoer}
            uitkomst={uitkomstTbs}
            veld={(naam) => tbsVeld(t, naam)}
            wijzig={(fn) => wijzigTbs(t.id, fn)}
            onWeghalen={() => haalTbsWeg(t)}
          />
        ))}
        {heeftWerkruimte && params && <WerkruimteToets o={o} pas={pas} params={params} A={A} veld={veld} />}
        {lijst.length > 0 && uitkomstTbs && (
          <p className="text-sm text-gray-700">
            {alleTbsHier ? `Bij ${B}` : `Bij ${B}, alles samen`}: resultaat {formatEuro(uitkomstTbs.resultaat)} · vrijstelling {formatEuro(uitkomstTbs.vrijstelling)} · belast {formatEuro(uitkomstTbs.belastbaar)}
          </p>
        )}
        <button ref={toevoegen} type="button" className={knopKlassen('secundair', 'sm')} onClick={voegTbsToe}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Iets toevoegen
        </button>
      </div>
    </div>
  )
}

function TbsKaart({
  t,
  A,
  B,
  jaar,
  onderneming,
  invoer,
  uitkomst,
  veld,
  wijzig,
  onWeghalen,
}: {
  t: TerbeschikkingstellingInvoer
  A: string
  B: string
  jaar: number
  onderneming: OndernemingInvoer
  invoer: HuishoudenInvoer
  uitkomst: TerbeschikkingstellingUitkomst | null
  veld: (naam: string) => string
  wijzig: (fn: (t: TerbeschikkingstellingInvoer) => void) => void
  onWeghalen: () => void
}) {
  const kopId = `${useId().replace(/:/g, '')}-tbs`
  const naam = t.omschrijving.trim() || 'Nieuw'
  const regel = uitkomst?.regels.find((r) => r.id === t.id)
  const nietGeteld = uitkomst?.nietGeteld?.find((x) => x.id === t.id)
  const metBox3 = t.soort === 'zaak' || t.soort === 'lening' || t.soort === 'overig'
  const metAfschrijving = t.soort !== 'lening'
  const posities = invoer.box3.posities
  const eigenaarNaam = (e: string) => {
    const p = invoer.personen.find((x) => x.id === e)
    return p ? persoonNaam(p) : 'kind'
  }

  return (
    <div role="group" aria-labelledby={kopId} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p id={kopId} className="min-w-0 truncate text-sm font-medium text-gray-900">
          {naam} · {SOORT_LABEL[t.soort]}
        </p>
        <button
          type="button"
          onClick={onWeghalen}
          className="inline-flex min-h-[44px] flex-shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          Weghalen<span className="sr-only"> {naam}</span>
        </button>
      </div>
      <div className="space-y-4">
        <Rij>
          <Tekst label="Omschrijving" verplicht placeholder="Bijvoorbeeld: bestelbus" veld={veld('omschrijving')} value={t.omschrijving} onChange={(v) => wijzig((x) => void (x.omschrijving = v))} />
          <div data-veld={veld('soort')}>
            <ChipGroup<TerbeschikkingstellingInvoer['soort']> label="Wat is het?" value={t.soort} onChange={(v) => wijzig((x) => void (x.soort = v))} options={SOORTEN} />
          </div>
          <Bedrag
            label={t.soort === 'lening' ? 'Rente per jaar' : 'Vergoeding per jaar'}
            veld={veld('vergoeding')}
            hint={`Wat ${A} aan ${B} betaalt. Leeg als ${A} niets betaalt.`}
            value={t.vergoeding || undefined}
            onChange={(v) => wijzig((x) => void (x.vergoeding = v ?? 0))}
          />
          <Bedrag label="Kosten" veld={veld('kosten')} hint={`Kosten die ${B} zelf betaalt, zoals verzekering en onderhoud.`} value={t.kosten} onChange={(v) => wijzig((x) => (v === undefined ? delete x.kosten : (x.kosten = v)))} />
          {metAfschrijving && <Bedrag label="Afschrijving" veld={veld('afschrijving')} value={t.afschrijving} onChange={(v) => wijzig((x) => (v === undefined ? delete x.afschrijving : (x.afschrijving = v)))} />}
          {metBox3 && posities.length > 0 && (
            <div data-veld={veld('box3PositieId')}>
              <Select
                label="Staat dit ook bij je bezittingen in box 3?"
                value={t.box3PositieId ?? GEEN_POSITIE}
                hint="De bezitting die je kiest, telt dan niet mee in box 3."
                onChange={(v) => wijzig((x) => (v !== GEEN_POSITIE ? (x.box3PositieId = v) : delete x.box3PositieId))}
                options={[
                  { value: GEEN_POSITIE, label: 'Nee, staat er niet bij' },
                  ...posities.map((p, i) => ({ value: p.id, label: `${p.omschrijving.trim() || `Bezitting ${i + 1}`} · ${eigenaarNaam(p.eigenaar)}` })),
                ]}
              />
            </div>
          )}
        </Rij>
        {t.vergoeding > 0 && (
          <InSaldoRegel
            expliciet={t.vergoedingInKosten}
            onderneming={onderneming}
            vraag="tbs"
            wat="de vergoeding"
            veld={veld('vergoedingInKosten')}
            onChange={(v) => wijzig((x) => (v === undefined ? delete x.vergoedingInKosten : (x.vergoedingInKosten = v)))}
          />
        )}
        {metAfschrijving && (
          <Disclosure variant="kaal" titel="Waarde en einde" subtitel="Voor de afschrijving, en als het dit jaar stopte of is verkocht" defaultOpen={Boolean(t.einde || t.waardeBijAanvang || t.boekwaardeBegin)}>
            <div className="space-y-4 pt-2">
              <Rij>
                <Bedrag
                  label="Waarde bij aanvang"
                  veld={veld('waardeBijAanvang')}
                  hint="De waarde in het economisch verkeer toen de terbeschikkingstelling begon."
                  value={t.waardeBijAanvang}
                  onChange={(v) => wijzig((x) => (v === undefined ? delete x.waardeBijAanvang : (x.waardeBijAanvang = v)))}
                />
                <Bedrag
                  label={`Boekwaarde 1 januari ${jaar}`}
                  veld={veld('boekwaardeBegin')}
                  hint="Komt uit vorig jaar als dat in je dossier staat."
                  value={t.boekwaardeBegin}
                  onChange={(v) => wijzig((x) => (v === undefined ? delete x.boekwaardeBegin : (x.boekwaardeBegin = v)))}
                />
              </Rij>
              <div data-veld={t.einde ? undefined : veld('einde.datum')}>
                <Toggle
                  label={`Gestopt of verkocht in ${jaar}`}
                  description="Het verschil tussen de opbrengst en de boekwaarde telt dan mee in het resultaat."
                  checked={Boolean(t.einde)}
                  onChange={(aan) => wijzig((x) => (aan ? (x.einde = { datum: `${jaar}-12-31`, opbrengst: 0 }) : delete x.einde))}
                />
              </div>
              {t.einde && (
                <Rij>
                  <Datum label="Datum" veld={veld('einde.datum')} verplicht value={t.einde.datum} onChange={(v) => wijzig((x) => void (x.einde = { datum: v ?? `${jaar}-12-31`, opbrengst: x.einde?.opbrengst ?? 0 }))} />
                  <Bedrag label="Opbrengst of waarde" veld={veld('einde.opbrengst')} value={t.einde.opbrengst} onChange={(v) => wijzig((x) => void (x.einde = { datum: x.einde?.datum ?? `${jaar}-12-31`, opbrengst: v ?? 0 }))} />
                </Rij>
              )}
            </div>
          </Disclosure>
        )}
        {nietGeteld?.reden === 'werkruimte' ? (
          <Alert variant="let-op">Geen terbeschikkingstelling: de werkruimte voldoet niet aan de voorwaarden voor aftrek, dus de onderneming kan er geen vergoeding voor aftrekken.</Alert>
        ) : (
          regel && (
            <p className="text-sm text-gray-700">
              Resultaat bij {B}: {formatEuro(regel.resultaat)}
              {regel.boekwinst !== undefined ? `, met ${formatEuro(regel.boekwinst)} boekwinst` : ''}
            </p>
          )
        )}
      </div>
    </div>
  )
}

/** Werkruimtetoets van art. 3.16 lid 1, alleen als er een werkruimte ter beschikking staat. */
function WerkruimteToets({ o, pas, params, A, veld }: { o: OndernemingInvoer; pas: (fn: (x: OndernemingInvoer) => void) => void; params: TaxYearParams; A: string; veld: (naam: string) => string }) {
  const eis = params.ondernemer.waarde.werkruimte
  const w = o.werkruimte
  const zet = (fn: (x: NonNullable<OndernemingInvoer['werkruimte']>) => void) =>
    pas((x) => {
      const n = x.werkruimte ?? { zelfstandig: false, werkplekElders: false, deelInkomenIn: 0, deelInkomenInOfVanuit: 0, kosten: 0 }
      fn(n)
      x.werkruimte = n
    })
  const voldoet = werkruimteVoldoet(o, params)
  const pctVeld = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 1000) / 10)
  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-900">Voldoet de werkruimte aan de voorwaarden?</p>
      {eis.zelfstandigheidsEis && (
        <div data-veld={veld('werkruimte.zelfstandig')}>
          <Toggle label="Zelfstandige werkruimte" description="Met een eigen opgang en eigen sanitair." checked={Boolean(w?.zelfstandig)} onChange={(aan) => zet((x) => void (x.zelfstandig = aan))} />
        </div>
      )}
      <div data-veld={veld('werkruimte.werkplekElders')}>
        <Toggle label={`${A} heeft ook een werkplek buiten deze werkruimte`} checked={Boolean(w?.werkplekElders)} onChange={(aan) => zet((x) => void (x.werkplekElders = aan))} />
      </div>
      <Rij>
        <Getal
          label="Deel van het inkomen verdiend in de werkruimte"
          suffix="%"
          decimalen={1}
          max={100}
          veld={veld('werkruimte.deelInkomenIn')}
          hint={`Minstens ${formatPct(w?.werkplekElders ? eis.inkomensEisMetWerkplekElders[1] : eis.inkomensEisZonderWerkplekElders, 0)}.`}
          value={pctVeld(w?.deelInkomenIn)}
          onChange={(v) => zet((x) => void (x.deelInkomenIn = Math.min(100, Math.max(0, v ?? 0)) / 100))}
        />
        {w?.werkplekElders && (
          <Getal
            label="Deel van het inkomen verdiend in of vanuit de werkruimte"
            suffix="%"
            decimalen={1}
            max={100}
            veld={veld('werkruimte.deelInkomenInOfVanuit')}
            hint={`Minstens ${formatPct(eis.inkomensEisMetWerkplekElders[0], 0)}.`}
            value={pctVeld(w.deelInkomenInOfVanuit)}
            onChange={(v) => zet((x) => void (x.deelInkomenInOfVanuit = Math.min(100, Math.max(0, v ?? 0)) / 100))}
          />
        )}
      </Rij>
      <p className="text-sm text-gray-700">{voldoet ? 'De werkruimte voldoet aan de voorwaarden.' : 'De werkruimte voldoet niet aan de voorwaarden.'}</p>
    </div>
  )
}
