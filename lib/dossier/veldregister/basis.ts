/**
 * Ronde 2 (A3): het veldregister van de basissecties (één eigenaar per veld, ontwerp-ronde2.md 6.4).
 *
 * Velden van HuishoudenSectie (huishouden, personen, kinderen), JaarrekeningInvoer, LoonSectie, PensioenSectie (zonder
 * de stakingslijfrente), PgaSectie en VerdelingSectie, en van de onderneming alleen `naam` en `winstberekening.saldo`.
 * De rest van de onderneming registreert A6, woning, box 2 en aanslag A2, vermogen A5.
 *
 * `sectie` is het anker op de jaarpagina; '{persoon}' wordt de persoon van het veld ('ondernemingen-{persoon}' wordt
 * 'ondernemingen-A'). De veld-id's zijn gelijk aan de `veld`-props in de secties (zie lib/dossier/veld.ts).
 */
import type { BalansPost, WvRubriek } from '@/lib/tax/types'
import { BALANS_POST_INFO, BALANS_POSTEN, WV_RUBRIEKEN, WV_RUBRIEK_INFO } from '../jaarrekening'
import type { VeldregisterItem } from './types'

const HUISHOUDEN = { sectie: 'huishouden', sectieNaam: 'Huishouden' }
const ONDERNEMINGEN = { sectie: 'ondernemingen-{persoon}', sectieNaam: 'Ondernemingen' }
const LOON = { sectie: 'loon-{persoon}', sectieNaam: 'Loon en uitkeringen' }
const PENSIOEN = { sectie: 'pensioen-{persoon}', sectieNaam: 'Pensioen en AOV' }
const PGA = { sectie: 'pga', sectieNaam: 'Persoonsgebonden aftrek' }
const VERDELING = { sectie: 'verdeling', sectieNaam: 'Verdeling tussen partners' }

const ONDERNEMING = 'persoon:*/onderneming:*'
const JAARREKENING = `${ONDERNEMING}/jaarrekening`

const kleine = (s: string) => s.charAt(0).toLocaleLowerCase('nl-NL') + s.slice(1)

const huishouden: VeldregisterItem[] = [
  { patroon: 'huishouden/fiscaalPartner', label: 'Fiscaal partner het hele jaar', ...HUISHOUDEN, synoniemen: ['partner', 'getrouwd', 'samenwonen', 'fiscaal partnerschap', 'geregistreerd partner'] },
  { patroon: 'persoon:*/naam', label: 'Naam of roepnaam', ...HUISHOUDEN, synoniemen: ['naam'] },
  { patroon: 'persoon:*/geboortedatum', label: 'Geboortedatum', ...HUISHOUDEN, synoniemen: ['leeftijd', 'aow', 'aow-leeftijd', 'geboren'] },
  { patroon: 'kind:*/naam', label: 'Naam van het kind', ...HUISHOUDEN, synoniemen: ['kinderen'] },
  { patroon: 'kind:*/geboortedatum', label: 'Geboortedatum van het kind', ...HUISHOUDEN, synoniemen: ['kinderen', 'kind', 'iack', 'combinatiekorting'] },
  { patroon: 'kind:*/inHuishoudenVanaf', label: 'Kind in het huishouden vanaf', ...HUISHOUDEN, synoniemen: ['kinderen', 'pleegkind'] },
  { patroon: 'kind:*/coOuderschap.dagenInHuishouden', label: 'Co-ouderschap: dagen per jaar in jullie huishouden', ...HUISHOUDEN, synoniemen: ['co-ouderschap', 'coouderschap', 'gescheiden'] },
  { patroon: 'kind:*/opvang:*/soort', label: 'Soort kinderopvang', ...HUISHOUDEN, synoniemen: ['kinderopvang', 'kinderopvangtoeslag', 'dagopvang', 'bso', 'gastouder'] },
  { patroon: 'kind:*/opvang:*/urenPerMaand', label: 'Kinderopvang: uren per maand', ...HUISHOUDEN, synoniemen: ['kinderopvang', 'kinderopvangtoeslag'] },
  { patroon: 'kind:*/opvang:*/uurtarief', label: 'Kinderopvang: uurtarief', ...HUISHOUDEN, synoniemen: ['kinderopvang', 'kinderopvangtoeslag'] },
  { patroon: 'kind:*/opvang:*/maanden', label: 'Kinderopvang: aantal maanden', ...HUISHOUDEN, synoniemen: ['kinderopvang'] },
  { patroon: 'kind:*/opvang:*/startdatum', label: 'Kinderopvang: startdatum', ...HUISHOUDEN, synoniemen: ['kinderopvang'] },
]

