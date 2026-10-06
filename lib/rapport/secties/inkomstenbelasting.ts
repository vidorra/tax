/**
 * Hoofdstuk 2 Inkomstenbelasting en premieheffing (spec 2.1 tot en met 2.3, koppeling hoofdstuk 4).
 *
 * Alle bedragen zijn die van de persoon zelf. De premieregels staan per stuk naar beneden afgerond (zoals in het
 * rapport van de accountant); het totaal komt uit de engine en kan daardoor 1 hoger zijn dan de som.
 */
import type { HeffingskortingSoort } from '@/lib/tax/types'
import type { Sectie } from '../model'
import { verzamelinkomenBox1 } from '../afleiden'
import { bedrag, percentage } from '../notatie'
import { groepskop, kk, post, sectie, subtotaal, tabel, totaal, uit, type MogelijkeRegel, type RapportContext } from './bouwstenen'

const KORTING_LABEL: Record<HeffingskortingSoort, string> = {
  algemeen: 'Algemene heffingskorting',
  arbeid: 'Arbeidskorting',
  iack: 'Inkomensafhankelijke combinatiekorting',
  ouderen: 'Ouderenkorting',
  jonggehandicapt: 'Jonggehandicaptenkorting',
  groenBeleggen: 'Korting groen beleggen',
}

const PREMIE_LABEL = { aow: 'Premie AOW', anw: 'Premie ANW', wlz: 'Premie WLZ' } as const

/** Box 1, 2 en 3 vóór persoonsgebonden aftrek (drempelinkomen) per box. */
function drempels(c: RapportContext) {
  const p = c.p
  return {
    box1: p.drempelinkomenBox1 ?? verzamelinkomenBox1(p) + (p.pgaToerekening?.box1 ?? 0),
    box2: p.drempelinkomenBox2 ?? p.box2Inkomen,
    box3: p.drempelinkomenBox3 ?? p.box3Inkomen,
  }
}

