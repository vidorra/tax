/**
 * Urencriterium (art. 3.6 Wet IB 2001).
 *
 *  - uren onderneming + fictieve verlofuren (min(zwangerschapWeken, params) × gemiddelde uren per week vóór het verlof)
 *    ≥ urencriterium.uren; voor arbeidsongeschikte starters het verlaagde aantal zolang de startersaftrek bij
 *    arbeidsongeschiktheid bestaat
 *  - én (behalve voor starters) meer dan grotendeelsPct van de totale werktijd aan de onderneming
 *  - een opgegeven `urencriteriumGehaald` wint altijd
 *
 * Optioneel veld (bovenop het contract): `indirect` = het deel van de uren dat indirect is (administratie,
 * acquisitie, scholing). Is dat meer dan de helft, dan volgt een waarschuwing over de bewijslast.
 */
import type { Bron, TaxYearParams, UrenInvoer, Uitlegregel, Waarschuwing } from '../../types'
import { eur, pct, regel, waarschuwing } from '../../uitleg'

/** Eigen signaalgrenzen voor waarschuwingen (geen wettelijke getallen). */
const INDIRECT_SIGNAAL = 0.5
const KRAP_MARGE = 1.1
const WEKEN_PER_JAAR = 52

export type UrenInvoerUitgebreid = UrenInvoer & { indirect?: number }

export const HR_BEWIJSLAST_UREN: Bron = {
  titel: 'Hoge Raad 24 januari 2025, ECLI:NL:HR:2025:111 (bewijslast urencriterium)',
  url: 'https://uitspraken.rechtspraak.nl/details?id=ECLI:NL:HR:2025:111',
  datum: '2025-01-24',
}

