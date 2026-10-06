/**
 * Eigen woning: eigenwoningforfait, aftrekbare kosten, Hillen-aftrek.
 *
 * - Forfait is NIET progressief (zie ForfaitBand): het percentage van de band waarin de WOZ valt
 *   geldt over de hele WOZ. In de hoogste band: vast + pct × (WOZ − ondergrens van die band).
 *   Naar rato van de dagen hoofdverblijf in het jaar.
 * - Kwalificerende schuld: leningdelen die op of na `aflossingseisVanaf` zijn aangegaan moeten
 *   annuïtair of lineair aflossen (tenzij overgangsrecht); rente is maximaal `maxAftrekJaren` na de
 *   startdatum aftrekbaar (voor schulden van vóór `aftrekTermijnStartUiterlijk` vanaf die datum). Niet-kwalificerende schuld hoort in box 3 en wordt gemeld.
 * - saldo = forfait − aftrekbare rente − financieringskosten − erfpacht; bij een positief saldo
 *   geldt de Hillen-aftrek hillenPct × saldo.
 *
 * Ronde 2 (A2): eigenwoningreserve, bijleenregeling en de splitsing per leningdeel (art. 3.119a, 3.119aa):
 * - Vervreemdingssaldo van de vorige woning = verkoopprijs − verkoopkosten − eigenwoningschuld; positief naar de reserve
 *   per persoon (`aandeelA`). Elke toevoeging vervalt op de datum `reserveTermijnJaren` jaar na `datumToevoeging`.
 * - Op datum: bij een aankoop telt de reserve uit toevoegingen tot en met de leverdatum die nog niet vervallen zijn
 *   (lid 3 onder a, "direct voorafgaand"). Een verkoop op dezelfde dag als de aankoop telt mee: bij de notaris passeert
 *   dan eerst de verkoop (melding ew-zelfde-dag). Eerst kopen en later verkopen raakt de al gekochte woning niet; de
 *   reserve blijft staan voor een verbouwing of volgende woning.
 * - Maximale eigenwoningschuld = verwervingskosten + kosten verbetering − reserve + financieringskosten (lid 2 en 3, de
 *   financieringskosten niet verminderd met de reserve). Partners met gezamenlijke leningdelen samen (lid 10): de
 *   reserves van beiden tellen op. Een verbetering in het jaar van aankoop (op of na de leverdatum) telt mee bij de
 *   aankoop; een verbetering ervoor hoort bij de vorige woning. Per moment (aankoop, dan elke verbetering op datum):
 *   max(0, kosten − reserve direct ervoor); zonder nieuwe toevoeging tussen de momenten is dat Σ kosten − reserve.
 * - De leningdelen voor de aankoop of verbetering (aangegaan in dit jaar) zijn eigenwoningschuld tot het maximum; het
 *   andere deel naar rato per leningdeel is een box 3-schuld vanaf 1 januari van volgend jaar. De reserve neemt af met
 *   verwervingskosten − eigenwoningschuld (art. 3.119aa lid 2 onder a) en met de kosten van een verbetering (onder c),
 *   oudste toevoegingen eerst.
 * - Splitsing per leningdeel (`leningsplitsing`): stand op 1 januari en 31 december en de rente in deel eigen woning en
 *   ander deel, zoals de aangifte vraagt. Het jaar erna zet de doorrol `LeningdeelInvoer.eigenwoningschuld.begin`; dan
 *   telt de rente naar rato `begin / standBegin` en staat het andere deel als box 3-schuld (niet nog eens hier).
 *   Aflossingen gaan naar rato over beide delen (open punt in het ontwerp).
 *
 * Voorbeeld 2024: WOZ 412.000 × 0,35% = 1.442, rente 7.860, saldo −6.418.
 */
import type { EigenWoningBijleen, EigenWoningInvoer, EigenWoningResultaat, LeningdeelInvoer, PersoonId, TaxYearParams, Uitlegregel, Waarschuwing } from '../types'
import { AFRONDING } from '../rounding'
import { eur, euro, pct, regel, waarschuwing, datumNL } from '../uitleg'
import { isoDatum, parseDatum } from '../datum'

