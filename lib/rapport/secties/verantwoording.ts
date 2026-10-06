/**
 * Verantwoordingspagina (spec hoofdstuk 4, koppeling 2.1) op de plek van de brief van de accountant. Geen
 * samenstellingsverklaring en geen kantoornaam: de uitkomsten van deze persoon (en partner en huishouden), de
 * status van de berekening, de bron van de cijfers, de rekenparameters met status, de gekozen methoden, wat niet
 * is meegenomen of is weggelaten en de verschillen met de bedragen van de accountant als die in het dossier staan.
 */
import type { BlokNaam, PersoonResultaat, Status, TaxYearParams } from '@/lib/tax/types'
import { STATUS_RANG } from '@/lib/tax/types'
import { lijfrenteStatusVoorJaar } from '@/lib/tax/years/lijfrente-historie'
import { accountantVergelijking, schoonAccountantRegels } from '@/lib/dossier/accountant'
import type { Verantwoording } from '../model'
import { bedrag, datumLang, euro, percentage } from '../notatie'
import { potVan, toonBox3, toonLijfrente } from './belastbaar-inkomen'
import type { RapportContext } from './bouwstenen'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'
import { geenRenteVoor, rentePerMaand, renteVanaf } from '@/lib/tax/modules/planning/belastingrente'
import { pct as pctA2 } from '@/lib/tax/uitleg'
import { controlesVerantwoording } from '../controles'
import { nietMeegenomenA5 } from './bronbelasting'
import { nietMeegenomenRegelingenOnderneming } from './regelingen-onderneming'

export const STATUS_ZIN = 'Indicatieve berekening, geen belastingadvies en geen aangifte. De aanslag van de Belastingdienst is leidend.'

const BLOK_LABEL: Partial<Record<BlokNaam, string>> = {
  box1: 'Tarieven, schijven en premies volksverzekeringen',
  heffingskortingen: 'Heffingskortingen',
  ondernemer: 'Ondernemersfaciliteiten (zelfstandigenaftrek, MKB-winstvrijstelling, KIA)',
  inkomensvoorziening: 'Lijfrente (jaar- en reserveringsruimte)',
  eigenWoning: 'Eigen woning',
  box2: 'Aanmerkelijk belang (box 2)',
  box3: 'Sparen en beleggen (box 3)',
  zvw: 'Zorgverzekeringswet',
  pga: 'Persoonsgebonden aftrek',
  overig: 'Overig (belastingrente, AOW-leeftijd, aanslag- en teruggaafgrens)',
}

const laagste = (statussen: Status[]): Status => statussen.reduce((l, s) => (STATUS_RANG[s] < STATUS_RANG[l] ? s : l), 'definitief' as Status)

function blokStatus(P: TaxYearParams, naam: BlokNaam): Status {
  const b = P[naam] as { status: Status; veldStatus?: Record<string, Status | undefined> }
  return laagste([b.status, ...Object.values(b.veldStatus ?? {}).filter((s): s is Status => !!s)])
}

function bronTekst(P: TaxYearParams, naam: BlokNaam): string | undefined {
  const b = P[naam].bron
  return b ? `${b.titel} (${datumLang(b.datum)})` : undefined
}

function uitkomsten(p: PersoonResultaat, naam: string, metNaam: boolean): Verantwoording['uitkomsten'] {
  const ib = p.teBetalenIB
  const zvw = p.zvw.teBetalen
  const tot = ib + zvw
  const achter = metNaam ? ` ${naam}` : ''
  return [
    { label: `${ib >= 0 ? 'Te betalen' : 'Te ontvangen'} inkomstenbelasting${achter}`, bedrag: Math.abs(ib), afsluiting: 'enkel' },
    { label: `${zvw >= 0 ? 'Te betalen' : 'Te ontvangen'} inkomensafhankelijke bijdrage Zorgverzekeringswet${achter}`, bedrag: Math.abs(zvw), afsluiting: 'enkel' },
    { label: `${tot >= 0 ? 'Totaal te betalen bedrag' : 'Totaal te ontvangen bedrag'}${achter}`, bedrag: Math.abs(tot), afsluiting: 'dubbel' },
  ]
}

