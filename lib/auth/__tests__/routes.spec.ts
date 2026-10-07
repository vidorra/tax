/**
 * Beveiligingstests op de route handlers zelf: echte Request-objecten, een nagebootste
 * cookie-store (next/headers) en een gebruiker in het geheugen in plaats van de database.
 */
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'

type Opties = { httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; maxAge?: number }
const cookieStore = new Map<string, { value: string; opties: Opties }>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (naam: string) => (cookieStore.has(naam) ? { name: naam, value: cookieStore.get(naam)!.value } : undefined),
    set: (naam: string, value: string, opties: Opties) => {
      if (!value) cookieStore.delete(naam)
      else cookieStore.set(naam, { value, opties })
    },
  }),
}))

interface TestGebruiker {
  id: number
  email: string
  passwordHash: string
  totpSecret: string
  totpEnabled: boolean
  sessieGeneratie: number
  createdAt: Date
}
const gebruikers = new Map<number, TestGebruiker>()

vi.mock('@/lib/auth/gebruiker', () => ({
  normaliseerEmail: (e: unknown) => (typeof e === 'string' && e.includes('@') ? e.trim().toLowerCase() : null),
  gebruikerOpId: async (id: number) => gebruikers.get(id) ?? null,
  gebruikerOpEmail: async (email: string) => [...gebruikers.values()].find((u) => u.email === email) ?? null,
  setupAfgerond: async () => [...gebruikers.values()].some((u) => u.totpEnabled),
  verhoogSessieGeneratie: async (id: number) => {
    const u = gebruikers.get(id)
    if (u) u.sessieGeneratie += 1
  },
}))

vi.mock('@/lib/auth/wachtwoord', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/wachtwoord')>()),
  // bcrypt met 12 rondes is te traag voor tientallen pogingen in een test.
  controleerWachtwoord: async (w: string, h: string | null | undefined) => Boolean(h) && w === h,
}))

const verwijderAlles = vi.fn(async () => undefined)
vi.mock('@/lib/dossier/opslag', async (orig) => ({
  ...(await orig<typeof import('@/lib/dossier/opslag')>()),
  huishoudenVan: async (userId: number) => userId * 10,
  lijstJaren: async () => [],
  verwijderAlles: (...args: unknown[]) => (verwijderAlles as unknown as (...a: unknown[]) => Promise<void>)(...args),
}))

const { maakToken, SESSIE_COOKIE, TWEEFA_COOKIE } = await import('@/lib/auth/sessie')
const { totpCode } = await import('@/lib/auth/totp')
const { POST: login } = await import('@/app/api/auth/login/route')
const { POST: tweefa } = await import('@/app/api/auth/2fa/route')
const { POST: logout } = await import('@/app/api/auth/logout/route')
const { POST: verwijder } = await import('@/app/api/dossier/verwijder-alles/route')
const { GET: jarenGet } = await import('@/app/api/dossier/jaren/route')
const { POST: calc } = await import('@/app/api/calc/route')
const { clientIp, leesJson } = await import('@/lib/auth/api')

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const BASIS = 'https://ib.example.nl'
/** Deze tests gebruiken geen database; DATABASE_PATH wijst naar een schrijfbare plek die nooit wordt geopend. */
const GEEN_DB = join(tmpdir(), 'ib-test-geen-db', 'ibcalculator.db')

let envKopie: NodeJS.ProcessEnv
beforeEach(() => {
  envKopie = { ...process.env }
  process.env.DATABASE_PATH = GEEN_DB
  process.env.AUTH_SECRET = SECRET
  process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
  delete process.env.TRUSTED_PROXY_HOPS
  cookieStore.clear()
  gebruikers.clear()
  gebruikers.set(1, { id: 1, email: 'eigenaar@example.nl', passwordHash: 'juist-wachtwoord-123', totpSecret: TOTP_SECRET, totpEnabled: true, sessieGeneratie: 0, createdAt: new Date() })
  const g = globalThis as Record<string, unknown>
  delete g.__ibLoginLimiter
  delete g.__ibIpLimiter
  delete g.__ibAccountLimiter
  delete g.__ibTotpGebruikt
  verwijderAlles.mockClear()
})
afterEach(() => {
  process.env = envKopie
})

