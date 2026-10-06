/**
 * Handgemaakt rapportdocument voor de tests van de PDF- en Excel-weergave.
 *
 * Bedragen van persoon A uit het verzonnen voorbeeldhuishouden 2024 (lib/voorbeeld), met de eigen woning en de
 * dividendbelasting zoals in dit document verdeeld. Namen, adres, rekening- en polisnummers zijn ook verzonnen.
 *
 * Bevat alle bloksoorten (tabel, tekst, vraag, gegevens), alle rasters (standaard, lijfrente, balans,
 * investeringsaftrek), kolomkoppen (vet cursief, datum met streep, meerregelig, links in een bedragkolom),
 * tekst links in een bedragkolom, een antwoord links in kolom B, kopkolommen op een
 * sectiekop, strepen boven en onder, dubbele strepen, enkele en dubbele witregels, lange labels die
 * afbreken, percentages, tekstkolommen en een bijlage met jaarblokken die over pagina's loopt
 * (paginabreuk met herhaalde groepskop).
 */
import type { Kolom, RapportDocument, Regel, Sectie, TabelBlok } from '@/lib/rapport/model'
import { RAPPORT_MODEL_VERSIE } from '@/lib/rapport/model'

type Bedragen = Partial<Record<Kolom, number>>

const post = (id: string, label: string | undefined, bedragen: Bedragen, extra: Partial<Regel> = {}): Regel => ({
  id,
  label,
  soort: 'post',
  bedragen,
  ...extra,
})
const subtotaal = (id: string, label: string | undefined, bedragen: Bedragen, extra: Partial<Regel> = {}): Regel => ({
  id,
  label,
  soort: 'subtotaal',
  bedragen,
  ...extra,
})
const totaal = (id: string, label: string, bedragen: Bedragen, extra: Partial<Regel> = {}): Regel => ({
  id,
  label,
  soort: 'totaal',
  bedragen,
  vet: 'regel',
  ...extra,
})
const groepskop = (id: string, label: string, extra: Partial<Regel> = {}): Regel => ({ id, label, soort: 'groepskop', ...extra })
const tabel = (regels: Regel[], extra: Partial<TabelBlok> = {}): TabelBlok => ({ soort: 'tabel', raster: 'standaard', regels, ...extra })
const sectie = (titel: string, niveau: 1 | 2 | 3, blokken: Sectie['blokken'], secties: Sectie[] = [], extra: Partial<Sectie> = {}): Sectie => ({
  titel,
  niveau,
  blokken,
  secties,
  ...extra,
})
const peildata = (jaar: number, streepOnder = true): TabelBlok =>
  tabel([], {
    koppen: [
      { kolom: 'B', regels: [`01-01-${jaar}`], stijl: 'datum', streepOnder },
      { kolom: 'C', regels: [`31-12-${jaar}`], stijl: 'datum', streepOnder },
    ],
  })
const beginEind = { B: 'begin', C: 'eind' } as const

// Wettelijke maxima 2024: schijf 1 en 2 vol, premie en Zvw-bijdrage over het maximum.
const SCHIJF_1 = Math.floor(38098 * 0.0932)
const SCHIJF_2 = Math.floor(37420 * 0.3697)
const AOW = Math.floor(38098 * 0.179)
const ANW = Math.floor(38098 * 0.001)
const WLZ = Math.floor(38098 * 0.0965)
const PREMIE = Math.floor(38098 * 0.2765)
const ZVW = Math.floor(71628 * 0.0532)

// ---------------------------------------------------------------------------
// Hoofdstuk 1 en 2
// ---------------------------------------------------------------------------

const h1 = sectie('Persoonlijke gegevens', 1, [
  {
    soort: 'gegevens',
    rijen: [
      { label: 'Naam', waarde: 'Persoon A' },
      { label: 'Geboortedatum', waarde: '21-09-1983' },
      { label: 'Partner', kop: true, witVoor: 1 },
      { label: 'Naam', waarde: 'Persoon B' },
      { label: 'Geboortedatum', waarde: '04-05-1986' },
      { label: 'Persoonlijke situatie', waarde: 'Samenwonend met samenlevingscontract', witVoor: 1 },
      { label: 'Persoon A staat heel 2024 op hetzelfde adres ingeschreven als de huisgenoot.', witVoor: 1 },
      { label: 'Persoon A voldoet met de huisgenoot aan de voorwaarden fiscaal partnerschap.', witVoor: 1 },
      { label: 'Persoon A en de huisgenoot zijn heel 2024 fiscale partners.', witVoor: 1 },
    ],
  },
])

const s21 = sectie('Drempel-/ verzamel-/ belastbaar inkomen', 2, [
  tabel([
    post('2.1.winst', 'Belastbare winst uit onderneming', { B: 127935 }, { herkomst: 'personen[0].belastbareWinst' }),
    post('2.1.eigen-woning', 'Eigen woning', { B: -6418 }, { herkomst: 'personen[0].eigenWoning' }),
    post('2.1.inkomensvoorziening', 'Uitgaven voor inkomensvoorziening', { B: -13260 }, { herkomst: 'personen[0].inkomensvoorziening.totaal' }),
    subtotaal('2.1.drempel-box1', 'Drempelinkomen uit werk en woning (box 1)', { C: 108257 }, { streepBoven: ['B'] }),
    post('2.1.drempel-box3', 'Drempelinkomen uit sparen en beleggen (box 3)', { C: 296 }),
    totaal('2.1.drempelinkomen', 'Drempelinkomen', { C: 108553 }, { streepBoven: ['C'], dubbelOnder: ['C'] }),
    post('2.1.drempel-box1-b', 'Drempelinkomen uit werk en woning (box 1)', { B: 108257 }, { witVoor: 1 }),
    subtotaal('2.1.verzamel-box1', 'Verzamelinkomen uit werk en woning (box 1)', { C: 108257 }, { streepBoven: ['B'] }),
    post('2.1.drempel-box3-b', 'Drempelinkomen uit sparen en beleggen (box 3)', { B: 296 }),
    subtotaal('2.1.verzamel-box3', 'Verzamelinkomen uit sparen en beleggen (box 3)', { C: 296 }, { streepBoven: ['B'] }),
    totaal('2.1.verzamelinkomen', 'Verzamelinkomen', { C: 108553 }, { streepBoven: ['C'], dubbelOnder: ['C'] }),
    post('2.1.verzamel-box1-b', 'Verzamelinkomen uit werk en woning (box 1)', { B: 108257 }, { witVoor: 1 }),
    subtotaal('2.1.belastbaar-box1', 'Belastbaar inkomen uit werk en woning (box 1)', { C: 108257 }, { streepBoven: ['B'] }),
    post('2.1.verzamel-box3-b', 'Verzamelinkomen uit sparen en beleggen (box 3)', { B: 296 }),
    subtotaal('2.1.belastbaar-box3', 'Belastbaar inkomen uit sparen en beleggen (box 3)', { C: 296 }, { streepBoven: ['B'] }),
    totaal('2.1.belastbaar', 'Totaal belastbaar inkomen', { C: 108553 }, { streepBoven: ['C'], dubbelOnder: ['C'] }),
  ]),
])

