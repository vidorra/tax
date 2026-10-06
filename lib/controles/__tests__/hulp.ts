/**
 * Ronde 2 (A3): bouwstenen voor de tests van de controles. Vaste id's (`persoon:A/onderneming:ond-1/…`), geen namen
 * van echte personen (Persoon A, Ontwerpstudio).
 */
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { BalansStand, HuishoudenInvoer, HuishoudenResultaat, OndernemingInvoer } from '@/lib/tax/types'
import { controleContext } from '../index'
import type { ControleContext } from '../types'
import type { DossierStatus } from '@/lib/dossier/status'
import type { AangifteStaat } from '@/lib/dossier/aangiftestaat'

export const VANDAAG = '2026-10-05'

export function onderneming(x: Partial<OndernemingInvoer> = {}): OndernemingInvoer {
  return {
    id: 'ond-1',
    naam: 'Ontwerpstudio',
    winstberekening: { soort: 'saldo', saldo: 35000 },
    uren: { onderneming: 0, urencriteriumGehaald: true },
    startjaar: 2015,
    ...x,
  }
}

export function invoer(jaar = 2025, x: Partial<HuishoudenInvoer> = {}): HuishoudenInvoer {
  return {
    jaar,
    personen: [
      {
        id: 'A',
        naam: 'Persoon A',
        geboortedatum: '1985-04-01',
        ondernemingen: [onderneming()],
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
    ...x,
  }
}

export function reken(i: HuishoudenInvoer): HuishoudenResultaat | null {
  try {
    return berekenHuishouden(i)
  } catch {
    return null
  }
}

export function ctx(
  i: HuishoudenInvoer,
  x: { status?: DossierStatus; staat?: AangifteStaat | null; vorig?: HuishoudenInvoer | null; resultaat?: HuishoudenResultaat | null; ingediend?: { op: string; gewijzigdNa: boolean } | null } = {},
): ControleContext {
  return controleContext({
    jaar: i.jaar,
    invoer: i,
    resultaat: x.resultaat === undefined ? reken(i) : x.resultaat,
    params: getJaar(i.jaar),
    status: x.status ?? 'concept',
    vandaag: VANDAAG,
    staat: x.staat ?? null,
    ingediend: x.ingediend ?? null,
    vorig: x.vorig ? { invoer: x.vorig } : null,
    rekenVorig: reken,
  })
}

/**
 * Balans met zeven posten per peildatum (vijf activa, twee schulden), zodat er veertien ingevulde posten zijn
 * (tolerantie 14). Ondernemingsvermogen begin 20.000, eind 25.000.
 */
export function balans14(): { begin: BalansStand; eind: BalansStand } {
  return {
    begin: { materieleVasteActiva: 5000, voorraden: 1000, handelsdebiteuren: 4000, overigeVorderingen: 1000, liquideMiddelen: 15000, crediteuren: 4000, omzetbelasting: 2000 },
    eind: { materieleVasteActiva: 6000, voorraden: 1000, handelsdebiteuren: 5000, overigeVorderingen: 1000, liquideMiddelen: 18000, crediteuren: 4000, omzetbelasting: 2000 },
  }
}

/** Een invoer met één onderneming met jaarrekening (KV1): kv = 25.000 − 20.000 + 30.000 = 35.000. */
export function metJaarrekening(saldo: number, b = balans14(), jaar = 2025): HuishoudenInvoer {
  const i = invoer(jaar)
  i.personen[0].ondernemingen = [
    onderneming({
      winstberekening: { soort: 'saldo', saldo },
      jaarrekening: { begin: b.begin, eind: b.eind, onttrekkingen: [{ omschrijving: 'Privé-opnamen', bedrag: 30000 }] },
    }),
  ]
  return i
}
