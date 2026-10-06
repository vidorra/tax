/**
 * Ronde 2 (A6): staking van (een deel van) de onderneming (art. 3.8, 3.61, 3.79; art. 3.63 en 3.65; art. 10a.29).
 *
 * De stakingswinst zit, zoals geboekt, in het saldo of de rubrieken. De posten zijn een specificatie (scherm
 * Stakingswinst in de aangifte); alleen een post die niet in het saldo zit (`zitInSaldo(post.inSaldo, o, …)`, standaard
 * bij een boekhouding alleen een overgang naar privé) telt de engine erbij (`bijgeteld`). Zonder posten geldt dat voor
 * het ene bedrag met `stakingswinstInSaldo` nee.
 *
 *   basis        = Σ (waarde − boekwaarde) + goodwill − stakingskosten    (met posten)
 *                = stakingswinst                                             (één bedrag)
 *                = 0                                                         (geruisloos naar een BV, doorschuiving)
 *   totaal       = basis + FOR-vrijval + vrijval reserves + desinvesteringsbijtelling
 *   stakingsaftrek (art. 3.79): geheel        min(totaal, max(0, maximum − eerder genoten))
 *                               geruisloosBV  min(FOR-vrijval, max(0, maximum − eerder genoten))  (art. 10a.29 lid 7)
 *                               anders        0  (doorschuiving: open punt, met een melding)
 * Eerder genoten = StakingInvoer.eerderGenotenStakingsaftrek ?? (stakingsaftrekEerderGebruikt ? alles : PersoonInvoer.genotenStakingsaftrek ?? 0).
 *
 * Bij geruisloze inbreng (art. 3.65) en doorschuiving (art. 3.63) gaan de boekwaarden, de reserves en de plicht tot
 * desinvesteringsbijtelling mee naar de overnemer: alleen de FOR valt vrij (art. 10a.29 lid 6).
 * `totaal` is ook de grondslag van de stakingslijfrente (vóór stakingsaftrek en MKB-winstvrijstelling).
 * Puur: geen I/O.
 */
