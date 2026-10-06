/**
 * Activaregister: fiscale afschrijving per jaar, boekwaarde voor het volgende jaar, de correctie bij een saldo en de
 * automatische desinvesteringsbijtelling (G02, G08).
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '../../engine'
import { activaregisterTeltMee, berekenOnderneming, type OndernemingContext } from '../../modules/onderneming'
import { berekenAfschrijvingen } from '../../modules/onderneming/afschrijving'
import { berekenDesinvesteringsbijtelling, berekenInvesteringsaftrek, desinvesteringenUitActiva } from '../../modules/onderneming/investeringsaftrek'
import type { ActiefInvoer, DesinvesteringInvoer, HuishoudenInvoer, OndernemingInvoer, TaxYearParams } from '../../types'
import { JAREN, getJaar } from '../../years'

const p26 = getJaar(2026)
const paramsVoorJaar = (j: number): TaxYearParams | undefined => JAREN[j]
/** Parameters voor jaren na de laatste jaarmodule: die van het laatste bekende jaar (alleen voor deze reeksen). */
const paramsTot = (j: number) => getJaar(Math.min(j, 2027))

function onderneming(extra: Partial<OndernemingInvoer> = {}): OndernemingInvoer {
  return { naam: 'zaak', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 0, urencriteriumGehaald: true }, startjaar: 2015, ...extra }
}
const ctx = (params: TaxYearParams, jaar = params.jaar, extra: Partial<OndernemingContext> = {}): OndernemingContext => ({
  params,
  jaar,
  aowBereikt: false,
  urenLoondienst: 0,
  paramsVoorJaar,
  ...extra,
})

const TEKST = (r: { uitleg: Array<{ label: string; formule?: string }>; waarschuwingen: Array<{ tekst: string }> }) =>
  [...r.uitleg.flatMap((u) => [u.label, u.formule ?? '']), ...r.waarschuwingen.map((w) => w.tekst)].join('\n')

