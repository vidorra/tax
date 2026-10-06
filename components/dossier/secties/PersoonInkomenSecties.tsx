'use client'

import { useMemo } from 'react'
import { Landmark, PiggyBank, Receipt } from 'lucide-react'
import type { LijfrenteHistorieJaar, LoonInvoer } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { MoneyInput, NumberInput, Section, Select, formatEuro } from '@/components/ui'
import { Bedrag, Getal, Lijst, Rij, Subkop, Tekst, VeldVak } from '../velden'
import { persoonNaam, type PersoonSectieProps } from './types'
import { VaInvoer } from '../planning/VaInvoer'
import { itemSleutel } from '@/lib/dossier/ids'
import { veldVan } from '@/lib/dossier/veld'
import { PartnerAfgeleid } from '../regelingen/PartnerAfgeleid'
import { VoortwentelingVeld } from '../bronbelasting/VoortwentelingVeld'
import { StakingslijfrenteVeld } from '../regelingen/StakingslijfrenteVeld'

const LOON_SOORT: Array<{ value: LoonInvoer['soort']; label: string }> = [
  { value: 'loon', label: 'Loon uit dienstbetrekking' },
  { value: 'uwv-zez', label: 'UWV-uitkering zwangerschap (ZEZ)' },
  { value: 'uwv-overig', label: 'Andere UWV-uitkering' },
  { value: 'pensioen', label: 'Pensioen of AOW' },
]

/**
 * Ronde 2: `veld`-props A3; markering voor A5 (afgeleide regel van de partner). Wie een markering heeft, leest `props`
 * (bijvoorbeeld `props.huishouden`, `props.jaar`) en wijzigt de regel met de destructuring niet.
 */
export function LoonSectie(props: PersoonSectieProps) {
  const { persoon, wijzigPersoon } = props
  return (
    <Section id={`loon-${persoon.id}`} icon={<Receipt />} title="Loon en uitkeringen" subtitle={`Loon, UWV-uitkeringen en overige inkomsten van ${persoonNaam(persoon)}`}>
      <div className="space-y-5">
        <Lijst<LoonInvoer>
          items={persoon.loon}
          onChange={(l) => wijzigPersoon((p) => void (p.loon = l))}
          nieuw={() => ({ omschrijving: '', soort: 'loon', bruto: 0, ingehoudenLoonheffing: 0 })}
          titel={(l, i) => `${l.omschrijving || `Inkomen ${i + 1}`} · ${formatEuro(l.bruto)}`}
          toevoegLabel="Loon of uitkering toevoegen"
          leegTekst="Geen loon of uitkeringen."
        >
          {(l, pas, i) => (
            <Rij>
              <Tekst label="Omschrijving" verplicht veld={veldVan.persoon(persoon.id, `loon:${itemSleutel(l, i)}`, 'omschrijving')} value={l.omschrijving} onChange={(v) => pas((x) => void (x.omschrijving = v))} />
              <VeldVak veld={veldVan.persoon(persoon.id, `loon:${itemSleutel(l, i)}`, 'soort')}>
                {(m) => <Select label="Soort" value={l.soort} onChange={(v) => pas((x) => void (x.soort = v))} options={LOON_SOORT} error={m.fout} hint={m.melding} />}
              </VeldVak>
              <Bedrag label="Bruto (fiscaal loon)" veld={veldVan.persoon(persoon.id, `loon:${itemSleutel(l, i)}`, 'bruto')} value={l.bruto} onChange={(v) => pas((x) => void (x.bruto = v ?? 0))} />
              <Bedrag label="Ingehouden loonheffing" veld={veldVan.persoon(persoon.id, `loon:${itemSleutel(l, i)}`, 'ingehoudenLoonheffing')} value={l.ingehoudenLoonheffing} onChange={(v) => pas((x) => void (x.ingehoudenLoonheffing = v ?? 0))} />
              <Bedrag label="Bijdrageloon Zvw" veld={veldVan.persoon(persoon.id, `loon:${itemSleutel(l, i)}`, 'zvwBijdrageloon')} hint="Staat op je jaaropgave." value={l.zvwBijdrageloon} onChange={(v) => pas((x) => void (x.zvwBijdrageloon = v))} />
            </Rij>
          )}
        </Lijst>
        <PartnerAfgeleid persoon={props.persoon} huishouden={props.huishouden} jaar={props.jaar} />
        <Rij>
          <Bedrag label="Resultaat uit overige werkzaamheden" veld={veldVan.persoon(persoon.id, 'resultaatOverigWerk')} negatief value={persoon.resultaatOverigWerk} onChange={(v) => wijzigPersoon((p) => void (p.resultaatOverigWerk = v))} />
          <Bedrag label="Periodieke uitkeringen" veld={veldVan.persoon(persoon.id, 'periodiekeUitkeringen')} value={persoon.periodiekeUitkeringen} onChange={(v) => wijzigPersoon((p) => void (p.periodiekeUitkeringen = v))} />
        </Rij>
      </div>
    </Section>
  )
}

