/**
 * Ronde 2 (A5): buitenlandse bronbelasting en de partnerregeling in het fiscaal rapport. Gebruikt op de markeringen
 * `rapport-bronbelasting-A5` (bijlage 4.4.1 en de landkolom in 3.2.1) en `verantwoording-regelingen-A5`.
 *
 * Alle lezers gaan via `bronbelastingRegels(positie)` (ook het oude veld `bronbelasting`) en de uitkomst
 * `r.box3.bronbelastingRegels`; ontbreekt die (een oude snapshot), dan rekenen we de regels met dezelfde functie als de
 * engine. De bijlage houdt de indeling van het accountantsrapport (per bezitting bronbelasting en inkomsten) en zet
 * daaronder één regel per land met bruto, ingehouden, verdragstarief en verrekenbaar.
 */
import type { Box3Pot, BronbelastingRegelUitkomst, VermogensPositie } from '@/lib/tax/types'
import { bronbelastingRegels } from '@/lib/tax/modules/box3/bronbelasting-invoer'
import { landVanRegel, verrekenbaarPerRegel } from '@/lib/tax/modules/box3/bronbelasting'
import { metPartner } from '@/lib/tax/modules/partner'
import type { Sectie } from '../model'
import { euro, percentage } from '../notatie'
import { kk, kopTekst, post, sectie, som, tabel, totaal, uit, type MogelijkeRegel, type RapportContext } from './bouwstenen'

/** De landen van een bezitting als tekst ('Verenigde Staten, Frankrijk'); leeg zonder bronbelasting. */
export function landenTekst(x: Pick<VermogensPositie, 'bronbelasting' | 'bronbelastingen'>): string {
  const namen = bronbelastingRegels(x)
    .map((r) => {
      const { code, land } = landVanRegel(r)
      return land?.naam ?? code
    })
    .filter((n) => n !== '')
  return [...new Set(namen)].join(', ')
}

/** De bronbelastingregels van de bezittingen in deze pot: uit de uitkomst, anders opnieuw gerekend. */
function regelsVanPot(c: RapportContext, pot: Box3Pot): BronbelastingRegelUitkomst[] {
  const uitUitkomst = c.r.box3.bronbelastingRegels
  if (uitUitkomst) return uitUitkomst.filter((r) => pot.positieIds.includes(r.positieId))
  return c.invoer.box3.posities
    .filter((x) => pot.positieIds.includes(x.id))
    .flatMap((x) => bronbelastingRegels(x).map((r) => verrekenbaarPerRegel(r, x, { params: c.P, jaar: c.jaar })))
}

interface PerLand {
  code: string
  naam: string
  bruto: number
  ingehouden: number
  verrekenbaar: number
  terug: number
  /** Eén tarief voor alle regels van dit land; undefined als ze verschillen; null als het onbekend is. */
  tarief: number | null | undefined
  buitenTabel: boolean
}

function perLand(regels: readonly BronbelastingRegelUitkomst[]): PerLand[] {
  const uitkomst = new Map<string, PerLand>()
  for (const r of regels) {
    const code = r.land || '?'
    const x = uitkomst.get(code)
    const tarief = r.verdragstarief
    if (!x) {
      uitkomst.set(code, {
        code,
        naam: r.landNaam ?? (r.land || 'Land onbekend'),
        bruto: r.bruto,
        ingehouden: r.ingehouden,
        verrekenbaar: r.verrekenbaar,
        terug: r.terugTeVragen,
        tarief,
        buitenTabel: r.tariefBron === 'buiten-tabel',
      })
      continue
    }
    x.bruto += r.bruto
    x.ingehouden += r.ingehouden
    x.verrekenbaar += r.verrekenbaar
    x.terug += r.terugTeVragen
    if (x.tarief !== tarief) x.tarief = undefined
  }
  return [...uitkomst.values()]
}

