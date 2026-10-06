/**
 * Ronde 2 (A6): controles van de regelingen van de onderneming (lib/controles/regels/regelingen-onderneming.ts).
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HerinvesteringsreserveInvoer, HuishoudenInvoer, OndernemingInvoer, PersoonInvoer } from '@/lib/tax/types'
import { controleer } from '../index'
import { regelingenOnderneming } from '../regels/regelingen-onderneming'
import { REGELS } from '../regels'
import type { ControleContext } from '../types'

const hir = (r: Partial<HerinvesteringsreserveInvoer> = {}): HerinvesteringsreserveInvoer => ({
  id: 'hir-2026-1',
  ontstaanJaar: 2026,
  bedragOntstaan: 12000,
  standBegin: 12000,
  herkomst: { omschrijving: 'Bus', opbrengst: 20000, boekwaardeOud: 8000, langlopend: false },
  voornemen: true,
  ...r,
})

function hh(jaar: number, o: Partial<OndernemingInvoer>, p: Partial<PersoonInvoer> = {}): HuishoudenInvoer {
  return {
    jaar,
    personen: [
      {
        id: 'A',
        naam: 'Persoon A',
        geboortedatum: '1981-01-01',
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
        ondernemingen: [{ id: 'ond-1', naam: 'Ontwerpstudio', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 1600 }, startjaar: 2010, ...o }],
        ...p,
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

const ctx = (invoer: HuishoudenInvoer): ControleContext => ({
  jaar: invoer.jaar,
  invoer,
  resultaat: berekenHuishouden(invoer, { zonderMarginaleDruk: true }),
  params: getJaar(invoer.jaar),
  status: 'concept',
  vandaag: '2026-10-05',
})

const regels = (invoer: HuishoudenInvoer) => regelingenOnderneming(ctx(invoer))

describe('controles regelingen onderneming', () => {
  it('staat in het register van alle regels', () => {
    expect(REGELS).toContain(regelingenOnderneming)
  })

  it('zonder regelingen: niets', () => {
    expect(regels(hh(2026, {}))).toEqual([])
  })

  it('H9: hir-afboeking (fout, met reden) met vingerafdruk afboeking=7000|max=5000 en een oplossing', () => {
    const invoer = hh(2027, {
      investeringen: [{ id: 'inv-1', omschrijving: 'Machine', datum: '2027-02-01', bedrag: 13000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 7000 } }],
      herinvesteringsreserves: [hir()],
    })
    const c = regels(invoer).find((x) => x.regel === 'hir-afboeking')!
    expect(c).toMatchObject({ id: 'hir-afboeking:A:ond-1:hir-2026-1', ernst: 'fout', negeren: 'met-reden', vingerafdruk: 'afboeking=7000|max=5000' })
    expect(c.veld).toBe('persoon:A/onderneming:ond-1/investering:inv-1/herinvesteringsreserve.afboeking')
    const kopie = JSON.parse(JSON.stringify(invoer)) as HuishoudenInvoer
    c.oplossing!.pas!(kopie)
    expect(kopie.personen[0].ondernemingen[0].investeringen![0].herinvesteringsreserve!.afboeking).toBe(5000)
    expect(regels(kopie).some((x) => x.regel === 'hir-afboeking')).toBe(false)
  })

  it('H6: hir-functie bij een nieuw pand zonder dezelfde functie; met dezelfde functie niet', () => {
    const pand = (zelfdeFunctie?: boolean) =>
      hh(2027, {
        investeringen: [{ id: 'inv-1', omschrijving: 'Bedrijfspand', datum: '2027-03-01', bedrag: 300000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 500, nieuwLanglopend: true, ...(zelfdeFunctie ? { zelfdeFunctie } : {}) } }],
        herinvesteringsreserves: [hir({ standBegin: 500, bedragOntstaan: 500, herkomst: { omschrijving: 'Laptop', boekwaardeOud: 300, langlopend: false } })],
      })
    const c = regels(pand()).find((x) => x.regel === 'hir-functie')!
    expect(c).toMatchObject({ ernst: 'fout', negeren: 'met-reden', veld: 'persoon:A/onderneming:ond-1/investering:inv-1/herinvesteringsreserve.zelfdeFunctie' })
    expect(regels(pand(true)).some((x) => x.regel === 'hir-functie')).toBe(false)
  })

  it('H4: hir-boekwinst met een oplossing naar de boekwinst', () => {
    const invoer = hh(2026, { herinvesteringsreserves: [hir({ standBegin: 0, bedragOntstaan: 8000, herkomst: { omschrijving: 'Inventaris', opbrengst: 10000, boekwaardeOud: 6000, langlopend: false } })] })
    const c = regels(invoer).find((x) => x.regel === 'hir-boekwinst')!
    expect(c).toMatchObject({ ernst: 'fout', negeren: 'met-reden', vingerafdruk: 'gevraagd=8000|boekwinst=4000', veld: 'persoon:A/onderneming:ond-1/herinvesteringsreserve:hir-2026-1/bedragOntstaan' })
  })

  it('H3: hir-vervalt in het laatste jaar (let op); hir-verlengd bij een verlengde termijn', () => {
    // 2028 met een reserve uit 2025: laatste jaar.
    const c = regels(hh(2028, { herinvesteringsreserves: [hir({ id: 'hir-2025-1', ontstaanJaar: 2025 })] }))
    expect(c.find((x) => x.regel === 'hir-vervalt')).toMatchObject({ ernst: 'let-op', negeren: 'gezien', vingerafdruk: 'vrijval=12000' })
    const v = regels(hh(2027, { herinvesteringsreserves: [hir({ termijnVerlengdTot: 2031 })] }))
    expect(v.find((x) => x.regel === 'hir-verlengd')).toMatchObject({ ernst: 'let-op', vingerafdruk: 'tot=2031' })
  })

  it('staking: datum (fout, niet te negeren), eerder genoten (let op), uren (info)', () => {
    const c = regels(hh(2026, { uren: { onderneming: 900 }, staking: { soort: 'geheel', stakingswinst: 20000 } }, { genotenStakingsaftrek: 2000 }))
    expect(c.find((x) => x.regel === 'staking-datum')).toMatchObject({ ernst: 'fout', negeren: 'nee', veld: 'persoon:A/onderneming:ond-1/staking.datum' })
    expect(c.find((x) => x.regel === 'staking-eerder')).toMatchObject({ ernst: 'let-op', vingerafdruk: 'eerder=2000' })
    const uren = c.find((x) => x.regel === 'staking-uren')!
    expect(uren.ernst).toBe('info')
    expect(uren.uitleg).toContain('900 van 1.225 uur')
    const goed = regels(hh(2026, { staking: { soort: 'geheel', datum: '2026-07-01', stakingswinst: 20000 } }))
    expect(goed.map((x) => x.regel)).toEqual([])
  })

  it('youngtimer-dagwaarde (fout, nee) en auto-btw (let op)', () => {
    const c = regels(hh(2026, { auto: { cataloguswaarde: 45000, datumEersteToelating: '2009-03-01', nulEmissie: false, autokosten: 5500 } }))
    expect(c.find((x) => x.regel === 'youngtimer-dagwaarde')).toMatchObject({ ernst: 'fout', negeren: 'nee', veld: 'persoon:A/onderneming:ond-1/auto.dagwaarde' })
    expect(c.find((x) => x.regel === 'auto-btw')).toMatchObject({ ernst: 'let-op', negeren: 'gezien' })
    const nieuw = regels(hh(2026, { auto: { cataloguswaarde: 45000, datumEersteToelating: '2024-03-01', nulEmissie: false, autokosten: 5500, btw: { aftrekBijAanschaf: true, methode: 'forfait' } } }))
    expect(nieuw).toEqual([])
  })

  it('stakingslijfrente-max (let op) als de premie boven de ruimte ligt', () => {
    const c = regels(
      hh(2026, { for: { stand: 1000 }, staking: { soort: 'geheel', datum: '2026-07-01', stakingswinst: 5000 } }, { inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, stakingslijfrente: { premie: 9000, eerderAfgetrokkenLijfrentepremies: 0 } } }),
    )
    expect(c.find((x) => x.regel === 'stakingslijfrente-max')).toMatchObject({ ernst: 'let-op', gebied: 'pensioen', veld: 'persoon:A/inkomensvoorziening.stakingslijfrente.premie', vingerafdruk: 'premie=9000|ruimte=6000' })
  })

  it('werkt ook zonder berekening (alleen de regels op de invoer)', () => {
    const invoer = hh(2026, { staking: { soort: 'geheel', stakingswinst: 1 }, auto: { cataloguswaarde: 1, datumEersteToelating: '2024-01-01', nulEmissie: false, autokosten: 0 } })
    const c = regelingenOnderneming({ ...ctx(invoer), resultaat: null })
    expect(c.map((x) => x.regel).sort()).toEqual(['auto-btw', 'staking-datum'])
    expect(controleer({ ...ctx(invoer), resultaat: null }).telling.fouten).toBe(1)
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const c = regels(
      hh(2027, {
        uren: { onderneming: 900 },
        staking: { soort: 'geheel', stakingswinst: 1 },
        auto: { cataloguswaarde: 45000, datumEersteToelating: '2009-03-01', nulEmissie: false, autokosten: 5500 },
        investeringen: [{ id: 'inv-1', omschrijving: 'Machine', datum: '2027-02-01', bedrag: 13000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 7000 } }],
        herinvesteringsreserves: [hir({ termijnVerlengdTot: 2031 })],
      }),
    )
    expect(c.length).toBeGreaterThan(3)
    expect(c.map((x) => `${x.titel} ${x.uitleg}`).join('\n')).not.toMatch(/[—→]/)
  })
})
