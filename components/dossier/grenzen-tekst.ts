/**
 * Ronde 2 (contract, na de toets): de zin bij het grote bedrag als de aanslag- of teruggaafgrens iets laat vervallen.
 * Eén plek voor het uitkomstpaneel (A2, markering resultaat-grenzen-A2), de mobiele balk (A3, HuishoudenEditor) en de
 * jaarkaart op het overzicht (A3, Overzicht). Eigenaar daarna: onderdeel aanslag en privé (A2), die de copy mag
 * verfijnen zonder de signatuur te veranderen. Puur, geen React. Grenzen altijd uit de params.
 *
 * Zolang de engine de grenzen niet rekent (`PersoonResultaat.aanslag` ontbreekt), geven de functies null.
 */
import type { HuishoudenResultaat, PersoonId, TaxYearParams } from '@/lib/tax/types'
import type { DossierSamenvatting } from '@/lib/dossier/samenvatting'
import { formatEuro } from '@/components/ui/format'

/**
 * Per persoon met een vervallen bedrag één zin, bijvoorbeeld "Berekend € 40; onder de aanslaggrens van € 58, dus
 * niets te betalen." Bij twee personen met de naam ervoor ("Persoon A: berekend …"). Leeg als er niets vervalt.
 */
export function grensZinnen(r: HuishoudenResultaat, params: TaxYearParams, naam: (id: PersoonId) => string = (id) => `Persoon ${id}`): string[] {
  const o = params.overig.waarde
  const meer = r.personen.length > 1
  return r.personen.flatMap((p) => {
    const v = p.aanslag?.vervallenDoorGrens
    if (!v || v.bedrag === 0) return []
    const zin =
      v.soort === 'aanslaggrens'
        ? `berekend ${formatEuro(v.bedrag)}; onder de aanslaggrens van ${formatEuro(o.aanslaggrens)}, dus niets te betalen.`
        : `terug ${formatEuro(v.bedrag)}; onder de teruggaafgrens van ${formatEuro(o.teruggaafgrens)}, dus niets terug.`
    return [meer ? `${naam(p.id)}: ${zin}` : `${zin.charAt(0).toUpperCase()}${zin.slice(1)}`]
  })
}

/** Korte regel voor de jaarkaart en de mobiele balk uit de samenvatting: "Berekend € 40, onder de aanslaggrens". */
export function grensKort(s: Pick<DossierSamenvatting, 'teBetalenIB' | 'teBetalenIBNaGrenzen'>): string | null {
  if (s.teBetalenIBNaGrenzen === undefined || s.teBetalenIBNaGrenzen === s.teBetalenIB) return null
  if (s.teBetalenIBNaGrenzen === 0) {
    return s.teBetalenIB > 0 ? `Berekend ${formatEuro(s.teBetalenIB)}, onder de aanslaggrens` : `Berekend terug ${formatEuro(-s.teBetalenIB)}, onder de teruggaafgrens`
  }
  return `Berekend ${formatEuro(s.teBetalenIB)}; na de grenzen per persoon ${formatEuro(s.teBetalenIBNaGrenzen)}`
}
