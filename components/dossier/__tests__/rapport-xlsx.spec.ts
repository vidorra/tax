/**
 * Excel-weergave van het rapport: in Node geschreven, uitgepakt met node:zlib (een xlsx is een zip) en nagekeken op
 * tabbladen, getalformaten, randen en waarden. Als python3 met openpyxl er is, wordt de werkmap daar ook mee
 * geopend.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { platteRegels } from '@/lib/rapport/plat'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { BEDRAG_FORMAAT, PROCENT_FORMAAT, bladNaam, rapportWerkmap, rapportXlsxBytes } from '../rapport-xlsx'
import { voorbeeldRapport, voorbeeldRapportPartner } from './rapport-voorbeeld'

const fixture: { invoer: HuishoudenInvoer } = { invoer: voorbeeldInvoer(2024) }
const docs = [voorbeeldRapport(), voorbeeldRapportPartner()]
const map = mkdtempSync(join(tmpdir(), 'rapport-xlsx-'))

/** Pakt een zip uit met node:zlib: centrale map lezen, dan per bestand 'stored' of 'deflate'. */
function pakUit(bytes: Uint8Array): Record<string, string> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eind = buf.length - 22
  while (eind >= 0 && buf.readUInt32LE(eind) !== 0x06054b50) eind--
  if (eind < 0) throw new Error('Geen zip')
  const aantal = buf.readUInt16LE(eind + 10)
  let p = buf.readUInt32LE(eind + 16)
  const uit: Record<string, string> = {}
  for (let i = 0; i < aantal; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Kapotte centrale map')
    const methode = buf.readUInt16LE(p + 10)
    const grootte = buf.readUInt32LE(p + 20)
    const naamLengte = buf.readUInt16LE(p + 28)
    const extra = buf.readUInt16LE(p + 30)
    const commentaar = buf.readUInt16LE(p + 32)
    const lokaal = buf.readUInt32LE(p + 42)
    const naam = buf.toString('utf8', p + 46, p + 46 + naamLengte)
    const start = lokaal + 30 + buf.readUInt16LE(lokaal + 26) + buf.readUInt16LE(lokaal + 28)
    const data = buf.subarray(start, start + grootte)
    uit[naam] = (methode === 8 ? inflateRawSync(data) : data).toString('utf8')
    p += 46 + naamLengte + extra + commentaar
  }
  return uit
}

const PYTHON = (() => {
  const r = spawnSync('python3', ['-c', 'import openpyxl'])
  return !r.error && r.status === 0
})()

describe('bladNaam', () => {
  it('kort in tot 31 tekens, haalt verboden tekens weg en maakt namen uniek', () => {
    const bezet = new Set<string>()
    const lang = bladNaam('Rapport Een heel lange naam van een belastingplichtige', bezet)
    expect(lang.length).toBeLessThanOrEqual(31)
    expect(bladNaam('Rapport A/B: [test]*?', bezet)).toBe('Rapport A B test')
    const tweede = bladNaam('Rapport Een heel lange naam van een belastingplichtige', bezet)
    expect(tweede).not.toBe(lang)
    expect(tweede.length).toBeLessThanOrEqual(31)
    expect(tweede.endsWith('(2)')).toBe(true)
    expect(bladNaam("'''", bezet)).toBe('Blad')
  })
})

describe('rapportWerkmap', () => {
  it('maakt een tabblad per document plus Gegevens, Invoer, Parameters en Samenvatting', () => {
    const w = rapportWerkmap(docs, { invoer: fixture.invoer })
    expect(w.bladen.map((b) => b.sheet)).toEqual(['Rapport Persoon A', 'Rapport Persoon B', 'Gegevens', 'Invoer', 'Parameters', 'Samenvatting'])
    expect(w.opties).toMatchObject({ fontFamily: 'Times New Roman', fontSize: 10 })
    for (const b of w.bladen) expect(b.sheet.length).toBeLessThanOrEqual(31)
    // Gegevens: kop plus één rij per bedrag.
    expect(w.bladen[2].data.length).toBe(platteRegels(docs).length + 1)
    // Meegegeven platte regels worden gebruikt.
    const eigen = rapportWerkmap(docs, { invoer: fixture.invoer, regels: platteRegels(docs).slice(0, 3) })
    expect(eigen.bladen[2].data.length).toBe(4)
    expect(() => rapportWerkmap([], { invoer: fixture.invoer })).toThrow()
  })

  it('5.6.1: antwoord, kolomkoppen Begin en Einde en datums links in hun kolom, andere vragen rechts in H', () => {
    const blad = rapportWerkmap(docs, { invoer: fixture.invoer }).bladen[0].data
    const rij = (pred: (r: (typeof blad)[number]) => boolean) => blad.find(pred)!
    const waarde = (r: (typeof blad)[number], i: number) => (r[i] as { value?: unknown } | null | undefined)?.value
    // Kolom G (6) is B van het rapport, F (5) is A.
    const vraag = rij((r) => waarde(r, 1) === 'Is de naam van de onderneming gewijzigd?')
    expect(vraag[6]).toMatchObject({ value: 'nee', align: 'left' })
    expect(vraag[7] ?? null).toBeNull()
    const koppen = rij((r) => waarde(r, 5) === 'Begin')
    expect(koppen[5]).toMatchObject({ align: 'left', fontWeight: 'bold', fontStyle: 'italic' })
    expect(koppen[6]).toMatchObject({ value: 'Einde', align: 'left' })
    const datums = rij((r) => waarde(r, 1) === 'Begin- en einddatum van boekjaar')
    expect(datums[5]).toMatchObject({ value: '01-01-2024', align: 'left' })
    expect(datums[6]).toMatchObject({ value: '31-12-2024', align: 'left' })
    const tonnage = rij((r) => waarde(r, 1) === 'Wordt er dit boekjaar gebruik gemaakt van de tonnageregeling?')
    expect(tonnage[7]).toMatchObject({ value: 'nee', align: 'right' })
    // Kolomkoppen zonder uitlijning blijven rechts boven de bedragen.
    const fiscaal = rij((r) => waarde(r, 6) === 'Fiscaal begin' && waarde(r, 1) === undefined)
    expect(fiscaal[6]).toMatchObject({ align: 'right' })
  })
})

