/**
 * Ronde 2 (A3): het veldregister van de basissecties (lib/dossier/veldregister/basis.ts) tegen de editor zelf.
 *
 * De secties worden op de server gerenderd (react-dom/server, zonder browser) met de voorbeeldaangifte 2024, aangevuld
 * met een kind met opvang, loon en een jaarrekening, zodat elk veld minstens één keer voorkomt. Dan:
 *  - elk patroon in basis.ts past op een `data-veld` die de editor echt rendert;
 *  - elke `data-veld` in de basissecties staat in het veldregister (geen veld zonder label);
 *  - naam en saldo van de onderneming uit het contract staan erin;
 *  - basis.ts registreert geen velden van een ander onderdeel (ontwerp 6.4: één eigenaar per veld);
 *  - `instanties()` (het zoekveld) vindt alleen veld-id's die de editor rendert.
 */
import * as React from 'react'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { HuishoudenInvoer, PersoonId } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { berekenHuishouden } from '@/lib/tax/engine'
import { HuishoudenSectie } from '@/components/dossier/secties/HuishoudenSectie'
import { OndernemingSectie } from '@/components/dossier/secties/OndernemingSectie'
import { LoonSectie, PensioenSectie } from '@/components/dossier/secties/PersoonInkomenSecties'
import { PgaSectie, VerdelingSectie } from '@/components/dossier/secties/HuishoudenPostenSecties'
import { PersoonVeldProvider } from '@/components/dossier/controles/veld-context'
import { vulIds } from '../ids'
import { BASIS_VELDEN } from '../veldregister/basis'
import { VELDREGISTER } from '../veldregister'
import { instanties, matchPatroon, opPagina } from '../zoeken'

function invoer(): HuishoudenInvoer {
  const i = vulIds(voorbeeldInvoer(2024))
  i.kinderen = [{ id: 'kind-1', naam: 'Kind', geboortedatum: '2022-03-01', inHuishoudenVanaf: '2022-03-01', coOuderschap: { dagenInHuishouden: 180 }, opvang: [{ soort: 'dagopvang', urenPerMaand: 80, uurtarief: 9.5, maanden: 12, startdatum: '2023-01-01' }, { soort: 'bso', urenPerMaand: 0, urenTotaal: 289.6, uurtarief: 9.5, maanden: 3 }] }]
  const a = i.personen[0]
  a.loon = [{ id: 'loon-1', omschrijving: 'Acme BV', soort: 'loon', bruto: 1000, ingehoudenLoonheffing: 100, zvwBijdrageloon: 1000 }]
  a.inkomensvoorziening.pensioencorrectieVorigJaar = { type: 'factorA', bedrag: 500 }
  a.ondernemingen[0].jaarrekening = {
    omschrijvingActiviteiten: 'Ontwerp',
    begin: { liquideMiddelen: 1000 },
    eind: { liquideMiddelen: 2000 },
    specificaties: [{ post: 'overigeVorderingen', omschrijving: 'Borg', begin: 0, eind: 0 }],
    mva: { aanschafwaarde: 100, restwaarde: 10 },
    onttrekkingen: [{ omschrijving: 'Privé', bedrag: 100 }],
    stortingen: [{ omschrijving: 'Storting', bedrag: 50 }],
    winstEnVerlies: [{ rubriek: 'omzet', bedrag: 1000 }],
  } as NonNullable<HuishoudenInvoer['personen'][number]['ondernemingen'][number]['jaarrekening']>
  i.pga = { giftenGewoon: 100 }
  return i
}

// De componenten worden door vitest (esbuild) met de klassieke JSX-omzetting geladen: die verwacht React als globale.
;(globalThis as { React?: unknown }).React = React

function gerenderd(i: HuishoudenInvoer): string[] {
  const resultaat = berekenHuishouden(i)
  const niets = () => undefined
  const delen: ReactElement[] = [
    h(HuishoudenSectie, { invoer: i, wijzig: niets }),
    h(PgaSectie, { invoer: i, wijzig: niets }),
    h(VerdelingSectie, { invoer: i, wijzig: niets, gekozen: resultaat.verdeling }),
  ]
  for (const p of i.personen) {
    const props = { persoon: p, wijzigPersoon: niets, jaar: i.jaar, huishouden: { invoer: i, wijzig: niets, resultaat } }
    const kinderen = h(
      React.Fragment,
      null,
      h(OndernemingSectie, { ...props, resultaat: resultaat.personen.find((x) => x.id === p.id) ?? null }),
      h(LoonSectie, props),
      h(PensioenSectie, props),
    )
    delen.push(h(PersoonVeldProvider, { persoon: p.id as PersoonId, children: kinderen }))
  }
  const html = delen.map((d) => renderToStaticMarkup(d)).join('\n')
  return [...new Set([...html.matchAll(/data-veld="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))]
}

describe('veldregister basis.ts tegen de editor', () => {
  const i = invoer()
  const ids = gerenderd(i)

  it('rendert veld-id\'s', () => {
    expect(ids.length).toBeGreaterThan(50)
  })

  it('naam en saldo van de onderneming uit het contract', () => {
    expect(ids).toContain('persoon:A/onderneming:ond-1/winstberekening.saldo')
    expect(ids).toContain('persoon:A/onderneming:ond-1/naam')
    expect(ids).toContain('persoon:A/geboortedatum')
    expect(ids).toContain('persoon:B/geboortedatum')
    expect(ids).toContain('persoon:A/onderneming:ond-1/jaarrekening.eind.liquideMiddelen')
    expect(ids).toContain('persoon:A/loon:loon-1/ingehoudenLoonheffing')
    expect(ids).toContain('kind:kind-1/opvang:0/uurtarief')
  })

  it('elk patroon in basis.ts past op een veld dat de editor rendert', () => {
    const zonder = BASIS_VELDEN.filter((v) => !ids.some((id) => matchPatroon(v.patroon, id))).map((v) => v.patroon)
    expect(zonder).toEqual([])
  })

  it('elk veld van de basissecties staat in het veldregister (basis.ts of het register van de eigenaar)', () => {
    const zonder = ids.filter((id) => !VELDREGISTER.some((v) => matchPatroon(v.patroon, id)))
    expect(zonder).toEqual([])
  })

  it('basis.ts registreert geen velden van een ander onderdeel', () => {
    const vreemd = BASIS_VELDEN.map((v) => v.patroon).filter((p) => {
      if (/^(eigenWoning|box3|box2)(\/|:)/.test(p)) return true // A2 en A5
      if (/voorlopigeAanslag|verliezen|nietBenutteZelfstandigenaftrek|restantPga|voortgewenteld|stakingslijfrente/.test(p)) return true // A2, A5, A6
      const o = /^persoon:\*\/onderneming:\*\/(.+)$/.exec(p)
      return o ? !(o[1] === 'naam' || o[1] === 'winstberekening.saldo' || o[1].startsWith('jaarrekening.')) : false
    })
    expect(vreemd).toEqual([])
  })

  it('het zoekveld vindt alleen velden die de editor rendert', () => {
    const missend = BASIS_VELDEN.flatMap((v) => instanties(v.patroon, i).filter((m) => opPagina(v, m, i)).map((m) => m.id)).filter((id) => !ids.includes(id))
    expect(missend).toEqual([])
  })
})
