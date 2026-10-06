/**
 * Nieuw dossierjaar op basis van het vorige jaar.
 *
 * Wat blijft: personen, kinderen, ondernemingen (naam, uren, startjaar, auto, opdrachtgevers, de omschrijving
 * van de activiteiten in de jaarrekening), loon als sjabloon, woning en verdeling. Het urencriterium staat
 * standaard op ja: zonder antwoord in het vorige jaar wordt het ja, een bewust 'nee' blijft staan.
 * Wat schuift door: vermogen en schulden (eindwaarde wordt beginwaarde; de WOZ-gegevens en dagen eigen gebruik
 * van vastgoed beginnen leeg), en uit de uitkomst
 * van het vorige jaar de saldi van `doorrol.ts`: verliezen na verrekening, niet-benutte zelfstandigenaftrek,
 * restant persoonsgebonden aftrek, de stand van de oudedagsreserve aan het einde, het urencriterium van vorig
 * jaar (per persoon), de eindbalans als beginbalans en het activaregister (verkochte activa eruit, investeringen van
 * vorig jaar erbij, de fiscale boekwaarde aan het einde alleen als het register vorig jaar meetelde, en 'alle
 * bedrijfsmiddelen in het register' alleen als dat vorig jaar zo was). De rest van de jaarrekening, zoals
 * privé-onttrekkingen en de winst-en-verliesrekening, hoort bij het vorige jaar en gaat niet mee.
 * Wat leeg begint: voorlopige aanslagen, investeringen (behalve de rest van een investering die eind vorig jaar nog
 * niet in gebruik was), desinvesteringen en andere verkopen, staking, vrijwillige afneming en het
 * ondernemingsvermogen aan het einde voor de FOR, de boekwaarde begin van vorig jaar, de verwijderde doorgerolde
 * bedrijfsmiddelen van vorig jaar, lijfrente-inleg, giften en zorgkosten, dividend, bronbelasting en andere
 * jaarbedragen, en de herkomst uit Moneybird (die hoort bij de cijfers van het vorige jaar; een nieuwe import zet hem
 * opnieuw).
 *
 * Met het resultaat van het vorige jaar wordt ook de lijfrentehistorie bijgewerkt: het benutte deel
 * per jaar telt op bij `alGebruikt`, het vorige jaar komt als nieuwe regel in de historie (met de
 * berekende jaarruimte) en het premiegrondslag-inkomen en de toename van de FOR van het vorige jaar
 * worden afgeleid. Zonder resultaat blijven de saldi staan zoals ze in het vorige jaar waren ingevuld.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, PersoonInvoer } from '@/lib/tax/types'
import { berekenDoorrol, pasDoorrolToe } from './doorrol'
import { jaarrekeningVoorNieuwJaar } from './jaarrekening'
import { vervreemdingssaldo } from '@/lib/tax/modules/eigen-woning'
import { nieuwJaarPersoonBronbelasting, nieuwJaarPositieBronbelasting } from './doorrol-bronbelasting'

export { forToename, premiegrondslagInkomen } from './doorrol'

const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** Lijfrente: jaarbedragen leeg. De historie, het premiegrondslag-inkomen en de toename van de FOR zet de doorrol. */
function maakLijfrenteLeeg(p: PersoonInvoer, metResultaat: boolean): void {
  const iv = p.inkomensvoorziening
  if (!metResultaat) delete iv.premiegrondslagInkomenVorigJaar
  iv.lijfrentePremies = 0
  delete iv.forOmzetting
  delete iv.nettolijfrenteInleg
  delete iv.forToenameVorigJaar
  delete iv.pensioencorrectieVorigJaar
}