export interface EigenWoningContext {
  params: TaxYearParams
  jaar: number
}

const DAG_MS = 86400000

/** Aantal dagen van `van` tot en met `tot`, begrensd op het kalenderjaar. */
function dagenInJaar(van: string, tot: string, jaar: number): number {
  const begin = Math.max(parseDatum(van).getTime(), Date.UTC(jaar, 0, 1))
  const eind = Math.min(parseDatum(tot).getTime(), Date.UTC(jaar, 11, 31))
  return eind < begin ? 0 : Math.round((eind - begin) / DAG_MS) + 1
}

function lengteJaar(jaar: number): number {
  return Math.round((Date.UTC(jaar + 1, 0, 1) - Date.UTC(jaar, 0, 1)) / DAG_MS)
}

/** Volledig jaarforfait over de WOZ-waarde (zonder tijdsevenredigheid). */
export function forfaitVoorWoz(woz: number, params: TaxYearParams): { bedrag: number; formule: string; bandIndex: number } {
  const banden = params.eigenWoning.waarde.forfait
  let ondergrens = 0
  for (let i = 0; i < banden.length; i++) {
    const b = banden[i]
    if (b.tot === null || woz <= b.tot) {
      if (b.vast !== undefined) {
        return {
          bedrag: b.vast + b.pct * (woz - ondergrens),
          formule: `${eur(b.vast)} + ${pct(b.pct)} × (${eur(woz)} − ${eur(ondergrens)})`,
          bandIndex: i,
        }
      }
      return { bedrag: b.pct * woz, formule: `${pct(b.pct)} × ${eur(woz)}`, bandIndex: i }
    }
    ondergrens = b.tot
  }
  return { bedrag: 0, formule: 'geen forfaitband gevonden', bandIndex: -1 }
}

interface LeningToets {
  deel: LeningdeelInvoer
  kwalificerend: boolean
  aftrekbareRente: number
  reden?: string
  /** Waarom het leningdeel geen eigenwoningschuld is. */
  soort?: 'aflossingseis' | 'termijn'
}

function eindeAftrekTermijn(startdatum: string, jaren: number): string {
  const s = parseDatum(startdatum)
  return isoDatum(new Date(Date.UTC(s.getUTCFullYear() + jaren, s.getUTCMonth(), s.getUTCDate())))
}

function toetsLeningdeel(deel: LeningdeelInvoer, ctx: EigenWoningContext): LeningToets {
  const p = ctx.params.eigenWoning.waarde
  const naAflossingseis = deel.startdatum >= p.aflossingseisVanaf
  if (naAflossingseis && !deel.overgangsrecht && deel.aflossingsvorm !== 'annuitair' && deel.aflossingsvorm !== 'lineair') {
    return {
      deel,
      kwalificerend: false,
      aftrekbareRente: 0,
      soort: 'aflossingseis',
      reden: `${deel.omschrijving}: aangegaan op of na ${datumNL(p.aflossingseisVanaf)} en niet annuïtair of lineair, dus geen eigenwoningschuld`,
    }
  }
  // Schulden van vóór de Wet IB 2001: de termijn loopt vanaf aftrekTermijnStartUiterlijk (1 januari 2001).
  const termijnStart = deel.startdatum < p.aftrekTermijnStartUiterlijk ? p.aftrekTermijnStartUiterlijk : deel.startdatum
  const einde = eindeAftrekTermijn(termijnStart, p.maxAftrekJaren)
  const jaarBegin = `${ctx.jaar}-01-01`
  const jaarEind = `${ctx.jaar}-12-31`
  if (einde <= jaarBegin) {
    return {
      deel,
      kwalificerend: false,
      aftrekbareRente: 0,
      soort: 'termijn',
      reden: `${deel.omschrijving}: de termijn van ${p.maxAftrekJaren} jaar renteaftrek is verstreken`,
    }
  }
  if (einde <= jaarEind) {
    // Termijn eindigt in dit jaar: rente tijdsevenredig tot de einddatum.
    const dagen = dagenInJaar(jaarBegin, isoDatum(new Date(parseDatum(einde).getTime() - DAG_MS)), ctx.jaar)
    const aftrekbareRente = AFRONDING.eigenWoning((deel.rente * dagen) / lengteJaar(ctx.jaar))
    return {
      deel,
      kwalificerend: true,
      aftrekbareRente,
      reden: `${deel.omschrijving}: de termijn van ${p.maxAftrekJaren} jaar eindigt op ${einde}, rente tijdsevenredig aftrekbaar`,
    }
  }
  return { deel, kwalificerend: true, aftrekbareRente: deel.rente }
}

