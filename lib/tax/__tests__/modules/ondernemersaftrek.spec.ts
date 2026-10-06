import { describe, expect, it } from 'vitest'
import type { OndernemingInvoer, OndernemingResultaat, TaxYearParams } from '../../types'
import { getJaar, kloon } from '../../years'
import { berekenOnderneming } from '../../modules/onderneming'
import { berekenMkbVrijstelling, berekenOndernemersaftrek } from '../../modules/ondernemersaftrek'

function params2021(): TaxYearParams {
  const p = kloon(getJaar(2024))
  p.jaar = 2021
  p.ondernemer.waarde.zelfstandigenaftrek = 6670
  p.ondernemer.waarde.mkbWinstvrijstelling = 0.14
  return p
}

const onderneming = (o: Partial<OndernemingInvoer> = {}): OndernemingInvoer => ({
  naam: 'Meubelmakerij',
  winstberekening: { soort: 'saldo', saldo: 0 },
  uren: { onderneming: 1650 },
  startjaar: 2016,
  ...o,
})

/** Bereken eerst de onderneming, dan de ondernemersaftrek, zoals de engine dat doet. */
function reken(params: TaxYearParams, os: OndernemingInvoer[], extra: { aowBereikt?: boolean; nietBenut?: Array<{ jaar: number; bedrag: number }> } = {}) {
  const resultaten: OndernemingResultaat[] = os.map((o) =>
    berekenOnderneming(o, { params, jaar: params.jaar, aowBereikt: extra.aowBereikt ?? false, urenLoondienst: 0 }),
  )
  return berekenOndernemersaftrek({ ondernemingen: os, resultaten, nietBenut: extra.nietBenut }, { params, jaar: params.jaar, aowBereikt: extra.aowBereikt ?? false })
}

describe('voorbeeld: ondernemersaftrek en MKB-winstvrijstelling', () => {
  it('2024: 151.328 − 3.750 = 147.578, MKB 19.643, belastbare winst 127.935', () => {
    const p = getJaar(2024)
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 151328 } })])
    expect(r.zelfstandigenaftrek).toBe(3750)
    expect(r.totaal).toBe(3750)
    expect(r.nietBenutteZelfstandigenaftrekNieuw).toBe(0)
    const mkb = berekenMkbVrijstelling(151328 - r.totaal, p)
    expect(mkb.bedrag).toBe(19643)
    expect(151328 - r.totaal - mkb.bedrag).toBe(127935)
    expect(mkb.uitleg[0].formule).toBe('13,31% × 147.578')
  })

  it('2021: 97.320 − 6.670 = 90.650, MKB 14% = 12.691, belastbaar 77.959', () => {
    const p = params2021()
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 97320 } })])
    expect(r.zelfstandigenaftrek).toBe(6670)
    const mkb = berekenMkbVrijstelling(97320 - r.totaal, p)
    expect(mkb.bedrag).toBe(12691)
    expect(97320 - r.totaal - mkb.bedrag).toBe(77959)
  })
})

