/**
 * Ronde 2 (A4), tests 3 tot en met 8e uit taak-A4 7: land, vervangen in plaats van optellen, de rekeningsleutel, de
 * onthouden kolomkoppeling, ongedaan maken in de editor en het verzoek dat de browser voor de JSON-import bouwt.
 */
import { describe, expect, it } from 'vitest'
import type { BronbelastingLand, HuishoudenInvoer, VermogensPositie } from '@/lib/tax/types'
import type { Gebeurtenis, PresetUitkomst } from '../types'
import { KOPPELING_WAARDEN } from '../types'
import { leegInvoer } from '@/lib/dossier/leeg'
import { valideerInvoer } from '@/lib/dossier/valideer'
import { bepaalLand, landUitBrokerTekst, landUitIsin } from '../land'
import { kanOvernemen, maakVoorstel, pasVoorstelToe } from '../voorstel'
import { kanOngedaan, maakOngedaan, zetTerug } from '../ongedaan'
import { nieuweRekeningSleutel, normaliseerNummer, rekeningSleutel, SLEUTEL_PATROON } from '../sleutel'
import { leesOnthouden, onthoudbareWaarden, stelKoppelingVoor, teOnthouden } from '../generiek'
import { bouwVerzoek, leesJsonExport, standaardKeuzes, teImporteren } from '../json'
import { herkomstFouten } from '../herkomst'
import { csv, fixtureTekst, lees } from './hulp'

/** Testtabel (geen echte tarieven): de import leest de tabel als argument. */
const TABEL: BronbelastingLand[] = [
  { code: 'US', naam: 'Verenigde Staten', dividend: { ingehouden: 0.3, verdrag: 0.15 }, status: 'geschat', bron: { titel: 'test', datum: '2026-10-05' }, peildatum: '2026-01-01' },
  { code: 'FR', naam: 'Frankrijk', dividend: { ingehouden: 0.25, verdrag: 0.15 }, status: 'geschat', bron: { titel: 'test', datum: '2026-10-05' }, peildatum: '2026-01-01' },
]

const SLEUTEL = 'degiro:r-test0001'

/** Een uitkomst van een preset met eigen gebeurtenissen (EUR, tenzij anders). */
function uitkomst(regels: Array<Partial<Gebeurtenis> & Pick<Gebeurtenis, 'soort' | 'bedrag' | 'datum'>>, opties: { hash?: string; dekking?: { van: string; tot: string }; rekening?: string } = {}): PresetUitkomst {
  const gebeurtenissen: Gebeurtenis[] = regels.map((r, i) => ({ formaat: 'degiro-rekening', rekening: opties.rekening ?? SLEUTEL, regel: i + 2, valuta: 'EUR', eur: r.bedrag, omschrijving: r.soort, ...r }))
  const datums = gebeurtenissen.map((g) => g.datum).sort()
  return {
    formaat: 'degiro-rekening',
    rekening: opties.rekening ?? SLEUTEL,
    gebeurtenissen,
    standen: [],
    dekking: opties.dekking ?? { van: datums[0], tot: datums[datums.length - 1] },
    meldingen: [],
    bestand: { naam: `${opties.hash ?? 'a'}.csv`, hash: (opties.hash ?? 'a').padEnd(16, '0'), regels: regels.length },
  }
}

const geld = (i: HuishoudenInvoer) => i.box3.posities.find((p) => p.herkomst?.rol === 'geld')!
const effecten = (i: HuishoudenInvoer) => i.box3.posities.find((p) => p.herkomst?.rol === 'effecten')!

