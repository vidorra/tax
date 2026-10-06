/**
 * Ronde 2 (A3): elke regel van A3 met een positief en een negatief geval (taak-A3 hoofdstuk 5 en 12), met vaste id's.
 */
import { describe, expect, it } from 'vitest'
import { nieuwJaarUitVorig } from '@/lib/dossier/nieuw-jaar'
import { getJaar } from '@/lib/tax/years'
import type { ActiefInvoer, HuishoudenInvoer } from '@/lib/tax/types'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import {
  desinvesteringPctRegel,
  geboortedatumRegel,
  jaarruimteRegel,
  legeVerplichteVelden,
  ondernemingenMaxRegel,
  partnerZonderBRegel,
  tegenbewijsEindRegel,
  tegenbewijsLoontRegel,
  urencriteriumUrenRegel,
  verplichtLeegRegel,
} from '../regels/invoer'
import { beginbalansRegel } from '../regels/jaarrekening'
import { levensduurRegel, saldiVorigJaarRegel } from '../regels/doorrol'
import { ingediendGewijzigdRegel, ingediendMetFouten } from '../regels/status'
import { paramsNietDefinitiefRegel } from '../regels/parameters'
import { controleer, controleerAlles, verborgenMeldingen, zonderVerborgenMeldingen } from '../index'
import { REGELS } from '../regels'
import { ctx, invoer, metJaarrekening, onderneming, reken } from './hulp'

const voorbeeld = (): HuishoudenInvoer => voorbeeldInvoer(2024)
const opgelost = (i: HuishoudenInvoer, pas: ((d: HuishoudenInvoer) => void) | undefined) => {
  const kopie = structuredClone(i)
  pas!(kopie)
  return kopie
}

describe('geboortedatum', () => {
  it('fout zonder geboortedatum, niet te negeren; met datum niets', () => {
    const i = invoer()
    expect(geboortedatumRegel(ctx(i))).toEqual([])
    i.personen[0].geboortedatum = ''
    const [c] = geboortedatumRegel(ctx(i, { resultaat: null }))
    expect(c).toMatchObject({ id: 'geboortedatum:A', ernst: 'fout', negeren: 'nee', vingerafdruk: 'leeg', veld: 'persoon:A/geboortedatum', persoon: 'A' })
    expect(c.uitleg).toBe('Zonder geboortedatum kan de tool de AOW-leeftijd en de heffingskortingen van Persoon A niet bepalen.')
  })
})

describe('partner-zonder-b', () => {
  it('fiscaal partner zonder persoon B: fout met snelle oplossing; met B niets', () => {
    const i = invoer(2025, { fiscaalPartner: true })
    const [c] = partnerZonderBRegel(ctx(i, { resultaat: null }))
    expect(c).toMatchObject({ id: 'partner-zonder-b', ernst: 'fout', negeren: 'nee', veld: 'huishouden/fiscaalPartner', vingerafdruk: 'persoon B' })
    const met = opgelost(i, c.oplossing?.pas)
    expect(met.personen.map((p) => p.id)).toEqual(['A', 'B'])
    expect(partnerZonderBRegel(ctx(met))).toEqual([])
    expect(partnerZonderBRegel(ctx(invoer()))).toEqual([])
  })
})

describe('verplicht-leeg', () => {
  it('lege namen en omschrijvingen: één fout met hooguit vijf velden; niet te negeren', () => {
    const i = invoer()
    expect(verplichtLeegRegel(ctx(i))).toEqual([])
    i.personen[0].ondernemingen[0].naam = ''
    i.personen[0].loon = [{ id: 'loon-1', omschrijving: ' ', soort: 'loon', bruto: 1000, ingehoudenLoonheffing: 0 }]
    i.box3.posities = Array.from({ length: 5 }, (_, k) => ({ id: `pos-${k}`, omschrijving: '', categorie: 'bankNL' as const, eigenaar: 'A' as const, waardeBegin: 100 }))
    expect(legeVerplichteVelden(i)).toHaveLength(7)
    const [c] = verplichtLeegRegel(ctx(i))
    expect(c).toMatchObject({ id: 'verplicht-leeg', ernst: 'fout', negeren: 'nee', titel: '7 verplichte velden zijn leeg', veld: 'persoon:A/onderneming:ond-1/naam', gebied: 'onderneming' })
    expect(c.velden).toHaveLength(5)
    expect(c.velden?.[1]).toEqual({ veld: 'persoon:A/loon:loon-1/omschrijving', label: 'Omschrijving van loon of uitkering 1' })
    expect(c.uitleg).toMatch(/; en nog 2\.$/)
    // De vingerafdruk volgt de paden, niet de volgorde.
    expect(c.vingerafdruk.split('|')).toHaveLength(7)
  })
})

