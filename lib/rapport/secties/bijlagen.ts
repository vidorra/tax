/**
 * Hoofdstuk 4 Bijlagen (spec 4.1 tot en met 4.4, koppeling hoofdstuk 6): jaar- en reserveringsruimte per jaar,
 * dividendbelasting, de beperking van het tarief van aftrekposten en de voorkoming van dubbele belasting.
 */
import type { JaarruimteJaar } from '@/lib/tax/types'
import type { Blok, Sectie, TabelBlok } from '../model'
import { bedrag, euro, percentage } from '../notatie'
import { groepskop, kk, kopTekst, post, sectie, som, subtotaal, tabel, uit, type MogelijkeRegel, type RapportContext } from './bouwstenen'
import { potPad, potVan, toonLijfrente } from './belastbaar-inkomen'
import { bronbelastingBijlage } from './bronbelasting'

const JAARRUIMTE_KOP = 'Jaar-/reserveringsruimteberekening'

type TabelRij = RapportContext['p']['inkomensvoorziening']['tabel'][number]

function jaarblok(c: RapportContext, t: TabelRij, j: JaarruimteJaar | undefined, i: number, eerste: boolean): TabelBlok {
  const P = `4.1.1.${t.jaar}`
  const iv = `inkomensvoorziening`
  const isJaarZelf = t.jaar === c.jaar
  const b = j?.berekening
  const volledig = !!j && !!b && (isJaarZelf || j.inkomen > 0 || j.forToename > 0)
  const kop = groepskop(`${P}.jaar`, String(t.jaar), eerste ? {} : { witVoor: 2 })
  const slot: MogelijkeRegel[] = [
    post(`${P}.dit-jaar`, 'Dit jaar aftrekbare lijfrentepremies', { B: -t.ditJaarBenut }, { herkomst: `-${uit(c, `${iv}.tabel[${i}].ditJaarBenut`)}` }),
    subtotaal(`${P}.openstaand`, 'Openstaande jaar-/reserveringsruimte', { C: t.resterend }, { vet: 'regel', streepBoven: ['B'], herkomst: uit(c, `${iv}.tabel[${i}].resterend`) }),
  ]
  if (!volledig || !j || !b) {
    return tabel([kop, post(`${P}.reservering`, 'Reserveringsruimte', { B: t.nietBenutBegin }, { herkomst: uit(c, `${iv}.tabel[${i}].nietBenutBegin`) }), ...slot], {
      raster: 'lijfrente',
      herhaalKop: JAARRUIMTE_KOP,
      bijElkaar: true,
    })
  }
  const pad = (veld: string) => uit(c, `${iv}.jaarruimteBerekeningen[${i}].${veld}`)
  const voorCorrecties = b.verrekenbaar - b.pensioencorrectie - j.forToename
  const beperking = b.jaarruimte - voorCorrecties
  const opgegevenVerschil = j.jaarruimteOpgegeven !== undefined ? j.jaarruimteOpgegeven - b.jaarruimte : 0
  if (opgegevenVerschil !== 0) {
    c.meldingen.push({
      ernst: 'let-op',
      tekst: `Lijfrente ${t.jaar}: de opgegeven jaarruimte (${euro(j.jaarruimteOpgegeven ?? 0)}) wijkt af van de berekende (${euro(b.jaarruimte)}). Gerekend is met de opgegeven jaarruimte.`,
    })
  }
  const alGebruikt = Math.min(j.alGebruikt, j.jaarruimte)
  return tabel(
    [
      kop,
      post(`${P}.inkomen`, `Inkomsten in ${t.jaar - 1}`, { A: j.inkomen }, { herkomst: pad('inkomen') }),
      j.forToename > 0 && post(`${P}.for`, 'Toename van de opgebouwde oudedagsreserve', { A: j.forToename }, { herkomst: pad('forToename') }),
      post(`${P}.kosten`, 'Aftrekbare kosten', { A: 0 }, { herkomst: 'vast: 0 (geen invoerveld)' }),
      subtotaal(`${P}.som`, undefined, { A: j.inkomen + j.forToename }, { streepBoven: ['A'], herkomst: `${pad('inkomen')} + ${pad('forToename')}` }),
      b.afgetopt && post(`${P}.maximum`, 'Maximaal in aanmerking te nemen inkomen', { A: b.inkomensgrens }, { witVoor: 1, herkomst: pad('berekening.inkomensgrens') }),
      // Spec 4.1.1: de witregel staat alleen voor 'Maximaal in aanmerking te nemen inkomen'; de franchise volgt direct op de som.
      post(`${P}.franchise`, 'AOW-franchise', { A: -b.franchise }, { herkomst: `-${pad('berekening.franchise')}` }),
      subtotaal(`${P}.premiegrondslag`, 'Premiegrondslag', { A: b.premiegrondslag }, { streepBoven: ['A'], dubbelOnder: ['A'], herkomst: pad('berekening.premiegrondslag') }),
      post(`${P}.verrekenbaar`, 'Verrekenbare premiegrondslag', { B: b.verrekenbaar }, { herkomst: pad('berekening.verrekenbaar') }),
      b.pensioencorrectie > 0 && post(`${P}.pensioencorrectie`, 'Pensioenaangroei in het voorgaande jaar', { B: -b.pensioencorrectie }, { herkomst: `-${pad('berekening.pensioencorrectie')}` }),
      j.forToename > 0 &&
        post(`${P}.for-correctie`, 'Toename van de opgebouwde oudedagsreserve in voorgaand jaar min de verplichte afname', { B: -j.forToename }, { herkomst: `-${pad('forToename')}` }),
      beperking !== 0 &&
        post(`${P}.beperking`, beperking < 0 ? 'Beperking tot de maximale jaarruimte' : 'Jaarruimte kan niet negatief zijn', { B: beperking }, {
          herkomst: `${pad('berekening.jaarruimte')} - (verrekenbaar - pensioencorrectie - forToename)`,
        }),
      opgegevenVerschil !== 0 && post(`${P}.opgegeven`, 'Correctie naar de opgegeven jaarruimte', { B: opgegevenVerschil }, { herkomst: `${pad('jaarruimteOpgegeven')} - ${pad('berekening.jaarruimte')}` }),
      !isJaarZelf &&
        alGebruikt > 0 &&
        post(`${P}.al-gebruikt`, 'Totaal afgetrokken lijfrentepremies als jaarruimte of als niet gebruikte jaarruimte', { B: -alGebruikt }, { herkomst: `-${pad('alGebruikt')}` }),
      subtotaal(`${P}.jaarruimte`, 'Jaarruimte', { B: t.nietBenutBegin }, { streepBoven: ['B'], herkomst: uit(c, `${iv}.tabel[${i}].nietBenutBegin`) }),
      ...slot,
    ],
    { raster: 'lijfrente', herhaalKop: JAARRUIMTE_KOP, bijElkaar: true },
  )
}