const s22 = sectie('Belastingberekening', 2, [], [
  sectie('Verschuldigde inkomstenbelasting en premie volksverzekeringen', 3, [
    tabel([
      groepskop('2.2.1.box1', 'Verschuldigde belasting (box 1)'),
      post('2.2.1.schijf-1', 'Belasting 1e schijf: 9,32% over 38.098', { B: SCHIJF_1 }, { herkomst: 'personen[0].box1.schijven[0].belasting' }),
      post('2.2.1.schijf-2', 'Belasting 2e schijf: 36,97% over 37.420', { B: SCHIJF_2 }, { herkomst: 'personen[0].box1.schijven[1].belasting' }),
      post('2.2.1.schijf-3', 'Belasting 3e schijf: 49,50% over 32.739', { B: 16205 }, { herkomst: 'personen[0].box1.schijven[2].belasting' }),
      post('2.2.1.tariefmaatregel', 'Beperking tarief aftrekbare bedragen: 12,53% over 29.811', { B: 3735 }),
      subtotaal('2.2.1.totaal-box1', 'Totaal box 1 belasting', { C: 37324 }, { streepBoven: ['B'] }),
      groepskop('2.2.1.premies', 'Verschuldigde premie volksverzekeringen (box 1)', { witVoor: 1 }),
      post('2.2.1.premie-inkomen', 'Premie-inkomen', { A: 38098 }, { dubbelOnder: ['A'] }),
      post('2.2.1.aow', 'Premie AOW: 17,90% over 38.098', { B: AOW }),
      post('2.2.1.anw', 'Premie ANW: 0,10% over 38.098', { B: ANW }),
      post('2.2.1.wlz', 'Premie WLZ: 9,65% over 38.098', { B: WLZ }),
      subtotaal('2.2.1.totaal-premies', 'Totaal premie volksverzekeringen', { C: PREMIE }, { streepBoven: ['B'] }),
      groepskop('2.2.1.box3', 'Verschuldigde belasting (box 3)', { witVoor: 1 }),
      post('2.2.1.box3-belasting', 'Box 3 belasting: 36,00% over 296', { B: 106 }),
      post('2.2.1.bronbelasting', 'Verrekening van buitenlandse bronbelasting box 3', { B: -63 }),
      subtotaal('2.2.1.totaal-box3', 'Totaal box 3 belasting', { C: 43 }, { streepBoven: ['B'] }),
      subtotaal('2.2.1.berekend', 'Berekende inkomstenbelasting en premie volksverzekeringen', { C: 47901 }, { witVoor: 1, streepBoven: ['C'] }),
    ]),
  ]),
  sectie('Heffingskortingen', 3, [
    tabel(
      [
        post('2.2.2.ahk', 'Algemene heffingskorting', { Z: 0, A: 0, B: 0 }),
        post('2.2.2.ak', 'Arbeidskorting', { Z: 0, A: 0, B: 0 }),
        subtotaal('2.2.2.maximaal', 'Maximaal toepasbare heffingskortingen', { C: 0 }, { streepBoven: ['B'] }),
        subtotaal('2.2.2.verschuldigd', 'Verschuldigde belasting', { C: 47901 }, { witVoor: 1, streepBoven: ['C'] }),
      ],
      {
        koppen: [
          { kolom: 'Z', regels: ['Belastingdeel'], stijl: 'kop' },
          { kolom: 'A', regels: ['Premiedeel'], stijl: 'kop' },
        ],
      },
    ),
  ]),
  sectie('Voorheffingen', 3, [
    tabel([
      post('2.2.3.dividendbelasting', 'Dividendbelasting', { B: 0 }),
      subtotaal('2.2.3.voorheffingen', 'Voorheffingen', { C: 0 }, { streepBoven: ['B'] }),
      subtotaal('2.2.3.subtotaal', 'Subtotaal verschuldigde belastingen minus voorheffingen', { C: 47901 }, { witVoor: 1, streepBoven: ['C'] }),
    ]),
  ]),
  sectie('Voorlopige aanslagen en teruggaven', 3, [
    tabel([
      post('2.2.4.betaald', 'Betaald bedrag', { C: -43500 }),
      totaal('2.2.4.te-betalen', 'Te betalen inkomstenbelasting', { C: 4401 }, { witVoor: 1, streepBoven: ['C'], dubbelOnder: ['C'] }),
    ]),
  ]),
], { bijElkaar: true })

const s23 = sectie('Zorgverzekeringswet (Zvw)', 2, [
  tabel([
    groepskop('2.3.kop-bijdrage-inkomen', 'Bijdrage-inkomen'),
    post('2.3.winst', 'Belastbare winst', { B: 127935 }),
    subtotaal('2.3.bijdrage-inkomen', 'Bijdrage-inkomen', { C: 127935 }, { streepBoven: ['B'] }),
    subtotaal('2.3.maximum', 'Inkomen waarover nog geen Zvw-bijdrage is afgedragen (max. € 71.628)', { C: 71628 }, { streepBoven: ['C'] }),
    totaal('2.3.bijdrage-inkomen-zvw', 'Bijdrage-inkomen Zvw (min. 0)', { C: 71628 }, { streepBoven: ['C'], dubbelOnder: ['C'] }),
    groepskop('2.3.kop-aanslag', 'Berekening aanslag', { witVoor: 2 }),
    post('2.3.bijdrage', 'Af te dragen inkomensafhankelijke bijdrage Zvw: 5,32% over 71.628', { C: ZVW }),
    post('2.3.voorlopig', 'Voorlopige aanslagen', { C: -3700 }),
    totaal('2.3.te-betalen', 'Te betalen inkomensafhankelijke bijdrage Zorgverzekeringswet', { C: ZVW - 3700 }, { streepBoven: ['C'], dubbelOnder: ['C'] }),
  ]),
], [], { bijElkaar: true })

const h2 = sectie('Inkomstenbelasting en premieheffing', 1, [], [s21, s22, s23])

// ---------------------------------------------------------------------------
// Hoofdstuk 3
// ---------------------------------------------------------------------------

const s311 = sectie('Winst uit onderneming', 3, [
  tabel([
    groepskop('3.1.1.kop', 'Saldo fiscale winstberekeningen ondernemingen'),
    post('3.1.1.onderneming-0', 'Onderneming A', { B: 152340 }, { streepOnder: ['B'] }),
    post('3.1.1.fiscale-winst', 'Fiscale winstberekening', { C: 152340 }, { witVoor: 1 }),
    post('3.1.1.niet-aftrekbaar', 'Niet of gedeeltelijk aftrekbare kosten', { B: 228 }),
    post('3.1.1.investeringsregelingen', 'Investeringsregelingen', { B: -1240 }),
    subtotaal('3.1.1.correcties', 'Totaal winstcorrecties', { C: -1012 }, { streepBoven: ['B'] }),
    subtotaal('3.1.1.winst', 'Winst uit onderneming', { C: 151328 }, { streepBoven: ['C'] }),
    post('3.1.1.zelfstandigenaftrek', 'Zelfstandigenaftrek', { B: 3750 }),
    subtotaal('3.1.1.ondernemersaftrek', 'Totaal ondernemersaftrek', { C: -3750 }, { streepBoven: ['B'] }),
    subtotaal('3.1.1.na-aftrek', 'Winst uit onderneming na aftrek', { C: 147578 }, { streepBoven: ['C'] }),
    post('3.1.1.mkb', 'MKB-winstvrijstelling', { C: -19643 }),
    subtotaal('3.1.1.belastbaar', 'Belastbare winst uit onderneming', { C: 127935 }, { streepBoven: ['C'] }),
  ]),
], [], { bijElkaar: true })

