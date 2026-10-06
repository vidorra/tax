/**
 * Ronde 2 (A5): kaart "Bronbelasting terugvragen" op het overzicht (markering overzicht-terugvragen-A5), alleen als er
 * over de jaren heen verzoeken openstaan. De gegevens laadt app/dossier/page.tsx met lib/dossier/terugvragen-opslag.ts.
 */
import { Globe } from 'lucide-react'
import type { OpenTerugvragen } from '@/lib/dossier/terugvragen'
import { ButtonLink, Card, formatDatum } from '@/components/ui'
import { euroCent } from './notatie'

export function TerugvraagKaart({ open }: { open: OpenTerugvragen }) {
  if (open.aantal === 0 || open.jaar === null) return null
  const verzoeken = open.aantal === 1 ? `1 verzoek staat open: ${euroCent(open.bedrag)}.` : `${open.aantal} verzoeken staan open, samen ${euroCent(open.bedrag)}.`
  return (
    <Card as="section" aria-labelledby="terugvragen-kaart-titel">
      <div className="flex items-start gap-3">
        <div aria-hidden="true" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:h-5 [&>svg]:w-5">
          <Globe />
        </div>
        <div className="min-w-0 space-y-3">
          <h2 id="terugvragen-kaart-titel" className="text-base font-medium leading-snug text-gray-900">
            Bronbelasting terugvragen
          </h2>
          <p className="text-sm text-gray-700">
            {verzoeken}{' '}
            {open.eerste
              ? `De eerste termijn loopt af op ${formatDatum(open.eerste.datum)} (${open.eerste.landNaam}, ${open.eerste.jaar}).`
              : 'De termijnen staan niet vast; kijk ze na bij het bronland.'}
          </p>
          <ButtonLink href={`/dossier/${open.jaar}/planning/#terugvragen`} variant="secundair" grootte="sm">
            Bekijk in {open.jaar}
          </ButtonLink>
        </div>
      </div>
    </Card>
  )
}
