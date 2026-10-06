/**
 * Ronde 2 (contract, na de nacontrole): één eigenaar per veld en per regeling. Na de integratie staan hier de registers
 * van alle onderdelen; een patroon of regeling-id die twee keer voorkomt, is een dubbele registratie
 * (lib/dossier/veldregister/index.ts).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REGELINGEN, VELDREGISTER } from '../veldregister'
import { sectieVan } from '../zoeken'

/** De sectie-ankers op de jaarpagina, zoals de secties ze zetten (`<Section id="woning">`, `id={\`loon-${persoon.id}\`}`). */
function sectieIdsOpDePagina(): Set<string> {
  const map = join(process.cwd(), 'components/dossier/secties')
  const ids = new Set<string>()
  for (const f of readdirSync(map).filter((x) => x.endsWith('.tsx'))) {
    const tekst = readFileSync(join(map, f), 'utf8')
    for (const m of tekst.matchAll(/<Section\s+id=(?:"([^"]+)"|\{`([^`]+)`\})/g)) ids.add((m[1] ?? m[2]).replace('${persoon.id}', '{persoon}'))
  }
  return ids
}

const dubbelen = (lijst: string[]) => [...new Set(lijst.filter((x, i) => lijst.indexOf(x) !== i))]

describe('veldregister', () => {
  it('elk patroon staat in één register', () => {
    expect(dubbelen(VELDREGISTER.map((v) => v.patroon))).toEqual([])
  })

  it('elke regeling staat er één keer', () => {
    expect(dubbelen(REGELINGEN.map((r) => r.id))).toEqual([])
  })

  it('elke sectie in het register bestaat op de jaarpagina (anders scrolt "Je staat nu bij …" nergens heen)', () => {
    const opPagina = sectieIdsOpDePagina()
    expect(opPagina).toContain('ondernemingen-{persoon}')
    expect(opPagina).toContain('woning')
    const onbekend = [...new Set(VELDREGISTER.map((v) => v.sectie))].filter((s) => !opPagina.has(s))
    expect(onbekend).toEqual([])
  })

  it('een veld van een persoon gaat naar de sectie van die persoon', () => {
    const persoonsvelden = VELDREGISTER.filter((v) => v.patroon.startsWith('persoon:*/') && v.sectie.includes('{persoon}'))
    expect(persoonsvelden.length).toBeGreaterThan(100)
    for (const v of persoonsvelden) expect(sectieVan(v, 'B')).toMatch(/-B$/)
  })
})
