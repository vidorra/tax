import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IbCalculator } from '@/components/calculator/IbCalculator'
import { artikelHref } from '@/components/kennisbank/artikelen'
import { Tabel } from '@/components/kennisbank/Tabel'
import { Alert } from '@/components/ui/Alert'
import { Container } from '@/components/ui/Container'
import { formatDatum } from '@/components/ui/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { parameterRijen, parameterRijenMetVarianten } from '@/lib/calculator/parameters'
import { SITE, pad } from '@/lib/site'
import { BESCHIKBARE_JAREN, CONCEPT_JAREN, STANDAARD_JAAR, getJaar, laagsteStatus } from '@/lib/tax/years'

export const dynamicParams = false

/** Verwachte stemmingen over het Belastingplan van een lopend jaar (uit de toelichting van de jaarmodule). */
const STEMMINGEN: Record<number, { tweedeKamer: string; eersteKamer: string }> = {
  2027: { tweedeKamer: '2026-11-12', eersteKamer: '2026-12-15' },
}

export function generateStaticParams() {
  return BESCHIKBARE_JAREN().map((jaar) => ({ jaar: String(jaar) }))
}

function leesJaar(ruw: string): number | null {
  if (!/^\d{4}$/.test(ruw)) return null
  const jaar = Number(ruw)
  return BESCHIKBARE_JAREN().includes(jaar) ? jaar : null
}

function intro(jaar: number): string {
  const p = getJaar(jaar)
  if (CONCEPT_JAREN.includes(jaar)) {
    return `Een eerste verkenning van ${jaar}. De meeste bedragen zijn nog geschat op basis van de indexatieregels en lopende wetsvoorstellen.`
  }
  if (p.varianten.length > 0) {
    return `De cijfers voor ${jaar} komen uit het Belastingplan en zijn nog niet door het parlement aangenomen. We rekenen met beide voorstellen die nu op tafel liggen.`
  }
  if (jaar < STANDAARD_JAAR) {
    return `Reken je aangifte over ${jaar} na of controleer de berekening van je boekhouder. Bekijk hieronder de belangrijkste parameters van ${jaar}.`
  }
  return `Bereken wat je over ${jaar} aan inkomstenbelasting en Zvw betaalt, van winst tot te betalen bedrag. Hieronder de belangrijkste parameters van ${jaar}.`
}

export async function generateMetadata({ params }: { params: Promise<{ jaar: string }> }): Promise<Metadata> {
  const { jaar: ruw } = await params
  const jaar = leesJaar(ruw)
  if (!jaar) return {}
  const titel = `Inkomstenbelasting ${jaar} voor zzp'ers berekenen`
  const beschrijving = `Bereken je inkomstenbelasting ${jaar} als zzp'er: schijven, zelfstandigenaftrek, MKB-winstvrijstelling, heffingskortingen, Zvw en box 3, met de status van elk cijfer. ${SITE.disclaimer}.`
  const canonical = pad(`/${jaar}`)
  return {
    title: titel,
    description: beschrijving,
    alternates: { canonical },
    openGraph: { title: titel, description: beschrijving, url: canonical, siteName: SITE.naam, locale: SITE.locale, type: 'website' },
  }
}

