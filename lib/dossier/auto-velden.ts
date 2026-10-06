/**
 * Welke velden van de auto van de zaak op de pagina staan (AutoBlok) en waarom: de youngtimer-stand uit de parameters.
 * Eén bron voor de editor en het zoekveld (lib/dossier/veldregister/regelingen-onderneming.ts), zodat zoeken nooit een
 * veld toont dat er niet staat. Puur: geen React, geen I/O.
 */
import type { AutoInvoer, TaxYearParams } from '@/lib/tax/types'
import { youngtimerMaandIndex, youngtimerOvergang, youngtimerVanafInJaar } from '@/lib/tax/modules/onderneming/auto'

const MAANDEN_PER_JAAR = 12

export interface AutoStand {
  /** Leeftijd waarop een auto youngtimer is (uit de parameters). */
  leeftijd: number | undefined
  /** Overgangsrecht van de parameters, of null. */
  og: NonNullable<TaxYearParams['ondernemer']['waarde']['auto']['youngtimerOvergang']> | null
  /** Het hele jaar youngtimer. */
  heelJaar: boolean
  /** Wordt dit jaar youngtimer: de eerste dag dat de dagwaarde geldt. */
  vanaf: string | undefined
  /** Het overgangsrecht kan gelden. */
  overgang: ReturnType<typeof youngtimerOvergang>
  youngtimer: boolean
  /** Het veld Dagwaarde staat op de pagina: bij een youngtimer, of als er al een dagwaarde is ingevuld. */
  toonDagwaarde: boolean
  /** De schakelaar "stond al vóór de nieuwe grens tot mijn beschikking" staat op de pagina. */
  toonOvergang: boolean
}

export function autoStand(auto: AutoInvoer, params: TaxYearParams | null, jaar: number): AutoStand {
  const ap = params?.ondernemer.waarde.auto
  const leeftijd = ap?.youngtimerLeeftijd
  const og = ap?.youngtimerOvergang ?? null
  const geldigeDatum = typeof auto.datumEersteToelating === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(auto.datumEersteToelating)
  const heelJaar = Boolean(params && leeftijd !== undefined && geldigeDatum && youngtimerMaandIndex(auto.datumEersteToelating, leeftijd) <= jaar * MAANDEN_PER_JAAR)
  const vanaf = params && geldigeDatum ? youngtimerVanafInJaar(auto.datumEersteToelating, params, jaar) : undefined
  const overgang = params && geldigeDatum ? youngtimerOvergang(auto, params, jaar) : null
  const youngtimer = heelJaar || vanaf !== undefined || overgang !== null
  return {
    leeftijd,
    og,
    heelJaar,
    vanaf,
    overgang,
    youngtimer,
    toonDagwaarde: youngtimer || auto.dagwaarde !== undefined,
    toonOvergang: Boolean(overgang && og && !heelJaar),
  }
}
