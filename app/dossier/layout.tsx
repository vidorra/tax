import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: 'Privédossier', template: '%s | Privédossier' },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default function DossierLayout({ children }: { children: ReactNode }) {
  return <div className="pb-10">{children}</div>
}
