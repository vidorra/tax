/**
 * PDF-weergave van het rapport, in Node gemaakt en gelezen met pdftotext, pdfinfo en pdftoppm (poppler).
 * Zonder poppler draaien alleen de tests die de bytes zelf bekijken.
 */
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { KOLOMMEN, platteSecties } from '@/lib/rapport/plat'
import type { RapportDocument } from '@/lib/rapport/model'
import { SITE } from '@/lib/site'
import { bouwRapport } from '@/lib/rapport/bouw'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { rapportPdfBytes } from '../rapport-pdf'
import { voorbeeldRapport, voorbeeldRapportPartner } from './rapport-voorbeeld'

const heeft = (cmd: string) => !spawnSync(cmd, ['-v']).error
const POPPLER = heeft('pdftotext') && heeft('pdfinfo')
const map = mkdtempSync(join(tmpdir(), 'rapport-pdf-'))

function schrijf(naam: string, bytes: Uint8Array): string {
  const pad = join(map, naam)
  writeFileSync(pad, bytes)
  return pad
}

/** Tekst per pagina, met witruimte binnen een regel teruggebracht tot één spatie waar dat voor het zoeken nodig is. */
function paginas(pad: string): string[] {
  const tekst = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', pad, '-'], { encoding: 'utf8' })
  const delen = tekst.split('\f')
  if (delen[delen.length - 1].trim() === '') delen.pop()
  return delen
}

const enkel = (s: string) => s.replace(/[ \t]+/g, ' ')

/** Bedragen in leesvolgorde: losse cellen (gescheiden door minstens twee spaties) in de notatie 127.935 of -13.260. */
function bedragenInTekst(pagina: string): number[] {
  const uit: number[] = []
  for (const regel of pagina.split('\n')) {
    for (const cel of regel.trim().split(/\s{2,}/)) {
      if (/^-?\d{1,3}(\.\d{3})*$/.test(cel)) uit.push(Number(cel.replace(/\./g, '')))
    }
  }
  return uit
}

/** Alle bedragen van het model in rapportvolgorde (regel voor regel, kolommen van links naar rechts). */
function bedragenInModel(doc: RapportDocument): number[] {
  const uit: number[] = []
  for (const ps of platteSecties(doc)) {
    for (const b of ps.sectie.blokken) {
      if (b.soort !== 'tabel') continue
      for (const r of b.regels) for (const k of KOLOMMEN) if (typeof r.bedragen?.[k] === 'number') uit.push(r.bedragen[k]!)
    }
  }
  return uit
}

interface InhoudRegel {
  nummer: string
  titel: string
  pagina: number
}

function inhoudsopgave(tekst: string[], van: number, tot: number): InhoudRegel[] {
  return tekst
    .slice(van, tot)
    .join('\n')
    .split('\n')
    .map((r) => /^\s*(\d+(?:\.\d+)*)\s{2,}(.+?)\s{2,}(\d+)\s*$/.exec(r))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ nummer: m[1], titel: enkel(m[2].trim()), pagina: Number(m[3]) }))
}

/** Elke regel van de inhoudsopgave wijst naar de rapportpagina waar die kop staat. */
function controleerInhoud(doc: RapportDocument, tekst: string[]) {
  const eerste = tekst.findIndex((p) => /pagina: 1\b/.test(p))
  const inhoudBegin = tekst.findIndex((p) => p.includes('Inhoudsopgave'))
  const regels = inhoudsopgave(tekst, inhoudBegin, eerste)
  const secties = platteSecties(doc)
  expect(regels.map((r) => r.nummer)).toEqual(secties.map((s) => s.nummer))
  const rapport = tekst.slice(eerste)
  for (const r of regels) {
    const sectie = secties.find((s) => s.nummer === r.nummer)!
    expect(enkel(rapport[r.pagina - 1] ?? ''), `${r.nummer} op pagina ${r.pagina}`).toContain(enkel(`${r.nummer} ${sectie.sectie.titel}`).slice(0, 60))
  }
  return { regels, rapport }
}

describe('rapportPdfBytes', () => {
  it('maakt een PDF en weigert een lege lijst', async () => {
    const bytes = await rapportPdfBytes([voorbeeldRapport()])
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(10_000)
    await expect(rapportPdfBytes([])).rejects.toThrow()
  })
})

