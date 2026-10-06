'use client'

/**
 * Jaarrekening van een onderneming voor hoofdstuk 5 van het rapport (OndernemingInvoer.jaarrekening).
 * Optioneel en alleen informatief: de berekening verandert er niet door. Leeg is niet ingevuld; er komen
 * geen nullen bij. Totalen en controles komen uit lib/dossier/jaarrekening.ts, net als in het rapport.
 */
import { useId } from 'react'
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { BalansPost, JaarrekeningInvoer as Jaarrekening, OndernemingInvoer, WvRubriek } from '@/lib/tax/types'
import {
  BALANS_POST_INFO,
  BALANS_POSTEN,
  JAARREKENING_GRENZEN,
  WV_RUBRIEK_INFO,
  WV_RUBRIEKEN,
  balansTotalen,
  heeftBalans,
  kapitaalsvergelijking,
  schoonJaarrekening,
  sluitAan,
  somBedragen,
  specificatieVerschillen,
  wvTotalen,
  type WvSoort,
} from '@/lib/dossier/jaarrekening'
import { Alert, Button, Disclosure, Field, INVOER_KLASSE, MoneyInput, Select, cn, formatEuro, veldIds } from '@/components/ui'
import { Bedrag, Lijst, Rij, Subkop, Tekst, VeldVak } from '../velden'
import { formatMoment } from '../koppelingen/indeling'
import { usePersoonVeld } from '../controles/veld-context'
import { ID_PATROON } from '@/lib/dossier/ids'
import { veldVan } from '@/lib/dossier/veld'

type Specificatie = NonNullable<Jaarrekening['specificaties']>[number]
type PrivePost = NonNullable<Jaarrekening['onttrekkingen']>[number]
type Peildatum = 'begin' | 'eind'

export interface JaarrekeningInvoerProps {
  onderneming: OndernemingInvoer
  /** Wijzigt de onderneming, zoals `pas` uit Lijst. */
  pas: (fn: (x: OndernemingInvoer) => void) => void
  jaar: number
  /** Saldo van de winstberekening zoals de sectie het toont (vóór fiscale correcties). */
  saldo: number
}

const POST_OPTIES = BALANS_POSTEN.map((p) => ({ value: p, label: BALANS_POST_INFO[p].label }))
const RASTER = 'grid grid-cols-2 gap-x-3 sm:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem]'

/**
 * Ronde 2 (A3): veld-id binnen de jaarrekening ('jaarrekening.eind.liquideMiddelen'), voor springen en de controles.
 * De persoon komt uit de editor (PersoonVeldProvider), de onderneming uit haar vaste id; zonder een van beide geen id.
 */
type JrVeld = (pad: string, ...rest: string[]) => string | undefined

function zetPost(j: Jaarrekening, peildatum: Peildatum, post: BalansPost, v: number | null) {
  const stand = { ...(j[peildatum] ?? {}) }
  if (v === null) delete stand[post]
  else stand[post] = v
  j[peildatum] = stand
}

function zetRubriek(j: Jaarrekening, rubriek: WvRubriek, v: number | null) {
  const bedragen = new Map((j.winstEnVerlies ?? []).map((r) => [r.rubriek, r.bedrag]))
  if (v === null) bedragen.delete(rubriek)
  else bedragen.set(rubriek, v)
  j.winstEnVerlies = WV_RUBRIEKEN.filter((r) => bedragen.has(r)).map((r) => ({ rubriek: r, bedrag: bedragen.get(r)! }))
}