describe('desinvestering-pct', () => {
  const bus = (x: Partial<ActiefInvoer> = {}): ActiefInvoer => ({
    omschrijving: 'Bus',
    aanschafdatum: '2022-03-01',
    aanschafwaarde: 20000,
    restwaarde: 0,
    levensduurJaren: 5,
    methode: 'lineair',
    herkomst: 'act:2022:1',
    verkocht: { datum: '2025-06-01', verkoopprijs: 9000 },
    ...x,
  })
  const met = (a: ActiefInvoer) => {
    const i = invoer(2025)
    i.personen[0].ondernemingen[0].activa = [a]
    return i
  }

  it('verkoop binnen de termijn zonder investeringsaftrek: fout met de oplossing "geen investeringsaftrek"', () => {
    const i = met(bus())
    const [c] = desinvesteringPctRegel(ctx(i))
    expect(c).toMatchObject({ id: 'desinvestering-pct:A:ond-1:act:2022:1', ernst: 'fout', negeren: 'nee', vingerafdruk: 'actief=act:2022:1', veld: 'persoon:A/onderneming:ond-1/activa:0/verkocht.verkoopprijs' })
    const kopie = opgelost(i, c.oplossing?.pas)
    expect(kopie.personen[0].ondernemingen[0].activa![0].investeringsaftrek).toEqual({ regeling: 'kia', jaar: 2022, genotenPct: 0 })
    expect(desinvesteringPctRegel(ctx(kopie))).toEqual([])
  })

  it('niet bij vastgelegde aftrek, buiten de termijn, onder de drempel, een goedkoop middel of met een regel in de lijst', () => {
    expect(desinvesteringPctRegel(ctx(met(bus({ investeringsaftrek: { regeling: 'kia', jaar: 2022, genotenPct: 0.28 } }))))).toEqual([])
    expect(desinvesteringPctRegel(ctx(met(bus({ aanschafdatum: '2019-03-01' }))))).toEqual([])
    expect(desinvesteringPctRegel(ctx(met(bus({ verkocht: { datum: '2025-06-01', verkoopprijs: 500 } }))))).toEqual([])
    expect(desinvesteringPctRegel(ctx(met(bus({ aanschafwaarde: 300 }))))).toEqual([])
    expect(desinvesteringPctRegel(ctx(met(bus({ verkocht: { datum: '2024-06-01', verkoopprijs: 9000 } }))))).toEqual([])
    const i = met(bus())
    i.personen[0].ondernemingen[0].desinvesteringen = [{ omschrijving: 'bus', verkoopprijs: 9000, investeringsjaar: 2022, genotenPct: 0.28 }]
    expect(desinvesteringPctRegel(ctx(i))).toEqual([])
  })
})

