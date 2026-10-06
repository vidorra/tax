/** Exportkeuze, invoer voor Excel, bestandsnamen, versie en tijdstip van het fiscaal rapport, en het bouwen voor één of beide personen. */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { lokaalTijdstip, rapportBestandsnaam, rapportInvoer, rapportPersonen, toolVersieTekst, veiligeNaam } from '../export'
import { invoerPaden, platteRegels } from '../plat'
import { rapportWerkmap } from '@/components/dossier/rapport-xlsx'
import { bouwRapporten } from '../rapporten'
import { kloon } from './hulp'

const inv2024 = voorbeeldInvoer(2024)

describe('rapportPersonen', () => {
  it('één persoon, of alle personen bij beide', () => {
    expect(rapportPersonen(inv2024, 'A')).toEqual(['A'])
    expect(rapportPersonen(inv2024, 'B')).toEqual(['B'])
    expect(rapportPersonen(inv2024, 'beide')).toEqual(['A', 'B'])
  })

  it('zonder partner geeft beide alleen de ene persoon; een onbekende persoon is een fout', () => {
    const alleen = kloon(inv2024)
    alleen.personen = alleen.personen.slice(0, 1)
    alleen.fiscaalPartner = false
    expect(rapportPersonen(alleen, 'beide')).toEqual(['A'])
    expect(() => rapportPersonen(alleen, 'B')).toThrow('Persoon B staat niet in dit dossier.')
  })
})

