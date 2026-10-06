/**
 * Ronde 2 (A3): de controles in het fiscaal rapport. De exportpagina geeft de uitkomst van `controleerAlles` mee
 * (`rapportControles`); de verantwoording zet er de lijsten van (`controlesVerantwoording`). Puur.
 *
 * - Concept (of Gecontroleerd) met open fouten (`exportConcept`): CONCEPT op elke pagina, `-concept` in de
 *   bestandsnaam, bovenaan de verantwoording "Concept: er staan nog {n} fouten open." en de lijst "Open fouten".
 * - Ingediend met open fouten (`exportIngediendOpen`, besluit na de nacontrole): geen CONCEPT, wel de kopregel
 *   "Ingediend, met {n} open controles" en de lijst "Open controles".
 * - Altijd, ook zonder fouten: "Bewust genegeerde controles" met titel, reden en datum.
 */
import type { ControleUitkomst } from '@/lib/controles/types'
import type { RapportControles, VerantwoordingControles } from './model'
import { datumLang } from './notatie'

/** Wat het rapport van de controles nodig heeft. */
export function rapportControles(u: Pick<ControleUitkomst, 'open' | 'genegeerd' | 'exportConcept' | 'exportIngediendOpen'>): RapportControles {
  return {
    concept: u.exportConcept,
    ingediendOpen: u.exportIngediendOpen,
    open: u.open.filter((c) => c.ernst === 'fout').map((c) => ({ titel: c.titel, ...(c.waar ? { waar: c.waar } : {}), uitleg: c.uitleg })),
    genegeerd: u.genegeerd.map(({ controle, negering }) => ({
      titel: negering.titel || controle.titel,
      ...(controle.waar ? { waar: controle.waar } : {}),
      ...(negering.reden?.trim() ? { reden: negering.reden.trim() } : {}),
      op: negering.op,
      ernst: negering.ernst,
    })),
  }
}

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`

/** De kopregel bij open fouten, of undefined. */
export function controlesKop(c: Pick<RapportControles, 'concept' | 'ingediendOpen' | 'open'>): string | undefined {
  if (c.ingediendOpen > 0) return `Ingediend, met ${meervoud(c.ingediendOpen, 'open controle', 'open controles')}`
  if (c.concept) {
    const n = c.open.length
    return `Concept: er ${n === 1 ? 'staat' : 'staan'} nog ${meervoud(n, 'fout', 'fouten')} open.`
  }
  return undefined
}

/** De controles voor de verantwoording; undefined als er niets te melden is. */
export function controlesVerantwoording(c: RapportControles | undefined): VerantwoordingControles | undefined {
  if (!c) return undefined
  const kop = controlesKop(c)
  const metOpen = c.concept || c.ingediendOpen > 0
  const genegeerd = c.genegeerd.map((g) => ({
    titel: g.titel,
    ...(g.waar ? { waar: g.waar } : {}),
    reden: g.reden ?? (g.ernst === 'fout' ? 'Genegeerd' : 'Als gezien afgevinkt'),
    datum: /^\d{4}-\d{2}-\d{2}/.test(g.op) ? datumLang(g.op.slice(0, 10)) : g.op,
    ernst: g.ernst,
  }))
  if (!kop && genegeerd.length === 0) return undefined
  return {
    ...(kop ? { kop } : {}),
    ...(metOpen ? { openTitel: c.ingediendOpen > 0 ? 'Open controles' : 'Open fouten' } : {}),
    open: metOpen ? c.open : [],
    genegeerd,
  }
}
