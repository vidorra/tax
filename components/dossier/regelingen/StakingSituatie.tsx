'use client'

/**
 * Ronde 2 (A6): blok "Gestopt, verkocht of omgezet in {jaar}" (ontwerp 9.2, taak-A6 9.2). Standaard één bedrag
 * stakingswinst; de posten uit het register onder "Specificeren per onderdeel". De blokken staan onder elkaar: wat er
 * gebeurde, de stakingswinst, de reserves die vrijvallen en de aftrek en lijfrente. Alle bedragen komen uit de engine
 * (`OndernemingResultaat.staking`, `InkomensvoorzieningResultaat.stakingslijfrente`); dit component rekent zelf niets.
 */
import type { StakingInvoer, StakingPost } from '@/lib/tax/types'
import { veldVan } from '@/lib/dossier/veld'
import { standaardInSaldo } from '@/lib/tax/modules/onderneming/in-saldo'
import { postResultaat } from '@/lib/tax/modules/onderneming/staking'
import { Alert, Button, ChipGroup, Disclosure, Select, StatLijst, StatRow, Toggle, WaarschuwingLijst, formatEuro, formatGetal } from '@/components/ui'
import { Bedrag, Datum, Lijst, Rij, Tekst } from '../velden'
import type { OndernemingSituatieContext } from './onderneming-situaties'
import { InSaldoRegel } from './WinstBronVraag'
import { houdStakingswinstGelijk, postenUitRegister, stakingWat, zetStakingWat, type StakingWat } from './onderneming-regelingen'

const WAT: Array<{ value: StakingWat; label: string }> = [
  { value: 'gestopt', label: 'Gestopt' },
  { value: 'verkocht', label: 'Verkocht' },
  { value: 'bv', label: 'Omgezet in een BV' },
  { value: 'deel', label: 'Een deel gestopt' },
]

const POST_SOORT: Array<{ value: StakingPost['soort']; label: string }> = [
  { value: 'overigeActiva', label: 'Bedrijfsmiddel of voorraad' },
  { value: 'immaterieel', label: 'Goodwill of ander immaterieel' },
  { value: 'onroerend', label: 'Pand of grond' },
  { value: 'overig', label: 'Overig' },
]

