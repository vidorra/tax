/**
 * Weergave van back-upgegevens in gewone taal: grootte, tijdstip en de momenten per jaar.
 * Puur en zonder node-modules, zodat de mail, het CLI en de kaart in het dossier dezelfde teksten tonen.
 */
import { formatDatum } from '../../components/ui/format'
import { amsterdamDelen } from './planning'

/** 812 bytes · 14,2 kB · 3,5 MB */
export function formatGrootte(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–'
  const opmaak = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
  if (bytes >= 1024 * 1024) return `${opmaak(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${opmaak(bytes / 1024)} kB`
  return `${bytes} bytes`
}

/** '4 oktober 2026 om 15:32' in Nederlandse tijd. Een ongeldig tijdstip geeft '–'. */
export function tijdstipNL(tijdstip: string | Date): string {
  const d = typeof tijdstip === 'string' ? new Date(tijdstip) : tijdstip
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '–'
  const { jaar, maand, dag, uur, minuut } = amsterdamDelen(d)
  return `${formatDatum(`${jaar}-${maand}-${dag}`)} om ${uur}:${minuut}`
}

/** ['02-01', '08-01'] wordt '1 februari en 1 augustus'. */
export function momentenNL(momenten: readonly string[]): string {
  const namen = momenten.map((md) => formatDatum(`2000-${md}`).replace(/ 2000$/, ''))
  if (namen.length <= 1) return namen.join('')
  return `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`
}
