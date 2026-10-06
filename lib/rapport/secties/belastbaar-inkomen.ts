/**
 * Hoofdstuk 3 Belastbaar inkomen (spec 3.1 tot en met 3.3, koppeling hoofdstuk 5).
 *
 * Huishoudposten (eigen woning, box 3, persoonsgebonden aftrek) staan eerst voor het huishouden en daarna
 * verdeeld (koppeling hoofdstuk 12). Box 3 toont de pot waar deze persoon in zit: bij fiscale partners alle
 * posities van beiden, anders de eigen posities.
 */
import type { Box3Pot, Box3SchijfRegel } from '@/lib/tax/types'
import type { Blok, Kolom, Regel, Sectie } from '../model'
import { BOX3_GROEPEN, box3Groep, rendementPerGroep, type Box3Groep } from '../afleiden'
import { bedrag, periode, percentage, telwoord } from '../notatie'
import { groepskop, inv, kk, kd, kopTekst, post, sectie, som, subkop, subtotaal, tabel, totaal, uit, type MogelijkeRegel, type RapportContext } from './bouwstenen'
import { landenTekst } from './bronbelasting'

// ---------------------------------------------------------------------------
// 3.1 Box 1
// ---------------------------------------------------------------------------

function winstUitOnderneming(c: RapportContext): Sectie | null {
  const p = c.p
  const os = p.ondernemingen
  if (c.pi.ondernemingen.length === 0 || os.length === 0) return null
  const P = '3.1.1'
  const oa = p.ondernemersaftrek
  const beperkt = som(os.map((o) => o.correctieBeperktAftrekbaar))
  const auto = som(os.map((o) => o.bijtellingAuto))
  const investering = som(os.map((o) => -(o.kia + o.eia + o.mia) + o.desinvesteringsbijtelling))
  const forAfname = som(os.map((o) => o.verplichteForAfname + (o.forVrijwilligeAfname ?? 0)))
  const forDotatie = som(os.map((o) => o.forDotatie ?? 0))
  const correcties = som(os.map((o) => o.winst - o.saldo))
  const metCorrecties = [beperkt, auto, investering, forAfname, forDotatie].some((x) => x !== 0)
  const naAftrek = p.winstUitOnderneming - oa.totaal

  const regels: MogelijkeRegel[] = [
    groepskop(`${P}.saldo.kop`, 'Saldo fiscale winstberekeningen ondernemingen'),
    ...os.map((o, i) => post(`${P}.onderneming.${i + 1}`, o.naam, { B: o.saldo }, { herkomst: uit(c, `ondernemingen[${i}].saldo`), ...(i === os.length - 1 ? { streepOnder: ['B' as Kolom] } : {}) })),
    post(`${P}.fiscale-winstberekening`, 'Fiscale winstberekening', { C: som(os.map((o) => o.saldo)) }, { witVoor: 1, herkomst: `som(${uit(c, 'ondernemingen[].saldo')})` }),
    beperkt !== 0 && post(`${P}.beperkt-aftrekbaar`, 'Niet of gedeeltelijk aftrekbare kosten', { B: beperkt }, { herkomst: `som(${uit(c, 'ondernemingen[].correctieBeperktAftrekbaar')})` }),
    auto !== 0 && post(`${P}.bijtelling-auto`, 'Bijtelling privégebruik auto', { B: auto }, { herkomst: `som(${uit(c, 'ondernemingen[].bijtellingAuto')})` }),
    investering !== 0 &&
      post(`${P}.investeringsregelingen`, 'Investeringsregelingen', { B: investering }, { herkomst: `som(-(kia + eia + mia) + desinvesteringsbijtelling) van ${uit(c, 'ondernemingen[]')}` }),
    forAfname !== 0 && post(`${P}.for-afname`, 'Afneming fiscale oudedagsreserve', { B: forAfname }, { herkomst: `som(verplichteForAfname + forVrijwilligeAfname) van ${uit(c, 'ondernemingen[]')}` }),
    forDotatie !== 0 && post(`${P}.for-dotatie`, 'Toevoeging aan de fiscale oudedagsreserve', { B: -forDotatie }, { herkomst: `-som(${uit(c, 'ondernemingen[].forDotatie')})` }),
    metCorrecties && subtotaal(`${P}.totaal-correcties`, 'Totaal winstcorrecties', { C: correcties }, { streepBoven: ['B'], herkomst: `som(winst - saldo) van ${uit(c, 'ondernemingen[]')}` }),
    subtotaal(`${P}.winst`, 'Winst uit onderneming', { C: p.winstUitOnderneming }, { streepBoven: ['C'], herkomst: uit(c, 'winstUitOnderneming') }),
    post(`${P}.zelfstandigenaftrek`, 'Zelfstandigenaftrek', { B: oa.zelfstandigenaftrek }, { herkomst: uit(c, 'ondernemersaftrek.zelfstandigenaftrek') }),
    oa.verrekendNietBenut !== 0 &&
      post(`${P}.niet-benut-verrekend`, 'Verrekening niet-benutte zelfstandigenaftrek eerdere jaren', { B: oa.verrekendNietBenut }, { herkomst: uit(c, 'ondernemersaftrek.verrekendNietBenut') }),
    oa.startersaftrek !== 0 && post(`${P}.startersaftrek`, 'Startersaftrek', { B: oa.startersaftrek }, { herkomst: uit(c, 'ondernemersaftrek.startersaftrek') }),
    oa.startersaftrekAO !== 0 &&
      post(`${P}.startersaftrek-ao`, 'Startersaftrek bij arbeidsongeschiktheid', { B: oa.startersaftrekAO }, { herkomst: uit(c, 'ondernemersaftrek.startersaftrekAO') }),
    oa.soAftrek !== 0 && post(`${P}.so-aftrek`, 'Aftrek speur- en ontwikkelingswerk', { B: oa.soAftrek }, { herkomst: uit(c, 'ondernemersaftrek.soAftrek') }),
    oa.meewerkaftrek !== 0 && post(`${P}.meewerkaftrek`, 'Meewerkaftrek', { B: oa.meewerkaftrek }, { herkomst: uit(c, 'ondernemersaftrek.meewerkaftrek') }),
    oa.stakingsaftrek !== 0 && post(`${P}.stakingsaftrek`, 'Stakingsaftrek', { B: oa.stakingsaftrek }, { herkomst: uit(c, 'ondernemersaftrek.stakingsaftrek') }),
    subtotaal(`${P}.totaal-ondernemersaftrek`, 'Totaal ondernemersaftrek', { C: -oa.totaal }, { streepBoven: ['B'], herkomst: `-${uit(c, 'ondernemersaftrek.totaal')}` }),
    subtotaal(`${P}.na-aftrek`, 'Winst uit onderneming na aftrek', { C: naAftrek }, { streepBoven: ['C'], herkomst: `${uit(c, 'winstUitOnderneming')} - ${uit(c, 'ondernemersaftrek.totaal')}` }),
    post(`${P}.mkb`, 'MKB-winstvrijstelling', { C: -p.mkbVrijstelling }, { herkomst: `-${uit(c, 'mkbVrijstelling')}` }),
    subtotaal(`${P}.belastbare-winst`, 'Belastbare winst uit onderneming', { C: p.belastbareWinst }, { streepBoven: ['C'], herkomst: uit(c, 'belastbareWinst') }),
  ]
  return sectie('Winst uit onderneming', 3, [tabel(regels)])
}

