import { describe, expect, it } from 'vitest'
import type { OndernemingInvoer, TaxYearParams } from '../../types'
import { getJaar, kloon } from '../../years'
import { berekenOnderneming, correctieBeperktAftrekbaar, type OndernemingContext } from '../../modules/onderneming'
import { berekenInvesteringsaftrek, berekenDesinvesteringsbijtelling, kiaUitTabel } from '../../modules/onderneming/investeringsaftrek'
import { berekenAfschrijvingen } from '../../modules/onderneming/afschrijving'
import { berekenBijtellingAuto } from '../../modules/onderneming/auto'
import { toetsUrencriterium } from '../../modules/onderneming/urencriterium'
import { berekenFor } from '../../modules/onderneming/for'

/** 2021-achtige parameters (het jaarbestand 2021 wordt parallel geschreven): alleen de velden die de test raakt. */
function params2021(): TaxYearParams {
  const p = kloon(getJaar(2024))
  p.jaar = 2021
  p.ondernemer.waarde.zelfstandigenaftrek = 6670
  p.ondernemer.waarde.mkbWinstvrijstelling = 0.14
  p.ondernemer.waarde.beperktAftrekbaar = { drempel: 4700, aftrekbaarDeel: 0.8 }
  p.ondernemer.waarde.kia = { minPerBedrijfsmiddel: 450, ondergrens: 2400, pct: 0.28, pctTot: 59170, vastBedrag: 16568, vastTot: 109574, afbouwPct: 0.0756, nulBoven: 328721 }
  return p
}

const ctx = (params: TaxYearParams, extra: Partial<OndernemingContext> = {}): OndernemingContext => ({
  params,
  jaar: params.jaar,
  aowBereikt: false,
  urenLoondienst: 0,
  ...extra,
})

const basis = (o: Partial<OndernemingInvoer> = {}): OndernemingInvoer => ({
  naam: 'Meubelmakerij',
  winstberekening: { soort: 'saldo', saldo: 0 },
  uren: { onderneming: 1650 },
  startjaar: 2016,
  ...o,
})

const ALLE_TEKST = (r: { uitleg: Array<{ label: string; formule?: string }>; waarschuwingen: Array<{ tekst: string }> }) =>
  [...r.uitleg.flatMap((u) => [u.label, u.formule ?? '']), ...r.waarschuwingen.map((w) => w.tekst)].join('\n')

describe('onderneming: voorbeeld 2024', () => {
  const p = getJaar(2024)
  const o = basis({
    winstberekening: { soort: 'saldo', saldo: 152340 },
    beperktAftrekbaar: 1140,
    investeringen: [
      { omschrijving: 'Formaatzaag', datum: '2024-03-14', bedrag: 2950, regeling: 'kia' },
      { omschrijving: 'Laptop', datum: '2024-09-02', bedrag: 1480, regeling: 'kia' },
    ],
    for: { stand: 9640, ondernemingsvermogenEinde: 97450 },
  })
  const r = berekenOnderneming(o, ctx(p))

  it('rekent correctie, KIA en winst', () => {
    expect(r.saldo).toBe(152340)
    expect(r.correctieBeperktAftrekbaar).toBe(228)
    expect(r.kia).toBe(1240)
    expect(r.verplichteForAfname).toBe(0)
    expect(r.winst).toBe(152340 + 228 - 1240)
    expect(r.winstJaarequivalent).toBe(r.winst)
    expect(r.urencriteriumGehaald).toBe(true)
    expect(r.isStarter).toBe(false)
  })

  it('volgt de volgorde van het rapport in de uitleg', () => {
    const ids = r.uitleg.map((u) => u.id.replace('onderneming.meubelmakerij.', ''))
    expect(ids.indexOf('saldo')).toBeLessThan(ids.indexOf('correctieBeperktAftrekbaar'))
    expect(ids.indexOf('correctieBeperktAftrekbaar')).toBeLessThan(ids.indexOf('kia'))
    expect(ids.indexOf('kia')).toBeLessThan(ids.indexOf('winst'))
    const correcties = r.uitleg.find((u) => u.id.endsWith('.correcties'))
    expect(correcties?.bedrag).toBe(228 - 1240)
    const kia = r.uitleg.find((u) => u.id.endsWith('.kia'))
    expect(kia?.formule).toBe('28% × 4.430')
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const tekst = ALLE_TEKST(r)
    expect(tekst).not.toMatch(/[—→]/)
  })
})

