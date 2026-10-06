/**
 * Review ronde 2, bevinding 19: een mislukte opslag noemt het veld in gewone taal ("Geboortedatum (Persoon B): vul een
 * datum in.") met het veld om naartoe te springen, in plaats van "personen[1].geboortedatum: datum ontbreekt".
 */
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { vulIds } from '../ids'
import { leegInvoer } from '../leeg'
import { leesbareFout, padNaarVeld } from '../foutmelding'

const voorbeeld = (): HuishoudenInvoer => vulIds(voorbeeldInvoer(2024))

describe('validatiefouten in gewone taal', () => {
  it('pad wordt veld-id', () => {
    const i = voorbeeld()
    expect(padNaarVeld('personen[1].geboortedatum', i)).toBe('persoon:B/geboortedatum')
    expect(padNaarVeld('personen[0].ondernemingen[0].winstberekening.saldo', i)).toBe('persoon:A/onderneming:ond-1/winstberekening.saldo')
    expect(padNaarVeld('eigenWoning.woz', i)).toBe('eigenWoning/woz')
    i.kinderen = [{ id: 'kind-1', geboortedatum: '' }]
    expect(padNaarVeld('invoer.kinderen[0].geboortedatum', i)).toBe('kind:kind-1/geboortedatum')
    expect(leesbareFout('invoer.kinderen[0].geboortedatum: datum ontbreekt', i)).toEqual({ tekst: 'Geboortedatum van het kind (Kind 1): vul een datum in.', veld: 'kind:kind-1/geboortedatum' })
    expect(padNaarVeld('jaar', i)).toBeNull()
    expect(padNaarVeld('personen[9].naam', i)).toBeNull()
  })

  it('met label, plaats en de melding als opdracht', () => {
    const i = voorbeeld()
    expect(leesbareFout('personen[1].geboortedatum: datum ontbreekt', i)).toEqual({ tekst: 'Geboortedatum (Persoon B): vul een datum in.', veld: 'persoon:B/geboortedatum' })
    expect(leesbareFout('personen[0].ondernemingen[0].winstberekening.saldo: verplicht getal ontbreekt', i)).toEqual({
      tekst: 'Saldo fiscale winstberekening (Meubelmakerij, Persoon A): vul een bedrag in.',
      veld: 'persoon:A/onderneming:ond-1/winstberekening.saldo',
    })
    expect(leesbareFout('personen[0].geboortedatum: moet een datum zijn (JJJJ-MM-DD)', leegInvoer(2025))).toEqual({ tekst: 'Geboortedatum: vul een geldige datum in.', veld: 'persoon:A/geboortedatum' })
  })

  it('een pad zonder veld blijft leesbaar, zonder sprong', () => {
    expect(leesbareFout('jaar: moet een heel getal zijn', voorbeeld())).toEqual({ tekst: 'Moet een heel getal zijn (jaar).' })
    expect(leesbareFout('iets zonder pad', voorbeeld())).toEqual({ tekst: 'iets zonder pad' })
  })
})