/** Invoerregel van de balans: label met een bedrag aan het begin en aan het einde van het jaar. */
function PostRij({ post, j, jaar, wijzig, hint, vj }: { post: BalansPost; j: Jaarrekening | undefined; jaar: number; wijzig: (fn: (j: Jaarrekening) => void) => void; hint?: ReactNode; vj: JrVeld }) {
  const label = BALANS_POST_INFO[post].label
  return (
    <li className={cn(RASTER, 'gap-y-2 py-2 sm:items-center')}>
      <span className="col-span-2 text-sm text-gray-800 sm:col-span-1">
        {label}
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
      {(['begin', 'eind'] as const).map((p) => (
        <VeldVak key={p} veld={vj(`jaarrekening.${p}.${post}`)}>
          {(m) => (
            <MoneyInput
              label={`${label}, ${p === 'begin' ? `begin ${jaar}` : `eind ${jaar}`}`}
              labelVerborgen
              negatief
              placeholder={p === 'begin' ? 'Begin' : 'Eind'}
              value={j?.[p]?.[post] ?? null}
              error={m.fout}
              hint={m.melding}
              onChange={(v) => wijzig((x) => zetPost(x, p, post, v))}
            />
          )}
        </VeldVak>
      ))}
    </li>
  )
}

/** Afgeleide regel (totaal) in hetzelfde raster; leeg als die peildatum niet is ingevuld. */
function TotaalRij({ label, begin, eind, sterk }: { label: string; begin: number | null; eind: number | null; sterk?: boolean }) {
  return (
    <li className={cn(RASTER, 'gap-y-1 border-t border-gray-200 py-2.5 text-sm')}>
      <span className={cn('col-span-2 sm:col-span-1', sterk ? 'font-medium text-gray-900' : 'text-gray-700')}>{label}</span>
      {[begin, eind].map((w, i) => (
        <span key={i} className={cn('pl-3.5 tabular-nums', sterk ? 'font-medium text-gray-900' : 'text-gray-800')}>
          <span className="text-xs text-gray-500 sm:hidden">{i === 0 ? 'Begin ' : 'Eind '}</span>
          {w === null ? '–' : formatEuro(w)}
        </span>
      ))}
    </li>
  )
}

function GroepKop({ children }: { children: ReactNode }) {
  return <li className="pb-1 pt-4 text-sm font-medium text-gray-900 first:pt-2">{children}</li>
}

function KolomKoppen({ jaar }: { jaar: number }) {
  return (
    <div aria-hidden="true" className={cn(RASTER, 'border-b border-gray-200 pb-2 text-xs font-medium text-gray-500')}>
      <span className="hidden sm:block" />
      <span className="pl-3.5">Begin {jaar}</span>
      <span className="pl-3.5">Eind {jaar}</span>
    </div>
  )
}

function Aansluiting({ goed, children }: { goed: boolean; children: ReactNode }) {
  if (!goed) return <Alert variant="let-op">{children}</Alert>
  return (
    <p className="flex items-start gap-2 text-sm text-gray-600">
      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  )
}

function Regel({ label, bedrag, sterk }: { label: string; bedrag: number; sterk?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 py-1.5', sterk && 'border-t border-gray-200 font-medium text-gray-900')}>
      <dt className={sterk ? undefined : 'text-gray-600'}>{label}</dt>
      <dd className="tabular-nums">{formatEuro(bedrag)}</dd>
    </div>
  )
}

function Omschrijving({ value, onChange, veld }: { value: string | undefined; onChange: (v: string) => void; veld?: string }) {
  const ids = veldIds(`activiteiten-${useId().replace(/:/g, '')}`)
  return (
    <VeldVak veld={veld}>
      {(m) => (
        <Field ids={ids} label="Omschrijving van de activiteiten" hint="Zoals het in paragraaf 5.6 van het rapport moet staan." error={m.fout}>
          <textarea
            id={ids.invoer}
            rows={2}
            maxLength={JAARREKENING_GRENZEN.omschrijvingActiviteiten}
            value={value ?? ''}
            placeholder="Bijvoorbeeld: vertaalwerk en redactie voor uitgeverijen"
            aria-invalid={m.fout ? true : undefined}
            aria-describedby={m.fout ? `${ids.hint} ${ids.fout}` : ids.hint}
            onChange={(e) => onChange(e.target.value)}
            className={cn(INVOER_KLASSE, m.fout ? 'border-red-400' : 'border-gray-200 hover:border-gray-300', 'px-3.5')}
          />
        </Field>
      )}
    </VeldVak>
  )
}

