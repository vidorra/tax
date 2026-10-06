/**
 * Ronde 2 (A5): controles op de buitenlandse bronbelasting (taak-A5 hoofdstuk 8). Puur: geen React, geen I/O.
 *
 *  - bron-land (fout, niet te negeren): een regel zonder land; nodig voor het verdragstarief en de aangifte (2.21).
 *  - bron-bruto (fout, niet te negeren): ingehouden zonder bruto inkomsten; de tool rekent dan zoals ronde 1.
 *  - bron-onbekend-land (let op): land buiten de tabel (tot 15% verrekend) of zonder verdrag (niets verrekend).
 *  - bron-terugvragen (info): meer ingehouden dan het verdrag toestaat; terugvragen in het bronland.
 *  - bron-termijn (let op): de termijn om terug te vragen loopt binnen zes maanden af en de status is nog open.
 */
import type { Controle, ControleContext, ControleRegel } from '../types'
import type { BronbelastingRegelUitkomst, Eigenaar, PersoonId } from '@/lib/tax/types'
import { veldVan } from '@/lib/dossier/veld'
import { bronbelastingRegels } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { landVanRegel } from '@/lib/tax/modules/box3/bronbelasting'
import { bronbelastingRegelsVan, terugvraagLijst } from '@/lib/dossier/terugvragen'
import { datumNL, euro, pct } from '@/lib/tax/uitleg'

