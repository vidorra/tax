/**
 * Opslag van het dossier in SQLite (server-only). Alle inhoud gaat versleuteld de database in;
 * de engine rekent bij elke opslag server-side opnieuw en bewaart een snapshot met de hash van de
 * gebruikte parameters, zodat een oud resultaat herleidbaar blijft na een parameterupdate.
 *
 * Gelijktijdigheid: alles wat eerst leest en daarna schrijft, draait in één schrijf() (BEGIN IMMEDIATE). Dat neemt de
 * schrijflock bij de start, zodat twee opslagen van hetzelfde jaar na elkaar gebeuren: de tweede ziet de nieuwe versie
 * en krijgt VersieConflict. Meerdere samenhangende leesqueries (overzicht, jaar, export) draaien in lees(), zodat ze
 * één moment zien. De `*Tx`-functies zijn synchroon en draaien in de transactie van de aanroeper (de JSON-import doet
 * zo toevoegen, vervangen, accountantsregels, aangiftestaat en herstelpunt in één transactie).
 */
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm'
import { trekUitnodigingenIn } from '@/lib/auth/gebruiker'
import { dbFoutSoort, getDb, leegWal, lees, schrijf, type Db, type Tx } from '@/lib/db'
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

/** Iets waarop je synchroon queries draait: de verbinding zelf of een transactie uit schrijf()/lees(). */
type Q = Db | Tx

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
 * Het huishouden van deze gebruiker; maakt er een als het nog niet bestaat. Gelijktijdige eerste verzoeken
 * (bijvoorbeeld meerdere fetches direct na het inloggen) mogen niet elk een eigen huishouden maken: daarom kijkt
 * schrijf() opnieuw onder de schrijflock voordat hij er een maakt.
 */
export async function huishoudenVan(userId: number): Promise<number> {
  const zoek = (q: Q) => q.select({ id: households.id }).from(households).where(eq(households.userId, userId)).orderBy(asc(households.id)).limit(1).get()
  const bestaand = zoek(getDb())
  if (bestaand) return bestaand.id
  return schrijf((tx) => {
    const opnieuw = zoek(tx)
    if (opnieuw) return opnieuw.id
    const rij = tx.insert(households).values({ userId, naam: 'Huishouden', gegevensEnc: versleutel({}, aad.huishouden(userId)) }).returning({ id: households.id }).get()
    if (!rij) throw new Error('Het huishouden is niet aangemaakt.')
    return rij.id
  })
}