function eigenWoning(c: RapportContext): Sectie | null {
  const ew = c.r.eigenWoning
  const ewi = c.invoer.eigenWoning
  if (!ew || !ewi) return null
  const P = '3.1.2'
  const p = c.p
  const adres = c.opties.gegevens?.adres?.straat?.trim()
  const hoofdverblijf = ewi.periodeHoofdverblijf ? periode(ewi.periodeHoofdverblijf.van, ewi.periodeHoofdverblijf.tot) : periode(`${c.jaar}-01-01`, `${c.jaar}-12-31`)

  const woning = tabel(
    [
      post(`${P}.woning`, adres || 'Eigen woning', { N: ewi.woz, B: ew.forfait }, {
        teksten: { Z: percentage(1, 'geheel'), A: hoofdverblijf },
        herkomst: 'eigenWoning.forfait',
      }),
    ],
    { koppen: [kk('omschrijving', 'Adres'), kk('N', '(WOZ-)waarde'), kk('Z', 'Deel'), kk('A', 'Periode', 'hoofdverblijf'), kk('B', 'Forfait')] },
  )

  const leningRegels: Regel[] =
    ew.leningdelen && ew.leningdelen.length > 0
      ? ew.leningdelen.map((l, i) =>
          post(`${P}.lening.${i + 1}`, l.omschrijving, { A: l.betaaldeRente }, { herkomst: `invoer.eigenWoning.leningdelen[${i}].rente` }),
        )
      : [post(`${P}.lening.1`, 'Eigenwoningschuld', { A: ewi.rente ?? 0 }, { herkomst: 'invoer.eigenWoning.rente' })]
  const rente = ew.rente ?? ew.aftrekbareKosten - (ew.financieringskosten ?? 0) - (ew.erfpacht ?? 0)
  // Betaalde rente die niet aftrekbaar is (geen eigenwoningschuld, of de termijn van de renteaftrek loopt af): een
  // eigen regel in kolom A, zodat de betaalde rente optelt tot de aftrekbare rente in het subtotaal.
  const nietAftrekbaar = (ew.leningdelen ?? []).filter((l) => l.betaaldeRente !== l.aftrekbareRente)
  const nietAftrekbaarBedrag = som(nietAftrekbaar.map((l) => l.betaaldeRente - l.aftrekbareRente))
  const nietAftrekbaarReden = nietAftrekbaar.every((l) => !l.kwalificerend)
    ? ' (geen eigenwoningschuld)'
    : nietAftrekbaar.every((l) => l.kwalificerend)
      ? ' (einde termijn renteaftrek)'
      : ''
  const toegerekend = p.eigenWoning
  const verschoven = toegerekend - ew.saldo
  const toonVerdeling = c.partners || verschoven !== 0
  const aflossingseisJaar = c.P.eigenWoning.waarde.aflossingseisVanaf.slice(0, 4)

  const schuld = tabel(
    [
      ...leningRegels,
      nietAftrekbaarBedrag !== 0 &&
        post(`${P}.niet-aftrekbaar`, `Niet aftrekbare rente${nietAftrekbaarReden}`, { A: -nietAftrekbaarBedrag }, {
          herkomst: 'som(eigenWoning.leningdelen[].aftrekbareRente - eigenWoning.leningdelen[].betaaldeRente)',
        }),
      subtotaal(`${P}.aftrekbare-rente`, undefined, { B: -rente }, { streepBoven: ['A'], herkomst: '-eigenWoning.rente' }),
      (ew.financieringskosten ?? 0) > 0 && post(`${P}.financieringskosten`, 'Kosten van geldleningen', { B: -(ew.financieringskosten ?? 0) }, { herkomst: '-eigenWoning.financieringskosten' }),
      (ew.erfpacht ?? 0) > 0 && post(`${P}.erfpacht`, 'Erfpachtcanon', { B: -(ew.erfpacht ?? 0) }, { herkomst: '-eigenWoning.erfpacht' }),
      ew.hillenAftrek > 0 && post(`${P}.hillen`, 'Aftrek wegens geen of kleine eigenwoningschuld', { B: -ew.hillenAftrek }, { herkomst: '-eigenWoning.hillenAftrek' }),
      subtotaal(`${P}.saldo`, 'Saldo eigen woning', { C: ew.saldo }, { streepBoven: ['B'], herkomst: 'eigenWoning.saldo' }),
      toonVerdeling &&
        post(`${P}.naar-partner`, c.partners ? 'Deel doorgeschoven naar partner' : `Deel bij ${c.ander?.naam ?? 'de ander'}`, { C: verschoven }, {
          herkomst: `${uit(c, 'eigenWoning')} - eigenWoning.saldo`,
        }),
      toonVerdeling && subtotaal(`${P}.toegerekend`, `Toegerekend aan ${c.naam}`, { C: toegerekend }, { streepBoven: ['C'], herkomst: uit(c, 'eigenWoning') }),
    ],
    { koppen: [kk('omschrijving', 'Omschrijving'), kk('A', 'Betaalde rente'), kk('B', 'Aftrekbare rente')] },
  )

  return sectie('Inkomsten uit eigen woning', 3, [
    kopTekst('Inkomsten eigen woning'),
    woning,
    kopTekst(`Eigenwoningschuld(en) aangegaan bij een Nederlandse bank of financiële instelling, óf aangegaan vóór ${aflossingseisJaar}`, 1),
    schuld,
  ])
}

