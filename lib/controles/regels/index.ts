/**
 * Ronde 2, contract: alle controleregels op één plek. Elk onderdeel schrijft zijn regels in een eigen bestand en zet ze
 * hier op de eigen regel (import bovenaan, entry in REGELS). De volgorde in de lijst is de volgorde binnen een gebied.
 * `controleer()` in lib/controles/index.ts (onderdeel controles, A3) voert ze uit, sorteert en past genegeerd toe.
 */
import type { ControleRegel } from '../types'
import { INVOER_REGELS } from './invoer'
import { JAARREKENING_REGELS } from './jaarrekening'
import { DOORROL_REGELS } from './doorrol'
import { STATUS_REGELS } from './status'
import { PARAMETER_REGELS } from './parameters'
import { invulhulpRegels } from '@/lib/invulhulp/controles'
import { PRIVE_REGELS } from './prive'
import { BRONBELASTING_REGELS } from './bronbelasting'
import { PARTNER_REGELS } from './partner'
import { regelingenOnderneming } from './regelingen-onderneming'

export const REGELS: ControleRegel[] = [
  ...INVOER_REGELS,
  ...JAARREKENING_REGELS,
  ...DOORROL_REGELS,
  ...STATUS_REGELS,
  ...PARAMETER_REGELS,
  regelingenOnderneming,
  ...PARTNER_REGELS,
  ...BRONBELASTING_REGELS,
  ...PRIVE_REGELS,
  ...invulhulpRegels,
]