describe.skipIf(!POPPLER)('rapport-PDF van één persoon (pdftotext)', () => {
  const doc = voorbeeldRapport()
  let pad = ''
  let tekst: string[] = []
  let eersteRapportpagina = -1
  let inhoudBegin = -1

  beforeAll(async () => {
    pad = schrijf('een.pdf', await rapportPdfBytes([doc]))
    tekst = paginas(pad)
    eersteRapportpagina = tekst.findIndex((p) => /pagina: 1\b/.test(p))
    inhoudBegin = tekst.findIndex((p) => p.includes('Inhoudsopgave'))
  })

  it('A4 met metadata van de tool', () => {
    const info = execFileSync('pdfinfo', [pad], { encoding: 'utf8' })
    expect(info).toMatch(/Page size:\s+595\.2\d x 841\.8\d pts \(A4\)/)
    expect(info).toMatch(/Title:\s+Fiscaal rapport aangifte inkomstenbelasting 2024 van Persoon A/)
    expect(info).toContain(`Creator:         ${SITE.naam}`)
    expect(info).toContain(`Author:          ${SITE.naam}`)
  })

  it('voorblad, verantwoording en inhoudsopgave zonder kopregel en zonder paginanummer', () => {
    expect(tekst[0]).toContain('Fiscaal rapport aangifte inkomstenbelasting 2024')
    expect(tekst[0]).toContain('Voorbeeldstraat 1')
    expect(enkel(tekst[0])).toContain('Opgesteld met: IB-calculator')
    expect(tekst[1]).toContain('Samenvatting en verantwoording')
    expect(tekst[1]).toContain('Indicatieve berekening, geen belastingadvies')
    expect(inhoudBegin).toBeGreaterThan(1)
    expect(eersteRapportpagina).toBeGreaterThan(inhoudBegin)
    for (let i = 0; i < eersteRapportpagina; i++) {
      expect(tekst[i]).not.toMatch(/pagina: \d/)
      expect(tekst[i]).not.toContain('Berekend op: 4 oktober 2026')
    }
  })

  it('rapportpagina’s hebben de kopregel en lopen door vanaf pagina 1', () => {
    const rapport = tekst.slice(eersteRapportpagina)
    expect(rapport.length).toBeGreaterThan(10)
    rapport.forEach((p, i) => {
      expect(p).toMatch(new RegExp(`pagina: ${i + 1}\\b`))
      expect(enkel(p)).toContain('Fiscaal rapport aangifte inkomstenbelasting 2024 van Persoon A')
      expect(enkel(p)).toContain('Berekend op: 4 oktober 2026')
      expect(p).not.toContain('BSN')
    })
  })

  it('inhoudsopgave noemt elke sectie met het paginanummer waar de kop staat', () => {
    const inhoud = tekst.slice(inhoudBegin, eersteRapportpagina).join('\n')
    const regels = inhoud
      .split('\n')
      .map((r) => /^\s*(\d+(?:\.\d+)*)\s{2,}(.+?)\s{2,}(\d+)\s*$/.exec(r))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ nummer: m[1], titel: m[2].trim(), pagina: Number(m[3]) }))
    const secties = platteSecties(doc)
    expect(regels.map((r) => r.nummer)).toEqual(secties.map((s) => s.nummer))
    expect(regels.map((r) => enkel(r.titel))).toEqual(secties.map((s) => s.sectie.titel))
    const rapport = tekst.slice(eersteRapportpagina)
    for (const r of regels) {
      const pagina = rapport[r.pagina - 1]
      expect(pagina, `${r.nummer} op pagina ${r.pagina}`).toBeDefined()
      expect(enkel(pagina), `${r.nummer} ${r.titel} op pagina ${r.pagina}`).toContain(`${r.nummer} ${r.titel}`)
    }
    // Paginanummers lopen niet terug en elk hoofdstuk begint op een nieuwe pagina.
    for (let i = 1; i < regels.length; i++) expect(regels[i].pagina).toBeGreaterThanOrEqual(regels[i - 1].pagina)
    const hoofdstukken = regels.filter((r) => !r.nummer.includes('.'))
    expect(new Set(hoofdstukken.map((h) => h.pagina)).size).toBe(hoofdstukken.length)
    expect(hoofdstukken[0].pagina).toBe(1)
  })

  it('alle bedragen staan in de volgorde van het model, in de notatie van het rapport', () => {
    const rapport = tekst.slice(eersteRapportpagina)
    const gevonden = rapport.flatMap(bedragenInTekst)
    expect(gevonden).toEqual(bedragenInModel(doc))
    const alles = rapport.join('\n')
    expect(alles).toContain('127.935')
    expect(alles).toContain('-13.260')
    expect(alles).toContain('1,44 %')
    expect(alles).not.toMatch(/€\s*127/)
  })

  it('jaarblokken van de bijlage lopen over pagina’s met de groepskop bovenaan elke vervolgpagina', () => {
    const rapport = tekst.slice(eersteRapportpagina)
    const metJaarblok = rapport.filter((p) => /Openstaande jaar-\/reserveringsruimte/.test(p))
    expect(metJaarblok.length).toBeGreaterThanOrEqual(4)
    for (const p of metJaarblok) expect(p).toContain('Jaar-/reserveringsruimteberekening')
    // Een jaarblok wordt niet gesplitst: elk blok dat op een pagina begint, eindigt er ook.
    for (const p of metJaarblok) {
      const begin = (p.match(/Inkomsten in \d{4}/g) ?? []).length + (p.match(/^\s*Reserveringsruimte\s/gm) ?? []).length
      const eind = (p.match(/Openstaande jaar-\/reserveringsruimte/g) ?? []).length
      expect(begin).toBe(eind)
    }
  })

  it('lange labels breken af en het bedrag staat op de laatste regel', () => {
    const rapport = tekst.slice(eersteRapportpagina).join('\n')
    expect(rapport).toMatch(/Maximaal toepasbare\s*\n\s*heffingskortingen\s+0/)
    expect(rapport).toMatch(/Toename van de opgebouwde oudedagsreserve in voorgaand\s*\n\s*jaar min de verplichte afname\s+-2\.740/)
    expect(rapport).toMatch(/Berekende inkomstenbelasting en premie volksverzekeringen\s+47\.901/)
  })

  it.skipIf(!heeft('pdftoppm'))('pdftoppm tekent een rapportpagina', () => {
    const uit = join(map, 'pagina')
    execFileSync('pdftoppm', ['-r', '60', '-png', '-f', String(eersteRapportpagina + 3), '-l', String(eersteRapportpagina + 3), pad, uit])
    const png = execFileSync('ls', [map], { encoding: 'utf8' }).split('\n').find((f) => f.startsWith('pagina') && f.endsWith('.png'))
    expect(png).toBeDefined()
    expect(statSync(join(map, png!)).size).toBeGreaterThan(5_000)
  })
})