/** Toont de lijfrentegroep in 3.1.3 en de bijlage 4.1.1. */
export const toonLijfrente = (c: RapportContext) => c.pi.inkomensvoorziening.lijfrentePremies > 0 || c.p.inkomensvoorziening.lijfrenteAftrek > 0

function inkomensvoorziening(c: RapportContext): Sectie | null {
  const iv = c.p.inkomensvoorziening
  const ivi = c.pi.inkomensvoorziening
  const lijfrente = toonLijfrente(c)
  const aov = ivi.aovPremies > 0 || iv.aovAftrek > 0
  if (!lijfrente && !aov && iv.forOmzettingAftrek === 0 && iv.totaal === 0) return null
  const P = '3.1.3'
  const blokken: Blok[] = []
  if (lijfrente) {
    blokken.push(
      kopTekst('Uitgaven voor lijfrenten'),
      tabel([post(`${P}.lijfrente.premies`, 'Lijfrentepremies', { A: ivi.lijfrentePremies }, { herkomst: inv(c, 'inkomensvoorziening.lijfrentePremies') })], {
        koppen: [kk('omschrijving', 'Bank of verzekeringsmaatschappij'), kk('Z', 'Rek-/polisnr.'), kk('A', 'Bedrag')],
      }),
      kopTekst('Jaar-/reserveringsruimteberekening', 1),
      tabel(
        [
          ...iv.tabel.map((t, i) =>
            post(`${P}.jaarruimte.${t.jaar}`, String(t.jaar), { Z: t.nietBenutBegin, A: t.ditJaarBenut }, { herkomst: uit(c, `inkomensvoorziening.tabel[${i}]`) }),
          ),
          subtotaal(`${P}.jaarruimte.totaal`, undefined, { Z: som(iv.tabel.map((t) => t.nietBenutBegin)), B: iv.lijfrenteAftrek }, {
            streepBoven: ['Z', 'A'],
            herkomst: uit(c, 'inkomensvoorziening.lijfrenteAftrek'),
          }),
        ],
        { koppen: [kk('omschrijving', 'Jaar'), kk('Z', '(Niet-gebruikte)', 'jaarruimte'), kk('A', 'Dit jaar aftrekbare', 'lijfrentepremies')] },
      ),
    )
  }
  if (aov) {
    blokken.push(
      kopTekst('Premies voor arbeidsongeschiktheidsverzekeringen', 1),
      tabel(
        [
          post(`${P}.aov.premies`, 'Premies arbeidsongeschiktheidsverzekering', { A: ivi.aovPremies }, { herkomst: inv(c, 'inkomensvoorziening.aovPremies') }),
          subtotaal(`${P}.aov.totaal`, undefined, { B: iv.aovAftrek }, { streepBoven: ['A'], herkomst: uit(c, 'inkomensvoorziening.aovAftrek') }),
        ],
        { koppen: [kk('omschrijving', 'Verzekeringsmaatschappij'), kk('Z', 'Polisnummer'), kk('A', 'Bedrag')] },
      ),
    )
  }
  blokken.push(
    tabel([
      iv.forOmzettingAftrek !== 0 &&
        post(`${P}.for-omzetting`, 'Lijfrentepremie voor omzetting van de oudedagsreserve', { B: iv.forOmzettingAftrek }, { witVoor: 1, herkomst: uit(c, 'inkomensvoorziening.forOmzettingAftrek') }),
      subtotaal(`${P}.totaal`, 'Uitgaven voor inkomensvoorziening', { C: -iv.totaal }, { streepBoven: ['B'], herkomst: `-${uit(c, 'inkomensvoorziening.totaal')}` }),
    ]),
  )
  return sectie('Uitgaven voor inkomensvoorziening', 3, blokken)
}

