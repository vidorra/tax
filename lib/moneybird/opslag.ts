/**
 * Opslag van Moneybird-koppelingen per huishouden (server-only).
 *
 * - Het token en de indeling staan versleuteld in de database met een context (AAD) die de
 *   ciphertext aan het huishouden en de rij bindt: `koppelingen:<huishouden>:<id>:token`. Omdat het id
 *   pas na de insert bekend is, gebeurt de insert met een tijdelijke waarde en direct daarna, in
 *   dezelfde transactie, de update met de echte ciphertext.
 * - Het token komt nooit buiten deze module en de import; naar de browser gaat alleen een masker.
 * - De koppeling uit de omgeving (MONEYBIRD_TOKEN + MONEYBIRD_ADMINISTRATION_ID, id 'env') staat niet in
 *   de database en kan niet worden verwijderd. Haar indeling bewaren we in een rij met soort
 *   'moneybird-env' zonder token: zo staat alle Moneybird-informatie in één tabel, gaat ze mee in de
 *   export en verdwijnt ze via de cascade als het huishouden wordt verwijderd.
 *
 * Gelijktijdigheid: alles wat eerst leest en daarna schrijft, gebeurt in één synchrone schrijf() (BEGIN
 * IMMEDIATE, zie lib/db). Het maximum van tien koppelingen, de ene omgevingsrij per huishouden en het
 * samenvoegen van de indeling kunnen zo niet door een gelijktijdig verzoek of een ander proces worden
 * doorkruist. Moneybird aanroepen gebeurt altijd vóór of na zo'n transactie, nooit erin. De partiële unieke
 * index koppelingen_env_uniek blijft de vangrail voor de omgevingsrij. Id's zijn AUTOINCREMENT en worden dus
 * nooit hergebruikt: een update op een id dat intussen is verwijderd, raakt geen andere koppeling.
 */
import { and, asc, count, eq } from 'drizzle-orm'
import { getDb, lees, schrijf, type Db, type Tx } from '@/lib/db'
import { koppelingen, type KoppelingRij } from '@/lib/db/schema'
import { ontsleutel, versleutel } from '@/lib/crypto'
import { geldigMbId, maakClient, maskeer, type MbOpties } from './client'
import { MAX_INDELING_REGELS, schoonIndeling } from './indeling'
import type { MbAdministratie, MbIndeling, MbKoppelingPubliek, MbIndelingWijziging } from './types'

export const MAX_KOPPELINGEN = 10
export const ENV_ID = 'env'
const SOORT = 'moneybird'
const SOORT_ENV = 'moneybird-env'
const ENV_LABEL = 'Moneybird (server)'

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

export type KoppelingId = typeof ENV_ID | number

/** Id uit de URL: 'env' of een positief geheel getal; anders null. */
export function koppelingIdUitPad(ruw: string): KoppelingId | null {
  if (ruw === ENV_ID) return ENV_ID
  if (!/^[1-9]\d{0,8}$/.test(ruw)) return null
  return Number(ruw)
}

/** De koppeling uit de omgeving, als beide variabelen zijn gezet. */
export function envKoppeling(env: Record<string, string | undefined> = process.env): { token: string; administratieId: string } | null {
  const token = env.MONEYBIRD_TOKEN?.trim()
  const administratieId = env.MONEYBIRD_ADMINISTRATION_ID?.trim()
  if (!token || !administratieId || !geldigMbId(administratieId)) return null
  return { token, administratieId }
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
  }
}

const vanHuishouden = (householdId: number, soort: string) => and(eq(koppelingen.householdId, householdId), eq(koppelingen.soort, soort))

function envRij(db: Lezer, householdId: number): KoppelingRij | null {
  return db.select().from(koppelingen).where(vanHuishouden(householdId, SOORT_ENV)).limit(1).get() ?? null
}

/**
 * Binnen schrijf(): de rij van de omgevingskoppeling, aangemaakt als hij nog niet bestaat. Doordat lezen en
 * aanmaken in dezelfde BEGIN IMMEDIATE-transactie gebeuren, ontstaat er per huishouden maar één.
 */
function zorgEnvRijTx(tx: Tx, householdId: number): KoppelingRij {
  return envRij(tx, householdId) ?? tx.insert(koppelingen).values({ householdId, soort: SOORT_ENV, label: ENV_LABEL, tokenEnc: '' }).returning().get()
}

