/**
 * Box 3 stelsel werkelijk rendement (regime 'werkelijkRendement', beoogd vanaf 2028).
 * Wetsvoorstel Wet werkelijk rendement box 3 (36748) met de novelle van 29 september 2026: VOORSTEL.
 *
 * Per positie de methode van zijn klasse (`box3.regime2028.perCategorie`):
 *  - werkelijkRendement: alleen de directe opbrengsten (voor banktegoeden: de ontvangen rente);
 *  - vermogensaanwas: waarde einde − waarde begin − stortingen + onttrekkingen + directe opbrengsten;
 *  - vermogenswinst: directe opbrengsten + gerealiseerde winst bij verkoop. Een positie geldt als verkocht
 *    als de waarde einde 0 is en er onttrokken is; winst = onttrekkingen (verkoopopbrengst) − aanschafwaarde.
 * Betaalde rente op schulden is aftrekbaar. Heffingsvrij resultaat per persoon; resultaat per persoon
 * volgens aandeelA; belasting = AFRONDING.box3Belasting(tarief × voordeel) − verrekenbare bronbelasting.
 *
 * Indeling: bank = bankNL, bankBuitenland, contant; financieel instrument = beleggingen, groen, vorderingen,
 * overig (en nettolijfrente als die niet is vrijgesteld); crypto; onroerend.
 */
import type { Box3Categorie, Box3Invoer, Uitlegregel, VermogensPositie, Waarschuwing } from '../../types'
import { AFRONDING } from '../../rounding'
import { eur, euro, pct, regel, waarschuwing } from '../../uitleg'
import {
  aantalPersonen,
  belastingPerPersoon,
  bronbelastingVelden,
  controleWaarschuwingen,
  inPot,
  isPartnerPot,
  leegPP,
  verdeel,
  type Box3Context,
  type Box3ResultaatUitgebreid,
} from './forfaitair'

const DAGEN_PER_JAAR = 365

type Klasse = 'bank' | 'financieelInstrument' | 'crypto' | 'onroerend'
type Methode = 'werkelijkRendement' | 'vermogenswinst' | 'vermogensaanwas'

export const KLASSE_VAN: Record<Box3Categorie, Klasse> = {
  bankNL: 'bank',
  bankBuitenland: 'bank',
  contant: 'bank',
  groen: 'financieelInstrument',
  beleggingen: 'financieelInstrument',
  vorderingen: 'financieelInstrument',
  overig: 'financieelInstrument',
  nettolijfrente: 'financieelInstrument',
  crypto: 'crypto',
  onroerend: 'onroerend',
}

const METHODE_LABEL: Record<Methode, string> = {
  werkelijkRendement: 'werkelijk rendement',
  vermogenswinst: 'vermogenswinst bij verkoop',
  vermogensaanwas: 'vermogensaanwas',
}

export function resultaatPositie(
  x: VermogensPositie,
  methode: Methode,
): { bedrag: number; formule: string; waarschuwing?: string } {
  const opbrengst = x.directeOpbrengsten ?? 0
  const stortingen = x.stortingen ?? 0
  const onttrekkingen = x.onttrekkingen ?? 0
  const eind = x.waardeEind ?? x.waardeBegin
  if (methode === 'werkelijkRendement') {
    return { bedrag: opbrengst, formule: `opbrengst ${eur(opbrengst)}` }
  }
  if (methode === 'vermogensaanwas') {
    return {
      bedrag: eind - x.waardeBegin - stortingen + onttrekkingen + opbrengst,
      formule: `${eur(eind)} − ${eur(x.waardeBegin)} − ${eur(stortingen)} + ${eur(onttrekkingen)} + ${eur(opbrengst)}`,
      waarschuwing: x.waardeEind === undefined ? `${x.omschrijving}: waarde einde ontbreekt, als ongewijzigd gerekend.` : undefined,
    }
  }
  const verkocht = x.waardeEind === 0 && onttrekkingen > 0
  if (!verkocht) {
    return {
      bedrag: opbrengst,
      formule: `opbrengst ${eur(opbrengst)}, niet verkocht`,
      waarschuwing:
        onttrekkingen > 0 && eind > 0 ? `${x.omschrijving}: er is gedeeltelijk verkocht. Gedeeltelijke verkoop wordt nog niet doorgerekend; vul de gerealiseerde winst bij de opbrengsten in.` : undefined,
    }
  }
  const aanschaf = x.aanschafwaarde ?? x.waardeBegin
  return {
    bedrag: opbrengst + onttrekkingen - aanschaf,
    formule: `${eur(opbrengst)} + verkoop ${eur(onttrekkingen)} − aanschafwaarde ${eur(aanschaf)}`,
    waarschuwing: x.aanschafwaarde === undefined ? `${x.omschrijving}: aanschafwaarde ontbreekt; de waarde op 1 januari is gebruikt.` : undefined,
  }
}