describe('rapportInvoer: de invoer op het tabblad Invoer van de Excel-export', () => {
  const reken = (inv: HuishoudenInvoer) => berekenHuishouden(inv, { zonderMarginaleDruk: true })
  const paden = (inv: HuishoudenInvoer) => invoerPaden(inv).map((x) => x.pad)
  const ids = <T extends { id: string }>(lijst: T[]) => lijst.filter(Boolean).map((x) => x.id)

  /** Huishouden met een onderneming, box 3-posities, een schuld en box 2 op naam van B, en spaargeld van een kind. */
  function metInvoerVanB(fiscaalPartner: boolean): HuishoudenInvoer {
    const inv = kloon(inv2024)
    inv.fiscaalPartner = fiscaalPartner
    // Het voorbeeld heeft al bezittingen van B: die gaan eerst naar A, zodat hieronder alleen de nieuwe van B zijn.
    for (const x of [...inv.box3.posities, ...inv.box3.schulden]) x.eigenaar = 'A'
    inv.box3.posities.find((x) => x.id === 'spaar-b')!.id = 'spaar-de'
    inv.personen[1].ondernemingen = [{ ...kloon(inv.personen[0].ondernemingen[0]), naam: 'Onderneming van B' }]
    inv.kinderen = [{ id: 'k1', geboortedatum: '2020-05-01' }]
    inv.box3.posities.push(
      { id: 'spaar-b', omschrijving: 'Spaarrekening van B', categorie: 'bankNL', eigenaar: 'B', waardeBegin: 50000 },
      { id: 'spaar-kind', omschrijving: 'Spaarrekening van het kind', categorie: 'bankNL', eigenaar: 'kind:k1', waardeBegin: 3000 },
    )
    inv.box3.schulden.push({ id: 'lening-b', omschrijving: 'Lening van B', eigenaar: 'B', waardeBegin: 10000 })
    inv.box2 = [
      { eigenaar: 'A', dividend: 1000, ingehoudenDividendbelasting: 150 },
      { eigenaar: 'B', dividend: 2000, ingehoudenDividendbelasting: 300 },
    ]
    return inv
  }

  it('bij beide, en in een dossier met één persoon, de hele invoer', () => {
    expect(rapportInvoer(inv2024, reken(inv2024), 'beide')).toBe(inv2024)
    const alleen = kloon(inv2024)
    alleen.personen = alleen.personen.slice(0, 1)
    alleen.fiscaalPartner = false
    expect(rapportInvoer(alleen, reken(alleen), 'A')).toBe(alleen)
  })

  it('zonder fiscaal partnerschap: de eigen invoer en de eigen pot in box 3 en box 2, niets van de ander', () => {
    const inv = metInvoerVanB(false)
    const r = reken(inv)
    const a = rapportInvoer(inv, r, 'A')
    const b = rapportInvoer(inv, r, 'B')

    expect(paden(a).some((p) => p.startsWith('personen[1]'))).toBe(false)
    expect(paden(a)).toContain('personen[0].id')
    expect(JSON.stringify(a)).not.toContain('Onderneming van B')
    expect(ids(a.box3.posities)).toEqual(['bank-nl', 'spaar-de', 'beleggingen', 'crypto', 'spaar-kind'])
    expect(ids(a.box3.schulden)).toEqual(['lening-auto'])
    expect(a.box2?.filter(Boolean)).toEqual([inv.box2![0]])

    expect(paden(b).some((p) => p.startsWith('personen[0]'))).toBe(false)
    expect(b.personen[1]).toBe(inv.personen[1])
    expect(0 in b.personen).toBe(false)
    expect(ids(b.box3.posities)).toEqual(['spaar-b'])
    expect(ids(b.box3.schulden)).toEqual(['lening-b'])
    expect(b.box2?.filter(Boolean)).toEqual([inv.box2![1]])
    expect(JSON.stringify(b)).not.toContain('Meubelmakerij')

    // Gezamenlijke delen die het rapport gebruikt; het opgegeven toetsingsinkomen (toeslagen) niet.
    for (const x of [a, b]) {
      expect(x.jaar).toBe(inv.jaar)
      expect(x.fiscaalPartner).toBe(false)
      expect(x.eigenWoning).toEqual(inv.eigenWoning)
      expect(x.kinderen).toEqual(inv.kinderen)
      expect(x.verdeling).toEqual(inv.verdeling)
    }
    expect(rapportInvoer({ ...inv, opgegevenToetsingsinkomen: 50000 }, r, 'A')).not.toHaveProperty('opgegevenToetsingsinkomen')
  })

  it('bij fiscale partners: box 3 en box 2 van beiden, maar niet de persoonlijke invoer van de ander', () => {
    const inv = metInvoerVanB(true)
    const a = rapportInvoer(inv, reken(inv), 'A')
    expect(paden(a).some((p) => p.startsWith('personen[1]'))).toBe(false)
    expect(JSON.stringify(a)).not.toContain('Onderneming van B')
    expect(ids(a.box3.posities)).toEqual(inv.box3.posities.map((x) => x.id))
    expect(ids(a.box3.schulden)).toEqual(inv.box3.schulden.map((x) => x.id))
    expect(a.box2).toEqual(inv.box2)
  })

  it('zonder potten in de uitkomst in elk geval niets wat op naam van de ander staat', () => {
    const inv = metInvoerVanB(false)
    const r = reken(inv)
    const b = rapportInvoer(inv, { box3: { ...r.box3, potten: undefined } }, 'B')
    expect(ids(b.box3.posities)).toEqual(['spaar-b', 'spaar-kind'])
    expect(ids(b.box3.schulden)).toEqual(['lening-b'])
  })

  it('de paden op het tabblad Invoer zijn gelijk aan de herkomst op het tabblad Gegevens', () => {
    const inv = metInvoerVanB(false)
    const r = reken(inv)
    const docs = bouwRapporten(inv, r, getJaar(inv.jaar), 'B', {
      vandaag: '2026-10-04T18:45',
      dossierStatus: 'concept',
      toolVersie: 'test',
      naam: (id: string) => `Persoon ${id}`,
    })
    const b = paden(rapportInvoer(inv, r, 'B'))
    expect(b).toContain('box3.posities[4].waardeBegin')
    const verwezen = platteRegels(docs).flatMap((x) => [...(x.herkomst ?? '').matchAll(/invoer\.((?:personen|box3\.posities|box3\.schulden|box2)\[\d+\])/g)].map((m) => m[1]))
    expect(verwezen).toContain('personen[1]')
    expect(verwezen).toContain('box3.posities[4]')
    for (const v of verwezen) expect(b.some((p) => p.startsWith(`${v}.`)), v).toBe(true)

    // En zo komt het in de werkmap: geen rij van A op het tabblad Invoer van het rapport van B.
    const blad = rapportWerkmap(docs, { invoer: rapportInvoer(inv, r, 'B') }).bladen.find((x) => x.sheet === 'Invoer')!
    const rijen = blad.data.slice(1).map((rij) => String((rij[0] as { value?: unknown } | null)?.value ?? ''))
    expect(rijen).toContain('personen[1].ondernemingen[0].naam')
    expect(rijen.filter((x) => x.startsWith('personen[0]'))).toEqual([])
    expect(rijen.filter((x) => x.startsWith('box3.posities[')).every((x) => x.startsWith('box3.posities[4]'))).toBe(true)
  })
})

