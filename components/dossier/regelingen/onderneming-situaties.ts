/**
 * Ronde 2, contract: bijzondere situaties per onderneming ("Bijzondere situatie toevoegen"). OndernemingSectie (onderdeel
 * regelingen onderneming, A6) toont de kiezer met de opties die nog niet actief zijn, en een blok per actieve situatie.
 * Elk onderdeel voegt zijn eigen situatie toe in ONDERNEMING_SITUATIES, op de eigen regel hieronder.
 */
import type { ReactNode } from 'react'
import type { HuishoudenInvoer, HuishoudenResultaat, OndernemingInvoer, OndernemingResultaat, PersoonInvoer, PersoonResultaat, TaxYearParams } from '@/lib/tax/types'
import type { SituatieOptie } from './SituatieKiezer'
import type { Wijzig } from '../secties/types'
import { PARTNER_SITUATIE } from './PartnerSituatie'
import { createElement } from 'react'
import { StakingSituatie, stakingHeeftBedragen } from './StakingSituatie'
import { HirSituatie, hirHeeftBedragen } from './HirSituatie'
import { EgalisatieSituatie, egalisatieHeeftBedragen } from './EgalisatieSituatie'
import { nieuweEgalisatie, nieuweHir } from './onderneming-regelingen'

export interface OndernemingSituatieContext {
  jaar: number
  params: TaxYearParams | null
  persoon: PersoonInvoer
  /** Index in `persoon.ondernemingen`, alleen om de invoer te lezen en te wijzigen. */
  ondernemingIndex: number
  /**
   * Ronde 2 (na de toets): `itemSleutel(onderneming, ondernemingIndex)` uit lib/dossier/ids.ts, de vaste id. Gebruik
   * deze voor veld-id's, ankers en verwijzingen (zoals `TerbeschikkingstellingInvoer.aan.ondernemingId`), nooit de index.
   */
  ondernemingId: string
  onderneming: OndernemingInvoer
  /** Wijzigt deze onderneming (zoals `pas` in de lijst). */
  pas: (fn: (o: OndernemingInvoer) => void) => void
  /** Het hele huishouden, voor situaties die ook de partner raken (alleen in het dossier). */
  huishouden?: { invoer: HuishoudenInvoer; wijzig: Wijzig; resultaat: HuishoudenResultaat | null }
  /** Live uitkomst van deze onderneming en persoon, als de berekening lukt. */
  uitkomst?: { onderneming: OndernemingResultaat | null; persoon: PersoonResultaat | null }
}

export interface OndernemingSituatie {
  /** Ook de id van de optie en het anker voor springen: `situatie-${id}-${persoon}-${ondernemingId}`. */
  id: string
  optie: SituatieOptie
  /** Kan deze situatie hier (bijvoorbeeld alleen met een fiscale partner)? */
  beschikbaar?: (ctx: OndernemingSituatieContext) => boolean
  /** Staat de situatie al in de invoer? Dan een blok, geen optie. Ingevulde gegevens worden nooit verborgen. */
  actief: (ctx: OndernemingSituatieContext) => boolean
  /** Toevoegen met lege of voorgestelde velden. */
  voegToe: (ctx: OndernemingSituatieContext) => void
  /** Weghalen; de ouder bewaart de oude invoer voor Ongedaan maken. */
  haalWeg: (ctx: OndernemingSituatieContext) => void
  /** Zijn er bedragen ingevuld (dan vraagt Weghalen om bevestiging)? */
  heeftBedragen: (ctx: OndernemingSituatieContext) => boolean
  /** Het blok, binnen een SituatieBlok dat de ouder tekent. */
  blok: (ctx: OndernemingSituatieContext) => ReactNode
  /** Kop van het blok, bijvoorbeeld "Gestopt, verkocht of omgezet in 2025". */
  titel: (ctx: OndernemingSituatieContext) => string
  /**
   * Ronde 2 (A6, optioneel): naam in lopende tekst voor de bevestiging bij Weghalen ("De bedragen bij {naam} verdwijnen
   * uit dit jaar."), bijvoorbeeld 'de herinvesteringsreserve'. Ontbreekt = het label van de optie.
   */
  naam?: string
}

export const ONDERNEMING_SITUATIES: OndernemingSituatie[] = [
  {
    id: 'staking',
    optie: { id: 'staking', label: 'Gestopt, verkocht of omgezet', uitleg: 'Stakingswinst, stakingsaftrek, vrijval van de oudedagsreserve, omzetting in een BV' },
    naam: 'de staking',
    actief: (ctx) => ctx.onderneming.staking !== undefined,
    voegToe: (ctx) => ctx.pas((x) => void (x.staking = { stakingswinst: 0, soort: 'geheel', gebeurtenis: 'gestopt' })),
    haalWeg: (ctx) => ctx.pas((x) => void delete x.staking),
    heeftBedragen: (ctx) => stakingHeeftBedragen(ctx.onderneming.staking),
    blok: (ctx) => createElement(StakingSituatie, { ctx }),
    titel: (ctx) => `Gestopt, verkocht of omgezet in ${ctx.jaar}`,
  },
  {
    id: 'hir',
    optie: { id: 'hir', label: 'Herinvesteringsreserve', uitleg: 'Boekwinst of een schadevergoeding reserveren voor een nieuwe investering' },
    naam: 'de herinvesteringsreserve',
    actief: (ctx) => (ctx.onderneming.herinvesteringsreserves ?? []).length > 0,
    voegToe: (ctx) => ctx.pas((x) => void (x.herinvesteringsreserves = [...(x.herinvesteringsreserves ?? []), nieuweHir(x, ctx.jaar)])),
    haalWeg: (ctx) =>
      ctx.pas((x) => {
        delete x.herinvesteringsreserves
        for (const inv of x.investeringen ?? []) delete inv.herinvesteringsreserve
      }),
    heeftBedragen: (ctx) => hirHeeftBedragen(ctx.onderneming),
    blok: (ctx) => createElement(HirSituatie, { ctx }),
    titel: () => 'Herinvesteringsreserve',
  },
  {
    id: 'egalisatie',
    optie: { id: 'egalisatie', label: 'Kostenegalisatiereserve', uitleg: 'Sparen voor groot onderhoud, zoals aan je bedrijfspand' },
    naam: 'de kostenegalisatiereserve',
    actief: (ctx) => (ctx.onderneming.egalisatiereserves ?? []).length > 0,
    voegToe: (ctx) => ctx.pas((x) => void (x.egalisatiereserves = [...(x.egalisatiereserves ?? []), nieuweEgalisatie(x)])),
    haalWeg: (ctx) => ctx.pas((x) => void delete x.egalisatiereserves),
    heeftBedragen: (ctx) => egalisatieHeeftBedragen(ctx.onderneming),
    blok: (ctx) => createElement(EgalisatieSituatie, { ctx }),
    titel: () => 'Kostenegalisatiereserve',
  },
  PARTNER_SITUATIE,
]