describe('3. land van de ingehouden belasting', () => {
  it('wat de broker meldt gaat voor het ISIN (IBKR "- KR Tax" op een US-ISIN)', () => {
    expect(landUitBrokerTekst('HYUD(USY384721251) Cash Dividend USD 0.30 per Share - KR Tax')).toBe('KR')
    expect(bepaalLand({ brokerLand: 'KR', isin: 'US0000000000', percentage: 0.22 }, { tabel: TABEL })).toEqual({ land: 'KR', bron: 'broker' })
  })

  it('in het IBKR-voorbeeld komt de belasting op de GDR met een US-ISIN bij Zuid-Korea', () => {
    const [v] = maakVoorstel([lees('ibkr-activity-statement-2025.csv', 'ibkr:0123456789abcdef')], { invoer: leegInvoer(2025), jaar: 2025, tabel: TABEL })
    const landen = v.posities.find((p) => p.rol === 'effecten')!.wordt.bronbelastingen!.map((b) => b.land)
    expect(landen).toContain('KR')
  })

  it('21% op een US-ISIN geeft een vraag in plaats van US; het antwoord zet het land', () => {
    const regels = [
      { soort: 'dividend' as const, bedrag: 100, datum: '2025-05-02', isin: 'US0000000001' },
      { soort: 'dividendbelasting' as const, bedrag: -21, datum: '2025-05-02', isin: 'US0000000001' },
    ]
    const [v] = maakVoorstel([uitkomst(regels)], { invoer: leegInvoer(2025), jaar: 2025, tabel: TABEL })
    const vraag = v.vragen.find((q) => q.id === 'land:US0000000001')!
    expect(vraag.tekst).toBe('Uit welk land komt dit dividend (US0000000001)? Het ingehouden percentage (21%) past niet bij Verenigde Staten.')
    expect(vraag.opties.map((o) => o.label)).toEqual(['Verenigde Staten', 'Ander land'])
    expect(v.posities.find((p) => p.rol === 'effecten')!.wordt.bronbelastingen).toEqual([{ id: 'bb-d-onbekend', land: '', soort: 'dividend', brutoInkomsten: 100, bedrag: 21, datum: '2025-05-02' }])

    const [beantwoord] = maakVoorstel([uitkomst(regels)], { invoer: leegInvoer(2025), jaar: 2025, tabel: TABEL, keuzes: { [SLEUTEL]: { antwoorden: { 'land:US0000000001': 'TW' } } } })
    expect(beantwoord.posities.find((p) => p.rol === 'effecten')!.wordt.bronbelastingen![0]).toMatchObject({ id: 'bb-d-tw', land: 'TW', bedrag: 21 })
  })

  it('15% op een US-ISIN past (verdragstarief); zonder landentabel nooit een vraag op grond van het percentage', () => {
    const regels = (pct: number) => [
      { soort: 'dividend' as const, bedrag: 100, datum: '2025-05-02', isin: 'US0000000001' },
      { soort: 'dividendbelasting' as const, bedrag: -pct, datum: '2025-05-02', isin: 'US0000000001' },
    ]
    const [past] = maakVoorstel([uitkomst(regels(15))], { invoer: leegInvoer(2025), jaar: 2025, tabel: TABEL })
    expect(past.vragen.some((q) => q.id.startsWith('land:'))).toBe(false)
    expect(past.posities[0].wordt.bronbelastingen?.[0].land ?? past.posities.find((p) => p.rol === 'effecten')!.wordt.bronbelastingen![0].land).toBe('US')
    const [leeg] = maakVoorstel([uitkomst(regels(21))], { invoer: leegInvoer(2025), jaar: 2025, tabel: [] })
    expect(leeg.vragen.some((q) => q.id.startsWith('land:'))).toBe(false)
    expect(leeg.posities.find((p) => p.rol === 'effecten')!.wordt.bronbelastingen![0].land).toBe('US')
  })

  it('een NL-ISIN is Nederlandse dividendbelasting, geen bronbelasting', () => {
    const [v] = maakVoorstel(
      [
        uitkomst([
          { soort: 'dividend', bedrag: 50, datum: '2025-04-01', isin: 'NL0099990010' },
          { soort: 'dividendbelasting', bedrag: -7.5, datum: '2025-04-01', isin: 'NL0099990010' },
        ]),
      ],
      { invoer: leegInvoer(2025), jaar: 2025, tabel: TABEL },
    )
    const eff = v.posities.find((p) => p.rol === 'effecten')!.wordt
    expect(eff.dividendbelasting).toBe(7.5)
    expect(eff.bronbelastingen).toBeUndefined()
    expect(landUitIsin('XS0000000000')).toBeNull()
  })
})

