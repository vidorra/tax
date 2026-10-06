/**
 * Samenwerken met de fiscale partner (ronde 2, onderdeel A5): beloning aan de meewerkende partner en
 * terbeschikkingstelling door de partner aan de onderneming. Zie fiscaal-ronde2.md 3.6 en taak-A5 hoofdstuk 6.
 *
 * Alleen met fiscaal partnerschap en twee personen. De keuze "Hoe werkt {partner} mee?" staat per onderneming in
 * `samenwerkingMetPartner` ('geen', 'meewerkaftrek', 'arbeidsbeloning', 'vof', 'loondienst'); `meewerkendePartner`
 * (uren, vergoeding, vergoedingInKosten) volgt eruit. Drempel: `ondernemer.meewerkaftrek.maxVergoeding`.
 *
 * Beloning (art. 3.16 lid 4):
 *  - vanaf de drempel: bij de ondernemer aftrekbaar (zit hij nog niet in de kosten, dan gaat hij van de winst af); bij
 *    de partner resultaat uit overige werkzaamheden en arbeidsinkomen. Geen meewerkaftrek.
 *  - onder de drempel: niet aftrekbaar (zit hij in de kosten, dan terugtellen) en niet belast; meewerkaftrek kan
 *    (bestaande module ondernemersaftrek, met de gecorrigeerde winst).
 *  - 'vof' en 'loondienst' rekent de tool niet door (melding).
 * De correctie gaat als `OndernemingContext.correctiePartner` naar de onderneming, vóór de FOR.
 *
 * Terbeschikkingstelling (art. 3.91, 3.95, 3.99b):
 *  - per regel resultaat = vergoeding − kosten − afschrijving (+ boekwinst bij einde), ook zonder vergoeding;
 *  - vrijstelling over het saldo van de persoon: AFRONDING.tbsVrijstelling(tbsVrijstellingPct × Σ resultaten), ook
 *    als dat negatief is; belastbaar = Σ − vrijstelling. Niet per regel afronden.
 *  - bij de partner overige werkzaamheden, geen arbeidsinkomen, wel bijdrage-inkomen Zvw en premiegrondslag;
 *  - de positie uit `box3PositieId` telt niet in box 3 (`buitenBox3`);
 *  - bij de onderneming (op `aan.ondernemingId`, terugval `ondernemingIndex`) een kost als die nog niet in de kosten zit;
 *  - een werkruimte telt alleen als de werkruimte van die onderneming aan de toets van art. 3.16 lid 1 voldoet
 *    (art. 3.93 lid 1 onder b); anders resultaat 0 en een vergoeding in de kosten is niet aftrekbaar (terugtellen).
 *
 * Puur: geen React, geen I/O. Afrondingen via AFRONDING.
 */
import type {
  HuishoudenInvoer,
  OndernemingInvoer,
  PersoonId,
  PersoonInvoer,
  TaxYearParams,
  TerbeschikkingstellingInvoer,
  TerbeschikkingstellingUitkomst,
  Uitlegregel,
  Waarschuwing,
} from '../types'
import { AFRONDING } from '../rounding'
import { eur, euro, pct, regel, waarschuwing } from '../uitleg'
import { zitInSaldo } from './onderneming/in-saldo'

/** De keuzes voor "Hoe werkt {partner} mee?" (OndernemingInvoer.samenwerkingMetPartner). */
export const SAMENWERKING_PARTNER = ['geen', 'meewerkaftrek', 'arbeidsbeloning', 'vof', 'loondienst'] as const
export const TBS_SOORTEN = ['zaak', 'lening', 'werkruimte', 'overig'] as const

const ANDER: Record<PersoonId, PersoonId> = { A: 'B', B: 'A' }

/** Fiscale partners met twee personen: alleen dan rekent deze module. */
export const metPartner = (h: Pick<HuishoudenInvoer, 'fiscaalPartner' | 'personen'>): boolean => h.fiscaalPartner === true && h.personen.length === 2

const naamVan = (p: { id: string; naam?: string } | undefined, id: string) => (p?.naam?.trim() ? p.naam.trim() : `Persoon ${id}`)

