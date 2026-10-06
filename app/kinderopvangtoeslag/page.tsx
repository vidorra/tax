import type { Metadata } from 'next'
import { KinderopvangCalculator } from '@/components/deel/KinderopvangCalculator'
import { DeelPagina } from '@/components/deel/Opbouw'
import { artikelHref } from '@/components/kennisbank/artikelen'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatEuro, formatPct } from '@/components/ui/format'
import { STANDAARD_JAAR, getJaar } from '@/lib/tax/years'
import { SITE } from '@/lib/site'

const TITEL = 'Kinderopvangtoeslag berekenen'
const BESCHRIJVING =
  "Bereken je kinderopvangtoeslag per kind, per maand en per jaar, met je eigen bijdrage, het kindgebonden budget en de kinderbijslag. Met 2026 en 2027 naast elkaar."

export const metadata: Metadata = {
  title: TITEL,
  description: BESCHRIJVING,
  alternates: { canonical: '/kinderopvangtoeslag/' },
  openGraph: { title: TITEL, description: BESCHRIJVING, url: '/kinderopvangtoeslag/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

export default function KinderopvangPagina() {
  const p = getJaar(STANDAARD_JAAR)
  const t = p.toeslagen
  const kot = t.waarde.kot
  const hoogste = kot.tabel[0]
  return (
    <DeelPagina
      titel={TITEL}
      badge={t.status !== 'definitief' ? <StatusBadge status={t.status} /> : undefined}
      intro={
        <p>
          De kinderopvangtoeslag hangt af van je toetsingsinkomen en het aantal opvanguren. In {STANDAARD_JAAR} telt de toeslag over maximaal {kot.maxUrenPerMaand} uur
          per kind per maand, en over een uurprijs van hoogstens {formatEuro(kot.maxUurprijs.dagopvang, { decimalen: 2 })} voor dagopvang,{' '}
          {formatEuro(kot.maxUurprijs.bso, { decimalen: 2 })} voor buitenschoolse opvang en {formatEuro(kot.maxUurprijs.gastouder, { decimalen: 2 })} voor gastouderopvang.
          {hoogste && ` Bij een laag inkomen krijg je voor het eerste kind ${formatPct(hoogste.pctKind1, 1)} vergoed.`} Vraag de toeslag op tijd aan: met terugwerkende
          kracht kan het maar {kot.terugwerkendeMaanden} maanden.
        </p>
      }
      lezen={[
        { href: artikelHref('kinderopvangtoeslag-voor-zzpers'), label: "Kinderopvangtoeslag voor zzp'ers" },
        { href: artikelHref('combinatiekorting-iack'), label: 'Combinatiekorting (IACK) voor zzp-ouders' },
      ]}
    >
      <KinderopvangCalculator />
    </DeelPagina>
  )
}
