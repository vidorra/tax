import { Info, Percent } from 'lucide-react'
import Link from 'next/link'
import { FOOTER_LINKS, REKENTOOLS, SITE } from '@/lib/site'

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
                <Percent className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium text-gray-900">{SITE.naam}</span>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-gray-600">
              Reken je inkomstenbelasting als zzp&apos;er na, met uitleg per regel en bij elk cijfer of het al vaststaat. Een onafhankelijk project, niet verbonden aan de Belastingdienst.
            </p>
          </div>

          <nav aria-label="Rekentools">
            <h2 className="mb-3 text-sm font-medium text-gray-500">Rekentools</h2>
            <ul className="space-y-2">
              {REKENTOOLS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-600 transition-colors hover:text-primary">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Informatie">
            <h2 className="mb-3 text-sm font-medium text-gray-500">Informatie</h2>
            <ul className="space-y-2">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-600 transition-colors hover:text-primary">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-gray-100 pt-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              {SITE.disclaimer}. Controleer belangrijke beslissingen met je adviseur of de Belastingdienst.{' '}
              <Link href="/disclaimer" className="underline underline-offset-2 transition-colors hover:text-primary">
                Lees de disclaimer
              </Link>
            </span>
          </p>
          <p>Statistieken zonder cookies</p>
        </div>
      </div>
    </footer>
  )
}
