import type { MetadataRoute } from 'next'
import { NIET_INDEXEREN, SITE } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...NIET_INDEXEREN],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
  }
}
