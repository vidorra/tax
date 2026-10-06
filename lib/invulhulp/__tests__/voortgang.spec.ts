/**
 * Ronde 2 (A1), taak 10 punt 2 tot en met 6: verdelen in euro's, herhaling met vaste id's, Klopt en gewijzigd, de
 * telling en de eindcontrole.
 */
import { describe, expect, it } from 'vitest'
import { getJaar } from '@/lib/tax/years'
import { LEGE_STAAT, pasStaatToe, type AangifteStaat, type StaatWijziging } from '@/lib/dossier/aangiftestaat'
import type { HuishoudenInvoer, LoonInvoer, PersoonResultaat } from '@/lib/tax/types'
import type { Scherm, Veld, VeldSoort, VeldWaarde } from '../types'
import { RIJ_SOORT } from '../types'
import { verdeelEuro } from '../waarden'
import {
  allesAfvinken,
  eindcontrole,
  grensZin,
  heeftOpenVerschil,
  kiesVerschil,
  klopt,
  ongedaan,
  schermStatus,
  schermTelling,
  telling,
  veldStatus,
  vingerafdruk,
  vingerafdrukTekst,
  vink,
  wijktAf,
} from '../voortgang'
import { bouw, kloon, veld, voorbeeld2024 } from './hulp'

const OP = '2026-10-05T12:00:00.000Z'
const pas = (staat: AangifteStaat, w: StaatWijziging[]): AangifteStaat => {
  const r = pasStaatToe(staat, w)
  if ('fout' in r) throw new Error(r.fout)
  return r.staat
}

function metWerkgevers(...loon: LoonInvoer[]): HuishoudenInvoer {
  const x = voorbeeld2024()
  x.personen[0].loon = loon
  return x
}
const acme = (bruto = 12000): LoonInvoer => ({ id: 'loon-1', omschrijving: 'Acme BV', soort: 'loon', bruto, ingehoudenLoonheffing: 3100 })
const beta: LoonInvoer = { id: 'loon-2', omschrijving: 'Beta BV', soort: 'loon', bruto: 4000, ingehoudenLoonheffing: 900 }
const LOON_ACME = 'loondienst:A/werkgever:loon-1/loon'
const LOON_BETA = 'loondienst:A/werkgever:loon-2/loon'

describe('verdelen in hele euro’s (taak 10 punt 2)', () => {
  it('totaal 1.001, aandeel A 50%: deel A 501, deel B 500', () => {
    expect(verdeelEuro(1001, 0.5)).toEqual({ a: 501, b: 500, totaal: 1001 })
  })

  it('de delen tellen altijd op tot het totaal (200 willekeurige bedragen en aandelen)', () => {
    let zaad = 12345
    const willekeurig = () => {
      zaad = (zaad * 1103515245 + 12345) % 2 ** 31
      return zaad / 2 ** 31
    }
    for (let i = 0; i < 200; i++) {
      const totaal = Math.round((willekeurig() - 0.3) * 2_000_000) / (i % 3 === 0 ? 7 : 1)
      const aandeel = i % 10 === 0 ? (i % 20 === 0 ? 0 : 1) : willekeurig()
      const { a, b, totaal: t } = verdeelEuro(totaal, aandeel)
      expect(Number.isInteger(a) && Number.isInteger(b)).toBe(true)
      expect(a + b).toBe(t)
      expect(t).toBe(Math.round(totaal))
    }
  })
})

describe('herhaling met vaste id’s (taak 10 punt 3)', () => {
  it('weghalen van een werkgever laat VIA en status van de ander staan', () => {
    const o = bouw(metWerkgevers(acme(), beta))
    expect(veld(o, LOON_ACME).waarde).toEqual({ soort: 'bedrag', bedrag: 12000 })
    let staat = pas(LEGE_STAAT, wijktAf(veld(o, LOON_BETA), 3900, { personen: ['A'] }))
    expect(staat.invulhulp?.velden.A?.[LOON_BETA]).toEqual({ via: 3900 })
    expect(veldStatus(veld(o, LOON_BETA), staat.invulhulp?.velden.A?.[LOON_BETA])).toBe('verschil')
    staat = pas(staat, kiesVerschil(veld(o, LOON_BETA), 'mijn-bedrag', { personen: ['A'], huidig: staat.invulhulp?.velden.A?.[LOON_BETA] }))
    staat = pas(staat, vink(veld(o, LOON_BETA), true, { personen: ['A'], op: OP, huidig: staat.invulhulp?.velden.A?.[LOON_BETA] }))
    expect(veldStatus(veld(o, LOON_BETA), staat.invulhulp?.velden.A?.[LOON_BETA])).toBe('afgevinkt')

    const zonderAcme = bouw(metWerkgevers(beta))
    expect(() => veld(zonderAcme, LOON_ACME)).toThrow()
    const b = veld(zonderAcme, LOON_BETA)
    expect(b.waarde).toEqual({ soort: 'bedrag', bedrag: 4000 })
    expect(staat.invulhulp?.velden.A?.[LOON_BETA]?.via).toBe(3900)
    expect(veldStatus(b, staat.invulhulp?.velden.A?.[LOON_BETA])).toBe('afgevinkt')
    expect(telling(zonderAcme, staat.invulhulp, 'A').verschillen).toBe(0)
  })
})

