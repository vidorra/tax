/**
 * Meer accounts, via de routes op een echt SQLite-bestand per test (lib/db/testdb.ts):
 *  - het eerste account (setup) wordt beheerder, met een versleuteld TOTP-geheim;
 *  - een beheerder nodigt uit; de ontvanger kiest een wachtwoord en bevestigt een code; pas dan bestaat het account;
 *  - een link werkt één keer, verloopt, is in te trekken en een nieuwe link trekt de oude in;
 *  - een herstellink laat het oude wachtwoord werken tot het nieuwe is bevestigd en trekt daarna alle sessies in;
 *  - alleen beheerders mogen beheren; de laatste beheerder blijft; elk account heeft een eigen huishouden;
 *  - oude, leesbare TOTP-geheimen worden bij de start versleuteld.
 */
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { uitnodigingen, users } from '@/lib/db/schema'
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

const { SESSIE_COOKIE, INSTELLEN_COOKIE } = await import('@/lib/auth/sessie')
const { totpCode } = await import('@/lib/auth/totp')
const { leesTotp, aadTotp, versleutelOudeTotpGeheimen, totpGeheimVan } = await import('@/lib/auth/totp-opslag')
const { POST: setup } = await import('@/app/api/auth/setup/route')
const { POST: setupBevestig } = await import('@/app/api/auth/setup/bevestig/route')
const { POST: login } = await import('@/app/api/auth/login/route')
const { POST: tweefa } = await import('@/app/api/auth/2fa/route')
const { GET: accounts } = await import('@/app/api/beheer/accounts/route')
const accountRoute = await import('@/app/api/beheer/accounts/[id]/route')
const { POST: herstel } = await import('@/app/api/beheer/accounts/[id]/herstel/route')
const { POST: nodigUit } = await import('@/app/api/beheer/uitnodigingen/route')
const uitnodigingRoute = await import('@/app/api/beheer/uitnodigingen/[id]/route')
const { POST: controleer } = await import('@/app/api/account/instellen/controleer/route')
const { POST: instellen } = await import('@/app/api/account/instellen/route')
const { POST: instellenBevestig } = await import('@/app/api/account/instellen/bevestig/route')
const { huishoudenVan } = await import('@/lib/dossier/opslag')
const { zetResendFetch } = await import('@/lib/mail')

/** Nep-Resend: vangt de verstuurde mails op (aan, onderwerp, tekst). */
const mails: Array<{ aan: string; onderwerp: string; tekst: string }> = []
function nepMailer(werkt = true) {
  process.env.RESEND_API_KEY = 're_test_sleutel'
  process.env.MAIL_FROM = 'noreply@example.nl'
  zetResendFetch((async (_url: unknown, init?: { body?: string }) => {
    if (!werkt) return new Response(JSON.stringify({ message: 'kapot' }), { status: 500 })
    const b = JSON.parse(init?.body ?? '{}') as { to: string | string[]; subject: string; text: string }
    mails.push({ aan: Array.isArray(b.to) ? b.to[0] : b.to, onderwerp: b.subject, tekst: b.text })
    return new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 })
  }) as unknown as typeof fetch)
}
const tokenUitMail = (tekst: string) => /#([A-Za-z0-9_-]{43})/.exec(tekst)![1]

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'
const IP = '203.0.113.9'
// Elke volgende code ligt een periode verder, zodat de replay-bescherming ze niet weigert.
let klok = Date.now()
const code = (geheim: string) => {
  klok += 30_000
  vi.setSystemTime(klok)
  return totpCode(geheim, klok)
}

