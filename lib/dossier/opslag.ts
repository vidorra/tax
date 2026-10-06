/**
 * Opslag van het dossier in Postgres (server-only). Alle inhoud gaat versleuteld de database in;
 * de engine rekent bij elke opslag server-side opnieuw en bewaart een snapshot met de hash van de
 * gebruikte parameters, zodat een oud resultaat herleidbaar blijft na een parameterupdate.
 */
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { getDb, type Db } from '@/lib/db'
import { aangifteStaat, accountantDocs, dossierYears, households, koppelingen, snapshots, users, type DossierJaarRij } from '@/lib/db/schema'
import { ontsleutel, paramsHash, versleutel } from '@/lib/crypto'
import { exporteerKoppelingen } from '@/lib/moneybird/opslag'
import { berekenDossier } from './bereken'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId } from '@/lib/tax/types'
import type { ControleTelling } from '@/lib/controles/types'
import type { InvulhulpTelling } from '@/lib/invulhulp/types'
import { samenvatting, type DossierSamenvatting } from './samenvatting'
import type { AccountantRegels } from './accountant'
import type { DossierStatus } from './status'
import { vulIds } from './ids'
import { schoonStaat, type AangifteStaat } from './aangiftestaat'
import { telControles } from './controle-telling'

/**
 * Ronde 2 (contract): een lopende transactie. De varianten met `Tx` (maakJaarTx, bewaarJaarTx, bewaarAccountantTx,
 * vervangAangifteStaatTx in aangiftestaat-opslag.ts) doen hun werk binnen een transactie van de aanroeper, zodat de
 * JSON-import (A4) toevoegen of vervangen, accountantregels, aangiftestaat en herstelpunt in één transactie kan doen
 * zonder deze bestanden te wijzigen.
 */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Zoveel snapshots per jaar blijven bewaard; oudere worden opgeruimd. */
export const MAX_SNAPSHOTS = 20

/**
 * Context (AAD) per versleutelde kolom: bindt de ciphertext aan de rij waar hij hoort. Alleen
 * onveranderlijke sleutels (huishouden + jaar, of het id van het dossierjaar), zodat de context bij
 * het lezen altijd gelijk is aan die bij het schrijven.
 */
export const aad = {
  huishouden: (userId: number) => `households:${userId}`,
  invoer: (householdId: number, jaar: number) => `dossier_years:${householdId}:${jaar}`,
  snapshot: (dossierYearId: number) => `snapshots:${dossierYearId}`,
  accountant: (dossierYearId: number) => `accountant_docs:${dossierYearId}`,
  /** Ronde 2: aangiftestaat per jaar (lib/dossier/aangiftestaat-opslag.ts). */
  aangifteStaat: (dossierYearId: number) => `aangifte_staat:${dossierYearId}`,
  /** Ronde 2: herstelpunt van een JSON-import; `sleutel` is een willekeurige id die vóór het invoegen bekend is. */
  herstelpunt: (householdId: number, sleutel: string) => `herstelpunten:${householdId}:${sleutel}`,
}

export interface JaarOverzicht {
  jaar: number
  variant: string | null
  status: DossierStatus
  versie: number
  updatedAt: string
  samenvatting: DossierSamenvatting | null
  /** De parameters van dit jaar zijn gewijzigd sinds de laatste opslag. */
  parametersGewijzigd: boolean
  /** Ronde 2 (onderdeel controles): open controles bij de laatste opslag; ontbreekt als ze niet berekend konden worden. */
  controles?: ControleTelling
  /**
   * Ronde 2 (A3): tonen de controles van dit jaar nadrukkelijk (`controlesStreng`: status niet Concept, of
   * `controles.streng` in de aangiftestaat)? Ontbreekt als de telling niet is berekend.
   */
  controlesStreng?: boolean
  /** Ronde 2 (onderdeel invulhulp): voortgang per persoon uit de aangiftestaat (samenvatting.invulhulp). */
  invulhulp?: Partial<Record<PersoonId, InvulhulpTelling>>
  /** Ronde 2 (na de toets, migratie 0006): moment van indienen en of de invoer daarna is gewijzigd; null als niet ingediend. */
  ingediend?: { op: string; gewijzigdNa: boolean } | null
}

