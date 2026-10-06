/**
 * Ronde 2 (A4): generieke kolomkoppeling (broker-import.md 4.4) voor een formaat dat geen preset herkent. Per kolom een
 * betekenis (voorstel uit de kopnamen in het Nederlands, Engels en Duits), per waarde in de soortkolom een soort, en
 * wat het bestand is: een stand op 1 januari van het jaar, op 1 januari van het jaar erna, of transacties.
 *
 * Onthouden in localStorage per kopregel (de component doet de opslag): kolomnummers, betekenissen, scheiding,
 * decimaal en inhoud; `waarden` alleen binnen `KOPPELING_WAARDEN` (hooguit 30 unieke waarden, elk hooguit 40 tekens,
 * geen reeks van 6 of meer cijfers): geen IBAN's, rekeningnummers of namen van tegenpartijen. Nooit bedragen.
 */
import type { CsvBestand, Gebeurtenis, GebeurtenisSoort, KolomBetekenis, KolomKoppeling, PresetUitkomst, Stand } from './types'
import { KOPPELING_WAARDEN } from './types'
import { kopHash } from './csv'
import { centen, leesDatum, leesGetal } from './getallen'
import { landCode } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { gebeurtenis, onbekendMelding, regelNummer, uitkomst } from './presets/hulp'

export const KOLOM_BETEKENISSEN: Array<{ value: KolomBetekenis; label: string }> = [
  { value: 'negeren', label: 'Niet gebruiken' },
  { value: 'datum', label: 'Datum' },
  { value: 'soort', label: 'Soort' },
  { value: 'omschrijving', label: 'Omschrijving' },
  { value: 'bedrag', label: 'Bedrag' },
  { value: 'valuta', label: 'Valuta' },
  { value: 'isin', label: 'ISIN' },
  { value: 'aantal', label: 'Aantal' },
  { value: 'waarde', label: 'Waarde in euro' },
  { value: 'bronbelasting', label: 'Ingehouden belasting' },
  { value: 'land', label: 'Land' },
]

/** Soorten die een gebruiker aan een waarde kan geven (de chips bij de waardekoppeling). */
export const WAARDE_SOORTEN: Array<{ value: GebeurtenisSoort; label: string }> = [
  { value: 'storting', label: 'Storting' },
  { value: 'opname', label: 'Opname' },
  { value: 'koop', label: 'Koop' },
  { value: 'verkoop', label: 'Verkoop' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'dividendbelasting', label: 'Belasting' },
  { value: 'rente', label: 'Rente' },
  { value: 'kosten', label: 'Kosten' },
  { value: 'negeren', label: 'Negeren' },
]

const KOP_REGELS: Array<[RegExp, KolomBetekenis]> = [
  [/^(datum|date|buchtag|buchungstag|boekdatum|transactiedatum|trade date|valutadatum|value date)$/, 'datum'],
  [/isin/, 'isin'],
  [/(bronbelasting|withholding|quellensteuer|ingehouden belasting|dividendbelasting)/, 'bronbelasting'],
  [/^(soort|type|type mutatie|transaction type|action|art|categorie|category|mutatiesoort)$/, 'soort'],
  [/^(land|country|herkunftsland)$/, 'land'],
  [/^(valuta|currency|währung|munt)$/, 'valuta'],
  [/^(aantal|quantity|stuks|volume|anzahl|stück)$/, 'aantal'],
  [/(waarde in eur|marktwaarde|market value|wert in eur|^waarde$|^value$|^wert$)/, 'waarde'],
  [/^(bedrag|amount|betrag|mutatie|total|totaal|bedrag eur|amount eur)$/, 'bedrag'],
  [/^(omschrijving|description|beschrijving|product|naam|name|instrument|mededelingen|notes|buchungstext|verwendungszweck)$/, 'omschrijving'],
]