function verzoek(methode: string, pad: string, body?: unknown): Request {
  return new Request(`https://ib.example.nl${pad}`, {
    method: methode,
    headers: { 'content-type': 'application/json', host: 'ib.example.nl', 'sec-fetch-site': 'same-origin', 'x-forwarded-for': IP },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })
const json = async (r: Response) => ({ status: r.status, data: (await r.json()) as Record<string, unknown> })

/** Eerste account via setup; geeft het TOTP-geheim. Laat de sessiecookie van de beheerder staan. */
async function beheerderMaken(email = 'beheer@example.nl', wachtwoord = 'beheer-wachtwoord-1'): Promise<string> {
  const r = await json(await setup(verzoek('POST', '/api/auth/setup/', { email, wachtwoord })))
  expect(r.status).toBe(200)
  const geheim = r.data.secret as string
  expect((await setupBevestig(verzoek('POST', '/api/auth/setup/bevestig/', { code: code(geheim) }))).status).toBe(200)
  return geheim
}

/** Haalt het token uit de link die de route teruggeeft (geen mailer in de test). */
function tokenUit(data: Record<string, unknown>): string {
  expect(data.gemaild).toBe(false)
  const link = data.link as string
  expect(link).toMatch(/\/account\/instellen\/#[A-Za-z0-9_-]{43}$/)
  return link.split('#')[1]
}

/** Doorloopt het instellen; laat de cookies van het nieuwe account staan. Geeft het nieuwe TOTP-geheim. */
async function instellenMet(token: string, wachtwoord: string): Promise<string> {
  cookieStore.clear()
  expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token }))).status).toBe(200)
  const r = await json(await instellen(verzoek('POST', '/api/account/instellen/', { token, wachtwoord })))
  expect(r.status).toBe(200)
  const geheim = r.data.secret as string
  const b = await json(await instellenBevestig(verzoek('POST', '/api/account/instellen/bevestig/', { code: code(geheim) })))
  expect(b.status).toBe(200)
  return geheim
}

async function inloggen(email: string, wachtwoord: string, geheim: string): Promise<number> {
  cookieStore.clear()
  const l = await login(verzoek('POST', '/api/auth/login/', { email, wachtwoord }))
  if (l.status !== 200) return l.status
  return (await tweefa(verzoek('POST', '/api/auth/2fa/', { code: code(geheim) }))).status
}