function berekeningBox1(c: RapportContext): Sectie {
  const p = c.p
  const P = '3.1.4'
  const pga = p.pgaToerekening?.box1 ?? 0
  const drempel = p.drempelinkomenBox1 ?? p.box1.inkomen
  const negatief = p.box1.inkomen - (drempel - pga - p.verliesverrekening)
  return sectie('Berekening belastbaar inkomen', 3, [
    tabel([
      post(`${P}.drempel-box1`, 'Drempelinkomen uit werk en woning (box 1)', { C: drempel }, { herkomst: uit(c, 'drempelinkomenBox1') }),
      pga !== 0 && post(`${P}.pga`, 'Persoonsgebonden aftrek', { C: -pga }, { herkomst: `-${uit(c, 'pgaToerekening.box1')}` }),
      p.verliesverrekening !== 0 && post(`${P}.verliesverrekening`, 'Verrekening van verliezen uit eerdere jaren', { C: -p.verliesverrekening }, { herkomst: `-${uit(c, 'verliesverrekening')}` }),
      negatief !== 0 &&
        post(`${P}.negatief`, 'Negatief inkomen uit werk en woning (telt als nul)', { C: negatief }, { herkomst: `${uit(c, 'box1.inkomen')} - (drempelinkomen - persoonsgebonden aftrek - verliesverrekening)` }),
      totaal(`${P}.belastbaar-box1`, 'Belastbaar inkomen uit werk en woning (box 1)', { C: p.box1.inkomen }, { herkomst: uit(c, 'box1.inkomen') }),
    ]),
  ])
}

// ---------------------------------------------------------------------------
// 3.2 Box 3
// ---------------------------------------------------------------------------

/** De box 3-pot waar deze persoon in zit. */
export function potVan(c: RapportContext): Box3Pot | undefined {
  return c.r.box3.potten?.find((x) => x.personen.includes(c.id))
}

/** Box 3 staat in het rapport als de pot van deze persoon posities of schulden heeft (3.2, de verantwoording volgt). */
export function toonBox3(c: RapportContext): boolean {
  const pot = potVan(c)
  return !!pot && pot.positieIds.length + pot.schuldIds.length > 0
}

/** Pad van die pot in de uitkomst, voor de herkomst. */
export function potPad(c: RapportContext): string {
  return `box3.potten[${Math.max(0, c.r.box3.potten?.findIndex((x) => x.personen.includes(c.id)) ?? 0)}]`
}

function peildatumKoppen(c: RapportContext, metEind: boolean) {
  return [kd('B', `01-01-${c.jaar}`, true), ...(metEind ? [kd('C', `31-12-${c.jaar}`, true)] : [])]
}

/** Kolomkop boven de omschrijvingen per groep (spec 3.2.1). Rekeningnummers staan niet in het rapport. */
const GROEP_KOLOMKOP: Record<Box3Groep, string> = {
  bankNL: 'Bank',
  bankBuitenland: 'Bank',
  contant: 'Omschrijving',
  groen: 'Naam',
  beleggingen: 'Naam',
  vorderingen: 'Omschrijving',
  onroerend: 'Omschrijving',
  overig: 'Omschrijving',
  nettolijfrente: 'Omschrijving',
}

function bezittingen(c: RapportContext, pot: Box3Pot): Sectie {
  const P = '3.2.1'
  const posities = c.invoer.box3.posities.map((x, i) => ({ x, i })).filter(({ x }) => pot.positieIds.includes(x.id))
  const metEind = posities.some(({ x }) => x.waardeEind !== undefined)
  // Eerst de peildata, dan per groep een eigen tabel met de groepskop en de kolomkop (die komen bij een
  // paginabreuk terug), tot slot de vrijstelling en het totaal.
  const blokken: Blok[] = [tabel([], { koppen: peildatumKoppen(c, metEind || !!pot.eind) })]
  for (const g of BOX3_GROEPEN) {
    const deze = posities.filter(({ x }) => box3Groep(x.categorie) === g.groep)
    if (deze.length === 0) continue
    const eindBekend = deze.every(({ x }) => x.waardeEind !== undefined)
    const metLand = g.groep === 'bankBuitenland' && deze.some(({ x }) => landenTekst(x) !== '')
    const regels: MogelijkeRegel[] = deze.map(({ x, i }) =>
      post(`${P}.positie.${x.id}`, x.omschrijving, { B: x.waardeBegin, ...(x.waardeEind !== undefined ? { C: x.waardeEind } : {}) }, {
        ...(metLand && landenTekst(x) ? { teksten: { land: landenTekst(x) } } : {}),
        peildatum: { B: 'begin', C: 'eind' },
        herkomst: `invoer.box3.posities[${i}].waardeBegin`,
      }),
    )
    regels.push(
      subtotaal(`${P}.${g.groep}.subtotaal`, undefined, { B: som(deze.map(({ x }) => x.waardeBegin)), ...(eindBekend ? { C: som(deze.map(({ x }) => x.waardeEind ?? 0)) } : {}) }, {
        vet: 'regel',
        streepBoven: eindBekend ? ['B', 'C'] : ['B'],
        peildatum: { B: 'begin', C: 'eind' },
        herkomst: `som(invoer.box3.posities[categorie in ${g.groep}].waardeBegin)`,
      }),
    )
    blokken.push(tabel(regels, { herhaalKop: g.kop, koppen: [kk('omschrijving', GROEP_KOLOMKOP[g.groep]), ...(metLand ? [kk('land', 'Land')] : [])] }))
  }
  blokken.push(
    tabel([
      pot.begin.vrijgesteld > 0 &&
        post(`${P}.vrijgesteld`, 'Vrijgesteld (groene beleggingen, contant geld, nettolijfrente)', { B: -pot.begin.vrijgesteld, ...(pot.eind ? { C: -pot.eind.vrijgesteld } : {}) }, {
          witVoor: 1,
          peildatum: { B: 'begin', C: 'eind' },
          herkomst: `-${potPad(c)}.begin.vrijgesteld`,
        }),
      totaal(`${P}.totaal`, 'Totaal waarde bezittingen', { B: pot.begin.bezittingen, ...(pot.eind ? { C: pot.eind.bezittingen } : {}) }, {
        witVoor: 1,
        peildatum: { B: 'begin', C: 'eind' },
        herkomst: `${potPad(c)}.begin.bezittingen`,
      }),
    ]),
  )
  return sectie('Waarde van bezittingen', 3, blokken)
}

