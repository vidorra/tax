/**
 * Platte weergaven van het rapportmodel, gedeeld door de PDF- en de Excel-weergave.
 *
 *  - platteSecties(): alle secties in leesvolgorde met hun nummer (zoals nummer() ze invult, met een
 *    terugval op de positie als het nummer nog ontbreekt).
 *  - platteRegels(): elk bedrag als eigen rij, voor het tabblad Gegevens.
 *  - invoerPaden(): de invoer als pad-waardeparen, voor het tabblad Invoer.
 *
 * Puur: geen jsPDF, geen Excel, geen I/O.
 */
import type { Kolom, RapportDocument, Regel, Sectie, TabelBlok } from './model'
import type { PersoonId } from '@/lib/tax/types'

/** Bedragkolommen van links naar rechts. */
export const KOLOMMEN: readonly Kolom[] = ['N', 'Z', 'A', 'B', 'C']

export function isKolom(x: string): x is Kolom {
  return (KOLOMMEN as readonly string[]).includes(x)
}

/**
 * Tekstkolommen van een tabel, van links naar rechts. De eerste is de labelkolom (20,4 mm in de PDF, kolom B in
 * Excel): de kolom 'omschrijving' als die een kop heeft; anders een naamloze labelkolom ('') als de regels een
 * label hebben; anders de eerste tekstkolom uit de koppen. Daarna de overige tekstkolommen in de volgorde van de
 * koppen en tot slot tekstcellen zonder kop. Tekst onder een kolomletter ('Z', 'A') staat in die bedragkolom.
 */
export function tabelTekstKolommen(blok: TabelBlok): string[] {
  const uitKoppen = (blok.koppen ?? []).map((k) => k.kolom).filter((k) => !isKolom(k))
  const metLabel = blok.regels.some((r) => !!r.label && r.soort !== 'groepskop' && r.soort !== 'subkop')
  const namen = uitKoppen.includes('omschrijving')
    ? ['omschrijving', ...uitKoppen.filter((k) => k !== 'omschrijving')]
    : uitKoppen.length === 0 || metLabel
      ? ['', ...uitKoppen]
      : [...uitKoppen]
  for (const r of blok.regels) for (const k of Object.keys(r.teksten ?? {})) if (!isKolom(k) && !namen.includes(k)) namen.push(k)
  return namen
}

export interface PlatteSectie {
  sectie: Sectie
  /** '2', '2.2', '2.2.1' */
  nummer: string
  niveau: 1 | 2 | 3
  /** Het hoofdstuk (niveau 1) waar deze sectie onder valt; bij een hoofdstuk zichzelf. */
  hoofdstuk: Sectie
  hoofdstukNummer: string
}

/** Kop zoals het rapport hem schrijft: nummer, één spatie, titel. */
export function kopTekst(nummer: string, titel: string): string {
  return nummer ? `${nummer} ${titel}` : titel
}

/** Alle secties van een document in leesvolgorde (diepte eerst). */
export function platteSecties(doc: RapportDocument): PlatteSectie[] {
  const uit: PlatteSectie[] = []
  const loop = (secties: Sectie[], ouderNummer: string, hoofdstuk: { sectie: Sectie; nummer: string } | null) => {
    secties.forEach((sectie, i) => {
      const nummer = sectie.nummer ?? (ouderNummer ? `${ouderNummer}.${i + 1}` : String(i + 1))
      const hs = hoofdstuk ?? { sectie, nummer }
      uit.push({ sectie, nummer, niveau: sectie.niveau, hoofdstuk: hs.sectie, hoofdstukNummer: hs.nummer })
      loop(sectie.secties, nummer, hs)
    })
  }
  loop(doc.hoofdstukken, '', null)
  return uit
}

export interface PlatteRegel {
  jaar: number
  persoon: PersoonId
  /** Naam van de belastingplichtige zoals in het rapport. */
  naam: string
  /** '2 Inkomstenbelasting en premieheffing' */
  hoofdstuk: string
  /** De sectie die de regel bevat: '2.2.1 Verschuldigde inkomstenbelasting en premie volksverzekeringen'. */
  paragraaf: string
  regelId: string
  omschrijving: string
  kolom: Kolom
  peildatum: 'begin' | 'eind' | null
  bedrag: number
  soort: Regel['soort']
  herkomst: string | null
}

