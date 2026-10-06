/**
 * Ronde 2 (contract, na de toets): `controleer()` voert alle regels uit, sorteert en past de bewaarde negeringen toe.
 * Staat al in het contract zodat elke bouwagent hem in de eigen worktree kan gebruiken (de invulhulp, de export en
 * het overzicht). Eigenaar daarna: onderdeel controles (A3), die hem mag uitbreiden zonder de vorm te veranderen.
 * Puur: geen React, geen I/O.
 *
 * Ronde 2 (A3), uitbreidingen:
 * - Een regel die een fout gooit (halve invoer in de editor), slaat `controleer` over in plaats van alles te laten
 *   mislukken.
 * - `controleerAlles(ctx)`: `controleer` plus de let op `ingediend-met-fouten` in een tweede doorgang (die hangt af van
 *   de andere uitkomsten). Gebruik deze in de editor, op de server en bij de export.
 * - `controleContext(...)`: bouwt de context uit wat een pagina of de server heeft (params uit de variant, vorig jaar
 *   met of zonder uitkomst).
 * - `verborgenMeldingen(uitkomst)`: de meldingen van de engine die als controle terugkomen; die staan dan alleen bij de
 *   controles en niet ook bij Meldingen.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, TaxYearParams } from '@/lib/tax/types'
import type { AangifteStaat } from '@/lib/dossier/aangiftestaat'
import type { DossierStatus } from '@/lib/dossier/status'
import { REGELS } from './regels'
import { ingediendMetFouten } from './regels/status'
import { beoordeelNegering } from './negeren'
import { GEBIED_VOLGORDE, type Controle, type ControleContext, type ControleErnst, type ControleRegel, type ControleUitkomst, type GenegeerdeControle } from './types'

const ERNST_VOLGORDE: readonly ControleErnst[] = ['fout', 'let-op', 'info']

/** Sorteert: ernst (fout, let op, info), dan gebied in de volgorde van de pagina, dan de volgorde van de regels. */
export function sorteerControles(controles: Controle[]): Controle[] {
  return controles
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        ERNST_VOLGORDE.indexOf(a.c.ernst) - ERNST_VOLGORDE.indexOf(b.c.ernst) ||
        GEBIED_VOLGORDE.indexOf(a.c.gebied) - GEBIED_VOLGORDE.indexOf(b.c.gebied) ||
        a.i - b.i,
    )
    .map(({ c }) => c)
}

/** Voert één regel uit; een regel die gooit (bijvoorbeeld bij halve invoer) geeft geen controles. */
function veilig(regel: ControleRegel, ctx: ControleContext): Controle[] {
  try {
    return regel(ctx)
  } catch {
    return []
  }
}

export function controleer(ctx: ControleContext, regels: readonly ControleRegel[] = REGELS): ControleUitkomst {
  const gezien = new Set<string>()
  const alle = sorteerControles(
    regels.flatMap((r) => veilig(r, ctx)).filter((c) => (gezien.has(c.id) ? false : (gezien.add(c.id), true))),
  )
  const bewaard: Record<string, GenegeerdeControle> = ctx.staat?.genegeerd ?? {}
  const open: Controle[] = []
  const weerOpen: Controle[] = []
  const genegeerd: ControleUitkomst['genegeerd'] = []
  for (const c of alle) {
    const negering = bewaard[c.id]
    const oordeel = beoordeelNegering(c, negering)
    if (oordeel === 'geldig' && negering) genegeerd.push({ controle: c, negering })
    else {
      open.push(c)
      if (oordeel === 'weer-open') weerOpen.push(c)
    }
  }
  const fouten = open.filter((c) => c.ernst === 'fout').length
  return {
    alle,
    open,
    genegeerd,
    weerOpen,
    telling: {
      fouten,
      letOp: open.filter((c) => c.ernst === 'let-op').length,
      info: open.filter((c) => c.ernst === 'info').length,
      genegeerd: genegeerd.length,
    },
    blokkeertGecontroleerd: fouten > 0,
    // Besluit na de nacontrole: een ingediend jaar krijgt geen CONCEPT-stempel, wel "Ingediend, met {n} open controles".
    exportConcept: fouten > 0 && ctx.status !== 'ingediend',
    exportIngediendOpen: ctx.status === 'ingediend' ? fouten : 0,
    zonderBerekening: ctx.resultaat === null,
  }
}

