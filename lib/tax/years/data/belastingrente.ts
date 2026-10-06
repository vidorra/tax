/**
 * Percentages belastingrente voor de inkomstenbelasting (en sinds HR 16 januari 2026 ook gelijk voor de Vpb), als
 * periodetabel. Rente hoort bij de periode waarin ze loopt, niet bij het belastingjaar: een periode die twee
 * percentages raakt, wordt per deel berekend (lib/tax/modules/planning/belastingrente.ts, ronde 2 A2).
 *
 * Vaststelling (art. 30hb AWR en het besluit in Stb. 2023, 284): de laatste rente voor basisherfinancieringstransacties
 * van de ECB die vóór 1 november van het voorafgaande jaar is gepubliceerd, plus 3 procentpunt, afgerond op halve
 * procenten, minimaal 4,5% en hooguit 2 procentpunt verschil met het lopende percentage; ingang 1 januari. Controle met
 * eerdere jaren: september 2023 4,50% gaf 7,5% (2024), oktober 2024 3,40% gaf 6,5% (2025), juni 2025 2,15% gaf 5% (2026).
 *
 * Elke wijziging krijgt een regel in BELASTINGRENTE_CHANGELOG. Na 1 november 2026 en na de publicatie in december 2026
 * de periode vanaf 1-1-2027 nakijken.
 */
import type { BelastingrentePeriode, Bron, ChangelogRegel } from '../../types'

const OVERZICHT: Bron = {
  titel: 'Belastingdienst, Overzicht percentages belastingrente',
  url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/hoe_werkt_de_btw/belastingrente/overzicht-percentages-belastingrente',
  datum: '2026-10-05',
}

const SCHATTING_2027: Bron = {
  titel: 'Schatting 2027: ECB-persbericht 10-9-2026 (basisherfinancieringsrente 2,65% per 16-9-2026) + 3 punt, afgerond op halve procenten (SRA, "Lagere belastingrente IB en Vpb in 2026", november 2025)',
  datum: '2026-10-05',
}

export const BELASTINGRENTE_IB: readonly BelastingrentePeriode[] = [
  { vanaf: '2014-04-01', tot: '2020-05-31', pct: 0.04, status: 'definitief', bron: OVERZICHT },
  { vanaf: '2020-06-01', tot: '2020-09-30', pct: 0.0001, status: 'definitief', bron: OVERZICHT },
  { vanaf: '2020-10-01', tot: '2023-06-30', pct: 0.04, status: 'definitief', bron: OVERZICHT },
  { vanaf: '2023-07-01', tot: '2023-12-31', pct: 0.06, status: 'definitief', bron: OVERZICHT },
  { vanaf: '2024-01-01', tot: '2024-12-31', pct: 0.075, status: 'definitief', bron: OVERZICHT },
  { vanaf: '2025-01-01', tot: '2025-12-31', pct: 0.065, status: 'definitief', bron: OVERZICHT },
  { vanaf: '2026-01-01', tot: '2026-12-31', pct: 0.05, status: 'definitief', bron: OVERZICHT },
  { vanaf: '2027-01-01', tot: null, pct: 0.055, status: 'geschat', bron: SCHATTING_2027 },
]

export const BELASTINGRENTE_CHANGELOG: readonly ChangelogRegel[] = [
  {
    datum: '2026-10-05',
    wat: 'Periodetabel aangemaakt (ronde 2) met de percentages van 1-4-2014 tot en met 2026 uit het overzicht van de Belastingdienst; vanaf 1-1-2027 5,5% geschat (ECB 2,65% + 3 punt, afgerond op halve procenten), gelijk aan overig.belastingrenteIB 2027',
    bron: OVERZICHT,
  },
  {
    datum: '2026-10-05',
    wat: 'Ronde 2 (A2): de belastingpot, de planning en de verantwoording rekenen nu met deze tabel, per persoon en per periode (overig.belastingrenteIB leest niemand meer). Nakijken: de periode vanaf 1-1-2027 na 1 november 2026 (laatste ECB-rente vóór 1 november) en na de publicatie van de Belastingdienst in december 2026; daarna status definitief en deze regel bijwerken',
    bron: SCHATTING_2027,
  },
]