function envPubliek(env: { token: string; administratieId: string }, rij: KoppelingRij | null): MbKoppelingPubliek {
  return {
    id: ENV_ID,
    label: ENV_LABEL,
    bron: 'env',
    tokenMasker: maskeer(env.token),
    administratieId: env.administratieId,
    administratieNaam: rij?.administratieNaam ?? null,
    aangemaakt: null,
    laatstGebruikt: rij?.laatstGebruikt ? rij.laatstGebruikt.toISOString() : null,
  }
}

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
  const env = envKoppeling()
  // Eén leesmoment, zodat omgevingsrij en koppelingen bij elkaar horen.
  const { omgeving, rijen } = lees((tx) => ({
    omgeving: env ? envRij(tx, householdId) : null,
    rijen: tx.select().from(koppelingen).where(vanHuishouden(householdId, SOORT)).orderBy(asc(koppelingen.id)).all(),
  }))
  const uit: MbKoppelingPubliek[] = env ? [envPubliek(env, omgeving)] : []
  uit.push(...rijen.map(publiek))
  return uit
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
  invoer: { token: string; label: string },
  opties: MbOpties = {},
): Promise<{ koppeling: MbKoppelingPubliek; administraties: MbAdministratie[] }> {
  const administraties = await maakClient(invoer.token, null, opties).administraties()
  const enige = administraties.length === 1 ? administraties[0] : null
  const rij = schrijf((tx) => {
    const aantal = tx.select({ aantal: count() }).from(koppelingen).where(vanHuishouden(householdId, SOORT)).get()?.aantal ?? 0
    if (aantal >= MAX_KOPPELINGEN) throw new KoppelingFout(409, `Je kunt maximaal ${MAX_KOPPELINGEN} koppelingen hebben. Verwijder er eerst een.`)
    const { id } = tx
      .insert(koppelingen)
      .values({ householdId, soort: SOORT, label: invoer.label, tokenEnc: 'tijdelijk', administratieId: enige?.id ?? null, administratieNaam: enige?.naam ?? null })
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
  if (id === ENV_ID) {
    const env = envKoppeling()
    if (!env) return null
    if (administratieId !== env.administratieId || label !== undefined) {
      throw new KoppelingFout(409, 'De koppeling uit de omgeving gebruikt altijd MONEYBIRD_ADMINISTRATION_ID en kan hier niet worden aangepast.')
    }
    return envPubliek(env, envRij(getDb(), householdId))
  }
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

export async function verwijderKoppeling(householdId: number, id: KoppelingId): Promise<boolean> {
  if (id === ENV_ID) throw new KoppelingFout(409, 'De koppeling uit de omgeving kan niet worden verwijderd. Haal MONEYBIRD_TOKEN weg uit de serverinstellingen.')
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
  /** false als de naam van de administratie nog niet bekend is (omgevingskoppeling vóór de eerste import). */
  naamBekend: boolean
  label: string
}

/** Token en administratie van een koppeling (server-only); null als die niet bestaat. */
export async function laadKoppeling(householdId: number, id: KoppelingId): Promise<GeladenKoppeling | null> {
  if (id === ENV_ID) {
    const env = envKoppeling()
    if (!env) return null
    const rij = envRij(getDb(), householdId)
    return {
      id: ENV_ID,
      token: env.token,
      administratie: { id: env.administratieId, naam: rij?.administratieNaam ?? `Administratie ${env.administratieId}` },
      naamBekend: Boolean(rij?.administratieNaam),
      label: ENV_LABEL,
    }
  }
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

function indelingUit(rij: KoppelingRij | null): MbIndeling {
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
  if (id === ENV_ID) return envKoppeling() ? indelingUit(envRij(getDb(), householdId)) : null
  const rij = rijVan(getDb(), householdId, id)
  return rij ? indelingUit(rij) : null
}

/**
 * Voegt een wijziging samen met de bewaarde indeling: een categorie zet een keuze, null wist hem.
 * Keuzes voor grootboekrekeningen die in deze wijziging niet voorkomen (bijv. uit een ander jaar) blijven staan.
 * null als de koppeling niet bestaat.
 *
 * Lezen, samenvoegen en terugschrijven gebeuren in één schrijf(), zodat twee gelijktijdige wijzigingen elkaar
 * niet overschrijven. Boven het maximum gaat er niets de database in, ook geen nieuwe omgevingsrij.
 */
export async function bewaarIndeling(householdId: number, id: KoppelingId, wijziging: MbIndelingWijziging): Promise<MbIndeling | null> {
  if (id === ENV_ID && !envKoppeling()) return null
  return schrijf((tx) => {
    const rij = id === ENV_ID ? zorgEnvRijTx(tx, householdId) : rijVan(tx, householdId, id)
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

/** Werkt laatst_gebruikt bij (en voor de omgevingskoppeling de naam van de administratie). */
export async function raakAan(householdId: number, id: KoppelingId, administratieNaam?: string): Promise<void> {
  const nu = new Date()
  if (id === ENV_ID) {
    if (!envKoppeling()) return
    schrijf((tx) => {
      const rij = zorgEnvRijTx(tx, householdId)
      tx.update(koppelingen)
        .set({ laatstGebruikt: nu, ...(administratieNaam ? { administratieNaam } : {}) })
        .where(eq(koppelingen.id, rij.id))
        .run()
    })
    return
  }
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
    id: r.soort === SOORT_ENV ? ENV_ID : String(r.id),
    soort: r.soort,
    label: r.label,
    administratieId: r.administratieId,
    administratieNaam: r.administratieNaam,
    indeling: indelingUit(r),
    aangemaakt: r.aangemaakt.toISOString(),
    laatstGebruikt: r.laatstGebruikt ? r.laatstGebruikt.toISOString() : null,
  }))
}
