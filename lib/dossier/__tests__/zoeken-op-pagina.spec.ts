/**
 * Review ronde 2, bevindingen 16 en 17: het zoekveld toont alleen velden die op de pagina staan (geen "Auto: dagwaarde"
 * zonder auto, geen stakingsvelden zonder staking), vindt in een leeg jaar een ingang voor hypotheek, WOZ, KIA en
 * bankrekening, en springt bij een veld van een persoon naar de sectie van die persoon.
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { vulIds } from '../ids'
import { leegInvoer, leegOnderneming } from '../leeg'
import { REGELINGEN, VELDREGISTER } from '../veldregister'
import { instanties, opPagina, sectieVan, vindItem, zoek, type ZoekResultaat } from '../zoeken'

const voorbeeld = (): HuishoudenInvoer => vulIds(voorbeeldInvoer(2024))

/** Een leeg jaar met één onderneming (zonder auto, investeringen of staking) en een ingevulde geboortedatum. */
function metOnderneming(): HuishoudenInvoer {
  const i = leegInvoer(2025)
  i.personen[0].geboortedatum = '1988-03-14'
  i.personen[0].ondernemingen = [{ ...leegOnderneming(2025, 'Ontwerpstudio'), id: 'ond-1' }]
  return i
}

const velden = (r: ZoekResultaat[]) => r.filter((x): x is Extract<ZoekResultaat, { soort: 'veld' }> => x.soort === 'veld')

describe('zoeken toont alleen wat op de pagina staat', () => {
  it('youngtimer zonder auto: geen autovelden, wel de schakelaar Auto van de zaak', () => {
    const uit = zoek('youngtimer', VELDREGISTER, REGELINGEN, metOnderneming())
    expect(uit.some((r) => 'veld' in r && /\/auto\./.test(r.veld))).toBe(false)
    expect(uit[0]).toMatchObject({ soort: 'veld', veld: 'persoon:A/onderneming:ond-1/auto', label: 'Auto van de zaak, Ontwerpstudio, Persoon A', waar: expect.stringContaining('nog niet ingevuld') })
    expect(zoek('oude auto', VELDREGISTER, REGELINGEN, metOnderneming())[0]).toMatchObject({ veld: 'persoon:A/onderneming:ond-1/auto' })
  })

  it('met een oude auto: de youngtimer springt naar de auto en de dagwaarde staat erbij', () => {
    const i = metOnderneming()
    i.personen[0].ondernemingen[0].auto = { cataloguswaarde: 40000, datumEersteToelating: '2005-05-01' } as never
    const uit = zoek('youngtimer', VELDREGISTER, REGELINGEN, i)
    expect(uit[0]).toMatchObject({ soort: 'regeling', regeling: 'youngtimer', actief: true })
    expect(uit.map((r) => ('veld' in r ? r.veld : ''))).toContain('persoon:A/onderneming:ond-1/auto.dagwaarde')
    // Een jonge auto: geen dagwaarde op de pagina, dus ook niet in de resultaten.
    i.personen[0].ondernemingen[0].auto = { cataloguswaarde: 40000, datumEersteToelating: '2022-05-01' } as never
    expect(zoek('dagwaarde', VELDREGISTER, REGELINGEN, i).map((r) => ('veld' in r ? r.veld : ''))).not.toContain('persoon:A/onderneming:ond-1/auto.dagwaarde')
  })

  it('staking zonder staking: alleen de kiezer, geen stakingsvelden', () => {
    const uit = zoek('staking', VELDREGISTER, REGELINGEN, metOnderneming())
    expect(uit[0]).toMatchObject({ soort: 'regeling', regeling: 'staking', actief: false, elementId: 'situaties-A-ond-1' })
    expect(uit.some((r) => 'veld' in r && /staking\./.test(r.veld))).toBe(false)
  })

  it('winst uitgesplitst of als saldo: alleen de velden van de gekozen vorm', () => {
    const i = metOnderneming()
    const ids = (term: string) => zoek(term, VELDREGISTER, [], i, 50).map((r) => ('veld' in r ? r.veld : ''))
    expect(ids('omzet')).not.toContain('persoon:A/onderneming:ond-1/winstberekening.omzet')
    i.personen[0].ondernemingen[0].winstberekening = { soort: 'uitgesplitst', omzet: 1, kosten: 0 }
    expect(ids('omzet')).toContain('persoon:A/onderneming:ond-1/winstberekening.omzet')
  })

  it('blokken die er alleen met een bedrag of keuze zijn: dagtekening VA, box 2-verlies, partner', () => {
    const i = metOnderneming()
    const ids = (term: string) => zoek(term, VELDREGISTER, [], i, 50).map((r) => ('veld' in r ? r.veld : ''))
    expect(ids('dagtekening')).toEqual([])
    i.personen[0].voorlopigeAanslagIB = 4000
    expect(ids('dagtekening')).toEqual(['persoon:A/voorlopigeAanslagDetails.ib.dagtekening'])
    expect(ids('verlies box 2')).toEqual([])
    expect(ids('meewerkaftrek')).toEqual([])
    i.personen[0].ondernemingen[0].samenwerkingMetPartner = 'meewerkaftrek'
    expect(ids('meewerkaftrek')).toContain('persoon:A/onderneming:ond-1/meewerkendePartner.uren')
  })

  it('elk veld van het voorbeeld 2024 dat de zoeker toont, heeft een registeritem en staat volgens de regels op de pagina', () => {
    const i = voorbeeld()
    for (const v of VELDREGISTER) for (const m of instanties(v.patroon, i).filter((x) => opPagina(v, x, i))) expect(vindItem(m.id, VELDREGISTER)).not.toBeNull()
  })
})