/** Rekent de tool een beloning aan de partner voor deze onderneming? 'vof', 'loondienst' en 'geen' niet. */
export function beloningVan(o: OndernemingInvoer): NonNullable<OndernemingInvoer['meewerkendePartner']> | null {
  const s = o.samenwerkingMetPartner
  if (s === 'geen' || s === 'vof' || s === 'loondienst') return null
  return o.meewerkendePartner ?? null
}

/** Werkruimtetoets van art. 3.16 lid 1 (zelfstandige werkruimte en het inkomen in of vanuit de werkruimte). */
export function werkruimteVoldoet(o: Pick<OndernemingInvoer, 'werkruimte'>, params: TaxYearParams): boolean {
  const w = o.werkruimte
  if (!w) return false
  const eis = params.ondernemer.waarde.werkruimte
  const zelfstandig = !eis.zelfstandigheidsEis || w.zelfstandig
  const inkomen = w.werkplekElders
    ? w.deelInkomenInOfVanuit >= eis.inkomensEisMetWerkplekElders[0] && w.deelInkomenIn >= eis.inkomensEisMetWerkplekElders[1]
    : w.deelInkomenIn >= eis.inkomensEisZonderWerkplekElders
  return zelfstandig && inkomen
}

/**
 * De onderneming die deze terbeschikkingstelling gebruikt: eerst op `aan.ondernemingId`; alleen zonder id op
 * `aan.ondernemingIndex` (oude invoer); zonder beide de enige onderneming van die persoon. Null als die er niet (meer) is:
 * een verwijzing op id blijft zo bij dezelfde onderneming, ook als de volgorde verandert.
 */
export function ondernemingVanTbs(t: Pick<TerbeschikkingstellingInvoer, 'aan'>, h: Pick<HuishoudenInvoer, 'personen'>): { persoon: PersoonInvoer; onderneming: OndernemingInvoer; index: number } | null {
  const p = h.personen.find((x) => x.id === t.aan.persoon)
  if (!p) return null
  let index = -1
  if (t.aan.ondernemingId) index = p.ondernemingen.findIndex((o) => o.id === t.aan.ondernemingId)
  else if (t.aan.ondernemingIndex !== undefined) index = p.ondernemingen[t.aan.ondernemingIndex] ? t.aan.ondernemingIndex : -1
  else if (p.ondernemingen.length === 1) index = 0
  return index >= 0 ? { persoon: p, onderneming: p.ondernemingen[index], index } : null
}

/** Telt deze terbeschikkingstelling? 'werkruimte': werkruimte die niet aan de toets voldoet; 'geen-onderneming': verwijzing weg. */
export function tbsTelt(t: TerbeschikkingstellingInvoer, h: Pick<HuishoudenInvoer, 'personen'>, params: TaxYearParams): 'ja' | 'werkruimte' | 'geen-onderneming' {
  const doel = ondernemingVanTbs(t, h)
  if (!doel) return 'geen-onderneming'
  if (t.soort === 'werkruimte' && !werkruimteVoldoet(doel.onderneming, params)) return 'werkruimte'
  return 'ja'
}

/**
 * Terbeschikkingstelling van één persoon (art. 3.91, 3.95, 3.99b): resultaat per regel, vrijstelling over het saldo.
 * Null zonder fiscale partner of zonder regels.
 */
