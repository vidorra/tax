/**
 * Opslag van Moneybird-koppelingen per huishouden (server-only).
 *
 * - Het token en de indeling staan versleuteld in de database met een context (AAD) die de
 *   ciphertext aan het huishouden en de rij bindt: `koppelingen:<huishouden>:<id>:token`. Omdat het id
 *   pas na de insert bekend is, gebeurt de insert met een tijdelijke waarde en direct daarna, in
 *   dezelfde transactie, de update met de echte ciphertext.
 * - Het token komt nooit buiten deze module en de import; naar de browser gaat alleen een masker.
 * - Elke koppeling hoort bij een huishouden (dus bij één account) en kan aan persoon A of B van het dossier hangen, zodat
 *   je partner een eigen administratie koppelt. Een token uit de serverinstellingen (MONEYBIRD_TOKEN) bestaat niet
 *   meer: dat gold voor elk account. lib/moneybird/omgeving-overzetten.ts zet zo'n token bij de start één keer om naar
 *   een versleutelde koppeling van de beheerder.
 *
 * Gelijktijdigheid: alles wat eerst leest en daarna schrijft, gebeurt in één synchrone schrijf() (BEGIN
 * IMMEDIATE, zie lib/db). Het maximum van tien koppelingen, de ene omgevingsrij per huishouden en het
 * samenvoegen van de indeling kunnen zo niet door een gelijktijdig verzoek of een ander proces worden
 * doorkruist. Moneybird aanroepen gebeurt altijd vóór of na zo'n transactie, nooit erin. Id's zijn AUTOINCREMENT en
 * worden dus nooit hergebruikt: een update op een id dat intussen is verwijderd, raakt geen andere koppeling.
 */
import { and, asc, count, eq } from 'drizzle-orm'
import { getDb, lees, schrijf, type Db, type Tx } from '@/lib/db'
import { koppelingen, type KoppelingRij } from '@/lib/db/schema'
import { ontsleutel, versleutel } from '@/lib/crypto'
import { maakClient, maskeer, type MbOpties } from './client'
import { MAX_INDELING_REGELS, schoonIndeling } from './indeling'
import type { MbAdministratie, MbIndeling, MbKoppelingPubliek, MbIndelingWijziging } from './types'

export const MAX_KOPPELINGEN = 10
const SOORT = 'moneybird'

export type KoppelingPersoon = 'A' | 'B'

/** De verbinding (getDb()) of een transactie uit schrijf()/lees(); de queries hieronder zijn synchroon. */
type Lezer = Db | Tx

export const aadKoppeling = {
  token: (householdId: number, id: number) => `koppelingen:${householdId}:${id}:token`,
  indeling: (householdId: number, id: number) => `koppelingen:${householdId}:${id}:indeling`,
}

/** Fout met een HTTP-status voor de route (404, 409, 422). */
export class KoppelingFout extends Error {
  readonly status: number
  constructor(status: number, melding: string) {
    super(melding)
    this.name = 'KoppelingFout'
    this.status = status
  }
}

export type KoppelingId = number

/** Id uit de URL: een positief geheel getal; anders null. */
export function koppelingIdUitPad(ruw: string): KoppelingId | null {
  if (!/^[1-9]\d{0,8}$/.test(ruw)) return null
  return Number(ruw)
}

/** Persoon uit een verzoek: 'A', 'B' of null (niet gekozen); undefined bij een ongeldige waarde. */
export function schoonPersoon(x: unknown): KoppelingPersoon | null | undefined {
  if (x === null || x === '') return null
  if (x === 'A' || x === 'B') return x
  return undefined
}

/** Token uit een verzoek: 10 tot 200 tekens zonder spaties of vreemde tekens. */
export function schoonToken(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const t = x.trim()
  if (t.length < 10 || t.length > 200 || !/^[A-Za-z0-9._~+/=-]+$/.test(t)) return null
  return t
}

/** Label uit een verzoek: 1 tot 80 tekens, zonder stuurtekens. */
export function schoonLabel(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const l = x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (l.length < 1 || l.length > 80) return null
  return l
}

function tokenUit(rij: KoppelingRij): string {
  return ontsleutel<string>(rij.tokenEnc, aadKoppeling.token(rij.householdId, rij.id))
}

function masker(rij: KoppelingRij): string {
  try {
    return maskeer(tokenUit(rij))
  } catch {
    return '••••••'
  }
}

function publiek(rij: KoppelingRij): MbKoppelingPubliek {
  return {
    id: String(rij.id),
    label: rij.label,
    bron: 'dossier',
    tokenMasker: masker(rij),
    administratieId: rij.administratieId,
    administratieNaam: rij.administratieNaam,
    aangemaakt: rij.aangemaakt.toISOString(),
    laatstGebruikt: rij.laatstGebruikt ? rij.laatstGebruikt.toISOString() : null,
    persoon: rij.persoon ?? null,
  }
}