describe('4. een import vervangt de jaartotalen van de rekening', () => {
  const eerste = uitkomst(
    [
      { soort: 'storting', bedrag: 1000, datum: '2025-01-10' },
      { soort: 'rente', bedrag: 2, datum: '2025-06-30' },
    ],
    { hash: 'aaaa' },
  )
  const tweede = uitkomst(
    [
      { soort: 'storting', bedrag: 300, datum: '2025-02-10' },
      { soort: 'opname', bedrag: -50, datum: '2025-11-10' },
    ],
    { hash: 'bbbb' },
  )

  it('twee keer importeren met verschillende bestanden: de totalen van de laatste keuze, niet opgeteld', () => {
    const start = leegInvoer(2025)
    const a = pasVoorstelToe(start, maakVoorstel([eerste], { invoer: start, jaar: 2025 })).invoer
    expect(geld(a).stortingen).toBe(1002)
    const b = pasVoorstelToe(a, maakVoorstel([tweede], { invoer: a, jaar: 2025 })).invoer
    expect(b.box3.posities).toHaveLength(1)
    expect(geld(b).stortingen).toBe(300)
    expect(geld(b).onttrekkingen).toBe(50)
    expect(geld(b).directeOpbrengsten).toBe(0)
    expect(geld(b).herkomst!.bestanden!.map((x) => x.hash)).toEqual(['bbbb000000000000'])
  })

  it('alle bestanden die je in één keer kiest tellen samen; een overlap van 1 tot en met 31 maart geeft de melding', () => {
    const jan = uitkomst([{ soort: 'storting', bedrag: 100, datum: '2025-01-15' }], { hash: 'c1', dekking: { van: '2025-01-01', tot: '2025-03-31' } })
    const mrt = uitkomst([{ soort: 'storting', bedrag: 200, datum: '2025-05-15' }], { hash: 'c2', dekking: { van: '2025-03-01', tot: '2025-06-30' } })
    const [v] = maakVoorstel([jan, mrt], { invoer: leegInvoer(2025), jaar: 2025 })
    expect(v.samenvatting.gestort).toBe(300)
    expect(v.overlap).toEqual([{ van: '2025-03-01', tot: '2025-03-31', bron: 'gekozen-bestanden' }])
    expect(v.meldingen.map((m) => m.tekst)).toContain('De bestanden overlappen van 1 maart 2025 tot en met 31 maart 2025. Bedragen in die periode kunnen dubbel zijn.')
  })

  it('overlap met een eerder ingelezen bestand van dezelfde rekening geeft ook de melding', () => {
    const start = leegInvoer(2025)
    const jan = uitkomst([{ soort: 'storting', bedrag: 100, datum: '2025-01-15' }], { hash: 'd1', dekking: { van: '2025-01-01', tot: '2025-03-31' } })
    const a = pasVoorstelToe(start, maakVoorstel([jan], { invoer: start, jaar: 2025 })).invoer
    const mrt = uitkomst([{ soort: 'storting', bedrag: 200, datum: '2025-05-15' }], { hash: 'd2', dekking: { van: '2025-03-01', tot: '2025-06-30' } })
    const [v] = maakVoorstel([mrt], { invoer: a, jaar: 2025 })
    expect(v.overlap).toEqual([{ van: '2025-03-01', tot: '2025-03-31', bron: 'eerder-ingelezen' }])
  })

  it('een al ingelezen bestand geeft alIngelezen en verandert niets tot "Toch opnieuw inlezen"', () => {
    const start = leegInvoer(2025)
    const a = pasVoorstelToe(start, maakVoorstel([eerste], { invoer: start, jaar: 2025, vandaag: '2026-03-02' })).invoer
    // De gebruiker past daarna het bedrag aan.
    const aangepast = structuredClone(a)
    geld(aangepast).stortingen = 900
    const [v] = maakVoorstel([eerste], { invoer: aangepast, jaar: 2025 })
    expect(v.alIngelezen).toBe(true)
    expect(v.ingelezenOp).toBe('2026-03-02')
    expect(kanOvernemen([v]).kan).toBe(false)
    expect(pasVoorstelToe(aangepast, v).invoer).toEqual(aangepast)

    const [opnieuw] = maakVoorstel([eerste], { invoer: aangepast, jaar: 2025, keuzes: { [SLEUTEL]: { opnieuw: true } } })
    expect(opnieuw.alIngelezen).toBe(false)
    expect(geld(pasVoorstelToe(aangepast, opnieuw).invoer).stortingen).toBe(1002)
  })

  it('een bestand van vorig jaar (meegenomen bij een nieuw jaar) geeft geen melding over eerder ingelezen bestanden', () => {
    const start = leegInvoer(2025)
    const oud = uitkomst([{ soort: 'storting', bedrag: 100, datum: '2024-05-15' }], { hash: 'e1', dekking: { van: '2024-01-01', tot: '2024-12-31' } })
    const vorig = pasVoorstelToe(leegInvoer(2024), maakVoorstel([oud], { invoer: leegInvoer(2024), jaar: 2024 })).invoer
    start.box3.posities = vorig.box3.posities
    const [v] = maakVoorstel([eerste], { invoer: start, jaar: 2025 })
    expect(v.meldingen.filter((m) => m.id.startsWith('eerder-'))).toEqual([])
    expect(v.overlap).toEqual([])
  })
})