describe('bestandsnaam', () => {
  it('naam veilig: kleine letters, geen accenten, alleen letters, cijfers en streepjes', () => {
    expect(veiligeNaam('José van den Berg')).toBe('jose-van-den-berg')
    expect(veiligeNaam("Anne-Marie d'Hondt")).toBe('anne-marie-d-hondt')
    expect(veiligeNaam('../../etc/passwd')).toBe('etc-passwd')
    expect(veiligeNaam('Ünal Çelik')).toBe('unal-celik')
    expect(veiligeNaam('   ')).toBe('rapport')
    expect(veiligeNaam('文字', 'persoon-1')).toBe('persoon-1')
  })

  it('hoogstens 40 tekens en geen streepje aan het eind', () => {
    const lang = veiligeNaam('Een heel lange naam van iemand met veel voornamen en achternamen')
    expect(lang.length).toBeLessThanOrEqual(40)
    expect(lang.endsWith('-')).toBe(false)
  })

  it('fiscaal-rapport-<jaar>-<naam>, bij twee rapporten beide namen', () => {
    expect(rapportBestandsnaam(2024, ['Persoon A'], 'pdf')).toBe('fiscaal-rapport-2024-persoon-a.pdf')
    expect(rapportBestandsnaam(2024, ['Anna', 'Bram'], 'xlsx')).toBe('fiscaal-rapport-2024-anna-en-bram.xlsx')
    expect(rapportBestandsnaam(2021, ['', '?'], 'pdf')).toBe('fiscaal-rapport-2021-persoon-1-en-persoon-2.pdf')
    expect(rapportBestandsnaam(2021, [], 'pdf')).toBe('fiscaal-rapport-2021-rapport.pdf')
  })
})

describe('versie en tijdstip', () => {
  it('versie met de eerste zeven tekens van de commit als die er is', () => {
    expect(toolVersieTekst('0.1.0')).toBe('0.1.0')
    expect(toolVersieTekst('0.1.0', '')).toBe('0.1.0')
    expect(toolVersieTekst('0.1.0', 'a1b2c3d4e5f6')).toBe('0.1.0 (a1b2c3d)')
    expect(toolVersieTekst('0.1.0', ' <script>9f8e7d6 ')).toBe('0.1.0 (script9)')
  })

  it('lokaal tijdstip zonder tijdzone', () => {
    expect(lokaalTijdstip(new Date(2026, 9, 4, 8, 5, 59))).toBe('2026-10-04T08:05')
    expect(lokaalTijdstip(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01T00:00')
  })
})

describe('bouwRapporten', () => {
  const r = berekenHuishouden(inv2024, { zonderMarginaleDruk: true })
  const P = getJaar(inv2024.jaar)
  const opties = {
    vandaag: '2026-10-04T18:45',
    dossierStatus: 'concept' as const,
    toolVersie: '0.1.0 (a1b2c3d)',
    accountant: { A: { teBetalen: 4314 } },
    gegevens: { adres: { straat: 'Voorbeeldstraat 1', postcode: '1234 AB', plaats: 'Voorbeeld' } },
    naam: (id: string) => `Persoon ${id}`,
  }

  it('beide: een rapport per persoon met dezelfde opties', () => {
    const docs = bouwRapporten(inv2024, r, P, 'beide', opties)
    expect(docs.map((d) => d.persoon)).toEqual(['A', 'B'])
    expect(docs.map((d) => d.naam)).toEqual(['Persoon A', 'Persoon B'])
    for (const d of docs) {
      expect(d.verantwoording.berekendOp).toBe('2026-10-04T18:45')
      expect(d.verantwoording.toolVersie).toBe('0.1.0 (a1b2c3d)')
      expect(d.kopregel.rechts).toEqual(['Berekend op: 4 oktober 2026'])
      expect(d.voorblad.adresregels).toEqual([d.naam, 'Voorbeeldstraat 1', '1234 AB Voorbeeld'])
    }
    // De accountantsbedragen horen bij persoon A; het rapport van B heeft geen verschillenlijst.
    expect(docs[0].verantwoording.verschillen).toEqual([{ label: 'Te betalen inkomstenbelasting', accountant: 4314, berekend: 4363 }])
    expect(docs[1].verantwoording.verschillen).toEqual([])
  })

  it('één persoon: alleen dat rapport', () => {
    const docs = bouwRapporten(inv2024, r, P, 'B', opties)
    expect(docs).toHaveLength(1)
    expect(docs[0].persoon).toBe('B')
    expect(docs[0].kopregel.links).toBe('Fiscaal rapport aangifte inkomstenbelasting 2024 van Persoon B')
  })
})
