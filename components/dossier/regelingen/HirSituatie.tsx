'use client'

/**
 * Ronde 2 (A6): herinvesteringsreserve (art. 3.54) in de editor, op drie plekken (taak-A6 9.3):
 * - `HirSituatie`: het blok uit "Bijzondere situatie toevoegen" met alle reserves van de onderneming (ook een reserve na
 *   een schadevergoeding, zonder middel in het register);
 * - `HirReserveren`: de schakelaar bij een verkocht middel met boekwinst in het activaregister;
 * - `HirAfboeking`: "Herinvesteringsreserve afboeken: tot € …" bij een investering binnen de termijn.
 * Alle bedragen en grenzen komen uit de engine (`OndernemingResultaat.herinvesteringsreserves`); de UI rekent alleen
 * de tekst "tot € …" voor (dezelfde regel als de engine).
 */
import { useEffect, useId, useState } from 'react'
import type { ActiefInvoer, AfschrijvingActief, HerinvesteringsreserveInvoer, HerinvesteringsreserveUitkomst, InvesteringInvoer, OndernemingInvoer, TaxYearParams } from '@/lib/tax/types'
import { veldVan } from '@/lib/dossier/veld'
import { standaardInSaldo } from '@/lib/tax/modules/onderneming/in-saldo'
import { hirUiterlijkJaar, kanReserveren, nieuwLanglopend } from '@/lib/tax/modules/onderneming/reserves'
import { Alert, Button, Disclosure, Select, StatLijst, StatRow, Toggle, formatEuro, kondigAan } from '@/components/ui'
import { Bedrag, Getal, Lijst, Rij, Tekst } from '../velden'
import type { OndernemingSituatieContext } from './onderneming-situaties'
import { OngedaanMelding } from './SituatieBlok'
import { InSaldoRegel } from './WinstBronVraag'
import { hirBeschikbaar, hirMaxVoorInvestering, hirUitActief, hirVoorActief, nieuweHerkomst, nieuweHir, vrijeId } from './onderneming-regelingen'

const termijnVan = (params: TaxYearParams | null) => params?.ondernemer.waarde.hir.termijnJaren

