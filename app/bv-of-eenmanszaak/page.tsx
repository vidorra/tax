import type { Metadata } from 'next'
import { RechtsvormCalculator } from '@/components/deel/RechtsvormCalculator'
import { DeelPagina } from '@/components/deel/Opbouw'
import { artikelHref } from '@/components/kennisbank/artikelen'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatEuro, formatPct } from '@/components/ui/format'
import { STANDAARD_JAAR, getJaar } from '@/lib/tax/years'
import { SITE } from '@/lib/site'

const TITEL = 'BV of eenmanszaak: wat levert het op?'
const BESCHRIJVING =
  'Vergelijk indicatief je eenmanszaak met een BV: inkomstenbelasting tegenover Vpb, gebruikelijk loon en box 2, met de kosten van de overstap. Voor 2026 en 2027.'

export const metadata: Metadata = {
  title: TITEL,
  description: BESCHRIJVING,
  alternates: { canonical: '/bv-of-eenmanszaak/' },
  openGraph: { title: TITEL, description: BESCHRIJVING, url: '/bv-of-eenmanszaak/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

export default function RechtsvormPagina() {
  const p = getJaar(STANDAARD_JAAR)
  const vpb = p.overig.waarde.vpb
  const b2 = p.box2.waarde
  const normStatus = p.box2.veldStatus?.gebruikelijkLoonNorm ?? p.box2.status
  return (
    <DeelPagina
      titel={TITEL}
      badge={p.status !== 'definitief' ? <StatusBadge status={p.status} /> : undefined}
      intro={
        <p>
          In een eenmanszaak betaal je inkomstenbelasting over je winst, met zelfstandigenaftrek en MKB-winstvrijstelling. In een BV betaalt de BV vennootschapsbelasting (
          {STANDAARD_JAAR}: {formatPct(vpb.laag, 1)} tot {formatEuro(vpb.grens)}, daarboven {formatPct(vpb.hoog, 1)}) en neem je jezelf in loondienst tegen een gebruikelijk
          loon van minimaal {formatEuro(b2.gebruikelijkLoonNorm)}
          {normStatus !== 'definitief' ? ' (normbedrag nog niet definitief)' : ''}. Wat je daarna als dividend uitkeert, valt in box 2. Deze rekenhulp zet beide naast elkaar.
        </p>
      }
      lezen={[
        { href: artikelHref('zelfstandigenaftrek-en-mkb-vrijstelling'), label: 'Zelfstandigenaftrek en MKB-winstvrijstelling' },
        { href: artikelHref('wat-verandert-er-in-2027'), label: "Wat verandert er in 2027 voor zzp'ers?" },
      ]}
    >
      <RechtsvormCalculator />
    </DeelPagina>
  )
}