/**
 * Elk bedrag van elke tabelregel als eigen rij, in de volgorde van het rapport.
 * Percentages (box 3-rendementstabel) en tekstcellen tellen niet mee: dit is een lijst van bedragen.
 * Een regel zonder omschrijving (subtotaal onder een lijst) krijgt de tekstcellen of de laatste groepskop.
 */
export function platteRegels(docs: RapportDocument[]): PlatteRegel[] {
  const uit: PlatteRegel[] = []
  for (const doc of docs) {
    for (const ps of platteSecties(doc)) {
      const hoofdstuk = kopTekst(ps.hoofdstukNummer, ps.hoofdstuk.titel)
      const paragraaf = kopTekst(ps.nummer, ps.sectie.titel)
      let laatsteKop = ps.sectie.titel
      for (const blok of ps.sectie.blokken) {
        if (blok.soort === 'tekst') {
          if (blok.stijl === 'vet') laatsteKop = blok.tekst
          continue
        }
        if (blok.soort !== 'tabel') continue
        if (blok.herhaalKop) laatsteKop = blok.herhaalKop
        for (const r of blok.regels) {
          if ((r.soort === 'groepskop' || r.soort === 'subkop') && r.label) laatsteKop = r.label
          if (!r.bedragen) continue
          const omschrijving = r.label ?? (Object.values(r.teksten ?? {}).filter(Boolean).join(' · ') || laatsteKop)
          for (const kolom of KOLOMMEN) {
            const bedrag = r.bedragen[kolom]
            if (bedrag === undefined || bedrag === null || !Number.isFinite(bedrag)) continue
            uit.push({
              jaar: doc.jaar,
              persoon: doc.persoon,
              naam: doc.naam,
              hoofdstuk,
              paragraaf,
              regelId: r.id,
              omschrijving,
              kolom,
              peildatum: r.peildatum?.[kolom] ?? null,
              bedrag,
              soort: r.soort,
              herkomst: r.herkomst ?? null,
            })
          }
        }
      }
    }
  }
  return uit
}

export interface InvoerPad {
  pad: string
  waarde: string | number | boolean | null
}

const NAAM = /^[A-Za-z_$][\w$]*$/

/**
 * De invoer als pad-waardeparen: `personen[0].inkomensvoorziening.lijfrentePremies` = 9800.
 * Lege lijsten en objecten krijgen '[]' of '{}', zodat zichtbaar is dat ze er zijn; undefined valt weg.
 */
export function invoerPaden(invoer: unknown): InvoerPad[] {
  const uit: InvoerPad[] = []
  const sleutel = (pad: string, k: string) => (NAAM.test(k) ? (pad ? `${pad}.${k}` : k) : `${pad}[${JSON.stringify(k)}]`)
  const loop = (w: unknown, pad: string) => {
    if (w === undefined || typeof w === 'function' || typeof w === 'symbol') return
    if (w === null) {
      uit.push({ pad, waarde: null })
    } else if (Array.isArray(w)) {
      if (w.length === 0) uit.push({ pad, waarde: '[]' })
      w.forEach((x, i) => loop(x, `${pad}[${i}]`))
    } else if (w instanceof Date) {
      uit.push({ pad, waarde: Number.isNaN(w.getTime()) ? null : w.toISOString() })
    } else if (typeof w === 'object') {
      const sleutels = Object.keys(w as Record<string, unknown>)
      if (sleutels.length === 0) uit.push({ pad, waarde: '{}' })
      for (const k of sleutels) loop((w as Record<string, unknown>)[k], sleutel(pad, k))
    } else if (typeof w === 'number') {
      uit.push({ pad, waarde: Number.isFinite(w) ? w : String(w) })
    } else if (typeof w === 'string' || typeof w === 'boolean') {
      uit.push({ pad, waarde: w })
    } else {
      uit.push({ pad, waarde: String(w) })
    }
  }
  loop(invoer, '')
  return uit
}