/** Variant van de parameters (zoals de twee voorstellen voor 2027): de gekozen variant, of de standaard in een jaar met varianten. */
export function rekenvariant(c: RapportContext): { label: string; status?: Status; bron?: string; anderen: string[] } | null {
  const varianten = c.P.varianten ?? []
  const gekozen = c.r.variant ? varianten.find((v) => v.id === c.r.variant) : undefined
  if (!c.r.variant && varianten.length === 0) return null
  const anderen = varianten.filter((v) => v !== gekozen).map((v) => v.label)
  if (!c.r.variant) return { label: 'Standaard (Belastingplan)', anderen }
  if (!gekozen) return { label: c.r.variant, anderen }
  return { label: gekozen.label, status: gekozen.status, ...(gekozen.bron ? { bron: `${gekozen.bron.titel} (${datumLang(gekozen.bron.datum)})` } : {}), anderen: ['Standaard (Belastingplan)', ...anderen] }
}

function verdelingTekst(c: RapportContext): string {
  const v = c.r.verdeling
  const deel = (x: number) => percentage(c.id === 'A' ? x : 1 - x, 'geheel')
  const delen = [`eigen woning ${deel(v.eigenWoning)}`, `box 3 ${deel(v.box3)}`, `persoonsgebonden aftrek ${deel(v.pga)}`, `dividendbelasting ${deel(v.dividendbelasting)}`]
  return `${delen.join(', ')} bij ${c.naam}${c.r.verdelingOptimaal ? ', door de tool gekozen voor de laagste gezamenlijke belasting' : ', zelf opgegeven'}.`
}