/** Het blok uit Bijzondere situatie: alle herinvesteringsreserves van deze onderneming. */
export function HirSituatie({ ctx }: { ctx: OndernemingSituatieContext }) {
  const { jaar, params, persoon, onderneming: o, ondernemingId } = ctx
  const uitkomsten = ctx.uitkomst?.onderneming?.herinvesteringsreserves
  const veld = (id: string, pad: string) => veldVan.onderneming(persoon.id, ondernemingId, `herinvesteringsreserve:${id}`, pad)
  const termijn = termijnVan(params)
  const langlopendJaren = params?.ondernemer.waarde.hir.langlopendVanafJaren
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-gray-600">
        Met een herinvesteringsreserve betaal je nu geen belasting over de boekwinst op een verkocht bedrijfsmiddel, of over een vergoeding voor schade of verlies, als je
        {termijn ? ` binnen ${termijn} jaar` : ''} opnieuw investeert. De reserve gaat dan af van de aanschafwaarde van het nieuwe bedrijfsmiddel. Bij een verkoop in het register zet je hem
        aan bij dat bedrijfsmiddel.
      </p>
      <Lijst<HerinvesteringsreserveInvoer>
        items={o.herinvesteringsreserves}
        onChange={(l) =>
          ctx.pas((x) => {
            const weg = new Set((x.herinvesteringsreserves ?? []).map((r) => r.id).filter((id) => !l.some((r) => r.id === id)))
            for (const inv of x.investeringen ?? []) if (inv.herinvesteringsreserve && weg.has(inv.herinvesteringsreserve.reserveId)) delete inv.herinvesteringsreserve
            if (l.length > 0) x.herinvesteringsreserves = l
            else delete x.herinvesteringsreserves
          })
        }
        nieuw={() => nieuweHir(o, jaar)}
        titel={(r) => `${r.herkomst.omschrijving.trim() || 'Reserve'} uit ${r.ontstaanJaar}`}
        toevoegLabel="Nog een herinvesteringsreserve"
      >
        {(r, pasR) => {
          const u = uitkomsten?.find((x) => x.id === r.id)
          const uiterlijk = u?.uiterlijkJaar ?? (params ? hirUiterlijkJaar(r, params) : undefined)
          const ontstaanDitJaar = r.ontstaanJaar === jaar
          const boekwinst = r.herkomst.opbrengst !== undefined ? Math.max(0, r.herkomst.opbrengst - r.herkomst.boekwaardeOud) : undefined
          return (
            <div className="space-y-4">
              {r.herkomst.actiefHerkomst && <p className="text-xs text-gray-500">Uit een verkoop in je bedrijfsmiddelen. Opbrengst en boekwaarde staan daar; pas ze hier alleen aan als dat nodig is.</p>}
              <Rij>
                <Tekst
                  label="Verkocht of verloren bedrijfsmiddel"
                  verplicht
                  veld={veld(r.id, 'herkomst.omschrijving')}
                  placeholder="Bijvoorbeeld: bestelbus"
                  value={r.herkomst.omschrijving}
                  onChange={(v) => pasR((x) => void (x.herkomst.omschrijving = v))}
                />
                <Getal label="Jaar van de verkoop of schade" min={jaar - 10} max={jaar} veld={veld(r.id, 'ontstaanJaar')} value={r.ontstaanJaar} onChange={(v) => pasR((x) => void (x.ontstaanJaar = v ?? jaar))} />
                <Bedrag
                  label={r.herkomst.schadeloosstelling ? 'Vergoeding van de verzekering' : 'Opbrengst'}
                  veld={veld(r.id, 'herkomst.opbrengst')}
                  hint="Exclusief btw."
                  value={r.herkomst.opbrengst}
                  onChange={(v) => pasR((x) => (v === undefined ? delete x.herkomst.opbrengst : (x.herkomst.opbrengst = v)))}
                />
                <Bedrag
                  label="Boekwaarde vlak voor de verkoop"
                  veld={veld(r.id, 'herkomst.boekwaardeOud')}
                  hint="Zonder willekeurige afschrijving. Schreef je willekeurig af (starter of VAMIL), vul dan de boekwaarde in alsof je gewoon had afgeschreven: het verschil is direct belast."
                  value={r.herkomst.boekwaardeOud}
                  onChange={(v) => pasR((x) => void (x.herkomst.boekwaardeOud = v ?? 0))}
                />
                {ontstaanDitJaar ? (
                  <Bedrag
                    label="Bedrag in de reserve"
                    veld={veld(r.id, 'bedragOntstaan')}
                    hint={boekwinst !== undefined ? `Ten hoogste de boekwinst: ${formatEuro(boekwinst)}.` : 'Ten hoogste de boekwinst: opbrengst min boekwaarde.'}
                    value={r.bedragOntstaan}
                    onChange={(v) => pasR((x) => void (x.bedragOntstaan = v ?? 0))}
                  />
                ) : (
                  <Bedrag
                    label="Stand op 1 januari"
                    veld={veld(r.id, 'standBegin')}
                    hint={`De stand eind ${jaar - 1} uit je aangifte of rapport van ${jaar - 1}.`}
                    value={r.standBegin}
                    onChange={(v) => pasR((x) => void (x.standBegin = v ?? 0))}
                  />
                )}
              </Rij>
              <div data-veld={veld(r.id, 'herkomst.schadeloosstelling')}>
                <Toggle
                  label="Vergoeding voor schade of verlies"
                  description="Bijvoorbeeld een uitkering na diefstal of total loss. Ook dan kun je de boekwinst reserveren."
                  checked={Boolean(r.herkomst.schadeloosstelling)}
                  onChange={(aan) => pasR((x) => (aan ? (x.herkomst.schadeloosstelling = true) : delete x.herkomst.schadeloosstelling))}
                />
              </div>
              <div data-veld={veld(r.id, 'voornemen')}>
                <Toggle
                  label="Je bent nog van plan opnieuw te investeren"
                  description={r.voornemen ? undefined : `Dan valt de reserve dit jaar vrij in de winst${u ? `: ${formatEuro(u.vrijval)}` : ''}.`}
                  checked={r.voornemen}
                  onChange={(aan) => pasR((x) => void (x.voornemen = aan))}
                />
              </div>
              <div data-veld={veld(r.id, 'herkomst.langlopend')}>
                <Toggle
                  label={`Het verkochte middel schreef je niet of in meer dan ${langlopendJaren ?? 10} jaar af`}
                  description="Zoals een pand. Dan mag je de reserve op een pand of ander langlopend middel alleen afboeken als dat dezelfde functie heeft. Op een kortlopend middel mag het altijd."
                  checked={r.herkomst.langlopend}
                  onChange={(aan) => pasR((x) => void (x.herkomst.langlopend = aan))}
                />
              </div>
              <Disclosure variant="kaal" titel="Langere termijn" subtitel="Alleen als de herinvestering langer duurt, bijvoorbeeld bij een pand in aanbouw" defaultOpen={r.termijnVerlengdTot !== undefined}>
                <Rij className="pt-2">
                  <Getal
                    label="Termijn verlengd tot en met"
                    veld={veld(r.id, 'termijnVerlengdTot')}
                    min={r.ontstaanJaar}
                    max={r.ontstaanJaar + 20}
                    hint={termijn ? `Normaal ${termijn} jaar: tot en met ${r.ontstaanJaar + termijn}. Langer mag alleen als dat door de aard van het middel nodig is, of als de bouw al is begonnen.` : undefined}
                    value={r.termijnVerlengdTot}
                    onChange={(v) => pasR((x) => (v === undefined ? delete x.termijnVerlengdTot : (x.termijnVerlengdTot = v)))}
                  />
                </Rij>
              </Disclosure>
              <InSaldoRegel
                label="Zit al in je winst"
                veld={veld(r.id, 'mutatiesInSaldo')}
                expliciet={r.mutatiesInSaldo}
                standaard={standaardInSaldo(o, 'hir')}
                onderneming={o}
                uitleg="Nee: je saldo bevat de boekwinst zoals geboekt; wij halen de toevoeging eraf en tellen een vrijval erbij. Ja: de reserve staat al in je saldo, wij houden alleen de stand bij."
                onChange={(v) => pasR((x) => (v === undefined ? delete x.mutatiesInSaldo : (x.mutatiesInSaldo = v)))}
              />
              {u ? (
                <StatLijst className="rounded-xl border border-gray-200 bg-white px-4">
                  {!ontstaanDitJaar && <StatRow label="Stand op 1 januari" bedrag={u.standBegin} />}
                  {u.dotatie > 0 && <StatRow label="Toevoeging" bedrag={u.dotatie} toelichting={u.begrensd ? `Begrensd op de boekwinst (je vroeg ${formatEuro(u.begrensd.gevraagd)}).` : undefined} />}
                  {u.afboeking > 0 && <StatRow label="Afgeboekt op investeringen" variant="min" bedrag={u.afboeking} />}
                  {u.vrijval > 0 && <StatRow label="Valt vrij in de winst" variant="min" bedrag={u.vrijval} />}
                  <StatRow label={`Stand eind ${jaar}`} variant="subtotaal" bedrag={u.standEind} toelichting={uiterlijk !== undefined && u.standEind > 0 ? `Besteden vóór eind ${uiterlijk}.` : undefined} />
                </StatLijst>
              ) : (
                <p className="text-xs text-gray-500">Nog geen uitkomst. Controleer de bedragen.</p>
              )}
            </div>
          )
        }}
      </Lijst>
    </div>
  )
}