function paragraafInkomen(c: RapportContext): Sectie {
  const p = c.p
  const d = drempels(c)
  const pga = p.pgaToerekening ?? { box1: 0, box2: 0, box3: 0 }
  const metOnderneming = c.pi.ondernemingen.length > 0
  const metBox2 = d.box2 !== 0 || p.box2Inkomen !== 0
  const metBox3 = d.box3 > 0
  const vzBox1 = verzamelinkomenBox1(p)
  // Een negatief inkomen uit werk en woning telt als nul mee; de regel laat zien waar het verschil zit.
  const negatief = vzBox1 - (d.box1 - pga.box1)
  const P = '2.1'

  const regels: MogelijkeRegel[] = [
    metOnderneming && post(`${P}.belastbare-winst`, 'Belastbare winst uit onderneming', { B: p.belastbareWinst }, { herkomst: uit(c, 'belastbareWinst') }),
    p.loon !== 0 && post(`${P}.loon`, 'Loon en uitkeringen', { B: p.loon }, { herkomst: uit(c, 'loon') }),
    p.overigWerk !== 0 && post(`${P}.overig-werk`, 'Resultaat uit overige werkzaamheden', { B: p.overigWerk }, { herkomst: uit(c, 'overigWerk') }),
    p.periodiekeUitkeringen !== 0 &&
      post(`${P}.periodiek`, 'Periodieke uitkeringen en verstrekkingen', { B: p.periodiekeUitkeringen }, { herkomst: uit(c, 'periodiekeUitkeringen') }),
    p.reisaftrek !== 0 && post(`${P}.reisaftrek`, 'Reisaftrek', { B: -p.reisaftrek }, { herkomst: `-${uit(c, 'reisaftrek')}` }),
    c.r.eigenWoning && post(`${P}.eigen-woning`, 'Eigen woning', { B: p.eigenWoning }, { herkomst: uit(c, 'eigenWoning') }),
    p.inkomensvoorziening.totaal !== 0 &&
      post(`${P}.inkomensvoorziening`, 'Uitgaven voor inkomensvoorziening', { B: -p.inkomensvoorziening.totaal }, { herkomst: `-${uit(c, 'inkomensvoorziening.totaal')}` }),
    subtotaal(`${P}.drempel-box1`, 'Drempelinkomen uit werk en woning (box 1)', { C: d.box1 }, { streepBoven: ['B'], herkomst: uit(c, 'drempelinkomenBox1') }),
    metBox2 && post(`${P}.drempel-box2`, 'Drempelinkomen uit aanmerkelijk belang (box 2)', { C: d.box2 }, { herkomst: uit(c, 'drempelinkomenBox2') }),
    metBox3 && post(`${P}.drempel-box3`, 'Drempelinkomen uit sparen en beleggen (box 3)', { C: d.box3 }, { herkomst: uit(c, 'drempelinkomenBox3') }),
    totaal(`${P}.drempelinkomen`, 'Drempelinkomen', { C: d.box1 + (metBox2 ? d.box2 : 0) + (metBox3 ? d.box3 : 0) }, {
      herkomst: `${uit(c, 'drempelinkomenBox1')} + ${uit(c, 'drempelinkomenBox2')} + ${uit(c, 'drempelinkomenBox3')}`,
    }),

    post(`${P}.verzamel.drempel-box1`, 'Drempelinkomen uit werk en woning (box 1)', { B: d.box1 }, { witVoor: 1, herkomst: uit(c, 'drempelinkomenBox1') }),
    pga.box1 !== 0 && post(`${P}.verzamel.pga-box1`, 'Persoonsgebonden aftrek', { B: -pga.box1 }, { herkomst: `-${uit(c, 'pgaToerekening.box1')}` }),
    negatief !== 0 &&
      post(`${P}.verzamel.negatief`, 'Negatief inkomen uit werk en woning (telt niet mee in het verzamelinkomen)', { B: negatief }, {
        herkomst: `verzamelinkomen box 1 - (${uit(c, 'drempelinkomenBox1')} - ${uit(c, 'pgaToerekening.box1')})`,
      }),
    subtotaal(`${P}.verzamel-box1`, 'Verzamelinkomen uit werk en woning (box 1)', { C: vzBox1 }, {
      streepBoven: ['B'],
      herkomst: `${uit(c, 'verzamelinkomen')} - ${uit(c, 'box2Inkomen')} - ${uit(c, 'box3Inkomen')}`,
    }),
    ...(metBox2
      ? [
          post(`${P}.verzamel.drempel-box2`, 'Drempelinkomen uit aanmerkelijk belang (box 2)', { B: d.box2 }, { herkomst: uit(c, 'drempelinkomenBox2') }),
          pga.box2 !== 0 && post(`${P}.verzamel.pga-box2`, 'Persoonsgebonden aftrek', { B: -pga.box2 }, { herkomst: `-${uit(c, 'pgaToerekening.box2')}` }),
          subtotaal(`${P}.verzamel-box2`, 'Verzamelinkomen uit aanmerkelijk belang (box 2)', { C: p.box2Inkomen }, { streepBoven: ['B'], herkomst: uit(c, 'box2Inkomen') }),
        ]
      : []),
    ...(metBox3
      ? [
          post(`${P}.verzamel.drempel-box3`, 'Drempelinkomen uit sparen en beleggen (box 3)', { B: d.box3 }, { herkomst: uit(c, 'drempelinkomenBox3') }),
          pga.box3 !== 0 && post(`${P}.verzamel.pga-box3`, 'Persoonsgebonden aftrek', { B: -pga.box3 }, { herkomst: `-${uit(c, 'pgaToerekening.box3')}` }),
          subtotaal(`${P}.verzamel-box3`, 'Verzamelinkomen uit sparen en beleggen (box 3)', { C: p.box3Inkomen }, { streepBoven: ['B'], herkomst: uit(c, 'box3Inkomen') }),
        ]
      : []),
    totaal(`${P}.verzamelinkomen`, 'Verzamelinkomen', { C: p.verzamelinkomen }, { herkomst: uit(c, 'verzamelinkomen') }),

    post(`${P}.belastbaar.verzamel-box1`, 'Verzamelinkomen uit werk en woning (box 1)', { B: vzBox1 }, {
      witVoor: 1,
      herkomst: `${uit(c, 'verzamelinkomen')} - ${uit(c, 'box2Inkomen')} - ${uit(c, 'box3Inkomen')}`,
    }),
    p.verliesverrekening !== 0 &&
      post(`${P}.belastbaar.verliesverrekening`, 'Verrekening van verliezen uit eerdere jaren', { B: -p.verliesverrekening }, { herkomst: `-${uit(c, 'verliesverrekening')}` }),
    subtotaal(`${P}.belastbaar-box1`, 'Belastbaar inkomen uit werk en woning (box 1)', { C: p.box1.inkomen }, { streepBoven: ['B'], herkomst: uit(c, 'box1.inkomen') }),
    ...(metBox2
      ? [
          post(`${P}.belastbaar.verzamel-box2`, 'Verzamelinkomen uit aanmerkelijk belang (box 2)', { B: p.box2Inkomen }, { herkomst: uit(c, 'box2Inkomen') }),
          subtotaal(`${P}.belastbaar-box2`, 'Belastbaar inkomen uit aanmerkelijk belang (box 2)', { C: p.box2Inkomen }, { streepBoven: ['B'], herkomst: uit(c, 'box2Inkomen') }),
        ]
      : []),
    ...(metBox3
      ? [
          post(`${P}.belastbaar.verzamel-box3`, 'Verzamelinkomen uit sparen en beleggen (box 3)', { B: p.box3Inkomen }, { herkomst: uit(c, 'box3Inkomen') }),
          subtotaal(`${P}.belastbaar-box3`, 'Belastbaar inkomen uit sparen en beleggen (box 3)', { C: p.box3Inkomen }, { streepBoven: ['B'], herkomst: uit(c, 'box3Inkomen') }),
        ]
      : []),
    totaal(`${P}.totaal-belastbaar`, 'Totaal belastbaar inkomen', { C: p.box1.inkomen + p.box2Inkomen + p.box3Inkomen }, {
      herkomst: `${uit(c, 'box1.inkomen')} + ${uit(c, 'box2Inkomen')} + ${uit(c, 'box3Inkomen')}`,
    }),
  ]
  return sectie('Drempel-/ verzamel-/ belastbaar inkomen', 2, [tabel(regels)])
}

