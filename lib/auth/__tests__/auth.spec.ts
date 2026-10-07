import { describe, expect, it } from 'vitest'
import * as OTPAuth from 'otpauth'
import { maakToken, verifieerToken, SESSIE_DUUR } from '../sessie'
import { codeAlGebruikt, nieuwTotpGeheim, totpCode, verifieerTotp } from '../totp'
import { maakRateLimiter } from '../rate-limit'
import { controleerWachtwoord, wachtwoordProbleem } from '../wachtwoord'
import { configStatus } from '../config'

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'

describe('TOTP', () => {
  it('accepteert een code die uit het geheim is gemaakt', () => {
    const { secret, uri } = nieuwTotpGeheim('iemand@example.nl')
    expect(uri).toContain('issuer=IB-calculator')
    const nu = Date.UTC(2026, 9, 4, 12, 0, 0)
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' }).generate({ timestamp: nu })
    expect(verifieerTotp(secret, code, nu)).not.toBeNull()
    expect(verifieerTotp(secret, code.slice(0, 3) + ' ' + code.slice(3), nu)).not.toBeNull()
  })

  it('venster van één periode', () => {
    const { secret } = nieuwTotpGeheim('a@b.nl')
    const nu = Date.UTC(2026, 9, 4, 12, 0, 15)
    expect(verifieerTotp(secret, totpCode(secret, nu - 30_000), nu)).not.toBeNull()
    expect(verifieerTotp(secret, totpCode(secret, nu + 30_000), nu)).not.toBeNull()
    expect(verifieerTotp(secret, totpCode(secret, nu - 120_000), nu)).toBeNull()
  })

  it('weigert onzin en lege codes', () => {
    const { secret } = nieuwTotpGeheim('a@b.nl')
    expect(verifieerTotp(secret, '12345')).toBeNull()
    expect(verifieerTotp(secret, 'abcdef')).toBeNull()
    expect(verifieerTotp(secret, 123456 as unknown as string)).toBeNull()
    expect(verifieerTotp('', '123456')).toBeNull()
  })

  it('dezelfde code werkt maar één keer', () => {
    expect(codeAlGebruikt(9001, 100)).toBe(false)
    expect(codeAlGebruikt(9001, 100)).toBe(true)
    expect(codeAlGebruikt(9001, 99)).toBe(true)
    expect(codeAlGebruikt(9001, 101)).toBe(false)
  })
})

describe('JWT-sessies', () => {
  it('ondertekent en verifieert', async () => {
    const t = await maakToken(42, 'sessie', { secret: SECRET })
    // generatie: de sessiegeneratie van het account bij uitgifte (uitloggen verhoogt die).
    expect(await verifieerToken(t, 'sessie', { secret: SECRET })).toEqual({ userId: 42, soort: 'sessie', generatie: 0 })
    const g3 = await maakToken(42, 'sessie', { secret: SECRET, generatie: 3 })
    expect((await verifieerToken(g3, 'sessie', { secret: SECRET }))?.generatie).toBe(3)
  })

  it("weigert alg 'none' en andere algoritmen", async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const nu = Math.floor(Date.now() / 1000)
    const payload = b64({ typ: 'sessie', sub: '1', iss: 'ibcalculator', iat: nu, exp: nu + 3600 })
    expect(await verifieerToken(`${b64({ alg: 'none', typ: 'JWT' })}.${payload}.`, 'sessie', { secret: SECRET })).toBeNull()
    const { SignJWT } = await import('jose')
    const hs512 = await new SignJWT({ typ: 'sessie' }).setProtectedHeader({ alg: 'HS512' }).setSubject('1').setIssuer('ibcalculator').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(SECRET))
    expect(await verifieerToken(hs512, 'sessie', { secret: SECRET })).toBeNull()
  })

  it('weigert een AUTH_SECRET korter dan 32 tekens', async () => {
    await expect(maakToken(1, 'sessie', { secret: 'kort-geheim' })).rejects.toThrow(/minimaal 32/)
    const t = await maakToken(1, 'sessie', { secret: SECRET })
    expect(await verifieerToken(t, 'sessie', { secret: 'kort-geheim' })).toBeNull()
  })

  it('weigert een ander soort token, een ander geheim en een gewijzigd token', async () => {
    const t = await maakToken(42, '2fa', { secret: SECRET })
    expect(await verifieerToken(t, 'sessie', { secret: SECRET })).toBeNull()
    expect(await verifieerToken(t, '2fa', { secret: `${SECRET}x` })).toBeNull()
    expect(await verifieerToken(t.slice(0, -2) + 'xx', '2fa', { secret: SECRET })).toBeNull()
    expect(await verifieerToken(undefined, '2fa', { secret: SECRET })).toBeNull()
  })

  it('verloopt', async () => {
    const nu = new Date('2026-10-04T12:00:00Z')
    const t = await maakToken(7, 'sessie', { secret: SECRET, nu })
    const bijna = new Date(nu.getTime() + (SESSIE_DUUR - 60) * 1000)
    const daarna = new Date(nu.getTime() + (SESSIE_DUUR + 60) * 1000)
    expect(await verifieerToken(t, 'sessie', { secret: SECRET, nu: bijna })).not.toBeNull()
    expect(await verifieerToken(t, 'sessie', { secret: SECRET, nu: daarna })).toBeNull()
    const kort = await maakToken(7, '2fa', { secret: SECRET, nu })
    expect(await verifieerToken(kort, '2fa', { secret: SECRET, nu: new Date(nu.getTime() + 6 * 60 * 1000) })).toBeNull()
  })
})

