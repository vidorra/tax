/**
 * Ronde 2 (A6): stakingslijfrente (art. 3.129, 3.130 lid 2, 10a.29 lid 13) en de Zvw-correctie. S1b, S1c en S5 uit
 * taak-A6.md als losse moduletests; de engine-variant staat in staking.spec.ts.
 */
import { describe, expect, it } from 'vitest'
import type { OndernemingResultaat, StakingUitkomst } from '../../types'
import { getJaar } from '../../years'
import { berekenStakingslijfrente, eerderAfgetrokkenUitHistorie, stakingslijfrenteCategorie } from '../../modules/stakingslijfrente'

const p = getJaar(2026)

const staking = (s: Partial<StakingUitkomst> = {}): StakingUitkomst => ({
  soort: 'geheel',
  basis: 25000,
  bijgeteld: 3000,
  forVrijval: 17460,
  reservesVrijval: 0,
  desinvesteringsbijtelling: 1680,
  totaal: 44140,
  stakingsaftrek: 3630,
  aangifte: { onroerendeZaken: 0, immaterieleActiva: 20000, overigeActiva: 5000, vrijvalOudedagsreserve: 17460, vrijvalOverigeReserves: 0, overigResultaat: 0, desinvesteringsbijtelling: 1680 },
  ...s,
})

const onderneming = (s: StakingUitkomst | undefined, forStand = 17460): OndernemingResultaat =>
  ({ naam: 'Ontwerpstudio', verplichteForAfname: s?.forVrijval ?? 0, forStandBegin: forStand, forVrijwilligeAfname: 0, staking: s }) as unknown as OndernemingResultaat

const ctx = (s: StakingUitkomst | undefined = staking()) => ({
  params: p,
  jaar: 2026,
  aowDatum: '2048-01-01',
  ondernemingen: [onderneming(s)],
  stakingsdatums: ['2026-07-01'],
  forOmzettingAftrek: 0,
})

describe('stakingslijfrente', () => {
  it('S1b: ruimte begrensd op de stakingswinst (44.140, niet 101.272); aftrek 30.000; Zvw-correctie 17.460', () => {
    const r = berekenStakingslijfrente({ premie: 30000, betaaldOp: '2027-05-15', eerderAfgetrokkenLijfrentepremies: 25000 }, ctx())
    expect(r.uitkomst).toEqual({ categorie: 'laag', maximum: 143732, voorzieningen: 42460, ruimte: 44140, premie: 30000, aftrek: 30000, uitFor: 17460, uitStakingswinst: 12540 })
    expect(r.zvwCorrectieFor).toBe(17460)
  })

  it('review bevinding 6: splitsing van de premie voor de aangifte; met een FOR-omzetting gaat die eerst uit de vrijval', () => {
    const r = berekenStakingslijfrente({ premie: 30000, eerderAfgetrokkenLijfrentepremies: 25000 }, { ...ctx(), forOmzettingAftrek: 10000 })
    expect(r.uitkomst).toMatchObject({ aftrek: 30000, uitFor: 7460, uitStakingswinst: 22540 })
    // De Zvw-correctie is de omzetting plus het deel uit de oudedagsreserve.
    expect(r.zvwCorrectieFor).toBe(10000 + 7460)
    // Zonder FOR-vrijval komt niets uit de oudedagsreserve.
    const zonder = berekenStakingslijfrente({ premie: 20000, eerderAfgetrokkenLijfrentepremies: 25000 }, { ...ctx(staking({ forVrijval: 0 })), ondernemingen: [onderneming(staking({ forVrijval: 0 }), 0)] })
    expect(zonder.uitkomst).toMatchObject({ uitFor: 0, uitStakingswinst: 20000 })
  })

  it('S1c: premie 5.000: aftrek en Zvw-correctie 5.000', () => {
    const r = berekenStakingslijfrente({ premie: 5000, eerderAfgetrokkenLijfrentepremies: 25000 }, ctx())
    expect(r.aftrek).toBe(5000)
    expect(r.zvwCorrectieFor).toBe(5000)
  })

  it('eerder afgetrokken premies standaard uit de historie, met de melding dat het een benadering is', () => {
    const historie = [
      { jaar: 2024, premiegrondslagInkomen: 50000, alGebruikt: 10000 },
      { jaar: 2025, premiegrondslagInkomen: 50000, alGebruikt: 15000 },
    ]
    expect(eerderAfgetrokkenUitHistorie(historie)).toBe(25000)
    const r = berekenStakingslijfrente({ premie: 30000 }, { ...ctx(), historie })
    expect(r.uitkomst!.voorzieningen).toBe(42460)
    expect(r.waarschuwingen.some((w) => w.id === 'stakingslijfrente.benadering')).toBe(true)
  })

  it('S5: categorie uit de AOW-datum: hoog binnen 5 jaar, midden binnen 15 jaar, anders laag', () => {
    expect(stakingslijfrenteCategorie('2030-06-01', '2026-07-01', p)).toBe('hoog')
    expect(stakingslijfrenteCategorie('2035-06-01', '2026-07-01', p)).toBe('midden')
    expect(stakingslijfrenteCategorie('2048-01-01', '2026-07-01', p)).toBe('laag')
  })

  it('premie later dan zes maanden na het stakingsjaar telt niet mee; meer dan de ruimte is niet aftrekbaar', () => {
    const laat = berekenStakingslijfrente({ premie: 30000, betaaldOp: '2027-07-01', eerderAfgetrokkenLijfrentepremies: 25000 }, ctx())
    expect(laat.aftrek).toBe(0)
    expect(laat.waarschuwingen.some((w) => w.id === 'stakingslijfrente.teLaat')).toBe(true)
    const teVeel = berekenStakingslijfrente({ premie: 50000, eerderAfgetrokkenLijfrentepremies: 25000 }, ctx())
    expect(teVeel.aftrek).toBe(44140)
    expect(teVeel.waarschuwingen.some((w) => w.id === 'stakingslijfrente.teVeel')).toBe(true)
  })

  it('zonder staking geen aftrek, met een melding als er toch een premie staat', () => {
    const r = berekenStakingslijfrente({ premie: 1000 }, { ...ctx(undefined), ondernemingen: [onderneming(undefined)] })
    expect(r.uitkomst).toBeNull()
    expect(r.aftrek).toBe(0)
    expect(r.zvwCorrectieFor).toBe(0)
    expect(r.waarschuwingen.some((w) => w.id === 'stakingslijfrente.geenStaking')).toBe(true)
  })

  it('geruisloze inbreng: geen stakingslijfrente, wel de Zvw-correctie over een FOR-omzetting', () => {
    const geruisloos = staking({ soort: 'geruisloosBV', basis: 0, forVrijval: 10000, totaal: 10000, desinvesteringsbijtelling: 0, bijgeteld: 0 })
    const r = berekenStakingslijfrente(undefined, { ...ctx(geruisloos), ondernemingen: [onderneming(geruisloos, 10000)], forOmzettingAftrek: 4000 })
    expect(r.uitkomst).toBeNull()
    expect(r.zvwCorrectieFor).toBe(4000)
  })
})