const onderneming: VeldregisterItem[] = [
  { patroon: `${ONDERNEMING}/naam`, label: 'Naam van de onderneming', ...ONDERNEMINGEN, synoniemen: ['onderneming', 'bedrijf', 'eenmanszaak', 'zaak', 'handelsnaam'] },
  {
    patroon: `${ONDERNEMING}/winstberekening.saldo`,
    label: 'Saldo fiscale winstberekening',
    ...ONDERNEMINGEN,
    synoniemen: ['winst', 'resultaat', 'saldo', 'winst uit onderneming', 'fiscale winst'],
  },
]

const balans: VeldregisterItem[] = (['begin', 'eind'] as const).flatMap((peildatum) =>
  BALANS_POSTEN.map(
    (post: BalansPost): VeldregisterItem => ({
      patroon: `${JAARREKENING}.${peildatum}.${post}`,
      label: `${BALANS_POST_INFO[post].label}, ${peildatum === 'begin' ? 'begin van het jaar' : 'eind van het jaar'}`,
      ...ONDERNEMINGEN,
      synoniemen: ['balans', peildatum === 'begin' ? 'beginbalans' : 'eindbalans', 'jaarrekening', kleine(BALANS_POST_INFO[post].groep)],
    }),
  ),
)

const winstEnVerlies: VeldregisterItem[] = WV_RUBRIEKEN.map(
  (r: WvRubriek): VeldregisterItem => ({
    patroon: `${JAARREKENING}.winstEnVerlies.${r}`,
    label: WV_RUBRIEK_INFO[r].label,
    ...ONDERNEMINGEN,
    synoniemen: ['winst-en-verliesrekening', 'winst en verlies', 'jaarrekening', 'rubriek'],
  }),
)

const jaarrekening: VeldregisterItem[] = [
  { patroon: `${JAARREKENING}.omschrijvingActiviteiten`, label: 'Omschrijving van de activiteiten', ...ONDERNEMINGEN, synoniemen: ['activiteiten', 'jaarrekening'] },
  ...balans,
  { patroon: `${JAARREKENING}.mva.aanschafwaarde`, label: 'Materiële vaste activa: aanschafwaarde', ...ONDERNEMINGEN, synoniemen: ['jaarrekening', 'bedrijfsmiddelen'] },
  { patroon: `${JAARREKENING}.mva.restwaarde`, label: 'Materiële vaste activa: restwaarde', ...ONDERNEMINGEN, synoniemen: ['jaarrekening', 'bedrijfsmiddelen'] },
  { patroon: `${JAARREKENING}.specificaties:*/omschrijving`, label: 'Specificatie van een balanspost', ...ONDERNEMINGEN, synoniemen: ['specificatie', 'borg', 'vooruitbetaald'] },
  { patroon: `${JAARREKENING}.onttrekkingen:*/bedrag`, label: 'Privé-onttrekking', ...ONDERNEMINGEN, synoniemen: ['privé-opname', 'opname', 'onttrekking', 'privé', 'kapitaalsvergelijking'] },
  { patroon: `${JAARREKENING}.stortingen:*/bedrag`, label: 'Privéstorting', ...ONDERNEMINGEN, synoniemen: ['storting', 'privé', 'kapitaalsvergelijking'] },
  ...winstEnVerlies,
]

const loon: VeldregisterItem[] = [
  { patroon: 'persoon:*/loon:*/omschrijving', label: 'Omschrijving van loon of uitkering', ...LOON, synoniemen: ['werkgever', 'loondienst', 'uitkering', 'baan'] },
  { patroon: 'persoon:*/loon:*/soort', label: 'Soort loon of uitkering', ...LOON, synoniemen: ['uwv', 'pensioen', 'aow', 'zwangerschapsuitkering'] },
  { patroon: 'persoon:*/loon:*/bruto', label: 'Bruto (fiscaal loon)', ...LOON, synoniemen: ['salaris', 'loon', 'jaaropgave', 'fiscaal loon'] },
  { patroon: 'persoon:*/loon:*/ingehoudenLoonheffing', label: 'Ingehouden loonheffing', ...LOON, synoniemen: ['loonheffing', 'loonbelasting', 'jaaropgave'] },
  { patroon: 'persoon:*/loon:*/zvwBijdrageloon', label: 'Bijdrageloon Zvw', ...LOON, synoniemen: ['zvw', 'zorgverzekeringswet', 'jaaropgave'] },
  { patroon: 'persoon:*/resultaatOverigWerk', label: 'Resultaat uit overige werkzaamheden', ...LOON, synoniemen: ['freelance', 'bijverdienste', 'overige werkzaamheden', 'row'] },
  { patroon: 'persoon:*/periodiekeUitkeringen', label: 'Periodieke uitkeringen', ...LOON, synoniemen: ['alimentatie', 'uitkering'] },
]

