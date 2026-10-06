/**
 * Ronde 2 (A3): kapitaalsvergelijking (F9, taak-A3 hoofdstuk 6), gevallen KV1 tot en met KV6.
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenResultaat, OndernemingResultaat } from '@/lib/tax/types'
import { controleer } from '../index'
import { kapitaalsvergelijkingRegel, balansOntbreektRegel, vergelijkKapitaal } from '../regels/jaarrekening'
import { REGELS } from '../regels'
import type { GenegeerdeControle } from '../types'
import { balans14, ctx, invoer, metJaarrekening, onderneming, reken } from './hulp'

const ID = 'kapitaalsvergelijking:A:ond-1'
const kv = (i: Parameters<typeof ctx>[0], r?: HuishoudenResultaat | null) => kapitaalsvergelijkingRegel(ctx(i, r === undefined ? {} : { resultaat: r }))

/** Een uitkomst met één onderneming waarvan alleen de velden voor de vergelijking iets zeggen. */
function nepUitkomst(o: Partial<OndernemingResultaat>): HuishoudenResultaat {
  return { personen: [{ id: 'A', ondernemingen: [o as OndernemingResultaat] }] } as unknown as HuishoudenResultaat
}

describe('kapitaalsvergelijking', () => {
  it('KV1: balans en saldo sluiten aan, geen controle', () => {
    expect(kv(metJaarrekening(35000))).toEqual([])
    expect(vergelijkKapitaal(metJaarrekening(35000).personen[0].ondernemingen[0], undefined)).toMatchObject({ kv: 35000, saldo: 35000, verschil: 0, posten: 14, ernst: null })
  })

  it('KV2: € 300 verschil met 14 posten is een fout met reden; negeren blijft gelden tot het verschil verandert', () => {
    const i = metJaarrekening(34700)
    const [c] = kv(i)
    expect(c).toMatchObject({ id: ID, ernst: 'fout', negeren: 'met-reden', vingerafdruk: 'verschil=300', veld: 'persoon:A/onderneming:ond-1/winstberekening.saldo', waar: 'Ontwerpstudio' })
    expect(c.uitleg).toBe('De winst volgens de balans is € 35.000, het saldo van de winstberekening € 34.700: € 300 verschil. In de aangifte moet dit aansluiten.')
    expect(c.oplossing?.label).toBe('Gebruik € 35.000 uit de balans')

    const negering: GenegeerdeControle = { id: ID, ernst: 'fout', titel: c.titel, vingerafdruk: c.vingerafdruk, reden: 'Afronding in Moneybird, besproken met de adviseur', op: '2026-10-05T10:00:00.000Z' }
    const staat = { versie: 1 as const, genegeerd: { [ID]: negering } }
    let u = controleer(ctx(i, { staat }))
    expect(u.genegeerd.map((g) => g.controle.id)).toContain(ID)
    expect(u.blokkeertGecontroleerd).toBe(false)

    // Activa +100 en schulden +100: het verschil blijft 300, de negering blijft gelden.
    const b = balans14()
    b.eind.liquideMiddelen! += 100
    b.eind.crediteuren! += 100
    u = controleer(ctx(metJaarrekening(34700, b), { staat }))
    expect(u.genegeerd.map((g) => g.controle.id)).toContain(ID)

    // Saldo 34.690: verschil 310, weer open ("Kijk opnieuw").
    u = controleer(ctx(metJaarrekening(34690, b), { staat }))
    expect(u.weerOpen.map((x) => x.id)).toEqual([ID])
    expect(u.open.find((x) => x.id === ID)?.vingerafdruk).toBe('verschil=310')
    expect(u.blokkeertGecontroleerd).toBe(true)
  })

  it('de snelle oplossing zet het saldo op de winst volgens de balans', () => {
    const i = metJaarrekening(34700)
    const [c] = kv(i)
    const kopie = structuredClone(i)
    c.oplossing!.pas!(kopie)
    expect(kopie.personen[0].ondernemingen[0].winstberekening).toEqual({ soort: 'saldo', saldo: 35000 })
    expect(kv(kopie)).toEqual([])
  })

  it('KV3: € 8 verschil met 6 posten is een let op (tolerantie 10), gezien', () => {
    const b = {
      begin: { liquideMiddelen: 21000, handelsdebiteuren: 1000, crediteuren: 2000 },
      eind: { liquideMiddelen: 26000, handelsdebiteuren: 1000, crediteuren: 2000 },
    }
    const [c] = kv(metJaarrekening(34992, b))
    expect(c).toMatchObject({ ernst: 'let-op', negeren: 'gezien', vingerafdruk: 'verschil=8', titel: 'Kapitaalsvergelijking wijkt iets af' })
    expect(c.uitleg).toBe('€ 8 verschil tussen balans en saldo; dat is waarschijnlijk afronding.')
    expect(c.oplossing).toBeUndefined()
  })

  it('KV4: boekhouding, correcties buiten het saldo tellen niet mee', () => {
    const i = metJaarrekening(35000)
    const o = i.personen[0].ondernemingen[0]
    o.winstBron = 'boekhouding'
    o.herinvesteringsreserves = [{ id: 'hir-1', omschrijving: 'Bus', ontstaanJaar: 2025, standBegin: 0, voornemen: true } as never]
    const r = nepUitkomst({
      herinvesteringsreserves: [{ id: 'hir-1', omschrijving: 'Bus', ontstaanJaar: 2025, standBegin: 0, dotatie: 12000, afboeking: 0, vrijval: 0, standEind: 12000, uiterlijkJaar: 2028 }],
      correctieReserves: -12000,
      correctiePartner: -6000,
      auto: { btwCorrectieAfgetrokken: 675 } as never,
    })
    expect(kv(i, r)).toEqual([])
  })

  it('KV5: fiscaal rapport met de HIR-dotatie in het saldo: verwacht saldo plus dotatie', () => {
    const i = metJaarrekening(23000)
    const o = i.personen[0].ondernemingen[0]
    o.winstBron = 'fiscaal-rapport'
    o.herinvesteringsreserves = [{ id: 'hir-1', omschrijving: 'Bus', ontstaanJaar: 2025, standBegin: 0, voornemen: true } as never]
    const r = nepUitkomst({
      herinvesteringsreserves: [{ id: 'hir-1', omschrijving: 'Bus', ontstaanJaar: 2025, standBegin: 0, dotatie: 12000, afboeking: 0, vrijval: 0, standEind: 12000, uiterlijkJaar: 2028 }],
    })
    expect(kv(i, r)).toEqual([])
    // Zonder de uitkomst van de reserves (onderdeel A6 ontbreekt): 12.000 verschil, een fout.
    expect(kv(i, nepUitkomst({}))[0]).toMatchObject({ ernst: 'fout', vingerafdruk: 'verschil=12000' })
    // Een expliciet "zit niet in het saldo" gaat voor de standaard van het fiscaal rapport.
    ;(o.herinvesteringsreserves[0] as { mutatiesInSaldo?: boolean }).mutatiesInSaldo = false
    expect(kv(i, r)[0]).toMatchObject({ ernst: 'fout', vingerafdruk: 'verschil=12000' })
  })

  it('kostenegalisatiereserve in het saldo telt mee: dotatie min onttrekking', () => {
    const i = metJaarrekening(33000)
    const o = i.personen[0].ondernemingen[0]
    o.egalisatiereserves = [{ id: 'eg-1', omschrijving: 'Onderhoud', standBegin: 0, inSaldo: true }]
    const r = nepUitkomst({ egalisatiereserves: [{ id: 'eg-1', omschrijving: 'Onderhoud', standBegin: 0, dotatie: 3000, onttrekking: 1000, vrijval: 0, standEind: 2000, winstcorrectie: 0 }] })
    expect(kv(i, r)).toEqual([])
  })

  it('KV6: zonder begin- of eindbalans geen kapitaalsvergelijking, wel balans-ontbreekt (let op)', () => {
    const i = invoer(2025)
    expect(kv(i)).toEqual([])
    const [c] = balansOntbreektRegel(ctx(i))
    expect(c).toMatchObject({ id: 'balans-ontbreekt:A:ond-1', ernst: 'let-op', negeren: 'gezien', vingerafdruk: 'beide', titel: 'Balans ontbreekt' })
    expect(c.uitleg).toBe('De aangifte vraagt de balans van Ontwerpstudio. De berekening klopt ook zonder.')
    // Alleen de eindbalans ontbreekt.
    const b = balans14()
    const j = metJaarrekening(35000)
    delete j.personen[0].ondernemingen[0].jaarrekening!.eind
    expect(balansOntbreektRegel(ctx(j))[0]).toMatchObject({ vingerafdruk: 'eind', titel: 'Eindbalans ontbreekt', veld: 'persoon:A/onderneming:ond-1/jaarrekening.eind.materieleVasteActiva' })
    expect(balansOntbreektRegel(ctx(metJaarrekening(35000, b)))).toEqual([])
  })

  it('uitgesplitst: de rubrieken van de jaarrekening zijn het saldo; springen naar de omzet', () => {
    const i = metJaarrekening(0)
    const o = i.personen[0].ondernemingen[0]
    o.winstberekening = { soort: 'uitgesplitst', omzet: 60000, kosten: 25000 }
    expect(kv(i)).toEqual([])
    o.jaarrekening!.winstEnVerlies = [
      { rubriek: 'omzet', bedrag: 60000 },
      { rubriek: 'overig', bedrag: 25500 },
    ]
    const [c] = kv(i)
    expect(c).toMatchObject({ ernst: 'fout', vingerafdruk: 'verschil=500', veld: 'persoon:A/onderneming:ond-1/winstberekening.omzet' })
    expect(c.oplossing).toBeUndefined()
  })

  it('zit in REGELS en geeft met de echte engine dezelfde uitkomst', () => {
    const i = metJaarrekening(34700)
    const u = controleer(ctx(i, { resultaat: reken(i) }), REGELS)
    expect(u.open.map((c) => c.id)).toContain(ID)
    expect(onderneming().id).toBe('ond-1')
  })
})
