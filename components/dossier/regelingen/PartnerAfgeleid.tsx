'use client'

/**
 * Ronde 2 (A5): bij de partner onder Loon en uitkeringen (markering loon-afgeleid-A5) de alleen-lezen regel met wat uit
 * de onderneming van de ander komt: de beloning vanaf de drempel en het belaste resultaat uit terbeschikkingstelling.
 * Zo vult niemand het dubbel in bij "Resultaat uit overige werkzaamheden". Aanpassen gebeurt bij de onderneming.
 */
import { useMemo } from 'react'
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonInvoer } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { beloningVan, metPartner, ondernemingVanTbs, terbeschikkingstelling } from '@/lib/tax/modules/partner'
import { itemSleutel } from '@/lib/dossier/ids'
import { veldHref, veldVan } from '@/lib/dossier/veld'
import { persoonNaam } from '../secties/types'
import { AfgeleideRegel } from './AfgeleideRegel'

export function PartnerAfgeleid({ persoon, huishouden, jaar }: { persoon: PersoonInvoer; huishouden: { invoer: HuishoudenInvoer; resultaat: HuishoudenResultaat | null } | undefined; jaar: number }) {
  const invoer = huishouden?.invoer
  const params = useMemo(() => {
    try {
      return invoer ? getJaar(invoer.jaar, invoer.variant) : null
    } catch {
      return null
    }
  }, [invoer])
  if (!invoer || !params || !metPartner(invoer)) return null
  const ander = invoer.personen.find((p) => p.id !== persoon.id)
  if (!ander) return null
  const drempel = params.ondernemer.waarde.meewerkaftrek.maxVergoeding
  const beloningen = ander.ondernemingen
    .map((o, i) => ({ o, i, mp: beloningVan(o) }))
    .filter((x) => x.mp && x.mp.vergoeding >= drempel)
  const tbs = huishouden?.resultaat?.personen.find((p) => p.id === persoon.id)?.overigWerkDetail?.terbeschikkingstelling ?? terbeschikkingstelling(persoon, invoer, params)
  if (beloningen.length === 0 && !tbs) return null

  // Aanpassen bij de onderneming van de beloning, anders bij die van de eerste terbeschikkingstelling.
  const doel =
    beloningen[0] ??
    (persoon.terbeschikkingstellingen ?? [])
      .map((t) => ondernemingVanTbs(t, invoer))
      .filter((x) => x !== null)
      .map((x) => ({ o: x.onderneming, i: x.index }))[0]
  const meer = beloningen.length > 1
  return (
    <AfgeleideRegel
      titel={`Van de onderneming van ${persoonNaam(ander)}`}
      regels={[
        ...beloningen.map((b) => ({ label: meer ? `Beloning voor meewerken, ${b.o.naam}` : 'Beloning voor meewerken', bedrag: b.mp?.vergoeding ?? 0 })),
        ...(tbs ? [{ label: 'Terbeschikkingstelling, belast', bedrag: tbs.belastbaar }] : []),
      ]}
      {...(doel ? { aanpassen: { label: `Aanpassen bij ${doel.o.naam || 'de onderneming'}`, href: veldHref(jaar, veldVan.onderneming(ander.id, itemSleutel(doel.o, doel.i), 'samenwerkingMetPartner')) } } : {})}
    />
  )
}
