import { describe, expect, it } from 'vitest'
import { LEGE_STAAT, pasStaatToe, schoonStaat, schoonWijzigingen } from '@/lib/dossier/aangiftestaat'
import { beoordeelNegering, controlesStreng, geldigeNegering, kapitaalsvergelijkingErnst, kapitaalsvergelijkingTolerantie } from '../negeren'
import type { GenegeerdeControle } from '../types'

const OP = '2026-10-05T10:00:00.000Z'
const neg = (x: Partial<GenegeerdeControle> = {}): GenegeerdeControle => ({ id: 'kv:A:ond-1', ernst: 'fout', titel: 'Kapitaalsvergelijking sluit niet', vingerafdruk: 'verschil=312', reden: 'Afronding in Moneybird', op: OP, ...x })

describe('negeren', () => {
  const fout = { ernst: 'fout' as const, negeren: 'met-reden' as const, vingerafdruk: 'verschil=312' }

  it('telt alleen met dezelfde ernst, een reden bij een fout en een regel die negeren toestaat', () => {
    expect(beoordeelNegering(fout, neg())).toBe('geldig')
    expect(beoordeelNegering(fout, neg({ reden: '  ' }))).toBe('ongeldig')
    expect(beoordeelNegering(fout, neg({ ernst: 'let-op' }))).toBe('ongeldig')
    expect(beoordeelNegering({ ...fout, negeren: 'nee' }, neg())).toBe('ongeldig')
    expect(beoordeelNegering({ ernst: 'info', negeren: 'gezien', vingerafdruk: 'x' }, neg({ ernst: 'info', vingerafdruk: 'x' }))).toBe('ongeldig')
    expect(beoordeelNegering(fout, undefined)).toBe('ongeldig')
  })

  it('gaat weer open als het beslissende gegeven verandert, niet bij andere bedragen', () => {
    expect(beoordeelNegering({ ...fout, vingerafdruk: 'verschil=400' }, neg())).toBe('weer-open')
    expect(geldigeNegering(fout, neg())).toBe(true)
  })

  it('let op met gezien hoeft geen reden', () => {
    expect(beoordeelNegering({ ernst: 'let-op', negeren: 'gezien', vingerafdruk: 'v' }, neg({ ernst: 'let-op', reden: undefined, vingerafdruk: 'v' }))).toBe('geldig')
  })
})

describe('rustig invullen', () => {
  it('concept is rustig tot controles.streng is gezet; andere statussen altijd streng', () => {
    expect(controlesStreng('concept', LEGE_STAAT)).toBe(false)
    expect(controlesStreng('gecontroleerd', null)).toBe(true)
    expect(controlesStreng('ingediend', undefined)).toBe(true)
    const w = schoonWijzigingen([{ soort: 'controles-streng', waarde: { op: OP, door: 'export' } }])
    if ('fout' in w) throw new Error(w.fout)
    const r = pasStaatToe(LEGE_STAAT, w.wijzigingen)
    if ('fout' in r) throw new Error(r.fout)
    expect(controlesStreng('concept', r.staat)).toBe(true)
    // Een tweede keer verandert niets: het eerste moment blijft staan.
    const r2 = pasStaatToe(r.staat, [{ soort: 'controles-streng', waarde: { op: '2026-11-01T10:00:00.000Z', door: 'paneel' } }])
    if ('fout' in r2) throw new Error(r2.fout)
    expect(r2.staat.controles?.streng).toEqual({ op: OP, door: 'export' })
    expect(schoonStaat(r2.staat).staat.controles?.streng?.door).toBe('export')
    expect(schoonWijzigingen([{ soort: 'controles-streng', waarde: { op: OP, door: 'iets' } }])).toHaveProperty('fout')
  })
})

describe('kapitaalsvergelijking', () => {
  it('binnen € 1 niets, daarna let op tot de tolerantie, daarboven fout', () => {
    expect(kapitaalsvergelijkingTolerantie(4)).toBe(10)
    expect(kapitaalsvergelijkingTolerantie(14)).toBe(14)
    expect(kapitaalsvergelijkingErnst(1, 14)).toBeNull()
    expect(kapitaalsvergelijkingErnst(-9, 14)).toBe('let-op')
    expect(kapitaalsvergelijkingErnst(15, 14)).toBe('fout')
  })
})

