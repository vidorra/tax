import { Container } from '@/components/ui'
import { ExportPagina } from '@/components/dossier/ExportPagina'
import { JaarKop } from '@/components/dossier/JaarKop'
import { JaarOntbreekt } from '@/components/dossier/JaarOntbreekt'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { AangifteStaatProvider } from '@/components/dossier/useAangifteStaat'
import type { AccountantRegels } from '@/lib/dossier/accountant'
import { laadGegevens } from '@/lib/dossier/gegevens'
import { laadJaarPagina } from '@/lib/dossier/jaar-pagina'
import { laadAccountant, laadJaar } from '@/lib/dossier/opslag'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { HuishoudenGegevens } from '@/lib/rapport/model'
import { toolVersieTekst } from '@/lib/rapport/export'
import pakket from '@/package.json'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ jaar: string }> }

export async function generateMetadata({ params }: Props) {
  return { title: `Export ${(await params).jaar}` }
}

export default async function ExportJaarPagina({ params }: Props) {
  const p = await laadJaarPagina((await params).jaar)
  if (p.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={p.ontbreekt} />
  if (p.soort === 'fout') return <DatabaseFout melding={p.melding} />
  if (p.soort === 'leeg') return <JaarOntbreekt jaar={p.jaar} />
  const d = p.detail

  // Voor het rapport: de bedragen van de accountant (verschillenlijst) en de persoonlijke gegevens (voorblad,
  // hoofdstuk 1). Lukt het laden niet, dan komt het rapport er zonder; de pagina meldt dat. Alleen de naam van
  // de fout gaat naar de log, nooit de inhoud.
  const laadFouten: string[] = []
  let accountant: AccountantRegels | null = null
  try {
    accountant = (await laadAccountant(p.householdId, d.jaar))?.regels ?? null
  } catch (e) {
    console.error(`[dossier/export] accountantsbedragen laden mislukt: ${(e as Error)?.name ?? 'onbekend'}`)
    laadFouten.push('De bedragen van je accountant konden niet worden geladen; het rapport komt er zonder vergelijking.')
  }
  let gegevens: HuishoudenGegevens | null = null
  let gegevensFout: string | null = null
  try {
    gegevens = (await laadGegevens({ userId: p.userId, householdId: p.householdId }))?.gegevens ?? null
  } catch (e) {
    console.error(`[dossier/export] persoonlijke gegevens laden mislukt: ${(e as Error)?.name ?? 'onbekend'}`)
    gegevensFout = 'Je persoonlijke gegevens konden niet worden geladen; het rapport komt er zonder adres en samenlevingsvorm.'
  }

  // Ronde 2 (A3): de invoer van vorig jaar voor de controles (beginbalans, saldi); lukt het niet, dan zonder.
  let vorigInvoer: HuishoudenInvoer | null = null
  if (p.vorigJaarBestaat) {
    try {
      vorigInvoer = (await laadJaar(p.householdId, d.jaar - 1, { controles: false }))?.invoer ?? null
    } catch (e) {
      console.error(`[dossier/export] vorig jaar laden mislukt: ${(e as Error)?.name ?? 'onbekend'}`)
    }
  }

  // Ronde 2 (A3): één aangiftestaat voor de pagina (negeren in de poort, controles.streng bij het openen).
  return (
    <AangifteStaatProvider jaar={d.jaar} beginStaat={p.staat}>
      <Container breedte="smal">
        <JaarKop
          jaar={d.jaar}
          tab="export"
          titel={`Export ${d.jaar}`}
          intro="Download het fiscaal rapport als PDF of Excel, de rekenuitleg als PDF of de invoer als JSON. Gebaseerd op de opgeslagen invoer."
          status={d.status}
          paramsStatus={p.paramsStatus}
          badges={p.badges}
        />
        <ExportPagina
          jaar={d.jaar}
          invoer={d.invoer}
          variant={d.variant}
          variantLabel={p.varianten.find((v) => v.id === d.variant)?.label ?? null}
          status={d.status}
          paramsStatus={p.paramsStatus}
          vandaag={new Date().toISOString().slice(0, 10)}
          accountant={accountant}
          gegevens={gegevens}
          toolVersie={toolVersieTekst(pakket.version, process.env.GIT_SHA)}
          laadFouten={laadFouten}
          gegevensFout={gegevensFout}
          ingediend={d.ingediend ?? null}
          vorigInvoer={vorigInvoer}
        />
      </Container>
    </AangifteStaatProvider>
  )
}
