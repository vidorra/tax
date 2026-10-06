/**
 * Ronde 2 (A5): de terugvraaglijst (Planning), wat over de jaren openstaat (overzicht) en de controles op de
 * bronbelasting en de partnerregeling.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer, PersoonInvoer, VermogensPositie } from '@/lib/tax/types'
import { controleer } from '@/lib/controles'
import type { ControleContext } from '@/lib/controles/types'
import { LEGE_STAAT, type AangifteStaat } from '../aangiftestaat'
import { openTerugvragen, plusMaanden, terugvraagLijst } from '../terugvragen'

const pers = (id: 'A' | 'B', extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id,
  geboortedatum: '1985-05-05',
  ondernemingen: [],
  loon: [],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...extra,
})

const degiro = (extra: Partial<VermogensPositie> = {}): VermogensPositie => ({
  id: 'degiro',
  omschrijving: 'DEGIRO',
  categorie: 'beleggingen',
  eigenaar: 'A',
  waardeBegin: 150000,
  bronbelastingen: [
    { id: 'bb-us', land: 'US', soort: 'dividend', brutoInkomsten: 2000, bedrag: 300 },
    { id: 'bb-ch', land: 'CH', soort: 'dividend', brutoInkomsten: 5000, bedrag: 1750 },
    { id: 'bb-fr', land: 'FR', soort: 'dividend', brutoInkomsten: 100, bedrag: 25 },
  ],
  ...extra,
})

const invoer = (jaar: number, posities: VermogensPositie[], personen: PersoonInvoer[] = [pers('A')]): HuishoudenInvoer => ({
  jaar,
  personen,
  fiscaalPartner: personen.length === 2,
  kinderen: [],
  box3: { posities, schulden: [] },
  verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
})

const regels = (i: HuishoudenInvoer) => berekenHuishouden(i, { zonderMarginaleDruk: true }).box3.bronbelastingRegels ?? []

const ctx = (i: HuishoudenInvoer, vandaag: string, staat: AangifteStaat = LEGE_STAAT): ControleContext => ({
  jaar: i.jaar,
  invoer: i,
  resultaat: berekenHuishouden(i, { zonderMarginaleDruk: true }),
  params: getJaar(i.jaar),
  status: 'concept',
  staat,
  vandaag,
})

describe('terugvraaglijst', () => {
  it('alleen regels met iets terug te vragen; FR 25 op 100 geeft 10, klein bedrag en daarom achteraan', () => {
    const i = invoer(2026, [degiro()])
    const lijst = terugvraagLijst(i, regels(i), null, '2027-03-01')
    expect(lijst.map((x) => [x.land, x.bedrag, x.uiterlijk, x.klein])).toEqual([
      ['CH', 1000, '2029-12-31', false],
      ['FR', 10, '2028-12-31', true],
    ])
    expect(lijst[0]).toMatchObject({ sleutel: 'degiro/bb-ch', status: 'open', positieNaam: 'DEGIRO', landNaam: 'Zwitserland' })
  })

  it('open regels die binnen zes maanden verlopen, staan bovenaan; een status uit de staat telt', () => {
    const i = invoer(2026, [degiro()])
    const lijst = terugvraagLijst(i, regels(i), null, '2029-08-01')
    expect(lijst[0]).toMatchObject({ land: 'CH', binnenkort: true })
    expect(lijst.find((x) => x.land === 'FR')).toMatchObject({ verlopen: true, binnenkort: false })
    const staat: AangifteStaat = { versie: 1, terugvragen: { 'degiro/bb-ch': { status: 'aangevraagd', op: '2029-07-01T10:00:00.000Z' } } }
    const met = terugvraagLijst(i, regels(i), staat, '2029-08-01')
    expect(met.find((x) => x.land === 'CH')).toMatchObject({ status: 'aangevraagd', binnenkort: false })
  })

  it('zonder datum (VS met 30% ingehouden): termijn nakijken, achteraan', () => {
    const i = invoer(2026, [degiro({ bronbelastingen: [{ id: 'bb-us', land: 'US', soort: 'dividend', brutoInkomsten: 1000, bedrag: 300 }, { id: 'bb-ch', land: 'CH', soort: 'dividend', brutoInkomsten: 1000, bedrag: 350 }] })])
    const lijst = terugvraagLijst(i, regels(i), null, '2027-01-01')
    expect(lijst.map((x) => [x.land, x.uiterlijk])).toEqual([
      ['CH', '2029-12-31'],
      ['US', null],
    ])
    expect(lijst[1].procedure).toContain('W-8BEN')
  })

  it('over de jaren: aantal, bedrag en de eerste termijn; kleine bedragen tellen niet mee', () => {
    const a = invoer(2025, [degiro()])
    const b = invoer(2026, [degiro()])
    const vandaag = '2026-10-05'
    const open = openTerugvragen([terugvraagLijst(a, regels(a), null, vandaag), terugvraagLijst(b, regels(b), { versie: 1, terugvragen: { 'degiro/bb-ch': { status: 'ontvangen', op: '2026-10-01T00:00:00.000Z' } } }, vandaag)])
    expect(open).toEqual({ aantal: 1, bedrag: 1000, eerste: { datum: '2028-12-31', landNaam: 'Zwitserland', jaar: 2025 }, jaar: 2025 })
    expect(openTerugvragen([])).toEqual({ aantal: 0, bedrag: 0, eerste: null, jaar: null })
  })

  it('een klein bedrag staat niet bovenaan en geeft geen let op over de termijn', () => {
    const i = invoer(2026, [degiro()])
    const lijst = terugvraagLijst(i, regels(i), null, '2028-08-01')
    expect(lijst.find((x) => x.land === 'FR')).toMatchObject({ klein: true, binnenkort: false })
    expect(controleer(ctx(i, '2028-08-01')).alle.some((c) => c.regel === 'bron-termijn')).toBe(false)
  })

  it('plusMaanden houdt de laatste dag van de maand', () => {
    expect(plusMaanden('2026-08-31', 6)).toBe('2027-02-28')
    expect(plusMaanden('2026-10-05', 6)).toBe('2027-04-05')
  })
})

describe('controles bronbelasting', () => {
  it('bron-land (fout, niet te negeren) en bron-bruto (fout) op de veld-id van de regel', () => {
    const i = invoer(2026, [degiro({ bronbelastingen: [{ id: 'bb-1', land: '', soort: 'dividend', brutoInkomsten: 0, bedrag: 30 }] })])
    const u = controleer(ctx(i, '2026-10-05'))
    const land = u.alle.find((c) => c.regel === 'bron-land')
    expect(land).toMatchObject({ ernst: 'fout', negeren: 'nee', veld: 'box3/positie:degiro/bronbelasting:bb-1/land', id: 'bron-land:degiro:bb-1' })
    expect(u.alle.find((c) => c.regel === 'bron-bruto')).toMatchObject({ ernst: 'fout', negeren: 'nee', veld: 'box3/positie:degiro/bronbelasting:bb-1/brutoInkomsten' })
  })

  it('BB12: bron-onbekend-land met vingerafdruk land=ZA|bruto=1000; met eigen tarief niet meer', () => {
    const zaRegel = { id: 'bb-za', land: 'ZA', soort: 'dividend' as const, brutoInkomsten: 1000, bedrag: 200 }
    const i = invoer(2026, [degiro({ bronbelastingen: [zaRegel] })])
    const c = controleer(ctx(i, '2026-10-05')).alle.find((x) => x.regel === 'bron-onbekend-land')
    expect(c).toMatchObject({ ernst: 'let-op', vingerafdruk: 'land=ZA|bruto=1000' })
    expect(c?.uitleg).toBe('Voor dit land staat het verdragstarief niet in de tool. We rekenen met hoogstens 15%; vul het tarief in als het verdrag minder toestaat.')
    const met = invoer(2026, [degiro({ bronbelastingen: [{ ...zaRegel, verdragstarief: 0.15 }] })])
    expect(controleer(ctx(met, '2026-10-05')).alle.some((x) => x.regel === 'bron-onbekend-land')).toBe(false)
  })

  it('bron-terugvragen (info) per open regel en bron-termijn (let op) binnen zes maanden, alleen bij status open', () => {
    const i = invoer(2026, [degiro()])
    const vroeg = controleer(ctx(i, '2026-10-05'))
    expect(vroeg.alle.filter((c) => c.regel === 'bron-terugvragen').map((c) => c.id).sort()).toEqual(['bron-terugvragen:degiro:bb-ch', 'bron-terugvragen:degiro:bb-fr'])
    expect(vroeg.alle.find((c) => c.id === 'bron-terugvragen:degiro:bb-ch')?.uitleg).toBe('Er is € 1.000 meer ingehouden dan het verdrag toestaat. Vraag het terug in Zwitserland, uiterlijk 31 december 2029.')
    expect(vroeg.alle.find((c) => c.id === 'bron-terugvragen:degiro:bb-fr')?.uitleg).toContain('Terugvragen loont waarschijnlijk niet.')
    expect(vroeg.alle.some((c) => c.regel === 'bron-termijn')).toBe(false)
    const laat = controleer(ctx(i, '2029-08-01'))
    expect(laat.alle.find((c) => c.regel === 'bron-termijn')).toMatchObject({ id: 'bron-termijn:degiro:bb-ch', ernst: 'let-op', href: '/dossier/2026/planning/#terugvragen' })
    const aangevraagd = controleer(ctx(i, '2029-08-01', { versie: 1, terugvragen: { 'degiro/bb-ch': { status: 'aangevraagd', op: '2029-07-01T10:00:00.000Z' } } }))
    expect(aangevraagd.alle.some((c) => c.regel === 'bron-termijn' || c.id === 'bron-terugvragen:degiro:bb-ch')).toBe(false)
  })

  it('zonder bronbelasting geen enkele controle uit dit onderdeel', () => {
    const i = invoer(2026, [degiro({ bronbelastingen: [] })])
    expect(controleer(ctx(i, '2026-10-05')).alle.filter((c) => c.regel.startsWith('bron-'))).toEqual([])
  })
})

describe('controles partner', () => {
  const metOnderneming = (extra: Partial<NonNullable<PersoonInvoer['ondernemingen']>[number]> = {}) =>
    pers('A', { ondernemingen: [{ id: 'ond-1', naam: 'Ontwerpstudio', winstberekening: { soort: 'saldo', saldo: 56000 }, uren: { onderneming: 1500 }, startjaar: 2015, ...extra }] })

  it('partner-onder-drempel bij een beloning onder de 5.000 in de kosten', () => {
    const i = invoer(2026, [], [metOnderneming({ samenwerkingMetPartner: 'arbeidsbeloning', meewerkendePartner: { uren: 600, vergoeding: 4000 } }), pers('B')])
    expect(controleer(ctx(i, '2026-10-05')).alle.find((c) => c.regel === 'partner-onder-drempel')).toMatchObject({
      id: 'partner-onder-drempel:A:ond-1',
      ernst: 'let-op',
      veld: 'persoon:A/onderneming:ond-1/meewerkendePartner.vergoeding',
    })
  })

  it('tbs-box3 bij een zaak zonder bezitting; tbs-werkruimte bij een werkruimte die niet voldoet', () => {
    const b = pers('B', {
      terbeschikkingstellingen: [
        { id: 'tbs-bus', omschrijving: 'Bestelbus', aan: { persoon: 'A', ondernemingId: 'ond-1' }, soort: 'zaak', vergoeding: 2400 },
        { id: 'tbs-kamer', omschrijving: 'Kamer', aan: { persoon: 'A', ondernemingId: 'ond-1' }, soort: 'werkruimte', vergoeding: 0 },
      ],
    })
    const u = controleer(ctx(invoer(2026, [], [metOnderneming(), b]), '2026-10-05'))
    expect(u.alle.find((c) => c.regel === 'tbs-box3')).toMatchObject({ id: 'tbs-box3:tbs-bus', veld: 'persoon:B/terbeschikkingstelling:tbs-bus/box3PositieId' })
    expect(u.alle.find((c) => c.regel === 'tbs-werkruimte')).toMatchObject({
      id: 'tbs-werkruimte:tbs-kamer',
      uitleg: 'Geen terbeschikkingstelling: de werkruimte voldoet niet aan de voorwaarden voor aftrek, dus de onderneming kan er geen vergoeding voor aftrekken.',
    })
  })
})
