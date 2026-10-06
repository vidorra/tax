/**
 * Ronde 2 (A1): kleine lezers voor de pagina Aangifte invullen die geen React nodig hebben (en dus te testen zijn):
 * een jaar zonder invoer, de datum waarop de aangifte opent, het filter bij het openen, een rij zoeken op sleutel en
 * het moment van de opslag in Nederlandse tijd.
 *
 * Puur: geen React, geen I/O; `vandaag` komt van buiten.
 */
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import { formatDatum } from '@/components/ui/format'
import type { InvulhulpOpbouw, InvulhulpVoortgang, Rubriek, Scherm, Veld } from './types'
import { schermenVan, veldStatus, type InvulhulpFilter } from './voortgang'

/** Staat er nog niets in het dossier waarmee je een aangifte kunt invullen (alleen de persoonsgegevens)? */
export function invoerIsLeeg(invoer: HuishoudenInvoer): boolean {
  const personenLeeg = invoer.personen.every(
    (p) =>
      p.ondernemingen.length === 0 &&
      p.loon.length === 0 &&
      !p.resultaatOverigWerk &&
      !p.periodiekeUitkeringen &&
      !(p.terbeschikkingstellingen?.length ?? 0) &&
      !p.inkomensvoorziening?.lijfrentePremies &&
      !p.inkomensvoorziening?.aovPremies &&
      !p.voorlopigeAanslagIB &&
      !p.voorlopigeAanslagZvw,
  )
  return personenLeeg && !invoer.eigenWoning && invoer.box3.posities.length === 0 && invoer.box3.schulden.length === 0 && !(invoer.box2?.length ?? 0)
}

/** Dag waarop de aangifte over `jaar` opent (ISO), uit de indeling ('03-01' in het jaar erna); null zonder datum. */
export function aangifteOpent(jaar: number, opentOp: string | undefined): string | null {
  if (!opentOp || !/^\d{2}-\d{2}$/.test(opentOp)) return null
  return `${jaar + 1}-${opentOp}`
}

/** Is de aangifte over dit jaar nog niet open (het jaar loopt nog of is net voorbij)? */
export function nogNietOpen(jaar: number, opentOp: string | undefined, vandaag: string): boolean {
  const opent = aangifteOpent(jaar, opentOp)
  return opent !== null && vandaag < opent
}

/** "De aangifte over 2026 opent op 1 maart 2027." of null als hij al open is. */
export function opentZin(jaar: number, opentOp: string | undefined, vandaag: string): string | null {
  const opent = aangifteOpent(jaar, opentOp)
  if (!opent || vandaag >= opent) return null
  return `De aangifte over ${jaar} opent op ${formatDatum(opent)}.`
}

/** Filter bij het openen: "Nog te doen" als er bij deze persoon al iets is afgevinkt, anders "Alles". */
export function beginFilter(opbouw: Pick<InvulhulpOpbouw, 'schermen' | 'samenBij'>, voortgang: InvulhulpVoortgang | undefined, persoon: PersoonId): InvulhulpFilter {
  const vgs = voortgang?.velden?.[persoon]
  if (!vgs) return 'alles'
  for (const s of schermenVan(opbouw, persoon)) {
    for (const r of s.rubrieken) for (const v of r.velden) if (vgs[v.sleutel]?.afgevinkt && veldStatus(v, vgs[v.sleutel]) !== 'gewijzigd') return 'te-doen'
  }
  return 'alles'
}

/** Zoekt een rij op zijn sleutel (voor een link met #sleutel uit de controles); ook een schermsleutel geeft het scherm. */
export function vindRij(opbouw: Pick<InvulhulpOpbouw, 'schermen'>, sleutel: string): { scherm: Scherm; rubriek?: Rubriek; veld?: Veld } | null {
  for (const scherm of opbouw.schermen) {
    if (scherm.sleutel === sleutel) return { scherm }
    if (!sleutel.startsWith(`${scherm.sleutel}/`)) continue
    for (const rubriek of scherm.rubrieken) {
      const veld = rubriek.velden.find((v) => v.sleutel === sleutel)
      if (veld) return { scherm, rubriek, veld }
    }
  }
  return null
}

const DATUM = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Amsterdam',
})
const DATUM_KORT = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Amsterdam',
})
const TIJD = new Intl.DateTimeFormat('nl-NL', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/Amsterdam',
})

/** Moment van de opslag in Nederlandse tijd: { datum: '4 oktober', kort: '4 okt', tijd: '14:02' }; null als het geen tijdstip is. */
export function opslagMoment(iso: string | null | undefined): { datum: string; kort: string; tijd: string } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return {
    datum: DATUM.format(d),
    kort: DATUM_KORT.format(d).replace(/\.$/, ''),
    tijd: TIJD.format(d),
  }
}
