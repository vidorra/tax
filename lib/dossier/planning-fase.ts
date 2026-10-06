/**
 * Ronde 2 (A2): de fase van een dossierjaar voor Planning en de info-regel "Geen voorlopige aanslag ingevuld". Puur:
 * `vandaag` komt als argument mee (van de server of na het laden in de browser), nooit Date.now().
 *
 *  - toekomst:  het jaar ligt na het jaar van vandaag (conceptjaar); de cijfers zijn een voorstel;
 *  - lopend:    het jaar van vandaag: advies, termijnen, "ongeveer € … per maand";
 *  - na-afloop: het jaar is voorbij en de status is niet Ingediend: eerst "Wat kost uitstel?", daarna het advies;
 *  - ingediend: status Ingediend: alleen de berekende rente bij de verwachte dagtekening, ingeklapt.
 */
import type { PersoonInvoer, PersoonResultaat, TaxYearParams } from '@/lib/tax/types'
import type { DossierStatus } from './status'

export type PlanningFase = 'toekomst' | 'lopend' | 'na-afloop' | 'ingediend'

export function planningFase(jaar: number, vandaag: string, status: DossierStatus): PlanningFase {
  if (status === 'ingediend') return 'ingediend'
  const huidig = Number(vandaag.slice(0, 4))
  if (jaar > huidig) return 'toekomst'
  if (jaar === huidig) return 'lopend'
  return 'na-afloop'
}

/** Het belastingjaar is voorbij (na-afloop of ingediend). */
export const jaarVerstreken = (jaar: number, vandaag: string, status: DossierStatus = 'concept'): boolean => {
  const fase = planningFase(jaar, vandaag, status)
  return fase === 'na-afloop' || (fase === 'ingediend' && jaar < Number(vandaag.slice(0, 4)))
}

/**
 * Besluit na de nacontrole: de info-regel "Je hebt geen voorlopige aanslag ingevuld. Klopt dat?" in AanslagSectie staat
 * er alleen als (1) het jaar verstreken is, (2) de persoon te betalen IB boven de aanslaggrens van dat jaar heeft (uit de
 * uitkomst; zonder uitkomst geen regel) en (3) er geen voorlopige aanslag is ingevuld (leeg of 0). Geen controle; telt
 * niet mee in de controles (rommelbudget, ontwerp 14.4).
 */
export function toonGeenVaVraag(
  persoon: Pick<PersoonInvoer, 'voorlopigeAanslagIB'>,
  persoonResultaat: Pick<PersoonResultaat, 'teBetalenIB'> | null | undefined,
  params: TaxYearParams,
  jaar: number,
  vandaag: string,
  status: DossierStatus = 'concept',
): boolean {
  if (!jaarVerstreken(jaar, vandaag, status)) return false
  if (!persoonResultaat) return false
  if (persoon.voorlopigeAanslagIB !== undefined && persoon.voorlopigeAanslagIB !== 0) return false
  return persoonResultaat.teBetalenIB > params.overig.waarde.aanslaggrens
}
