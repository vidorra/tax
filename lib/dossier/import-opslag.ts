/**
 * Ronde 2 (A4): de JSON-import op de server (server-only). De browser stuurt alleen de gekozen jaren en onderdelen
 * (`JsonImportVerzoek`); de server vertrouwt niets daarvan en valideert alles opnieuw met dezelfde regels als bij
 * opslaan: `valideerInvoer`, de variant, `schoonAccountantRegels`, `schoonStaat` en `schoonGegevens`.
 *
 * Alles gebeurt in één transactie: herstelpunt maken (per jaar de vorige versie of null, en na het schrijven de versie
 * direct na de import), toevoegen (`maakJaarTx`) of vervangen (`bewaarJaarTx`), de accountantsbedragen
 * (`bewaarAccountantTx`) en de aangiftestaat (`vervangAangifteStaatTx`). Faalt één jaar, dan verandert er niets.
 *
 * Status: Ingediend is een feit. Ingediend uit het bestand blijft Ingediend, en een jaar dat in het dossier al op
 * Ingediend stond, blijft dat bij Vervangen (ook met een concept uit het bestand; de melding zegt het). Gecontroleerd
 * wordt Concept, omdat de controles met de huidige regels anders kunnen uitkomen; Concept blijft Concept.
 *
 * Herstelpunt: één per huishouden en reden; een nieuwe import ruimt het vorige op. Na HERSTELPUNT_BEWAARDAGEN dagen
 * gaat het weg, opgeruimd bij elke import en elk herstelverzoek, bij het laden van het overzicht en de dossierpagina's
 * (`ruimVerlopenHerstelpuntenOp`) en vóór een back-up op verzoek. Versleuteld met `aad.herstelpunt`. Het overzicht
 * toont het geldige herstelpunt met Ongedaan maken (`actiefHerstelpunt`), ook na herladen.
 *
 * Daarnaast het geheim voor de rekeningsleutel van de broker-import: HMAC-SHA256 van de dossiersleutel over
 * `rekeningsleutel:<householdId>`. De browser rekent daarmee de sleutel uit; het rekeningnummer komt nooit hier.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { aangifteStaat, accountantDocs, dossierYears, herstelpunten, households } from '@/lib/db/schema'
import { dossierSleutel, ontsleutel, versleutel } from '@/lib/crypto'
import { BESCHIKBARE_JAREN } from '@/lib/tax/years'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { HuishoudenGegevens } from '@/lib/rapport/model'
import { HERSTELPUNT_BEWAARDAGEN, type ActiefHerstelpunt, type HerstelResultaat, type HerstelVoorstel, type ImportHerstelpunt, type JsonImportResultaat } from '@/lib/import/types'
import { DOSSIER_VERSIE, MAX_FOUTEN, MAX_JAREN, TEKST } from '@/lib/import/json'
import { statusNaImport } from '@/lib/import/json-keuzes'
import { aad, bewaarAccountantTx, bewaarJaarTx, maakJaarTx, variantGeldig, type DbTx } from './opslag'
import { vervangAangifteStaatTx } from './aangiftestaat-opslag'
import { schoonStaat, type AangifteStaat } from './aangiftestaat'
import { schoonAccountantRegels, type AccountantRegels } from './accountant'
import { gegevensUitOpslag, schoonGegevens } from './gegevens'
import { DOSSIER_STATUS_INFO, isDossierStatus, type DossierStatus } from './status'
import { valideerInvoer } from './valideer'

/** Een import of herstel die niet door kan; `status` is de HTTP-status voor de route. */
export class ImportFout extends Error {
  constructor(
    readonly status: number,
    melding: string,
    readonly fouten?: string[],
  ) {
    super(melding)
  }
}

export interface ImportContext {
  userId: number
  householdId: number
}