function post(pad: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASIS}${pad}`, { method: 'POST', headers: { 'content-type': 'application/json', host: 'ib.example.nl', ...headers }, body: JSON.stringify(body) })
}

describe('clientIp achter de CapRover-proxy', () => {
  it('neemt het adres dat de proxy heeft toegevoegd, niet wat de client zelf meestuurt', () => {
    const req = new Request(BASIS, { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } })
    expect(clientIp(req)).toBe('203.0.113.9')
    process.env.TRUSTED_PROXY_HOPS = '2'
    expect(clientIp(new Request(BASIS, { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 10.0.0.2' } }))).toBe('203.0.113.9')
  })

  it('een vervalste X-Forwarded-For omzeilt de inlog-limiet niet', async () => {
    const statussen: number[] = []
    for (let i = 0; i < 7; i++) {
      const res = await login(post('/api/auth/login/', { email: 'eigenaar@example.nl', wachtwoord: 'fout-wachtwoord-x' }, { 'x-forwarded-for': `10.9.${i}.1, 203.0.113.9` }))
      statussen.push(res.status)
    }
    expect(statussen.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statussen[5]).toBe(429)
  })
})

describe('brute force', () => {
  it('beperkt inlogpogingen per IP, ook met steeds een ander e-mailadres', async () => {
    let geblokkeerd = false
    for (let i = 0; i < 40 && !geblokkeerd; i++) {
      const res = await login(post('/api/auth/login/', { email: `iemand${i}@example.nl`, wachtwoord: 'fout-wachtwoord-x' }, { 'x-forwarded-for': '203.0.113.9' }))
      if (res.status === 429) geblokkeerd = true
    }
    expect(geblokkeerd).toBe(true)
  })

  it('beperkt 2FA-pogingen per account, ook vanaf steeds een ander IP', async () => {
    const statussen: number[] = []
    for (let i = 0; i < 15; i++) {
      cookieStore.set(TWEEFA_COOKIE, { value: await maakToken(1, '2fa'), opties: {} })
      const res = await tweefa(post('/api/auth/2fa/', { code: '000000' }, { 'x-forwarded-for': `198.51.100.${i}` }))
      statussen.push(res.status)
    }
    expect(statussen).toContain(429)
    expect(statussen.filter((s) => s === 401).length).toBeLessThanOrEqual(10)
  })

  it('een TOTP-code werkt maar één keer', async () => {
    const code = totpCode(TOTP_SECRET)
    cookieStore.set(TWEEFA_COOKIE, { value: await maakToken(1, '2fa'), opties: {} })
    expect((await tweefa(post('/api/auth/2fa/', { code }))).status).toBe(200)
    cookieStore.set(TWEEFA_COOKIE, { value: await maakToken(1, '2fa'), opties: {} })
    expect((await tweefa(post('/api/auth/2fa/', { code }))).status).toBe(401)
  })

  it('zonder geldige 2FA-cookie geen sessie, ook niet met een sessie- of setup-token', async () => {
    const code = totpCode(TOTP_SECRET)
    expect((await tweefa(post('/api/auth/2fa/', { code }))).status).toBe(401)
    cookieStore.set(TWEEFA_COOKIE, { value: await maakToken(1, 'setup'), opties: {} })
    expect((await tweefa(post('/api/auth/2fa/', { code }))).status).toBe(401)
    expect(cookieStore.has(SESSIE_COOKIE)).toBe(false)
  })
})

describe('sessies', () => {
  async function inloggen(): Promise<string> {
    expect((await login(post('/api/auth/login/', { email: 'eigenaar@example.nl', wachtwoord: 'juist-wachtwoord-123' }))).status).toBe(200)
    expect((await tweefa(post('/api/auth/2fa/', { code: totpCode(TOTP_SECRET) }))).status).toBe(200)
    return cookieStore.get(SESSIE_COOKIE)!.value
  }

  it('zet de sessiecookie met veilige vlaggen', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      await inloggen()
      const { opties } = cookieStore.get(SESSIE_COOKIE)!
      expect(opties).toMatchObject({ httpOnly: true, secure: true, path: '/', maxAge: 60 * 60 * 24 * 7 })
      expect(['lax', 'strict']).toContain(opties.sameSite)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('na uitloggen werkt een gekopieerd sessietoken niet meer', async () => {
    const token = await inloggen()
    expect((await jarenGet()).status).not.toBe(401)
    expect((await logout(post('/api/auth/logout/', {}))).status).toBe(200)
    cookieStore.set(SESSIE_COOKIE, { value: token, opties: {} })
    expect((await jarenGet()).status).toBe(401)
  })
})

describe('herkomst van wijzigende verzoeken (CSRF)', () => {
  it('weigert verwijder-alles vanaf een andere (sub)site', async () => {
    cookieStore.set(SESSIE_COOKIE, { value: await maakToken(1, 'sessie'), opties: {} })
    const zelfdeSite = await verwijder(post('/api/dossier/verwijder-alles/', { bevestiging: 'VERWIJDER' }, { 'sec-fetch-site': 'same-site', origin: 'https://andere-app.example.nl' }))
    expect(zelfdeSite.status).toBe(403)
    const anderOrigin = await verwijder(post('/api/dossier/verwijder-alles/', { bevestiging: 'VERWIJDER' }, { origin: 'https://evil.example' }))
    expect(anderOrigin.status).toBe(403)
    expect(verwijderAlles).not.toHaveBeenCalled()
    const eigen = await verwijder(post('/api/dossier/verwijder-alles/', { bevestiging: 'VERWIJDER' }, { 'sec-fetch-site': 'same-origin', origin: BASIS }))
    expect(eigen.status).toBe(200)
    expect(verwijderAlles).toHaveBeenCalledWith(1, false)
  })

  it('weigert een inlogpoging vanaf een andere site', async () => {
    const res = await login(post('/api/auth/login/', { email: 'eigenaar@example.nl', wachtwoord: 'juist-wachtwoord-123' }, { 'sec-fetch-site': 'cross-site' }))
    expect(res.status).toBe(403)
    expect(cookieStore.has(TWEEFA_COOKIE)).toBe(false)
  })
})

describe('body-limieten', () => {
  function stroom(totaal: number, blok = 64 * 1024): { req: Request; gelezen: () => number } {
    let verstuurd = 0
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (verstuurd >= totaal) return c.close()
        verstuurd += blok
        c.enqueue(new Uint8Array(blok).fill(0x20))
      },
    })
    const req = new Request(`${BASIS}/api/x`, { method: 'POST', body, duplex: 'half' } as RequestInit)
    return { req, gelezen: () => verstuurd }
  }

  it('leest een body zonder Content-Length niet verder dan de limiet', async () => {
    const { req, gelezen } = stroom(50 * 1024 * 1024)
    expect(await leesJson(req, 10_000)).toBeNull()
    expect(gelezen()).toBeLessThan(1024 * 1024)
  })

  it('telt bytes, niet tekens', async () => {
    const tekst = JSON.stringify({ t: '€'.repeat(4000) })
    const req = new Request(`${BASIS}/api/x`, { method: 'POST', body: tekst })
    expect(await leesJson(req, 10_000)).toBeNull()
  })

  it('/api/calc weigert een gestreamde body boven 100 KB', async () => {
    const { req, gelezen } = stroom(50 * 1024 * 1024)
    const res = await calc(req)
    expect(res.status).toBe(413)
    expect(gelezen()).toBeLessThan(1024 * 1024)
  })
})

describe('/api/calc tegen zware invoer', () => {
  it('weigert honderden kinderen snel in plaats van seconden te rekenen', async () => {
    const invoer = JSON.parse(JSON.stringify(voorbeeldInvoer(2024)))
    invoer.verdeling = 'optimaal'
    invoer.kinderen = Array.from({ length: 600 }, (_, i) => ({ id: `k${i}`, geboortedatum: '2020-01-01', opvang: [{ soort: 'dagopvang', urenPerMaand: 100, uurtarief: 9, maanden: 12 }] }))
    const t = Date.now()
    const res = await calc(post('/api/calc/', invoer, { 'x-forwarded-for': '203.0.113.50' }))
    expect(res.status).toBe(400)
    expect(Date.now() - t).toBeLessThan(1000)
    const body = (await res.json()) as { fouten: string[] }
    expect(body.fouten.join(' ')).toMatch(/kinderen/)
  })

  it('weigert __proto__-sleutels en absurde bedragen', async () => {
    const tekst = JSON.stringify(voorbeeldInvoer(2024)).replace('{', '{"__proto__":{"vervuild":true},')
    const res = await calc(new Request(`${BASIS}/api/calc/`, { method: 'POST', body: tekst, headers: { 'x-forwarded-for': '203.0.113.51' } }))
    expect(res.status).toBe(400)
    expect(({} as Record<string, unknown>).vervuild).toBeUndefined()
    const groot = JSON.parse(JSON.stringify(voorbeeldInvoer(2024)))
    groot.personen[0].ondernemingen[0].winstberekening = { soort: 'saldo', saldo: 1e308 }
    expect((await calc(post('/api/calc/', groot, { 'x-forwarded-for': '203.0.113.52' }))).status).toBe(400)
  })

  it('de voorbeeldinvoer 2024 rekent nog gewoon', async () => {
    const res = await calc(post('/api/calc/', voorbeeldInvoer(2024), { 'x-forwarded-for': '203.0.113.53' }))
    expect(res.status).toBe(200)
  })
})

describe('foutmeldingen van /api/calc', () => {
  it('geeft geen interne foutmelding van de engine door', async () => {
    const invoer = JSON.parse(JSON.stringify(voorbeeldInvoer(2024)))
    invoer.personen[0].ondernemingen[0].investeringen = [null]
    const res = await calc(post('/api/calc/', invoer, { 'x-forwarded-for': '203.0.113.54' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { fout: string }
    expect(body.fout).not.toMatch(/Cannot read|undefined|null|at /)
  })
})