function schulden(c: RapportContext, pot: Box3Pot): Sectie | null {
  if (pot.schuldIds.length === 0) return null
  const P = '3.2.2'
  const lijst = c.invoer.box3.schulden.map((x, i) => ({ x, i })).filter(({ x }) => pot.schuldIds.includes(x.id))
  const metEind = lijst.some(({ x }) => x.waardeEind !== undefined)
  const eindBekend = !!pot.eind
  return sectie('Waarde van schulden', 3, [
    // Peildata, daarna na een witregel de kolomkop boven de schulden (spec 3.2.2 regels 1 en 2).
    tabel([], { koppen: peildatumKoppen(c, metEind || eindBekend) }),
    tabel(
      [
        ...lijst.map(({ x, i }) =>
          post(`${P}.schuld.${x.id}`, x.omschrijving, { B: x.waardeBegin, ...(x.waardeEind !== undefined ? { C: x.waardeEind } : {}) }, {
            peildatum: { B: 'begin', C: 'eind' },
            herkomst: `invoer.box3.schulden[${i}].waardeBegin`,
          }),
        ),
        subtotaal(`${P}.subtotaal`, undefined, { B: pot.begin.schulden, ...(eindBekend ? { C: pot.eind?.schulden } : {}) }, {
          vet: 'regel',
          streepBoven: eindBekend ? ['B', 'C'] : ['B'],
          peildatum: { B: 'begin', C: 'eind' },
          herkomst: `${potPad(c)}.begin.schulden`,
        }),
        post(
          `${P}.drempel`,
          'Drempel',
          { B: -Math.min(pot.begin.schulden, pot.begin.schuldendrempel), ...(pot.eind ? { C: -Math.min(pot.eind.schulden, pot.eind.schuldendrempel) } : {}) },
          { witVoor: 1, peildatum: { B: 'begin', C: 'eind' }, herkomst: `-min(${potPad(c)}.begin.schulden, ${potPad(c)}.begin.schuldendrempel)` },
        ),
        totaal(`${P}.aftrekbaar`, 'Aftrekbare schulden', { B: pot.begin.aftrekbareSchulden, ...(pot.eind ? { C: pot.eind.aftrekbareSchulden } : {}) }, {
          peildatum: { B: 'begin', C: 'eind' },
          herkomst: `${potPad(c)}.begin.aftrekbareSchulden`,
        }),
      ],
      { koppen: [kk('omschrijving', 'Omschrijving')] },
    ),
  ])
}

function arbitrageAntwoord(c: RapportContext): 'ja' | 'nee' {
  return c.r.box3.waarschuwingen.some((w) => /(^|-)box3-arbitrage-/.test(w.id)) ? 'ja' : 'nee'
}

/** Grenzen van een schijf voor het label: 'tot 50.000', '50.000 tot 950.000', 'vanaf 950.000'. */
function schijfGrenzen(s: Box3SchijfRegel): string {
  if (s.tot === null) return `vanaf ${bedrag(s.van)}`
  return s.van === 0 ? `tot ${bedrag(s.tot)}` : `${bedrag(s.van)} tot ${bedrag(s.tot)}`
}