function herkomst(j: Jaarrekening, o: OndernemingInvoer): string {
  if (j.bron === 'moneybird') return o.bron ? `Uit Moneybird, opgehaald op ${formatMoment(o.bron.geimporteerdOp)}.` : 'Uit Moneybird.'
  return 'Zelf ingevuld.'
}

const WV_GROEPEN: Array<{ kop: string; rubrieken: WvRubriek[] }> = (
  [
    ['Opbrengsten', ['opbrengst']],
    ['Kosten', ['kosten']],
    ['Financiële baten en lasten', ['baat', 'last']],
  ] as Array<[string, WvSoort[]]>
).map(([kop, soorten]) => ({ kop, rubrieken: WV_RUBRIEKEN.filter((r) => soorten.includes(WV_RUBRIEK_INFO[r].soort)) }))

export function JaarrekeningInvoer({ onderneming: o, pas, jaar, saldo }: JaarrekeningInvoerProps) {
  const j = o.jaarrekening
  const persoon = usePersoonVeld()
  const vj: JrVeld = (pad, ...rest) => (persoon && o.id && ID_PATROON.test(o.id) ? veldVan.onderneming(persoon, o.id, pad, ...rest) : undefined)

  /** Wijzigt de jaarrekening; lege delen vallen weg en zonder inhoud verdwijnt de hele jaarrekening. */
  const wijzig = (fn: (j: Jaarrekening) => void) =>
    pas((x) => {
      const nieuw: Jaarrekening = x.jaarrekening ?? {}
      fn(nieuw)
      const schoon = schoonJaarrekening(nieuw)
      if (!schoon) return void delete x.jaarrekening
      x.jaarrekening = { ...schoon, bron: schoon.bron ?? 'handmatig' }
    })

  const heeftBegin = heeftBalans(j?.begin)
  const heeftEind = heeftBalans(j?.eind)
  const begin = balansTotalen(j?.begin)
  const eind = balansTotalen(j?.eind)
  const toon = (heeft: boolean, w: number) => (heeft ? w : null)
  const kv = kapitaalsvergelijking(j)
  const wv = j?.winstEnVerlies?.length ? wvTotalen(j.winstEnVerlies) : null
  const specVerschillen = specificatieVerschillen(j)
  const vermogenElders = o.for?.ondernemingsvermogenEinde
  const forStand = o.for?.stand
  const forBegin = j?.begin?.oudedagsreserve

  return (
    <Disclosure
      variant="kaal"
      titel="Jaarrekening voor het rapport (optioneel)"
      subtitel="Balans, privé-opnamen en winst-en-verliesrekening voor hoofdstuk 5. De berekening verandert er niet door."
      rechts={j ? <span className="text-xs text-gray-500">Ingevuld</span> : undefined}
      defaultOpen={Boolean(j)}
    >
      <div className="space-y-6 pt-2">
        <p className="text-sm text-gray-600">
          Neem over wat in je jaarrekening of administratie staat. Wat je leeg laat, komt niet in het rapport.
          {j && <span className="mt-1 block text-xs text-gray-500">{herkomst(j, o)}</span>}
        </p>

        <Omschrijving veld={vj('jaarrekening.omschrijvingActiviteiten')} value={j?.omschrijvingActiviteiten} onChange={(v) => wijzig((x) => void (x.omschrijvingActiviteiten = v))} />

        <div>
          <Subkop>Balans</Subkop>
          <KolomKoppen jaar={jaar} />
          <ul>
            <GroepKop>Activa</GroepKop>
            {BALANS_POSTEN.filter((p) => BALANS_POST_INFO[p].kant === 'activa').map((p) => (
              <PostRij key={p} post={p} j={j} jaar={jaar} wijzig={wijzig} vj={vj} />
            ))}
            <TotaalRij label="Totaal activa" begin={toon(heeftBegin, begin.activa)} eind={toon(heeftEind, eind.activa)} sterk />

            <GroepKop>Passiva</GroepKop>
            <PostRij post="oudedagsreserve" j={j} jaar={jaar} wijzig={wijzig} vj={vj} hint="Deel van het ondernemingsvermogen" />
            <TotaalRij label="Ondernemingsvermogen exclusief oudedagsreserve" begin={toon(heeftBegin, begin.exclusiefOudedagsreserve)} eind={toon(heeftEind, eind.exclusiefOudedagsreserve)} />
            <TotaalRij label="Totaal ondernemingsvermogen" begin={toon(heeftBegin, begin.ondernemingsvermogen)} eind={toon(heeftEind, eind.ondernemingsvermogen)} sterk />
            {BALANS_POSTEN.filter((p) => BALANS_POST_INFO[p].kant === 'vreemd').map((p) => (
              <PostRij key={p} post={p} j={j} jaar={jaar} wijzig={wijzig} vj={vj} />
            ))}
            <TotaalRij label="Totaal kortlopende schulden" begin={toon(heeftBegin, begin.kortlopendeSchulden)} eind={toon(heeftEind, eind.kortlopendeSchulden)} />
            <TotaalRij label="Totaal passiva" begin={toon(heeftBegin, begin.activa)} eind={toon(heeftEind, eind.activa)} sterk />
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            Het ondernemingsvermogen rekenen we uit: activa min schulden en voorzieningen. Zo sluit de balans altijd. Of de cijfers kloppen, zie je aan de controles hieronder.
          </p>

          <div className="mt-4 space-y-3">
            {heeftEind && vermogenElders !== undefined && !sluitAan(eind.ondernemingsvermogen, vermogenElders) && (
              <Alert variant="let-op">
                <p>
                  Het ondernemingsvermogen aan het einde is volgens deze balans {formatEuro(eind.ondernemingsvermogen)}. Bij Oudedagsreserve en vermogen staat {formatEuro(vermogenElders)}. Dat bedrag
                  gebruikt de berekening voor de oudedagsreserve.
                </p>
                <Button
                  variant="kaal"
                  grootte="sm"
                  className="mt-2 -ml-3"
                  onClick={() => pas((x) => (x.for = { ...(x.for ?? { stand: 0 }), ondernemingsvermogenEinde: Math.round(eind.ondernemingsvermogen) }))}
                >
                  Gebruik {formatEuro(eind.ondernemingsvermogen)} uit de balans
                </Button>
              </Alert>
            )}
            {forBegin !== undefined && forStand !== undefined && !sluitAan(forBegin, forStand) && (
              <Alert variant="let-op">
                De oudedagsreserve aan het begin is volgens deze balans {formatEuro(forBegin)}. Bij Oudedagsreserve en vermogen staat een stand van {formatEuro(forStand)}.
              </Alert>
            )}
          </div>
        </div>

        <div>
          <Subkop>Specificaties</Subkop>
          <p className="mb-3 text-xs text-gray-500">Uitsplitsing van een balanspost, zoals borg en vooruitbetaalde bedragen bij overige vorderingen, of de omzetbelasting per boekjaar.</p>
          <Lijst<Specificatie>
            items={j?.specificaties}
            onChange={(l) => wijzig((x) => void (x.specificaties = l))}
            nieuw={() => ({ post: 'overigeVorderingen', omschrijving: '', begin: 0, eind: 0 })}
            titel={(s, i) => s.omschrijving || `Specificatie ${i + 1}`}
            toevoegLabel="Specificatie toevoegen"
          >
            {(s, pasS, si) => (
              <Rij>
                <Select<BalansPost> label="Balanspost" value={s.post} options={POST_OPTIES} onChange={(v) => pasS((x) => void (x.post = v))} />
                <Tekst label="Omschrijving" veld={vj(`jaarrekening.specificaties:${si}`, 'omschrijving')} value={s.omschrijving} onChange={(v) => pasS((x) => void (x.omschrijving = v))} />
                <Bedrag label={`Begin ${jaar}`} negatief value={s.begin} onChange={(v) => pasS((x) => void (x.begin = v ?? 0))} />
                <Bedrag label={`Eind ${jaar}`} negatief value={s.eind} onChange={(v) => pasS((x) => void (x.eind = v ?? 0))} />
              </Rij>
            )}
          </Lijst>
          {specVerschillen.length > 0 && (
            <Alert variant="let-op" className="mt-3">
              <ul className="space-y-1">
                {specVerschillen.map((v) => (
                  <li key={`${v.post}-${v.peildatum}`}>
                    {BALANS_POST_INFO[v.post].label}, {v.peildatum === 'begin' ? 'begin' : 'eind'}: de specificaties tellen op tot {formatEuro(v.specificatie)}, op de balans staat {formatEuro(v.balans)}.
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </div>

        <div>
          <Subkop>Materiële vaste activa</Subkop>
          <Rij>
            <Bedrag
              label="Aanschafwaarde"
              veld={vj('jaarrekening.mva.aanschafwaarde')}
              hint="Wat de bedrijfsmiddelen die nog op de balans staan samen hebben gekost."
              value={j?.mva?.aanschafwaarde}
              onChange={(v) =>
                wijzig((x) => {
                  if (v === undefined && !x.mva?.restwaarde) delete x.mva
                  else x.mva = { aanschafwaarde: v ?? 0, restwaarde: x.mva?.restwaarde ?? 0 }
                })
              }
            />
            <Bedrag
              label="Restwaarde"
              veld={vj('jaarrekening.mva.restwaarde')}
              value={j?.mva?.restwaarde}
              onChange={(v) =>
                wijzig((x) => {
                  if (v === undefined && !x.mva?.aanschafwaarde) delete x.mva
                  else x.mva = { aanschafwaarde: x.mva?.aanschafwaarde ?? 0, restwaarde: v ?? 0 }
                })
              }
            />
          </Rij>
        </div>

        <div>
          <Subkop>Privé-onttrekkingen en stortingen</Subkop>
          <div className="space-y-5">
            <PriveLijst
              titel="Onttrekkingen"
              naam="Onttrekking"
              items={j?.onttrekkingen}
              onChange={(l) => wijzig((x) => void (x.onttrekkingen = l))}
              voorbeeld="Bijvoorbeeld privé-opnamen of inkomstenbelasting"
              toevoegLabel="Onttrekking toevoegen"
              veld={(i) => vj(`jaarrekening.onttrekkingen:${i}`, 'bedrag')}
            />
            <PriveLijst
              titel="Stortingen"
              naam="Storting"
              items={j?.stortingen}
              onChange={(l) => wijzig((x) => void (x.stortingen = l))}
              voorbeeld="Bijvoorbeeld een storting van privé"
              toevoegLabel="Storting toevoegen"
              veld={(i) => vj(`jaarrekening.stortingen:${i}`, 'bedrag')}
            />
          </div>
          {kv ? (
            <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-2 text-sm font-medium text-gray-900">Kapitaalsvergelijking</p>
              <dl className="text-sm">
                <Regel label="Ondernemingsvermogen aan het einde" bedrag={kv.eindvermogen} />
                <Regel label="Af: ondernemingsvermogen aan het begin" bedrag={kv.beginvermogen} />
                <Regel label="Bij: privé-onttrekkingen" bedrag={kv.onttrekkingen} />
                <Regel label="Af: privéstortingen" bedrag={kv.stortingen} />
                <Regel label="Winst volgens de kapitaalsvergelijking" bedrag={kv.winst} sterk />
              </dl>
              <div className="mt-3">
                <Aansluiting goed={sluitAan(kv.winst, saldo)}>
                  {sluitAan(kv.winst, saldo)
                    ? 'Sluit aan op het saldo van de winstberekening.'
                    : `Het saldo van de winstberekening is ${formatEuro(saldo)}, een verschil van ${formatEuro(kv.winst - saldo, { teken: true })}. Controleer de balans en de privé-onttrekkingen en stortingen.`}
                </Aansluiting>
              </div>
            </div>
          ) : (
            (heeftBegin || heeftEind || somBedragen(j?.onttrekkingen) !== 0) && (
              <p className="mt-4 text-xs text-gray-500">Vul de balans aan het begin en aan het einde in, dan zie je hier de kapitaalsvergelijking.</p>
            )
          )}
        </div>

        <div>
          <Subkop>Winst-en-verliesrekening</Subkop>
          <p className="mb-3 text-xs text-gray-500">Alle bedragen positief, ook de kosten en de financiële lasten. Een daling van het onderhanden werk vul je in met een minteken.</p>
          <div className="space-y-4">
            {WV_GROEPEN.map((g) => (
              <fieldset key={g.kop}>
                <legend className="mb-2 text-sm font-medium text-gray-900">{g.kop}</legend>
                <Rij>
                  {g.rubrieken.map((r) => (
                    <VeldVak key={r} veld={vj(`jaarrekening.winstEnVerlies.${r}`)}>
                      {(m) => (
                        <MoneyInput
                          label={WV_RUBRIEK_INFO[r].label}
                          negatief
                          value={j?.winstEnVerlies?.find((x) => x.rubriek === r)?.bedrag ?? null}
                          error={m.fout}
                          hint={m.melding}
                          onChange={(v) => wijzig((x) => zetRubriek(x, r, v))}
                        />
                      )}
                    </VeldVak>
                  ))}
                </Rij>
              </fieldset>
            ))}
          </div>
          {wv && (
            <div className="mt-4 space-y-3">
              <dl className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
                <Regel label="Opbrengsten" bedrag={wv.opbrengsten} />
                <Regel label="Kosten" bedrag={-wv.kosten} />
                <Regel label="Financiële baten en lasten" bedrag={wv.financieel} />
                <Regel label="Saldo" bedrag={wv.saldo} sterk />
              </dl>
              <Aansluiting goed={sluitAan(wv.saldo, saldo)}>
                {sluitAan(wv.saldo, saldo)
                  ? 'Sluit aan op het saldo van de winstberekening.'
                  : `Het saldo van de winstberekening is ${formatEuro(saldo)}, een verschil van ${formatEuro(wv.saldo - saldo, { teken: true })}.`}
              </Aansluiting>
            </div>
          )}
        </div>
      </div>
    </Disclosure>
  )
}

function PriveLijst({
  titel,
  naam,
  items,
  onChange,
  voorbeeld,
  toevoegLabel,
  veld,
}: {
  titel: string
  /** Enkelvoud, voor de kop van een regel zonder omschrijving. */
  naam: string
  items: PrivePost[] | undefined
  onChange: (l: PrivePost[]) => void
  voorbeeld: string
  toevoegLabel: string
  /** Ronde 2 (A3): veld-id van het bedrag op regel i. */
  veld: (i: number) => string | undefined
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm text-gray-800">{titel}</p>
        {items && items.length > 0 && <p className="text-sm tabular-nums text-gray-900">Totaal {formatEuro(somBedragen(items))}</p>}
      </div>
      <Lijst<PrivePost>
        items={items}
        onChange={onChange}
        nieuw={() => ({ omschrijving: '', bedrag: 0 })}
        titel={(r, i) => r.omschrijving || `${naam} ${i + 1}`}
        toevoegLabel={toevoegLabel}
      >
        {(r, pasR, i) => (
          <Rij>
            <Tekst label="Omschrijving" placeholder={voorbeeld} value={r.omschrijving} onChange={(v) => pasR((x) => void (x.omschrijving = v))} />
            <Bedrag label="Bedrag" veld={veld(i)} negatief value={r.bedrag} onChange={(v) => pasR((x) => void (x.bedrag = v ?? 0))} />
          </Rij>
        )}
      </Lijst>
    </div>
  )
}