describe('afschrijving: fouten uit de gap-analyse hersteld', () => {
  it('willekeurige afschrijving van een starter schrijft na de starterperiode niet opnieuw af (A5)', () => {
    const machine: ActiefInvoer = { omschrijving: 'machine', aanschafdatum: '2025-03-01', aanschafwaarde: 10000, restwaarde: 0, levensduurJaren: 5, methode: 'willekeurig-starter' }
    let som = 0
    for (let j = 2025; j <= 2032; j++) {
      const r = berekenAfschrijvingen([machine], { params: paramsTot(j), jaar: j, isStarter: j - 2025 < 5, startjaar: 2025, paramsVoorJaar })
      som += r.totaal
      if (j === 2025) expect(r.totaal).toBe(10000)
      else expect(r.totaal, String(j)).toBe(0)
      expect(r.waarschuwingen.some((w) => w.id === 'onderneming.afschrijving.willekeurig'), String(j)).toBe(false)
    }
    expect(som).toBe(10000)
  })

  it('via de onderneming: startjaar en de parameters van het aanschafjaar gelden (2028 kent geen willekeurige afschrijving meer)', () => {
    const o = onderneming({
      startjaar: 2025,
      winstberekening: { soort: 'uitgesplitst', omzet: 50000, kosten: 0 },
      activa: [{ omschrijving: 'machine', aanschafdatum: '2026-02-01', aanschafwaarde: 10000, restwaarde: 0, levensduurJaren: 5, methode: 'willekeurig-starter' }],
    })
    const p28 = getJaar(2028)
    expect(p28.ondernemer.waarde.afschrijving.willekeurigStarters).toBe(false)
    const r28 = berekenOnderneming(o, ctx(p28))
    expect(r28.afschrijvingen?.[0]).toMatchObject({ boekwaardeBegin: 0, afschrijving: 0, boekwaardeEind: 0 })
    expect(r28.saldo).toBe(50000)
  })

  it("met 'verkocht' is de eindboekwaarde alleen in het verkoopjaar 0 (A7)", () => {
    const bus: ActiefInvoer = { omschrijving: 'bus', aanschafdatum: '2024-01-10', aanschafwaarde: 5000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', verkocht: { datum: '2026-06-30', verkoopprijs: 3000 } }
    const reeks = [2024, 2025, 2026].map((j) => berekenAfschrijvingen([bus], { params: getJaar(j), jaar: j, isStarter: false, paramsVoorJaar }).perActief[0])
    expect(reeks.map((x) => x.boekwaardeEind)).toEqual([4000, 3000, 0])
    expect(reeks.map((x) => x.verkochtDitJaar)).toEqual([false, false, true])
    expect(reeks[2]).toMatchObject({ boekwaardeBegin: 3000, afschrijving: 500, boekwinst: 500 })
    expect(berekenAfschrijvingen([bus], { params: getJaar(2027), jaar: 2027, isStarter: false }).perActief).toHaveLength(0)
  })

  it('een gebouw zonder WOZ-waarde krijgt een melding', () => {
    const r = berekenAfschrijvingen([{ omschrijving: 'pand', aanschafdatum: '2026-01-01', aanschafwaarde: 300000, restwaarde: 0, levensduurJaren: 30, methode: 'lineair', soort: 'gebouw' }], {
      params: p26,
      jaar: 2026,
      isStarter: false,
    })
    expect(r.waarschuwingen.find((w) => w.id === 'onderneming.afschrijving.gebouwZonderWoz')?.ernst).toBe('let-op')
  })

  it('bodemwaarde per jaar: tot en met 2023 50% van de WOZ, daarna 100%', () => {
    const pand: ActiefInvoer = { omschrijving: 'pand', aanschafdatum: '2022-01-01', aanschafwaarde: 300000, restwaarde: 0, levensduurJaren: 30, methode: 'lineair', soort: 'gebouw', woz: 280000 }
    // 2022 en 2023 elk 10.000 (bodem 50% × 280.000 = 140.000); vanaf 2024 is de bodem 280.000, dus dan niets meer.
    const r24 = berekenAfschrijvingen([pand], { params: getJaar(2024), jaar: 2024, isStarter: false, paramsVoorJaar })
    expect(r24.perActief[0].boekwaardeBegin).toBe(280000)
    expect(r24.totaal).toBe(0)
  })
})

describe('afschrijving: boekwaarde voor het volgende jaar', () => {
  it('boekwaardeEind van dit jaar als boekwaardeBegin geeft volgend jaar dezelfde uitkomst als de simulatie', () => {
    const laptop: ActiefInvoer = { omschrijving: 'laptop', aanschafdatum: '2025-07-15', aanschafwaarde: 2000, restwaarde: 0, levensduurJaren: 4, methode: 'lineair' }
    const r25 = berekenAfschrijvingen([laptop], { params: getJaar(2025), jaar: 2025, isStarter: false })
    const r26sim = berekenAfschrijvingen([laptop], { params: p26, jaar: 2026, isStarter: false, paramsVoorJaar })
    const r26door = berekenAfschrijvingen([{ ...laptop, boekwaardeBegin: r25.perActief[0].boekwaardeEind }], { params: p26, jaar: 2026, isStarter: false })
    expect(r25.perActief[0].boekwaardeEind).toBe(1800)
    expect(r26door.perActief[0]).toEqual(r26sim.perActief[0])
  })

  it('invoerIndex wijst naar de positie in de invoer, ook als activa ontbreken', () => {
    const r = berekenOnderneming(
      onderneming({
        winstberekening: { soort: 'uitgesplitst', omzet: 50000, kosten: 0 },
        activa: [
          { omschrijving: 'later', aanschafdatum: '2027-01-01', aanschafwaarde: 1000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' },
          { omschrijving: 'al verkocht', aanschafdatum: '2022-01-01', aanschafwaarde: 1000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', verkocht: { datum: '2025-03-01', verkoopprijs: 100 } },
          { omschrijving: 'camera', aanschafdatum: '2026-01-01', aanschafwaarde: 3000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' },
        ],
      }),
      ctx(p26),
    )
    expect(r.afschrijvingen).toHaveLength(1)
    expect(r.afschrijvingen?.[0]).toMatchObject({ omschrijving: 'camera', invoerIndex: 2, boekwaardeEind: 2400, verkochtDitJaar: false })
  })
})

describe('activaregister bij een saldo (G02)', () => {
  const laptop: ActiefInvoer = { omschrijving: 'laptop', aanschafdatum: '2026-01-01', aanschafwaarde: 6000, restwaarde: 0, levensduurJaren: 3, methode: 'lineair' }

  it('met afschrijvingenInSaldo: het verschil met de fiscale afschrijving verhoogt het saldo', () => {
    const r = berekenOnderneming(onderneming({ winstberekening: { soort: 'saldo', saldo: 60000, afschrijvingenInSaldo: 2000 }, activa: [laptop], activaVolledig: true }), ctx(p26))
    // fiscaal maximaal 20% van 6.000 = 1.200; geboekt 2.000 (3 jaar)
    expect(r.correctieAfschrijving).toBe(800)
    expect(r.saldo).toBe(60800)
    expect(r.winst).toBe(60800)
    const c = r.uitleg.find((u) => u.id.endsWith('.correctieAfschrijving'))
    expect(c?.formule).toBe('geboekt 2.000 − fiscaal volgens het activaregister 1.200')
    const ids = r.uitleg.map((u) => u.id)
    expect(ids.indexOf('onderneming.zaak.saldoInvoer')).toBeLessThan(ids.indexOf('onderneming.zaak.correctieAfschrijving'))
    expect(ids.indexOf('onderneming.zaak.correctieAfschrijving')).toBeLessThan(ids.indexOf('onderneming.zaak.saldo'))
  })

  it('een lagere geboekte afschrijving verlaagt het saldo', () => {
    const r = berekenOnderneming(onderneming({ winstberekening: { soort: 'saldo', saldo: 60000, afschrijvingenInSaldo: 500 }, activa: [laptop], activaVolledig: true }), ctx(p26))
    expect(r.correctieAfschrijving).toBe(-700)
    expect(r.winst).toBe(59300)
  })

  it('zonder afschrijvingenInSaldo telt het register niet mee, met een let-op-melding, maar de boekwaarde komt wel mee', () => {
    const r = berekenOnderneming(onderneming({ activa: [laptop], activaVolledig: true }), ctx(p26))
    expect(r.winst).toBe(60000)
    expect(r.correctieAfschrijving).toBeUndefined()
    expect(r.waarschuwingen.find((w) => w.id === 'onderneming.zaak.afschrijving.saldo')?.ernst).toBe('let-op')
    expect(r.afschrijvingen?.[0]).toMatchObject({ afschrijving: 1200, boekwaardeEind: 4800 })
  })

  it('verkoop bij een saldo: melding over het boekresultaat, het saldo blijft zoals geboekt', () => {
    const bus: ActiefInvoer = { omschrijving: 'bus', aanschafdatum: '2024-01-10', aanschafwaarde: 5000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', verkocht: { datum: '2026-06-30', verkoopprijs: 3000 } }
    const r = berekenOnderneming(onderneming({ winstberekening: { soort: 'saldo', saldo: 60000, afschrijvingenInSaldo: 500 }, activa: [bus], activaVolledig: true }), ctx(p26))
    expect(r.correctieAfschrijving).toBe(0)
    expect(r.saldo).toBe(60000)
    expect(r.waarschuwingen.find((w) => w.id.endsWith('afschrijving.boekresultaatSaldo'))?.tekst).toContain('€ 500')
  })

  it('bij uitgesplitst vervangt het register de ingevulde afschrijving, met een uitlegregel van het verschil', () => {
    const r = berekenOnderneming(
      onderneming({ winstberekening: { soort: 'uitgesplitst', omzet: 60000, kosten: 4000, afschrijvingen: 2000 }, activa: [laptop], activaVolledig: true }),
      ctx(p26),
    )
    expect(r.saldo).toBe(60000 - 4000 - 1200)
    const v = r.uitleg.find((u) => u.id.endsWith('.afschrijving.verschil'))
    expect(v?.bedrag).toBe(800)
    expect(v?.formule).toBe('ingevuld 2.000, fiscaal volgens het activaregister 1.200')
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const r = berekenOnderneming(onderneming({ activa: [laptop, { ...laptop, omschrijving: 'pand', soort: 'gebouw' }] }), ctx(p26))
    expect(TEKST(r)).not.toMatch(/[—→]/)
  })
})

describe('desinvesteringsbijtelling uit het activaregister (G08)', () => {
  const p = p26
  const camera = (extra: Partial<ActiefInvoer> = {}): ActiefInvoer => ({
    omschrijving: 'Camera',
    aanschafdatum: '2024-03-01',
    aanschafwaarde: 8000,
    restwaarde: 0,
    levensduurJaren: 5,
    methode: 'lineair',
    verkocht: { datum: '2026-05-01', verkoopprijs: 8000 },
    investeringsaftrek: { regeling: 'kia', jaar: 2024, genotenPct: 0.28 },
    ...extra,
  })

  it('verkoop binnen vijf jaar boven de drempel: 28% van 8.000 = 2.240 bij de winst', () => {
    const r = berekenOnderneming(onderneming({ activa: [camera()] }), ctx(p))
    expect(r.desinvesteringsbijtelling).toBe(2240)
    expect(r.winst).toBe(62240)
  })

  it('nooit meer dan de genoten aftrek: verkoop voor 10.000 geeft 2.240, niet 2.800', () => {
    const r = berekenOnderneming(onderneming({ activa: [camera({ verkocht: { datum: '2026-05-01', verkoopprijs: 10000 } })] }), ctx(p))
    expect(r.desinvesteringsbijtelling).toBe(2240)
    expect(r.uitleg.find((u) => u.id.endsWith('.desinvestering'))?.formule).toContain('maximaal de genoten aftrek 2.240')
    expect(r.waarschuwingen.some((w) => w.id.endsWith('desinvestering.max'))).toBe(false)
  })

  it('na de termijn of onder de drempel geen bijtelling', () => {
    expect(berekenOnderneming(onderneming({ activa: [camera({ investeringsaftrek: { regeling: 'kia', jaar: 2021, genotenPct: 0.28 } })] }), ctx(p)).desinvesteringsbijtelling).toBe(0)
    expect(berekenOnderneming(onderneming({ activa: [camera({ verkocht: { datum: '2026-05-01', verkoopprijs: 2500 } })] }), ctx(p)).desinvesteringsbijtelling).toBe(0)
    expect(berekenOnderneming(onderneming({ activa: [camera({ investeringsaftrek: undefined })] }), ctx(p)).desinvesteringsbijtelling).toBe(0)
  })

  it('verkocht in een ander jaar telt niet', () => {
    expect(berekenOnderneming(onderneming({ activa: [camera()] }), ctx(getJaar(2025), 2025)).desinvesteringsbijtelling).toBe(0)
  })

  it('geen dubbeltelling met een handmatige desinvestering van hetzelfde middel', () => {
    const r = berekenOnderneming(
      onderneming({ activa: [camera()], desinvesteringen: [{ omschrijving: ' camera ', verkoopprijs: 8000, investeringsjaar: 2024, genotenPct: 0.28 }] }),
      ctx(p),
    )
    expect(r.desinvesteringsbijtelling).toBe(2240)
    expect(r.waarschuwingen.find((w) => w.id.endsWith('desinvestering.dubbel'))?.ernst).toBe('info')
  })

  it('handmatig en uit het register tellen samen voor de drempel', () => {
    const r = berekenOnderneming(
      onderneming({
        activa: [camera({ aanschafwaarde: 2000, verkocht: { datum: '2026-05-01', verkoopprijs: 1500 } })],
        desinvesteringen: [{ omschrijving: 'Printer', verkoopprijs: 1500, investeringsjaar: 2025, genotenPct: 0.28 }],
      }),
      ctx(p),
    )
    expect(r.desinvesteringsbijtelling).toBe(840)
  })

  it('desinvesteringenUitActiva levert de genoten aftrek als maximum', () => {
    const { desinvesteringen } = desinvesteringenUitActiva([camera()], [], { jaar: 2026 })
    expect(desinvesteringen).toEqual([{ omschrijving: 'Camera', verkoopprijs: 8000, investeringsjaar: 2024, genotenPct: 0.28, genotenAftrek: 2240 }])
  })

  it('handmatige desinvestering met genotenAftrek wordt ook begrensd', () => {
    const r = berekenDesinvesteringsbijtelling([{ omschrijving: 'Bus', verkoopprijs: 20000, investeringsjaar: 2024, genotenPct: 0.28, genotenAftrek: 3000 }], { params: p, jaar: 2026 })
    expect(r.bijtelling).toBe(3000)
  })
})

describe('investeringsaftrek per middel: toegepast percentage', () => {
  it('KIA in de percentagezone, daarboven KIA gedeeld door de investeringen; EIA en MIA hun percentage', () => {
    const p = p26
    const laag = berekenInvesteringsaftrek([{ omschrijving: 'Laptop', datum: '2026-03-01', bedrag: 8000, regeling: 'kia' }], { params: p })
    expect(laag.perMiddel[0].genotenPct).toBe(p.ondernemer.waarde.kia.pct)
    const hoog = berekenInvesteringsaftrek([{ omschrijving: 'Machine', datum: '2026-03-01', bedrag: p.ondernemer.waarde.kia.vastTot, regeling: 'kia' }], { params: p })
    expect(hoog.perMiddel[0].genotenPct).toBeCloseTo(hoog.kia / p.ondernemer.waarde.kia.vastTot, 10)
    const eia = berekenInvesteringsaftrek([{ omschrijving: 'Warmtepomp', datum: '2026-03-01', bedrag: 10000, regeling: 'eia', gemeld: true }], { params: p })
    expect(eia.perMiddel.find((m) => m.regeling === 'eia')?.genotenPct).toBe(p.ondernemer.waarde.eia.pct)
    const mia = berekenInvesteringsaftrek([{ omschrijving: 'Elektrische bus', datum: '2026-03-01', bedrag: 50000, regeling: 'mia-1', gemeld: true }], { params: p })
    expect(mia.perMiddel[0].genotenPct).toBe(p.ondernemer.waarde.mia.pcts[0])
  })

  it('onder de ondergrens van de KIA is de aftrek per middel 0, ook bij meer middelen (geen 28% met een negatieve rest)', () => {
    const k = p26.ondernemer.waarde.kia
    const bedrag = Math.floor(k.ondergrens / 2)
    const r = berekenInvesteringsaftrek(
      [
        { omschrijving: 'Laptop', datum: '2026-03-01', bedrag, regeling: 'kia' },
        { omschrijving: 'Scherm', datum: '2026-04-01', bedrag, regeling: 'kia' },
      ],
      { params: p26 },
    )
    expect(r.kia).toBe(0)
    expect(r.perMiddel.map((m) => [m.aftrek, m.genotenPct])).toEqual([
      [0, 0],
      [0, 0],
    ])
  })
})

describe('engine: activa uit eerdere jaren met de parameters van dat jaar', () => {
  it('berekenHuishouden geeft per actief de fiscale boekwaarde eind', () => {
    const invoer: HuishoudenInvoer = {
      jaar: 2026,
      personen: [
        {
          id: 'A',
          geboortedatum: '1988-03-01',
          loon: [],
          inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
          ondernemingen: [
            onderneming({
              startjaar: 2024,
              winstberekening: { soort: 'uitgesplitst', omzet: 50000, kosten: 0 },
              activa: [{ omschrijving: 'machine', aanschafdatum: '2024-06-01', aanschafwaarde: 9000, restwaarde: 0, levensduurJaren: 5, methode: 'willekeurig-starter', willekeurigBedrag: 3000 }],
            }),
          ],
        },
      ],
      fiscaalPartner: false,
      kinderen: [],
      box3: { posities: [], schulden: [] },
      verdeling: 'optimaal',
    }
    const r = berekenHuishouden(invoer, { zonderMarginaleDruk: true })
    const a = r.personen[0].ondernemingen[0].afschrijvingen?.[0]
    // 2024: 3.000 willekeurig (juni t/m december = 7 maanden van de gebruiksduur); daarna de rest over de resterende
    // gebruiksduur (art. 3.30 lid 1). 2025: 6.000 × 12 / 53 maanden = 1.358; 2026: 4.642 × 12 / 41 = 1.359.
    expect(a).toMatchObject({ boekwaardeBegin: 4642, afschrijving: 1359, boekwaardeEind: 3283, invoerIndex: 0 })
  })
})

describe('afschrijving: herstel ronde 1 (punten 6 en 8)', () => {
  it('gebouwen krijgen ook het maximum van 20% per jaar, met de bodemwaarde daarbovenop (art. 3.30 lid 2 en 3.30a)', () => {
    const pand: ActiefInvoer = { omschrijving: 'pand', aanschafdatum: '2025-01-01', aanschafwaarde: 100000, restwaarde: 0, levensduurJaren: 2, methode: 'lineair', soort: 'gebouw', woz: 20000 }
    const reeks = [2025, 2026, 2027, 2028, 2029].map((j) => berekenAfschrijvingen([pand], { params: paramsTot(j), jaar: j, isStarter: false, paramsVoorJaar }).perActief[0])
    expect(reeks.map((x) => x.afschrijving)).toEqual([20000, 20000, 20000, 20000, 0])
    expect(reeks[4].boekwaardeBegin).toBe(20000)
    expect(reeks[0].formule).toContain('maximaal 20% van 100.000')
  })

  it('na willekeurige afschrijving van een starter gaat de rest over de resterende gebruiksduur (art. 3.30 lid 1)', () => {
    const machine: ActiefInvoer = { omschrijving: 'machine', aanschafdatum: '2025-01-01', aanschafwaarde: 10000, restwaarde: 0, levensduurJaren: 5, methode: 'willekeurig-starter', willekeurigBedrag: 4000 }
    const reeks = [2025, 2026, 2027, 2028, 2029, 2030].map((j) => berekenAfschrijvingen([machine], { params: paramsTot(j), jaar: j, isStarter: j - 2025 < 5, startjaar: 2025, paramsVoorJaar }).perActief[0])
    expect(reeks.map((x) => x.afschrijving)).toEqual([4000, 1500, 1500, 1500, 1500, 0])
    expect(reeks[4].boekwaardeEind).toBe(0)
    expect(reeks[1].formule).toBe('(6.000 − 0) / 4 resterende jaren')
  })

  it('resterende gebruiksduur in maanden vanaf de aanschafmaand, met het maximum van 20% per jaar', () => {
    const machine: ActiefInvoer = { omschrijving: 'machine', aanschafdatum: '2024-06-01', aanschafwaarde: 9000, restwaarde: 0, levensduurJaren: 5, methode: 'willekeurig-starter', willekeurigBedrag: 3000 }
    const reeks = [2024, 2025, 2026, 2027, 2028, 2029, 2030].map((j) => berekenAfschrijvingen([machine], { params: paramsTot(j), jaar: j, isStarter: j - 2024 < 5, startjaar: 2024, paramsVoorJaar }).perActief[0])
    // Gebruiksduur juni 2024 tot en met mei 2029: de laatste 5 maanden in 2029.
    expect(reeks.map((x) => x.afschrijving)).toEqual([3000, 1358, 1359, 1358, 1359, 566, 0])
    expect(reeks.reduce((s, x) => s + x.afschrijving, 0)).toBe(9000)
    const kort: ActiefInvoer = { ...machine, aanschafdatum: '2025-01-01', willekeurigBedrag: 1000, levensduurJaren: 2 }
    // 9.000 − 1.000 over 1 resterend jaar zou 8.000 zijn; maximaal 20% van 9.000 = 1.800.
    expect(berekenAfschrijvingen([kort], { params: p26, jaar: 2026, isStarter: true, startjaar: 2025, paramsVoorJaar }).totaal).toBe(1800)
  })
})

describe('activaregister telt alleen mee als het volledig is (herstel ronde 1, punt 9)', () => {
  const laptop: ActiefInvoer = { omschrijving: 'Laptop', aanschafdatum: '2025-07-01', aanschafwaarde: 2000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }
  const camera: ActiefInvoer = { omschrijving: 'Camera', aanschafdatum: '2025-03-01', aanschafwaarde: 4000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }
  // Register uit de doorrol: alleen laptop en camera (fiscaal 400 + 800 = 1.200), terwijl de boekhouding 4.200 afschrijft.

  it("saldo: zonder activaVolledig blijft het saldo staan, correctie 0, met een info-melding over het verschil", () => {
    const r = berekenOnderneming(onderneming({ winstberekening: { soort: 'saldo', saldo: 60800, afschrijvingenInSaldo: 4200 }, activa: [laptop, camera] }), ctx(p26))
    expect(r.saldo).toBe(60800)
    expect(r.winst).toBe(60800)
    expect(r.correctieAfschrijving).toBe(0)
    expect(r.activaregisterTeltMee).toBe(false)
    const w = r.waarschuwingen.find((x) => x.id === 'onderneming.zaak.afschrijving.registerControle')
    expect(w?.ernst).toBe('info')
    expect(w?.tekst).toContain('€ 1.200')
    expect(w?.tekst).toContain('verschil van € 3.000')
    expect(r.uitleg.find((u) => u.id.endsWith('.afschrijving.controle'))).toMatchObject({ bedrag: 1200, soort: 'info' })
    expect(r.waarschuwingen.some((x) => x.id.endsWith('afschrijving.saldo'))).toBe(false)
    // De boekwaarde per actief komt wel mee (voor volgend jaar en het rapport).
    expect(r.afschrijvingen?.map((a) => a.afschrijving)).toEqual([400, 800])
  })

  it('saldo met activaVolledig: de correctie zoals voorheen', () => {
    const r = berekenOnderneming(onderneming({ winstberekening: { soort: 'saldo', saldo: 60800, afschrijvingenInSaldo: 4200 }, activa: [laptop, camera], activaVolledig: true }), ctx(p26))
    expect(r.correctieAfschrijving).toBe(3000)
    expect(r.saldo).toBe(63800)
    expect(r.activaregisterTeltMee).toBe(true)
    expect(r.waarschuwingen.some((x) => x.id.endsWith('registerControle'))).toBe(false)
  })

  it('saldo met activaVolledig maar zonder de afschrijving in het saldo: het register telt niet mee, en zo staat het ook in de uitkomst', () => {
    const o = onderneming({ winstberekening: { soort: 'saldo', saldo: 60800 }, activa: [laptop, camera], activaVolledig: true })
    const r = berekenOnderneming(o, ctx(p26))
    expect(r.saldo).toBe(60800)
    expect(r.correctieAfschrijving).toBeUndefined()
    expect(r.activaregisterTeltMee).toBe(false)
    expect(activaregisterTeltMee(o)).toBe(false)
    expect(r.waarschuwingen.find((x) => x.id.endsWith('afschrijving.saldo'))?.ernst).toBe('let-op')
    // Dezelfde regel voor de doorrol, het scherm en het rapport.
    expect(activaregisterTeltMee({ ...o, winstberekening: { soort: 'saldo', saldo: 60800, afschrijvingenInSaldo: 4200 } })).toBe(true)
    expect(activaregisterTeltMee({ ...o, activaVolledig: false, winstberekening: { soort: 'saldo', saldo: 60800, afschrijvingenInSaldo: 4200 } })).toBe(false)
    expect(activaregisterTeltMee({ ...o, activa: [], winstberekening: { soort: 'uitgesplitst', omzet: 1, kosten: 0 } })).toBe(false)
  })

  it('uitgesplitst zonder activaVolledig: de ingevulde afschrijving blijft staan', () => {
    const r = berekenOnderneming(
      onderneming({ winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 15000, afschrijvingen: 4200 }, activa: [laptop, camera] }),
      ctx(p26),
    )
    expect(r.saldo).toBe(80000 - 15000 - 4200)
    expect(r.correctieAfschrijving).toBe(0)
    expect(r.waarschuwingen.find((x) => x.id.endsWith('registerControle'))?.ernst).toBe('info')
    expect(r.waarschuwingen.some((x) => x.id.endsWith('afschrijving.dubbel'))).toBe(false)
  })

  it('uitgesplitst zonder activaVolledig en zonder ingevulde afschrijving: let-op dat er geen afschrijving af gaat', () => {
    const r = berekenOnderneming(onderneming({ winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 15000 }, activa: [laptop, camera] }), ctx(p26))
    expect(r.saldo).toBe(65000)
    const w = r.waarschuwingen.find((x) => x.id.endsWith('registerControle'))
    expect(w?.ernst).toBe('let-op')
    expect(w?.tekst).toContain('geen afschrijving van de winst af')
  })

  it('uitgesplitst met activaVolledig: het register vervangt de afschrijving en levert het boekresultaat', () => {
    const r = berekenOnderneming(
      onderneming({ winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 15000, afschrijvingen: 4200 }, activa: [laptop, camera], activaVolledig: true }),
      ctx(p26),
    )
    expect(r.saldo).toBe(80000 - 15000 - 1200)
    expect(r.correctieAfschrijving).toBe(3000)
  })

  it('via de engine: IB gelijk aan een berekening zonder register als het register niet volledig is', () => {
    const h = (o: Partial<OndernemingInvoer>): HuishoudenInvoer => ({
      jaar: 2026,
      personen: [{ id: 'A', geboortedatum: '1988-03-01', loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 }, ondernemingen: [onderneming(o)] }],
      fiscaalPartner: false,
      kinderen: [],
      box3: { posities: [], schulden: [] },
      verdeling: 'optimaal',
    })
    const wb = { soort: 'saldo' as const, saldo: 60800, afschrijvingenInSaldo: 4200 }
    const met = berekenHuishouden(h({ winstberekening: wb, activa: [laptop, camera] }), { zonderMarginaleDruk: true })
    const zonder = berekenHuishouden(h({ winstberekening: wb }), { zonderMarginaleDruk: true })
    expect(met.personen[0].verschuldigdIB).toBe(zonder.personen[0].verschuldigdIB)
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const r = berekenOnderneming(onderneming({ winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 15000 }, activa: [laptop, { ...camera, verkocht: { datum: '2026-05-01', verkoopprijs: 3000 } }] }), ctx(p26))
    expect(TEKST(r)).not.toMatch(/[—→]/)
  })
})

