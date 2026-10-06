/**
 * Excel-weergave van het fiscaal rapport (write-excel-file), uit hetzelfde model als de PDF.
 *
 * Tabbladen (rapport-koppeling 14.1, rapport-spec 5):
 *  - 'Rapport <naam>' per document: dezelfde regels als de PDF. Kolommen A nummer, B omschrijving,
 *    C en D tekstkolommen (D ook kolom N), E tot en met H de bedragkolommen Z, A, B en C.
 *    Bedragen als getal met formaat #,##0;-#,##0;0, percentages als getal 0,00%, strepen als celranden.
 *    Koppen en tekst in een bedragkolom staan rechts, tenzij het model ze links zet (uitlijning, tekstLinks);
 *    het antwoord op een vraag staat in kolom H, of links in de kolom van antwoordKolom.
 *  - 'Gegevens': elk bedrag als eigen rij met hoofdstuk, regel-id, kolom, peildatum en herkomst.
 *  - 'Invoer': de invoer van het jaar als pad-waardeparen.
 *  - 'Parameters': rekenparameters met status en bron uit de verantwoording.
 *  - 'Samenvatting': uitkomsten, verantwoording, meldingen en verschillen met de accountant.
 *
 * Alleen waarden, geen formules (een formule zonder opgeslagen uitkomst toont in sommige viewers leeg).
 */
import type { CellObject, Row, SheetData } from 'write-excel-file/browser'
import type { Kolom, KolomKop, RapportDocument, Regel, Sectie, TabelBlok } from '@/lib/rapport/model'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { invoerPaden, isKolom, KOLOMMEN, platteRegels, platteSecties, tabelTekstKolommen, type PlatteRegel } from '@/lib/rapport/plat'
import { formatDatum } from '@/components/ui/format'
import { SITE } from '@/lib/site'
import { zonderHerkomst } from '@/lib/import/privacy'

/** Hele euro's met duizendtalscheiding; Nederlandse Excel toont 127.935 en -13.260. */
export const BEDRAG_FORMAAT = '#,##0;-#,##0;0'
/** Getoond als 1,44% in Nederlandse Excel. */
export const PROCENT_FORMAAT = '0.00%'
const LETTERTYPE = 'Times New Roman'

export interface RapportXlsxExtra {
  invoer: HuishoudenInvoer
  /** Platte regels als ze al berekend zijn; anders uit de documenten. */
  regels?: ReturnType<typeof platteRegels>
}

/** Eén tabblad zoals write-excel-file het verwacht. */
export interface Blad {
  sheet: string
  data: SheetData
  columns: Array<{ width: number }>
  showGridLines?: boolean
  stickyRowsCount?: number
}

export interface RapportWerkmap {
  bladen: Blad[]
  opties: { fontFamily: string; fontSize: number }
}

/**
 * Elke rij begint met een cel in kolom A (zo nodig een lege, met alleen opmaak). Voorvertoning (Quick Look) op
 * de Mac toont anders niets van een werkblad waarvan de eerste rij pas in kolom B begint.
 */
function metKolomA(data: SheetData): SheetData {
  return data.map((rij) => (rij.length > 0 && rij[0] !== null && rij[0] !== undefined ? rij : [{}, ...rij.slice(1)]))
}

// ---------------------------------------------------------------------------
// Tabbladnamen
// ---------------------------------------------------------------------------

/** Excel: hoogstens 31 tekens, niet leeg, geen []:*?/\ en niet beginnen of eindigen met een apostrof. */
export function bladNaam(naam: string, bezet: Set<string>): string {
  const schoon = naam.replace(/[[\]:*?/\\]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '') || 'Blad'
  let kandidaat = schoon.slice(0, 31).trim()
  for (let i = 2; bezet.has(kandidaat.toLowerCase()); i++) {
    const achter = ` (${i})`
    kandidaat = `${schoon.slice(0, 31 - achter.length).trim()}${achter}`
  }
  bezet.add(kandidaat.toLowerCase())
  return kandidaat
}

// ---------------------------------------------------------------------------
// Tabblad Rapport
// ---------------------------------------------------------------------------

const AANTAL_KOLOMMEN = 8
/** Excel-kolom (0 = A) per bedragkolom van het model. */
const KOLOM_INDEX: Record<Kolom, number> = { N: 3, Z: 4, A: 5, B: 6, C: 7 }

