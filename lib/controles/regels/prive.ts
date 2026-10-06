/**
 * Ronde 2 (A2): controleregels voor de voorlopige aanslag, de eigen woning en het box 2-verlies (ontwerp 6.2).
 * Puur: geen React, geen I/O; `vandaag` komt uit de context.
 *
 *  - va-te-laag (let op): de voorlopige aanslag IB wijkt meer dan de aanslaggrens af, de aangifte komt naar verwachting
 *    na 1 mei (of dat is onbekend en het jaar is voorbij) en de verwachte rente is minstens VA_RENTE_DREMPEL;
 *  - ew-schuld-box3 (let op): een deel van een leningdeel is geen eigenwoningschuld en staat (nog) niet als box 3-schuld;
 *  - ew-dubbel (fout, met reden): dat deel staat ook als handmatige box 3-schuld naast de schuld uit de doorrol;
 *  - ew-partner-reserve (let op): aankoop met een eigenwoningreserve bij fiscale partners (art. 3.119a lid 4);
 *  - ewr-vervalt (info): een eigenwoningreserve vervalt binnen zes maanden;
 *  - box2-verlies-vervallen (let op): een box 2-verlies na zijn termijn staat nog in de lijst en wordt niet verrekend;
 *  - box2-verlies-dit-jaar (info): het box 2-inkomen is negatief.
 */
import type { PersoonId } from '@/lib/tax/types'
import { datumNL, euro } from '@/lib/tax/uitleg'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'
import { adviesVoorlopigeAanslag, vaHeffingenUitResultaat } from '@/lib/tax/modules/planning/voorlopige-aanslag'
import { belastingrentePeriodeOp, geenRenteVoor, plusMaanden, renteVanaf } from '@/lib/tax/modules/planning/belastingrente'
import { AFRONDING } from '@/lib/tax/rounding'
import { jaarVerstreken, planningFase } from '@/lib/dossier/planning-fase'
import { leningSleutel } from '@/lib/dossier/doorrol-prive'
import { VA_RENTE_DREMPEL, type Controle, type ControleContext, type ControleRegel } from '../types'

/** Zes kalendermaanden later (31 augustus wordt 28 of 29 februari). */
const zesMaandenNa = (iso: string): string => plusMaanden(iso, 6)

const norm = (x: string | undefined) => (x ?? '').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g, ' ')

function naamVan(ctx: ControleContext, id: PersoonId): string {
  const naam = ctx.invoer.personen.find((p) => p.id === id)?.naam?.trim()
  return naam ? naam : `Persoon ${id}`
}

/**
 * De uitleg bij va-te-laag, passend bij vandaag: vóór 1 mei kan een aangifte de rente nog voorkomen, daarna alleen een
 * hogere voorlopige aanslag, en na 1 juli loopt de rente al.
 */
function vaTeLaagUitleg(x: { naam: string; verschil: number; zvw: number; rente: number; totaal: boolean; start: string; mei: string; vandaag: string }): string {
  const zvw = x.zvw > 0 ? ` en ${euro(x.zvw)} bijdrage Zvw` : ''
  const bij = `${x.naam} moet bij de aanslag naar verwachting nog ${euro(x.verschil)} inkomstenbelasting${zvw} bijbetalen.`
  const kosten = x.totaal ? `ongeveer ${euro(x.rente)}` : `ongeveer ${euro(x.rente)} per jaar`
  if (x.vandaag >= x.start) return `${bij} Sinds ${datumNL(x.start)} loopt daarover belastingrente tot de aanslag er is: ${x.totaal ? kosten : `nu ${kosten}`}. Een hogere voorlopige aanslag beperkt dat.`
  const hoe = x.vandaag >= x.mei ? 'een hogere voorlopige aanslag' : `een hogere voorlopige aanslag of een aangifte vóór ${datumNL(x.mei)}`
  return `${bij} Komt de aanslag na ${datumNL(x.start)}, dan kost dat ${kosten} belastingrente. Je voorkomt dat met ${hoe}.`
}

