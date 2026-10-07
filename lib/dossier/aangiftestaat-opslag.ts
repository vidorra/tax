/**
 * Ronde 2: opslag van de aangiftestaat per dossierjaar (server-only). Zie lib/dossier/aangiftestaat.ts voor de vorm.
 *
 * Wijzigen gebeurt in één schrijf() (BEGIN IMMEDIATE): lezen, de wijzigingen samenvoegen met wat er staat en
 * terugschrijven zijn ondeelbaar. Zo overschrijven twee vensters (invulhulp en editor) elkaars wijzigingen niet; de
 * tweede ziet altijd de staat na de eerste. De staat verhoogt de versie van de invoer niet.
 */
import { and, eq } from 'drizzle-orm'
import { lees, schrijf, type Tx } from '@/lib/db'
import { aangifteStaat, dossierYears } from '@/lib/db/schema'
import { ontsleutel, versleutel } from '@/lib/crypto'
import { aad } from './opslag'
import { LEGE_STAAT, pasStaatToe, schoonStaat, type AangifteStaat, type StaatWijziging } from './aangiftestaat'

export interface AangifteStaatAntwoord {
  staat: AangifteStaat
  /** ISO-tijdstip van de laatste wijziging; null als er nog niets is bewaard. */
  bijgewerkt: string | null
}

/** Het id van het dossierjaar, of undefined als het jaar niet bestaat. */
function jaarId(tx: Tx, householdId: number, jaar: number): number | undefined {
  return tx
    .select({ id: dossierYears.id })
    .from(dossierYears)
    .where(and(eq(dossierYears.householdId, householdId), eq(dossierYears.jaar, jaar)))
    .limit(1)
    .get()?.id
}

/** De aangiftestaat van een jaar; null als het jaar niet bestaat. Een lege staat als er nog niets is bewaard. */
export async function laadAangifteStaat(householdId: number, jaar: number): Promise<AangifteStaatAntwoord | null> {
  const gelezen = lees((tx) => {
    const id = jaarId(tx, householdId, jaar)
    if (id === undefined) return null
    return { id, doc: tx.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, id)).limit(1).get() }
  })
  if (!gelezen) return null
  const { id, doc } = gelezen
  if (!doc) return { staat: { ...LEGE_STAAT }, bijgewerkt: null }
  return { staat: schoonStaat(ontsleutel<unknown>(doc.staatEnc, aad.aangifteStaat(id))).staat, bijgewerkt: doc.updatedAt.toISOString() }
}

export class StaatFout extends Error {}

/**
 * Past wijzigingen toe op de opgeslagen staat en geeft de nieuwe staat; null als het jaar niet bestaat. Gooit StaatFout
 * als een grens wordt overschreden; dan verandert er niets.
 */
export async function wijzigAangifteStaat(householdId: number, jaar: number, wijzigingen: StaatWijziging[]): Promise<AangifteStaatAntwoord | null> {
  return schrijf((tx) => {
    const id = jaarId(tx, householdId, jaar)
    if (id === undefined) return null
    const doc = tx.select().from(aangifteStaat).where(eq(aangifteStaat.dossierYearId, id)).limit(1).get()
    const huidig = doc ? schoonStaat(ontsleutel<unknown>(doc.staatEnc, aad.aangifteStaat(id))).staat : { ...LEGE_STAAT }
    const r = pasStaatToe(huidig, wijzigingen)
    if ('fout' in r) throw new StaatFout(r.fout)
    const nu = new Date()
    const staatEnc = versleutel(r.staat, aad.aangifteStaat(id))
    if (doc) tx.update(aangifteStaat).set({ staatEnc, versie: doc.versie + 1, updatedAt: nu }).where(eq(aangifteStaat.id, doc.id)).run()
    else tx.insert(aangifteStaat).values({ dossierYearId: id, staatEnc, versie: 1, updatedAt: nu }).run()
    return { staat: r.staat, bijgewerkt: nu.toISOString() }
  })
}

/** Vervangt de hele staat (JSON-import, herstel). Geeft false als het jaar niet bestaat. */
export async function vervangAangifteStaat(householdId: number, jaar: number, staat: unknown): Promise<boolean> {
  return schrijf((tx) => vervangAangifteStaatTx(tx, householdId, jaar, staat))
}

/**
 * Ronde 2: vervangAangifteStaat binnen een transactie van de aanroeper (synchroon, in schrijf(); JSON-import en herstel
 * in één transactie). `staat` null verwijdert de rij (herstel van een jaar dat vóór de import geen staat had).
 */
export function vervangAangifteStaatTx(tx: Tx, householdId: number, jaar: number, staat: unknown): boolean {
  const id = jaarId(tx, householdId, jaar)
  if (id === undefined) return false
  if (staat === null) {
    tx.delete(aangifteStaat).where(eq(aangifteStaat.dossierYearId, id)).run()
    return true
  }
  const schoon = schoonStaat(staat).staat
  const nu = new Date()
  const staatEnc = versleutel(schoon, aad.aangifteStaat(id))
  tx.insert(aangifteStaat)
    .values({ dossierYearId: id, staatEnc, versie: 1, updatedAt: nu })
    .onConflictDoUpdate({ target: aangifteStaat.dossierYearId, set: { staatEnc, updatedAt: nu } })
    .run()
  return true
}