export function terbeschikkingstelling(persoon: PersoonInvoer, huishouden: HuishoudenInvoer, params: TaxYearParams): TerbeschikkingstellingUitkomst | null {
  const lijst = persoon.terbeschikkingstellingen ?? []
  if (!metPartner(huishouden) || lijst.length === 0) return null
  const nietGeteld: NonNullable<TerbeschikkingstellingUitkomst['nietGeteld']> = []
  const regels: TerbeschikkingstellingUitkomst['regels'] = lijst.map((t) => {
    const telt = tbsTelt(t, huishouden, params)
    if (telt !== 'ja') {
      nietGeteld.push({ id: t.id, reden: telt })
      return { id: t.id, omschrijving: t.omschrijving, resultaat: 0 }
    }
    const kosten = Math.max(0, t.kosten ?? 0)
    const afschrijving = Math.max(0, t.afschrijving ?? 0)
    const begin = t.boekwaardeBegin ?? t.waardeBijAanvang
    const naAfschrijving = begin !== undefined ? Math.max(0, begin - afschrijving) : undefined
    if (t.einde) {
      // Einde of verkoop: het verschil tussen opbrengst en boekwaarde is resultaat (zoals winst, art. 3.95).
      const boekwinst = t.einde.opbrengst - (naAfschrijving ?? 0)
      return { id: t.id, omschrijving: t.omschrijving, resultaat: t.vergoeding - kosten - afschrijving + boekwinst, boekwinst, boekwaardeEind: 0 }
    }
    return {
      id: t.id,
      omschrijving: t.omschrijving,
      resultaat: t.vergoeding - kosten - afschrijving,
      ...(naAfschrijving !== undefined ? { boekwaardeEind: naAfschrijving } : {}),
    }
  })
  const resultaat = regels.reduce((s, r) => s + r.resultaat, 0)
  const vrijstelling = AFRONDING.tbsVrijstelling(params.ondernemer.waarde.tbsVrijstellingPct * resultaat)
  return { regels, resultaat, vrijstelling, belastbaar: resultaat - vrijstelling, ...(nietGeteld.length > 0 ? { nietGeteld } : {}) }
}

/** Uitleg van de terbeschikkingstelling bij de persoon die ter beschikking stelt. */
export function tbsUitleg(u: TerbeschikkingstellingUitkomst, params: TaxYearParams): Uitlegregel[] {
  const pctVrij = params.ondernemer.waarde.tbsVrijstellingPct
  return [
    ...u.regels.map((r) =>
      regel(`loon.tbs.${r.id}`, `Terbeschikkingstelling: ${r.omschrijving || 'zonder omschrijving'}`, r.resultaat, r.resultaat < 0 ? 'min' : 'plus', {
        niveau: 2,
        ...(r.boekwinst !== undefined ? { formule: `inclusief boekwinst ${eur(r.boekwinst)}` } : {}),
      }),
    ),
    regel('loon.tbs.vrijstelling', 'Terbeschikkingstellingsvrijstelling', -u.vrijstelling, u.vrijstelling >= 0 ? 'min' : 'plus', {
      niveau: 2,
      formule: `${pct(pctVrij, 0)} × ${eur(u.resultaat)} (over het saldo)`,
      parameter: 'ondernemer.tbsVrijstellingPct',
    }),
    regel('loon.tbs.belastbaar', 'Belastbaar resultaat uit terbeschikkingstelling', u.belastbaar, u.belastbaar < 0 ? 'min' : 'plus', { niveau: 1 }),
  ]
}

export interface CorrectiePartner {
  /** Correctie op de winst (negatief = lagere winst); 0 zonder correctie. */
  bedrag: number
  /** Uitleg per post (niveau 2), onder de ene regel die de onderneming zelf toont. */
  uitleg: Uitlegregel[]
}

/**
 * Correctie op de winst van één onderneming voor beloning aan en terbeschikkingstelling door de partner, voor
 * `OndernemingContext.correctiePartner` (vóór de FOR).
 */
