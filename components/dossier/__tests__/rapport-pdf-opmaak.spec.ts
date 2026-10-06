/**
 * Opmaak van de PDF op de punten die bij het naast elkaar leggen met een fiscaal rapport uit een accountantspakket
 * zijn rechtgezet: dubbele punt achter de labels op het voorblad, tekst naast tekst bovenaan uitgelijnd in de
 * verantwoording, geen extra ruimte na Premie-inkomen (dubbele streep zonder vet), geen witregel voor de
 * AOW-franchise, op een vervolgpagina van de bijlage lijfrente het jaar direct onder de herhaalde kop, het
 * tekstgebied en de paginaverdeling van spec 1.13, de linkse uitlijning in 5.6.1 en de ruimte na het euroteken.
 * Gelezen met pdftotext -bbox. Op het verzonnen voorbeeldhuishouden (lib/voorbeeld); de vergelijking met een echte
 * aangifte is een privé-regressietest (alleen lokaal, zie README).
 */
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { bouwRapport } from '@/lib/rapport/bouw'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import type { RapportDocument } from '@/lib/rapport/model'
import { platteSecties } from '@/lib/rapport/plat'
import { rapportPdfBytes } from '../rapport-pdf'
import { voorbeeldRapport } from './rapport-voorbeeld'

const POPPLER = !spawnSync('pdftotext', ['-v']).error
const MM = 25.4 / 72

interface Woord {
  x: number
  y: number
  x2: number
  /** Onderkant (mm); bij poppler 0,22 x korps onder de basislijn, voor Times New Roman en Times-Roman gelijk. */
  y2: number
  tekst: string
}

/** Woorden per pagina met posities in mm (bovenkant, vanaf linksboven). */
function woordenPerPagina(pad: string): Woord[][] {
  const html = execFileSync('pdftotext', ['-bbox', pad, '-'], { encoding: 'utf8' })
  return html.split('<page ').slice(1).map((p) =>
    [...p.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({
      x: Number(m[1]) * MM,
      y: Number(m[2]) * MM,
      x2: Number(m[3]) * MM,
      y2: Number(m[4]) * MM,
      tekst: m[5].replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    })),
  )
}

async function pdfWoorden(naam: string, docs: RapportDocument[]): Promise<Woord[][]> {
  const pad = join(mkdtempSync(join(tmpdir(), 'rapport-opmaak-')), naam)
  writeFileSync(pad, await rapportPdfBytes(docs))
  return woordenPerPagina(pad)
}

function bouw(invoer: HuishoudenInvoer): RapportDocument {
  const r = berekenHuishouden(invoer, { zonderMarginaleDruk: true })
  return bouwRapport(invoer, r, getJaar(invoer.jaar, invoer.variant), { persoon: 'A', vandaag: '2026-10-04', dossierStatus: 'concept', toolVersie: 'test', naam: (id) => `Persoon ${id}` })
}

interface Lijn {
  x: number
  y: number
  woorden: Woord[]
  tekst: string
}

/** Woorden met dezelfde bovenkant als één regel, van links naar rechts. */
function lijnen(woorden: Woord[]): Lijn[] {
  const uit: Array<{ y: number; woorden: Woord[] }> = []
  for (const w of [...woorden].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const l = uit.find((x) => Math.abs(x.y - w.y) < 0.3)
    if (l) l.woorden.push(w)
    else uit.push({ y: w.y, woorden: [w] })
  }
  return uit.map((l) => {
    const woorden = l.woorden.sort((a, b) => a.x - b.x)
    return { x: woorden[0].x, y: l.y, woorden, tekst: woorden.map((w) => w.tekst).join(' ') }
  })
}

/** Index van de eerste rapportpagina ('pagina: 1' in de kopregel). */
const eersteRapportpagina = (paginas: Woord[][]) => paginas.findIndex((p) => p.some((w, i) => w.tekst === 'pagina:' && p[i + 1]?.tekst === '1'))

/** Bovenkant van de regel die met deze woorden begint (links op 20,4 mm). */
function regelY(woorden: Woord[], begin: string): number | undefined {
  const delen = begin.split(' ')
  for (let i = 0; i < woorden.length; i++) {
    if (Math.abs(woorden[i].x - 20.4) > 0.6) continue
    if (delen.every((d, k) => woorden[i + k]?.tekst === d)) return woorden[i].y
  }
  return undefined
}

