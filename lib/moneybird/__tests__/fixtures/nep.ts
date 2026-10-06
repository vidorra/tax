/**
 * Nagebootste Moneybird API voor tests: beantwoordt de endpoints die de koppeling gebruikt met de
 * synthetische fixtures in deze map. Geen echte gegevens.
 *
 * De administratie 'Studio Voorbeeld' over 2025: winst- en verliesrekening met RGS-codes (netto winst
 * 94.679,40, met een wijziging onderhanden werk), een balans per 31-12-2024 en 31-12-2025 die sluit
 * (vaste activa, onderhanden werk, debiteuren, overige vorderingen, btw aan beide kanten, bank met een
 * spaarrekening als onderliggende rekening, een kas en een lening zonder RGS-code, oudedagsreserve en
 * vier privérekeningen) en een kapitaalsvergelijking die op de winst sluit:
 *   106.698 − 86.140 + (45.000,60 + 25.620,80 + 6.000) − 2.500 = 94.679,40.
 */
import administraties from './administrations.json'
import activa from './assets.json'
import balans2024 from './balance_sheet_2024.json'
import balans2025 from './balance_sheet_2025.json'
import contacten from './contacts.json'
import grootboek from './ledger_accounts.json'
import winstVerlies from './profit_loss_2025.json'
import omzetContact from './revenue_by_contact_2025.json'
import uren from './time_entries_2025.json'

export const NEP_TOKEN = 'nep-token-0000000000000000000000000000abcd'
export const NEP_ADM = '100000000000000001'

export interface NepOpties {
  token?: string
  /** Statuscode per endpoint (deel van het pad, bijv. 'time_entries': 403). */
  weiger?: Record<string, number>
  /** Eigen antwoord voor een endpoint (pad na de administratie, bijv. '/reports/balance_sheet.json') en periode; undefined = de fixture. */
  vervang?: (pad: string, periode: string) => unknown
}

export interface Nep {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  verzoeken: string[]
}

const jsonRes = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })

function pagina<T>(lijst: T[], url: URL): T[] {
  const p = Number(url.searchParams.get('page') ?? '1')
  const n = Number(url.searchParams.get('per_page') ?? '50')
  return lijst.slice((p - 1) * n, p * n)
}

export function nepMoneybird(opties: NepOpties = {}): Nep {
  const token = opties.token ?? NEP_TOKEN
  const verzoeken: string[] = []
  const f = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input)
    verzoeken.push(`${url.pathname.replace('/api/v2', '')}${url.search}`)
    const auth = new Headers(init?.headers).get('authorization')
    if (auth !== `Bearer ${token}`) return jsonRes({ error: 'Unauthorized' }, 401)
    const pad = url.pathname.replace('/api/v2', '')
    for (const [deel, status] of Object.entries(opties.weiger ?? {})) if (pad.includes(deel)) return jsonRes({ error: 'nee' }, status)
    if (pad === '/administrations.json') return jsonRes(administraties)
    const m = /^\/(\d+)(\/.*)$/.exec(pad)
    if (!m || m[1] !== NEP_ADM) return jsonRes({ error: 'Not found' }, 404)
    const rest = m[2]
    const periode = url.searchParams.get('period') ?? ''
    const eigen = opties.vervang?.(rest, periode)
    if (eigen !== undefined) return jsonRes(eigen)
    if (rest === '/ledger_accounts.json') return jsonRes(grootboek)
    if (rest === '/reports/profit_loss.json') return jsonRes(winstVerlies)
    if (rest === '/reports/balance_sheet.json') return jsonRes(periode.endsWith('20241231') ? balans2024 : balans2025)
    if (rest === '/reports/revenue_by_contact.json') return jsonRes(pagina(omzetContact, url))
    if (rest === '/assets.json') return jsonRes(pagina(activa, url))
    if (rest === '/time_entries.json') return jsonRes(pagina(uren, url))
    const c = /^\/contacts\/(\d+)\.json$/.exec(rest)
    if (c) {
      const contact = (contacten as Record<string, unknown>)[c[1]]
      return contact ? jsonRes(contact) : jsonRes({ error: 'Not found' }, 404)
    }
    return jsonRes({ error: 'Not found' }, 404)
  }
  return { fetch: f, verzoeken }
}
