import { describe, expect, it, vi } from 'vitest'
import { leesRetryAfter, maakClient, maskeer, mbGet, mbLijst, MB_MAX_PAGINAS, MoneybirdFout, parseOmzetContact, scopeVoor } from '../client'
import { NEP_ADM, NEP_TOKEN, nepMoneybird } from './fixtures/nep'

const TOKEN = 'geheim-token-1234567890abcdefXYZ9'
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })
const geenWacht = { wacht: async () => undefined }

async function fout(p: Promise<unknown>): Promise<MoneybirdFout> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(MoneybirdFout)
    return e as MoneybirdFout
  }
  throw new Error('verwachtte een MoneybirdFout')
}

describe('mbGet', () => {
  it('stuurt Bearer-token en Accept JSON naar de v2-API', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json([{ id: '1' }]))
    await mbGet(TOKEN, '/administrations.json', { a: 1, b: undefined }, { fetch: f })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://moneybird.com/api/v2/administrations.json?a=1')
    const h = new Headers(init?.headers)
    expect(h.get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(h.get('accept')).toBe('application/json')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('probeert één keer opnieuw na 429 en wacht Retry-After', async () => {
    const wacht = vi.fn(async () => undefined)
    const f = vi.fn().mockResolvedValueOnce(json({}, 429, { 'retry-after': '7' })).mockResolvedValueOnce(json({ ok: true }))
    expect(await mbGet(TOKEN, '/administrations.json', undefined, { fetch: f, wacht })).toEqual({ ok: true })
    expect(wacht).toHaveBeenCalledWith(7000)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('geeft op bij een Retry-After boven 30 seconden en bij een tweede 429', async () => {
    const lang = vi.fn().mockResolvedValue(json({}, 429, { 'retry-after': '120' }))
    const e1 = await fout(mbGet(TOKEN, '/administrations.json', undefined, { fetch: lang, ...geenWacht }))
    expect(e1.status).toBe(429)
    expect(e1.melding).toMatch(/Te veel verzoeken/)
    expect(lang).toHaveBeenCalledTimes(1)
    const tweeKeer = vi.fn().mockResolvedValue(json({}, 429, { 'retry-after': '1' }))
    expect((await fout(mbGet(TOKEN, '/administrations.json', undefined, { fetch: tweeKeer, ...geenWacht }))).status).toBe(429)
    expect(tweeKeer).toHaveBeenCalledTimes(2)
  })

  it('probeert één keer opnieuw na een netwerkfout', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(json([]))
    expect(await mbGet(TOKEN, '/administrations.json', undefined, { fetch: f })).toEqual([])
    const steeds = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const e = await fout(mbGet(TOKEN, '/administrations.json', undefined, { fetch: steeds }))
    expect(e.status).toBe(0)
    expect(e.melding).toMatch(/niet bereikbaar/)
    expect(steeds).toHaveBeenCalledTimes(2)
  })

  it('breekt af na de time-out', async () => {
    const hangt = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    const e = await fout(mbGet(TOKEN, '/administrations.json', undefined, { fetch: hangt, timeoutMs: 10 }))
    expect(e.melding).toMatch(/niet binnen/)
  })

  it('vertaalt statuscodes naar Nederlandse meldingen, met de scope bij 403', async () => {
    const met = (status: number) => vi.fn().mockResolvedValue(json({ error: 'x' }, status))
    expect((await fout(mbGet(TOKEN, '/administrations.json', undefined, { fetch: met(401) }))).melding).toMatch(/ongeldig of ingetrokken/)
    const e403 = await fout(mbGet(TOKEN, `/${NEP_ADM}/time_entries.json`, undefined, { fetch: met(403) }))
    expect(e403.melding).toMatch(/scope time_entries/)
    expect(e403.scope).toBe('time_entries')
    expect((await fout(mbGet(TOKEN, `/${NEP_ADM}/reports/balance_sheet.json`, undefined, { fetch: met(403) }))).melding).toMatch(/scope bank/)
    expect((await fout(mbGet(TOKEN, '/1/assets.json', undefined, { fetch: met(404) }))).melding).toMatch(/niet/)
    const e503 = await fout(mbGet(TOKEN, '/administrations.json', undefined, { fetch: met(503) }))
    expect(e503.status).toBe(503)
    expect(e503.melding).toMatch(/niet bereikbaar/)
  })

  it('zet het token nooit in een foutmelding', async () => {
    for (const status of [400, 401, 403, 404, 429, 500]) {
      const e = await fout(mbGet(TOKEN, `/${NEP_ADM}/assets.json`, undefined, { fetch: vi.fn().mockResolvedValue(json({ echo: TOKEN }, status)), ...geenWacht }))
      expect(e.message).not.toContain(TOKEN)
      expect(e.melding).not.toContain(TOKEN)
      expect(JSON.stringify(e)).not.toContain(TOKEN)
      expect(String(e.stack)).not.toContain(TOKEN)
    }
    const net = await fout(mbGet(TOKEN, '/administrations.json', undefined, { fetch: vi.fn().mockRejectedValue(new Error(`kapot ${TOKEN}`)) }))
    expect(net.message).not.toContain(TOKEN)
  })

  it('weigert vreemde paden en een leeg token zonder verzoek', async () => {
    const f = vi.fn()
    expect((await fout(mbGet(TOKEN, '/../x', undefined, { fetch: f }))).status).toBe(400)
    expect((await fout(mbGet('  ', '/administrations.json', undefined, { fetch: f }))).status).toBe(401)
    expect(f).not.toHaveBeenCalled()
  })

  it('onleesbare JSON wordt een duidelijke fout', async () => {
    const f = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))
    expect((await fout(mbGet(TOKEN, '/administrations.json', undefined, { fetch: f }))).melding).toMatch(/onleesbaar/)
  })
})