/** Een gecontroleerd verzoek: alles is geldig volgens dezelfde regels als bij opslaan. */
export interface GeldigeImport {
  jaren: Array<{
    jaar: number
    actie: 'toevoegen' | 'vervangen'
    invoer: HuishoudenInvoer
    variant: string | null
    /** Status uit het bestand (nog niet omgezet). */
    status: DossierStatus
    accountant?: AccountantRegels
    aangiftestaat?: AangifteStaat
  }>
  gegevens?: HuishoudenGegevens
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

// ---------------------------------------------------------------------------
// Rekeningsleutel
// ---------------------------------------------------------------------------

/** Geheim per huishouden voor de rekeningsleutel (base64url); de dossiersleutel verlaat de server niet. */
export function rekeningGeheim(householdId: number, sleutel: Buffer = dossierSleutel()): string {
  return createHmac('sha256', sleutel).update(`rekeningsleutel:${householdId}`).digest('base64url')
}

// ---------------------------------------------------------------------------
// Controle van het verzoek
// ---------------------------------------------------------------------------

/** Status na de import: zie `statusNaImport` in lib/import/json-keuzes.ts (Ingediend uit het dossier of het bestand blijft). */
export { statusNaImport }

/** Controleert het verzoek volledig, zonder database. Gooit ImportFout (400 of 422) met de fouten per jaar. */
export function controleerVerzoek(body: unknown): GeldigeImport {
  if (!isObj(body)) throw new ImportFout(400, 'Ongeldig verzoek.')
  if (body.formaat !== 'ibcalculator-jaar' && body.formaat !== 'ibcalculator-dossier-export') throw new ImportFout(422, TEKST.anderFormaat)
  if (typeof body.versie !== 'number' || !Number.isInteger(body.versie) || body.versie < 1) throw new ImportFout(422, TEKST.anderFormaat)
  if (body.versie > DOSSIER_VERSIE) throw new ImportFout(422, TEKST.nieuwer)
  if (!Array.isArray(body.jaren) || body.jaren.length === 0) throw new ImportFout(422, 'Kies minstens één jaar om te importeren.')
  if (body.jaren.length > MAX_JAREN) throw new ImportFout(422, `Hooguit ${MAX_JAREN} jaren in één keer.`)
  for (const k of Object.keys(body)) if (!['formaat', 'versie', 'jaren', 'gegevens'].includes(k)) throw new ImportFout(400, 'Ongeldig verzoek.')

  const fouten: string[] = []
  const jaren: GeldigeImport['jaren'] = []
  const gezien = new Set<number>()
  for (const j of body.jaren) {
    if (!isObj(j) || typeof j.jaar !== 'number' || !Number.isInteger(j.jaar)) {
      fouten.push('jaren: elk jaar moet een jaartal hebben')
      continue
    }
    const jaar = j.jaar
    const voeg = (f: string) => fouten.push(`${jaar}: ${f}`)
    if (gezien.has(jaar)) {
      voeg('komt twee keer voor')
      continue
    }
    gezien.add(jaar)
    if (!BESCHIKBARE_JAREN().includes(jaar)) {
      voeg('de tool kan dit jaar niet berekenen')
      continue
    }
    for (const k of Object.keys(j)) if (!['jaar', 'actie', 'invoer', 'variant', 'status', 'accountant', 'aangiftestaat'].includes(k)) voeg(`${k.slice(0, 40)}: onbekend veld`)
    if (j.actie !== 'toevoegen' && j.actie !== 'vervangen') voeg("actie moet 'toevoegen' of 'vervangen' zijn")
    const variant = j.variant === undefined || j.variant === null || j.variant === '' ? null : typeof j.variant === 'string' ? j.variant : undefined
    if (variant === undefined || !variantGeldig(jaar, variant)) voeg('onbekende variant')
    if (j.status !== undefined && !isDossierStatus(j.status)) voeg("status moet 'concept', 'gecontroleerd' of 'ingediend' zijn")
    const invoerFouten = valideerInvoer(j.invoer)
    for (const f of invoerFouten.slice(0, MAX_FOUTEN)) voeg(f)
    if (invoerFouten.length === 0 && (j.invoer as HuishoudenInvoer).jaar !== jaar) voeg(`de invoer hoort bij ${String((j.invoer as HuishoudenInvoer).jaar)}`)
    let accountant: AccountantRegels | undefined
    if (j.accountant !== undefined) {
      const a = schoonAccountantRegels(j.accountant)
      if ('fout' in a) voeg(`accountant: ${a.fout}`)
      else accountant = a.regels
    }
    let staat: AangifteStaat | undefined
    if (j.aangiftestaat !== undefined) {
      if (!isObj(j.aangiftestaat)) voeg('aangiftestaat: moet een object zijn')
      else staat = schoonStaat(j.aangiftestaat).staat
    }
    if (fouten.some((f) => f.startsWith(`${jaar}: `))) continue
    const invoer = structuredClone(j.invoer) as HuishoudenInvoer
    if (variant) invoer.variant = variant
    else delete invoer.variant
    jaren.push({
      jaar,
      actie: j.actie as 'toevoegen' | 'vervangen',
      invoer,
      variant: variant ?? null,
      status: isDossierStatus(j.status) ? j.status : 'concept',
      ...(accountant ? { accountant } : {}),
      ...(staat ? { aangiftestaat: staat } : {}),
    })
  }
  let gegevens: HuishoudenGegevens | undefined
  if (body.gegevens !== undefined) {
    const g = schoonGegevens(body.gegevens)
    if ('fouten' in g) fouten.push(...g.fouten.map((f) => `persoonlijke gegevens: ${f}`))
    else gegevens = g.gegevens
  }
  if (fouten.length > 0) throw new ImportFout(422, 'Het bestand bevat gegevens die niet kloppen.', fouten.slice(0, 50))
  return { jaren, ...(gegevens ? { gegevens } : {}) }
}

// ---------------------------------------------------------------------------
// Datums
// ---------------------------------------------------------------------------

const DAG_MS = 24 * 60 * 60 * 1000

/** yyyy-mm-dd in Europe/Amsterdam. */
function amsterdamDatum(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Tot wanneer een herstelpunt van dit moment bewaard blijft (yyyy-mm-dd). */
export function herstelpuntTot(aangemaakt: Date): string {
  return amsterdamDatum(new Date(aangemaakt.getTime() + HERSTELPUNT_BEWAARDAGEN * DAG_MS))
}

const grens = (nu: Date) => new Date(nu.getTime() - HERSTELPUNT_BEWAARDAGEN * DAG_MS)

/** Ruimt herstelpunten op die ouder zijn dan HERSTELPUNT_BEWAARDAGEN dagen (van alle huishoudens). */
async function ruimOp(tx: Pick<DbTx, 'delete'>, nu: Date): Promise<void> {
  await tx.delete(herstelpunten).where(lt(herstelpunten.aangemaakt, grens(nu)))
}

/**
 * Ruimt verlopen herstelpunten op buiten een import om, zodat een herstelpunt (met een kopie van de vervangen jaren en
 * eventueel je adres) na 30 dagen echt weg is, ook zonder nieuwe import. Draait bij het laden van het overzicht, bij
 * de dossierpagina's en -routes (hooguit eens per kwartier per proces, `afEnToe`) en vóór een back-up.
 */
let laatsteOpruiming = 0
const OPRUIM_INTERVAL_MS = 15 * 60 * 1000
export async function ruimVerlopenHerstelpuntenOp(opties: { nu?: Date; afEnToe?: boolean } = {}): Promise<void> {
  const nu = opties.nu ?? new Date()
  if (opties.afEnToe && nu.getTime() - laatsteOpruiming < OPRUIM_INTERVAL_MS) return
  laatsteOpruiming = nu.getTime()
  await ruimOp(getDb(), nu)
}

/**
 * Het herstelpunt van de laatste JSON-import dat nog geldig is, voor de regel "Ongedaan maken" op het overzicht (blijft
 * staan na herladen). Ruimt eerst verlopen herstelpunten op; daarna bestaat een herstelpunt van meer dan 30 dagen niet
 * meer. Null zonder geldig herstelpunt of als het niet te lezen is.
 */
export async function actiefHerstelpunt(householdId: number, opties: { nu?: Date } = {}): Promise<ActiefHerstelpunt | null> {
  const nu = opties.nu ?? new Date()
  await ruimVerlopenHerstelpuntenOp({ nu })
  const [rij] = await getDb()
    .select()
    .from(herstelpunten)
    .where(and(eq(herstelpunten.householdId, householdId), eq(herstelpunten.reden, 'json-import'), gte(herstelpunten.aangemaakt, grens(nu))))
    .orderBy(desc(herstelpunten.aangemaakt))
    .limit(1)
  if (!rij) return null
  let punt: ImportHerstelpunt
  try {
    punt = ontsleutel<ImportHerstelpunt>(rij.inhoudEnc, aad.herstelpunt(householdId, rij.sleutel))
  } catch {
    return null
  }
  return {
    herstelpuntId: rij.id,
    aangemaakt: amsterdamDatum(rij.aangemaakt),
    tot: herstelpuntTot(rij.aangemaakt),
    toegevoegd: punt.jaren.filter((j) => !j.vorige).map((j) => j.jaar),
    vervangen: punt.jaren.filter((j) => j.vorige).map((j) => j.jaar),
    gegevens: Boolean(punt.gegevens),
  }
}

// ---------------------------------------------------------------------------
// Importeren
// ---------------------------------------------------------------------------

const NAAR_CONCEPT = 'Het stond op Gecontroleerd en staat nu op Concept, omdat de controles met de huidige regels anders kunnen uitkomen.'

/**
 * "2025 is toegevoegd en staat op Ingediend, zoals in het bestand." enzovoort. Bij Vervangen telt ook de status in het
 * dossier: een jaar dat al Ingediend was, blijft dat (en de melding zegt het), en een wissel van Gecontroleerd naar
 * Concept wordt genoemd.
 */
export function importMelding(jaar: number, actie: 'toevoegen' | 'vervangen', uitBestand: DossierStatus, inDossier?: DossierStatus | null): string {
  const ingediend = DOSSIER_STATUS_INFO.ingediend.label
  if (actie === 'toevoegen') {
    if (uitBestand === 'ingediend') return `${jaar} is toegevoegd en staat op ${ingediend}, zoals in het bestand.`
    if (uitBestand === 'gecontroleerd') return `${jaar} is toegevoegd. ${NAAR_CONCEPT}`
    return `${jaar} is toegevoegd.`
  }
  const basis = `${jaar} is vervangen; de vorige versie is bewaard.`
  if (uitBestand === 'ingediend') return `${basis} Het staat op ${ingediend}, zoals in het bestand.`
  if (inDossier === 'ingediend') return `${basis} Het blijft op ${ingediend} staan, want je had het al ingediend.`
  if (uitBestand === 'gecontroleerd') return `${basis} ${NAAR_CONCEPT}`
  if (inDossier === 'gecontroleerd') return `${basis} Het stond op ${DOSSIER_STATUS_INFO.gecontroleerd.label} en staat nu op ${DOSSIER_STATUS_INFO.concept.label}, zoals in het bestand.`
  return basis
}

async function jaarRijTx(tx: DbTx, householdId: number, jaar: number) {
  const [rij] = await tx
    .select()
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .for('update')
    .limit(1)
  return rij ?? null
}

/** Voert de import uit in één transactie. Gooit ImportFout bij een jaar dat niet (meer) kan; dan verandert er niets. */
export async function importeerJson(ctx: ImportContext, verzoek: GeldigeImport, opties: { nu?: Date } = {}): Promise<JsonImportResultaat> {
  const nu = opties.nu ?? new Date()
  return getDb().transaction(async (tx) => {
    // Eén import tegelijk per huishouden.
    const [hh] = await tx.select().from(households).where(and(eq(households.id, ctx.householdId), eq(households.userId, ctx.userId))).for('update').limit(1)
    if (!hh) throw new ImportFout(404, 'Er is geen huishouden gevonden.')
    await ruimOp(tx, nu)
    await tx.delete(herstelpunten).where(and(eq(herstelpunten.householdId, ctx.householdId), eq(herstelpunten.reden, 'json-import')))

    const punt: ImportHerstelpunt = { reden: 'json-import', jaren: [] }
    const ingediend: NonNullable<ImportHerstelpunt['ingediend']> = []
    const resultaat: JsonImportResultaat = { toegevoegd: [], vervangen: [], overgeslagen: [], herstelpuntId: null, herstelpuntTot: null, meldingen: [] }

    for (const j of verzoek.jaren) {
      const rij = await jaarRijTx(tx, ctx.householdId, j.jaar)
      if (j.actie === 'toevoegen' && rij) throw new ImportFout(409, `${j.jaar} staat al in je dossier. Kies Vervangen of Overslaan.`)
      if (j.actie === 'vervangen' && !rij) throw new ImportFout(409, `${j.jaar} staat niet (meer) in je dossier. Kies Toevoegen.`)
      // Ingediend is een feit: een jaar dat in het dossier al Ingediend was, blijft dat (ingediend_op blijft staan en
      // bewaarJaarTx zet gewijzigd_na_indienen als de invoer anders is), ook als het bestand een concept is.
      const status = statusNaImport(j.status, rij?.status)
      let versieNaImport: number
      if (rij) {
        const [doc] = await tx.select().from(accountantDocs).where(eq(accountantDocs.dossierYearId, rij.id)).limit(1)
        const [staat] = await tx.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, rij.id)).limit(1)
        punt.jaren.push({
          jaar: j.jaar,
          vorige: {
            invoer: ontsleutel<HuishoudenInvoer>(rij.invoerEnc, aad.invoer(ctx.householdId, rij.jaar)),
            status: rij.status,
            variant: rij.variant,
            accountant: doc ? ontsleutel<unknown>(doc.regelsEnc, aad.accountant(rij.id)) : null,
            aangiftestaat: staat ? ontsleutel<unknown>(staat.staatEnc, aad.aangifteStaat(rij.id)) : null,
          },
          versieNaImport: 0,
        })
        if (rij.status === 'ingediend' && rij.ingediendOp) ingediend.push({ jaar: j.jaar, op: rij.ingediendOp.toISOString(), gewijzigdNa: rij.gewijzigdNaIndienen })
        const uit = await bewaarJaarTx(tx, ctx.householdId, j.jaar, { invoer: j.invoer, status, variant: j.variant })
        if (!uit) throw new ImportFout(409, `${j.jaar} staat niet (meer) in je dossier. Kies Toevoegen.`)
        versieNaImport = uit.overzicht.versie
        resultaat.vervangen.push(j.jaar)
      } else {
        punt.jaren.push({ jaar: j.jaar, vorige: null, versieNaImport: 0 })
        versieNaImport = (await maakJaarTx(tx, ctx.householdId, j.invoer, { status })).versie
        resultaat.toegevoegd.push(j.jaar)
      }
      punt.jaren[punt.jaren.length - 1].versieNaImport = versieNaImport
      if (j.accountant) await bewaarAccountantTx(tx, ctx.householdId, j.jaar, j.accountant)
      if (j.aangiftestaat) await vervangAangifteStaatTx(tx, ctx.householdId, j.jaar, j.aangiftestaat)
      resultaat.meldingen.push(importMelding(j.jaar, j.actie, j.status, rij?.status ?? null))
    }

    if (verzoek.gegevens) {
      punt.gegevens = { vorige: gegevensUitOpslag(ontsleutel<unknown>(hh.gegevensEnc, aad.huishouden(ctx.userId))) }
      await tx.update(households).set({ gegevensEnc: versleutel(verzoek.gegevens, aad.huishouden(ctx.userId)), updatedAt: nu }).where(eq(households.id, ctx.householdId))
      resultaat.meldingen.push('Je persoonlijke gegevens zijn vervangen door die uit het bestand.')
    }
    if (ingediend.length > 0) punt.ingediend = ingediend

    if (punt.jaren.length > 0 || punt.gegevens) {
      const sleutel = randomBytes(16).toString('hex')
      const [rij] = await tx
        .insert(herstelpunten)
        .values({ householdId: ctx.householdId, sleutel, reden: 'json-import', inhoudEnc: versleutel(punt, aad.herstelpunt(ctx.householdId, sleutel)), aangemaakt: nu })
        .returning({ id: herstelpunten.id })
      resultaat.herstelpuntId = rij.id
      resultaat.herstelpuntTot = herstelpuntTot(nu)
    }
    return resultaat
  })
}