describe('rapportXlsxBytes (uitgepakt)', () => {
  let pad = ''
  let bestanden: Record<string, string> = {}

  beforeAll(async () => {
    const bytes = await rapportXlsxBytes(docs, { invoer: fixture.invoer })
    pad = join(map, 'rapport.xlsx')
    writeFileSync(pad, bytes)
    bestanden = pakUit(bytes)
  })

  it('heeft de tabbladen in de goede volgorde', () => {
    const namen = [...bestanden['xl/workbook.xml'].matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1])
    expect(namen).toEqual(['Rapport Persoon A', 'Rapport Persoon B', 'Gegevens', 'Invoer', 'Parameters', 'Samenvatting'])
  })

  it('heeft de getalformaten, Times New Roman en enkele en dubbele randen', () => {
    const stijlen = bestanden['xl/styles.xml']
    expect(stijlen).toContain(`formatCode="${BEDRAG_FORMAAT}"`)
    expect(stijlen).toContain(`formatCode="${PROCENT_FORMAAT}"`)
    expect(stijlen).toContain('Times New Roman')
    expect(stijlen).toMatch(/<top style="thin"/)
    expect(stijlen).toMatch(/<bottom style="double"/)
    expect(stijlen).not.toMatch(/<fill>\s*<patternFill patternType="solid"/)

  })

  it('begint elke rij in kolom A (anders toont Voorvertoning op de Mac het blad leeg)', () => {
    for (const [naam, inhoud] of Object.entries(bestanden)) {
      if (!naam.startsWith('xl/worksheets/sheet')) continue
      for (const m of inhoud.matchAll(/<row r="(\d+)"[^>]*>(<c r="([A-Z]+)\d+")?/g)) expect(m[3], `${naam} rij ${m[1]}`).toBe('A')
    }
  })

  it('zet bedragen als getal en bevat geen formules', () => {
    const rapportA = bestanden['xl/worksheets/sheet1.xml']
    // 127935 als getal (geen t="s"), in kolom G (= B van het rapport).
    expect(rapportA).toMatch(/<c r="G\d+" s="\d+"><v>127935<\/v><\/c>/)
    expect(rapportA).toMatch(/<v>-13260<\/v>/)
    expect(rapportA).toMatch(/<v>0\.0144<\/v>/)
    for (const [naam, inhoud] of Object.entries(bestanden)) if (naam.startsWith('xl/worksheets/sheet')) expect(inhoud).not.toContain('<f>')
    const gedeeld = bestanden['xl/sharedStrings.xml']
    expect(gedeeld).toContain('Drempelinkomen uit werk en woning (box 1)')
    expect(gedeeld).toContain('Persoonlijke gegevens')
    expect(gedeeld).not.toContain('BSN')
  })

  it('schrijft tekst die op een formule lijkt als tekst (ronde 2: bescherming hoort in de schrijver)', async () => {
    // Een omschrijving die de gebruiker typt of die uit een import komt, mag nooit een formule worden.
    const invoer = structuredClone(fixture.invoer)
    invoer.box3.posities.push({ id: 'positie-formule', omschrijving: '=1+1', categorie: 'bankNL', eigenaar: 'A', waardeBegin: 1 } as (typeof invoer.box3.posities)[number])
    const uit = pakUit(await rapportXlsxBytes(docs, { invoer }))
    for (const [naam, inhoud] of Object.entries(uit)) if (naam.startsWith('xl/worksheets/sheet')) expect(inhoud).not.toContain('<f>')
    expect(uit['xl/sharedStrings.xml']).toContain('=1+1')
  })

  it('Gegevens heeft een rij per bedrag en Invoer de pad-waardeparen', () => {
    const gegevens = bestanden['xl/worksheets/sheet3.xml']
    expect((gegevens.match(/<row /g) ?? []).length).toBe(platteRegels(docs).length + 1)
    const gedeeld = bestanden['xl/sharedStrings.xml']
    expect(gedeeld).toContain('personen[0].inkomensvoorziening.lijfrentePremies')
    expect(gedeeld).toContain('2.1.winst')
  })

  it.skipIf(!PYTHON)('openpyxl leest waarden, formaten, randen en lettertype', () => {
    const script = `
import json, sys, warnings
warnings.simplefilter('ignore')
import openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Rapport Persoon A']
def zoek(label):
    for r in range(1, ws.max_row + 1):
        if ws.cell(r, 2).value == label:
            return r
uit = {'bladen': wb.sheetnames}
r = zoek('Drempelinkomen')
c = ws.cell(r, 8)
uit['drempel'] = [c.value, c.number_format, c.border.top.style, c.border.bottom.style, c.font.b, c.font.name]
r = zoek('Vermogen op bank- en spaarrekeningen in Nederland')
r = zoek('Beleggingen') if r is None else r
rows = [x for x in range(1, ws.max_row + 1) if ws.cell(x, 6).number_format == '0.00%']
p = ws.cell(rows[0], 6)
uit['procent'] = [p.value, p.number_format]
r = zoek('Drempelinkomen uit werk en woning (box 1)')
uit['streep'] = [ws.cell(r, 7).border.top.style, ws.cell(r, 8).value]
r = zoek('Premie-inkomen')
uit['premie'] = [ws.cell(r, 6).value, ws.cell(r, 6).border.bottom.style, ws.cell(r, 6).font.b]
uit['kopkolom'] = [ws.cell(zoek('Activa'), 7).value, ws.cell(zoek('Activa'), 7).font.b, ws.cell(zoek('Activa'), 7).font.i]
uit['koppen'] = [ws.cell(zoek('Bank of verzekeringsmaatschappij'), 5).value, ws.cell(zoek('Bank of verzekeringsmaatschappij'), 5).font.i]
uit['grid'] = ws.sheet_view.showGridLines
g = wb['Gegevens']
uit['gegevens'] = [[c.value for c in g[1]], [c.value for c in g[2]], g.cell(2, 9).number_format, g.max_row]
i = wb['Invoer']
uit['invoer'] = {i.cell(r, 1).value: i.cell(r, 2).value for r in range(2, i.max_row + 1)}
s = wb['Samenvatting']
uit['samenvatting'] = [s.cell(r, 1).value for r in range(1, 12)]
print(json.dumps(uit, default=str))
`
    const r = spawnSync('python3', ['-c', script, pad], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    const uit = JSON.parse(r.stdout)
    expect(uit.bladen).toEqual(['Rapport Persoon A', 'Rapport Persoon B', 'Gegevens', 'Invoer', 'Parameters', 'Samenvatting'])
    expect(uit.drempel).toEqual([108553, BEDRAG_FORMAAT, 'thin', 'double', true, 'Times New Roman'])
    expect(uit.procent).toEqual([0.0144, PROCENT_FORMAAT])
    expect(uit.streep).toEqual(['thin', 108257])
    expect(uit.premie).toEqual([38098, 'double', false])
    expect(uit.kopkolom).toEqual(['Fiscaal begin', true, false])
    expect(uit.koppen).toEqual(['Rek-/polisnr.', true])
    expect(uit.grid).toBe(false)
    expect(uit.gegevens[0]).toEqual(['jaar', 'persoon', 'hoofdstuk', 'paragraaf', 'regel-id', 'omschrijving', 'kolom', 'peildatum', 'bedrag', 'soort', 'herkomst'])
    expect(uit.gegevens[1]).toEqual([2024, 'Persoon A', '2 Inkomstenbelasting en premieheffing', '2.1 Drempel-/ verzamel-/ belastbaar inkomen', '2.1.winst', 'Belastbare winst uit onderneming', 'B', null, 127935, 'post', 'personen[0].belastbareWinst'])
    expect(uit.gegevens[2]).toBe(BEDRAG_FORMAAT)
    expect(uit.gegevens[3]).toBe(platteRegels(docs).length + 1)
    expect(uit.invoer['jaar']).toBe(2024)
    expect(uit.invoer['fiscaalPartner']).toBe(true)
    expect(uit.invoer['personen[0].inkomensvoorziening.lijfrentePremies']).toBe(9800)
    expect(uit.samenvatting).toContain('Uitkomsten')
  })
})
