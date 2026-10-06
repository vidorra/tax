/**
 * Ronde 2: opslag van de aangiftestaat per dossierjaar (server-only). Zie lib/dossier/aangiftestaat.ts voor de vorm.
 *
 * Wijzigen gebeurt onder een rijlock op het dossierjaar, zodat twee vensters (invulhulp en editor) elkaars wijzigingen
 * niet overschrijven. De staat verhoogt de versie van de invoer niet.
 */
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { aangifteStaat, dossierYears } from '@/lib/db/schema'
import { ontsleutel, versleutel } from '@/lib/crypto'
import { aad, type DbTx } from './opslag'
import { LEGE_STAAT, pasStaatToe, schoonStaat, type AangifteStaat, type StaatWijziging } from './aangiftestaat'

export interface AangifteStaatAntwoord {
  staat: AangifteStaat
  /** ISO-tijdstip van de laatste wijziging; null als er nog niets is bewaard. */
  bijgewerkt: string | null
}

/** De aangiftestaat van een jaar; null als het jaar niet bestaat. Een lege staat als er nog niets is bewaard. */
export async function laadAangifteStaat(householdId: number, jaar: number): Promise<AangifteStaatAntwoord | null> {
  const db = getDb()
  const [rij] = await db
    .select({ id: dossierYears.id })
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .limit(1)
  if (!rij) return null
  const [doc] = await db.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, rij.id)).limit(1)
  if (!doc) return { staat: { ...LEGE_STAAT }, bijgewerkt: null }
  return { staat: schoonStaat(ontsleutel<unknown>(doc.staatEnc, aad.aangifteStaat(rij.id))).staat, bijgewerkt: doc.updatedAt.toISOString() }
}

export class StaatFout extends Error {}

/**
 * Past wijzigingen toe onder een rijlock en geeft de nieuwe staat; null als het jaar niet bestaat. Gooit StaatFout als
 * een grens wordt overschreden.
 */
export async function wijzigAangifteStaat(householdId: number, jaar: number, wijzigingen: StaatWijziging[]): Promise<AangifteStaatAntwoord | null> {
  return getDb().transaction(async (tx) => {
    const [rij] = await tx
      .select({ id: dossierYears.id })
      .from(dossierYears)
      .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
      .for('update')
      .limit(1)
    if (!rij) return null
    const [doc] = await tx.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, rij.id)).limit(1)
    const huidig = doc ? schoonStaat(ontsleutel<unknown>(doc.staatEnc, aad.aangifteStaat(rij.id))).staat : { ...LEGE_STAAT }
    const r = pasStaatToe(huidig, wijzigingen)
    if ('fout' in r) throw new StaatFout(r.fout)
    const nu = new Date()
    const staatEnc = versleutel(r.staat, aad.aangifteStaat(rij.id))
    if (doc) await tx.update(aangifteStaat).set({ staatEnc, versie: doc.versie + 1, updatedAt: nu }).where(eq(aangifteStaat.id, doc.id))
    else await tx.insert(aangifteStaat).values({ dossierYearId: rij.id, staatEnc, versie: 1, updatedAt: nu })
    return { staat: r.staat, bijgewerkt: nu.toISOString() }
  })
}

/** Vervangt de hele staat (JSON-import, herstel). Geeft false als het jaar niet bestaat. */
export async function vervangAangifteStaat(householdId: number, jaar: number, staat: unknown): Promise<boolean> {
  return getDb().transaction((tx) => vervangAangifteStaatTx(tx, householdId, jaar, staat))
}

/**
 * Ronde 2: vervangAangifteStaat binnen een transactie van de aanroeper (JSON-import en herstel in één transactie).
 * `staat` null verwijdert de rij (herstel van een jaar dat vóór de import geen staat had).
 */
export async function vervangAangifteStaatTx(tx: DbTx, householdId: number, jaar: number, staat: unknown): Promise<boolean> {
  const [rij] = await tx
    .select({ id: dossierYears.id })
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .for('update')
    .limit(1)
  if (!rij) return false
  if (staat === null) {
    await tx.delete(aangifteStaat).where(eq(aangifteStaat.dossierYearId, rij.id))
    return true
  }
  const schoon = schoonStaat(staat).staat
  const nu = new Date()
  const staatEnc = versleutel(schoon, aad.aangifteStaat(rij.id))
  await tx
    .insert(aangifteStaat)
    .values({ dossierYearId: rij.id, staatEnc, versie: 1, updatedAt: nu })
    .onConflictDoUpdate({ target: aangifteStaat.dossierYearId, set: { staatEnc, updatedAt: nu } })
  return true
}