/** va-te-laag per persoon. */
export const vaTeLaag: ControleRegel = (ctx) => {
  const r = ctx.resultaat
  if (!r) return []
  const fase = planningFase(ctx.jaar, ctx.vandaag, ctx.status)
  if (fase === 'ingediend' || fase === 'toekomst') return []
  const P = ctx.params
  const plan = ctx.staat?.planning
  const mei = geenRenteVoor(ctx.jaar, P)
  const indiening = plan?.indieningsdatum
  const naMei = indiening ? indiening >= mei : jaarVerstreken(ctx.jaar, ctx.vandaag, ctx.status)
  if (!naMei) return []
  const uit: Controle[] = []
  for (const p of r.personen) {
    const pi = ctx.invoer.personen.find((x) => x.id === p.id)
    if (!pi) continue
    const advies = adviesVoorlopigeAanslag(
      { persoon: p.id, belastingjaar: ctx.jaar, ...vaHeffingenUitResultaat(p, pi), vandaag: ctx.vandaag, scenario: { ...plan, verwachtConform: plan?.verwachtConform ?? true } },
      { params: P, tabel: BELASTINGRENTE_IB },
    )
    const verschil = advies.ib.verschil
    if (verschil <= P.overig.waarde.aanslaggrens) continue
    const zvw = Math.max(0, advies.zvw.verschil)
    const bij = Math.max(0, verschil) + zvw
    const start = renteVanaf(ctx.jaar, P)
    // Het percentage van vandaag als de rente al loopt, anders dat van de startdatum (review ronde 2, bevinding 12).
    const peildatum = ctx.vandaag > start ? ctx.vandaag : start
    const pct = belastingrentePeriodeOp(BELASTINGRENTE_IB, peildatum)?.pct ?? 0
    // Met een verwachte dagtekening de rente tot die datum; anders de rente per jaar over IB en Zvw samen.
    const rente = advies.rente ? (advies.rente.ib?.bedrag ?? 0) + (advies.rente.zvw?.bedrag ?? 0) : AFRONDING.belastingrente(bij * pct)
    if (rente < VA_RENTE_DREMPEL) continue
    const naam = naamVan(ctx, p.id)
    uit.push({
      id: `va-te-laag:${p.id}`,
      regel: 'va-te-laag',
      ernst: 'let-op',
      titel: 'Voorlopige aanslag te laag',
      uitleg: vaTeLaagUitleg({ naam, verschil, zvw, rente, totaal: Boolean(advies.rente), start, mei, vandaag: ctx.vandaag }),
      waar: naam,
      persoon: p.id,
      gebied: 'aanslag',
      veld: `persoon:${p.id}/voorlopigeAanslagIB`,
      href: `/dossier/${ctx.jaar}/planning/#voorlopige-aanslag`,
      negeren: 'gezien',
      vingerafdruk: `verschil=${Math.round(verschil)}`,
      oplossing: { label: 'Naar de planning', actie: 'naar-planning' },
    })
  }
  return uit
}