const s312 = sectie('Inkomsten uit eigen woning', 3, [
  tabel([groepskop('3.1.2.kop-inkomsten', 'Inkomsten eigen woning')]),
  tabel(
    [
      {
        id: '3.1.2.woning-0',
        soort: 'post',
        teksten: { adres: 'Voorbeeldstraat 1', Z: '100%', A: '01-01 t/m 31-12' },
        bedragen: { N: 412000, B: 1442 },
      },
    ],
    {
      koppen: [
        { kolom: 'adres', regels: ['Adres'], stijl: 'kop' },
        { kolom: 'N', regels: ['(WOZ-)waarde'], stijl: 'kop' },
        { kolom: 'Z', regels: ['Deel'], stijl: 'kop' },
        { kolom: 'A', regels: ['Periode', 'hoofdverblijf'], stijl: 'kop' },
        { kolom: 'B', regels: ['Forfait'], stijl: 'kop' },
      ],
    },
  ),
  tabel([
    groepskop('3.1.2.kop-schulden', 'Eigenwoningschuld(en) aangegaan bij een Nederlandse bank of financiële instelling, óf aangegaan vóór 2013, of een lening die voldoet aan de aflossingseis', { witVoor: 1 }),
  ]),
  tabel(
    [
      post('3.1.2.lening-0', 'Hypotheekverstrekker', { Z: 280000, A: 7860 }, { teksten: { N: '0000-01' } }),
      subtotaal('3.1.2.totaal-leningen', undefined, { Z: 280000, B: -7860 }, { streepBoven: ['Z', 'A'] }),
      subtotaal('3.1.2.saldo', 'Saldo eigen woning', { C: -6418 }, { streepBoven: ['B'] }),
      post('3.1.2.naar-partner', 'Deel doorgeschoven naar partner', { C: 0 }),
      subtotaal('3.1.2.toegerekend', 'Toegerekend aan Persoon A', { C: -6418 }, { streepBoven: ['C'] }),
    ],
    {
      koppen: [
        { kolom: 'omschrijving', regels: ['Omschrijving'], stijl: 'kop' },
        { kolom: 'N', regels: ['Nummer'], stijl: 'kop' },
        { kolom: 'Z', regels: ['Schuld'], stijl: 'kop' },
        { kolom: 'A', regels: ['Betaalde rente'], stijl: 'kop' },
        { kolom: 'B', regels: ['Aftrekbare rente'], stijl: 'kop' },
      ],
    },
  ),
], [], { bijElkaar: true })

const jaarruimte: Array<[number, number, number]> = [
  [2024, 36077, 0],
  [2023, 31810, 0],
  [2022, 7070, 4911],
  [2021, 4889, 4889],
  [2020, 0, 0],
  [2019, 0, 0],
  [2018, 0, 0],
  [2017, 0, 0],
  [2016, 0, 0],
]

const s313 = sectie('Uitgaven voor inkomensvoorziening', 3, [
  tabel([groepskop('3.1.3.kop-lijfrente', 'Uitgaven voor lijfrenten')]),
  tabel([post('3.1.3.polis-0', 'Verzekeraar A', { A: 9800 }, { teksten: { Z: 'L-0001' } })], {
    koppen: [
      { kolom: 'omschrijving', regels: ['Bank of verzekeringsmaatschappij'], stijl: 'kop' },
      { kolom: 'Z', regels: ['Rek-/polisnr.'], stijl: 'kop' },
      { kolom: 'A', regels: ['Bedrag'], stijl: 'kop' },
    ],
  }),
  tabel([groepskop('3.1.3.kop-ruimte', 'Jaar-/reserveringsruimteberekening', { witVoor: 1 })]),
  tabel(
    [
      ...jaarruimte.map(([jaar, ruimte, aftrek]) => post(`3.1.3.jaar-${jaar}`, String(jaar), { Z: ruimte, A: aftrek })),
      subtotaal('3.1.3.totaal-ruimte', undefined, { Z: 79846, B: 9800 }, { streepBoven: ['Z', 'A'] }),
    ],
    {
      koppen: [
        { kolom: 'omschrijving', regels: ['Jaar'], stijl: 'kop' },
        { kolom: 'Z', regels: ['(Niet-gebruikte)', 'jaarruimte'], stijl: 'kop' },
        { kolom: 'A', regels: ['Dit jaar aftrekbare', 'lijfrentepremies'], stijl: 'kop' },
      ],
    },
  ),
  tabel([groepskop('3.1.3.kop-aov', 'Premies voor arbeidsongeschiktheidsverzekeringen', { witVoor: 1 })]),
  tabel(
    [
      post('3.1.3.aov-0', 'Verzekeraar B', { A: 3460 }, { teksten: { Z: 'A-0002' } }),
      subtotaal('3.1.3.totaal-aov', undefined, { B: 3460 }, { streepBoven: ['A'] }),
      subtotaal('3.1.3.totaal', 'Uitgaven voor inkomensvoorziening', { C: -13260 }, { streepBoven: ['B'] }),
    ],
    {
      koppen: [
        { kolom: 'omschrijving', regels: ['Verzekeringsmaatschappij'], stijl: 'kop' },
        { kolom: 'Z', regels: ['Polisnummer'], stijl: 'kop' },
        { kolom: 'A', regels: ['Bedrag'], stijl: 'kop' },
      ],
    },
  ),
], [], { bijElkaar: true })

const s314 = sectie('Berekening belastbaar inkomen', 3, [
  tabel([
    post('3.1.4.drempel', 'Drempelinkomen uit werk en woning (box 1)', { C: 108257 }),
    totaal('3.1.4.belastbaar', 'Belastbaar inkomen uit werk en woning (box 1)', { C: 108257 }, { streepBoven: ['C'], dubbelOnder: ['C'] }),
  ]),
])

const rekening = (id: string, label: string, begin: number, eind: number, teksten: Record<string, string>): Regel =>
  post(id, label, { B: begin, C: eind }, { teksten, peildatum: beginEind })

const s321 = sectie('Waarde van bezittingen', 3, [
  peildata(2024),
  tabel([groepskop('3.2.1.kop-bank-nl', 'Vermogen op bank- en spaarrekeningen in Nederland', { witVoor: 1 })]),
  tabel(
    [
      rekening('3.2.1.bank-nl-0', 'Bank A Spaarrekening', 37300, 35950, { rekening: 'NL00 BANK 0000 0000 01' }),
      rekening('3.2.1.bank-nl-1', 'Bank A Betaalrekening', 8600, 9250, { rekening: 'NL00 BANK 0000 0000 02' }),
      rekening('3.2.1.bank-nl-2', 'Bank B Internetsparen', 5000, 5000, { rekening: 'NL00 BANK 0000 0000 03' }),
      subtotaal('3.2.1.bank-nl', undefined, { B: 50900, C: 50200 }, { vet: 'regel', streepBoven: ['B', 'C'], peildatum: beginEind }),
    ],
    {
      koppen: [
        { kolom: 'omschrijving', regels: ['Bank'], stijl: 'kop' },
        { kolom: 'rekening', regels: ['Rekeningnummer'], stijl: 'kop' },
      ],
    },
  ),
  tabel([groepskop('3.2.1.kop-bank-bl', 'Vermogen op bank- en spaarrekeningen in het buitenland', { witVoor: 1 })]),
  tabel(
    [
      rekening('3.2.1.bank-bl-0', 'Bank C', 6500, 2050, { land: 'Duitsland', rekening: 'DE00 0000 0000 0000 01' }),
      rekening('3.2.1.bank-bl-1', 'Bank D', 3300, 3850, { land: 'België', rekening: 'BE00 0000 0000 0002' }),
      subtotaal('3.2.1.bank-bl', undefined, { B: 9800, C: 5900 }, { vet: 'regel', streepBoven: ['B', 'C'], peildatum: beginEind }),
    ],
    {
      koppen: [
        { kolom: 'omschrijving', regels: ['Bank'], stijl: 'kop' },
        { kolom: 'land', regels: ['Land'], stijl: 'kop' },
        { kolom: 'rekening', regels: ['Rekeningnummer'], stijl: 'kop' },
      ],
    },
  ),
  tabel([groepskop('3.2.1.kop-beleggingen', 'Beleggingen', { witVoor: 1 })]),
  tabel(
    [
      rekening('3.2.1.beleggingen-0', 'Broker A', 60000, 66000, { rekening: 'Rekening 0001' }),
      rekening('3.2.1.beleggingen-1', 'Broker B', 14800, 17900, { rekening: 'Rekening 0002' }),
      subtotaal('3.2.1.beleggingen', undefined, { B: 74800, C: 83900 }, { vet: 'regel', streepBoven: ['B', 'C'], peildatum: beginEind }),
    ],
    {
      koppen: [
        { kolom: 'omschrijving', regels: ['Naam'], stijl: 'kop' },
        { kolom: 'rekening', regels: ['Rekening nummer'], stijl: 'kop' },
      ],
    },
  ),
  tabel([groepskop('3.2.1.kop-vorderingen', 'Vorderingen en uitgeleend geld', { witVoor: 1 })]),
  tabel(
    [
      rekening('3.2.1.vorderingen-0', 'Cryptoplatform', 1650, 3480, {}),
      rekening('3.2.1.vorderingen-1', 'Overig crypto', 500, 0, {}),
      subtotaal('3.2.1.vorderingen', undefined, { B: 2150, C: 3480 }, { vet: 'regel', streepBoven: ['B', 'C'], peildatum: beginEind }),
    ],
    { koppen: [{ kolom: 'omschrijving', regels: ['Omschrijving'], stijl: 'kop' }] },
  ),
  tabel([
    totaal('3.2.1.totaal', 'Totaal waarde bezittingen', { B: 137650, C: 143480 }, { witVoor: 1, streepBoven: ['B', 'C'], dubbelOnder: ['B', 'C'], peildatum: beginEind }),
  ]),
])

