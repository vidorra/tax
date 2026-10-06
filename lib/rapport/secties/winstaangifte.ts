/**
 * Hoofdstuk 5 Winstaangifte [jaar] van [onderneming] (spec 5.1 tot en met 5.6, koppeling hoofdstuk 7), één
 * hoofdstuk per onderneming.
 *
 * Met een jaarrekening (`OndernemingInvoer.jaarrekening`): de volledige kapitaalsvergelijking, de fiscale
 * vermogensopstelling, de winstberekening in rubrieken en de specificaties, met sluitende controles
 * (activa = passiva, kapitaalsvergelijking = saldo, rubrieken = saldo). Zonder jaarrekening staat er wat er wel
 * is: het saldo, de correcties, de investeringsaftrek per middel, de oudedagsreserve en het eindvermogen.
 */
import type { BalansPost, BalansStand, JaarrekeningInvoer, OndernemingInvoer, OndernemingResultaat } from '@/lib/tax/types'
import { correctieBeperktAftrekbaar } from '@/lib/tax/modules/onderneming'
import type { Blok, Kolom, Regel, Sectie, VraagBlok } from '../model'
import { OVERIGE_KOSTEN_RUBRIEKEN, balansTotalen, registerTeltMee, rubriek, saldoRubrieken, somBedragen, standIngevuld } from '../afleiden'
import { bedrag, datumKort, euro, percentage } from '../notatie'
import { groepskop, inv, kd, kk, kopTekst, post, sectie, som, subtotaal, tabel, totaal, uit, type MogelijkeRegel, type RapportContext } from './bouwstenen'

interface OndernemingContext {
  c: RapportContext
  o: OndernemingResultaat
  oi: OndernemingInvoer
  /** Index in de ondernemingen van de persoon. */
  k: number
  /** Voorvoegsel van de regel-id's: '5.<slug>'. */
  P: string
  jr?: JaarrekeningInvoer
  begin?: BalansStand
  eind?: BalansStand
}

const BALANS_LABEL: Record<BalansPost, string> = {
  materieleVasteActiva: 'Overige materiële vaste activa',
  voorraden: 'Voorraden en onderhanden werk',
  handelsdebiteuren: 'Vorderingen op handelsdebiteuren',
  overigeVorderingen: 'Overige vorderingen',
  liquideMiddelen: 'Liquide middelen',
  oudedagsreserve: 'Fiscale oudedagsreserve',
  voorzieningen: 'Voorzieningen',
  langlopendeSchulden: 'Langlopende schulden',
  crediteuren: 'Schulden aan leveranciers en handelskredieten',
  omzetbelasting: 'Schuld omzetbelasting',
  overigeKortlopendeSchulden: 'Overige kortlopende schulden',
}

const ui = (x: OndernemingContext, pad: string) => uit(x.c, `ondernemingen[${x.k}].${pad}`)
const ii = (x: OndernemingContext, pad: string) => inv(x.c, `ondernemingen[${x.k}].${pad}`)

const bc = (begin: number | undefined, eind: number | undefined): Partial<Record<Kolom, number>> => ({
  ...(begin !== undefined ? { B: begin } : {}),
  ...(eind !== undefined ? { C: eind } : {}),
})
const PEIL = { B: 'begin', C: 'eind' } as const

// ---------------------------------------------------------------------------
// 5.1 Kapitaalsvergelijking
// ---------------------------------------------------------------------------