/** Kolomkop: boven een bedragkolom rechts, tenzij de kop links staat (5.6.1 Begin en Einde); boven tekst links. */
const kopUitlijning = (k: KolomKop): 'left' | 'right' => (isKolom(k.kolom) && k.uitlijning !== 'links' ? 'right' : 'left')

const KOP_GROOTTE: Record<1 | 2 | 3, number> = { 1: 14, 2: 13, 3: 11 }

type Cel = CellObject | null

const leegRij = (): Cel[] => new Array<Cel>(AANTAL_KOLOMMEN).fill(null)
const tekst = (value: string, stijl: Partial<CellObject> = {}): CellObject => ({ value, type: String, ...stijl })
const getal = (value: number, format: string, stijl: Partial<CellObject> = {}): CellObject => ({ value, type: Number, format, ...stijl })

function gebruikt(blok: TabelBlok, k: Kolom): boolean {
  if ((blok.koppen ?? []).some((x) => x.kolom === k)) return true
  return blok.regels.some(
    (r) => r.bedragen?.[k] !== undefined || r.percentages?.[k] !== undefined || !!r.teksten?.[k] || [...(r.streepBoven ?? []), ...(r.streepOnder ?? []), ...(r.dubbelOnder ?? [])].includes(k),
  )
}

/**
 * Excel-kolom per tekstkolom: de eerste (het label) in B, daarna C, en D en E als de kolommen N en Z in
 * deze tabel vrij zijn. Wat dan nog over is, komt samen in de laatste vrije kolom.
 */
function tekstKolomPlaatsen(blok: TabelBlok): Map<string, number> {
  const namen = tabelTekstKolommen(blok)
  const vrij = [2]
  if (!gebruikt(blok, 'N')) {
    vrij.push(KOLOM_INDEX.N)
    if (!gebruikt(blok, 'Z')) vrij.push(KOLOM_INDEX.Z)
  }
  const uit = new Map<string, number>([[namen[0], 1]])
  namen.slice(1).forEach((naam, i) => uit.set(naam, vrij[Math.min(i, vrij.length - 1)]))
  return uit
}

function opmaak(vet: boolean, cursief: boolean): Partial<CellObject> {
  return { ...(vet ? { fontWeight: 'bold' as const } : {}), ...(cursief ? { fontStyle: 'italic' as const } : {}) }
}

function zetCel(rij: Cel[], i: number, cel: CellObject) {
  const bestaand = rij[i]
  if (bestaand && typeof bestaand.value === 'string' && typeof cel.value === 'string' && bestaand.value) {
    rij[i] = { ...bestaand, value: `${bestaand.value} · ${cel.value}` }
  } else {
    rij[i] = { ...(bestaand ?? {}), ...cel }
  }
}

function koppenRij(koppen: KolomKop[], plaatsen: Map<string, number>): Row {
  const rij = leegRij()
  let regels = 1
  for (const k of koppen) {
    const i = isKolom(k.kolom) ? KOLOM_INDEX[k.kolom] : plaatsen.get(k.kolom) ?? 1
    regels = Math.max(regels, k.regels.length)
    zetCel(rij, i, tekst(k.regels.join('\n'), {
      ...opmaak(true, k.stijl === 'kop'),
      align: kopUitlijning(k),
      alignVertical: 'bottom',
      wrap: true,
      ...(k.streepOnder ? { bottomBorderStyle: 'thin' as const } : {}),
    }))
  }
  if (regels > 1) {
    const eerste = rij.find((c) => c) as CellObject | undefined
    if (eerste) eerste.height = 13 * regels
  }
  return rij
}