export interface UrencriteriumResultaat {
  gehaald: boolean
  /** Uren inclusief fictieve verlofuren. */
  uren: number
  fictieveUren: number
  drempel: number
  /** Starter voor het grotendeelscriterium (eerste startersVrijstellingJaren jaar). */
  isStarter: boolean
  grotendeelsGehaald: boolean
  opgegeven: boolean
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

export function toetsUrencriterium(
  uren: UrenInvoerUitgebreid,
  ctx: {
    params: TaxYearParams
    jaar: number
    startjaar: number
    urenLoondienst?: number
    arbeidsongeschiktStarter?: boolean
    prefix?: string
  },
): UrencriteriumResultaat {
  const u = ctx.params.ondernemer.waarde.urencriterium
  const aoActief = ctx.params.ondernemer.waarde.startersaftrekAO.actief
  const prefix = ctx.prefix ?? 'onderneming'
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []

  const isStarter = ctx.jaar - ctx.startjaar < u.startersVrijstellingJaren
  const verlofWeken = Math.min(Math.max(0, uren.zwangerschapWeken ?? 0), u.zwangerschapWeken)
  let gemiddeld = uren.gemiddeldeUrenPerWeekVoorVerlof ?? 0
  if (verlofWeken > 0 && uren.gemiddeldeUrenPerWeekVoorVerlof === undefined) {
    const werkweken = Math.max(1, WEKEN_PER_JAAR - verlofWeken)
    gemiddeld = uren.onderneming / werkweken
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.uren.gemiddelde`,
        'let-op',
        `Vul het gemiddelde aantal uren per week vóór het verlof in. We schatten nu ${eur(gemiddeld)} uur per week uit de opgegeven uren.`,
      ),
    )
  }
  const fictieveUren = Math.round(verlofWeken * gemiddeld)
  const totaal = uren.onderneming + fictieveUren
  const verlaagd = ctx.arbeidsongeschiktStarter === true && aoActief
  const drempel = verlaagd ? u.verlaagdAO : u.uren
  const loondienst = Math.max(0, uren.loondienst ?? ctx.urenLoondienst ?? 0)
  const grotendeelsGehaald = isStarter || loondienst === 0 || totaal > u.grotendeelsPct * (totaal + loondienst)
  const berekend = totaal >= drempel && grotendeelsGehaald
  const opgegeven = uren.urencriteriumGehaald !== undefined
  // Standaard: zonder ingevulde uren en zonder keuze geldt het urencriterium als gehaald (de vraag staat
  // in de invoer standaard op ja). Wie uren invult, krijgt de echte toets.
  const aangenomen = !opgegeven && !(uren.onderneming > 0) && fictieveUren === 0
  const gehaald = opgegeven ? uren.urencriteriumGehaald! : aangenomen ? true : berekend

  uitleg.push(
    regel(`${prefix}.uren`, 'Uren aan de onderneming', uren.onderneming, 'info', { niveau: 2, formule: `${eur(uren.onderneming)} uur` }),
  )
  if (fictieveUren > 0) {
    uitleg.push(
      regel(`${prefix}.uren.verlof`, 'Zwangerschaps- en bevallingsverlof (telt als gewerkt)', fictieveUren, 'info', {
        niveau: 2,
        formule: `${verlofWeken} weken × ${eur(gemiddeld)} uur`,
        parameter: 'ondernemer.urencriterium.zwangerschapWeken',
      }),
    )
  }
  uitleg.push(
    regel(`${prefix}.urencriterium`, gehaald ? 'Urencriterium gehaald' : 'Urencriterium niet gehaald', totaal, 'info', {
      niveau: 1,
      formule: opgegeven
        ? 'zelf opgegeven'
        : aangenomen
          ? 'aangenomen: geen uren ingevuld, standaard ja'
          : `${eur(totaal)} uur ${totaal >= drempel ? 'is minstens' : 'is minder dan'} ${eur(drempel)} uur${
            loondienst > 0 && !isStarter ? `; ${pct(totaal / (totaal + loondienst), 0)} van de werktijd aan de onderneming (moet meer dan ${pct(u.grotendeelsPct, 0)} zijn)` : ''
          }`,
      parameter: verlaagd ? 'ondernemer.urencriterium.verlaagdAO' : 'ondernemer.urencriterium.uren',
      bron: HR_BEWIJSLAST_UREN,
    }),
  )

  if (opgegeven && uren.onderneming > 0 && uren.urencriteriumGehaald !== berekend) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.uren.afwijkend`,
        'let-op',
        `Je hebt opgegeven dat het urencriterium ${uren.urencriteriumGehaald ? 'wel' : 'niet'} is gehaald, maar de ingevulde uren wijzen op het tegendeel. We volgen je keuze.`,
      ),
    )
  }
  if (!grotendeelsGehaald && !opgegeven && !aangenomen) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.uren.grotendeels`,
        'let-op',
        `Je werkt niet meer dan ${pct(u.grotendeelsPct, 0)} van je tijd voor de onderneming. Na de startersjaren geldt dan het urencriterium niet als gehaald, ook niet bij ${eur(u.uren)} uur of meer.`,
      ),
    )
  }
  if (uren.indirect !== undefined && uren.indirect > INDIRECT_SIGNAAL * uren.onderneming) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.uren.bewijslast`,
        'let-op',
        'Meer dan de helft van je uren is indirect (administratie, acquisitie, scholing). Die tellen mee, maar de bewijslast ligt bij jou en is volgens de Hoge Raad niet licht. Houd een gespecificeerde urenadministratie bij.',
        HR_BEWIJSLAST_UREN,
      ),
    )
  } else if (!opgegeven && totaal >= drempel && totaal < drempel * KRAP_MARGE) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.uren.krap`,
        'info',
        `Je zit net boven de ${eur(drempel)} uur. De bewijslast ligt bij jou; een urenadministratie per dag met omschrijving voorkomt discussie.`,
        HR_BEWIJSLAST_UREN,
      ),
    )
  }

  return { gehaald, uren: totaal, fictieveUren, drempel, isStarter, grotendeelsGehaald, opgegeven, uitleg, waarschuwingen }
}