function kapitaalsvergelijking(x: OndernemingContext): Sectie {
  const { c, o, oi, P, jr } = x
  const Q = `${P}.1.1`
  const eindBalans = standIngevuld(x.eind) ? balansTotalen(x.eind).ondernemingsvermogen : undefined
  const eindvermogen = eindBalans ?? oi.for?.ondernemingsvermogenEinde
  const beginvermogen = standIngevuld(x.begin) ? balansTotalen(x.begin).ondernemingsvermogen : undefined
  const onttrekkingen = jr?.onttrekkingen ?? []
  const stortingen = jr?.stortingen ?? []
  const somOnttrekkingen = somBedragen(onttrekkingen)
  const somStortingen = somBedragen(stortingen)
  const vergelijking = eindvermogen !== undefined && beginvermogen !== undefined
  const mutaties = onttrekkingen.length + stortingen.length > 0
  // Ontbreekt het begin- of eindvermogen, dan is de kapitaalsvergelijking niet te maken: de ontbrekende regel staat
  // er zonder bedrag, zodat kolom C niet als een sluitende optelling leest.
  const onvolledig = !vergelijking && (mutaties || eindvermogen !== undefined || beginvermogen !== undefined)
  const regels: MogelijkeRegel[] = []

  if (eindvermogen !== undefined) {
    regels.push(post(`${Q}.eindvermogen`, 'Eindvermogen', { C: eindvermogen }, { herkomst: eindBalans !== undefined ? `${ii(x, 'jaarrekening.eind')} (activa - schulden)` : ii(x, 'for.ondernemingsvermogenEinde') }))
  } else if (onvolledig) {
    regels.push(post(`${Q}.eindvermogen`, 'Eindvermogen (niet ingevoerd)', {}))
  }
  if (beginvermogen !== undefined) {
    regels.push(post(`${Q}.beginvermogen`, 'Af: beginvermogen', { C: beginvermogen }, { herkomst: `${ii(x, 'jaarrekening.begin')} (activa - schulden)` }))
  } else if (onvolledig) {
    regels.push(post(`${Q}.beginvermogen`, 'Af: beginvermogen (niet ingevoerd)', {}))
  }
  if (!vergelijking && mutaties) {
    const ontbreekt = eindvermogen === undefined && beginvermogen === undefined ? 'het begin- en eindvermogen ontbreken' : eindvermogen === undefined ? 'het eindvermogen ontbreekt' : 'het beginvermogen ontbreekt'
    c.meldingen.push({
      ernst: 'let-op',
      tekst: `${oi.naam}: ${ontbreekt}, dus de kapitaalsvergelijking is niet te maken. De privéonttrekkingen en -stortingen staan er ter informatie; de fiscale winstberekening komt uit het ingevoerde saldo.`,
    })
  }
  if (onttrekkingen.length > 0) {
    regels.push(
      groepskop(`${Q}.onttrekkingen.kop`, 'Privéonttrekkingen', { witVoor: 1 }),
      ...onttrekkingen.map((t, i) => post(`${Q}.onttrekking.${i + 1}`, t.omschrijving, { A: t.bedrag }, { herkomst: ii(x, `jaarrekening.onttrekkingen[${i}].bedrag`) })),
      subtotaal(`${Q}.onttrekkingen.som`, undefined, { B: somOnttrekkingen }, { streepBoven: ['A'], herkomst: `som(${ii(x, 'jaarrekening.onttrekkingen')})` }),
      subtotaal(`${Q}.onttrekkingen.totaal`, 'Totaal privéonttrekkingen', { C: somOnttrekkingen }, { streepBoven: ['B'], herkomst: `som(${ii(x, 'jaarrekening.onttrekkingen')})` }),
    )
  }
  if (stortingen.length > 0) {
    regels.push(
      groepskop(`${Q}.stortingen.kop`, 'Privéstortingen', { witVoor: 1 }),
      ...stortingen.map((t, i) => post(`${Q}.storting.${i + 1}`, t.omschrijving, { B: t.bedrag }, { herkomst: ii(x, `jaarrekening.stortingen[${i}].bedrag`) })),
      subtotaal(`${Q}.stortingen.totaal`, undefined, { C: -somStortingen }, { streepBoven: ['B'], herkomst: `-som(${ii(x, 'jaarrekening.stortingen')})` }),
    )
  }
  // Fiscale afschrijving uit het activaregister tegenover de geboekte: de balans is commercieel, het saldo fiscaal.
  const correctie = o.correctieAfschrijving ?? 0
  if (vergelijking) {
    const verklaard = (eindvermogen ?? 0) - (beginvermogen ?? 0) + somOnttrekkingen - somStortingen
    const verschil = o.saldo - correctie - verklaard
    if (onttrekkingen.length === 0) {
      regels.push(
        post(`${Q}.prive-afgeleid`, 'Saldo privéonttrekkingen en -stortingen (afgeleid)', { C: verschil }, {
          witVoor: 1,
          herkomst: `${ui(x, 'saldo')} - (eindvermogen - beginvermogen - stortingen)`,
        }),
      )
    } else if (verschil !== 0) {
      regels.push(post(`${Q}.niet-verklaard`, 'Niet verklaard verschil met de winstberekening', { C: verschil }, { witVoor: 1, herkomst: `${ui(x, 'saldo')} - kapitaalsvergelijking` }))
      c.meldingen.push({
        ernst: 'actie',
        tekst: `${oi.naam}: de kapitaalsvergelijking sluit niet. Eindvermogen min beginvermogen plus onttrekkingen min stortingen is ${euro(verklaard)}, het saldo van de winstberekening is ${euro(o.saldo - correctie)}${correctie !== 0 ? ' vóór de correctie op de afschrijving' : ''} (verschil ${euro(verschil)}).`,
      })
    }
  }
  if (correctie !== 0) {
    regels.push(
      post(`${Q}.correctie-afschrijving`, 'Correctie geboekte naar fiscale afschrijving (activaregister)', { C: correctie }, { witVoor: 1, herkomst: ui(x, 'correctieAfschrijving') }),
    )
  }
  regels.push(
    post(`${Q}.fiscale-winstberekening`, 'Fiscale winstberekening', { C: o.saldo }, { witVoor: 1, vet: 'regel', ...(vergelijking ? { streepBoven: ['C' as Kolom] } : {}), herkomst: ui(x, 'saldo') }),
  )
  const blokken: Blok[] = [tabel(regels)]

  // Niet of gedeeltelijk aftrekbare kosten
  const beperkt = Math.max(0, oi.beperktAftrekbaar ?? 0)
  if (o.correctieBeperktAftrekbaar !== 0 || o.bijtellingAuto !== 0) {
    const methode = beperkt > 0 ? correctieBeperktAftrekbaar(beperkt, c.P) : undefined
    const ba = c.P.ondernemer.waarde.beperktAftrekbaar
    const label =
      methode?.methode === 'drempel'
        ? `Beperkt aftrekbare kosten: drempel van ${bedrag(ba.drempel)} over ${bedrag(beperkt)}`
        : `Beperkt aftrekbare kosten: ${percentage(1 - ba.aftrekbaarDeel)} van ${bedrag(beperkt)}`
    blokken.push(
      kopTekst('Overige kosten en lasten die niet of gedeeltelijk aftrekbaar zijn', 1),
      tabel(
        [
          o.correctieBeperktAftrekbaar !== 0 && post(`${Q}.beperkt-aftrekbaar`, label, { B: o.correctieBeperktAftrekbaar }, { herkomst: ui(x, 'correctieBeperktAftrekbaar') }),
          o.bijtellingAuto !== 0 && post(`${Q}.bijtelling-auto`, 'Bijtelling privégebruik auto', { B: o.bijtellingAuto }, { herkomst: ui(x, 'bijtellingAuto') }),
          subtotaal(`${Q}.beperkt-totaal`, 'Totaal van aftrek uitgesloten en in aftrek beperkte kosten en lasten', { C: o.correctieBeperktAftrekbaar + o.bijtellingAuto }, {
            streepBoven: ['B'],
            herkomst: `${ui(x, 'correctieBeperktAftrekbaar')} + ${ui(x, 'bijtellingAuto')}`,
          }),
        ],
        { koppen: [kk('omschrijving', 'Omschrijving'), kk('B', 'Correctie')] },
      ),
    )
  }

  const investeringsaftrek = o.kia + o.eia + o.mia
  const forAfname = o.verplichteForAfname + (o.forVrijwilligeAfname ?? 0)
  const forDotatie = o.forDotatie ?? 0
  blokken.push(
    tabel([
      ...(investeringsaftrek !== 0 || o.desinvesteringsbijtelling !== 0
        ? [
            groepskop(`${Q}.investeringsregelingen.kop`, 'Investeringsregelingen', { witVoor: 1 }),
            post(`${Q}.investeringsaftrek-nl`, 'Investeringsaftrek Nederland', { B: investeringsaftrek }, { herkomst: `${ui(x, 'kia')} + ${ui(x, 'eia')} + ${ui(x, 'mia')}` }),
            post(`${Q}.investeringsaftrek-caribisch`, 'Investeringsaftrek Aruba, Curaçao of Sint Maarten', { B: 0 }, { herkomst: 'vast: 0 (geen invoerveld)' }),
            post(`${Q}.investeringsaftrek-eerder`, 'Investeringsaftrek voorgaande jaren', { B: 0 }, { herkomst: 'vast: 0 (geen invoerveld)' }),
            subtotaal(`${Q}.investeringsaftrek`, 'Investeringsaftrek', { C: -investeringsaftrek }, { streepBoven: ['B'], herkomst: `-(${ui(x, 'kia')} + ${ui(x, 'eia')} + ${ui(x, 'mia')})` }),
            o.desinvesteringsbijtelling !== 0 && post(`${Q}.desinvestering`, 'Desinvesteringsbijtelling', { C: o.desinvesteringsbijtelling }, { herkomst: ui(x, 'desinvesteringsbijtelling') }),
          ]
        : []),
      ...(forAfname !== 0 || forDotatie !== 0
        ? [
            groepskop(`${Q}.for.kop`, 'Fiscale oudedagsreserve', { witVoor: 1 }),
            forAfname !== 0 && post(`${Q}.for-afname`, 'Afneming fiscale oudedagsreserve', { C: forAfname }, { herkomst: `${ui(x, 'verplichteForAfname')} + ${ui(x, 'forVrijwilligeAfname')}` }),
            forDotatie !== 0 && post(`${Q}.for-dotatie`, 'Toevoeging aan de fiscale oudedagsreserve', { C: -forDotatie }, { herkomst: `-${ui(x, 'forDotatie')}` }),
          ]
        : []),
      totaal(`${Q}.winst`, 'Totaal fiscale winst uit onderneming', { C: o.winst }, { witVoor: 1, herkomst: ui(x, 'winst') }),
    ]),
  )
  return sectie('Fiscale winstberekening door kapitaalsvergelijking', 2, [], [sectie('Kapitaalsvergelijking', 3, blokken)])
}