export interface JaarDetail extends JaarOverzicht {
  invoer: HuishoudenInvoer
}

export function variantGeldig(jaar: number, variant: string | null | undefined): boolean {
  if (!variant) return true
  try {
    return getJaar(jaar).varianten.some((v) => v.id === variant)
  } catch {
    return false
  }
}

export function huidigeParamsHash(jaar: number, variant: string | null): string {
  return paramsHash(getJaar(jaar, variant ?? undefined))
}

/** De engine kon met deze invoer niet rekenen (bijvoorbeeld een onmogelijke datum). */
export class RekenFout extends Error {}

export function reken(invoer: HuishoudenInvoer, variant: string | null): { resultaat: HuishoudenResultaat; hash: string } {
  try {
    const resultaat = berekenDossier({ ...invoer, variant: variant ?? undefined }, { variant: variant ?? undefined })
    return { resultaat, hash: huidigeParamsHash(invoer.jaar, variant) }
  } catch {
    throw new RekenFout('De berekening lukt niet met deze invoer.')
  }
}

/**
 * Het huishouden van deze gebruiker; maakt er een als het nog niet bestaat. Gelijktijdige eerste
 * verzoeken (bijvoorbeeld meerdere fetches direct na het inloggen) mogen niet elk een eigen
 * huishouden maken: daarom een advisory lock per gebruiker binnen de transactie.
 */
