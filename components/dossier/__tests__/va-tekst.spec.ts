import { describe, expect, it } from 'vitest'
import { getJaar } from '@/lib/tax/years'
import { adviesVoorlopigeAanslag } from '@/lib/tax/modules/planning/voorlopige-aanslag'
import { BELASTINGRENTE_IB } from '@/lib/tax/years/data/belastingrente'
import { naAfloopZin, nogBij, perMaandZin, praktijkZin, teVeel, vaAdviesZin } from '../planning/va-tekst'

/** formatEuro zet een harde spatie na het euroteken; de tests schrijven een gewone spatie. */
const n = (s: string | null) => (s ?? '').replace(/ /g, ' ')
const params = getJaar(2026)
const ctx = { params, tabel: BELASTINGRENTE_IB }
const advies = (ib: { verwacht: number; voorheffingen?: number; opgelegd: number }, zvw = { verwacht: 0, opgelegd: 0 }, vandaag = '2026-02-20') =>
  adviesVoorlopigeAanslag(
    { persoon: 'A', belastingjaar: 2026, ib: { voorheffingen: 0, ...ib }, zvw: { voorheffingen: 0, ...zvw }, vandaag },
    ctx,
  )

describe('va-tekst: zinnen van de sectie Voorlopige aanslag (ux 5.6)', () => {
  it('te laag: advies met IB en Zvw, en in het lopende jaar het bedrag per maand', () => {
    const a = advies({ verwacht: 14200, opgelegd: 10000 }, { verwacht: 3150, opgelegd: 3000 })
    expect(a.status).toBe('te-laag')
    expect(nogBij(a)).toBe(4350)
    expect(n(vaAdviesZin(a, params))).toBe('Vraag een voorlopige aanslag aan van € 14.200 IB en € 3.150 Zvw.')
    // Dagtekening 20-2: 10 termijnen; 4.200 / 10 + 150 / 10 = 435
    expect(n(perMaandZin(a))).toBe('Vraag je nu aan, dan betaal je het verschil in de maanden die nog over zijn: ongeveer € 435 per maand.')
  })

  it('onder de aanslaggrens van de params: aanpassen is niet nodig', () => {
    const a = advies({ verwacht: 6200, opgelegd: 6180 })
    expect(a.status).toBe('past')
    expect(n(vaAdviesZin(a, params))).toBe(`Verschil € 20, onder de aanslaggrens van € ${params.overig.waarde.aanslaggrens}. Aanpassen is niet nodig.`)
  })

  it('te hoog met en zonder voorlopige aanslag, en na afloop van het jaar', () => {
    const met = advies({ verwacht: 4000, opgelegd: 6000 })
    expect(teVeel(met)).toBe(2000)
    expect(n(vaAdviesZin(met, params, 'lopend'))).toBe('Je betaalt waarschijnlijk € 2.000 te veel. Vraag een lagere voorlopige aanslag aan, dan krijg je dat eerder terug.')
    expect(n(vaAdviesZin(met, params, 'na-afloop'))).toBe('Je hebt waarschijnlijk € 2.000 te veel betaald. Dien de aangifte in, dan krijg je het terug.')
    const zonder = advies({ verwacht: 4000, voorheffingen: 6000, opgelegd: 0 })
    expect(n(vaAdviesZin(zonder, params, 'lopend'))).toBe('Je krijgt waarschijnlijk € 2.000 terug. Vraag een voorlopige teruggaaf aan, dan krijg je het al in de loop van het jaar.')
  })

  it('niets bij te betalen: niet nodig', () => {
    const a = advies({ verwacht: 0, opgelegd: 0 })
    expect(a.status).toBe('niet-nodig')
    expect(vaAdviesZin(a, params)).toBe('Er is niets bij te betalen. Een voorlopige aanslag is niet nodig.')
  })

  it('in november of december in één keer', () => {
    const a = advies({ verwacht: 1200, opgelegd: 0 }, undefined, '2026-11-10')
    expect(n(perMaandZin(a))).toBe('Vraag je nu aan, dan betaal je het verschil in één keer: € 1.200, uiterlijk 22 december 2026.')
  })

  it('na afloop: vóór en na 1 mei', () => {
    expect(naAfloopZin(2025, '2026-03-01', '2026-05-01', '2026-07-01')).toBe(
      'Je hebt over 2025 nog geen aangifte gedaan. Dien je die vóór 1 mei 2026 in en klopt de aanslag met je aangifte, dan betaal je geen belastingrente.',
    )
    expect(naAfloopZin(2024, '2026-10-05', '2025-05-01', '2025-07-01')).toContain('1 mei 2025 is voorbij')
  })

  it('praktijk: alleen als de wet 0 geeft en de rekenvoorbeelden niet (BD2)', () => {
    expect(n(praktijkZin({ bedrag: 0, reden: 'vastgesteld-voor-1-juli' }, 8, '2024-07-01'))).toBe(
      'Mogelijk rekent de Belastingdienst toch rente: ongeveer € 8. De wet rekent geen rente bij een aanslag vóór 1 juli; de rekenvoorbeelden van de Belastingdienst wel.',
    )
    expect(praktijkZin({ bedrag: 56, reden: null }, 57, '2026-07-01')).toBeNull()
    expect(praktijkZin({ bedrag: 0, reden: 'geen-rente-voor-1-mei' }, 0, '2026-07-01')).toBeNull()
  })
})
