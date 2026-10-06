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
 */
import { and, asc, count, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
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
// Advisory lock 724003 per huishouden: maximaal tien koppelingen en één omgevingsrij, ook bij gelijktijdige verzoeken.

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

async function envRij(householdId: number): Promise<KoppelingRij | null> {
  const [rij] = await getDb()
    .select()
    .from(koppelingen)
    .where(and(eq(koppelingen.householdId, householdId), eq(koppelingen.soort, SOORT_ENV)))
    .limit(1)
  return rij ?? null
}

/** De rij van de omgevingskoppeling; maakt hem aan als hij nog niet bestaat. */
async function zorgEnvRij(householdId: number): Promise<KoppelingRij> {
  const bestaand = await envRij(householdId)
  if (bestaand) return bestaand
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724003, ${householdId})`)
    const [opnieuw] = await tx
      .select()
      .from(koppelingen)
      .where(and(eq(koppelingen.householdId, householdId), eq(koppelingen.soort, SOORT_ENV)))
      .limit(1)
    if (opnieuw) return opnieuw
    const [rij] = await tx.insert(koppelingen).values({ householdId, soort: SOORT_ENV, label: ENV_LABEL, tokenEnc: '' }).returning()
    return rij
  })
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

async function rijVan(householdId: number, id: number): Promise<KoppelingRij | null> {
  const [rij] = await getDb()
    .select()
    .from(koppelingen)
    .where(and(eq(koppelingen.id, id), eq(koppelingen.householdId, householdId), eq(koppelingen.soort, SOORT)))
    .limit(1)
  return rij ?? null
}

export async function lijstKoppelingen(householdId: number): Promise<MbKoppelingPubliek[]> {
  const uit: MbKoppelingPubliek[] = []
  const env = envKoppeling()
  if (env) uit.push(envPubliek(env, await envRij(householdId)))
  const rijen = await getDb()
    .select()
    .from(koppelingen)
    .where(and(eq(koppelingen.householdId, householdId), eq(koppelingen.soort, SOORT)))
    .orderBy(asc(koppelingen.id))
  uit.push(...rijen.map(publiek))
  return uit
}

/**
 * Voegt een koppeling toe. Controleert het token eerst bij Moneybird (gooit een MoneybirdFout als
 * het niet werkt). Heeft het token precies één administratie, dan wordt die meteen gekozen.
 */
export async function maakKoppeling(
  householdId: number,
  invoer: { token: string; label: string },
  opties: MbOpties = {},
): Promise<{ koppeling: MbKoppelingPubliek; administraties: MbAdministratie[] }> {
  const administraties = await maakClient(invoer.token, null, opties).administraties()
  const enige = administraties.length === 1 ? administraties[0] : null
  const rij = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724003, ${householdId})`)
    const [{ aantal }] = await tx
      .select({ aantal: count() })
      .from(koppelingen)
      .where(and(eq(koppelingen.householdId, householdId), eq(koppelingen.soort, SOORT)))
    if (aantal >= MAX_KOPPELINGEN) throw new KoppelingFout(409, `Je kunt maximaal ${MAX_KOPPELINGEN} koppelingen hebben. Verwijder er eerst een.`)
    const [nieuw] = await tx
      .insert(koppelingen)
      .values({ householdId, soort: SOORT, label: invoer.label, tokenEnc: 'tijdelijk', administratieId: enige?.id ?? null, administratieNaam: enige?.naam ?? null })
      .returning({ id: koppelingen.id })
    const [klaar] = await tx
      .update(koppelingen)
      .set({ tokenEnc: versleutel(invoer.token, aadKoppeling.token(householdId, nieuw.id)) })
      .where(eq(koppelingen.id, nieuw.id))
      .returning()
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

/** Kiest de administratie (moet bij het token horen) en eventueel een nieuw label. */
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
    return envPubliek(env, await envRij(householdId))
  }
  const rij = await rijVan(householdId, id)
  if (!rij) return null
  const administraties = await maakClient(tokenUit(rij), null, opties).administraties()
  const gekozen = administraties.find((a) => a.id === administratieId)
  if (!gekozen) throw new KoppelingFout(422, 'Deze administratie hoort niet bij het token van deze koppeling.')
  const [bij] = await getDb()
    .update(koppelingen)
    .set({ administratieId: gekozen.id, administratieNaam: gekozen.naam, ...(label !== undefined ? { label } : {}) })
    .where(and(eq(koppelingen.id, id), eq(koppelingen.householdId, householdId)))
    .returning()
  return bij ? publiek(bij) : null
}