function paragraafBerekening(c: RapportContext): Sectie {
  const p = c.p
  const b1 = p.box1
  const P1 = '2.2.1'
  const box3Bruto = p.box3BelastingVoorVerrekening ?? p.box3Belasting
  const box3Bron = p.box3Bronbelasting ?? 0
  const metBox3 = p.box3Inkomen > 0 || p.box3Belasting !== 0
  const metBox2 = p.box2Inkomen !== 0 || p.box2Belasting !== 0
  const premieInkomen = b1.premieInkomen ?? 0
  const berekend = b1.totaal + p.box2Belasting + p.box3Belasting

  const verschuldigd = sectie('Verschuldigde inkomstenbelasting en premie volksverzekeringen', 3, [
    tabel([
      groepskop(`${P1}.box1`, 'Verschuldigde belasting (box 1)'),
      ...b1.schijven.map(
        (s, i) =>
          s.over > 0 &&
          post(`${P1}.schijf-${i + 1}`, `Belasting ${i + 1}e schijf: ${percentage(s.tarief)} over ${bedrag(s.over)}`, { B: s.belasting }, { herkomst: uit(c, `box1.schijven[${i}].belasting`) }),
      ),
      b1.tariefmaatregel > 0 &&
        post(
          `${P1}.tariefmaatregel`,
          `Beperking tarief aftrekbare bedragen: ${percentage(b1.tariefmaatregelPct ?? 0)} over ${bedrag(b1.tariefmaatregelGrondslag ?? 0)}`,
          { B: b1.tariefmaatregel },
          { herkomst: uit(c, 'box1.tariefmaatregel') },
        ),
      subtotaal(`${P1}.box1-totaal`, 'Totaal box 1 belasting', { C: b1.belasting }, { streepBoven: ['B'], herkomst: uit(c, 'box1.belasting') }),

      groepskop(`${P1}.premie`, 'Verschuldigde premie volksverzekeringen (box 1)', { witVoor: 1 }),
      post(`${P1}.premie-inkomen`, 'Premie-inkomen', { A: premieInkomen }, { dubbelOnder: ['A'], herkomst: uit(c, 'box1.premieInkomen') }),
      ...(b1.premieRegels ?? []).map((r, i) =>
        post(`${P1}.premie-${r.soort}`, `${PREMIE_LABEL[r.soort]}: ${percentage(r.pct)} over ${bedrag(premieInkomen)}`, { B: r.bedrag }, { herkomst: uit(c, `box1.premieRegels[${i}].bedrag`) }),
      ),
      subtotaal(`${P1}.premie-totaal`, 'Totaal premie volksverzekeringen', { C: b1.premie }, { streepBoven: ['B'], herkomst: uit(c, 'box1.premie') }),

      ...(metBox2
        ? [
            groepskop(`${P1}.box2`, 'Verschuldigde belasting (box 2)', { witVoor: 1 }),
            post(`${P1}.box2-belasting`, `Belasting aanmerkelijk belang over ${bedrag(p.box2Inkomen)}`, { B: p.box2Belasting }, { herkomst: uit(c, 'box2Belasting') }),
            subtotaal(`${P1}.box2-totaal`, 'Totaal box 2 belasting', { C: p.box2Belasting }, { streepBoven: ['B'], herkomst: uit(c, 'box2Belasting') }),
          ]
        : []),

      ...(metBox3
        ? [
            groepskop(`${P1}.box3`, 'Verschuldigde belasting (box 3)', { witVoor: 1 }),
            post(`${P1}.box3-belasting`, `Box 3 belasting: ${percentage(c.P.box3.waarde.tarief)} over ${bedrag(p.box3Inkomen)}`, { B: box3Bruto }, {
              herkomst: uit(c, 'box3BelastingVoorVerrekening'),
            }),
            box3Bron !== 0 &&
              post(`${P1}.box3-bronbelasting`, 'Verrekening van buitenlandse bronbelasting box 3', { B: -box3Bron }, { herkomst: `-${uit(c, 'box3Bronbelasting')}` }),
            subtotaal(`${P1}.box3-totaal`, 'Totaal box 3 belasting', { C: p.box3Belasting }, { streepBoven: ['B'], herkomst: uit(c, 'box3Belasting') }),
          ]
        : []),
      subtotaal(`${P1}.berekend`, 'Berekende inkomstenbelasting en premie volksverzekeringen', { C: berekend }, {
        witVoor: 1,
        streepBoven: ['C'],
        herkomst: `${uit(c, 'box1.totaal')} + ${uit(c, 'box2Belasting')} + ${uit(c, 'box3Belasting')}`,
      }),
    ]),
  ])

  const hk = p.heffingskortingen
  const P2 = '2.2.2'
  const delen = hk.delen ?? []
  const kortingRegels = delen
    .filter((d) => d.soort === 'algemeen' || d.soort === 'arbeid' || d.totaal !== 0)
    .map((d) =>
      post(`${P2}.${d.soort}`, KORTING_LABEL[d.soort], { Z: d.belastingdeel, A: d.premiedeel, B: d.totaal }, { herkomst: uit(c, `heffingskortingen.${d.soort}`) }),
    )
  const kortingen = sectie('Heffingskortingen', 3, [
    tabel(
      [
        ...kortingRegels,
        hk.nietVerzilverd > 0 &&
          post(`${P2}.niet-verzilverd`, 'Niet te verrekenen deel (hoger dan de belasting en premie)', { B: -hk.nietVerzilverd }, { herkomst: `-${uit(c, 'heffingskortingen.nietVerzilverd')}` }),
        subtotaal(`${P2}.maximaal`, 'Maximaal toepasbare heffingskortingen', { C: -hk.verzilverd }, { streepBoven: ['B'], herkomst: `-${uit(c, 'heffingskortingen.verzilverd')}` }),
        subtotaal(`${P2}.verschuldigd`, 'Verschuldigde belasting', { C: p.verschuldigdIB }, { witVoor: 1, streepBoven: ['C'], herkomst: uit(c, 'verschuldigdIB') }),
      ],
      { koppen: [kk('Z', 'Belastingdeel'), kk('A', 'Premiedeel')] },
    ),
  ])

  const vh = p.voorheffingenDetail ?? { loonheffing: 0, dividendbelastingBox3: p.voorheffingen, dividendbelastingBox2: 0 }
  const P3 = '2.2.3'
  const voorheffingen = sectie('Voorheffingen', 3, [
    tabel([
      vh.loonheffing !== 0 && post(`${P3}.loonheffing`, 'Ingehouden loonheffing', { B: vh.loonheffing }, { herkomst: uit(c, 'voorheffingenDetail.loonheffing') }),
      post(`${P3}.dividendbelasting`, 'Dividendbelasting', { B: vh.dividendbelastingBox3 }, { herkomst: uit(c, 'voorheffingenDetail.dividendbelastingBox3') }),
      vh.dividendbelastingBox2 !== 0 &&
        post(`${P3}.dividendbelasting-box2`, 'Dividendbelasting aanmerkelijk belang', { B: vh.dividendbelastingBox2 }, { herkomst: uit(c, 'voorheffingenDetail.dividendbelastingBox2') }),
      subtotaal(`${P3}.voorheffingen`, 'Voorheffingen', { C: -p.voorheffingen }, { streepBoven: ['B'], herkomst: `-${uit(c, 'voorheffingen')}` }),
      subtotaal(`${P3}.subtotaal`, 'Subtotaal verschuldigde belastingen minus voorheffingen', { C: p.verschuldigdIB - p.voorheffingen }, {
        witVoor: 1,
        streepBoven: ['C'],
        herkomst: `${uit(c, 'verschuldigdIB')} - ${uit(c, 'voorheffingen')}`,
      }),
    ]),
  ])

  const P4 = '2.2.4'
  const aanslagen = sectie('Voorlopige aanslagen en teruggaven', 3, [
    tabel([
      post(`${P4}.betaald`, 'Betaald bedrag', { C: -p.voorlopigeAanslag }, { herkomst: `-${uit(c, 'voorlopigeAanslag')}` }),
      totaal(`${P4}.te-betalen`, p.teBetalenIB >= 0 ? 'Te betalen inkomstenbelasting' : 'Te ontvangen inkomstenbelasting', { C: p.teBetalenIB }, {
        witVoor: 1,
        herkomst: uit(c, 'teBetalenIB'),
      }),
    ]),
  ])

  return sectie('Belastingberekening', 2, [], [verschuldigd, kortingen, voorheffingen, aanslagen], { bijElkaar: true })
}