describe('tegenbewijs-eind', () => {
  const pos = (id: string, waardeEind?: number) => ({ id, omschrijving: `Rekening ${id}`, categorie: 'bankNL' as const, eigenaar: 'A' as const, waardeBegin: 1000, ...(waardeEind !== undefined ? { waardeEind } : {}) })
  it('tegenbewijs aan en een eindwaarde leeg: fout op de eerste positie', () => {
    const i = invoer(2024, { box3: { posities: [pos('p1', 1000), pos('p2'), pos('p3')], schulden: [], tegenbewijs: true } })
    const [c] = tegenbewijsEindRegel(ctx(i))
    expect(c).toMatchObject({ id: 'tegenbewijs-eind', ernst: 'fout', negeren: 'nee', vingerafdruk: 'p2|p3', veld: 'box3/positie:p2/waardeEind', titel: 'Waarde op 1 januari 2025 ontbreekt' })
    expect(c.velden).toHaveLength(2)
  })
  it('niets zonder tegenbewijs of als alle eindwaarden er zijn', () => {
    expect(tegenbewijsEindRegel(ctx(invoer(2024, { box3: { posities: [pos('p2')], schulden: [] } })))).toEqual([])
    expect(tegenbewijsEindRegel(ctx(invoer(2024, { box3: { posities: [pos('p1', 900)], schulden: [], tegenbewijs: true } })))).toEqual([])
  })
})

describe('ondernemingen-max', () => {
  it('vier ondernemingen bij één persoon: let op; drie niet', () => {
    const i = invoer()
    i.personen[0].ondernemingen = [1, 2, 3].map((n) => onderneming({ id: `ond-${n}`, naam: `Zaak ${n}` }))
    expect(ondernemingenMaxRegel(ctx(i))).toEqual([])
    i.personen[0].ondernemingen.push(onderneming({ id: 'ond-4', naam: 'Zaak 4' }))
    const [c] = ondernemingenMaxRegel(ctx(i))
    expect(c).toMatchObject({ id: 'ondernemingen-max:A', ernst: 'let-op', negeren: 'gezien', vingerafdruk: 'aantal=4', sectie: 'ondernemingen-A', veld: null })
    expect(c.uitleg).toBe('Het online programma kent hooguit drie ondernemingen per persoon. Bij Persoon A staan er 4.')
  })
})

describe('urencriterium-uren', () => {
  it('ja opgegeven met te weinig uren: let op met de tekst van de module, die niet ook bij Meldingen staat', () => {
    const i = invoer()
    i.personen[0].ondernemingen[0].uren = { onderneming: 600, urencriteriumGehaald: true }
    const r = reken(i)!
    const [c] = urencriteriumUrenRegel(ctx(i, { resultaat: r }))
    expect(c).toMatchObject({ id: 'urencriterium-uren:A:ond-1', ernst: 'let-op', negeren: 'gezien', vingerafdruk: 'uren=600', veld: 'persoon:A/onderneming:ond-1/uren.onderneming' })
    expect(c.uitleg).toMatch(/ingevulde uren wijzen op het tegendeel/)
    const verborgen = verborgenMeldingen(controleer(ctx(i, { resultaat: r })))
    expect(verborgen.has(c.melding!)).toBe(true)
    const zonder = zonderVerborgenMeldingen(r, verborgen)
    expect(zonder.personen.flatMap((p) => p.waarschuwingen).some((w) => w.id === c.melding)).toBe(false)
    expect(r.personen.flatMap((p) => p.waarschuwingen).some((w) => w.id === c.melding)).toBe(true)
  })
  it('niets met genoeg uren of zonder uren', () => {
    const i = invoer()
    i.personen[0].ondernemingen[0].uren = { onderneming: 1400, urencriteriumGehaald: true }
    expect(urencriteriumUrenRegel(ctx(i))).toEqual([])
    expect(urencriteriumUrenRegel(ctx(invoer()))).toEqual([])
  })
})

describe('tegenbewijs-loont en jaarruimte (info)', () => {
  it('tegenbewijs loont: info uit de melding van box 3; anders niets', () => {
    const i = invoer(2024, { box3: { posities: [{ id: 'p1', omschrijving: 'Spaarrekening', categorie: 'bankNL', eigenaar: 'A', waardeBegin: 200000, waardeEind: 200000, stortingen: 0, onttrekkingen: 0, directeOpbrengsten: 0 }], schulden: [] } })
    const [c] = tegenbewijsLoontRegel(ctx(i))
    expect(c).toMatchObject({ id: 'tegenbewijs-loont', ernst: 'info', sectie: 'vermogen', melding: 'box3-tegenbewijs-loont' })
    expect(tegenbewijsLoontRegel(ctx(invoer(2024)))).toEqual([])
  })
  it('openstaande jaarruimte: info per persoon met het bedrag en een link naar de planning', () => {
    const [c] = jaarruimteRegel(ctx(voorbeeld()))
    expect(c).toMatchObject({ id: 'jaarruimte:A', ernst: 'info', href: '/dossier/2024/planning/#jaarruimte', linkLabel: 'Naar de planning', melding: 'lijfrente.openstaand' })
    expect(c.titel).toMatch(/^Nog € [\d.]+ lijfrenteruimte$/)
    expect(jaarruimteRegel(ctx(invoer()))).toEqual([])
  })
})