describe.skipIf(!POPPLER)('rapport-PDF van beide partners', () => {
  it('twee rapporten achter elkaar, elk met voorblad en eigen nummering vanaf 1', async () => {
    const a = voorbeeldRapport()
    const b = voorbeeldRapportPartner()
    const losA = paginas(schrijf('a.pdf', await rapportPdfBytes([a]))).length
    const losB = paginas(schrijf('b.pdf', await rapportPdfBytes([b]))).length
    const pad = schrijf('twee.pdf', await rapportPdfBytes([a, b]))
    const tekst = paginas(pad)
    expect(tekst.length).toBe(losA + losB)

    const tweede = tekst.slice(losA)
    expect(tweede[0]).toContain('Persoon B')
    expect(tweede[0]).toContain('Fiscaal rapport aangifte inkomstenbelasting 2024')
    expect(tweede[0]).not.toMatch(/pagina: \d/)
    const eenen = tekst.map((p, i) => (/pagina: 1\b/.test(p) ? i : -1)).filter((i) => i >= 0)
    expect(eenen).toHaveLength(2)
    expect(eenen[1]).toBeGreaterThan(losA)
    expect(enkel(tekst[eenen[1]])).toContain('van Persoon B')
    // Kopregel met twee regels rechts: de laatste op de titelregel, de eerste erboven.
    expect(tekst[eenen[1]]).toContain('Status: Concept')
    // Inhoudsopgave van B met de expliciete nummers uit het model.
    const inhoudB = tweede.find((p) => p.includes('Inhoudsopgave'))!
    expect(enkel(inhoudB)).toMatch(/2\.1 Voorlopige aanslagen en teruggaven 2/)
    const info = execFileSync('pdfinfo', [pad], { encoding: 'utf8' })
    expect(info).toContain('van Persoon A en Persoon B')
  })
})

