import { describe, expect, it } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { berekenHuishouden } from '@/lib/tax/engine'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { accountantVergelijking, leegInvoer, nieuwJaarUitVorig, premiegrondslagInkomen, samenvatting, schoonAccountantRegels, valideerInvoer } from '..'

const invoer2024: HuishoudenInvoer = voorbeeldInvoer(2024)
const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe('valideerInvoer', () => {
  it('het voorbeeldhuishouden 2024 is geldig', () => {
    expect(valideerInvoer(invoer2024)).toEqual([])
  })

  it('een lege invoer is geldig', () => {
    expect(valideerInvoer(leegInvoer(2026))).toEqual([])
  })

  it('meldt kapotte invoer met het pad', () => {
    expect(valideerInvoer(null)).toEqual(['invoer: moet een object zijn'])
    const kapot = kloon(invoer2024) as unknown as Record<string, any>
    kapot.jaar = 1999
    kapot.personen[0].geboortedatum = '21-09-1983'
    kapot.personen[0].ondernemingen[0].winstberekening = { soort: 'saldo', saldo: '152340' }
    kapot.personen[0].ondernemingen[0].investeringen[0].regeling = 'subsidie'
    kapot.box3.posities[0].categorie = 'goud'
    kapot.box3.posities[1].eigenaar = 'kind:onbekend'
    kapot.verdeling = { eigenWoning: 2, pga: 0, box3: 1, box2: 1 }
    const fouten = valideerInvoer(kapot)
    expect(fouten).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^jaar: geen parameters voor 1999/),
        'personen[0].geboortedatum: moet een datum zijn (JJJJ-MM-DD)',
        'personen[0].ondernemingen[0].winstberekening.saldo: moet een getal zijn',
        expect.stringMatching(/^personen\[0\]\.ondernemingen\[0\]\.investeringen\[0\]\.regeling: onbekende waarde/),
        expect.stringMatching(/^box3\.posities\[0\]\.categorie: onbekende waarde/),
        expect.stringMatching(/^box3\.posities\[1\]\.eigenaar/),
        'verdeling.eigenWoning: moet een aandeel tussen 0 en 1 zijn',
        'verdeling.dividendbelasting: moet een aandeel tussen 0 en 1 zijn',
      ]),
    )
  })

  it('vereist twee unieke personen bij een fiscaal partner', () => {
    const een = kloon(invoer2024)
    een.personen = [een.personen[0]]
    expect(valideerInvoer(een)).toContain('personen: met een fiscaal partner zijn twee personen nodig')
    const dubbel = kloon(invoer2024)
    dubbel.personen[1].id = 'A'
    expect(valideerInvoer(dubbel)).toContain('personen[1].id: persoon A komt twee keer voor')
  })
})