const s322 = sectie('Waarde van schulden', 3, [
  peildata(2024),
  tabel(
    [
      post('3.2.2.schuld-0', 'Lening auto', { B: 24000, C: 16250 }, { teksten: { categorie: 'Andere bezittingen', nummer: '0001' }, peildatum: beginEind }),
      post('3.2.2.schuld-1', 'Creditcard', { B: 0, C: 0 }, { teksten: { nummer: '0002' }, peildatum: beginEind }),
      subtotaal('3.2.2.subtotaal', undefined, { B: 24000, C: 16250 }, { vet: 'regel', streepBoven: ['B', 'C'], peildatum: beginEind }),
      post('3.2.2.drempel', 'Drempel', { B: -7400, C: -7400 }, { witVoor: 1, peildatum: beginEind }),
      totaal('3.2.2.aftrekbaar', 'Aftrekbare schulden', { B: 16600, C: 8850 }, { streepBoven: ['B', 'C'], dubbelOnder: ['B', 'C'], peildatum: beginEind }),
    ],
    {
      koppen: [
        { kolom: 'omschrijving', regels: ['Omschrijving'], stijl: 'kop' },
        { kolom: 'categorie', regels: ['Categorie'], stijl: 'kop' },
        { kolom: 'nummer', regels: ['Nummer'], stijl: 'kop' },
      ],
    },
  ),
], [], { bijElkaar: true })

const rendement = (id: string, label: string, grondslag: number, pct: number, bedrag: number): Regel =>
  post(id, label, { Z: grondslag, B: bedrag }, { percentages: { A: pct } })

const s323 = sectie('Toelichting rendementsgrondslag', 3, [
  peildata(2024),
  tabel([
    post('3.2.3.bezittingen', 'Waarde van bezittingen', { B: 137650, C: 143480 }, { peildatum: beginEind }),
    post('3.2.3.schulden', 'Aftrekbare schulden', { B: -16600, C: -8850 }, { peildatum: beginEind }),
    subtotaal('3.2.3.vermogen', 'Waarde van het vermogen', { B: 121050, C: 134630 }, { streepBoven: ['B', 'C'], peildatum: beginEind }),
    groepskop('3.2.3.kop-vrijstelling', 'Vrijstelling vermogen', { witVoor: 2 }),
    post('3.2.3.fiscale-waarde', 'Waarde van het vermogen (fiscale waarde)', { B: 121050 }),
    post('3.2.3.heffingsvrij', 'Heffingsvrij vermogen', { B: -114000 }),
    subtotaal('3.2.3.grondslag', 'Grondslag sparen en beleggen', { B: 7050 }, { streepBoven: ['B'] }),
    post('3.2.3.deel-partner', 'Deel van de grondslag van Persoon B', { B: 0 }),
    subtotaal('3.2.3.deel-zelf', 'Deel van de grondslag van Persoon A', { B: 7050 }, { streepBoven: ['B'], dubbelOnder: ['B'] }),
    groepskop('3.2.3.kop-rendement', 'Box 3 rendement', { witVoor: 1 }),
    { id: '3.2.3.kop-voordeel', label: 'Berekening voordeel sparen en beleggen', soort: 'subkop' },
    rendement('3.2.3.rendement-bank-nl', 'Vermogen op bank- en spaarrekeningen in Nederland', 50900, 0.0144, 732),
    rendement('3.2.3.rendement-bank-bl', 'Vermogen op bank- en spaarrekeningen in het buitenland', 9800, 0.0144, 141),
    rendement('3.2.3.rendement-beleggingen', 'Beleggingen', 74800, 0.0604, 4517),
    rendement('3.2.3.rendement-vorderingen', 'Uitgeleend geld en andere vorderingen', 2150, 0.0604, 129),
    rendement('3.2.3.rendement-schulden', 'Schulden voor andere bezittingen', 24000, 0.0261, -627),
    rendement('3.2.3.rendement-drempel', 'Schuldendrempel', 7400, 0.0261, Math.floor(7400 * 0.0261)),
    subtotaal('3.2.3.rendement', undefined, { B: 5085 }, { streepBoven: ['B'] }),
    groepskop('3.2.3.kop-percentage', 'Berekening rendementspercentage voordeel sparen en beleggen', { witVoor: 1 }),
    post('3.2.3.aandeel', 'Aandeel rendement: 5.085 x (7.050 / 121.050)', { B: 296 }, { witVoor: 1 }),
    subtotaal('3.2.3.voordeel', 'Voordeel uit sparen en beleggen', { C: 296 }, { witVoor: 1, streepBoven: ['C'] }),
    totaal('3.2.3.belastbaar', 'Belastbaar inkomen uit sparen en beleggen (box 3)', { C: 296 }, { streepBoven: ['C'], dubbelOnder: ['C'] }),
  ]),
  {
    soort: 'vraag',
    id: '3.2.3.drie-maanden',
    vraag:
      'Heeft Persoon A en/of Persoon B in een periode van drie maanden (waarin een peildatum is gelegen) box 3-vermogensbestanddelen verkocht en deze vermogensbestanddelen vervolgens (gedeeltelijk) weer aangekocht?',
    antwoord: 'nee',
    witVoor: 1,
  },
])

const h3 = sectie('Belastbaar inkomen', 1, [], [
  sectie('Toelichting belastbaar inkomen uit werk en woning (box 1)', 2, [], [s311, s312, s313, s314]),
  sectie('Toelichting belastbaar inkomen uit sparen en beleggen (box 3)', 2, [], [s321, s322, s323]),
])

// ---------------------------------------------------------------------------
// Hoofdstuk 4: bijlagen met jaarblokken (lijfrenteraster, herhaalde groepskop)
// ---------------------------------------------------------------------------

interface Jaarblok {
  jaar: number
  inkomsten: number
  forToename?: number
  som: number
  maximaal?: number
  franchise: number
  premiegrondslag: number
  verrekenbaar: number
  forVorigJaar?: number
  afgetrokken?: number
  jaarruimte: number
  ditJaar: number
  openstaand: number
}

const jaarblokken: Jaarblok[] = [
  { jaar: 2024, inkomsten: 149800, som: 149800, maximaal: 137800, franchise: -17545, premiegrondslag: 120255, verrekenbaar: 36077, jaarruimte: 36077, ditJaar: 0, openstaand: 36077 },
  { jaar: 2023, inkomsten: 127900, forToename: 2740, som: 130640, maximaal: 128810, franchise: -13646, premiegrondslag: 115164, verrekenbaar: 34550, forVorigJaar: -2740, jaarruimte: 31810, ditJaar: 0, openstaand: 31810 },
  { jaar: 2022, inkomsten: 118700, som: 118700, maximaal: 114866, franchise: -12837, premiegrondslag: 102029, verrekenbaar: 13570, afgetrokken: -6500, jaarruimte: 7070, ditJaar: -4911, openstaand: 2159 },
  { jaar: 2021, inkomsten: 79500, som: 79500, franchise: -12672, premiegrondslag: 66828, verrekenbaar: 8889, afgetrokken: -4000, jaarruimte: 4889, ditJaar: -4889, openstaand: 0 },
  { jaar: 2020, inkomsten: 84300, som: 84300, franchise: -12472, premiegrondslag: 71828, verrekenbaar: 9554, afgetrokken: -9554, jaarruimte: 0, ditJaar: 0, openstaand: 0 },
  { jaar: 2019, inkomsten: 67300, som: 67300, franchise: -12275, premiegrondslag: 55025, verrekenbaar: 7319, afgetrokken: -7319, jaarruimte: 0, ditJaar: 0, openstaand: 0 },
  { jaar: 2018, inkomsten: 64200, som: 64200, franchise: -12129, premiegrondslag: 52071, verrekenbaar: 6926, afgetrokken: -6926, jaarruimte: 0, ditJaar: 0, openstaand: 0 },
  { jaar: 2017, inkomsten: 58200, som: 58200, franchise: -12032, premiegrondslag: 46168, verrekenbaar: 6372, afgetrokken: -6372, jaarruimte: 0, ditJaar: 0, openstaand: 0 },
]

