/**
 * Ronde 2 (A6): het veldregister kent elk veld-id dat OndernemingSectie, ActivaInvoer, de situaties van de onderneming,
 * het autoblok en de stakingslijfrente als `data-veld` zetten (lib/dossier/veldregister/regelingen-onderneming.ts).
 * Naam en saldo registreert A3 (basis.ts); die staan hier niet.
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { isVeldId } from '../veld'
import { REGELINGEN_ONDERNEMING, VELDEN_REGELINGEN_ONDERNEMING } from '../veldregister/regelingen-onderneming'

/** Past een veld-id op een patroon ('*' is precies één sleutel)? */
function past(patroon: string, id: string): boolean {
  const p = patroon.split('/')
  const v = id.split('/')
  if (p.length !== v.length) return false
  return p.every((seg, i) => {
    const [naam, sleutel] = seg.split(':')
    const [vNaam, vSleutel] = [v[i].slice(0, v[i].indexOf(':') < 0 ? undefined : v[i].indexOf(':')), v[i].includes(':') ? v[i].slice(v[i].indexOf(':') + 1) : undefined]
    if (sleutel === undefined) return seg === v[i]
    return naam === vNaam && vSleutel !== undefined && (sleutel === '*' || sleutel === vSleutel)
  })
}

const O = 'persoon:A/onderneming:ond-1'
const GEBRUIKT = [
  'startjaar',
  'winstBron',
  'winstberekening.soort',
  'winstberekening.afschrijvingenInSaldo',
  'winstberekening.omzet',
  'winstberekening.kosten',
  'winstberekening.afschrijvingen',
  'winstberekening.wijzigingOnderhandenWerk',
  'winstberekening.financieleBatenLasten',
  'beperktAftrekbaar',
  'activaVolledig',
  'activa:0/omschrijving',
  'activa:0/aanschafdatum',
  'activa:0/aanschafwaarde',
  'activa:0/restwaarde',
  'activa:0/levensduurJaren',
  'activa:0/boekwaardeBegin',
  'activa:0/soort',
  'activa:0/woz',
  'activa:0/methode',
  'activa:0/willekeurigBedrag',
  'activa:0/verkocht',
  'activa:0/verkocht.datum',
  'activa:0/verkocht.verkoopprijs',
  'activa:0/herinvesteringsreserve',
  'investering:inv-1/omschrijving',
  'investering:inv-1/datum',
  'investering:inv-1/bedrag',
  'investering:inv-1/regeling',
  'investering:inv-1/uitgesloten',
  'investering:inv-1/inGebruik',
  'investering:inv-1/betaald',
  'investering:inv-1/gekochtVanPartner',
  'investering:inv-1/gemeld',
  'investering:inv-1/herinvesteringsreserve.afboeking',
  'investering:inv-1/herinvesteringsreserve.reserveId',
  'investering:inv-1/herinvesteringsreserve.nieuwLanglopend',
  'investering:inv-1/herinvesteringsreserve.zelfdeFunctie',
  'investering:inv-1/herinvesteringsreserve.kiaOverVolBedrag',
  'desinvestering:0/omschrijving',
  'desinvestering:0/verkoopprijs',
  'desinvestering:0/investeringsjaar',
  'desinvestering:0/genotenPct',
  'desinvestering:0/genotenAftrek',
  'overigeVerkopen',
  'uren.urencriteriumGehaald',
  'uren.onderneming',
  'uren.loondienst',
  'uren.zwangerschapWeken',
  'uren.gemiddeldeUrenPerWeekVoorVerlof',
  'uren.urencriteriumVorigJaar',
  'for.stand',
  'for.ondernemingsvermogenEinde',
  'for.vrijwilligeAfname',
  'zakelijkeKmPrive',
  'kmAftrekAlInSaldo',
  'auto',
  'auto.cataloguswaarde',
  'auto.datumEersteToelating',
  'auto.dagwaarde',
  'auto.youngtimerOvergang',
  'auto.terBeschikkingSinds',
  'auto.terBeschikkingTot',
  'auto.autokosten',
  'auto.eigenBijdrage',
  'auto.priveKm',
  'auto.nulEmissie',
  'auto.rittenregistratie',
  'auto.btw',
  'auto.btw.aftrekOpKosten',
  'auto.btw.aftrekBijAanschaf',
  'auto.btw.jaarIngebruikname',
  'auto.btw.methode',
  'auto.btw.btwOpKosten',
  'auto.btw.btwBijAanschaf',
  'auto.btw.priveKmInclWoonWerk',
  'auto.btw.totaalKm',
  'auto.btw.inAutokosten',
  'opdrachtgever:0/naam',
  'opdrachtgever:0/omzet',
  'opdrachtgever:0/uurtarief',
  'opdrachtgever:0/duurMaanden',
  'opdrachtgever:0/viaPlatform',
  'maandenGewerkt',
  'startersaftrekEerderGebruikt',
  'herinvesteringsreserve:hir-2026-1/herkomst.omschrijving',
  'herinvesteringsreserve:hir-2026-1/ontstaanJaar',
  'herinvesteringsreserve:hir-2026-1/herkomst.opbrengst',
  'herinvesteringsreserve:hir-2026-1/herkomst.boekwaardeOud',
  'herinvesteringsreserve:hir-2026-1/herkomst.schadeloosstelling',
  'herinvesteringsreserve:hir-2026-1/herkomst.langlopend',
  'herinvesteringsreserve:hir-2026-1/bedragOntstaan',
  'herinvesteringsreserve:hir-2026-1/standBegin',
  'herinvesteringsreserve:hir-2026-1/voornemen',
  'herinvesteringsreserve:hir-2026-1/termijnVerlengdTot',
  'herinvesteringsreserve:hir-2026-1/mutatiesInSaldo',
  'egalisatiereserve:eg-1/omschrijving',
  'egalisatiereserve:eg-1/standBegin',
  'egalisatiereserve:eg-1/dotatie',
  'egalisatiereserve:eg-1/onttrekking',
  'egalisatiereserve:eg-1/vervallen',
  'egalisatiereserve:eg-1/inSaldo',
  'staking.soort',
  'staking.datum',
  'staking.stakingswinst',
  'staking.stakingswinstInSaldo',
  'staking.goodwill',
  'staking.stakingskosten',
  'staking.eerderGenotenStakingsaftrek',
  'stakingspost:0/omschrijving',
  'stakingspost:0/soort',
  'stakingspost:0/waardeOfOpbrengst',
  'stakingspost:0/fiscaleBoekwaarde',
  'stakingspost:0/naarPrive',
  'stakingspost:0/inSaldo',
].map((v) => `${O}/${v}`)

