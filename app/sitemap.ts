import type { MetadataRoute } from 'next'
import { ARTIKELEN, artikelHref } from '@/components/kennisbank/artikelen'
import { PUBLIEKE_ROUTES, absoluteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const nu = new Date()
  const routes: MetadataRoute.Sitemap = PUBLIEKE_ROUTES.map((r) => ({
    url: absoluteUrl(r.href),
    lastModified: nu,
    changeFrequency: r.frequentie,
    priority: r.prioriteit,
  }))
  const artikelen: MetadataRoute.Sitemap = ARTIKELEN.map((a) => ({
    url: absoluteUrl(artikelHref(a.slug)),
    lastModified: new Date(`${a.bijgewerkt}T00:00:00Z`),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))
  return [...routes, ...artikelen]
}