import type { OndernemingInvoer, StakingInvoer, StakingPost, StakingUitkomst, TaxYearParams, Uitlegregel, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { eur, euro, regel, waarschuwing } from '../../uitleg'
import { zitInSaldo } from './in-saldo'
import { stakingSoort, type StakingSoort } from './reserves'

export const doorschuivingSoort = (soort: StakingSoort | undefined): boolean => soort === 'geruisloosBV' || soort === 'doorschuiving'

/** Resultaat op één post: waarde of opbrengst min fiscale boekwaarde. */
export const postResultaat = (p: Pick<StakingPost, 'waardeOfOpbrengst' | 'fiscaleBoekwaarde'>): number => p.waardeOfOpbrengst - p.fiscaleBoekwaarde

/** Zit het resultaat op deze post al in het saldo? Standaard uit `winstBron`; een overgang naar privé apart. */
export function postInSaldo(post: StakingPost, o: Pick<OndernemingInvoer, 'winstBron'>): boolean {
  return zitInSaldo(post.inSaldo, o, post.naarPrive ? 'stakingPostPrive' : 'stakingPost')
}

/** Zit het ene bedrag `stakingswinst` (zonder posten) al in het saldo? Standaard ja (zoals een stakingspost). */
export function stakingswinstInSaldo(s: Pick<StakingInvoer, 'stakingswinstInSaldo'>, o: Pick<OndernemingInvoer, 'winstBron'>): boolean {
  return zitInSaldo(s.stakingswinstInSaldo, o, 'stakingPost')
}

/**
 * Deel van de stakingswinst dat niet in het saldo zat: dit telt de engine bij de winst. Met posten de posten die er niet
 * in zitten; met één bedrag dat bedrag als `stakingswinstInSaldo` nee is. 0 bij geruisloze inbreng of doorschuiving.
 */
export function stakingBijgeteld(s: StakingInvoer | undefined, o: Pick<OndernemingInvoer, 'winstBron'>): number {
  if (!s || doorschuivingSoort(stakingSoort(s))) return 0
  if ((s.posten ?? []).length === 0) return stakingswinstInSaldo(s, o) ? 0 : AFRONDING.reserve(s.stakingswinst)
  return AFRONDING.reserve((s.posten ?? []).filter((p) => !postInSaldo(p, o)).reduce((t, p) => t + postResultaat(p), 0))
}

/** Stakingswinst uit de posten (met goodwill en stakingskosten), of het ene bedrag. */
export function stakingBasis(s: StakingInvoer): number {
  if (doorschuivingSoort(stakingSoort(s))) return 0
  if (s.posten && s.posten.length > 0) {
    return AFRONDING.reserve(s.posten.reduce((t, p) => t + postResultaat(p), 0) + Math.max(0, s.goodwill ?? 0) - Math.max(0, s.stakingskosten ?? 0))
  }
  return AFRONDING.reserve(s.stakingswinst)
}

/** Eerder genoten stakingsaftrek waarmee gerekend wordt, en of dat is aangenomen (oud veld zonder bedrag). */
export function eerderGenotenStakingsaftrek(s: StakingInvoer, persoon: number | undefined, maximum: number): { bedrag: number; aangenomen: boolean } {
  if (s.eerderGenotenStakingsaftrek !== undefined) return { bedrag: Math.max(0, s.eerderGenotenStakingsaftrek), aangenomen: false }
  if (s.stakingsaftrekEerderGebruikt === true) return { bedrag: Math.max(maximum, persoon ?? 0), aangenomen: true }
  return { bedrag: Math.max(0, persoon ?? 0), aangenomen: false }
}

export interface StakingContext {
  params: TaxYearParams
  jaar: number
  prefix?: string
  onderneming: Pick<OndernemingInvoer, 'winstBron'>
  /** Verplichte afname van de FOR door de staking (geheel: alles; gedeeltelijk: boven het ondernemingsvermogen). */
  forVrijval: number
  /** Vrijval van herinvesteringsreserves en kostenegalisatiereserves door de staking. */
  reservesVrijval: number
  /** Desinvesteringsbijtelling van dit jaar (bij staking gelden de goederen als vervreemd, art. 3.61). */
  desinvesteringsbijtelling: number
  /** PersoonInvoer.genotenStakingsaftrek (doorrol). */
  genotenStakingsaftrek?: number
}

export interface StakingResultaat {
  uitkomst: StakingUitkomst
  uitleg: Uitlegregel[]
  waarschuwingen: Waarschuwing[]
}

export function berekenStaking(s: StakingInvoer, ctx: StakingContext): StakingResultaat {
  const op = ctx.params.ondernemer.waarde
  const prefix = ctx.prefix ?? 'onderneming'
  const soort = stakingSoort(s) ?? 'geheel'
  const doorschuift = doorschuivingSoort(soort)
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []

  const basis = stakingBasis(s)
  const bijgeteld = stakingBijgeteld(s, ctx.onderneming)
  const forVrijval = Math.max(0, ctx.forVrijval)
  const reservesVrijval = doorschuift ? 0 : Math.max(0, ctx.reservesVrijval)
  const desinvesteringsbijtelling = doorschuift ? 0 : Math.max(0, ctx.desinvesteringsbijtelling)
  const totaal = basis + forVrijval + reservesVrijval + desinvesteringsbijtelling

  const eerder = eerderGenotenStakingsaftrek(s, ctx.genotenStakingsaftrek, op.stakingsaftrek)
  const ruimte = Math.max(0, op.stakingsaftrek - eerder.bedrag)
  const stakingsaftrek = soort === 'geheel' ? Math.min(Math.max(0, totaal), ruimte) : soort === 'geruisloosBV' ? Math.min(forVrijval, ruimte) : 0

  // Aangifte (scherm Stakingswinst): per soort post; één bedrag zonder posten staat bij het overige resultaat.
  const per = (soortPost: StakingPost['soort']) => (s.posten ?? []).filter((p) => p.soort === soortPost).reduce((t, p) => t + postResultaat(p), 0)
  const metPosten = !doorschuift && (s.posten ?? []).length > 0
  const aangifte: StakingUitkomst['aangifte'] = {
    onroerendeZaken: metPosten ? AFRONDING.reserve(per('onroerend')) : 0,
    immaterieleActiva: metPosten ? AFRONDING.reserve(per('immaterieel') + Math.max(0, s.goodwill ?? 0)) : 0,
    overigeActiva: metPosten ? AFRONDING.reserve(per('overigeActiva')) : 0,
    vrijvalOudedagsreserve: forVrijval,
    vrijvalOverigeReserves: reservesVrijval,
    overigResultaat: metPosten ? AFRONDING.reserve(per('overig') - Math.max(0, s.stakingskosten ?? 0)) : doorschuift ? 0 : basis,
    desinvesteringsbijtelling,
  }

  const delen = [`stakingswinst ${eur(basis)}`]
  if (forVrijval > 0) delen.push(`oudedagsreserve ${eur(forVrijval)}`)
  if (reservesVrijval > 0) delen.push(`reserves ${eur(reservesVrijval)}`)
  if (desinvesteringsbijtelling > 0) delen.push(`desinvesteringsbijtelling ${eur(desinvesteringsbijtelling)}`)
  uitleg.push(regel(`${prefix}.staking`, 'Totale stakingswinst (zit in de winst)', totaal, 'info', { niveau: 1, formule: delen.join(' + ') }))

  if (eerder.aangenomen) {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.staking.eerderAangenomen`,
        'let-op',
        `Je hebt aangegeven dat je de stakingsaftrek al eerder hebt gebruikt, zonder bedrag. We gaan ervan uit dat je de hele ${euro(op.stakingsaftrek)} al hebt gehad. Was het minder, vul dan het bedrag in.`,
      ),
    )
  }
  if (soort === 'geruisloosBV') {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.staking.geruisloos`,
        'info',
        `Bij een geruisloze inbreng in een BV reken je niet af over de stakingswinst: de BV neemt de boekwaarden, de herinvesteringsreserve en de plicht tot desinvesteringsbijtelling over. De oudedagsreserve gaat niet mee en valt vrij (${euro(forVrijval)}), met stakingsaftrek. Die vrijval kun je omzetten in een lijfrente: de premie is ten hoogste de afname en je betaalt die binnen ${op.for.betaalTermijnMaanden} maanden na het einde van het jaar. Daar horen voorwaarden bij. Bespreek dit met een adviseur.`,
      ),
    )
  } else if (soort === 'doorschuiving') {
    waarschuwingen.push(
      waarschuwing(
        `${prefix}.staking.doorschuiving`,
        'info',
        `Bij een doorschuiving naar een medeondernemer of je partner gaan de boekwaarden, de reserves en de plicht tot desinvesteringsbijtelling mee. De oudedagsreserve valt vrij (${euro(forVrijval)}). Of je over die vrijval stakingsaftrek krijgt, is nog niet nagekeken: de berekening neemt hem niet mee. Bespreek dit met een adviseur.`,
      ),
    )
  }

  const uitkomst: StakingUitkomst = {
    soort,
    basis,
    bijgeteld,
    forVrijval,
    reservesVrijval,
    desinvesteringsbijtelling,
    totaal,
    stakingsaftrek,
    aangifte,
    eerderGenoten: eerder.bedrag,
    ...(eerder.aangenomen ? { eerderAangenomen: true } : {}),
  }
  return { uitkomst, uitleg, waarschuwingen }
}
