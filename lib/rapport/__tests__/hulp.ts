/** Hulpfuncties voor de rapporttests: rapport bouwen uit een fixture en regels opzoeken op id. */
import { expect } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import { bouwRapport } from '../bouw'
import type { Kolom, RapportDocument, RapportOpties, Regel, Sectie } from '../model'

export const kloon = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

export function bouw(invoer: HuishoudenInvoer, persoon: PersoonId = 'A', extra: Partial<RapportOpties> = {}): RapportDocument {
  const r = berekenHuishouden(invoer, { zonderMarginaleDruk: true })
  return bouwRapport(invoer, r, getJaar(invoer.jaar, invoer.variant), {
    persoon,
    vandaag: '2026-10-04',
    dossierStatus: 'concept',
    toolVersie: 'test',
    naam: (id) => `Persoon ${id}`,
    ...extra,
  })
}

export function alleSecties(doc: RapportDocument): Sectie[] {
  const uit: Sectie[] = []
  const loop = (s: Sectie) => {
    uit.push(s)
    s.secties.forEach(loop)
  }
  doc.hoofdstukken.forEach(loop)
  return uit
}

export function alleRegels(doc: RapportDocument): Regel[] {
  return alleSecties(doc).flatMap((s) => s.blokken.flatMap((b) => (b.soort === 'tabel' ? b.regels : [])))
}

/** Regel-id's én vraag-id's, in volgorde. */
export function alleIds(doc: RapportDocument): string[] {
  return alleSecties(doc).flatMap((s) => s.blokken.flatMap((b) => (b.soort === 'tabel' ? b.regels.map((r) => r.id) : b.soort === 'vraag' ? [b.id] : [])))
}

export function regelMap(doc: RapportDocument): Map<string, Regel> {
  return new Map(alleRegels(doc).map((r) => [r.id, r]))
}

export type Verwacht = Record<string, Partial<Record<Kolom, number>>>

/** Vergelijkt per regel-id de bedragen in de genoemde kolommen. */
export function vergelijk(doc: RapportDocument, verwacht: Verwacht, vervang: (id: string) => string = (id) => id) {
  const regels = regelMap(doc)
  for (const [id, bedragen] of Object.entries(verwacht)) {
    const echt = regels.get(vervang(id))
    expect(echt, `regel ${vervang(id)} ontbreekt`).toBeDefined()
    for (const [kolom, bedrag] of Object.entries(bedragen)) {
      expect(echt?.bedragen?.[kolom as Kolom], `${vervang(id)} kolom ${kolom}`).toBe(bedrag)
    }
  }
}

/** Alle teksten die een lezer ziet: titels, labels, kolomkoppen, tekst- en vraagblokken, voorblad, kopregel en verantwoording. */
export function alleTeksten(doc: RapportDocument): string[] {
  const t: string[] = [doc.titel, doc.naam, doc.kopregel.links, ...doc.kopregel.rechts, ...doc.voorblad.adresregels, ...doc.voorblad.regels.flatMap((r) => [r.label, r.waarde])]
  for (const s of alleSecties(doc)) {
    t.push(s.titel, ...(s.kopKolommen ?? []).flatMap((k) => k.regels))
    for (const b of s.blokken) {
      if (b.soort === 'tabel') {
        t.push(...(b.koppen ?? []).flatMap((k) => k.regels), ...(b.herhaalKop ? [b.herhaalKop] : []))
        for (const r of b.regels) t.push(r.label ?? '', ...Object.values(r.teksten ?? {}))
      } else if (b.soort === 'tekst') t.push(b.tekst)
      else if (b.soort === 'vraag') t.push(b.vraag, b.antwoord)
      else t.push(...b.rijen.flatMap((r) => [r.label, r.waarde ?? '']))
    }
  }
  const v = doc.verantwoording
  t.push(v.statusZin, ...v.uitkomsten.map((u) => u.label), ...v.bronnen.flatMap((b) => [b.onderdeel, b.bron]), ...v.parameters.flatMap((p) => [p.blok, p.bron ?? '']))
  t.push(...v.methoden.flatMap((m) => [m.label, m.waarde]), ...v.nietMeegenomen, ...v.verschillen.flatMap((x) => [x.label, x.toelichting ?? '']), ...v.meldingen.map((m) => m.tekst))
  return t
}