describe('controleer (contract)', () => {
  it('sorteert op ernst en gebied, ontdubbelt op id en past negeringen toe', async () => {
    const { controleer } = await import('../index')
    const c = (id: string, ernst: 'fout' | 'let-op' | 'info', gebied: 'box3' | 'huishouden', negeren: 'met-reden' | 'gezien' | 'nee' = 'met-reden', vingerafdruk = 'v') => ({
      id,
      regel: id.split(':')[0],
      ernst,
      titel: id,
      uitleg: '',
      gebied,
      veld: null,
      negeren,
      vingerafdruk,
    })
    const regels = [
      () => [c('info-x', 'info', 'huishouden', 'gezien'), c('kv:A:ond-1', 'fout', 'box3', 'met-reden', 'verschil=312')],
      () => [c('geboortedatum:A', 'fout', 'huishouden', 'nee'), c('kv:A:ond-1', 'fout', 'box3')],
      () => [c('lo', 'let-op', 'huishouden', 'gezien', 'a')],
    ]
    const staat = {
      versie: 1 as const,
      genegeerd: {
        'kv:A:ond-1': neg(),
        'geboortedatum:A': neg({ id: 'geboortedatum:A', vingerafdruk: 'v' }),
        lo: neg({ id: 'lo', ernst: 'let-op', vingerafdruk: 'b', reden: undefined }),
      },
    }
    const ctx = { jaar: 2026, invoer: {} as never, resultaat: null, params: {} as never, status: 'concept' as const, staat, vandaag: '2026-10-05' }
    const u = controleer(ctx, regels)
    expect(u.alle.map((x) => x.id)).toEqual(['geboortedatum:A', 'kv:A:ond-1', 'lo', 'info-x'])
    expect(u.genegeerd.map((g) => g.controle.id)).toEqual(['kv:A:ond-1'])
    // 'nee' is niet te negeren; de let op is weer open omdat de vingerafdruk veranderde.
    expect(u.open.map((x) => x.id)).toEqual(['geboortedatum:A', 'lo', 'info-x'])
    expect(u.weerOpen.map((x) => x.id)).toEqual(['lo'])
    expect(u.telling).toEqual({ fouten: 1, letOp: 1, info: 1, genegeerd: 1 })
    expect(u.blokkeertGecontroleerd).toBe(true)
    expect(u.exportConcept).toBe(true)
    expect(u.exportIngediendOpen).toBe(0)
    expect(u.zonderBerekening).toBe(true)
  })

  it('bij status Ingediend met open fouten geen CONCEPT, wel het aantal open controles voor de kopregel', async () => {
    const { controleer } = await import('../index')
    const fout = { id: 'kv:A:ond-1', regel: 'kv', ernst: 'fout' as const, titel: 'kv', uitleg: '', gebied: 'onderneming' as const, veld: null, negeren: 'met-reden' as const, vingerafdruk: 'verschil=312' }
    const basis = { jaar: 2025, invoer: {} as never, resultaat: null, params: {} as never, staat: null, vandaag: '2026-10-05' }
    const ingediend = controleer({ ...basis, status: 'ingediend' }, [() => [fout]])
    expect(ingediend.exportConcept).toBe(false)
    expect(ingediend.exportIngediendOpen).toBe(1)
    expect(ingediend.blokkeertGecontroleerd).toBe(true)
    const concept = controleer({ ...basis, status: 'concept' }, [() => [fout]])
    expect(concept.exportConcept).toBe(true)
    expect(concept.exportIngediendOpen).toBe(0)
    const zonderFout = controleer({ ...basis, status: 'ingediend' }, [() => []])
    expect(zonderFout.exportConcept).toBe(false)
    expect(zonderFout.exportIngediendOpen).toBe(0)
  })
})
