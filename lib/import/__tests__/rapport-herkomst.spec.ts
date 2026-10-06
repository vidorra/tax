/**
 * Ronde 2 (A4), test 9: het tabblad Invoer van het Excel-rapport bevat geen `herkomst` en geen rekeningsleutel van een
 * broker-import; de bedragen van de bezitting staan er wel in.
 */
import { describe, expect, it } from 'vitest'
import { leegInvoer } from '@/lib/dossier/leeg'
import { rapportWerkmap } from '@/components/dossier/rapport-xlsx'
import { voorbeeldRapport } from '@/components/dossier/__tests__/rapport-voorbeeld'
import { maakVoorstel, pasVoorstelToe } from '../voorstel'
import { zonderHerkomst } from '../privacy'
import { lees } from './hulp'

describe('9. Excel: herkomst niet in het tabblad Invoer', () => {
  const sleutel = 'degiro:0123456789abcdef'
  const uitkomsten = ['degiro-rekeningoverzicht-2025-nl.csv', 'degiro-portefeuille-2024-12-31-nl.csv'].map((f) => lees(f, sleutel))
  const invoer = pasVoorstelToe(leegInvoer(2025), maakVoorstel(uitkomsten, { invoer: leegInvoer(2025), jaar: 2025 })).invoer

  it('geen pad met herkomst, geen sleutel en geen bestandshash; wel de bedragen', () => {
    expect(invoer.box3.posities.every((p) => p.herkomst?.sleutel === sleutel)).toBe(true)
    const blad = rapportWerkmap([voorbeeldRapport()], { invoer }).bladen.find((b) => b.sheet === 'Invoer')!
    const tekst = JSON.stringify(blad.data)
    expect(tekst).not.toContain('herkomst')
    expect(tekst).not.toContain(sleutel)
    expect(tekst).not.toContain('0123456789abcdef')
    for (const b of invoer.box3.posities.flatMap((p) => p.herkomst?.bestanden ?? [])) expect(tekst).not.toContain(b.hash)
    expect(tekst).toContain('box3.posities[0].waardeBegin')
  })

  it('zonderHerkomst laat de invoer zelf ongemoeid', () => {
    const kopie = zonderHerkomst(invoer)
    expect(kopie.box3.posities.some((p) => 'herkomst' in p)).toBe(false)
    expect(invoer.box3.posities[0].herkomst).toBeDefined()
    const zonder = leegInvoer(2025)
    expect(zonderHerkomst(zonder)).toBe(zonder)
  })
})
