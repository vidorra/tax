/**
 * Winst uit onderneming (vóór ondernemersaftrek), in de volgorde van het fiscaal rapport:
 *
 *   saldo fiscale winstberekening
 *   + correctie beperkt aftrekbare kosten
 *   + bijtelling auto (alleen uitgesplitst)
 *   − KIA − EIA − MIA
 *   + desinvesteringsbijtelling
 *   + verplichte en vrijwillige afname FOR − dotatie FOR
 *   = winst uit onderneming
 *
 * Een eventuele stakingswinst zit in het saldo; alleen stakingsposten die er niet in zitten (standaard een overgang
 * naar privé) telt de engine erbij. Ronde 2 (A6): de uitkomst `staking` specificeert de stakingswinst met de vrijval van
 * de FOR en de reserves en de desinvesteringsbijtelling, en geeft de stakingsaftrek (modules/onderneming/staking.ts).
 *
 * Ronde 2 (A6), herinvesteringsreserve en kostenegalisatiereserve (modules/onderneming/reserves.ts): dotatie, vrijval
 * en onttrekking buiten het saldo tellen als `correctieReserves` vóór de FOR; de afboeking op een investering verlaagt
 * de investeringsaftrek (tenzij `kiaOverVolBedrag`) en de afschrijving van het middel in het register. Auto
 * (modules/onderneming/auto.ts): bijtelling en btw-correctie; een btw-correctie die niet in de autokosten zit, gaat van
 * de winst af (ook bij een saldo).
 *
 * Bij soort 'saldo' is het saldo uit het rapport al na aftrek van alle kosten, inclusief de volledige
 * beperkt aftrekbare kosten, autokosten en kilometers; er komt dan geen bijtelling of kilometeraftrek bij.
 * Het activaregister telt alleen mee voor de winst als `activaVolledig` true is (alle bedrijfsmiddelen staan erin).
 * Met een volledig register en `afschrijvingenInSaldo` corrigeren we het saldo naar de fiscale afschrijving:
 *   saldo = ingevoerd saldo + (afschrijvingen in het saldo − fiscale afschrijving volgens het register)
 * Zonder `afschrijvingenInSaldo` telt het register niet mee (met een melding).
 * Bij soort 'uitgesplitst':
 *   saldo = omzet + wijziging onderhanden werk + financiële baten en lasten − kosten − afschrijvingen
 *           + boekresultaat verkoop activa − beperkt aftrekbare kosten − autokosten − kilometeraftrek
 * waarbij een volledig activaregister de ingevulde afschrijvingen en het boekresultaat levert.
 * Een register dat niet volledig is (of waarvan dat niet is aangegeven) is een fiscale controle zonder effect op de
 * winst: de afschrijving uit de boekhouding blijft staan, met een info-melding over het verschil.
 *
 * Een verkocht actief met `investeringsaftrek` geeft binnen de termijn vanzelf een desinvesteringsbijtelling. Voor de
 * drempel tellen alle verkopen van het jaar: register, desinvesteringslijst en `overigeVerkopen`.
 */
