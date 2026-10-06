/**
 * Ronde 2 (A1): lezers van de pagina Aangifte invullen: lege invoer, de datum waarop de aangifte opent, het filter bij
 * het openen, een rij zoeken op sleutel en het moment van de opslag.
 */
import { describe, expect, it } from 'vitest'
import { leegInvoer, leegOnderneming } from '@/lib/dossier/leeg'
import type { InvulhulpVoortgang } from '../types'
import { aangifteOpent, beginFilter, invoerIsLeeg, nogNietOpen, opentZin, opslagMoment, vindRij } from '../pagina'
import { bouw, voorbeeld2024 } from './hulp'

describe('pagina Aangifte invullen', () => {
  it('een jaar zonder invoer is leeg; met een onderneming of een bankrekening niet', () => {
    const leeg = leegInvoer(2025)
    expect(invoerIsLeeg(leeg)).toBe(true)
    const metOnderneming = leegInvoer(2025)
    metOnderneming.personen[0].ondernemingen.push(leegOnderneming(2025))
    expect(invoerIsLeeg(metOnderneming)).toBe(false)
    const metBank = leegInvoer(2025)
    metBank.box3.posities.push({ id: 'p-1', categorie: 'bankNL', omschrijving: 'Spaarrekening', waarde: 1000 } as never)
    expect(invoerIsLeeg(metBank)).toBe(false)
    expect(invoerIsLeeg(voorbeeld2024())).toBe(false)
  })

  it('de aangifte opent op de dag uit de indeling in het jaar erna; daarvoor de zin, daarna niets', () => {
    expect(aangifteOpent(2026, '03-01')).toBe('2027-03-01')
    expect(aangifteOpent(2026, undefined)).toBeNull()
    expect(nogNietOpen(2026, '03-01', '2026-10-05')).toBe(true)
    expect(nogNietOpen(2025, '03-01', '2026-10-05')).toBe(false)
    expect(opentZin(2026, '03-01', '2026-10-05')).toBe('De aangifte over 2026 opent op 1 maart 2027.')
    expect(opentZin(2026, '03-01', '2027-03-01')).toBeNull()
  })

  it('filter bij het openen: Nog te doen als er al iets is afgevinkt, anders Alles', () => {
    const o = bouw(voorbeeld2024())
    expect(beginFilter(o, undefined, 'A')).toBe('alles')
    const v = o.schermen.flatMap((s) => s.rubrieken.flatMap((r) => r.velden)).find((x) => x.rij === 'invullen' && !x.leeg)!
    const voortgang: InvulhulpVoortgang = { velden: { A: { [v.sleutel]: { afgevinkt: { vingerafdruk: v.vingerafdruk, op: '2026-10-05T10:00:00.000Z' } } } } }
    expect(beginFilter(o, voortgang, 'A')).toBe('te-doen')
    // Een vinkje dat niet meer klopt (gewijzigd) telt niet als afgevinkt.
    const oud: InvulhulpVoortgang = { velden: { A: { [v.sleutel]: { afgevinkt: { vingerafdruk: 'iets anders', op: '2026-10-05T10:00:00.000Z' } } } } }
    expect(beginFilter(o, oud, 'A')).toBe('alles')
  })

  it('vindt een rij en een scherm op hun sleutel (voor #sleutel uit de controles)', () => {
    const o = bouw(voorbeeld2024())
    const v = o.schermen.flatMap((s) => s.rubrieken.flatMap((r) => r.velden))[3]
    const r = vindRij(o, v.sleutel)
    expect(r?.veld?.sleutel).toBe(v.sleutel)
    expect(v.sleutel.startsWith(`${r?.scherm.sleutel}/`)).toBe(true)
    expect(vindRij(o, 'overzicht:A')?.scherm.id).toBe('overzicht')
    expect(vindRij(o, 'bestaat-niet/x')).toBeNull()
  })

  it('moment van de opslag in Nederlandse tijd, ook in de zomer', () => {
    expect(opslagMoment('2026-10-04T12:02:00.000Z')).toEqual({ datum: '4 oktober', kort: '4 okt', tijd: '14:02' })
    expect(opslagMoment('2026-01-04T12:02:00.000Z')?.tijd).toBe('13:02')
    expect(opslagMoment('geen datum')).toBeNull()
    expect(opslagMoment(null)).toBeNull()
  })
})