// ---------------------------------------------------------------------------
// 5.2 Fiscale vermogensopstelling
// ---------------------------------------------------------------------------

const toon = (b: number | undefined, e: number | undefined) => (b ?? 0) !== 0 || (e ?? 0) !== 0

function balansGroep(x: OndernemingContext, Q: string, sleutel: string, kop: string, posten: BalansPost[], totaalLabel: string, eerste: boolean): Regel[] {
  const getoond = posten.filter((p) => toon(x.begin?.[p], x.eind?.[p]))
  if (getoond.length === 0) return []
  const bVan = (s: BalansStand | undefined) => (s ? som(posten.map((p) => s[p] ?? 0)) : undefined)
  return [
    groepskop(`${Q}.${sleutel}.kop`, kop, eerste ? {} : { witVoor: 2 }),
    ...getoond.map((p) =>
      post(`${Q}.${p}`, BALANS_LABEL[p], bc(x.begin ? (x.begin[p] ?? 0) : undefined, x.eind ? (x.eind[p] ?? 0) : undefined), { peildatum: PEIL, herkomst: ii(x, `jaarrekening.begin.${p}`) }),
    ),
    subtotaal(`${Q}.${sleutel}.totaal`, totaalLabel, bc(bVan(x.begin), bVan(x.eind)), { vet: 'bedrag', streepBoven: ['B', 'C'], peildatum: PEIL, herkomst: `som(${ii(x, 'jaarrekening.begin')})` }),
  ]
}

