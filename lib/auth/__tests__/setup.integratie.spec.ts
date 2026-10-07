/**
 * De installatie claimen via de routes, op een echt SQLite-bestand per test (lib/db/testdb.ts): wie als eerste 2FA
 * bevestigt, claimt de instantie. Een tweede installatie die nog niet is bevestigd, vervangt de eerste; het setup-token
 * van de vervangen installatie werkt daarna niet meer (AUTOINCREMENT: het id komt nooit terug). Na het claimen is setup
 * dicht.
 */
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'

type Opties = { httpOnly?: boolean; path?: string; maxAge?: number }
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

const { SESSIE_COOKIE, SETUP_COOKIE } = await import('@/lib/auth/sessie')
const { totpCode } = await import('@/lib/auth/totp')
const { POST: setup } = await import('@/app/api/auth/setup/route')
const { POST: bevestig } = await import('@/app/api/auth/setup/bevestig/route')

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'

function post(pad: string, body: unknown, ip: string): Request {
  return new Request(`https://ib.example.nl${pad}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'ib.example.nl', 'sec-fetch-site': 'same-origin', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

let envKopie: NodeJS.ProcessEnv
beforeEach(() => {
  envKopie = { ...process.env }
  process.env.AUTH_SECRET = SECRET
  process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
  cookieStore.clear()
  const g = globalThis as Record<string, unknown>
  delete g.__ibLoginLimiter
  delete g.__ibTotpGebruikt
})
afterEach(() => {
  process.env = envKopie
})

describe('installatie claimen', () => {
  gebruikTijdelijkeDb()

  it('een niet bevestigde installatie wordt vervangen; wie bevestigt, claimt de instantie en daarna is setup dicht', async () => {
    const a = await setup(post('/api/auth/setup/', { email: 'een@example.nl', wachtwoord: 'een-lang-wachtwoord-1' }, '203.0.113.1'))
    expect(a.status).toBe(200)
    const secretA = (await a.json()).secret as string
    const cookieA = cookieStore.get(SETUP_COOKIE)!
    cookieStore.clear()

    const b = await setup(post('/api/auth/setup/', { email: 'twee@example.nl', wachtwoord: 'een-lang-wachtwoord-2' }, '203.0.113.2'))
    expect(b.status).toBe(200)
    const secretB = (await b.json()).secret as string
    const cookieB = cookieStore.get(SETUP_COOKIE)!
    expect(getDb().select({ email: users.email }).from(users).all()).toEqual([{ email: 'twee@example.nl' }])

    // Het setup-token van de vervangen installatie werkt niet meer, ook niet met een geldige code.
    cookieStore.clear()
    cookieStore.set(SETUP_COOKIE, cookieA)
    const oud = await bevestig(post('/api/auth/setup/bevestig/', { code: totpCode(secretA) }, '203.0.113.1'))
    expect(oud.status).toBe(401)
    expect((await oud.json()).fout).toMatch(/verlopen/)

    cookieStore.clear()
    cookieStore.set(SETUP_COOKIE, cookieB)
    const ok = await bevestig(post('/api/auth/setup/bevestig/', { code: totpCode(secretB) }, '203.0.113.2'))
    expect(ok.status).toBe(200)
    expect(cookieStore.has(SESSIE_COOKIE)).toBe(true)
    expect(getDb().select({ email: users.email, totpEnabled: users.totpEnabled }).from(users).all()).toEqual([{ email: 'twee@example.nl', totpEnabled: true }])

    // Setup is dicht, ook voor een nieuwe poging met het oude token.
    const derde = await setup(post('/api/auth/setup/', { email: 'drie@example.nl', wachtwoord: 'een-lang-wachtwoord-3' }, '203.0.113.3'))
    expect(derde.status).toBe(403)
    cookieStore.set(SETUP_COOKIE, cookieA)
    expect((await bevestig(post('/api/auth/setup/bevestig/', { code: totpCode(secretA) }, '203.0.113.1'))).status).toBe(401)
    expect(getDb().select().from(users).all()).toHaveLength(1)
  })
})
