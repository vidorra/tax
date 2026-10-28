import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Container, PageHeader } from '@/components/ui'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { KoppelingenBeheer } from '@/components/dossier/koppelingen/KoppelingenBeheer'
import { paginaContext } from '@/lib/dossier/pagina'
import { laadAlleInvoer } from '@/lib/dossier/opslag'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Koppelingen', robots: { index: false, follow: false } }

export default async function KoppelingenPagina() {
  const ctx = await paginaContext()
  if (ctx.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={ctx.ontbreekt} titel="Koppelingen" />
  if (ctx.soort === 'fout') return <DatabaseFout melding={ctx.melding} />
  // Namen voor "Van wie" uit het nieuwste jaar; zonder jaren of zonder naam de terugval Persoon A en B.
  let namen = { A: 'Persoon A', B: 'Persoon B' }
  try {
    const nieuwste = (await laadAlleInvoer(ctx.householdId)).sort((a, b) => b.jaar - a.jaar)[0]
    const naam = (id: 'A' | 'B') => nieuwste?.invoer.personen.find((p) => p.id === id)?.naam?.trim()
    namen = { A: naam('A') || namen.A, B: naam('B') || namen.B }
  } catch {
    // Namen zijn een gemak; zonder laden ze de koppelingen gewoon met de terugval.
  }
  return (
    <Container breedte="normaal">
      <Link href="/dossier/" className="mb-3 inline-flex min-h-[36px] items-center gap-1 text-sm text-gray-600 transition-colors hover:text-primary">
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        Alle jaren
      </Link>
      <PageHeader
        kicker="Dossier"
        titel="Koppelingen"
        intro="Haal de cijfers van je onderneming op uit Moneybird, zodat je ze niet zelf hoeft over te typen. Je houdt zelf de controle over wat er in je dossier komt."
      />
      <KoppelingenBeheer namen={namen} />
    </Container>
  )
}