/** Voorstel van de betekenis van een kolom uit de kopnaam. */
export function betekenisUitKop(naam: string): KolomBetekenis {
  const n = naam.trim().toLowerCase()
  for (const [re, b] of KOP_REGELS) if (re.test(n)) return b
  return 'negeren'
}

const WAARDE_REGELS: Array<[RegExp, GebeurtenisSoort]> = [
  [/(dividendbelasting|bronbelasting|withholding|quellensteuer|\btax\b|belasting)/, 'dividendbelasting'],
  [/dividend/, 'dividend'],
  [/(terugstorting|opname|withdrawal|auszahlung|afschrijving|naar betaalrekening)/, 'opname'],
  [/(storting|deposit|inleg|einzahlung|bijschrijving|vanaf betaalrekening)/, 'storting'],
  [/^(verkoop|sell|verkauf)/, 'verkoop'],
  [/^(koop|aankoop|buy|kauf)/, 'koop'],
  [/(rente|interest|zinsen)/, 'rente'],
  [/(kosten|fee|provisie|commission|gebühr|tarief|tarieven)/, 'kosten'],
]

/** Voorstel van de soort voor een waarde uit de soortkolom; null als we het niet weten. */
export function soortUitWaarde(waarde: string): GebeurtenisSoort | null {
  const w = waarde.trim().toLowerCase()
  if (!w) return null
  for (const [re, s] of WAARDE_REGELS) if (re.test(w)) return s
  return null
}

/** Unieke, niet-lege waarden van een kolom, in volgorde van voorkomen. */
export function uniekeWaarden(b: CsvBestand, kolom: number): string[] {
  const uit = new Set<string>()
  for (const r of b.regels) {
    const v = (r[kolom] ?? '').trim()
    if (v) uit.add(v)
  }
  return [...uit]
}

const kolomVan = (k: KolomKoppeling, betekenis: KolomBetekenis): number => {
  const e = Object.entries(k.kolommen).find(([, b]) => b === betekenis)
  return e ? Number(e[0]) : -1
}

/** Voorstel voor een koppeling: betekenis per kolom uit de koppen en een soort per waarde in de soortkolom. */
export function stelKoppelingVoor(b: CsvBestand): KolomKoppeling {
  const kolommen: Record<number, KolomBetekenis> = {}
  const gebruikt = new Set<KolomBetekenis>()
  b.kop.forEach((naam, i) => {
    const betekenis = betekenisUitKop(naam)
    // Elke betekenis één keer (behalve niet gebruiken); de eerste kolom wint.
    if (betekenis !== 'negeren' && gebruikt.has(betekenis)) kolommen[i] = 'negeren'
    else {
      kolommen[i] = betekenis
      gebruikt.add(betekenis)
    }
  })
  const k: KolomKoppeling = { kopSleutel: kopHash(b.kop), scheiding: b.scheiding, decimaal: b.decimaal, kolommen, inhoud: 'transacties' }
  if (kolomVan(k, 'bedrag') < 0 && kolomVan(k, 'waarde') >= 0) k.inhoud = 'stand-begin'
  const soortKolom = kolomVan(k, 'soort')
  if (soortKolom >= 0) {
    const waarden: Record<string, GebeurtenisSoort> = {}
    for (const w of uniekeWaarden(b, soortKolom).slice(0, 200)) waarden[w] = soortUitWaarde(w) ?? 'negeren'
    k.waarden = waarden
  }
  return k
}

/**
 * De waarden die onthouden mogen worden, of undefined: hooguit `KOPPELING_WAARDEN.max` unieke waarden, elk hooguit
 * `maxLengte` tekens, zonder een reeks van `maxCijfers` of meer cijfers.
 */
export function onthoudbareWaarden(waarden: Record<string, GebeurtenisSoort> | undefined): Record<string, GebeurtenisSoort> | undefined {
  if (!waarden) return undefined
  const sleutels = Object.keys(waarden)
  if (sleutels.length === 0 || sleutels.length > KOPPELING_WAARDEN.max) return undefined
  const cijfers = new RegExp(`\\d{${KOPPELING_WAARDEN.maxCijfers},}`)
  if (sleutels.some((s) => s.length > KOPPELING_WAARDEN.maxLengte || cijfers.test(s.replace(/[\s.\-/]/g, '')))) return undefined
  return { ...waarden }
}