/** Springt binnen de pagina naar een veld met `data-veld` (zelfde pagina, geen navigatie) en zet de focus erin. */
export function naarVeldOpPagina(id: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-veld="${CSS.escape(id)}"]`)
  if (!el) return false
  const rustig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'center', behavior: rustig ? 'auto' : 'smooth' })
  const invoer = el.querySelector<HTMLElement>('input, select, textarea, button')
  invoer?.focus({ preventScroll: true })
  return true
}

function Kop({ children }: { children: string }) {
  return <h5 className="mb-1 border-b border-gray-200 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</h5>
}

export function StakingSituatie({ ctx }: { ctx: OndernemingSituatieContext }) {
  const { jaar, params, persoon, onderneming: o, ondernemingId } = ctx
  const s = o.staking
  if (!s) return null
  const uit = ctx.uitkomst?.onderneming?.staking
  const ro = ctx.uitkomst?.onderneming
  const pr = ctx.uitkomst?.persoon
  const sl = pr?.inkomensvoorziening.stakingslijfrente
  const veld = (pad: string) => veldVan.onderneming(persoon.id, ondernemingId, pad)
  const pasS = (fn: (x: StakingInvoer) => void) =>
    ctx.pas((x) => {
      if (!x.staking) return
      fn(x.staking)
    })
  const wat = stakingWat(s)
  const soort = s.soort ?? (s.gedeeltelijk ? 'gedeeltelijk' : 'geheel')
  const geruisloos = soort === 'geruisloosBV'
  const doorschuiving = soort === 'doorschuiving'
  const doorschuift = geruisloos || doorschuiving
  const posten = s.posten ?? []
  const maximum = params?.ondernemer.waarde.stakingsaftrek
  const persoonGenoten = persoon.genotenStakingsaftrek ?? 0
  const eerderJa = s.stakingsaftrekEerderGebruikt === true || (s.eerderGenotenStakingsaftrek ?? persoonGenoten) > 0
  const drempel = params?.ondernemer.waarde.urencriterium.uren
  const uren = o.uren.onderneming
  const urenTeLaag = drempel !== undefined && uren > 0 && uren < drempel && o.uren.urencriteriumGehaald !== true
  const meldingen = (ro?.waarschuwingen ?? []).filter((w) => w.id.includes('.staking.'))
  const metLijfrente = soort === 'geheel' || soort === 'gedeeltelijk'
  const premieVeld = veldVan.persoon(persoon.id, 'inkomensvoorziening.stakingslijfrente.premie')

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div data-veld={veld('staking.soort')}>
          <ChipGroup<StakingWat> label="Wat is er gebeurd?" value={wat} onChange={(v) => pasS((x) => zetStakingWat(x, v))} options={WAT} />
        </div>
        {wat === 'bv' && (
          <Toggle
            label="Geruisloos ingebracht"
            description="Dan reken je nu niet af over de stakingswinst; de BV neemt de boekwaarden over. Daar horen voorwaarden bij. Bespreek dit met een adviseur."
            checked={geruisloos}
            onChange={(aan) => pasS((x) => void (x.soort = aan ? 'geruisloosBV' : 'geheel'))}
          />
        )}
        {wat === 'verkocht' && (
          <Toggle
            label="Doorgeschoven naar een opvolger"
            description="Overgedragen aan een medeondernemer of je partner die de onderneming voortzet, zonder nu af te rekenen. Daar horen voorwaarden bij. Bespreek dit met een adviseur."
            checked={doorschuiving}
            onChange={(aan) => pasS((x) => void (x.soort = aan ? 'doorschuiving' : 'geheel'))}
          />
        )}
        <Rij>
          <Datum
            label="Datum"
            verplicht
            veld={veld('staking.datum')}
            hint={wat === 'bv' ? 'De dag waarop de BV de onderneming overnam.' : 'De dag waarop je stopte of de onderneming overdroeg.'}
            value={s.datum}
            onChange={(v) => pasS((x) => (v ? (x.datum = v) : delete x.datum))}
          />
        </Rij>
      </div>

      {doorschuift ? (
        <div data-veld={veld('staking.stakingswinst')} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          <p className="flex justify-between gap-3">
            <span>Stakingswinst</span>
            <span>Niet van toepassing bij {geruisloos ? 'geruisloze inbreng' : 'doorschuiving'}</span>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posten.length === 0 ? (
            <>
              <Rij>
                <Bedrag
                  label="Stakingswinst"
                  veld={veld('staking.stakingswinst')}
                  negatief
                  hint="Het verschil tussen de opbrengst of de waarde in het economisch verkeer en de boekwaarde van alles wat in de onderneming zat, ook goodwill. Zonder de oudedagsreserve: die rekenen we zelf."
                  value={s.stakingswinst || undefined}
                  onChange={(v) => pasS((x) => void (x.stakingswinst = v ?? 0))}
                />
              </Rij>
              <InSaldoRegel
                label="Zit al in je winst"
                veld={veld('staking.stakingswinstInSaldo')}
                expliciet={s.stakingswinstInSaldo}
                standaard={standaardInSaldo(o, 'stakingPost')}
                onderneming={o}
                uitleg="Ja: de stakingswinst staat al in het saldo hierboven en telt niet dubbel. Nee: we tellen hem bij je winst op."
                onChange={(v) => pasS((x) => (v === undefined ? delete x.stakingswinstInSaldo : (x.stakingswinstInSaldo = v)))}
              />
            </>
          ) : (
            <div data-veld={veld('staking.stakingswinst')} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
              <p className="flex justify-between gap-3 font-medium text-gray-900">
                <span>Stakingswinst</span>
                <span className="tabular-nums">{formatEuro(s.stakingswinst)}</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">De som van de onderdelen hieronder, met goodwill en min de kosten.</p>
            </div>
          )}

          <Disclosure variant="kaal" titel="Specificeren per onderdeel" subtitel="Opbrengst of waarde en boekwaarde per bedrijfsmiddel, zoals in de aangifte" defaultOpen={posten.length > 0}>
            <div className="space-y-4 pt-2">
              {posten.length === 0 && (o.activa ?? []).length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="secundair"
                    grootte="sm"
                    onClick={() =>
                      pasS((x) => {
                        x.posten = postenUitRegister(o, ro?.afschrijvingen, x.datum, jaar)
                        if (x.posten.length === 0) delete x.posten
                        houdStakingswinstGelijk(x)
                      })
                    }
                  >
                    Onderdelen uit het register overnemen
                  </Button>
                  <span className="text-xs text-gray-500">Met de fiscale boekwaarde op de stakingsdatum, geschat uit het register. Vul de opbrengst of waarde in.</span>
                </div>
              )}
              <Lijst<StakingPost>
                items={s.posten}
                onChange={(l) =>
                  pasS((x) => {
                    if (l.length > 0) x.posten = l
                    else delete x.posten
                    houdStakingswinstGelijk(x)
                  })
                }
                nieuw={() => ({ soort: 'overigeActiva', omschrijving: '', waardeOfOpbrengst: 0, fiscaleBoekwaarde: 0 })}
                titel={(p, i) => `${p.omschrijving.trim() || `Onderdeel ${i + 1}`} · ${formatEuro(postResultaat(p))}`}
                toevoegLabel="Onderdeel toevoegen"
              >
                {(p, pasP, i) => {
                  const pv = (pad: string) => veld(`stakingspost:${i}/${pad}`)
                  return (
                    <div className="space-y-3">
                      <Rij>
                        <Tekst label="Omschrijving" verplicht veld={pv('omschrijving')} value={p.omschrijving} onChange={(v) => pasP((x) => void (x.omschrijving = v))} />
                        <div data-veld={pv('soort')}>
                          <Select<StakingPost['soort']> label="Soort" value={p.soort} onChange={(v) => pasP((x) => void (x.soort = v))} options={POST_SOORT} />
                        </div>
                        <Bedrag
                          label={p.naarPrive ? 'Waarde in het economisch verkeer' : 'Opbrengst'}
                          veld={pv('waardeOfOpbrengst')}
                          hint={p.naarPrive ? 'Wat het waard is op de dag dat het naar privé gaat.' : 'Wat je ervoor kreeg, exclusief btw.'}
                          value={p.waardeOfOpbrengst}
                          onChange={(v) => pasP((x) => void (x.waardeOfOpbrengst = v ?? 0))}
                        />
                        <Bedrag
                          label="Fiscale boekwaarde"
                          veld={pv('fiscaleBoekwaarde')}
                          hint={p.actiefHerkomst ? 'Voorgevuld uit het register, geschat tot de stakingsdatum. Pas het aan als je de precieze boekwaarde weet.' : undefined}
                          value={p.fiscaleBoekwaarde}
                          onChange={(v) => pasP((x) => void (x.fiscaleBoekwaarde = v ?? 0))}
                        />
                      </Rij>
                      <div data-veld={pv('naarPrive')}>
                        <Toggle label="Gaat naar privé" description="Je houdt het zelf, bijvoorbeeld de auto. Dan telt de waarde in het economisch verkeer als opbrengst." checked={Boolean(p.naarPrive)} onChange={(aan) => pasP((x) => (aan ? (x.naarPrive = true) : delete x.naarPrive))} />
                      </div>
                      <InSaldoRegel
                        label="Zit al in je boekhouding"
                        veld={pv('inSaldo')}
                        expliciet={p.inSaldo}
                        standaard={standaardInSaldo(o, p.naarPrive ? 'stakingPostPrive' : 'stakingPost')}
                        onderneming={o}
                        uitleg="Nee: we tellen het resultaat op dit onderdeel bij je winst op. Ja: het staat al in het saldo hierboven."
                        onChange={(v) => pasP((x) => (v === undefined ? delete x.inSaldo : (x.inSaldo = v)))}
                      />
                    </div>
                  )
                }}
              </Lijst>
              <Rij>
                <Bedrag
                  label="Goodwill"
                  veld={veld('staking.goodwill')}
                  hint="Zelf opgebouwde goodwill die je niet als onderdeel hierboven noemde."
                  value={s.goodwill}
                  onChange={(v) =>
                    pasS((x) => {
                      if (v === undefined) delete x.goodwill
                      else x.goodwill = v
                      houdStakingswinstGelijk(x)
                    })
                  }
                />
                <Bedrag
                  label="Stakingskosten"
                  veld={veld('staking.stakingskosten')}
                  hint="Kosten van de verkoop of het stoppen, zoals notaris of makelaar."
                  value={s.stakingskosten}
                  onChange={(v) =>
                    pasS((x) => {
                      if (v === undefined) delete x.stakingskosten
                      else x.stakingskosten = v
                      houdStakingswinstGelijk(x)
                    })
                  }
                />
              </Rij>
            </div>
          </Disclosure>
        </div>
      )}

      <section aria-label="Reserves die vrijvallen">
        <Kop>Reserves die vrijvallen</Kop>
        <StatLijst>
          <StatRow label="Oudedagsreserve" bedrag={uit ? uit.forVrijval : null} toelichting={soort === 'gedeeltelijk' ? 'Alleen het deel boven het ondernemingsvermogen aan het einde van het jaar.' : undefined} />
          {!doorschuift && <StatRow label="Herinvesterings- en kostenegalisatiereserve" bedrag={uit ? uit.reservesVrijval : null} />}
          {!doorschuift && <StatRow label="Desinvesteringsbijtelling" bedrag={uit ? uit.desinvesteringsbijtelling : null} />}
          <StatRow label="Totale stakingswinst" variant="totaal" bedrag={uit ? uit.totaal : null} />
        </StatLijst>
        {doorschuift && <p className="mt-1 text-xs text-gray-500">De herinvesteringsreserve, de kostenegalisatiereserve en de plicht tot desinvesteringsbijtelling gaan mee naar de overnemer.</p>}
        {!uit && <p className="mt-1 text-xs text-gray-500">Nog geen uitkomst. Controleer de datum en de bedragen.</p>}
      </section>

      <section aria-label="Aftrek en lijfrente" className="space-y-3">
        <Kop>Aftrek en lijfrente</Kop>
        {soort === 'geheel' || geruisloos ? (
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <ChipGroup<'ja' | 'nee'>
              label="Stakingsaftrek eerder gebruikt?"
              kolommen={2}
              value={eerderJa ? 'ja' : 'nee'}
              onChange={(v) =>
                pasS((x) => {
                  if (v === 'ja') {
                    if (x.eerderGenotenStakingsaftrek === 0) delete x.eerderGenotenStakingsaftrek
                    // Met een bedrag (hier of uit eerdere jaren) telt dat bedrag; zonder bedrag nemen we aan dat alles is gebruikt.
                    if (persoonGenoten > 0 || (x.eerderGenotenStakingsaftrek ?? 0) > 0) delete x.stakingsaftrekEerderGebruikt
                    else x.stakingsaftrekEerderGebruikt = true
                  } else {
                    delete x.stakingsaftrekEerderGebruikt
                    if (persoonGenoten > 0) x.eerderGenotenStakingsaftrek = 0
                    else delete x.eerderGenotenStakingsaftrek
                  }
                })
              }
              options={[
                { value: 'nee', label: 'Nee' },
                { value: 'ja', label: 'Ja' },
              ]}
              hint={persoonGenoten > 0 ? `Uit je eerdere jaren: ${formatEuro(persoonGenoten)}, over al je ondernemingen samen.` : 'In een eerder jaar, bij deze of een andere onderneming.'}
            />
            {eerderJa && (
              <Bedrag
                label="Eerder gebruikte stakingsaftrek"
                veld={veld('staking.eerderGenotenStakingsaftrek')}
                hint={
                  persoonGenoten > 0
                    ? `Leeg: ${formatEuro(persoonGenoten)} uit je eerdere jaren.`
                    : maximum !== undefined
                      ? `Leeg: we nemen aan dat je de hele ${formatEuro(maximum)} al hebt gebruikt.`
                      : undefined
                }
                value={s.eerderGenotenStakingsaftrek ?? (persoonGenoten > 0 ? persoonGenoten : undefined)}
                onChange={(v) =>
                  pasS((x) => {
                    if (v === undefined || v === 0) {
                      delete x.eerderGenotenStakingsaftrek
                      if (persoonGenoten > 0) delete x.stakingsaftrekEerderGebruikt
                      else x.stakingsaftrekEerderGebruikt = true
                    } else {
                      x.eerderGenotenStakingsaftrek = v
                      delete x.stakingsaftrekEerderGebruikt
                    }
                  })
                }
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            {soort === 'gedeeltelijk' ? 'Stakingsaftrek krijg je alleen als je de hele onderneming staakt.' : 'Bij een doorschuiving rekenen we nog geen stakingsaftrek over de vrijval van de oudedagsreserve.'}
          </p>
        )}
        <StatLijst>
          <StatRow label="Stakingsaftrek dit jaar" bedrag={uit ? (uit.stakingsaftrek ?? 0) : null} />
          {metLijfrente && <StatRow label="Ruimte voor een stakingslijfrente" bedrag={sl ? sl.ruimte : null} />}
        </StatLijst>
        <Disclosure variant="kaal" titel="Hoe komt dit bedrag tot stand?">
          <dl className="space-y-1.5 pt-1 text-xs text-gray-600">
            {uit && (
              <div>
                <dt className="font-medium text-gray-800">Totale stakingswinst</dt>
                <dd>
                  {doorschuift ? 'Alleen de oudedagsreserve valt vrij' : `Stakingswinst ${formatEuro(uit.basis)}`}
                  {uit.forVrijval > 0 && ` + oudedagsreserve ${formatEuro(uit.forVrijval)}`}
                  {uit.reservesVrijval > 0 && ` + reserves ${formatEuro(uit.reservesVrijval)}`}
                  {uit.desinvesteringsbijtelling > 0 && ` + desinvesteringsbijtelling ${formatEuro(uit.desinvesteringsbijtelling)}`} = {formatEuro(uit.totaal)}
                  {uit.bijgeteld !== 0 && `. Daarvan zat ${formatEuro(uit.bijgeteld)} niet in je saldo; dat tellen we bij je winst op.`}
                </dd>
              </div>
            )}
            {uit && maximum !== undefined && (soort === 'geheel' || geruisloos) && (
              <div>
                <dt className="font-medium text-gray-800">Stakingsaftrek</dt>
                <dd>
                  Ten hoogste {formatEuro(maximum)} in je hele leven, min wat je eerder gebruikte ({formatEuro(uit.eerderGenoten ?? 0)}), en niet meer dan {geruisloos ? 'de vrijval van de oudedagsreserve' : 'de stakingswinst'}: {formatEuro(uit.stakingsaftrek ?? 0)}.
                </dd>
              </div>
            )}
            {sl && (
              <div>
                <dt className="font-medium text-gray-800">Ruimte voor een stakingslijfrente</dt>
                <dd>
                  Maximum {formatEuro(sl.maximum)} ({sl.categorie === 'hoog' ? 'AOW binnen 5 jaar of arbeidsongeschikt' : sl.categorie === 'midden' ? 'AOW binnen 15 jaar' : 'AOW over meer dan 15 jaar'}) min wat je al opbouwde ({formatEuro(sl.voorzieningen)}), en niet meer dan de stakingswinst: {formatEuro(sl.ruimte)}.
                </dd>
              </div>
            )}
            {!uit && <dd>Nog geen uitkomst.</dd>}
          </dl>
        </Disclosure>
        {metLijfrente && (
          <p className="text-sm text-gray-700">
            Je kunt de vrijval en de stakingswinst omzetten in een stakingslijfrente. De premie vul je in bij Pensioen en AOV.{' '}
            <button
              type="button"
              onClick={() => naarVeldOpPagina(premieVeld)}
              className="inline-flex min-h-[44px] items-center font-medium text-primary underline-offset-2 transition-colors hover:text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Naar het veld<span className="sr-only">: premie stakingslijfrente</span>
            </button>
          </p>
        )}
        {urenTeLaag && (
          <Alert variant="info">
            Je haalt het urencriterium dit jaar waarschijnlijk niet ({formatGetal(uren)} van {formatGetal(drempel ?? 0)} uur). In het jaar dat je stopt, telt het volle aantal uren; het gaat niet naar rato omlaag.
          </Alert>
        )}
        {meldingen.length > 0 && <WaarschuwingLijst waarschuwingen={meldingen} />}
      </section>
    </div>
  )
}

/** Is er in deze staking iets ingevuld (dan vraagt Weghalen om bevestiging)? */
export function stakingHeeftBedragen(s: StakingInvoer | undefined): boolean {
  if (!s) return false
  return s.stakingswinst !== 0 || (s.posten ?? []).length > 0 || (s.goodwill ?? 0) > 0 || (s.stakingskosten ?? 0) > 0 || (s.eerderGenotenStakingsaftrek ?? 0) > 0
}

