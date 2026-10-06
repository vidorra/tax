/**
 * Ronde 2 (A3): de pure delen van de weergave van de controles: de teller in de jaarbalk, de regel op de jaarkaart en
 * de controles per veld (velden.tsx).
 */
import { describe, expect, it } from 'vitest'
import type { Controle } from '@/lib/controles/types'
import { tellerTekst } from '../controles/ControleTeller'
import { invulhulpTekst, jaarControleTekst } from '../controles/JaarControleRegel'
import { controlesPerVeld } from '../controles/veld-context'

const t = (fouten: number, letOp: number, info = 0) => ({ fouten, letOp, info, genegeerd: 0 })

describe('teller in de jaarbalk', () => {
  it('rustig: grijs aantal of "Nog niets te controleren"', () => {
    expect(tellerTekst(t(2, 1, 0), false)).toBe('3 controles')
    expect(tellerTekst(t(0, 0, 1), false)).toBe('1 controle')
    expect(tellerTekst(t(0, 0, 0), false)).toBe('Nog niets te controleren')
  })
  it('streng: fouten en let op, of in orde', () => {
    expect(tellerTekst(t(2, 3), true)).toBe('2 fouten · 3 let op')
    expect(tellerTekst(t(1, 0), true)).toBe('1 fout')
    expect(tellerTekst(t(0, 0, 4), true)).toBe('Controles in orde')
  })
})

describe('jaarkaart', () => {
  it('rustig een grijs aantal, zonder controles niets', () => {
    expect(jaarControleTekst({ controles: t(1, 2), controlesStreng: false })).toEqual({ soort: 'rustig', tekst: '3 controles' })
    expect(jaarControleTekst({ controles: t(0, 0), controlesStreng: false })).toBeNull()
    expect(jaarControleTekst({ controlesStreng: true })).toBeNull()
  })
  it('streng: fouten open of in orde bij de laatste opslag', () => {
    expect(jaarControleTekst({ controles: t(2, 0), controlesStreng: true })).toEqual({ soort: 'fout', tekst: '2 fouten open' })
    expect(jaarControleTekst({ controles: t(0, 3), controlesStreng: true })).toEqual({ soort: 'in-orde', tekst: 'Controles in orde bij de laatste opslag' })
  })
  it('voortgang van de invulhulp alleen als er iets is afgevinkt', () => {
    expect(invulhulpTekst({ invulhulp: { A: { afgevinkt: 12, totaal: 30, verschillen: 0, gewijzigd: 0 }, B: { afgevinkt: 6, totaal: 12, verschillen: 0, gewijzigd: 0 } } })).toBe('Aangifte: 18 van 42')
    expect(invulhulpTekst({ invulhulp: { A: { afgevinkt: 0, totaal: 30, verschillen: 0, gewijzigd: 0 } } })).toBeNull()
    expect(invulhulpTekst({})).toBeNull()
  })
})

describe('controles per veld', () => {
  const c = (x: Partial<Controle> & Pick<Controle, 'id' | 'ernst'>): Controle => ({ regel: x.id, titel: x.id, uitleg: '', gebied: 'huishouden', veld: null, negeren: 'gezien', vingerafdruk: '', ...x })
  it('per veld, ook bij elk van meer velden; info niet', () => {
    const m = controlesPerVeld([
      c({ id: 'geboortedatum:A', ernst: 'fout', veld: 'persoon:A/geboortedatum' }),
      c({ id: 'verplicht-leeg', ernst: 'fout', veld: 'persoon:A/onderneming:ond-1/naam', velden: [{ veld: 'persoon:A/onderneming:ond-1/naam', label: 'Naam' }, { veld: 'persoon:A/loon:loon-1/omschrijving', label: 'Omschrijving' }] }),
      c({ id: 'jaarruimte', ernst: 'info', veld: 'persoon:A/inkomensvoorziening.lijfrentePremies' }),
    ])
    expect(m.get('persoon:A/geboortedatum')?.map((x) => x.id)).toEqual(['geboortedatum:A'])
    expect(m.get('persoon:A/loon:loon-1/omschrijving')?.map((x) => x.id)).toEqual(['verplicht-leeg'])
    expect(m.has('persoon:A/inkomensvoorziening.lijfrentePremies')).toBe(false)
  })
})
