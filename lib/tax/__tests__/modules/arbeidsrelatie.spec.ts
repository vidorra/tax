import { describe, expect, it } from 'vitest'
import type { OpdrachtgeverInvoer } from '../../types'
import { getJaar, kloon } from '../../years'
import { beoordeelArbeidsrelatie } from '../../modules/arbeidsrelatie'

const p2026 = getJaar(2026)
const p2024 = getJaar(2024)

const klanten: OpdrachtgeverInvoer[] = [
  { naam: 'Klant X', omzet: 80000, uurtarief: 95, duurMaanden: 10 },
  { naam: 'Klant Y', omzet: 20000, uurtarief: 35, viaPlatform: true, duurMaanden: 18 },
]

const ids = (r: { waarschuwingen: Array<{ id: string }> }) => r.waarschuwingen.map((w) => w.id)

describe('arbeidsrelatie', () => {
  it('kerngetallen', () => {
    const r = beoordeelArbeidsrelatie(klanten, { params: p2026, jaar: 2026 })
    expect(r.grootsteAandeel).toBeCloseTo(0.8, 6)
    expect(r.laagsteUurtarief).toBe(35)
    expect(r.aantalOpdrachtgevers).toBe(2)
  })

  it('2026: concentratie, rechtsvermoeden vanaf 31-12-2026, platform en lange opdracht', () => {
    const r = beoordeelArbeidsrelatie(klanten, { params: p2026, jaar: 2026 })
    expect(ids(r)).toEqual(
      expect.arrayContaining(['arbeidsrelatie-concentratie', 'arbeidsrelatie-rechtsvermoeden', 'arbeidsrelatie-platform', 'arbeidsrelatie-duur', 'arbeidsrelatie-handhaving', 'arbeidsrelatie-geen-oordeel']),
    )
    const rv = r.waarschuwingen.find((w) => w.id === 'arbeidsrelatie-rechtsvermoeden')!
    expect(rv.tekst).toContain('31 december 2026')
    expect(rv.tekst).toContain('Klant Y')
    expect(rv.tekst).not.toContain('Klant X')
    const h = r.waarschuwingen.find((w) => w.id === 'arbeidsrelatie-handhaving')!
    expect(h.tekst).toContain('vergrijpboetes zijn mogelijk')
  })

  it('2024: moratorium en nog geen rechtsvermoeden', () => {
    const r = beoordeelArbeidsrelatie(klanten, { params: p2024, jaar: 2024 })
    expect(ids(r)).not.toContain('arbeidsrelatie-rechtsvermoeden')
    expect(r.waarschuwingen.find((w) => w.id === 'arbeidsrelatie-handhaving')!.tekst).toContain('moratorium')
  })

  it('tarief precies op de drempel valt onder het rechtsvermoeden', () => {
    const r = beoordeelArbeidsrelatie([{ naam: 'A', omzet: 10000, uurtarief: 38 }], { params: p2026, jaar: 2026 })
    expect(ids(r)).toContain('arbeidsrelatie-rechtsvermoeden')
    const r2 = beoordeelArbeidsrelatie([{ naam: 'A', omzet: 10000, uurtarief: 38.01 }], { params: p2026, jaar: 2026 })
    expect(ids(r2)).not.toContain('arbeidsrelatie-rechtsvermoeden')
  })

  it('Zelfstandigenwet: te weinig opdrachtgevers als de wet actief is', () => {
    const p = kloon(p2026)
    p.arbeidsrelatie.waarde.zelfstandigenwet = { actief: true, minOpdrachtgevers: 3, toetsJaren: 2 }
    const r = beoordeelArbeidsrelatie(klanten, { params: p, jaar: 2028 })
    expect(ids(r)).toContain('arbeidsrelatie-zelfstandigenwet')
    expect(ids(beoordeelArbeidsrelatie(klanten, { params: p2026, jaar: 2026 }))).not.toContain('arbeidsrelatie-zelfstandigenwet')
  })

  it('spreiding zonder signalen geeft toch altijd de melding dat dit geen oordeel is', () => {
    const r = beoordeelArbeidsrelatie(
      [
        { naam: 'A', omzet: 30000, uurtarief: 90 },
        { naam: 'B', omzet: 30000, uurtarief: 90 },
        { naam: 'C', omzet: 30000, uurtarief: 90 },
      ],
      { params: p2026, jaar: 2026 },
    )
    expect(ids(r)).not.toContain('arbeidsrelatie-concentratie')
    const g = r.waarschuwingen.find((w) => w.id === 'arbeidsrelatie-geen-oordeel')!
    expect(g.tekst).toContain('geen oordeel')
    expect(g.tekst).toContain('webmodule Beoordeling arbeidsrelatie')
  })

  it('lege lijst', () => {
    const r = beoordeelArbeidsrelatie([], { params: p2026, jaar: 2026 })
    expect(r.grootsteAandeel).toBe(0)
    expect(r.laagsteUurtarief).toBeNull()
    expect(r.aantalOpdrachtgevers).toBe(0)
    expect(ids(r)).toContain('arbeidsrelatie-geen-oordeel')
  })

  it('gemiddelde omzet per uur als uren zijn opgegeven', () => {
    const r = beoordeelArbeidsrelatie(klanten, { params: p2026, jaar: 2026, urenOnderneming: 1600 })
    expect(r.uitleg.find((u) => u.id === 'arbeidsrelatie.gemiddeld-uurtarief')!.bedrag).toBeCloseTo(62.5, 6)
  })

  it('geen em-dashes in de teksten', () => {
    const r = beoordeelArbeidsrelatie(klanten, { params: p2026, jaar: 2026, urenOnderneming: 1600 })
    expect(JSON.stringify(r)).not.toContain('—')
  })
})
