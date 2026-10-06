import type { ReactNode } from 'react'
import Footer from './Footer'
import Header from './Header'

/**
 * Paginaschil: skiplink, header, main en footer. Staat in app/layout.tsx, dus
 * pagina's leveren alleen hun inhoud (met Container uit components/ui voor de breedte).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#inhoud"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-primary focus:shadow-lg focus:ring-2 focus:ring-primary"
      >
        Naar de inhoud
      </a>
      <Header />
      <main id="inhoud" tabIndex={-1} className="flex-1 pt-6 outline-none sm:pt-10">
        {children}
      </main>
      <Footer />
    </div>
  )
}