/**
 * Alle controles, met in een tweede doorgang de let op `ingediend-met-fouten` bij status Ingediend en open fouten. De
 * controles van de eerste doorgang worden niet opnieuw uitgerekend.
 */
export function controleerAlles(ctx: ControleContext, regels: readonly ControleRegel[] = REGELS): ControleUitkomst {
  const eerste = controleer(ctx, regels)
  if (ctx.status !== 'ingediend' || eerste.telling.fouten === 0) return eerste
  const extra = ingediendMetFouten(eerste.telling.fouten)
  return controleer(ctx, [() => eerste.alle, () => [extra]])
}

export interface ControleContextInvoer {
  jaar: number
  invoer: HuishoudenInvoer
  resultaat: HuishoudenResultaat | null
  params: TaxYearParams
  status: DossierStatus
  /** ISO-datum van vandaag (van de server of de pagina). */
  vandaag: string
  staat?: AangifteStaat | null
  /** Moment van indienen en of de invoer daarna is gewijzigd (server); de editor geeft ook niet-opgeslagen wijzigingen door. */
  ingediend?: { op: string; gewijzigdNa: boolean } | null
  /** Vorig jaar: invoer, en de uitkomst als die er is (anders rekent de aanroeper hem met `rekenVorig`). */
  vorig?: { invoer: HuishoudenInvoer; resultaat?: HuishoudenResultaat | null } | null
  /** Rekent de uitkomst van vorig jaar als die ontbreekt (de engine staat niet in dit bestand, zodat het licht blijft). */
  rekenVorig?: (invoer: HuishoudenInvoer) => HuishoudenResultaat | null
}

/** Bouwt de context voor `controleer`. Alleen Ingediend kent een moment van indienen. */
export function controleContext(x: ControleContextInvoer): ControleContext {
  let vorig: ControleContext['vorig'] = null
  if (x.vorig) {
    let resultaat = x.vorig.resultaat ?? null
    if (resultaat === null && x.rekenVorig) {
      try {
        resultaat = x.rekenVorig(x.vorig.invoer)
      } catch {
        resultaat = null
      }
    }
    vorig = { invoer: x.vorig.invoer, resultaat }
  }
  return {
    jaar: x.jaar,
    invoer: x.invoer,
    resultaat: x.resultaat,
    params: x.params,
    status: x.status,
    ingediend: x.status === 'ingediend' ? (x.ingediend ?? null) : null,
    staat: x.staat ?? null,
    vorig,
    vandaag: x.vandaag,
  }
}

/** Ids van meldingen van de engine die als (open of genegeerde) controle terugkomen. */
export function verborgenMeldingen(uitkomst: Pick<ControleUitkomst, 'alle'>): Set<string> {
  return new Set(uitkomst.alle.map((c) => c.melding).filter((x): x is string => typeof x === 'string'))
}

/** Een uitkomst van de engine zonder de meldingen die als controle terugkomen (voor het blok Meldingen). */
export function zonderVerborgenMeldingen(r: HuishoudenResultaat, verborgen: ReadonlySet<string>): HuishoudenResultaat {
  if (verborgen.size === 0) return r
  return {
    ...r,
    waarschuwingen: r.waarschuwingen.filter((w) => !verborgen.has(w.id)),
    personen: r.personen.map((p) => ({ ...p, waarschuwingen: p.waarschuwingen.filter((w) => !verborgen.has(w.id)) })),
  }
}

/** Open controles per ernst, voor tellers en de poort op de exportpagina. */
export function openPerErnst(uitkomst: Pick<ControleUitkomst, 'open'>): Record<ControleErnst, Controle[]> {
  return {
    fout: uitkomst.open.filter((c) => c.ernst === 'fout'),
    'let-op': uitkomst.open.filter((c) => c.ernst === 'let-op'),
    info: uitkomst.open.filter((c) => c.ernst === 'info'),
  }
}
