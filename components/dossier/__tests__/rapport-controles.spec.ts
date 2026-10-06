/**
 * Ronde 2 (A3): controles in het fiscaal rapport (taak-A3 hoofdstuk 8, test 7). Met een open fout in een concept: CONCEPT
 * op elke PDF-pagina en bovenaan elk rapporttabblad, de lijst "Open fouten", `-concept` in de bestandsnaam. Zonder fout
 * niets. Bij status Ingediend met dezelfde fout geen CONCEPT en geen `-concept`, wel "Ingediend, met 1 open controle" en
 * de lijst. Een genegeerde controle met reden staat altijd in de verantwoording.
 */
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { controleerAlles } from '@/lib/controles'
import { rapportControles } from '@/lib/rapport/controles'
import { bouwRapporten } from '@/lib/rapport/rapporten'
import { rapportBestandsnaam, rapportInvoer } from '@/lib/rapport/export'
import type { RapportDocument } from '@/lib/rapport/model'
import type { DossierStatus } from '@/lib/dossier/status'
import type { AangifteStaat } from '@/lib/dossier/aangiftestaat'
import { getJaar } from '@/lib/tax/years'
import { ctx, metJaarrekening, reken } from '@/lib/controles/__tests__/hulp'
import { rapportPdfBytes } from '../rapport-pdf'
import { rapportWerkmap } from '../rapport-xlsx'

const POPPLER = !spawnSync('pdftotext', ['-v']).error
const map = mkdtempSync(join(tmpdir(), 'rapport-controles-'))

function docs(saldo: number, status: DossierStatus, staat: AangifteStaat | null = null): { docs: RapportDocument[]; concept: boolean } {
  const i = metJaarrekening(saldo)
  const r = reken(i)!
  const u = controleerAlles(ctx(i, { status, staat, ...(status === 'ingediend' ? { ingediend: { op: '2026-05-01T10:00:00.000Z', gewijzigdNa: false } } : {}) }))
  const d = bouwRapporten(i, r, getJaar(2025), 'A', {
    vandaag: '2026-10-05T10:00',
    dossierStatus: status,
    toolVersie: '0.1.0',
    naam: (id) => `Persoon ${id}`,
    controles: rapportControles(u),
  })
  return { docs: d, concept: u.exportConcept }
}

function pdfPaginas(bytes: Uint8Array, naam: string): string[] {
  const pad = join(map, naam)
  writeFileSync(pad, bytes)
  const tekst = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pad, '-'], { encoding: 'utf8' })
  const delen = tekst.split('\f')
  if (delen[delen.length - 1].trim() === '') delen.pop()
  return delen
}

/** Alle tekst van een tabblad van de werkmap. */
function bladTekst(d: RapportDocument[], blad: string): string[] {
  const w = rapportWerkmap(d, { invoer: metJaarrekening(34700) })
  const b = w.bladen.find((x) => x.sheet.startsWith(blad))!
  return b.data.flatMap((rij) => rij.map((c) => (c && typeof c === 'object' && 'value' in c ? String(c.value ?? '') : ''))).filter(Boolean)
}