// ---------------------------------------------------------------------------
// Herstellen
// ---------------------------------------------------------------------------

async function laadPunt(tx: DbTx, ctx: ImportContext, id: number) {
  const [rij] = await tx
    .select()
    .from(herstelpunten)
    .where(and(eq(herstelpunten.id, id), eq(herstelpunten.householdId, ctx.householdId), eq(herstelpunten.reden, 'json-import')))
    .for('update')
    .limit(1)
  if (!rij) return null
  return { rij, punt: ontsleutel<ImportHerstelpunt>(rij.inhoudEnc, aad.herstelpunt(ctx.householdId, rij.sleutel)) }
}

/** Het voorstel: per jaar terugzetten of verwijderen, en of het jaar na de import nog is opgeslagen. Null zonder herstelpunt. */
export async function herstelVoorstel(ctx: ImportContext, id: number, opties: { nu?: Date } = {}): Promise<HerstelVoorstel | null> {
  const nu = opties.nu ?? new Date()
  return getDb().transaction(async (tx) => {
    await ruimOp(tx, nu)
    const p = await laadPunt(tx, ctx, id)
    if (!p) return null
    const jaren: HerstelVoorstel['jaren'] = []
    for (const j of p.punt.jaren) {
      const [rij] = await tx
        .select({ versie: dossierYears.versie })
        .from(dossierYears)
        .where(and(eq(dossierYears.householdId, ctx.householdId), eq(dossierYears.jaar, j.jaar)))
        .limit(1)
      jaren.push({ jaar: j.jaar, actie: j.vorige ? 'terugzetten' : 'verwijderen', gewijzigdNaImport: !rij || rij.versie !== j.versieNaImport })
    }
    return { herstelpuntId: p.rij.id, jaren, tot: herstelpuntTot(p.rij.aangemaakt) }
  })
}