function jaarblokTabel(j: Jaarblok, eerste: boolean): TabelBlok {
  const p = `4.1.1.${j.jaar}`
  const regels: Regel[] = [
    groepskop(`${p}.jaar`, String(j.jaar), { witVoor: eerste ? undefined : 2 }),
    post(`${p}.inkomsten`, `Inkomsten in ${j.jaar - 1}`, { A: j.inkomsten }),
  ]
  if (j.forToename !== undefined) regels.push(post(`${p}.for`, 'Toename van de opgebouwde oudedagsreserve', { A: j.forToename }))
  regels.push(post(`${p}.kosten`, 'Aftrekbare kosten', { A: 0 }))
  regels.push(subtotaal(`${p}.som`, undefined, { A: j.som }, { streepBoven: ['A'] }))
  if (j.maximaal !== undefined) regels.push(post(`${p}.maximaal`, 'Maximaal in aanmerking te nemen inkomen', { A: j.maximaal }, { witVoor: 1 }))
  regels.push(post(`${p}.franchise`, 'AOW-franchise', { A: j.franchise }, { witVoor: j.maximaal === undefined ? 1 : undefined }))
  regels.push(subtotaal(`${p}.premiegrondslag`, 'Premiegrondslag', { A: j.premiegrondslag }, { streepBoven: ['A'], dubbelOnder: ['A'] }))
  regels.push(post(`${p}.verrekenbaar`, 'Verrekenbare premiegrondslag', { B: j.verrekenbaar }))
  if (j.forVorigJaar !== undefined) regels.push(post(`${p}.for-vorig-jaar`, 'Toename van de opgebouwde oudedagsreserve in voorgaand jaar min de verplichte afname', { B: j.forVorigJaar }))
  if (j.afgetrokken !== undefined) regels.push(post(`${p}.afgetrokken`, 'Totaal afgetrokken lijfrentepremies als jaarruimte of als niet gebruikte jaarruimte', { B: j.afgetrokken }))
  regels.push(subtotaal(`${p}.jaarruimte`, 'Jaarruimte', { B: j.jaarruimte }, { streepBoven: ['B'] }))
  regels.push(post(`${p}.dit-jaar`, 'Dit jaar aftrekbare lijfrentepremies', { B: j.ditJaar }))
  regels.push(totaal(`${p}.openstaand`, 'Openstaande jaar-/reserveringsruimte', { C: j.openstaand }, { streepBoven: ['B'] }))
  return tabel(regels, { raster: 'lijfrente', herhaalKop: 'Jaar-/reserveringsruimteberekening', bijElkaar: true })
}

const reserveringsblok = (jaar: number): TabelBlok =>
  tabel(
    [
      groepskop(`4.1.1.${jaar}.jaar`, String(jaar), { witVoor: 2 }),
      post(`4.1.1.${jaar}.reservering`, 'Reserveringsruimte', { B: 0 }),
      post(`4.1.1.${jaar}.dit-jaar`, 'Dit jaar aftrekbare lijfrentepremies', { B: 0 }),
      totaal(`4.1.1.${jaar}.openstaand`, 'Openstaande jaar-/reserveringsruimte', { C: 0 }, { streepBoven: ['B'] }),
    ],
    { raster: 'lijfrente', herhaalKop: 'Jaar-/reserveringsruimteberekening', bijElkaar: true },
  )

const h4 = sectie('Bijlagen', 1, [], [
  sectie('Uitgaven voor inkomensvoorziening', 2, [], [
    sectie('Premies voor lijfrente bij gebruik van de jaar- en reserveringsruimte', 3, [
      ...jaarblokken.map((j, i) => jaarblokTabel(j, i === 0)),
      reserveringsblok(2016),
    ]),
  ]),
  sectie('Dividendbelasting', 2, [
    tabel([groepskop('4.2.kop', 'Te verrekenen dividendbelasting afkomstig uit beleggingen in box 3')]),
    tabel(
      [
        post('4.2.rekening-0', 'Broker A', { A: 0 }, { teksten: { Z: 'Rekening 0001' } }),
        post('4.2.rekening-1', 'Broker B', { A: 38 }, { teksten: { Z: 'Rekening 0002' } }),
        subtotaal('4.2.totaal-rekeningen', undefined, { B: 38 }, { streepBoven: ['A'] }),
        subtotaal('4.2.dividendbelasting', 'Dividendbelasting', { C: 38 }, { streepBoven: ['B'] }),
        post('4.2.naar-partner', 'Deel doorgeschoven naar partner', { C: -38 }),
        subtotaal('4.2.toegerekend', 'Toegerekend aan Persoon A', { C: 0 }, { streepBoven: ['C'], dubbelOnder: ['C'] }),
      ],
      {
        koppen: [
          { kolom: 'omschrijving', regels: ['Omschrijving'], stijl: 'kop' },
          { kolom: 'Z', regels: ['Rekeningnummer'], stijl: 'kop' },
          { kolom: 'A', regels: ['Ingehouden', 'dividendbelasting'], stijl: 'kop' },
        ],
      },
    ),
  ], [], { bijElkaar: true }),
  sectie('Specificatie beperking tarief aftrekbare bedragen', 2, [
    tabel([
      post('4.3.mkb', 'MKB-winstvrijstelling', { B: 19643 }),
      post('4.3.ondernemersaftrek', 'Ondernemersaftrek', { B: 3750 }),
      post('4.3.eigen-woning', 'Aftrekbare kosten eigen woning', { B: 6418 }),
      subtotaal('4.3.grondslag', undefined, { C: 29811 }, { streepBoven: ['B'] }),
      post('4.3.beperking', 'Beperking tarief aftrekbare bedragen: 12,53% over 29.811', { C: 3735 }, { witVoor: 2 }),
    ]),
  ], [], { bijElkaar: true }),
  sectie('Bijzondere situaties', 2, [], [
    sectie('Voorkoming dubbele belasting', 3, [
      tabel([groepskop('4.4.1.kop', 'Aandelen en spaartegoeden waarop Persoon A bronbelasting wil verrekenen')]),
      tabel(
        [
          post('4.4.1.positie-0', 'Beleggingsrekening Broker B', { B: 63, C: 420 }, { teksten: { land: 'Verenigde Staten' } }),
          subtotaal('4.4.1.totaal', undefined, { B: 63, C: 420 }, { streepBoven: ['B', 'C'], dubbelOnder: ['B', 'C'] }),
        ],
        {
          koppen: [
            { kolom: 'omschrijving', regels: ['Omschrijving'], stijl: 'kop' },
            { kolom: 'land', regels: ['Land'], stijl: 'kop' },
            { kolom: 'B', regels: ['Bronbelasting'], stijl: 'kop' },
            { kolom: 'C', regels: ['Inkomsten'], stijl: 'kop' },
          ],
        },
      ),
      { soort: 'tekst', tekst: 'De verrekening is beperkt tot het verdragstarief van 15% van het brutodividend; meer ingehouden bronbelasting kun je in het bronland terugvragen.', stijl: 'cursief', witVoor: 1 },
    ]),
  ], { bijElkaar: true }),
])