describe('beginbalans', () => {
  it('beginbalans wijkt af van de eindbalans van vorig jaar: let op met de oplossing om die over te nemen', () => {
    const vorig = metJaarrekening(35000, undefined, 2024)
    const i = metJaarrekening(35000)
    i.personen[0].ondernemingen[0].jaarrekening!.begin = { ...vorig.personen[0].ondernemingen[0].jaarrekening!.eind, liquideMiddelen: 17500 }
    const [c] = beginbalansRegel(ctx(i, { vorig }))
    expect(c).toMatchObject({ id: 'beginbalans:A:ond-1', ernst: 'let-op', negeren: 'gezien', veld: 'persoon:A/onderneming:ond-1/jaarrekening.begin.liquideMiddelen', vingerafdruk: 'liquideMiddelen=-500' })
    expect(c.uitleg).toBe('De beginbalans van Ontwerpstudio wijkt af van de eindbalans van 2024: liquide middelen € 17.500 tegen € 18.000.')
    expect(c.oplossing?.label).toBe('Neem de eindbalans van 2024 over')
    expect(beginbalansRegel(ctx(opgelost(i, c.oplossing?.pas), { vorig }))).toEqual([])
  })
  it('niets zonder vorig jaar of zonder balans', () => {
    expect(beginbalansRegel(ctx(metJaarrekening(35000)))).toEqual([])
    expect(beginbalansRegel(ctx(invoer(), { vorig: invoer(2024) }))).toEqual([])
  })
})

describe('saldi-vorig-jaar', () => {
  it('een doorgerold saldo wijkt af: let op met de actie opnieuw overnemen; gelijk niets', () => {
    const vorig = voorbeeld()
    const nieuw = nieuwJaarUitVorig(vorig, 2025, reken(vorig)!)
    expect(saldiVorigJaarRegel(ctx(nieuw, { vorig }))).toEqual([])
    nieuw.personen[0].ondernemingen[0].for = { ...nieuw.personen[0].ondernemingen[0].for!, stand: 1 }
    const [c] = saldiVorigJaarRegel(ctx(nieuw, { vorig }))
    expect(c).toMatchObject({ id: 'saldi-vorig-jaar', ernst: 'let-op', negeren: 'gezien', sectie: 'saldi-vorig-jaar', oplossing: { actie: 'saldi-opnieuw-overnemen' } })
    expect(c.vingerafdruk).toMatch(/Oudedagsreserve begin/)
    expect(saldiVorigJaarRegel(ctx(nieuw))).toEqual([])
  })
})

describe('levensduur', () => {
  it('doorgerolde middelen uit een investering: let op; bevestigen zet ze op handmatig', () => {
    const i = invoer()
    const a: ActiefInvoer = { omschrijving: 'Laptop', aanschafdatum: '2024-07-15', aanschafwaarde: 3000, restwaarde: 0, levensduurJaren: 3, methode: 'lineair', bron: 'investering', herkomst: 'inv:2024:1' }
    i.personen[0].ondernemingen[0].activa = [a, { ...a, omschrijving: 'Scherm', herkomst: 'inv:2024:2' }, { ...a, omschrijving: 'Kast', bron: 'handmatig', herkomst: 'act:2023:1' }]
    const [c] = levensduurRegel(ctx(i))
    expect(c).toMatchObject({ id: 'levensduur:A:ond-1', ernst: 'let-op', negeren: 'gezien', vingerafdruk: 'inv:2024:1|inv:2024:2', veld: 'persoon:A/onderneming:ond-1/activa:0/levensduurJaren' })
    expect(c.oplossing?.label).toBe('Bevestig 3 jaar')
    expect(levensduurRegel(ctx(opgelost(i, c.oplossing?.pas)))).toEqual([])
  })
})

