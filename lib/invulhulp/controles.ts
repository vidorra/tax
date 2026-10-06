/**
 * Ronde 2 (A1): controleregels van de invulhulp (gebied 'invulhulp'), alle drie een let op die je als gezien kunt
 * afvinken:
 * - `via-verschil:<persoon>:<sleutel>`: een bedrag uit de vooraf ingevulde aangifte wijkt af van het dossier en er is
 *   nog geen keuze (of 'Nog uitzoeken');
 * - `gewijzigd-na-afvinken:<persoon>`: bedragen zijn veranderd sinds ze zijn afgevinkt;
 * - `eindcontrole:<persoon>`: het aangifteprogramma komt op een ander te betalen bedrag dan de tool.
 *
 * De regels lezen alleen `ctx.staat` (de voortgang) en `ctx.resultaat`; zonder staat of zonder berekening geen
 * controles. Een gezamenlijk scherm (woning, bezittingen, verdelen) hoort bij de eerste persoon (`samenBij`); zijn
 * controles ook. Puur: geen React, geen I/O.
 */
import type { Controle, ControleContext, ControleRegel } from '@/lib/controles/types'
import type { PersoonId } from '@/lib/tax/types'
import { formatEuro } from '@/components/ui/format'
import { alleVelden, bouwInvulhulp, schermTitel } from './opbouw'
import type { InvulhulpOpbouw, Rubriek, Scherm, Veld } from './types'
import { bedragVan, persoonNaam } from './waarden'
import { eindcontrole, heeftOpenVerschil, samenBij, veldStatus } from './voortgang'

const cache = new WeakMap<object, InvulhulpOpbouw | null>()

/** De opbouw bij deze context; één keer per uitkomst (de drie regels gebruiken hem alle drie). */
function opbouwVan(ctx: ControleContext): InvulhulpOpbouw | null {
  const r = ctx.resultaat
  if (!r) return null
  if (cache.has(r)) return cache.get(r) ?? null
  let o: InvulhulpOpbouw | null
  try {
    o = bouwInvulhulp({ jaar: ctx.jaar, invoer: ctx.invoer, resultaat: r, params: ctx.params })
  } catch {
    o = null
  }
  cache.set(r, o)
  return o
}

/** Velden die bij deze persoon horen: zijn eigen schermen, en de gezamenlijke bij de eerste persoon. */
function veldenVoor(opbouw: InvulhulpOpbouw, persoon: PersoonId): Array<{ scherm: Scherm; rubriek: Rubriek; veld: Veld }> {
  return alleVelden(opbouw).filter(({ scherm }) => scherm.persoon === persoon || (scherm.persoon === 'samen' && persoon === samenBij(opbouw)))
}

const naamVan = (ctx: ControleContext, id: PersoonId) => persoonNaam(ctx.invoer.personen.find((p) => p.id === id))
const rijHref = (jaar: number, sleutel: string) => `/dossier/${jaar}/aangifte/#${sleutel}`

/** Kort en stabiel: lange vingerafdrukken (veel sleutels) worden een hash met het aantal ervoor. */
function kort(s: string, max = 1500): string {
  if (s.length <= max) return s
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return `${s.slice(0, 200)}|hash=${h.toString(36)}`
}

export const viaVerschilRegel: ControleRegel = (ctx) => {
  const ih = ctx.staat?.invulhulp
  if (!ih) return []
  const opbouw = opbouwVan(ctx)
  if (!opbouw) return []
  const uit: Controle[] = []
  for (const p of ctx.invoer.personen) {
    const vgs = ih.velden?.[p.id]
    if (!vgs) continue
    for (const { scherm, rubriek, veld } of veldenVoor(opbouw, p.id)) {
      const vg = vgs[veld.sleutel]
      if (!heeftOpenVerschil(veld, vg) || vg?.via === undefined || vg.via === null) continue
      const tool = bedragVan(veld.waarde) ?? 0
      const bd = vg.via
      const wat = rubriek.titel ? `${veld.label} (${rubriek.titel})` : veld.label
      uit.push({
        id: `via-verschil:${p.id}:${veld.sleutel}`,
        regel: 'via-verschil',
        ernst: 'let-op',
        titel: 'Verschil met de vooraf ingevulde aangifte',
        uitleg: `Bij ${wat} staat in de vooraf ingevulde aangifte ${formatEuro(bd)}, in je dossier ${formatEuro(tool)}. Kies in de invulhulp welk bedrag je overneemt.`,
        waar: `${schermTitel(scherm)} · ${naamVan(ctx, p.id)}`,
        persoon: p.id,
        gebied: 'invulhulp',
        veld: veld.herkomst?.veld ?? null,
        invulhulpSleutel: veld.sleutel,
        href: rijHref(ctx.jaar, veld.sleutel),
        negeren: 'gezien',
        vingerafdruk: `via=${bd}|dossier=${tool}`,
      })
    }
  }
  return uit
}