const IV = 'persoon:*/inkomensvoorziening'
const pensioen: VeldregisterItem[] = [
  { patroon: `${IV}.lijfrentePremies`, label: 'Lijfrentepremies', ...PENSIOEN, synoniemen: ['lijfrente', 'pensioen', 'jaarruimte', 'reserveringsruimte', 'pensioenopbouw'] },
  { patroon: `${IV}.aovPremies`, label: 'Premies AOV', ...PENSIOEN, synoniemen: ['aov', 'arbeidsongeschiktheidsverzekering', 'arbeidsongeschikt'] },
  { patroon: `${IV}.forOmzetting`, label: 'Premie voor omzetting van de FOR', ...PENSIOEN, synoniemen: ['oudedagsreserve', 'for', 'omzetten'] },
  { patroon: `${IV}.premiegrondslagInkomenVorigJaar`, label: 'Premiegrondslag-inkomen vorig jaar', ...PENSIOEN, synoniemen: ['jaarruimte', 'premiegrondslag'] },
  { patroon: `${IV}.forToenameVorigJaar`, label: 'Toename FOR vorig jaar', ...PENSIOEN, synoniemen: ['jaarruimte', 'oudedagsreserve', 'for'] },
  { patroon: `${IV}.pensioencorrectieVorigJaar.bedrag`, label: 'Pensioenopbouw vorig jaar (factor A of premie)', ...PENSIOEN, synoniemen: ['factor a', 'upo', 'pensioenaangroei'] },
  { patroon: 'persoon:*/lijfrentehistorie:*/premiegrondslagInkomen', label: 'Historie jaarruimte: inkomen jaar ervoor', ...PENSIOEN, synoniemen: ['historie', 'reserveringsruimte', 'jaarruimte'] },
  { patroon: 'persoon:*/lijfrentehistorie:*/alGebruikt', label: 'Historie jaarruimte: al gebruikt', ...PENSIOEN, synoniemen: ['historie', 'reserveringsruimte'] },
  { patroon: 'persoon:*/lijfrentehistorie:*/jaarruimteOverride', label: 'Historie jaarruimte: jaarruimte uit rapport', ...PENSIOEN, synoniemen: ['historie', 'reserveringsruimte'] },
  { patroon: 'persoon:*/lijfrentehistorie:*/forToenameVorigJaar', label: 'Historie jaarruimte: toename FOR jaar ervoor', ...PENSIOEN, synoniemen: ['historie'] },
]

const pga: VeldregisterItem[] = [
  { patroon: 'pga/giftenGewoon', label: 'Gewone giften', ...PGA, synoniemen: ['gift', 'giften', 'anbi', 'goede doelen', 'donatie'] },
  { patroon: 'pga/giftenPeriodiek', label: 'Periodieke giften', ...PGA, synoniemen: ['gift', 'giften', 'anbi', 'periodiek'] },
  { patroon: 'pga/giftenCultureel', label: 'Giften aan culturele instellingen', ...PGA, synoniemen: ['gift', 'cultureel', 'multiplier'] },
  { patroon: 'pga/specifiekeZorgkosten', label: 'Specifieke zorgkosten', ...PGA, synoniemen: ['zorgkosten', 'medische kosten', 'ziektekosten'] },
]

const verdeling: VeldregisterItem[] = [
  { patroon: 'verdeling/keuze', label: 'Verdeling: optimaal of zelf kiezen', ...VERDELING, synoniemen: ['verdelen', 'verdeling', 'partner'] },
  { patroon: 'verdeling/eigenWoning', label: 'Verdeling eigen woning', ...VERDELING, synoniemen: ['verdelen', 'partner'] },
  { patroon: 'verdeling/box3', label: 'Verdeling box 3', ...VERDELING, synoniemen: ['verdelen', 'partner', 'vermogen'] },
  { patroon: 'verdeling/pga', label: 'Verdeling persoonsgebonden aftrek', ...VERDELING, synoniemen: ['verdelen', 'partner', 'giften'] },
  { patroon: 'verdeling/box2', label: 'Verdeling box 2', ...VERDELING, synoniemen: ['verdelen', 'partner'] },
  { patroon: 'verdeling/dividendbelasting', label: 'Verdeling dividendbelasting', ...VERDELING, synoniemen: ['verdelen', 'partner'] },
]

export const BASIS_VELDEN: VeldregisterItem[] = [...huishouden, ...onderneming, ...jaarrekening, ...loon, ...pensioen, ...pga, ...verdeling]
