/**
 * Ronde 2 (A3): controles op de status van het jaar. Ingediend wordt nooit tegengehouden of teruggezet (het is een feit);
 * een wijziging na het indienen en open fouten bij Ingediend zijn een let op. Puur: geen React, geen I/O.
 *
 * `ingediend-met-fouten` hangt af van de uitkomst van de andere regels en staat daarom niet in REGELS: `controleerAlles`
 * in lib/controles/index.ts voegt hem in een tweede doorgang toe (editor, server en export).
 */
import type { Controle, ControleRegel } from '../types'
import { aantal } from './hulp'

/** Het jaar staat op Ingediend en de invoer is daarna gewijzigd (op de server of in de editor, nog niet opgeslagen). */
export const ingediendGewijzigdRegel: ControleRegel = ({ status, ingediend }) => {
  if (status !== 'ingediend' || !ingediend?.gewijzigdNa) return []
  return [
    {
      id: 'ingediend-gewijzigd',
      regel: 'ingediend-gewijzigd',
      ernst: 'let-op',
      titel: 'Gewijzigd na het indienen',
      uitleg: 'Je hebt dit jaar als ingediend gemarkeerd. Een wijziging na het indienen geef je door met een aanvulling of bezwaar bij de Belastingdienst.',
      gebied: 'huishouden',
      veld: null,
      negeren: 'gezien',
      vingerafdruk: `op=${ingediend.op}`,
    },
  ]
}

/** Status Ingediend met open fouten: één let op, met het aantal als vingerafdruk. */
export function ingediendMetFouten(fouten: number): Controle {
  return {
    id: 'ingediend-met-fouten',
    regel: 'ingediend-met-fouten',
    ernst: 'let-op',
    titel: 'Ingediend met open fouten',
    uitleg: `Je hebt dit jaar als ingediend gemarkeerd terwijl er nog ${aantal(fouten, 'fout', 'fouten')} ${fouten === 1 ? 'openstaat' : 'openstaan'}. De fouten blijven als aandachtspunt staan. Klopt de aangifte daardoor niet, geef de wijziging dan door met een aanvulling of bezwaar bij de Belastingdienst.`,
    gebied: 'huishouden',
    veld: null,
    negeren: 'gezien',
    vingerafdruk: `aantal=${fouten}`,
  }
}

export const STATUS_REGELS: ControleRegel[] = [ingediendGewijzigdRegel]
