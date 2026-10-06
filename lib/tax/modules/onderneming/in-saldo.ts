/**
 * Ronde 2 (contract): standaardantwoorden op de vraag "zit dit al in het saldo?" per regeling, uit één vraag per
 * onderneming: waar komt de winst vandaan (`OndernemingInvoer.winstBron`). Een expliciet antwoord bij de regeling gaat
 * altijd voor. De UI toont bij elke regeling wat er uit deze standaard volgt.
 *
 * | Vraag                                         | boekhouding | fiscaal rapport |
 * |-----------------------------------------------|-------------|-----------------|
 * | herinvesteringsreserve: dotatie en vrijval    | nee         | ja              |
 * | kostenegalisatiereserve: dotatie, onttrekking | nee         | ja              |
 * | btw-correctie privégebruik auto               | ja          | ja              |
 * | vergoeding aan de meewerkende partner         | ja          | ja              |
 * | vergoeding voor terbeschikkingstelling        | ja          | ja              |
 * | stakingspost (verkoop, boekwinst)             | ja          | ja              |
 * | stakingspost naar privé (waarde in het e.v.)  | nee         | ja              |
 *
 * Waarom: in een boekhouding (Moneybird) staan de boekwinst op een verkoop, de btw-correctie (via de btw-aangifte) en
 * betaalde vergoedingen wel, maar geen fiscale reserves en geen onttrekking tegen de waarde in het economisch verkeer.
 * Een fiscaal rapport van een accountant heeft alles al verwerkt.
 */
import type { OndernemingInvoer } from '../../types'

export type InSaldoVraag = 'hir' | 'egalisatie' | 'autoBtw' | 'partner' | 'tbs' | 'stakingPost' | 'stakingPostPrive'

const STANDAARD: Record<NonNullable<OndernemingInvoer['winstBron']>, Record<InSaldoVraag, boolean>> = {
  boekhouding: { hir: false, egalisatie: false, autoBtw: true, partner: true, tbs: true, stakingPost: true, stakingPostPrive: false },
  'fiscaal-rapport': { hir: true, egalisatie: true, autoBtw: true, partner: true, tbs: true, stakingPost: true, stakingPostPrive: true },
}

/** De standaard voor deze onderneming (zonder `winstBron`: boekhouding). */
export function standaardInSaldo(o: Pick<OndernemingInvoer, 'winstBron'> | undefined, vraag: InSaldoVraag): boolean {
  return STANDAARD[o?.winstBron ?? 'boekhouding'][vraag]
}

/** Het antwoord: het expliciete antwoord bij de regeling, anders de standaard van de onderneming. */
export function zitInSaldo(expliciet: boolean | undefined, o: Pick<OndernemingInvoer, 'winstBron'> | undefined, vraag: InSaldoVraag): boolean {
  return expliciet ?? standaardInSaldo(o, vraag)
}
