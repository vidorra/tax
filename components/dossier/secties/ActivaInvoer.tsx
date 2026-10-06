'use client'

/**
 * Activaregister van een onderneming (OndernemingInvoer.activa): de bedrijfsmiddelen waarop je afschrijft.
 * De fiscale afschrijving en de boekwaarde per middel komen uit de uitkomst van de engine; dit component
 * rekent zelf niets. Hulpfuncties (koppelen, dubbele regels) staan in activaregister.ts.
 *
 * Alleen als de gebruiker aangeeft dat alle bedrijfsmiddelen erin staan (`activaVolledig`), vervangt het register de
 * geboekte afschrijving; anders is het een fiscale controle. Een middel uit de doorrol van een investering (bron
 * 'investering') heeft een aangenomen levensduur: die bevestigt de gebruiker, of hij past levensduur of restwaarde
 * aan (dan wordt de bron 'handmatig'). Een middel van een eerder jaar zonder boekwaarde op 1 januari valt op, met de
 * vraag die uit de aangifte van vorig jaar over te nemen. Wie een doorgerold middel verwijdert, zet de herkomst in
 * `doorrolUitgesloten`, zodat opnieuw overnemen het niet terugzet.
 *
 * Ronde 2 (A6): elk veld krijgt een veld-id (`veldVoor`, met de vaste id van de onderneming), en bij een verkocht middel
 * met boekwinst staat de schakelaar voor de herinvesteringsreserve (HirReserveren).
 */
import type { ReactNode } from 'react'
import type { ActiefInvoer, AfschrijvingActief, OndernemingInvoer, OndernemingResultaat, TaxYearParams } from '@/lib/tax/types'
import { Alert, Button, ChipGroup, Disclosure, Toggle, WaarschuwingLijst, formatEuro, formatPct } from '@/components/ui'
import { Bedrag, Datum, Getal, Lijst, Rij, Subkop, Tekst } from '../velden'
import {
  boekwaardeOntbreekt,
  dubbeleActiva,
  geboekteAfschrijving,
  heeftEigenKeuzes,
  herkomstTekst,
  koppelAfschrijvingen,
  koppelFormules,
  levensduurTeBevestigen,
  nieuwActief,
  registerTeltMee,
  waaromAfwezig,
  zetActiva,
  type Afwezig,
} from './activaregister'
import { HirReserveren } from '../regelingen/HirSituatie'
import { eigenHerkomstDitJaar } from '../regelingen/onderneming-regelingen'

type Soort = NonNullable<ActiefInvoer['soort']>
type Methode = ActiefInvoer['methode']
type AfschrijvingParams = TaxYearParams['ondernemer']['waarde']['afschrijving']

const REGELING_NAAM: Record<NonNullable<ActiefInvoer['investeringsaftrek']>['regeling'], string> = {
  kia: 'kleinschaligheidsinvesteringsaftrek (KIA)',
  eia: 'energie-investeringsaftrek (EIA)',
  'mia-1': 'milieu-investeringsaftrek (MIA, categorie I)',
  'mia-2': 'milieu-investeringsaftrek (MIA, categorie II)',
  'mia-3': 'milieu-investeringsaftrek (MIA, categorie III)',
}

export interface ActivaInvoerProps {
  onderneming: OndernemingInvoer
  /** Wijzigt de onderneming, zoals `pas` uit Lijst. */
  pas: (fn: (x: OndernemingInvoer) => void) => void
  jaar: number
  params: TaxYearParams | null
  /** Uitkomst van de engine voor deze onderneming; null als de berekening met deze invoer niet lukt. */
  uitkomst: OndernemingResultaat | null
  /** Ronde 2 (A6): veld-id voor een pad onder de onderneming (`veldVan.onderneming(persoon, ondernemingId, pad)`). */
  veldVoor?: (pad: string) => string
}

const jarenVoor = (pct: number) => Math.ceil(1 / pct - 1e-9)

