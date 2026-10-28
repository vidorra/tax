/**
 * Eenmalig bij de start (lib/opstart.ts): een Moneybird-token uit de serverinstellingen (MONEYBIRD_TOKEN +
 * MONEYBIRD_ADMINISTRATION_ID, uit de tijd van één account) wordt een versleutelde koppeling van persoon A, met de
 * indeling en de naam van de administratie die bij de oude omgevingsrij (soort 'moneybird-env') bewaard waren.
 *
 * Alleen als die oude rij er nog is: dat is het bewijs dat het token van het account van dat huishouden was (de rij
 * ontstond pas bij gebruik van de koppeling, in de tijd van één account). Het token gaat naar dat huishouden, nooit naar
 * "de eerste beheerder": die kan intussen iemand anders zijn. Na het overzetten is de rij weg, dus een herstart of een
 * later verwijderde koppeling zet niets terug. Zonder rij gebeurt er niets; de log zegt dan dat de variabele weg kan
 * en dat het token in Koppelingen toe te voegen is.
 */
import { and, asc, eq } from 'drizzle-orm'
import { schrijf } from '@/lib/db'
import { koppelingen } from '@/lib/db/schema'
import { versleutel } from '@/lib/crypto'
import { geldigMbId } from './client'
import { aadKoppeling, indelingUit } from './opslag'

const SOORT_ENV = 'moneybird-env'

export type OverzetUitkomst = 'geen-variabelen' | 'geen-oude-koppeling' | 'overgezet' | 'bestond-al'

export async function zetOmgevingskoppelingOver(env: Record<string, string | undefined> = process.env): Promise<OverzetUitkomst> {
  const token = env.MONEYBIRD_TOKEN?.trim()
  const administratieId = env.MONEYBIRD_ADMINISTRATION_ID?.trim()
  if (!token || !administratieId || !geldigMbId(administratieId)) return 'geen-variabelen'
  return schrijf((tx) => {
    const oud = tx.select().from(koppelingen).where(eq(koppelingen.soort, SOORT_ENV)).orderBy(asc(koppelingen.id)).limit(1).get()
    if (!oud) return 'geen-oude-koppeling'
    const householdId = oud.householdId
    const indeling = indelingUit(oud)
    const bestaand = tx
      .select()
      .from(koppelingen)
      .where(and(eq(koppelingen.householdId, householdId), eq(koppelingen.soort, 'moneybird'), eq(koppelingen.administratieId, administratieId)))
      .get()
    let uitkomst: OverzetUitkomst
    if (bestaand) {
      if (!bestaand.indelingEnc && Object.keys(indeling).length > 0) {
        tx.update(koppelingen).set({ indelingEnc: versleutel(indeling, aadKoppeling.indeling(householdId, bestaand.id)) }).where(eq(koppelingen.id, bestaand.id)).run()
      }
      uitkomst = 'bestond-al'
    } else {
      const { id } = tx
        .insert(koppelingen)
        .values({
          householdId,
          soort: 'moneybird',
          label: 'Moneybird',
          tokenEnc: 'tijdelijk',
          administratieId,
          administratieNaam: oud.administratieNaam ?? null,
          laatstGebruikt: oud.laatstGebruikt ?? null,
          persoon: 'A',
        })
        .returning({ id: koppelingen.id })
        .get()
      tx.update(koppelingen)
        .set({
          tokenEnc: versleutel(token, aadKoppeling.token(householdId, id)),
          indelingEnc: Object.keys(indeling).length > 0 ? versleutel(indeling, aadKoppeling.indeling(householdId, id)) : null,
        })
        .where(eq(koppelingen.id, id))
        .run()
      uitkomst = 'overgezet'
    }
    tx.delete(koppelingen).where(eq(koppelingen.soort, SOORT_ENV)).run()
    return uitkomst
  })
}