function vermogensopstelling(x: OndernemingContext): Sectie | null {
  const { c, o, oi, P } = x
  const Q = `${P}.2`
  const koppen = [kd('B', 'Fiscaal begin'), kd('C', 'Fiscaal eind')]
  const metBalans = standIngevuld(x.begin) || standIngevuld(x.eind)
  const forBegin = x.begin?.oudedagsreserve ?? o.forStandBegin
  const forEind = x.eind?.oudedagsreserve ?? o.forStandEind

  if (!metBalans) {
    const ovEind = oi.for?.ondernemingsvermogenEinde
    if (x.jr) c.weggelaten.push(`${oi.naam}: de balans is niet ingevoerd; in de fiscale vermogensopstelling staan alleen de oudedagsreserve en het eindvermogen.`)
    if (forBegin === undefined && ovEind === undefined) return null
    const passiva = sectie(
      'Passiva',
      3,
      [
        tabel([
          groepskop(`${Q}.2.ondernemingsvermogen.kop`, 'Ondernemingsvermogen'),
          forBegin !== undefined && post(`${Q}.2.oudedagsreserve`, 'Fiscale oudedagsreserve', bc(forBegin, forEind), { peildatum: PEIL, herkomst: `${ui(x, 'forStandBegin')}, ${ui(x, 'forStandEind')}` }),
          ovEind !== undefined &&
            post(`${Q}.2.exclusief-reserves`, 'Ondernemingsvermogen exclusief fiscale reserves', { C: ovEind - (forEind ?? 0) }, { peildatum: PEIL, herkomst: `${ii(x, 'for.ondernemingsvermogenEinde')} - ${ui(x, 'forStandEind')}` }),
          ovEind !== undefined &&
            subtotaal(`${Q}.2.ondernemingsvermogen.totaal`, 'Totaal ondernemingsvermogen', { C: ovEind }, { vet: 'bedrag', streepBoven: ['C'], peildatum: PEIL, herkomst: ii(x, 'for.ondernemingsvermogenEinde') }),
        ], { raster: 'balans' }),
      ],
      [],
      { kopKolommen: koppen },
    )
    return sectie('Fiscale vermogensopstelling', 2, [], [passiva])
  }

  const tb = x.begin ? balansTotalen(x.begin) : undefined
  const te = x.eind ? balansTotalen(x.eind) : undefined
  const A = `${Q}.1`
  const activaRegels: Regel[] = [
    // Spec 5.2: ook de eerste groep onder 5.2.1 Activa begint na een dubbele witregel (onder 5.2.2 Passiva niet).
    ...balansGroep(x, A, 'mva', 'Materiële vaste activa', ['materieleVasteActiva'], 'Totaal materiële vaste activa', false),
    ...balansGroep(x, A, 'voorraden', 'Voorraden', ['voorraden'], 'Totaal voorraden', false),
    ...balansGroep(x, A, 'vorderingen', 'Vorderingen', ['handelsdebiteuren', 'overigeVorderingen'], 'Totaal vorderingen', false),
  ]
  if (toon(x.begin?.liquideMiddelen, x.eind?.liquideMiddelen)) {
    activaRegels.push(
      post(`${A}.liquideMiddelen`, 'Liquide middelen', bc(x.begin ? (x.begin.liquideMiddelen ?? 0) : undefined, x.eind ? (x.eind.liquideMiddelen ?? 0) : undefined), {
        witVoor: 2,
        vet: 'regel',
        peildatum: PEIL,
        herkomst: ii(x, 'jaarrekening.begin.liquideMiddelen'),
      }),
    )
  }
  activaRegels.push(totaal(`${A}.totaal`, 'Totaal activa', bc(tb?.activa, te?.activa), { witVoor: 2, peildatum: PEIL, herkomst: `som activa ${ii(x, 'jaarrekening')}` }))

  const L = `${Q}.2`
  const ovB = tb?.ondernemingsvermogen
  const ovE = te?.ondernemingsvermogen
  const passivaRegels: MogelijkeRegel[] = [
    groepskop(`${L}.ondernemingsvermogen.kop`, 'Ondernemingsvermogen'),
    toon(forBegin, forEind) && post(`${L}.oudedagsreserve`, 'Fiscale oudedagsreserve', bc(x.begin ? (forBegin ?? 0) : undefined, x.eind ? (forEind ?? 0) : undefined), { peildatum: PEIL, herkomst: ii(x, 'jaarrekening.begin.oudedagsreserve') }),
    post(
      `${L}.exclusief-reserves`,
      'Ondernemingsvermogen exclusief fiscale reserves',
      bc(ovB !== undefined ? ovB - (forBegin ?? 0) : undefined, ovE !== undefined ? ovE - (forEind ?? 0) : undefined),
      { peildatum: PEIL, herkomst: 'ondernemingsvermogen - oudedagsreserve' },
    ),
    subtotaal(`${L}.ondernemingsvermogen.totaal`, 'Totaal ondernemingsvermogen', bc(ovB, ovE), { vet: 'bedrag', streepBoven: ['B', 'C'], peildatum: PEIL, herkomst: 'activa - schulden' }),
    ...balansGroep(x, L, 'voorzieningen', 'Voorzieningen', ['voorzieningen'], 'Totaal voorzieningen', false),
    ...balansGroep(x, L, 'langlopend', 'Langlopende schulden', ['langlopendeSchulden'], 'Totaal langlopende schulden', false),
    ...balansGroep(x, L, 'kortlopend', 'Kortlopende schulden', ['crediteuren', 'omzetbelasting', 'overigeKortlopendeSchulden'], 'Totaal kortlopende schulden', false),
    totaal(`${L}.totaal`, 'Totaal passiva', bc(tb ? tb.ondernemingsvermogen + tb.schulden : undefined, te ? te.ondernemingsvermogen + te.schulden : undefined), {
      witVoor: 2,
      peildatum: PEIL,
      herkomst: 'ondernemingsvermogen + schulden',
    }),
  ]

  // Controles op de invoer: oudedagsreserve en eindvermogen in de jaarrekening tegenover de engine.
  if (x.begin?.oudedagsreserve !== undefined && oi.for && x.begin.oudedagsreserve !== oi.for.stand) {
    c.meldingen.push({ ernst: 'let-op', tekst: `${oi.naam}: de oudedagsreserve aan het begin van het jaar in de balans (${euro(x.begin.oudedagsreserve)}) wijkt af van de stand waarmee is gerekend (${euro(oi.for.stand)}).` })
  }
  // De oudedagsreserve aan het eind in de balans tegenover de stand na de afname (een import neemt de beginstand over).
  if (x.eind?.oudedagsreserve !== undefined && o.forStandEind !== undefined && Math.round(x.eind.oudedagsreserve) !== Math.round(o.forStandEind)) {
    c.meldingen.push({
      ernst: 'let-op',
      tekst: `${oi.naam}: de oudedagsreserve aan het eind van het jaar in de balans (${euro(x.eind.oudedagsreserve)}) wijkt af van de stand na de afname waarmee is gerekend (${euro(o.forStandEind)}). Is de afname in de administratie anders geboekt dan hier ingevuld, pas dan de afname of de balans aan.`,
    })
  }
  if (ovE !== undefined && oi.for?.ondernemingsvermogenEinde !== undefined && ovE !== oi.for.ondernemingsvermogenEinde) {
    c.meldingen.push({
      ernst: 'let-op',
      tekst: `${oi.naam}: het ondernemingsvermogen aan het eind van het jaar volgens de balans (${euro(ovE)}) wijkt af van het opgegeven eindvermogen voor de oudedagsreserve (${euro(oi.for.ondernemingsvermogenEinde)}).`,
    })
  }
  if (!standIngevuld(x.begin) || !standIngevuld(x.eind)) {
    c.weggelaten.push(`${oi.naam}: de balans ${!standIngevuld(x.begin) ? 'aan het begin' : 'aan het eind'} van het jaar is niet ingevoerd.`)
  }

  return sectie('Fiscale vermogensopstelling', 2, [], [
    sectie('Activa', 3, [tabel(activaRegels, { raster: 'balans' })], [], { kopKolommen: koppen }),
    sectie('Passiva', 3, [tabel(passivaRegels, { raster: 'balans' })], [], { kopKolommen: koppen }),
  ])
}

// ---------------------------------------------------------------------------
// 5.3 Fiscale winstberekening
// ---------------------------------------------------------------------------