export function correctiePartner(huishouden: HuishoudenInvoer, persoon: PersoonInvoer, onderneming: OndernemingInvoer, params: TaxYearParams): CorrectiePartner {
  const uit: CorrectiePartner = { bedrag: 0, uitleg: [] }
  if (!metPartner(huishouden)) return uit
  const drempel = params.ondernemer.waarde.meewerkaftrek.maxVergoeding
  const partner = huishouden.personen.find((p) => p.id === ANDER[persoon.id])
  const partnerNaam = naamVan(partner, ANDER[persoon.id])
  const sleutel = onderneming.id ?? onderneming.naam

  const mp = beloningVan(onderneming)
  if (mp && mp.vergoeding > 0) {
    const inKosten = zitInSaldo(mp.vergoedingInKosten, onderneming, 'partner')
    if (mp.vergoeding >= drempel && !inKosten) {
      uit.bedrag -= mp.vergoeding
      uit.uitleg.push(
        regel(`partner.${sleutel}.beloning`, `Beloning aan ${partnerNaam} (aftrekbaar, nog niet in de kosten)`, -mp.vergoeding, 'min', {
          niveau: 2,
          formule: `${eur(mp.vergoeding)} ≥ ${eur(drempel)}`,
          parameter: 'ondernemer.meewerkaftrek.maxVergoeding',
        }),
      )
    } else if (mp.vergoeding < drempel && inKosten) {
      uit.bedrag += mp.vergoeding
      uit.uitleg.push(
        regel(`partner.${sleutel}.beloning`, `Beloning aan ${partnerNaam} is niet aftrekbaar (onder de drempel)`, mp.vergoeding, 'plus', {
          niveau: 2,
          formule: `${eur(mp.vergoeding)} < ${eur(drempel)}`,
          parameter: 'ondernemer.meewerkaftrek.maxVergoeding',
        }),
      )
    }
  }

  for (const t of partner?.terbeschikkingstellingen ?? []) {
    const doel = ondernemingVanTbs(t, huishouden)
    if (!doel || doel.persoon.id !== persoon.id || doel.onderneming !== onderneming || t.vergoeding <= 0) continue
    const inKosten = zitInSaldo(t.vergoedingInKosten, onderneming, 'tbs')
    const telt = tbsTelt(t, huishouden, params)
    if (telt === 'ja' && !inKosten) {
      uit.bedrag -= t.vergoeding
      uit.uitleg.push(regel(`partner.${sleutel}.tbs.${t.id}`, `Vergoeding aan ${partnerNaam} voor ${t.omschrijving || 'terbeschikkingstelling'} (nog niet in de kosten)`, -t.vergoeding, 'min', { niveau: 2 }))
    } else if (telt === 'werkruimte' && inKosten) {
      uit.bedrag += t.vergoeding
      uit.uitleg.push(
        regel(`partner.${sleutel}.tbs.${t.id}`, `Vergoeding voor de werkruimte is niet aftrekbaar (de werkruimte voldoet niet aan de voorwaarden)`, t.vergoeding, 'plus', {
          niveau: 2,
          parameter: 'ondernemer.werkruimte',
        }),
      )
    }
  }
  return uit
}

export interface OverigWerkPartner {
  /** Arbeidsbeloning van de onderneming(en) van de partner vanaf de drempel: overige werkzaamheden en arbeidsinkomen. */
  arbeidsbeloningPartner: number
  /** Terbeschikkingstelling van deze persoon; null zonder. */
  terbeschikkingstelling: TerbeschikkingstellingUitkomst | null
  uitleg: Uitlegregel[]
}

/** Wat deze persoon als resultaat uit overige werkzaamheden krijgt van de onderneming van de partner. */
export function overigWerkPartner(huishouden: HuishoudenInvoer, persoon: PersoonInvoer, params: TaxYearParams): OverigWerkPartner {
  const uit: OverigWerkPartner = { arbeidsbeloningPartner: 0, terbeschikkingstelling: null, uitleg: [] }
  if (!metPartner(huishouden)) return uit
  const drempel = params.ondernemer.waarde.meewerkaftrek.maxVergoeding
  const partner = huishouden.personen.find((p) => p.id === ANDER[persoon.id])
  for (const o of partner?.ondernemingen ?? []) {
    const mp = beloningVan(o)
    if (!mp || mp.vergoeding < drempel) continue
    uit.arbeidsbeloningPartner += mp.vergoeding
    uit.uitleg.push(
      regel(`loon.arbeidsbeloningPartner.${o.id ?? o.naam}`, `Beloning van ${o.naam || 'de onderneming'} van ${naamVan(partner, ANDER[persoon.id])}`, mp.vergoeding, 'plus', {
        niveau: 1,
        formule: `resultaat uit overige werkzaamheden en arbeidsinkomen (vanaf ${eur(drempel)})`,
        parameter: 'ondernemer.meewerkaftrek.maxVergoeding',
      }),
    )
  }
  const tbs = terbeschikkingstelling(persoon, huishouden, params)
  if (tbs) {
    uit.terbeschikkingstelling = tbs
    uit.uitleg.push(...tbsUitleg(tbs, params))
  }
  return uit
}

/** Alles van de partnerregeling voor één persoon, voor de engine. */
export interface PartnerPersoon {
  /** Per onderneming van de persoon (index) de correctie; undefined zonder correctie. */
  correcties: Array<CorrectiePartner | undefined>
  overigWerk: OverigWerkPartner
  waarschuwingen: Waarschuwing[]
}

