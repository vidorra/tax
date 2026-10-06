/**
 * Ronde 2 (contract): alle registers op één plek. Elk onderdeel schrijft zijn velden en regelingen in een eigen bestand
 * in deze map en zet ze hier op de eigen regel (import direct onder de eigen markering, entry direct onder de eigen
 * markering in de lijsten). Zie types.ts.
 *
 * Eén eigenaar per veld (na de nacontrole): wie de sectie bezit en de `veld`-props zet, registreert de velden.
 *  - A3 (basis.ts): HuishoudenSectie (huishouden en personen), JaarrekeningInvoer, LoonSectie, PensioenSectie (zonder
 *    de stakingslijfrente), PgaSectie, VerdelingSectie, en van de onderneming alleen `naam` en `winstberekening.saldo`
 *    (hun `veld`-props staan al in het contract).
 *  - A2 (prive.ts): WoningSectie (ook leningdelen), Box2Sectie, AanslagSectie (zonder de voortwenteling).
 *  - A5 (bronbelasting-partner.ts): VermogenSectie (posities, schulden, bronbelastingregels), de voortwenteling, de
 *    partnersituatie en de terbeschikkingstellingen.
 *  - A6 (regelingen-onderneming.ts): OndernemingSectie en ActivaInvoer behalve `naam` en `winstberekening.saldo`
 *    (uren, rubrieken, activa, investeringen, FOR, auto, reserves, staking) en de stakingslijfrente.
 *  - A4 (import.ts): alleen eigen velden als die er komen (herkomst staat niet in de editor).
 * Een patroon staat in één register; de contracttest in lib/dossier/__tests__/veldregister-contract.spec.ts bewaakt dat.
 */
import type { RegelingItem, VeldregisterItem } from './types'
import { BASIS_VELDEN } from './basis'
import { PRIVE_REGELINGEN, PRIVE_VELDEN } from './prive'
import { BRONBELASTING_PARTNER_REGELINGEN, BRONBELASTING_PARTNER_VELDEN } from './bronbelasting-partner'
import { REGELINGEN_ONDERNEMING, VELDEN_REGELINGEN_ONDERNEMING } from './regelingen-onderneming'

export const VELDREGISTER: VeldregisterItem[] = [
  ...BASIS_VELDEN,
  ...PRIVE_VELDEN,
  ...BRONBELASTING_PARTNER_VELDEN,
  ...VELDEN_REGELINGEN_ONDERNEMING,
]

export const REGELINGEN: RegelingItem[] = [
  ...PRIVE_REGELINGEN,
  ...BRONBELASTING_PARTNER_REGELINGEN,
  ...REGELINGEN_ONDERNEMING,
]

export type { RegelingItem, VeldregisterItem, VeldMatch, RegelingPlaats } from './types'
