import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, middleware } from '@/middleware'
import { maakToken, SESSIE_COOKIE } from '../sessie'

const SECRET = 'test-geheim-van-minimaal-tweeendertig-tekens-lang'
let oud: string | undefined
beforeEach(() => {
  oud = process.env.AUTH_SECRET
  process.env.AUTH_SECRET = SECRET
})
afterEach(() => {
  if (oud === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = oud
})

const verzoek = (pad: string, cookie?: string) => new NextRequest(`https://ib.example.nl${pad}`, { headers: cookie ? { cookie: `${SESSIE_COOKIE}=${cookie}` } : {} })

describe('middleware', () => {
  it('beschermt dossierpagina en dossier-API, ook met of zonder slash en met .. in het pad', async () => {
    for (const pad of ['/dossier', '/dossier/', '/dossier/2024/', '/dossier/vergelijk', '/dossier/login/../2024/']) {
      const res = await middleware(verzoek(pad))
      expect(res.status, pad).toBe(307)
      expect(res.headers.get('location'), pad).toMatch(/\/dossier\/login\/?$/)
    }
    for (const pad of ['/api/dossier/jaren/', '/api/dossier/export', '/api/dossier/jaren/2024/accountant/']) {
      expect((await middleware(verzoek(pad))).status, pad).toBe(401)
    }
  })

  it('laat login en setup door, en een geldige sessie', async () => {
    expect((await middleware(verzoek('/dossier/login/'))).headers.get('x-middleware-next')).toBe('1')
    expect((await middleware(verzoek('/dossier/setup/'))).headers.get('x-middleware-next')).toBe('1')
    const token = await maakToken(1, 'sessie')
    expect((await middleware(verzoek('/dossier/2024/', token))).headers.get('x-middleware-next')).toBe('1')
    // Een 2FA- of setup-token is geen sessie.
    expect((await middleware(verzoek('/api/dossier/jaren/', await maakToken(1, '2fa')))).status).toBe(401)
  })

  it('de matcher dekt /dossier en /api/dossier', () => {
    expect(config.matcher).toEqual(expect.arrayContaining(['/dossier', '/dossier/:path*', '/api/dossier/:path*']))
  })
})