/** Hint bij de levensduur, met de grenzen uit de parameters van het jaar. */
function levensduurHint(soort: Soort, af: AfschrijvingParams | undefined): string {
  if (!af) return 'Fiscaal geldt een maximum per jaar; een kortere levensduur rekenen we om naar dat maximum.'
  if (soort === 'goodwill') return `Goodwill schrijf je af met maximaal ${formatPct(af.goodwillPct)} per jaar, dus in minimaal ${jarenVoor(af.goodwillPct)} jaar.`
  if (soort === 'gebouw')
    return `Ook een gebouw schrijf je af met maximaal ${formatPct(af.maxPctPerJaar)} van de aanschafwaarde per jaar, en niet verder dan de bodemwaarde: ${formatPct(af.bodemwaardeGebouwEigenGebruik)} van de WOZ-waarde bij eigen gebruik.`
  return `Fiscaal mag maximaal ${formatPct(af.maxPctPerJaar)} van de aanschafwaarde per jaar, dus zonder restwaarde minimaal ${jarenVoor(af.maxPctPerJaar)} jaar. Een kortere levensduur rekenen we om naar dat maximum.`
}

function afwezigTekst(reden: Afwezig, jaar: number): string {
  if (reden === 'later') return `Aangeschaft na ${jaar}: telt dit jaar nog niet mee.`
  if (reden === 'verkocht') return `Verkocht vóór ${jaar}: telt niet meer mee.`
  if (reden === 'saldo') return 'Telt mee zodra je bij de winstberekening de afschrijving in het saldo invult.'
  return 'Nog geen uitkomst. Controleer de datums en bedragen.'
}

function UitkomstRegel({ r, jaar, aanschafjaar, formule }: { r: AfschrijvingActief; jaar: number; aanschafjaar: number; formule: string | undefined }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-gray-500">Fiscale afschrijving {jaar}</dt>
        <dd className="font-medium tabular-nums text-gray-900">{formatEuro(r.afschrijving)}</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-500">{aanschafjaar === jaar ? 'Aanschafwaarde' : 'Boekwaarde 1 januari'}</dt>
        <dd className="tabular-nums text-gray-800">{formatEuro(r.boekwaardeBegin)}</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-500">Boekwaarde eind {jaar}</dt>
        <dd className="font-medium tabular-nums text-gray-900">{formatEuro(r.boekwaardeEind)}</dd>
      </div>
      {r.boekwinst !== 0 && (
        <div className="sm:col-span-3">
          <dt className="text-xs text-gray-500">{r.boekwinst > 0 ? 'Boekwinst bij verkoop' : 'Boekverlies bij verkoop'}</dt>
          <dd className="tabular-nums text-gray-800">{formatEuro(Math.abs(r.boekwinst))}</dd>
        </div>
      )}
      {formule && (
        <div className="sm:col-span-3">
          <dt className="sr-only">Berekening</dt>
          <dd className="text-xs text-gray-500">{formule}</dd>
        </div>
      )}
    </dl>
  )
}

function Herkomst({ a, jaar }: { a: ActiefInvoer; jaar: number }) {
  if (a.bron === 'moneybird') return <p className="text-xs text-gray-500">Uit Moneybird. Omschrijving, aanschaf, levensduur en restwaarde worden bij een nieuwe import bijgewerkt; je andere keuzes blijven staan.</p>
  // Een herkomst die de editor in dit jaar zelf zette (voor de herinvesteringsreserve) is geen doorgerold middel.
  const tekst = (eigenHerkomstDitJaar(a.herkomst, jaar) ? undefined : herkomstTekst(a)) ?? (a.bron === 'investering' ? 'Uit je investeringen van een eerder jaar.' : undefined)
  return tekst ? <p className="text-xs text-gray-500">{tekst}</p> : null
}

/** Gemarkeerd blok voor iets dat de gebruiker nog moet nakijken. */
function Nakijken({ children }: { children: ReactNode }) {
  return <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">{children}</div>
}

/**
 * Markeert een veld dat nog nagekeken moet worden. De wrapper blijft altijd staan, zodat het veld zijn focus houdt als
 * de markering tijdens het typen verdwijnt.
 */
