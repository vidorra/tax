/**
 * Ronde 2 (A4): de JSON-export van één jaar (ExportPagina, "Download JSON"), nu met de aangiftestaat (vinkjes,
 * VIA-bedragen, genegeerde controles) en de bedragen van de accountant, zodat de JSON-import ze terug kan zetten.
 *
 * De aangiftestaat komt uit de provider als die er is (na de integratie: `useAangifteStaatOptioneel()?.staat`), anders
 * haalt de klik hem op bij de server. Lukt dat niet, dan komt het bestand er toch, zonder de staat en met een melding.
 */
import type { HuishoudenInvoer, HuishoudenResultaat } from '@/lib/tax/types'
import type { AccountantRegels } from '@/lib/dossier/accountant'
import type { AangifteStaat } from '@/lib/dossier/aangiftestaat'
import type { DossierStatus } from '@/lib/dossier/status'
import { samenvatting } from '@/lib/dossier/samenvatting'
import { aangifteStaatApi } from '../api'
import { download } from '../pdf'

export interface JaarExportBron {
  jaar: number
  variant: string | null
  status: DossierStatus
  vandaag: string
  invoer: HuishoudenInvoer
  resultaat: HuishoudenResultaat
  accountant: AccountantRegels | null
}

/** Het bestand zoals de JSON-import het leest (formaat `ibcalculator-jaar`, versie 1). */
export function jaarExportData(b: JaarExportBron, aangiftestaat: AangifteStaat | null) {
  return {
    formaat: 'ibcalculator-jaar' as const,
    versie: 1,
    jaar: b.jaar,
    variant: b.variant,
    status: b.status,
    geexporteerd: b.vandaag,
    invoer: b.invoer,
    samenvatting: samenvatting(b.resultaat),
    accountant: b.accountant,
    aangiftestaat,
  }
}

/**
 * Start de download en geeft meteen true terug (de staat ophalen gaat op de achtergrond), zodat de aanroeper in een
 * gewone klikfunctie kan stoppen: `if (startJaarExport(…)) return`.
 */
export function startJaarExport(b: JaarExportBron & { staat?: AangifteStaat | null; onFout?: (melding: string) => void }): true {
  void (async () => {
    let staat = b.staat ?? null
    let gemist = false
    if (b.staat === undefined) {
      const r = await aangifteStaatApi.laad(b.jaar)
      if (r.ok && r.data) staat = r.data.staat
      else gemist = r.status !== 404
    }
    const data = jaarExportData(b, staat)
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `inkomstenbelasting-${b.jaar}.json`)
    if (gemist) b.onFout?.('Het JSON-bestand is gedownload, maar zonder de vinkjes en vooraf ingevulde bedragen: die konden niet worden geladen. Probeer het opnieuw als je ze mee wilt nemen.')
  })()
  return true
}