// ---------------------------------------------------------------------------
// Hoofdstuk 5 en 6
// ---------------------------------------------------------------------------

const balansKop = [
  { kolom: 'B' as const, regels: ['Fiscaal begin'], stijl: 'datum' as const },
  { kolom: 'C' as const, regels: ['Fiscaal eind'], stijl: 'datum' as const },
]
const balans = (regels: Regel[]): TabelBlok => tabel(regels, { raster: 'balans' })
const balansPost = (id: string, label: string, begin: number, eind: number, extra: Partial<Regel> = {}) =>
  post(id, label, { B: begin, C: eind }, { peildatum: beginEind, ...extra })
const balansTotaal = (id: string, label: string, begin: number, eind: number, extra: Partial<Regel> = {}) =>
  subtotaal(id, label, { B: begin, C: eind }, { vet: 'bedrag', streepBoven: ['B', 'C'], peildatum: beginEind, ...extra })

const h5 = sectie('Winstaangifte 2024 van Onderneming A', 1, [], [
  sectie('Fiscale winstberekening door kapitaalsvergelijking', 2, [], [
    sectie('Kapitaalsvergelijking', 3, [
      tabel([
        post('5.1.1.eindvermogen', 'Eindvermogen', { C: 97450 }),
        post('5.1.1.beginvermogen', 'Af: beginvermogen', { C: 61570 }),
        groepskop('5.1.1.kop-onttrekkingen', 'Overige privéonttrekkingen', { witVoor: 1 }),
        post('5.1.1.onttrekking-0', 'Privé opnamen', { A: 61400 }),
        post('5.1.1.onttrekking-1', 'Inleg pensioen', { A: 9800 }),
        post('5.1.1.onttrekking-2', 'AOV', { A: 3460 }),
        post('5.1.1.onttrekking-3', 'Inkomstenbelasting en Zvw', { A: 44300 }),
        subtotaal('5.1.1.som-onttrekkingen', undefined, { B: 118960 }, { streepBoven: ['A'] }),
        subtotaal('5.1.1.onttrekkingen', 'Totaal privéonttrekkingen', { C: 118960 }, { streepBoven: ['B'] }),
        groepskop('5.1.1.kop-stortingen', 'Privéstortingen', { witVoor: 1 }),
        post('5.1.1.stortingen', 'Stortingen', { B: 2500 }),
        subtotaal('5.1.1.som-stortingen', undefined, { C: -2500 }, { streepBoven: ['B'] }),
        totaal('5.1.1.winstberekening', 'Fiscale winstberekening', { C: 152340 }, { witVoor: 1, streepBoven: ['C'] }),
        groepskop('5.1.1.kop-beperkt', 'Overige kosten en lasten die niet of gedeeltelijk aftrekbaar zijn', { witVoor: 1 }),
      ]),
      tabel(
        [
          post('5.1.1.beperkt', 'Beperkt aftrekbare kosten: 20,00% van 1.140', { B: 228 }),
          subtotaal('5.1.1.totaal-beperkt', 'Totaal van aftrek uitgesloten en in aftrek beperkte kosten en lasten', { C: 228 }, { streepBoven: ['B'] }),
        ],
        {
          koppen: [
            { kolom: 'omschrijving', regels: ['Omschrijving'], stijl: 'kop' },
            { kolom: 'B', regels: ['Correctie'], stijl: 'kop' },
          ],
        },
      ),
      tabel([
        groepskop('5.1.1.kop-investeringen', 'Investeringsregelingen', { witVoor: 1 }),
        post('5.1.1.kia', 'Investeringsaftrek Nederland', { B: 1240 }),
        post('5.1.1.kia-bes', 'Investeringsaftrek Aruba, Curaçao of Sint Maarten', { B: 0 }),
        post('5.1.1.kia-vorig', 'Investeringsaftrek voorgaande jaren', { B: 0 }),
        subtotaal('5.1.1.investeringsaftrek', 'Investeringsaftrek', { C: -1240 }, { streepBoven: ['B'] }),
        totaal('5.1.1.totaal', 'Totaal fiscale winst uit onderneming', { C: 151328 }, { witVoor: 1, streepBoven: ['C'], dubbelOnder: ['C'] }),
      ]),
    ]),
  ]),
  sectie('Fiscale vermogensopstelling', 2, [], [
    sectie('Activa', 3, [
      balans([
        groepskop('5.2.1.kop-mva', 'Materiële vaste activa', { witVoor: 2 }),
        balansPost('5.2.1.mva', 'Overige materiële vaste activa', 3180, 5750),
        balansTotaal('5.2.1.totaal-mva', 'Totaal materiële vaste activa', 3180, 5750),
        groepskop('5.2.1.kop-voorraden', 'Voorraden', { witVoor: 2 }),
        balansPost('5.2.1.ohw', 'Onderhanden werk', 2400, 3100),
        balansTotaal('5.2.1.totaal-voorraden', 'Totaal voorraden', 2400, 3100),
        groepskop('5.2.1.kop-vorderingen', 'Vorderingen', { witVoor: 2 }),
        balansPost('5.2.1.debiteuren', 'Vorderingen op handelsdebiteuren', 16850, 21540),
        balansPost('5.2.1.overige-vorderingen', 'Overige vorderingen', 250, 250),
        balansTotaal('5.2.1.totaal-vorderingen', 'Totaal vorderingen', 17100, 21790),
        balansPost('5.2.1.liquide', 'Liquide middelen', 46320, 77020, { witVoor: 2, vet: 'regel' }),
        balansTotaal('5.2.1.totaal', 'Totaal activa', 69000, 107660, { witVoor: 2, vet: 'regel', dubbelOnder: ['B', 'C'] }),
      ]),
    ], [], { kopKolommen: balansKop }),
    sectie('Passiva', 3, [
      balans([
        groepskop('5.2.2.kop-vermogen', 'Ondernemingsvermogen'),
        balansPost('5.2.2.for', 'Fiscale oudedagsreserve', 9640, 9640),
        balansPost('5.2.2.vermogen', 'Ondernemingsvermogen exclusief fiscale reserves', 51930, 87810),
        balansTotaal('5.2.2.totaal-vermogen', 'Totaal ondernemingsvermogen', 61570, 97450),
        groepskop('5.2.2.kop-schulden', 'Kortlopende schulden', { witVoor: 2 }),
        balansPost('5.2.2.crediteuren', 'Schulden aan leveranciers en handelskredieten', 1120, 1460),
        balansPost('5.2.2.omzetbelasting', 'Schuld omzetbelasting', 5830, 8270),
        balansPost('5.2.2.overige-schulden', 'Overige kortlopende schulden', 480, 480),
        balansTotaal('5.2.2.totaal-schulden', 'Totaal kortlopende schulden', 7430, 10210),
        balansTotaal('5.2.2.totaal', 'Totaal passiva', 69000, 107660, { witVoor: 2, vet: 'regel', dubbelOnder: ['B', 'C'] }),
      ]),
    ], [], { kopKolommen: balansKop }),
  ], { bijElkaar: true }),
  sectie('Fiscale winstberekening', 2, [
    tabel([
      groepskop('5.3.kop-opbrengsten', 'Opbrengsten'),
      post('5.3.omzet', 'Netto-omzet', { C: 193900 }),
      post('5.3.ohw', 'Wijziging in voorraden gereed product en onderhanden werk', { C: 700 }),
      subtotaal('5.3.opbrengsten', 'Totaal opbrengsten', { C: 194600 }, { vet: 'bedrag', streepBoven: ['C'] }),
      groepskop('5.3.kop-inkoop', 'Kosten van grond- en hulpstoffen, uitbesteed werk, e.d.', { witVoor: 2 }),
      post('5.3.uitbesteed', 'Kosten van uitbesteed werk en andere externe kosten', { C: 18450 }),
      subtotaal('5.3.inkoop', 'Totaal inkoopkosten en uitbesteed werk', { C: -18450 }, { vet: 'bedrag', streepBoven: ['C'] }),
      groepskop('5.3.kop-afschrijvingen', 'Afschrijvingen', { witVoor: 2 }),
      post('5.3.afschrijving-mva', 'Overige materiële vaste activa', { C: 1860 }),
      subtotaal('5.3.afschrijvingen', 'Totaal afschrijvingen', { C: -1860 }, { vet: 'bedrag', streepBoven: ['C'] }),
      groepskop('5.3.kop-kosten', 'Overige bedrijfskosten', { witVoor: 2 }),
      post('5.3.auto', 'Auto- en transportkosten', { C: 5240 }),
      post('5.3.huisvesting', 'Huisvestingskosten', { C: 9600 }),
      post('5.3.beperkt', 'Beperkt aftrekbare kosten', { C: 1140 }),
      post('5.3.overig', 'Overige kosten', { C: 6380 }),
      subtotaal('5.3.kosten', 'Totaal overige bedrijfskosten', { C: -22360 }, { vet: 'bedrag', streepBoven: ['C'] }),
      groepskop('5.3.kop-financieel', 'Financiële baten en lasten', { witVoor: 2 }),
      post('5.3.rente', 'Opbrengsten van banktegoeden', { C: 410 }),
      subtotaal('5.3.financieel', 'Totaal financiële baten en lasten', { C: 410 }, { vet: 'bedrag', streepBoven: ['C'] }),
      totaal('5.3.saldo', 'Saldo fiscale winstberekening', { C: 152340 }, { witVoor: 2, streepBoven: ['C'], dubbelOnder: ['C'] }),
    ]),
  ], [], { kopKolommen: [{ kolom: 'C', regels: ['Fiscaal 2024'], stijl: 'datum' }] }),
  sectie('Specificatie balans activa', 2, [], [
    sectie('Materiële vaste activa', 3, [
      tabel([groepskop('5.4.1.kop', 'Overige materiële vaste activa')]),
      tabel([post('5.4.1.mva', 'Overige materiële vaste activa', { Z: 14900, A: 0, B: 3180, C: 5750 }, { peildatum: beginEind })], {
        koppen: [
          { kolom: 'Z', regels: ['Kosten aanschaf'], stijl: 'kop' },
          { kolom: 'A', regels: ['Restwaarde'], stijl: 'kop' },
          { kolom: 'B', regels: ['Fiscaal begin'], stijl: 'kop' },
          { kolom: 'C', regels: ['Fiscaal eind'], stijl: 'kop' },
        ],
      }),
    ]),
    sectie('Vorderingen', 3, [
      tabel([groepskop('5.4.2.kop-debiteuren', 'Vorderingen op handelsdebiteuren')]),
      tabel([post('5.4.2.debiteuren', 'Vorderingen op handelsdebiteuren', { A: 21540, B: 16850, C: 21540 }, { peildatum: beginEind })], {
        koppen: [
          { kolom: 'A', regels: ['Nominale waarde'], stijl: 'kop' },
          { kolom: 'B', regels: ['Fiscaal begin'], stijl: 'kop' },
          { kolom: 'C', regels: ['Fiscaal eind'], stijl: 'kop' },
        ],
      }),
      tabel([groepskop('5.4.2.kop-overig', 'Overige vorderingen', { witVoor: 1 })]),
      tabel(
        [
          post('5.4.2.vooruitbetaald', 'Vooruitbetaalde bedragen', { B: 0, C: 0 }, { peildatum: beginEind }),
          post('5.4.2.borg', 'Borg werkplaats', { B: 250, C: 250 }, { peildatum: beginEind }),
          subtotaal('5.4.2.totaal', undefined, { B: 250, C: 250 }, { streepBoven: ['B', 'C'], peildatum: beginEind }),
        ],
        {
          koppen: [
            { kolom: 'omschrijving', regels: ['Omschrijving'], stijl: 'kop' },
            { kolom: 'B', regels: ['Fiscaal begin'], stijl: 'kop' },
            { kolom: 'C', regels: ['Fiscaal eind'], stijl: 'kop' },
          ],
        },
      ),
    ]),
  ]),
  sectie('Specificatie balans passiva', 2, [], [
    sectie('Kortlopende schulden', 3, [
      tabel([groepskop('5.5.1.kop', 'Schuld omzetbelasting')]),
      tabel(
        [
          post('5.5.1.dit-jaar', 'Schuld aan omzetbelasting over dit boekjaar', { B: 0, C: 8270 }, { peildatum: beginEind }),
          post('5.5.1.vorig-jaar', 'Schuld aan omzetbelasting over vorig boekjaar', { B: 5830, C: 0 }, { peildatum: beginEind }),
          subtotaal('5.5.1.totaal', undefined, { B: 5830, C: 8270 }, { streepBoven: ['B', 'C'], peildatum: beginEind }),
        ],
        {
          koppen: [
            { kolom: 'omschrijving', regels: ['Omschrijving'], stijl: 'kop' },
            { kolom: 'B', regels: ['Fiscaal begin'], stijl: 'kop' },
            { kolom: 'C', regels: ['Fiscaal eind'], stijl: 'kop' },
          ],
        },
      ),
    ]),
  ]),
  sectie('Algemene gegevens en specificaties', 2, [], [
    sectie('Algemene gegevens', 3, [
      { soort: 'vraag', id: '5.6.1.naam-gewijzigd', vraag: 'Is de naam van de onderneming gewijzigd?', antwoord: 'nee', antwoordKolom: 'B' },
      tabel([{ id: '5.6.1.boekjaar', label: 'Begin- en einddatum van boekjaar', soort: 'post', teksten: { A: '01-01-2024', B: '31-12-2024' }, tekstLinks: ['A', 'B'] }], {
        koppen: [
          { kolom: 'A', regels: ['Begin'], stijl: 'kop', uitlijning: 'links' },
          { kolom: 'B', regels: ['Einde'], stijl: 'kop', uitlijning: 'links' },
        ],
      }),
      { soort: 'tekst', tekst: 'Omschrijving van de activiteiten', stijl: 'vet', witVoor: 1 },
      { soort: 'tekst', tekst: 'Ontwerpen en maken van meubels op maat' },
      { soort: 'tekst', tekst: 'Restauratie en reparatie van meubels voor particulieren', stijl: 'opsomming' },
      { soort: 'vraag', id: '5.6.1.waardering', vraag: 'Heeft Onderneming A het waarderingsstelsel van activa en/of passiva in dit boekjaar gewijzigd?', antwoord: 'nee', witVoor: 1 },
      { soort: 'vraag', id: '5.6.1.schadeloosstelling', vraag: 'Heeft Onderneming A toegekende of ontvangen schadeloosstellingen geheel of gedeeltelijk buiten de fiscale winst gehouden?', antwoord: 'nee', witVoor: 1 },
      { soort: 'vraag', id: '5.6.1.agrarisch', vraag: 'Heeft Onderneming A in dit boekjaar agrarische activiteiten verricht?', antwoord: 'nee', witVoor: 1 },
      { soort: 'vraag', id: '5.6.1.willekeurig', vraag: 'Heeft Onderneming A dit boekjaar willekeurig afgeschreven op bedrijfsmiddelen?', antwoord: 'nee', witVoor: 1 },
      { soort: 'vraag', id: '5.6.1.tonnage', vraag: 'Wordt er dit boekjaar gebruik gemaakt van de tonnageregeling?', antwoord: 'nee', witVoor: 2 },
    ]),
    sectie('Investeringsaftrek', 3, [
      tabel(
        [
          post('5.6.2.middel-0', 'Formaatzaag', { A: 2950, B: 2950, C: 826 }, { teksten: { soort: 'KIA', datum: '14-03-2024', aandeel: '100,00%' } }),
          post('5.6.2.middel-1', 'Laptop met dockingstation, tweede scherm en tekenpakket voor werktekeningen', { A: 1480, B: 1480, C: 414 }, { teksten: { soort: 'KIA', datum: '02-09-2024', aandeel: '100,00%' } }),
          subtotaal('5.6.2.totaal', undefined, { B: 4430, C: 1240 }, { streepBoven: ['B', 'C'] }),
        ],
        {
          raster: 'investeringsaftrek',
          koppen: [
            { kolom: 'omschrijving', regels: ['Omschrijving', 'bedrijfsmiddel'], stijl: 'kop' },
            { kolom: 'soort', regels: ['Soort', 'investerings-', 'aftrek'], stijl: 'kop' },
            { kolom: 'datum', regels: ['Datum', 'investering'], stijl: 'kop' },
            { kolom: 'aandeel', regels: ['Aandeel in de', 'investering'], stijl: 'kop' },
            { kolom: 'A', regels: ['Betaald bedrag', 'in dit boekjaar'], stijl: 'kop' },
            { kolom: 'B', regels: ['Totaalbedrag'], stijl: 'kop' },
            { kolom: 'C', regels: ['Investeringsaftrek'], stijl: 'kop' },
          ],
        },
      ),
    ]),
  ]),
])