describe('rate limiter', () => {
  it('blokkeert na 5 mislukte pogingen binnen 15 minuten', () => {
    const rl = maakRateLimiter({ max: 5, vensterMs: 15 * 60 * 1000 })
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) {
      expect(rl.controleer('1.2.3.4|a@b.nl', t0 + i).toegestaan).toBe(true)
      rl.mislukt('1.2.3.4|a@b.nl', t0 + i)
    }
    const geblokkeerd = rl.controleer('1.2.3.4|a@b.nl', t0 + 10)
    expect(geblokkeerd.toegestaan).toBe(false)
    expect(geblokkeerd.wachtSeconden).toBeGreaterThan(890)
    // Andere sleutel heeft er geen last van.
    expect(rl.controleer('1.2.3.4|c@d.nl', t0 + 10).toegestaan).toBe(true)
    // Na het venster weer toegestaan.
    expect(rl.controleer('1.2.3.4|a@b.nl', t0 + 15 * 60 * 1000 + 1).toegestaan).toBe(true)
  })

  it('reset na een geslaagde poging', () => {
    const rl = maakRateLimiter({ max: 2, vensterMs: 1000 })
    rl.mislukt('k', 0)
    rl.mislukt('k', 1)
    expect(rl.controleer('k', 2).toegestaan).toBe(false)
    rl.reset('k')
    expect(rl.controleer('k', 3).toegestaan).toBe(true)
  })
})

describe('wachtwoord en configuratie', () => {
  it('controleert wachtwoordsterkte en vergelijkt veilig zonder hash', async () => {
    expect(wachtwoordProbleem('kort')).toMatch(/minimaal 12/)
    expect(wachtwoordProbleem('een-lang-genoeg-wachtwoord')).toBeNull()
    expect(await controleerWachtwoord('x', null)).toBe(false)
  })

  it('meldt ontbrekende omgevingsvariabelen en een databasemap die niet schrijfbaar is', () => {
    const ja = () => true
    const sleutel = Buffer.alloc(32, 1).toString('base64')
    expect(configStatus({}, ja).ontbreekt).toEqual(['AUTH_SECRET', 'DOSSIER_KEY'])
    const ok = configStatus({ AUTH_SECRET: SECRET, DOSSIER_KEY: sleutel }, ja)
    expect(ok.geconfigureerd).toBe(true)
    expect(configStatus({ AUTH_SECRET: 'kort', DOSSIER_KEY: 'abc' }, ja).ontbreekt).toEqual(['AUTH_SECRET', 'DOSSIER_KEY'])
    const gevraagd: string[] = []
    const nee = (pad: string) => {
      gevraagd.push(pad)
      return false
    }
    expect(configStatus({ AUTH_SECRET: SECRET, DOSSIER_KEY: sleutel, DATABASE_PATH: '/ergens/anders/ib.db' }, nee).ontbreekt).toEqual(['DATABASE_PATH'])
    expect(gevraagd).toEqual(['/ergens/anders/ib.db'])
  })
})
