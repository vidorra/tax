'use client'

/**
 * Ronde 2 (A6): kostenegalisatiereserve (art. 3.53 lid 1 onder a), het blok uit "Bijzondere situatie toevoegen".
 * Regels: Stand op 1 januari, Toevoeging, Gebruikt voor onderhoud, Vervallen (taak-A6 9.3). De uitkomst komt uit de
 * engine (`OndernemingResultaat.egalisatiereserves`).
 */
import type { EgalisatiereserveInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { veldVan } from '@/lib/dossier/veld'
import { standaardInSaldo } from '@/lib/tax/modules/onderneming/in-saldo'
import { StatLijst, StatRow, Toggle } from '@/components/ui'
import { Bedrag, Lijst, Rij, Tekst } from '../velden'
import type { OndernemingSituatieContext } from './onderneming-situaties'
import { InSaldoRegel } from './WinstBronVraag'
import { nieuweEgalisatie } from './onderneming-regelingen'

export function EgalisatieSituatie({ ctx }: { ctx: OndernemingSituatieContext }) {
  const { jaar, persoon, onderneming: o, ondernemingId } = ctx
  const uitkomsten = ctx.uitkomst?.onderneming?.egalisatiereserves
  const veld = (id: string, pad: string) => veldVan.onderneming(persoon.id, ondernemingId, `egalisatiereserve:${id}`, pad)
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-gray-600">
        Spaar je voor groot onderhoud dat eens in de zoveel jaar terugkomt, zoals het schilderen van je bedrijfspand? Dan mag je de kosten over de jaren verdelen met een
        kostenegalisatiereserve. Wat je toevoegt, is een kost; wat je later aan onderhoud betaalt, haal je uit de reserve.
      </p>
      <Lijst<EgalisatiereserveInvoer>
        items={o.egalisatiereserves}
        onChange={(l) => ctx.pas((x) => (l.length > 0 ? (x.egalisatiereserves = l) : delete x.egalisatiereserves))}
        nieuw={() => nieuweEgalisatie(o)}
        titel={(e, i) => e.omschrijving.trim() || `Kostenegalisatiereserve ${i + 1}`}
        toevoegLabel="Nog een kostenegalisatiereserve"
      >
        {(e, pasE) => {
          const u = uitkomsten?.find((x) => x.id === e.id)
          return (
            <div className="space-y-4">
              <Rij>
                <Tekst label="Waarvoor" verplicht veld={veld(e.id, 'omschrijving')} placeholder="Bijvoorbeeld: groot onderhoud pand" value={e.omschrijving} onChange={(v) => pasE((x) => void (x.omschrijving = v))} />
                <Bedrag label="Stand op 1 januari" veld={veld(e.id, 'standBegin')} hint={`De stand eind ${jaar - 1}.`} value={e.standBegin} onChange={(v) => pasE((x) => void (x.standBegin = v ?? 0))} />
                <Bedrag label="Toevoeging" veld={veld(e.id, 'dotatie')} hint="Wat je dit jaar opzij zet voor het onderhoud." value={e.dotatie} onChange={(v) => pasE((x) => (v === undefined ? delete x.dotatie : (x.dotatie = v)))} />
                <Bedrag
                  label="Gebruikt voor onderhoud"
                  veld={veld(e.id, 'onttrekking')}
                  hint="De onderhoudskosten van dit jaar die je uit de reserve betaalt."
                  value={e.onttrekking}
                  onChange={(v) => pasE((x) => (v === undefined ? delete x.onttrekking : (x.onttrekking = v)))}
                />
              </Rij>
              <div data-veld={veld(e.id, 'vervallen')}>
                <Toggle
                  label="Vervallen"
                  description="Het onderhoud gaat niet meer door, of het pand is verkocht. Dan valt de rest vrij in de winst."
                  checked={Boolean(e.vervallen)}
                  onChange={(aan) => pasE((x) => (aan ? (x.vervallen = true) : delete x.vervallen))}
                />
              </div>
              <InSaldoRegel
                label="Zit al in je winst"
                veld={veld(e.id, 'inSaldo')}
                expliciet={e.inSaldo}
                standaard={standaardInSaldo(o, 'egalisatie')}
                onderneming={o}
                uitleg="Nee: wij trekken de toevoeging van je winst af en tellen wat je gebruikt en wat vrijvalt erbij. Ja: de reserve staat al in je saldo, wij houden alleen de stand bij."
                onChange={(v) => pasE((x) => (v === undefined ? delete x.inSaldo : (x.inSaldo = v)))}
              />
              {u ? (
                <StatLijst className="rounded-xl border border-gray-200 bg-white px-4">
                  {u.vrijval > 0 && <StatRow label="Valt vrij in de winst" variant="min" bedrag={u.vrijval} />}
                  <StatRow label={`Stand eind ${jaar}`} variant="subtotaal" bedrag={u.standEind} />
                  {u.winstcorrectie !== 0 && <StatRow label="Effect op je winst" bedrag={u.winstcorrectie} />}
                  {(u.onttrekkingBovenStand ?? 0) > 0 && (
                    <StatRow label="Meer onderhoud dan in de reserve" bedrag={u.onttrekkingBovenStand ?? 0} toelichting={`Dat deel blijft gewone kosten in ${jaar}.`} />
                  )}
                </StatLijst>
              ) : (
                <p className="text-xs text-gray-500">Nog geen uitkomst.</p>
              )}
            </div>
          )
        }}
      </Lijst>
    </div>
  )
}

/** Zijn er bedragen ingevuld bij de kostenegalisatiereserves? */
export const egalisatieHeeftBedragen = (o: OndernemingInvoer): boolean => (o.egalisatiereserves ?? []).some((e) => e.standBegin > 0 || (e.dotatie ?? 0) > 0 || (e.onttrekking ?? 0) > 0)