function winstberekeningRubrieken(x: OndernemingContext, jr: JaarrekeningInvoer): MogelijkeRegel[] {
  const { c, o, oi } = x
  const Q = `${x.P}.3`
  const r = (k: Parameters<typeof rubriek>[1]) => rubriek(jr, k)
  const her = (k: string) => ii(x, `jaarrekening.winstEnVerlies[${k}]`)
  const regels: MogelijkeRegel[] = []
  let eerste = true
  const groep = (sleutel: string, kop: string, posten: Array<{ rubriek: Parameters<typeof rubriek>[1]; label: string; teken?: 1 | -1 }>, totaalLabel: string, kosten: boolean) => {
    const getoond = posten.filter((p) => r(p.rubriek) !== undefined)
    if (getoond.length === 0) return 0
    const waarde = som(getoond.map((p) => (r(p.rubriek) ?? 0) * (p.teken ?? 1)))
    const groepTotaal = kosten ? -waarde : waarde
    regels.push(
      groepskop(`${Q}.${sleutel}.kop`, kop, eerste ? {} : { witVoor: 2 }),
      ...getoond.map((p) => post(`${Q}.${p.rubriek}`, p.label, { C: (r(p.rubriek) ?? 0) * (p.teken ?? 1) }, { herkomst: her(p.rubriek) })),
      subtotaal(`${Q}.${sleutel}.totaal`, totaalLabel, { C: groepTotaal }, { vet: 'bedrag', streepBoven: ['C'], herkomst: `som(${her(sleutel)})` }),
    )
    eerste = false
    return groepTotaal
  }
  let saldo = 0
  saldo += groep('opbrengsten', 'Opbrengsten', [{ rubriek: 'omzet', label: 'Netto-omzet' }, { rubriek: 'onderhandenWerk', label: 'Wijziging in voorraden gereed product en onderhanden werk' }], 'Totaal opbrengsten', false)
  saldo += groep('inkoop', 'Kosten van grond- en hulpstoffen, uitbesteed werk, e.d.', [{ rubriek: 'inkoop', label: 'Kosten van uitbesteed werk en andere externe kosten' }], 'Totaal inkoopkosten en uitbesteed werk', true)
  saldo += groep('afschrijvingen', 'Afschrijvingen', [{ rubriek: 'afschrijvingen', label: 'Overige materiële vaste activa' }], 'Totaal afschrijvingen', true)
  saldo += groep('personeel', 'Personeelskosten', [{ rubriek: 'personeel', label: 'Lonen, salarissen en sociale lasten' }], 'Totaal personeelskosten', true)
  saldo += groep('overige-kosten', 'Overige bedrijfskosten', OVERIGE_KOSTEN_RUBRIEKEN, 'Totaal overige bedrijfskosten', true)
  saldo += groep(
    'financieel',
    'Financiële baten en lasten',
    [
      { rubriek: 'financieleBaten', label: 'Opbrengsten van banktegoeden' },
      { rubriek: 'financieleLasten', label: 'Kosten van schulden, andere rentelasten en soortgelijke kosten', teken: -1 },
    ],
    'Totaal financiële baten en lasten',
    false,
  )
  // De rubrieken zijn de geboekte cijfers; het activaregister vervangt de geboekte afschrijving door de fiscale.
  const correctie = o.correctieAfschrijving ?? 0
  if (correctie !== 0) {
    regels.push(
      post(`${Q}.correctie-afschrijving`, 'Correctie geboekte naar fiscale afschrijving (activaregister)', { C: correctie }, { witVoor: 2, herkomst: ui(x, 'correctieAfschrijving') }),
    )
  }
  const verschil = o.saldo - correctie - saldoRubrieken(jr)
  if (verschil !== 0) {
    regels.push(post(`${Q}.niet-verklaard`, 'Niet verklaard verschil met het saldo', { C: verschil }, { witVoor: 2, herkomst: `${ui(x, 'saldo')} - som rubrieken` }))
    c.meldingen.push({
      ernst: 'actie',
      tekst: `${oi.naam}: de rubrieken van de winstberekening tellen op tot ${euro(saldo)}, het saldo waarmee is gerekend is ${euro(o.saldo - correctie)}${correctie !== 0 ? ' vóór de correctie op de afschrijving' : ''} (verschil ${euro(verschil)}).`,
    })
  }
  return regels
}

function winstberekeningUitgesplitst(x: OndernemingContext): MogelijkeRegel[] {
  const { o, oi } = x
  const wb = oi.winstberekening
  if (wb.soort !== 'uitgesplitst') return []
  const Q = `${x.P}.3`
  const whw = wb.wijzigingOnderhandenWerk ?? 0
  // Het register vervangt de geboekte afschrijving alleen als het meetelt; anders staat de geboekte afschrijving er.
  const register = registerTeltMee(oi) ? o.afschrijvingen : undefined
  const afschrijvingen = register ? som(register.map((a) => a.afschrijving)) : (wb.afschrijvingen ?? 0)
  const boekwinst = register ? som(register.map((a) => a.boekwinst)) : 0
  const autokosten = oi.auto ? Math.max(0, oi.auto.autokosten) : 0
  const beperkt = Math.max(0, oi.beperktAftrekbaar ?? 0)
  const fin = wb.financieleBatenLasten ?? 0
  const opbrengsten = wb.omzet + whw + boekwinst
  const overige = autokosten + o.kilometeraftrek + beperkt + wb.kosten
  return [
    groepskop(`${Q}.opbrengsten.kop`, 'Opbrengsten'),
    post(`${Q}.omzet`, 'Netto-omzet', { C: wb.omzet }, { herkomst: ii(x, 'winstberekening.omzet') }),
    whw !== 0 && post(`${Q}.onderhandenWerk`, 'Wijziging in voorraden gereed product en onderhanden werk', { C: whw }, { herkomst: ii(x, 'winstberekening.wijzigingOnderhandenWerk') }),
    boekwinst !== 0 && post(`${Q}.boekwinst`, 'Boekresultaat verkochte bedrijfsmiddelen', { C: boekwinst }, { herkomst: `som(${ui(x, 'afschrijvingen[].boekwinst')})` }),
    subtotaal(`${Q}.opbrengsten.totaal`, 'Totaal opbrengsten', { C: opbrengsten }, { vet: 'bedrag', streepBoven: ['C'] }),
    ...(afschrijvingen !== 0
      ? [
          groepskop(`${Q}.afschrijvingen.kop`, 'Afschrijvingen', { witVoor: 2 }),
          post(`${Q}.afschrijvingen`, 'Overige materiële vaste activa', { C: afschrijvingen }, { herkomst: register ? `som(${ui(x, 'afschrijvingen[].afschrijving')})` : ii(x, 'winstberekening.afschrijvingen') }),
          subtotaal(`${Q}.afschrijvingen.totaal`, 'Totaal afschrijvingen', { C: -afschrijvingen }, { vet: 'bedrag', streepBoven: ['C'] }),
        ]
      : []),
    groepskop(`${Q}.overige-kosten.kop`, 'Overige bedrijfskosten', { witVoor: 2 }),
    autokosten !== 0 && post(`${Q}.auto`, 'Auto- en transportkosten', { C: autokosten }, { herkomst: ii(x, 'auto.autokosten') }),
    o.kilometeraftrek !== 0 && post(`${Q}.kilometers`, 'Zakelijke kilometers met eigen vervoer', { C: o.kilometeraftrek }, { herkomst: ui(x, 'kilometeraftrek') }),
    beperkt !== 0 && post(`${Q}.beperktAftrekbaar`, 'Beperkt aftrekbare kosten', { C: beperkt }, { herkomst: ii(x, 'beperktAftrekbaar') }),
    post(`${Q}.overig`, 'Overige kosten', { C: wb.kosten }, { herkomst: ii(x, 'winstberekening.kosten') }),
    subtotaal(`${Q}.overige-kosten.totaal`, 'Totaal overige bedrijfskosten', { C: -overige }, { vet: 'bedrag', streepBoven: ['C'] }),
    ...(fin !== 0
      ? [
          groepskop(`${Q}.financieel.kop`, 'Financiële baten en lasten', { witVoor: 2 }),
          post(`${Q}.financieel`, 'Financiële baten en lasten (saldo)', { C: fin }, { herkomst: ii(x, 'winstberekening.financieleBatenLasten') }),
          subtotaal(`${Q}.financieel.totaal`, 'Totaal financiële baten en lasten', { C: fin }, { vet: 'bedrag', streepBoven: ['C'] }),
        ]
      : []),
  ]
}