let envKopie: NodeJS.ProcessEnv
beforeEach(() => {
  envKopie = { ...process.env }
  process.env.AUTH_SECRET = SECRET
  process.env.DOSSIER_KEY = randomBytes(32).toString('base64')
  process.env.NEXT_PUBLIC_SITE_URL = 'https://ib.example.nl'
  for (const k of ['RESEND_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) delete process.env[k]
  cookieStore.clear()
  mails.length = 0
  zetResendFetch(null)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(klok)
  const g = globalThis as Record<string, unknown>
  for (const k of Object.keys(g)) if (k.startsWith('__ib') && k.endsWith('Limiter')) delete g[k]
  delete g.__ibTotpGebruikt
})
afterEach(() => {
  vi.useRealTimers()
  zetResendFetch(null)
  process.env = envKopie
})

describe('accounts en uitnodigingen', () => {
  gebruikTijdelijkeDb()

  it('setup maakt een beheerder met een versleuteld TOTP-geheim', async () => {
    const geheim = await beheerderMaken()
    const g = getDb().select().from(users).get()!
    expect(g.rol).toBe('beheerder')
    expect(g.totpSecret.startsWith('enc:')).toBe(true)
    expect(g.totpSecret).not.toContain(geheim)
    expect(totpGeheimVan(g)).toBe(geheim)
    expect(await inloggen('beheer@example.nl', 'beheer-wachtwoord-1', geheim)).toBe(200)
    expect(getDb().select().from(users).get()!.laatstIngelogd).toBeInstanceOf(Date)
  })

  it('uitnodigen, instellen en inloggen; het account bestaat pas na de code en heeft een eigen huishouden', async () => {
    await beheerderMaken()
    const beheerSessie = cookieStore.get(SESSIE_COOKIE)!
    const r = await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'Collega@Example.nl', naam: 'Sanne' })))
    expect(r.status).toBe(201)
    const token = tokenUit(r.data)
    // De database bewaart alleen de hash.
    expect(JSON.stringify(getDb().select().from(uitnodigingen).all())).not.toContain(token)

    cookieStore.clear()
    const c = await json(await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token })))
    expect(c.data).toMatchObject({ email: 'collega@example.nl', naam: 'Sanne', soort: 'uitnodiging' })
    const s = await json(await instellen(verzoek('POST', '/api/account/instellen/', { token, wachtwoord: 'collega-wachtwoord-1' })))
    expect(s.status).toBe(200)
    expect(cookieStore.has(INSTELLEN_COOKIE)).toBe(true)
    // Nog geen account: alleen de beheerder.
    expect(getDb().select().from(users).all()).toHaveLength(1)
    // Een verkeerde code maakt niets aan.
    expect((await instellenBevestig(verzoek('POST', '/api/account/instellen/bevestig/', { code: '000000' }))).status).toBe(401)
    expect(getDb().select().from(users).all()).toHaveLength(1)
    const geheim = s.data.secret as string
    expect((await instellenBevestig(verzoek('POST', '/api/account/instellen/bevestig/', { code: code(geheim) }))).status).toBe(200)
    expect(cookieStore.has(SESSIE_COOKIE)).toBe(true)

    const nieuw = getDb().select().from(users).where(eq(users.email, 'collega@example.nl')).get()!
    expect(nieuw).toMatchObject({ rol: 'gebruiker', naam: 'Sanne', totpEnabled: true })
    expect(nieuw.totpSecret.startsWith('enc:')).toBe(true)
    expect(leesTotp(nieuw.totpSecret, aadTotp.gebruiker(nieuw.id))).toBe(geheim)
    const u = getDb().select().from(uitnodigingen).get()!
    expect(u.gebruiktOp).toBeInstanceOf(Date)
    expect(u.userId).toBe(nieuw.id)
    expect(u.wachtwoordHash).toBeNull()
    expect(u.totpEnc).toBeNull()

    // De link werkt maar één keer.
    expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token }))).status).toBe(410)
    expect((await instellen(verzoek('POST', '/api/account/instellen/', { token, wachtwoord: 'nog-een-wachtwoord-1' }))).status).toBe(410)

    // Inloggen werkt; de collega is geen beheerder.
    expect(await inloggen('collega@example.nl', 'collega-wachtwoord-1', geheim)).toBe(200)
    expect((await accounts(verzoek('GET', '/api/beheer/accounts/'))).status).toBe(403)
    expect((await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'x@example.nl' }))).status).toBe(403)

    // Eigen huishouden per account.
    const beheerder = getDb().select().from(users).where(eq(users.email, 'beheer@example.nl')).get()!
    expect(await huishoudenVan(nieuw.id)).not.toBe(await huishoudenVan(beheerder.id))

    // De beheerder ziet beide accounts, zonder hashes of geheimen.
    cookieStore.clear()
    cookieStore.set(SESSIE_COOKIE, beheerSessie)
    const lijst = await json(await accounts(verzoek('GET', '/api/beheer/accounts/')))
    expect((lijst.data.accounts as Array<{ email: string }>).map((a) => a.email)).toEqual(['beheer@example.nl', 'collega@example.nl'])
    expect(JSON.stringify(lijst.data)).not.toMatch(/passwordHash|totpSecret|\$2[aby]\$|enc:/)
  })

  it('een uitnodiging verloopt, is in te trekken en opnieuw versturen maakt de oude link ongeldig', async () => {
    await beheerderMaken()
    const een = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'een@example.nl' })))).data)
    const id = getDb().select().from(uitnodigingen).get()!.id

    // Opnieuw versturen: oude link weg, nieuwe werkt.
    const twee = tokenUit((await json(await uitnodigingRoute.POST(verzoek('POST', `/api/beheer/uitnodigingen/${id}/`), params(id)))).data)
    expect(twee).not.toBe(een)
    expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token: een }))).status).toBe(410)
    expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token: twee }))).status).toBe(200)

    // Intrekken.
    expect((await uitnodigingRoute.DELETE(verzoek('DELETE', `/api/beheer/uitnodigingen/${id}/`), params(id))).status).toBe(200)
    expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token: twee }))).status).toBe(410)

    // Een adres met een account kan geen uitnodiging krijgen; wel een herstellink.
    const bestaand = await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'beheer@example.nl' })))
    expect(bestaand.status).toBe(409)

    // Verlopen: na 7 dagen werkt de link niet meer (de sessie van de beheerder is dan ook verlopen).
    const drie = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'drie@example.nl' })))).data)
    klok += 7 * 24 * 60 * 60 * 1000 + 1000
    vi.setSystemTime(klok)
    expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token: drie }))).status).toBe(410)
  })

  it('herstellink: oude wachtwoord werkt tot de bevestiging, daarna nieuw wachtwoord, nieuwe app en oude sessies ingetrokken', async () => {
    await beheerderMaken()
    const beheerSessie = cookieStore.get(SESSIE_COOKIE)!
    const token = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'jan@example.nl' })))).data)
    const oudGeheim = await instellenMet(token, 'jan-oud-wachtwoord-1')
    const oudeSessie = cookieStore.get(SESSIE_COOKIE)!
    const jan = getDb().select().from(users).where(eq(users.email, 'jan@example.nl')).get()!

    cookieStore.clear()
    cookieStore.set(SESSIE_COOKIE, beheerSessie)
    // Zonder mailer geen herstellink: die gaat alleen per mail naar het account zelf.
    const zonder = await json(await herstel(verzoek('POST', `/api/beheer/accounts/${jan.id}/herstel/`), params(jan.id)))
    expect(zonder.status).toBe(409)
    expect(JSON.stringify(zonder.data)).not.toMatch(/instellen|#/)
    expect(getDb().select().from(uitnodigingen).where(eq(uitnodigingen.soort, 'herstel')).all()).toHaveLength(0)
    // Mailen mislukt: 502, geen link, en de herstellink is meteen ingetrokken.
    nepMailer(false)
    const mislukt = await json(await herstel(verzoek('POST', `/api/beheer/accounts/${jan.id}/herstel/`), params(jan.id)))
    expect(mislukt.status).toBe(502)
    expect(mislukt.data).not.toHaveProperty('link')
    expect(getDb().select().from(uitnodigingen).where(eq(uitnodigingen.soort, 'herstel')).get()!.ingetrokkenOp).toBeInstanceOf(Date)
    // Met mailer: de link gaat naar jan zelf, niet in het antwoord aan de beheerder.
    nepMailer()
    const h = await json(await herstel(verzoek('POST', `/api/beheer/accounts/${jan.id}/herstel/`), params(jan.id)))
    expect(h.status).toBe(201)
    expect(h.data).toEqual({ gemaild: true })
    expect(mails).toHaveLength(1)
    expect(mails[0].aan).toBe('jan@example.nl')
    const herstelToken = tokenUitMail(mails[0].tekst)

    cookieStore.clear()
    const s = await json(await instellen(verzoek('POST', '/api/account/instellen/', { token: herstelToken, wachtwoord: 'jan-nieuw-wachtwoord-1' })))
    expect(s.status).toBe(200)
    // Nog niet bevestigd: het oude wachtwoord en de oude app werken nog.
    const instelCookie = cookieStore.get(INSTELLEN_COOKIE)!
    expect(await inloggen('jan@example.nl', 'jan-oud-wachtwoord-1', oudGeheim)).toBe(200)

    cookieStore.clear()
    cookieStore.set(INSTELLEN_COOKIE, instelCookie)
    const nieuwGeheim = s.data.secret as string
    expect((await instellenBevestig(verzoek('POST', '/api/account/instellen/bevestig/', { code: code(nieuwGeheim) }))).status).toBe(200)

    // Jan krijgt een bevestiging dat het herstel is afgerond.
    expect(mails.map((m) => [m.aan, m.onderwerp])).toEqual([
      ['jan@example.nl', expect.stringMatching(/^Herstel je toegang/)],
      ['jan@example.nl', expect.stringMatching(/is hersteld$/)],
    ])
    // Oud wachtwoord en oude app werken niet meer; het nieuwe wel.
    expect(await inloggen('jan@example.nl', 'jan-oud-wachtwoord-1', oudGeheim)).toBe(401)
    expect(await inloggen('jan@example.nl', 'jan-nieuw-wachtwoord-1', oudGeheim)).toBe(401)
    expect(await inloggen('jan@example.nl', 'jan-nieuw-wachtwoord-1', nieuwGeheim)).toBe(200)
    // De sessie van vóór het herstel is ingetrokken.
    cookieStore.clear()
    cookieStore.set(SESSIE_COOKIE, oudeSessie)
    const { getSessie } = await import('@/lib/auth/server')
    expect(await getSessie()).toBeNull()
  })

  it('beheer: de laatste beheerder blijft, je eigen account verwijder je niet, een ander account gaat met dossier en al weg', async () => {
    await beheerderMaken()
    const beheerSessie = cookieStore.get(SESSIE_COOKIE)!
    const beheerder = getDb().select().from(users).get()!
    expect((await json(await accountRoute.PATCH(verzoek('PATCH', `/api/beheer/accounts/${beheerder.id}/`, { rol: 'gebruiker' }), params(beheerder.id)))).status).toBe(409)
    expect((await accountRoute.DELETE(verzoek('DELETE', `/api/beheer/accounts/${beheerder.id}/`), params(beheerder.id))).status).toBe(409)

    const token = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'piet@example.nl', rol: 'beheerder' })))).data)
    await instellenMet(token, 'piet-wachtwoord-123')
    const piet = getDb().select().from(users).where(eq(users.email, 'piet@example.nl')).get()!
    expect(piet.rol).toBe('beheerder')
    await huishoudenVan(piet.id)

    cookieStore.clear()
    cookieStore.set(SESSIE_COOKIE, beheerSessie)
    // Met twee beheerders kan er één gebruiker worden.
    expect((await accountRoute.PATCH(verzoek('PATCH', `/api/beheer/accounts/${piet.id}/`, { rol: 'gebruiker' }), params(piet.id))).status).toBe(200)
    expect((await accountRoute.DELETE(verzoek('DELETE', `/api/beheer/accounts/${piet.id}/`), params(piet.id))).status).toBe(200)
    expect(getDb().select().from(users).where(eq(users.id, piet.id)).get()).toBeUndefined()
    expect(getDb().select().from(uitnodigingen).where(eq(uitnodigingen.userId, piet.id)).all()).toHaveLength(0)
  })

  it('Alles verwijderen met account: de enige beheerder kan niet weg zolang er andere accounts zijn', async () => {
    await beheerderMaken()
    const beheerder = getDb().select().from(users).get()!
    const token = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'kees@example.nl' })))).data)
    await instellenMet(token, 'kees-wachtwoord-12')
    const kees = getDb().select().from(users).where(eq(users.email, 'kees@example.nl')).get()!
    const { verwijderAlles, LaatsteBeheerderFout } = await import('@/lib/dossier/opslag')
    await expect(verwijderAlles(beheerder.id, true)).rejects.toBeInstanceOf(LaatsteBeheerderFout)
    expect(getDb().select().from(users).where(eq(users.id, beheerder.id)).get()).toBeDefined()
    // Een gewone gebruiker kan zijn eigen account wel weghalen; het dossier van de beheerder blijft.
    await verwijderAlles(kees.id, true)
    expect(getDb().select().from(users).all().map((u) => u.email)).toEqual(['beheer@example.nl'])
    // Als enige account mag de beheerder wel weg (setup gaat dan weer open).
    await verwijderAlles(beheerder.id, true)
    expect(getDb().select().from(users).all()).toHaveLength(0)
  })

  it('oude, leesbare TOTP-geheimen worden bij de start versleuteld en blijven werken', async () => {
    const geheim = await beheerderMaken()
    const g = getDb().select().from(users).get()!
    // Terug naar de oude vorm, zoals een installatie van vóór deze versie.
    getDb().update(users).set({ totpSecret: geheim }).where(eq(users.id, g.id)).run()
    expect(versleutelOudeTotpGeheimen()).toBe(1)
    const na = getDb().select().from(users).get()!
    expect(na.totpSecret.startsWith('enc:')).toBe(true)
    expect(totpGeheimVan(na)).toBe(geheim)
    expect(versleutelOudeTotpGeheimen()).toBe(0)
    expect(await inloggen('beheer@example.nl', 'beheer-wachtwoord-1', geheim)).toBe(200)
  })
})

