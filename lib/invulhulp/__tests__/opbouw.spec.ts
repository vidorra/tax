/**
 * Ronde 2 (A1), taak 10 punt 1, 7, 8 en 9: opbouw tegen de voorbeeldaangifte 2024, sleutels, indeling per jaar en de
 * bronbelasting defensief (zonder de uitkomst per land van onderdeel 5).
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { indelingVoor } from '../indeling'
import { bouw, kloon, scherm, veld, velden, voorbeeld2024 } from './hulp'

describe('opbouw tegen de voorbeeldaangifte 2024', () => {
  const invoer = voorbeeld2024()
  const o = bouw(invoer)
  const r = berekenHuishouden(invoer).personen[0].ondernemingen[0]

  it('winstberekening (scherm 17) = winst + kia + eia + mia − desinvesteringsbijtelling van de uitkomst', () => {
    const v = veld(o, 'winstberekening:o-ond-1/fiscale-winst')
    expect(v.rij).toBe('berekend')
    expect(v.waarde).toEqual({ soort: 'bedrag', bedrag: Math.round(r.winst + r.kia + r.eia + r.mia - r.desinvesteringsbijtelling) })
  })

  it('volgt de volgorde van het programma, met de schermen per onderneming als één blok', () => {
    const ids = o.schermen.map((s) => s.id)
    const volgorde = ['introductie', 'persoonlijke-gegevens', 'partner', 'onderneming', 'gegevens-onderneming', 'winst-en-verliesrekening', 'balans-activa', 'winstberekening', 'ondernemersaftrek', 'woningen', 'bezittingen', 'bankrekeningen', 'beleggingen', 'hypotheken', 'aanvullende-vragen', 'verdelen', 'overzicht', 'naar-verzenden']
    const posities = volgorde.map((id) => ids.indexOf(id))
    expect(posities.every((p) => p >= 0)).toBe(true)
    expect([...posities].sort((a, b) => a - b)).toEqual(posities)
  })

  it('V-velden zijn altijd zichtbaar, ook zonder bedrag', () => {
    const x = kloon(invoer)
    x.box3.posities.find((p) => p.id === 'beleggingen')!.dividendbelasting = 0
    const v = veld(bouw(x), 'beleggingen/belegging:beleggingen/dividendbelasting')
    expect(v.soort).toBe('V')
    expect(v.rij).toBe('controleren')
    expect(v.leeg).toBe(false)
    for (const w of velden(o).filter((y) => y.soort === 'V')) expect(w.leeg).toBe(false)
  })

  it('lege velden zijn verborgen (leeg), berekende regels zonder bedrag vallen weg', () => {
    expect(veld(o, 'winst-en-verliesrekening:o-ond-1/persloon').leeg).toBe(true)
    expect(velden(o).some((v) => v.rij === 'berekend' && v.leeg)).toBe(false)
  })

  it('een scherm Stakingswinst alleen met staking; zonder uitkomst van de staking met de melding en het ene bedrag', () => {
    expect(o.schermen.some((s) => s.id === 'stakingswinst')).toBe(false)
    const x = kloon(invoer)
    x.personen[0].ondernemingen[0].staking = { stakingswinst: 25000 }
    const s = bouw(x).schermen.find((y) => y.id === 'stakingswinst')!
    expect(s).toBeDefined()
    const stakingUitkomst = berekenHuishouden(x).personen[0].ondernemingen[0].staking
    if (stakingUitkomst) {
      expect(s.rubrieken[0].velden.map((v) => v.id)).toContain('wstakvrijforaang')
    } else {
      expect(s.melding?.tekst).toBe('De stakingswinst staat bij Meubelmakerij.')
      expect(s.rubrieken[0].velden.find((v) => v.id === 'stakingswinst')?.waarde).toEqual({ soort: 'bedrag', bedrag: 25000 })
    }
  })

  it('een saldo zonder rubrieken geeft de melding met een link naar de jaarrekening', () => {
    const x = kloon(invoer)
    delete x.personen[0].ondernemingen[0].jaarrekening
    const s = scherm(bouw(x), 'winst-en-verliesrekening:o-ond-1')
    expect(s.melding?.tekst).toBe(
      'Het aangifteprogramma vraagt hier de winst-en-verliesrekening van Meubelmakerij. Vul hem in bij de onderneming of neem hem over uit Moneybird.',
    )
    expect(s.melding?.link).toEqual({ label: 'Naar de jaarrekening', veld: 'persoon:A/onderneming:ond-1/winstberekening.saldo' })
  })

  it('auto van de zaak bij een saldo: de bijtelling zit in het saldo, het programma vraagt hem toch bij Privéonttrekkingen', () => {
    const x = kloon(invoer)
    x.personen[0].ondernemingen[0].auto = { cataloguswaarde: 40000, datumEersteToelating: '2007-04-15', nulEmissie: false, dagwaarde: 8000, autokosten: 9000 }
    const rx = berekenHuishouden(x).personen[0].ondernemingen[0]
    expect(rx.bijtellingAuto).toBe(0)
    expect(rx.auto?.bijtellingInSaldo).toBe(true)
    const ox = bouw(x)
    expect(veld(ox, 'selectievragen:o-ond-1/auto-prive').waarde).toEqual({ soort: 'antwoord', antwoord: 'Ja' })
    expect(veld(ox, 'prive:o-ond-1/autbijzaang').waarde).toEqual({ soort: 'bedrag', bedrag: rx.auto!.bijtelling })
  })

  it('meer dan drie ondernemingen: melding over de grens van het online programma', () => {
    const x = kloon(invoer)
    const o1 = x.personen[0].ondernemingen[0]
    x.personen[0].ondernemingen = [1, 2, 3, 4].map((n) => ({ ...kloon(o1), id: `ond-${n}`, naam: `Onderneming ${n}` }))
    const s = scherm(bouw(x), 'gegevens-onderneming:o-ond-1')
    expect(s.melding?.variant).toBe('let-op')
    expect(s.melding?.tekst).toContain('hooguit drie ondernemingen per persoon')
  })

  it('labels zonder plaatshouders; grenzen uit de params', () => {
    for (const v of velden(o)) expect(v.label).not.toMatch(/<[a-z]+>|\[jaar|\[j-1\]|\{[a-z]+\}/)
    expect(veld(o, 'ondernemersaftrek:A/urencriterium').label).toBe('Werkte u minimaal 1.225 uur in de onderneming?')
    expect(veld(o, 'bezittingen/grens').label).toBe('Waren al deze bezittingen op 1 januari 2024 in totaal meer waard dan €\u00a073.904?')
  })
})

describe('sleutels (taak 10 punt 7)', () => {
  const o = bouw(voorbeeld2024())

  it('passen op de tekens van de aangiftestaat en zijn uniek per persoon', () => {
    for (const p of ['A', 'B'] as const) {
      const eigen = o.schermen.filter((s) => s.persoon === p || (s.persoon === 'samen' && p === o.samenBij))
      const sleutels = eigen.flatMap((s) => s.rubrieken.flatMap((r) => r.velden.map((v) => v.sleutel)))
      for (const k of sleutels) expect(k).toMatch(/^[A-Za-z0-9:/._-]+$/)
      expect(new Set(sleutels).size).toBe(sleutels.length)
    }
  })

  it('gebruiken de vaste id van een item, nooit de index', () => {
    const sleutels = velden(o).map((v) => v.sleutel)
    expect(sleutels).toContain('kleinschaligheidsinvesteringsaftrek:o-ond-1/investering:inv-2/kiainvbedr')
    for (const k of sleutels) expect(k).not.toMatch(/:\d+(\/|$)/)
  })
})

describe('indeling per jaar (taak 10 punt 8)', () => {
  it('2024, 2025 en 2026 hebben een eigen indeling', () => {
    expect(indelingVoor(2024)).toMatchObject({ indeling: { aangiftejaar: 2024, status: 'nagekeken', nagekekenOp: '2026-10-05' }, meldingen: [] })
    expect(indelingVoor(2025)).toMatchObject({ indeling: { aangiftejaar: 2025, status: 'nagekeken' }, meldingen: [] })
    expect(indelingVoor(2026)).toMatchObject({ indeling: { aangiftejaar: 2026, status: 'verwacht' }, meldingen: [] })
  })

  it('2021 tot en met 2023 vallen terug op 2024, 2027 en 2028 op 2026, met een melding', () => {
    for (const jaar of [2021, 2022, 2023]) {
      const { indeling, meldingen } = indelingVoor(jaar)
      expect(indeling.aangiftejaar).toBe(2024)
      expect(meldingen).toEqual([`Voor ${jaar} gebruikt de tool de volgorde van de aangifte over 2024. Het programma van ${jaar} kan op details afwijken.`])
    }
    for (const jaar of [2027, 2028]) {
      const { indeling, meldingen } = indelingVoor(jaar)
      expect(indeling.aangiftejaar).toBe(2026)
      expect(meldingen).toHaveLength(1)
      expect(meldingen[0]).toContain(`De aangifte over ${jaar} bestaat nog niet`)
    }
  })

  it('de opbouw van 2022 neemt de melding over en vult de jaartallen van 2022 in', () => {
    const o = bouw(voorbeeld2024(), 2022)
    expect(o.aangiftejaar).toBe(2024)
    expect(o.meldingen).toHaveLength(1)
    expect(veld(o, 'woningen/woz').label).toBe('WOZ-waarde in 2022 (peildatum 1 januari 2021)')
  })

  it('werkelijk rendement: 2024 apart formulier (melding), 2025 een vraag in de aangifte (uit de params)', () => {
    expect(scherm(bouw(voorbeeld2024(), 2024), 'werkelijk-rendement').melding?.tekst).toContain('Opgaaf werkelijk rendement')
    const s2025 = scherm(bouw(voorbeeld2024(), 2025), 'werkelijk-rendement')
    expect(s2025.melding).toBeNull()
    expect(s2025.rubrieken[0].velden[0].label).toBe('Wilt u in deze aangifte het werkelijk rendement in box 3 van u en Persoon B aangeven over 2025?')
  })
})

describe('bronbelasting defensief (taak 10 punt 9)', () => {
  it('het oude veld geeft één regel met land DE en de hint over het verrekenbare deel', () => {
    const x = voorbeeld2024()
    const p = x.box3.posities.find((y) => y.id === 'beleggingen')!
    delete p.bronbelastingen
    p.bronbelasting = { land: 'Duitsland', brutoInkomsten: 100, bedrag: 26 }
    const s = scherm(bouw(x), 'beleggingen')
    const regels = s.rubrieken.filter((r) => r.id.startsWith('buitenlandse-belasting:'))
    expect(regels).toHaveLength(1)
    const land = regels[0].velden.find((v) => v.id === 'land')!
    const btl = regels[0].velden.find((v) => v.id === 'btl')!
    expect(land.waarde).toEqual({ soort: 'antwoord', antwoord: 'DE' })
    expect(regels[0].titel).toBe('Beleggingsrekening · DE')
    const uitkomst = berekenHuishouden(x).box3.bronbelastingRegels
    if (!uitkomst) {
      expect(btl.waarde).toEqual({ soort: 'bedrag', bedrag: 26 })
      expect(btl.hint).toContain('Het verrekenbare deel rekent de tool zodra de bronbelasting per land klaar is')
    } else {
      // Na de integratie met onderdeel 5: het verrekenbare bedrag uit de uitkomst.
      const u = uitkomst.find((y) => y.positieId === 'beleggingen')!
      expect(btl.waarde).toEqual({ soort: 'bedrag', bedrag: Math.round(u.verrekenbaar) })
    }
    expect(regels[0].velden.find((v) => v.id === 'div')?.waarde).toEqual({ soort: 'bedrag', bedrag: 100 })
  })
})
