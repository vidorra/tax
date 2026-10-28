import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { ARTIKELEN } from '@/components/kennisbank/artikelen'
import { NAVIGATIE, PUBLIEKE_ROUTES, SITE, absoluteUrl, isActief, pad, siteUrl } from '@/lib/site'

const ROOT = join(__dirname, '..', '..')

describe('siteUrl', () => {
  it('valt terug op localhost zonder env', () => {
    expect(siteUrl('')).toBe('http://localhost:3000')
    expect(siteUrl(undefined)).toBe('http://localhost:3000')
    expect(siteUrl('geen url')).toBe('http://localhost:3000')
  })
  it('haalt de slash aan het eind weg', () => {
    expect(siteUrl('https://voorbeeld.nl/')).toBe('https://voorbeeld.nl')
    expect(siteUrl(' https://voorbeeld.nl ')).toBe('https://voorbeeld.nl')
  })
})

describe('pad en absoluteUrl', () => {
  it('voegt een slash toe (trailingSlash: true)', () => {
    expect(pad('/')).toBe('/')
    expect(pad('/kennisbank')).toBe('/kennisbank/')
    expect(pad('/kennisbank/')).toBe('/kennisbank/')
    expect(pad('box-3')).toBe('/box-3/')
    expect(pad('/2027#box-3')).toBe('/2027/#box-3')
  })
  it('maakt absolute URLs', () => {
    expect(absoluteUrl('/2026', 'https://voorbeeld.nl')).toBe('https://voorbeeld.nl/2026/')
    expect(absoluteUrl('/', 'https://voorbeeld.nl')).toBe('https://voorbeeld.nl/')
  })
})

describe('isActief', () => {
  it('home alleen exact', () => {
    expect(isActief('/', '/')).toBe(true)
    expect(isActief('/kennisbank/', '/')).toBe(false)
  })
  it('subpaginas en trailing slashes', () => {
    expect(isActief('/kennisbank/urencriterium/', '/kennisbank')).toBe(true)
    expect(isActief('/kennisbank', '/kennisbank')).toBe(true)
    expect(isActief('/2026/', '/2026')).toBe(true)
    expect(isActief('/2027', '/2026')).toBe(false)
    expect(isActief('/dossierx', '/dossier')).toBe(false)
    expect(isActief(null, '/')).toBe(false)
  })
})

describe('navigatie', () => {
  it('bevat calculator, jaren, kennisbank en dossier', () => {
    expect(NAVIGATIE.map((n) => n.href)).toEqual(['/', '/2026', '/2027', '/kennisbank', '/dossier'])
  })
  it('sitenaam is vast', () => {
    expect(SITE.naam).toBe("IB-calculator voor zzp'ers")
  })
})

describe('sitemap en robots', () => {
  const urls = sitemap().map((e) => e.url)
  it('bevat de vaste routes en de rekentools', () => {
    for (const r of ['/', '/2026', '/2027', '/jaarruimte', '/kinderopvangtoeslag', '/box-3', '/bv-of-eenmanszaak', '/middeling', '/kennisbank', '/over', '/handleiding', '/privacy', '/disclaimer']) {
      expect(urls).toContain(absoluteUrl(r))
    }
  })
  it('bevat alle kennisbankartikelen en geen dossier of api', () => {
    for (const a of ARTIKELEN) expect(urls).toContain(absoluteUrl(`/kennisbank/${a.slug}`))
    expect(urls.some((u) => u.includes('/dossier') || u.includes('/api'))).toBe(false)
    expect(urls.length).toBe(PUBLIEKE_ROUTES.length + ARTIKELEN.length)
    expect(new Set(urls).size).toBe(urls.length)
  })
  it('robots sluit dossier en api uit', () => {
    const r = robots()
    const regels = Array.isArray(r.rules) ? r.rules : [r.rules]
    const disallow = regels.flatMap((x) => (Array.isArray(x.disallow) ? x.disallow : x.disallow ? [x.disallow] : []))
    expect(disallow).toContain('/dossier')
    expect(disallow).toContain('/api')
    expect(r.sitemap).toBe(`${SITE.url}/sitemap.xml`)
  })
})

describe('kennisbank', () => {
  it('heeft voor elk artikel een pagina', () => {
    for (const a of ARTIKELEN) expect(existsSync(join(ROOT, 'app', 'kennisbank', a.slug, 'page.tsx'))).toBe(true)
  })
  it('verwijst alleen naar bestaande gerelateerde artikelen', () => {
    const slugs = new Set(ARTIKELEN.map((a) => a.slug))
    for (const a of ARTIKELEN) for (const g of a.gerelateerd) expect(slugs.has(g), `${a.slug} -> ${g}`).toBe(true)
  })
  it('heeft unieke slugs en beschrijvingen van redelijke lengte', () => {
    expect(new Set(ARTIKELEN.map((a) => a.slug)).size).toBe(ARTIKELEN.length)
    for (const a of ARTIKELEN) expect(a.beschrijving.length).toBeLessThanOrEqual(200)
  })
})

function bestanden(dir: string): string[] {
  return readdirSync(dir).flatMap((naam) => {
    const p = join(dir, naam)
    return statSync(p).isDirectory() ? bestanden(p) : /\.(tsx?|css)$/.test(naam) ? [p] : []
  })
}

describe('copyregels in UI-bestanden', () => {
  const eigen = [
    ...bestanden(join(ROOT, 'app', 'kennisbank')),
    ...['over', 'privacy', 'disclaimer'].flatMap((d) => bestanden(join(ROOT, 'app', d))),
    ...bestanden(join(ROOT, 'components', 'ui')),
    ...bestanden(join(ROOT, 'components', 'kennisbank')),
    ...['Header.tsx', 'Footer.tsx', 'Layout.tsx'].map((f) => join(ROOT, 'components', f)),
  ]
  it('bevat geen em-dashes of pijlen', () => {
    for (const f of eigen) {
      const tekst = readFileSync(f, 'utf8')
      expect(tekst.includes('—'), `em-dash in ${f}`).toBe(false)
      expect(/[→←⇒]/.test(tekst), `pijl in ${f}`).toBe(false)
    }
  })
  it('gebruikt geen hover-transforms', () => {
    for (const f of eigen) expect(/hover:(-?translate|scale|rotate)/.test(readFileSync(f, 'utf8')), f).toBe(false)
  })
})