export function verantwoording(c: RapportContext): Verantwoording {
  const P = c.P
  const p = c.p

  // 1. Uitkomsten: de persoon zelf, daarna de partner en het huishouden.
  const lijst = uitkomsten(p, c.naam, false)
  if (c.partners && c.ander?.p) {
    lijst.push(...uitkomsten(c.ander.p, c.ander.naam, true))
    const huishouden = p.teBetalenIB + p.zvw.teBetalen + c.ander.p.teBetalenIB + c.ander.p.zvw.teBetalen
    lijst.push({ label: huishouden >= 0 ? 'Totaal te betalen huishouden' : 'Totaal te ontvangen huishouden', bedrag: Math.abs(huishouden), afsluiting: 'dubbel' })
  }

  // 3. Bron van de cijfers.
  const bronnen: Verantwoording['bronnen'] = []
  c.pi.ondernemingen.forEach((oi) => {
    const b = oi.bron
    bronnen.push({
      onderdeel: `Winst ${oi.naam}`,
      bron: b
        ? `Import uit Moneybird${b.administratieNaam ? ` (${b.administratieNaam})` : ''}, boekjaar ${b.jaar}, geïmporteerd op ${datumLang(b.geimporteerdOp.slice(0, 10))}`
        : 'Handmatig ingevoerd in het dossier',
    })
    if (oi.jaarrekening) {
      bronnen.push({ onderdeel: `Jaarrekening ${oi.naam}`, bron: oi.jaarrekening.bron === 'moneybird' ? 'Import uit Moneybird' : 'Handmatig ingevoerd in het dossier' })
    }
  })
  bronnen.push({ onderdeel: 'Overige gegevens (box 1, eigen woning, box 3, aftrekposten)', bron: 'Handmatig ingevoerd in het dossier' })
  if ((c.pi.inkomensvoorziening.historie ?? []).some((h) => h.jaarruimteOverride !== undefined)) {
    bronnen.push({ onderdeel: 'Jaarruimte eerdere jaren', bron: 'Opgegeven bedragen uit eerdere aangiftes; de berekening per jaar staat ter controle in de bijlage' })
  }

  // 4. Rekenparameters met status.
  const blokken: BlokNaam[] = ['box1', 'heffingskortingen']
  if (c.pi.ondernemingen.length > 0) blokken.push('ondernemer')
  if (toonLijfrente(c) || p.inkomensvoorziening.totaal !== 0) blokken.push('inkomensvoorziening')
  if (c.r.eigenWoning) blokken.push('eigenWoning')
  if (p.box2Inkomen !== 0) blokken.push('box2')
  if (toonBox3(c)) blokken.push('box3')
  blokken.push('zvw')
  if ((c.r.pga?.totaal ?? 0) > 0) blokken.push('pga')
  blokken.push('overig')
  const parameters: Verantwoording['parameters'] = blokken.map((naam) => {
    const bron = bronTekst(P, naam)
    return { blok: BLOK_LABEL[naam] ?? naam, status: blokStatus(P, naam), ...(bron ? { bron } : {}) }
  })
  const variant = rekenvariant(c)
  if (variant?.status) parameters.unshift({ blok: `Variant: ${variant.label}`, status: variant.status, ...(variant.bron ? { bron: variant.bron } : {}) })
  if (toonLijfrente(c)) {
    const jaren = p.inkomensvoorziening.tabel.map((t) => t.jaar).filter((j) => j !== c.jaar)
    const statussen = jaren.map((j) => lijfrenteStatusVoorJaar(j)).filter((s): s is Status => !!s)
    if (statussen.length > 0) parameters.push({ blok: `Lijfrenteregels eerdere jaren (${Math.min(...jaren)} tot en met ${Math.max(...jaren)})`, status: laagste(statussen) })
  }

  // 5. Methoden en keuzes.
  const methoden: Verantwoording['methoden'] = []
  if (variant) {
    const n = variant.anderen.length
    const anderen = n > 0 ? ` ${n > 1 ? 'Andere varianten' : 'Andere variant'}: ${variant.anderen.join(', ')}; ${n > 1 ? 'die geven' : 'die geeft'} andere bedragen.` : ''
    methoden.push({ label: 'Rekenvariant', waarde: `${variant.label}${variant.status ? ` (${variant.status})` : ''}.${anderen}` })
  }
  const regime = P.box3.waarde.regime
  if (toonBox3(c)) {
    methoden.push({
      label: 'Box 3',
      waarde:
        (potVan(c)?.gekozen ?? c.r.box3.gekozen) === 'werkelijk'
          ? 'Werkelijk rendement (tegenbewijs), omdat dat lager is dan het forfaitaire rendement.'
          : regime === 'forfaitair'
            ? 'Forfaitair rendement per vermogenscategorie (overbruggingswet).'
            : regime === 'schijven2017'
              ? 'Forfaitair rendement in schijven over de grondslag.'
              : 'Werkelijk rendement volgens het voorstel voor het nieuwe stelsel.',
    })
  }
  if (c.partners) methoden.push({ label: 'Verdeling gezamenlijke posten', waarde: verdelingTekst(c) })
  c.pi.ondernemingen.forEach((oi, k) => {
    const o = p.ondernemingen[k]
    if (!o) return
    methoden.push({
      label: `Urencriterium ${oi.naam}`,
      waarde: `${o.urencriteriumGehaald ? 'Gehaald' : 'Niet gehaald'}${oi.uren.urencriteriumGehaald !== undefined ? ' (zelf opgegeven)' : ` (${bedrag(oi.uren.onderneming)} uur)`}.`,
    })
    methoden.push({
      label: `Winstberekening ${oi.naam}`,
      waarde: oi.winstberekening.soort === 'saldo' ? 'Saldo van de fiscale winstberekening ingevoerd.' : 'Uitgesplitst in omzet, kosten en afschrijvingen.',
    })
  })
  if (c.pi.ondernemingen.some((oi) => oi.for)) {
    methoden.push({
      label: 'Fiscale oudedagsreserve',
      waarde: P.ondernemer.waarde.for.dotatie ? 'Toevoegen aan de oudedagsreserve is in dit jaar mogelijk.' : 'Toevoegen aan de oudedagsreserve kan in dit jaar niet; alleen afnemingen tellen mee.',
    })
  }
  methoden.push({ label: 'Afronding', waarde: "Hele euro's. Belasting en premie per schijf naar beneden afgerond; totalen komen uit de berekening." })

  // 6. Niet meegenomen en weggelaten.
  const o = P.overig.waarde
  {
    const personenA2 = [{ naam: c.naam, p }, ...(c.partners && c.ander?.p ? [{ naam: c.ander.naam, p: c.ander.p }] : [])]
    const metNaam = personenA2.length > 1
    const grensTekst = personenA2.map(({ naam, p: x }) => {
      const v = x.aanslag?.vervallenDoorGrens
      const wie = metNaam ? `${naam}: ` : ''
      if (!x.aanslag) return `${wie}niet bepaald.`
      if (v && v.soort === 'aanslaggrens') return `${wie}berekend ${euro(v.bedrag)} te betalen, onder de aanslaggrens van ${euro(o.aanslaggrens)}; wordt niet opgelegd.`
      if (v) return `${wie}berekend ${euro(v.bedrag)} terug, onder de teruggaafgrens van ${euro(o.teruggaafgrens)}; wordt niet uitbetaald.`
      return `${wie}de grens verandert niets (aanslaggrens ${euro(o.aanslaggrens)}, teruggaafgrens ${euro(o.teruggaafgrens)}).`
    })
    methoden.push({ label: 'Aanslag- en teruggaafgrens', waarde: grensTekst.join(' ') })
    const teBetalen = personenA2.reduce((s2, x) => s2 + (x.p.aanslag ? x.p.aanslag.teBetalen : Math.max(0, x.p.teBetalenIB)), 0)
    const vanaf = renteVanaf(c.jaar, P)
    if (teBetalen > 0) {
      const perMaand = rentePerMaand(teBetalen, vanaf, { params: P, tabel: BELASTINGRENTE_IB })
      methoden.push({
        label: 'Belastingrente',
        waarde: `Geen belastingrente bij aangifte vóór ${datumLang(geenRenteVoor(c.jaar, P))} als de aanslag gelijk is aan de aangifte. Komt de aanslag later, dan loopt er vanaf ${datumLang(vanaf)} ${pctA2(perMaand.pct, 1)} belastingrente over ${euro(teBetalen)}: ongeveer ${euro(perMaand.bedrag)} per maand.`,
      })
    } else {
      methoden.push({ label: 'Belastingrente', waarde: 'Niet van toepassing: er is niets bij te betalen.' })
    }
  }
  const controles = controlesVerantwoording(c.opties.controles)
  const nietMeegenomenA2: string[] = []
  {
    const ew = c.r.eigenWoning
    const reserve = (ew?.eigenwoningreserve ?? []).reduce((s2, t) => s2 + t.bedrag, 0)
    const box3Deel = (ew?.leningsplitsing ?? []).reduce((s2, x) => s2 + x.anderEind, 0)
    if (reserve > 0 && box3Deel > 0) nietMeegenomenA2.push(`De eigenwoningreserve (${euro(reserve)}) en het deel van de hypotheek in box 3 (${euro(box3Deel)}) staan niet uitgesplitst in dit rapport.`)
    else if (reserve > 0) nietMeegenomenA2.push(`De eigenwoningreserve (${euro(reserve)}) staat niet uitgesplitst in dit rapport.`)
    else if (box3Deel > 0) nietMeegenomenA2.push(`Het deel van de hypotheek in box 3 (${euro(box3Deel)}) staat niet uitgesplitst in dit rapport.`)
    if (p.box2Verlies) nietMeegenomenA2.push('Het box 2-verlies en de belastingkorting staan niet uitgesplitst in dit rapport.')
  }
  const regelingenA5 = nietMeegenomenA5(c)
  const regelingenA6 = nietMeegenomenRegelingenOnderneming(p)
  const nietMeegenomen = [
    'Toeslagen staan niet in dit rapport.',
    'Burgerservicenummers, rekeningnummers en polisnummers staan niet in dit rapport.',
    ...c.weggelaten,
    ...nietMeegenomenA2,
    ...regelingenA5,
    ...regelingenA6,
  ]

  // 7. Verschillen met de accountant.
  const verschillen: Verantwoording['verschillen'] = []
  if (c.opties.accountant) {
    const schoon = schoonAccountantRegels(c.opties.accountant)
    if ('regels' in schoon) {
      for (const r of accountantVergelijking(c.r, schoon.regels).regels) {
        if (r.persoon !== c.id || r.accountant === null) continue
        // Het verschil zelf staat al in een eigen kolom (PDF en Excel); een toelichting is alleen voor uitleg.
        verschillen.push({ label: r.label, accountant: r.accountant, berekend: r.engine })
      }
    }
  }

  // Meldingen: de waarschuwingen van de berekening (zonder toeslagen) en de controles van het rapport.
  const toeslagIds = new Set(c.r.toeslagen.waarschuwingen.map((w) => w.id))
  const gezien = new Set<string>()
  const meldingen: Verantwoording['meldingen'] = []
  for (const w of [...p.waarschuwingen, ...c.r.waarschuwingen.filter((x) => !toeslagIds.has(x.id))]) {
    if (gezien.has(w.id)) continue
    gezien.add(w.id)
    meldingen.push({ ernst: w.ernst, tekst: w.tekst })
  }
  meldingen.push(...c.meldingen)

  return {
    uitkomsten: lijst,
    statusZin: STATUS_ZIN,
    bronnen,
    parameters,
    methoden,
    nietMeegenomen,
    verschillen,
    meldingen,
    berekendOp: c.opties.vandaag,
    toolVersie: c.opties.toolVersie,
    ...(controles ? { controles } : {}),
  }
}