function winstberekening(x: OndernemingContext): Sectie | null {
  const { c, o, oi, jr } = x
  const Q = `${x.P}.3`
  let regels: MogelijkeRegel[]
  if (jr?.winstEnVerlies && jr.winstEnVerlies.length > 0) regels = winstberekeningRubrieken(x, jr)
  else if (oi.winstberekening.soort === 'uitgesplitst') regels = winstberekeningUitgesplitst(x)
  else {
    c.weggelaten.push(`${oi.naam}: de fiscale winstberekening in rubrieken is niet opgenomen, alleen het saldo is ingevoerd.`)
    return null
  }
  regels.push(totaal(`${Q}.saldo`, 'Saldo fiscale winstberekening', { C: o.saldo }, { witVoor: 2, herkomst: ui(x, 'saldo') }))
  return sectie('Fiscale winstberekening', 2, [tabel(regels)], [], { kopKolommen: [kd('C', `Fiscaal ${c.jaar}`)] })
}

// ---------------------------------------------------------------------------
// 5.4 en 5.5 Specificaties
// ---------------------------------------------------------------------------

function specificatieTabel(x: OndernemingContext, Q: string, postNaam: BalansPost, eerste: boolean): Blok[] {
  const specs = (x.jr?.specificaties ?? []).map((s, i) => ({ s, i })).filter(({ s }) => s.post === postNaam)
  if (specs.length === 0) return []
  const begin = som(specs.map(({ s }) => s.begin))
  const eind = som(specs.map(({ s }) => s.eind))
  const balansBegin = x.begin?.[postNaam]
  const balansEind = x.eind?.[postNaam]
  if ((balansBegin !== undefined && balansBegin !== begin) || (balansEind !== undefined && balansEind !== eind)) {
    x.c.meldingen.push({
      ernst: 'let-op',
      tekst: `${x.oi.naam}: de specificatie van ${BALANS_LABEL[postNaam].toLowerCase()} (begin ${euro(begin)}, eind ${euro(eind)}) sluit niet aan op de balans (begin ${euro(balansBegin ?? 0)}, eind ${euro(balansEind ?? 0)}).`,
    })
  }
  return [
    kopTekst(BALANS_LABEL[postNaam], eerste ? undefined : 1),
    tabel(
      [
        ...specs.map(({ s, i }, k) => post(`${Q}.${postNaam}.${k + 1}`, s.omschrijving, { B: s.begin, C: s.eind }, { peildatum: PEIL, herkomst: ii(x, `jaarrekening.specificaties[${i}]`) })),
        subtotaal(`${Q}.${postNaam}.totaal`, undefined, { B: begin, C: eind }, { streepBoven: ['B', 'C'], peildatum: PEIL, herkomst: `som(${ii(x, 'jaarrekening.specificaties')})` }),
      ],
      { koppen: [kk('omschrijving', 'Omschrijving'), kk('B', 'Fiscaal begin'), kk('C', 'Fiscaal eind')] },
    ),
  ]
}

/**
 * 5.4.1 uit het activaregister: een regel per bedrijfsmiddel, het totaal en de aansluiting op de balanspost
 * materiële vaste activa (5.2). Sluit het totaal niet aan, dan staan het verschil en de balanspost eronder, met een
 * melding: de balans is dan niet de fiscale, of er staan bedrijfsmiddelen niet in het register.
 */
function registerRegels(x: OndernemingContext, Q: string, afschr: NonNullable<OndernemingResultaat['afschrijvingen']>): Regel[] {
  const totaalZ = som(afschr.map((a) => a.aanschafwaarde))
  const totaalA = som(afschr.map((a) => a.restwaarde))
  const totaalB = som(afschr.map((a) => a.boekwaardeBegin))
  const totaalC = som(afschr.map((a) => a.boekwaardeEind))
  const regels: Regel[] = [
    ...afschr.map((a, i) =>
      post(`${Q}.1.actief.${i + 1}`, a.omschrijving, { Z: a.aanschafwaarde, A: a.restwaarde, B: a.boekwaardeBegin, C: a.boekwaardeEind }, { peildatum: PEIL, herkomst: ui(x, `afschrijvingen[${i}]`) }),
    ),
    subtotaal(`${Q}.1.totaal`, 'Totaal activaregister', { Z: totaalZ, A: totaalA, B: totaalB, C: totaalC }, {
      vet: 'bedrag',
      streepBoven: ['Z', 'A', 'B', 'C'],
      peildatum: PEIL,
      herkomst: `som(${ui(x, 'afschrijvingen[]')})`,
    }),
  ]
  const balansB = x.begin ? Math.round(x.begin.materieleVasteActiva ?? 0) : undefined
  const balansC = x.eind ? Math.round(x.eind.materieleVasteActiva ?? 0) : undefined
  const verschilB = balansB !== undefined ? balansB - Math.round(totaalB) : 0
  const verschilC = balansC !== undefined ? balansC - Math.round(totaalC) : 0
  if (verschilB === 0 && verschilC === 0) return regels
  regels.push(
    post(`${Q}.1.verschil-balans`, 'Verschil met de balans', bc(balansB !== undefined ? verschilB : undefined, balansC !== undefined ? verschilC : undefined), {
      peildatum: PEIL,
      herkomst: `${ii(x, 'jaarrekening.begin.materieleVasteActiva')} - som(${ui(x, 'afschrijvingen[].boekwaarde')})`,
    }),
    subtotaal(`${Q}.1.balans`, 'Materiële vaste activa volgens de balans', bc(balansB, balansC), { vet: 'bedrag', streepBoven: ['B', 'C'], peildatum: PEIL, herkomst: ii(x, 'jaarrekening.begin.materieleVasteActiva') }),
  )
  const stand = (b: number | undefined, c: number | undefined) => [b !== undefined ? `begin ${euro(b)}` : '', c !== undefined ? `eind ${euro(c)}` : ''].filter(Boolean).join(', ')
  x.c.meldingen.push({
    ernst: 'let-op',
    tekst: `${x.oi.naam}: de fiscale boekwaarde volgens het activaregister (${stand(balansB !== undefined ? totaalB : undefined, balansC !== undefined ? totaalC : undefined)}) sluit niet aan op de materiële vaste activa in de balans (${stand(balansB, balansC)}). Staan er bedrijfsmiddelen niet in het register, of is de balans niet fiscaal afgeschreven, pas dan het register of de balans aan.`,
  })
  return regels
}