/** Bijlage 4.4.1 Voorkoming dubbele belasting (in de sectie Bijzondere situaties); null zonder bronbelasting. */
export function bronbelastingBijlage(c: RapportContext, pot: Box3Pot): Sectie | null {
  const posities = c.invoer.box3.posities
    .map((x, i) => ({ x, i, regels: bronbelastingRegels(x) }))
    .filter(({ x, regels }) => pot.positieIds.includes(x.id) && regels.some((r) => r.bedrag > 0))
  if (posities.length === 0) return null
  const P = '4.4.1'
  const maxPct = c.P.box3.waarde.bronbelastingMaxPct
  const ingehouden = (regels: ReturnType<typeof bronbelastingRegels>) => som(regels.map((r) => r.bedrag))
  const bruto = (regels: ReturnType<typeof bronbelastingRegels>) => som(regels.map((r) => r.brutoInkomsten))
  const verrekend = c.p.bronbelasting?.verrekend ?? c.p.box3Bronbelasting ?? c.r.box3.bronbelasting[c.id] ?? 0
  const landen = perLand(regelsVanPot(c, pot).filter((r) => r.ingehouden > 0))
  const terug = som(landen.map((l) => l.terug))

  const perBezitting = tabel(
    [
      ...posities.map(({ x, i, regels }) =>
        post(`${P}.positie.${x.id}`, x.omschrijving, { B: ingehouden(regels), C: bruto(regels) }, {
          teksten: { land: landenTekst(x) },
          herkomst: x.bronbelastingen ? `invoer.box3.posities[${i}].bronbelastingen` : `invoer.box3.posities[${i}].bronbelasting`,
        }),
      ),
      totaal(`${P}.totaal`, undefined, { B: som(posities.map(({ regels }) => ingehouden(regels))), C: som(posities.map(({ regels }) => bruto(regels))) }, {
        vet: undefined,
        herkomst: 'som(bronbelastingRegels(invoer.box3.posities[]))',
      }),
      post(`${P}.verrekenbaar`, `Verrekend met de box 3-belasting van ${c.naam} (per land tot het verdragstarief, hooguit ${percentage(maxPct)} van de inkomsten)`, { B: verrekend }, {
        witVoor: 1,
        herkomst: c.p.bronbelasting ? uit(c, 'bronbelasting.verrekend') : uit(c, 'box3Bronbelasting'),
      }),
    ],
    { koppen: [kk('omschrijving', 'Omschrijving'), kk('land', 'Land'), kk('B', 'Bronbelasting'), kk('C', 'Inkomsten')] },
  )

  const landRegels: MogelijkeRegel[] = [
    ...landen.map((l) =>
      post(`${P}.land.${l.code.toLowerCase()}`, l.naam, { Z: l.bruto, A: l.ingehouden, C: l.verrekenbaar }, {
        ...(typeof l.tarief === 'number'
          ? { percentages: { B: l.tarief } }
          : { teksten: { B: l.buitenTabel ? `max. ${percentage(maxPct, 'tabel', 0)}` : l.tarief === null ? 'geen' : 'diverse' } }),
        herkomst: `box3.bronbelastingRegels[land=${l.code}]`,
      }),
    ),
    landen.length > 1 &&
      totaal(`${P}.land.totaal`, undefined, { Z: som(landen.map((l) => l.bruto)), A: som(landen.map((l) => l.ingehouden)), C: som(landen.map((l) => l.verrekenbaar)) }, {
        vet: undefined,
        herkomst: 'som(box3.bronbelastingPerLand[])',
      }),
    terug > 0 &&
      post(`${P}.terugvragen`, 'Meer ingehouden dan het verdrag toestaat: terug te vragen in het bronland, niet via de aangifte', { A: terug }, {
        witVoor: 1,
        herkomst: 'som(box3.bronbelastingRegels[].terugTeVragen)',
      }),
  ]
  const perLandTabel = tabel(landRegels, {
    koppen: [kk('omschrijving', 'Land'), kk('Z', 'Bruto'), kk('A', 'Ingehouden'), kk('B', 'Verdrag'), kk('C', 'Verrekenbaar')],
  })

  return sectie('Voorkoming dubbele belasting', 3, [
    kopTekst(`Aandelen en spaartegoeden waarop ${c.naam} bronbelasting wil verrekenen`),
    perBezitting,
    ...(landen.length > 0 ? [kopTekst('Per land', 1), perLandTabel] : []),
  ])
}

/**
 * Regels voor "niet meegenomen" in de verantwoording: wat in de berekening zit maar in het rapport niet is
 * uitgesplitst (voortwenteling van bronbelasting, beloning aan en terbeschikkingstelling door de partner).
 */
export function nietMeegenomenA5(c: RapportContext): string[] {
  const uitkomst: string[] = []
  const bron = c.p.bronbelasting
  if (bron && bron.voortgewenteldIn > 0) uitkomst.push(`De voortgewentelde bronbelasting (${euro(bron.voortgewenteldIn)}) staat niet uitgesplitst in dit rapport.`)
  if (bron && bron.naarVolgendJaar > 0) {
    uitkomst.push(`Bronbelasting die niet in de box 3-belasting van ${c.jaar} paste (${euro(bron.naarVolgendJaar)}), schuift door naar ${c.jaar + 1}; dat staat niet uitgesplitst in dit rapport.`)
  }
  if (!metPartner(c.invoer)) return uitkomst
  const partner = c.ander?.naam ?? 'de partner'
  const detail = c.p.overigWerkDetail
  if (detail && detail.arbeidsbeloningPartner > 0) {
    uitkomst.push(`De beloning van de onderneming van ${partner} (${euro(detail.arbeidsbeloningPartner)}) zit in het resultaat uit overige werkzaamheden; de specificatie staat niet in dit rapport.`)
  }
  const tbs = detail?.terbeschikkingstelling
  if (tbs) {
    uitkomst.push(
      `Het resultaat uit terbeschikkingstelling (${euro(tbs.resultaat)}, vrijstelling ${euro(tbs.vrijstelling)}, belast ${euro(tbs.belastbaar)}) zit in het resultaat uit overige werkzaamheden; de specificatie staat niet in dit rapport.`,
    )
  }
  const correcties = c.p.ondernemingen.map((o, k) => ({ o, naam: c.pi.ondernemingen[k]?.naam ?? 'de onderneming' })).filter(({ o }) => (o.correctiePartner ?? 0) !== 0)
  for (const { o, naam } of correcties) {
    uitkomst.push(`De correctie voor beloning aan of terbeschikkingstelling door ${partner} (${euro(o.correctiePartner ?? 0)}) zit in de winst van ${naam}; de specificatie staat niet in dit rapport.`)
  }
  return uitkomst
}
