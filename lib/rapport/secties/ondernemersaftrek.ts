/**
 * Hoofdstuk 6 Ondernemersaftrek (spec 6.1, koppeling hoofdstuk 8): het recht op zelfstandigenaftrek, het deel
 * dat dit jaar is benut en de niet-benutte zelfstandigenaftrek die doorschuift. Het verloop van eerdere jaren
 * (verrekend, vervallen, resterend) komt uit de engine (`ondernemersaftrek.nietBenutOverzicht`); het rapport
 * telt alleen op.
 */
import type { Sectie } from '../model'
import { groepskop, post, sectie, som, subtotaal, tabel, uit, type MogelijkeRegel, type RapportContext } from './bouwstenen'

export function hoofdstukOndernemersaftrek(c: RapportContext): Sectie | null {
  if (c.pi.ondernemingen.length === 0) return null
  const oa = c.p.ondernemersaftrek
  const P = '6.1'
  const eerder = oa.nietBenutOverzicht ?? []
  const pad = (i: number, veld: string) => uit(c, `ondernemersaftrek.nietBenutOverzicht[${i}].${veld}`)
  const vervallen = som(eerder.map((x) => x.vervallen))
  const regels: MogelijkeRegel[] = [
    post(`${P}.recht`, 'Zelfstandigenaftrek', { B: oa.zelfstandigenaftrek + oa.nietBenutteZelfstandigenaftrekNieuw }, {
      herkomst: `${uit(c, 'ondernemersaftrek.zelfstandigenaftrek')} + ${uit(c, 'ondernemersaftrek.nietBenutteZelfstandigenaftrekNieuw')}`,
    }),
    post(`${P}.benut`, 'In aanmerking genomen zelfstandigenaftrek dit jaar', { B: -oa.zelfstandigenaftrek }, { herkomst: `-${uit(c, 'ondernemersaftrek.zelfstandigenaftrek')}` }),
    subtotaal(`${P}.niet-benut`, 'Niet-benutte zelfstandigenaftrek', { C: oa.nietBenutteZelfstandigenaftrekNieuw }, {
      streepBoven: ['B'],
      herkomst: uit(c, 'ondernemersaftrek.nietBenutteZelfstandigenaftrekNieuw'),
    }),
    ...(eerder.length > 0
      ? [
          groepskop(`${P}.eerder.kop`, 'Niet-benutte zelfstandigenaftrek uit eerdere jaren', { witVoor: 1 }),
          ...eerder.map((x, i) => post(`${P}.eerder.${x.jaar}${eerder.filter((y) => y.jaar === x.jaar).length > 1 ? `-${i + 1}` : ''}`, `Uit ${x.jaar}`, { B: x.begin }, { herkomst: pad(i, 'begin') })),
          post(`${P}.eerder.verrekend`, 'Verrekend dit jaar', { B: -oa.verrekendNietBenut }, { herkomst: `-${uit(c, 'ondernemersaftrek.verrekendNietBenut')}` }),
          vervallen !== 0 &&
            post(`${P}.eerder.vervallen`, 'Vervallen (verrekentermijn voorbij)', { B: -vervallen }, { herkomst: `-som(${uit(c, 'ondernemersaftrek.nietBenutOverzicht[].vervallen')})` }),
          subtotaal(`${P}.eerder.resterend`, 'Resterend uit eerdere jaren', { C: som(eerder.map((x) => x.rest)) }, {
            streepBoven: ['B'],
            herkomst: `som(${uit(c, 'ondernemersaftrek.nietBenutOverzicht[].rest')})`,
          }),
        ]
      : []),
  ]
  return sectie('Ondernemersaftrek', 1, [], [sectie('Niet-benutte zelfstandigenaftrek', 2, [tabel(regels)])], { nieuwePagina: true })
}