function regelRij(r: Regel, plaatsen: Map<string, number>): Row {
  const rij = leegRij()
  const kopRegel = r.soort === 'groepskop' || r.soort === 'subkop'
  const vetLabel = kopRegel || r.vet === 'regel'
  const cursief = r.soort === 'subkop' || !!r.cursief
  const labelNaam = [...plaatsen.entries()].find(([, i]) => i === 1)?.[0] ?? ''
  const label = (labelNaam ? r.teksten?.[labelNaam] : undefined) ?? r.label
  if (label) rij[1] = tekst(label, { ...opmaak(vetLabel, cursief), wrap: true, alignVertical: 'bottom' })
  for (const [naam, waarde] of Object.entries(r.teksten ?? {})) {
    if (!waarde || naam === labelNaam || isKolom(naam)) continue
    zetCel(rij, plaatsen.get(naam) ?? 2, tekst(waarde, { ...opmaak(r.vet === 'regel', cursief), alignVertical: 'bottom' }))
  }
  const vetBedrag = !!r.vet
  for (const k of KOLOMMEN) {
    const i = KOLOM_INDEX[k]
    const bedrag = r.bedragen?.[k]
    const pct = r.percentages?.[k]
    const t = r.teksten?.[k]
    if (typeof bedrag === 'number' && Number.isFinite(bedrag)) zetCel(rij, i, getal(bedrag, BEDRAG_FORMAAT, opmaak(vetBedrag, !!r.cursief)))
    else if (typeof pct === 'number' && Number.isFinite(pct)) zetCel(rij, i, getal(pct, PROCENT_FORMAAT, opmaak(vetBedrag, !!r.cursief)))
    else if (t) zetCel(rij, i, tekst(t, { ...opmaak(vetBedrag, !!r.cursief), align: r.tekstLinks?.includes(k) ? 'left' : 'right' }))
  }
  const rand = (k: Kolom, stijl: Partial<CellObject>) => {
    const i = KOLOM_INDEX[k]
    rij[i] = { ...(rij[i] ?? {}), ...stijl }
  }
  for (const k of r.streepBoven ?? []) rand(k, { topBorderStyle: 'thin' })
  for (const k of r.streepOnder ?? []) rand(k, { bottomBorderStyle: 'thin' })
  for (const k of r.dubbelOnder ?? []) rand(k, { bottomBorderStyle: 'double' })
  return rij
}

function rapportBlad(doc: RapportDocument): SheetData {
  const rijen: Row[] = []
  // Ronde 2 (A3): een concept (open fouten in een jaar dat niet is ingediend) heeft CONCEPT op de eerste regel.
  if (doc.concept) rijen.push([null, tekst('CONCEPT', { fontWeight: 'bold', fontSize: 14 })])
  rijen.push([null, tekst(doc.kopregel.links, { fontWeight: 'bold', fontSize: 11 })])
  if (doc.kopregel.rechts.length > 0) rijen.push([null, tekst(doc.kopregel.rechts.join(' · '))])
  if (doc.verantwoording.statusZin) rijen.push([null, tekst(doc.verantwoording.statusZin, { fontStyle: 'italic' })])

  let vorigeWasKop = false
  // Twee koppenrijen achter elkaar (peildata, dan 'Omschrijving' in 3.2.2) krijgen een witregel ertussen, zoals in de PDF.
  let vorigeWasKoppen = false
  const wit = (n: number) => {
    for (let i = 0; i < n; i++) rijen.push(leegRij())
  }

  for (const ps of platteSecties(doc)) {
    const s: Sectie = ps.sectie
    wit(s.niveau === 1 ? 2 : vorigeWasKop ? 0 : 1)
    const kop = leegRij()
    kop[0] = tekst(ps.nummer, { fontWeight: 'bold', fontSize: KOP_GROOTTE[s.niveau] })
    kop[1] = tekst(s.titel, { fontWeight: 'bold', fontSize: KOP_GROOTTE[s.niveau] })
    for (const k of s.kopKolommen ?? []) {
      if (!isKolom(k.kolom)) continue
      zetCel(kop, KOLOM_INDEX[k.kolom], tekst(k.regels.join('\n'), {
        ...opmaak(true, k.stijl === 'kop'),
        align: kopUitlijning(k),
        alignVertical: 'bottom',
        ...(k.streepOnder ? { bottomBorderStyle: 'thin' as const } : {}),
      }))
    }
    rijen.push(kop)
    vorigeWasKop = true

    let reeks: string | undefined
    let vorigeKop: string | undefined
    for (const b of s.blokken) {
      if (b.soort === 'tabel') {
        const plaatsen = tekstKolomPlaatsen(b)
        const eerste = b.regels[0]
        const alGetoond = b.herhaalKop === reeks || b.herhaalKop === vorigeKop || (eerste?.soort === 'groepskop' && eerste.label === b.herhaalKop)
        if (b.herhaalKop && !alGetoond) {
          if (!vorigeWasKop) wit(1)
          rijen.push([null, tekst(b.herhaalKop, { fontWeight: 'bold' })])
        }
        reeks = b.herhaalKop
        const laatste = b.regels[b.regels.length - 1]
        vorigeKop = laatste && (laatste.soort === 'groepskop' || laatste.soort === 'subkop') ? laatste.label : undefined
        if (b.koppen?.length) {
          if (vorigeWasKoppen) wit(1)
          rijen.push(koppenRij(b.koppen, plaatsen))
          vorigeWasKoppen = b.regels.length === 0
        }
        for (const r of b.regels) {
          wit(r.witVoor ?? 0)
          rijen.push(regelRij(r, plaatsen))
          vorigeWasKoppen = false
        }
      } else if (b.soort === 'tekst') {
        vorigeWasKoppen = false
        reeks = undefined
        vorigeKop = b.stijl === 'vet' ? b.tekst : undefined
        wit(b.witVoor ?? 0)
        const waarde = b.stijl === 'opsomming' ? `• ${b.tekst}` : b.tekst
        // Een opsomming in het rapport is de kop van een blok (3.3), dus vet zoals in de PDF.
        rijen.push([null, tekst(waarde, { ...opmaak(b.stijl === 'vet' || b.stijl === 'opsomming', b.stijl === 'cursief'), wrap: true })])
      } else if (b.soort === 'vraag') {
        reeks = vorigeKop = undefined
        wit(b.witVoor ?? 0)
        const rij = leegRij()
        rij[1] = tekst(b.vraag, { wrap: true, alignVertical: 'bottom' })
        if (b.antwoordKolom) rij[KOLOM_INDEX[b.antwoordKolom]] = tekst(b.antwoord, { align: 'left', alignVertical: 'bottom' })
        else rij[7] = tekst(b.antwoord, { align: 'right', alignVertical: 'bottom' })
        rijen.push(rij)
      } else {
        reeks = vorigeKop = undefined
        for (const g of b.rijen) {
          wit(g.witVoor ?? 0)
          const rij = leegRij()
          rij[1] = tekst(g.label, { ...opmaak(!!g.kop, false), wrap: g.waarde === undefined })
          if (g.waarde !== undefined && g.waarde !== '') rij[2] = tekst(g.waarde)
          rijen.push(rij)
        }
      }
      vorigeWasKop = false
    }
  }
  return rijen
}