function lijfrente(c: RapportContext): Sectie | null {
  if (!toonLijfrente(c)) return null
  const iv = c.p.inkomensvoorziening
  const berekeningen = iv.jaarruimteBerekeningen ?? []
  const blokken: Blok[] = [kopTekst(JAARRUIMTE_KOP), ...iv.tabel.map((t, i) => jaarblok(c, t, berekeningen[i], i, i === 0))]
  const premies = sectie('Premies voor lijfrente bij gebruik van de jaar- en reserveringsruimte', 3, blokken)
  return sectie('Uitgaven voor inkomensvoorziening', 2, [], [premies])
}

function dividendbelasting(c: RapportContext): Sectie | null {
  const pot = potVan(c)
  const totaalBox3 = pot?.dividendbelasting ?? 0
  const box2 = c.r.box2.dividendbelasting[c.id] ?? 0
  if (totaalBox3 <= 0 && box2 <= 0) return null
  const P = '4.2'
  const blokken: Blok[] = []
  if (pot && totaalBox3 > 0) {
    const posities = c.invoer.box3.posities
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => pot.positieIds.includes(x.id) && (x.categorie === 'beleggingen' || (x.dividendbelasting ?? 0) > 0))
    const toegerekend = c.p.voorheffingenDetail?.dividendbelastingBox3 ?? 0
    const verschoven = toegerekend - totaalBox3
    blokken.push(
      kopTekst('Te verrekenen dividendbelasting afkomstig uit beleggingen in box 3'),
      tabel(
        [
          ...posities.map(({ x, i }) => post(`${P}.positie.${x.id}`, x.omschrijving, { A: x.dividendbelasting ?? 0 }, { herkomst: `invoer.box3.posities[${i}].dividendbelasting` })),
          subtotaal(`${P}.totaal`, undefined, { B: totaalBox3 }, { streepBoven: ['A'], herkomst: `${potPad(c)}.dividendbelasting` }),
          subtotaal(`${P}.dividendbelasting`, 'Dividendbelasting', { C: totaalBox3 }, { streepBoven: ['B'], herkomst: `${potPad(c)}.dividendbelasting` }),
          (c.partners || verschoven !== 0) &&
            post(`${P}.naar-partner`, c.partners ? 'Deel doorgeschoven naar partner' : `Deel bij ${c.ander?.naam ?? 'de ander'}`, { C: verschoven }, {
              herkomst: `${uit(c, 'voorheffingenDetail.dividendbelastingBox3')} - ${potPad(c)}.dividendbelasting`,
            }),
          subtotaal(`${P}.toegerekend`, `Toegerekend aan ${c.naam}`, { C: toegerekend }, { streepBoven: ['C'], dubbelOnder: ['C'], herkomst: uit(c, 'voorheffingenDetail.dividendbelastingBox3') }),
        ],
        { koppen: [kk('omschrijving', 'Omschrijving'), kk('Z', 'Rekeningnummer'), kk('A', 'Ingehouden', 'dividendbelasting')] },
      ),
    )
  }
  if (box2 > 0) {
    blokken.push(
      kopTekst('Ingehouden dividendbelasting op inkomsten uit aanmerkelijk belang', blokken.length > 0 ? 1 : undefined),
      tabel([post(`${P}.box2`, 'Dividendbelasting aanmerkelijk belang', { C: box2 }, { herkomst: `box2.dividendbelasting.${c.id}` })]),
    )
  }
  return sectie('Dividendbelasting', 2, blokken)
}

