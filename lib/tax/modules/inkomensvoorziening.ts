/**
 * Uitgaven voor inkomensvoorzieningen (persoonlijk, niet verdeelbaar tussen partners).
 *
 * Jaarruimte jaar t (art. 3.127 Wet IB 2001), met de regels van jaar t en het inkomen van t − 1:
 *   premiegrondslag      = max(0, min(inkomen t−1 + toename FOR t−1, inkomensgrens) − franchise)
 *   verrekenbaar         = AFRONDING.jaarruimte(pct × premiegrondslag)
 *   jaarruimte           = max(0, min(maxJaarruimte, verrekenbaar − pensioencorrectie − toename FOR t−1))
 *   pensioencorrectie    = factorA.factor × A (oud regime) of de werkelijke Wtp-premie
 *
 * Reserveringsruimte: niet-benutte jaarruimte van t − terugkijkJaren tot en met t − 1, per jaar berekend met de
 * regels van dát jaar (`historieParams`) of overgenomen uit het rapport (`jaarruimteOverride`), begrensd op
 * maxReserveringsruimte en (vóór de Wtp) op reserveringsruimtePctGrondslag × premiegrondslag.
 *
 * Toerekening van de premies: eerst de reserveringsruimte, oudste jaar eerst (advies Belastingdienst: zo vervalt
 * er geen oude ruimte), daarna de jaarruimte van jaar t. Het meerdere is niet aftrekbaar.
 * AOV-premies zijn volledig aftrekbaar; de premie voor omzetting van de FOR komt bovenop de ruimte, maar alleen tot
 * de vrijwillige afname van de FOR (art. 3.128 tekst 2022, via art. 10a.29): omzetting = min(premie, vrijwillige afname).
 * Omgekeerd begrenst de engine de vrijwillige afname op de lijfrentepremies die hier worden afgetrokken (art. 3.70
 * lid 1 onder a).
 * Lijfrenteaftrek alleen zolang op 1 januari de leeftijd AOW + maxJarenNaAOW nog niet is bereikt.
 */