function Gemarkeerd({ aan, children }: { aan: boolean; children: ReactNode }) {
  return <div className={aan ? 'rounded-xl bg-amber-50 p-2 ring-1 ring-amber-300' : undefined}>{children}</div>
}

interface ActiefVeldenProps {
  a: ActiefInvoer
  pasA: (fn: (x: ActiefInvoer) => void) => void
  jaar: number
  af: AfschrijvingParams | undefined
  params: TaxYearParams | null
  /** Uitkomst van de engine voor dit middel, met de berekening uit de uitleg. */
  r: AfschrijvingActief | undefined
  formule: string | undefined
  afwezig: Afwezig
  /** Telt het register mee in de winst (bij 'saldo' alleen met de afschrijving in het saldo)? */
  telt: boolean
  /** Ronde 2 (A6): veld-id voor een veld van dit middel ('omschrijving', 'verkocht.datum'). */
  veld: (pad: string) => string | undefined
  /** Ronde 2 (A6): de schakelaar voor de herinvesteringsreserve, onder de uitkomst. */
  hir?: ReactNode
}

function ActiefVelden({ a, pasA, jaar, af, params, r, formule, afwezig, telt, veld, hir }: ActiefVeldenProps) {
  const soort: Soort = a.soort ?? 'bedrijfsmiddel'
  const grens = af ? formatEuro(af.directAftrekbaarTot) : null
  const aanschafjaar = Number(a.aanschafdatum.slice(0, 4))
  const bevestigen = levensduurTeBevestigen(a)
  const zonderBoekwaarde = boekwaardeOntbreekt(a, jaar)
  /** Levensduur of restwaarde aanpassen is ook bevestigen: de gegevens zijn dan van de gebruiker. */
  const pasLevensduur = (fn: (x: ActiefInvoer) => void) =>
    pasA((x) => {
      fn(x)
      if (x.bron === 'investering') x.bron = 'handmatig'
    })
  const restwaardeVeld = (
    <Bedrag label="Restwaarde" veld={veld('restwaarde')} hint="Wat het naar verwachting nog waard is aan het eind van de levensduur." value={a.restwaarde} onChange={(v) => pasLevensduur((x) => void (x.restwaarde = v ?? 0))} />
  )
  const levensduurVeld = (
    <Getal label="Levensduur" suffix="jaar" min={1} max={100} veld={veld('levensduurJaren')} hint={levensduurHint(soort, af)} value={a.levensduurJaren} onChange={(v) => pasLevensduur((x) => void (x.levensduurJaren = v ?? 1))} />
  )
  const boekwaardeVeld = (
    <Bedrag
      label={`Fiscale boekwaarde op 1 januari ${jaar}`}
      veld={veld('boekwaardeBegin')}
      hint={`De boekwaarde eind ${jaar - 1} uit je aangifte of jaarrekening van ${jaar - 1}. Leeg: we rekenen hem uit vanaf de aanschafdatum.`}
      value={a.boekwaardeBegin}
      onChange={(v) => pasA((x) => void (v === undefined ? delete x.boekwaardeBegin : (x.boekwaardeBegin = v)))}
    />
  )
  const vamilPct = params?.ondernemer.waarde.vamil.pct
  const desinvJaren = params?.ondernemer.waarde.desinvestering.jaren
  const onderGrens = af !== undefined && a.aanschafwaarde > 0 && a.aanschafwaarde < af.directAftrekbaarTot

  const methodes: Array<{ value: Methode; label: string; beschrijving: string }> = [
    { value: 'lineair', label: 'Lineair', beschrijving: 'Elk jaar hetzelfde bedrag' },
    { value: 'direct', label: 'Direct', beschrijving: grens ? `Onder ${grens} in één keer` : 'Kleine bedrijfsmiddelen' },
    { value: 'willekeurig-starter', label: 'Willekeurig', beschrijving: 'Voor starters' },
    { value: 'vamil', label: 'VAMIL', beschrijving: 'Milieubedrijfsmiddel' },
  ]

  const meldingen: ReactNode[] = []
  if (a.restwaarde > a.aanschafwaarde && a.aanschafwaarde > 0) meldingen.push(<Alert key="rest" variant="let-op">De restwaarde is hoger dan de aanschafwaarde. Dan valt er niets af te schrijven.</Alert>)
  if (a.methode === 'direct' && af && a.aanschafwaarde >= af.directAftrekbaarTot) {
    meldingen.push(
      <Alert key="direct" variant="let-op">
        Direct afschrijven mag alleen bij een aanschafwaarde onder {grens}. Kies lineair, of willekeurig als je starter bent.
      </Alert>,
    )
  }
  if (onderGrens && a.methode === 'lineair') meldingen.push(<p key="grens" className="text-xs text-gray-600">Onder {grens} schrijven we het hele bedrag af in het jaar van aanschaf.</p>)
  if (soort === 'gebouw' && !a.woz) meldingen.push(<Alert key="woz" variant="let-op">Vul de WOZ-waarde in. Zonder WOZ-waarde kunnen we niet toetsen tot welke bodemwaarde je mag afschrijven.</Alert>)

  return (
    <div className="space-y-4">
      <Herkomst a={a} jaar={jaar} />
      <Rij>
        <Tekst label="Omschrijving" verplicht veld={veld('omschrijving')} value={a.omschrijving} placeholder="Bijvoorbeeld: laptop" onChange={(v) => pasA((x) => void (x.omschrijving = v))} />
        <Datum label="Aanschafdatum" verplicht veld={veld('aanschafdatum')} value={a.aanschafdatum} onChange={(v) => pasA((x) => void (x.aanschafdatum = v ?? ''))} />
        <Bedrag label="Aanschafwaarde (exclusief btw)" veld={veld('aanschafwaarde')} value={a.aanschafwaarde} onChange={(v) => pasA((x) => void (x.aanschafwaarde = v ?? 0))} />
        <Gemarkeerd aan={bevestigen}>{restwaardeVeld}</Gemarkeerd>
        <Gemarkeerd aan={bevestigen}>{levensduurVeld}</Gemarkeerd>
        {Number.isFinite(aanschafjaar) && aanschafjaar < jaar && <Gemarkeerd aan={zonderBoekwaarde}>{boekwaardeVeld}</Gemarkeerd>}
      </Rij>

      {bevestigen && (
        <Nakijken>
          <p className="text-sm text-amber-900">
            Controleer de levensduur en restwaarde. We namen de snelste afschrijving die fiscaal mag, zonder restwaarde. Gebruik je het langer, zoals een bus of machine van 8 tot 10 jaar,
            vul dan die levensduur in. Anders trek je te veel af.
          </p>
          <Button variant="secundair" grootte="sm" onClick={() => pasA((x) => void (x.bron = 'handmatig'))}>
            Levensduur en restwaarde kloppen
          </Button>
        </Nakijken>
      )}

      {zonderBoekwaarde && (
        <Nakijken>
          <p className="text-sm text-amber-900">
            Vul de fiscale boekwaarde op 1 januari {jaar} in: de boekwaarde eind {jaar - 1} uit je aangifte of jaarrekening van {jaar - 1}.
            {r ? ` Zonder dat bedrag rekenen we met ${formatEuro(r.boekwaardeBegin)}, berekend vanaf de aanschaf alsof je altijd fiscaal zo afschreef.` : ' Zonder dat bedrag rekenen we hem uit vanaf de aanschaf, alsof je altijd fiscaal zo afschreef.'}
          </p>
          {r && (
            <Button variant="secundair" grootte="sm" onClick={() => pasA((x) => void (x.boekwaardeBegin = r.boekwaardeBegin))}>
              {formatEuro(r.boekwaardeBegin)} klopt
            </Button>
          )}
        </Nakijken>
      )}

      {r ? <UitkomstRegel r={r} jaar={jaar} aanschafjaar={aanschafjaar} formule={formule} /> : <p className="text-sm text-gray-600">{afwezigTekst(afwezig, jaar)}</p>}
      {r && !telt && <p className="-mt-2 text-xs text-gray-500">Ter controle: dit telt nu niet mee in je winst.</p>}
      {hir}
      {meldingen}

      {a.investeringsaftrek &&
        (a.investeringsaftrek.genotenPct > 0 ? (
          <p className="text-sm text-gray-600">
            In {a.investeringsaftrek.jaar} kreeg je hierover {REGELING_NAAM[a.investeringsaftrek.regeling]}, {formatPct(a.investeringsaftrek.genotenPct)}.
            {desinvJaren !== undefined && ` Verkoop je het binnen ${desinvJaren} jaar na het begin van ${a.investeringsaftrek.jaar}, dan tel je een deel van de verkoopprijs bij je winst op (desinvesteringsbijtelling).`}
          </p>
        ) : (
          <p className="text-sm text-gray-600">In {a.investeringsaftrek.jaar} kreeg je hierover geen investeringsaftrek, dus bij verkoop volgt geen desinvesteringsbijtelling.</p>
        ))}

      <Disclosure variant="kaal" titel="Soort, methode en verkoop" subtitel="Goodwill of gebouw, direct of willekeurig afschrijven en verkoop" defaultOpen={heeftEigenKeuzes(a)}>
        <div className="space-y-4 pt-2">
          <div data-veld={veld('soort')}>
          <ChipGroup<Soort>
            label="Soort"
            value={soort}
            onChange={(s) =>
              pasA((x) => {
                if (s === 'bedrijfsmiddel') delete x.soort
                else x.soort = s
                if (s !== 'gebouw') delete x.woz
              })
            }
            options={[
              { value: 'bedrijfsmiddel', label: 'Bedrijfsmiddel' },
              { value: 'goodwill', label: 'Goodwill' },
              { value: 'gebouw', label: 'Gebouw' },
            ]}
          />
          </div>
          {soort === 'gebouw' && (
            <Rij>
              <Bedrag
                label="WOZ-waarde"
                veld={veld('woz')}
                hint={af ? `Verder dan ${formatPct(af.bodemwaardeGebouwEigenGebruik)} van de WOZ-waarde mag je een gebouw in eigen gebruik niet afschrijven.` : undefined}
                value={a.woz}
                onChange={(v) => pasA((x) => void (v === undefined ? delete x.woz : (x.woz = v)))}
              />
            </Rij>
          )}
          <div data-veld={veld('methode')}>
          <ChipGroup<Methode>
            label="Methode"
            kolommen={2}
            value={a.methode}
            onChange={(m) =>
              pasA((x) => {
                x.methode = m
                if (m !== 'willekeurig-starter' && m !== 'vamil') delete x.willekeurigBedrag
              })
            }
            options={methodes}
          />
          </div>
          {a.methode === 'willekeurig-starter' && (
            <Rij>
              <Bedrag
                label="Afgeschreven in het aanschafjaar"
                veld={veld('willekeurigBedrag')}
                hint="Leeg is alles in één keer. Willekeurig afschrijven kan alleen als starter met recht op startersaftrek."
                value={a.willekeurigBedrag}
                onChange={(v) => pasA((x) => void (v === undefined ? delete x.willekeurigBedrag : (x.willekeurigBedrag = v)))}
              />
            </Rij>
          )}
          {a.methode === 'vamil' && (
            <Rij>
              <Bedrag
                label="Vrij afgeschreven in het aanschafjaar"
                veld={veld('willekeurigBedrag')}
                hint={`${vamilPct !== undefined ? `Maximaal ${formatPct(vamilPct)} van de aanschafwaarde` : 'Tot het maximum'}, de rest lineair. Leeg is het maximum. Het bedrijfsmiddel moet op de Milieulijst staan.`}
                value={a.willekeurigBedrag}
                onChange={(v) => pasA((x) => void (v === undefined ? delete x.willekeurigBedrag : (x.willekeurigBedrag = v)))}
              />
            </Rij>
          )}
          <div data-veld={veld('verkocht')}>
          <Toggle
            label="Verkocht of uit gebruik genomen"
            description="We schrijven af tot en met de maand van verkoop en rekenen het verschil met de boekwaarde als boekwinst of boekverlies."
            checked={a.verkocht !== undefined}
            onChange={(aan) => pasA((x) => void (aan ? (x.verkocht = { datum: `${jaar}-12-31`, verkoopprijs: 0 }) : delete x.verkocht))}
          />
          </div>
          {a.verkocht && (
            <Rij>
              <Datum label="Verkoopdatum" verplicht veld={veld('verkocht.datum')} value={a.verkocht.datum} onChange={(v) => pasA((x) => void (x.verkocht && (x.verkocht.datum = v ?? '')))} />
              <Bedrag label="Verkoopprijs (exclusief btw)" veld={veld('verkocht.verkoopprijs')} value={a.verkocht.verkoopprijs} onChange={(v) => pasA((x) => void (x.verkocht && (x.verkocht.verkoopprijs = v ?? 0)))} />
            </Rij>
          )}
        </div>
      </Disclosure>
    </div>
  )
}