describe('zelfstandigenaftrek', () => {
  const p = getJaar(2024)
  it('niet-starter: maximaal de winst, rest wordt niet-benut', () => {
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 2000 } })])
    expect(r.zelfstandigenaftrek).toBe(2000)
    expect(r.nietBenutteZelfstandigenaftrekNieuw).toBe(1750)
  })

  it('starter: volledige zelfstandigen- en startersaftrek, ook boven de winst', () => {
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 2000 }, startjaar: 2023 })])
    expect(r.zelfstandigenaftrek).toBe(3750)
    expect(r.startersaftrek).toBe(2123)
    expect(r.nietBenutteZelfstandigenaftrekNieuw).toBe(0)
    expect(r.totaal).toBe(5873)
  })

  it('startersaftrek niet meer na drie keer of buiten vijf jaar', () => {
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 50000 }, startjaar: 2022, startersaftrekEerderGebruikt: 3 })]).startersaftrek).toBe(0)
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 50000 }, startjaar: 2019 })]).startersaftrek).toBe(0)
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 50000 }, startjaar: 2020 })]).startersaftrek).toBe(2123)
  })

  it('verrekent eerder niet-benutte aftrek, oudste eerst, en laat vervallen jaren liggen', () => {
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 10000 } })], {
      nietBenut: [
        { jaar: 2022, bedrag: 9000 },
        { jaar: 2014, bedrag: 500 },
        { jaar: 2020, bedrag: 1000 },
      ],
    })
    expect(r.verrekendNietBenut).toBe(6250)
    expect(r.totaal).toBe(10000)
    expect(r.waarschuwingen.some((w) => w.id === 'ondernemersaftrek.nietBenutVervallen')).toBe(true)
    const regels = r.uitleg.filter((u) => u.id === 'ondernemersaftrek.nietBenutVerrekend').map((u) => u.label)
    expect(regels).toEqual(['Niet-benutte zelfstandigenaftrek uit 2020', 'Niet-benutte zelfstandigenaftrek uit 2022'])
  })

  it('geeft het verloop per eerder jaar: verrekend, vervallen en wat doorschuift', () => {
    // Winst 4.500, zelfstandigenaftrek 3.750: ruimte 750. 2014 was al vervallen (tot en met 2023); 2015 is in zijn
    // laatste jaar, 750 wordt verrekend en 50 vervalt; 2020 en 2022 schuiven door.
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 4500 } })], {
      nietBenut: [
        { jaar: 2022, bedrag: 9000 },
        { jaar: 2014, bedrag: 500 },
        { jaar: 2020, bedrag: 1000 },
        { jaar: 2015, bedrag: 800 },
      ],
    })
    expect(r.verrekendNietBenut).toBe(750)
    expect(r.nietBenutOverzicht).toEqual([
      { jaar: 2014, begin: 500, verrekend: 0, vervallen: 500, rest: 0, laatsteJaar: 2023 },
      { jaar: 2015, begin: 800, verrekend: 750, vervallen: 50, rest: 0, laatsteJaar: 2024 },
      { jaar: 2020, begin: 1000, verrekend: 0, vervallen: 0, rest: 1000, laatsteJaar: 2029 },
      { jaar: 2022, begin: 9000, verrekend: 0, vervallen: 0, rest: 9000, laatsteJaar: 2031 },
    ])
    const tekst = (id: string) => r.waarschuwingen.find((w) => w.id === id)?.tekst
    expect(tekst('ondernemersaftrek.nietBenutVervallen')).toBe('Niet-benutte zelfstandigenaftrek uit 2014 (€ 500) is vervallen: verrekenen kan tot 9 jaar na het jaar waarin die is ontstaan.')
    expect(tekst('ondernemersaftrek.nietBenutVervaltDitJaar')).toBe(
      'Niet-benutte zelfstandigenaftrek uit 2015: € 50 is dit jaar niet verrekend en vervalt, want dit was het laatste jaar om die te verrekenen.',
    )
  })

  it('zonder urencriterium: niets verrekend, het laatste jaar vervalt helemaal', () => {
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 50000 }, uren: { onderneming: 1000 } })], { nietBenut: [{ jaar: 2015, bedrag: 800 }] })
    expect(r.nietBenutOverzicht).toEqual([{ jaar: 2015, begin: 800, verrekend: 0, vervallen: 800, rest: 0, laatsteJaar: 2024 }])
  })

  it('halveert bij AOW-leeftijd en vervalt zonder urencriterium', () => {
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 50000 } })], { aowBereikt: true }).zelfstandigenaftrek).toBe(1875)
    const zonder = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 50000 }, uren: { onderneming: 1000 } })])
    expect(zonder.totaal).toBe(0)
  })

  it('urencriterium over twee ondernemingen samen', () => {
    const r = reken(p, [
      onderneming({ naam: 'Meubelmakerij', winstberekening: { soort: 'saldo', saldo: 30000 }, uren: { onderneming: 700 } }),
      onderneming({ naam: 'Fotografie', winstberekening: { soort: 'saldo', saldo: 10000 }, uren: { onderneming: 600 } }),
    ])
    expect(r.zelfstandigenaftrek).toBe(3750)
  })
})

describe('overige onderdelen', () => {
  const p = getJaar(2024)
  it('startersaftrek bij arbeidsongeschiktheid volgens de staffel, zonder zelfstandigenaftrek', () => {
    const r = reken(p, [
      onderneming({ winstberekening: { soort: 'saldo', saldo: 20000 }, uren: { onderneming: 900 }, startjaar: 2023, arbeidsongeschiktStarter: { jaarNummer: 2 } }),
    ])
    expect(r.startersaftrekAO).toBe(8000)
    expect(r.zelfstandigenaftrek).toBe(0)
    expect(r.startersaftrek).toBe(0)
  })

  it('S&O-aftrek vanaf 500 uur, met extra voor starters', () => {
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 60000 }, soUren: 600 })]).soAftrek).toBe(15551)
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 60000 }, soUren: 600, startjaar: 2023 })]).soAftrek).toBe(15551 + 7781)
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 60000 }, soUren: 400 })]).soAftrek).toBe(0)
  })

  it('meewerkaftrek volgens de staffel; arbeidsbeloning vanaf de vergoedingsgrens', () => {
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 151328 }, meewerkendePartner: { uren: 900, vergoeding: 0 } })])
    expect(r.meewerkaftrek).toBe(3027) // 2% × 151.328 = 3.026,6
    const beloning = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 151328 }, meewerkendePartner: { uren: 900, vergoeding: 6000 } })])
    expect(beloning.meewerkaftrek).toBe(0)
    expect(beloning.waarschuwingen.some((w) => w.id === 'ondernemersaftrek.arbeidsbeloning')).toBe(true)
  })

  it('stakingsaftrek maximaal de stakingswinst en eenmalig', () => {
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 40000 }, staking: { stakingswinst: 2000 } })]).stakingsaftrek).toBe(2000)
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 40000 }, staking: { stakingswinst: 20000 } })]).stakingsaftrek).toBe(3630)
    expect(reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 40000 }, staking: { stakingswinst: 20000, stakingsaftrekEerderGebruikt: true } })]).stakingsaftrek).toBe(0)
  })

  it('MKB-winstvrijstelling ook bij verlies (verkleint het verlies)', () => {
    expect(berekenMkbVrijstelling(-10000, p).bedrag).toBe(-1331)
    expect(Object.is(berekenMkbVrijstelling(0, p).bedrag, 0)).toBe(true)
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const r = reken(p, [onderneming({ winstberekening: { soort: 'saldo', saldo: 2000 }, soUren: 600, meewerkendePartner: { uren: 900, vergoeding: 0 } })])
    const tekst = [...r.uitleg.flatMap((u) => [u.label, u.formule ?? '']), ...r.waarschuwingen.map((w) => w.tekst)].join('\n')
    expect(tekst).not.toMatch(/[—→]/)
  })
})
