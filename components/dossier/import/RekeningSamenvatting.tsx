'use client'

/**
 * Ronde 2 (A4): één rekening in het importpaneel. Eerst de rekening als geheel (gestort, opgenomen, dividend, rente,
 * waarde begin en eind), dan van wie hij is, wat er nog ontbreekt (amber, met een invulveld), de vragen die alleen de
 * gebruiker kan beantwoorden (twee chips), en per bezitting een uitklap.
 */
import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { Eigenaar, HuishoudenInvoer } from '@/lib/tax/types'
import type { ImportRol, ImportVoorstel, ImportVraag, OntbreektItem } from '@/lib/import/types'
import type { RekeningKeuzes } from '@/lib/import/voorstel'
import { datumTekst } from '@/lib/import/voorstel'
import { landKeuzes } from '@/lib/import/land'
import { Alert, Button, ChipGroup, MoneyInput, NumberInput, Select } from '@/components/ui'
import { persoonNaam } from '../secties/types'
import { PositieUitklap } from './PositieUitklap'
import { bedrag } from './WijzigingenLijst'

export interface RekeningSamenvattingProps {
  voorstel: ImportVoorstel
  invoer: HuishoudenInvoer
  keuzes: RekeningKeuzes
  onKeuzes: (k: RekeningKeuzes) => void
}

/** Naam van een eigenaar: "Persoon A", de naam van een kind, of "samen". */
export function eigenaarNaam(invoer: HuishoudenInvoer, e: Eigenaar | 'samen'): string {
  if (e === 'samen') return 'samen'
  if (e.startsWith('kind:')) {
    const i = invoer.kinderen.findIndex((k) => `kind:${k.id}` === e)
    return invoer.kinderen[i]?.naam?.trim() || `Kind ${i + 1}`
  }
  const p = invoer.personen.find((x) => x.id === e)
  return p ? persoonNaam(p) : `Persoon ${e}`
}

function Vraag({ vraag, onKies }: { vraag: ImportVraag; onKies: (waarde: string) => void }) {
  const inOpties = vraag.opties.some((o) => o.waarde === vraag.gekozen)
  const anders = vraag.land && vraag.gekozen !== undefined && (vraag.gekozen === 'anders' || !vraag.opties.some((o) => o.waarde === vraag.gekozen))
  const waarde = vraag.gekozen === undefined ? null : inOpties ? vraag.gekozen : vraag.land ? 'anders' : null
  const landen = landKeuzes(vraag.opties.map((o) => o.waarde).filter((w) => /^[A-Z]{2}$/.test(w)))
  return (
    <div className="space-y-2">
      <ChipGroup<string> label={vraag.tekst} value={waarde} onChange={onKies} options={vraag.opties.map((o) => ({ value: o.waarde, label: o.label }))} />
      {anders && (
        <Select
          label="Welk land?"
          placeholder="Kies een land"
          value={vraag.gekozen && /^[A-Z]{2}$/.test(vraag.gekozen) ? vraag.gekozen : ''}
          onChange={onKies}
          options={landen}
          wrapperClassName="max-w-xs"
        />
      )}
    </div>
  )
}

function Ontbreekt({ item, waarde, onWaarde, jaar, koers, onKoers }: { item: OntbreektItem; waarde: number | null; onWaarde: (v: number | null) => void; jaar: number; koers: number | null | undefined; onKoers: (k: number | null | undefined) => void }) {
  const [waar, setWaar] = useState(false)
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-start gap-2">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <span>
          <span className="sr-only">Let op: </span>
          {item.uitleg}
        </span>
      </p>
      {item.veld === 'koers' ? (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <NumberInput
            label={`Koers: 1 ${item.valuta} is zoveel euro`}
            value={typeof koers === 'number' ? koers : null}
            onChange={(v) => onKoers(v ?? undefined)}
            decimalen={6}
            disabled={koers === null}
            wrapperClassName="w-56"
          />
          <Button variant="secundair" grootte="sm" aria-pressed={koers === null} onClick={() => onKoers(koers === null ? undefined : null)}>
            {koers === null ? 'Toch meetellen' : 'Weglaten'}
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
          <MoneyInput label={item.veld === 'waardeBegin' ? `Waarde op 31 december ${jaar - 1}` : `Waarde op 31 december ${jaar}`} value={waarde} onChange={onWaarde} decimalen={2} wrapperClassName="w-56" />
          {item.waar && (
            <button type="button" aria-expanded={waar} onClick={() => setWaar((w) => !w)} className="min-h-[44px] text-sm font-medium text-amber-900 underline underline-offset-2 transition-colors hover:text-amber-700">
              Waar vind ik die?
            </button>
          )}
        </div>
      )}
      {waar && item.waar && <p className="mt-2 text-xs leading-relaxed">{item.waar}</p>}
    </div>
  )
}