export default async function JaarPagina({ params }: { params: Promise<{ jaar: string }> }) {
  const { jaar: ruw } = await params
  const jaar = leesJaar(ruw)
  if (!jaar) notFound()

  const p = getJaar(jaar)
  const status = laagsteStatus(p)
  const concept = CONCEPT_JAREN.includes(jaar)
  const metVarianten = p.varianten.length > 0
  const stemming = STEMMINGEN[jaar]

  const badge = (s: Parameters<typeof StatusBadge>[0]['status']) => <StatusBadge status={s} klein tooltipKant="rechts" />

  let tabel
  let mobiel
  if (metVarianten) {
    const { varianten, rijen } = parameterRijenMetVarianten(jaar)
    mobiel = (
      <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label={`Belangrijkste parameters ${jaar}`}>
        {rijen.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <p className="text-sm text-gray-900">{r.label}</p>
            <dl className="mt-1.5 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-xs text-gray-500">Sleuteltabel</dt>
                <dd className="flex items-center gap-2 tabular-nums">
                  {r.waarde}
                  {badge(r.status)}
                </dd>
              </div>
              {r.varianten.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-gray-500">{varianten[i]?.label}</dt>
                  <dd className={`flex items-center gap-2 tabular-nums ${v.waarde !== r.waarde ? 'font-medium text-gray-900' : ''}`}>
                    {v.waarde}
                    {badge(v.status)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    )
    tabel = (
      <Tabel
        bijschrift={`Belangrijkste parameters ${jaar}: beide voorstellen naast elkaar`}
        kop={['Parameter', 'Sleuteltabel (Prinsjesdag)', ...varianten.map((v) => v.label)]}
        getallenVanaf={1}
        rijen={rijen.map((r) => [
          r.label,
          <span key="a" className="inline-flex items-center justify-end gap-2">
            {r.waarde}
            {badge(r.status)}
          </span>,
          ...r.varianten.map((v) => (
            <span key={v.id} className={`inline-flex items-center justify-end gap-2 ${v.waarde !== r.waarde ? 'font-medium text-gray-900' : ''}`}>
              {v.waarde}
              {badge(v.status)}
            </span>
          )),
        ])}
        noot="Vetgedrukt: wijkt af van de sleuteltabel. De statuslabels geven aan hoe zeker elk cijfer is."
      />
    )
  } else {
    const rijen = parameterRijen(p)
    mobiel = (
      <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label={`Belangrijkste parameters ${jaar}`}>
        {rijen.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 text-gray-800">{r.label}</span>
            <span className="flex flex-shrink-0 items-center gap-2 tabular-nums text-gray-900">
              {r.waarde}
              {badge(r.status)}
            </span>
          </li>
        ))}
      </ul>
    )
    tabel = (
      <Tabel
        bijschrift={`Belangrijkste parameters ${jaar}`}
        kop={['Parameter', 'Waarde', 'Status']}
        getallenVanaf={1}
        rijen={rijen.map((r) => [r.label, r.waarde, badge(r.status)])}
        noot={`Bijgewerkt op ${formatDatum(p.bijgewerkt)}. Tarieven in schijf 1 inclusief premies volksverzekeringen, voor wie de AOW-leeftijd nog niet heeft bereikt.`}
      />
    )
  }

  return (
    <Container breedte="breed">
      <PageHeader
        kicker="Inkomstenbelasting"
        badge={concept ? <StatusBadge status="geschat" label="Concept" /> : status !== 'definitief' ? <StatusBadge status={status} /> : undefined}
        titel={`Inkomstenbelasting ${jaar} voor zzp'ers`}
        intro={<p>{intro(jaar)}</p>}
      />

      {concept && (
        <Alert variant="let-op" titel={`${jaar} is een concept`} className="mb-6">
          Deze pagina laat zien waar we nu van uitgaan. De bedragen voor {jaar} worden pas in de loop van {jaar - 1} bekend; tot die tijd zijn ze geschat en kunnen ze flink
          veranderen.
        </Alert>
      )}

      {metVarianten && stemming && (
        <Alert variant="info" titel="Nog niet aangenomen" className="mb-6">
          De Tweede Kamer stemt naar verwachting op {formatDatum(stemming.tweedeKamer)} over het Belastingplan, de Eerste Kamer op {formatDatum(stemming.eersteKamer)}. Tot die tijd
          kunnen de bedragen nog veranderen.{' '}
          <Link href={pad(artikelHref('wat-verandert-er-in-2027'))} className="font-medium text-primary underline-offset-2 hover:text-primary-dark hover:underline">
            Lees wat er verandert in 2027
          </Link>
          .
        </Alert>
      )}

      <section aria-labelledby="parameters-titel" className="mb-10">
        <h2 id="parameters-titel" className="mb-3 text-lg font-semibold text-gray-900">
          Belangrijkste parameters {jaar}
        </h2>
        <div className="hidden sm:block">{tabel}</div>
        <div className="sm:hidden">
          {mobiel}
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            {metVarianten ? 'Vetgedrukt: wijkt af van de sleuteltabel.' : `Bijgewerkt op ${formatDatum(p.bijgewerkt)}.`} De statuslabels geven aan hoe zeker elk cijfer is.
          </p>
        </div>
      </section>

      <h2 className="mb-4 text-xl font-semibold text-gray-900">Bereken je inkomstenbelasting {jaar}</h2>
      <IbCalculator beginJaar={jaar} />
    </Container>
  )
}