/** De koppeling zoals hij in localStorage mag: zonder `waarden` als die de grenzen overschrijden. */
export function teOnthouden(k: KolomKoppeling): KolomKoppeling {
  const waarden = onthoudbareWaarden(k.waarden)
  const uit: KolomKoppeling = { kopSleutel: k.kopSleutel, scheiding: k.scheiding, decimaal: k.decimaal, kolommen: { ...k.kolommen }, inhoud: k.inhoud }
  if (waarden) uit.waarden = waarden
  return uit
}

/** Een onthouden koppeling uit localStorage, gecontroleerd; null als hij niet klopt. */
export function leesOnthouden(x: unknown): KolomKoppeling | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.kopSleutel !== 'string' || ![',', ';', '\t'].includes(o.scheiding as string) || ![',', '.'].includes(o.decimaal as string)) return null
  if (!['stand-begin', 'stand-eind', 'transacties'].includes(o.inhoud as string) || typeof o.kolommen !== 'object' || o.kolommen === null) return null
  const toegestaan = new Set(KOLOM_BETEKENISSEN.map((b) => b.value))
  const kolommen: Record<number, KolomBetekenis> = {}
  for (const [i, b] of Object.entries(o.kolommen as Record<string, unknown>)) {
    if (/^\d{1,3}$/.test(i) && toegestaan.has(b as KolomBetekenis)) kolommen[Number(i)] = b as KolomBetekenis
  }
  const uit: KolomKoppeling = { kopSleutel: o.kopSleutel, scheiding: o.scheiding as KolomKoppeling['scheiding'], decimaal: o.decimaal as KolomKoppeling['decimaal'], kolommen, inhoud: o.inhoud as KolomKoppeling['inhoud'] }
  const soorten = new Set(WAARDE_SOORTEN.map((s) => s.value))
  if (typeof o.waarden === 'object' && o.waarden !== null) {
    const w: Record<string, GebeurtenisSoort> = {}
    for (const [k, v] of Object.entries(o.waarden as Record<string, unknown>)) if (soorten.has(v as GebeurtenisSoort)) w[k] = v as GebeurtenisSoort
    const schoon = onthoudbareWaarden(w)
    if (schoon) uit.waarden = schoon
  }
  return uit
}