type Toevoeging = { eigenaar: PersoonId; datumToevoeging: string; bedrag: number }
type Splitsing = NonNullable<EigenWoningResultaat['leningsplitsing']>[number]

/** Vervaldatum van een toevoeging aan de eigenwoningreserve: `jaren` jaar na de datum. */
export function reserveVervaltOp(datumToevoeging: string, jaren: number): string {
  const d = parseDatum(datumToevoeging)
  return isoDatum(new Date(Date.UTC(d.getUTCFullYear() + jaren, d.getUTCMonth(), d.getUTCDate())))
}

/** Vervreemdingssaldo van een verkochte woning en de verdeling over de personen (positief deel naar de reserve). */
export function vervreemdingssaldo(v: NonNullable<EigenWoningInvoer['vorigeWoning']>): { saldo: number; toevoegingen: Toevoeging[] } {
  const saldo = v.verkoopprijs - v.verkoopkosten - v.eigenwoningschuld
  if (saldo <= 0) return { saldo, toevoegingen: [] }
  const aandeel = Math.min(1, Math.max(0, v.aandeelA))
  const a = AFRONDING.reserve(saldo * aandeel)
  const toevoegingen: Toevoeging[] = []
  if (a > 0) toevoegingen.push({ eigenaar: 'A', datumToevoeging: v.leverdatum, bedrag: a })
  if (saldo - a > 0) toevoegingen.push({ eigenaar: 'B', datumToevoeging: v.leverdatum, bedrag: saldo - a })
  return { saldo, toevoegingen }
}

/**
 * Haalt `bedrag` uit de toevoegingen die op `peildatum` meetellen (`telt`: op of vóór de peildatum en nog niet
 * vervallen), oudste datum eerst; bij dezelfde datum naar rato. Wijzigt de lijst ter plekke.
 */
function gebruikReserve(toevoegingen: Toevoeging[], telt: (t: Toevoeging) => boolean, bedrag: number): void {
  let rest = bedrag
  const datums = [...new Set(toevoegingen.filter((t) => telt(t) && t.bedrag > 0).map((t) => t.datumToevoeging))].sort()
  for (const d of datums) {
    if (rest <= 0) break
    const groep = toevoegingen.filter((t) => t.datumToevoeging === d && telt(t) && t.bedrag > 0)
    const som = groep.reduce((s, t) => s + t.bedrag, 0)
    const deel = Math.min(rest, som)
    let verdeeld = 0
    groep.forEach((t, i) => {
      const af = i === groep.length - 1 ? deel - verdeeld : AFRONDING.reserve((deel * t.bedrag) / som)
      verdeeld += af
      t.bedrag -= af
    })
    rest -= deel
  }
}