describe('rapport met controles', () => {
  it('concept met een open fout: CONCEPT, de lijst Open fouten en -concept in de bestandsnaam', async () => {
    const { docs: d, concept } = docs(34700, 'concept')
    expect(concept).toBe(true)
    expect(d[0].concept).toBe(true)
    expect(d[0].verantwoording.controles).toMatchObject({ kop: 'Concept: er staat nog 1 fout open.', openTitel: 'Open fouten', open: [{ titel: 'Kapitaalsvergelijking sluit niet', waar: 'Ontwerpstudio' }] })
    expect(rapportBestandsnaam(2025, ['Persoon A'], 'pdf', { concept })).toBe('fiscaal-rapport-2025-persoon-a-concept.pdf')

    const rapport = bladTekst(d, 'Rapport')
    expect(rapport[0]).toBe('CONCEPT')
    const samenvatting = bladTekst(d, 'Samenvatting')
    expect(samenvatting[0]).toBe('CONCEPT')
    expect(samenvatting).toEqual(expect.arrayContaining(['Open fouten', 'Kapitaalsvergelijking sluit niet (Ontwerpstudio)']))

    if (POPPLER) {
      const paginas = pdfPaginas(await rapportPdfBytes(d), 'concept.pdf')
      expect(paginas.length).toBeGreaterThan(3)
      for (const p of paginas) expect(p).toContain('CONCEPT')
      const alles = paginas.join('\n')
      expect(alles).toContain('Open fouten')
      expect(alles).toContain('Concept: er staat nog 1 fout open.')
      expect(alles).toMatch(/Kapitaalsvergelijking sluit niet \(Ontwerpstudio\)/)
    }
  })

  it('zonder fout geen CONCEPT en geen lijst', async () => {
    const { docs: d, concept } = docs(35000, 'concept')
    expect(concept).toBe(false)
    expect(d[0].concept).toBeUndefined()
    expect(d[0].verantwoording.controles).toBeUndefined()
    expect(rapportBestandsnaam(2025, ['Persoon A'], 'xlsx', { concept })).toBe('fiscaal-rapport-2025-persoon-a.xlsx')
    expect(bladTekst(d, 'Rapport')).not.toContain('CONCEPT')
    if (POPPLER) expect(pdfPaginas(await rapportPdfBytes(d), 'zonder.pdf').join('\n')).not.toContain('CONCEPT')
  })

  it('Ingediend met dezelfde open fout: geen CONCEPT, wel "Ingediend, met 1 open controle" en de lijst Open controles', async () => {
    const { docs: d, concept } = docs(34700, 'ingediend')
    expect(concept).toBe(false)
    expect(d[0].concept).toBeUndefined()
    expect(d[0].verantwoording.controles).toMatchObject({ kop: 'Ingediend, met 1 open controle', openTitel: 'Open controles' })
    expect(d[0].verantwoording.controles!.open.map((x) => x.titel)).toEqual(['Kapitaalsvergelijking sluit niet'])
    expect(rapportBestandsnaam(2025, ['Persoon A'], 'pdf', { concept })).not.toContain('-concept')
    expect(bladTekst(d, 'Rapport')).not.toContain('CONCEPT')
    expect(bladTekst(d, 'Samenvatting')).toEqual(expect.arrayContaining(['Ingediend, met 1 open controle', 'Open controles']))
    if (POPPLER) {
      const alles = pdfPaginas(await rapportPdfBytes(d), 'ingediend.pdf').join('\n')
      expect(alles).not.toContain('CONCEPT')
      expect(alles).toContain('Ingediend, met 1 open controle')
      expect(alles).toContain('Open controles')
    }
  })

  it('een genegeerde controle met reden staat bij Bewust genegeerde controles, zonder CONCEPT', async () => {
    const staat: AangifteStaat = {
      versie: 1,
      genegeerd: {
        'kapitaalsvergelijking:A:ond-1': {
          id: 'kapitaalsvergelijking:A:ond-1',
          ernst: 'fout',
          titel: 'Kapitaalsvergelijking sluit niet',
          vingerafdruk: 'verschil=300',
          reden: 'Afronding in Moneybird, besproken met de adviseur',
          op: '2026-10-05T10:00:00.000Z',
        },
      },
    }
    const { docs: d, concept } = docs(34700, 'gecontroleerd', staat)
    expect(concept).toBe(false)
    expect(d[0].verantwoording.controles).toEqual({
      open: [],
      genegeerd: [{ titel: 'Kapitaalsvergelijking sluit niet', waar: 'Ontwerpstudio', reden: 'Afronding in Moneybird, besproken met de adviseur', datum: '5 oktober 2026', ernst: 'fout' }],
    })
    expect(bladTekst(d, 'Samenvatting')).toEqual(expect.arrayContaining(['Bewust genegeerde controles', 'Afronding in Moneybird, besproken met de adviseur']))
    if (POPPLER) {
      const alles = pdfPaginas(await rapportPdfBytes(d), 'genegeerd.pdf').join('\n')
      expect(alles).toContain('Bewust genegeerde controles')
      expect(alles).toContain('Afronding in Moneybird, besproken met de adviseur (5 oktober 2026)')
      expect(alles).not.toContain('CONCEPT')
    }
    expect(rapportInvoer(metJaarrekening(34700), reken(metJaarrekening(34700))!, 'A').jaar).toBe(2025)
  })
})