function specificatieActiva(x: OndernemingContext): Sectie | null {
  const Q = `${x.P}.4`
  const secties: Array<Sectie | null> = []

  // 5.4.1 Materiële vaste activa: het activaregister als het meetelt in de winst, anders de balanspost met aanschaf- en restwaarde.
  const telt = registerTeltMee(x.oi)
  const afschr = telt ? (x.o.afschrijvingen ?? []) : []
  const mvaBalans = toon(x.begin?.materieleVasteActiva, x.eind?.materieleVasteActiva)
  if (!telt && (x.oi.activa ?? []).length > 0) {
    const reden = x.oi.activaVolledig !== true ? 'niet is aangegeven dat alle bedrijfsmiddelen erin staan' : 'de afschrijving in het saldo niet is ingevuld'
    x.c.weggelaten.push(
      `${x.oi.naam}: het activaregister telt niet mee in de winst, omdat ${reden}. De specificatie van de materiële vaste activa ${mvaBalans ? 'volgt daarom de balans' : 'is daarom niet opgenomen'}.`,
    )
  }
  if (afschr.length > 0 || mvaBalans) {
    const regels: Regel[] = afschr.length > 0 ? registerRegels(x, Q, afschr) : [
      post(
        `${Q}.1.mva`,
        'Overige materiële vaste activa',
        { ...(x.jr?.mva ? { Z: x.jr.mva.aanschafwaarde, A: x.jr.mva.restwaarde } : {}), ...bc(x.begin ? (x.begin.materieleVasteActiva ?? 0) : undefined, x.eind ? (x.eind.materieleVasteActiva ?? 0) : undefined) },
        { peildatum: PEIL, herkomst: ii(x, 'jaarrekening.mva') },
      ),
    ]
    secties.push(
      sectie('Materiële vaste activa', 3, [
        kopTekst('Overige materiële vaste activa'),
        tabel(regels, { koppen: [kk('Z', 'Kosten aanschaf'), kk('A', 'Restwaarde'), kk('B', 'Fiscaal begin'), kk('C', 'Fiscaal eind')] }),
      ]),
    )
  }

  // 5.4.2 Vorderingen
  const vorderingen: Blok[] = []
  if (toon(x.begin?.handelsdebiteuren, x.eind?.handelsdebiteuren)) {
    const spec = specificatieTabel(x, `${Q}.2`, 'handelsdebiteuren', true)
    if (spec.length > 0) vorderingen.push(...spec)
    else {
      vorderingen.push(
        kopTekst('Vorderingen op handelsdebiteuren'),
        tabel(
          [
            post(`${Q}.2.handelsdebiteuren`, 'Vorderingen op handelsdebiteuren', { ...(x.eind ? { A: x.eind.handelsdebiteuren ?? 0 } : {}), ...bc(x.begin?.handelsdebiteuren, x.eind?.handelsdebiteuren) }, {
              peildatum: PEIL,
              herkomst: ii(x, 'jaarrekening.eind.handelsdebiteuren'),
            }),
          ],
          { koppen: [kk('A', 'Nominale waarde'), kk('B', 'Fiscaal begin'), kk('C', 'Fiscaal eind')] },
        ),
      )
    }
  }
  vorderingen.push(...specificatieTabel(x, `${Q}.2`, 'overigeVorderingen', vorderingen.length === 0))
  if (vorderingen.length > 0) secties.push(sectie('Vorderingen', 3, vorderingen))

  for (const [p, titel] of [
    ['voorraden', 'Voorraden'],
    ['liquideMiddelen', 'Liquide middelen'],
  ] as Array<[BalansPost, string]>) {
    const spec = specificatieTabel(x, Q, p, true)
    if (spec.length > 0) secties.push(sectie(titel, 3, spec))
  }
  const gevuld = secties.filter((s): s is Sectie => !!s)
  return gevuld.length > 0 ? sectie('Specificatie balans activa', 2, [], gevuld) : null
}

function specificatiePassiva(x: OndernemingContext): Sectie | null {
  const Q = `${x.P}.5`
  const secties: Sectie[] = []
  const kort: Blok[] = []
  for (const p of ['crediteuren', 'omzetbelasting', 'overigeKortlopendeSchulden'] as BalansPost[]) kort.push(...specificatieTabel(x, `${Q}.1`, p, kort.length === 0))
  if (kort.length > 0) secties.push(sectie('Kortlopende schulden', 3, kort))
  for (const [p, titel] of [
    ['voorzieningen', 'Voorzieningen'],
    ['langlopendeSchulden', 'Langlopende schulden'],
  ] as Array<[BalansPost, string]>) {
    const spec = specificatieTabel(x, Q, p, true)
    if (spec.length > 0) secties.push(sectie(titel, 3, spec))
  }
  return secties.length > 0 ? sectie('Specificatie balans passiva', 2, [], secties) : null
}