import type { AfschrijvingActief, AutoUitkomst, OndernemingInvoer, OndernemingResultaat, StakingUitkomst, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { eur, euro, pct, regel, waarschuwing } from '../../uitleg'
import { berekenAfschrijvingen, type AfschrijvingResultaat } from './afschrijving'
import { berekenBijtellingAuto } from './auto'
import { berekenFor, ondernemingsvermogenUitBalans, type ForInvoer } from './for'
import { berekenDesinvesteringsbijtelling, berekenInvesteringsaftrek, desinvesteringenUitActiva } from './investeringsaftrek'
import { toetsUrencriterium, type UrenInvoerUitgebreid } from './urencriterium'
import { activaMetAfboeking, berekenReserves, stakingSoort } from './reserves'
import { berekenStaking, stakingBijgeteld } from './staking'

const afrondKm = AFRONDING.kilometeraftrek

export interface OndernemingContext {
  params: TaxYearParams
  jaar: number
  /** AOW-leeftijd bereikt op 1 januari (FOR valt vrij). */
  aowBereikt: boolean
  /** Uren in loondienst van deze persoon (grotendeelscriterium); `uren.loondienst` op de onderneming wint. */
  urenLoondienst: number
  /** Urencriterium vorig jaar; alleen `false` telt voor de FOR-afname na twee jaar. Ontbreekt = `uren.urencriteriumVorigJaar`. */
  urencriteriumVorigJaar?: boolean
  /** Parameters van een eerder jaar (afschrijving van activa uit eerdere jaren); ontbreekt = die van dit jaar. */
  paramsVoorJaar?: (jaar: number) => TaxYearParams | undefined
  /**
   * Optioneel: urencriterium dat al over alle ondernemingen van de persoon samen is bepaald.
   * Wint van de toets op deze ene onderneming (het urencriterium geldt per persoon).
   */
  urencriteriumPersoon?: boolean
  /**
   * Optioneel: de vrijwillige FOR-afname is ten hoogste dit bedrag (art. 3.70 lid 1 onder a: de lijfrentepremies die
   * dit jaar worden afgetrokken, het deel voor deze onderneming). De engine geeft het altijd mee.
   */
  vrijwilligeAfnameMax?: number
  /** Optioneel: prefix voor de id's van uitlegregels en waarschuwingen (standaard afgeleid van de naam). */
  prefix?: string
  /**
   * Ronde 2 (contract; bedrag berekend door lib/tax/modules/partner.ts, onderdeel A5): correctie op de winst voor
   * beloning aan of terbeschikkingstelling door de fiscale partner (negatief = lagere winst). Telt mee vóór de FOR,
   * zodat de dotatie (2021 en 2022) en de verplichte afname met de gecorrigeerde winst rekenen; staat in de uitkomst als
   * `correctiePartner`. De uitleg per post maakt de partnermodule; hier staat één regel.
   */
  correctiePartner?: number
  /**
   * Ronde 2 (A6): stakingsaftrek die de persoon in eerdere jaren genoot (`PersoonInvoer.genotenStakingsaftrek`, de
   * doorrol); `StakingInvoer.eerderGenotenStakingsaftrek` gaat voor.
   */
  genotenStakingsaftrek?: number
  /** Ronde 2 (A6): sleutel van een investering voor de uitkomst (itemSleutel uit lib/dossier/ids.ts); standaard de id of de index. */
  investeringSleutel?: (inv: NonNullable<OndernemingInvoer['investeringen']>[number], index: number) => string
}

export function slug(naam: string): string {
  return (
    naam
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'onderneming'
  )
}

/**
 * Telt het activaregister mee voor de winst? Alleen als alle bedrijfsmiddelen erin staan (`activaVolledig` true) en
 * de geboekte afschrijving te vervangen is ('uitgesplitst') of te corrigeren ('saldo' met `afschrijvingenInSaldo`).
 * Anders is het register een fiscale controle zonder effect op de winst. Eén regel voor de engine
 * (`OndernemingResultaat.activaregisterTeltMee`), de doorrol van de fiscale boekwaarde, het scherm en het rapport.
 */
export function activaregisterTeltMee(o: OndernemingInvoer): boolean {
  if (!o.activa || o.activa.length === 0 || o.activaVolledig !== true) return false
  return o.winstberekening.soort === 'uitgesplitst' || o.winstberekening.afschrijvingenInSaldo !== undefined
}

/** Correctie beperkt aftrekbare kosten: het laagste van (1 − aftrekbaarDeel) × B en min(B, drempel). */
export function correctieBeperktAftrekbaar(bedrag: number, params: TaxYearParams): { correctie: number; methode: 'pct' | 'drempel'; formule: string } {
  const b = params.ondernemer.waarde.beperktAftrekbaar
  const B = Math.max(0, bedrag)
  const viaPct = (1 - b.aftrekbaarDeel) * B
  const viaDrempel = Math.min(B, b.drempel)
  if (viaPct <= viaDrempel) {
    return { correctie: AFRONDING.correctieBeperktAftrekbaar(viaPct), methode: 'pct', formule: `${pct(1 - b.aftrekbaarDeel)} van ${eur(B)} (voordeliger dan de drempel van ${eur(b.drempel)})` }
  }
  return { correctie: AFRONDING.correctieBeperktAftrekbaar(viaDrempel), methode: 'drempel', formule: `drempel: ${eur(B)} tot maximaal ${eur(b.drempel)} (voordeliger dan ${pct(1 - b.aftrekbaarDeel)})` }
}

export function berekenOnderneming(o: OndernemingInvoer, ctx: OndernemingContext): OndernemingResultaat {
  const p = ctx.params
  const op = p.ondernemer.waarde
  const status = p.ondernemer.status
  const prefix = ctx.prefix ?? `onderneming.${slug(o.naam)}`
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []

  // Urencriterium (nodig voor starters, FOR en de ondernemersaftrek).
  const uren = toetsUrencriterium(o.uren as UrenInvoerUitgebreid, {
    params: p,
    jaar: ctx.jaar,
    startjaar: o.startjaar,
    urenLoondienst: ctx.urenLoondienst,
    arbeidsongeschiktStarter: o.arbeidsongeschiktStarter !== undefined,
    prefix,
  })
  const urencriteriumGehaald = ctx.urencriteriumPersoon ?? uren.gehaald
  const isStarter = uren.isStarter

  // Ronde 2 (A6): herinvesteringsreserves en kostenegalisatiereserves. De afboeking per investering is nodig voor de
  // afschrijving (register) en de investeringsaftrek hieronder.
  const reserves = berekenReserves(o, { params: p, jaar: ctx.jaar, prefix, ...(ctx.investeringSleutel ? { investeringSleutel: ctx.investeringSleutel } : {}) })
  waarschuwingen.push(...reserves.waarschuwingen)
  const activa = activaMetAfboeking(o.activa, o.investeringen, reserves.afboekingPerInvestering)

  // Activaregister: fiscale afschrijving en boekwaarde per actief, bij beide soorten winstberekening. Alleen een
  // volledig register (activaVolledig) vervangt de geboekte afschrijving; anders is het een controle.
  let register: AfschrijvingResultaat | undefined
  let afschrijvingenPerActief: AfschrijvingActief[] | undefined
  if (activa && activa.length > 0) {
    const reserveHerkomsten = new Set((o.herinvesteringsreserves ?? []).map((r) => r.herkomst.actiefHerkomst).filter((h): h is string => typeof h === 'string'))
    register = berekenAfschrijvingen(activa, { params: p, jaar: ctx.jaar, isStarter, prefix, startjaar: o.startjaar, paramsVoorJaar: ctx.paramsVoorJaar, reserveHerkomsten })
    afschrijvingenPerActief = register.perActief.map(({ formule: _formule, ...x }) => x)
    waarschuwingen.push(...register.waarschuwingen)
  }
  const registerVolledig = register !== undefined && o.activaVolledig === true
  /** Uitleg en melding bij een register dat niet meetelt: de fiscale afschrijving als controle naast de geboekte. */
  const registerAlsControle = (r: AfschrijvingResultaat, geboekt: number | undefined, uitgesplitst = false) => {
    if (r.perActief.length === 0) return
    uitleg.push(
      regel(`${prefix}.afschrijving.controle`, 'Fiscale afschrijving volgens het activaregister (controle, telt niet mee)', r.totaal, 'info', {
        niveau: 2,
        formule: geboekt !== undefined ? `fiscaal ${eur(r.totaal)}, geboekt ${eur(geboekt)}` : `fiscaal ${eur(r.totaal)}`,
        parameter: 'ondernemer.afschrijving',
      }),
    )
    // De regels per actief (info) blijven staan voor de uitleg per middel; het boekresultaat telt niet mee.
    uitleg.push(...r.uitleg.filter((x) => !x.id.endsWith('.afschrijving.boekwinst')))
    const verschil = geboekt !== undefined ? geboekt - r.totaal : undefined
    const vergelijking =
      verschil === undefined
        ? ''
        : verschil === 0
          ? ` Dat is gelijk aan de afschrijving uit je boekhouding (${euro(geboekt!)}).`
          : ` In je boekhouding staat ${euro(geboekt!)}, een verschil van ${euro(Math.abs(verschil))}. Dat verschil kan komen door bedrijfsmiddelen die niet in het register staan.`
    const verkocht = r.perActief.some((x) => x.verkochtDitJaar)
    const geenAfschrijving = uitgesplitst && geboekt === undefined && r.totaal > 0
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.afschrijving.registerControle`,
        geenAfschrijving ? 'let-op' : 'info',
        `Je activaregister telt niet mee voor de winst, omdat je niet hebt aangegeven dat al je bedrijfsmiddelen erin staan. ${geenAfschrijving ? 'Je hebt geen afschrijvingen ingevuld, dus er gaat nu geen afschrijving van de winst af.' : 'We rekenen met de afschrijving uit je boekhouding.'} Ter controle: de fiscale afschrijving op de middelen in het register is ${euro(r.totaal)}.${vergelijking}${verkocht ? ' Het boekresultaat van verkochte middelen in het register telt ook niet mee: dat moet dan in je eigen cijfers zitten.' : ''} Staan al je bedrijfsmiddelen in het register, geef dat dan aan; dan vervangt de fiscale afschrijving de geboekte.`,
      ),
    )
  }

  // 1. Saldo fiscale winstberekening
  let saldo: number
  let kilometeraftrek = 0
  let bijtellingAuto = 0
  let autoUitleg: Uitlegregel[] = []
  let autoUitkomst: AutoUitkomst | undefined
  let correctieAfschrijving: number | undefined
  const wb = o.winstberekening
  if (wb.soort === 'saldo') {
    if (register && !registerVolledig) {
      saldo = wb.saldo
      correctieAfschrijving = 0
      uitleg.push(regel(`${prefix}.saldo`, 'Saldo fiscale winstberekening', saldo, 'subtotaal', { niveau: 0, formule: 'uit de winstberekening' }))
      registerAlsControle(register, wb.afschrijvingenInSaldo)
    } else if (register && wb.afschrijvingenInSaldo !== undefined) {
      const geboekt = wb.afschrijvingenInSaldo
      correctieAfschrijving = geboekt - register.totaal
      saldo = wb.saldo + correctieAfschrijving
      uitleg.push(regel(`${prefix}.saldoInvoer`, 'Saldo uit de winstberekening', wb.saldo, 'plus', { niveau: 1, formule: 'met de afschrijvingen zoals geboekt' }))
      uitleg.push(
        regel(`${prefix}.correctieAfschrijving`, 'Correctie naar de fiscale afschrijvingen', correctieAfschrijving, correctieAfschrijving >= 0 ? 'plus' : 'min', {
          niveau: 1,
          formule: `geboekt ${eur(geboekt)} − fiscaal volgens het activaregister ${eur(register.totaal)}`,
          parameter: 'ondernemer.afschrijving',
        }),
      )
      uitleg.push(...register.uitleg.filter((r) => !r.id.endsWith('.afschrijving.boekwinst')))
      uitleg.push(
        regel(`${prefix}.saldo`, 'Saldo fiscale winstberekening', saldo, 'subtotaal', {
          niveau: 0,
          formule: `${eur(wb.saldo)} ${correctieAfschrijving >= 0 ? '+' : '−'} ${eur(Math.abs(correctieAfschrijving))}`,
        }),
      )
      for (const a of register.perActief.filter((x) => x.verkochtDitJaar)) {
        waarschuwingen.push(
          waarschuwing(
            `${prefix}.afschrijving.boekresultaatSaldo`,
            'let-op',
            `${a.omschrijving} is dit jaar verkocht. Het saldo bevat het boekresultaat zoals geboekt; fiscaal is het boekresultaat ${euro(a.boekwinst)} (verkoopprijs min fiscale boekwaarde). Wijkt het geboekte resultaat daarvan af, pas dan het saldo aan.`,
          ),
        )
      }
    } else {
      saldo = wb.saldo
      uitleg.push(regel(`${prefix}.saldo`, 'Saldo fiscale winstberekening', saldo, 'subtotaal', { niveau: 0, formule: 'uit de winstberekening' }))
      if (register) {
        waarschuwingen.push(
          waarschuwing(
            `${prefix}.afschrijving.saldo`,
            'let-op',
            `Je rekent met het saldo van de winstberekening, dus het activaregister telt niet mee: we gaan ervan uit dat de afschrijvingen in het saldo fiscaal kloppen. Vul de afschrijvingen in die in het saldo zitten, dan corrigeren we het verschil met de fiscale afschrijving volgens het register (${euro(register.totaal)}).`,
          ),
        )
      }
    }
    if ((o.zakelijkeKmPrive ?? 0) > 0 && o.kmAftrekAlInSaldo !== true) {
      waarschuwingen.push(
        waarschuwing(
          `${prefix}.km.saldo`,
          'info',
          `Bij een saldo uit de winstberekening gaan we ervan uit dat de zakelijke kilometers met je eigen auto (${eur(o.zakelijkeKmPrive ?? 0)} km) daarin al zijn afgetrokken.`,
        ),
      )
    }
    if (o.auto) {
      waarschuwingen.push(
        waarschuwing(`${prefix}.auto.saldo`, 'info', 'Bij een saldo uit de winstberekening gaan we ervan uit dat de autokosten en de bijtelling daarin al zijn verwerkt.'),
      )
      // Ronde 2 (A6): de bijtelling staat al in het saldo (ter informatie); een btw-correctie die niet in de autokosten
      // zit, gaat hieronder wel van de winst af.
      const auto = berekenBijtellingAuto(o.auto, { params: p, jaar: ctx.jaar, prefix, onderneming: o })
      autoUitkomst = { ...auto.uitkomst, bijtellingInSaldo: true }
      waarschuwingen.push(...auto.waarschuwingen.filter((w) => w.id.includes('.auto.btw')))
    }
  } else {
    const whw = wb.wijzigingOnderhandenWerk ?? 0
    const fin = wb.financieleBatenLasten ?? 0
    let afschrijvingen = wb.afschrijvingen ?? 0
    let boekwinst = 0
    const afschrUitleg: Uitlegregel[] = []
    if (register && !registerVolledig) {
      correctieAfschrijving = 0
    } else if (register) {
      afschrijvingen = register.totaal
      boekwinst = register.boekwinst
      afschrUitleg.push(...register.uitleg)
      if (wb.afschrijvingen !== undefined) {
        waarschuwingen.push(
          waarschuwing(`${prefix}.afschrijving.dubbel`, 'info', 'Al je bedrijfsmiddelen staan in het activaregister, dus de afschrijvingen die je los hebt ingevuld gebruiken we niet.'),
        )
        correctieAfschrijving = wb.afschrijvingen - register.totaal
        if (wb.afschrijvingen !== register.totaal) {
          afschrUitleg.push(
            regel(`${prefix}.afschrijving.verschil`, 'Verschil met de ingevulde afschrijvingen', wb.afschrijvingen - register.totaal, 'info', {
              niveau: 2,
              formule: `ingevuld ${eur(wb.afschrijvingen)}, fiscaal volgens het activaregister ${eur(register.totaal)}`,
              parameter: 'ondernemer.afschrijving',
            }),
          )
        }
      }
    }
    const beperkt = Math.max(0, o.beperktAftrekbaar ?? 0)
    const autokosten = o.auto ? Math.max(0, o.auto.autokosten) : 0
    if (o.kmAftrekAlInSaldo !== true && (o.zakelijkeKmPrive ?? 0) > 0) {
      kilometeraftrek = afrondKm((o.zakelijkeKmPrive ?? 0) * op.kilometerTariefPrivevervoer)
    }
    saldo = wb.omzet + whw + fin - wb.kosten - afschrijvingen + boekwinst - beperkt - autokosten - kilometeraftrek

    uitleg.push(regel(`${prefix}.omzet`, 'Netto-omzet', wb.omzet, 'plus', { niveau: 1 }))
    if (whw !== 0) uitleg.push(regel(`${prefix}.ohw`, 'Wijziging onderhanden werk', whw, whw >= 0 ? 'plus' : 'min', { niveau: 1 }))
    if (afschrijvingen !== 0) uitleg.push(regel(`${prefix}.afschrijvingen`, 'Afschrijvingen', afschrijvingen, 'min', { niveau: 1, parameter: 'ondernemer.afschrijving' }))
    uitleg.push(...afschrUitleg)
    if (register && !registerVolledig) registerAlsControle(register, wb.afschrijvingen, true)
    uitleg.push(regel(`${prefix}.kosten`, 'Kosten', wb.kosten, 'min', { niveau: 1 }))
    if (beperkt > 0) uitleg.push(regel(`${prefix}.beperktAftrekbaar`, 'Beperkt aftrekbare kosten (voedsel, drank, representatie)', beperkt, 'min', { niveau: 1 }))
    if (autokosten > 0) uitleg.push(regel(`${prefix}.autokosten`, 'Autokosten', autokosten, 'min', { niveau: 1 }))
    if (kilometeraftrek > 0) {
      uitleg.push(
        regel(`${prefix}.kilometeraftrek`, 'Zakelijke kilometers met je eigen auto', kilometeraftrek, 'min', {
          niveau: 1,
          formule: `${eur(o.zakelijkeKmPrive ?? 0)} km × € ${op.kilometerTariefPrivevervoer.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`,
          parameter: 'ondernemer.kilometerTariefPrivevervoer',
          status,
        }),
      )
    }
    if (fin !== 0) uitleg.push(regel(`${prefix}.financieel`, 'Financiële baten en lasten', fin, fin >= 0 ? 'plus' : 'min', { niveau: 1 }))
    uitleg.push(regel(`${prefix}.saldo`, 'Saldo fiscale winstberekening', saldo, 'subtotaal', { niveau: 0 }))

    if (o.auto) {
      const auto = berekenBijtellingAuto(o.auto, { params: p, jaar: ctx.jaar, prefix, onderneming: o })
      autoUitkomst = auto.uitkomst
      bijtellingAuto = auto.bijtelling
      waarschuwingen.push(...auto.waarschuwingen)
      // De uitlegregel van de bijtelling komt bij de winstcorrecties hieronder.
      autoUitleg = auto.uitleg
    }
  }

  // 2. Winstcorrecties
  const correcties: Uitlegregel[] = []
  let correctieBeperkt = 0
  if ((o.beperktAftrekbaar ?? 0) > 0) {
    const c = correctieBeperktAftrekbaar(o.beperktAftrekbaar ?? 0, p)
    correctieBeperkt = c.correctie
    correcties.push(
      regel(`${prefix}.correctieBeperktAftrekbaar`, 'Niet of gedeeltelijk aftrekbare kosten', correctieBeperkt, 'plus', {
        formule: c.formule,
        parameter: c.methode === 'pct' ? 'ondernemer.beperktAftrekbaar.aftrekbaarDeel' : 'ondernemer.beperktAftrekbaar.drempel',
        status,
      }),
    )
  }
  correcties.push(...autoUitleg)
  // Ronde 2 (A6): btw-correctie privégebruik die niet in de autokosten zit, gaat van de winst af.
  const btwAfgetrokken = autoUitkomst?.btwCorrectieAfgetrokken ?? 0
  if (btwAfgetrokken > 0) {
    correcties.push(regel(`${prefix}.auto.btwAfgetrokken`, 'Btw-correctie privégebruik auto (niet in de autokosten)', btwAfgetrokken, 'min', { parameter: 'ondernemer.auto.btwPrive' }))
  }

  const inv = berekenInvesteringsaftrek(o.investeringen ?? [], { params: p, prefix, afboekingHir: reserves.afboekingPerInvestering })
  correcties.push(...inv.uitleg)
  waarschuwingen.push(...inv.waarschuwingen)

  const desUitActiva = desinvesteringenUitActiva(activa ?? [], o.desinvesteringen ?? [], { jaar: ctx.jaar, prefix })
  waarschuwingen.push(...desUitActiva.waarschuwingen)
  // Drempel van art. 3.47 lid 1: alle vervreemde goederen tellen, ook registermiddelen zonder aftrek en overigeVerkopen.
  const des = berekenDesinvesteringsbijtelling([...(o.desinvesteringen ?? []), ...desUitActiva.desinvesteringen], {
    params: p,
    jaar: ctx.jaar,
    prefix,
    overigeVerkopen: desUitActiva.overigeVerkoopprijzen + Math.max(0, o.overigeVerkopen ?? 0),
  })
  correcties.push(...des.uitleg)
  waarschuwingen.push(...des.waarschuwingen)

  // Ronde 2: correctie voor de partner (beloning, terbeschikkingstelling), vóór de FOR.
  const correctiePartner = ctx.correctiePartner ?? 0
  if (correctiePartner !== 0) {
    correcties.push(regel(`${prefix}.correctiePartner`, 'Correctie beloning of terbeschikkingstelling partner', correctiePartner, correctiePartner < 0 ? 'min' : 'plus', { niveau: 1 }))
  }

  // Ronde 2 (A6): reserves buiten het saldo en stakingsposten die niet in het saldo zaten.
  correcties.push(...reserves.correcties)
  const soortStaking = stakingSoort(o.staking)
  const bijgeteld = stakingBijgeteld(o.staking, o)
  if (bijgeteld !== 0) {
    correcties.push(regel(`${prefix}.staking.bijgeteld`, 'Stakingswinst die niet in het saldo zat (bijvoorbeeld naar privé)', bijgeteld, bijgeteld >= 0 ? 'plus' : 'min', { formule: (o.staking?.posten ?? []).length > 0 ? 'waarde in het economisch verkeer min de fiscale boekwaarde' : 'de stakingswinst als één bedrag, die niet in het saldo zat' }))
  }

  const winstVoorFor =
    saldo + correctieBeperkt + bijtellingAuto - btwAfgetrokken - inv.kia - inv.eia - inv.mia + des.bijtelling + correctiePartner + reserves.correctieReserves + bijgeteld

  // 3. Oudedagsreserve
  let verplichteForAfname = 0
  let vrijwilligeForAfname = 0
  let forDotatie = 0
  let forStandEind: number | undefined
  if (o.for) {
    // Ronde 2 (A6): fiscale reserves hebben geen eigen balanspost; voor de FOR tellen ze niet mee in het vermogen.
    const ovBalans = ondernemingsvermogenUitBalans(o.jaarrekening?.eind)
    const f = berekenFor(o.for as ForInvoer, {
      params: p,
      staking: o.staking !== undefined,
      gedeeltelijkeStaking: soortStaking === 'gedeeltelijk',
      aowBereikt: ctx.aowBereikt,
      urencriteriumGehaald,
      urencriteriumVorigJaar: ctx.urencriteriumVorigJaar ?? o.uren.urencriteriumVorigJaar,
      ondernemingsvermogenBalans: ovBalans !== undefined ? ovBalans - reserves.standEind : undefined,
      winstVoorFor,
      ...(ctx.vrijwilligeAfnameMax !== undefined ? { vrijwilligeAfnameMax: ctx.vrijwilligeAfnameMax } : {}),
      prefix,
    })
    verplichteForAfname = f.verplichteAfname
    vrijwilligeForAfname = f.vrijwilligeAfname
    forDotatie = f.dotatie
    forStandEind = f.standEind
    correcties.push(...f.uitleg)
    waarschuwingen.push(...f.waarschuwingen)
  }

  const winst = winstVoorFor + verplichteForAfname + vrijwilligeForAfname - forDotatie
  const totaalCorrecties = winst - saldo
  uitleg.push(...correcties)
  if (correcties.some((r) => r.soort !== 'info')) {
    uitleg.push(regel(`${prefix}.correcties`, 'Totaal winstcorrecties', totaalCorrecties, 'subtotaal', { niveau: 1 }))
  }
  uitleg.push(regel(`${prefix}.winst`, 'Winst uit onderneming', winst, 'totaal', { niveau: 0, formule: `${eur(saldo)} ${totaalCorrecties >= 0 ? '+' : '−'} ${eur(Math.abs(totaalCorrecties))}` }))

  // 4. Prognose: jaarequivalent
  let winstJaarequivalent = winst
  if (o.maandenGewerkt !== undefined && o.maandenGewerkt > 0 && o.maandenGewerkt < 12) {
    winstJaarequivalent = (winst * 12) / o.maandenGewerkt
    uitleg.push(
      regel(`${prefix}.jaarequivalent`, 'Winst omgerekend naar een heel jaar', winstJaarequivalent, 'info', {
        formule: `${eur(winst)} × 12 / ${o.maandenGewerkt}`,
      }),
    )
  }

  // 5. Urencriterium (info, zoals de ondernemersaftrek in het rapport erop leunt)
  uitleg.push(...uren.uitleg)
  waarschuwingen.push(...uren.waarschuwingen)
  if (ctx.urencriteriumPersoon !== undefined && ctx.urencriteriumPersoon !== uren.gehaald) {
    uitleg.push(
      regel(`${prefix}.urencriterium.persoon`, ctx.urencriteriumPersoon ? 'Urencriterium gehaald over al je ondernemingen samen' : 'Urencriterium niet gehaald over al je ondernemingen samen', 0, 'info'),
    )
  }

  // 6. Werkruimte thuis (alleen een toets, de kosten zitten in het saldo of de kosten)
  if (o.werkruimte && o.werkruimte.kosten > 0) {
    const w = op.werkruimte
    const zelfstandigOk = !w.zelfstandigheidsEis || o.werkruimte.zelfstandig
    const inkomenOk = o.werkruimte.werkplekElders
      ? o.werkruimte.deelInkomenInOfVanuit >= w.inkomensEisMetWerkplekElders[0] && o.werkruimte.deelInkomenIn >= w.inkomensEisMetWerkplekElders[1]
      : o.werkruimte.deelInkomenIn >= w.inkomensEisZonderWerkplekElders
    if (!zelfstandigOk || !inkomenOk) {
      waarschuwingen.push(
        waarschuwing(
          `${prefix}.werkruimte`,
          'actie',
          `De kosten van je werkruimte thuis (${euro(o.werkruimte.kosten)}) zijn niet aftrekbaar: ${
            !zelfstandigOk ? 'de ruimte is niet zelfstandig (eigen ingang en eigen sanitair)' : 'je verdient er niet genoeg van je inkomen in of vanuit'
          }. Haal ze uit de kosten.`,
        ),
      )
    }
  }

  // 7. Staking (ronde 2, A6): specificatie, vrijval en stakingsaftrek.
  let staking: StakingUitkomst | undefined
  if (o.staking) {
    const st = berekenStaking(o.staking, {
      params: p,
      jaar: ctx.jaar,
      prefix,
      onderneming: o,
      forVrijval: verplichteForAfname,
      reservesVrijval: reserves.stakingVrijval,
      desinvesteringsbijtelling: des.bijtelling,
      ...(ctx.genotenStakingsaftrek !== undefined ? { genotenStakingsaftrek: ctx.genotenStakingsaftrek } : {}),
    })
    staking = st.uitkomst
    uitleg.push(...st.uitleg)
    waarschuwingen.push(...st.waarschuwingen)
  }
  // Ronde 2 (A6): stand per reserve (info).
  uitleg.push(...reserves.uitleg)

  return {
    naam: o.naam,
    saldo,
    correctieBeperktAftrekbaar: correctieBeperkt,
    kia: inv.kia,
    eia: inv.eia,
    mia: inv.mia,
    desinvesteringsbijtelling: des.bijtelling,
    bijtellingAuto,
    kilometeraftrek,
    verplichteForAfname,
    winst,
    urencriteriumGehaald,
    isStarter,
    winstJaarequivalent,
    ...(afschrijvingenPerActief ? { afschrijvingen: afschrijvingenPerActief, activaregisterTeltMee: activaregisterTeltMee(o) } : {}),
    ...(correctieAfschrijving !== undefined ? { correctieAfschrijving } : {}),
    ...(o.for
      ? { forStandBegin: Math.max(0, o.for.stand), forVrijwilligeAfname: vrijwilligeForAfname, forDotatie, forStandEind: forStandEind ?? Math.max(0, o.for.stand) }
      : {}),
    investeringsaftrekPerMiddel: inv.perMiddel,
    ...(ctx.correctiePartner !== undefined ? { correctiePartner } : {}),
    ...(reserves.herinvesteringsreserves.length > 0 ? { herinvesteringsreserves: reserves.herinvesteringsreserves } : {}),
    ...(reserves.egalisatiereserves.length > 0 ? { egalisatiereserves: reserves.egalisatiereserves } : {}),
    ...(reserves.herinvesteringsreserves.length > 0 || reserves.egalisatiereserves.length > 0 ? { correctieReserves: reserves.correctieReserves } : {}),
    ...(staking ? { staking } : {}),
    ...(autoUitkomst ? { auto: autoUitkomst } : {}),
    uitleg,
    waarschuwingen,
  }
}

export { toetsUrencriterium } from './urencriterium'
export { berekenInvesteringsaftrek, berekenDesinvesteringsbijtelling, kiaUitTabel } from './investeringsaftrek'
export { berekenAfschrijvingen } from './afschrijving'
export { berekenBijtellingAuto } from './auto'
export { berekenFor } from './for'