import type { InkomensvoorzieningInvoer, InkomensvoorzieningResultaat, JaarruimteJaar, LijfrenteParams, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { AFRONDING } from '../rounding'
import { aowDatum } from '../datum'
import { eur, euro, pct, regel, waarschuwing } from '../uitleg'

export interface JaarruimteBerekening {
  inkomen: number
  forToename: number
  afgetopt: boolean
  premiegrondslag: number
  verrekenbaar: number
  pensioencorrectie: number
  jaarruimte: number
}

/** Jaarruimte van één jaar met de lijfrenteparameters van dat jaar. */
export function berekenJaarruimte(
  lp: LijfrenteParams,
  invoer: { inkomen: number; forToename?: number; pensioencorrectie?: { type: 'factorA' | 'wtpPremie'; bedrag: number } },
): JaarruimteBerekening {
  const forToename = Math.max(0, invoer.forToename ?? 0)
  const bruto = invoer.inkomen + forToename
  const afgetopt = bruto > lp.inkomensgrens
  const premiegrondslag = Math.max(0, Math.min(bruto, lp.inkomensgrens) - lp.franchise)
  const verrekenbaar = AFRONDING.jaarruimte(lp.pct * premiegrondslag)
  let pensioencorrectie = 0
  if (invoer.pensioencorrectie) {
    pensioencorrectie = invoer.pensioencorrectie.type === 'factorA' ? lp.factorA.factor * invoer.pensioencorrectie.bedrag : invoer.pensioencorrectie.bedrag
  }
  const jaarruimte = Math.max(0, AFRONDING.jaarruimte(Math.min(lp.maxJaarruimte, verrekenbaar - pensioencorrectie - forToename)))
  return { inkomen: invoer.inkomen, forToename, afgetopt, premiegrondslag, verrekenbaar, pensioencorrectie, jaarruimte }
}

function jaarruimteDetail(lp: LijfrenteParams, b: JaarruimteBerekening): NonNullable<JaarruimteJaar['berekening']> {
  return {
    inkomensgrens: lp.inkomensgrens,
    afgetopt: b.afgetopt,
    franchise: lp.franchise,
    premiegrondslag: b.premiegrondslag,
    pct: lp.pct,
    verrekenbaar: b.verrekenbaar,
    pensioencorrectie: b.pensioencorrectie,
    maxJaarruimte: lp.maxJaarruimte,
    jaarruimte: b.jaarruimte,
  }
}

interface Rij {
  jaar: number
  jaarruimte: number
  nietBenutBegin: number
  ditJaarBenut: number
  resterend: number
  vervaltNa: number
}

export function berekenInkomensvoorziening(
  iv: InkomensvoorzieningInvoer,
  ctx: {
    params: TaxYearParams
    jaar: number
    geboortedatum: string
    /** Persoonlijke AOW-datum (de AOW-leeftijd van het jaar waarin die wordt bereikt). */
    aowDatum?: string
    premiegrondslagInkomenVorigJaar?: number
    historieParams?: (jaar: number) => LijfrenteParams | undefined
    /**
     * Gewenste vrijwillige afname van de FOR over alle ondernemingen van de persoon (ten hoogste de stand). De premie
     * voor omzetting is daarop begrensd. Ontbreekt = niet begrensd (alleen bij een losse aanroep; de engine geeft het mee).
     */
    forVrijwilligeAfname?: number
  },
): InkomensvoorzieningResultaat {
  const ivp = ctx.params.inkomensvoorziening
  const lp = ivp.waarde.lijfrente
  const status = ivp.status
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const t = ctx.jaar

  // Leeftijdstoets: aftrek zolang op 1 januari AOW-leeftijd + maxJarenNaAOW niet is bereikt.
  // Met een persoonlijke AOW-datum (engine) geldt die datum + maxJarenNaAOW; anders de AOW-leeftijd van dit jaar.
  const aow = ctx.params.overig.waarde.aowLeeftijd
  const grensDatum = ctx.aowDatum
    ? aowDatum(ctx.aowDatum, { jaren: lp.maxJarenNaAOW, maanden: 0 })
    : aowDatum(ctx.geboortedatum, { jaren: aow.jaren + lp.maxJarenNaAOW, maanden: aow.maanden })
  const lijfrenteMag = grensDatum > `${t}-01-01`

  // 1. Jaarruimte van dit jaar
  const inkomen = iv.premiegrondslagInkomenVorigJaar ?? ctx.premiegrondslagInkomenVorigJaar
  if (inkomen === undefined && iv.lijfrentePremies > 0) {
    waarschuwingen.push(
      waarschuwing('lijfrente.geenInkomen', 'let-op', `Vul je inkomen over ${t - 1} in (winst vóór ondernemersaftrek, loon en overige inkomsten). Zonder dat inkomen is je jaarruimte nul.`),
    )
  }
  const jr = berekenJaarruimte(lp, { inkomen: inkomen ?? 0, forToename: iv.forToenameVorigJaar, pensioencorrectie: iv.pensioencorrectieVorigJaar })
  if (lp.pct > 0) {
    uitleg.push(regel('lijfrente.inkomen', `Inkomsten in ${t - 1}`, jr.inkomen, 'info', { niveau: 2 }))
    if (jr.forToename > 0) uitleg.push(regel('lijfrente.forToename', 'Toename van de oudedagsreserve', jr.forToename, 'plus', { niveau: 2 }))
    if (jr.afgetopt) {
      uitleg.push(
        regel('lijfrente.aftopping', 'Maximaal in aanmerking te nemen inkomen', lp.inkomensgrens, 'info', {
          niveau: 2,
          parameter: 'inkomensvoorziening.lijfrente.inkomensgrens',
          status,
        }),
      )
    }
    uitleg.push(regel('lijfrente.franchise', 'AOW-franchise', lp.franchise, 'min', { niveau: 2, parameter: 'inkomensvoorziening.lijfrente.franchise', status }))
    uitleg.push(regel('lijfrente.premiegrondslag', 'Premiegrondslag', jr.premiegrondslag, 'subtotaal', { niveau: 2 }))
    uitleg.push(
      regel('lijfrente.verrekenbaar', 'Verrekenbare premiegrondslag', jr.verrekenbaar, 'info', {
        niveau: 2,
        formule: `${pct(lp.pct, 1)} × ${eur(jr.premiegrondslag)}`,
        parameter: 'inkomensvoorziening.lijfrente.pct',
        status,
      }),
    )
    if (jr.pensioencorrectie > 0) {
      uitleg.push(
        regel('lijfrente.pensioencorrectie', 'Pensioenopbouw in het voorgaande jaar', jr.pensioencorrectie, 'min', {
          niveau: 2,
          formule:
            iv.pensioencorrectieVorigJaar?.type === 'factorA'
              ? `${lp.factorA.factor.toLocaleString('nl-NL')} × factor A ${eur(iv.pensioencorrectieVorigJaar.bedrag)}`
              : 'betaalde pensioenpremie (Wtp)',
          parameter: 'inkomensvoorziening.lijfrente.factorA',
        }),
      )
      if (iv.pensioencorrectieVorigJaar?.type === 'factorA' && !lp.factorA.toegestaan) {
        waarschuwingen.push(
          waarschuwing('lijfrente.factorA', 'let-op', 'Factor A geldt niet meer voor dit jaar; gebruik de werkelijk betaalde pensioenpremie uit je UPO.'),
        )
      }
    }
    if (jr.forToename > 0) {
      uitleg.push(
        regel('lijfrente.forCorrectie', 'Toename van de oudedagsreserve in het voorgaande jaar', jr.forToename, 'min', { niveau: 2 }),
      )
    }
    uitleg.push(
      regel('lijfrente.jaarruimte', `Jaarruimte ${t}`, jr.jaarruimte, 'subtotaal', {
        niveau: 1,
        formule:
          jr.verrekenbaar - jr.pensioencorrectie - jr.forToename > lp.maxJaarruimte
            ? `maximaal ${eur(lp.maxJaarruimte)}`
            : `${eur(jr.verrekenbaar)}${jr.pensioencorrectie > 0 ? ` − ${eur(jr.pensioencorrectie)}` : ''}${jr.forToename > 0 ? ` − ${eur(jr.forToename)}` : ''}`,
        parameter: 'inkomensvoorziening.lijfrente.maxJaarruimte',
        status,
      }),
    )
  }

  // 2. Historie: niet-benutte jaarruimte per jaar
  const vanaf = t - lp.terugkijkJaren
  const historieRijen: Array<{ jaar: number; jaarruimte: number; nietBenut: number; berekening: JaarruimteJaar }> = []
  for (const h of [...(iv.historie ?? [])].sort((a, b) => a.jaar - b.jaar)) {
    if (h.jaar >= t) continue
    let jaarruimteJ: number
    if (h.jaarruimteOverride !== undefined) {
      jaarruimteJ = h.jaarruimteOverride
    } else {
      let hp = ctx.historieParams?.(h.jaar)
      if (!hp) {
        hp = lp
        waarschuwingen.push(
          waarschuwing(
            'lijfrente.historieParams',
            'let-op',
            `Voor ${h.jaar} hebben we geen lijfrenteregels; we rekenen de jaarruimte met de regels van ${t}. Neem bij twijfel het bedrag uit de aangifte van ${h.jaar} over.`,
          ),
        )
      }
      jaarruimteJ = berekenJaarruimte(hp, { inkomen: h.premiegrondslagInkomen, forToename: h.forToenameVorigJaar, pensioencorrectie: h.pensioencorrectie }).jaarruimte
    }
    const nietBenut = Math.max(0, jaarruimteJ - Math.max(0, h.alGebruikt))
    // Voor het rapport: de berekening met de regels van dat jaar, ook als er een opgegeven jaarruimte is.
    const hpJaar = ctx.historieParams?.(h.jaar)
    const berJaar = hpJaar
      ? berekenJaarruimte(hpJaar, { inkomen: h.premiegrondslagInkomen, forToename: h.forToenameVorigJaar, pensioencorrectie: h.pensioencorrectie })
      : undefined
    const berekening: JaarruimteJaar = {
      jaar: h.jaar,
      inkomen: h.premiegrondslagInkomen,
      forToename: Math.max(0, h.forToenameVorigJaar ?? 0),
      ...(hpJaar && berJaar ? { berekening: jaarruimteDetail(hpJaar, berJaar) } : {}),
      ...(h.jaarruimteOverride !== undefined ? { jaarruimteOpgegeven: h.jaarruimteOverride } : {}),
      jaarruimte: jaarruimteJ,
      alGebruikt: Math.max(0, h.alGebruikt),
    }
    if (h.jaar < vanaf) {
      if (nietBenut > 0) {
        waarschuwingen.push(
          waarschuwing('lijfrente.vervallen', 'info', `Niet-gebruikte jaarruimte uit ${h.jaar} (${euro(nietBenut)}) is vervallen; je kunt ${lp.terugkijkJaren} jaar terugkijken.`),
        )
      }
      continue
    }
    historieRijen.push({ jaar: h.jaar, jaarruimte: jaarruimteJ, nietBenut, berekening })
  }
  const somNietBenut = historieRijen.reduce((s, r) => s + r.nietBenut, 0)
  const grenzen = [lp.maxReserveringsruimte, somNietBenut]
  const pctGrens = lp.reserveringsruimtePctGrondslag !== null ? AFRONDING.jaarruimte(lp.reserveringsruimtePctGrondslag * jr.premiegrondslag) : null
  if (pctGrens !== null) grenzen.push(pctGrens)
  const reserveringsruimte = Math.max(0, Math.min(...grenzen))

  // 3. Toerekening van de premies
  const premies = Math.max(0, iv.lijfrentePremies)
  let rest = lijfrenteMag ? premies : 0
  let budgetReservering = reserveringsruimte
  const benutPerJaar = new Map<number, number>()
  for (const r of historieRijen) {
    const neem = Math.min(rest, r.nietBenut, budgetReservering)
    if (neem <= 0) continue
    benutPerJaar.set(r.jaar, neem)
    rest -= neem
    budgetReservering -= neem
  }
  const benutReservering = reserveringsruimte - budgetReservering
  const benutJaarruimte = Math.min(rest, jr.jaarruimte)
  rest -= benutJaarruimte

  let forOmzetting = Math.max(0, iv.forOmzetting ?? 0)
  let extraNietAftrekbaar = 0
  if (forOmzetting > 0 && !ctx.params.ondernemer.waarde.for.omzettingLijfrenteExtraRuimte) {
    waarschuwingen.push(waarschuwing('lijfrente.forOmzettingGeenExtra', 'let-op', 'Omzetting van de oudedagsreserve geeft in dit jaar geen extra aftrekruimte; de premie is niet als extra aftrek meegenomen.'))
    extraNietAftrekbaar += forOmzetting
    forOmzetting = 0
  }
  if (!lijfrenteMag) {
    extraNietAftrekbaar += forOmzetting
    forOmzetting = 0
  }
  if (forOmzetting > 0 && ctx.forVrijwilligeAfname !== undefined) {
    const afname = Math.max(0, ctx.forVrijwilligeAfname)
    if (forOmzetting > afname) {
      waarschuwingen.push(
        waarschuwing(
          'lijfrente.forOmzettingBovenAfname',
          'let-op',
          afname > 0
            ? `De premie voor omzetting van de oudedagsreserve (${euro(forOmzetting)}) is hoger dan de vrijwillige afname van de oudedagsreserve (${euro(afname)}). Bovenop je jaar- en reserveringsruimte is alleen ${euro(afname)} aftrekbaar. Past de rest in je jaar- of reserveringsruimte, tel die dan bij je gewone lijfrentepremies op.`
            : `Je hebt een premie voor omzetting van de oudedagsreserve ingevuld (${euro(forOmzetting)}), maar geen vrijwillige afname van de oudedagsreserve. Die premie is alleen aftrekbaar tot het bedrag dat je vrijwillig laat afnemen. Vul die afname in bij je onderneming.`,
        ),
      )
      extraNietAftrekbaar += forOmzetting - afname
      forOmzetting = afname
    }
  }

  const lijfrenteAftrek = lijfrenteMag ? premies - rest : 0
  const nietAftrekbaar = (lijfrenteMag ? rest : premies) + extraNietAftrekbaar
  const aovAftrek = Math.max(0, iv.aovPremies)
  const totaal = lijfrenteAftrek + aovAftrek + forOmzetting

  // Tabel in de volgorde van het rapport: het jaar zelf eerst, dan terug in de tijd.
  const tabel: Rij[] = [
    {
      jaar: t,
      jaarruimte: jr.jaarruimte,
      nietBenutBegin: jr.jaarruimte,
      ditJaarBenut: benutJaarruimte,
      resterend: jr.jaarruimte - benutJaarruimte,
      vervaltNa: t + lp.terugkijkJaren,
    },
    ...[...historieRijen].reverse().map((r) => {
      const benut = benutPerJaar.get(r.jaar) ?? 0
      return { jaar: r.jaar, jaarruimte: r.jaarruimte, nietBenutBegin: r.nietBenut, ditJaarBenut: benut, resterend: r.nietBenut - benut, vervaltNa: r.jaar + lp.terugkijkJaren }
    }),
  ]

  // Uitleg: reserveringsruimte en toerekening
  if (historieRijen.length > 0) {
    uitleg.push(
      regel('lijfrente.reserveringsruimte', 'Reserveringsruimte', reserveringsruimte, 'subtotaal', {
        niveau: 1,
        formule:
          reserveringsruimte < somNietBenut
            ? `niet-gebruikte jaarruimte ${eur(somNietBenut)}, maximaal ${eur(Math.min(lp.maxReserveringsruimte, pctGrens ?? Infinity))}${pctGrens !== null ? ` (${eur(lp.maxReserveringsruimte)} en ${pct(lp.reserveringsruimtePctGrondslag ?? 0, 0)} van de premiegrondslag)` : ''}`
            : `niet-gebruikte jaarruimte ${historieRijen[0].jaar} tot en met ${t - 1}`,
        parameter: 'inkomensvoorziening.lijfrente.maxReserveringsruimte',
        status,
      }),
    )
  }
  if (premies > 0) {
    uitleg.push(regel('lijfrente.premies', 'Betaalde lijfrentepremies', premies, 'info', { niveau: 1 }))
    for (const r of historieRijen) {
      const benut = benutPerJaar.get(r.jaar)
      if (!benut) continue
      uitleg.push(
        regel('lijfrente.benut.reservering', `Geboekt op niet-gebruikte jaarruimte ${r.jaar}`, benut, 'info', {
          niveau: 2,
          formule: `${eur(benut)} van ${eur(r.nietBenut)}, vervalt na ${r.jaar + lp.terugkijkJaren}`,
        }),
      )
    }
    if (benutJaarruimte > 0) {
      uitleg.push(regel('lijfrente.benut.jaarruimte', `Geboekt op jaarruimte ${t}`, benutJaarruimte, 'info', { niveau: 2, formule: `${eur(benutJaarruimte)} van ${eur(jr.jaarruimte)}` }))
    }
  }
  uitleg.push(
    regel('lijfrente.aftrek', 'Uitgaven voor lijfrenten', lijfrenteAftrek, 'min', {
      niveau: 1,
      formule: premies > 0 ? `reserveringsruimte ${eur(benutReservering)} + jaarruimte ${eur(benutJaarruimte)}` : undefined,
    }),
  )
  if (aovAftrek > 0) {
    uitleg.push(regel('lijfrente.aov', 'Premies voor arbeidsongeschiktheidsverzekeringen', aovAftrek, 'min', { niveau: 1, formule: 'volledig aftrekbaar' }))
  }
  if (forOmzetting > 0) {
    uitleg.push(
      regel('lijfrente.forOmzetting', 'Lijfrentepremie voor omzetting van de oudedagsreserve', forOmzetting, 'min', {
        niveau: 1,
        formule: ctx.forVrijwilligeAfname !== undefined ? `bovenop de jaar- en reserveringsruimte, maximaal de vrijwillige afname van de oudedagsreserve ${eur(Math.max(0, ctx.forVrijwilligeAfname))}` : 'bovenop de jaar- en reserveringsruimte',
        parameter: 'ondernemer.for.omzettingLijfrenteExtraRuimte',
      }),
    )
  }
  uitleg.push(regel('inkomensvoorziening.totaal', 'Uitgaven voor inkomensvoorziening', totaal, 'totaal', { niveau: 0 }))

  // Waarschuwingen
  if (!lijfrenteMag && (premies > 0 || (iv.forOmzetting ?? 0) > 0)) {
    waarschuwingen.push(
      waarschuwing(
        'lijfrente.leeftijd',
        'actie',
        `Lijfrentepremie is niet meer aftrekbaar: je had op 1 januari ${t} de AOW-leeftijd plus ${lp.maxJarenNaAOW} jaar bereikt.`,
      ),
    )
  }
  if (lijfrenteMag && rest > 0) {
    waarschuwingen.push(
      waarschuwing(
        'lijfrente.teVeel',
        'actie',
        `${euro(rest)} van je lijfrentepremie past niet in je jaar- en reserveringsruimte en is niet aftrekbaar. Dat schuift niet door naar volgend jaar. Vraag bij je verzekeraar of bank een verklaring niet-afgetrokken premies aan; met de saldomethode blijft dan maximaal ${euro(lp.saldomethodeMax)} per jaar van de uitkering onbelast.`,
      ),
    )
  }
  for (const r of tabel) {
    if (r.vervaltNa === t && r.resterend > 0) {
      waarschuwingen.push(
        waarschuwing('lijfrente.vervaltDitJaar', 'let-op', `Niet-gebruikte jaarruimte uit ${r.jaar} (${euro(r.resterend)}) vervalt na dit jaar. Wie nog dit jaar inlegt, kan die ruimte gebruiken.`),
      )
    }
  }
  const openstaand = tabel.reduce((s, r) => s + (r.vervaltNa > t ? r.resterend : 0), 0)
  if (lijfrenteMag && openstaand > 0) {
    waarschuwingen.push(
      waarschuwing(
        'lijfrente.openstaand',
        'info',
        `Na dit jaar staat er nog ${euro(openstaand)} aan niet-gebruikte jaarruimte open. Hoeveel je daarvan in één jaar kunt gebruiken, hangt af van het maximum van de reserveringsruimte in dat jaar.`,
      ),
    )
  }
  if ((iv.nettolijfrenteInleg ?? 0) > 0) {
    waarschuwingen.push(
      waarschuwing(
        'lijfrente.netto',
        'info',
        ivp.waarde.nettolijfrente.actief
          ? 'Inleg in een nettolijfrente is niet aftrekbaar; het opgebouwde kapitaal is vrijgesteld in box 3 en de uitkering is onbelast.'
          : 'Een nettolijfrente bestaat in dit jaar niet; de inleg is niet aftrekbaar.',
      ),
    )
  }

  const jaarruimteBerekeningen: JaarruimteJaar[] = [
    { jaar: t, inkomen: jr.inkomen, forToename: jr.forToename, berekening: jaarruimteDetail(lp, jr), jaarruimte: jr.jaarruimte, alGebruikt: 0 },
    ...[...historieRijen].reverse().map((r) => r.berekening),
  ]

  return {
    jaarruimte: jr.jaarruimte,
    reserveringsruimte,
    tabel,
    jaarruimteBerekeningen,
    lijfrenteAftrek,
    aovAftrek,
    forOmzettingAftrek: forOmzetting,
    nietAftrekbaar,
    totaal,
    uitleg,
    waarschuwingen,
  }
}
