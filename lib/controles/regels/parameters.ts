/**
 * Ronde 2 (A3): de status Gecontroleerd of Ingediend in een jaar waarvan de belastingregels nog niet allemaal
 * definitief zijn. Een let op: de uitkomst kan nog veranderen. Puur: geen React, geen I/O.
 */
import type { Status } from '@/lib/tax/types'
import type { ControleRegel } from '../types'

/** "is voorlopig", "is een voorstel"; los van components/ui, zodat de regel puur blijft. */
const STATUS_ZIN: Record<Exclude<Status, 'definitief'>, string> = {
  voorlopig: 'voorlopig',
  voorstel: 'een voorstel',
  geschat: 'geschat',
  rechtspraak: 'gebaseerd op rechtspraak',
}

export const paramsNietDefinitiefRegel: ControleRegel = ({ status, params, resultaat, jaar }) => {
  if (status === 'concept') return []
  const paramsStatus: Status = resultaat?.paramsStatus ?? params.status
  if (paramsStatus === 'definitief') return []
  return [
    {
      id: 'params-niet-definitief',
      regel: 'params-niet-definitief',
      ernst: 'let-op',
      titel: 'Nog niet alle cijfers zijn definitief',
      uitleg: `Een deel van de belastingregels van ${jaar} is ${STATUS_ZIN[paramsStatus]}. De uitkomst kan nog veranderen.`,
      gebied: 'parameters',
      veld: null,
      href: `/${jaar}/`,
      linkLabel: 'Bekijk de status',
      negeren: 'gezien',
      vingerafdruk: `status=${status}|params=${paramsStatus}`,
    },
  ]
}

export const PARAMETER_REGELS: ControleRegel[] = [paramsNietDefinitiefRegel]