// ---------------------------------------------------------------------------
// Overige tabbladen
// ---------------------------------------------------------------------------

const KOP_STIJL: Partial<CellObject> = { fontWeight: 'bold', bottomBorderStyle: 'thin' }

function gegevensBlad(regels: PlatteRegel[]): SheetData {
  const kop = ['jaar', 'persoon', 'hoofdstuk', 'paragraaf', 'regel-id', 'omschrijving', 'kolom', 'peildatum', 'bedrag', 'soort', 'herkomst'].map((k) =>
    tekst(k, { ...KOP_STIJL, ...(k === 'bedrag' || k === 'jaar' ? { align: 'right' as const } : {}) }),
  )
  return [
    kop,
    ...regels.map((r): Row => [
      getal(r.jaar, '0'),
      tekst(r.naam || r.persoon),
      tekst(r.hoofdstuk),
      tekst(r.paragraaf),
      tekst(r.regelId),
      tekst(r.omschrijving),
      tekst(r.kolom),
      r.peildatum ? tekst(r.peildatum) : null,
      getal(r.bedrag, BEDRAG_FORMAAT),
      tekst(r.soort),
      r.herkomst ? tekst(r.herkomst) : null,
    ]),
  ]
}

function invoerBlad(invoer: HuishoudenInvoer): SheetData {
  return [
    [tekst('pad', KOP_STIJL), tekst('waarde', KOP_STIJL)],
    ...invoerPaden(zonderHerkomst(invoer)).map(({ pad, waarde }): Row => [
      tekst(pad),
      waarde === null
        ? null
        : typeof waarde === 'number'
          ? { value: waarde, type: Number }
          : typeof waarde === 'boolean'
            ? { value: waarde, type: Boolean }
            : tekst(waarde),
    ]),
  ]
}