export function RekeningSamenvatting({ voorstel: v, invoer, keuzes, onKeuzes }: RekeningSamenvattingProps) {
  const jaar = invoer.jaar
  const s = v.samenvatting
  const eigenaar: Eigenaar | 'samen' = keuzes.eigenaar ?? (v.samen ? 'samen' : v.eigenaar)
  const titel = `${v.naam}, ${eigenaarNaam(invoer, eigenaar)}`
  const delen = [
    s.gestort > 0 && `Gestort ${bedrag(s.gestort)}`,
    s.opgenomen > 0 && `opgenomen ${bedrag(s.opgenomen)}`,
    s.dividendBruto > 0 && `dividend ${bedrag(s.dividendBruto)}`,
    s.rente !== 0 && `rente ${bedrag(s.rente)}`,
    s.kosten > 0 && `kosten ${bedrag(s.kosten)}`,
    s.dividendbelasting > 0 && `Nederlandse dividendbelasting ${bedrag(s.dividendbelasting)}`,
    s.bronbelasting > 0 && `buitenlandse bronbelasting ${bedrag(s.bronbelasting)}`,
  ].filter((x): x is string => Boolean(x))
  const stromen = delen.length ? `${delen[0].charAt(0).toUpperCase()}${delen[0].slice(1)}${delen.length > 1 ? ` · ${delen.slice(1).join(' · ')}` : ''}` : null
  const waarden = `Waarde op 1 januari ${jaar} ${s.waardeBegin === null ? 'nog niet bekend' : bedrag(s.waardeBegin)} · op 31 december ${jaar} ${s.waardeEind === null ? 'nog niet bekend' : bedrag(s.waardeEind)}`
  const eigenaren = [
    ...invoer.personen.map((p) => ({ value: p.id as Eigenaar | 'samen', label: persoonNaam(p) })),
    ...(invoer.personen.length === 2 ? [{ value: 'samen' as const, label: 'Samen' }] : []),
    ...invoer.kinderen.map((k, i) => ({ value: `kind:${k.id}` as Eigenaar, label: k.naam?.trim() || `Kind ${i + 1}` })),
  ]
  const rollen = new Set(v.posities.map((p) => p.rol))
  const heeftCrypto = rollen.has('crypto')
  const antwoord = (id: string, waarde: string) => onKeuzes({ ...keuzes, antwoorden: { ...keuzes.antwoorden, [id]: waarde } })
  const zetStand = (rol: ImportRol, veld: 'waardeBegin' | 'waardeEind', w: number | null) => {
    const huidig = { ...keuzes.standen?.[rol] }
    if (w === null) delete huidig[veld]
    else huidig[veld] = w
    onKeuzes({ ...keuzes, standen: { ...keuzes.standen, [rol]: huidig } })
  }
  const zetKoers = (valuta: string, k: number | null | undefined) => {
    const koersen = { ...keuzes.koersen }
    if (k === undefined) delete koersen[valuta]
    else koersen[valuta] = k
    onKeuzes({ ...keuzes, koersen })
  }
  const doelSleutel = (p: ImportVoorstel['posities'][number]) => (v.samen ? `${p.rol}:${p.wordt.eigenaar}` : p.rol)
  const meldingen = v.meldingen.filter((m) => !(v.alIngelezen && m.id.startsWith('overlap-')))
  const vragen = v.alIngelezen ? [] : v.vragen
  const peildatum = vragen.filter((q) => q.id.startsWith('peildatum:'))
  const overige = vragen.filter((q) => !q.id.startsWith('peildatum:'))

  return (
    <section aria-label={titel} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div>
        <h4 className="text-base font-medium text-gray-900">{titel}</h4>
        {stromen && <p className="mt-1 text-sm text-gray-700">{stromen}</p>}
        <p className="mt-0.5 text-sm text-gray-700">{waarden}</p>
        {v.periode && (
          <p className="mt-0.5 text-xs text-gray-500">
            Transacties van {datumTekst(v.periode.van)} tot en met {datumTekst(v.periode.tot)}
          </p>
        )}
      </div>

      {v.alIngelezen && (
        <Alert variant="info" titel="Al ingelezen">
          <p>Dit bestand lijkt al ingelezen{v.ingelezenOp ? ` op ${datumTekst(v.ingelezenOp)}` : ''}. Er verandert niets, tenzij je iets anders kiest.</p>
          <Button variant="secundair" grootte="sm" className="mt-2" onClick={() => onKeuzes({ ...keuzes, opnieuw: true })}>
            Toch opnieuw inlezen
          </Button>
        </Alert>
      )}

      {!v.alIngelezen && (
        <ChipGroup<Eigenaar | 'samen'>
          label="Van wie?"
          value={eigenaar}
          onChange={(e) => onKeuzes({ ...keuzes, eigenaar: e, doel: {} })}
          options={eigenaren}
          hint={eigenaar === 'samen' && !invoer.fiscaalPartner ? 'Jullie zijn geen fiscale partners: elke bezitting komt voor de helft bij ieder van jullie.' : undefined}
        />
      )}

      {!v.alIngelezen &&
        v.ontbreekt.map((o) => {
          const item = o as OntbreektItem
          const sleutel = `${item.rol}-${item.veld}-${item.valuta ?? ''}`
          return (
            <Ontbreekt
              key={sleutel}
              item={item}
              jaar={jaar}
              waarde={item.veld === 'koers' ? null : (keuzes.standen?.[item.rol]?.[item.veld] ?? null)}
              onWaarde={(w) => item.veld !== 'koers' && zetStand(item.rol, item.veld, w)}
              koers={item.valuta ? keuzes.koersen?.[item.valuta] : undefined}
              onKoers={(k) => item.valuta && zetKoers(item.valuta, k)}
            />
          )
        })}

      {meldingen.map((m) => (
        <Alert key={`${m.id}-${m.tekst}`} variant={m.ernst === 'info' ? 'info' : 'let-op'}>
          {m.tekst}
        </Alert>
      ))}

      {peildatum.map((q) => (
        <Vraag key={q.id} vraag={q} onKies={(w) => antwoord(q.id, w)} />
      ))}
      {overige.map((q) => (
        <Vraag key={q.id} vraag={q} onKies={(w) => antwoord(q.id, w)} />
      ))}

      {!v.alIngelezen && v.posities.length > 0 && (
        <div className="space-y-2">
          {v.posities.map((p) => (
            <PositieUitklap
              key={`${p.rol}-${p.wordt.eigenaar}`}
              positie={p}
              invoer={invoer}
              stromen={v.stromen}
              heeftCrypto={heeftCrypto}
              bezet={v.posities.filter((x) => x !== p && x.bestaandId).map((x) => x.bestaandId!)}
              deelVan={v.samen ? eigenaarNaam(invoer, p.wordt.eigenaar) : undefined}
              onDoel={(doel) => onKeuzes({ ...keuzes, doel: { ...keuzes.doel, [doelSleutel(p)]: doel } })}
            />
          ))}
          {rollen.size > 1 && (
            <p className="text-xs leading-relaxed text-gray-600">
              Waarom {rollen.size === 2 ? 'twee' : 'drie'} bezittingen? In de aangifte staan effecten bij Beleggingen{heeftCrypto ? ', crypto bij Crypto' : ''} en geld bij Bank- en spaarrekeningen
              {heeftCrypto ? ' of Overige bezittingen' : ''}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
