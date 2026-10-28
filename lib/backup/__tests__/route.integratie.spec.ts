/**
 * API-route /api/dossier/backup (GET status, POST nu mailen).
 *
 * - Zonder database: sessie (401), herkomst (403), dossier niet ingericht (503) en back-up niet ingericht (503 met
 *   ontbreekt).
 * - Op een tijdelijke SQLite-database: status, mailen via een nep-Resend, 409 als er een loopt en 429 met
 *   Retry-After na drie per uur. Het volledige adres komt in geen enkele response voor.
 */
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, getSqlite } from '@/lib/db'
import { backups } from '@/lib/db/schema'
import { gebruikTijdelijkeDb } from '@/lib/db/testdb'

import { nepResend, ONTVANGER, RESEND_SLEUTEL, vulDatabase, zetBackupEnv } from './hulp'

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

const gebruikers = new Map<number, { id: number; email: string; passwordHash: string; totpSecret: string; totpEnabled: boolean; sessieGeneratie: number; createdAt: Date; rol: 'beheerder' | 'gebruiker'; naam: string | null }>()
vi.mock('@/lib/auth/gebruiker', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/gebruiker')>()),
  gebruikerOpId: async (id: number) => gebruikers.get(id) ?? null,
}))

vi.mock('@/lib/dossier/opslag', async (orig) => ({
  ...(await orig<typeof import('@/lib/dossier/opslag')>()),
  huishoudenVan: (userId: number) => Promise.resolve(userId * 10),
}))

const { maakToken, SESSIE_COOKIE } = await import('@/lib/auth/sessie')
const { zetResendFetch } = await import('@/lib/mail')
const route = await import('@/app/api/dossier/backup/route')

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'

function verzoek(methode: string, headers: Record<string, string> = {}): Request {
  return new Request('https://ib.example.nl/api/dossier/backup/', {
    method: methode,
    headers: { host: 'ib.example.nl', 'sec-fetch-site': 'same-origin', ...headers },
  })
}

async function inloggen(userId: number, rol: 'beheerder' | 'gebruiker' = 'beheerder') {
  gebruikers.set(userId, { id: userId, email: `u${userId}@example.nl`, passwordHash: 'x', totpSecret: '', totpEnabled: true, sessieGeneratie: 0, createdAt: new Date(), rol, naam: null })
  cookieStore.set(SESSIE_COOKIE, { value: await maakToken(userId, 'sessie'), opties: {} })
}

async function lees(res: Response): Promise<{ status: number; tekst: string; data: Record<string, unknown> }> {
  const tekst = await res.text()
  return { status: res.status, tekst, data: JSON.parse(tekst) }
}

let envKopie: NodeJS.ProcessEnv
beforeEach(() => {
  envKopie = { ...process.env }
  zetBackupEnv(randomBytes(32).toString('base64'))
  process.env.AUTH_SECRET = SECRET
  cookieStore.clear()
  gebruikers.clear()
})
afterEach(() => {
  process.env = envKopie
  zetResendFetch(null)
})