/** Ronde 2: `veld`-props A3; markering voor A6 (stakingslijfrente, leest `props.huishouden`). */
export function PensioenSectie(props: PersoonSectieProps) {
  const { persoon, wijzigPersoon, jaar } = props
  const iv = persoon.inkomensvoorziening
  return (
    <Section id={`pensioen-${persoon.id}`} icon={<PiggyBank />} title="Pensioen en AOV" subtitle="Lijfrente, arbeidsongeschiktheidsverzekering en de historie voor de reserveringsruimte">
      <div className="space-y-5">
        <Rij>
          <Bedrag label="Lijfrentepremies" veld={veldVan.persoon(persoon.id, 'inkomensvoorziening.lijfrentePremies')} value={iv.lijfrentePremies} onChange={(v) => wijzigPersoon((p) => void (p.inkomensvoorziening.lijfrentePremies = v ?? 0))} />
          <Bedrag label="Premies AOV" veld={veldVan.persoon(persoon.id, 'inkomensvoorziening.aovPremies')} value={iv.aovPremies} onChange={(v) => wijzigPersoon((p) => void (p.inkomensvoorziening.aovPremies = v ?? 0))} />
          <Bedrag
            label="Premie voor omzetting van de FOR"
            veld={veldVan.persoon(persoon.id, 'inkomensvoorziening.forOmzetting')}
            hint="Lijfrente die je koopt met je oudedagsreserve; aftrekbaar bovenop de ruimte."
            value={iv.forOmzetting}
            onChange={(v) => wijzigPersoon((p) => void (p.inkomensvoorziening.forOmzetting = v))}
          />
          <Bedrag
            label={`Premiegrondslag-inkomen ${jaar - 1}`}
            veld={veldVan.persoon(persoon.id, 'inkomensvoorziening.premiegrondslagInkomenVorigJaar')}
            hint="Winst vóór ondernemersaftrek en vóór afneming van de FOR, plus loon en overige inkomsten van vorig jaar. Een toevoeging aan de FOR vul je apart in bij de toename."
            value={iv.premiegrondslagInkomenVorigJaar}
            onChange={(v) => wijzigPersoon((p) => void (p.inkomensvoorziening.premiegrondslagInkomenVorigJaar = v))}
          />
          <Bedrag label={`Toename FOR in ${jaar - 1}`} veld={veldVan.persoon(persoon.id, 'inkomensvoorziening.forToenameVorigJaar')} value={iv.forToenameVorigJaar} onChange={(v) => wijzigPersoon((p) => void (p.inkomensvoorziening.forToenameVorigJaar = v))} />
          <Bedrag
            label={`Pensioenopbouw in ${jaar - 1} (factor A of premie)`}
            veld={veldVan.persoon(persoon.id, 'inkomensvoorziening.pensioencorrectieVorigJaar.bedrag')}
            hint="Van je UPO als je in loondienst pensioen opbouwde."
            value={iv.pensioencorrectieVorigJaar?.bedrag}
            onChange={(v) =>
              wijzigPersoon((p) => {
                if (v === undefined) delete p.inkomensvoorziening.pensioencorrectieVorigJaar
                else p.inkomensvoorziening.pensioencorrectieVorigJaar = { type: p.inkomensvoorziening.pensioencorrectieVorigJaar?.type ?? 'wtpPremie', bedrag: v }
              })
            }
          />
        </Rij>
        {iv.pensioencorrectieVorigJaar && (
          <Select<'factorA' | 'wtpPremie'>
            label="Soort pensioenopbouw"
            value={iv.pensioencorrectieVorigJaar.type}
            onChange={(t) => wijzigPersoon((p) => void (p.inkomensvoorziening.pensioencorrectieVorigJaar && (p.inkomensvoorziening.pensioencorrectieVorigJaar.type = t)))}
            options={[
              { value: 'factorA', label: 'Factor A (oude pensioenregeling)' },
              { value: 'wtpPremie', label: 'Betaalde premie (nieuwe pensioenregeling)' },
            ]}
          />
        )}
        <div>
          <Subkop>Historie jaarruimte</Subkop>
          <p className="mb-3 text-xs text-gray-500">
            Per jaar het inkomen van het jaar ervoor en wat je al hebt gebruikt. Staat de jaarruimte in een eerder rapport, vul die dan in; dat gaat voor onze berekening.
          </p>
          <Lijst<LijfrenteHistorieJaar>
            items={iv.historie}
            onChange={(h) => wijzigPersoon((p) => (h.length ? (p.inkomensvoorziening.historie = [...h].sort((a, b) => a.jaar - b.jaar)) : delete p.inkomensvoorziening.historie))}
            nieuw={() => {
              const laatste = Math.max(jaar - 11, ...(iv.historie ?? []).map((h) => h.jaar))
              return { jaar: Math.min(jaar - 1, laatste + 1), premiegrondslagInkomen: 0, alGebruikt: 0 }
            }}
            titel={(h) => `Jaar ${h.jaar}`}
            toevoegLabel="Jaar toevoegen"
            leegTekst="Nog geen historie. Zonder historie rekenen we alleen met de jaarruimte van dit jaar."
          >
            {(h, pas) => (
              <Rij kolommen={3}>
                <Getal label="Jaar" min={jaar - 15} max={jaar - 1} value={h.jaar} onChange={(v) => pas((x) => void (x.jaar = v ?? jaar - 1))} />
                <Bedrag label="Inkomen jaar ervoor" veld={veldVan.persoon(persoon.id, `lijfrentehistorie:${h.jaar}`, 'premiegrondslagInkomen')} value={h.premiegrondslagInkomen} onChange={(v) => pas((x) => void (x.premiegrondslagInkomen = v ?? 0))} />
                <Bedrag label="Toename FOR jaar ervoor" veld={veldVan.persoon(persoon.id, `lijfrentehistorie:${h.jaar}`, 'forToenameVorigJaar')} value={h.forToenameVorigJaar} onChange={(v) => pas((x) => void (x.forToenameVorigJaar = v))} />
                <Bedrag label="Al gebruikt" veld={veldVan.persoon(persoon.id, `lijfrentehistorie:${h.jaar}`, 'alGebruikt')} value={h.alGebruikt} onChange={(v) => pas((x) => void (x.alGebruikt = v ?? 0))} />
                <Bedrag label="Jaarruimte uit rapport" veld={veldVan.persoon(persoon.id, `lijfrentehistorie:${h.jaar}`, 'jaarruimteOverride')} value={h.jaarruimteOverride} onChange={(v) => pas((x) => void (x.jaarruimteOverride = v))} />
              </Rij>
            )}
          </Lijst>
        </div>
      </div>
        <StakingslijfrenteVeld
          persoon={props.persoon}
          wijzigPersoon={props.wijzigPersoon}
          jaar={props.jaar}
          resultaat={props.huishouden?.resultaat?.personen.find((x) => x.id === props.persoon.id) ?? null}
        />
    </Section>
  )
}