describe('5. rekeningsleutel', () => {
  const geheimA = Buffer.alloc(32, 7).toString('base64url')
  const geheimB = Buffer.alloc(32, 9).toString('base64url')

  it('zelfde geheim en nummer geven dezelfde sleutel, ook met spaties of kleine letters; ander geheim een andere', async () => {
    const a1 = await rekeningSleutel('rabobank', 'NL12 RABO 0123 4567 89', geheimA)
    const a2 = await rekeningSleutel('rabobank', 'nl12rabo0123456789', geheimA)
    const b = await rekeningSleutel('rabobank', 'NL12RABO0123456789', geheimB)
    expect(a1).toBe(a2)
    expect(b).not.toBe(a1)
    expect(normaliseerNummer('NL12 RABO 0123 4567 89')).toBe('NL12RABO0123456789')
  })

  it('de sleutel bevat het nummer niet en heeft de vaste vorm', async () => {
    const s = await rekeningSleutel('ibkr', 'U1234567', geheimA)
    expect(s).toMatch(/^[a-z0-9-]+:[0-9a-f]{16}$|:r-/)
    expect(s).toMatch(SLEUTEL_PATROON)
    expect(s).not.toContain('1234567')
    expect(s.toUpperCase()).not.toContain('U1234567')
    const nieuw = nieuweRekeningSleutel('degiro', () => 'AbC-12xyz9')
    expect(nieuw).toBe('degiro:r-abc12xyz')
    expect(nieuw).toMatch(/^[a-z0-9-]+:[0-9a-f]{16}$|:r-/)
    expect(nieuweRekeningSleutel('degiro')).toMatch(SLEUTEL_PATROON)
  })
})

describe('6. kolomkoppeling onthouden', () => {
  it('een kolom met IBANs of meer dan 30 unieke waarden bewaart geen waarden', () => {
    expect(onthoudbareWaarden({ 'NL12RABO0123456789': 'storting', Dividend: 'dividend' })).toBeUndefined()
    expect(onthoudbareWaarden({ 'NL12 RABO 0123 4567 89': 'storting' })).toBeUndefined()
    const veel = Object.fromEntries(Array.from({ length: KOPPELING_WAARDEN.max + 1 }, (_, i) => [`Overboeking ${String.fromCharCode(65 + (i % 26))}${i}`, 'storting' as const]))
    expect(onthoudbareWaarden(veel)).toBeUndefined()
    expect(onthoudbareWaarden({ ['x'.repeat(KOPPELING_WAARDEN.maxLengte + 1)]: 'kosten' })).toBeUndefined()
  })

  it('een soortkolom met 6 korte waarden wordt wel onthouden, zonder bedragen', () => {
    const waarden = { Storting: 'storting', Opname: 'opname', Dividend: 'dividend', Belasting: 'dividendbelasting', Rente: 'rente', Kosten: 'kosten' } as const
    expect(onthoudbareWaarden({ ...waarden })).toEqual(waarden)
    const b = csv('generiek-puntkomma.csv')
    const k = teOnthouden({ ...stelKoppelingVoor(b), waarden: { ...waarden } })
    expect(k.waarden).toEqual(waarden)
    const opgeslagen = JSON.stringify(k)
    for (const r of b.regels) for (const cel of r) if (/\d{2,}/.test(cel)) expect(opgeslagen).not.toContain(cel)
    expect(leesOnthouden(JSON.parse(opgeslagen))).toEqual(k)
  })

  it('teOnthouden laat waarden met een IBAN weg; leesOnthouden weigert rommel', () => {
    const b = csv('generiek-puntkomma.csv')
    const k = teOnthouden({ ...stelKoppelingVoor(b), waarden: { 'Overboeking NL91ABNA0417164300': 'storting' } })
    expect('waarden' in k).toBe(false)
    expect(leesOnthouden({ kopSleutel: 1 })).toBeNull()
    expect(leesOnthouden({ ...k, waarden: { 'NL91ABNA0417164300': 'storting' } })).toEqual(k)
  })
})