describe('controles vóór de back-up', () => {
  it('zonder sessie 401, van een andere site 403', async () => {
    expect((await route.GET(verzoek('GET'))).status).toBe(401)
    expect((await route.POST(verzoek('POST'))).status).toBe(401)
    await inloggen(1)
    expect((await route.POST(verzoek('POST', { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect((await route.POST(verzoek('POST', { 'sec-fetch-site': 'same-site' }))).status).toBe(403)
  })

  it('een gewone gebruiker krijgt 403: een back-up bevat alle accounts', async () => {
    await inloggen(2, 'gebruiker')
    expect((await route.GET(verzoek('GET'))).status).toBe(403)
    expect((await route.POST(verzoek('POST'))).status).toBe(403)
  })

  it('dossier niet ingericht: 503', async () => {
    delete process.env.AUTH_SECRET
    const r = await lees(await route.POST(verzoek('POST')))
    expect(r.status).toBe(503)
    expect(r.data.ontbreekt).toEqual(['AUTH_SECRET'])
  })

  it('back-up niet ingericht: 503 met de ontbrekende variabelen, zonder database of mail', async () => {
    const nep = nepResend()
    delete process.env.BACKUP_MAIL_TO
    delete process.env.RESEND_API_KEY
    await inloggen(1)
    const r = await lees(await route.POST(verzoek('POST')))
    expect(r.status).toBe(503)
    expect(r.data).toMatchObject({ fout: expect.stringContaining('niet ingericht'), ontbreekt: ['BACKUP_MAIL_TO', 'RESEND_API_KEY of SMTP_HOST, SMTP_USER en SMTP_PASS'] })
    expect(nep.verzoeken).toHaveLength(0)
  })
})

describe('route op een echte database', () => {
  gebruikTijdelijkeDb()
  let sleutel = ''

  beforeEach(() => {
    sleutel = randomBytes(32).toString('base64')
    zetBackupEnv(sleutel)
    process.env.AUTH_SECRET = SECRET
    vulDatabase()
  })

  it('GET status, POST mailt, daarna 409 als er een loopt en 429 na drie per uur', async () => {
    const nep = nepResend()
    await inloggen(1)
    const teksten: string[] = []

    const voor = await lees(await route.GET(verzoek('GET')))
    teksten.push(voor.tekst)
    expect(voor.status).toBe(200)
    expect(voor.data).toMatchObject({ geconfigureerd: true, ontbreekt: [], ontvanger: 'b•••@example.nl', momenten: ['02-01', '08-01'], laatste: null, laatsteGeslaagd: null })
    expect(voor.data.volgende).toMatch(/^\d{4}-(02|08)-01$/)

    const gemaild = await lees(await route.POST(verzoek('POST')))
    teksten.push(gemaild.tekst)
    expect(gemaild.status).toBe(200)
    expect(gemaild.data.resultaat).toMatchObject({ status: 'verstuurd', bestandsnaam: expect.stringMatching(/\.ibcbak$/), bytes: expect.any(Number) })
    expect(gemaild.data.resultaat).not.toHaveProperty('sha256')
    expect(gemaild.data.backup).toMatchObject({ laatste: { soort: 'handmatig', status: 'verstuurd' }, laatsteGeslaagd: { soort: 'handmatig' } })
    expect(nep.verzoeken).toHaveLength(1)
    expect(nep.verzoeken[0].body.to).toEqual([ONTVANGER])

    // Een mislukte mail is ook een 200, met de reden.
    nep.zetAntwoord(() => new Response(`ongeldige sleutel ${RESEND_SLEUTEL} voor ${ONTVANGER}`, { status: 401 }))
    const mislukt = await lees(await route.POST(verzoek('POST')))
    teksten.push(mislukt.tekst)
    expect(mislukt.status).toBe(200)
    expect(mislukt.data.resultaat).toMatchObject({ status: 'mislukt', reden: expect.stringContaining('resend 401') })

    // Er loopt er een: 409.
    const gepland = getDb().insert(backups).values({ soort: 'gepland', periode: '2030-02', status: 'bezig' }).returning().get()
    const bezig = await lees(await route.POST(verzoek('POST')))
    expect(bezig.status).toBe(409)
    getSqlite().prepare(`UPDATE backups SET status = 'verstuurd', afgerond_op = ? WHERE id = ?`).run(new Date().toISOString(), gepland.id)

    // Derde op verzoek binnen het uur lukt nog, de vierde krijgt 429 met Retry-After.
    nep.zetAntwoord(() => new Response(JSON.stringify({ id: 're_3' }), { status: 200 }))
    expect((await route.POST(verzoek('POST'))).status).toBe(200)
    const teVaak = await route.POST(verzoek('POST'))
    expect(teVaak.status).toBe(429)
    expect(teVaak.headers.get('retry-after')).toBe('3600')
    expect(nep.verzoeken).toHaveLength(3)

    const na = await lees(await route.GET(verzoek('GET')))
    teksten.push(na.tekst)
    for (const t of teksten) {
      expect(t).not.toContain(ONTVANGER)
      expect(t).not.toContain(RESEND_SLEUTEL)
      expect(t).not.toContain(sleutel)
    }
  })
})
