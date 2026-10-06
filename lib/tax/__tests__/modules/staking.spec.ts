/**
 * Ronde 2 (A6): staking. Testgevallen S1 tot en met S6 uit taak-A6.md (hoofdstuk 6), via de hele engine.
 *
 * S1: Persoon A, 45 jaar, stopt 1-7-2026. Lopende winst 30.000; goodwill 20.000; inventaris verkocht voor 6.000
 * (boekwaarde 4.000, gekocht in 2024 voor 8.000 met 28% KIA); auto naar privé, waarde 12.000 (boekwaarde 9.000);
 * FOR 17.460; 900 uur. Uit de boekhouding staan de lopende winst, de goodwill en de boekwinst op de inventaris in het
 * saldo (52.000); de overgang van de auto naar privé niet (die telt de engine erbij).
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, OndernemingInvoer, PersoonInvoer, StakingInvoer } from '../../types'
import { berekenHuishouden } from '../../engine'
import { getJaar } from '../../years'
import { berekenOnderneming } from '../../modules/onderneming'

const S1_STAKING: StakingInvoer = {
  soort: 'geheel',
  datum: '2026-07-01',
  stakingswinst: 25000,
  goodwill: 20000,
  posten: [
    { soort: 'overigeActiva', omschrijving: 'Inventaris', waardeOfOpbrengst: 6000, fiscaleBoekwaarde: 4000 },
    { soort: 'overigeActiva', omschrijving: 'Auto naar privé', waardeOfOpbrengst: 12000, fiscaleBoekwaarde: 9000, naarPrive: true },
  ],
}

const s1Onderneming = (o: Partial<OndernemingInvoer> = {}): OndernemingInvoer => ({
  id: 'ond-1',
  naam: 'Ontwerpstudio',
  winstberekening: { soort: 'saldo', saldo: 52000 },
  uren: { onderneming: 900 },
  startjaar: 2010,
  for: { stand: 17460 },
  desinvesteringen: [{ omschrijving: 'Inventaris', verkoopprijs: 6000, investeringsjaar: 2024, genotenPct: 0.28, genotenAftrek: 2240 }],
  staking: S1_STAKING,
  ...o,
})

const persoon = (p: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id: 'A',
  naam: 'Persoon A',
  geboortedatum: '1981-01-01',
  ondernemingen: [s1Onderneming()],
  loon: [],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...p,
})

const huishouden = (p: PersoonInvoer, jaar = 2026): HuishoudenInvoer => ({
  jaar,
  personen: [p],
  fiscaalPartner: false,
  kinderen: [],
  box3: { posities: [], schulden: [] },
  verdeling: 'optimaal',
})

const reken = (p: PersoonInvoer) => berekenHuishouden(huishouden(p), { zonderMarginaleDruk: true }).personen[0]

describe('staking (S1-S6)', () => {
  it('S1: stakingswinst 44.140, stakingsaftrek 3.630, geen zelfstandigenaftrek, belastbare winst 61.555', () => {
    const r = reken(persoon())
    const o = r.ondernemingen[0]
    const s = o.staking!
    expect(s.basis).toBe(25000)
    expect(s.bijgeteld).toBe(3000)
    expect(s.forVrijval).toBe(17460)
    expect(s.desinvesteringsbijtelling).toBe(1680)
    expect(s.reservesVrijval).toBe(0)
    expect(s.totaal).toBe(44140)
    expect(s.stakingsaftrek).toBe(3630)
    expect(o.winst).toBe(74140)
    expect(r.ondernemersaftrek.zelfstandigenaftrek).toBe(0)
    expect(r.ondernemersaftrek.stakingsaftrek).toBe(3630)
    expect(r.mkbVrijstelling).toBe(Math.round(0.127 * 70510))
    expect(r.belastbareWinst).toBe(61555)
    expect(s.aangifte).toEqual({
      onroerendeZaken: 0,
      immaterieleActiva: 20000,
      overigeActiva: 5000,
      vrijvalOudedagsreserve: 17460,
      vrijvalOverigeReserves: 0,
      overigResultaat: 0,
      desinvesteringsbijtelling: 1680,
    })
  })

  it('S1b: ruimte stakingslijfrente min(44.140, 143.732 − 42.460) = 44.140; aftrek 30.000; Zvw 17.460 lager', () => {
    const zonder = reken(persoon())
    const r = reken(
      persoon({ inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, stakingslijfrente: { premie: 30000, betaaldOp: '2027-05-15', eerderAfgetrokkenLijfrentepremies: 25000 } } }),
    )
    const sl = r.inkomensvoorziening.stakingslijfrente!
    expect(sl.categorie).toBe('laag')
    expect(sl.maximum).toBe(143732)
    expect(sl.voorzieningen).toBe(42460)
    expect(sl.ruimte).toBe(44140)
    expect(sl.aftrek).toBe(30000)
    expect(r.inkomensvoorziening.totaal).toBe(30000)
    expect(r.zvwCorrectieFor).toBe(17460)
    expect(zonder.zvwCorrectieFor).toBeUndefined()
    expect((zonder.zvw.inkomenVoorMaximum ?? 0) - (r.zvw.inkomenVoorMaximum ?? 0)).toBe(17460)
    expect(r.zvw.uitleg.length + r.uitleg.filter((u) => u.id === 'zvw-correctie-for').length).toBeGreaterThan(0)
    expect(r.uitleg.find((u) => u.id === 'zvw-correctie-for')?.label).toBe('Aftrekbare lijfrentepremies voor ondernemers vanwege een afname van de oudedagsreserve bij staking')
    // De stakingslijfrente gaat af van box 1, niet van de belastbare winst.
    expect(r.belastbareWinst).toBe(zonder.belastbareWinst)
    expect(r.box1.inkomen).toBe(zonder.box1.inkomen - 30000)
  })

  it('S1c: premie 5.000: aftrek 5.000 en Zvw-correctie 5.000', () => {
    const r = reken(persoon({ inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, stakingslijfrente: { premie: 5000, eerderAfgetrokkenLijfrentepremies: 25000 } } }))
    expect(r.inkomensvoorziening.stakingslijfrente!.aftrek).toBe(5000)
    expect(r.zvwCorrectieFor).toBe(5000)
  })

  it('S1d: één bedrag 25.000 zonder posten (de verkoop staat in het register): zelfde totaal 44.140', () => {
    const r = reken(persoon({ ondernemingen: [s1Onderneming({ winstberekening: { soort: 'saldo', saldo: 55000 }, staking: { soort: 'geheel', datum: '2026-07-01', stakingswinst: 25000 } })] }))
    const s = r.ondernemingen[0].staking!
    expect(s.basis).toBe(25000)
    expect(s.bijgeteld).toBe(0)
    expect(s.totaal).toBe(44140)
    expect(s.aangifte.overigResultaat).toBe(25000)
    expect(r.ondernemingen[0].winst).toBe(74140)
  })

  it('S1e: één bedrag dat niet in het saldo zit (stakingswinstInSaldo nee): de engine telt het erbij, zelfde winst', () => {
    const r = reken(persoon({ ondernemingen: [s1Onderneming({ winstberekening: { soort: 'saldo', saldo: 30000 }, staking: { soort: 'geheel', datum: '2026-07-01', stakingswinst: 25000, stakingswinstInSaldo: false } })] }))
    const s = r.ondernemingen[0].staking!
    expect(s.basis).toBe(25000)
    expect(s.bijgeteld).toBe(25000)
    expect(s.totaal).toBe(44140)
    expect(r.ondernemingen[0].winst).toBe(74140)
    // Uit een fiscaal rapport zit het er standaard in (zoals een stakingspost), tenzij expliciet nee.
    const rapport = reken(persoon({ ondernemingen: [s1Onderneming({ winstBron: 'fiscaal-rapport', winstberekening: { soort: 'saldo', saldo: 55000 }, staking: { soort: 'geheel', datum: '2026-07-01', stakingswinst: 25000 } })] }))
    expect(rapport.ondernemingen[0].staking!.bijgeteld).toBe(0)
    expect(rapport.ondernemingen[0].winst).toBe(74140)
  })

  it('S2: in eerdere jaren al 2.000 stakingsaftrek genoten (doorrol): stakingsaftrek 1.630', () => {
    const r = reken(persoon({ genotenStakingsaftrek: 2000 }))
    expect(r.ondernemingen[0].staking!.stakingsaftrek).toBe(1630)
    expect(r.ondernemingen[0].staking!.eerderGenoten).toBe(2000)
    expect(r.ondernemersaftrek.stakingsaftrek).toBe(1630)
    // Het bedrag bij de staking gaat voor.
    const s = reken(persoon({ genotenStakingsaftrek: 2000, ondernemingen: [s1Onderneming({ staking: { ...S1_STAKING, eerderGenotenStakingsaftrek: 3000 } })] }))
    expect(s.ondernemersaftrek.stakingsaftrek).toBe(630)
    // Het oude veld zonder bedrag: aangenomen dat alles is genoten, met een melding.
    const oud = reken(persoon({ ondernemingen: [s1Onderneming({ staking: { ...S1_STAKING, stakingsaftrekEerderGebruikt: true } })] }))
    expect(oud.ondernemersaftrek.stakingsaftrek).toBe(0)
    expect(oud.ondernemingen[0].staking!.eerderAangenomen).toBe(true)
    expect(oud.waarschuwingen.some((w) => w.id.endsWith('.staking.eerderAangenomen'))).toBe(true)
  })

  it('S3: geruisloos naar een BV: basis 0, FOR-vrijval 10.000 met stakingsaftrek, HIR blijft, melding', () => {
    const o = berekenOnderneming(
      {
        id: 'ond-1',
        naam: 'Studio B',
        winstberekening: { soort: 'saldo', saldo: 40000 },
        uren: { onderneming: 1600 },
        startjaar: 2015,
        for: { stand: 10000 },
        staking: { soort: 'geruisloosBV', datum: '2026-12-31', stakingswinst: 0 },
        herinvesteringsreserves: [{ id: 'hir-2025-1', ontstaanJaar: 2025, bedragOntstaan: 5000, standBegin: 5000, herkomst: { omschrijving: 'Machine', boekwaardeOud: 1000, langlopend: false }, voornemen: true }],
      },
      { params: getJaar(2026), jaar: 2026, aowBereikt: false, urenLoondienst: 0 },
    )
    const s = o.staking!
    expect(s.basis).toBe(0)
    expect(s.forVrijval).toBe(10000)
    expect(s.reservesVrijval).toBe(0)
    expect(s.desinvesteringsbijtelling).toBe(0)
    expect(s.totaal).toBe(10000)
    expect(s.stakingsaftrek).toBe(3630)
    expect(o.herinvesteringsreserves![0].standEind).toBe(5000)
    expect(o.herinvesteringsreserves![0].vrijval).toBe(0)
    expect(o.winst).toBe(50000)
    expect(o.waarschuwingen.some((w) => w.id.endsWith('.staking.geruisloos') && w.tekst.includes('adviseur'))).toBe(true)
  })

  it('S4: gedeeltelijke staking, FOR 17.460, ondernemingsvermogen eind 12.000: vrijval 5.460, geen stakingsaftrek', () => {
    const r = reken(persoon({ ondernemingen: [s1Onderneming({ for: { stand: 17460, ondernemingsvermogenEinde: 12000 }, desinvesteringen: undefined, staking: { soort: 'gedeeltelijk', stakingswinst: 0 } })] }))
    const s = r.ondernemingen[0].staking!
    expect(s.forVrijval).toBe(5460)
    expect(s.stakingsaftrek).toBe(0)
    expect(r.ondernemersaftrek.stakingsaftrek).toBe(0)
  })

  it('S5: 63 jaar bij staking, AOW-leeftijd 67 jaar en 3 maanden: categorie hoog (574.867)', () => {
    // Geboren 1963-03-01; AOW 67 jaar en 3 maanden: 1-6-2030, binnen vijf jaar na de staking op 1-7-2026.
    const p = getJaar(2026)
    const pk = { ...p, overig: { ...p.overig, waarde: { ...p.overig.waarde, aowLeeftijd: { jaren: 67, maanden: 3 } } } }
    const r = berekenHuishouden(
      huishouden(persoon({ geboortedatum: '1963-03-01', inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, stakingslijfrente: { premie: 1000 } } })),
      { params: pk, zonderMarginaleDruk: true },
    ).personen[0]
    expect(r.inkomensvoorziening.stakingslijfrente!.categorie).toBe('hoog')
    expect(r.inkomensvoorziening.stakingslijfrente!.maximum).toBe(574867)
  })

  it('S6: doorschuiving: FOR-vrijval 10.000, reserves blijven, geen stakingsaftrek, melding', () => {
    const o = berekenOnderneming(
      {
        id: 'ond-1',
        naam: 'Studio',
        winstberekening: { soort: 'saldo', saldo: 40000 },
        uren: { onderneming: 1600 },
        startjaar: 2015,
        for: { stand: 10000 },
        staking: { soort: 'doorschuiving', stakingswinst: 0 },
        herinvesteringsreserves: [{ id: 'hir-2025-1', ontstaanJaar: 2025, bedragOntstaan: 5000, standBegin: 5000, herkomst: { omschrijving: 'Machine', boekwaardeOud: 1000, langlopend: false }, voornemen: true }],
      },
      { params: getJaar(2026), jaar: 2026, aowBereikt: false, urenLoondienst: 0 },
    )
    expect(o.staking!.forVrijval).toBe(10000)
    expect(o.staking!.stakingsaftrek).toBe(0)
    expect(o.herinvesteringsreserves![0].standEind).toBe(5000)
    expect(o.waarschuwingen.some((w) => w.id.endsWith('.staking.doorschuiving'))).toBe(true)
  })

  it('meewerkaftrek zonder stakingswinst (art. 3.78 lid 3)', () => {
    const r = reken(persoon({ ondernemingen: [s1Onderneming({ uren: { onderneming: 1600 }, meewerkendePartner: { uren: 900, vergoeding: 0 } })] }))
    // 2% (875 uur of meer) over de winst zonder stakingswinst: 74.140 − 44.140 = 30.000.
    expect(r.ondernemersaftrek.meewerkaftrek).toBe(600)
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const r = reken(persoon({ inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, stakingslijfrente: { premie: 30000, betaaldOp: '2027-09-15' } } }))
    const tekst = [...r.uitleg.flatMap((u) => [u.label, u.formule ?? '']), ...r.waarschuwingen.map((w) => w.tekst)].join('\n')
    expect(tekst).not.toMatch(/[—→]/)
    expect(r.waarschuwingen.some((w) => w.id === 'stakingslijfrente.teLaat')).toBe(true)
  })
})