describe('onderneming: voorbeeld 2021 (2021-achtige parameters)', () => {
  it('rekent 172 correctie, 952 KIA en winst 97.320', () => {
    const p = params2021()
    const r = berekenOnderneming(
      basis({
        winstberekening: { soort: 'saldo', saldo: 98100 },
        beperktAftrekbaar: 860,
        investeringen: [{ omschrijving: 'Werkbank', datum: '2021-05-18', bedrag: 3400, regeling: 'kia' }],
        for: { stand: 6900, ondernemingsvermogenEinde: 58250 },
      }),
      ctx(p),
    )
    expect(r.correctieBeperktAftrekbaar).toBe(172)
    expect(r.kia).toBe(952)
    expect(r.winst).toBe(97320)
  })
})

describe('correctie beperkt aftrekbare kosten', () => {
  const p = getJaar(2024)
  it('kiest het laagste van 20% en de drempel', () => {
    expect(correctieBeperktAftrekbaar(1140, p)).toMatchObject({ correctie: 228, methode: 'pct' })
    expect(correctieBeperktAftrekbaar(40000, p)).toMatchObject({ correctie: 5600, methode: 'drempel' })
    expect(correctieBeperktAftrekbaar(0, p).correctie).toBe(0)
  })
})

describe('KIA, EIA, MIA en desinvestering', () => {
  const p = getJaar(2024)
  const kia = p.ondernemer.waarde.kia

  it('volgt de bandentabel', () => {
    expect(kiaUitTabel(2800, kia)).toBe(0)
    expect(kiaUitTabel(2801, kia)).toBeCloseTo(784.28, 2)
    expect(kiaUitTabel(69765, kia)).toBeCloseTo(19534.2, 1)
    expect(kiaUitTabel(100000, kia)).toBe(19535)
    expect(kiaUitTabel(200000, kia)).toBeCloseTo(19535 - 0.0756 * (200000 - 129194), 6)
    expect(kiaUitTabel(400000, kia)).toBe(0)
  })

  it('sluit uitgesloten, partner- en kleine aankopen uit en telt alleen het betaalde deel bij niet in gebruik', () => {
    const r = berekenInvesteringsaftrek(
      [
        { omschrijving: 'Laptop', datum: '2024-03-01', bedrag: 2500 },
        { omschrijving: 'Personenauto', datum: '2024-03-01', bedrag: 30000, uitgesloten: true },
        { omschrijving: 'Bureau van partner', datum: '2024-03-01', bedrag: 1000, gekochtVanPartner: true },
        { omschrijving: 'Muis', datum: '2024-03-01', bedrag: 80 },
        { omschrijving: 'Machine', datum: '2024-12-01', bedrag: 5000, betaald: 1000, inGebruik: false },
      ],
      { params: p },
    )
    expect(r.kiaGrondslag).toBe(3500)
    expect(r.kia).toBe(980)
    expect(r.waarschuwingen.map((w) => w.id)).toEqual(
      expect.arrayContaining(['onderneming.kia.uitgesloten', 'onderneming.kia.partner', 'onderneming.kia.minimum', 'onderneming.kia.nietInGebruik']),
    )
  })

  it('EIA telt ook mee voor de KIA, MIA niet; melding vereist', () => {
    const p26 = getJaar(2026)
    const r = berekenInvesteringsaftrek(
      [
        { omschrijving: 'Warmtepomp', datum: '2026-04-01', bedrag: 10000, regeling: 'eia' },
        { omschrijving: 'Elektrische bakfiets', datum: '2026-04-01', bedrag: 5000, regeling: 'mia-2', gemeld: true },
      ],
      { params: p26 },
    )
    expect(r.eia).toBe(4000)
    expect(r.mia).toBe(1800)
    expect(r.kiaGrondslag).toBe(10000)
    expect(r.kia).toBe(2800)
    expect(r.waarschuwingen.some((w) => w.id === 'onderneming.eia.melding' && w.ernst === 'actie')).toBe(true)
    expect(r.waarschuwingen.some((w) => w.id === 'onderneming.mia.melding')).toBe(false)
  })

  it('desinvesteringsbijtelling alleen binnen vijf jaar en boven de drempel', () => {
    const r = berekenDesinvesteringsbijtelling(
      [
        { omschrijving: 'Camera', verkoopprijs: 3000, investeringsjaar: 2021, genotenPct: 0.28 },
        { omschrijving: 'Oude pc', verkoopprijs: 900, investeringsjaar: 2019, genotenPct: 0.28 },
      ],
      { params: p, jaar: 2024 },
    )
    // De drempel telt alle verkopen van het jaar (ook de oude pc buiten de termijn); de bijtelling alleen de camera.
    expect(r.verkoopprijzen).toBe(3900)
    expect(r.bijtelling).toBe(840)
    const onder = berekenDesinvesteringsbijtelling([{ omschrijving: 'Camera', verkoopprijs: 2800, investeringsjaar: 2023, genotenPct: 0.28 }], { params: p, jaar: 2024 })
    expect(onder.bijtelling).toBe(0)
  })
})

