/**
 * Loon, uitkeringen, resultaat uit overige werkzaamheden, periodieke uitkeringen en de reisaftrek.
 *
 * Indeling van de velden (zodat de engine box 1 kan optellen zonder dubbeltellingen):
 *   box 1-deel = loon + uwv + overigWerk + periodiek − reisaftrek
 *  - loon: soort 'loon' en 'pensioen' (belastbaar loon uit tegenwoordige en vroegere dienstbetrekking)
 *  - uwv: soort 'uwv-zez' en 'uwv-overig'
 *  - arbeidsinkomenDeel = soort 'loon' + 'uwv-zez' + overigWerk. De zwangerschaps- en bevallingsuitkering
 *    voor zelfstandigen (ZEZ) is loon uit tegenwoordige arbeid; pensioen en andere UWV-uitkeringen niet.
 *  - ronde 2 (A5): de arbeidsbeloning van de partner (art. 3.16 lid 4) en het belastbare resultaat uit
 *    terbeschikkingstelling (na de vrijstelling) komen bij overigWerk (`metOverigWerkPartner`); alleen de beloning telt
 *    mee in het arbeidsinkomen (een terbeschikkingstelling is geen tegenwoordige arbeid, art. 8.8).
 *  - reisaftrek openbaar vervoer: bedrag uit params.loon.reisaftrek.tabel voor 4 of meer dagen per week bij de
 *    enkele reisafstand, naar rato van dagen per week (dagen / 4) en maanden, min de vergoeding van de werkgever.
 */
import type { ModuleUitkomst, PersoonInvoer, TaxYearParams, TerbeschikkingstellingUitkomst, Uitlegregel } from '../types'
import { AFRONDING } from '../rounding'
import { eur, regel, waarschuwing } from '../uitleg'

/** Reisaftrek is een aftrekpost; rekenkundig afgerond. Contractwens: AFRONDING.reisaftrek. */
const afrondReis = AFRONDING.investeringsaftrek
/** De tabel geldt voor reizen op 4 of meer dagen per week. */
const TABEL_DAGEN = 4

export interface LoonEnOverigResultaat extends ModuleUitkomst {
  loon: number
  uwv: number
  overigWerk: number
  periodiek: number
  reisaftrek: number
  loonheffing: number
  zvwBijdrageloon: number
  arbeidsinkomenDeel: number
}

export function berekenReisaftrek(
  ov: NonNullable<PersoonInvoer['reisaftrekOV']>,
  params: TaxYearParams,
): { bedrag: number; tabelbedrag: number; formule: string } {
  const r = params.loon.waarde.reisaftrek
  const rij = [...r.tabel].sort((a, b) => b.vanafKm - a.vanafKm).find((x) => ov.enkeleReisKm >= x.vanafKm)
  if (!rij) return { bedrag: 0, tabelbedrag: 0, formule: `enkele reis ${eur(ov.enkeleReisKm)} km: minder dan ${eur(Math.min(...r.tabel.map((x) => x.vanafKm)))} km, geen reisaftrek` }
  const dagenFactor = Math.min(1, Math.max(0, ov.dagenPerWeek) / TABEL_DAGEN)
  const maandFactor = Math.min(12, Math.max(0, ov.maanden)) / 12
  const bruto = Math.min(r.max, rij.bedrag * dagenFactor * maandFactor)
  const bedrag = Math.max(0, afrondReis(bruto - Math.max(0, ov.vergoedingWerkgever)))
  const delen = [`${eur(rij.bedrag)} (vanaf ${eur(rij.vanafKm)} km)`]
  if (dagenFactor < 1) delen.push(`× ${ov.dagenPerWeek}/${TABEL_DAGEN} dagen`)
  if (maandFactor < 1) delen.push(`× ${ov.maanden}/12 maanden`)
  if (ov.vergoedingWerkgever > 0) delen.push(`− vergoeding werkgever ${eur(ov.vergoedingWerkgever)}`)
  return { bedrag, tabelbedrag: rij.bedrag, formule: delen.join(' ') }
}

