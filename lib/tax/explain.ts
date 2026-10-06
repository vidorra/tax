import type { HuishoudenResultaat, PersoonResultaat, Uitlegregel } from './types'
import { eur } from './uitleg'

/** Uitlegregels als platte tekstregels (voor PDF-export en kopiëren naar de accountant). */
export function regelsAlsTekst(regels: Uitlegregel[]): string[] {
  return regels.map((r) => {
    const inspring = '  '.repeat(r.niveau)
    const bedrag = r.soort === 'info' && r.bedrag === 0 ? '' : eur(r.bedrag)
    const formule = r.formule ? `  (${r.formule})` : ''
    return `${inspring}${r.label}${bedrag ? `: ${bedrag}` : ''}${formule}`
  })
}

/** Markdown-samenvatting van een berekening in de opbouw van het fiscaal rapport. */
export function resultaatAlsMarkdown(r: HuishoudenResultaat, namen: Partial<Record<'A' | 'B', string>> = {}): string {
  const regels: string[] = [`# Berekening inkomstenbelasting ${r.jaar}${r.variant ? ` (variant ${r.variant})` : ''}`, '', `Status parameters: ${r.paramsStatus}. Indicatieve berekening, geen fiscaal advies.`, '']
  const persoon = (p: PersoonResultaat) => {
    regels.push(`## ${namen[p.id] ?? `Persoon ${p.id}`}`, '')
    for (const t of regelsAlsTekst(p.uitleg)) regels.push(`- ${t}`)
    if (p.waarschuwingen.length) {
      regels.push('', '**Aandachtspunten**', '')
      for (const w of p.waarschuwingen) regels.push(`- ${w.tekst}`)
    }
    regels.push('')
  }
  r.personen.forEach(persoon)
  regels.push('## Huishouden', '')
  for (const t of regelsAlsTekst(r.uitleg)) regels.push(`- ${t}`)
  regels.push('', `Totaal te betalen IB: ${eur(r.totaal.teBetalenIB)}; Zvw: ${eur(r.totaal.teBetalenZvw)}; toeslagen: ${eur(r.totaal.toeslagen)}.`)
  return regels.join('\n')
}