function tariefmaatregel(c: RapportContext): Sectie | null {
  const b1 = c.p.box1
  if (b1.tariefmaatregel <= 0) return null
  const P = '4.3'
  const p = c.p
  const metOnderneming = c.pi.ondernemingen.length > 0
  const ewAftrek = Math.max(0, -p.eigenWoning)
  const pgaBox1 = p.pgaToerekening?.box1 ?? 0
  const pga = c.r.pga
  const alleenScholing = !!pga && pga.scholing > 0 && pga.scholing === pga.totaal
  const posten: Array<[boolean, string, string, number, string]> = [
    [metOnderneming, 'mkb', 'MKB-winstvrijstelling', p.mkbVrijstelling, uit(c, 'mkbVrijstelling')],
    [metOnderneming, 'ondernemersaftrek', 'Ondernemersaftrek', p.ondernemersaftrek.totaal, uit(c, 'ondernemersaftrek.totaal')],
    [!!c.r.eigenWoning, 'eigen-woning', 'Aftrekbare kosten eigen woning', ewAftrek, `max(0, -${uit(c, 'eigenWoning')})`],
    [(pga?.totaal ?? 0) > 0, 'pga', alleenScholing ? 'Aftrekbare scholingsuitgaven' : 'Persoonsgebonden aftrek', pgaBox1, uit(c, 'pgaToerekening.box1')],
  ]
  const getoond = posten.filter(([toon]) => toon)
  const somPosten = som(getoond.map(([, , , v]) => v))
  const grondslag = b1.tariefmaatregelGrondslag ?? somPosten
  const regels: MogelijkeRegel[] = [
    ...getoond.map(([, sleutel, label, v, herkomst]) => post(`${P}.${sleutel}`, label, { B: v }, { herkomst })),
    grondslag !== somPosten && post(`${P}.buiten-toptarief`, 'Deel dat niet in het hoogste tarief valt', { B: grondslag - somPosten }, { herkomst: `${uit(c, 'box1.tariefmaatregelGrondslag')} - som` }),
    subtotaal(`${P}.grondslag`, undefined, { C: grondslag }, { streepBoven: ['B'], herkomst: uit(c, 'box1.tariefmaatregelGrondslag') }),
    post(`${P}.beperking`, `Beperking tarief aftrekbare bedragen: ${percentage(b1.tariefmaatregelPct ?? 0)} over ${bedrag(grondslag)}`, { C: b1.tariefmaatregel }, {
      witVoor: 2,
      herkomst: uit(c, 'box1.tariefmaatregel'),
    }),
  ]
  return sectie('Specificatie beperking tarief aftrekbare bedragen', 2, [tabel(regels)])
}

function bijzondereSituaties(c: RapportContext): Sectie | null {
  const pot = potVan(c)
  if (!pot) return null
  const dubbel = bronbelastingBijlage(c, pot)
  if (!dubbel) return null
  return sectie('Bijzondere situaties', 2, [], [dubbel])
}

export function hoofdstukBijlagen(c: RapportContext): Sectie {
  const lijfrenteSectie = lijfrente(c)
  if (!lijfrenteSectie && c.pi.inkomensvoorziening.lijfrentePremies === 0) {
    c.weggelaten.push('Bijlage jaar- en reserveringsruimte: weggelaten, er is geen lijfrentepremie betaald.')
  }
  return sectie('Bijlagen', 1, [], [lijfrenteSectie, dividendbelasting(c), tariefmaatregel(c), bijzondereSituaties(c)], { nieuwePagina: true })
}
