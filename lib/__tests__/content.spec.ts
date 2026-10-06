import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Copyregels uit CLAUDE.md: geen em-dashes en geen pijlen in tekst die de
 * gebruiker ziet. We lezen de bron met de TypeScript-parser en kijken alleen
 * naar JSX-tekst en string- en template-literals; commentaar en reguliere
 * expressies (zoals de dash-vervanging in de PDF-export) tellen niet mee.
 */

const ROOT = join(__dirname, '..', '..')
const MAPPEN = ['app', 'components']
const VERBODEN = /[—→←⇒⇐↔⇔]/u

function bestanden(map: string): string[] {
  const uit: string[] = []
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam)
    if (statSync(pad).isDirectory()) {
      if (naam === '__tests__' || naam === 'node_modules') continue
      uit.push(...bestanden(pad))
    } else if (/\.(tsx?|jsx?)$/.test(naam)) {
      uit.push(pad)
    }
  }
  return uit
}

interface Treffer {
  bestand: string
  regel: number
  tekst: string
}

function zoekVerboden(bestand: string, bron: string = readFileSync(bestand, 'utf8')): Treffer[] {
  const sf = ts.createSourceFile(bestand, bron, ts.ScriptTarget.Latest, true, bestand.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const treffers: Treffer[] = []
  const bekijk = (node: ts.Node) => {
    let tekst: string | null = null
    if (ts.isJsxText(node)) tekst = node.text
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) tekst = node.text
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) tekst = node.text
    if (tekst !== null && VERBODEN.test(tekst)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      treffers.push({ bestand: relative(ROOT, bestand), regel: line + 1, tekst: tekst.trim().slice(0, 80) })
    }
    ts.forEachChild(node, bekijk)
  }
  bekijk(sf)
  return treffers
}

describe('copyregels in app en components', () => {
  const alle = MAPPEN.flatMap((m) => bestanden(join(ROOT, m)))

  it('vindt de bronbestanden', () => {
    expect(alle.length).toBeGreaterThan(50)
  })

  it('bevat geen em-dashes of pijlen in JSX-tekst en strings', () => {
    const treffers = alle.flatMap((b) => zoekVerboden(b))
    expect(treffers, treffers.map((t) => `${t.bestand}:${t.regel} ${t.tekst}`).join('\n')).toEqual([])
  })

  it('herkent een em-dash en een pijl, maar niet in commentaar of een regex', () => {
    const voorbeeld = [
      '// commentaar met \u2014 en \u2192 mag',
      'const r = /[\u2013\u2014]/g',
      'export const A = () => <p>Winst \u2014 kosten</p>',
      "export const B = 'van 2026 \u2192 2027'",
      'export const C = `ok ${r.source}`',
    ].join('\n')
    const gevonden = zoekVerboden(join(ROOT, 'voorbeeld.tsx'), voorbeeld).map((t) => t.tekst)
    expect(gevonden).toEqual(['Winst — kosten', 'van 2026 → 2027'])
  })
})