describe('Klopt en gewijzigd (taak 10 punt 4)', () => {
  it('Klopt zet afgevinkt en via op het dossierbedrag; daarna 12.000 naar 12.400 geeft gewijzigd en een verschil van 400', () => {
    const o = bouw(metWerkgevers(acme()))
    const v = veld(o, LOON_ACME)
    expect(v.rij).toBe('controleren')
    let staat = pas(LEGE_STAAT, klopt(v, { personen: ['A'], op: OP }))
    const vg = staat.invulhulp?.velden.A?.[LOON_ACME]
    expect(vg).toEqual({ afgevinkt: { vingerafdruk: '12000', op: OP }, via: 12000 })
    expect(veldStatus(v, vg)).toBe('afgevinkt')
    expect(heeftOpenVerschil(v, vg)).toBe(false)

    const na = veld(bouw(metWerkgevers(acme(12400))), LOON_ACME)
    expect(veldStatus(na, vg)).toBe('gewijzigd')
    expect(heeftOpenVerschil(na, vg)).toBe(true)
    expect(vingerafdrukTekst(na.waarde, vg!.afgevinkt!.vingerafdruk)).toBe('€ 12.000')

    // Ongedaan maken haalt vinkje en via weg.
    staat = pas(staat, ongedaan(v, { personen: ['A'], huidig: vg }))
    expect(staat.invulhulp?.velden.A?.[LOON_ACME]).toBeUndefined()
  })

  it('afvinken kan pas na een keuze bij een verschil; Nog uitzoeken blijft open', () => {
    const v = veld(bouw(metWerkgevers(acme())), LOON_ACME)
    let staat = pas(LEGE_STAAT, wijktAf(v, 11900, { personen: ['A'] }))
    let vg = staat.invulhulp?.velden.A?.[LOON_ACME]
    expect(vink(v, true, { personen: ['A'], op: OP, huidig: vg })).toEqual([])
    staat = pas(staat, kiesVerschil(v, 'uitzoeken', { personen: ['A'], huidig: vg }))
    vg = staat.invulhulp?.velden.A?.[LOON_ACME]
    expect(heeftOpenVerschil(v, vg)).toBe(true)
    staat = pas(staat, kiesVerschil(v, 'bedrag-belastingdienst', { personen: ['A'], huidig: vg }))
    vg = staat.invulhulp?.velden.A?.[LOON_ACME]
    expect(heeftOpenVerschil(v, vg)).toBe(false)
    staat = pas(staat, vink(v, true, { personen: ['A'], op: OP, huidig: vg }))
    expect(veldStatus(v, staat.invulhulp?.velden.A?.[LOON_ACME])).toBe('afgevinkt')
  })

  it('vingerafdruk: bedrag, kolommen en antwoord als tekst', () => {
    expect(vingerafdruk({ soort: 'bedrag', bedrag: 12000 })).toBe('12000')
    expect(vingerafdruk({ soort: 'kolommen', bedragen: { eind: 3100, begin: 4200 } })).toBe('begin=4200|eind=3100')
    expect(vingerafdruk({ soort: 'antwoord', antwoord: 'Ja' })).toBe('Ja')
  })
})

