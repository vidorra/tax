/** Het voorbeeldscript draait en schrijft per bron het rapport van persoon A en van beide partners als PDF en Excel. */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx')

describe('scripts/rapport-voorbeeld.ts', () => {
  it('maakt PDF en Excel voor het voorbeeldhuishouden 2024 en 2021 (met jaarrekening)', () => {
    const map = mkdtempSync(join(tmpdir(), 'rapport-voorbeeld-'))
    try {
      const r = spawnSync(TSX, ['scripts/rapport-voorbeeld.ts', map, '--datum', '2026-10-04'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 })
      expect(r.status, r.stderr).toBe(0)
      for (const sub of ['voorbeeld-2024', 'voorbeeld-2021']) {
        const jaar = sub.slice(-4)
        for (const naam of [`fiscaal-rapport-${jaar}-persoon-a`, `fiscaal-rapport-${jaar}-persoon-a-en-persoon-b`]) {
          const pdf = join(map, sub, `${naam}.pdf`)
          const xlsx = join(map, sub, `${naam}.xlsx`)
          expect(existsSync(pdf), pdf).toBe(true)
          expect(existsSync(xlsx), xlsx).toBe(true)
          expect(readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-')
          // Een .xlsx is een zip-bestand.
          expect(readFileSync(xlsx).subarray(0, 2).toString()).toBe('PK')
        }
      }
      // Lokaal staan er ook mappen voor de privé-fixtures (prive-*): twee bestanden per persoon, vier bij partners.
      const mappen = readdirSync(map)
      expect(mappen).toEqual(expect.arrayContaining(['voorbeeld-2024', 'voorbeeld-2021']))
      const bestanden = mappen.flatMap((m) => readdirSync(join(map, m)))
      expect(r.stdout).toContain(`${bestanden.length} bestanden geschreven.`)
    } finally {
      rmSync(map, { recursive: true, force: true })
    }
  }, 90_000)

  it('zonder map een gebruiksregel en exitcode 1', () => {
    const r = spawnSync(TSX, ['scripts/rapport-voorbeeld.ts'], { cwd: ROOT, encoding: 'utf8', timeout: 30_000 })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Gebruik: npm run rapport:voorbeeld')
  }, 40_000)
})