describe('ingangen in een leeg jaar', () => {
  it('hypotheek, hypotheekrente, WOZ, verhuizen en eigen woning vinden de schakelaar Eigen woning', () => {
    const i = metOnderneming()
    for (const term of ['hypotheek', 'hypotheekrente', 'woz', 'verhuizen', 'eigen woning']) {
      const [eerste] = zoek(term, VELDREGISTER, REGELINGEN, i)
      expect(eerste, term).toMatchObject({ soort: 'veld', veld: 'eigenWoning', label: 'Eigen woning als hoofdverblijf', waar: 'Eigen woning · nog niet ingevuld' })
    }
    // Met een woning zijn de echte velden er en verdwijnt de ingang.
    i.eigenWoning = { woz: 400000, rente: 9000 }
    const uit = velden(zoek('hypotheekrente', VELDREGISTER, REGELINGEN, i))
    expect(uit[0].veld).toBe('eigenWoning/rente')
    expect(uit.some((r) => r.veld === 'eigenWoning')).toBe(false)
  })

  it('kia en kleinschaligheidsinvesteringsaftrek: de knop Investering toevoegen, of Onderneming toevoegen', () => {
    const i = metOnderneming()
    expect(zoek('kia', VELDREGISTER, REGELINGEN, i)[0]).toMatchObject({ veld: 'persoon:A/onderneming:ond-1/investeringen', waar: expect.stringContaining('nog niet ingevuld') })
    expect(zoek('kleinschaligheidsinvesteringsaftrek', VELDREGISTER, REGELINGEN, i)[0]).toMatchObject({ veld: 'persoon:A/onderneming:ond-1/investeringen' })
    i.personen[0].ondernemingen[0].investeringen = [{ id: 'inv-1', omschrijving: 'Laptop', datum: '2025-03-01', bedrag: 3000, regeling: 'kia' }]
    expect(zoek('kia', VELDREGISTER, REGELINGEN, i)[0]).toMatchObject({ veld: 'persoon:A/onderneming:ond-1/investering:inv-1/omschrijving' })
    i.personen[0].ondernemingen = []
    expect(zoek('kia', VELDREGISTER, REGELINGEN, i)[0]).toMatchObject({ veld: 'persoon:A/ondernemingen', label: 'Onderneming toevoegen, Persoon A' })
  })

  it('bankrekening zonder bezittingen: de knop Bezitting toevoegen', () => {
    expect(zoek('bankrekening', VELDREGISTER, REGELINGEN, metOnderneming())[0]).toMatchObject({ veld: 'box3/posities', sectie: 'vermogen', waar: 'Vermogen · nog niet ingevuld' })
  })
})

describe('springen naar de sectie van de persoon', () => {
  it('velden van de onderneming, het pensioen en de aanslag gaan naar de sectie met de persoon erbij', () => {
    const i = voorbeeld()
    const sectie = (id: string) => {
      const g = vindItem(id, VELDREGISTER)!
      return sectieVan(g.item, g.match.persoon)
    }
    expect(sectie('persoon:B/onderneming:ond-1/auto.dagwaarde')).toBe('ondernemingen-B')
    expect(sectie('persoon:A/inkomensvoorziening.stakingslijfrente.premie')).toBe('pensioen-A')
    expect(sectie('persoon:B/voorlopigeAanslagIB')).toBe('aanslag-B')
    expect(sectie('persoon:A/voortgewenteldeBronbelasting')).toBe('aanslag-A')
    expect(sectie('persoon:A/onderneming:ond-1/meewerkendePartner.uren')).toBe('ondernemingen-A')
    expect(i.personen).toHaveLength(2)
  })
})
