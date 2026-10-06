/**
 * pdfTekst: alleen tekens die jsPDF met de standaardlettertypen kan zetten (WinAnsi). Letters daarbuiten worden
 * getranslitereerd, zodat een naam als Şükrü Öztürk niet als 'ükrü Öztürk' op het rapport staat.
 */
import { describe, expect, it } from 'vitest'
import { pdfTekst } from '../pdf'

describe('pdfTekst', () => {
  it('laat Latin-1, het euroteken en de WinAnsi-letters staan', () => {
    expect(pdfTekst('Zoë Ørsted, Brühl & Søn, façade, ß, æ, ½')).toBe('Zoë Ørsted, Brühl & Søn, façade, ß, æ, ½')
    expect(pdfTekst('(max. € 71.628)')).toBe('(max. € 71.628)')
    expect(pdfTekst('Šimon Žák, Œuvre, Ÿ, • punt')).toBe('Šimon Žák, Œuvre, Ÿ, • punt')
  })

  it('translitereert letters buiten WinAnsi in plaats van ze weg te laten', () => {
    expect(pdfTekst('Şükrü Öztürk')).toBe('Sükrü Öztürk')
    expect(pdfTekst('Łukasz Wiśniewski')).toBe('Lukasz Wisniewski')
    expect(pdfTekst('Yılmaz Şahin')).toBe('Yilmaz Sahin')
    expect(pdfTekst('Łucja Dvořák, Śniadeckiego 4')).toBe('Lucja Dvorák, Sniadeckiego 4')
    expect(pdfTekst('Đorđe Petrović, Ħamrun, Nguyễn Văn Ơn')).toBe('Dorde Petrovic, Hamrun, Nguyên Van On')
    expect(pdfTekst('Erdoğan, Kovács Ő., İstanbul, Ĳsselmeer')).toBe('Erdogan, Kovács O., Istanbul, IJsselmeer')
  })

  it('maakt van een los accentteken één letter (NFC) en vervangt typografische tekens', () => {
    expect(pdfTekst('Zoë Café')).toBe('Zoë Café')
    expect(pdfTekst('−5 – 6 ‘a’ “b” ≤ ≥ …')).toBe('-5 - 6 \'a\' "b" <= >= ...')
  })

  it('laat tekens zonder Latijnse tegenhanger weg', () => {
    expect(pdfTekst('A → B ✓ 中')).toBe('A  B  ')
  })
})

describe('pdfVeiligeDocumenten', () => {
  it('een naam die de PDF niet kan zetten wordt Persoon A, met een melding; een Latijnse naam blijft', async () => {
    const { pdfVeiligeDocumenten } = await import('../rapport-pdf')
    const { voorbeeldRapport } = await import('./rapport-voorbeeld')
    const basis = voorbeeldRapport()
    const grieks = { ...basis, naam: 'Ελένη Παπαδοπούλου', kopregel: { ...basis.kopregel, links: `Fiscaal rapport van Ελένη Παπαδοπούλου` } }
    const [veilig] = pdfVeiligeDocumenten([grieks])
    expect(veilig.naam).toBe(`Persoon ${basis.persoon}`)
    expect(veilig.kopregel.links).toBe(`Fiscaal rapport van Persoon ${basis.persoon}`)
    expect(veilig.verantwoording.meldingen.at(-1)?.tekst).toContain('In de Excel-versie staat de naam wel.')
    const latijn = { ...basis, naam: 'Şükrü Öztürk' }
    expect(pdfVeiligeDocumenten([latijn])[0]).toBe(latijn)
  })
})
