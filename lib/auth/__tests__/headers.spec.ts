/** Beveiligingsheaders uit next.config.js, zonder next build. */
import { afterEach, describe, expect, it, vi } from 'vitest'

type Regel = { source: string; headers: Array<{ key: string; value: string }> }

async function laadHeaders(env: Record<string, string> = {}): Promise<Regel[]> {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  const { default: config } = (await import('../../../next.config.js')) as { default: { headers: () => Promise<Regel[]> } }
  return config.headers()
}

function voor(regels: Regel[], source: string): Record<string, string> {
  return Object.fromEntries(regels.filter((r) => r.source === source).flatMap((r) => r.headers.map((h) => [h.key.toLowerCase(), h.value])))
}

function csp(waarde: string): Record<string, string[]> {
  return Object.fromEntries(
    waarde
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([naam, ...rest]) => [naam, rest]),
  )
}

afterEach(() => vi.unstubAllEnvs())

describe('beveiligingsheaders', () => {
  it('zet de standaardheaders op alle routes', async () => {
    const h = voor(await laadHeaders({ NODE_ENV: 'production' }), '/:path*')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(h['permissions-policy']).toMatch(/camera=\(\)/)
    expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/)
    const c = csp(h['content-security-policy'])
    expect(c['default-src']).toEqual(["'self'"])
    expect(c['frame-ancestors']).toEqual(["'none'"])
    expect(c['object-src']).toEqual(["'none'"])
    expect(c['base-uri']).toEqual(["'self'"])
    expect(c['form-action']).toEqual(["'self'"])
    // Web Worker van de calculator en jsPDF-downloads (blob:), QR-code (data:).
    expect(c['worker-src']).toEqual(expect.arrayContaining(["'self'", 'blob:']))
    expect(c['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']))
    // Next.js zet inline scripts zonder nonce; eval alleen in development.
    expect(c['script-src']).toContain("'unsafe-inline'")
    expect(c['script-src']).not.toContain("'unsafe-eval'")
  })

  it('staat het Umami-script toe vanaf NEXT_PUBLIC_UMAMI_SRC', async () => {
    const h = voor(await laadHeaders({ NODE_ENV: 'production', NEXT_PUBLIC_UMAMI_SRC: 'https://stats.example.nl/script.js' }), '/:path*')
    const c = csp(h['content-security-policy'])
    expect(c['script-src']).toContain('https://stats.example.nl')
    expect(c['connect-src']).toContain('https://stats.example.nl')
  })

  it('zonder NEXT_PUBLIC_UMAMI_SRC geen externe host in de CSP', async () => {
    for (const env of [{ NEXT_PUBLIC_UMAMI_SRC: '' }, { NEXT_PUBLIC_UMAMI_SRC: 'geen url' }]) {
      const h = voor(await laadHeaders({ NODE_ENV: 'production', ...env }), '/:path*')
      const c = csp(h['content-security-policy'])
      expect(c['script-src'].filter((x) => x.startsWith('http'))).toEqual([])
      expect(c['connect-src']).toEqual(["'self'"])
    }
  })

  it('geen HSTS en wel eval in development', async () => {
    const h = voor(await laadHeaders({ NODE_ENV: 'development' }), '/:path*')
    expect(h['strict-transport-security']).toBeUndefined()
    expect(csp(h['content-security-policy'])['script-src']).toContain("'unsafe-eval'")
  })

  it('houdt noindex en no-store op het dossier en de dossier-API', async () => {
    const regels = await laadHeaders({ NODE_ENV: 'production' })
    for (const source of ['/dossier/:path*', '/api/dossier/:path*']) {
      const h = voor(regels, source)
      expect(h['x-robots-tag']).toBe('noindex, nofollow')
      expect(h['cache-control']).toBe('no-store')
    }
  })
})