describe.skipIf(!POPPLER)('opmaak naast een rapport uit een accountantspakket', () => {
  let paginas: Woord[][] = []

  beforeAll(async () => {
    const invoer = voorbeeldInvoer(2024)
    const r = berekenHuishouden(invoer, { zonderMarginaleDruk: true })
    const doc = bouwRapport(invoer, r, getJaar(invoer.jaar), { persoon: 'A', vandaag: '2026-10-04', dossierStatus: 'concept', toolVersie: 'test', naam: (id) => `Persoon ${id}` })
    const pad = join(mkdtempSync(join(tmpdir(), 'rapport-opmaak-')), 'rapport.pdf')
    writeFileSync(pad, await rapportPdfBytes([doc]))
    paginas = woordenPerPagina(pad)
  })

  const pagina = (pred: (w: Woord[]) => boolean) => paginas.find(pred) ?? []
  const heeft = (w: Woord[], begin: string) => regelY(w, begin) !== undefined

  it('voorblad: labels met een dubbele punt', () => {
    const voorblad = paginas[0]
    for (const label of ['Opgesteld met:', 'Datum:', 'Status:']) expect(heeft(voorblad, label), label).toBe(true)
  })

  it('verantwoording: een afgebroken onderdeel staat op dezelfde hoogte als zijn bron', () => {
    const p = pagina((w) => heeft(w, 'Bron van de cijfers'))
    const onderdeel = regelY(p, 'Overige gegevens (box 1,')
    const bron = p.find((w) => w.tekst === 'Handmatig' && onderdeel !== undefined && Math.abs(w.y - onderdeel) < 3)
    expect(onderdeel).toBeDefined()
    expect(bron, 'bron naast de eerste regel van het onderdeel').toBeDefined()
    expect(Math.abs(bron!.y - onderdeel!)).toBeLessThan(0.3)
  })

  it('2.2.1: na Premie-inkomen (dubbele streep, niet vet) een gewone regelafstand', () => {
    const p = pagina((w) => heeft(w, 'Premie-inkomen'))
    const premieInkomen = regelY(p, 'Premie-inkomen')!
    const aow = regelY(p, 'Premie AOW:')!
    expect(aow - premieInkomen).toBeCloseTo(5.3, 1)
  })

  it('4.1.1: AOW-franchise direct na de som, en op een vervolgpagina het jaar direct onder de herhaalde kop', () => {
    // Jaarblok 2021: inkomen onder het maximum, dus geen regel 'Maximaal in aanmerking te nemen inkomen'.
    const eerste = pagina((w) => heeft(w, 'Inkomsten in 2020'))
    const inkomsten = regelY(eerste, 'Inkomsten in 2020')!
    const onder = eerste.filter((w) => w.y > inkomsten)
    const som = onder.find((w) => w.tekst === '79.500' && w.y > regelY(onder, 'Aftrekbare kosten')!)!
    expect(regelY(onder, 'AOW-franchise')! - som.y).toBeCloseTo(5.3, 1)

    // Vervolgpagina: de herhaalde kop is de eerste regel onder de kopregel (tekstgebied vanaf 38,5 mm).
    const vervolg = paginas.filter((w) => (regelY(w, 'Jaar-/reserveringsruimteberekening') ?? 99) < 42)
    expect(vervolg.length).toBeGreaterThan(0)
    for (const p of vervolg) {
      const kop = regelY(p, 'Jaar-/reserveringsruimteberekening')!
      const jaar = p.filter((w) => /^20\d\d$/.test(w.tekst) && Math.abs(w.x - 20.4) < 0.6).sort((a, b) => a.y - b.y)[0]
      expect(jaar.y - kop).toBeCloseTo(5.3, 1)
    }
  })
})

/**
 * Per rapportpagina de secties waarvan de kop daar staat en in 4.1.1 de jaarblokken, zoals de tabel in spec 1.13
 * ze noemt: hoofdstukken en paragrafen, subparagrafen in hoofdstuk 2 tot en met 4, en 5.1.1.
 */