export function ActivaInvoer({ onderneming: o, pas, jaar, params, uitkomst, veldVoor }: ActivaInvoerProps) {
  const af = params?.ondernemer.waarde.afschrijving
  const activa = o.activa ?? []
  const gekoppeld = koppelAfschrijvingen(activa, uitkomst?.afschrijvingen)
  const formules = koppelFormules(activa, uitkomst?.afschrijvingen, uitkomst?.uitleg)
  const dubbel = dubbeleActiva(activa)
  const telt = registerTeltMee(o)
  const volledig = o.activaVolledig === true
  const fiscaal = gekoppeld.reduce((s, r) => s + (r?.afschrijving ?? 0), 0)
  const geboekt = geboekteAfschrijving(o.winstberekening)
  const uitgesloten = o.doorrolUitgesloten?.length ?? 0
  // Meldingen van de engine over de afschrijving. Die over het saldo zonder afschrijving staat al bovenaan en die
  // over een gebouw zonder WOZ-waarde bij het bedrijfsmiddel zelf. De hint over een herinvesteringsreserve staat als
  // schakelaar bij het verkochte middel (ronde 2, A6).
  const meldingen = (uitkomst?.waarschuwingen ?? []).filter(
    (w) => w.id.includes('.afschrijving') && !w.id.endsWith('.afschrijving.saldo') && !w.id.endsWith('.gebouwZonderWoz') && !w.id.endsWith('.afschrijving.hir'),
  )
  const naam = (a: ActiefInvoer, i: number) => a.omschrijving.trim() || `Bedrijfsmiddel ${i + 1}`

  return (
    <div>
      <Subkop>Bedrijfsmiddelen</Subkop>
      <p className="mb-3 text-xs leading-relaxed text-gray-500">
        Wat je langer dan een jaar gebruikt{af ? ` en ${formatEuro(af.directAftrekbaarTot)} of meer kost` : ''}, schrijf je af over een aantal jaren. Vul het hier in, dan rekenen we per bedrijfsmiddel de
        fiscale afschrijving en de boekwaarde.
      </p>

      {activa.length > 0 && (
        <div data-veld={veldVoor?.('activaVolledig')} className="mb-3">
        <Toggle
          label="Al mijn bedrijfsmiddelen staan in dit register"
          description={
            volledig
              ? `De fiscale afschrijving van deze bedrijfsmiddelen vervangt de afschrijving uit je boekhouding${o.winstberekening.soort === 'saldo' ? ': we corrigeren het saldo met het verschil' : ''}. Mist er iets, zoals een auto van de zaak of een ouder bedrijfsmiddel, zet dit dan uit. Anders valt de afschrijving daarop weg.`
              : 'Nu rekenen we met de afschrijving uit je boekhouding en is dit register een controle. Zet dit aan als echt alles erin staat, ook een auto van de zaak en oudere bedrijfsmiddelen. Dan vervangt de fiscale afschrijving de geboekte.'
          }
          checked={volledig}
          onChange={(aan) => pas((x) => void (x.activaVolledig = aan))}
        />
        </div>
      )}
      {activa.length > 0 && volledig && o.winstberekening.soort === 'saldo' && !telt && (
        <Alert variant="info" className="mb-3">
          Vul bij de winstberekening in hoeveel afschrijving er in het saldo zit. Dan vervangen we die door de fiscale afschrijving van deze bedrijfsmiddelen. Zonder dat bedrag tellen ze niet mee.
        </Alert>
      )}
      {dubbel.length > 0 && (
        <Alert variant="let-op" className="mb-3">
          {dubbel.map(([i, j]) => `${naam(activa[i], i)} en ${naam(activa[j], j)}`).join(', ')} lijken hetzelfde bedrijfsmiddel. Staat het er twee keer in, verwijder er dan een; anders schrijven we het
          dubbel af.
        </Alert>
      )}

      <Lijst<ActiefInvoer>
        items={o.activa}
        onChange={(l) => pas((x) => zetActiva(x, l))}
        nieuw={() => nieuwActief(jaar, params)}
        titel={(a, i) => naam(a, i)}
        toevoegLabel="Bedrijfsmiddel toevoegen"
      >
        {(a, pasA, i) => (
          <ActiefVelden
            a={a}
            pasA={pasA}
            jaar={jaar}
            af={af}
            params={params}
            r={gekoppeld[i]}
            formule={gekoppeld[i] ? formules[i] : undefined}
            afwezig={waaromAfwezig(a, jaar, o.winstberekening)}
            telt={telt}
            veld={(pad) => veldVoor?.(`activa:${i}/${pad}`)}
            hir={
              <HirReserveren
                onderneming={o}
                actief={a}
                r={gekoppeld[i]}
                jaar={jaar}
                params={params}
                pas={pas}
                index={i}
                veld={veldVoor?.(`activa:${i}/herinvesteringsreserve`)}
                uitkomst={uitkomst?.herinvesteringsreserves}
              />
            }
          />
        )}
      </Lijst>

      {telt && gekoppeld.some(Boolean) && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
          <p className="flex justify-between gap-3 font-medium text-gray-900">
            <span>Fiscale afschrijving {jaar}</span>
            <span className="tabular-nums">{formatEuro(fiscaal)}</span>
          </p>
          {geboekt !== undefined && geboekt !== fiscaal && (
            <p className="mt-1 text-gray-600">
              In je boekhouding staat {formatEuro(geboekt)}. Met de fiscale afschrijving wordt je winst {formatEuro(Math.abs(geboekt - fiscaal))} {geboekt > fiscaal ? 'hoger' : 'lager'}.
            </p>
          )}
        </div>
      )}
      {meldingen.length > 0 && <WaarschuwingLijst waarschuwingen={meldingen} className="mt-3" />}
      {uitgesloten > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {uitgesloten === 1 ? 'Eén bedrijfsmiddel uit een eerder jaar heb je hier verwijderd.' : `${uitgesloten} bedrijfsmiddelen uit een eerder jaar heb je hier verwijderd.`} Bij opnieuw overnemen
          zetten we {uitgesloten === 1 ? 'het' : 'ze'} niet terug.{' '}
          <button
            type="button"
            onClick={() => pas((x) => void delete x.doorrolUitgesloten)}
            className="font-medium text-primary underline transition-colors hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Uitsluiting opheffen
          </button>{' '}
          Daarna {uitgesloten === 1 ? 'komt het' : 'komen ze'} terug zodra je de saldi uit het vorige jaar opnieuw overneemt.
        </p>
      )}
      {activa.length > 0 && uitkomst === null && <p className="mt-3 text-xs text-gray-500">De afschrijving is nu niet te berekenen. Controleer de datums en bedragen van de bedrijfsmiddelen.</p>}
    </div>
  )
}