type JaarBedrag = { jaar: number; bedrag: number }

/** Termijnen uit de parameters van dit jaar (verliezen terug en vooruit, niet-benutte zelfstandigenaftrek). */
function useTermijnen(jaar: number): { terug: number; vooruit: number; zelfstandigenaftrek: number } | null {
  return useMemo(() => {
    try {
      const p = getJaar(jaar)
      return { ...p.box1.waarde.verliesverrekening, zelfstandigenaftrek: p.ondernemer.waarde.nietBenutteZelfstandigenaftrekJaren }
    } catch {
      return null
    }
  }, [jaar])
}

/** Fout per regel: een jaar vóór dit jaar, niet dubbel, niet vervallen. */
function regelFout(lijst: JaarBedrag[], i: number, jaar: number, termijn: number | undefined, soort: string): string | undefined {
  const v = lijst[i]
  if (!Number.isInteger(v.jaar) || v.jaar >= jaar) return `Kies een jaar vóór ${jaar}.`
  if (lijst.findIndex((x) => x.jaar === v.jaar) !== i) return `${v.jaar} staat er al in. Tel de bedragen bij elkaar op in één regel.`
  if (termijn !== undefined && v.jaar + termijn < jaar) return `Vervallen: ${soort} uit ${v.jaar} verreken je tot en met ${v.jaar + termijn}.`
  return undefined
}

function JaarBedragLijst({
  items,
  onChange,
  jaar,
  termijn,
  soort,
  titel,
  bedragLabel,
  toevoegLabel,
  leegTekst,
}: {
  items: JaarBedrag[] | undefined
  onChange: (l: JaarBedrag[]) => void
  jaar: number
  termijn: number | undefined
  soort: string
  titel: string
  bedragLabel: string
  toevoegLabel: string
  leegTekst: string
}) {
  const lijst = items ?? []
  return (
    <Lijst<JaarBedrag>
      items={items}
      onChange={onChange}
      nieuw={() => {
        const bezet = new Set(lijst.map((x) => x.jaar))
        let j = jaar - 1
        while (bezet.has(j) && j > jaar - 15) j--
        return { jaar: j, bedrag: 0 }
      }}
      titel={(v) => `${titel} ${v.jaar} · ${formatEuro(v.bedrag)}`}
      toevoegLabel={toevoegLabel}
      leegTekst={leegTekst}
    >
      {(v, pas, i) => (
        <Rij>
          <NumberInput label="Jaar" min={jaar - 15} max={jaar - 1} value={v.jaar} error={regelFout(lijst, i, jaar, termijn, soort)} onChange={(n) => pas((x) => void (x.jaar = n ?? jaar - 1))} />
          <MoneyInput label={bedragLabel} value={v.bedrag} onChange={(n) => pas((x) => void (x.bedrag = n ?? 0))} />
        </Rij>
      )}
    </Lijst>
  )
}

