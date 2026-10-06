/**
 * Review ronde 2, bevindingen 7 (youngtimer-dagwaarde zonder bijtelling) en 12 (rente-tekst van va-te-laag).
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'
import { renteVanaf } from '@/lib/tax/modules/planning/belastingrente'
import { AFRONDING } from '@/lib/tax/rounding'
import { euro } from '@/lib/tax/uitleg'
import type { AutoInvoer, HuishoudenInvoer, OndernemingInvoer, PersoonInvoer } from '@/lib/tax/types'
import { controleContext, controleerAlles } from '../index'
import { controleer } from '../index'
import { PRIVE_REGELS } from '../regels/prive'
import type { ControleContext } from '../types'

const VANDAAG = '2026-10-05'

function hh(jaar: number, p: Partial<PersoonInvoer> = {}): HuishoudenInvoer {
  return {
    jaar,
    personen: [{ id: 'A', naam: 'Persoon A', geboortedatum: '1985-04-01', ondernemingen: [], loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 }, ...p }],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}
const ond = (x: Partial<OndernemingInvoer> = {}): OndernemingInvoer => ({
  id: 'ond-1',
  naam: 'Ontwerpstudio',
  winstBron: 'boekhouding',
  winstberekening: { soort: 'saldo', saldo: 60000 },
  uren: { onderneming: 1600, urencriteriumGehaald: true },
  startjaar: 2015,
  ...x,
})

describe('bevinding 7: youngtimer-dagwaarde alleen als er een bijtelling is', () => {
  const oud = (x: Partial<AutoInvoer> = {}): AutoInvoer => ({ cataloguswaarde: 30000, datumEersteToelating: '2005-03-01', nulEmissie: false, autokosten: 4000, ...x })
  const uitkomst = (i: HuishoudenInvoer) => {
    const r = berekenHuishouden(i)
    return { r, u: controleerAlles(controleContext({ jaar: i.jaar, invoer: i, resultaat: r, params: getJaar(i.jaar), status: 'concept', vandaag: VANDAAG })) }
  }

  it('rittenregistratie met 0 privékilometers: geen bijtelling, geen fout en geen CONCEPT door deze controle', () => {
    const { r, u } = uitkomst(hh(2026, { ondernemingen: [ond({ auto: oud({ rittenregistratie: true, priveKm: 0 }) })] }))
    expect(r.personen[0].ondernemingen[0].auto?.soort).toBe('geen')
    expect(u.open.filter((x) => x.regel === 'youngtimer-dagwaarde')).toEqual([])
  })

  it('wel privégebruik: de fout blijft (niet te negeren)', () => {
    const { u } = uitkomst(hh(2026, { ondernemingen: [ond({ auto: oud() })] }))
    expect(u.open.filter((x) => x.regel === 'youngtimer-dagwaarde').map((x) => `${x.ernst}/${x.negeren}`)).toEqual(['fout/nee'])
  })

  it('zonder uitkomst van de engine valt de controle terug op de invoer', () => {
    const i = hh(2026, { ondernemingen: [ond({ auto: oud({ rittenregistratie: true, priveKm: 200 }) })] })
    const c: ControleContext = { jaar: 2026, invoer: i, resultaat: null, params: getJaar(2026), status: 'concept', vandaag: VANDAAG }
    expect(controleerAlles(controleContext(c)).open.filter((x) => x.regel === 'youngtimer-dagwaarde')).toEqual([])
  })
})

describe('bevinding 12: va-te-laag noemt de rente van vandaag', () => {
  const pctOp = (datum: string) => BELASTINGRENTE_IB.find((x) => x.vanaf <= datum && (x.tot === null || x.tot >= datum))!.pct
  const uitleg = (i: HuishoudenInvoer) =>
    controleer({ jaar: i.jaar, invoer: i, resultaat: berekenHuishouden(i), params: getJaar(i.jaar), status: 'concept', vandaag: VANDAAG }, PRIVE_REGELS).alle.find(
      (x) => x.regel === 'va-te-laag',
    )?.uitleg ?? ''

  it('aanslag 2024 bekeken in oktober 2026: het percentage van nu, niet dat van 1 juli 2025', () => {
    const i = hh(2024, { loon: [{ id: 'loon-1', omschrijving: 'Acme BV', soort: 'loon', bruto: 60000, ingehoudenLoonheffing: 0 }] })
    expect(pctOp(VANDAAG)).not.toBe(pctOp(renteVanaf(2024, getJaar(2024))))
    const p = berekenHuishouden(i).personen[0]
    const bij = p.verschuldigdIB - p.voorheffingen + Math.max(0, p.zvw.bijdrage)
    expect(uitleg(i)).toContain(`nu ongeveer ${euro(AFRONDING.belastingrente(bij * pctOp(VANDAAG)))} per jaar`)
  })

  it('met een bijdrage Zvw noemt de tekst die ook, zodat "daarover" klopt', () => {
    const i = hh(2025, { ondernemingen: [ond()] })
    const p = berekenHuishouden(i).personen[0]
    expect(p.zvw.bijdrage).toBeGreaterThan(0)
    const t = uitleg(i)
    expect(t).toContain(`inkomstenbelasting en ${euro(p.zvw.bijdrage)} bijdrage Zvw bijbetalen`)
    expect(t).toContain(`nu ongeveer ${euro(AFRONDING.belastingrente((p.verschuldigdIB - p.voorheffingen + p.zvw.bijdrage) * pctOp(VANDAAG)))} per jaar`)
  })
})