/** ew-schuld-box3 en ew-dubbel: het deel van de hypotheek dat geen eigenwoningschuld is. */
export const ewSchuldBox3: ControleRegel = (ctx) => {
  const ew = ctx.resultaat?.eigenWoning
  const invoer = ctx.invoer
  if (!ew || !invoer.eigenWoning) return []
  const uit: Controle[] = []
  const herkomst = invoer.box3.schulden.filter((s) => s.herkomst?.bron === 'eigenwoningschuld')
  for (const [i, s] of (ew.leningsplitsing ?? []).entries()) {
    if (s.anderEind <= 0) continue
    const deel = invoer.eigenWoning.leningdelen?.find((l) => (s.id ? l.id === s.id : l.omschrijving === s.omschrijving)) ?? invoer.eigenWoning.leningdelen?.[i]
    const sleutel = s.id ?? (deel ? leningSleutel(deel) : s.omschrijving)
    if (herkomst.some((h) => h.herkomst?.sleutel === sleutel)) continue
    const nieuw = s.anderBegin === 0
    const naam = s.omschrijving || 'een leningdeel'
    uit.push({
      id: `ew-schuld-box3:${sleutel}`,
      regel: 'ew-schuld-box3',
      ernst: 'let-op',
      titel: 'Deel van de hypotheek is geen eigenwoningschuld',
      uitleg: nieuw
        ? `${euro(s.anderEind)} van ${naam} is geen eigenwoningschuld. De rente daarover is niet aftrekbaar; vanaf 1 januari ${ctx.jaar + 1} staat dat deel bij de schulden in box 3. Neem je ${ctx.jaar + 1} over uit dit jaar, dan zet de tool het daar.`
        : `${euro(s.anderEind)} van ${naam} is geen eigenwoningschuld en staat niet bij de schulden in box 3. Zet het daar, of neem de saldi opnieuw over uit ${ctx.jaar - 1}.`,
      waar: 'Eigen woning',
      gebied: 'woning',
      veld: `eigenWoning/leningdeel:${sleutel}/hoofdsom`,
      negeren: 'gezien',
      vingerafdruk: `bedrag=${Math.round(s.anderEind)}`,
    })
  }
  // ew-dubbel: naast de schuld uit de doorrol staat hetzelfde deel nog eens als eigen box 3-schuld.
  for (const h of herkomst) {
    const deel = invoer.eigenWoning.leningdelen?.find((l) => leningSleutel(l) === h.herkomst?.sleutel)
    for (const s of invoer.box3.schulden) {
      if (s.herkomst || s.id === h.id) continue
      const zelfdeBedrag = Math.abs(s.waardeBegin - h.waardeBegin) <= 1 && h.waardeBegin > 0
      const zelfdeNaam = norm(s.omschrijving) !== '' && (norm(s.omschrijving) === norm(deel?.omschrijving) || norm(s.omschrijving) === norm(h.omschrijving))
      if (!zelfdeBedrag && !zelfdeNaam) continue
      uit.push({
        id: `ew-dubbel:${s.id}`,
        regel: 'ew-dubbel',
        ernst: 'fout',
        titel: 'Hypotheek dubbel in box 3',
        uitleg: `${s.omschrijving || 'Een schuld'} (${euro(s.waardeBegin)}) lijkt hetzelfde deel van de hypotheek als de schuld die de tool uit de eigen woning overnam (${euro(h.waardeBegin)}). Dan telt het twee keer in box 3. Haal een van beide weg.`,
        waar: 'Vermogen',
        gebied: 'box3',
        veld: `box3/schuld:${s.id}/waardeBegin`,
        negeren: 'met-reden',
        vingerafdruk: `bedrag=${Math.round(s.waardeBegin)}|doorrol=${Math.round(h.waardeBegin)}`,
      })
    }
  }
  return uit
}

/** ew-partner-reserve: aankoop door fiscale partners met een eigenwoningreserve (art. 3.119a lid 4). */
export const ewPartnerReserve: ControleRegel = (ctx) => {
  const b = ctx.resultaat?.eigenWoning?.bijleenregeling
  if (!ctx.invoer.fiscaalPartner || ctx.invoer.personen.length < 2 || !b || b.soort !== 'aankoop' || b.reserveVoor <= 0) return []
  return [
    {
      id: 'ew-partner-reserve',
      regel: 'ew-partner-reserve',
      ernst: 'let-op',
      titel: 'Eigenwoningreserve bij partners',
      uitleg: `Bij deze aankoop telt een eigenwoningreserve van ${euro(b.reserveVoor)}. De tool rekent de reserves van jullie samen, omdat de leningdelen gezamenlijk zijn. Komt een reserve uit een woning die een van jullie met een eerdere partner had, kijk dan na of die ook voor de ander geldt.`,
      waar: 'Eigen woning',
      gebied: 'woning',
      veld: 'eigenWoning/aankoop.leverdatum',
      negeren: 'gezien',
      vingerafdruk: `reserve=${Math.round(b.reserveVoor)}`,
    },
  ]
}

