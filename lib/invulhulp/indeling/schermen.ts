/**
 * Ronde 2 (A1): de schermen van de online aangifte IB als data, in de volgorde van het programma en met zijn woorden
 * (ronde2/belastingdienst-volgorde.md hoofdstuk 2; OLA-id's als `olaId` waar het programma ze heeft).
 *
 * Eén opbouw voor alle aangiftejaren; wat per jaar verschilt, geeft het jaarbestand mee (`SchermOpties`) of staat in
 * de params (bijvoorbeeld of het werkelijk rendement in de aangifte zit: `box3.tegenbewijs.kanaal`). Labels gebruiken
 * plaatshouders (<persoon>, <partner>, [jaar], {uren}; zie waarden.ts `vulLabel`), zodat er geen jaartal of grens vast
 * in staat.
 *
 * Wat de tool niet weet (BSN, IBAN, kenteken, namen van tegenpartijen, vragen die alleen een uitzondering raken), staat
 * er bewust niet in. Bedragen die een andere agent rekent, worden defensief gelezen: ontbreekt de uitkomst, dan een
 * zinnige terugval met een hint.
 */
import type { BronbelastingRegel, OndernemingInvoer, PersoonInvoer, VermogensPositie } from '@/lib/tax/types'
import { itemSleutel } from '@/lib/dossier/ids'
import { veldVan } from '@/lib/dossier/veld'
import { bronbelastingRegels, landCode } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { investeringsbedrag } from '@/lib/tax/modules/onderneming/investeringsaftrek'
import { balansTotalen, rubriek as wvRubriek, standIngevuld } from '@/lib/rapport/afleiden'
import { formatEuro, formatPct } from '@/components/ui/format'
import { datumNL as datumTekst } from '@/lib/tax/uitleg'
import { plusDagen } from '@/lib/tax/modules/planning/belastingrente'
import type { InvulhulpContext, InvulhulpItem, RubriekDefinitie, SchermDefinitie, VeldDefinitie, VeldSoort, VeldWaarde, ViaInfo } from '../types'
import {
  antwoord,
  bedrag,
  datumNL,
  grensBezittingen,
  heeftPartner,
  heleEuro,
  herkomst,
  jaNee,
  kolommen,
  ondernemingResultaatVan,
  ondernemingVan,
  ondernemingVeld,
  persoonNaam,
  persoonResultaatVan,
  persoonVan,
  persoonVeld,
  som,
  tekst,
  verdeelEuro,
  verdelingVan,
} from '../waarden'

/** Wat per aangiftejaar verschilt en niet uit de params komt. */
export interface SchermOpties {
  /** Klassen van "Jaar waarin deze lening is afgesloten", zoals het programma ze toont. */
  leningjaarKlassen: Array<{ label: string; van: number | null; tot: number | null }>
  /** Kop van het selectiescherm bezittingen: "<aangever> en <partner>", of met "en uw minderjarige kinderen". */
  bezittingenKop: string
  /** Het programma vraagt per kind of het minstens 6 maanden bij het huishouden hoorde (vanaf de aangifte 2026, verwacht). */
  kinderenHuishoudenVragen: boolean
  /** "Kinderen geboren na [jaar − N]": de N van het programma (19 in 2024 en 2025). */
  kinderenJarenTerug: number
}

// ---------------------------------------------------------------------------
// Bouwstenen
// ---------------------------------------------------------------------------

type Waarde = (ctx: InvulhulpContext) => VeldWaarde
type Extra = Partial<Omit<VeldDefinitie, 'id' | 'label' | 'soort' | 'waarde'>>

const veld = (soort: VeldSoort, id: string, label: string, waarde: Waarde, extra: Extra = {}): VeldDefinitie => ({ id, label, soort, waarde, ...extra })
/** Zelf invullen. */
const Z = (id: string, label: string, waarde: Waarde, extra?: Extra) => veld('Z', id, label, waarde, extra)
/** Keuzevraag. */
const K = (id: string, label: string, waarde: Waarde, extra?: Extra) => veld('K', id, label, waarde, extra)
/** Berekent het programma; alleen ter controle. */
const B = (id: string, label: string, waarde: Waarde, extra?: Extra) => veld('B', id, label, waarde, extra)
/** Vooraf ingevuld: controleren. Altijd zichtbaar (een 0 tegenover een vooraf ingevuld bedrag is juist interessant). */
const V = (id: string, label: string, waarde: Waarde, via: ViaInfo, extra?: Extra) => veld('V', id, label, waarde, { via, altijd: true, ...extra })

const AANVINKEN = antwoord('Aanvinken')

const VIA = {
  brp: { bron: 'Basisregistratie Personen', zeker: true },
  werkgever: { bron: 'je werkgever (loonaangifte)', zeker: true },
  uitkering: { bron: 'je uitkeringsinstantie of pensioenuitvoerder', zeker: true },
  gemeente: { bron: 'je gemeente (WOZ)', zeker: true },
  bank: { bron: 'je bank', zeker: true },
  belegging: { bron: 'je bank of broker, alleen bij een Nederlandse instelling', zeker: false },
  dividend: { bron: 'je bank of broker', zeker: true },
  hypotheek: { bron: 'je hypotheekverstrekker', zeker: true },
  schuld: { bron: 'je kredietverstrekker', zeker: false },
  lijfrente: { bron: 'je verzekeraar of bank', zeker: false },
  belastingdienst: { bron: 'de Belastingdienst', zeker: true },
} satisfies Record<string, ViaInfo>

/** Maakt een veilige sleutel voor een item (alleen [A-Za-z0-9._-]); de vaste id's voldoen daar al aan. */
const sleutelVan = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_') || '_'

function herhaalItems<T>(
  ctx: InvulhulpContext,
  lijst: readonly T[] | undefined,
  soort: InvulhulpItem['soort'],
  filter: (x: T, i: number) => boolean,
  id: (x: T, i: number) => string,
  titel: (x: T, i: number) => string,
  ouderId?: (x: T, i: number) => string,
): Array<{ sleutel: string; titel: string; ctx: InvulhulpContext }> {
  const uit: Array<{ sleutel: string; titel: string; ctx: InvulhulpContext }> = []
  ;(lijst ?? []).forEach((x, i) => {
    if (!filter(x, i)) return
    const itemId = id(x, i)
    const item: InvulhulpItem = { soort, id: itemId, index: i, ...(ouderId ? { ouderId: ouderId(x, i) } : {}) }
    uit.push({ sleutel: sleutelVan(itemId), titel: titel(x, i), ctx: { ...ctx, item } })
  })
  return uit
}

// Lezers bij de context
const p = (c: InvulhulpContext): PersoonInvoer | undefined => persoonVan(c)
const pr = persoonResultaatVan
const o = (c: InvulhulpContext): OndernemingInvoer | undefined => ondernemingVan(c)
const or = ondernemingResultaatVan

/**
 * Integratie ronde 2: de bijtelling voor privégebruik van de auto, ook als die al in het saldo zit (winstberekening als
 * één saldo; `bijtellingAuto` is dan 0 omdat de engine hem niet nog eens optelt). Het programma vraagt hem toch op het
 * scherm Privéonttrekkingen.
 */
const bijtellingPrive = (c: InvulhulpContext): number => {
  const r = or(c)
  if ((r?.bijtellingAuto ?? 0) > 0) return r!.bijtellingAuto
  return r?.auto?.bijtellingInSaldo ? Math.max(0, r.auto.bijtelling ?? 0) : 0
}
const jr = (c: InvulhulpContext) => o(c)?.jaarrekening
const loonItem = (c: InvulhulpContext) => (c.item ? p(c)?.loon[c.item.index] : undefined)
const positieItem = (c: InvulhulpContext): VermogensPositie | undefined => (c.item ? c.invoer.box3.posities[c.item.index] : undefined)
const schuldItem = (c: InvulhulpContext) => (c.item ? c.invoer.box3.schulden[c.item.index] : undefined)
const leningdeelItem = (c: InvulhulpContext) => (c.item ? c.invoer.eigenWoning?.leningdelen?.[c.item.index] : undefined)
const investeringItem = (c: InvulhulpContext) => (c.item ? o(c)?.investeringen?.[c.item.index] : undefined)
const box2Item = (c: InvulhulpContext) => (c.item ? c.invoer.box2?.[c.item.index] : undefined)
function regelItem(c: InvulhulpContext): { positie: VermogensPositie; regel: BronbelastingRegel } | undefined {
  if (!c.item?.ouderId) return undefined
  const positie = c.invoer.box3.posities.find((x) => x.id === c.item?.ouderId)
  const regel = positie ? bronbelastingRegels(positie)[c.item.index] : undefined
  return positie && regel ? { positie, regel } : undefined
}

const ondernemingNaam = (c: InvulhulpContext) => o(c)?.naam?.trim() || 'je onderneming'
const isBank = (x: VermogensPositie) => x.categorie === 'bankNL' || x.categorie === 'bankBuitenland'
const isBelegging = (x: VermogensPositie) => x.categorie === 'beleggingen' || x.categorie === 'groen'
const isOverig = (x: VermogensPositie) => x.categorie === 'contant' || x.categorie === 'overig' || x.categorie === 'onroerend' || x.categorie === 'nettolijfrente'
const posities = (c: InvulhulpContext, f: (x: VermogensPositie) => boolean) => c.invoer.box3.posities.filter(f)
/** Werkelijk rendement in de aangifte zelf (params) en gekozen (invoer). */
const metWerkelijkRendement = (c: InvulhulpContext) => c.params.box3.waarde.tegenbewijs.kanaal === 'aangifte' && Boolean(c.invoer.box3.tegenbewijs)
const kiaInvesteringen = (x: OndernemingInvoer | undefined) => (x?.investeringen ?? []).filter((i) => ((i.regeling ?? 'kia') === 'kia' || i.regeling === 'eia') && !i.uitgesloten)
/** Investeringsbedrag voor de KIA: na afboeking van een herinvesteringsreserve, tenzij over het volle bedrag (taak-A1 #11). */
const kiaBedrag = (i: NonNullable<OndernemingInvoer['investeringen']>[number]) =>
  Math.max(0, investeringsbedrag(i) - (i.herinvesteringsreserve && !i.herinvesteringsreserve.kiaOverVolBedrag ? i.herinvesteringsreserve.afboeking : 0))

// Winst-en-verliesrekening: bedragen per regel uit de rubrieken van de jaarrekening of uit de uitgesplitste winst.
type WvRegel = 'omzet' | 'onderhandenWerk' | 'inkoop' | 'personeel' | 'afschrijvingen' | 'auto' | 'huisvesting' | 'verkoop' | 'andere' | 'baten' | 'lasten'

function heeftWvRubrieken(c: InvulhulpContext): boolean {
  const x = o(c)
  return Boolean(x && ((x.jaarrekening?.winstEnVerlies?.length ?? 0) > 0 || x.winstberekening.soort === 'uitgesplitst'))
}

/**
 * Btw-correctie privégebruik auto die niet in de autokosten zit (`btw.inAutokosten` false): de engine trekt hem van de
 * winst af en telt hem mee in het plafond van de bijtelling. In het programma is hij een autokost, dus hoort hij bij de
 * auto- en transportkosten en bij "Kosten voor deze auto" (review ronde 2, bevinding 4).
 */
const btwBuitenAutokosten = (c: InvulhulpContext): number => Math.max(0, or(c)?.auto?.btwCorrectieAfgetrokken ?? 0)

function wv(c: InvulhulpContext, regel: WvRegel): number | null {
  const basis = wvUitInvoer(c, regel)
  const btw = btwBuitenAutokosten(c)
  return regel === 'auto' && btw > 0 && heeftWvRubrieken(c) ? (basis ?? 0) + btw : basis
}

function wvUitInvoer(c: InvulhulpContext, regel: WvRegel): number | null {
  const x = o(c)
  if (!x) return null
  const j = x.jaarrekening
  if (j?.winstEnVerlies && j.winstEnVerlies.length > 0) {
    const r = (n: Parameters<typeof wvRubriek>[1]) => wvRubriek(j, n)
    if (regel === 'andere') return som([r('kantoor'), r('overig'), r('beperktAftrekbaar')], (v) => v)
    if (regel === 'baten') return r('financieleBaten') ?? null
    if (regel === 'lasten') return r('financieleLasten') ?? null
    return r(regel) ?? null
  }
  const w = x.winstberekening
  if (w.soort !== 'uitgesplitst') return null
  const fin = w.financieleBatenLasten ?? 0
  switch (regel) {
    case 'omzet':
      return w.omzet
    case 'onderhandenWerk':
      return w.wijzigingOnderhandenWerk ?? null
    case 'afschrijvingen': {
      const register = or(c)?.activaregisterTeltMee ? som(or(c)?.afschrijvingen, (a) => a.afschrijving) : null
      return register ?? w.afschrijvingen ?? null
    }
    case 'auto':
      return (x.auto?.autokosten ?? 0) + (x.kmAftrekAlInSaldo ? 0 : (or(c)?.kilometeraftrek ?? 0)) || null
    case 'andere':
      return w.kosten + (x.beperktAftrekbaar ?? 0)
    case 'baten':
      return fin > 0 ? fin : null
    case 'lasten':
      return fin < 0 ? -fin : null
    default:
      return null
  }
}

/** Boekwinst (positief) en boekverlies (negatief) op activa uit het register, alleen als het register meetelt. */
function boekresultaat(c: InvulhulpContext, teken: 1 | -1): number | null {
  const r = or(c)
  if (!r?.activaregisterTeltMee || !r.afschrijvingen) return null
  return som(
    r.afschrijvingen.filter((a) => a.boekwinst * teken > 0),
    (a) => Math.abs(a.boekwinst),
  )
}

/** Eigen vermogen op de balans: ondernemingsvermogen min oudedagsreserve, herinvesteringsreserve en egalisatiereserve. */
function eigenVermogen(c: InvulhulpContext, wanneer: 'begin' | 'eind'): number | null {
  const stand = jr(c)?.[wanneer]
  if (!standIngevuld(stand)) return null
  const r = or(c)
  const forStand = wanneer === 'begin' ? (stand.oudedagsreserve ?? r?.forStandBegin ?? 0) : (stand.oudedagsreserve ?? r?.forStandEind ?? 0)
  const hir = som(r?.herinvesteringsreserves, (h) => (wanneer === 'begin' ? h.standBegin : h.standEind)) ?? 0
  const egal = som(r?.egalisatiereserves, (e) => (wanneer === 'begin' ? e.standBegin : e.standEind)) ?? 0
  return balansTotalen(stand).ondernemingsvermogen - forStand - hir - egal
}

function gestartDitJaar(c: InvulhulpContext): boolean {
  return o(c)?.startjaar === c.jaar
}

/** Kolommen van de balans: bij Ja op "vermogen gelijk aan 31-12 vorig jaar" alleen het einde (alleen een starter heeft ook een begin). */
const balansKolommen = (c: InvulhulpContext): Array<'begin' | 'eind'> => (gestartDitJaar(c) ? ['begin', 'eind'] : ['eind'])

function balansPost(c: InvulhulpContext, post: 'voorraden' | 'handelsdebiteuren' | 'overigeVorderingen' | 'liquideMiddelen' | 'voorzieningen' | 'langlopendeSchulden' | 'crediteuren' | 'omzetbelasting' | 'overigeKortlopendeSchulden'): VeldWaarde {
  const j = jr(c)
  const k: Partial<Record<'begin' | 'eind', number | undefined>> = {}
  for (const kol of balansKolommen(c)) k[kol] = j?.[kol]?.[post]
  return kolommen(k)
}

function balansHerkomst(c: InvulhulpContext, post: string) {
  return herkomst(`${ondernemingNaam(c)}, balans`, ondernemingVeld(c, `jaarrekening.eind.${post}`))
}