describe('desinvesteringsbijtelling: drempel, dubbele regels en lege omschrijving (herstel ronde 1, punten 7, 16, 17 en 18)', () => {
  const camera = (extra: Partial<ActiefInvoer> = {}): ActiefInvoer => ({
    omschrijving: 'camera',
    aanschafdatum: '2025-03-01',
    aanschafwaarde: 4000,
    restwaarde: 0,
    levensduurJaren: 5,
    methode: 'lineair',
    investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: 0.28 },
    verkocht: { datum: '2026-05-01', verkoopprijs: 2000 },
    ...extra,
  })
  const laptop = (extra: Partial<ActiefInvoer> = {}): ActiefInvoer => ({
    omschrijving: 'laptop',
    aanschafdatum: '2025-07-15',
    aanschafwaarde: 2000,
    restwaarde: 0,
    levensduurJaren: 5,
    methode: 'lineair',
    verkocht: { datum: '2026-05-01', verkoopprijs: 2000 },
    ...extra,
  })
  const bijtelling = (o: Partial<OndernemingInvoer>) => berekenOnderneming(onderneming(o), ctx(p26))

  it('de drempel telt alle verkopen: met of zonder aftrekveld, 0% of buiten de termijn geeft dezelfde uitkomst (punt 7)', () => {
    expect(bijtelling({ activa: [camera()] }).desinvesteringsbijtelling).toBe(0)
    expect(bijtelling({ activa: [camera(), laptop({ investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: 0 } })] }).desinvesteringsbijtelling).toBe(560)
    expect(bijtelling({ activa: [camera(), laptop()] }).desinvesteringsbijtelling).toBe(560)
    const machine = laptop({ omschrijving: 'machine', aanschafdatum: '2018-01-01', aanschafwaarde: 9000, levensduurJaren: 10, investeringsaftrek: { regeling: 'kia', jaar: 2018, genotenPct: 0.28 } })
    expect(bijtelling({ activa: [camera(), machine] }).desinvesteringsbijtelling).toBe(560)
  })

  it('bestelbus uit 2019 en camera met KIA verkocht: drempel 7.000, bijtelling 28% × 2.000 = 560 (punt 18)', () => {
    const bus = laptop({ omschrijving: 'bestelbus', aanschafdatum: '2019-01-01', aanschafwaarde: 20000, levensduurJaren: 8, verkocht: { datum: '2026-05-01', verkoopprijs: 5000 } })
    const r = bijtelling({ activa: [camera(), bus] })
    expect(r.desinvesteringsbijtelling).toBe(560)
    expect(r.uitleg.find((u) => u.id.endsWith('.desinvestering'))?.formule).toBe('28% × 2.000')
  })

  it('overigeVerkopen telt mee voor de drempel; daaronder blijft het 0 met een uitleg over alle verkopen', () => {
    expect(bijtelling({ activa: [camera()], overigeVerkopen: 1000 }).desinvesteringsbijtelling).toBe(560)
    const onder = bijtelling({ activa: [camera()], overigeVerkopen: 500 })
    expect(onder.desinvesteringsbijtelling).toBe(0)
    expect(onder.uitleg.find((u) => u.id.endsWith('.desinvestering'))?.formule).toBe(
      'alle verkopen dit jaar samen 2.500 (waarvan 2.000 binnen de termijn met investeringsaftrek) niet boven de drempel van 2.900',
    )
    // Handmatige desinvesteringen buiten de termijn tellen ook mee.
    const r = berekenDesinvesteringsbijtelling(
      [
        { omschrijving: 'Camera', verkoopprijs: 2000, investeringsjaar: 2025, genotenPct: 0.28 },
        { omschrijving: 'Oude bus', verkoopprijs: 1000, investeringsjaar: 2015, genotenPct: 0.28 },
      ],
      { params: p26, jaar: 2026 },
    )
    expect(r.verkoopprijzen).toBe(3000)
    expect(r.bijtelling).toBe(560)
  })

  it('dubbele verkoop met een andere naam: herkend aan investeringsjaar en verkoopprijs, één keer, met een let-op (punt 17)', () => {
    const r = bijtelling({
      activa: [camera({ omschrijving: 'Camera met objectief', verkocht: { datum: '2026-05-01', verkoopprijs: 3500 } })],
      desinvesteringen: [{ omschrijving: 'Camera', verkoopprijs: 3500, investeringsjaar: 2025, genotenPct: 0.28 }],
    })
    expect(r.desinvesteringsbijtelling).toBe(980)
    const w = r.waarschuwingen.find((x) => x.id.endsWith('desinvestering.dubbelVermoed'))
    expect(w?.ernst).toBe('let-op')
    expect(w?.tekst).toContain('Camera met objectief')
  })

  it('elke handmatige regel hoort bij één actief: twee gelijke camera’s in het register en één in de lijst tellen twee keer', () => {
    const { desinvesteringen, waarschuwingen } = desinvesteringenUitActiva([camera(), camera()], [{ omschrijving: 'camera', verkoopprijs: 2000, investeringsjaar: 2025, genotenPct: 0.28 }], { jaar: 2026 })
    expect(desinvesteringen).toHaveLength(1)
    expect(waarschuwingen.filter((w) => w.id.endsWith('desinvestering.dubbel'))).toHaveLength(1)
  })

  it('een desinvestering zonder omschrijving laat de berekening niet vastlopen (punt 16)', () => {
    const zonder = { verkoopprijs: 3500, investeringsjaar: 2025, genotenPct: 0.28 } as unknown as DesinvesteringInvoer
    const r = bijtelling({ activa: [camera({ omschrijving: 'Camera met objectief', verkocht: { datum: '2026-05-01', verkoopprijs: 3500 } })], desinvesteringen: [zonder] })
    expect(r.desinvesteringsbijtelling).toBe(980)
    expect(r.waarschuwingen.find((x) => x.id.endsWith('dubbelVermoed'))?.tekst).toContain('een regel zonder omschrijving')
    expect(() => bijtelling({ desinvesteringen: [zonder] })).not.toThrow()
    expect(() => bijtelling({ activa: [camera({ omschrijving: undefined as unknown as string })], desinvesteringen: [zonder] })).not.toThrow()
  })
})