export function berekenRegime2028(invoer: Box3Invoer, ctx: Box3Context): Box3ResultaatUitgebreid {
  const b = ctx.params.box3.waarde
  const n = aantalPersonen(ctx)
  const uitleg: Uitlegregel[] = []
  const waarschuwingen: Waarschuwing[] = []
  const r = b.regime2028
  const status = 'voorstel' as const

  waarschuwingen.push(
    waarschuwing('box3-2028-voorstel', 'let-op', 'Box 3 is hier berekend volgens het wetsvoorstel werkelijk rendement. Dat voorstel is nog niet aangenomen; uitkomsten kunnen veranderen.'),
  )

  const posities = invoer.posities.filter((x) => inPot(x.eigenaar, ctx))
  const schulden = invoer.schulden.filter((x) => inPot(x.eigenaar, ctx))
  const leeg = leegPP()

  if (!r) {
    waarschuwingen.push(waarschuwing('box3-2028-ontbreekt', 'actie', 'De parameters van het nieuwe box 3-stelsel ontbreken voor dit jaar; box 3 is op nul gezet.'))
    return {
      bezittingen: 0,
      aftrekbareSchulden: 0,
      rendementsgrondslag: 0,
      grondslag: 0,
      forfaitairRendement: 0,
      effectiefPct: 0,
      werkelijkRendement: null,
      gekozen: 'nvt',
      voordeel: leeg,
      belasting: leegPP(),
      bronbelasting: leegPP(),
      dividendbelasting: 0,
      vermogenToeslagen: 0,
      groenVrijgesteld: leegPP(),
      voordeelForfaitair: leegPP(),
      rendementRegels: [],
      uitleg,
      waarschuwingen,
    }
  }

  const groenTotaal = posities.filter((x) => x.categorie === 'groen').reduce((s, x) => s + Math.max(0, x.waardeBegin), 0)
  const groenVrij = Math.min(groenTotaal, b.vrijstellingen.groen * n)
  const groenFactor = groenTotaal > 0 ? (groenTotaal - groenVrij) / groenTotaal : 1

  let totaal = 0
  let bezittingen = 0
  let dividendbelasting = 0
  let vermogenToeslagen = 0
  for (const x of posities) {
    vermogenToeslagen += x.waardeBegin
    dividendbelasting += Math.max(0, x.dividendbelasting ?? 0)
    if (x.categorie === 'nettolijfrente' && b.vrijstellingen.nettolijfrente) continue
    const factor = x.categorie === 'groen' ? groenFactor : 1
    if (factor === 0) continue
    bezittingen += x.waardeBegin * factor
    const klasse = KLASSE_VAN[x.categorie]
    const methode = r.perCategorie[klasse]
    const res = resultaatPositie(x, methode)
    let bedrag = res.bedrag * factor
    if (x.categorie === 'onroerend' && x.woz?.dagenEigenGebruik && b.tegenbewijs.eigenGebruikPct > 0) {
      bedrag += (b.tegenbewijs.eigenGebruikPct * x.woz.begin * x.woz.dagenEigenGebruik) / DAGEN_PER_JAAR
    }
    totaal += bedrag
    if (res.waarschuwing) waarschuwingen.push(waarschuwing(`box3-2028-${x.id}`, 'let-op', res.waarschuwing))
    uitleg.push(
      regel(`box3-2028-${x.id}`, `${x.omschrijving} (${METHODE_LABEL[methode]})`, AFRONDING.box3Voordeel(bedrag), bedrag < 0 ? 'min' : 'plus', {
        niveau: 2,
        formule: factor < 1 ? `(${res.formule}) × ${pct(factor)} belast deel` : res.formule,
        parameter: `box3.regime2028.perCategorie.${klasse}`,
        status,
      }),
    )
  }
  const schuldTotaal = schulden.reduce((s, x) => s + Math.max(0, x.waardeBegin), 0)
  vermogenToeslagen -= schuldTotaal
  const rente = schulden.reduce((s, x) => s + Math.max(0, x.betaaldeRente ?? 0), 0)
  if (rente > 0) {
    totaal -= rente
    uitleg.push(regel('box3-2028-rente', 'Betaalde rente op schulden', rente, 'min', { niveau: 2, status }))
  }

  const resultaat = AFRONDING.box3Voordeel(totaal)
  uitleg.push(regel('box3-2028-resultaat', 'Resultaat uit sparen en beleggen', resultaat, 'subtotaal', { niveau: 1, status }))

  const heffingsvrij = r.heffingsvrijResultaat * n
  const belastbaar = Math.max(0, resultaat - heffingsvrij)
  uitleg.push(
    regel('box3-2028-heffingsvrij', 'Heffingsvrij resultaat', Math.min(heffingsvrij, Math.max(0, resultaat)), 'min', {
      formule: `${eur(r.heffingsvrijResultaat)} × ${n}`,
      parameter: 'box3.regime2028.heffingsvrijResultaat',
      status,
    }),
  )
  uitleg.push(regel('box3-2028-belastbaar', 'Belastbaar resultaat', belastbaar, 'subtotaal', { niveau: 0, status }))

  if (resultaat < 0) {
    const verrekenbaar = Math.max(0, -resultaat - r.verliesdrempel)
    waarschuwingen.push(
      waarschuwing(
        'box3-2028-verlies',
        'info',
        verrekenbaar > 0
          ? `Er is een verlies van ${euro(-resultaat)}. Het deel boven de verliesdrempel van ${euro(r.verliesdrempel)} (${euro(verrekenbaar)}) kun je volgens het voorstel verrekenen met latere jaren.`
          : `Er is een verlies van ${euro(-resultaat)}, maar dat blijft onder de verliesdrempel van ${euro(r.verliesdrempel)} en is niet verrekenbaar.`,
      ),
    )
  }

  const deel = verdeel(belastbaar, ctx)
  const voordeel = leegPP()
  for (const id of ctx.personen) {
    voordeel[id] = AFRONDING.box3Voordeel(deel[id])
  }
  if (isPartnerPot(ctx)) voordeel.B = belastbaar - voordeel.A

  const bel = belastingPerPersoon(voordeel, posities, ctx, b.tarief)
  uitleg.push(...bel.uitleg.map((u) => ({ ...u, status })))
  waarschuwingen.push(...bel.waarschuwingen, ...controleWaarschuwingen(posities, ctx))

  return {
    bezittingen: AFRONDING.box3Bezitting(bezittingen),
    aftrekbareSchulden: schuldTotaal,
    rendementsgrondslag: AFRONDING.box3Bezitting(bezittingen) - schuldTotaal,
    grondslag: belastbaar,
    forfaitairRendement: 0,
    effectiefPct: 0,
    werkelijkRendement: resultaat,
    gekozen: 'werkelijk',
    voordeel,
    belasting: bel.belasting,
    bronbelasting: bel.bronbelasting,
    ...bronbelastingVelden(bel),
    dividendbelasting,
    vermogenToeslagen,
    groenVrijgesteld: verdeel(groenVrij, ctx),
    voordeelForfaitair: leegPP(),
    rendementRegels: [],
    uitleg,
    waarschuwingen,
  }
}