const h6 = sectie('Ondernemersaftrek', 1, [], [
  sectie('Niet-benutte zelfstandigenaftrek', 2, [
    tabel([
      post('6.1.zelfstandigenaftrek', 'Zelfstandigenaftrek', { B: 3750 }),
      post('6.1.benut', 'In aanmerking genomen zelfstandigenaftrek dit jaar', { B: -3750 }),
      subtotaal('6.1.niet-benut', 'Niet-benutte zelfstandigenaftrek', { C: 0 }, { streepBoven: ['B'] }),
    ]),
  ]),
])

// ---------------------------------------------------------------------------
// Documenten
// ---------------------------------------------------------------------------

const TITEL = 'Fiscaal rapport aangifte inkomstenbelasting 2024'

export function voorbeeldRapport(): RapportDocument {
  return {
    modelVersie: RAPPORT_MODEL_VERSIE,
    jaar: 2024,
    persoon: 'A',
    titel: TITEL,
    naam: 'Persoon A',
    kopregel: { links: `${TITEL} van Persoon A`, rechts: ['Berekend op: 4 oktober 2026'] },
    voorblad: {
      adresregels: ['Persoon A', 'Voorbeeldstraat 1', '1234 AB Voorbeeldstad'],
      regels: [
        { label: 'Opgesteld met:', waarde: "IB-calculator voor zzp'ers" },
        { label: 'Datum:', waarde: '4 oktober 2026' },
        { label: 'Status:', waarde: 'Concept' },
      ],
    },
    verantwoording: {
      uitkomsten: [
        { label: 'Te betalen inkomstenbelasting', bedrag: 4397, afsluiting: 'enkel' },
        { label: 'Te betalen inkomensafhankelijke bijdrage Zorgverzekeringswet', bedrag: ZVW - 3700, afsluiting: 'enkel' },
        { label: 'Totaal te betalen bedrag', bedrag: 4397 + ZVW - 3700, afsluiting: 'dubbel' },
        { label: 'Te ontvangen inkomstenbelasting Persoon B', bedrag: -38, afsluiting: 'enkel' },
        { label: 'Totaal huishouden', bedrag: 4397 + ZVW - 3700 - 38, afsluiting: 'dubbel' },
      ],
      statusZin: 'Indicatieve berekening, geen belastingadvies en geen aangifte. De aanslag van de Belastingdienst is leidend.',
      bronnen: [
        { onderdeel: 'Winst uit onderneming', bron: 'Import uit de boekhouding op 12 maart 2025 (boekjaar 2024)' },
        { onderdeel: 'Box 3', bron: 'Handmatige invoer' },
        { onderdeel: 'Lijfrente en AOV', bron: 'Handmatige invoer' },
      ],
      parameters: [
        { blok: 'Tarieven en schijfgrenzen box 1', status: 'definitief', bron: 'Belastingplan 2024' },
        { blok: 'Heffingskortingen', status: 'definitief', bron: 'Belastingplan 2024' },
        { blok: 'Box 3 forfaits', status: 'voorlopig', bron: 'Rekenregels Belastingdienst' },
      ],
      methoden: [
        { label: 'Box 3', waarde: 'Forfaitair stelsel (overbruggingswet)' },
        { label: 'Verdeling gezamenlijke posten', waarde: 'Door de tool gekozen: alles naar Persoon A' },
        { label: 'Urencriterium', waarde: 'Gehaald (1.650 uur)' },
      ],
      nietMeegenomen: [
        'Belastingrente is niet berekend.',
        'Toeslagen staan niet in dit rapport.',
        'Persoonsgebonden aftrek niet opgenomen: geen gegevens ingevoerd.',
      ],
      verschillen: [
        { label: 'Verrekening van buitenlandse bronbelasting box 3', accountant: 70, berekend: 63, toelichting: 'De tool past de verdragsgrens van 15% van het brutodividend toe.' },
        { label: 'Te betalen inkomstenbelasting', accountant: 4390, berekend: 4397 },
        { label: 'Bijdrage Zvw', accountant: null, berekend: 0 },
      ],
      meldingen: [
        { ernst: 'let-op', tekst: 'De teruggave van 38 euro aan Persoon B ligt onder de teruggaafgrens.' },
        { ernst: 'info', tekst: 'Een FOR-dotatie is vanaf 2023 niet meer mogelijk.' },
      ],
      berekendOp: '2026-10-04T10:15:00',
      toolVersie: '0.1.0',
    },
    hoofdstukken: [h1, h2, h3, h4, h5, h6],
  }
}