// ---------------------------------------------------------------------------
// 5.6 Algemene gegevens en investeringsaftrek
// ---------------------------------------------------------------------------

const REGELING: Record<string, string> = { kia: 'KIA', eia: 'EIA', 'mia-1': 'MIA', 'mia-2': 'MIA', 'mia-3': 'MIA' }

/** Som van de investeringsbedragen, elk bedrijfsmiddel één keer (een middel met KIA en EIA staat twee keer in de lijst). */
function totaalInvesteringen(middelen: NonNullable<OndernemingResultaat['investeringsaftrekPerMiddel']>): number {
  const gezien = new Set<string>()
  let totaal = 0
  for (const m of middelen) {
    const sleutel = `${m.omschrijving}|${m.datum}|${m.bedrag}`
    if (gezien.has(sleutel)) continue
    gezien.add(sleutel)
    totaal += m.bedrag
  }
  return totaal
}

function algemeen(x: OndernemingContext): Sectie {
  const { c, oi, o } = x
  const Q = `${x.P}.6`
  const vraag = (id: string, tekst: string, antwoord: string, witVoor?: 1 | 2): VraagBlok => ({ soort: 'vraag', id: `${Q}.1.${id}`, vraag: tekst, antwoord, ...(witVoor ? { witVoor } : {}) })
  const willekeurig = registerTeltMee(oi) && (oi.activa ?? []).some((a) => a.methode === 'willekeurig-starter' || a.methode === 'vamil')
  // Spec 5.6.1: het antwoord op de eerste vraag, de kolomkoppen Begin en Einde en de datums staan links uitgelijnd
  // op de linkerrand van kolom A (105,6 mm) en B (135,2 mm), niet rechts zoals een bedrag.
  const gegevens = sectie('Algemene gegevens', 3, [
    { ...vraag('naam-gewijzigd', 'Is de naam van de onderneming gewijzigd?', 'nee'), antwoordKolom: 'B' },
    tabel(
      [
        post(`${Q}.1.boekjaar`, 'Begin- en einddatum van boekjaar', {}, {
          teksten: { A: datumKort(`${c.jaar}-01-01`), B: datumKort(`${c.jaar}-12-31`) },
          tekstLinks: ['A', 'B'],
        }),
      ],
      { koppen: [{ ...kk('A', 'Begin'), uitlijning: 'links' }, { ...kk('B', 'Einde'), uitlijning: 'links' }] },
    ),
    kopTekst('Omschrijving van de activiteiten', 1),
    { soort: 'tekst', tekst: x.jr?.omschrijvingActiviteiten?.trim() || oi.naam },
    vraag('waarderingsstelsel', `Heeft ${oi.naam} het waarderingsstelsel van activa en/of passiva in dit boekjaar gewijzigd?`, 'nee', 1),
    vraag('schadeloosstellingen', `Heeft ${oi.naam} toegekende of ontvangen schadeloosstellingen geheel of gedeeltelijk buiten de fiscale winst gehouden?`, 'nee', 1),
    vraag('agrarisch', `Heeft ${oi.naam} in dit boekjaar agrarische activiteiten verricht?`, 'nee', 1),
    vraag('willekeurig', `Heeft ${oi.naam} dit boekjaar willekeurig afgeschreven op bedrijfsmiddelen?`, willekeurig ? 'ja' : 'nee', 1),
    vraag('tonnageregeling', 'Wordt er dit boekjaar gebruik gemaakt van de tonnageregeling?', 'nee', 2),
  ])
  const middelen = o.investeringsaftrekPerMiddel ?? []
  const investeringen =
    som(middelen.map((m) => m.aftrek)) > 0
      ? sectie('Investeringsaftrek', 3, [
          tabel(
            [
              ...middelen.map((m, i) =>
                post(`${Q}.2.middel.${i + 1}`, m.omschrijving, { A: m.betaald, B: m.bedrag, C: m.aftrek }, {
                  teksten: { soort: REGELING[m.regeling] ?? m.regeling.toUpperCase(), datum: datumKort(m.datum), aandeel: percentage(1) },
                  herkomst: ui(x, `investeringsaftrekPerMiddel[${i}]`),
                }),
              ),
              subtotaal(`${Q}.2.totaal`, undefined, { B: totaalInvesteringen(middelen), C: som(middelen.map((m) => m.aftrek)) }, {
                streepBoven: ['B', 'C'],
                herkomst: `som(${ui(x, 'investeringsaftrekPerMiddel[]')})`,
              }),
            ],
            {
              raster: 'investeringsaftrek',
              koppen: [
                kk('omschrijving', 'Omschrijving', 'bedrijfsmiddel'),
                kk('soort', 'Soort', 'investerings-', 'aftrek'),
                kk('datum', 'Datum', 'investering'),
                kk('aandeel', 'Aandeel in de', 'investering'),
                kk('A', 'Betaald bedrag', 'in dit boekjaar'),
                kk('B', 'Totaalbedrag'),
                kk('C', 'Investeringsaftrek'),
              ],
            },
          ),
        ])
      : null
  return sectie('Algemene gegevens en specificaties', 2, [], [gegevens, investeringen])
}

// ---------------------------------------------------------------------------

export function hoofdstukkenWinstaangifte(c: RapportContext, slugs: string[]): Sectie[] {
  return c.pi.ondernemingen.flatMap((oi, k) => {
    const o = c.p.ondernemingen[k]
    if (!o) return []
    const jr = oi.jaarrekening
    const x: OndernemingContext = { c, o, oi, k, P: `5.${slugs[k]}`, jr, begin: standIngevuld(jr?.begin) ? jr?.begin : undefined, eind: standIngevuld(jr?.eind) ? jr?.eind : undefined }
    if (!jr) {
      c.weggelaten.push(
        `${oi.naam}: geen jaarrekening ingevoerd. De balans (activa en schulden) en de specificaties ervan zijn niet opgenomen; de fiscale vermogensopstelling toont alleen de oudedagsreserve en het eindvermogen.`,
      )
    }
    const secties = [kapitaalsvergelijking(x), vermogensopstelling(x), winstberekening(x), specificatieActiva(x), specificatiePassiva(x), algemeen(x)]
    return [sectie(`Winstaangifte ${c.jaar} van ${oi.naam}`, 1, [], secties, { nieuwePagina: true })]
  })
}