describe('7. ongedaan maken in de editor', () => {
  const positie = (id: string, omschrijving: string, waardeBegin: number): VermogensPositie => ({ id, omschrijving, categorie: 'bankNL', eigenaar: 'A', waardeBegin })

  it('zet X terug, haalt Y weg en laat Z staan; een latere wijziging aan X wordt gemeld', () => {
    const voor = leegInvoer(2025)
    voor.box3.posities = [positie('x', 'Spaarrekening X', 100), positie('z', 'Spaarrekening Z', 50)]
    const naImport = structuredClone(voor)
    naImport.box3.posities[0] = { ...naImport.box3.posities[0], waardeBegin: 999, stortingen: 10 }
    const y = positie('y', 'DEGIRO geld', 20)
    naImport.box3.posities.push(y)
    const ongedaan = maakOngedaan([
      { id: 'x', voor: voor.box3.posities[0], naImport: naImport.box3.posities[0] },
      { id: 'y', voor: null, naImport: y },
    ])

    // Daarna past de gebruiker Z aan.
    const later = structuredClone(naImport)
    later.box3.posities[1].waardeBegin = 75
    expect(kanOngedaan(later, ongedaan)).toEqual({ kan: true, gewijzigd: [] })
    const terug = zetTerug(later, ongedaan)
    expect(terug.box3.posities.map((p) => [p.id, p.waardeBegin])).toEqual([
      ['x', 100],
      ['z', 75],
    ])
    expect(terug.box3.posities[0].stortingen).toBeUndefined()

    // Past de gebruiker X na de import aan, dan meldt kanOngedaan dat die wijziging verloren gaat.
    const xAangepast = structuredClone(later)
    xAangepast.box3.posities[0].waardeBegin = 1000
    expect(kanOngedaan(xAangepast, ongedaan).gewijzigd).toEqual(['Spaarrekening X'])
  })

  it('pasVoorstelToe geeft het ongedaan maken van precies de geraakte bezittingen', () => {
    const start = leegInvoer(2025)
    start.box3.posities = [positie('z', 'Spaarrekening Z', 50)]
    const u = uitkomst([
      { soort: 'storting', bedrag: 500, datum: '2025-01-10' },
      { soort: 'koop', bedrag: -400, datum: '2025-01-11', isin: 'IE0000000001' },
    ])
    const { invoer, ongedaan } = pasVoorstelToe(start, maakVoorstel([u], { invoer: start, jaar: 2025 }))
    expect(ongedaan.posities.map((p) => p.voor)).toEqual([null, null])
    expect(effecten(invoer).stortingen).toBe(400)
    expect(zetTerug(invoer, ongedaan)).toEqual(start)
    expect(valideerInvoer(invoer)).toEqual([])
  })
})

describe('herkomst in valideerInvoer', () => {
  it('accepteert wat de import schrijft en weigert extra velden of een rekeningnummer als sleutel', () => {
    const [v] = maakVoorstel([lees('degiro-rekeningoverzicht-2025-nl.csv')], { invoer: leegInvoer(2025), jaar: 2025 })
    const invoer = pasVoorstelToe(leegInvoer(2025), v).invoer
    expect(valideerInvoer(invoer)).toEqual([])
    const h = invoer.box3.posities[0].herkomst!
    expect(herkomstFouten(h, 'h')).toEqual([])
    expect(herkomstFouten({ ...h, rekeningnummer: 'NL12' }, 'h')).toEqual(['h.rekeningnummer: onbekend veld'])
    expect(herkomstFouten({ ...h, sleutel: 'degiro:NL12RABO0123456789' }, 'h')).toHaveLength(1)
    expect(herkomstFouten({ ...h, bestanden: [{ hash: 'x', regels: 1 }] }, 'h')).toEqual(['h.bestanden[0].hash: moet een hash zijn'])
  })
})

