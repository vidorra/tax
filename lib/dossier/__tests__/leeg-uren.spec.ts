import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import type { HuishoudenInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { naarInvoer, standaardPersoon, standaardState } from '@/lib/calculator/formulier'
import { leegInvoer, leegOnderneming, standaardUren } from '../leeg'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

function metOnderneming(o: OndernemingInvoer): HuishoudenInvoer {
  const invoer = leegInvoer(2026)
  invoer.personen[0].geboortedatum = '1985-06-15'
  invoer.personen[0].ondernemingen = [o]
  return invoer
}

describe('urencriterium standaard ja', () => {
  it('een nieuwe onderneming in het dossier staat op ja zonder uren', () => {
    expect(standaardUren()).toEqual({ onderneming: 0, urencriteriumGehaald: true })
    const o = leegOnderneming(2026)
    expect(o.uren).toEqual({ onderneming: 0, urencriteriumGehaald: true })
    // Geen starter tenzij de gebruiker dat zelf invult: anders ontstaat ongevraagd startersaftrek.
    expect(o.startjaar).toBe(2016)
    expect(valideerInvoer(metOnderneming(o))).toEqual([])
    const r = berekenHuishouden(metOnderneming({ ...o, winstberekening: { soort: 'saldo', saldo: 60000 } }), { zonderMarginaleDruk: true })
    expect(r.personen[0].ondernemersaftrek.startersaftrek).toBe(0)
  })

  it('de engine geeft dan zelfstandigenaftrek', () => {
    const o: OndernemingInvoer = { ...leegOnderneming(2026), winstberekening: { soort: 'saldo', saldo: 60000 }, startjaar: 2015 }
    const r = berekenHuishouden(metOnderneming(o), { zonderMarginaleDruk: true })
    expect(r.personen[0].ondernemingen[0].urencriteriumGehaald).toBe(true)
    expect(r.personen[0].ondernemersaftrek.zelfstandigenaftrek).toBeGreaterThan(0)
  })

  it('ja met te weinig uren: de keuze wint, met een waarschuwing', () => {
    const o: OndernemingInvoer = { ...leegOnderneming(2026), winstberekening: { soort: 'saldo', saldo: 60000 }, startjaar: 2015, uren: { onderneming: 400, urencriteriumGehaald: true } }
    const r = berekenHuishouden(metOnderneming(o), { zonderMarginaleDruk: true })
    expect(r.personen[0].ondernemingen[0].urencriteriumGehaald).toBe(true)
    const alle = [...r.waarschuwingen, ...r.personen[0].waarschuwingen, ...r.personen[0].ondernemingen[0].waarschuwingen]
    expect(alle.some((w) => w.id.endsWith('uren.afwijkend'))).toBe(true)
  })

  it('nieuw jaar: geen antwoord wordt ja, een bewust nee blijft staan', () => {
    const vorig = metOnderneming(leegOnderneming(2025))
    vorig.jaar = 2025
    vorig.personen[0].ondernemingen = [
      { ...leegOnderneming(2020, 'Zonder antwoord'), uren: { onderneming: 0 } },
      { ...leegOnderneming(2020, 'Nee'), uren: { onderneming: 600, urencriteriumGehaald: false } },
      { ...leegOnderneming(2020, 'Ja'), uren: { onderneming: 0, urencriteriumGehaald: true } },
    ]
    const nieuw = nieuwJaarUitVorig(vorig, 2026)
    expect(nieuw.personen[0].ondernemingen.map((o) => o.uren.urencriteriumGehaald)).toEqual([true, false, true])
    expect(nieuw.personen[0].ondernemingen[1].uren.onderneming).toBe(600)
  })

  it('publieke calculator: de schakelaar staat standaard aan en gaat als antwoord mee, zonder uren', () => {
    expect(standaardPersoon('A').urencriterium).toBe(true)
    expect(standaardPersoon('B').urencriterium).toBe(true)
    const s = standaardState(2026)
    expect(naarInvoer(s).personen[0].ondernemingen[0].uren).toEqual({ onderneming: 0, urencriteriumGehaald: true })
    s.personen.A = { ...s.personen.A, urencriterium: false }
    expect(naarInvoer(s).personen[0].ondernemingen[0].uren).toEqual({ onderneming: 0, urencriteriumGehaald: false })
  })
})