describe.skipIf(!POPPLER)('namen met letters buiten Latin-1', () => {
  it('staan getranslitereerd op voorblad, kopregel, hoofdstuk 1 en in de titel, niet verminkt', async () => {
    const titel = 'Fiscaal rapport aangifte inkomstenbelasting 2024'
    const doc: RapportDocument = {
      ...voorbeeldRapport(),
      naam: 'Şükrü Öztürk',
      kopregel: { links: `${titel} van Şükrü Öztürk`, rechts: ['Berekend op: 4 oktober 2026'] },
      voorblad: { adresregels: ['Şükrü Öztürk', 'Śniadeckiego 4', '1234 AB Łódź'], regels: [{ label: 'Datum:', waarde: '4 oktober 2026' }] },
      hoofdstukken: [
        {
          titel: 'Persoonlijke gegevens',
          niveau: 1,
          secties: [],
          blokken: [
            {
              soort: 'gegevens',
              rijen: [
                { label: 'Naam', waarde: 'Şükrü Öztürk' },
                { label: 'Partner', kop: true, witVoor: 1 },
                { label: 'Naam', waarde: 'Łukasz Wiśniewski' },
                { label: 'Kind', waarde: 'Zoë Ørsted' },
                { label: 'Huisgenoot', waarde: 'Yılmaz Şahin' },
              ],
            },
          ],
        },
      ],
    }
    const pad = schrijf('namen.pdf', await rapportPdfBytes([doc]))
    const tekst = paginas(pad)
    const rapport = tekst.slice(tekst.findIndex((p) => /pagina: 1\b/.test(p)))
    expect(enkel(tekst[0])).toContain('Sükrü Öztürk')
    expect(enkel(tekst[0])).toContain('Sniadeckiego 4')
    expect(enkel(tekst[0])).toContain('1234 AB Lódz')
    expect(enkel(rapport[0])).toContain(`${titel} van Sükrü Öztürk`)
    for (const naam of ['Naam Sükrü Öztürk', 'Naam Lukasz Wisniewski', 'Kind Zoë Ørsted', 'Huisgenoot Yilmaz Sahin']) expect(enkel(rapport[0])).toContain(naam)
    expect(execFileSync('pdfinfo', ['-enc', 'UTF-8', pad], { encoding: 'utf8' })).toMatch(/Title:\s+Fiscaal rapport aangifte inkomstenbelasting 2024 van Sükrü Öztürk/)
  })
})

describe.skipIf(!POPPLER)('rapport uit de bouwfunctie (voorbeeldhuishouden 2024 en 2021)', () => {
  const bouw = (invoer: HuishoudenInvoer, persoon: PersoonId) =>
    bouwRapport(invoer, berekenHuishouden(invoer, { zonderMarginaleDruk: true }), getJaar(invoer.jaar, invoer.variant), {
      persoon,
      vandaag: '2026-10-04',
      dossierStatus: 'concept',
      toolVersie: 'test',
      naam: (id) => `Persoon ${id}`,
    })

  for (const jaar of [2024, 2021] as const) {
    it(`${jaar}: inhoudsopgave, paginanummers en bedragen kloppen met het model van beide partners`, async () => {
      const invoer: HuishoudenInvoer = voorbeeldInvoer(jaar)
      const docs = [bouw(invoer, 'A'), bouw(invoer, 'B')]
      const losA = paginas(schrijf(`model-${jaar}-a.pdf`, await rapportPdfBytes([docs[0]])))
      const tekst = paginas(schrijf(`model-${jaar}.pdf`, await rapportPdfBytes(docs)))
      const delen = [tekst.slice(0, losA.length), tekst.slice(losA.length)]
      docs.forEach((doc, i) => {
        const { rapport } = controleerInhoud(doc, delen[i])
        rapport.forEach((p, n) => expect(p).toMatch(new RegExp(`pagina: ${n + 1}\\b`)))
        expect(rapport.flatMap(bedragenInTekst)).toEqual(bedragenInModel(doc))
      })
    })
  }
})