describe('8e. het verzoek voor de JSON-import', () => {
  const bestand = JSON.parse(fixtureTekst('ibcalculator-dossier-export.json'))
  const jaar2025 = bestand.huishoudens[0].jaren[0]
  const metTweeJaren = {
    ...bestand,
    huishoudens: [
      {
        ...bestand.huishoudens[0],
        gegevens: { adres: { straat: 'Voorbeeldstraat 1', postcode: '1234 AB', plaats: 'Voorbeeld' }, samenlevingsvorm: 'samenwonend' },
        jaren: [
          { ...jaar2025, accountant: { A: { winst: 10 } }, aangiftestaat: { versie: 1 } },
          { ...jaar2025, jaar: 2024, status: 'gecontroleerd', invoer: { ...jaar2025.invoer, jaar: 2024 } },
        ],
      },
    ],
  }
  const { voorstel, bron } = leesJsonExport(JSON.stringify(metTweeJaren), { bestaand: [{ jaar: 2024, bijgewerkt: '2026-10-04T10:00:00.000Z' }] })

  it('standaard: nieuw jaar Toevoegen, bestaand jaar Overslaan, persoonlijke gegevens uit', () => {
    expect(voorstel.fouten).toEqual([])
    expect(voorstel.jaren.map((j) => [j.jaar, j.standaard])).toEqual([
      [2025, 'toevoegen'],
      [2024, 'overslaan'],
    ])
    const keuzes = standaardKeuzes(voorstel)
    expect(keuzes).toMatchObject({ accountant: true, aangiftestaat: true, gegevens: false })
    expect(teImporteren(voorstel, keuzes)).toEqual([2025])
  })

  it('bevat geen overgeslagen jaren en geen gegevens met de schakelaar uit', () => {
    const keuzes = standaardKeuzes(voorstel)
    const verzoek = bouwVerzoek(voorstel, bron!, keuzes)
    expect(verzoek.jaren.map((j) => j.jaar)).toEqual([2025])
    expect('gegevens' in verzoek).toBe(false)
    expect(JSON.stringify(verzoek)).not.toContain('Voorbeeldstraat')
    expect(verzoek.jaren[0]).toMatchObject({ actie: 'toevoegen', accountant: { A: { winst: 10 } }, aangiftestaat: { versie: 1 } })
  })

  it('schakelaars uit laten accountant en aangiftestaat weg; Vervangen en gegevens aan nemen ze mee', () => {
    const verzoek = bouwVerzoek(voorstel, bron!, { acties: { 2025: 'overslaan', 2024: 'vervangen' }, accountant: false, aangiftestaat: false, gegevens: true })
    expect(verzoek.jaren.map((j) => [j.jaar, j.actie, j.status])).toEqual([[2024, 'vervangen', 'gecontroleerd']])
    expect(verzoek.jaren[0].accountant).toBeUndefined()
    expect(verzoek.jaren[0].aangiftestaat).toBeUndefined()
    expect(verzoek.gegevens).toEqual(metTweeJaren.huishoudens[0].gegevens)
  })

  it('een jaar-export zonder accountantsbedragen of vinkjes biedt die keuzes niet aan', () => {
    const jaar = { formaat: 'ibcalculator-jaar', versie: 1, jaar: 2025, variant: null, status: 'concept', invoer: jaar2025.invoer, accountant: {}, aangiftestaat: { versie: 1, controles: { streng: { op: '2026-10-05T10:00:00.000Z', door: 'export' } } } }
    expect(leesJsonExport(JSON.stringify(jaar), { bestaand: [] }).voorstel.jaren[0].heeft).toEqual({ accountant: false, aangiftestaat: false })
    const met = { ...jaar, accountant: { A: { verzamelinkomen: 1000 } }, aangiftestaat: { versie: 1, invulhulp: { velden: { A: { x: { af: true } } } } } }
    expect(leesJsonExport(JSON.stringify(met), { bestaand: [] }).voorstel.jaren[0].heeft).toEqual({ accountant: true, aangiftestaat: true })
  })

  it('een nieuwere versie of een ander bestand geeft een duidelijke fout', () => {
    expect(leesJsonExport(JSON.stringify({ ...bestand, versie: 2 }), { bestaand: [] }).voorstel.fouten).toEqual(['Dit bestand komt uit een nieuwere versie van de tool. Werk de tool bij en probeer het opnieuw.'])
    expect(leesJsonExport('{"formaat":"iets-anders"}', { bestaand: [] }).voorstel.fouten).toEqual(['Dit is geen export van deze tool.'])
    expect(leesJsonExport('geen json', { bestaand: [] }).voorstel.fouten[0]).toMatch(/^Dit bestand is geen JSON\./)
  })

  it('een ongeldig jaar kan de tool niet berekenen en wordt overgeslagen, met hooguit twaalf fouten', () => {
    const kapot = { ...bestand, huishoudens: [{ ...bestand.huishoudens[0], jaren: [{ ...jaar2025, invoer: { ...jaar2025.invoer, box3: { posities: Array.from({ length: 20 }, () => ({})), schulden: [] } } }] }] }
    const { voorstel: v } = leesJsonExport(JSON.stringify(kapot), { bestaand: [] })
    expect(v.jaren[0].mogelijk).toBe(false)
    expect(v.jaren[0].standaard).toBe('overslaan')
    expect(v.jaren[0].fouten.length).toBe(12)
  })
})