const bedragTekst = (n: number) => (Number.isInteger(n) ? euro(n) : `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const persoonVan = (e: Eigenaar): PersoonId | undefined => (e === 'A' || e === 'B' ? e : undefined)
const planning = (jaar: number) => `/dossier/${jaar}/planning/#terugvragen`

function regelsVan(ctx: ControleContext): BronbelastingRegelUitkomst[] {
  return bronbelastingRegelsVan(ctx.invoer, ctx.resultaat, ctx.params)
}

export const bronLand: ControleRegel = (ctx) => {
  const uit: Controle[] = []
  for (const x of ctx.invoer.box3.posities) {
    for (const r of bronbelastingRegels(x)) {
      if (r.land.trim() !== '') continue
      uit.push({
        id: `bron-land:${x.id}:${r.id}`,
        regel: 'bron-land',
        ernst: 'fout',
        titel: 'Land van de bronbelasting ontbreekt',
        uitleg: `Kies bij ${x.omschrijving.trim() || 'deze bezitting'} het land waar de bronbelasting is ingehouden. Het verdragstarief en de aangifte hangen ervan af.`,
        waar: x.omschrijving.trim() || 'Bezitting',
        ...(persoonVan(x.eigenaar) ? { persoon: persoonVan(x.eigenaar) } : {}),
        gebied: 'box3',
        veld: veldVan.positie(x.id, `bronbelasting:${r.id}`, 'land'),
        sectie: 'vermogen',
        negeren: 'nee',
        vingerafdruk: 'land=',
      })
    }
  }
  return uit
}

export const bronBruto: ControleRegel = (ctx) => {
  const uit: Controle[] = []
  for (const x of ctx.invoer.box3.posities) {
    for (const r of bronbelastingRegels(x)) {
      if (!(r.bedrag > 0) || r.brutoInkomsten > 0) continue
      uit.push({
        id: `bron-bruto:${x.id}:${r.id}`,
        regel: 'bron-bruto',
        ernst: 'fout',
        titel: 'Bruto inkomsten bij de bronbelasting ontbreken',
        uitleg: `Vul het bruto dividend of de bruto rente in waarop ${euro(r.bedrag)} is ingehouden. Zonder bruto inkomsten rekent de tool het hele bedrag als verrekenbaar; het verdrag staat vaak minder toe.`,
        waar: x.omschrijving.trim() || 'Bezitting',
        ...(persoonVan(x.eigenaar) ? { persoon: persoonVan(x.eigenaar) } : {}),
        gebied: 'box3',
        veld: veldVan.positie(x.id, `bronbelasting:${r.id}`, 'brutoInkomsten'),
        sectie: 'vermogen',
        negeren: 'nee',
        vingerafdruk: `bedrag=${r.bedrag}`,
      })
    }
  }
  return uit
}

export const bronOnbekendLand: ControleRegel = (ctx) => {
  const uit: Controle[] = []
  const max = ctx.params.box3.waarde.bronbelastingMaxPct
  for (const x of ctx.invoer.box3.posities) {
    for (const r of bronbelastingRegels(x)) {
      if (r.land.trim() === '' || !(r.bedrag > 0) || r.verdragstarief !== undefined) continue
      const { code, land } = landVanRegel(r)
      const tarieven = land ? (r.soort === 'rente' ? land.rente ?? land.dividend : land.dividend) : undefined
      if (land && tarieven?.verdrag !== null) continue
      uit.push({
        id: `bron-onbekend-land:${x.id}:${r.id}`,
        regel: 'bron-onbekend-land',
        ernst: 'let-op',
        titel: land ? `Geen verdrag met ${land.naam}` : 'Verdragstarief onbekend',
        uitleg: land
          ? 'Met dit land heeft Nederland geen verdrag dat verrekening toestaat. Vul een tarief in als dat wel kan.'
          : `Voor dit land staat het verdragstarief niet in de tool. We rekenen met hoogstens ${pct(max, 0)}; vul het tarief in als het verdrag minder toestaat.`,
        waar: `${x.omschrijving.trim() || 'Bezitting'} · ${land?.naam ?? code}`,
        ...(persoonVan(x.eigenaar) ? { persoon: persoonVan(x.eigenaar) } : {}),
        gebied: 'box3',
        veld: veldVan.positie(x.id, `bronbelasting:${r.id}`, 'verdragstarief'),
        sectie: 'vermogen',
        negeren: 'gezien',
        vingerafdruk: `land=${code}|bruto=${r.brutoInkomsten}`,
      })
    }
  }
  return uit
}

export const bronTerugvragen: ControleRegel = (ctx) =>
  terugvraagLijst(ctx.invoer, regelsVan(ctx), ctx.staat, ctx.vandaag)
    .filter((t) => t.status === 'open' && !t.verlopen)
    .map((t) => ({
      id: `bron-terugvragen:${t.positieId}:${t.regelId}`,
      regel: 'bron-terugvragen',
      ernst: 'info' as const,
      titel: `Terugvragen in ${t.landNaam}`,
      uitleg: `Er is ${bedragTekst(t.bedrag)} meer ingehouden dan het verdrag toestaat. Vraag het terug in ${t.landNaam}${t.uiterlijk ? `, uiterlijk ${datumNL(t.uiterlijk)}` : '; kijk de termijn na bij het bronland'}.${t.klein ? ' Terugvragen loont waarschijnlijk niet.' : ''}`,
      waar: `${t.positieNaam} · ${t.landNaam}`,
      ...(persoonVan(t.eigenaar) ? { persoon: persoonVan(t.eigenaar) } : {}),
      gebied: 'box3' as const,
      veld: veldVan.positie(t.positieId, `bronbelasting:${t.regelId}`, 'bedrag'),
      href: planning(ctx.jaar),
      negeren: 'gezien' as const,
      vingerafdruk: `terug=${t.bedrag}`,
    }))

export const bronTermijn: ControleRegel = (ctx) =>
  terugvraagLijst(ctx.invoer, regelsVan(ctx), ctx.staat, ctx.vandaag)
    .filter((t) => t.binnenkort && t.uiterlijk)
    .map((t) => ({
      id: `bron-termijn:${t.positieId}:${t.regelId}`,
      regel: 'bron-termijn',
      ernst: 'let-op' as const,
      titel: `Termijn in ${t.landNaam} loopt af`,
      uitleg: `De termijn om ${bedragTekst(t.bedrag)} terug te vragen in ${t.landNaam} loopt af op ${datumNL(t.uiterlijk)}. Zet de status op Aangevraagd zodra je het verzoek hebt gedaan.`,
      waar: `${t.positieNaam} · ${t.landNaam}`,
      ...(persoonVan(t.eigenaar) ? { persoon: persoonVan(t.eigenaar) } : {}),
      gebied: 'box3' as const,
      veld: null,
      href: planning(ctx.jaar),
      negeren: 'gezien' as const,
      vingerafdruk: `uiterlijk=${t.uiterlijk}|bedrag=${t.bedrag}`,
    }))

export const BRONBELASTING_REGELS: readonly ControleRegel[] = [bronLand, bronBruto, bronOnbekendLand, bronTermijn, bronTerugvragen]