/**
 * Zet alles terug zoals het vóór de import was, in één transactie, en ruimt het herstelpunt op. De bevestiging bij
 * jaren die na de import nog zijn aangepast, doet de route (via `herstelVoorstel`) en de UI. Null zonder herstelpunt.
 */
export async function herstelImport(ctx: ImportContext, id: number, opties: { nu?: Date } = {}): Promise<HerstelResultaat | null> {
  const nu = opties.nu ?? new Date()
  return getDb().transaction(async (tx) => {
    await ruimOp(tx, nu)
    const p = await laadPunt(tx, ctx, id)
    if (!p) return null
    const uit: HerstelResultaat = { teruggezet: [], verwijderd: [], meldingen: [] }
    for (const j of p.punt.jaren) {
      const rij = await jaarRijTx(tx, ctx.householdId, j.jaar)
      if (!j.vorige) {
        if (rij) await tx.delete(dossierYears).where(eq(dossierYears.id, rij.id))
        uit.verwijderd.push(j.jaar)
        continue
      }
      const v = j.vorige
      const invoer: HuishoudenInvoer = { ...v.invoer }
      if (v.variant) invoer.variant = v.variant
      else delete invoer.variant
      if (rij) await bewaarJaarTx(tx, ctx.householdId, j.jaar, { invoer, status: v.status, variant: v.variant })
      else await maakJaarTx(tx, ctx.householdId, invoer, { status: v.status })
      const na = await jaarRijTx(tx, ctx.householdId, j.jaar)
      if (!na) throw new ImportFout(500, 'Herstellen is niet gelukt.')
      const was = p.punt.ingediend?.find((x) => x.jaar === j.jaar)
      if (v.status === 'ingediend' && was) await tx.update(dossierYears).set({ ingediendOp: new Date(was.op), gewijzigdNaIndienen: was.gewijzigdNa }).where(eq(dossierYears.id, na.id))
      if (v.accountant) {
        const a = schoonAccountantRegels(v.accountant)
        if ('regels' in a) await bewaarAccountantTx(tx, ctx.householdId, j.jaar, a.regels)
      } else await tx.delete(accountantDocs).where(eq(accountantDocs.dossierYearId, na.id))
      await vervangAangifteStaatTx(tx, ctx.householdId, j.jaar, v.aangiftestaat ?? null)
      uit.teruggezet.push(j.jaar)
    }
    if (p.punt.gegevens) {
      await tx.update(households).set({ gegevensEnc: versleutel(gegevensUitOpslag(p.punt.gegevens.vorige), aad.huishouden(ctx.userId)), updatedAt: nu }).where(eq(households.id, ctx.householdId))
    }
    await tx.delete(herstelpunten).where(eq(herstelpunten.id, p.rij.id))
    const lijst = (jaren: number[]) => (jaren.length <= 1 ? jaren.join('') : `${jaren.slice(0, -1).join(', ')} en ${jaren[jaren.length - 1]}`)
    if (uit.verwijderd.length > 0) uit.meldingen.push(`${lijst(uit.verwijderd)} ${uit.verwijderd.length === 1 ? 'is' : 'zijn'} weer uit je dossier gehaald.`)
    if (uit.teruggezet.length > 0) uit.meldingen.push(`${lijst(uit.teruggezet)} ${uit.teruggezet.length === 1 ? 'staat' : 'staan'} weer zoals vóór de import.`)
    if (p.punt.gegevens) uit.meldingen.push('Je persoonlijke gegevens staan weer zoals vóór de import.')
    return uit
  })
}

/** Alleen voor tests: het aantal herstelpunten van een huishouden. */
export async function telHerstelpunten(householdId: number): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(herstelpunten).where(eq(herstelpunten.householdId, householdId))
  return r?.n ?? 0
}