describe('na de review', () => {
  gebruikTijdelijkeDb()

  it('een beheerder die wordt verwijderd of gebruiker wordt, verliest zijn open uitnodigingen en herstellinks', async () => {
    await beheerderMaken()
    const eigenaarSessie = cookieStore.get(SESSIE_COOKIE)!
    const piet = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'piet@example.nl', rol: 'beheerder' })))).data)
    await instellenMet(piet, 'piet-wachtwoord-123')
    const pietId = getDb().select().from(users).where(eq(users.email, 'piet@example.nl')).get()!.id
    // Piet maakt als beheerder vooraf een uitnodiging voor zichzelf (als beheerder) en een voor een ander.
    const achterdeur = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'piet-terug@example.nl', rol: 'beheerder' })))).data)
    const tweede = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'iemand@example.nl' })))).data)

    cookieStore.clear()
    cookieStore.set(SESSIE_COOKIE, eigenaarSessie)
    expect((await accountRoute.PATCH(verzoek('PATCH', `/api/beheer/accounts/${pietId}/`, { rol: 'gebruiker' }), params(pietId))).status).toBe(200)
    expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token: achterdeur }))).status).toBe(410)
    expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token: tweede }))).status).toBe(410)

    // Ook bij verwijderen: een nieuwe uitnodiging van een (weer) beheerder vervalt met het account.
    cookieStore.clear()
    cookieStore.set(SESSIE_COOKIE, eigenaarSessie)
    expect((await accountRoute.PATCH(verzoek('PATCH', `/api/beheer/accounts/${pietId}/`, { rol: 'beheerder' }), params(pietId))).status).toBe(200)
    const { maakUitnodiging } = await import('@/lib/auth/uitnodiging')
    const nog = await maakUitnodiging({ email: 'nog-een@example.nl', naam: null, rol: 'beheerder', doorId: pietId })
    expect((await accountRoute.DELETE(verzoek('DELETE', `/api/beheer/accounts/${pietId}/`), params(pietId))).status).toBe(200)
    expect((await controleer(verzoek('POST', '/api/account/instellen/controleer/', { token: nog.token }))).status).toBe(410)
  })

  it('wie een setup bevestigt, wordt beheerder (ook een account uit een setup die openstond tijdens de update)', async () => {
    const r = await json(await setup(verzoek('POST', '/api/auth/setup/', { email: 'laat@example.nl', wachtwoord: 'laat-wachtwoord-12' })))
    // Zoals de migratie een account zonder 2FA achterlaat: rol gebruiker.
    getDb().update(users).set({ rol: 'gebruiker' }).run()
    expect((await setupBevestig(verzoek('POST', '/api/auth/setup/bevestig/', { code: code(r.data.secret as string) }))).status).toBe(200)
    expect(getDb().select().from(users).get()!.rol).toBe('beheerder')
  })

  it('de instelcookie hoort bij één poging: na een nieuwe start werkt een oude cookie niet meer', async () => {
    await beheerderMaken()
    const token = tokenUit((await json(await nodigUit(verzoek('POST', '/api/beheer/uitnodigingen/', { email: 'twee@example.nl' })))).data)
    cookieStore.clear()
    const eerste = await json(await instellen(verzoek('POST', '/api/account/instellen/', { token, wachtwoord: 'eerste-wachtwoord-1' })))
    const oudeCookie = cookieStore.get(INSTELLEN_COOKIE)!
    const tweede = await json(await instellen(verzoek('POST', '/api/account/instellen/', { token, wachtwoord: 'tweede-wachtwoord-1' })))
    const nieuweCookie = cookieStore.get(INSTELLEN_COOKIE)!
    expect(nieuweCookie.value).not.toBe(oudeCookie.value)
    // Oude cookie met een geldige code van het nieuwe geheim: geweigerd.
    cookieStore.set(INSTELLEN_COOKIE, oudeCookie)
    expect((await instellenBevestig(verzoek('POST', '/api/account/instellen/bevestig/', { code: code(tweede.data.secret as string) }))).status).toBe(401)
    expect(getDb().select().from(users).where(eq(users.email, 'twee@example.nl')).get()).toBeUndefined()
    // De nieuwe cookie werkt; het eerste geheim niet meer.
    cookieStore.set(INSTELLEN_COOKIE, nieuweCookie)
    expect((await instellenBevestig(verzoek('POST', '/api/account/instellen/bevestig/', { code: code(eerste.data.secret as string) }))).status).toBe(401)
    expect((await instellenBevestig(verzoek('POST', '/api/account/instellen/bevestig/', { code: code(tweede.data.secret as string) }))).status).toBe(200)
  })
})
