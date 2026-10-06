/**
 * PDF van een dossierjaar in de opbouw van het fiscaal rapport (jspdf, in de browser).
 * Standaardlettertypen van jsPDF kennen alleen Latin-1 plus het euroteken; andere tekens
 * worden vervangen.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, Uitlegregel, Waarschuwing } from '@/lib/tax/types'
import { formatEuro } from '@/components/ui/format'
import { SITE } from '@/lib/site'

const VERVANG: Array<[RegExp, string]> = [
  [/−/g, '-'],
  [/[  ]/g, ' '],
  [/[–—]/g, '-'],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/≈/g, '~'],
  [/…/g, '...'],
]

/** Tekens buiten Latin-1 die in WinAnsi staan; jsPDF zet ze met de standaardlettertypen. */
const WINANSI = new Set(['€', '•', 'Š', 'š', 'Ž', 'ž', 'Œ', 'œ', 'Ÿ'])

/** Letters die NFKD niet ontleedt in letter plus accent, met de letter die er het dichtst bij ligt. */
const LETTERS: Record<string, string> = {
  ı: 'i',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ħ: 'h',
  Ħ: 'H',
  ŧ: 't',
  Ŧ: 'T',
  ŋ: 'n',
  Ŋ: 'N',
  ĸ: 'k',
  ſ: 's',
  ə: 'e',
  Ə: 'E',
  ɨ: 'i',
  Ɨ: 'I',
  ẞ: 'SS',
  ʼ: "'",
  ʻ: "'",
}

const zetbaar = (t: string) => [...t].every((c) => (c.codePointAt(0) ?? 0) <= 0xff || WINANSI.has(c))

/**
 * Eén teken buiten WinAnsi als letters die wel te zetten zijn. NFKD splitst in letters en accenttekens; per letter
 * gaan de accenttekens er van achteren af tot wat overblijft (weer samengesteld) te zetten is: ễ wordt ê, Ş wordt S,
 * ř wordt r, ĳ wordt ij. Letters die NFKD niet ontleedt (ı, ł, đ) komen uit de tabel; de rest valt weg.
 */
function translitereer(teken: string): string {
  let uit = ''
  for (const [, letter, accenten] of teken.normalize('NFKD').matchAll(/(\P{M})(\p{M}*)/gu)) {
    const tekens = [...accenten]
    let gevonden: string | undefined
    for (let n = tekens.length; n >= 0 && gevonden === undefined; n--) {
      const kandidaat = (letter + tekens.slice(0, n).join('')).normalize('NFC')
      if (zetbaar(kandidaat)) gevonden = kandidaat
    }
    uit += gevonden ?? LETTERS[letter] ?? ''
  }
  return uit
}

/**
 * Tekst die jsPDF met de standaardlettertypen kan zetten: Latin-1, het euroteken en de andere WinAnsi-tekens
 * hierboven. Typografische tekens worden vervangen (VERVANG) en letters daarbuiten getranslitereerd.
 */
export function pdfTekst(s: string): string {
  // NFC eerst, zodat een e met een los accentteken één é wordt (Latin-1) in plaats van een e.
  let uit = s.normalize('NFC')
  for (const [re, door] of VERVANG) uit = uit.replace(re, door)
  let schoon = ''
  for (const teken of uit) schoon += zetbaar(teken) ? teken : translitereer(teken)
  return schoon
}

function bedragTekst(r: Uitlegregel): string {
  if (r.soort === 'info' && r.bedrag === 0) return ''
  if (r.soort === 'min') return formatEuro(-Math.abs(r.bedrag))
  return formatEuro(r.bedrag)
}

export interface PdfGegevens {
  jaar: number
  variantLabel: string | null
  dossierStatus: string
  paramsStatus: string
  invoer: HuishoudenInvoer
  resultaat: HuishoudenResultaat
  naam: (id: string) => string
  datum: string
}