describe('nieuwJaarUitVorig', () => {
  it('schuift vermogen door en maakt jaarbedragen leeg', () => {
    const r = berekenHuishouden(invoer2024)
    const n = nieuwJaarUitVorig(invoer2024, 2025, r)
    expect(n.jaar).toBe(2025)
    expect(valideerInvoer(n)).toEqual([])
    const a = n.personen[0]
    expect(a.voorlopigeAanslagIB).toBeUndefined()
    expect(a.voorlopigeAanslagZvw).toBeUndefined()
    expect(a.ondernemingen[0].naam).toBe('Meubelmakerij')
    expect(a.ondernemingen[0].investeringen).toBeUndefined()
    expect(a.ondernemingen[0].for?.stand).toBe(9640)
    expect(a.inkomensvoorziening.lijfrentePremies).toBe(0)
    expect(a.inkomensvoorziening.aovPremies).toBe(3460)
    const bank = n.box3.posities.find((p) => p.id === 'bank-nl')!
    expect(bank.waardeBegin).toBe(50200)
    expect(bank.waardeEind).toBeUndefined()
    const beleggingen = n.box3.posities.find((p) => p.id === 'beleggingen')!
    expect(beleggingen.bronbelasting).toBeUndefined()
    expect(beleggingen.bronbelastingen).toBeUndefined()
    expect(beleggingen.dividendbelasting).toBeUndefined()
    expect(n.box3.schulden[0].waardeBegin).toBe(16250)
    // Origineel ongewijzigd.
    expect(invoer2024.personen[0].voorlopigeAanslagIB).toBe(43500)
    expect(invoer2024.box3.posities[0].waardeBegin).toBe(50900)
  })

  it('werkt de lijfrentehistorie bij met het resultaat van het vorige jaar', () => {
    const r = berekenHuishouden(invoer2024)
    const pa = r.personen.find((p) => p.id === 'A')!
    const n = nieuwJaarUitVorig(invoer2024, 2025, r)
    const iv = n.personen[0].inkomensvoorziening
    expect(iv.premiegrondslagInkomenVorigJaar).toBe(premiegrondslagInkomen(pa))
    expect(iv.premiegrondslagInkomenVorigJaar).toBe(151328)
    const h2024 = iv.historie!.find((h) => h.jaar === 2024)!
    expect(h2024.premiegrondslagInkomen).toBe(149800)
    expect(h2024.jaarruimteOverride).toBe(pa.inkomensvoorziening.tabel[0].jaarruimte)
    // Wat in 2024 op oudere jaren is geboekt, telt op bij alGebruikt.
    const totaalBenut = pa.inkomensvoorziening.tabel.reduce((s, t) => s + t.ditJaarBenut, 0)
    const extraOud = iv.historie!.filter((h) => h.jaar < 2024).reduce((s, h) => s + h.alGebruikt, 0) - invoer2024.personen[0].inkomensvoorziening.historie!.reduce((s, h) => s + h.alGebruikt, 0)
    expect(extraOud + h2024.alGebruikt).toBe(totaalBenut)
    expect(totaalBenut).toBe(9800)
    // De nieuwe invoer rekent zonder fouten.
    expect(() => berekenHuishouden(n)).not.toThrow()
  })

  it('zonder resultaat blijft de historie staan en is het inkomen onbekend', () => {
    const n = nieuwJaarUitVorig(invoer2024, 2025)
    expect(n.personen[0].inkomensvoorziening.premiegrondslagInkomenVorigJaar).toBeUndefined()
    expect(n.personen[0].inkomensvoorziening.historie).toEqual(invoer2024.personen[0].inkomensvoorziening.historie)
  })
})

describe('accountantVergelijking en samenvatting', () => {
  const r = berekenHuishouden(invoer2024)

  it('vergelijkt per regel en markeert verschillen', () => {
    const v = accountantVergelijking(r, { A: { winst: 151328, mkb: 19643, verschuldigd: 47894, box3Belasting: 39, teBetalen: null } })
    const regel = (id: string) => v.regels.find((x) => x.persoon === 'A' && x.id === id)!
    expect(regel('winst')).toMatchObject({ engine: 151328, accountant: 151328, verschil: 0, afwijkend: false })
    expect(regel('mkb').afwijkend).toBe(false)
    expect(regel('verschuldigd')).toMatchObject({ engine: 47901, accountant: 47894, verschil: 7, afwijkend: true })
    expect(regel('box3Belasting')).toMatchObject({ engine: 43, verschil: 4, afwijkend: true })
    expect(regel('teBetalen')).toMatchObject({ accountant: null, verschil: null, afwijkend: false })
    expect(v.aantalIngevuld).toBe(4)
    expect(v.aantalAfwijkend).toBe(2)
    expect(v.grootsteVerschil).toBe(7)
    // Beide personen, alle vaste regels.
    expect(v.regels.filter((x) => x.persoon === 'B').length).toBe(v.regels.filter((x) => x.persoon === 'A').length)
  })

  it('schoont regels uit de API op', () => {
    expect(schoonAccountantRegels({ A: { winst: 100.4, mkb: null } })).toEqual({ regels: { A: { winst: 100, mkb: null } } })
    expect(schoonAccountantRegels({ C: {} })).toHaveProperty('fout')
    expect(schoonAccountantRegels({ A: { onbekend: 1 } })).toHaveProperty('fout')
    expect(schoonAccountantRegels({ A: { winst: '1' } })).toHaveProperty('fout')
    expect(schoonAccountantRegels([])).toHaveProperty('fout')
  })

  it('samenvatting bevat de totalen', () => {
    const s = samenvatting(r)
    expect(s.jaar).toBe(2024)
    expect(s.teBetalenIB).toBe(r.totaal.teBetalenIB)
    expect(s.personen.find((p) => p.id === 'A')!.verschuldigdIB).toBe(47901)
  })
})