const vanHuishouden = (householdId: number, soort: string) => and(eq(koppelingen.householdId, householdId), eq(koppelingen.soort, soort))

function rijVan(db: Lezer, householdId: number, id: number): KoppelingRij | null {
  return (
    db
      .select()
      .from(koppelingen)
      .where(and(eq(koppelingen.id, id), vanHuishouden(householdId, SOORT)))
      .limit(1)
      .get() ?? null
  )
}

export async function lijstKoppelingen(householdId: number): Promise<MbKoppelingPubliek[]> {
  const rijen = lees((tx) => tx.select().from(koppelingen).where(vanHuishouden(householdId, SOORT)).orderBy(asc(koppelingen.id)).all())
  return rijen.map(publiek)
}

/**
 * Voegt een koppeling toe. Controleert het token eerst bij Moneybird (gooit een MoneybirdFout als
 * het niet werkt). Heeft het token precies één administratie, dan wordt die meteen gekozen.
 *
 * De controle bij Moneybird is async en gebeurt vóór de transactie. Tellen, invoegen en versleutelen met het
 * nieuwe id gebeuren daarna in één schrijf(): komen er intussen koppelingen bij (een ander verzoek of proces),
 * dan telt de transactie die mee en weigert met 409 boven het maximum.
 */
export async function maakKoppeling(
  householdId: number,
  invoer: { token: string; label: string; persoon?: KoppelingPersoon | null },
  opties: MbOpties = {},
): Promise<{ koppeling: MbKoppelingPubliek; administraties: MbAdministratie[] }> {
  const administraties = await maakClient(invoer.token, null, opties).administraties()
  const enige = administraties.length === 1 ? administraties[0] : null
  const rij = schrijf((tx) => {
    const aantal = tx.select({ aantal: count() }).from(koppelingen).where(vanHuishouden(householdId, SOORT)).get()?.aantal ?? 0
    if (aantal >= MAX_KOPPELINGEN) throw new KoppelingFout(409, `Je kunt maximaal ${MAX_KOPPELINGEN} koppelingen hebben. Verwijder er eerst een.`)
    const { id } = tx
      .insert(koppelingen)
      .values({ householdId, soort: SOORT, label: invoer.label, tokenEnc: 'tijdelijk', administratieId: enige?.id ?? null, administratieNaam: enige?.naam ?? null, persoon: invoer.persoon ?? null })
      .returning({ id: koppelingen.id })
      .get()
    const klaar = tx
      .update(koppelingen)
      .set({ tokenEnc: versleutel(invoer.token, aadKoppeling.token(householdId, id)) })
      .where(eq(koppelingen.id, id))
      .returning()
      .get()
    if (!klaar) throw new Error('De nieuwe koppeling is niet teruggevonden.')
    return klaar
  })
  return { koppeling: publiek(rij), administraties }
}

/** Administraties die het token van deze koppeling kan zien. null als de koppeling niet bestaat. */
export async function administratiesVan(householdId: number, id: KoppelingId, opties: MbOpties = {}): Promise<MbAdministratie[] | null> {
  const k = await laadKoppeling(householdId, id)
  if (!k) return null
  return maakClient(k.token, null, opties).administraties()
}

/**
 * Kiest de administratie (moet bij het token horen) en eventueel een nieuw label. Moneybird wordt tussen het
 * lezen en de update gevraagd, dus niet in een transactie; de update is één statement en geeft null als de
 * koppeling intussen is verwijderd.
 */
export async function kiesAdministratie(
  householdId: number,
  id: KoppelingId,
  administratieId: string,
  label: string | undefined,
  opties: MbOpties = {},
): Promise<MbKoppelingPubliek | null> {
  const rij = rijVan(getDb(), householdId, id)
  if (!rij) return null
  const administraties = await maakClient(tokenUit(rij), null, opties).administraties()
  const gekozen = administraties.find((a) => a.id === administratieId)
  if (!gekozen) throw new KoppelingFout(422, 'Deze administratie hoort niet bij het token van deze koppeling.')
  const bij = getDb()
    .update(koppelingen)
    .set({ administratieId: gekozen.id, administratieNaam: gekozen.naam, ...(label !== undefined ? { label } : {}) })
    .where(and(eq(koppelingen.id, id), vanHuishouden(householdId, SOORT)))
    .returning()
    .get()
  return bij ? publiek(bij) : null
}

/** Label en/of persoon wijzigen, zonder Moneybird te vragen. null als de koppeling niet bestaat. */
export async function wijzigKoppeling(householdId: number, id: KoppelingId, wijziging: { label?: string; persoon?: KoppelingPersoon | null }): Promise<MbKoppelingPubliek | null> {
  const set = {
    ...(wijziging.label !== undefined ? { label: wijziging.label } : {}),
    ...(wijziging.persoon !== undefined ? { persoon: wijziging.persoon } : {}),
  }
  if (Object.keys(set).length === 0) {
    const rij = rijVan(getDb(), householdId, id)
    return rij ? publiek(rij) : null
  }
  const bij = getDb()
    .update(koppelingen)
    .set(set)
    .where(and(eq(koppelingen.id, id), vanHuishouden(householdId, SOORT)))
    .returning()
    .get()
  return bij ? publiek(bij) : null
}