export function berekenLoonEnOverig(p: PersoonInvoer, ctx: { params: TaxYearParams }): LoonEnOverigResultaat {
  const uitleg: LoonEnOverigResultaat['uitleg'] = []
  const waarschuwingen: LoonEnOverigResultaat['waarschuwingen'] = []

  let loonTegenwoordig = 0
  let pensioen = 0
  let zez = 0
  let uwvOverig = 0
  let loonheffing = 0
  let zvwBijdrageloon = 0

  for (const l of p.loon) {
    loonheffing += l.ingehoudenLoonheffing
    zvwBijdrageloon += l.zvwBijdrageloon ?? 0
    const labels: Record<typeof l.soort, string> = {
      loon: 'Loon',
      'uwv-zez': 'Zwangerschaps- en bevallingsuitkering (ZEZ)',
      'uwv-overig': 'Uitkering UWV',
      pensioen: 'Pensioen',
    }
    if (l.soort === 'loon') loonTegenwoordig += l.bruto
    else if (l.soort === 'pensioen') pensioen += l.bruto
    else if (l.soort === 'uwv-zez') zez += l.bruto
    else uwvOverig += l.bruto
    uitleg.push(
      regel(`loon.${l.soort}`, `${labels[l.soort]}: ${l.omschrijving}`, l.bruto, 'plus', {
        niveau: 2,
        formule: `ingehouden loonheffing ${eur(l.ingehoudenLoonheffing)}`,
      }),
    )
    if (l.soort === 'uwv-zez') {
      waarschuwingen.push(
        waarschuwing(
          'loon.zez',
          'info',
          'De ZEZ-uitkering telt als loon: ze hoort bij je arbeidsinkomen voor de arbeidskorting en de inkomensafhankelijke combinatiekorting. De ingehouden loonheffing wordt verrekend.',
        ),
      )
    }
  }

  const loon = loonTegenwoordig + pensioen
  const uwv = zez + uwvOverig
  const overigWerk = p.resultaatOverigWerk ?? 0
  const periodiek = p.periodiekeUitkeringen ?? 0

  if (loon !== 0) uitleg.push(regel('loon.loon', 'Loon uit dienstbetrekking', loon, 'plus', { niveau: 1 }))
  if (uwv !== 0) uitleg.push(regel('loon.uwv', 'Uitkeringen UWV', uwv, 'plus', { niveau: 1 }))
  if (overigWerk !== 0) uitleg.push(regel('loon.overigWerk', 'Resultaat uit overige werkzaamheden', overigWerk, overigWerk >= 0 ? 'plus' : 'min', { niveau: 1 }))
  if (periodiek !== 0) uitleg.push(regel('loon.periodiek', 'Periodieke uitkeringen en verstrekkingen', periodiek, 'plus', { niveau: 1 }))

  let reisaftrek = 0
  if (p.reisaftrekOV) {
    const r = berekenReisaftrek(p.reisaftrekOV, ctx.params)
    reisaftrek = r.bedrag
    uitleg.push(
      regel('loon.reisaftrek', 'Reisaftrek openbaar vervoer', reisaftrek, 'min', {
        niveau: 1,
        formule: r.formule,
        parameter: 'loon.reisaftrek.tabel',
        status: ctx.params.loon.status,
      }),
    )
    if (p.reisaftrekOV.vergoedingWerkgever > 0 && reisaftrek === 0 && r.tabelbedrag > 0) {
      waarschuwingen.push(waarschuwing('loon.reisaftrekVergoeding', 'info', 'De reiskostenvergoeding van je werkgever is hoger dan de reisaftrek; je houdt geen aftrek over.'))
    }
    waarschuwingen.push(
      waarschuwing('loon.reisaftrekOV', 'info', 'Voor de reisaftrek heb je een OV-verklaring of de reisgegevens van je OV-chipkaart nodig.'),
    )
  }

  const arbeidsinkomenDeel = loonTegenwoordig + zez + overigWerk
  if (loonheffing > 0) uitleg.push(regel('loon.loonheffing', 'Ingehouden loonheffing (voorheffing)', loonheffing, 'info', { niveau: 1 }))

  return { loon, uwv, overigWerk, periodiek, reisaftrek, loonheffing, zvwBijdrageloon, arbeidsinkomenDeel, uitleg, waarschuwingen }
}

/** Ronde 2 (A5): wat de partnerregeling bij deze persoon aan overige werkzaamheden toevoegt (lib/tax/modules/partner.ts). */
export interface OverigWerkPartnerDeel {
  arbeidsbeloningPartner: number
  terbeschikkingstelling: TerbeschikkingstellingUitkomst | null
  uitleg: Uitlegregel[]
}

/**
 * Ronde 2 (A5): telt de arbeidsbeloning van de partner en het belastbare resultaat uit terbeschikkingstelling bij het
 * resultaat uit overige werkzaamheden. Alleen de beloning hoort bij het arbeidsinkomen. Geeft een nieuwe uitkomst.
 */
export function metOverigWerkPartner(r: LoonEnOverigResultaat, partner: OverigWerkPartnerDeel): LoonEnOverigResultaat {
  const tbs = partner.terbeschikkingstelling?.belastbaar ?? 0
  if (partner.arbeidsbeloningPartner === 0 && !partner.terbeschikkingstelling) return r
  return {
    ...r,
    overigWerk: r.overigWerk + partner.arbeidsbeloningPartner + tbs,
    arbeidsinkomenDeel: r.arbeidsinkomenDeel + partner.arbeidsbeloningPartner,
    uitleg: [...r.uitleg, ...partner.uitleg],
  }
}
