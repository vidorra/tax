/**
 * Het optionele Umami-script: website-id en script-URL uit de omgeving (NEXT_PUBLIC_UMAMI_WEBSITE_ID en
 * NEXT_PUBLIC_UMAMI_SRC). Ontbreekt een van de twee, of is de URL geen http(s), dan geen statistiek.
 * next.config.js haalt de host voor de CSP uit dezelfde URL.
 */
export function umamiScript(websiteId: string | undefined, src: string | undefined): { websiteId: string; src: string } | null {
  const id = websiteId?.trim()
  const bron = src?.trim()
  if (!id || !bron) return null
  try {
    const url = new URL(bron)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return { websiteId: id, src: url.href }
  } catch {
    return null
  }
}
