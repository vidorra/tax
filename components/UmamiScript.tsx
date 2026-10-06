import Script from 'next/script'
import { umamiScript } from '@/lib/umami'

/**
 * Umami: cookieless analytics, geen persoonsgegevens en geen bedragen.
 * Rendert alleen iets als NEXT_PUBLIC_UMAMI_WEBSITE_ID en NEXT_PUBLIC_UMAMI_SRC zijn gezet; next.config.js
 * staat dezelfde host toe in de CSP. Querystring en hash worden niet meegestuurd, zodat invoer in een
 * deellink nooit in de statistieken belandt.
 */
export default function UmamiScript() {
  const umami = umamiScript(process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID, process.env.NEXT_PUBLIC_UMAMI_SRC)
  if (!umami) return null
  return (
    <Script
      src={umami.src}
      data-website-id={umami.websiteId}
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
      strategy="afterInteractive"
    />
  )
}