describe('afschrijving', () => {
  const p = getJaar(2026)
  it('lineair, naar rato in het eerste jaar, en het tweede jaar vol', () => {
    const laptop = { omschrijving: 'Laptop', aanschafdatum: '2026-07-01', aanschafwaarde: 3000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' as const }
    expect(berekenAfschrijvingen([laptop], { params: p, jaar: 2026, isStarter: false }).totaal).toBe(300)
    const r27 = berekenAfschrijvingen([laptop], { params: p, jaar: 2027, isStarter: false })
    expect(r27.totaal).toBe(600)
    expect(r27.perActief[0].boekwaardeBegin).toBe(2700)
  })

  it('kleine aanschaf direct, goodwill maximaal 10%, 20%-maximum en gebouw niet onder de bodemwaarde', () => {
    const r = berekenAfschrijvingen(
      [
        { omschrijving: 'Headset', aanschafdatum: '2026-02-01', aanschafwaarde: 400, restwaarde: 0, levensduurJaren: 3, methode: 'lineair' },
        { omschrijving: 'Goodwill', aanschafdatum: '2026-01-01', aanschafwaarde: 10000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', soort: 'goodwill' },
        { omschrijving: 'Server', aanschafdatum: '2026-01-01', aanschafwaarde: 6000, restwaarde: 0, levensduurJaren: 3, methode: 'lineair' },
        { omschrijving: 'Pand', aanschafdatum: '2026-01-01', aanschafwaarde: 300000, restwaarde: 0, levensduurJaren: 30, methode: 'lineair', soort: 'gebouw', woz: 350000 },
      ],
      { params: p, jaar: 2026, isStarter: false },
    )
    expect(r.perActief.map((a) => a.afschrijving)).toEqual([400, 1000, 1200, 0])
  })

  it('willekeurig alleen voor starters, met boekwinst bij verkoop', () => {
    const actief = { omschrijving: 'Camera', aanschafdatum: '2026-01-01', aanschafwaarde: 5000, restwaarde: 0, levensduurJaren: 5, methode: 'willekeurig-starter' as const }
    expect(berekenAfschrijvingen([actief], { params: p, jaar: 2026, isStarter: true }).totaal).toBe(5000)
    const geenStarter = berekenAfschrijvingen([actief], { params: p, jaar: 2026, isStarter: false })
    expect(geenStarter.totaal).toBe(1000)
    expect(geenStarter.waarschuwingen[0].id).toBe('onderneming.afschrijving.willekeurig')
    const verkocht = berekenAfschrijvingen(
      [{ omschrijving: 'Beamer', aanschafdatum: '2025-01-01', aanschafwaarde: 2000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', verkocht: { datum: '2026-06-15', verkoopprijs: 2000 } }],
      { params: p, jaar: 2026, isStarter: false },
    )
    expect(verkocht.totaal).toBe(200)
    expect(verkocht.boekwinst).toBe(600)
  })
})

describe('bijtelling auto', () => {
  const p = getJaar(2026)
  it('fossiel: 22% van de cataloguswaarde, maximaal de autokosten', () => {
    const r = berekenBijtellingAuto({ cataloguswaarde: 40000, datumEersteToelating: '2020-05-01', nulEmissie: false, autokosten: 6000 }, { params: p, jaar: 2026 })
    expect(r.bruto).toBe(8800)
    expect(r.bijtelling).toBe(6000)
  })
  it('nulemissie 2025: 17% tot de cap en 22% daarboven', () => {
    const r = berekenBijtellingAuto({ cataloguswaarde: 45000, datumEersteToelating: '2025-12-10', nulEmissie: true, autokosten: 20000 }, { params: p, jaar: 2026 })
    expect(r.soort).toBe('nulEmissie')
    expect(r.bijtelling).toBe(8400)
  })
  it('nulemissie na 60 maanden deels algemeen', () => {
    const r = berekenBijtellingAuto({ cataloguswaarde: 40000, datumEersteToelating: '2021-06-20', nulEmissie: true, autokosten: 20000 }, { params: p, jaar: 2026 })
    // termijn juli 2021 t/m juni 2026: 6 maanden 12%, 6 maanden 22%
    expect(r.soort).toBe('gemengd')
    expect(r.bijtelling).toBe(Math.round((0.12 * 40000 * 6 + 0.22 * 40000 * 6) / 12))
  })
  it('youngtimer en rittenregistratie', () => {
    expect(
      berekenBijtellingAuto({ cataloguswaarde: 30000, datumEersteToelating: '2008-05-01', nulEmissie: false, dagwaarde: 8000, autokosten: 5000 }, { params: p, jaar: 2026 }).bijtelling,
    ).toBe(2800)
    expect(
      berekenBijtellingAuto({ cataloguswaarde: 30000, datumEersteToelating: '2022-05-01', nulEmissie: false, autokosten: 5000, priveKm: 400, rittenregistratie: true }, { params: p, jaar: 2026 }).bijtelling,
    ).toBe(0)
  })
})

describe('uitgesplitste winstberekening', () => {
  it('trekt kosten, auto en kilometers af en telt de bijtelling bij de winst', () => {
    const p = getJaar(2026)
    const r = berekenOnderneming(
      basis({
        winstberekening: { soort: 'uitgesplitst', omzet: 100000, kosten: 20000 },
        beperktAftrekbaar: 1000,
        zakelijkeKmPrive: 1000,
        auto: { cataloguswaarde: 40000, datumEersteToelating: '2020-05-01', nulEmissie: false, autokosten: 6000 },
      }),
      ctx(p),
    )
    expect(r.kilometeraftrek).toBe(250)
    expect(r.saldo).toBe(100000 - 20000 - 1000 - 6000 - 250)
    expect(r.correctieBeperktAftrekbaar).toBe(200)
    expect(r.bijtellingAuto).toBe(6000)
    expect(r.winst).toBe(72750 + 200 + 6000)
  })

  it('gebruikt afschrijvingen uit activa en rekent een jaarequivalent', () => {
    const p = getJaar(2026)
    const r = berekenOnderneming(
      basis({
        winstberekening: { soort: 'uitgesplitst', omzet: 60000, kosten: 4000, afschrijvingen: 9999 },
        activa: [{ omschrijving: 'Laptop', aanschafdatum: '2026-01-01', aanschafwaarde: 3000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }],
        activaVolledig: true,
        maandenGewerkt: 9,
      }),
      ctx(p),
    )
    expect(r.saldo).toBe(60000 - 4000 - 600)
    expect(r.winst).toBe(55400)
    expect(r.winstJaarequivalent).toBeCloseTo((55400 * 12) / 9, 6)
  })

  it('telt bij een saldo geen kilometers of bijtelling bij', () => {
    const p = getJaar(2026)
    const r = berekenOnderneming(
      basis({
        winstberekening: { soort: 'saldo', saldo: 50000 },
        zakelijkeKmPrive: 1000,
        auto: { cataloguswaarde: 40000, datumEersteToelating: '2020-05-01', nulEmissie: false, autokosten: 6000 },
      }),
      ctx(p),
    )
    expect(r.winst).toBe(50000)
    expect(r.kilometeraftrek).toBe(0)
    expect(r.bijtellingAuto).toBe(0)
  })
})

describe('urencriterium', () => {
  const p = getJaar(2024)
  it('grotendeelscriterium bij loondienst, behalve voor starters', () => {
    expect(toetsUrencriterium({ onderneming: 1300, loondienst: 1500 }, { params: p, jaar: 2024, startjaar: 2015 }).gehaald).toBe(false)
    expect(toetsUrencriterium({ onderneming: 1300, loondienst: 1500 }, { params: p, jaar: 2024, startjaar: 2022 }).gehaald).toBe(true)
    expect(toetsUrencriterium({ onderneming: 1300 }, { params: p, jaar: 2024, startjaar: 2015, urenLoondienst: 1000 }).gehaald).toBe(true)
  })
  it('zwangerschapsverlof telt mee als gewerkte uren (16 weken)', () => {
    const r = toetsUrencriterium({ onderneming: 800, zwangerschapWeken: 20, gemiddeldeUrenPerWeekVoorVerlof: 30 }, { params: p, jaar: 2025, startjaar: 2015 })
    expect(r.fictieveUren).toBe(480)
    expect(r.uren).toBe(1280)
    expect(r.gehaald).toBe(true)
  })
  it('opgegeven waarde wint, met waarschuwing bij tegenspraak; bewijslast bij veel indirecte uren', () => {
    const r = toetsUrencriterium({ onderneming: 1600, urencriteriumGehaald: false }, { params: p, jaar: 2024, startjaar: 2016 })
    expect(r.gehaald).toBe(false)
    expect(r.waarschuwingen.some((w) => w.id === 'onderneming.uren.afwijkend')).toBe(true)
    const ind = toetsUrencriterium({ onderneming: 1300, indirect: 800 } as never, { params: p, jaar: 2024, startjaar: 2016 })
    const w = ind.waarschuwingen.find((x) => x.id === 'onderneming.uren.bewijslast')
    expect(w?.bron?.titel).toContain('ECLI:NL:HR:2025:111')
  })
  it('verlaagd criterium voor arbeidsongeschikte starters zolang de regeling bestaat', () => {
    expect(toetsUrencriterium({ onderneming: 900 }, { params: p, jaar: 2024, startjaar: 2024, arbeidsongeschiktStarter: true }).gehaald).toBe(true)
    const zonder = kloon(p)
    zonder.ondernemer.waarde.startersaftrekAO.actief = false
    expect(toetsUrencriterium({ onderneming: 900 }, { params: zonder, jaar: 2024, startjaar: 2024, arbeidsongeschiktStarter: true }).gehaald).toBe(false)
  })
})

describe('oudedagsreserve', () => {
  const p = getJaar(2024)
  const basisCtx = { params: p, staking: false, aowBereikt: false, urencriteriumGehaald: true, winstVoorFor: 100000 }
  it('geen afname zolang het ondernemingsvermogen hoger is', () => {
    expect(berekenFor({ stand: 9640, ondernemingsvermogenEinde: 97450 }, basisCtx).verplichteAfname).toBe(0)
  })
  it('FOR boven het ondernemingsvermogen zonder grond: geen afname, wel een melding', () => {
    const r = berekenFor({ stand: 9640, ondernemingsvermogenEinde: 6000 }, basisCtx)
    expect(r.verplichteAfname).toBe(0)
    expect(r.reden).toBeNull()
    expect(r.waarschuwingen.find((w) => w.id === 'onderneming.for.bovenOndernemingsvermogen')?.ernst).toBe('info')
  })
  it('bij AOW of twee jaar geen urencriterium alleen het meerdere boven het ondernemingsvermogen; bij volledige staking alles', () => {
    expect(berekenFor({ stand: 9640, ondernemingsvermogenEinde: 97450 }, { ...basisCtx, aowBereikt: true }).verplichteAfname).toBe(0)
    expect(berekenFor({ stand: 9640, ondernemingsvermogenEinde: 6000 }, { ...basisCtx, aowBereikt: true }).verplichteAfname).toBe(3640)
    const staking = berekenFor({ stand: 9640 }, { ...basisCtx, staking: true })
    expect(staking.reden).toBe('staking')
    expect(staking.verplichteAfname).toBe(9640)
    expect(berekenFor({ stand: 9640, ondernemingsvermogenEinde: 6000 }, { ...basisCtx, urencriteriumGehaald: false, urencriteriumVorigJaar: false }).verplichteAfname).toBe(3640)
    expect(berekenFor({ stand: 9640, ondernemingsvermogenEinde: 6000 }, { ...basisCtx, urencriteriumGehaald: false }).verplichteAfname).toBe(0)
  })
  it('vrijwillige afname telt als winst; geen dotatie sinds 2023', () => {
    const r = berekenOnderneming(
      basis({ winstberekening: { soort: 'saldo', saldo: 50000 }, for: { stand: 9640, ondernemingsvermogenEinde: 100000, vrijwilligeAfname: 5000, dotatie: 3000 } as never }),
      ctx(p),
    )
    expect(r.winst).toBe(55000)
    expect(r.waarschuwingen.some((w) => w.id.endsWith('for.geenDotatie'))).toBe(true)
    expect(r.waarschuwingen.some((w) => w.id.endsWith('for.omzetting'))).toBe(true)
  })
  it('dotatie in een jaar met dotatie verlaagt de winst', () => {
    const pre = kloon(p)
    pre.ondernemer.waarde.for = { ...pre.ondernemer.waarde.for, dotatie: true, dotatiePct: 0.0944, dotatieMax: 9395 }
    const r = berekenFor({ stand: 0, ondernemingsvermogenEinde: 50000, dotatie: 20000 }, { ...basisCtx, params: pre })
    expect(r.dotatie).toBe(9395)
  })
})

describe('urencriterium standaard ja', () => {
  it('zonder uren en zonder keuze geldt het urencriterium als gehaald', async () => {
    const { toetsUrencriterium } = await import('../../modules/onderneming/urencriterium')
    const { getJaar } = await import('../../years')
    const r = toetsUrencriterium({ onderneming: 0 }, { params: getJaar(2026), jaar: 2026, startjaar: 2015 })
    expect(r.gehaald).toBe(true)
    expect(r.uitleg.find((u) => u.id.endsWith('.urencriterium'))?.formule).toContain('standaard ja')
  })
  it('met ingevulde uren blijft de echte toets gelden', async () => {
    const { toetsUrencriterium } = await import('../../modules/onderneming/urencriterium')
    const { getJaar } = await import('../../years')
    const r = toetsUrencriterium({ onderneming: 800 }, { params: getJaar(2026), jaar: 2026, startjaar: 2015 })
    expect(r.gehaald).toBe(false)
  })
  it('een expliciete nee wint', async () => {
    const { toetsUrencriterium } = await import('../../modules/onderneming/urencriterium')
    const { getJaar } = await import('../../years')
    const r = toetsUrencriterium({ onderneming: 0, urencriteriumGehaald: false }, { params: getJaar(2026), jaar: 2026, startjaar: 2015 })
    expect(r.gehaald).toBe(false)
  })
})
