import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Origin van het optionele Umami-script uit NEXT_PUBLIC_UMAMI_SRC (zie lib/umami.ts). Zonder die variabele, of met
 * een ongeldige URL, staat de CSP geen externe host toe en is er geen statistiek.
 */
function umamiOrigin() {
  const src = process.env.NEXT_PUBLIC_UMAMI_SRC?.trim()
  if (!src) return ''
  try {
    const url = new URL(src)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : ''
  } catch {
    return ''
  }
}

/**
 * Beveiligingsheaders voor alle routes. De CSP staat 'unsafe-inline' toe voor scripts omdat Next.js
 * zonder nonce inline scripts in de HTML zet (een nonce vraagt middleware op elke route en maakt alle
 * pagina's dynamisch). 'unsafe-eval' en ws: alleen in development (React Refresh en HMR).
 * worker-src 'self' blob: voor de Web Worker van de calculator, img-src data: voor de QR-code bij de
 * installatie en blob: voor de PDF- en JSON-downloads.
 */
function beveiligingsHeaders() {
  const dev = process.env.NODE_ENV === 'development'
  const umami = umamiOrigin()
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}${umami ? ` ${umami}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${umami ? ` ${umami}` : ''}${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  const headers = [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ]
  // HSTS alleen in productie (achter HTTPS van de reverse proxy); browsers negeren het over http.
  if (process.env.NODE_ENV === 'production') headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' })
  return headers
}

const PRIVE = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'no-store' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root so file tracing ignores lockfiles in parent directories.
  outputFileTracingRoot: __dirname,
  // Lint runs separately (npm run lint); type errors still fail the build.
  eslint: { ignoreDuringBuilds: true },
  trailingSlash: true,
  compress: true,
  poweredByHeader: false,
  // nodemailer (alleen het SMTP-pad van de back-upmail) niet bundelen maar uit node_modules laden,
  // zodat de server dezelfde code draait als de tests.
  serverExternalPackages: ['nodemailer'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: beveiligingsHeaders() },
      { source: '/dossier/:path*', headers: PRIVE },
      { source: '/api/dossier/:path*', headers: PRIVE },
    ]
  },
}

export default nextConfig