const leningKlasse = (startdatum: string, jaar: number, klassen: SchermOpties['leningjaarKlassen']): string | null => {
  const j = Number(startdatum.slice(0, 4))
  if (!Number.isFinite(j)) return null
  const k = klassen.find((x) => (x.van === null || j >= x.van) && (x.tot === null ? j <= jaar : j <= x.tot))
  return k ? k.label.replace('[jaar]', String(jaar)).replace('[j-1]', String(jaar - 1)) : null
}

/** Klasse van "Aantal uur dat <partner> heeft meegewerkt" uit de staffel van de meewerkaftrek. */
function meewerkKlasse(c: InvulhulpContext, uren: number): string | null {
  const staffel = c.params.ondernemer.waarde.meewerkaftrek.staffel
  for (let i = staffel.length - 1; i >= 0; i--) {
    if (uren >= staffel[i].vanafUren) {
      const volgende = staffel[i + 1]?.vanafUren
      return volgende ? `${staffel[i].vanafUren} tot ${volgende}` : `${staffel[i].vanafUren} of meer`
    }
  }
  return null
}

const meewerkende = (c: InvulhulpContext) => (p(c)?.ondernemingen ?? []).filter((x) => x.meewerkendePartner && x.samenwerkingMetPartner !== 'arbeidsbeloning' && x.samenwerkingMetPartner !== 'vof')

/** Grotendeelscriterium: meer dan de helft van de werktijd in de onderneming (uren uit de invoer; zonder loondienst ja). */
function grotendeels(c: InvulhulpContext): boolean {
  const x = p(c)?.ondernemingen ?? []
  const onderneming = x.reduce((s, y) => s + (y.uren.onderneming ?? 0), 0)
  const loondienst = Math.max(0, ...x.map((y) => y.uren.loondienst ?? 0))
  if (loondienst === 0) return true
  return onderneming / (onderneming + loondienst) > c.params.ondernemer.waarde.urencriterium.grotendeelsPct
}

const tbsVan = (c: InvulhulpContext) => p(c)?.terbeschikkingstellingen ?? []

/**
 * Terbeschikkingstellingen die de engine telt, met de uitkomst per regel (bevinding 8). Zonder fiscale partner rekent de
 * engine niets (uitkomst null); regels in `nietGeteld` (werkruimte die niet voldoet, onderneming weg) tellen niet mee.
 * Ontbreekt de hele opbouw van overig werk, dan defensief alle regels uit de invoer.
 */
function tbsGeteld(c: InvulhulpContext) {
  const lijst = tbsVan(c)
  const detail = pr(c)?.overigWerkDetail
  if (!detail) return lijst.map((t) => ({ t, uit: undefined }))
  const u = detail.terbeschikkingstelling
  if (!u) return []
  const niet = new Set((u.nietGeteld ?? []).map((x) => x.id))
  return lijst.filter((t) => !niet.has(t.id)).map((t) => ({ t, uit: u.regels.find((r) => r.id === t.id) }))
}

/**
 * Inkomsten en aftrekbare kosten zoals het programma ze vraagt, per regel uit de uitkomst: inkomsten = vergoeding plus
 * een boekwinst bij einde of verkoop; kosten = inkomsten min het resultaat (kosten, afschrijving en een boekverlies).
 * Zo is inkomsten min kosten het resultaat van de engine.
 */
function tbsBedragen(c: InvulhulpContext): { inkomsten: number; kosten: number; boekwinst: number } | null {
  const regels = tbsGeteld(c)
  if (regels.length === 0) return null
  let inkomsten = 0
  let kosten = 0
  let boekwinst = 0
  for (const { t, uit } of regels) {
    const bw = uit?.boekwinst ?? 0
    const ink = t.vergoeding + Math.max(0, bw)
    const resultaat = uit ? uit.resultaat : t.vergoeding - Math.max(0, t.kosten ?? 0) - Math.max(0, t.afschrijving ?? 0)
    inkomsten += ink
    kosten += ink - resultaat
    boekwinst += bw
  }
  return { inkomsten, kosten, boekwinst }
}

/** Arbeidsbeloning aan de partner als W&V-regel: alleen bij de keuze arbeidsbeloning en vanaf de drempel van art. 3.16 lid 4. */
function arbeidsbeloningPartner(c: InvulhulpContext): number | null {
  const x = o(c)
  const v = x?.meewerkendePartner?.vergoeding ?? 0
  return x?.samenwerkingMetPartner === 'arbeidsbeloning' && v >= c.params.ondernemer.waarde.meewerkaftrek.maxVergoeding ? v : null
}

function ondernemingVeldVanPersoon(c: InvulhulpContext, pad: string) {
  const x = p(c)?.ondernemingen[0]
  return x ? veldVan.onderneming(c.persoon, itemSleutel(x, 0), pad) : undefined
}

function box2Veld(c: InvulhulpContext, pad: string) {
  return `box2:${itemSleutel(box2Item(c), c.item?.index ?? 0)}/${pad}`
}

// ---------------------------------------------------------------------------
// De schermen
// ---------------------------------------------------------------------------