/** Zijn er bedragen ingevuld bij de herinvesteringsreserves? */
export const hirHeeftBedragen = (o: OndernemingInvoer): boolean =>
  (o.herinvesteringsreserves ?? []).some((r) => r.bedragOntstaan > 0 || r.standBegin > 0 || (r.herkomst.opbrengst ?? 0) > 0) ||
  (o.investeringen ?? []).some((inv) => (inv.herinvesteringsreserve?.afboeking ?? 0) > 0)

export interface HirReserverenProps {
  onderneming: OndernemingInvoer
  actief: ActiefInvoer
  /** Uitkomst van het register voor dit middel (boekwinst). */
  r: AfschrijvingActief | undefined
  jaar: number
  params: TaxYearParams | null
  pas: (fn: (x: OndernemingInvoer) => void) => void
  /** Positie van het middel in `activa`. */
  index: number
  veld?: string
  uitkomst?: HerinvesteringsreserveUitkomst[]
}

/**
 * De schakelaar bij een verkocht middel met boekwinst (niet bij beleggingen en kleine middelen, lid 7). Aan maakt een
 * reserve met de boekwinst en koppelt die aan het middel; uit haalt hem weg, met Ongedaan maken.
 */
export function HirReserveren({ onderneming: o, actief: a, r, jaar, params, pas, index, veld, uitkomst }: HirReserverenProps) {
  const [weg, setWeg] = useState<{ reserve: HerinvesteringsreserveInvoer; afboekingen: Array<{ index: number; hir: NonNullable<InvesteringInvoer['herinvesteringsreserve']> }> } | null>(null)
  const [terugFocus, setTerugFocus] = useState(false)
  const schakelaarId = `hir-${useId().replace(/:/g, '')}`
  const reserve = hirVoorActief(o, a)
  // Na Ongedaan maken verdwijnt de melding met de knop; de focus gaat terug naar de schakelaar.
  useEffect(() => {
    if (!terugFocus || !reserve) return
    document.getElementById(schakelaarId)?.focus()
    setTerugFocus(false)
  }, [terugFocus, reserve, schakelaarId])
  const verkochtDitJaar = a.verkocht !== undefined && a.verkocht.datum.startsWith(`${jaar}-`)
  const boekwinst = r && r.boekwinst > 0 ? Math.round(r.boekwinst) : 0
  if (!params) return null
  if (!reserve && !weg && !(verkochtDitJaar && boekwinst > 0 && kanReserveren(a, params))) return null
  const termijn = termijnVan(params)
  const u = reserve ? uitkomst?.find((x) => x.id === reserve.id) : undefined
  const uiterlijk = reserve ? hirUiterlijkJaar(reserve, params) : jaar + (termijn ?? 0)

  function zetAan() {
    if (!params || !r) return
    pas((x) => {
      const doel = x.activa?.[index]
      if (!doel) return
      if (!doel.herkomst) doel.herkomst = nieuweHerkomst(x, jaar)
      const id = vrijeId(x.herinvesteringsreserves, `hir-${jaar}`)
      x.herinvesteringsreserves = [...(x.herinvesteringsreserves ?? []), hirUitActief(doel, r, doel.herkomst, jaar, params, id)]
    })
    setWeg(null)
  }

  function zetUit() {
    if (!reserve) return
    const afboekingen = (o.investeringen ?? []).flatMap((inv, i) => (inv.herinvesteringsreserve?.reserveId === reserve.id ? [{ index: i, hir: structuredClone(inv.herinvesteringsreserve) }] : []))
    setWeg({ reserve: structuredClone(reserve), afboekingen })
    pas((x) => {
      x.herinvesteringsreserves = (x.herinvesteringsreserves ?? []).filter((y) => y.id !== reserve.id)
      if (x.herinvesteringsreserves.length === 0) delete x.herinvesteringsreserves
      for (const inv of x.investeringen ?? []) if (inv.herinvesteringsreserve?.reserveId === reserve.id) delete inv.herinvesteringsreserve
    })
    kondigAan('Herinvesteringsreserve weggehaald.')
  }

  function ongedaan() {
    if (!weg) return
    pas((x) => {
      x.herinvesteringsreserves = [...(x.herinvesteringsreserves ?? []).filter((y) => y.id !== weg.reserve.id), weg.reserve]
      for (const af of weg.afboekingen) {
        const inv = x.investeringen?.[af.index]
        if (inv) inv.herinvesteringsreserve = af.hir
      }
    })
    setWeg(null)
    setTerugFocus(true)
  }

  return (
    <div data-veld={veld} className="space-y-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <Toggle
        id={schakelaarId}
        label="Reserveren voor een nieuwe investering (herinvesteringsreserve)"
        description={`Je betaalt nu geen belasting over de boekwinst als je binnen ${termijn ?? 'de termijn van'} jaar opnieuw investeert. De reserve gaat dan af van de aanschafwaarde.`}
        checked={reserve !== undefined}
        onChange={(aan) => (aan ? zetAan() : zetUit())}
      />
      {reserve && (
        <p className="text-sm text-gray-700">
          Herinvesteringsreserve uit {reserve.ontstaanJaar} · <span className="font-medium tabular-nums text-gray-900">{formatEuro(u ? u.standBegin + u.dotatie : reserve.bedragOntstaan)}</span> · besteden vóór eind {uiterlijk}
        </p>
      )}
      {reserve && reserve.ontstaanJaar === jaar && boekwinst > 0 && reserve.bedragOntstaan !== boekwinst && (
        <Alert variant="let-op">
          <p>
            De boekwinst is nu {formatEuro(boekwinst)}; in de reserve staat {formatEuro(reserve.bedragOntstaan)}.
          </p>
          <Button
            variant="secundair"
            grootte="sm"
            className="mt-2"
            onClick={() =>
              pas((x) => {
                const doel = (x.herinvesteringsreserves ?? []).find((y) => y.id === reserve.id)
                const middel = x.activa?.[index]
                if (!doel || !middel) return
                const vers = hirUitActief(middel, { boekwinst }, doel.herkomst.actiefHerkomst ?? middel.herkomst ?? '', jaar, params, doel.id)
                doel.bedragOntstaan = vers.bedragOntstaan
                doel.herkomst.opbrengst = vers.herkomst.opbrengst
                doel.herkomst.boekwaardeOud = vers.herkomst.boekwaardeOud
              })
            }
          >
            Reserve bijwerken naar {formatEuro(boekwinst)}
          </Button>
        </Alert>
      )}
      {weg && !reserve && <OngedaanMelding tekst="Herinvesteringsreserve is weggehaald." onOngedaan={ongedaan} onSluit={() => setWeg(null)} />}
    </div>
  )
}