describe('status', () => {
  it('ingediend-gewijzigd alleen bij Ingediend met wijzigingen na het indienen', () => {
    const i = invoer()
    const op = '2026-05-01T10:00:00.000Z'
    const [c] = ingediendGewijzigdRegel(ctx(i, { status: 'ingediend', ingediend: { op, gewijzigdNa: true } }))
    expect(c).toMatchObject({ id: 'ingediend-gewijzigd', ernst: 'let-op', negeren: 'gezien', vingerafdruk: `op=${op}` })
    expect(c.uitleg).toBe('Je hebt dit jaar als ingediend gemarkeerd. Een wijziging na het indienen geef je door met een aanvulling of bezwaar bij de Belastingdienst.')
    expect(ingediendGewijzigdRegel(ctx(i, { status: 'ingediend', ingediend: { op, gewijzigdNa: false } }))).toEqual([])
    expect(ingediendGewijzigdRegel(ctx(i, { status: 'concept', ingediend: { op, gewijzigdNa: true } }))).toEqual([])
  })

  it('controleerAlles voegt ingediend-met-fouten toe bij Ingediend met open fouten, niet in een concept', () => {
    const i = metJaarrekening(34700)
    const ingediend = controleerAlles(ctx(i, { status: 'ingediend', ingediend: { op: '2026-05-01T10:00:00.000Z', gewijzigdNa: false } }))
    expect(ingediend.open.map((c) => c.id)).toContain('ingediend-met-fouten')
    expect(ingediend.open.find((c) => c.id === 'ingediend-met-fouten')).toMatchObject({ ernst: 'let-op', vingerafdruk: 'aantal=1' })
    expect(ingediend.exportConcept).toBe(false)
    expect(ingediend.exportIngediendOpen).toBe(1)
    const concept = controleerAlles(ctx(i))
    expect(concept.open.map((c) => c.id)).not.toContain('ingediend-met-fouten')
    expect(concept.exportConcept).toBe(true)
    expect(concept.exportIngediendOpen).toBe(0)
    // Zonder fouten bij Ingediend: niets extra.
    expect(controleerAlles(ctx(metJaarrekening(35000), { status: 'ingediend' })).open.map((c) => c.id)).not.toContain('ingediend-met-fouten')
    expect(ingediendMetFouten(2).uitleg).toMatch(/nog 2 fouten openstaan/)
  })
})

describe('params-niet-definitief', () => {
  it('Gecontroleerd of Ingediend in een jaar met voorlopige cijfers: let op; concept of definitief niets', () => {
    const i = invoer(2026)
    expect(getJaar(2026).status).not.toBe('definitief')
    const [c] = paramsNietDefinitiefRegel(ctx(i, { status: 'gecontroleerd' }))
    expect(c).toMatchObject({ id: 'params-niet-definitief', ernst: 'let-op', href: '/2026/', linkLabel: 'Bekijk de status' })
    expect(c.vingerafdruk).toMatch(/^status=gecontroleerd\|params=/)
    expect(paramsNietDefinitiefRegel(ctx(i))).toEqual([])
    expect(paramsNietDefinitiefRegel(ctx(invoer(2025), { status: 'ingediend' }))).toEqual([])
  })
})

describe('REGELS', () => {
  it('voorbeeld 2024: geen fouten, alleen let op en info; een regel die gooit breekt niets', () => {
    const u = controleer(ctx(voorbeeld()), REGELS)
    expect(u.telling.fouten).toBe(0)
    expect(u.open.every((c) => c.ernst !== 'fout')).toBe(true)
    const kapot = () => {
      throw new Error('halve invoer')
    }
    expect(controleer(ctx(voorbeeld()), [kapot, ...REGELS]).alle.length).toBe(u.alle.length)
  })
})