function paragraafZvw(c: RapportContext): Sectie | null {
  const z = c.p.zvw
  const inkomen = z.inkomenVoorMaximum ?? z.bijdrageInkomen
  if (z.bijdrage === 0 && z.voorlopig === 0 && inkomen === 0) {
    c.weggelaten.push('Zorgverzekeringswet: weggelaten, er is geen inkomen waarover je zelf de bijdrage betaalt.')
    return null
  }
  const p = c.p
  const zp = c.P.zvw.waarde
  const loon = z.loonMetIngehoudenBijdrage ?? 0
  const ruimte = Math.max(0, zp.maxBijdrageInkomen - loon)
  const P = '2.3'
  return sectie('Zorgverzekeringswet (Zvw)', 2, [
    tabel([
      groepskop(`${P}.bijdrage-inkomen.kop`, 'Bijdrage-inkomen'),
      c.pi.ondernemingen.length > 0 && post(`${P}.belastbare-winst`, 'Belastbare winst', { B: p.belastbareWinst }, { herkomst: uit(c, 'belastbareWinst') }),
      p.overigWerk !== 0 && post(`${P}.overig-werk`, 'Resultaat uit overige werkzaamheden', { B: p.overigWerk }, { herkomst: uit(c, 'overigWerk') }),
      p.periodiekeUitkeringen !== 0 &&
        post(`${P}.periodiek`, 'Periodieke uitkeringen en verstrekkingen', { B: p.periodiekeUitkeringen }, { herkomst: uit(c, 'periodiekeUitkeringen') }),
      subtotaal(`${P}.bijdrage-inkomen`, 'Bijdrage-inkomen', { C: inkomen }, { streepBoven: ['B'], herkomst: uit(c, 'zvw.inkomenVoorMaximum') }),
      subtotaal(
        `${P}.nog-niet-afgedragen`,
        loon > 0
          ? `Inkomen waarover nog geen Zvw-bijdrage is afgedragen (max. € ${bedrag(ruimte)}, na loon waarover al bijdrage is ingehouden)`
          : `Inkomen waarover nog geen Zvw-bijdrage is afgedragen (max. € ${bedrag(zp.maxBijdrageInkomen)})`,
        { C: z.bijdrageInkomen },
        { streepBoven: ['C'], herkomst: uit(c, 'zvw.bijdrageInkomen') },
      ),
      totaal(`${P}.bijdrage-inkomen-zvw`, 'Bijdrage-inkomen Zvw (min. 0)', { C: z.bijdrageInkomen }, { herkomst: uit(c, 'zvw.bijdrageInkomen') }),
      groepskop(`${P}.aanslag.kop`, 'Berekening aanslag', { witVoor: 2 }),
      post(`${P}.bijdrage`, `Af te dragen inkomensafhankelijke bijdrage ZVW: ${percentage(zp.pctOndernemer)} over ${bedrag(z.bijdrageInkomen)}`, { C: z.bijdrage }, {
        herkomst: uit(c, 'zvw.bijdrage'),
      }),
      post(`${P}.voorlopig`, 'Voorlopige aanslagen', { C: -z.voorlopig }, { herkomst: `-${uit(c, 'zvw.voorlopig')}` }),
      totaal(
        `${P}.te-betalen`,
        z.teBetalen >= 0 ? 'Te betalen inkomensafhankelijke bijdrage Zorgverzekeringswet' : 'Te ontvangen inkomensafhankelijke bijdrage Zorgverzekeringswet',
        { C: z.teBetalen },
        { herkomst: uit(c, 'zvw.teBetalen') },
      ),
    ]),
  ], [], { bijElkaar: true })
}

export function hoofdstukInkomstenbelasting(c: RapportContext): Sectie {
  return sectie('Inkomstenbelasting en premieheffing', 1, [], [paragraafInkomen(c), paragraafBerekening(c), paragraafZvw(c)], { nieuwePagina: true })
}