export const gewijzigdNaAfvinkenRegel: ControleRegel = (ctx) => {
  const ih = ctx.staat?.invulhulp
  if (!ih) return []
  const opbouw = opbouwVan(ctx)
  if (!opbouw) return []
  const uit: Controle[] = []
  for (const p of ctx.invoer.personen) {
    const vgs = ih.velden?.[p.id]
    if (!vgs) continue
    const gewijzigd = veldenVoor(opbouw, p.id).filter(({ veld }) => veldStatus(veld, vgs[veld.sleutel]) === 'gewijzigd')
    if (gewijzigd.length === 0) continue
    const n = gewijzigd.length
    const eerste = gewijzigd[0]
    uit.push({
      id: `gewijzigd-na-afvinken:${p.id}`,
      regel: 'gewijzigd-na-afvinken',
      ernst: 'let-op',
      titel: n === 1 ? 'Bedrag veranderd na afvinken' : 'Bedragen veranderd na afvinken',
      uitleg:
        n === 1
          ? `${eerste.veld.label} is veranderd sinds je het afvinkte in de invulhulp. Pas het aan in de aangifte en vink het opnieuw af.`
          : `${n} bedragen zijn veranderd sinds je ze afvinkte in de invulhulp, te beginnen bij ${eerste.veld.label}. Pas ze aan in de aangifte en vink ze opnieuw af.`,
      waar: `${schermTitel(eerste.scherm)} · ${naamVan(ctx, p.id)}`,
      persoon: p.id,
      gebied: 'invulhulp',
      veld: null,
      invulhulpSleutel: eerste.veld.sleutel,
      href: rijHref(ctx.jaar, eerste.veld.sleutel),
      negeren: 'gezien',
      vingerafdruk: kort(`n=${n}|${gewijzigd.map((x) => x.veld.sleutel).join(',')}`),
    })
  }
  return uit
}

export const eindcontroleRegel: ControleRegel = (ctx) => {
  const programma = ctx.staat?.invulhulp?.programma
  if (!programma || !ctx.resultaat) return []
  const uit: Controle[] = []
  for (const pr of ctx.resultaat.personen) {
    const e = eindcontrole(pr, programma[pr.id])
    const ib = e.ib.gelijk === false ? e.ib : null
    const zvw = e.zvw.gelijk === false ? e.zvw : null
    if (!ib && !zvw) continue
    const zinnen: string[] = []
    if (ib) zinnen.push(`Het aangifteprogramma komt op ${formatEuro(ib.programma ?? 0)}, de tool op ${formatEuro(ib.tool)}.`)
    if (zvw) zinnen.push(`Voor de Zvw komt het aangifteprogramma op ${formatEuro(zvw.programma ?? 0)}, de tool op ${formatEuro(zvw.tool)}.`)
    zinnen.push('Kijk de schermen met een verschil na; vaak zit het in een vooraf ingevuld bedrag of de verdeling met je partner.')
    const delen = [ib ? `ib=${ib.programma}|tool=${ib.tool}` : null, zvw ? `zvw=${zvw.programma}|tool=${zvw.tool}` : null].filter(Boolean)
    uit.push({
      id: `eindcontrole:${pr.id}`,
      regel: 'eindcontrole',
      ernst: 'let-op',
      titel: 'Aangifteprogramma komt op een ander bedrag',
      uitleg: zinnen.join(' '),
      waar: `Overzicht belasting en premies · ${naamVan(ctx, pr.id)}`,
      persoon: pr.id,
      gebied: 'invulhulp',
      veld: null,
      href: rijHref(ctx.jaar, `overzicht:${pr.id}`),
      negeren: 'gezien',
      vingerafdruk: delen.join('|'),
    })
  }
  return uit
}

/** De regels van de invulhulp, in deze volgorde (binnen het gebied 'invulhulp'). */
export const invulhulpRegels: ControleRegel[] = [viaVerschilRegel, gewijzigdNaAfvinkenRegel, eindcontroleRegel]
