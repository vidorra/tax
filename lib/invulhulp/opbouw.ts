/**
 * Ronde 2 (A1): bouwt de invulhulp voor een dossierjaar uit de indeling (lib/invulhulp/indeling) en de opgeslagen
 * invoer met uitkomst.
 *
 * - Schermen per persoon (`${id}:${persoon}`), per onderneming (`${id}:o-${ondernemingId}`, met de vaste id) of één
 *   keer samen (`${id}`). Een blok opeenvolgende ondernemingsschermen gaat per onderneming in zijn geheel, zoals in het
 *   programma (Gegevens, vragen, W&V, balans … winstberekening, dan de volgende onderneming).
 * - Velden: `${scherm}/${veld}`, of in een herhalende rubriek `${scherm}/${rubriek}:${item}/${veld}` met de vaste id van
 *   het item. Zo schuiven vinkjes en VIA-bedragen niet naar een ander item als er een wordt weggehaald.
 * - Labels, hints, titels en meldingen worden ingevuld (vulLabel); lege velden blijven erin met `leeg`, zodat de pagina
 *   "{n} velden zonder bedrag verborgen" kan tonen. Een scherm zonder velden, toelichting of melding valt weg.
 *
 * Puur: geen React, geen I/O.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonId, TaxYearParams } from '@/lib/tax/types'
import { itemSleutel } from '@/lib/dossier/ids'
import { indelingVoor } from './indeling'
import { RIJ_SOORT, type InvulhulpContext, type InvulhulpKolom, type InvulhulpOpbouw, type Rubriek, type Scherm, type SchermDefinitie, type Veld } from './types'
import { isLeeg, vulLabel } from './waarden'
import { vingerafdruk } from './voortgang'

export interface OpbouwContext {
  jaar: number
  invoer: HuishoudenInvoer
  resultaat: HuishoudenResultaat
  params: TaxYearParams
}

const SLEUTEL = /^[A-Za-z0-9:/._-]+$/

function bouwScherm(def: SchermDefinitie, ctx: InvulhulpContext, sleutel: string, persoon: PersoonId | 'samen', onderneming?: Scherm['onderneming']): Scherm | null {
  if (def.toon && !def.toon(ctx)) return null
  const vul = (s: string | null | undefined, c: InvulhulpContext = ctx) => (s ? vulLabel(s, c) : null)
  const rubrieken: Rubriek[] = []
  for (const r of def.rubrieken) {
    const items = r.herhaal ? r.herhaal(ctx).map((x) => ({ itemSleutel: x.sleutel, titel: x.titel, ctx: x.ctx })) : [{ itemSleutel: null as string | null, titel: r.titel, ctx }]
    for (const it of items) {
      const velden: Veld[] = []
      for (const vd of r.velden) {
        if (vd.toon && !vd.toon(it.ctx)) continue
        const waarde = vd.waarde(it.ctx)
        // Een berekende regel zonder bedrag zegt niets: weglaten (lege invul- en keuzevelden blijven, verborgen).
        if (vd.soort === 'B' && isLeeg(waarde)) continue
        const veldSleutel = it.itemSleutel === null ? `${sleutel}/${vd.id}` : `${sleutel}/${r.id}:${it.itemSleutel}/${vd.id}`
        if (!SLEUTEL.test(veldSleutel)) continue
        const h = vd.herkomst?.(it.ctx) ?? null
        velden.push({
          sleutel: veldSleutel,
          id: vd.id,
          label: vulLabel(vd.label, it.ctx),
          ...(vd.olaId ? { olaId: vd.olaId } : {}),
          soort: vd.soort,
          rij: RIJ_SOORT[vd.soort],
          waarde,
          herkomst: h ? { ...h, label: vulLabel(h.label, it.ctx) } : null,
          via: vd.via ?? null,
          hint: vul(vd.hint?.(it.ctx), it.ctx),
          vingerafdruk: vingerafdruk(waarde),
          leeg: vd.soort !== 'V' && !vd.altijd && isLeeg(waarde),
        })
      }
      if (velden.length === 0) continue
      const kolommen = r.kolommen?.filter((k: InvulhulpKolom) => velden.some((v) => v.waarde.soort === 'kolommen' && k in v.waarde.bedragen))
      rubrieken.push({
        id: it.itemSleutel === null ? r.id : `${r.id}:${it.itemSleutel}`,
        ...(it.titel ? { titel: vulLabel(it.titel, it.ctx) } : {}),
        ...(kolommen && kolommen.length > 0 ? { kolommen } : {}),
        velden,
      })
    }
  }
  const toelichting = vul(def.toelichting?.(ctx))
  const m = def.melding?.(ctx) ?? null
  const melding = m ? { ...m, tekst: vulLabel(m.tekst, ctx) } : null
  if (rubrieken.length === 0 && !toelichting && !melding) return null
  return {
    sleutel,
    id: def.id,
    titel: vulLabel(def.titel, ctx),
    menu: def.menu.map((x) => vulLabel(x, ctx)),
    persoon,
    ...(onderneming ? { onderneming } : {}),
    toelichting,
    rubrieken,
    melding,
  }
}

/** Alle schermen van de aangifte voor dit dossier, met de bedragen uit invoer en uitkomst. */
export function bouwInvulhulp(ctx: OpbouwContext): InvulhulpOpbouw {
  const { indeling, meldingen } = indelingVoor(ctx.jaar)
  const basis = { jaar: ctx.jaar, invoer: ctx.invoer, resultaat: ctx.resultaat, params: ctx.params }
  const personen = ctx.invoer.personen
  const eerste: PersoonId = personen[0]?.id ?? 'A'
  const schermen: Scherm[] = []
  const voegToe = (s: Scherm | null) => {
    if (s) schermen.push(s)
  }
  const defs = indeling.schermen
  for (let i = 0; i < defs.length; ) {
    const def = defs[i]
    if (def.herhaling === 'onderneming') {
      let j = i
      while (j < defs.length && defs[j].herhaling === 'onderneming') j++
      const blok = defs.slice(i, j)
      for (const p of personen) {
        p.ondernemingen.forEach((o, index) => {
          const ondernemingId = itemSleutel(o, index)
          const c: InvulhulpContext = { ...basis, persoon: p.id, ondernemingIndex: index, ondernemingId }
          for (const d of blok) voegToe(bouwScherm(d, c, `${d.id}:o-${ondernemingId}`, p.id, { index, id: ondernemingId, naam: o.naam?.trim() || `Onderneming ${index + 1}` }))
        })
      }
      i = j
      continue
    }
    if (def.herhaling === 'persoon') {
      for (const p of personen) voegToe(bouwScherm(def, { ...basis, persoon: p.id }, `${def.id}:${p.id}`, p.id))
    } else {
      voegToe(bouwScherm(def, { ...basis, persoon: eerste }, def.id, 'samen'))
    }
    i++
  }
  return {
    aangiftejaar: indeling.aangiftejaar,
    indelingStatus: indeling.status,
    ...(indeling.nagekekenOp ? { nagekekenOp: indeling.nagekekenOp } : {}),
    ...(indeling.opentOp ? { opentOp: indeling.opentOp } : {}),
    samenBij: eerste,
    schermen,
    meldingen,
  }
}

/** Alle velden van de opbouw met hun scherm en rubriek, voor de controles en de sprong naar een rij. */
export function alleVelden(opbouw: InvulhulpOpbouw): Array<{ scherm: Scherm; rubriek: Rubriek; veld: Veld }> {
  return opbouw.schermen.flatMap((scherm) => scherm.rubrieken.flatMap((rubriek) => rubriek.velden.map((veld) => ({ scherm, rubriek, veld }))))
}

/** Titel van een scherm voor in lijsten: bij een onderneming met de naam erbij ("Balans: activa · Ontwerpstudio"). */
export function schermTitel(scherm: Pick<Scherm, 'titel' | 'onderneming'>): string {
  return scherm.onderneming && !scherm.titel.includes(scherm.onderneming.naam) ? `${scherm.titel} · ${scherm.onderneming.naam}` : scherm.titel
}
