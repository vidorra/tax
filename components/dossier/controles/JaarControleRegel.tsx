/**
 * Ronde 2 (A3): de regels over controles en invulhulp op een jaarkaart van het overzicht (ux-ronde2.md 4.5), uit de
 * laatste opslag (`JaarOverzicht.controles`, `controlesStreng`, `invulhulp`, `ingediend`).
 *
 * - Rustig (concept zonder `controles.streng`): grijs "3 controles"; zonder open controles niets.
 * - Streng: rood "✕ 2 fouten open", of "✓ Controles in orde bij de laatste opslag".
 * - "Aangifte: 18 van 42" zodra er iets is afgevinkt in de invulhulp.
 * - Ingediend en daarna gewijzigd: amber "Gewijzigd na indienen".
 */
import { Check } from 'lucide-react'
import type { JaarOverzicht } from '@/lib/dossier/opslag'
import { NiveauIcoon, aantalTekst, controlesTekst } from './niveau'

export function jaarControleTekst(j: Pick<JaarOverzicht, 'controles' | 'controlesStreng'>): { soort: 'rustig' | 'fout' | 'in-orde'; tekst: string } | null {
  const t = j.controles
  if (!t) return null
  if (!j.controlesStreng) {
    const n = t.fouten + t.letOp + t.info
    return n === 0 ? null : { soort: 'rustig', tekst: controlesTekst(n) }
  }
  if (t.fouten > 0) return { soort: 'fout', tekst: `${aantalTekst('fout', t.fouten)} open` }
  return { soort: 'in-orde', tekst: 'Controles in orde bij de laatste opslag' }
}

export function invulhulpTekst(j: Pick<JaarOverzicht, 'invulhulp'>): string | null {
  const tellingen = Object.values(j.invulhulp ?? {})
  const afgevinkt = tellingen.reduce((s, t) => s + Math.max(0, t?.afgevinkt ?? 0), 0)
  const totaal = tellingen.reduce((s, t) => s + Math.max(0, t?.totaal ?? 0), 0)
  return afgevinkt > 0 && totaal > 0 ? `Aangifte: ${afgevinkt} van ${totaal}` : null
}

export function JaarControleRegel({ jaar: j }: { jaar: JaarOverzicht }) {
  const c = jaarControleTekst(j)
  const invulhulp = invulhulpTekst(j)
  const gewijzigd = j.status === 'ingediend' && j.ingediend?.gewijzigdNa
  if (!c && !invulhulp && !gewijzigd) return null
  return (
    <div className="mt-3 space-y-1 text-sm">
      {c && (
        <p className={c.soort === 'fout' ? 'flex items-center gap-1.5 font-medium text-red-800' : 'flex items-center gap-1.5 text-gray-600'}>
          {c.soort === 'fout' && <NiveauIcoon ernst="fout" />}
          {c.soort === 'in-orde' && <Check aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-primary" />}
          {c.soort === 'fout' && <span className="sr-only">Fout: </span>}
          {c.tekst}
        </p>
      )}
      {invulhulp && <p className="text-gray-600">{invulhulp}</p>}
      {gewijzigd && <p className="text-amber-800">Gewijzigd na indienen</p>}
    </div>
  )
}