export async function verwijderKoppeling(householdId: number, id: KoppelingId): Promise<boolean> {
  if (id === ENV_ID) throw new KoppelingFout(409, 'De koppeling uit de omgeving kan niet worden verwijderd. Haal MONEYBIRD_TOKEN weg uit de serverinstellingen.')
  const weg = await getDb()
    .delete(koppelingen)
    .where(and(eq(koppelingen.id, id), eq(koppelingen.householdId, householdId), eq(koppelingen.soort, SOORT)))
    .returning({ id: koppelingen.id })
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
    const rij = await envRij(householdId)
    return {
      id: ENV_ID,
      token: env.token,
      administratie: { id: env.administratieId, naam: rij?.administratieNaam ?? `Administratie ${env.administratieId}` },
      naamBekend: Boolean(rij?.administratieNaam),
      label: ENV_LABEL,
    }
  }
  const rij = await rijVan(householdId, id)
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
  if (id === ENV_ID) return envKoppeling() ? indelingUit(await envRij(householdId)) : null
  const rij = await rijVan(householdId, id)
  return rij ? indelingUit(rij) : null
}

/**
 * Voegt een wijziging samen met de bewaarde indeling: een categorie zet een keuze, null wist hem.
 * Keuzes voor grootboekrekeningen die in deze wijziging niet voorkomen (bijv. uit een ander jaar) blijven staan.
 * null als de koppeling niet bestaat.
 */
export async function bewaarIndeling(householdId: number, id: KoppelingId, wijziging: MbIndelingWijziging): Promise<MbIndeling | null> {
  const bestaand = (await laadIndeling(householdId, id)) ?? null
  if (bestaand === null && id !== ENV_ID && !(await rijVan(householdId, id))) return null
  const indeling: MbIndeling = { ...(bestaand ?? {}) }
  for (const [k, v] of Object.entries(wijziging)) {
    if (v === null) delete indeling[k]
    else indeling[k] = v
  }
  if (Object.keys(indeling).length > MAX_INDELING_REGELS) throw new KoppelingFout(422, `De indeling mag maximaal ${MAX_INDELING_REGELS} grootboekrekeningen bevatten.`)
  let rijId: number
  if (id === ENV_ID) {
    if (!envKoppeling()) return null
    rijId = (await zorgEnvRij(householdId)).id
  } else {
    const rij = await rijVan(householdId, id)
    if (!rij) return null
    rijId = rij.id
  }
  await getDb()
    .update(koppelingen)
    .set({ indelingEnc: versleutel(indeling, aadKoppeling.indeling(householdId, rijId)) })
    .where(and(eq(koppelingen.id, rijId), eq(koppelingen.householdId, householdId)))
  return indeling
}

/** Werkt laatst_gebruikt bij (en voor de omgevingskoppeling de naam van de administratie). */
export async function raakAan(householdId: number, id: KoppelingId, administratieNaam?: string): Promise<void> {
  const nu = new Date()
  if (id === ENV_ID) {
    if (!envKoppeling()) return
    const rij = await zorgEnvRij(householdId)
    await getDb()
      .update(koppelingen)
      .set({ laatstGebruikt: nu, ...(administratieNaam ? { administratieNaam } : {}) })
      .where(eq(koppelingen.id, rij.id))
    return
  }
  await getDb()
    .update(koppelingen)
    .set({ laatstGebruikt: nu })
    .where(and(eq(koppelingen.id, id), eq(koppelingen.householdId, householdId)))
}

/** Koppelingen voor de AVG-export: alles behalve het token. */
export async function exporteerKoppelingen(householdId: number) {
  const rijen = await getDb().select().from(koppelingen).where(eq(koppelingen.householdId, householdId)).orderBy(asc(koppelingen.id))
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