export function berekenEigenWoning(ew: EigenWoningInvoer, ctx: EigenWoningContext): EigenWoningResultaat {
  const p = ctx.params.eigenWoning.waarde
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const jaarBegin = `${ctx.jaar}-01-01`
  const jaarEind = `${ctx.jaar}-12-31`

  // Forfait.
  const jaarForfait = forfaitVoorWoz(Math.max(0, ew.woz), ctx.params)
  let forfait = AFRONDING.eigenWoning(jaarForfait.bedrag)
  let formuleForfait = jaarForfait.formule
  if (ew.periodeHoofdverblijf) {
    const dagen = dagenInJaar(ew.periodeHoofdverblijf.van, ew.periodeHoofdverblijf.tot, ctx.jaar)
    const totaal = lengteJaar(ctx.jaar)
    if (dagen < totaal) {
      forfait = AFRONDING.eigenWoning((jaarForfait.bedrag * dagen) / totaal)
      formuleForfait = `(${jaarForfait.formule}) × ${dagen}/${totaal} dagen`
    }
  }
  uitleg.push(
    regel('ew-forfait', 'Eigenwoningforfait', forfait, 'plus', {
      formule: formuleForfait,
      parameter: jaarForfait.bandIndex >= 0 ? `eigenWoning.forfait[${jaarForfait.bandIndex}]` : 'eigenWoning.forfait',
    }),
  )
  uitleg.push(
    regel('ew-woz', `WOZ-waarde met waardepeildatum 1 januari ${ctx.jaar - 1}`, ew.woz, 'info', {
      niveau: 2,
      parameter: 'eigenWoning.wozPeildatum',
    }),
  )

  // Eigenwoningreserve: toevoegingen uit eerdere jaren en uit de verkoop van dit jaar.
  const toevoegingen: Toevoeging[] = (ew.eigenwoningreserve ?? []).filter((t) => t.bedrag > 0).map((t) => ({ eigenaar: t.eigenaar, datumToevoeging: t.datumToevoeging, bedrag: t.bedrag }))
  let saldoVorige: number | undefined
  if (ew.vorigeWoning) {
    const v = vervreemdingssaldo(ew.vorigeWoning)
    saldoVorige = v.saldo
    toevoegingen.push(...v.toevoegingen)
    uitleg.push(
      regel('ew-vervreemdingssaldo', saldoVorige > 0 ? 'Vervreemdingssaldo vorige woning (naar de eigenwoningreserve)' : 'Vervreemdingssaldo vorige woning', saldoVorige, 'info', {
        niveau: 1,
        formule: `${eur(ew.vorigeWoning.verkoopprijs)} − ${eur(ew.vorigeWoning.verkoopkosten)} − eigenwoningschuld ${eur(ew.vorigeWoning.eigenwoningschuld)}`,
      }),
    )
  }
  const vervaltOp = (t: Toevoeging) => reserveVervaltOp(t.datumToevoeging, p.reserveTermijnJaren)
  // Lid 3 onder a: de reserve "direct voorafgaand" aan de aankoop of verbetering. Een toevoeging op dezelfde dag telt
  // mee: bij levering van de oude en de nieuwe woning op één dag passeert bij de notaris eerst de verkoop.
  const teltOp = (datum: string) => (t: Toevoeging) => t.datumToevoeging <= datum && vervaltOp(t) > datum
  const reserveOp = (datum: string) => toevoegingen.filter(teltOp(datum)).reduce((s, t) => s + t.bedrag, 0)

  // Bijleenregeling: aankoop of verbetering in dit jaar.
  const vroegsteNieuw = ew.aankoop?.leverdatum && ew.aankoop.leverdatum < jaarBegin ? ew.aankoop.leverdatum : jaarBegin
  const toetsen = (ew.leningdelen ?? []).map((deel) => toetsLeningdeel(deel, ctx))
  const isNieuw = (t: LeningToets) => t.kwalificerend && !t.deel.eigenwoningschuld && t.deel.startdatum >= vroegsteNieuw
  const nieuw = toetsen.filter(isNieuw)
  const financieringskosten = Math.max(0, ew.financieringskosten ?? 0)
  let bijleenregeling: EigenWoningBijleen | undefined
  let fractieNieuw = 1
  const aankoop = ew.aankoop
  // Verbeteringen zonder datum rekenen we na de aankoop (de nieuwe woning) of op 1 januari.
  const verbeteringen = (ew.verbeteringen ?? []).filter((v) => v.kosten > 0).map((v) => ({ datum: v.datum || (aankoop?.leverdatum ?? jaarBegin), kosten: v.kosten }))
  // Bij een aankoop horen verbeteringen vóór de leverdatum bij de vorige woning: die tellen hier niet mee.
  const verbeteringVoorAankoop = aankoop?.leverdatum ? verbeteringen.filter((v) => v.datum < aankoop.leverdatum) : []
  const momenten: Array<{ soort: 'aankoop' | 'verbetering'; datum: string; kosten: number }> = [
    ...(aankoop ? [{ soort: 'aankoop' as const, datum: aankoop.leverdatum, kosten: Math.max(0, aankoop.koopsom) + Math.max(0, aankoop.kostenKoper) }] : []),
    ...verbeteringen.filter((v) => !verbeteringVoorAankoop.includes(v)).map((v) => ({ soort: 'verbetering' as const, ...v })),
  ].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.soort === 'aankoop' ? -1 : b.soort === 'aankoop' ? 1 : 0))
  if (momenten.length > 0) {
    // Per moment (aankoop, dan elke verbetering op datum): maximum = kosten − reserve direct ervoor (lid 3, nooit onder
    // nul). De nieuwe leningdelen gaan eerst naar de financieringskosten, dan naar de momenten op volgorde. De reserve
    // neemt af met verwervingskosten − eigenwoningschuld (lid 2 onder a) of met de kosten van de verbetering (onder c).
    // Zonder nieuwe toevoeging of verval tussen de momenten is dat gelijk aan: Σ kosten − reserve vóór het eerste moment.
    // Kwam er na een moment reserve bij (eerst gekocht, later verkocht, dan verbouwd), dan is een lening van op of na die
    // toevoeging niet voor dat eerdere moment: zo blijft de lening voor de verbouwing begrensd door de nieuwe reserve.
    const peildatum = momenten[0].datum
    const laatste = momenten[momenten.length - 1].datum
    const nieuweLeningen = nieuw.map((t) => ({ start: t.deel.startdatum, bedrag: Math.max(0, t.deel.hoofdsom) }))
    const leningen = nieuweLeningen.reduce((s, l) => s + l.bedrag, 0)
    const grensNa = momenten.map((m) => toevoegingen.filter((t) => t.bedrag > 0 && t.datumToevoeging > m.datum && t.datumToevoeging <= laatste).map((t) => t.datumToevoeging).sort()[0])
    let ewsMomenten = 0
    let max = financieringskosten
    let reserveVoor = 0
    let reserveGebruikt = 0
    let restVorige: number | undefined
    let perMoment = false
    const delen: Array<{ label: string; reserve: number }> = []
    momenten.forEach((m, i) => {
      const r = reserveOp(m.datum)
      reserveVoor += restVorige === undefined ? r : Math.max(0, r - restVorige)
      if (restVorige !== undefined && r !== restVorige) perMoment = true
      const maxMoment = Math.max(0, m.kosten - r)
      const grens = grensNa[i]
      const beschikbaar = nieuweLeningen.filter((l) => grens === undefined || l.start < grens).reduce((s, l) => s + l.bedrag, 0)
      const ewsMoment = Math.min(Math.max(0, beschikbaar - financieringskosten - ewsMomenten), maxMoment)
      ewsMomenten += ewsMoment
      max += maxMoment
      const gebruik = m.soort === 'aankoop' ? Math.min(r, m.kosten - ewsMoment) : Math.min(r, m.kosten)
      gebruikReserve(toevoegingen, teltOp(m.datum), gebruik)
      reserveGebruikt += gebruik
      restVorige = r - gebruik
      delen.push({ label: `${m.soort === 'aankoop' ? 'verwervingskosten' : 'kosten verbetering'} ${eur(m.kosten)}`, reserve: r })
    })
    const eigenwoningschuld = Math.min(leningen, financieringskosten) + ewsMomenten
    const ander = leningen - eigenwoningschuld
    fractieNieuw = leningen > 0 ? eigenwoningschuld / leningen : 1
    const kosten = momenten.reduce((s, m) => s + m.kosten, 0)
    const kostenVerbetering = aankoop ? momenten.filter((m) => m.soort === 'verbetering').reduce((s, m) => s + m.kosten, 0) : 0
    const reserveNaAankoop = toevoegingen.filter((t) => t.datumToevoeging > peildatum).reduce((s, t) => s + t.bedrag, 0)
    bijleenregeling = {
      soort: aankoop ? 'aankoop' : 'verbetering',
      kosten,
      reserveVoor,
      financieringskosten,
      maxEigenwoningschuld: max,
      leningen,
      eigenwoningschuld,
      ander,
      reserveGebruikt,
      reserveNaAankoop,
      ...(kostenVerbetering > 0 ? { kostenVerbetering } : {}),
    }
    const fin = financieringskosten > 0 ? ` + financieringskosten ${eur(financieringskosten)}` : ''
    const formule = perMoment
      ? `${delen.map((d) => `max(0, ${d.label} − eigenwoningreserve ${eur(d.reserve)})`).join(' + ')}${fin}`
      : `${delen.map((d) => d.label).join(' + ')} − eigenwoningreserve ${eur(reserveVoor)}${fin}`
    uitleg.push(regel('ew-max-schuld', 'Maximale eigenwoningschuld (bijleenregeling)', max, 'info', { niveau: 1, formule, parameter: 'eigenWoning.reserveTermijnJaren' }))
    if (ander > 0) {
      uitleg.push(regel('ew-ander-deel', 'Deel van de nieuwe lening dat geen eigenwoningschuld is (box 3)', ander, 'info', { niveau: 1, formule: `${eur(leningen)} − ${eur(eigenwoningschuld)}` }))
    }
  }
  if (aankoop?.leverdatum && ew.vorigeWoning && saldoVorige !== undefined && saldoVorige > 0 && ew.vorigeWoning.leverdatum === aankoop.leverdatum) {
    waarschuwingen.push(
      waarschuwing(
        'ew-zelfde-dag',
        'info',
        'Je vorige en je nieuwe woning zijn op dezelfde dag geleverd. We rekenen alsof bij de notaris eerst de verkoop passeerde, zoals meestal gaat: de overwaarde gaat dan af van wat je voor de nieuwe woning met renteaftrek mag lenen. In de aangifte antwoord je dan Nee op de vraag of je de nieuwe woning al kocht voordat de woning met overwaarde werd verkocht.',
      ),
    )
  }
  if (verbeteringVoorAankoop.length > 0) {
    waarschuwingen.push(
      waarschuwing(
        'ew-verbetering-voor-aankoop',
        'info',
        `${verbeteringVoorAankoop.length === 1 ? `De verbouwing van ${datumNL(verbeteringVoorAankoop[0].datum)} ligt` : 'Verbouwingen liggen'} vóór de levering van je nieuwe woning op ${datumNL(aankoop!.leverdatum)}. Die horen bij je vorige woning en tellen niet mee in wat je voor de nieuwe woning met renteaftrek mag lenen.`,
      ),
    )
  }

  // Rente en splitsing per leningdeel.
  let rente = 0
  let nietKwalificerendeSchuld = 0
  let nogNaarBox3 = 0
  let bestaandNaarBox3 = 0
  const leningdelen: NonNullable<EigenWoningResultaat['leningdelen']> = []
  const leningsplitsing: Splitsing[] = []
  if (ew.leningdelen && ew.leningdelen.length > 0) {
    if (ew.rente !== undefined && ew.rente > 0) {
      waarschuwingen.push(
        waarschuwing('ew-dubbele-rente', 'info', 'Er zijn leningdelen ingevuld; de totale rente is daarom niet gebruikt.'),
      )
    }
    for (const t of toetsen) {
      const deel = t.deel
      const standBegin = deel.standBegin ?? (deel.startdatum > jaarBegin ? 0 : deel.hoofdsom)
      const standEind = deel.standEind ?? deel.hoofdsom
      let fractie = 1
      let reden: Splitsing['reden']
      let aftrekbareRente = t.aftrekbareRente
      let ewBegin: number
      if (!t.kwalificerend) {
        fractie = 0
        reden = t.soort === 'termijn' ? 'termijn' : 'aflossingseis'
        ewBegin = 0
      } else if (deel.eigenwoningschuld) {
        ewBegin = Math.min(Math.max(0, deel.eigenwoningschuld.begin), standBegin)
        fractie = standBegin > 0 ? ewBegin / standBegin : 0
        reden = fractie < 1 ? deel.eigenwoningschuld.reden : undefined
        aftrekbareRente = AFRONDING.eigenWoning(t.aftrekbareRente * fractie)
      } else if (bijleenregeling && isNieuw(t)) {
        fractie = fractieNieuw
        reden = fractie < 1 ? 'bijleenregeling' : undefined
        ewBegin = AFRONDING.eigenWoning(standBegin * fractie)
        aftrekbareRente = AFRONDING.eigenWoning(t.aftrekbareRente * fractie)
      } else {
        ewBegin = standBegin
      }
      const ewEind = AFRONDING.eigenWoning(standEind * fractie)
      const anderEind = standEind - ewEind
      rente += aftrekbareRente
      nietKwalificerendeSchuld += anderEind
      // Een splitsing uit vorig jaar staat al als box 3-schuld (doorrol); geen nieuwe melding.
      if (!deel.eigenwoningschuld) {
        nogNaarBox3 += anderEind
        if (!(bijleenregeling && isNieuw(t))) bestaandNaarBox3 += anderEind
      }
      leningdelen.push({ omschrijving: deel.omschrijving, betaaldeRente: deel.rente, aftrekbareRente, kwalificerend: t.kwalificerend })
      leningsplitsing.push({
        ...(deel.id ? { id: deel.id } : {}),
        omschrijving: deel.omschrijving,
        eigenwoningBegin: ewBegin,
        anderBegin: standBegin - ewBegin,
        eigenwoningEind: ewEind,
        anderEind,
        renteEigenWoning: aftrekbareRente,
        renteAnder: deel.rente - aftrekbareRente,
        ...(reden ? { reden } : {}),
      })
      const formule =
        t.reden ??
        (fractie < 1 && fractie > 0
          ? `betaalde rente ${eur(deel.rente)} × ${pct(fractie, 2)} deel eigenwoningschuld (${reden === 'bijleenregeling' ? 'bijleenregeling' : 'splitsing vorig jaar'})`
          : `betaalde rente ${eur(deel.rente)}`)
      uitleg.push(
        regel(`ew-rente-${deel.omschrijving}`, `Rente ${deel.omschrijving}`, aftrekbareRente, t.kwalificerend ? 'min' : 'info', {
          niveau: 2,
          formule,
          parameter: t.kwalificerend ? undefined : 'eigenWoning.aflossingseisVanaf',
        }),
      )
      if (deel.startdatum < p.aflossingseisVanaf && !deel.overgangsrecht) {
        waarschuwingen.push(
          waarschuwing(
            `ew-overgangsrecht-${deel.omschrijving}`,
            'info',
            `${deel.omschrijving} is aangegaan vóór ${datumNL(p.aflossingseisVanaf)}. De rente is hier als aftrekbaar meegenomen op grond van het overgangsrecht. Voor schulden van vóór ${datumNL(p.aftrekTermijnStartUiterlijk)} loopt de termijn van ${p.maxAftrekJaren} jaar vanaf ${datumNL(p.aftrekTermijnStartUiterlijk)}.`,
          ),
        )
      }
    }
    if (nogNaarBox3 > 0) {
      waarschuwingen.push(
        waarschuwing(
          'ew-box3-schuld',
          'let-op',
          bestaandNaarBox3 > 0
            ? `${euro(nogNaarBox3)} van de hypotheek is geen eigenwoningschuld. Die schuld hoort in box 3 en de rente daarover is niet aftrekbaar.`
            : `${euro(nogNaarBox3)} van de nieuwe lening is geen eigenwoningschuld. De rente daarover is niet aftrekbaar; vanaf 1 januari ${ctx.jaar + 1} hoort dat deel bij de schulden in box 3.`,
        ),
      )
    }
  } else {
    rente = Math.max(0, ew.rente ?? 0)
  }

  const erfpacht = Math.max(0, ew.erfpacht ?? 0)
  const aftrekbareKosten = rente + financieringskosten + erfpacht

  uitleg.push(regel('ew-rente', 'Aftrekbare hypotheekrente', rente, 'min'))
  if (financieringskosten > 0) uitleg.push(regel('ew-financiering', 'Financieringskosten', financieringskosten, 'min'))
  if (erfpacht > 0) uitleg.push(regel('ew-erfpacht', 'Erfpachtcanon', erfpacht, 'min'))

  let saldo = forfait - aftrekbareKosten
  let hillenAftrek = 0
  if (saldo > 0) {
    hillenAftrek = AFRONDING.eigenWoning(p.hillenPct * saldo)
    uitleg.push(
      regel('ew-hillen', 'Aftrek wegens geen of kleine eigenwoningschuld (Hillen)', hillenAftrek, 'min', {
        formule: `${pct(p.hillenPct, 3)} × ${eur(saldo)}`,
        parameter: 'eigenWoning.hillenPct',
      }),
    )
    saldo -= hillenAftrek
  }

  uitleg.push(
    regel('ew-saldo', saldo < 0 ? 'Saldo eigen woning (aftrekpost)' : 'Saldo eigen woning (inkomen)', saldo, 'totaal', {
      niveau: 0,
      formule: `${eur(forfait)} − ${eur(aftrekbareKosten)}${hillenAftrek > 0 ? ` − ${eur(hillenAftrek)}` : ''}`,
    }),
  )

  // Reserve na dit jaar: vervallen toevoegingen eruit.
  const metDatum = toevoegingen.filter((t) => t.bedrag > 0).map((t) => ({ ...t, vervaltOp: vervaltOp(t) }))
  const eigenwoningreserve = metDatum.filter((t) => t.vervaltOp > jaarEind)
  const reserveVervallen = metDatum.filter((t) => t.vervaltOp <= jaarEind)
  for (const t of reserveVervallen) {
    uitleg.push(regel(`ew-reserve-vervallen-${t.eigenaar}-${t.datumToevoeging}`, `Eigenwoningreserve uit ${datumNL(t.datumToevoeging)} vervallen op ${datumNL(t.vervaltOp)}`, t.bedrag, 'info', { niveau: 2, parameter: 'eigenWoning.reserveTermijnJaren' }))
  }
  if (eigenwoningreserve.length > 0) {
    uitleg.push(regel('ew-reserve', 'Eigenwoningreserve na dit jaar', eigenwoningreserve.reduce((s, t) => s + t.bedrag, 0), 'info', { niveau: 1, parameter: 'eigenWoning.reserveTermijnJaren' }))
  }

  return {
    forfait,
    aftrekbareKosten,
    hillenAftrek,
    saldo,
    nietKwalificerendeSchuld,
    rente,
    financieringskosten,
    erfpacht,
    ...(leningdelen.length > 0 ? { leningdelen } : {}),
    ...(toevoegingen.length > 0 || ew.eigenwoningreserve ? { eigenwoningreserve } : {}),
    ...(reserveVervallen.length > 0 ? { reserveVervallen } : {}),
    ...(saldoVorige !== undefined ? { vervreemdingssaldo: saldoVorige } : {}),
    ...(bijleenregeling ? { maxEigenwoningschuld: bijleenregeling.maxEigenwoningschuld, bijleenregeling } : {}),
    ...(leningsplitsing.length > 0 ? { leningsplitsing } : {}),
    uitleg,
    waarschuwingen,
  }
}