function rendementsgrondslag(c: RapportContext, pot: Box3Pot): Sectie {
  const P = '3.2.3'
  const p = c.p
  const eind = pot.eind
  const peil = { B: 'begin', C: 'eind' } as const
  const ander = c.partners && pot.personen.length === 2 ? c.ander : undefined
  // Het deel van de grondslag in hele euro's zoals de engine ermee rekent (A afgerond, B de rest), zodat beide
  // rapporten dezelfde verdeling tonen en de delen optellen tot de grondslag.
  const deelVan = (id: typeof c.id) => pot.grondslagDeel?.[id] ?? Math.round(pot.grondslagPerPersoon[id] ?? 0)
  const eigenDeel = deelVan(c.id)
  const voordeel = c.r.box3.voordeel[c.id] ?? 0
  const pgaBox3 = p.pgaToerekening?.box3 ?? 0
  const gekozen = pot.gekozen ?? c.r.box3.gekozen
  const regels: MogelijkeRegel[] = [
    post(`${P}.bezittingen`, 'Waarde van bezittingen', { B: pot.begin.bezittingen, ...(eind ? { C: eind.bezittingen } : {}) }, { peildatum: peil, herkomst: `${potPad(c)}.begin.bezittingen` }),
    post(`${P}.schulden`, 'Aftrekbare schulden', { B: -pot.begin.aftrekbareSchulden, ...(eind ? { C: -eind.aftrekbareSchulden } : {}) }, {
      peildatum: peil,
      herkomst: `-${potPad(c)}.begin.aftrekbareSchulden`,
    }),
    subtotaal(`${P}.vermogen`, 'Waarde van het vermogen', { B: pot.begin.rendementsgrondslag, ...(eind ? { C: eind.rendementsgrondslag } : {}) }, {
      streepBoven: eind ? ['B', 'C'] : ['B'],
      peildatum: peil,
      herkomst: `${potPad(c)}.begin.rendementsgrondslag`,
    }),
    groepskop(`${P}.vrijstelling.kop`, 'Vrijstelling vermogen', { witVoor: 2 }),
    post(`${P}.vrijstelling.vermogen`, 'Waarde van het vermogen (fiscale waarde)', { B: pot.begin.rendementsgrondslag }, { herkomst: `${potPad(c)}.begin.rendementsgrondslag` }),
    post(`${P}.heffingsvrij`, 'Heffingsvrij vermogen', { B: -pot.heffingsvrijVermogen }, { herkomst: `-${potPad(c)}.heffingsvrijVermogen` }),
    subtotaal(`${P}.grondslag`, 'Grondslag sparen en beleggen', { B: pot.grondslag }, { streepBoven: ['B'], herkomst: `${potPad(c)}.grondslag` }),
  ]
  const blokken: Blok[] = []
  if (pot.grondslag > 0) {
    if (ander) {
      // Het deel van de partner gaat eraf (met minteken), net als 'Deel doorgeschoven naar partner' elders.
      regels.push(
        post(`${P}.deel-partner`, `Deel van de grondslag van ${ander.naam}`, { B: -deelVan(ander.id) }, { herkomst: `-${potPad(c)}.grondslagDeel.${ander.id}` }),
        subtotaal(`${P}.deel-eigen`, `Deel van de grondslag van ${c.naam}`, { B: eigenDeel }, { streepBoven: ['B'], dubbelOnder: ['B'], herkomst: `${potPad(c)}.grondslagDeel.${c.id}` }),
      )
    }
    const groepen = rendementPerGroep(pot.rendementRegels)
    const schijven = pot.voordeelPerSchijf?.[c.id] ?? []
    if (gekozen === 'werkelijk') {
      regels.push(
        groepskop(`${P}.werkelijk.kop`, 'Werkelijk rendement (tegenbewijs)', { witVoor: 1 }),
        post(`${P}.werkelijk`, 'Werkelijk rendement, lager dan het forfaitaire rendement', { B: pot.werkelijkRendement ?? c.r.box3.werkelijkRendement ?? 0 }, {
          herkomst: pot.werkelijkRendement !== undefined ? `${potPad(c)}.werkelijkRendement` : 'box3.werkelijkRendement',
        }),
      )
      if (ander) {
        regels.push(
          post(`${P}.werkelijk.deel-partner`, `Deel van ${ander.naam}`, { B: -(c.r.box3.voordeel[ander.id] ?? 0) }, { herkomst: `-box3.voordeel.${ander.id}` }),
          subtotaal(`${P}.werkelijk.deel-eigen`, `Deel van ${c.naam}`, { B: voordeel }, { streepBoven: ['B'], herkomst: `box3.voordeel.${c.id}` }),
        )
      }
    } else if (groepen.length > 0) {
      const pct = pot.effectiefPct ?? c.r.box3.effectiefPct
      regels.push(
        groepskop(`${P}.rendement.kop`, 'Box 3 rendement', { witVoor: 1 }),
        subkop(`${P}.rendement.subkop`, 'Berekening voordeel sparen en beleggen'),
        ...groepen.map((g) =>
          post(`${P}.rendement.${g.sleutel}`, g.label, { Z: g.grondslag, B: g.bedrag }, { percentages: { A: g.pct }, herkomst: `${potPad(c)}.rendementRegels[${g.sleutel}]` }),
        ),
        subtotaal(`${P}.rendement.totaal`, undefined, { B: pot.forfaitairRendement }, { streepBoven: ['B'], herkomst: `${potPad(c)}.forfaitairRendement` }),
        groepskop(`${P}.aandeel.kop`, 'Berekening rendementspercentage voordeel sparen en beleggen', { witVoor: 1 }),
        // Het percentage waarmee de engine rekent (afgekapt op twee decimalen), zodat het bedrag na te rekenen is.
        post(`${P}.rendementspercentage`, `Rendementspercentage: ${bedrag(pot.forfaitairRendement)} / ${bedrag(pot.begin.rendementsgrondslag)}`, {}, {
          witVoor: 1,
          percentages: { A: pct },
          herkomst: pot.effectiefPct !== undefined ? `${potPad(c)}.effectiefPct` : 'box3.effectiefPct',
        }),
        post(`${P}.aandeel`, `Aandeel rendement: ${percentage(pct)} x ${bedrag(eigenDeel)}`, { B: voordeel }, { herkomst: `box3.voordeel.${c.id}` }),
      )
    } else if (schijven.length > 0) {
      // Schijvenstelsel: het voordeel per schijf over het eigen deel van de grondslag (koppeling 5.7).
      regels.push(
        groepskop(`${P}.rendement.kop`, 'Box 3 rendement', { witVoor: 1 }),
        subkop(`${P}.rendement.subkop`, 'Berekening voordeel sparen en beleggen'),
        ...schijven.map((s, i) =>
          post(`${P}.schijf.${i + 1}`, `Rendement ${i + 1}e schijf (${schijfGrenzen(s)})`, { Z: s.grondslag, B: s.bedrag }, {
            teksten: { A: percentage(s.pct, 'label', 3) },
            herkomst: `${potPad(c)}.voordeelPerSchijf.${c.id}[${i}]`,
          }),
        ),
        subtotaal(`${P}.schijf.totaal`, undefined, { B: voordeel }, { streepBoven: ['B'], herkomst: `box3.voordeel.${c.id}` }),
      )
    }
    regels.push(
      subtotaal(`${P}.voordeel`, 'Voordeel uit sparen en beleggen', { C: voordeel }, { witVoor: 1, streepBoven: ['C'], herkomst: `box3.voordeel.${c.id}` }),
      pgaBox3 !== 0 && post(`${P}.pga`, 'Persoonsgebonden aftrek', { C: -pgaBox3 }, { herkomst: `-${uit(c, 'pgaToerekening.box3')}` }),
      totaal(`${P}.belastbaar`, 'Belastbaar inkomen uit sparen en beleggen (box 3)', { C: p.box3Inkomen }, { herkomst: uit(c, 'box3Inkomen') }),
    )
  }
  blokken.push(tabel(regels, { koppen: peildatumKoppen(c, !!eind) }))
  const maanden = c.P.box3.waarde.arbitrageMaanden
  if (pot.grondslag > 0 && pot.rendementRegels.length > 0 && maanden > 0) {
    const wie = c.partners && c.ander ? `${c.naam} en/of ${c.ander.naam}` : c.naam
    blokken.push({
      soort: 'vraag',
      id: `${P}.arbitrage`,
      vraag: `Heeft ${wie} in een periode van ${telwoord(maanden)} maanden (waarin een peildatum is gelegen) box 3-vermogensbestanddelen verkocht en deze vermogensbestanddelen vervolgens (gedeeltelijk) weer aangekocht?`,
      antwoord: arbitrageAntwoord(c),
      witVoor: 1,
    })
  }
  return sectie('Toelichting rendementsgrondslag', 3, blokken)
}

