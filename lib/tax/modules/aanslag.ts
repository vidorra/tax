/**
 * Aanslaggrens en teruggaafgrens per belastingplichtige (art. 9.4 Wet IB 2001), ronde 2 onderdeel A2.
 *
 * V = verschuldigde inkomstenbelasting en premie volksverzekeringen na heffingskortingen (zonder Zvw);
 * S = voorheffingssaldo: voorheffingen (loonheffing, Nederlandse dividendbelasting) min ontvangen voorlopige teruggaven
 * (een negatieve `voorlopigeAanslagIB`). Gronden voor een aanslag (lid 1): a (V − S > aanslaggrens), b (aangifte gedaan),
 * c (rendementsgrondslag op 1 januari boven de grens; partners samen boven het dubbele), d (vrijgestelde groene
 * beleggingen).
 *
 *   als V − S > aanslaggrens            → aanslag, te betalen V − S (grond a)
 *   anders als geen grond b, c of d     → geen aanslag; niets te betalen of terug (lid 2)
 *   anders als S − V ≤ teruggaafgrens   → aanslag nihil (ook 0 ≤ V − S ≤ aanslaggrens) (lid 5)
 *   anders                              → aanslag, terug S − V
 *   daarna positieve voorlopige aanslagen verrekenen (AWR art. 15); de grenzen gelden daar niet voor
 *
 * De laatste regel volgt de wettekst. De Belastingdienst schrijft op zijn site vereenvoudigd "minder dan € 58 betalen,
 * dan geen aanslag"; wie een voorlopige aanslag had, kan na verrekening een klein verschil toch krijgen. Dat staat als
 * melding in de uitleg (open punt 2 in het ontwerp). De Zvw-bijdrage kent in de Wet IB geen aanslaggrens.
 *
 * Puur: geen React, geen I/O. `teBetalenIB` in de engine blijft het berekende bedrag; deze uitkomst komt erbij.
 */