function laatsteSnapshot(q: Q, rijId: number) {
  return q.select().from(snapshots).where(eq(snapshots.dossierYearId, rijId)).orderBy(desc(snapshots.createdAt), desc(snapshots.id)).limit(1).get() ?? null
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
  // Eén leesmoment voor jaren, snapshots en aangiftestaat; ontsleutelen en tellen gebeurt daarna.
  const gelezen = lees((tx) => {
    const rijen = tx.select().from(dossierYears).where(eq(dossierYears.householdId, householdId)).orderBy(desc(dossierYears.jaar)).all()
    if (rijen.length === 0) return null
    const ids = rijen.map((r) => r.id)
    const snaps = tx.select().from(snapshots).where(inArray(snapshots.dossierYearId, ids)).orderBy(desc(snapshots.createdAt), desc(snapshots.id)).all()
    const staten = tx.select().from(aangifteStaat).where(inArray(aangifteStaat.dossierYearId, ids)).all()
    return { rijen, snaps, staten }
  })
  if (!gelezen) return []
  const { rijen, snaps, staten } = gelezen
  const laatste = new Map<number, (typeof snaps)[number]>()
  for (const s of snaps) if (!laatste.has(s.dossierYearId)) laatste.set(s.dossierYearId, s)
  // Ronde 2 (A3): per jaar de controles (met de aangiftestaat en het vorige jaar) en de voortgang van de invulhulp.
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

function jaarRij(q: Q, householdId: number, jaar: number): DossierJaarRij | null {
  return (
    q
      .select()
      .from(dossierYears)
      .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
      .limit(1)
      .get() ?? null
  )
}

/** Bestaat er een dossier voor dit jaar? Zonder de invoer te ontsleutelen. */
export async function jaarBestaat(householdId: number, jaar: number): Promise<boolean> {
  return jaarRij(getDb(), householdId, jaar) !== null
}

/**
 * Ronde 2 (A3): met `controles` (standaard aan) ook de telling van de controles, `controlesStreng` en de voortgang van
 * de invulhulp; daarvoor laadt hij de aangiftestaat en het vorige jaar. Lukt dat niet, dan ontbreken die velden.
 */
export async function laadJaar(householdId: number, jaar: number, opties: { controles?: boolean } = {}): Promise<JaarDetail | null> {
  const metControles = opties.controles !== false
  // Eén leesmoment voor het jaar, de laatste snapshot en (voor de controles) de aangiftestaat en het vorige jaar.
  const gelezen = lees((tx) => {
    const rij = jaarRij(tx, householdId, jaar)
    if (!rij) return null
    const snap = laatsteSnapshot(tx, rij.id)
    if (!metControles) return { rij, snap, controles: null }
    const doc = tx.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, rij.id)).limit(1).get()
    const vorigeRij = jaarRij(tx, householdId, jaar - 1)
    return { rij, snap, controles: { doc, vorigeRij, vorigeSnap: vorigeRij ? laatsteSnapshot(tx, vorigeRij.id) : null } }
  })
  if (!gelezen) return null
  const { rij, snap } = gelezen
  // Ronde 2: vaste id's voor lijstitems (deterministisch, zodat elke pagina dezelfde id's ziet tot de eerste opslag).
  const invoer = vulIds(ontsleutel<HuishoudenInvoer>(rij.invoerEnc, aad.invoer(rij.householdId, rij.jaar)))
  let extra: OverzichtExtra = {}
  if (gelezen.controles) {
    try {
      const { doc, vorigeRij, vorigeSnap } = gelezen.controles
      const vorigeInvoer = vorigeRij ? invoerUit(vorigeRij) : null
      const vorig = vorigeRij && vorigeInvoer ? { invoer: vorigeInvoer, resultaat: snapshotUitkomst(vorigeSnap) } : null
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
  const rijen = getDb().select().from(dossierYears).where(eq(dossierYears.householdId, householdId)).orderBy(asc(dossierYears.jaar)).all()
  return rijen.map((r) => ({ jaar: r.jaar, variant: r.variant, status: r.status, invoer: vulIds(ontsleutel<HuishoudenInvoer>(r.invoerEnc, aad.invoer(r.householdId, r.jaar))) }))
}

export class VersieConflict extends Error {}
export class BestaatAl extends Error {}

export async function maakJaar(householdId: number, invoer: HuishoudenInvoer): Promise<{ overzicht: JaarOverzicht; resultaat: HuishoudenResultaat }> {
  return schrijf((tx) => maakJaarTx(tx, householdId, invoer))
}

/**
 * Ronde 2: maakJaar binnen een transactie van de aanroeper (synchroon, in schrijf()). `status` standaard 'concept'; de
 * JSON-import geeft 'ingediend' mee als het bestand dat zegt (dan staat ingediend_op op nu). Rekenen gebeurt vóór het
 * schrijven. Gooit BestaatAl als het jaar er al is (de unieke index op huishouden en jaar is de vangrail).
 */
export function maakJaarTx(
  tx: Tx,
  householdId: number,
  invoer: HuishoudenInvoer,
  opties: { status?: DossierStatus } = {},
): { overzicht: JaarOverzicht; resultaat: HuishoudenResultaat; versie: number } {
  const variant = invoer.variant ?? null
  const { resultaat, hash } = reken(invoer, variant)
  const status = opties.status ?? 'concept'
  const bestaand = tx
    .select({ id: dossierYears.id })
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, invoer.jaar)))
    .limit(1)
    .get()
  if (bestaand) throw new BestaatAl()
  const rij = tx
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
    .get()
  if (!rij) throw new Error('Het jaar is niet aangemaakt.')
  const snap = { dossierYearId: rij.id, paramsHash: hash, uitkomstEnc: versleutel(resultaat, aad.snapshot(rij.id)) }
  tx.insert(snapshots).values(snap).run()
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
  return schrijf((tx) => bewaarJaarTx(tx, householdId, jaar, data))
}

/**
 * Ronde 2: bewaarJaar binnen een transactie van de aanroeper (synchroon, in schrijf()). De versiecontrole is alleen
 * betrouwbaar onder de schrijflock: lezen, vergelijken en de versie ophogen gebeuren in dezelfde transactie, dus van
 * twee gelijktijdige opslagen met dezelfde versie krijgt de tweede VersieConflict. Houdt ook ingediend_op en
 * gewijzigd_na_indienen bij: overstap naar Ingediend zet het moment, opslaan met gewijzigde invoer terwijl het jaar
 * ingediend blijft zet gewijzigd_na_indienen, een andere status maakt beide leeg. De statusblokkade van Gecontroleerd
 * zit in de route (A3).
 */