export function partnerVoorPersoon(huishouden: HuishoudenInvoer | undefined, persoon: PersoonInvoer, params: TaxYearParams): PartnerPersoon {
  const leeg: PartnerPersoon = { correcties: persoon.ondernemingen.map(() => undefined), overigWerk: { arbeidsbeloningPartner: 0, terbeschikkingstelling: null, uitleg: [] }, waarschuwingen: [] }
  if (!huishouden) return leeg
  const waarschuwingen: Waarschuwing[] = []
  const heeftInvoer =
    persoon.ondernemingen.some((o) => o.samenwerkingMetPartner !== undefined && o.samenwerkingMetPartner !== 'geen') || (persoon.terbeschikkingstellingen ?? []).length > 0
  if (!metPartner(huishouden)) {
    if (heeftInvoer) {
      waarschuwingen.push(
        waarschuwing(
          'partner-geen-fiscaal-partner',
          'info',
          'Je hebt geen fiscale partner ingevuld. De beloning aan en de terbeschikkingstelling door je partner rekent de tool daarom niet door.',
        ),
      )
    }
    return { ...leeg, waarschuwingen }
  }
  for (const o of persoon.ondernemingen) {
    if (o.samenwerkingMetPartner === 'vof' || o.samenwerkingMetPartner === 'loondienst') {
      waarschuwingen.push(
        waarschuwing(
          `partner-anders-${o.id ?? o.naam}`,
          'info',
          `${o.naam}: een vof of loondienst bij je partner rekent de tool niet door. De winst van de vof vul je per persoon in als onderneming.`,
        ),
      )
    }
  }
  for (const t of persoon.terbeschikkingstellingen ?? []) {
    if (!ondernemingVanTbs(t, huishouden)) {
      waarschuwingen.push(
        waarschuwing(
          `tbs-zonder-onderneming-${t.id}`,
          'let-op',
          `${t.omschrijving || 'Een terbeschikkingstelling'} hoort bij een onderneming die er niet meer is. De tool rekent hem niet mee; haal hem weg of kies de onderneming opnieuw.`,
        ),
      )
    }
  }
  const correcties = persoon.ondernemingen.map((o) => {
    const c = correctiePartner(huishouden, persoon, o, params)
    return c.bedrag !== 0 ? c : undefined
  })
  return { correcties, overigWerk: overigWerkPartner(huishouden, persoon, params), waarschuwingen }
}

/**
 * Voegt de uitleg per post in onder de regel `${prefix}.correctiePartner` van de onderneming (die regel maakt de
 * ondernemingsmodule). Geeft een nieuwe lijst; zonder die regel komt de uitleg achteraan.
 */
export function metPartnerUitleg(uitleg: Uitlegregel[], c: CorrectiePartner | undefined): Uitlegregel[] {
  if (!c || c.uitleg.length === 0) return uitleg
  const i = uitleg.findIndex((u) => u.id.endsWith('.correctiePartner'))
  if (i < 0) return [...uitleg, ...c.uitleg]
  return [...uitleg.slice(0, i + 1), ...c.uitleg, ...uitleg.slice(i + 1)]
}

/** Posities die ter beschikking zijn gesteld en dus niet in box 3 tellen (alleen als de terbeschikkingstelling telt). */
export function buitenBox3(huishouden: HuishoudenInvoer, params: TaxYearParams): string[] {
  if (!metPartner(huishouden)) return []
  const ids = huishouden.personen.flatMap((p) => (p.terbeschikkingstellingen ?? []).filter((t) => t.box3PositieId && tbsTelt(t, huishouden, params) === 'ja').map((t) => t.box3PositieId as string))
  return [...new Set(ids)]
}

/** Tekst voor de partner in de UI en meldingen. */
export const partnerNaam = (huishouden: HuishoudenInvoer, id: PersoonId): string => naamVan(huishouden.personen.find((p) => p.id === id), id)

/** Korte samenvatting in gewone taal (voor meldingen en het rapport). */
export function tbsSamenvatting(u: TerbeschikkingstellingUitkomst): string {
  return `resultaat ${euro(u.resultaat)}, vrijstelling ${euro(u.vrijstelling)}, belast ${euro(u.belastbaar)}`
}