import type { AanslagUitkomst, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { euro, eur, regel, waarschuwing } from '../uitleg'

export interface AanslagInvoer {
  /** V: verschuldigde IB en premie volksverzekeringen na heffingskortingen, zonder Zvw. */
  verschuldigd: number
  /** Voorheffingen: loonheffing en Nederlandse dividendbelasting. */
  voorheffingen: number
  /** Opgelegde voorlopige aanslag; negatief is een voorlopige teruggaaf (verlaagt het voorheffingssaldo, lid 7). */
  voorlopigeAanslagIB?: number
}

export interface AanslagContext {
  params: TaxYearParams
  /** Grond b; ontbreekt = ja (het dossier doet altijd aangifte). */
  aangifteGedaan?: boolean
  /** Grond c: rendementsgrondslag op 1 januari van de persoon, of bij partners van beiden samen. */
  rendementsgrondslag?: number
  fiscaalPartner?: boolean
  /** Grond d: de persoon of de partner heeft op 1 januari vrijgestelde groene beleggingen. */
  groeneBeleggingen?: boolean
}

export function berekenAanslag(persoon: AanslagInvoer, ctx: AanslagContext): AanslagUitkomst {
  const o = ctx.params.overig.waarde
  const va = persoon.voorlopigeAanslagIB ?? 0
  const V = persoon.verschuldigd
  // Een voorlopige teruggaaf verlaagt het voorheffingssaldo; een positieve voorlopige aanslag niet.
  const S = persoon.voorheffingen + Math.min(0, va)
  const vaPositief = Math.max(0, va)
  const d = V - S
  const grensC = o.aanslagRendementsgrondslag * (ctx.fiscaalPartner ? 2 : 1)
  const grond: AanslagUitkomst['grond'] =
    d > o.aanslaggrens
      ? 'a'
      : ctx.aangifteGedaan !== false
        ? 'b'
        : (ctx.rendementsgrondslag ?? 0) > grensC
          ? 'c'
          : ctx.groeneBeleggingen
            ? 'd'
            : 'geen'

  let aanslagTeBetalen = 0
  let aanslagTerug = 0
  let vervallenDoorGrens: AanslagUitkomst['vervallenDoorGrens'] = null
  if (grond === 'a') {
    aanslagTeBetalen = d
  } else if (grond === 'geen') {
    // Geen aanslag: niets te betalen en voorheffingen worden niet verrekend (lid 2).
    if (d > 0) vervallenDoorGrens = { soort: 'aanslaggrens', bedrag: d }
  } else if (-d <= o.teruggaafgrens) {
    // Aanslag nihil (lid 5): een bijbetaling tot en met de aanslaggrens of een teruggaaf tot en met de teruggaafgrens vervalt.
    if (d > 0) vervallenDoorGrens = { soort: 'aanslaggrens', bedrag: d }
    else if (d < 0) vervallenDoorGrens = { soort: 'teruggaafgrens', bedrag: -d }
  } else {
    aanslagTerug = -d
  }

  // Daarna de positieve voorlopige aanslagen verrekenen (AWR art. 15); de grenzen gelden daar niet voor.
  const netto = aanslagTeBetalen - aanslagTerug - vaPositief
  return {
    grond,
    verschuldigd: V,
    voorheffingssaldo: S,
    voorlopigeAanslagen: vaPositief,
    teBetalen: Math.max(0, netto) + 0,
    terug: Math.max(0, -netto) + 0,
    vervallenDoorGrens,
  }
}

const GROND_TEKST: Record<AanslagUitkomst['grond'], string> = {
  a: 'het verschil is groter dan de aanslaggrens',
  b: 'er is aangifte gedaan',
  c: 'de rendementsgrondslag op 1 januari ligt boven de grens',
  d: 'er zijn vrijgestelde groene beleggingen',
  geen: 'er is geen grond voor een aanslag',
}

/** Uitlegregels en meldingen bij de aanslag van één persoon (voor de berekening per persoon in het uitkomstpaneel). */
export function aanslagUitleg(a: AanslagUitkomst, params: TaxYearParams): { uitleg: Uitlegregel[]; waarschuwingen: Waarschuwing[] } {
  const o = params.overig.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const verschil = a.verschuldigd - a.voorheffingssaldo
  uitleg.push(
    regel('aanslag-grond', `Aanslag: ${GROND_TEKST[a.grond]}`, verschil, 'info', {
      niveau: 1,
      formule: `verschuldigd ${eur(a.verschuldigd)} − voorheffingssaldo ${eur(a.voorheffingssaldo)}; aanslaggrens ${eur(o.aanslaggrens)}, teruggaafgrens ${eur(o.teruggaafgrens)}`,
      parameter: 'overig.aanslaggrens',
    }),
  )
  if (a.vervallenDoorGrens) {
    const v = a.vervallenDoorGrens
    uitleg.push(
      regel(
        'aanslag-grens',
        v.soort === 'aanslaggrens' ? `Onder de aanslaggrens: ${euro(v.bedrag)} wordt niet opgelegd` : `Onder de teruggaafgrens: ${euro(v.bedrag)} wordt niet uitbetaald`,
        v.bedrag,
        'info',
        { niveau: 1, parameter: v.soort === 'aanslaggrens' ? 'overig.aanslaggrens' : 'overig.teruggaafgrens' },
      ),
    )
  }
  if (a.voorlopigeAanslagen > 0) {
    uitleg.push(regel('aanslag-va', 'Verrekend met de voorlopige aanslag (buiten de grenzen)', -a.voorlopigeAanslagen, 'min', { niveau: 1 }))
  }
  uitleg.push(
    regel('aanslag-na-grenzen', a.terug > 0 ? 'Terug na de grenzen' : 'Te betalen na de grenzen', a.terug > 0 ? -a.terug : a.teBetalen, 'subtotaal', { niveau: 0 }),
  )
  uitleg.push(regel('aanslag-zvw', 'Voor de Zvw-bijdrage geldt geen aanslaggrens', 0, 'info', { niveau: 2 }))

  // G6: na verrekening van de voorlopige aanslag blijft een klein verschil over dat volgens de wet toch wordt opgelegd.
  const na = a.teBetalen - a.terug
  if (a.voorlopigeAanslagen > 0 && na !== 0 && Math.abs(na) <= (na > 0 ? o.aanslaggrens : o.teruggaafgrens)) {
    waarschuwingen.push(
      waarschuwing(
        'aanslag-grens-na-va',
        'info',
        na > 0
          ? `Na verrekening van je voorlopige aanslag blijft ${euro(na)} over. Volgens de wet geldt de aanslaggrens van ${euro(o.aanslaggrens)} niet voor dat verschil, dus we rekenen het mee. De Belastingdienst schrijft op zijn site dat je onder die grens niets betaalt; kijk na wat er op je aanslag staat.`
          : `Na verrekening van je voorlopige aanslag krijg je ${euro(-na)} terug. Volgens de wet geldt de teruggaafgrens van ${euro(o.teruggaafgrens)} niet voor dat verschil, dus we rekenen het mee. Kijk na wat er op je aanslag staat.`,
      ),
    )
  }
  return { uitleg, waarschuwingen }
}