function paginaverdeling(doc: RapportDocument, paginas: Woord[][]): string[] {
  const secties = platteSecties(doc)
  const telt = (n: string) => n.split('.').length <= 2 || /^[234]\./.test(n) || n === '5.1.1'
  let in411 = false
  return paginas.slice(eersteRapportpagina(paginas)).map((p) => {
    const items: string[] = []
    for (const l of lijnen(p)) {
      if (l.y < 30 || Math.abs(l.x - 20.4) > 0.6) continue
      const s = secties.find((x) => l.tekst.startsWith(`${x.nummer} ${x.sectie.titel}`.slice(0, 24)))
      if (s) {
        in411 = s.nummer === '4.1.1'
        if (telt(s.nummer)) items.push(s.nummer)
      } else if (in411 && /^\d{4}$/.test(l.tekst)) {
        items.push(l.tekst)
      }
    }
    return items.join(' ')
  })
}

/**
 * Spec 1.13 op het voorbeeldhuishouden met jaarrekening (vastgelegd als regressie): hoofdstukken op een nieuwe
 * pagina, jaarblokken van 4.1.1 heel, hoofdstuk 5 per paragraaf.
 */
const VERDELING: Record<2024 | 2021, string[]> = {
  2024: [
    '1',
    '2 2.1',
    '2.2 2.2.1 2.2.2 2.2.3 2.2.4',
    '2.3',
    '3 3.1 3.1.1 3.1.2',
    '3.1.3 3.1.4',
    '3.2 3.2.1 3.2.2',
    '3.2.3',
    '4 4.1 4.1.1 2024 2023',
    '2022 2021 4.2',
    '4.3 4.4 4.4.1',
    '5 5.1 5.1.1',
    '5.2',
    '5.3',
    '5.4 5.5',
    '5.6',
    '6 6.1',
  ],
  2021: [
    '1',
    '2 2.1',
    '2.2 2.2.1 2.2.2 2.2.3 2.2.4',
    '2.3',
    '3 3.1 3.1.1 3.1.2',
    '3.1.3 3.1.4',
    '3.2 3.2.1 3.2.2',
    '3.2.3 3.3',
    '4',
    '4.1 4.1.1 2021 2020 2019',
    '4.2 4.3',
    '5 5.1 5.1.1',
    '5.2',
    '5.3',
    '5.4 5.5',
    '5.6',
    '6 6.1',
  ],
}

/** Waar de inhoudsopgave naar de tweede pagina doorloopt. */
const INHOUD_DOOR: Record<2024 | 2021, string> = { 2024: '5.6.2', 2021: '6' }

