/**
 * Nummering van het rapport (spec 1.7): hoofdstukken 1, 2, 3; paragrafen 2.1; subparagrafen 2.2.1. De nummering
 * loopt door over de secties die er staan: valt een paragraaf weg, dan schuift de volgende op. Geeft de
 * inhoudsopgave; de paginanummers vult de PDF-renderer in.
 */
import type { InhoudRegel, RapportDocument, Sectie } from './model'

/** Vult `nummer` in op elke sectie van het document en geeft de regels van de inhoudsopgave. Idempotent. */
export function nummer(doc: RapportDocument): InhoudRegel[] {
  const inhoud: InhoudRegel[] = []
  const loop = (secties: Sectie[], voorvoegsel: string) => {
    secties.forEach((s, i) => {
      s.nummer = voorvoegsel ? `${voorvoegsel}.${i + 1}` : String(i + 1)
      inhoud.push({ nummer: s.nummer, titel: s.titel, niveau: s.niveau, sectie: s })
      loop(s.secties, s.nummer)
    })
  }
  loop(doc.hoofdstukken, '')
  return inhoud
}
