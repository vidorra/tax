import { Alert, ButtonLink, Container, StatusBadge, formatDatum } from '@/components/ui'
import { AangifteStaatProvider } from '@/components/dossier/useAangifteStaat'
import { AangifteInvullen } from '@/components/dossier/aangifte/AangifteInvullen'
import { JaarKop } from '@/components/dossier/JaarKop'
import { JaarOntbreekt } from '@/components/dossier/JaarOntbreekt'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { laadJaarPagina } from '@/lib/dossier/jaar-pagina'
import { laadJaar } from '@/lib/dossier/opslag'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { indelingVoor } from '@/lib/invulhulp/indeling'
import { opentZin } from '@/lib/invulhulp/pagina'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ jaar: string }> }

export async function generateMetadata({ params }: Props) {
  return { title: `Aangifte ${(await params).jaar} invullen` }
}

const INTRO = 'Per scherm van de online aangifte de bedragen uit je dossier, in dezelfde volgorde. Kopieer een bedrag, vul het in bij de Belastingdienst en vink het af.'

/**
 * Ronde 2 (A1): Aangifte invullen. Eén aangiftestaat voor de hele pagina (ontwerp 2.3): de provider staat om JaarKop en
 * de inhoud, zodat de tabrij vóór navigatie kan flushen en de inhoud de vinkjes van de server meteen heeft.
 */
export default async function AangiftePagina({ params }: Props) {
  const p = await laadJaarPagina((await params).jaar)
  if (p.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={p.ontbreekt} />
  if (p.soort === 'fout') return <DatabaseFout melding={p.melding} />
  if (p.soort === 'leeg') return <JaarOntbreekt jaar={p.jaar} />
  const d = p.detail
  const vandaag = new Date().toISOString().slice(0, 10)
  const { indeling, meldingen } = indelingVoor(d.jaar)

  const indelingRegel =
    indeling.status === 'nagekeken' && indeling.nagekekenOp ? (
      <p className="mt-2 text-sm text-gray-500">
        Volgorde nagekeken tegen de aangifte over {indeling.aangiftejaar} op {formatDatum(indeling.nagekekenOp)}.
      </p>
    ) : (
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
        Nog niet nagekeken tegen de aangifte over {d.jaar}
        <StatusBadge status="voorlopig" klein />
      </p>
    )

  const kop = (
    <JaarKop
      jaar={d.jaar}
      tab="aangifte"
      titel={`Aangifte ${d.jaar} invullen`}
      intro={
        <>
          <p>{INTRO}</p>
          {!p.concept && indelingRegel}
        </>
      }
      status={d.status}
      paramsStatus={p.paramsStatus}
      badges={p.badges}
    />
  )

  if (p.concept) {
    return (
      <Container breedte="breed">
        {kop}
        <Alert variant="info">
          <p>Voor {d.jaar} bestaat nog geen aangifte. De cijfers van dit jaar zijn een concept. Gebruik de planning om vooruit te kijken.</p>
          <ButtonLink href={`/dossier/${d.jaar}/planning/`} grootte="sm" variant="secundair" className="mt-3">
            Naar de planning
          </ButtonLink>
        </Alert>
      </Container>
    )
  }

  // De invoer van vorig jaar voor de controles (beginbalans, saldi), zoals op Invoer en Export; lukt het niet, dan zonder.
  let vorigInvoer: HuishoudenInvoer | null = null
  if (p.vorigJaarBestaat) {
    try {
      vorigInvoer = (await laadJaar(p.householdId, d.jaar - 1, { controles: false }))?.invoer ?? null
    } catch (e) {
      console.error(`[dossier/aangifte] vorig jaar laden mislukt: ${(e as Error)?.name ?? 'onbekend'}`)
    }
  }

  const opent = opentZin(d.jaar, indeling.opentOp, vandaag)
  const verwacht = indeling.status === 'verwacht' && meldingen.length === 0 ? 'Hieronder staat de verwachte volgorde; die kan nog veranderen.' : null
  const zinnen = [opent, ...meldingen, opent ? verwacht : null].filter((x): x is string => Boolean(x))

  return (
    <Container breedte="breed">
      <AangifteStaatProvider jaar={d.jaar} beginStaat={p.staat}>
        {kop}
        <AangifteInvullen
          melding={zinnen.length > 0 ? zinnen.join(' ') : null}
          jaar={d.jaar}
          invoer={d.invoer}
          variant={d.variant}
          status={d.status}
          ingediend={d.ingediend ?? null}
          bijgewerkt={d.updatedAt}
          vandaag={vandaag}
          vorigInvoer={vorigInvoer}
        />
      </AangifteStaatProvider>
    </Container>
  )
}