/** ewr-vervalt: een toevoeging aan de eigenwoningreserve vervalt binnen zes maanden. */
export const ewrVervalt: ControleRegel = (ctx) => {
  const lijst = ctx.resultaat?.eigenWoning?.eigenwoningreserve ?? []
  const grens = zesMaandenNa(ctx.vandaag)
  return lijst
    .filter((t) => t.vervaltOp > ctx.vandaag && t.vervaltOp <= grens && Number(t.vervaltOp.slice(0, 4)) <= ctx.jaar + 1)
    .map((t) => ({
      id: `ewr-vervalt:${t.eigenaar}:${t.datumToevoeging}`,
      regel: 'ewr-vervalt',
      ernst: 'info' as const,
      titel: 'Eigenwoningreserve vervalt binnenkort',
      uitleg: `De eigenwoningreserve van ${naamVan(ctx, t.eigenaar)} (${euro(t.bedrag)}) geldt tot ${datumNL(t.vervaltOp)}. Koop je daarna een woning of verbouw je, dan telt hij niet meer mee.`,
      waar: 'Eigen woning',
      persoon: t.eigenaar,
      gebied: 'woning' as const,
      veld: null,
      sectie: 'woning',
      negeren: 'gezien' as const,
      vingerafdruk: `vervalt=${t.vervaltOp}`,
    }))
}

/** box2-verlies-vervallen en box2-verlies-dit-jaar per persoon. */
export const box2Verlies: ControleRegel = (ctx) => {
  const uit: Controle[] = []
  for (const p of ctx.resultaat?.personen ?? []) {
    const v = p.box2Verlies
    if (!v) continue
    const naam = naamVan(ctx, p.id)
    if (v.vervallen.length > 0) {
      const tekst = v.vervallen.map((x) => `${x.jaar} (${euro(x.bedrag)})`).join(', ')
      uit.push({
        id: `box2-verlies-vervallen:${p.id}`,
        regel: 'box2-verlies-vervallen',
        ernst: 'let-op',
        titel: 'Box 2-verlies vervallen',
        uitleg: `Het box 2-verlies uit ${tekst} van ${naam} is na de termijn van verrekening. Het telt niet meer mee en rolt niet door. Haal het weg, of kijk na of het jaar klopt.`,
        waar: naam,
        persoon: p.id,
        gebied: 'box2',
        veld: `persoon:${p.id}/box2Verliezen`,
        negeren: 'gezien',
        vingerafdruk: v.vervallen.map((x) => `${x.jaar}=${Math.round(x.bedrag)}`).join('|'),
      })
    }
    if (v.verliesDitJaar > 0) {
      uit.push({
        id: `box2-verlies-dit-jaar:${p.id}`,
        regel: 'box2-verlies-dit-jaar',
        ernst: 'info',
        titel: 'Verlies in box 2',
        uitleg: `${naam} heeft in ${ctx.jaar} een verlies in box 2 van ${euro(v.verliesDitJaar)}. Dat verlaagt het verzamelinkomen van ${ctx.jaar}; de Belastingdienst stelt het verlies vast met een beschikking.`,
        waar: naam,
        persoon: p.id,
        gebied: 'box2',
        veld: null,
        sectie: 'box2',
        negeren: 'gezien',
        vingerafdruk: `verlies=${Math.round(v.verliesDitJaar)}`,
      })
    }
  }
  return uit
}

/** Alle regels van dit onderdeel, in de volgorde van de pagina. */
export const PRIVE_REGELS: ControleRegel[] = [vaTeLaag, ewSchuldBox3, ewPartnerReserve, ewrVervalt, box2Verlies]
