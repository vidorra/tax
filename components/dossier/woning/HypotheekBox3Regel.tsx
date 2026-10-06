'use client'

/**
 * Ronde 2 (A2): alleen-lezen regel bij de schulden in Vermogen (markering vermogen-schuld-eigenwoning-A2): het deel van
 * de hypotheek dat geen eigenwoningschuld is (bijleenregeling, aflossingseis). Zo vul je het niet dubbel in. Staat dat
 * deel al als box 3-schuld met herkomst 'eigenwoningschuld' in de invoer (de doorrol van vorig jaar), dan niet nog eens.
 */
import type { HuishoudenInvoer, HuishoudenResultaat } from '@/lib/tax/types'
import { AfgeleideRegel } from '../regelingen/AfgeleideRegel'

export function HypotheekBox3Regel({ invoer, resultaat }: { invoer: HuishoudenInvoer; resultaat: HuishoudenResultaat | null | undefined }) {
  const splitsing = resultaat?.eigenWoning?.leningsplitsing ?? []
  const leningdelen = invoer.eigenWoning?.leningdelen ?? []
  const alInBox3 = new Set(invoer.box3.schulden.filter((s) => s.herkomst?.bron === 'eigenwoningschuld').map((s) => s.herkomst!.sleutel))
  const regels = splitsing
    .map((s, i) => ({ s, l: leningdelen[i] }))
    .filter(({ s, l }) => s.anderEind > 0 && !l?.eigenwoningschuld && !alInBox3.has(l?.id ?? l?.omschrijving ?? ''))
    .map(({ s }) => {
      const naam = s.omschrijving?.trim() || 'Leningdeel'
      // Al op 1 januari geen eigenwoningschuld (aflossingseis): box 3-schuld van dit jaar; anders (bijleenregeling) vanaf volgend jaar.
      return s.anderBegin > 0
        ? { label: `${naam}, schuld op 1 januari ${invoer.jaar}`, bedrag: s.anderBegin }
        : { label: `${naam}, in box 3 vanaf 1 januari ${invoer.jaar + 1}`, bedrag: s.anderEind }
    })
  if (regels.length === 0) return null
  const totaal = regels.reduce((t, r) => t + r.bedrag, 0)
  return (
    <AfgeleideRegel
      className="mt-3"
      titel="Deel van je hypotheek (geen eigenwoningschuld)"
      regels={regels.length > 1 ? [...regels, { label: 'Samen', bedrag: totaal }] : regels}
      aanpassen={{ label: 'Aanpassen bij Eigen woning', href: '#woning' }}
    />
  )
}