export async function huishoudenVan(userId: number): Promise<number> {
  const db = getDb()
  const zoek = (q: Pick<typeof db, 'select'>) =>
    q.select({ id: households.id }).from(households).where(eq(households.userId, userId)).orderBy(asc(households.id)).limit(1)
  const bestaand = await zoek(db)
  if (bestaand[0]) return bestaand[0].id
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724002, ${userId})`)
    const opnieuw = await zoek(tx)
    if (opnieuw[0]) return opnieuw[0].id
    const [rij] = await tx.insert(households).values({ userId, naam: 'Huishouden', gegevensEnc: versleutel({}, aad.huishouden(userId)) }).returning({ id: households.id })
    return rij.id
  })
}

async function laatsteSnapshot(rijId: number) {
  const [s] = await getDb().select().from(snapshots).where(eq(snapshots.dossierYearId, rijId)).orderBy(desc(snapshots.createdAt), desc(snapshots.id)).limit(1)
  return s ?? null
}

/** Ronde 2 (A3): de uitkomst van een snapshot, of null als die er niet is of niet te lezen is. */
function snapshotUitkomst(snap: { dossierYearId: number; uitkomstEnc: string } | null | undefined): HuishoudenResultaat | null {
  if (!snap) return null
  try {
    return ontsleutel<HuishoudenResultaat>(snap.uitkomstEnc, aad.snapshot(snap.dossierYearId))
  } catch {
    return null
  }
}

/**
 * Ronde 2 (A3): wat het overzicht en de jaarpagina's over de controles en de invulhulp van een jaar laten zien. De
 * telling komt uit `controlesVanJaar` (lib/dossier/controle-telling.ts) met de laatste snapshot, de aangiftestaat en
 * het vorige jaar.
 */
type OverzichtExtra = Pick<JaarOverzicht, 'controles' | 'controlesStreng' | 'invulhulp'>

function overzicht(rij: DossierJaarRij, snap: { dossierYearId: number; paramsHash: string; uitkomstEnc: string } | null, extra: OverzichtExtra = {}): JaarOverzicht {
  let s: DossierSamenvatting | null = null
  let gewijzigd = false
  if (snap) {
    const r = snapshotUitkomst(snap)
    s = r ? samenvatting(r) : null
    try {
      gewijzigd = snap.paramsHash !== huidigeParamsHash(rij.jaar, rij.variant)
    } catch {
      gewijzigd = true
    }
  }
  return {
    jaar: rij.jaar,
    variant: rij.variant,
    status: rij.status,
    versie: rij.versie,
    updatedAt: rij.updatedAt.toISOString(),
    samenvatting: s,
    parametersGewijzigd: gewijzigd,
    ingediend: ingediendVan(rij),
    ...extra,
  }
}

function ingediendVan(rij: DossierJaarRij): JaarOverzicht['ingediend'] {
  return rij.status === 'ingediend' && rij.ingediendOp ? { op: rij.ingediendOp.toISOString(), gewijzigdNa: rij.gewijzigdNaIndienen } : null
}

/** Ronde 2 (A3): de aangiftestaat van een rij (opgeschoond); null zonder rij of als hij niet te lezen is. */
function staatUit(rijId: number, doc: { staatEnc: string } | undefined): AangifteStaat | null {
  if (!doc) return null
  try {
    return schoonStaat(ontsleutel<unknown>(doc.staatEnc, aad.aangifteStaat(rijId))).staat
  } catch {
    return null
  }
}

function invoerUit(rij: DossierJaarRij): HuishoudenInvoer | null {
  try {
    return vulIds(ontsleutel<HuishoudenInvoer>(rij.invoerEnc, aad.invoer(rij.householdId, rij.jaar)))
  } catch {
    return null
  }
}

const vandaagIso = () => new Date().toISOString().slice(0, 10)

/** Ronde 2 (A3): telling, strengheid en invulhulpvoortgang van één jaar; leeg als de invoer niet te lezen is. */
function extraVan(
  rij: DossierJaarRij,
  invoer: HuishoudenInvoer | null,
  resultaat: HuishoudenResultaat | null,
  staat: AangifteStaat | null,
  vorig: { invoer: HuishoudenInvoer; resultaat: HuishoudenResultaat | null } | null,
): OverzichtExtra {
  const invulhulp = staat?.samenvatting?.invulhulp
  const basis: OverzichtExtra = invulhulp && Object.keys(invulhulp).length > 0 ? { invulhulp } : {}
  if (!invoer) return basis
  return {
    ...basis,
    ...telControles({ jaar: rij.jaar, variant: rij.variant, status: rij.status, invoer, resultaat, staat, vorig, ingediend: ingediendVan(rij), vandaag: vandaagIso() }),
  }
}

export async function lijstJaren(householdId: number): Promise<JaarOverzicht[]> {
  const db = getDb()
  const rijen = await db.select().from(dossierYears).where(eq(dossierYears.householdId, householdId)).orderBy(desc(dossierYears.jaar))
  if (rijen.length === 0) return []
  const ids = rijen.map((r) => r.id)
  const snaps = await db.select().from(snapshots).where(inArray(snapshots.dossierYearId, ids)).orderBy(desc(snapshots.createdAt), desc(snapshots.id))
  const laatste = new Map<number, (typeof snaps)[number]>()
  for (const s of snaps) if (!laatste.has(s.dossierYearId)) laatste.set(s.dossierYearId, s)
  // Ronde 2 (A3): per jaar de controles (met de aangiftestaat en het vorige jaar) en de voortgang van de invulhulp.
  const staten = await db.select().from(aangifteStaat).where(inArray(aangifteStaat.dossierYearId, ids))
  const staatPerRij = new Map(staten.map((d) => [d.dossierYearId, d]))
  const perJaar = new Map(
    rijen.map((r) => [r.jaar, { rij: r, invoer: invoerUit(r), resultaat: snapshotUitkomst(laatste.get(r.id)) }]),
  )
  return rijen.map((r) => {
    const dit = perJaar.get(r.jaar)!
    const vorig = perJaar.get(r.jaar - 1)
    const extra = extraVan(r, dit.invoer, dit.resultaat, staatUit(r.id, staatPerRij.get(r.id)), vorig?.invoer ? { invoer: vorig.invoer, resultaat: vorig.resultaat } : null)
    return overzicht(r, laatste.get(r.id) ?? null, extra)
  })
}

async function jaarRij(householdId: number, jaar: number): Promise<DossierJaarRij | null> {
  const [rij] = await getDb()
    .select()
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .limit(1)
  return rij ?? null
}

/** Bestaat er een dossier voor dit jaar? Zonder de invoer te ontsleutelen. */
export async function jaarBestaat(householdId: number, jaar: number): Promise<boolean> {
  return (await jaarRij(householdId, jaar)) !== null
}

/**
 * Ronde 2 (A3): met `controles` (standaard aan) ook de telling van de controles, `controlesStreng` en de voortgang van
 * de invulhulp; daarvoor laadt hij de aangiftestaat en het vorige jaar. Lukt dat niet, dan ontbreken die velden.
 */
export async function laadJaar(householdId: number, jaar: number, opties: { controles?: boolean } = {}): Promise<JaarDetail | null> {
  const rij = await jaarRij(householdId, jaar)
  if (!rij) return null
  // Ronde 2: vaste id's voor lijstitems (deterministisch, zodat elke pagina dezelfde id's ziet tot de eerste opslag).
  const invoer = vulIds(ontsleutel<HuishoudenInvoer>(rij.invoerEnc, aad.invoer(rij.householdId, rij.jaar)))
  const snap = await laatsteSnapshot(rij.id)
  let extra: OverzichtExtra = {}
  if (opties.controles !== false) {
    try {
      const db = getDb()
      const [doc] = await db.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, rij.id)).limit(1)
      const vorigeRij = await jaarRij(householdId, jaar - 1)
      const vorigeInvoer = vorigeRij ? invoerUit(vorigeRij) : null
      const vorig = vorigeRij && vorigeInvoer ? { invoer: vorigeInvoer, resultaat: snapshotUitkomst(await laatsteSnapshot(vorigeRij.id)) } : null
      extra = extraVan(rij, invoer, snapshotUitkomst(snap), staatUit(rij.id, doc), vorig)
    } catch (e) {
      // Alleen de naam van de fout naar de log, nooit de inhoud; de pagina werkt zonder telling.
      console.error(`[dossier/opslag] controles tellen mislukt: ${(e as Error)?.name ?? 'onbekend'}`)
    }
  }
  return { ...overzicht(rij, snap, extra), invoer }
}

/** Alle jaren met ontsleutelde invoer (vergelijken, middeling). */
export async function laadAlleInvoer(householdId: number): Promise<Array<{ jaar: number; variant: string | null; status: DossierStatus; invoer: HuishoudenInvoer }>> {
  const rijen = await getDb().select().from(dossierYears).where(eq(dossierYears.householdId, householdId)).orderBy(asc(dossierYears.jaar))
  return rijen.map((r) => ({ jaar: r.jaar, variant: r.variant, status: r.status, invoer: vulIds(ontsleutel<HuishoudenInvoer>(r.invoerEnc, aad.invoer(r.householdId, r.jaar))) }))
}

export class VersieConflict extends Error {}
export class BestaatAl extends Error {}

export async function maakJaar(householdId: number, invoer: HuishoudenInvoer): Promise<{ overzicht: JaarOverzicht; resultaat: HuishoudenResultaat }> {
  return getDb().transaction((tx) => maakJaarTx(tx, householdId, invoer))
}

/**
 * Ronde 2: maakJaar binnen een transactie van de aanroeper. `status` standaard 'concept'; de JSON-import geeft
 * 'ingediend' mee als het bestand dat zegt (dan staat ingediend_op op nu). Rekenen gebeurt vóór het schrijven.
 */
export async function maakJaarTx(
  tx: DbTx,
  householdId: number,
  invoer: HuishoudenInvoer,
  opties: { status?: DossierStatus } = {},
): Promise<{ overzicht: JaarOverzicht; resultaat: HuishoudenResultaat; versie: number }> {
  const variant = invoer.variant ?? null
  const { resultaat, hash } = reken(invoer, variant)
  const status = opties.status ?? 'concept'
  const bestaand = await tx
    .select({ id: dossierYears.id })
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, invoer.jaar)))
    .limit(1)
  if (bestaand[0]) throw new BestaatAl()
  const [rij] = await tx
    .insert(dossierYears)
    .values({
      householdId,
      jaar: invoer.jaar,
      variant,
      invoerEnc: versleutel(invoer, aad.invoer(householdId, invoer.jaar)),
      status,
      versie: 1,
      ...(status === 'ingediend' ? { ingediendOp: new Date() } : {}),
    })
    .returning()
  const snap = { dossierYearId: rij.id, paramsHash: hash, uitkomstEnc: versleutel(resultaat, aad.snapshot(rij.id)) }
  await tx.insert(snapshots).values(snap)
  return { overzicht: overzicht(rij, snap), resultaat, versie: rij.versie }
}

/** JSON met gesorteerde sleutels, om twee invoeren te vergelijken los van de volgorde van de velden. */
function stabiel(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stabiel).join(',')}]`
  if (x && typeof x === 'object') {
    return `{${Object.keys(x as Record<string, unknown>)
      .filter((k) => (x as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stabiel((x as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(x)
}

export async function bewaarJaar(
  householdId: number,
  jaar: number,
  data: { invoer: HuishoudenInvoer; status: DossierStatus; variant: string | null; versie?: number },
): Promise<{ overzicht: JaarOverzicht; resultaat: HuishoudenResultaat } | null> {
  return getDb().transaction((tx) => bewaarJaarTx(tx, householdId, jaar, data))
}

/**
 * Ronde 2: bewaarJaar binnen een transactie van de aanroeper. Houdt ook ingediend_op en gewijzigd_na_indienen bij:
 * overstap naar Ingediend zet het moment, opslaan met gewijzigde invoer terwijl het jaar ingediend blijft zet
 * gewijzigd_na_indienen, een andere status maakt beide leeg. De statusblokkade van Gecontroleerd zit in de route (A3).
 */
export async function bewaarJaarTx(
  tx: DbTx,
  householdId: number,
  jaar: number,
  data: { invoer: HuishoudenInvoer; status: DossierStatus; variant: string | null; versie?: number },
): Promise<{ overzicht: JaarOverzicht; resultaat: HuishoudenResultaat } | null> {
  const invoer: HuishoudenInvoer = { ...data.invoer, jaar, variant: data.variant ?? undefined }
  if (!data.variant) delete invoer.variant
  const { resultaat, hash } = reken(invoer, data.variant)
  const [rij] = await tx
    .select()
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .for('update')
    .limit(1)
  if (!rij) return null
  if (data.versie !== undefined && data.versie !== rij.versie) throw new VersieConflict()
  let ingediendOp: Date | null = null
  let gewijzigdNaIndienen = false
  if (data.status === 'ingediend') {
    if (rij.status === 'ingediend') {
      ingediendOp = rij.ingediendOp ?? rij.updatedAt
      // Met dezelfde (deterministische) id's als laadJaar, zodat alleen het toevoegen van id's geen wijziging is.
      const vorige = vulIds(ontsleutel<HuishoudenInvoer>(rij.invoerEnc, aad.invoer(householdId, jaar)))
      gewijzigdNaIndienen = rij.gewijzigdNaIndienen || stabiel(vorige) !== stabiel(invoer)
    } else ingediendOp = new Date()
  }
  const [bijgewerkt] = await tx
    .update(dossierYears)
    .set({
      invoerEnc: versleutel(invoer, aad.invoer(householdId, jaar)),
      status: data.status,
      variant: data.variant,
      versie: rij.versie + 1,
      updatedAt: new Date(),
      ingediendOp,
      gewijzigdNaIndienen,
    })
    .where(eq(dossierYears.id, rij.id))
    .returning()
  const snap = { dossierYearId: rij.id, paramsHash: hash, uitkomstEnc: versleutel(resultaat, aad.snapshot(rij.id)) }
  await tx.insert(snapshots).values(snap)
  const oud = await tx
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(eq(snapshots.dossierYearId, rij.id))
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
    .offset(MAX_SNAPSHOTS)
  if (oud.length > 0) {
    const grens = Math.max(...oud.map((o) => o.id))
    await tx.delete(snapshots).where(and(eq(snapshots.dossierYearId, rij.id), lt(snapshots.id, grens + 1)))
  }
  return { overzicht: overzicht(bijgewerkt, snap), resultaat }
}

export async function verwijderJaar(householdId: number, jaar: number): Promise<boolean> {
  const weg = await getDb()
    .delete(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .returning({ id: dossierYears.id })
  return weg.length > 0
}

export async function laadAccountant(householdId: number, jaar: number): Promise<{ regels: AccountantRegels; updatedAt: string | null } | null> {
  const rij = await jaarRij(householdId, jaar)
  if (!rij) return null
  const [doc] = await getDb().select().from(accountantDocs).where(eq(accountantDocs.dossierYearId, rij.id)).limit(1)
  if (!doc) return { regels: {}, updatedAt: null }
  return { regels: ontsleutel<AccountantRegels>(doc.regelsEnc, aad.accountant(rij.id)), updatedAt: doc.updatedAt.toISOString() }
}

export async function bewaarAccountant(householdId: number, jaar: number, regels: AccountantRegels): Promise<string | null> {
  return bewaarAccountantTx(getDb(), householdId, jaar, regels)
}

/** Ronde 2: bewaarAccountant binnen een transactie van de aanroeper (of met de gewone verbinding). */
export async function bewaarAccountantTx(tx: DbTx | Db, householdId: number, jaar: number, regels: AccountantRegels): Promise<string | null> {
  const [rij] = await tx
    .select({ id: dossierYears.id })
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .limit(1)
  if (!rij) return null
  const nu = new Date()
  const regelsEnc = versleutel(regels, aad.accountant(rij.id))
  await tx
    .insert(accountantDocs)
    .values({ dossierYearId: rij.id, regelsEnc, updatedAt: nu })
    .onConflictDoUpdate({ target: accountantDocs.dossierYearId, set: { regelsEnc, updatedAt: nu } })
  return nu.toISOString()
}

/** Volledige export van alle gegevens van een gebruiker, ontsleuteld (AVG). */
export async function exporteer(userId: number) {
  const db = getDb()
  const [gebruiker] = await db.select({ email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1)
  const hh = await db.select().from(households).where(eq(households.userId, userId)).orderBy(asc(households.id))
  const huishoudens = []
  for (const h of hh) {
    const jaren = await db.select().from(dossierYears).where(eq(dossierYears.householdId, h.id)).orderBy(asc(dossierYears.jaar))
    const uitJaren = []
    for (const j of jaren) {
      const [doc] = await db.select().from(accountantDocs).where(eq(accountantDocs.dossierYearId, j.id)).limit(1)
      const [staat] = await db.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, j.id)).limit(1)
      const snap = await laatsteSnapshot(j.id)
      uitJaren.push({
        jaar: j.jaar,
        variant: j.variant,
        status: j.status,
        versie: j.versie,
        bijgewerkt: j.updatedAt.toISOString(),
        invoer: ontsleutel<HuishoudenInvoer>(j.invoerEnc, aad.invoer(j.householdId, j.jaar)),
        accountant: doc ? ontsleutel<AccountantRegels>(doc.regelsEnc, aad.accountant(j.id)) : null,
        // Ronde 2: vinkjes, VIA-bedragen, genegeerde controles en terugvraagstatus (lib/dossier/aangiftestaat.ts).
        aangiftestaat: staat ? ontsleutel<unknown>(staat.staatEnc, aad.aangifteStaat(j.id)) : null,
        laatsteBerekening: snap
          ? { paramsHash: snap.paramsHash, berekend: snap.createdAt.toISOString(), samenvatting: samenvatting(ontsleutel<HuishoudenResultaat>(snap.uitkomstEnc, aad.snapshot(j.id))) }
          : null,
      })
    }
    huishoudens.push({
      naam: h.naam,
      gegevens: ontsleutel<unknown>(h.gegevensEnc, aad.huishouden(h.userId)),
      aangemaakt: h.createdAt.toISOString(),
      jaren: uitJaren,
      // Koppelingen zonder token: label, administratie en de eigen indeling per grootboekrekening.
      koppelingen: await exporteerKoppelingen(h.id),
    })
  }
  return {
    formaat: 'ibcalculator-dossier-export',
    versie: 1,
    geexporteerd: new Date().toISOString(),
    account: gebruiker ? { email: gebruiker.email, aangemaakt: gebruiker.createdAt.toISOString() } : null,
    huishoudens,
  }
}

/**
 * Verwijdert alle huishoudens (en via cascade jaren, snapshots, accountantsregels en koppelingen met
 * hun versleutelde tokens); optioneel ook het account. De koppelingen gaan er ook expliciet uit, zodat
 * geen token achterblijft als de cascade ooit ontbreekt.
 */
export async function verwijderAlles(userId: number, ookAccount: boolean): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.delete(koppelingen).where(inArray(koppelingen.householdId, tx.select({ id: households.id }).from(households).where(eq(households.userId, userId))))
    await tx.delete(households).where(eq(households.userId, userId))
    if (ookAccount) await tx.delete(users).where(eq(users.id, userId))
  })
}
