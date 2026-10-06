import { describe, expect, it } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { naarInvoer, standaardState } from '@/lib/calculator/formulier'
import { controleerGrenzen, leegInvoer, LIJST_GRENZEN, MAX_BEDRAG, valideerInvoer } from '..'

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe('grenzen op de invoer', () => {
  it('voorbeeld- en lege invoer vallen binnen de grenzen', () => {
    expect(controleerGrenzen(voorbeeldInvoer(2021))).toEqual([])
    expect(controleerGrenzen(voorbeeldInvoer(2024))).toEqual([])
    expect(controleerGrenzen(leegInvoer(2026))).toEqual([])
    expect(controleerGrenzen(naarInvoer(standaardState(2027, 'brief-29-09')))).toEqual([])
  })

  it('het dossier weigert prototype-sleutels (eigen __proto__ uit JSON.parse)', () => {
    const tekst = JSON.stringify(voorbeeldInvoer(2024)).replace('"box3":{', '"box3":{"__proto__":{"x":1},')
    const invoer = JSON.parse(tekst)
    expect(Object.keys(invoer.box3)).toContain('__proto__')
    expect(valideerInvoer(invoer).join(' ')).toMatch(/__proto__/)
    const met = JSON.parse(JSON.stringify(voorbeeldInvoer(2024)).replace('{', '{"constructor":{"prototype":{"x":1}},'))
    expect(valideerInvoer(met).join(' ')).toMatch(/constructor/)
  })

  it('weigert te lange lijsten, absurde bedragen en diepe nesting zonder bedragen te noemen', () => {
    const veel = kloon(voorbeeldInvoer(2024)) as Record<string, any>
    veel.kinderen = Array.from({ length: LIJST_GRENZEN.kinderen + 1 }, (_, i) => ({ id: `k${i}`, geboortedatum: '2020-01-01' }))
    expect(valideerInvoer(veel)).toEqual([`invoer.kinderen: maximaal ${LIJST_GRENZEN.kinderen} items`])

    const groot = kloon(voorbeeldInvoer(2024)) as Record<string, any>
    groot.box3.posities[0].waardeBegin = MAX_BEDRAG * 10
    const fouten = valideerInvoer(groot)
    expect(fouten).toEqual(['invoer.box3.posities[0].waardeBegin: getal buiten het toegestane bereik'])
    expect(fouten.join(' ')).not.toContain(String(MAX_BEDRAG * 10))

    let diep: unknown = 1
    for (let i = 0; i < 100_000; i++) diep = [diep]
    expect(controleerGrenzen({ ...kloon(voorbeeldInvoer(2024)), extra: diep }).join(' ')).toMatch(/te diep genest/)
  })
})
