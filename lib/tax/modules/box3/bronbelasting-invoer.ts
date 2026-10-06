/**
 * Ronde 2 (contract): één lezer voor de bronbelasting van een box 3-positie. Nieuwe invoer heeft `bronbelastingen`
 * (per land en soort); oude invoer heeft één `bronbelasting` met een land in vrije tekst. Engine, rapport en UI lezen
 * allemaal via `bronbelastingRegels`, zodat het oude veld nergens stil wegvalt.
 *
 * Puur: geen fiscale getallen, alleen normalisatie. Het land van het oude veld wordt een ISO-code als het een bekende
 * Nederlandse of Engelse naam of een code is; anders blijft de tekst staan (de module bronbelasting behandelt een
 * onbekend land met de let op "verdragstarief niet in de tool"). De landentabel zelf (A5) staat in
 * years/data/bronbelasting-landen.ts; `landCode` kent alleen namen, geen tarieven.
 */
import type { BronbelastingRegel, VermogensPositie } from '../../types'

/** Id van de regel die uit het oude veld `bronbelasting` komt. */
export const OUDE_BRONBELASTING_ID = 'oud'

const NAMEN: Record<string, string> = {
  'verenigde staten': 'US', vs: 'US', usa: 'US', 'united states': 'US', amerika: 'US',
  'verenigd koninkrijk': 'GB', vk: 'GB', uk: 'GB', 'united kingdom': 'GB', engeland: 'GB', 'groot-brittannie': 'GB', 'groot-brittannië': 'GB',
  duitsland: 'DE', germany: 'DE',
  frankrijk: 'FR', france: 'FR',
  zwitserland: 'CH', switzerland: 'CH',
  belgie: 'BE', belgië: 'BE', belgium: 'BE',
  ierland: 'IE', ireland: 'IE',
  luxemburg: 'LU', luxembourg: 'LU',
  spanje: 'ES', spain: 'ES',
  italie: 'IT', italië: 'IT', italy: 'IT',
  denemarken: 'DK', denmark: 'DK',
  zweden: 'SE', sweden: 'SE',
  noorwegen: 'NO', norway: 'NO',
  finland: 'FI',
  canada: 'CA',
  japan: 'JP',
  australie: 'AU', australië: 'AU', australia: 'AU',
  oostenrijk: 'AT', austria: 'AT',
  portugal: 'PT',
  hongkong: 'HK', 'hong kong': 'HK',
  singapore: 'SG',
  'zuid-korea': 'KR', korea: 'KR', 'south korea': 'KR',
  taiwan: 'TW',
  china: 'CN',
  india: 'IN',
  nederland: 'NL', netherlands: 'NL',
}

/** ISO 3166-1 alpha-2 uit een code of een Nederlandse of Engelse naam; null als het niet te herkennen is. */
export function landCode(tekst: string | undefined | null): string | null {
  if (!tekst) return null
  const t = tekst.trim()
  // Eerst de namen: 'VS' en 'VK' zijn Nederlandse afkortingen, geen ISO-codes.
  const naam = NAMEN[t.toLowerCase()]
  if (naam) return naam
  return /^[A-Za-z]{2}$/.test(t) ? t.toUpperCase() : null
}

/**
 * De bronbelastingregels van een positie: `bronbelastingen` als die er is (ook als lege lijst), anders het oude veld
 * als één regel (soort dividend, id 'oud'). Het land is dan de herkende code, of de oorspronkelijke tekst.
 */
export function bronbelastingRegels(positie: Pick<VermogensPositie, 'bronbelasting' | 'bronbelastingen'>): BronbelastingRegel[] {
  if (positie.bronbelastingen) return positie.bronbelastingen
  const oud = positie.bronbelasting
  if (!oud) return []
  return [
    {
      id: OUDE_BRONBELASTING_ID,
      land: landCode(oud.land) ?? oud.land.trim(),
      soort: 'dividend',
      brutoInkomsten: oud.brutoInkomsten,
      bedrag: oud.bedrag,
    },
  ]
}
