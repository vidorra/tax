/**
 * Review ronde 2, bevinding 13: een nieuwe persoon begint zonder geboortedatum. De controle "Geboortedatum ontbreekt"
 * gaat dan af (ook voor Persoon B na de snelle oplossing), de server accepteert de lege datum, en de berekening rekent
 * zolang met een standaard die nooit in de invoer terechtkomt.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { partnerZonderBRegel } from '@/lib/controles/regels/invoer'
import { controlesVanJaar } from '../controle-telling'
import { berekenDossier, metRekenStandaarden, rekenGeboortedatum, zonderGeboortedatum } from '../bereken'
import { leegInvoer, leegPersoon } from '../leeg'
import { valideerInvoer } from '../valideer'

const controleIds = (invoer: HuishoudenInvoer) => {
  const resultaat = berekenDossier(invoer, { zonderMarginaleDruk: true })
  const u = controlesVanJaar({ jaar: invoer.jaar, variant: null, status: 'concept', invoer, resultaat, staat: null, vandaag: '2026-10-05' })
  return u?.open.map((c) => c.id) ?? []
}

describe('nieuwe persoon zonder geboortedatum', () => {
  it('een leeg jaar en een tweede persoon beginnen met een lege geboortedatum', () => {
    const i = leegInvoer(2025)
    expect(i.personen[0].geboortedatum).toBe('')
    expect(leegPersoon('B', 2025).geboortedatum).toBe('')
    expect(zonderGeboortedatum(i)).toBe(true)
  })

  it('de controle geboortedatum gaat af, ook voor Persoon B na de snelle oplossing', () => {
    const i = leegInvoer(2025)
    expect(controleIds(i)).toContain('geboortedatum:A')

    i.personen[0].geboortedatum = '1988-03-14'
    i.fiscaalPartner = true
    const [partner] = partnerZonderBRegel({ invoer: i } as Parameters<typeof partnerZonderBRegel>[0])
    expect(partner.oplossing?.pas).toBeTypeOf('function')
    const na = structuredClone(i)
    partner.oplossing!.pas!(na)
    expect(na.personen.find((p) => p.id === 'B')?.geboortedatum).toBe('')
    const ids = controleIds(na)
    expect(ids).toContain('geboortedatum:B')
    expect(ids).not.toContain('geboortedatum:A')
  })

  it('de server accepteert een lege geboortedatum, maar niet een ontbrekende of een andere vorm', () => {
    expect(valideerInvoer(leegInvoer(2025))).toEqual([])
    const zonder = leegInvoer(2025) as unknown as { personen: Array<Record<string, unknown>> }
    delete zonder.personen[0].geboortedatum
    expect(valideerInvoer(zonder)).toEqual(['personen[0].geboortedatum: datum ontbreekt'])
    const anders = leegInvoer(2025)
    anders.personen[0].geboortedatum = '14-03-1988'
    expect(valideerInvoer(anders)).toEqual(['personen[0].geboortedatum: moet een datum zijn (JJJJ-MM-DD)'])
  })

  it('de berekening rekent zolang met de standaard, zonder de invoer te veranderen', () => {
    const i = leegInvoer(2025)
    i.personen[0].loon = [{ omschrijving: 'Werkgever', soort: 'loon', bruto: 50000, ingehoudenLoonheffing: 15000 }]
    const met = structuredClone(i)
    met.personen[0].geboortedatum = rekenGeboortedatum(2025)
    expect(rekenGeboortedatum(2025)).toBe('1985-01-01')
    expect(berekenDossier(i).totaal).toEqual(berekenHuishouden(met).totaal)
    // De invoer zelf blijft leeg: de controle blijft afgaan en het rapport noemt geen verzonnen datum.
    expect(i.personen[0].geboortedatum).toBe('')
    expect(metRekenStandaarden(i).personen[0].geboortedatum).toBe('1985-01-01')
    // Met een ingevulde datum komt hetzelfde object terug.
    expect(metRekenStandaarden(met)).toBe(met)
  })
})