describe('mbLijst', () => {
  it('pagineert met per_page 100 en stopt bij een korte pagina', async () => {
    const f = vi.fn(async (url: string) => {
      const p = Number(new URL(url).searchParams.get('page'))
      return json(Array.from({ length: p < 3 ? 100 : 7 }, (_, i) => ({ i })))
    })
    const r = await mbLijst(TOKEN, '/1/assets.json', {}, { fetch: f })
    expect(r.items).toHaveLength(207)
    expect(r.afgekapt).toBe(false)
    expect(f).toHaveBeenCalledTimes(3)
    expect(new URL(f.mock.calls[0][0]).searchParams.get('per_page')).toBe('100')
  })

  it('stopt na de harde grens van 50 pagina’s', async () => {
    const f = vi.fn(async () => json(Array.from({ length: 100 }, () => ({}))))
    const r = await mbLijst(TOKEN, '/1/assets.json', {}, { fetch: f })
    expect(f).toHaveBeenCalledTimes(MB_MAX_PAGINAS)
    expect(r.afgekapt).toBe(true)
  })
})

describe('maakClient tegen de nagebootste API', () => {
  it('administraties, grootboek, uren (3 pagina’s) en contactnamen met cache', async () => {
    const nep = nepMoneybird()
    const c = maakClient(NEP_TOKEN, NEP_ADM, { fetch: nep.fetch })
    expect(await c.administraties()).toEqual([
      { id: '100000000000000001', naam: 'Studio Voorbeeld', valuta: 'EUR', land: 'NL' },
      { id: '100000000000000002', naam: 'Verhuur Voorbeeld', valuta: 'EUR', land: 'NL' },
    ])
    const gb = await c.grootboekrekeningen()
    expect(gb.find((r) => r.id === '602')?.taxonomy_item?.code).toBe('WBedVkkRep')
    const uren = await c.uren('2025-01-01', '2025-12-31')
    expect(uren).toHaveLength(281)
    expect(nep.verzoeken.filter((v) => v.includes('time_entries'))).toHaveLength(3)
    expect(nep.verzoeken.find((v) => v.includes('time_entries'))).toContain('filter=period%3A20250101..20251231%2Cstate%3Aall')
    expect(await c.contactNaam('12')).toBe('Sanne de Vries')
    expect(await c.contactNaam('12')).toBe('Sanne de Vries')
    expect(nep.verzoeken.filter((v) => v.includes('/contacts/12'))).toHaveLength(1)
    expect(await c.contactNaam('../x')).toBeNull()
  })

  it('zonder geldige administratie geen verzoek', async () => {
    const nep = nepMoneybird()
    await expect(maakClient(NEP_TOKEN, 'abc', { fetch: nep.fetch }).activa()).rejects.toBeInstanceOf(MoneybirdFout)
    expect(nep.verzoeken).toHaveLength(0)
  })
})

describe('hulpjes', () => {
  it('Retry-After als seconden of datum', () => {
    expect(leesRetryAfter('12')).toBe(12)
    expect(leesRetryAfter(new Date(Date.UTC(2026, 0, 1, 0, 0, 20)).toUTCString(), Date.UTC(2026, 0, 1))).toBe(20)
    expect(leesRetryAfter('onzin')).toBeNull()
    expect(leesRetryAfter(null)).toBeNull()
  })
  it('scope per endpoint', () => {
    expect(scopeVoor('/1/ledger_accounts.json')).toBe('settings')
    expect(scopeVoor('/1/reports/profit_loss.json')).toBe('sales_invoices of documents')
    expect(scopeVoor('/1/assets.json')).toBe('documents')
  })
  it('masker toont alleen de laatste vier tekens', () => {
    expect(maskeer(TOKEN)).toBe('••••••XYZ9')
    expect(maskeer('kort')).toBe('••••••')
  })
  it('omzet per contact in verschillende vormen', () => {
    expect(parseOmzetContact({ contact_id: 5, total_price_excl_tax: '10.5' })).toEqual({ contactId: '5', naam: null, bedrag: 10.5 })
    expect(parseOmzetContact({ contact: { id: '6', firstname: 'A', lastname: 'B' }, revenue: '3' })).toEqual({ contactId: '6', naam: 'A B', bedrag: 3 })
    expect(parseOmzetContact({ contact_id: '7' })).toBeNull()
  })
})

describe('mbBasis', () => {
  it('alleen een nep-Moneybird op localhost mag de basis verleggen', async () => {
    const { mbBasis, MB_BASIS } = await import('../client')
    expect(mbBasis({})).toBe(MB_BASIS)
    expect(mbBasis({ MONEYBIRD_API_BASE: 'http://127.0.0.1:4555/api/v2' })).toBe('http://127.0.0.1:4555/api/v2')
    expect(mbBasis({ MONEYBIRD_API_BASE: 'http://localhost:4555/api/v2' })).toBe('http://localhost:4555/api/v2')
    expect(mbBasis({ MONEYBIRD_API_BASE: 'https://evil.example/api/v2' })).toBe(MB_BASIS)
    expect(mbBasis({ MONEYBIRD_API_BASE: 'http://127.0.0.1.evil.example/api/v2' })).toBe(MB_BASIS)
    expect(mbBasis({ MONEYBIRD_API_BASE: 'http://169.254.169.254/api/v2' })).toBe(MB_BASIS)
  })
})
