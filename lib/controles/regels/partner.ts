/**
 * Ronde 2 (A5): controles op de partnerregeling (taak-A5 hoofdstuk 8). Puur: geen React, geen I/O.
 *
 *  - partner-onder-drempel (let op): een beloning onder de drempel in de kosten; niet aftrekbaar, de tool telt hem op.
 *  - tbs-box3 (let op): een zaak of lening ter beschikking zonder gekoppelde bezitting in box 3.
 *  - tbs-werkruimte (let op): een werkruimte die niet aan de voorwaarden voor aftrek voldoet.
 */
import type { Controle, ControleRegel } from '../types'
import type { PersoonId } from '@/lib/tax/types'
import { veldVan } from '@/lib/dossier/veld'
import { itemSleutel } from '@/lib/dossier/ids'
import { beloningVan, metPartner, ondernemingVanTbs, tbsTelt } from '@/lib/tax/modules/partner'
import { zitInSaldo } from '@/lib/tax/modules/onderneming/in-saldo'
import { euro } from '@/lib/tax/uitleg'

const naam = (p: { id: string; naam?: string } | undefined, id: string) => (p?.naam?.trim() ? p.naam.trim() : `Persoon ${id}`)
const ANDER: Record<PersoonId, PersoonId> = { A: 'B', B: 'A' }

export const partnerOnderDrempel: ControleRegel = (ctx) => {
  if (!metPartner(ctx.invoer)) return []
  const drempel = ctx.params.ondernemer.waarde.meewerkaftrek.maxVergoeding
  const minUren = Math.min(...ctx.params.ondernemer.waarde.meewerkaftrek.staffel.map((s) => s.vanafUren))
  const uit: Controle[] = []
  for (const p of ctx.invoer.personen) {
    const partner = ctx.invoer.personen.find((x) => x.id === ANDER[p.id])
    p.ondernemingen.forEach((o, i) => {
      const mp = beloningVan(o)
      if (!mp || mp.vergoeding <= 0 || mp.vergoeding >= drempel || !zitInSaldo(mp.vergoedingInKosten, o, 'partner')) return
      const sleutel = itemSleutel(o, i)
      uit.push({
        id: `partner-onder-drempel:${p.id}:${sleutel}`,
        regel: 'partner-onder-drempel',
        ernst: 'let-op',
        titel: 'Beloning partner onder de drempel',
        uitleg: `De beloning van ${euro(mp.vergoeding)} aan ${naam(partner, ANDER[p.id])} is lager dan ${euro(drempel)}. Die is niet aftrekbaar: de tool telt hem weer bij je winst op. Werkt ${naam(partner, ANDER[p.id])} minstens ${minUren} uur mee, dan kan meewerkaftrek wel.`,
        waar: `${o.naam} · ${naam(p, p.id)}`,
        persoon: p.id,
        gebied: 'onderneming',
        veld: veldVan.onderneming(p.id, sleutel, 'meewerkendePartner.vergoeding'),
        negeren: 'gezien',
        vingerafdruk: `vergoeding=${mp.vergoeding}`,
      })
    })
  }
  return uit
}

export const tbsBox3: ControleRegel = (ctx) => {
  if (!metPartner(ctx.invoer)) return []
  const uit: Controle[] = []
  for (const p of ctx.invoer.personen) {
    for (const t of p.terbeschikkingstellingen ?? []) {
      if ((t.soort !== 'zaak' && t.soort !== 'lening') || t.box3PositieId || tbsTelt(t, ctx.invoer, ctx.params) !== 'ja') continue
      const doel = ondernemingVanTbs(t, ctx.invoer)
      uit.push({
        id: `tbs-box3:${t.id}`,
        regel: 'tbs-box3',
        ernst: 'let-op',
        titel: `Staat ${t.omschrijving || 'dit'} ook in box 3?`,
        uitleg: `Wat ${naam(p, p.id)} ter beschikking stelt aan de zaak hoort niet in box 3. Staat ${t.omschrijving || 'het'} bij je bezittingen, kies die bezitting dan bij de terbeschikkingstelling; dan laat de tool hem buiten box 3.`,
        waar: `${doel?.onderneming.naam ?? 'Onderneming'} · ${naam(p, p.id)}`,
        persoon: p.id,
        gebied: 'onderneming',
        veld: veldVan.persoon(p.id, `terbeschikkingstelling:${t.id}`, 'box3PositieId'),
        negeren: 'gezien',
        vingerafdruk: `soort=${t.soort}`,
      })
    }
  }
  return uit
}

export const tbsWerkruimte: ControleRegel = (ctx) => {
  if (!metPartner(ctx.invoer)) return []
  const uit: Controle[] = []
  for (const p of ctx.invoer.personen) {
    for (const t of p.terbeschikkingstellingen ?? []) {
      if (tbsTelt(t, ctx.invoer, ctx.params) !== 'werkruimte') continue
      const doel = ondernemingVanTbs(t, ctx.invoer)
      uit.push({
        id: `tbs-werkruimte:${t.id}`,
        regel: 'tbs-werkruimte',
        ernst: 'let-op',
        titel: 'Werkruimte telt niet als terbeschikkingstelling',
        uitleg: 'Geen terbeschikkingstelling: de werkruimte voldoet niet aan de voorwaarden voor aftrek, dus de onderneming kan er geen vergoeding voor aftrekken.',
        waar: `${doel?.onderneming.naam ?? 'Onderneming'} · ${naam(p, p.id)}`,
        persoon: p.id,
        gebied: 'onderneming',
        veld: doel ? veldVan.onderneming(doel.persoon.id, itemSleutel(doel.onderneming, doel.index), 'werkruimte.zelfstandig') : veldVan.persoon(p.id, `terbeschikkingstelling:${t.id}`, 'soort'),
        negeren: 'gezien',
        vingerafdruk: `vergoeding=${t.vergoeding}`,
      })
    }
  }
  return uit
}

export const PARTNER_REGELS: readonly ControleRegel[] = [partnerOnderDrempel, tbsWerkruimte, tbsBox3]