/** Leest het bestand met de koppeling; formaat 'generiek'. */
export function leesGeneriek(b: CsvBestand, k: KolomKoppeling, opties: { jaar: number }): PresetUitkomst {
  const i = {
    datum: kolomVan(k, 'datum'),
    soort: kolomVan(k, 'soort'),
    omschrijving: kolomVan(k, 'omschrijving'),
    bedrag: kolomVan(k, 'bedrag'),
    valuta: kolomVan(k, 'valuta'),
    isin: kolomVan(k, 'isin'),
    aantal: kolomVan(k, 'aantal'),
    waarde: kolomVan(k, 'waarde'),
    bronbelasting: kolomVan(k, 'bronbelasting'),
    land: kolomVan(k, 'land'),
  }
  const v = (r: string[], kol: number) => (kol >= 0 ? (r[kol] ?? '').trim() : '')
  if (k.inhoud !== 'transacties') {
    const regels: Stand['regels'] = []
    const bron = i.waarde >= 0 ? i.waarde : i.bedrag
    for (const r of b.regels) {
      const eur = leesGetal(v(r, bron), k.decimaal)
      if (eur === null) continue
      const naam = v(r, i.omschrijving) || v(r, i.isin) || 'Regel'
      const aantal = leesGetal(v(r, i.aantal), k.decimaal)
      regels.push({ activum: v(r, i.isin) || naam, naam, ...(aantal !== null ? { aantal } : {}), eur: centen(eur), soort: /^(cash|geld|saldo|liquiditeit)/i.test(naam) ? 'geld' : 'effect' })
    }
    const datum = k.inhoud === 'stand-begin' ? `${opties.jaar - 1}-12-31` : `${opties.jaar}-12-31`
    return uitkomst('generiek', [], [{ rekening: '', datum, regels }], [], null)
  }
  const g: Gebeurtenis[] = []
  const onbekend: number[] = []
  let voorbeeld: string | undefined
  b.regels.forEach((r, index) => {
    const regel = regelNummer(b, index)
    const datum = leesDatum(v(r, i.datum))
    const bedrag = leesGetal(v(r, i.bedrag), k.decimaal)
    if (!datum || bedrag === null) return
    let soort: GebeurtenisSoort | null
    if (i.soort >= 0) {
      const w = v(r, i.soort)
      soort = k.waarden?.[w] ?? soortUitWaarde(w)
      if (soort === null) {
        onbekend.push(regel)
        voorbeeld ??= w
        return
      }
    } else soort = bedrag >= 0 ? 'storting' : 'opname'
    if (soort === 'negeren') return
    const valuta = (v(r, i.valuta) || 'EUR').toUpperCase()
    const isin = v(r, i.isin).toUpperCase() || undefined
    const landTekst = v(r, i.land)
    const land = landCode(landTekst) ?? undefined
    const aantal = leesGetal(v(r, i.aantal), k.decimaal)
    // Tekens zoals de soort ze verwacht: opname, koop, kosten en belasting negatief.
    const negatief = soort === 'opname' || soort === 'koop' || soort === 'kosten' || soort === 'dividendbelasting'
    const b2 = negatief ? -Math.abs(bedrag) : soort === 'rente' ? bedrag : Math.abs(bedrag)
    const basis = { formaat: 'generiek' as const, regel, datum, valuta, ...(isin ? { isin, activum: isin } : {}), ...(land ? { land, landBron: 'broker' as const } : {}) }
    g.push(gebeurtenis({ ...basis, soort, bedrag: b2, ...(valuta === 'EUR' ? { eur: b2 } : {}), ...(aantal !== null ? { aantal } : {}), omschrijving: v(r, i.omschrijving) || soort }))
    const belasting = leesGetal(v(r, i.bronbelasting), k.decimaal)
    if (belasting && soort === 'dividend') {
      const bb = -Math.abs(belasting)
      g.push(gebeurtenis({ ...basis, soort: 'dividendbelasting', bedrag: bb, ...(valuta === 'EUR' ? { eur: bb } : {}), omschrijving: 'Ingehouden belasting' }))
    }
  })
  const meldingen = [onbekendMelding(onbekend, voorbeeld)]
  if (i.soort < 0) {
    meldingen.push({ id: 'zonder-soort', ernst: 'let-op', tekst: 'Er is geen kolom met de soort: een positief bedrag telt als storting en een negatief als opname. Dividend en rente tellen dan ook als storting.' })
  }
  return uitkomst('generiek', g, [], meldingen)
}

/** Heeft de koppeling wat hij nodig heeft? Geeft de foutmelding of null. */
export function koppelingFout(k: KolomKoppeling): string | null {
  const heeft = (b: KolomBetekenis) => Object.values(k.kolommen).includes(b)
  if (k.inhoud === 'transacties') {
    if (!heeft('bedrag')) return 'We vinden geen kolom met bedragen. Kies bij Wat staat erin? welke kolom het bedrag heeft.'
    if (!heeft('datum')) return 'Kies bij Wat staat erin? welke kolom de datum heeft.'
    return null
  }
  if (!heeft('waarde') && !heeft('bedrag')) return 'We vinden geen kolom met bedragen. Kies bij Wat staat erin? welke kolom de waarde in euro heeft.'
  return null
}