/** Ronde 2: eigenaar A2; markering voor A5 (voortwenteling, leest `props.huishouden`). */
export function AanslagSectie(props: PersoonSectieProps) {
  const { persoon, wijzigPersoon, jaar } = props
  const t = useTermijnen(jaar)
  return (
    <Section id={`aanslag-${persoon.id}`} icon={<Landmark />} title="Voorlopige aanslag en verliezen" subtitle="Wat al betaald is, en verliezen en aftrek die uit eerdere jaren doorschuiven">
      <div className="space-y-5">
        <VaInvoer persoon={persoon} wijzigPersoon={wijzigPersoon} jaar={jaar} resultaat={props.huishouden?.resultaat} />
        <p className="text-xs text-gray-500">
          Staat {jaar - 1} in je dossier, dan komen de bedragen hieronder uit de uitkomst van dat jaar. Pas je {jaar - 1} later aan, neem de saldi dan opnieuw over met de knop boven aan de pagina.
        </p>
        <div>
          <Subkop>Verliezen uit eerdere jaren (box 1)</Subkop>
          <p className="mb-3 text-xs text-gray-500">
            Per jaar waarin het verlies ontstond: wat na eerdere verrekening nog openstaat.
            {t ? ` Een nieuw verlies gaat eerst terug naar de ${t.terug} jaar ervoor; vul hier alleen in wat na de verliesbeschikking overblijft.` : ''}
          </p>
          <div data-veld={`persoon:${persoon.id}/verliezen`}>
            <JaarBedragLijst
              items={persoon.verliezen}
              onChange={(l) => wijzigPersoon((p) => (l.length ? (p.verliezen = l) : delete p.verliezen))}
              jaar={jaar}
              termijn={t?.vooruit}
              soort="een verlies"
              titel="Verlies"
              bedragLabel="Openstaand verlies"
              toevoegLabel="Verlies toevoegen"
              leegTekst="Geen openstaande verliezen."
            />
          </div>
        </div>
        <div>
          <Subkop>Niet-benutte zelfstandigenaftrek</Subkop>
          <p className="mb-3 text-xs text-gray-500">
            Zelfstandigenaftrek die in een eerder jaar niet in je winst paste.
            {t ? ` Je verrekent die in de ${t.zelfstandigenaftrek} jaar daarna, in een jaar waarin je aan het urencriterium voldoet.` : ''}
          </p>
          <div data-veld={`persoon:${persoon.id}/nietBenutteZelfstandigenaftrek`}>
            <JaarBedragLijst
              items={persoon.nietBenutteZelfstandigenaftrek}
              onChange={(l) => wijzigPersoon((p) => (l.length ? (p.nietBenutteZelfstandigenaftrek = l) : delete p.nietBenutteZelfstandigenaftrek))}
              jaar={jaar}
              termijn={t?.zelfstandigenaftrek}
              soort="niet-benutte zelfstandigenaftrek"
              titel="Niet benut in"
              bedragLabel="Nog te verrekenen"
              toevoegLabel="Jaar toevoegen"
              leegTekst="Geen niet-benutte zelfstandigenaftrek."
            />
          </div>
        </div>
        <VoortwentelingVeld
          persoon={props.persoon}
          invoer={props.huishouden?.invoer}
          resultaat={props.huishouden?.resultaat}
          jaar={props.jaar}
          onChange={(v) => props.wijzigPersoon((p) => (v === undefined ? delete p.voortgewenteldeBronbelasting : (p.voortgewenteldeBronbelasting = v)))}
        />
        <Rij>
          <Bedrag
            label={`Persoonsgebonden aftrek die in ${jaar - 1} niet paste`}
            hint="Zorgkosten, giften of scholing die vorig jaar niet in je inkomen pasten. Dat restant trek je dit jaar af."
            veld={`persoon:${persoon.id}/restantPgaVorigJaar`}
            value={persoon.restantPgaVorigJaar}
            onChange={(v) => wijzigPersoon((p) => (v ? (p.restantPgaVorigJaar = v) : delete p.restantPgaVorigJaar))}
          />
        </Rij>
      </div>
    </Section>
  )
}