const PENSIOEN = ['premie', 'betaaldOp', 'categorie', 'eerderAfgetrokkenLijfrentepremies', 'waardePensioenaanspraken', 'eerdereStakingslijfrenten', 'eerdereForOmzettingen'].map(
  (v) => `persoon:A/inkomensvoorziening.stakingslijfrente.${v}`,
)

describe('veldregister regelingen onderneming', () => {
  it('elk veld-id uit de editor is geldig en staat precies één keer in dit register', () => {
    for (const id of [...GEBRUIKT, ...PENSIOEN]) {
      expect(isVeldId(id), id).toBe(true)
      const treffers = VELDEN_REGELINGEN_ONDERNEMING.filter((v) => past(v.patroon, id))
      expect(treffers.length, id).toBe(1)
    }
  })

  it('naam en saldo van de onderneming registreert A3, niet dit register', () => {
    expect(VELDEN_REGELINGEN_ONDERNEMING.some((v) => past(v.patroon, `${O}/naam`) || past(v.patroon, `${O}/winstberekening.saldo`))).toBe(false)
  })

  it('labels met de naam van de onderneming en de persoon; regelingen op hun velden en kiezers', () => {
    const invoer: HuishoudenInvoer = {
      jaar: 2026,
      personen: [
        {
          id: 'A',
          naam: 'Persoon A',
          geboortedatum: '1981-01-01',
          loon: [],
          inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
          ondernemingen: [
            {
              id: 'ond-1',
              naam: 'Ontwerpstudio',
              winstberekening: { soort: 'saldo', saldo: 1 },
              uren: { onderneming: 0 },
              startjaar: 2010,
              staking: { stakingswinst: 0 },
              herinvesteringsreserves: [{ id: 'hir-2026-1', ontstaanJaar: 2026, bedragOntstaan: 1, standBegin: 0, herkomst: { omschrijving: 'Bus', boekwaardeOud: 0, langlopend: false }, voornemen: true }],
            },
          ],
        },
      ],
      fiscaalPartner: false,
      kinderen: [],
      box3: { posities: [], schulden: [] },
      verdeling: 'optimaal',
    }
    const item = VELDEN_REGELINGEN_ONDERNEMING.find((v) => past(v.patroon, `${O}/staking.datum`))!
    const label = typeof item.label === 'function' ? item.label({ id: `${O}/staking.datum`, persoon: 'A', sleutels: ['A', 'ond-1'] }, invoer) : item.label
    expect(label).toBe('Staking: datum, Ontwerpstudio, Persoon A')
    for (const r of REGELINGEN_ONDERNEMING) {
      for (const a of r.actiefBij(invoer)) expect(VELDEN_REGELINGEN_ONDERNEMING.some((v) => past(v.patroon, a.veld)), `${r.id} ${a.veld}`).toBe(true)
    }
    expect(REGELINGEN_ONDERNEMING.find((r) => r.id === 'hir')!.kiezers(invoer)).toEqual([{ elementId: 'situaties-A-ond-1', waar: 'Ontwerpstudio, Persoon A' }])
    expect(REGELINGEN_ONDERNEMING.find((r) => r.id === 'stakingslijfrente')!.actiefBij(invoer)).toEqual([{ veld: 'persoon:A/inkomensvoorziening.stakingslijfrente.premie', waar: 'Persoon A' }])
  })
})