export function nieuwJaarUitVorig(invoer: HuishoudenInvoer, nieuwJaar: number, vorigResultaat?: HuishoudenResultaat): HuishoudenInvoer {
  const uit = kopie(invoer)
  uit.jaar = nieuwJaar
  delete uit.variant
  delete uit.opgegevenToetsingsinkomen

  for (const p of uit.personen) {
    delete p.voorlopigeAanslagIB
    delete p.voorlopigeAanslagZvw
    delete p.voorlopigeAanslagDetails
    // Het box 2-inkomen van vorig jaar en de lopende kortingen zet de doorrol uit de uitkomst; een verzoek om
    // belastingkorting geldt voor het jaar waarin het is gedaan.
    delete p.box2InkomenVorigJaar
    if (p.box2Belastingkorting) {
      delete p.box2Belastingkorting.verzoek
      if (Object.keys(p.box2Belastingkorting).length === 0) delete p.box2Belastingkorting
    }
    nieuwJaarPersoonBronbelasting(p, vorigResultaat?.personen.some((r) => r.id === p.id) ?? false)
    delete p.inkomensvoorziening.stakingslijfrente
    if (!vorigResultaat) delete p.restantPgaVorigJaar
    for (const o of p.ondernemingen) {
      delete o.investeringen
      delete o.desinvesteringen
      delete o.overigeVerkopen
      delete o.staking
      delete o.herinvesteringsreserves
      delete o.egalisatiereserves
      if (o.auto) {
        delete o.auto.eigenBijdrage
        delete o.auto.terBeschikkingTot
        if (o.auto.btw) {
          delete o.auto.btw.btwOpKosten
          delete o.auto.btw.priveKmInclWoonWerk
          delete o.auto.btw.totaalKm
        }
      }
      // Herkomst-id's die in vorig jaar zijn verwijderd, horen bij de doorrol naar vorig jaar.
      delete o.doorrolUitgesloten
      // De boekwaarde begin hoort bij 1 januari van vorig jaar; de doorrol zet die van dit jaar als dat kan.
      for (const a of o.activa ?? []) delete a.boekwaardeBegin
      delete o.maandenGewerkt
      if (o.for) {
        delete o.for.vrijwilligeAfname
        // Een gekozen dotatie (alleen jaren met dotatie) is een jaarbedrag.
        delete (o.for as { dotatie?: number }).dotatie
        // Het ondernemingsvermogen aan het einde hoort bij het vorige jaar; dat van dit jaar is nog niet bekend.
        delete o.for.ondernemingsvermogenEinde
      }
      if (!o.uren) o.uren = { onderneming: 0 }
      if (o.uren.urencriteriumGehaald === undefined) o.uren.urencriteriumGehaald = true
      delete o.uren.urencriteriumVorigJaar
      delete o.bron
      const omschrijving = o.jaarrekening?.omschrijvingActiviteiten?.trim() ? o.jaarrekening.omschrijvingActiviteiten : undefined
      const jaarrekening = jaarrekeningVoorNieuwJaar(o.jaarrekening)
      if (jaarrekening || omschrijving) o.jaarrekening = { ...jaarrekening, ...(omschrijving ? { omschrijvingActiviteiten: omschrijving } : {}) }
      else delete o.jaarrekening
    }
    maakLijfrenteLeeg(p, vorigResultaat?.personen.some((r) => r.id === p.id) ?? false)
  }

  uit.box3 = {
    ...uit.box3,
    posities: uit.box3.posities.map((pos) => {
      // De WOZ-gegevens (met de dagen eigen gebruik) horen bij een jaar met een bekende eindwaarde. Met
      // `woz` zou de engine de eindwaarde als bekend zien; de sectie maakt ze opnieuw zodra die er is.
      nieuwJaarPositieBronbelasting(pos)
      const { waardeEind, stortingen: _s, onttrekkingen: _o, directeOpbrengsten: _d, bronbelasting: _b, dividendbelasting: _dv, categoriewisselDatum: _c, woz: _w, ...rest } = pos
      return { ...rest, waardeBegin: waardeEind ?? pos.waardeBegin }
    }),
    schulden: uit.box3.schulden.map((s) => {
      const { waardeEind, betaaldeRente: _r, ...rest } = s
      return { ...rest, waardeBegin: waardeEind ?? s.waardeBegin }
    }),
  }

  if (uit.pga) delete uit.pga
  if (uit.eigenWoning) {
    const ew = uit.eigenWoning
    // Zonder uitkomst van vorig jaar komt de verkoop van vorig jaar zelf als toevoeging in de reserve.
    if (!vorigResultaat && ew.vorigeWoning) {
      const extra = vervreemdingssaldo(ew.vorigeWoning).toevoegingen
      if (extra.length > 0) ew.eigenwoningreserve = [...(ew.eigenwoningreserve ?? []), ...extra]
    }
    delete ew.vorigeWoning
    delete ew.aankoop
    delete ew.verbeteringen
    // De periode als hoofdverblijf hoort bij vorig jaar; zonder periode telt het hele jaar.
    delete ew.periodeHoofdverblijf
    // De stand op 31 december wordt de stand op 1 januari.
    for (const l of ew.leningdelen ?? []) {
      if (l.standEind !== undefined) l.standBegin = l.standEind
      else delete l.standBegin
      delete l.standEind
    }
  }
  // Ronde 2: de vaste id gaat mee (invulhulp, controles en veld-id's sleutelen erop).
  if (uit.box2) uit.box2 = uit.box2.map((b) => ({ ...(b.id ? { id: b.id } : {}), eigenaar: b.eigenaar, dividend: 0, ingehoudenDividendbelasting: 0, ...(b.schuldAanBV ? { schuldAanBV: b.schuldAanBV } : {}) }))

  // Saldi uit de uitkomst van het vorige jaar (zelfde functie als 'opnieuw overnemen').
  return pasDoorrolToe(uit, berekenDoorrol(invoer, vorigResultaat, nieuwJaar), { nieuwJaar: true }).invoer
}