/** Kleiner rapport van de partner, met expliciete nummers (zoals nummer() ze invult). */
export function voorbeeldRapportPartner(): RapportDocument {
  const titel = TITEL
  return {
    modelVersie: RAPPORT_MODEL_VERSIE,
    jaar: 2024,
    persoon: 'B',
    titel,
    naam: 'Persoon B',
    kopregel: { links: `${titel} van Persoon B`, rechts: ['Status: Concept', 'Berekend op: 4 oktober 2026'] },
    voorblad: {
      adresregels: ['Persoon B', 'Voorbeeldstraat 1', '1234 AB Voorbeeldstad'],
      regels: [
        { label: 'Opgesteld met:', waarde: "IB-calculator voor zzp'ers" },
        { label: 'Datum:', waarde: '4 oktober 2026' },
      ],
    },
    verantwoording: {
      uitkomsten: [{ label: 'Te ontvangen inkomstenbelasting', bedrag: -38, afsluiting: 'dubbel' }],
      statusZin: 'Indicatieve berekening, geen belastingadvies en geen aangifte. De aanslag van de Belastingdienst is leidend.',
      bronnen: [],
      parameters: [{ blok: 'Tarieven en schijfgrenzen box 1', status: 'definitief' }],
      methoden: [],
      nietMeegenomen: ['Hoofdstuk 5 en 6 vervallen: geen onderneming.'],
      verschillen: [],
      meldingen: [],
      berekendOp: '2026-10-04',
      toolVersie: '0.1.0',
    },
    hoofdstukken: [
      sectie('Persoonlijke gegevens', 1, [{ soort: 'gegevens', rijen: [{ label: 'Naam', waarde: 'Persoon B' }, { label: 'Geboortedatum', waarde: '04-05-1986' }] }], [], { nummer: '1' }),
      sectie('Inkomstenbelasting en premieheffing', 1, [], [
        sectie('Voorlopige aanslagen en teruggaven', 2, [
          tabel([
            post('2.1.dividendbelasting', 'Dividendbelasting', { B: -38 }),
            subtotaal('2.1.voorheffingen', 'Voorheffingen', { C: -38 }, { streepBoven: ['B'] }),
            totaal('2.1.te-ontvangen', 'Te ontvangen inkomstenbelasting', { C: -38 }, { witVoor: 1, streepBoven: ['C'], dubbelOnder: ['C'] }),
          ]),
        ], [], { nummer: '2.1' }),
      ], { nummer: '2' }),
    ],
  }
}
