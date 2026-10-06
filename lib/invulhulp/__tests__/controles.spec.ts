/** Ronde 2 (A1), taak 10 punt 10: de drie controleregels van de invulhulp en hun volgorde in controleer(). */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import { controleer } from '@/lib/controles'
import { REGELS } from '@/lib/controles/regels'
import type { ControleContext } from '@/lib/controles/types'
import { LEGE_STAAT, pasStaatToe, type AangifteStaat, type StaatWijziging } from '@/lib/dossier/aangiftestaat'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { eindcontroleRegel, gewijzigdNaAfvinkenRegel, invulhulpRegels, viaVerschilRegel } from '../controles'
import { klopt, vink, wijktAf } from '../voortgang'
import { bouw, veld, voorbeeld2024 } from './hulp'

const OP = '2026-10-05T12:00:00.000Z'
const pas = (staat: AangifteStaat, w: StaatWijziging[]): AangifteStaat => {
  const r = pasStaatToe(staat, w)
  if ('fout' in r) throw new Error(r.fout)
  return r.staat
}
const LOON = 'loondienst:A/werkgever:loon-1/loon'
const WOZ = 'woningen/woz'

function invoerMetLoon(bruto: number): HuishoudenInvoer {
  const x = voorbeeld2024()
  x.personen[0].loon = [{ id: 'loon-1', omschrijving: 'Acme BV', soort: 'loon', bruto, ingehoudenLoonheffing: 3100 }]
  return x
}

function context(invoer: HuishoudenInvoer, staat: AangifteStaat | null): ControleContext {
  return { jaar: 2024, invoer, resultaat: berekenHuishouden(invoer), params: getJaar(2024), status: 'concept', staat, vandaag: '2026-10-05' }
}

describe('controleregels van de invulhulp', () => {
  it('staan in het register van alle regels', () => {
    for (const r of invulhulpRegels) expect(REGELS).toContain(r)
  })

  it('zonder staat geen controles', () => {
    const ctx = context(invoerMetLoon(12000), null)
    expect(invulhulpRegels.flatMap((r) => r(ctx))).toEqual([])
  })

  it('via-verschil: VIA ingevuld met een verschil en geen keuze', () => {
    const invoer = invoerMetLoon(12000)
    const o = bouw(invoer)
    const staat = pas(LEGE_STAAT, wijktAf(veld(o, LOON), 11900, { personen: ['A'] }))
    const [c] = viaVerschilRegel(context(invoer, staat))
    expect(c).toMatchObject({
      id: `via-verschil:A:${LOON}`,
      regel: 'via-verschil',
      ernst: 'let-op',
      negeren: 'gezien',
      gebied: 'invulhulp',
      persoon: 'A',
      invulhulpSleutel: LOON,
      href: `/dossier/2024/aangifte/#${LOON}`,
      vingerafdruk: 'via=11900|dossier=12000',
      veld: 'persoon:A/loon:loon-1/bruto',
    })
    expect(c.uitleg).toBe('Bij Loon (Acme BV) staat in de vooraf ingevulde aangifte € 11.900, in je dossier € 12.000. Kies in de invulhulp welk bedrag je overneemt.')
    // Binnen de tolerantie van € 1 geen controle; met een keuze ook niet.
    expect(viaVerschilRegel(context(invoer, pas(LEGE_STAAT, wijktAf(veld(o, LOON), 11999, { personen: ['A'] }))))).toEqual([])
  })

  it('gedeelde schermen geven één controle, bij de eerste persoon', () => {
    const invoer = invoerMetLoon(12000)
    const o = bouw(invoer)
    const staat = pas(LEGE_STAAT, wijktAf(veld(o, WOZ), 360000, { personen: ['A'] }))
    const c = viaVerschilRegel(context(invoer, staat))
    expect(c.map((x) => x.id)).toEqual([`via-verschil:A:${WOZ}`])
    expect(c[0].vingerafdruk).toBe('via=360000|dossier=412000')
  })

  it('Klopt en daarna een ander dossierbedrag: gewijzigd-na-afvinken en via-verschil (verschil 400)', () => {
    const o = bouw(invoerMetLoon(12000))
    const staat = pas(LEGE_STAAT, klopt(veld(o, LOON), { personen: ['A'], op: OP }))
    const ctx = context(invoerMetLoon(12400), staat)
    expect(viaVerschilRegel(ctx).map((c) => c.vingerafdruk)).toEqual(['via=12000|dossier=12400'])
    const [g] = gewijzigdNaAfvinkenRegel(ctx)
    expect(g).toMatchObject({ id: 'gewijzigd-na-afvinken:A', ernst: 'let-op', negeren: 'gezien', invulhulpSleutel: LOON, vingerafdruk: `n=1|${LOON}` })
    expect(gewijzigdNaAfvinkenRegel(context(invoerMetLoon(12000), staat))).toEqual([])
  })

  it('eindcontrole: programma ingevuld en meer dan € 5 verschil met teBetalenIB', () => {
    const invoer = invoerMetLoon(12000)
    const tool = berekenHuishouden(invoer).personen[0].teBetalenIB
    const gelijk = pas(LEGE_STAAT, [{ soort: 'programma', persoon: 'A', waarde: { ib: tool + 4 } }])
    expect(eindcontroleRegel(context(invoer, gelijk))).toEqual([])
    const anders = pas(LEGE_STAAT, [{ soort: 'programma', persoon: 'A', waarde: { ib: tool + 100 } }])
    const [c] = eindcontroleRegel(context(invoer, anders))
    expect(c).toMatchObject({ id: 'eindcontrole:A', ernst: 'let-op', negeren: 'gezien', vingerafdruk: `ib=${tool + 100}|tool=${tool}`, href: '/dossier/2024/aangifte/#overzicht:A' })
    expect(c.uitleg).toContain('Kijk de schermen met een verschil na; vaak zit het in een vooraf ingevuld bedrag of de verdeling met je partner.')
  })

  it('controleer() met de regels van de invulhulp: via-verschil, gewijzigd, eindcontrole', () => {
    const o = bouw(invoerMetLoon(12000))
    let staat = pas(LEGE_STAAT, klopt(veld(o, LOON), { personen: ['A'], op: OP }))
    staat = pas(staat, wijktAf(veld(o, WOZ), 360000, { personen: ['A'] }))
    staat = pas(staat, vink(veld(o, 'partner/fipan1'), true, { personen: ['A'], op: OP }))
    staat = pas(staat, [{ soort: 'programma', persoon: 'A', waarde: { ib: 0 } }])
    const u = controleer(context(invoerMetLoon(12400), staat), invulhulpRegels)
    expect(u.alle.map((c) => c.regel)).toEqual(['via-verschil', 'via-verschil', 'gewijzigd-na-afvinken', 'eindcontrole'])
    expect(u.telling).toMatchObject({ fouten: 0, letOp: 4 })
    expect(u.blokkeertGecontroleerd).toBe(false)
    // Als gezien afgevinkt met dezelfde vingerafdruk: genegeerd.
    const g = u.alle.find((c) => c.regel === 'eindcontrole')!
    const metGezien = pas(staat, [{ soort: 'genegeerd', id: g.id, waarde: { id: g.id, ernst: 'let-op', titel: g.titel, vingerafdruk: g.vingerafdruk, op: OP } }])
    expect(controleer(context(invoerMetLoon(12400), metGezien), invulhulpRegels).genegeerd.map((x) => x.controle.id)).toEqual(['eindcontrole:A'])
  })
})
