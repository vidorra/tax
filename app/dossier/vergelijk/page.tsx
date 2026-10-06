import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Container, PageHeader } from '@/components/ui'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { Vergelijk } from '@/components/dossier/Vergelijk'
import { laadAlleInvoer } from '@/lib/dossier/opslag'
import { databaseMelding, paginaContext } from '@/lib/dossier/pagina'
import { getJaar } from '@/lib/tax/years'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vergelijken' }

export default async function VergelijkPagina() {
  const ctx = await paginaContext()
  if (ctx.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={ctx.ontbreekt} />
  if (ctx.soort === 'fout') return <DatabaseFout melding={ctx.melding} />
  let jaren
  try {
    jaren = await laadAlleInvoer(ctx.householdId)
  } catch (e) {
    return <DatabaseFout melding={databaseMelding(e)} />
  }
  return (
    <Container breedte="normaal">
      <Link href="/dossier/" className="mb-3 inline-flex min-h-[36px] items-center gap-1 text-sm text-gray-600 transition-colors hover:text-primary">
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        Alle jaren
      </Link>
      <PageHeader kicker="Dossier" titel="Vergelijken" intro="Twee jaren naast elkaar, of één jaar met twee sets parameters (zoals de twee voorstellen voor 2027). Per regel zie je het verschil." />
      <Vergelijk
        jaren={jaren.map((j) => {
          const p = getJaar(j.jaar)
          return { jaar: j.jaar, variant: j.variant, invoer: j.invoer, status: p.status, varianten: p.varianten.map((v) => ({ id: v.id, label: v.label, status: v.status })) }
        })}
      />
    </Container>
  )
}