function box3(c: RapportContext): Sectie | null {
  const pot = potVan(c)
  if (!pot || !toonBox3(c)) {
    c.weggelaten.push('Belastbaar inkomen uit sparen en beleggen (box 3): weggelaten, er zijn geen bezittingen of schulden in box 3 ingevoerd.')
    return null
  }
  return sectie('Toelichting belastbaar inkomen uit sparen en beleggen (box 3)', 2, [], [bezittingen(c, pot), schulden(c, pot), rendementsgrondslag(c, pot)])
}

// ---------------------------------------------------------------------------
// 3.3 Persoonsgebonden aftrek
// ---------------------------------------------------------------------------

function persoonsgebondenAftrek(c: RapportContext): Sectie | null {
  const pga = c.r.pga
  const invoer = c.invoer.pga ?? {}
  const alimentatieInvoer = som(c.invoer.personen.map((x) => x.partneralimentatie ?? 0))
  const t = c.p.pgaToerekening
  const ingevoerd = [invoer.giftenGewoon, invoer.giftenPeriodiek, invoer.giftenCultureel, invoer.specifiekeZorgkosten, invoer.scholing].some((x) => (x ?? 0) > 0) || alimentatieInvoer > 0
  if (!pga || !t || (pga.totaal === 0 && t.restantVorigJaar === 0 && !ingevoerd)) {
    c.weggelaten.push('Persoonsgebonden aftrek: weggelaten, er zijn geen aftrekposten ingevoerd.')
    return null
  }
  const P = '3.3'
  const pp = c.P.pga.waarde
  const blokken: Blok[] = []
  let soorten = 0

  const scholingInvoer = invoer.scholing ?? 0
  if (scholingInvoer > 0 || pga.scholing > 0) {
    soorten++
    const verschil = pga.scholing - scholingInvoer
    const label = !pp.scholing.actief ? 'Niet aftrekbaar in dit jaar' : -verschil === pp.scholing.drempel ? 'Drempel' : 'Drempel en maximum'
    blokken.push(
      { soort: 'tekst' as const, tekst: 'Studiekosten en andere scholingsuitgaven', stijl: 'opsomming' as const },
      tabel([
        post(`${P}.scholing.uitgaven`, 'Totaal studiekosten', { B: scholingInvoer }, { herkomst: 'invoer.pga.scholing' }),
        post(`${P}.scholing.drempel`, label, { B: verschil }, { herkomst: 'pga.scholing - invoer.pga.scholing' }),
        subtotaal(`${P}.scholing.aftrekbaar`, 'Aftrekbare scholingsuitgaven', { C: pga.scholing }, { streepBoven: ['B'], herkomst: 'pga.scholing' }),
      ]),
    )
  }
  const giftenInvoer = (invoer.giftenGewoon ?? 0) + (invoer.giftenCultureel ?? 0) + (invoer.giftenPeriodiek ?? 0)
  if (giftenInvoer > 0 || pga.giften > 0) {
    soorten++
    blokken.push(
      { soort: 'tekst' as const, tekst: 'Giften', stijl: 'opsomming' as const, witVoor: 1 as const },
      tabel([
        (invoer.giftenGewoon ?? 0) > 0 && post(`${P}.giften.gewoon`, 'Gewone giften', { B: invoer.giftenGewoon ?? 0 }, { herkomst: 'invoer.pga.giftenGewoon' }),
        (invoer.giftenCultureel ?? 0) > 0 && post(`${P}.giften.cultureel`, 'Giften aan culturele instellingen', { B: invoer.giftenCultureel ?? 0 }, { herkomst: 'invoer.pga.giftenCultureel' }),
        (invoer.giftenPeriodiek ?? 0) > 0 && post(`${P}.giften.periodiek`, 'Periodieke giften', { B: invoer.giftenPeriodiek ?? 0 }, { herkomst: 'invoer.pga.giftenPeriodiek' }),
        post(`${P}.giften.drempel`, 'Drempel, maximum en verhoging culturele giften', { B: pga.giften - giftenInvoer }, { herkomst: 'pga.giften - som(invoer.pga.giften*)' }),
        subtotaal(`${P}.giften.aftrekbaar`, 'Aftrekbare giften', { C: pga.giften }, { streepBoven: ['B'], herkomst: 'pga.giften' }),
      ]),
    )
  }
  const zorgInvoer = invoer.specifiekeZorgkosten ?? 0
  if (zorgInvoer > 0 || pga.zorgkosten > 0) {
    soorten++
    blokken.push(
      { soort: 'tekst' as const, tekst: 'Specifieke zorgkosten', stijl: 'opsomming' as const, witVoor: 1 as const },
      tabel([
        post(`${P}.zorgkosten.uitgaven`, 'Specifieke zorgkosten', { B: zorgInvoer }, { herkomst: 'invoer.pga.specifiekeZorgkosten' }),
        post(`${P}.zorgkosten.drempel`, pp.zorgkosten.actief ? 'Drempel en verhoging' : 'Niet aftrekbaar in dit jaar', { B: pga.zorgkosten - zorgInvoer }, {
          herkomst: 'pga.zorgkosten - invoer.pga.specifiekeZorgkosten',
        }),
        subtotaal(`${P}.zorgkosten.aftrekbaar`, 'Aftrekbare specifieke zorgkosten', { C: pga.zorgkosten }, { streepBoven: ['B'], herkomst: 'pga.zorgkosten' }),
      ]),
    )
  }
  if (alimentatieInvoer > 0 || pga.alimentatie > 0) {
    soorten++
    blokken.push(
      { soort: 'tekst' as const, tekst: 'Partneralimentatie', stijl: 'opsomming' as const, witVoor: 1 as const },
      tabel([post(`${P}.alimentatie`, 'Aftrekbare partneralimentatie', { C: pga.alimentatie }, { herkomst: 'pga.alimentatie' })]),
    )
  }

  const ditJaar = t.toegerekend - t.restantVorigJaar
  const verschoven = ditJaar - pga.totaal
  const toonVerdeling = c.partners || verschoven !== 0
  blokken.push(
    tabel([
      soorten > 1 && subtotaal(`${P}.huishouden`, 'Persoonsgebonden aftrek huishouden', { C: pga.totaal }, { streepBoven: ['C'], herkomst: 'pga.totaal' }),
      toonVerdeling &&
        post(`${P}.naar-partner`, c.partners ? 'Deel doorgeschoven naar partner' : `Deel bij ${c.ander?.naam ?? 'de ander'}`, { C: verschoven }, {
          witVoor: 1,
          herkomst: `${uit(c, 'pgaToerekening.toegerekend')} - ${uit(c, 'pgaToerekening.restantVorigJaar')} - pga.totaal`,
        }),
      t.restantVorigJaar > 0 && post(`${P}.restant-vorig-jaar`, 'Niet benutte persoonsgebonden aftrek van vorig jaar', { C: t.restantVorigJaar }, { herkomst: uit(c, 'pgaToerekening.restantVorigJaar') }),
      subtotaal(`${P}.toegerekend`, `Toegerekend aan ${c.naam}`, { C: t.toegerekend }, { streepBoven: ['C'], herkomst: uit(c, 'pgaToerekening.toegerekend') }),
      t.restant > 0 && post(`${P}.restant`, 'Niet benut, schuift door naar volgend jaar', { C: -t.restant }, { herkomst: `-${uit(c, 'pgaToerekening.restant')}` }),
      totaal(`${P}.totaal`, 'Totaal aftrekposten', { C: c.p.pga }, { witVoor: 1, herkomst: uit(c, 'pga') }),
    ]),
  )
  return sectie('Persoonsgebonden aftrek', 2, blokken)
}

export function hoofdstukBelastbaarInkomen(c: RapportContext): Sectie {
  const box1 = sectie('Toelichting belastbaar inkomen uit werk en woning (box 1)', 2, [], [winstUitOnderneming(c), eigenWoning(c), inkomensvoorziening(c), berekeningBox1(c)])
  return sectie('Belastbaar inkomen', 1, [], [box1, box3(c), persoonsgebondenAftrek(c)], { nieuwePagina: true })
}