export function bewaarJaarTx(
  tx: Tx,
  householdId: number,
  jaar: number,
  data: { invoer: HuishoudenInvoer; status: DossierStatus; variant: string | null; versie?: number },
): { overzicht: JaarOverzicht; resultaat: HuishoudenResultaat } | null {
  const invoer: HuishoudenInvoer = { ...data.invoer, jaar, variant: data.variant ?? undefined }
  if (!data.variant) delete invoer.variant
  const { resultaat, hash } = reken(invoer, data.variant)
  const rij = jaarRij(tx, householdId, jaar)
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
  const bijgewerkt = tx
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
    .get()
  if (!bijgewerkt) throw new Error('Het jaar is niet bijgewerkt.')
  const snap = { dossierYearId: rij.id, paramsHash: hash, uitkomstEnc: versleutel(resultaat, aad.snapshot(rij.id)) }
  tx.insert(snapshots).values(snap).run()
  // Alleen de nieuwste MAX_SNAPSHOTS blijven staan.
  const oud = tx
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(eq(snapshots.dossierYearId, rij.id))
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
    .all()
    .slice(MAX_SNAPSHOTS)
    .map((o) => o.id)
  if (oud.length > 0) tx.delete(snapshots).where(inArray(snapshots.id, oud)).run()
  return { overzicht: overzicht(bijgewerkt, snap), resultaat }
}

/** Verwijdert een jaar; snapshots, accountantsregels en aangiftestaat gaan mee via ON DELETE CASCADE. Eén statement. */
export async function verwijderJaar(householdId: number, jaar: number): Promise<boolean> {
  const weg = getDb()
    .delete(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .returning({ id: dossierYears.id })
    .all()
  return weg.length > 0
}

export async function laadAccountant(householdId: number, jaar: number): Promise<{ regels: AccountantRegels; updatedAt: string | null } | null> {
  const gelezen = lees((tx) => {
    const rij = jaarRij(tx, householdId, jaar)
    if (!rij) return null
    return { rij, doc: tx.select().from(accountantDocs).where(eq(accountantDocs.dossierYearId, rij.id)).limit(1).get() }
  })
  if (!gelezen) return null
  const { rij, doc } = gelezen
  if (!doc) return { regels: {}, updatedAt: null }
  return { regels: ontsleutel<AccountantRegels>(doc.regelsEnc, aad.accountant(rij.id)), updatedAt: doc.updatedAt.toISOString() }
}

export async function bewaarAccountant(householdId: number, jaar: number, regels: AccountantRegels): Promise<string | null> {
  return schrijf((tx) => bewaarAccountantTx(tx, householdId, jaar, regels))
}

/** Ronde 2: bewaarAccountant binnen een transactie van de aanroeper (synchroon, in schrijf()). Upsert op het jaar. */
export function bewaarAccountantTx(tx: Tx, householdId: number, jaar: number, regels: AccountantRegels): string | null {
  const rij = tx
    .select({ id: dossierYears.id })
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .limit(1)
    .get()
  if (!rij) return null
  const nu = new Date()
  const regelsEnc = versleutel(regels, aad.accountant(rij.id))
  tx.insert(accountantDocs)
    .values({ dossierYearId: rij.id, regelsEnc, updatedAt: nu })
    .onConflictDoUpdate({ target: accountantDocs.dossierYearId, set: { regelsEnc, updatedAt: nu } })
    .run()
  return nu.toISOString()
}

/**
 * Volledige export van alle gegevens van een gebruiker, ontsleuteld (AVG). Account, huishoudens, jaren,
 * accountantsregels, aangiftestaat, laatste snapshots en koppelingen (zonder token, uit lib/moneybird/opslag.ts) komen
 * uit één leesmoment; ontsleutelen gebeurt daarna.
 */
export async function exporteer(userId: number) {
  const gelezen = lees((tx) => {
    const gebruiker = tx.select({ email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1).get()
    const hh = tx.select().from(households).where(eq(households.userId, userId)).orderBy(asc(households.id)).all()
    return {
      gebruiker,
      huishoudens: hh.map((h) => ({
        h,
        // Koppelingen zonder token: label, administratie en de eigen indeling per grootboekrekening.
        koppelingen: exporteerKoppelingen(h.id, tx),
        jaren: tx
          .select()
          .from(dossierYears)
          .where(eq(dossierYears.householdId, h.id))
          .orderBy(asc(dossierYears.jaar))
          .all()
          .map((j) => ({
            j,
            doc: tx.select().from(accountantDocs).where(eq(accountantDocs.dossierYearId, j.id)).limit(1).get(),
            staat: tx.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, j.id)).limit(1).get(),
            snap: laatsteSnapshot(tx, j.id),
          })),
      })),
    }
  })
  const huishoudens = []
  for (const { h, koppelingen: kop, jaren } of gelezen.huishoudens) {
    const uitJaren = jaren.map(({ j, doc, staat, snap }) => ({
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
    }))
    huishoudens.push({
      naam: h.naam,
      gegevens: ontsleutel<unknown>(h.gegevensEnc, aad.huishouden(h.userId)),
      aangemaakt: h.createdAt.toISOString(),
      jaren: uitJaren,
      koppelingen: kop,
    })
  }
  const gebruiker = gelezen.gebruiker
  return {
    formaat: 'ibcalculator-dossier-export',
    versie: 1,
    geexporteerd: new Date().toISOString(),
    account: gebruiker ? { email: gebruiker.email, aangemaakt: gebruiker.createdAt.toISOString() } : null,
    huishoudens,
  }
}