function parametersBlad(docs: RapportDocument[]): SheetData {
  // Beide partners hebben dezelfde parameters van het jaar: één rij per jaar en onderdeel, met bron als die er is.
  const perSleutel = new Map<string, { jaar: number; blok: string; status: string; bron?: string }>()
  for (const d of docs) {
    for (const p of d.verantwoording.parameters) {
      const sleutel = `${d.jaar}|${p.blok}`
      const bestaand = perSleutel.get(sleutel)
      if (!bestaand || (!bestaand.bron && p.bron)) perSleutel.set(sleutel, { jaar: d.jaar, blok: p.blok, status: p.status, bron: p.bron })
    }
  }
  return [
    [tekst('jaar', { ...KOP_STIJL, align: 'right' }), tekst('onderdeel', KOP_STIJL), tekst('status', KOP_STIJL), tekst('bron', KOP_STIJL)],
    ...[...perSleutel.values()].map((p): Row => [getal(p.jaar, '0'), tekst(p.blok), tekst(p.status), p.bron ? tekst(p.bron) : null]),
  ]
}

const ERNST: Record<'info' | 'let-op' | 'actie', string> = { info: 'Goed om te weten', 'let-op': 'Let op', actie: 'Te doen' }

function datumTijd(iso: string): string {
  const tijd = /T(\d{2}):(\d{2})/.exec(iso)
  return tijd ? `${formatDatum(iso)} om ${tijd[1]}:${tijd[2]}` : formatDatum(iso)
}

function samenvattingBlad(docs: RapportDocument[]): SheetData {
  const rijen: Row[] = []
  const kop = (t: string) => {
    rijen.push([])
    rijen.push([tekst(t, { fontWeight: 'bold', fontSize: 11 })])
  }
  /** Kolomkoppen vet cursief; een naam die met '>' begint, staat rechts (boven getallen). */
  const kolomkoppen = (...namen: string[]) =>
    rijen.push(namen.map((n) => (n.startsWith('>') ? tekst(n.slice(1), { ...opmaak(true, true), align: 'right' }) : tekst(n, opmaak(true, true)))))

  docs.forEach((d, i) => {
    const v = d.verantwoording
    if (i > 0) rijen.push([], [])
    // Ronde 2 (A3): CONCEPT en de kopregel over de controles bovenaan, daaronder de lijst open fouten of open controles.
    if (d.concept) rijen.push([tekst('CONCEPT', { fontWeight: 'bold', fontSize: 14 })])
    rijen.push([tekst(`${d.titel} van ${d.naam}`, { fontWeight: 'bold', fontSize: 13 })])
    rijen.push([tekst(v.statusZin, { fontWeight: 'bold' })])
    const ctl = v.controles
    if (ctl?.kop) rijen.push([tekst(ctl.kop, { fontWeight: 'bold' })])
    if (ctl?.openTitel && ctl.open.length > 0) {
      kop(ctl.openTitel)
      kolomkoppen('Controle', '', '', '', 'Uitleg')
      for (const x of ctl.open) rijen.push([tekst(x.waar ? `${x.titel} (${x.waar})` : x.titel, { wrap: true }), null, null, null, tekst(x.uitleg, { wrap: true })])
    }

    kop('Uitkomsten')
    for (const u of v.uitkomsten) {
      rijen.push([
        tekst(u.label),
        getal(u.bedrag, BEDRAG_FORMAAT, {
          fontWeight: 'bold',
          ...(u.afsluiting === 'dubbel' ? { bottomBorderStyle: 'double' as const } : u.afsluiting === 'enkel' ? { bottomBorderStyle: 'thin' as const } : {}),
        }),
      ])
    }

    if (v.bronnen.length > 0) {
      kop('Bron van de cijfers')
      kolomkoppen('Onderdeel', 'Bron')
      for (const b of v.bronnen) rijen.push([tekst(b.onderdeel), tekst(b.bron)])
    }
    if (v.methoden.length > 0) {
      kop('Methoden en keuzes')
      for (const m of v.methoden) rijen.push([tekst(m.label), tekst(m.waarde)])
    }
    if (v.nietMeegenomen.length > 0) {
      kop('Niet meegenomen of weggelaten')
      for (const t of v.nietMeegenomen) rijen.push([tekst(t, { wrap: true })])
    }
    if (ctl && ctl.genegeerd.length > 0) {
      kop('Bewust genegeerde controles')
      kolomkoppen('Controle', 'Datum', '', '', 'Reden')
      for (const g of ctl.genegeerd) rijen.push([tekst(g.waar ? `${g.titel} (${g.waar})` : g.titel, { wrap: true }), tekst(g.datum), null, null, tekst(g.reden ?? '', { wrap: true })])
    }
    if (v.verschillen.length > 0) {
      kop('Verschillen met het rapport van de accountant')
      kolomkoppen('Omschrijving', '>Accountant', '>Berekend', '>Verschil', 'Toelichting')
      for (const x of v.verschillen) {
        rijen.push([
          tekst(x.label),
          x.accountant === null ? null : getal(x.accountant, BEDRAG_FORMAAT),
          getal(x.berekend, BEDRAG_FORMAAT),
          x.accountant === null ? null : getal(x.berekend - x.accountant, BEDRAG_FORMAAT),
          x.toelichting ? tekst(x.toelichting, { wrap: true }) : null,
        ])
      }
    }
    if (v.meldingen.length > 0) {
      kop('Meldingen')
      for (const m of v.meldingen) rijen.push([tekst(ERNST[m.ernst] ?? 'Melding'), tekst(m.tekst, { wrap: true })])
    }
    kop('Over deze berekening')
    rijen.push([tekst('Berekend op'), tekst(datumTijd(v.berekendOp))])
    rijen.push([tekst('Opgesteld met'), tekst(SITE.naam)])
    if (v.toolVersie) rijen.push([tekst('Versie'), tekst(v.toolVersie)])
    rijen.push([tekst('Rekenparameters'), tekst('Zie het tabblad Parameters.')])
  })
  return rijen
}

