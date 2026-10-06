import type { Metadata } from 'next'
import { Box3Calculator } from '@/components/deel/Box3Calculator'
import { DeelPagina } from '@/components/deel/Opbouw'
import { artikelHref } from '@/components/kennisbank/artikelen'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatEuro, formatPct } from '@/components/ui/format'
import { STANDAARD_JAAR, getJaar, veldStatus } from '@/lib/tax/years'
import { SITE } from '@/lib/site'

const TITEL = 'Box 3 berekenen, met tegenbewijs'
const BESCHRIJVING =
  'Bereken je box 3-belasting over spaargeld, beleggingen en crypto, zie of tegenbewijs met je werkelijke rendement loont, en vergelijk de twee voorstellen voor 2027.'

export const metadata: Metadata = {
  title: TITEL,
  description: BESCHRIJVING,
  alternates: { canonical: '/box-3/' },
  openGraph: { title: TITEL, description: BESCHRIJVING, url: '/box-3/', siteName: SITE.naam, locale: SITE.locale, type: 'website' },
}

export default function Box3Pagina() {
  const p = getJaar(STANDAARD_JAAR)
  const b3 = p.box3.waarde
  const bankStatus = veldStatus(p, 'box3', 'forfaitBank')
  return (
    <DeelPagina
      titel={TITEL}
      badge={p.box3.status !== 'definitief' || bankStatus !== 'definitief' ? <StatusBadge status={bankStatus} /> : undefined}
      intro={
        <p>
          In box 3 betaal je belasting over een verondersteld rendement op je vermogen van 1 januari. In {STANDAARD_JAAR} rekent de Belastingdienst met{' '}
          {formatPct(b3.forfaitBank)} op spaargeld, {formatPct(b3.forfaitOverig)} op beleggingen en andere bezittingen en {formatPct(b3.forfaitSchulden)} op schulden. Over het
          deel boven het heffingsvrij vermogen van {formatEuro(b3.heffingsvrijVermogen)} per persoon betaal je {formatPct(b3.tarief, 0)}. Was je werkelijke rendement lager,
          dan kun je dat aantonen met tegenbewijs.
        </p>
      }
      lezen={[
        { href: artikelHref('box-3-2027-twee-varianten'), label: 'Box 3 in 2027: twee varianten naast elkaar' },
        { href: artikelHref('wat-verandert-er-in-2027'), label: "Wat verandert er in 2027 voor zzp'ers?" },
      ]}
    >
      <Box3Calculator />
    </DeelPagina>
  )
}