describe.skipIf(!POPPLER)('tekstgebied en paginaverdeling met jaarrekening (spec 1.13)', () => {
  const fixtures = [
    [2024, voorbeeldInvoer(2024)],
    [2021, voorbeeldInvoer(2021)],
  ] as const
  const gemaakt = new Map<number, { doc: RapportDocument; paginas: Woord[][] }>()

  beforeAll(async () => {
    for (const [jaar, f] of fixtures) {
      const doc = bouw(f)
      gemaakt.set(jaar, { doc, paginas: await pdfWoorden(`jaarrekening-${jaar}.pdf`, [doc]) })
    }
  })

  for (const [jaar] of fixtures) {
    it(`${jaar}: secties en jaarblokken per pagina`, () => {
      const { doc, paginas } = gemaakt.get(jaar)!
      expect(paginaverdeling(doc, paginas)).toEqual(VERDELING[jaar])
    })

    it(`${jaar}: de inhoudsopgave loopt door naar een tweede pagina`, () => {
      const { paginas } = gemaakt.get(jaar)!
      const begin = paginas.findIndex((p) => p.some((w) => w.tekst === 'Inhoudsopgave'))
      const tweede = lijnen(paginas[begin + 1]).filter((l) => Math.abs(l.x - 20.4) < 0.6)
      expect(begin + 2).toBe(eersteRapportpagina(paginas))
      expect(tweede[0].woorden[0].tekst).toBe(INHOUD_DOOR[jaar])
    })
  }

  it('de eerste kop staat op de gemeten hoogte en geen tekst zakt onder de gemeten laagste regel', () => {
    const { paginas } = gemaakt.get(2024)!
    // Gemeten op een fiscaal rapport uit een accountantspakket: een kop van 13 pt met onderkant 43,1 mm, de laagste
    // tekst rond 245 mm.
    const rapport = paginas.slice(eersteRapportpagina(paginas))
    const p = rapport.find((w) => lijnen(w).some((l) => l.tekst.startsWith('2.2 Belastingberekening')))!
    const kop = p.find((w) => w.tekst === '2.2')!
    expect(Math.abs(kop.y2 - 43.1)).toBeLessThan(0.2)
    for (const pagina of rapport) {
      for (const w of pagina) expect(w.y2, w.tekst).toBeLessThan(245.3)
    }
  })

  it('5.6.1: antwoord, kolomkoppen Begin en Einde en de datums links op de rand van kolom A en B', () => {
    const { paginas } = gemaakt.get(2024)!
    const p = paginas.find((w) => lijnen(w).some((l) => l.tekst.startsWith('Is de naam van de onderneming gewijzigd?')))!
    const regels = lijnen(p)
    const woord = (lijn: string, tekst: string) => regels.find((l) => l.tekst.startsWith(lijn))!.woorden.find((w) => w.tekst === tekst)!
    // Gemeten op een fiscaal rapport uit een accountantspakket: 'nee' 135,2; Begin 105,6; Einde 135,2; begindatum
    // 105,6; einddatum 135,2 (linkerkant).
    expect(woord('Is de naam', 'nee').x).toBeCloseTo(135.2, 0)
    const koppen = regels.find((l) => l.woorden.some((w) => w.tekst === 'Begin') && l.woorden.some((w) => w.tekst === 'Einde'))!
    expect(koppen.woorden.find((w) => w.tekst === 'Begin')!.x).toBeCloseTo(105.6, 0)
    expect(koppen.woorden.find((w) => w.tekst === 'Einde')!.x).toBeCloseTo(135.2, 0)
    expect(woord('Begin- en einddatum', '01-01-2024').x).toBeCloseTo(105.6, 0)
    expect(woord('Begin- en einddatum', '31-12-2024').x).toBeCloseTo(135.2, 0)
    // De andere vragen houden het antwoord rechts op 193,9 mm.
    const tonnage = regels.find((l) => l.woorden.some((w) => w.tekst === 'tonnageregeling?'))!
    expect(tonnage.woorden[tonnage.woorden.length - 1].x2).toBeCloseTo(193.9, 0)
  })

  it('2.3: ruimte tussen het euroteken en het bedrag in (max. € 71.628)', () => {
    const { paginas } = gemaakt.get(2024)!
    const regel = paginas.flatMap(lijnen).find((l) => l.tekst.includes('(max. €'))!
    const i = regel.woorden.findIndex((w) => w.tekst === '€')
    // Viewers tekenen het euroteken breder dan zijn 1,76 mm; zonder extra ruimte begint het bedrag 2,6 mm na het
    // begin van het teken en raakt het teken bijna. Met 0,7 mm extra (zetMetEuro) ruim 3 mm.
    expect(regel.woorden[i + 1].x - regel.woorden[i].x).toBeGreaterThan(2.9)
    expect(regel.woorden[i + 1].x - regel.woorden[i].x).toBeLessThan(3.6)
  })
})

describe.skipIf(!POPPLER)('euroteken in een rechts uitgelijnde tekst', () => {
  it('het bedrag eindigt op de rechterrand en staat ruim na het euroteken', async () => {
    const doc = voorbeeldRapport()
    doc.hoofdstukken = [
      {
        titel: 'Persoonlijke gegevens',
        niveau: 1,
        secties: [],
        blokken: [{ soort: 'vraag', id: 'euro', vraag: 'Hoeveel staat er op de rekening?', antwoord: '€ 1.234' }],
      },
    ]
    const paginas = await pdfWoorden('euro.pdf', [doc])
    const regel = paginas.flatMap(lijnen).find((l) => l.tekst.startsWith('Hoeveel staat er'))!
    const bedrag = regel.woorden.find((w) => w.tekst === '1.234')!
    const euro = regel.woorden.find((w) => w.tekst === '€')!
    expect(Math.abs(bedrag.x2 - 193.9)).toBeLessThan(0.15)
    expect(bedrag.x - euro.x).toBeGreaterThan(2.9)
  })
})
