import type { HuishoudenResultaat, PersoonId, Status } from '@/lib/tax/types'

export interface DossierSamenvatting {
  jaar: number
  variant: string | null
  paramsStatus: Status
  teBetalenIB: number
  /** Ronde 2: te betalen IB na de aanslag- en teruggaafgrens (ontbreekt zolang de engine de grenzen niet rekent). */
  teBetalenIBNaGrenzen?: number
  teBetalenZvw: number
  verschuldigdIB: number
  verschuldigdZvw: number
  toeslagen: number
  aantalWaarschuwingen: number
  personen: Array<{ id: PersoonId; verzamelinkomen: number; verschuldigdIB: number; teBetalenIB: number; zvw: number; teBetalenZvw: number }>
}

export function samenvatting(r: HuishoudenResultaat): DossierSamenvatting {
  const waarschuwingen = new Set([...r.waarschuwingen, ...r.personen.flatMap((p) => p.waarschuwingen)].map((w) => w.id))
  return {
    jaar: r.jaar,
    variant: r.variant,
    paramsStatus: r.paramsStatus,
    teBetalenIB: r.totaal.teBetalenIB,
    ...(r.totaal.teBetalenIBNaGrenzen !== undefined ? { teBetalenIBNaGrenzen: r.totaal.teBetalenIBNaGrenzen } : {}),
    teBetalenZvw: r.totaal.teBetalenZvw,
    verschuldigdIB: r.totaal.verschuldigdIB,
    verschuldigdZvw: r.totaal.verschuldigdZvw,
    toeslagen: r.totaal.toeslagen,
    aantalWaarschuwingen: waarschuwingen.size,
    personen: r.personen.map((p) => ({
      id: p.id,
      verzamelinkomen: p.verzamelinkomen,
      verschuldigdIB: p.verschuldigdIB,
      teBetalenIB: p.teBetalenIB,
      zvw: p.zvw.bijdrage,
      teBetalenZvw: p.zvw.teBetalen,
    })),
  }
}