export async function verwijderKoppeling(householdId: number, id: KoppelingId): Promise<boolean> {
  const weg = getDb()
    .delete(koppelingen)
    .where(and(eq(koppelingen.id, id), vanHuishouden(householdId, SOORT)))
    .returning({ id: koppelingen.id })
    .all()
  return weg.length > 0
}

export interface GeladenKoppeling {
  id: string
  /** Server-only. Nooit loggen of terugsturen. */
  token: string
  administratie: MbAdministratie | null
  /** false als de naam van de administratie nog niet bekend is. */
  naamBekend: boolean
  label: string
}

/** Token en administratie van een koppeling (server-only); null als die niet bestaat. */
export async function laadKoppeling(householdId: number, id: KoppelingId): Promise<GeladenKoppeling | null> {
  const rij = rijVan(getDb(), householdId, id)
  if (!rij) return null
  return {
    id: String(rij.id),
    token: tokenUit(rij),
    administratie: rij.administratieId ? { id: rij.administratieId, naam: rij.administratieNaam ?? `Administratie ${rij.administratieId}` } : null,
    naamBekend: Boolean(rij.administratieNaam),
    label: rij.label,
  }
}

export function indelingUit(rij: KoppelingRij | null): MbIndeling {
  if (!rij?.indelingEnc) return {}
  const ruw = ontsleutel<unknown>(rij.indelingEnc, aadKoppeling.indeling(rij.householdId, rij.id))
  const schoon = schoonIndeling(ruw)
  if (!('indeling' in schoon)) return {}
  const uit: MbIndeling = {}
  for (const [k, v] of Object.entries(schoon.indeling)) if (v !== null) uit[k] = v
  return uit
}

/** Bewaarde indeling; null als de koppeling niet bestaat. */
export async function laadIndeling(householdId: number, id: KoppelingId): Promise<MbIndeling | null> {
  const rij = rijVan(getDb(), householdId, id)
  return rij ? indelingUit(rij) : null
}

/**
 * Voegt een wijziging samen met de bewaarde indeling: een categorie zet een keuze, null wist hem.
 * Keuzes voor grootboekrekeningen die in deze wijziging niet voorkomen (bijv. uit een ander jaar) blijven staan.
 * null als de koppeling niet bestaat.
 *
 * Lezen, samenvoegen en terugschrijven gebeuren in één schrijf(), zodat twee gelijktijdige wijzigingen elkaar
 * niet overschrijven. Boven het maximum gaat er niets de database in.
 */
export async function bewaarIndeling(householdId: number, id: KoppelingId, wijziging: MbIndelingWijziging): Promise<MbIndeling | null> {
  return schrijf((tx) => {
    const rij = rijVan(tx, householdId, id)
    if (!rij) return null
    const indeling: MbIndeling = { ...indelingUit(rij) }
    for (const [k, v] of Object.entries(wijziging)) {
      if (v === null) delete indeling[k]
      else indeling[k] = v
    }
    if (Object.keys(indeling).length > MAX_INDELING_REGELS) throw new KoppelingFout(422, `De indeling mag maximaal ${MAX_INDELING_REGELS} grootboekrekeningen bevatten.`)
    tx.update(koppelingen)
      .set({ indelingEnc: versleutel(indeling, aadKoppeling.indeling(householdId, rij.id)) })
      .where(and(eq(koppelingen.id, rij.id), eq(koppelingen.householdId, householdId)))
      .run()
    return indeling
  })
}

/** Werkt laatst_gebruikt bij. */
export async function raakAan(householdId: number, id: KoppelingId): Promise<void> {
  const nu = new Date()
  getDb()
    .update(koppelingen)
    .set({ laatstGebruikt: nu })
    .where(and(eq(koppelingen.id, id), vanHuishouden(householdId, SOORT)))
    .run()
}

/**
 * Koppelingen voor de AVG-export: alles behalve het token. Synchroon; geef binnen lees() of schrijf() de
 * transactie mee als `db`, zodat de koppelingen bij hetzelfde leesmoment horen als de rest van de export.
 */
export function exporteerKoppelingen(householdId: number, db: Lezer = getDb()) {
  const rijen = db.select().from(koppelingen).where(eq(koppelingen.householdId, householdId)).orderBy(asc(koppelingen.id)).all()
  return rijen.map((r) => ({
    id: String(r.id),
    soort: r.soort,
    persoon: r.persoon ?? null,
    label: r.label,
    administratieId: r.administratieId,
    administratieNaam: r.administratieNaam,
    indeling: indelingUit(r),
    aangemaakt: r.aangemaakt.toISOString(),
    laatstGebruikt: r.laatstGebruikt ? r.laatstGebruikt.toISOString() : null,
  }))
}
