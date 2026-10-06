/**
 * Voorblad (spec 1.4 en 4): naam en adres, en in plaats van de relatiebeheerder van het kantoor de tool waarmee
 * het rapport is opgesteld, de datum van de berekening en de status van het dossierjaar. In een jaar met
 * varianten van de parameters (zoals 2027) staat erbij met welke variant is gerekend.
 */
import { SITE } from '@/lib/site'
import { DOSSIER_STATUS_INFO } from '@/lib/dossier/status'
import type { Voorblad } from '../model'
import { datumLang } from '../notatie'
import type { RapportContext } from './bouwstenen'
import { rekenvariant } from './verantwoording'

export function voorblad(c: RapportContext): Voorblad {
  const adres = c.opties.gegevens?.adres
  const adresregels = [c.naam]
  if (adres) {
    if (adres.straat.trim()) adresregels.push(adres.straat.trim())
    const plaats = `${adres.postcode.trim()} ${adres.plaats.trim()}`.trim()
    if (plaats) adresregels.push(plaats)
  }
  const variant = rekenvariant(c)
  return {
    adresregels,
    regels: [
      { label: 'Opgesteld met', waarde: SITE.naam },
      { label: 'Datum', waarde: datumLang(c.opties.vandaag) },
      { label: 'Status', waarde: DOSSIER_STATUS_INFO[c.opties.dossierStatus]?.label ?? c.opties.dossierStatus },
      ...(variant ? [{ label: 'Rekenvariant', waarde: variant.status ? `${variant.label} (${variant.status})` : variant.label }] : []),
    ],
  }
}