describe('telling (taak 10 punt 5)', () => {
  const maak = (soort: VeldSoort, i: number, waarde: VeldWaarde = { soort: 'bedrag', bedrag: 100 + i }): Veld => ({
    sleutel: `s/${soort}${i}`,
    id: `${soort}${i}`,
    label: `${soort} ${i}`,
    soort,
    rij: RIJ_SOORT[soort],
    waarde,
    herkomst: null,
    via: soort === 'V' ? { bron: 'test', zeker: true } : null,
    hint: null,
    vingerafdruk: vingerafdruk(waarde),
    leeg: false,
  })
  const velden = [maak('Z', 1), maak('Z', 2), maak('Z', 3), maak('V', 1), maak('V', 2), maak('K', 1, { soort: 'antwoord', antwoord: 'Ja' }), maak('B', 1), maak('B', 2)]
  const scherm: Scherm = { sleutel: 's', id: 's', titel: 'Test', menu: [], persoon: 'A', toelichting: null, rubrieken: [{ id: 'r', velden }] }

  it('Invullen, Controleren en keuzevragen tellen, Berekend niet: 3 Z, 2 V, 1 K en 2 B geeft 6', () => {
    expect(telling({ schermen: [scherm], samenBij: 'A' }, undefined, 'A')).toEqual({ afgevinkt: 0, totaal: 6, verschillen: 0, gewijzigd: 0 })
    expect(schermStatus(schermTelling(scherm, undefined))).toBe('niet-begonnen')
  })

  it('Alles op dit scherm afvinken: Klopt op Controleren, Ingevuld op Invullen, niets op Berekend', () => {
    const w = allesAfvinken(scherm, undefined, { personen: ['A'], op: OP })
    expect(w).toHaveLength(6)
    const staat = pas(LEGE_STAAT, w)
    expect(staat.invulhulp?.velden.A?.['s/V1']).toEqual({ afgevinkt: { vingerafdruk: '101', op: OP }, via: 101 })
    expect(staat.invulhulp?.velden.A?.['s/Z1']).toEqual({ afgevinkt: { vingerafdruk: '101', op: OP } })
    expect(telling({ schermen: [scherm], samenBij: 'A' }, staat.invulhulp, 'A')).toEqual({ afgevinkt: 6, totaal: 6, verschillen: 0, gewijzigd: 0 })
    expect(schermStatus(schermTelling(scherm, staat.invulhulp?.velden.A))).toBe('klaar')
  })

  it('niet bij een open verschil', () => {
    const vgs = { 's/V1': { via: 50 } }
    expect(allesAfvinken(scherm, vgs, { personen: ['A'], op: OP })).toEqual([])
    expect(schermStatus(schermTelling(scherm, vgs))).toBe('aandacht')
  })

  it('gezamenlijke schermen tellen alleen bij de eerste persoon (geen dubbele badge)', () => {
    const o = bouw(voorbeeld2024())
    const a = telling(o, undefined, 'A')
    const b = telling(o, undefined, 'B')
    const allesSamen = o.schermen.flatMap((s) => s.rubrieken.flatMap((r) => r.velden)).filter((v) => v.rij !== 'berekend' && !v.leeg).length
    expect(a.totaal + b.totaal).toBe(allesSamen)
  })
})

describe('eindcontrole (taak 10 punt 6)', () => {
  const persoon = (teBetalenIB: number, aanslag?: PersoonResultaat['aanslag']) =>
    ({ id: 'A', teBetalenIB, zvw: { teBetalen: 0 }, ...(aanslag ? { aanslag } : {}) }) as unknown as PersoonResultaat
  const grens: PersoonResultaat['aanslag'] = {
    grond: 'geen',
    verschuldigd: 0,
    voorheffingssaldo: 0,
    voorlopigeAanslagen: 0,
    teBetalen: 0,
    terug: 0,
    vervallenDoorGrens: { soort: 'aanslaggrens', bedrag: 40 },
  }

  it('vergelijkt met teBetalenIB, niet met het bedrag na de grens', () => {
    expect(eindcontrole(persoon(40, grens), { ib: 40 }).ib).toEqual({ tool: 40, programma: 40, verschil: 0, gelijk: true })
    expect(eindcontrole(persoon(40, grens), { ib: 0 }).ib.gelijk).toBe(false)
    expect(eindcontrole(persoon(40, grens), { ib: 44 }).ib.gelijk).toBe(true)
    expect(eindcontrole(persoon(40, grens), {}).ib.gelijk).toBeNull()
  })

  it('de grens apart, met de bedragen uit de params; zonder aanslag geen grensregel', () => {
    const params = getJaar(2027)
    expect(grensZin(persoon(40, grens), params)).toBe(
      `Je krijgt waarschijnlijk geen aanslag: € 40 is minder dan de aanslaggrens van € ${params.overig.waarde.aanslaggrens}.`,
    )
    expect(grensZin(persoon(40), params)).toBeNull()
    const terug = { ...grens, vervallenDoorGrens: { soort: 'teruggaafgrens' as const, bedrag: 12 } }
    expect(grensZin(persoon(-12, terug), params)).toContain('geen teruggaaf: € 12 is minder dan de teruggaafgrens')
  })
})

describe('samen schermen en kloon', () => {
  it('de opbouw verandert de invoer niet', () => {
    const x = voorbeeld2024()
    const voor = JSON.stringify(x)
    bouw(kloon(x))
    bouw(x)
    expect(JSON.stringify(x)).toBe(voor)
  })
})
