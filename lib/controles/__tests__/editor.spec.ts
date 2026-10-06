/**
 * Ronde 2 (A3): de pure laag onder useControles (lib/controles/editor.ts): de context zoals de editor en de export die
 * bouwen, ingediend-met-fouten in de tweede doorgang, en de strengheid.
 */
import { describe, expect, it } from 'vitest'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { controleerEditor, editorControleContext, type EditorControleInvoer } from '../editor'
import { VANDAAG, invoer, metJaarrekening, reken } from './hulp'

function basis(i: HuishoudenInvoer, x: Partial<EditorControleInvoer> = {}): EditorControleInvoer {
  return {
    jaar: i.jaar,
    invoer: i,
    resultaat: reken(i),
    params: getJaar(i.jaar),
    status: 'concept',
    staat: null,
    ingediend: null,
    gewijzigd: false,
    vorig: null,
    vandaag: VANDAAG,
    ...x,
  }
}

const OP = '2026-05-01T10:00:00.000Z'

describe('editorControleContext', () => {
  it('concept: geen moment van indienen, ook als het opgeslagen jaar dat had', () => {
    const c = editorControleContext(basis(invoer(), { ingediend: { op: OP, gewijzigdNa: false } }))
    expect(c.ingediend).toBeNull()
  })

  it('Ingediend met niet-opgeslagen wijzigingen telt als gewijzigd na het indienen', () => {
    const c = editorControleContext(basis(invoer(), { status: 'ingediend', ingediend: { op: OP, gewijzigdNa: false }, gewijzigd: true }))
    expect(c.ingediend).toEqual({ op: OP, gewijzigdNa: true })
    const u = controleerEditor(basis(invoer(), { status: 'ingediend', ingediend: { op: OP, gewijzigdNa: false }, gewijzigd: true }))
    expect(u.uitkomst.open.map((x) => x.id)).toContain('ingediend-gewijzigd')
  })

  it('Ingediend zonder wijzigingen: geen ingediend-gewijzigd', () => {
    const u = controleerEditor(basis(invoer(), { status: 'ingediend', ingediend: { op: OP, gewijzigdNa: false } }))
    expect(u.uitkomst.open.map((x) => x.id)).not.toContain('ingediend-gewijzigd')
  })

  it('net op Ingediend gezet (nog niet opgeslagen): geen moment van indienen', () => {
    expect(editorControleContext(basis(invoer(), { status: 'ingediend', ingediend: null, gewijzigd: true })).ingediend).toBeNull()
  })
})

describe('controleerEditor', () => {
  const metFout = () => metJaarrekening(34700) // KV2: 300 verschil boven de tolerantie

  it('concept met een fout: rustig, CONCEPT bij de export, geen ingediend-met-fouten', () => {
    const { uitkomst, streng } = controleerEditor(basis(metFout()))
    expect(streng).toBe(false)
    expect(uitkomst.telling.fouten).toBe(1)
    expect(uitkomst.exportConcept).toBe(true)
    expect(uitkomst.alle.map((c) => c.id)).not.toContain('ingediend-met-fouten')
  })

  it('Ingediend met een open fout: streng, ingediend-met-fouten als let op, geen CONCEPT', () => {
    const { uitkomst, streng } = controleerEditor(basis(metFout(), { status: 'ingediend', ingediend: { op: OP, gewijzigdNa: false } }))
    expect(streng).toBe(true)
    const extra = uitkomst.open.find((c) => c.id === 'ingediend-met-fouten')
    expect(extra?.ernst).toBe('let-op')
    expect(extra?.vingerafdruk).toBe('aantal=1')
    expect(uitkomst.exportConcept).toBe(false)
    expect(uitkomst.exportIngediendOpen).toBe(1)
  })

  it('streng in een concept zodra controles.streng in de aangiftestaat staat', () => {
    const { streng } = controleerEditor(basis(metFout(), { staat: { versie: 1, controles: { streng: { op: OP, door: 'paneel' } } } }))
    expect(streng).toBe(true)
  })

  it('een geldige negering (reden) haalt de fout uit de telling', () => {
    const eerst = controleerEditor(basis(metFout())).uitkomst.open.find((c) => c.ernst === 'fout')!
    const { uitkomst } = controleerEditor(
      basis(metFout(), {
        staat: { versie: 1, genegeerd: { [eerst.id]: { id: eerst.id, ernst: 'fout', titel: eerst.titel, vingerafdruk: eerst.vingerafdruk, reden: 'Afronding in Moneybird', op: OP } } },
      }),
    )
    expect(uitkomst.telling.fouten).toBe(0)
    expect(uitkomst.telling.genegeerd).toBe(1)
    expect(uitkomst.blokkeertGecontroleerd).toBe(false)
  })
})