/**
 * Verwijdert alle huishoudens (en via cascade jaren, snapshots, accountantsregels, aangiftestaat, herstelpunten en
 * koppelingen met hun versleutelde tokens); optioneel ook het account. Alles in één schrijf(): of alles is weg, of
 * niets. De koppelingen gaan er ook expliciet uit, zodat geen token achterblijft als de cascade ooit ontbreekt.
 *
 * secure_delete staat aan (lib/db), dus SQLite overschrijft de verwijderde inhoud in het databasebestand. De oude
 * pagina's staan dan nog in -wal; leegWal() schrijft de WAL meteen terug en maakt -wal leeg, met een paar
 * herhaalpogingen als een ander proces de WAL nog gebruikt. Lukt dat niet, dan is het dossier wel verwijderd, staat er
 * een waarschuwing in de log en blijven die pagina's (versleuteld) in -wal tot een volgende geslaagde checkpoint.
 */
/** Alles verwijderen met account, terwijl je de laatste beheerder bent en er andere accounts zijn. */
export class LaatsteBeheerderFout extends Error {
  constructor(melding: string) {
    super(melding)
    this.name = 'LaatsteBeheerderFout'
  }
}

export async function verwijderAlles(userId: number, ookAccount: boolean): Promise<void> {
  schrijf((tx) => {
    if (ookAccount) {
      // De laatste beheerder mag niet weg zolang er andere accounts zijn: dan kan niemand meer uitnodigen of herstellen.
      const ik = tx.select({ rol: users.rol }).from(users).where(eq(users.id, userId)).get()
      const anderen = tx.select({ id: users.id, rol: users.rol }).from(users).where(and(ne(users.id, userId), eq(users.totpEnabled, true))).all()
      if (ik?.rol === 'beheerder' && anderen.length > 0 && !anderen.some((a) => a.rol === 'beheerder')) {
        throw new LaatsteBeheerderFout('Je bent de enige beheerder. Maak eerst iemand anders beheerder (bij Accounts) voordat je je account verwijdert.')
      }
      // Eigen links in; gaat het laatste account weg (setup gaat weer open), dan alle open links.
      trekUitnodigingenIn(tx, anderen.length === 0 ? null : userId)
    }
    tx.delete(koppelingen).where(inArray(koppelingen.householdId, tx.select({ id: households.id }).from(households).where(eq(households.userId, userId)))).run()
    tx.delete(households).where(eq(households.userId, userId)).run()
    if (ookAccount) tx.delete(users).where(eq(users.id, userId)).run()
  })
  let leeg = false
  try {
    leeg = await leegWal()
  } catch (e) {
    console.warn(`Database: -wal legen na Alles verwijderen mislukt (${dbFoutSoort(e) ?? 'onbekende fout'})`)
    return
  }
  if (!leeg) console.warn('Database: -wal na Alles verwijderen nog niet leeg, een ander proces gebruikt de WAL')
}