// ---------------------------------------------------------------------------
// Werkmap en export
// ---------------------------------------------------------------------------

/** De werkmap als gegevens (puur); de exportfuncties hieronder schrijven hem weg. */
export function rapportWerkmap(docs: RapportDocument[], extra: RapportXlsxExtra): RapportWerkmap {
  if (docs.length === 0) throw new Error('Geen rapport om te exporteren.')
  const bezet = new Set<string>(['gegevens', 'invoer', 'parameters', 'samenvatting', 'history'])
  const meerdereJaren = new Set(docs.map((d) => d.jaar)).size > 1
  const bladen: Blad[] = docs.map((d) => ({
    sheet: bladNaam(meerdereJaren ? `Rapport ${d.jaar} ${d.naam}` : `Rapport ${d.naam}`, bezet),
    data: rapportBlad(d),
    columns: [{ width: 8 }, { width: 60 }, { width: 24 }, { width: 16 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }],
    showGridLines: false,
  }))
  bladen.push(
    {
      sheet: 'Gegevens',
      data: gegevensBlad(extra.regels ?? platteRegels(docs)),
      columns: [{ width: 6 }, { width: 16 }, { width: 36 }, { width: 48 }, { width: 30 }, { width: 48 }, { width: 7 }, { width: 10 }, { width: 13 }, { width: 11 }, { width: 44 }],
      stickyRowsCount: 1,
    },
    { sheet: 'Invoer', data: invoerBlad(extra.invoer), columns: [{ width: 64 }, { width: 32 }], stickyRowsCount: 1 },
    { sheet: 'Parameters', data: parametersBlad(docs), columns: [{ width: 6 }, { width: 40 }, { width: 12 }, { width: 60 }], stickyRowsCount: 1 },
    { sheet: 'Samenvatting', data: samenvattingBlad(docs), columns: [{ width: 60 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 60 }], showGridLines: false },
  )
  return { bladen: bladen.map((b) => ({ ...b, data: metKolomA(b.data) })), opties: { fontFamily: LETTERTYPE, fontSize: 10 } }
}

/** Werkmap voor de browser. */
export async function maakRapportXlsx(docs: RapportDocument[], extra: RapportXlsxExtra): Promise<Blob> {
  const { bladen, opties } = rapportWerkmap(docs, extra)
  const { default: schrijf } = await import('write-excel-file/browser')
  return schrijf(bladen, opties).toBlob()
}

/** Dezelfde werkmap als bytes, voor Node (tests en scripts). */
export async function rapportXlsxBytes(docs: RapportDocument[], extra: RapportXlsxExtra): Promise<Uint8Array> {
  const { bladen, opties } = rapportWerkmap(docs, extra)
  // Niet meebundelen in de browser: de Node-variant gebruikt node:fs en node:stream.
  const { default: schrijf } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'write-excel-file/node')
  const buffer = await schrijf(bladen, opties).toBuffer()
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}