export async function maakPdf(g: PdfGegevens): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const marge = 18
  const breedte = doc.internal.pageSize.getWidth() - 2 * marge
  const hoogte = doc.internal.pageSize.getHeight()
  let y = marge

  const ruimte = (nodig: number) => {
    if (y + nodig > hoogte - marge) {
      doc.addPage()
      y = marge
    }
  }
  const tekst = (t: string, opties: { grootte?: number; vet?: boolean; kleur?: [number, number, number]; inspring?: number } = {}) => {
    doc.setFont('helvetica', opties.vet ? 'bold' : 'normal')
    doc.setFontSize(opties.grootte ?? 10)
    doc.setTextColor(...(opties.kleur ?? [17, 24, 39]))
    const regels = doc.splitTextToSize(pdfTekst(t), breedte - (opties.inspring ?? 0)) as string[]
    for (const r of regels) {
      ruimte(5)
      doc.text(r, marge + (opties.inspring ?? 0), y)
      y += (opties.grootte ?? 10) * 0.45
    }
  }
  const regel = (r: Uitlegregel) => {
    const inspring = r.niveau * 5
    const bedrag = bedragTekst(r)
    const vet = r.soort === 'totaal' || r.soort === 'subtotaal' || r.niveau === 0
    doc.setFont('helvetica', vet ? 'bold' : 'normal')
    doc.setFontSize(9)
    const labelBreedte = breedte - inspring - 35
    const labels = doc.splitTextToSize(pdfTekst(r.label), labelBreedte) as string[]
    ruimte(4.5 * labels.length + (r.formule ? 4 : 0) + 1)
    if (r.soort === 'totaal' || r.soort === 'subtotaal') {
      doc.setDrawColor(r.soort === 'totaal' ? 40 : 200)
      doc.line(marge + inspring, y - 3.2, marge + breedte, y - 3.2)
    }
    doc.setTextColor(r.soort === 'info' ? 107 : 17, r.soort === 'info' ? 114 : 24, r.soort === 'info' ? 128 : 39)
    labels.forEach((l, i) => doc.text(l, marge + inspring, y + i * 4.2))
    if (bedrag) doc.text(pdfTekst(bedrag), marge + breedte, y, { align: 'right' })
    y += 4.2 * labels.length
    if (r.formule) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(107, 114, 128)
      const f = doc.splitTextToSize(pdfTekst(r.formule), labelBreedte) as string[]
      for (const l of f) {
        ruimte(4)
        doc.text(l, marge + inspring, y)
        y += 3.4
      }
    }
    y += 1.2
  }

  // Kop
  tekst(`Inkomstenbelasting ${g.jaar}`, { grootte: 18, vet: true })
  y += 1
  tekst(`${SITE.naam} · berekend op ${g.datum}`, { grootte: 9, kleur: [107, 114, 128] })
  tekst(`Status dossier: ${g.dossierStatus} · status parameters: ${g.paramsStatus}${g.variantLabel ? ` · variant: ${g.variantLabel}` : ''}`, { grootte: 9, kleur: [107, 114, 128] })
  y += 3
  tekst(`Te betalen inkomstenbelasting: ${formatEuro(g.resultaat.totaal.teBetalenIB)}`, { vet: true })
  tekst(`Te betalen Zvw: ${formatEuro(g.resultaat.totaal.teBetalenZvw)}`, { vet: true })
  y += 4

  for (const p of g.resultaat.personen) {
    ruimte(14)
    tekst(`Berekening ${g.naam(p.id)}`, { grootte: 13, vet: true })
    y += 2
    for (const r of p.uitleg) regel(r)
    y += 4
  }

  ruimte(14)
  tekst('Huishouden', { grootte: 13, vet: true })
  y += 2
  for (const r of g.resultaat.uitleg) regel(r)
  y += 4

  const gezien = new Set<string>()
  const waarschuwingen: Waarschuwing[] = [...g.resultaat.waarschuwingen, ...g.resultaat.personen.flatMap((p) => p.waarschuwingen)].filter((w) => (gezien.has(w.id) ? false : (gezien.add(w.id), true)))
  if (waarschuwingen.length > 0) {
    ruimte(14)
    tekst('Meldingen', { grootte: 13, vet: true })
    y += 2
    for (const w of waarschuwingen) {
      tekst(`${w.ernst === 'let-op' ? 'Let op' : w.ernst === 'actie' ? 'Te doen' : 'Goed om te weten'}: ${w.tekst}`, { grootte: 9 })
      y += 1.5
    }
    y += 3
  }

  ruimte(12)
  tekst(`${SITE.disclaimer}. Deze berekening is gemaakt met de gegevens die je zelf hebt ingevuld en de parameters die op ${g.datum} bekend waren. Controleer je aangifte altijd zelf of met je adviseur.`, { grootte: 8, kleur: [107, 114, 128] })

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(150)
    doc.text(pdfTekst(`IB ${g.jaar} · ${SITE.disclaimer} · pagina ${i} van ${paginas}`), marge, hoogte - 8)
  }
  return doc.output('blob')
}

export function download(blob: Blob, naam: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = naam
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