export interface HirAfboekingProps {
  onderneming: OndernemingInvoer
  investering: InvesteringInvoer
  index: number
  jaar: number
  params: TaxYearParams | null
  pasI: (fn: (x: InvesteringInvoer) => void) => void
  uitkomst?: HerinvesteringsreserveUitkomst[]
  /** Veld-id's beginnen met `persoon:A/onderneming:ond-1/investering:<id>`. */
  veldVoor: (pad: string) => string
}

/** "Herinvesteringsreserve afboeken: tot € …" bij een investering, alleen als er een reserve beschikbaar is. */
export function HirAfboeking({ onderneming: o, investering: inv, index, jaar, params, pasI, uitkomst, veldVoor }: HirAfboekingProps) {
  if (!params) return null
  const beschikbaar = hirBeschikbaar(o, jaar, params, uitkomst)
  const hir = inv.herinvesteringsreserve
  const gekozen = (o.herinvesteringsreserves ?? []).find((r) => r.id === hir?.reserveId) ?? beschikbaar[0]
  if (!gekozen || (beschikbaar.length === 0 && !hir)) return null
  const u = uitkomst?.find((x) => x.id === gekozen.id)
  const max = hirMaxVoorInvestering(gekozen, o.investeringen, index, jaar, u)
  const afgeboekt = u?.perInvestering?.find((x) => x.investering === (inv.id || String(index)))
  const langlopend = nieuwLanglopend(inv, o.activa, params)
  const naam = (r: HerinvesteringsreserveInvoer) => `${r.herkomst.omschrijving.trim() || 'Reserve'} uit ${r.ontstaanJaar}`
  const regeling = inv.regeling ?? 'kia'
  const pasHir = (fn: (h: NonNullable<InvesteringInvoer['herinvesteringsreserve']>) => void) =>
    pasI((x) => {
      const h = x.herinvesteringsreserve ?? { reserveId: gekozen.id, afboeking: 0 }
      fn(h)
      x.herinvesteringsreserve = h
    })

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-sm font-medium text-gray-900">Herinvesteringsreserve afboeken: tot {formatEuro(max)}</p>
      <Rij>
        {beschikbaar.length > 1 && (
          <div data-veld={veldVoor('herinvesteringsreserve.reserveId')}>
            <Select<string>
              label="Welke reserve"
              value={gekozen.id}
              onChange={(id) => pasHir((h) => void (h.reserveId = id))}
              options={beschikbaar.map((r) => ({ value: r.id, label: naam(r) }))}
            />
          </div>
        )}
        <Bedrag
          label="Afboeken op deze investering"
          veld={veldVoor('herinvesteringsreserve.afboeking')}
          hint="Geen winst of verlies: je schrijft daarna af over de aanschafwaarde min dit bedrag."
          value={hir?.afboeking || undefined}
          onChange={(v) =>
            pasI((x) => {
              if (v === undefined || v === 0) delete x.herinvesteringsreserve
              else x.herinvesteringsreserve = { ...(x.herinvesteringsreserve ?? { reserveId: gekozen.id }), afboeking: v }
            })
          }
        />
      </Rij>
      {hir && hir.afboeking > 0 && (
        <div className="space-y-3">
          <div data-veld={veldVoor('herinvesteringsreserve.nieuwLanglopend')}>
            <Toggle
              label={`Dit middel schrijf je niet of in meer dan ${params.ondernemer.waarde.hir.langlopendVanafJaren} jaar af`}
              description="Zoals een pand of grond."
              checked={langlopend}
              onChange={(aan) => pasHir((h) => void (h.nieuwLanglopend = aan))}
            />
          </div>
          {langlopend && (
            <div data-veld={veldVoor('herinvesteringsreserve.zelfdeFunctie')}>
              <Toggle
                label="Het nieuwe middel heeft dezelfde functie als het verkochte"
                description="Op een pand of ander langlopend middel mag je de reserve alleen afboeken als het verkochte middel dezelfde economische functie had in je onderneming."
                checked={Boolean(hir.zelfdeFunctie)}
                onChange={(aan) => pasHir((h) => (aan ? (h.zelfdeFunctie = true) : delete h.zelfdeFunctie))}
              />
            </div>
          )}
          {regeling !== 'geen' && !inv.uitgesloten && (
            <div data-veld={veldVoor('herinvesteringsreserve.kiaOverVolBedrag')}>
              <Toggle
                label="KIA over het volle bedrag (zonder vermindering met de reserve)"
                description="Standaard gaat de investeringsaftrek over het bedrag na afboeking. Een hoger investeringsbedrag in de afbouwzone kan de KIA verlagen."
                checked={Boolean(hir.kiaOverVolBedrag)}
                onChange={(aan) => pasHir((h) => (aan ? (h.kiaOverVolBedrag = true) : delete h.kiaOverVolBedrag))}
              />
            </div>
          )}
          {afgeboekt && (
            <p className="text-xs text-gray-600">
              Afgeboekt: {formatEuro(afgeboekt.bedrag)}. Je schrijft af over {formatEuro(Math.max(0, inv.bedrag - afgeboekt.bedrag))} min de restwaarde
              {regeling !== 'geen' && !inv.uitgesloten ? `, investeringsaftrek over ${formatEuro(hir.kiaOverVolBedrag ? inv.bedrag : Math.max(0, inv.bedrag - afgeboekt.bedrag))}` : ''}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
