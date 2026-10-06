import { describe, expect, it } from 'vitest'
import { LEGE_STAAT, pasStaatToe, schoonStaat, schoonWijzigingen, type AangifteStaat } from '../aangiftestaat'

const OP = '2026-10-05T10:00:00.000Z'

describe('aangiftestaat: wijzigingen', () => {
  it('voegt vinkjes per persoon samen en verwijdert met null', () => {
    const w = schoonWijzigingen([
      { soort: 'veld', persoon: 'A', sleutel: 'loon:A/loon.0', waarde: { afgevinkt: { vingerafdruk: '12000', op: OP } } },
      { soort: 'veld', persoon: 'B', sleutel: 'loon:B/loon.0', waarde: { via: 3000, keuze: 'uitzoeken' } },
    ])
    if ('fout' in w) throw new Error(w.fout)
    const r1 = pasStaatToe(LEGE_STAAT, w.wijzigingen)
    if ('fout' in r1) throw new Error(r1.fout)
    expect(r1.staat.invulhulp?.velden.A?.['loon:A/loon.0']?.afgevinkt?.vingerafdruk).toBe('12000')
    expect(r1.staat.invulhulp?.velden.B?.['loon:B/loon.0']).toEqual({ via: 3000, keuze: 'uitzoeken' })
    const r2 = pasStaatToe(r1.staat, [{ soort: 'veld', persoon: 'A', sleutel: 'loon:A/loon.0', waarde: null }])
    if ('fout' in r2) throw new Error(r2.fout)
    expect(r2.staat.invulhulp?.velden.A).toEqual({})
    // De oorspronkelijke staat blijft ongewijzigd.
    expect(r1.staat.invulhulp?.velden.A?.['loon:A/loon.0']).toBeDefined()
  })

  it('weigert een fout negeren zonder reden, een onbekende soort en verboden sleutels', () => {
    expect(schoonWijzigingen([{ soort: 'genegeerd', id: 'kapitaalsvergelijking:A:0', waarde: { id: 'kapitaalsvergelijking:A:0', ernst: 'fout', titel: 'X', vingerafdruk: 'v', op: OP } }])).toHaveProperty('fout')
    expect(schoonWijzigingen([{ soort: 'iets', waarde: 1 }])).toHaveProperty('fout')
    expect(schoonWijzigingen([{ soort: 'terugvraag', sleutel: '__proto__', waarde: { status: 'open', op: OP } }])).toHaveProperty('fout')
    expect(schoonWijzigingen([])).toHaveProperty('fout')
  })

  it('accepteert een fout negeren met reden, en terugvraag- en planningswijzigingen', () => {
    const w = schoonWijzigingen([
      { soort: 'genegeerd', id: 'kapitaalsvergelijking:A:0', waarde: { id: 'kapitaalsvergelijking:A:0', ernst: 'fout', titel: 'Kapitaalsvergelijking sluit niet', vingerafdruk: 'kv=1|s=2', reden: 'Afronding', op: OP } },
      { soort: 'terugvraag', sleutel: 'positie-1/bb-1', waarde: { status: 'aangevraagd', op: OP } },
      { soort: 'planning', waarde: { verwachteDagtekening: '2027-10-01' } },
    ])
    if ('fout' in w) throw new Error(w.fout)
    const r = pasStaatToe(LEGE_STAAT, w.wijzigingen)
    if ('fout' in r) throw new Error(r.fout)
    expect(r.staat.genegeerd?.['kapitaalsvergelijking:A:0']?.reden).toBe('Afronding')
    expect(r.staat.terugvragen?.['positie-1/bb-1']?.status).toBe('aangevraagd')
    expect(r.staat.planning).toEqual({ verwachteDagtekening: '2027-10-01' })
  })
})

describe('aangiftestaat: schoonStaat', () => {
  it('houdt wat klopt en meldt wat wegvalt', () => {
    const ruw = {
      versie: 1,
      invulhulp: { velden: { A: { 'x/y': { via: 10 }, 'kapot sleutel': { via: 1 } }, Z: {} } },
      terugvragen: { 'p/b': { status: 'onbekend', op: OP } },
    }
    const { staat, weggelaten } = schoonStaat(ruw)
    expect(staat.invulhulp?.velden.A).toEqual({ 'x/y': { via: 10 } })
    expect(weggelaten).toEqual(expect.arrayContaining(['invulhulp.A.kapot sleutel', 'invulhulp.velden.Z', 'terugvragen.p/b']))
    const leeg: AangifteStaat = schoonStaat(null).staat
    expect(leeg).toEqual(LEGE_STAAT)
  })
})