export function basisSchermen(opties: SchermOpties): SchermDefinitie[] {
  const jongeKinderen = (c: InvulhulpContext) => c.invoer.kinderen.filter((k) => Number(k.geboortedatum.slice(0, 4)) > c.jaar - opties.kinderenJarenTerug)

  const introductie: SchermDefinitie = {
    id: 'introductie',
    titel: 'Vooraf ingevulde gegevens',
    menu: ['Introductie'],
    herhaling: 'samen',
    toelichting: () =>
      'Na het inloggen toont het programma een overzicht van de gegevens die de Belastingdienst al heeft ingevuld. Dat overzicht kun je niet bewerken: klopt iets niet, pas het dan aan op het scherm van dat onderwerp. Hieronder staat per scherm wat je invult of controleert.',
    rubrieken: [],
  }

  const persoonlijk: SchermDefinitie = {
    id: 'persoonlijke-gegevens',
    titel: 'Persoonlijke gegevens van <persoon>',
    menu: ['Persoonlijke gegevens'],
    herhaling: 'persoon',
    rubrieken: [
      {
        id: 'persoon',
        velden: [
          V('pgaangnaam', 'Naam', (c) => tekst(p(c)?.naam), VIA.brp, { olaId: 'pgaangnaam', toon: (c) => Boolean(p(c)?.naam?.trim()), herkomst: (c) => herkomst('Huishouden, naam', persoonVeld(c, 'naam')) }),
          V('pgaanggebd', 'Geboortedatum', (c) => tekst(datumNL(p(c)?.geboortedatum)), VIA.brp, {
            olaId: 'pgaanggebd',
            herkomst: (c) => herkomst('Huishouden, geboortedatum', persoonVeld(c, 'geboortedatum')),
          }),
        ],
      },
    ],
  }

  const partner: SchermDefinitie = {
    id: 'partner',
    titel: 'Partner',
    menu: ['Partner'],
    herhaling: 'samen',
    rubrieken: [
      {
        id: 'partner',
        velden: [
          K('fipan1', 'Had u in [jaar] een echtgenoot?', (c) => jaNee(heeftPartner(c.invoer)), {
            olaId: 'fipan1',
            herkomst: () => herkomst('Huishouden, fiscaal partner', 'huishouden/fiscaalPartner'),
            hint: (c) => (heeftPartner(c.invoer) ? 'Samenwonend en niet getrouwd? Dan Nee; het programma vraagt daarna of je een huisgenoot had.' : null),
          }),
          K('zelfde-adres', 'Stond u heel [jaar] ingeschreven op hetzelfde adres als <partner>?', () => jaNee(true), { toon: (c) => heeftPartner(c.invoer) }),
          K('samen-aangifte', 'Wilt u samen aangifte doen?', () => jaNee(true), {
            toon: (c) => heeftPartner(c.invoer),
            hint: () => 'De tool rekent met één verdeling voor jullie samen. Je partner logt daarna zelf in om te ondertekenen.',
          }),
        ],
      },
    ],
  }

  const kinderen: SchermDefinitie = {
    id: 'kinderen',
    titel: 'Persoonlijke gegevens kinderen',
    menu: ['Persoonlijke gegevens kinderen'],
    herhaling: 'samen',
    toelichting: (c) =>
      opties.kinderenHuishoudenVragen && jongeKinderen(c).length > 0
        ? 'Het programma vraagt per kind ook of het minstens 6 maanden bij je huishouden hoorde en of je co-ouder was.'
        : null,
    rubrieken: [
      {
        id: 'kinderen',
        velden: [
          K('kinderen', `Had u of <partner> in [jaar] een uit- of thuiswonend kind dat geboren is na [jaar-${opties.kinderenJarenTerug}]?`, (c) => jaNee(jongeKinderen(c).length > 0), {
            herkomst: () => herkomst('Huishouden, kinderen'),
          }),
          V(
            'geboortedata',
            'Geboortedatum',
            (c) =>
              tekst(
                jongeKinderen(c)
                  .map((k) => datumNL(k.geboortedatum))
                  .filter(Boolean)
                  .join(', '),
              ),
            VIA.brp,
            { toon: (c) => jongeKinderen(c).length > 0, hint: () => 'Per kind staan naam, geboortedatum en burgerservicenummer vooraf ingevuld.' },
          ),
        ],
      },
    ],
  }

  const ondernemingSelectie: SchermDefinitie = {
    id: 'onderneming',
    titel: 'Onderneming',
    menu: ['Onderneming'],
    herhaling: 'samen',
    rubrieken: [
      {
        id: 'selectie',
        velden: [
          K('onderneming', 'Had u of <partner> een onderneming?', (c) => jaNee(c.invoer.personen.some((x) => x.ondernemingen.length > 0)), {
            hint: () => 'Met een onderneming bedoelt het programma geen bv.',
          }),
          K('ondernemer-a', 'Was <aangever> ondernemer voor de inkomstenbelasting?', (c) => jaNee((c.invoer.personen[0]?.ondernemingen.length ?? 0) > 0), {
            toon: (c) => c.invoer.personen.some((x) => x.ondernemingen.length > 0),
          }),
          K('ondernemer-b', 'Was <partner> ondernemer voor de inkomstenbelasting?', (c) => jaNee((c.invoer.personen[1]?.ondernemingen.length ?? 0) > 0), {
            toon: (c) => heeftPartner(c.invoer) && c.invoer.personen.some((x) => x.ondernemingen.length > 0),
          }),
        ],
      },
    ],
  }

  // --- Per onderneming --------------------------------------------------------------------------------------------

  const menuO = (titel: string) => ['Onderneming', 'Gegevens onderneming(en)', '<onderneming>', titel]

  const gegevensOnderneming: SchermDefinitie = {
    id: 'gegevens-onderneming',
    titel: 'Gegevens onderneming',
    menu: ['Onderneming', 'Gegevens onderneming(en)'],
    herhaling: 'onderneming',
    melding: (c) =>
      c.ondernemingIndex === 0 && (p(c)?.ondernemingen.length ?? 0) > 3
        ? {
            variant: 'let-op',
            tekst: 'Het online programma kent hooguit drie ondernemingen per persoon. Heb je er meer, dan doe je aangifte met andere software of via een adviseur.',
          }
        : null,
    rubrieken: [
      {
        id: 'gegevens',
        velden: [
          Z('wondnaam', 'Naam onderneming', (c) => tekst(o(c)?.naam), { olaId: 'wondnaam', herkomst: (c) => herkomst(`${ondernemingNaam(c)}, naam`, ondernemingVeld(c, 'naam')) }),
          Z('wondoms', 'Omschrijving van de activiteiten', (c) => tekst(jr(c)?.omschrijvingActiviteiten), {
            olaId: 'wondoms',
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, jaarrekening`, ondernemingVeld(c, 'jaarrekening.omschrijvingActiviteiten')),
          }),
          Z('wondvorm', 'Ondernemingsvorm', (c) => antwoord(o(c)?.samenwerkingMetPartner === 'vof' ? 'Samenwerkingsverband (vof, cv, maatschap)' : 'Eenmanszaak'), { olaId: 'wondvorm' }),
          Z('wondvan', 'Deze onderneming is van', (c) => antwoord(persoonNaam(p(c))), {
            olaId: 'wondvan',
            toon: (c) => c.invoer.personen.length > 1 && c.invoer.personen.every((x) => x.ondernemingen.length > 0),
          }),
          K('buitenland', 'Is (een gedeelte van) de onderneming in het buitenland gevestigd?', () => jaNee(false)),
          K('bronbelasting', 'Heeft de onderneming inkomsten waarop buitenlandse bronbelasting is ingehouden, zoals rente, dividend of royalty’s?', () => jaNee(false)),
          K('boekjaar', 'Wijkt het boekjaar af van het kalenderjaar?', () => jaNee(false)),
          K('gestart', 'Is deze onderneming in dit boekjaar gestart?', (c) => jaNee(gestartDitJaar(c)), {
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, startjaar`, ondernemingVeld(c, 'startjaar')),
          }),
          K('vermogen-gelijk', 'Is het fiscale ondernemingsvermogen op 01-01-[jaar] gelijk aan het fiscale ondernemingsvermogen op 31-12-[j-1]?', () => jaNee(true), {
            toon: (c) => !gestartDitJaar(c),
            hint: () =>
              'Ja, als je beginbalans gelijk is aan de eindbalans in je aangifte over [j-1]. Dan vraagt het programma op de balans alleen de stand aan het einde van het jaar.',
          }),
          K('gestaakt', 'Hebt u de onderneming in dit boekjaar (geheel of gedeeltelijk) gestaakt of doorgeschoven?', (c) => jaNee(Boolean(o(c)?.staking))),
        ],
      },
    ],
  }

  const selectievragen: SchermDefinitie = {
    id: 'selectievragen',
    titel: 'Vragen over <onderneming>',
    menu: menuO('<onderneming>'),
    herhaling: 'onderneming',
    rubrieken: [
      {
        id: 'vragen',
        velden: [
          K('auto', 'Waren er in [jaar] een of meer bestelauto’s of personenauto’s in uw onderneming (bijvoorbeeld in eigendom, lease of huur)?', (c) => jaNee(Boolean(o(c)?.auto))),
          K('auto-prive', 'Gebruikte u 1 of meer bestelauto’s of personenauto’s van de onderneming ook privé?', (c) => jaNee(bijtellingPrive(c) > 0), {
            toon: (c) => Boolean(o(c)?.auto),
          }),
          K('willekeurig', 'Is in deze onderneming willekeurig afgeschreven op bedrijfsmiddelen in Nederland?', (c) =>
            jaNee((o(c)?.activa ?? []).some((a) => a.methode === 'willekeurig-starter' || a.methode === 'vamil')),
          ),
          K('partner-meegewerkt', 'Heeft <partner> meegewerkt in deze onderneming?', (c) => {
            const x = o(c)
            return jaNee(Boolean(x?.meewerkendePartner) || x?.samenwerkingMetPartner === 'meewerkaftrek' || x?.samenwerkingMetPartner === 'arbeidsbeloning')
          }, { toon: (c) => heeftPartner(c.invoer) }),
        ],
      },
      {
        id: 'investeringen',
        titel: 'Investeringen',
        velden: [
          K('investeringsaftrek', 'Hebt u investeringen gedaan waarvoor recht bestaat op investeringsaftrek?', (c) => jaNee(((or(c)?.kia ?? 0) + (or(c)?.eia ?? 0) + (or(c)?.mia ?? 0)) > 0)),
          K('eia-mia', 'Hebt u recht op energie- of milieu-investeringsaftrek?', (c) => jaNee(((or(c)?.eia ?? 0) + (or(c)?.mia ?? 0)) > 0), {
            toon: (c) => ((or(c)?.kia ?? 0) + (or(c)?.eia ?? 0) + (or(c)?.mia ?? 0)) > 0,
          }),
          K('desinvestering', 'Moet u een desinvesteringsbijtelling aangeven?', (c) => jaNee((or(c)?.desinvesteringsbijtelling ?? 0) > 0)),
        ],
      },
      {
        id: 'staking',
        titel: 'Staking',
        velden: [
          K('staking-geheel', 'Hebt u de hele onderneming gestaakt of doorgeschoven?', (c) => {
            const s = o(c)?.staking
            return jaNee(Boolean(s) && s?.soort !== 'gedeeltelijk' && !(s?.soort === undefined && s?.gedeeltelijk))
          }, { toon: (c) => Boolean(o(c)?.staking) }),
          Z('staking-datum', 'Datum waarop u de onderneming hebt gestaakt of doorgeschoven', (c) => tekst(datumNL(o(c)?.staking?.datum)), {
            toon: (c) => Boolean(o(c)?.staking),
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, staking`, ondernemingVeld(c, 'staking.datum')),
          }),
          K('staking-prive', 'Hebt u overige bestanddelen van het ondernemingsvermogen overgebracht naar het privévermogen, in verband met staking van de onderneming?', (c) =>
            jaNee((o(c)?.staking?.posten ?? []).some((x) => x.naarPrive)),
          { toon: (c) => Boolean(o(c)?.staking) }),
          K('staking-bv', 'Hebt u (een deel van) de onderneming ingebracht in een bv?', (c) => jaNee(o(c)?.staking?.soort === 'geruisloosBV'), { toon: (c) => Boolean(o(c)?.staking) }),
          K('staking-doorschuiving', 'Hebt u (een deel van) de onderneming geruisloos overgedragen aan een mede-ondernemer of werknemer?', (c) => jaNee(o(c)?.staking?.soort === 'doorschuiving'), {
            toon: (c) => Boolean(o(c)?.staking),
          }),
        ],
      },
    ],
  }

  const wvHerkomst = (c: InvulhulpContext) => herkomst(`${ondernemingNaam(c)}, winst-en-verliesrekening`, ondernemingVeld(c, 'winstberekening.saldo'))
  const wvVeld = (id: string, label: string, regel: WvRegel, extra?: Extra) => Z(id, label, (c) => bedrag(wv(c, regel)), { olaId: id, herkomst: wvHerkomst, ...extra })
  /**
   * Saldo zoals het programma het uit de regels hierboven rekent. De afboeking van de herinvesteringsreserve is een last:
   * de afname van de reserve staat bij Wijzigingen in toelaatbare reserves en heft hem op (bevinding 5). Zonder rubrieken
   * het saldo van de winstberekening, min een btw-correctie die nog in de autokosten moet (bevinding 4).
   */
  const wvRegelsSom = (c: InvulhulpContext): number | null => {
    if (!heeftWvRubrieken(c)) {
      const saldo = or(c)?.saldo
      return saldo === undefined ? null : saldo - btwBuitenAutokosten(c)
    }
    const plus = ['omzet', 'onderhandenWerk', 'baten'] as const
    const min = ['inkoop', 'personeel', 'afschrijvingen', 'auto', 'huisvesting', 'verkoop', 'andere', 'lasten'] as const
    const partner = arbeidsbeloningPartner(c) ?? 0
    const hir = som(or(c)?.herinvesteringsreserves, (h) => h.afboeking) ?? 0
    return (
      plus.reduce((s, r) => s + (wv(c, r) ?? 0), 0) -
      min.reduce((s, r) => s + (wv(c, r) ?? 0), 0) -
      partner +
      (boekresultaat(c, 1) ?? 0) -
      hir -
      (boekresultaat(c, -1) ?? 0)
    )
  }

  const winstEnVerlies: SchermDefinitie = {
    id: 'winst-en-verliesrekening',
    titel: 'Winst-en-verliesrekening',
    menu: menuO('Winst-en-verliesrekening'),
    herhaling: 'onderneming',
    toelichting: (c) => (heeftWvRubrieken(c) ? 'Vul de fiscale bedragen over dit boekjaar in. Regels zonder bedrag laat je leeg.' : null),
    melding: (c) =>
      heeftWvRubrieken(c)
        ? null
        : {
            tekst: `Het aangifteprogramma vraagt hier de winst-en-verliesrekening van ${ondernemingNaam(c)}. Vul hem in bij de onderneming of neem hem over uit Moneybird.${
              btwBuitenAutokosten(c) > 0
                ? ` Tel de btw-correctie privégebruik auto (${formatEuro(btwBuitenAutokosten(c))}) op bij de auto- en transportkosten: die zit nog niet in je boekhouding.`
                : ''
            }`,
            link: { label: 'Naar de jaarrekening', veld: ondernemingVeld(c, 'winstberekening.saldo') },
          },
    rubrieken: [
      { id: 'opbrengsten', titel: 'Opbrengsten', velden: [wvVeld('opbomz', 'Opbrengsten uit leveringen en diensten', 'omzet'), wvVeld('opbwijz', 'Wijziging in voorraden gereed product en onderhanden werk', 'onderhandenWerk')] },
      {
        id: 'inkoop',
        titel: 'Inkoopkosten, uitbesteed werk en andere externe kosten',
        velden: [
          wvVeld('inkkost', 'Kosten van grond- en hulpstoffen en inkoopprijs van de verkopen', 'inkoop', {
            hint: () => 'De tool kent inkoop en uitbesteed werk samen. Splits het bedrag als een deel uitbesteed werk is.',
          }),
        ],
      },
      {
        id: 'personeel',
        titel: 'Personeelskosten',
        velden: [
          wvVeld('persloon', 'Lonen en salarissen', 'personeel'),
          Z('persarb', 'Arbeidsbeloning aan fiscale partner die geen (mede)eigenaar was van de onderneming', (c) => bedrag(arbeidsbeloningPartner(c)), {
            olaId: 'persarb',
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, meewerkende partner`, ondernemingVeld(c, 'meewerkendePartner.vergoeding')),
          }),
        ],
      },
      { id: 'afschrijvingen', titel: 'Afschrijvingen', velden: [wvVeld('afschovrmat', 'Overige materiële vaste activa', 'afschrijvingen')] },
      {
        id: 'overige-kosten',
        titel: 'Overige bedrijfskosten',
        velden: [
          wvVeld('ovrauto', 'Auto- en transportkosten', 'auto', {
            hint: (c) => {
              const delen: string[] = []
              if (btwBuitenAutokosten(c) > 0)
                delen.push(`Inclusief de btw-correctie privégebruik auto (${formatEuro(btwBuitenAutokosten(c))}). Die zit niet in je autokosten, maar is wel een autokost.`)
              if ((or(c)?.bijtellingAuto ?? 0) > 0)
                delen.push(
                  `Staat de bijtelling van de auto (${formatEuro(or(c)?.bijtellingAuto ?? 0)}) niet al in je boekhouding? Verlaag dit bedrag dan met de bijtelling, anders sluit de controle in het programma niet.`,
                )
              return delen.length > 0 ? delen.join(' ') : null
            },
          }),
          wvVeld('ovrhuis', 'Huisvestingskosten', 'huisvesting'),
          wvVeld('ovrverk', 'Verkoopkosten', 'verkoop'),
          wvVeld('ovrand', 'Andere kosten', 'andere', {
            hint: (c) =>
              (o(c)?.beperktAftrekbaar ?? 0) > 0
                ? `Inclusief de beperkt aftrekbare kosten (${formatEuro(o(c)?.beperktAftrekbaar ?? 0)}); het niet-aftrekbare deel vul je in bij Niet-aftrekbare kosten en lasten.`
                : null,
          }),
        ],
      },
      { id: 'financieel', titel: 'Financiële baten en lasten', velden: [wvVeld('finbank', 'Opbrengsten banktegoeden', 'baten'), wvVeld('finkost', 'Betaalde rente en andere kosten van schulden', 'lasten')] },
      {
        id: 'buitengewoon',
        titel: 'Buitengewone baten en lasten',
        velden: [
          Z('bgewbwact', 'Boekwinst op activa', (c) => bedrag(boekresultaat(c, 1)), {
            olaId: 'bgewbwact',
            hint: () => 'Uit je activaregister. Staat de boekwinst al in een van de regels hierboven, haal hem daar dan uit.',
          }),
          Z('bgewaf', 'Afboeking herinvesteringsreserve op gekochte activa', (c) => bedrag(som(or(c)?.herinvesteringsreserves, (h) => h.afboeking)), {
            olaId: 'bgewaf',
            hint: () => 'Dit bedrag verlaagt het saldo. De afname van de reserve vul je in bij Wijzigingen in toelaatbare reserves; samen veranderen ze de winst niet.',
          }),
          Z('bgewbvact', 'Boekverlies op activa', (c) => bedrag(boekresultaat(c, -1)), { olaId: 'bgewbvact' }),
        ],
      },
      {
        id: 'saldo',
        velden: [
          B('saldo', 'Saldo winst-en-verliesrekening', (c) => bedrag(wvRegelsSom(c)), {
            hint: () => 'Moet gelijk zijn aan de winstberekening; anders gaat het programma niet verder.',
          }),
        ],
      },
    ],
  }

  const balansActiva: SchermDefinitie = {
    id: 'balans-activa',
    titel: 'Balans: activa',
    menu: menuO('Balans: activa'),
    herhaling: 'onderneming',
    melding: (c) =>
      standIngevuld(jr(c)?.eind)
        ? null
        : {
            tekst: `Het aangifteprogramma vraagt hier de balans van ${ondernemingNaam(c)}. Vul hem in bij de onderneming of neem hem over uit Moneybird.`,
            link: { label: 'Naar de balans', veld: ondernemingVeld(c, 'jaarrekening.eind.liquideMiddelen') },
          },
    rubrieken: [
      {
        id: 'mva',
        titel: 'Materiële vaste activa',
        kolommen: ['kosten', 'eind', 'restwaarde'],
        velden: [
          Z(
            'matvaovr',
            'Overige materiële vaste activa',
            (c) => kolommen({ kosten: jr(c)?.mva?.aanschafwaarde, eind: jr(c)?.eind?.materieleVasteActiva, restwaarde: jr(c)?.mva?.restwaarde }),
            { olaId: 'matvaboekovr', herkomst: (c) => balansHerkomst(c, 'materieleVasteActiva') },
          ),
        ],
      },
      {
        id: 'vlottend',
        titel: 'Voorraden, vorderingen en liquide middelen',
        kolommen: ['begin', 'eind'],
        velden: [
          Z('voorboekvoor', 'Voorraden', (c) => balansPost(c, 'voorraden'), {
            olaId: 'voorboekvoor',
            herkomst: (c) => balansHerkomst(c, 'voorraden'),
            hint: () => 'De tool kent voorraden en onderhanden werk samen; het programma vraagt ze apart.',
          }),
          Z('vordtabboekhand', 'Vorderingen op handelsdebiteuren', (c) => balansPost(c, 'handelsdebiteuren'), { olaId: 'vordtabboekhand', herkomst: (c) => balansHerkomst(c, 'handelsdebiteuren') }),
          Z('vordtabboekovr', 'Overige vorderingen', (c) => balansPost(c, 'overigeVorderingen'), { olaId: 'vordtabboekovr', herkomst: (c) => balansHerkomst(c, 'overigeVorderingen') }),
          Z('liqboekliq', 'Liquide middelen', (c) => balansPost(c, 'liquideMiddelen'), { olaId: 'liqboekliq', herkomst: (c) => balansHerkomst(c, 'liquideMiddelen') }),
        ],
      },
    ],
  }

  const reservesKol = (c: InvulhulpContext, lijst: 'herinvesteringsreserves' | 'egalisatiereserves'): VeldWaarde => {
    const r: ReadonlyArray<{ standBegin: number; standEind: number }> | undefined = or(c)?.[lijst]
    return kolommen({ begin: som(r, (x) => x.standBegin), eind: som(r, (x) => x.standEind) })
  }

  const balansPassiva: SchermDefinitie = {
    id: 'balans-passiva',
    titel: 'Balans: passiva',
    menu: menuO('Balans: passiva'),
    herhaling: 'onderneming',
    rubrieken: [
      {
        id: 'vermogen',
        titel: 'Ondernemingsvermogen',
        kolommen: ['begin', 'eind'],
        velden: [
          Z('vermboekeig', 'Eigen vermogen', (c) => kolommen({ begin: eigenVermogen(c, 'begin'), eind: eigenVermogen(c, 'eind') }), {
            olaId: 'vermboekeig',
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, balans (activa min reserves, voorzieningen en schulden)`, ondernemingVeld(c, 'jaarrekening.eind.liquideMiddelen')),
          }),
          Z('vermboekegal', 'Egalisatiereserve', (c) => reservesKol(c, 'egalisatiereserves'), { olaId: 'vermboekegal' }),
          Z('vermboekher', 'Herinvesteringsreserve', (c) => reservesKol(c, 'herinvesteringsreserves'), { olaId: 'vermboekher' }),
          Z(
            'vermboekoud',
            'Oudedagsreserve',
            (c) => kolommen({ begin: jr(c)?.begin?.oudedagsreserve ?? or(c)?.forStandBegin, eind: jr(c)?.eind?.oudedagsreserve ?? or(c)?.forStandEind }),
            { olaId: 'vermboekoud', herkomst: (c) => herkomst(`${ondernemingNaam(c)}, oudedagsreserve`, ondernemingVeld(c, 'for.stand')) },
          ),
        ],
      },
      {
        id: 'schulden',
        titel: 'Voorzieningen en schulden',
        kolommen: ['begin', 'eind'],
        velden: [
          Z('voorzboekovr', 'Overige voorzieningen', (c) => balansPost(c, 'voorzieningen'), { olaId: 'voorzboekovr', herkomst: (c) => balansHerkomst(c, 'voorzieningen') }),
          Z('langboekschuld', 'Schulden aan kredietinstellingen', (c) => balansPost(c, 'langlopendeSchulden'), {
            olaId: 'langboekschuld',
            herkomst: (c) => balansHerkomst(c, 'langlopendeSchulden'),
            hint: () => 'De tool kent de langlopende schulden samen. Is een deel geen bankschuld, vul dat in bij Overige langlopende schulden.',
          }),
          Z('kortboeklev', 'Schulden aan leveranciers en handelskredieten', (c) => balansPost(c, 'crediteuren'), { olaId: 'kortboeklev', herkomst: (c) => balansHerkomst(c, 'crediteuren') }),
          Z('kortboekomz', 'Schuld omzetbelasting', (c) => balansPost(c, 'omzetbelasting'), { olaId: 'kortboekomz', herkomst: (c) => balansHerkomst(c, 'omzetbelasting') }),
          Z('kortboekovr', 'Overige kortlopende schulden', (c) => balansPost(c, 'overigeKortlopendeSchulden'), {
            olaId: 'kortboekovr',
            herkomst: (c) => balansHerkomst(c, 'overigeKortlopendeSchulden'),
          }),
        ],
      },
    ],
  }

  const investeringHerkomst = (c: InvulhulpContext, pad: string) =>
    herkomst(`${ondernemingNaam(c)}, investeringen`, ondernemingVeld(c, `investering:${itemSleutel(investeringItem(c), c.item?.index ?? 0)}`, pad))

  const kia: SchermDefinitie = {
    id: 'kleinschaligheidsinvesteringsaftrek',
    titel: 'Kleinschaligheidsinvesteringsaftrek',
    menu: menuO('Kleinschaligheidsinvesteringsaftrek'),
    herhaling: 'onderneming',
    toon: (c) => kiaInvesteringen(o(c)).length > 0,
    rubrieken: [
      {
        id: 'investering',
        velden: [
          Z('kiaoms', 'Omschrijving investering bedrijfsmiddel', (c) => tekst(investeringItem(c)?.omschrijving), { olaId: 'kiaoms', herkomst: (c) => investeringHerkomst(c, 'omschrijving') }),
          K('in-gebruik', 'Is de investering in het boekjaar in gebruik genomen?', (c) => jaNee(investeringItem(c)?.inGebruik !== false)),
          Z('kiainvbedr', 'Investeringsbedrag', (c) => {
            const i = investeringItem(c)
            return bedrag(i ? kiaBedrag(i) : null)
          }, {
            olaId: 'kiainvbedr',
            herkomst: (c) => investeringHerkomst(c, 'bedrag'),
            hint: (c) => {
              const i = investeringItem(c)
              if (i?.inGebruik === false) return 'Nog niet in gebruik: alleen het deel dat je in [jaar] betaalde.'
              if (i?.herinvesteringsreserve && !i.herinvesteringsreserve.kiaOverVolBedrag)
                return `Na afboeking van de herinvesteringsreserve (${formatEuro(i.herinvesteringsreserve.afboeking)}).`
              return null
            },
          }),
        ],
        herhaal: (c) =>
          herhaalItems(c, o(c)?.investeringen, 'investering', (i) => ((i.regeling ?? 'kia') === 'kia' || i.regeling === 'eia') && !i.uitgesloten, (i, n) => itemSleutel(i, n), (i, n) => i.omschrijving || `Investering ${n + 1}`),
      },
      {
        id: 'bijzonder',
        titel: 'Bijzondere situaties',
        velden: [
          K('hir', 'Hebt u in [jaar] of eerder de winst op een verkocht bedrijfsmiddel gereserveerd om te investeren in een nieuw bedrijfsmiddel?', (c) => jaNee((o(c)?.herinvesteringsreserves?.length ?? 0) > 0)),
          K(
            'hir-kostprijs',
            'Bent u bij de berekening van het investeringsbedrag van het nieuwe bedrijfsmiddel uitgegaan van de kostprijs zonder dat deze is verminderd met de herinvesteringsreserve?',
            (c) => jaNee((o(c)?.investeringen ?? []).some((i) => i.herinvesteringsreserve?.kiaOverVolBedrag)),
            { toon: (c) => (o(c)?.investeringen ?? []).some((i) => i.herinvesteringsreserve) },
          ),
          K('naaste-verwanten', 'Hebt u een bedrijfsmiddel gekocht van naaste verwanten?', (c) => jaNee((o(c)?.investeringen ?? []).some((i) => i.gekochtVanPartner))),
        ],
      },
      { id: 'aftrek', velden: [B('kia', 'Kleinschaligheidsinvesteringsaftrek in Nederland', (c) => bedrag(or(c)?.kia))] },
    ],
  }

  const desinvestering: SchermDefinitie = {
    id: 'desinvesteringsbijtelling',
    titel: 'Desinvesteringsbijtelling',
    menu: menuO('Desinvesteringsbijtelling'),
    herhaling: 'onderneming',
    toon: (c) => (or(c)?.desinvesteringsbijtelling ?? 0) > 0,
    rubrieken: [{ id: 'bijtelling', velden: [Z('wdestotaang', 'Desinvesteringsbijtelling', (c) => bedrag(or(c)?.desinvesteringsbijtelling), { olaId: 'wdestotaang' })] }],
  }

  const stakingAangifte = (c: InvulhulpContext) => or(c)?.staking?.aangifte
  const stakingVeld = (id: string, label: string, sleutel: keyof NonNullable<ReturnType<typeof stakingAangifte>>) =>
    Z(id, label, (c) => bedrag(stakingAangifte(c)?.[sleutel] ?? 0), { olaId: id, altijd: true, toon: (c) => Boolean(stakingAangifte(c)) })

  const stakingswinst: SchermDefinitie = {
    id: 'stakingswinst',
    titel: 'Stakingswinst',
    menu: menuO('Stakingswinst'),
    herhaling: 'onderneming',
    toon: (c) => Boolean(o(c)?.staking),
    toelichting: (c) =>
      stakingAangifte(c)
        ? 'Het programma vraagt alle zeven bedragen, ook als ze 0 zijn. Het is een specificatie: de bedragen tellen niet nog eens op bij de winst.'
        : null,
    melding: (c) =>
      stakingAangifte(c) ? null : { tekst: `De stakingswinst staat bij ${ondernemingNaam(c)}.`, link: { label: 'Naar de staking', veld: ondernemingVeld(c, 'staking.stakingswinst') } },
    rubrieken: [
      {
        id: 'stakingswinst',
        velden: [
          K('behaald', 'Is er stakingswinst behaald?', (c) => jaNee((or(c)?.staking?.totaal ?? o(c)?.staking?.stakingswinst ?? 0) > 0)),
          stakingVeld('wstakonraang', 'Resultaat op onroerende zaken', 'onroerendeZaken'),
          stakingVeld('wstakimmactaang', 'Winst op immateriële activa', 'immaterieleActiva'),
          stakingVeld('wstakovactaang', 'Winst op overige activa', 'overigeActiva'),
          stakingVeld('wstakvrijforaang', 'Vrijval oudedagsreserve', 'vrijvalOudedagsreserve'),
          stakingVeld('wstakvrijovresaang', 'Vrijval overige fiscale reserves', 'vrijvalOverigeReserves'),
          stakingVeld('wstakovresaang', 'Overig resultaat', 'overigResultaat'),
          stakingVeld('wstakdesbijaang', 'Desinvesteringsbijtelling wegens het staken van de onderneming', 'desinvesteringsbijtelling'),
          Z('stakingswinst', 'Stakingswinst', (c) => bedrag(o(c)?.staking?.stakingswinst), {
            toon: (c) => !stakingAangifte(c),
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, staking`, ondernemingVeld(c, 'staking.stakingswinst')),
            hint: () => 'Het programma vraagt de stakingswinst in zeven delen. Verdeel dit bedrag over die velden.',
          }),
        ],
      },
    ],
  }

  const youngtimerJaar = (c: InvulhulpContext) => c.jaar - c.params.ondernemer.waarde.auto.youngtimerLeeftijd
  const toelatingsjaar = (c: InvulhulpContext) => Number(o(c)?.auto?.datumEersteToelating?.slice(0, 4))
  const isYoungtimer = (c: InvulhulpContext) => toelatingsjaar(c) < youngtimerJaar(c)
  /**
   * Vraagt het programma het bedrag van de bijtelling in plaats van de cataloguswaarde? Ja bij een auto van vóór het
   * grensjaar, en ook als de engine (een deel van) dit jaar met de dagwaarde rekent: het overgangsrecht (heel het jaar
   * youngtimer) of een auto die dit jaar youngtimer wordt (bevinding 11). Hoe het programma van 2026 in het grensjaar
   * vraagt, is pas na de opening (1 maart 2027) na te kijken.
   */
  const bijtellingAlsBedrag = (c: InvulhulpContext): boolean => {
    const a = or(c)?.auto
    if (a?.overgangsrecht || a?.soort === 'youngtimer' || (a?.soort === 'gemengd' && a.youngtimerVanaf)) return true
    return isYoungtimer(c)
  }
  const cataloguspad = (c: InvulhulpContext) => bijtellingPrive(c) > 0 && !bijtellingAlsBedrag(c)
  /** Periode ter beschikking binnen dit jaar; null als de auto het hele jaar ter beschikking stond (bevinding 10). */
  const autoPeriode = (c: InvulhulpContext): { van: string; tot: string } | null => {
    const a = o(c)?.auto
    if (!a) return null
    const begin = `${c.jaar}-01-01`
    const eind = `${c.jaar}-12-31`
    const van = a.terBeschikkingSinds && a.terBeschikkingSinds > begin ? a.terBeschikkingSinds : begin
    const tot = a.terBeschikkingTot && a.terBeschikkingTot < eind ? a.terBeschikkingTot : eind
    return van === begin && tot === eind ? null : { van, tot }
  }
  /** De engine rekent per hele maand; het programma per dag. Alleen een verschil als de periode midden in een maand begint of eindigt. */
  const periodeHint = (c: InvulhulpContext): string | null => {
    const pe = autoPeriode(c)
    if (!pe) return null
    const heleMaanden = pe.van.endsWith('-01') && plusDagen(pe.tot, 1).endsWith('-01')
    return heleMaanden ? null : 'De tool rekent de bijtelling per hele maand, het programma per dag. Daardoor kan het bedrag in het programma iets lager uitvallen.'
  }
  const youngtimerHint = (c: InvulhulpContext): string | null => {
    const a = or(c)?.auto
    if (!a) return null
    const pct = formatPct(c.params.ondernemer.waarde.auto.youngtimerPct, 0)
    if (a.overgangsrecht) return `Door het overgangsrecht is deze auto heel [jaar] een youngtimer: de bijtelling is ${pct} van de dagwaarde.`
    if (a.soort === 'gemengd' && a.youngtimerVanaf)
      return `Deze auto is youngtimer vanaf ${datumTekst(a.youngtimerVanaf)}. Het bedrag is de bijtelling over de cataloguswaarde tot die datum en ${pct} van de dagwaarde daarna.`
    return null
  }

  const prive: SchermDefinitie = {
    id: 'prive',
    titel: 'Privéonttrekkingen en -stortingen',
    menu: menuO('Privéonttrekkingen en -stortingen'),
    herhaling: 'onderneming',
    rubrieken: [
      {
        id: 'onttrekkingen',
        velden: [
          Z('wpontcontbdrgaang', 'Privéonttrekkingen in geld', (c) => bedrag(som(jr(c)?.onttrekkingen, (x) => x.bedrag)), {
            olaId: 'contbdrgaang',
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, jaarrekening (onttrekkingen)`, ondernemingVeld(c, 'jaarrekening.onttrekkingen')),
            hint: (c) => ((jr(c)?.onttrekkingen?.length ?? 0) > 1 ? 'Alle onttrekkingen uit je administratie samen, zoals privé-opnamen en betaalde inkomstenbelasting.' : null),
          }),
        ],
      },
      {
        id: 'auto',
        titel: 'Onttrekking privégebruik auto van de onderneming',
        velden: [
          Z('autmeer1', 'Aantal auto’s van de onderneming waarmee u privé hebt gereden', () => antwoord('1'), { olaId: 'autmeer1', toon: (c) => bijtellingPrive(c) > 0 }),
          K('autbouw', 'Jaar waarin de auto voor het eerst is toegelaten', (c) => {
            const t = toelatingsjaar(c)
            const y = youngtimerJaar(c)
            return antwoord(Number.isFinite(t) ? (t > y ? `na ${y}` : t === y ? String(y) : `voor ${y}`) : null)
          }, { olaId: 'autbouw', toon: (c) => bijtellingPrive(c) > 0 }),
          Z('autbijzaang', 'Bedrag van de bijtelling voor <persoon>', (c) => bedrag(bijtellingPrive(c)), {
            olaId: 'autbijzaang',
            toon: (c) => bijtellingPrive(c) > 0 && bijtellingAlsBedrag(c),
            hint: youngtimerHint,
          }),
          Z('autstandcata', 'Cataloguswaarde', (c) => bedrag(o(c)?.auto?.cataloguswaarde), {
            olaId: 'autstandcata',
            toon: cataloguspad,
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, auto`, ondernemingVeld(c, 'auto.cataloguswaarde')),
          }),
          Z('autstandper_b', 'Periode van', (c) => tekst(datumNL(autoPeriode(c)?.van)), {
            olaId: 'autstandper_b',
            toon: (c) => cataloguspad(c) && autoPeriode(c) !== null,
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, auto`, ondernemingVeld(c, 'auto.terBeschikkingSinds')),
            hint: (c) => ((autoPeriode(c)?.van ?? '') > `${c.jaar}-01-01` ? 'De dag waarop de auto tot je beschikking kwam.' : null),
          }),
          Z('autstandper_e', 'Periode tot en met', (c) => tekst(datumNL(autoPeriode(c)?.tot)), {
            olaId: 'autstandper_e',
            toon: (c) => cataloguspad(c) && autoPeriode(c) !== null,
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, auto`, ondernemingVeld(c, 'auto.terBeschikkingTot')),
            hint: (c) => {
              const delen = [(autoPeriode(c)?.tot ?? '9999') < `${c.jaar}-12-31` ? 'De laatste dag dat de auto tot je beschikking stond.' : null, periodeHint(c)].filter(Boolean)
              return delen.length > 0 ? delen.join(' ') : null
            },
          }),
          K('autkm', 'Hebt u meer dan {privekm} kilometer privé gereden met deze auto?', (c) => {
            const km = o(c)?.auto?.priveKm
            return jaNee(km === undefined || km > c.params.ondernemer.waarde.auto.priveKmGrens)
          }, { toon: cataloguspad }),
          Z('auttoegel', 'Jaar waarin de auto voor het eerst is toegelaten', (c) => antwoord(Number.isFinite(toelatingsjaar(c)) ? String(toelatingsjaar(c)) : null), {
            olaId: 'auttoegel',
            toon: cataloguspad,
          }),
          Z('autenergie', 'Op welk soort energie reed de auto?', (c) => antwoord(o(c)?.auto?.nulEmissie ? '100% elektriciteit' : 'Overig (zoals benzine, diesel, lpg of hybride)'), {
            olaId: 'autenergie',
            toon: cataloguspad,
          }),
          Z('autkost', 'Kosten voor deze auto', (c) => {
            const a = o(c)?.auto
            return bedrag(a ? Math.max(0, a.autokosten) + btwBuitenAutokosten(c) : null)
          }, {
            olaId: 'autkost',
            toon: (c) => bijtellingPrive(c) > 0,
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, auto`, ondernemingVeld(c, 'auto.autokosten')),
            hint: (c) => (btwBuitenAutokosten(c) > 0 ? `Inclusief de btw-correctie privégebruik auto (${formatEuro(btwBuitenAutokosten(c))}).` : null),
          }),
          Z('autafeigrek', 'Vanuit privémiddelen betaalde kosten voor deze auto', (c) => bedrag(o(c)?.auto?.eigenBijdrage), {
            olaId: 'autafeigrek',
            toon: (c) => bijtellingPrive(c) > 0,
          }),
          B('auto-onttrekking', 'Totaal onttrekking privégebruik auto', (c) => bedrag(bijtellingPrive(c))),
        ],
      },
      {
        id: 'stortingen',
        titel: 'Privéstortingen',
        velden: [
          Z('stortbdrgaang', 'Overige privéstortingen', (c) => bedrag(som(jr(c)?.stortingen, (x) => x.bedrag)), {
            olaId: 'stortbdrgaang',
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, jaarrekening (stortingen)`, ondernemingVeld(c, 'jaarrekening.stortingen')),
          }),
        ],
      },
    ],
  }

  const nietAftrekbaar: SchermDefinitie = {
    id: 'niet-aftrekbare-kosten',
    titel: 'Niet-aftrekbare kosten en lasten',
    menu: menuO('Niet-aftrekbare kosten en lasten'),
    herhaling: 'onderneming',
    toon: (c) => (or(c)?.correctieBeperktAftrekbaar ?? 0) > 0,
    rubrieken: [
      {
        id: 'gedeeltelijk',
        titel: 'Overige kosten en lasten die gedeeltelijk niet aftrekbaar zijn',
        velden: [
          Z('niet-aftrekbaar', 'Niet-aftrekbaar bedrag', (c) => bedrag(or(c)?.correctieBeperktAftrekbaar), {
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, beperkt aftrekbare kosten`, ondernemingVeld(c, 'beperktAftrekbaar')),
            hint: () => 'Omschrijving bijvoorbeeld: voedsel, drank en representatie.',
          }),
        ],
      },
    ],
  }

  const reserves: SchermDefinitie = {
    id: 'toelaatbare-reserves',
    titel: 'Wijzigingen in toelaatbare reserves',
    menu: menuO('Wijzigingen in toelaatbare reserves'),
    herhaling: 'onderneming',
    rubrieken: [
      {
        id: 'mutaties',
        velden: [
          Z('wtoeresafegaang', 'Afname egalisatiereserve', (c) => bedrag(som(or(c)?.egalisatiereserves, (e) => e.onttrekking + e.vrijval)), { olaId: 'wtoeresafegaang' }),
          Z('wtoeresafheraang', 'Afname herinvesteringsreserve', (c) => bedrag(som(or(c)?.herinvesteringsreserves, (h) => h.afboeking + h.vrijval)), { olaId: 'wtoeresafheraang' }),
          Z('wtoeresafoudaang', 'Afname oudedagsreserve', (c) => bedrag((or(c)?.verplichteForAfname ?? 0) + (or(c)?.forVrijwilligeAfname ?? 0)), {
            olaId: 'wtoeresafoudaang',
            herkomst: (c) => herkomst(`${ondernemingNaam(c)}, oudedagsreserve`, ondernemingVeld(c, 'for.stand')),
          }),
          Z('wtoerestoevegaang', 'Toevoeging egalisatiereserve', (c) => bedrag(som(or(c)?.egalisatiereserves, (e) => e.dotatie)), { olaId: 'wtoerestoevegaang' }),
          Z('wtoerestoevheraang', 'Toevoeging herinvesteringsreserve', (c) => bedrag(som(or(c)?.herinvesteringsreserves, (h) => h.dotatie)), { olaId: 'wtoerestoevheraang' }),
        ],
      },
    ],
  }

  const winstberekening: SchermDefinitie = {
    id: 'winstberekening',
    titel: 'Winstberekening',
    menu: menuO('Winstberekening'),
    herhaling: 'onderneming',
    toelichting: () => 'Het programma rekent dit zelf uit de vorige schermen. De investeringsaftrek staat in de aangifte apart; de tool telt hem al mee in de winst.',
    rubrieken: [
      {
        id: 'berekend',
        velden: [
          B('fiscale-winst', 'Fiscalewinstberekening', (c) => {
            const r = or(c)
            return bedrag(r ? r.winst + r.kia + r.eia + r.mia - r.desinvesteringsbijtelling : null)
          }),
          B('investeringsregelingen', 'Investeringsregelingen', (c) => {
            const r = or(c)
            return bedrag(r ? r.kia + r.eia + r.mia - r.desinvesteringsbijtelling : null)
          }),
        ],
      },
    ],
  }

  // --- Per persoon --------------------------------------------------------------------------------------------------

  const heeftOnderneming = (c: InvulhulpContext) => (p(c)?.ondernemingen.length ?? 0) > 0
  const elkJaarOndernemer = (c: InvulhulpContext) =>
    heeftOnderneming(c) && Math.min(...(p(c)?.ondernemingen ?? []).map((x) => x.startjaar)) <= c.jaar - c.params.ondernemer.waarde.startersaftrekBinnenJaren
  const nietBenut = (c: InvulhulpContext): number | null => {
    const overzicht = pr(c)?.ondernemersaftrek.nietBenutOverzicht
    if (overzicht) return som(overzicht.filter((x) => x.laatsteJaar >= c.jaar), (x) => x.begin)
    return som(p(c)?.nietBenutteZelfstandigenaftrek, (x) => x.bedrag)
  }

  const ondernemersaftrek: SchermDefinitie = {
    id: 'ondernemersaftrek',
    titel: 'Ondernemersaftrek',
    menu: ['Onderneming', 'Ondernemersaftrek'],
    herhaling: 'persoon',
    toon: heeftOnderneming,
    rubrieken: [
      {
        id: 'uren',
        titel: 'Urencriterium',
        velden: [
          K('urencriterium', 'Werkte u minimaal {uren} uur in de onderneming?', (c) => jaNee(Boolean(pr(c)?.urencriteriumGehaald)), {
            herkomst: (c) => herkomst(`${persoonNaam(p(c))}, uren`, ondernemingVeldVanPersoon(c, 'uren.onderneming')),
          }),
          K('elk-jaar', 'Was u in de periode {startersvan} tot en met [j-1] elk jaar ondernemer voor de inkomstenbelasting?', (c) => jaNee(elkJaarOndernemer(c))),
          K('grotendeels', 'Is meer dan {grotendeels} van uw werktijd besteed aan de onderneming?', (c) => jaNee(grotendeels(c)), { toon: elkJaarOndernemer }),
          K('starter', 'Hebt u in de periode {startersvan} tot en met [j-1] meer dan {starterskeer} keer zelfstandigenaftrek gekregen?', (c) =>
            jaNee(!(p(c)?.ondernemingen ?? []).some((_, i) => pr(c)?.ondernemingen[i]?.isStarter)),
          { toon: (c) => heeftOnderneming(c) && !elkJaarOndernemer(c) }),
        ],
      },
      {
        id: 'zelfstandigenaftrek',
        titel: 'Zelfstandigenaftrek',
        velden: [
          K('niet-gerealiseerd', 'Hebt u niet-gerealiseerde zelfstandigenaftrek uit vorige jaren?', (c) => jaNee((nietBenut(c) ?? 0) > 0)),
          Z('niet-gerealiseerd-bedrag', 'Niet-gerealiseerde zelfstandigenaftrek uit vorige jaren', (c) => bedrag(nietBenut(c)), {
            herkomst: (c) => herkomst(`${persoonNaam(p(c))}, voorlopige aanslag en verliezen`, persoonVeld(c, 'nietBenutteZelfstandigenaftrek')),
          }),
          K('so', 'Hebt u een Speur- en ontwikkelingswerkverklaring van RVO.nl?', (c) => jaNee((p(c)?.ondernemingen ?? []).some((x) => (x.soUren ?? 0) > 0))),
        ],
      },
      {
        id: 'meewerkaftrek',
        titel: 'Meewerkaftrek',
        velden: [
          K('meewerk-uren', 'Heeft <partner> in [jaar] minstens {meewerkuren} uur meegewerkt in de onderneming(en)?', (c) =>
            jaNee(meewerkende(c).some((x) => (x.meewerkendePartner?.uren ?? 0) >= (c.params.ondernemer.waarde.meewerkaftrek.staffel[0]?.vanafUren ?? 0))),
          { toon: (c) => meewerkende(c).length > 0 }),
          K('meewerk-vergoeding', 'Hebt u <partner> een vergoeding van {meewerkvergoeding} of meer betaald voor het meewerken?', (c) =>
            jaNee(meewerkende(c).some((x) => (x.meewerkendePartner?.vergoeding ?? 0) >= c.params.ondernemer.waarde.meewerkaftrek.maxVergoeding)),
          { toon: (c) => meewerkende(c).length > 0 }),
          K('meewerk-staking', 'Hebt u onteigeningswinst, stakingswinst of eindafrekeningswinst uit deze onderneming(en)?', (c) => jaNee(meewerkende(c).some((x) => Boolean(x.staking))), {
            toon: (c) => meewerkende(c).length > 0,
          }),
          Z('meewerk-klasse', 'Aantal uur dat <partner> heeft meegewerkt', (c) => antwoord(meewerkKlasse(c, Math.max(0, ...meewerkende(c).map((x) => x.meewerkendePartner?.uren ?? 0)))), {
            toon: (c) => meewerkende(c).length > 0,
          }),
        ],
      },
      {
        id: 'overig',
        velden: [
          K('stakingsaftrek', 'Hebt u stakingsaftrek gekregen in [j-1] of eerder?', (c) =>
            jaNee(
              (p(c)?.genotenStakingsaftrek ?? 0) > 0 ||
                (p(c)?.ondernemingen ?? []).some((x) => x.staking?.stakingsaftrekEerderGebruikt || (x.staking?.eerderGenotenStakingsaftrek ?? 0) > 0),
            ),
          { toon: (c) => (p(c)?.ondernemingen ?? []).some((x) => Boolean(x.staking)) }),
          K('wajong', 'Had u in [jaar] recht op een Wajong-uitkering?', (c) => jaNee((p(c)?.ondernemingen ?? []).some((x) => Boolean(x.arbeidsongeschiktStarter)))),
        ],
      },
      {
        id: 'berekend',
        velden: [
          B('zelfstandigenaftrek', 'Zelfstandigenaftrek', (c) => bedrag(pr(c)?.ondernemersaftrek.zelfstandigenaftrek)),
          B('totaal', 'Totaal ondernemersaftrek', (c) => bedrag(pr(c)?.ondernemersaftrek.totaal)),
          B('mkb', 'Mkb-winstvrijstelling', (c) => bedrag(pr(c)?.mkbVrijstelling)),
        ],
      },
    ],
  }

  const heeftLoon = (c: InvulhulpContext) => (p(c)?.loon ?? []).some((l) => l.soort === 'loon')
  const heeftUitkering = (c: InvulhulpContext) => (p(c)?.loon ?? []).some((l) => l.soort !== 'loon')
  const overigWerk = (c: InvulhulpContext) => (p(c)?.resultaatOverigWerk ?? 0) !== 0 || (pr(c)?.overigWerkDetail?.arbeidsbeloningPartner ?? 0) > 0

  const inkomsten: SchermDefinitie = {
    id: 'inkomsten',
    titel: 'Inkomsten',
    menu: ['Inkomsten'],
    herhaling: 'persoon',
    toelichting: () => 'Vink in het programma aan welke inkomsten <persoon> had.',
    toon: (c) => heeftLoon(c) || heeftUitkering(c) || overigWerk(c) || tbsGeteld(c).length > 0,
    rubrieken: [
      {
        id: 'selectie',
        velden: [
          K('loondienst', 'Inkomsten uit loondienst', () => AANVINKEN, { toon: heeftLoon }),
          K('uitkeringen', 'Pensioen en andere uitkeringen', () => AANVINKEN, { toon: heeftUitkering }),
          K('overig-werk', 'Inkomsten uit overig werk', () => AANVINKEN, { toon: overigWerk }),
          K('beschikbaar', 'Inkomsten uit het beschikbaar stellen van bezittingen aan een eigen bv of aan een onderneming van een fiscale partner', () => AANVINKEN, {
            toon: (c) => tbsGeteld(c).length > 0,
          }),
        ],
      },
    ],
  }

  const loonHerkomst = (c: InvulhulpContext, pad: string) => {
    const l = loonItem(c)
    return herkomst(`Loon en uitkeringen, ${l?.omschrijving || 'inkomen'}`, persoonVeld(c, `loon:${itemSleutel(l, c.item?.index ?? 0)}`, pad))
  }

  const loondienst: SchermDefinitie = {
    id: 'loondienst',
    titel: 'Inkomsten uit loondienst',
    menu: ['Inkomsten', 'Inkomsten uit loondienst', '<persoon>'],
    herhaling: 'persoon',
    toon: heeftLoon,
    rubrieken: [
      {
        id: 'werkgever',
        velden: [
          V('loon', 'Loon', (c) => bedrag(loonItem(c)?.bruto), VIA.werkgever, { herkomst: (c) => loonHerkomst(c, 'bruto') }),
          V('loonheffing', 'Loonheffing', (c) => bedrag(loonItem(c)?.ingehoudenLoonheffing), VIA.werkgever, {
            herkomst: (c) => loonHerkomst(c, 'ingehoudenLoonheffing'),
            hint: () => 'De arbeidskorting die je werkgever toepaste, staat ook vooraf ingevuld; die laat je staan.',
          }),
          K('ov', 'Reisde <persoon> met het openbaar vervoer naar het werk?', (c) => jaNee(Boolean(p(c)?.reisaftrekOV))),
        ],
        herhaal: (c) => herhaalItems(c, p(c)?.loon, 'loon', (l) => l.soort === 'loon', (l, i) => itemSleutel(l, i), (l, i) => l.omschrijving || `Werkgever ${i + 1}`),
      },
    ],
  }

  const SOORT_UITKERING: Record<string, string> = {
    pensioen: 'Pensioenuitkering of afkoopsom',
    'uwv-zez': 'Ziektewetuitkering of WAZO (soort uitkering: WAZO)',
  }

  const uitkeringen: SchermDefinitie = {
    id: 'uitkeringen',
    titel: 'Pensioen en andere uitkeringen',
    menu: ['Inkomsten', 'Pensioen en andere uitkeringen', '<persoon>'],
    herhaling: 'persoon',
    toon: heeftUitkering,
    rubrieken: [
      {
        id: 'uitkering',
        velden: [
          Z('soort', 'Soort inkomsten', (c) => antwoord(SOORT_UITKERING[loonItem(c)?.soort ?? ''] ?? 'Zoals op je jaaropgaaf'), {
            hint: (c) => (SOORT_UITKERING[loonItem(c)?.soort ?? ''] ? null : 'Kies het soort dat op je jaaropgaaf staat, bijvoorbeeld WW of WIA.'),
          }),
          V('uitkering', 'Uitkering', (c) => bedrag(loonItem(c)?.bruto), VIA.uitkering, { herkomst: (c) => loonHerkomst(c, 'bruto') }),
          V('loonheffing', 'Loonheffing', (c) => bedrag(loonItem(c)?.ingehoudenLoonheffing), VIA.uitkering, { herkomst: (c) => loonHerkomst(c, 'ingehoudenLoonheffing') }),
        ],
        herhaal: (c) => herhaalItems(c, p(c)?.loon, 'loon', (l) => l.soort !== 'loon', (l, i) => itemSleutel(l, i), (l, i) => l.omschrijving || `Uitkering ${i + 1}`),
      },
    ],
  }

  const beschikbaar: SchermDefinitie = {
    id: 'beschikbaar-gestelde-bezittingen',
    titel: 'Inkomsten uit beschikbaar gestelde bezittingen',
    menu: ['Inkomsten', 'Inkomsten uit beschikbaar gestelde bezittingen', '<persoon>'],
    herhaling: 'persoon',
    toon: (c) => tbsGeteld(c).length > 0,
    toelichting: () => 'Het programma past de vrijstelling voor terbeschikkingstelling zelf toe.',
    rubrieken: [
      {
        id: 'tbs',
        velden: [
          Z('inkomsten', 'Inkomsten', (c) => bedrag(tbsBedragen(c)?.inkomsten), {
            hint: (c) => {
              const delen: string[] = []
              const bw = tbsBedragen(c)?.boekwinst ?? 0
              if (bw > 0) delen.push(`Inclusief de boekwinst bij het einde of de verkoop (${formatEuro(bw)}).`)
              const niet = tbsVan(c).length - tbsGeteld(c).length
              if (niet > 0) delen.push(niet === 1 ? 'Eén terbeschikkingstelling telt niet mee en staat hier dus niet bij.' : `${niet} terbeschikkingstellingen tellen niet mee en staan hier dus niet bij.`)
              return delen.length > 0 ? delen.join(' ') : null
            },
          }),
          Z('kosten', 'Aftrekbare kosten', (c) => bedrag(tbsBedragen(c)?.kosten), {
            hint: (c) => ((tbsBedragen(c)?.boekwinst ?? 0) < 0 ? `Inclusief het boekverlies bij het einde of de verkoop (${formatEuro(-(tbsBedragen(c)?.boekwinst ?? 0))}).` : null),
          }),
          B('belastbaar', 'Belastbaar resultaat na vrijstelling', (c) => bedrag(pr(c)?.overigWerkDetail?.terbeschikkingstelling?.belastbaar)),
        ],
      },
    ],
  }

  const overigWerkScherm: SchermDefinitie = {
    id: 'overig-werk',
    titel: 'Inkomsten uit overig werk',
    menu: ['Inkomsten', 'Inkomsten uit overig werk', '<persoon>'],
    herhaling: 'persoon',
    toon: overigWerk,
    rubrieken: [
      {
        id: 'overig',
        velden: [
          Z('eigen', 'Inkomsten min aftrekbare kosten', (c) => bedrag(p(c)?.resultaatOverigWerk), {
            herkomst: (c) => herkomst('Loon en uitkeringen, overige werkzaamheden', persoonVeld(c, 'resultaatOverigWerk')),
            hint: () => 'Het programma vraagt inkomsten en kosten apart; de tool kent alleen het resultaat.',
          }),
          Z('arbeidsbeloning', 'Arbeidsbeloning uit de onderneming van <partner>', (c) => bedrag(pr(c)?.overigWerkDetail?.arbeidsbeloningPartner)),
        ],
      },
    ],
  }

  // --- Samen: woning, bezittingen, schulden --------------------------------------------------------------------------

  const ew = (c: InvulhulpContext) => c.invoer.eigenWoning

  const woningen: SchermDefinitie = {
    id: 'woningen',
    titel: 'Woningen en andere onroerende zaken',
    menu: ['Woningen en andere onroerende zaken'],
    herhaling: 'samen',
    toon: (c) => Boolean(ew(c)),
    rubrieken: [
      {
        id: 'woning',
        velden: [
          K('onroerend', 'Hadden u en <partner> in [jaar] onroerende zaken, zoals een eigen woning, een vakantiewoning, een verhuurd pand of een terrein?', () => jaNee(true)),
          Z('persit', 'Situatie op 01-01-[jaar]', () => antwoord('Woning: hoofdverblijf'), { olaId: 'persit' }),
          K('pereind', 'Gold deze situatie voor de rest van het jaar?', (c) => {
            const pe = ew(c)?.periodeHoofdverblijf
            return jaNee(!pe || (pe.van <= `${c.jaar}-01-01` && pe.tot >= `${c.jaar}-12-31`))
          }, { olaId: 'pereind' }),
          V('woz', 'WOZ-waarde in [jaar] (peildatum 1 januari [j-1])', (c) => bedrag(ew(c)?.woz), VIA.gemeente, {
            olaId: 'woz',
            herkomst: () => herkomst('Eigen woning, WOZ-waarde', veldVan.eigenWoning('woz')),
          }),
          K('erfpacht', 'Betaalde u of <partner> in [jaar] een periodieke erfpachtcanon voor deze woning?', (c) => jaNee((ew(c)?.erfpacht ?? 0) > 0)),
          Z('erfpacht-bedrag', 'Erfpachtcanon', (c) => bedrag(ew(c)?.erfpacht), { herkomst: () => herkomst('Eigen woning, erfpacht', veldVan.eigenWoning('erfpacht')) }),
          B('forfait', 'Eigenwoningforfait', (c) => bedrag(c.resultaat.eigenWoning?.forfait)),
        ],
      },
    ],
  }

  const groepen = (c: InvulhulpContext) => ({
    bank: posities(c, isBank).length > 0,
    beleggingen: posities(c, isBelegging).length > 0,
    crypto: posities(c, (x) => x.categorie === 'crypto').length > 0,
    uitgeleend: posities(c, (x) => x.categorie === 'vorderingen').length > 0,
    overig: posities(c, isOverig).length > 0,
    ab: (c.invoer.box2?.length ?? 0) > 0,
  })

  const bezittingen: SchermDefinitie = {
    id: 'bezittingen',
    titel: 'Bankrekeningen en andere bezittingen',
    menu: ['Bankrekeningen en andere bezittingen'],
    herhaling: 'samen',
    toon: (c) => Object.values(groepen(c)).some(Boolean),
    toelichting: () => `Vink in het programma aan welke bezittingen ${opties.bezittingenKop} op 1 januari [jaar] hadden.`,
    rubrieken: [
      {
        id: 'selectie',
        velden: [
          K('bank', 'Bank- en spaarrekeningen', () => AANVINKEN, { toon: (c) => groepen(c).bank, hint: () => 'Staat bij vooraf ingevulde rekeningen al aangevinkt.' }),
          K('ab', 'Aanmerkelijk belang', () => AANVINKEN, { toon: (c) => groepen(c).ab }),
          K('beleggingen', 'Beleggingen', () => AANVINKEN, { toon: (c) => groepen(c).beleggingen }),
          K('crypto', 'Cryptobezittingen', () => AANVINKEN, { toon: (c) => groepen(c).crypto }),
          K('uitgeleend', 'Uitgeleend geld en andere vorderingen', () => AANVINKEN, { toon: (c) => groepen(c).uitgeleend }),
          K('overig', 'Overige bezittingen', () => AANVINKEN, {
            toon: (c) => groepen(c).overig,
            hint: () => 'Contant geld alleen als het meer was dan {contant}.',
          }),
          K('grens', 'Waren al deze bezittingen op 1 januari [jaar] in totaal meer waard dan {grenstoeslagen}?', (c) => jaNee(c.resultaat.box3.vermogenToeslagen > grensBezittingen(c)), {
            hint: (c) => `Volgens de tool samen ${formatEuro(c.resultaat.box3.vermogenToeslagen)}. Dit grensbedrag geldt voor regelingen zoals de huurtoeslag.`,
          }),
        ],
      },
    ],
  }

  const positieHerkomst = (c: InvulhulpContext, pad: string) => {
    const x = positieItem(c)
    return herkomst(`Vermogen, ${x?.omschrijving || 'bezitting'}`, x ? veldVan.positie(x.id, pad) : undefined)
  }
  const herhaalPosities = (f: (x: VermogensPositie) => boolean, standaard: string) => (c: InvulhulpContext) =>
    herhaalItems(c, c.invoer.box3.posities, 'positie', (x) => f(x), (x) => x.id, (x, i) => x.omschrijving || `${standaard} ${i + 1}`)

  const bankrekeningen: SchermDefinitie = {
    id: 'bankrekeningen',
    titel: 'Bank- en spaarrekeningen',
    menu: ['Bankrekeningen en andere bezittingen', 'Bank- en spaarrekeningen'],
    herhaling: 'samen',
    toon: (c) => groepen(c).bank,
    rubrieken: [
      {
        id: 'rekening',
        velden: [
          V('saldo', 'Saldo op 1 januari [jaar]', (c) => bedrag(positieItem(c)?.waardeBegin), VIA.bank, {
            toon: (c) => positieItem(c)?.categorie === 'bankNL',
            herkomst: (c) => positieHerkomst(c, 'waardeBegin'),
          }),
          Z('saldo-buitenland', 'Saldo op 1 januari [jaar]', (c) => bedrag(positieItem(c)?.waardeBegin), {
            toon: (c) => positieItem(c)?.categorie === 'bankBuitenland',
            herkomst: (c) => positieHerkomst(c, 'waardeBegin'),
            hint: () => 'Een buitenlandse rekening staat niet vooraf ingevuld.',
          }),
          Z('rente', 'Rente', (c) => bedrag(positieItem(c)?.directeOpbrengsten), {
            toon: metWerkelijkRendement,
            herkomst: (c) => positieHerkomst(c, 'directeOpbrengsten'),
            hint: () => 'Rente staat nooit vooraf ingevuld.',
          }),
        ],
        herhaal: herhaalPosities(isBank, 'Rekening'),
      },
    ],
  }

  const aanmerkelijkBelang: SchermDefinitie = {
    id: 'aanmerkelijk-belang',
    titel: 'Aanmerkelijk belang',
    menu: ['Bankrekeningen en andere bezittingen', 'Aanmerkelijk belang'],
    herhaling: 'persoon',
    toon: (c) => (c.invoer.box2 ?? []).some((b) => b.eigenaar === c.persoon),
    rubrieken: [
      {
        id: 'belang',
        velden: [
          Z('regulier', 'Reguliere voordelen, zoals dividend', (c) => bedrag(box2Item(c)?.dividend), { herkomst: (c) => herkomst('Aanmerkelijk belang', box2Veld(c, 'dividend')) }),
          Z('divbel', 'Ingehouden dividendbelasting reguliere voordelen', (c) => bedrag(box2Item(c)?.ingehoudenDividendbelasting), {
            herkomst: (c) => herkomst('Aanmerkelijk belang', box2Veld(c, 'ingehoudenDividendbelasting')),
          }),
          K('verkocht', 'Verkocht u in [jaar] (een deel van) uw aanmerkelijk belang?', (c) => jaNee((box2Item(c)?.vervreemdingsvoordeel ?? 0) !== 0)),
          Z('vervreemding', 'Vervreemdingsvoordeel', (c) => bedrag(box2Item(c)?.vervreemdingsvoordeel), {
            herkomst: (c) => herkomst('Aanmerkelijk belang', box2Veld(c, 'vervreemdingsvoordeel')),
            hint: () => 'Het programma vraagt de overdrachtsprijs en de verkrijgingsprijs; het verschil is dit bedrag.',
          }),
        ],
        herhaal: (c) => herhaalItems(c, c.invoer.box2, 'box2', (b) => b.eigenaar === c.persoon, (b, i) => itemSleutel(b, i), (_, i) => `Aanmerkelijk belang ${i + 1}`),
      },
    ],
  }

  const uitkomstVanRegel = (c: InvulhulpContext, positie: VermogensPositie, regel: BronbelastingRegel) =>
    c.resultaat.box3.bronbelastingRegels?.find((u) => u.positieId === positie.id && u.regelId === regel.id)
  const regelUitkomst = (c: InvulhulpContext) => {
    const r = regelItem(c)
    return r ? uitkomstVanRegel(c, r.positie, r.regel) : undefined
  }
  /** "Buitenlandse belasting" bij Beleggingen: het verrekenbare deel, of zonder uitkomst per regel het ingehouden bedrag. */
  const buitenlandseBelasting = (c: InvulhulpContext, positie: VermogensPositie, regel: BronbelastingRegel): number =>
    uitkomstVanRegel(c, positie, regel)?.verrekenbaar ?? regel.bedrag
  /** Som van de hele euro's die bij Beleggingen onder "Buitenlandse belasting" staan (bevinding 3). */
  const buitenlandseBelastingTotaal = (c: InvulhulpContext): number =>
    posities(c, isBelegging).reduce((s, x) => s + bronbelastingRegels(x).reduce((t, r) => t + heleEuro(buitenlandseBelasting(c, x, r)), 0), 0)

  const beleggingen: SchermDefinitie = {
    id: 'beleggingen',
    titel: 'Beleggingen',
    menu: ['Bankrekeningen en andere bezittingen', 'Beleggingen'],
    herhaling: 'samen',
    toon: (c) => groepen(c).beleggingen,
    rubrieken: [
      {
        id: 'belegging',
        velden: [
          V('waarde', 'Waarde op 1 januari [jaar]', (c) => bedrag(positieItem(c)?.waardeBegin), VIA.belegging, { herkomst: (c) => positieHerkomst(c, 'waardeBegin') }),
          Z('waarde-eind', 'Waarde op 31 december [jaar]', (c) => bedrag(positieItem(c)?.waardeEind), { toon: metWerkelijkRendement, herkomst: (c) => positieHerkomst(c, 'waardeEind') }),
          Z('aankopen', 'Aankopen en stortingen in [jaar]', (c) => bedrag(positieItem(c)?.stortingen), { toon: metWerkelijkRendement, herkomst: (c) => positieHerkomst(c, 'stortingen') }),
          Z('verkopen', 'Verkopen en onttrekkingen in [jaar]', (c) => bedrag(positieItem(c)?.onttrekkingen), { toon: metWerkelijkRendement, herkomst: (c) => positieHerkomst(c, 'onttrekkingen') }),
          Z('dividend', 'Brutodividend op aandelen of rente op obligaties', (c) => bedrag(positieItem(c)?.directeOpbrengsten), {
            toon: metWerkelijkRendement,
            herkomst: (c) => positieHerkomst(c, 'directeOpbrengsten'),
          }),
          V('dividendbelasting', 'Ingehouden Nederlandse dividendbelasting', (c) => bedrag(positieItem(c)?.dividendbelasting ?? 0), VIA.dividend, {
            herkomst: (c) => positieHerkomst(c, 'dividendbelasting'),
          }),
          K('buitenlandse-belasting', 'Is er buitenlandse belasting ingehouden?', (c) => {
            const x = positieItem(c)
            return jaNee(Boolean(x) && bronbelastingRegels(x as VermogensPositie).length > 0)
          }),
        ],
        herhaal: herhaalPosities(isBelegging, 'Belegging'),
      },
      {
        id: 'buitenlandse-belasting',
        titel: 'Buitenlandse belasting',
        velden: [
          Z('land', 'Land', (c) => {
            const r = regelItem(c)
            return antwoord(r ? (landCode(r.regel.land) ?? r.regel.land) : null)
          }, {
            olaId: 'bnblbelgrktregelland',
            herkomst: (c) => {
              const r = regelItem(c)
              return herkomst(`Vermogen, ${r?.positie.omschrijving || 'belegging'}`, r ? veldVan.positie(r.positie.id, `bronbelasting:${r.regel.id}`, 'land') : undefined)
            },
          }),
          Z('btl', 'Buitenlandse belasting', (c) => {
            const r = regelItem(c)
            return bedrag(r ? buitenlandseBelasting(c, r.positie, r.regel) : null)
          }, {
            olaId: 'bnblbelgrktregelbtl',
            hint: (c) => {
              const u = regelUitkomst(c)
              if (!u) return 'Het verrekenbare deel rekent de tool zodra de bronbelasting per land klaar is. Tot dan staat hier het ingehouden bedrag.'
              return u.terugTeVragen > 0
                ? `Alleen het verrekenbare deel. Er is ${formatEuro(u.ingehouden)} ingehouden; ${formatEuro(u.terugTeVragen)} kun je misschien terugvragen in het bronland.`
                : 'Alleen het verrekenbare deel van de ingehouden belasting.'
            },
          }),
          Z('div', 'Dividend e.d.', (c) => bedrag(regelItem(c)?.regel.brutoInkomsten), { olaId: 'bnblbelgrktregeldiv' }),
        ],
        herhaal: (c) => {
          const uit: Array<{ sleutel: string; titel: string; ctx: InvulhulpContext }> = []
          for (const x of posities(c, isBelegging)) {
            bronbelastingRegels(x).forEach((r, i) => {
              const land = landCode(r.land) ?? r.land
              uit.push({
                sleutel: sleutelVan(`${x.id}.${r.id}`),
                titel: `${x.omschrijving || 'Belegging'} · ${land || 'land nog kiezen'}`,
                ctx: { ...c, item: { soort: 'bronbelasting', id: r.id, index: i, ouderId: x.id } },
              })
            })
          }
          return uit
        },
      },
    ],
  }

  const crypto: SchermDefinitie = {
    id: 'cryptobezittingen',
    titel: 'Cryptobezittingen',
    menu: ['Bankrekeningen en andere bezittingen', 'Cryptobezittingen'],
    herhaling: 'samen',
    toon: (c) => groepen(c).crypto,
    rubrieken: [
      {
        id: 'crypto',
        velden: [
          Z('waarde', 'Waarde op 1 januari [jaar]', (c) => bedrag(positieItem(c)?.waardeBegin), { herkomst: (c) => positieHerkomst(c, 'waardeBegin'), hint: () => 'Crypto staat niet vooraf ingevuld.' }),
          Z('waarde-eind', 'Waarde op 31 december [jaar]', (c) => bedrag(positieItem(c)?.waardeEind), { toon: metWerkelijkRendement }),
          Z('aankopen', 'Totaalbedrag aankopen in [jaar]', (c) => bedrag(positieItem(c)?.stortingen), { toon: metWerkelijkRendement }),
          Z('verkopen', 'Totaalbedrag verkopen in [jaar]', (c) => bedrag(positieItem(c)?.onttrekkingen), { toon: metWerkelijkRendement }),
          Z('opbrengsten', 'Totaalbedrag opbrengsten in [jaar]', (c) => bedrag(positieItem(c)?.directeOpbrengsten), { toon: metWerkelijkRendement }),
        ],
        herhaal: herhaalPosities((x) => x.categorie === 'crypto', 'Cryptobezitting'),
      },
    ],
  }

  const uitgeleend: SchermDefinitie = {
    id: 'uitgeleend-geld',
    titel: 'Uitgeleend geld',
    menu: ['Bankrekeningen en andere bezittingen', 'Uitgeleend geld'],
    herhaling: 'samen',
    toon: (c) => groepen(c).uitgeleend,
    rubrieken: [
      {
        id: 'vordering',
        velden: [
          Z('rente', 'Ontvangen rente in [jaar]', (c) => bedrag(positieItem(c)?.directeOpbrengsten), { toon: metWerkelijkRendement }),
          Z('waarde', 'Waarde op 1 januari [jaar]', (c) => bedrag(positieItem(c)?.waardeBegin), { herkomst: (c) => positieHerkomst(c, 'waardeBegin') }),
          Z('waarde-eind', 'Waarde op 31 december [jaar]', (c) => bedrag(positieItem(c)?.waardeEind), { toon: metWerkelijkRendement }),
          Z('verstrekt', 'Totaalbedrag verstrekte leningen in [jaar]', (c) => bedrag(positieItem(c)?.stortingen), { toon: metWerkelijkRendement }),
          Z('aflossingen', 'Totaalbedrag aflossingen in [jaar]', (c) => bedrag(positieItem(c)?.onttrekkingen), { toon: metWerkelijkRendement }),
        ],
        herhaal: herhaalPosities((x) => x.categorie === 'vorderingen', 'Vordering'),
      },
    ],
  }

  const overigeBezittingen: SchermDefinitie = {
    id: 'overige-bezittingen',
    titel: 'Overige bezittingen',
    menu: ['Bankrekeningen en andere bezittingen', 'Overige bezittingen'],
    herhaling: 'samen',
    toon: (c) => groepen(c).overig,
    rubrieken: [
      {
        id: 'bezitting',
        velden: [Z('waarde', 'Waarde op 1 januari [jaar]', (c) => bedrag(positieItem(c)?.waardeBegin), { herkomst: (c) => positieHerkomst(c, 'waardeBegin') })],
        herhaal: herhaalPosities(isOverig, 'Bezitting'),
      },
    ],
  }

  const splitsing = (c: InvulhulpContext) => {
    const l = leningdeelItem(c)
    if (!l) return undefined
    const s = c.resultaat.eigenWoning?.leningsplitsing?.find((x) => (l.id && x.id === l.id) || (!x.id && x.omschrijving === l.omschrijving))
    return s && (s.anderBegin > 0 || s.anderEind > 0 || s.renteAnder > 0) ? s : undefined
  }
  const leningHerkomst = (c: InvulhulpContext, pad: string) => {
    const l = leningdeelItem(c)
    return herkomst(`Eigen woning, ${l?.omschrijving || 'leningdeel'}`, veldVan.eigenWoning(`leningdeel:${itemSleutel(l, c.item?.index ?? 0)}`, pad))
  }
  const splitsVeld = (id: string, label: string, sleutel: 'eigenwoningBegin' | 'anderBegin' | 'eigenwoningEind' | 'anderEind' | 'renteEigenWoning' | 'renteAnder') =>
    Z(id, label, (c) => bedrag(splitsing(c)?.[sleutel] ?? 0), { olaId: id, altijd: true, toon: (c) => Boolean(splitsing(c)) })
  const schuldHerkomst = (c: InvulhulpContext, pad: string) => {
    const s = schuldItem(c)
    return herkomst(`Vermogen, ${s?.omschrijving || 'schuld'}`, s ? veldVan.schuld(s.id, pad) : undefined)
  }

  const hypotheken: SchermDefinitie = {
    id: 'hypotheken',
    titel: 'Hypotheken en andere schulden',
    menu: ['Hypotheken en andere schulden'],
    herhaling: 'samen',
    toon: (c) => (ew(c)?.leningdelen?.length ?? 0) > 0 || (ew(c)?.rente ?? 0) > 0 || c.invoer.box3.schulden.some((s) => s.herkomst?.bron !== 'eigenwoningschuld'),
    rubrieken: [
      {
        id: 'leningdeel',
        velden: [
          V('wrde0101', 'Schuld op 1 januari [jaar]', (c) => bedrag(leningdeelItem(c)?.standBegin ?? leningdeelItem(c)?.hoofdsom), VIA.hypotheek, {
            olaId: 'wrde0101',
            herkomst: (c) => leningHerkomst(c, 'standBegin'),
          }),
          V('wrde3112', 'Schuld op 31 december [jaar]', (c) => bedrag(leningdeelItem(c)?.standEind ?? leningdeelItem(c)?.hoofdsom), VIA.hypotheek, {
            olaId: 'wrde3112',
            herkomst: (c) => leningHerkomst(c, 'standEind'),
          }),
          V('rente', 'Betaalde rente in [jaar]', (c) => bedrag(leningdeelItem(c)?.rente), VIA.hypotheek, { olaId: 'rente', herkomst: (c) => leningHerkomst(c, 'rente') }),
          Z('startjaar', 'Jaar waarin deze lening is afgesloten', (c) => {
            const l = leningdeelItem(c)
            return antwoord(l ? leningKlasse(l.startdatum, c.jaar, opties.leningjaarKlassen) : null)
          }, { olaId: 'startjaar', herkomst: (c) => leningHerkomst(c, 'startdatum') }),
          K('annuitair', 'Is dit een annuïtaire of lineaire (hypothecaire) lening die u of <partner> in maximaal {aflosjaren} jaar aflost?', (c) =>
            jaNee(leningdeelItem(c)?.aflossingsvorm === 'annuitair' || leningdeelItem(c)?.aflossingsvorm === 'lineair'),
          ),
          splitsVeld('verd0101hfdvblf', 'Schuld op 1 januari [jaar], deel hoofdverblijf', 'eigenwoningBegin'),
          splitsVeld('verd0101ander', 'Schuld op 1 januari [jaar], ander deel', 'anderBegin'),
          splitsVeld('verd3112hfdvblf', 'Schuld op 31 december [jaar], deel hoofdverblijf', 'eigenwoningEind'),
          splitsVeld('verd3112ander', 'Schuld op 31 december [jaar], ander deel', 'anderEind'),
          splitsVeld('verdhfdrentehfdvblf', 'Rente in [jaar], deel hoofdverblijf', 'renteEigenWoning'),
          splitsVeld('verdhfdrenteander', 'Rente in [jaar], ander deel', 'renteAnder'),
        ],
        herhaal: (c) =>
          herhaalItems(c, ew(c)?.leningdelen, 'leningdeel', () => true, (l, i) => itemSleutel(l, i), (l, i) => l.omschrijving || `Leningdeel ${i + 1}`),
      },
      {
        id: 'rente-eenvoudig',
        velden: [
          V('rente', 'Betaalde rente in [jaar]', (c) => bedrag(ew(c)?.rente), VIA.hypotheek, {
            toon: (c) => !(ew(c)?.leningdelen?.length) && (ew(c)?.rente ?? 0) > 0,
            herkomst: () => herkomst('Eigen woning, hypotheekrente', veldVan.eigenWoning('rente')),
            hint: () => 'Het programma vraagt per lening ook de schuld op 1 januari en 31 december.',
          }),
        ],
      },
      {
        id: 'schuld',
        velden: [
          V('wrde0101', 'Schuld op 1 januari [jaar]', (c) => bedrag(schuldItem(c)?.waardeBegin), VIA.schuld, { herkomst: (c) => schuldHerkomst(c, 'waardeBegin') }),
          Z('wrde3112', 'Schuld op 31 december [jaar]', (c) => bedrag(schuldItem(c)?.waardeEind), { herkomst: (c) => schuldHerkomst(c, 'waardeEind') }),
          Z('rente', 'Betaalde rente in [jaar]', (c) => bedrag(schuldItem(c)?.betaaldeRente), { herkomst: (c) => schuldHerkomst(c, 'betaaldeRente') }),
        ],
        herhaal: (c) =>
          herhaalItems(c, c.invoer.box3.schulden, 'schuld', (s) => s.herkomst?.bron !== 'eigenwoningschuld', (s) => s.id, (s, i) => s.omschrijving || `Schuld ${i + 1}`),
      },
    ],
  }

  // --- Uitgaven en aanvullende vragen ------------------------------------------------------------------------------

  const iv = (c: InvulhulpContext) => p(c)?.inkomensvoorziening
  /** Premie voor de stakingslijfrente die de engine dit jaar meetelt (na de betaaltermijn; 0 zonder staking). */
  const stakingslijfrentePremie = (c: InvulhulpContext) => Math.max(0, pr(c)?.inkomensvoorziening.stakingslijfrente?.premie ?? 0)
  /**
   * Deel van de stakingslijfrente dat uit de vrijval van de oudedagsreserve komt (bevinding 6): `uitFor` van de engine,
   * min(aftrek, FOR-vrijval − aftrek FOR-omzetting). Het programma past de Zvw-correctie (`zvwCorrectieFor`) alleen toe
   * op wat bij "uit de oudedagsreserve" staat. Zonder `uitFor` (oudere uitkomst) hetzelfde uit zvwCorrectieFor − aftrek
   * FOR-omzetting.
   */
  const stakingslijfrenteUitFor = (c: InvulhulpContext) => {
    const r = pr(c)
    const uitFor = r?.inkomensvoorziening.stakingslijfrente?.uitFor
    const deel = uitFor ?? Math.max(0, (r?.zvwCorrectieFor ?? 0) - Math.max(0, r?.inkomensvoorziening.forOmzettingAftrek ?? 0))
    return Math.min(stakingslijfrentePremie(c), Math.max(0, deel))
  }
  /** Premie voor de stakingslijfrente betaald na het jaar, binnen de termijn (art. 3.130 lid 2): het programma vraagt die apart. */
  const stakingslijfrenteNaJaar = (c: InvulhulpContext) => {
    const op = iv(c)?.stakingslijfrente?.betaaldOp
    return op && op > `${c.jaar}-12-31` && stakingslijfrentePremie(c) > 0 ? op : null
  }

  const lijfrente: SchermDefinitie = {
    id: 'uitgaven-lijfrente',
    titel: 'Uitgaven voor lijfrente',
    menu: ['Uitgaven', 'Uitgaven voor lijfrente', '<persoon>'],
    herhaling: 'persoon',
    toon: (c) => (iv(c)?.lijfrentePremies ?? 0) > 0 || (iv(c)?.forOmzetting ?? 0) > 0 || stakingslijfrentePremie(c) > 0,
    toelichting: () => 'Deed <persoon> vorig jaar als ondernemer aangifte, dan rekent het programma de jaarruimte zelf. Vergelijk die met de jaarruimte hieronder.',
    rubrieken: [
      {
        id: 'premies',
        velden: [
          V('lijfrente', 'Uitgaven in [jaar]', (c) => bedrag(iv(c)?.lijfrentePremies), VIA.lijfrente, {
            toon: (c) => (iv(c)?.lijfrentePremies ?? 0) > 0,
            herkomst: (c) => herkomst('Pensioen en AOV, lijfrentepremies', persoonVeld(c, 'inkomensvoorziening.lijfrentePremies')),
          }),
          Z('lijfrente-volgend', 'Uitgaven in de periode 1 januari [jaar+1] tot en met {stakingslijfrentetot}', (c) => bedrag(stakingslijfrenteNaJaar(c) ? stakingslijfrentePremie(c) : null), {
            olaId: 'afttoelijfinlegvolg',
            toon: (c) => stakingslijfrenteNaJaar(c) !== null,
            herkomst: (c) => herkomst('Pensioen en AOV, stakingslijfrente', persoonVeld(c, 'inkomensvoorziening.stakingslijfrente.premie')),
            hint: (c) => `De premie voor je stakingslijfrente, betaald op ${datumTekst(stakingslijfrenteNaJaar(c))}. Die telt mee in [jaar]. Het programma vraagt dit bedrag bij de polis.`,
          }),
          Z('for', 'Bedrag aan lijfrentepremies dat u in [jaar] betaalde uit de oudedagsreserve, bij staking van een onderneming', (c) => bedrag((iv(c)?.forOmzetting ?? 0) + stakingslijfrenteUitFor(c)), {
            olaId: 'afttoelijfomzforstak',
            herkomst: (c) => herkomst('Pensioen en AOV, omzetting oudedagsreserve', persoonVeld(c, 'inkomensvoorziening.forOmzetting')),
            hint: (c) => {
              const deel = stakingslijfrenteUitFor(c)
              if (deel <= 0) return null
              const later = stakingslijfrenteNaJaar(c) ? ' Ook een premie die je in [jaar+1] betaalde, vul je hier in.' : ''
              return `Inclusief ${formatEuro(deel)} van de premie voor je stakingslijfrente: dat deel komt uit de vrijval van je oudedagsreserve. Daarover betaal je geen bijdrage Zvw.${later}`
            },
          }),
          Z('stakingswinst', 'Bedrag aan lijfrentepremies dat u in [jaar] betaalde uit alleen de stakingswinst', (c) => bedrag(stakingslijfrentePremie(c) - stakingslijfrenteUitFor(c)), {
            olaId: 'afttoelijfomzstakingswinst',
            herkomst: (c) => herkomst('Pensioen en AOV, stakingslijfrente', persoonVeld(c, 'inkomensvoorziening.stakingslijfrente.premie')),
            hint: (c) => {
              const delen: string[] = []
              if (stakingslijfrenteUitFor(c) > 0) delen.push('Het deel van de premie voor je stakingslijfrente dat niet uit de vrijval van je oudedagsreserve komt.')
              if (stakingslijfrenteNaJaar(c)) delen.push('Ook een premie die je in [jaar+1] betaalde, vul je hier in.')
              return delen.length > 0 ? delen.join(' ') : null
            },
          }),
          B('jaarruimte', '(Niet-gebruikte) jaarruimte in [jaar]', (c) => bedrag(pr(c)?.inkomensvoorziening.jaarruimte)),
          B('aftrek', 'Totaal aftrek lijfrente', (c) => bedrag(pr(c)?.inkomensvoorziening.lijfrenteAftrek)),
        ],
      },
    ],
  }

  const aov: SchermDefinitie = {
    id: 'uitgaven-inkomensvoorzieningen',
    titel: 'Uitgaven andere inkomensvoorzieningen',
    menu: ['Uitgaven', 'Uitgaven andere inkomensvoorzieningen', '<persoon>'],
    herhaling: 'persoon',
    toon: (c) => (iv(c)?.aovPremies ?? 0) > 0,
    rubrieken: [
      {
        id: 'aov',
        titel: 'Arbeidsongeschiktheidsverzekering',
        velden: [
          Z('aov', 'Bedrag', (c) => bedrag(iv(c)?.aovPremies), {
            herkomst: (c) => herkomst('Pensioen en AOV, AOV-premies', persoonVeld(c, 'inkomensvoorziening.aovPremies')),
            hint: () => 'Alleen een verzekering die je zelf hebt afgesloten en betaald.',
          }),
        ],
      },
    ],
  }

  const pga = (c: InvulhulpContext) => c.invoer.pga
  const giften: SchermDefinitie = {
    id: 'giften',
    titel: 'Giften',
    menu: ['Uitgaven', 'Giften'],
    herhaling: 'samen',
    toon: (c) => (pga(c)?.giftenGewoon ?? 0) + (pga(c)?.giftenPeriodiek ?? 0) + (pga(c)?.giftenCultureel ?? 0) > 0,
    toelichting: () => 'Het programma vraagt per gift aan wie en hoeveel. De tool kent alleen de totalen; die moeten samen kloppen.',
    rubrieken: [
      {
        id: 'giften',
        velden: [
          Z('gewoon', 'Gewone giften', (c) => bedrag(pga(c)?.giftenGewoon), { herkomst: () => herkomst('Persoonsgebonden aftrek, giften', 'pga/giftenGewoon') }),
          Z('periodiek', 'Periodieke giften (schriftelijk vastgelegd)', (c) => bedrag(pga(c)?.giftenPeriodiek), { herkomst: () => herkomst('Persoonsgebonden aftrek, giften', 'pga/giftenPeriodiek') }),
          Z('cultureel', 'Giften aan een culturele instelling', (c) => bedrag(pga(c)?.giftenCultureel), { herkomst: () => herkomst('Persoonsgebonden aftrek, giften', 'pga/giftenCultureel') }),
        ],
      },
    ],
  }

  const zorgkosten: SchermDefinitie = {
    id: 'zorgkosten',
    titel: 'Zorgkosten',
    menu: ['Uitgaven', 'Zorgkosten'],
    herhaling: 'samen',
    toon: (c) => (pga(c)?.specifiekeZorgkosten ?? 0) > 0,
    rubrieken: [
      {
        id: 'zorgkosten',
        velden: [
          Z('zorgkosten', 'Specifieke zorgkosten', (c) => bedrag(pga(c)?.specifiekeZorgkosten), {
            herkomst: () => herkomst('Persoonsgebonden aftrek, zorgkosten', 'pga/specifiekeZorgkosten'),
          }),
        ],
      },
    ],
  }

  const vaIB = (c: InvulhulpContext) => p(c)?.voorlopigeAanslagIB ?? 0
  const vaZvw = (c: InvulhulpContext) => p(c)?.voorlopigeAanslagZvw ?? 0

  const aanvullend: SchermDefinitie = {
    id: 'aanvullende-vragen',
    titel: 'Aanvullende vragen',
    menu: ['Aanvullende vragen'],
    herhaling: 'persoon',
    rubrieken: [
      {
        id: 'voorlopige-aanslag',
        titel: 'Voorlopige aanslagen [jaar]',
        velden: [
          K('va-keuze', 'Maak een keuze, ontvangen of betaald', (c) => antwoord(vaIB(c) < 0 ? 'Ontvangen' : 'Betaald'), { toon: (c) => vaIB(c) !== 0 || vaZvw(c) !== 0 }),
          V('va-ib', 'Bedrag, voorlopige aanslag inkomstenbelasting en premie volksverzekeringen [jaar]', (c) => bedrag(Math.abs(vaIB(c))), VIA.belastingdienst, {
            toon: (c) => vaIB(c) !== 0 || vaZvw(c) !== 0,
            herkomst: (c) => herkomst('Voorlopige aanslag en verliezen', persoonVeld(c, 'voorlopigeAanslagIB')),
          }),
          Z('va-dagtekening', 'Dagtekening voorlopige aanslag', (c) => tekst(datumNL(p(c)?.voorlopigeAanslagDetails?.ib?.dagtekening)), {
            toon: (c) => vaIB(c) < 0,
            hint: () => 'Het programma vraagt de dagtekening als je geld hebt ontvangen.',
          }),
          V('va-zvw', 'Voorlopige aanslag Zorgverzekeringswet [jaar]', (c) => bedrag(Math.abs(vaZvw(c))), VIA.belastingdienst, {
            toon: (c) => vaIB(c) !== 0 || vaZvw(c) !== 0,
            herkomst: (c) => herkomst('Voorlopige aanslag en verliezen', persoonVeld(c, 'voorlopigeAanslagZvw')),
          }),
        ],
      },
      {
        id: 'verliezen',
        titel: 'Te verrekenen verliezen',
        velden: [
          Z('verlies-box1', 'Te verrekenen verliezen uit werk en woning van {verliesvan} tot en met [j-1]', (c) => bedrag(som(p(c)?.verliezen, (v) => v.bedrag)), {
            herkomst: (c) => herkomst('Voorlopige aanslag en verliezen', persoonVeld(c, 'verliezen')),
          }),
          Z('verlies-box2', 'Te verrekenen verliezen uit aanmerkelijk belang', (c) => bedrag(som(p(c)?.box2Verliezen, (v) => v.bedrag))),
        ],
      },
      {
        id: 'dubbele-belasting',
        titel: 'Aftrek om dubbele belasting te voorkomen',
        velden: [
          Z('restant-buitenlandse-belasting', 'Bedrag van deze buitenlandse belasting (restant over [j-1] of eerder)', (c) => bedrag(p(c)?.voortgewenteldeBronbelasting), {
            hint: () => 'Het bedrag dat nog niet is verrekend; het staat op je laatste definitieve aanslag.',
          }),
        ],
      },
      {
        id: 'uitspraak',
        titel: 'Aanvragen uitspraak van de Belastingdienst',
        velden: [
          K('uitspraak', 'Hebt u in deze aangifte gegevens ingevuld waarover u een expliciete uitspraak van de Belastingdienst wilt?', () => jaNee(false), {
            hint: () => 'Deze vraag is voor een echt standpunt over een gegeven; meestal is het antwoord Nee.',
          }),
        ],
      },
    ],
  }

  const werkelijkRendement: SchermDefinitie = {
    id: 'werkelijk-rendement',
    titel: 'Werkelijk rendement',
    menu: ['Werkelijk rendement'],
    herhaling: 'samen',
    toon: (c) => c.invoer.box3.posities.length > 0 && c.params.box3.waarde.tegenbewijs.kanaal !== 'geen',
    melding: (c) =>
      c.params.box3.waarde.tegenbewijs.kanaal === 'owr-formulier'
        ? {
            tekst: 'Over [jaar] geef je het werkelijk rendement niet op in de aangifte, maar met het aparte formulier Opgaaf werkelijk rendement, na een brief van de Belastingdienst. De bedragen staan bij je bezittingen in de invoer.',
          }
        : null,
    rubrieken: [
      {
        id: 'keuze',
        velden: [
          K('werkelijk-rendement', 'Wilt u in deze aangifte het werkelijk rendement in box 3 van u en <partner> aangeven over [jaar]?', (c) => jaNee(Boolean(c.invoer.box3.tegenbewijs)), {
            toon: (c) => c.params.box3.waarde.tegenbewijs.kanaal === 'aangifte',
            herkomst: () => herkomst('Vermogen, tegenbewijs'),
            hint: () => 'Het programma past het rendement toe dat voor jullie het voordeligst is.',
          }),
        ],
      },
    ],
  }

  // --- Verdelen ---------------------------------------------------------------------------------------------------

  const potSamen = (c: InvulhulpContext) => c.resultaat.box3.potten?.find((x) => x.personen.length > 1)
  /** Aandeel van de aangever in de grondslag sparen en beleggen (zonder grondslag: de verdeling van box 3). */
  const aandeelGrondslag = (c: InvulhulpContext): number => {
    const d = potSamen(c)?.grondslagDeel
    const a = d?.A ?? 0
    const b = d?.B ?? 0
    return a + b > 0 ? a / (a + b) : verdelingVan(c).box3
  }
  /** Een gezamenlijke post: Totaal (rekent het programma), deel A en deel B in hele euro's. */
  const post = (
    id: string,
    titel: string,
    verdeling: string,
    delen: (c: InvulhulpContext) => { a: number; b: number; totaal: number } | null,
    extra?: { hint?: string },
  ): RubriekDefinitie => ({
    id,
    titel,
    velden: [
      B(`${id}-totaal`, 'Totaal', (c) => bedrag(delen(c)?.totaal ?? null), { toon: (c) => Boolean(delen(c)) }),
      Z(`${id}-a`, 'Deel <aangever>', (c) => bedrag(delen(c)?.a ?? null), {
        toon: (c) => Boolean(delen(c)),
        altijd: true,
        herkomst: () => herkomst('Verdeling tussen partners', `verdeling/${verdeling}`),
      }),
      Z(`${id}-b`, 'Deel <partner>', (c) => bedrag(delen(c)?.b ?? null), {
        toon: (c) => Boolean(delen(c)),
        altijd: true,
        herkomst: () => herkomst('Verdeling tussen partners', `verdeling/${verdeling}`),
        ...(extra?.hint ? { hint: () => extra.hint as string } : {}),
      }),
    ],
  })
  const verdeel = (totaal: number | null | undefined, aandeel: number) => (totaal ? verdeelEuro(totaal, aandeel) : null)

  const verdelen: SchermDefinitie = {
    id: 'verdelen',
    titel: 'Verdelen',
    menu: ['Verdelen'],
    herhaling: 'samen',
    toon: (c) => heeftPartner(c.invoer) && c.invoer.personen.length === 2,
    toelichting: () =>
      'Het programma werkt met hele euro’s. Vul bij elke post het deel van ieder in; samen is dat het totaal. Klik daarna in het programma op Belasting berekenen.',
    rubrieken: [
      post('eigen-woning', 'Eigen woning', 'eigenWoning', (c) => verdeel(c.resultaat.eigenWoning?.saldo, verdelingVan(c).eigenWoning)),
      post('box2', 'Voordeel uit aanmerkelijk belang', 'box2', (c) => {
        const i = c.resultaat.box2.inkomen
        const a = Math.round(i.A ?? 0) + 0
        const b = Math.round(i.B ?? 0) + 0
        return a + b !== 0 ? { a, b, totaal: a + b } : null
      }),
      post('box3', 'Grondslag voordeel uit sparen en beleggen', 'box3', (c) => {
        const pot = potSamen(c)
        if (!pot || pot.grondslag <= 0) return null
        if (pot.grondslagDeel) return { a: pot.grondslagDeel.A ?? 0, b: pot.grondslagDeel.B ?? 0, totaal: (pot.grondslagDeel.A ?? 0) + (pot.grondslagDeel.B ?? 0) }
        return verdeelEuro(pot.grondslag, verdelingVan(c).box3)
      }),
      post('giften', 'Giften', 'pga', (c) => verdeel(c.resultaat.pga?.giften, verdelingVan(c).pga)),
      post('zorgkosten', 'Zorgkosten', 'pga', (c) => verdeel(c.resultaat.pga?.zorgkosten, verdelingVan(c).pga)),
      post('dividendbelasting', 'Ingehouden dividendbelasting', 'dividendbelasting', (c) => verdeel(c.resultaat.box3.dividendbelasting, verdelingVan(c).dividendbelasting)),
      // Bevinding 3: de buitenlandse belasting van dit jaar zoals bij Beleggingen ingevuld (niet het verrekende bedrag met
      // de voortwenteling, die staat bij Aftrek om dubbele belasting te voorkomen), verdeeld zoals de engine het
      // verrekenbare bedrag per persoon verdeelt (volgens de grondslag). Ook als er niets verrekend wordt.
      post('bronbelasting', 'Buitenlandse bronbelasting dividend', 'box3', (c) => {
        const totaal = buitenlandseBelastingTotaal(c)
        if (totaal <= 0) return null
        const deel = (id: 'A' | 'B') => Math.max(0, c.resultaat.personen.find((x) => x.id === id)?.bronbelasting?.verrekenbaar ?? 0)
        return verdeelEuro(totaal, deel('A') + deel('B') > 0 ? deel('A') / (deel('A') + deel('B')) : aandeelGrondslag(c))
      }, { hint: 'Verdeel op dezelfde manier als de grondslag sparen en beleggen.' }),
    ],
  }

  const verdelenGrondslag: SchermDefinitie = {
    id: 'verdelen-rendementsgrondslag',
    titel: 'Verdelen rendementsgrondslag',
    menu: ['Verdelen rendementsgrondslag'],
    herhaling: 'samen',
    toon: (c) => heeftPartner(c.invoer) && c.invoer.personen.length === 2 && c.resultaat.box3.vermogenToeslagen > 0,
    toelichting: () => 'Deze verdeling verandert niets aan de belasting; de bedragen gaan naar Toeslagen.',
    rubrieken: [post('rendementsgrondslag', 'Vermogen voor inkomensafhankelijke regelingen, zoals toeslagen', 'box3', (c) => verdeel(c.resultaat.box3.vermogenToeslagen, verdelingVan(c).box3))],
  }

  // --- Overzicht en verzenden ---------------------------------------------------------------------------------------

  const overzicht: SchermDefinitie = {
    id: 'overzicht',
    titel: 'Overzicht belasting en premies',
    menu: ['Overzicht belasting en premies'],
    herhaling: 'persoon',
    rubrieken: [
      {
        id: 'berekend',
        velden: [
          B('te-betalen-ib', 'Te betalen inkomstenbelasting en premie volksverzekeringen', (c) => bedrag(pr(c)?.teBetalenIB), { toon: (c) => (pr(c)?.teBetalenIB ?? 0) >= 0 }),
          B('terug-ib', 'Terug te krijgen inkomstenbelasting en premie volksverzekeringen', (c) => bedrag(-(pr(c)?.teBetalenIB ?? 0)), { toon: (c) => (pr(c)?.teBetalenIB ?? 0) < 0 }),
          B('te-betalen-zvw', 'Te betalen bijdrage Zorgverzekeringswet', (c) => bedrag(pr(c)?.zvw.teBetalen), { toon: (c) => (pr(c)?.zvw.teBetalen ?? 0) >= 0 }),
          B('terug-zvw', 'Terug te krijgen bijdrage Zorgverzekeringswet', (c) => bedrag(-(pr(c)?.zvw.teBetalen ?? 0)), { toon: (c) => (pr(c)?.zvw.teBetalen ?? 0) < 0 }),
          B('zvw-correctie-for', 'Aftrekbare lijfrentepremies voor ondernemers vanwege een afname van de oudedagsreserve bij staking', (c) => bedrag(pr(c)?.zvwCorrectieFor), {
            toon: (c) => (pr(c)?.zvwCorrectieFor ?? 0) > 0,
          }),
          B('verzamelinkomen', 'Verzamelinkomen', (c) => bedrag(pr(c)?.verzamelinkomen)),
        ],
      },
    ],
  }

  const naarVerzenden: SchermDefinitie = {
    id: 'naar-verzenden',
    titel: 'Naar verzenden',
    menu: ['Naar verzenden'],
    herhaling: 'samen',
    toelichting: (c) =>
      heeftPartner(c.invoer)
        ? 'Klopt alles, klik dan in het programma op Opslaan en naar verzenden. Je partner logt daarna in met DigiD om te ondertekenen; jullie krijgen ieder een eigen aanslag.'
        : 'Klopt alles, klik dan in het programma op Opslaan en naar verzenden en onderteken met DigiD.',
    rubrieken: [],
  }

  return [
    introductie,
    persoonlijk,
    partner,
    kinderen,
    ondernemingSelectie,
    gegevensOnderneming,
    selectievragen,
    winstEnVerlies,
    balansActiva,
    balansPassiva,
    kia,
    desinvestering,
    stakingswinst,
    prive,
    nietAftrekbaar,
    reserves,
    winstberekening,
    ondernemersaftrek,
    inkomsten,
    loondienst,
    uitkeringen,
    beschikbaar,
    overigWerkScherm,
    woningen,
    bezittingen,
    bankrekeningen,
    aanmerkelijkBelang,
    beleggingen,
    crypto,
    uitgeleend,
    overigeBezittingen,
    hypotheken,
    lijfrente,
    aov,
    giften,
    zorgkosten,
    aanvullend,
    werkelijkRendement,
    verdelen,
    verdelenGrondslag,
    overzicht,
    naarVerzenden,
  ]
}
