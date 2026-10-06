/**
 * Ronde 2 (A2): doorrol van de privésaldi van het ene dossierjaar naar het volgende, afgeleid uit de uitkomst van
 * vorig jaar. Wordt aangeroepen op de markeringen in doorrol.ts (berekenDoorrol, pasDoorrolToe, doorrolWijzigingen).
 *
 * Per persoon (box 2, art. 4.49 en 4.53):
 *  - `box2Verliezen`: de openstaande verliezen na vorig jaar (`box2Verlies.resterend`), zonder verliezen waarvan de
 *    termijn voor het nieuwe jaar al voorbij is; vervallen verliezen rollen niet door;
 *  - `box2InkomenVorigJaar`: het belastbare box 2-inkomen van vorig jaar, voor de terugwenteling van een nieuw verlies;
 *  - `box2Belastingkorting.lopend`: de kortingen die nog openstaan, met hun restant in euro's.
 * Per huishouden (eigen woning, art. 3.119a en 3.119aa):
 *  - `eigenwoningreserve`: de toevoegingen na vorig jaar (vervallen toevoegingen staan er al niet meer in);
 *  - per leningdeel `eigenwoningschuld.begin` = het deel eigen woning op 31 december uit `leningsplitsing`, zodat de
 *    splitsing niet verloren gaat als `aankoop` weg is;
 *  - het andere deel als box 3-schuld met `herkomst` { bron 'eigenwoningschuld', jaar, sleutel = leningdeel-id }. Een
 *    tweede doorrol werkt die schuld bij op de sleutel in plaats van er een tweede te maken.
 * Puur: geen React, geen I/O.
 */
import type { HuishoudenInvoer, HuishoudenResultaat, LeningdeelInvoer, PersoonId, PersoonInvoer, PersoonResultaat, SchuldPositie } from '@/lib/tax/types'
import { euro } from '@/lib/tax/uitleg'

type JaarBedrag = { jaar: number; bedrag: number }
type Korting = { verliesjaar: number; eersteJaar: number; restant: number }
type Reserve = { eigenaar: PersoonId; datumToevoeging: string; bedrag: number }

/** Box 2-saldi voor het nieuwe jaar uit de uitkomst van één persoon. */
export function box2SaldiNa(r: PersoonResultaat, nieuwJaar: number): { box2Verliezen: JaarBedrag[]; box2InkomenVorigJaar: number; box2Belastingkortingen: Korting[] } {
  const v = r.box2Verlies
  const box2Verliezen = (v?.resterend ?? []).filter((x) => x.bedrag > 0 && x.vervaltNa >= nieuwJaar).map((x) => ({ jaar: x.jaar, bedrag: Math.round(x.bedrag) }))
  const box2Belastingkortingen = (v?.belastingkorting.resterend ?? [])
    .filter((k) => k.restant > 0 && k.uiterlijkJaar >= nieuwJaar)
    .map((k) => ({ verliesjaar: k.verliesjaar, eersteJaar: k.eersteJaar, restant: Math.round(k.restant) }))
  const box2InkomenVorigJaar = Math.max(0, Math.round(r.box2Inkomen - (v?.verrekend ?? 0)))
  return { box2Verliezen, box2InkomenVorigJaar, box2Belastingkortingen }
}

/** Zet de box 2-saldi in een persoon (wijzigt `p`). Lege lijsten en 0 halen het veld weg. */
export function pasBox2SaldiToe(p: PersoonInvoer, s: { box2Verliezen?: JaarBedrag[]; box2InkomenVorigJaar?: number; box2Belastingkortingen?: Korting[] }): void {
  if (s.box2Verliezen !== undefined) {
    if (s.box2Verliezen.length > 0) p.box2Verliezen = s.box2Verliezen.map((x) => ({ ...x }))
    else delete p.box2Verliezen
  }
  if (s.box2InkomenVorigJaar !== undefined) {
    if (s.box2InkomenVorigJaar > 0) p.box2InkomenVorigJaar = s.box2InkomenVorigJaar
    else delete p.box2InkomenVorigJaar
  }
  if (s.box2Belastingkortingen !== undefined) {
    const k = { ...(p.box2Belastingkorting ?? {}) }
    if (s.box2Belastingkortingen.length > 0) k.lopend = s.box2Belastingkortingen.map((x) => ({ ...x }))
    else delete k.lopend
    if (Object.keys(k).length > 0) p.box2Belastingkorting = k
    else delete p.box2Belastingkorting
  }
}

/** Sleutel van een leningdeel voor de doorrol: de vaste id, voor oude invoer de omschrijving. */
export const leningSleutel = (l: Pick<LeningdeelInvoer, 'id' | 'omschrijving'>): string => l.id ?? l.omschrijving

export interface EigenWoningDoorrol {
  eigenwoningreserve: Reserve[]
  /** Per leningdeel (op sleutel) het deel eigenwoningschuld op 1 januari van het nieuwe jaar. */
  eigenwoningschuldPerLeningdeel: Array<{ sleutel: string; begin: number; reden: 'bijleenregeling' | 'aflossingseis' }>
  /** Het andere deel als box 3-schuld (`waardeBegin` = stand op 31 december van vorig jaar). */
  box3SchuldenUitEigenWoning: SchuldPositie[]
}

/** Eigen woning voor het nieuwe jaar uit vorig jaar; null zonder uitkomst van de eigen woning. */
export function eigenWoningDoorrol(vorig: HuishoudenInvoer, r: HuishoudenResultaat | undefined): EigenWoningDoorrol | null {
  const ew = r?.eigenWoning
  if (!ew || !vorig.eigenWoning) return null
  const eigenwoningreserve = (ew.eigenwoningreserve ?? []).filter((t) => t.bedrag > 0).map((t) => ({ eigenaar: t.eigenaar, datumToevoeging: t.datumToevoeging, bedrag: Math.round(t.bedrag) }))
  const eigenwoningschuldPerLeningdeel: EigenWoningDoorrol['eigenwoningschuldPerLeningdeel'] = []
  const box3SchuldenUitEigenWoning: SchuldPositie[] = []
  ;(ew.leningsplitsing ?? []).forEach((s, i) => {
    if (s.anderEind <= 0 || (s.reden !== 'bijleenregeling' && s.reden !== 'aflossingseis')) return
    const deel = vorig.eigenWoning?.leningdelen?.find((l) => (s.id ? l.id === s.id : l.omschrijving === s.omschrijving)) ?? vorig.eigenWoning?.leningdelen?.[i]
    const sleutel = s.id ?? deel?.id ?? s.omschrijving
    eigenwoningschuldPerLeningdeel.push({ sleutel, begin: Math.round(s.eigenwoningEind), reden: s.reden })
    box3SchuldenUitEigenWoning.push({
      id: `schuld-ew-${sleutel}`.slice(0, 40),
      omschrijving: `${s.omschrijving || 'Hypotheek'}, deel dat geen eigenwoningschuld is`,
      eigenaar: 'A',
      waardeBegin: Math.round(s.anderEind),
      herkomst: { bron: 'eigenwoningschuld', jaar: vorig.jaar, sleutel },
    })
  })
  return { eigenwoningreserve, eigenwoningschuldPerLeningdeel, box3SchuldenUitEigenWoning }
}

/**
 * Zet de eigen woning uit de doorrol in `uit` (wijzigt `uit`): reserve zetten, per leningdeel de splitsing, en de box
 * 3-schulden met herkomst bijwerken op de sleutel (nieuw toevoegen, verdwenen weghalen, de rest laten staan).
 */
export function pasEigenWoningToe(uit: HuishoudenInvoer, d: EigenWoningDoorrol): void {
  if (uit.eigenWoning) {
    if (d.eigenwoningreserve.length > 0) uit.eigenWoning.eigenwoningreserve = d.eigenwoningreserve.map((t) => ({ ...t }))
    else delete uit.eigenWoning.eigenwoningreserve
    for (const l of uit.eigenWoning.leningdelen ?? []) {
      const s = d.eigenwoningschuldPerLeningdeel.find((x) => x.sleutel === leningSleutel(l))
      if (s) l.eigenwoningschuld = { begin: s.begin, reden: s.reden }
      else delete l.eigenwoningschuld
    }
  } else if (d.eigenwoningreserve.length > 0) {
    // Woning verkocht en (nog) geen nieuwe: de reserve blijft bewaard bij de eigen woning, zonder WOZ.
    uit.eigenWoning = { woz: 0, eigenwoningreserve: d.eigenwoningreserve.map((t) => ({ ...t })) }
  }
  const schulden: SchuldPositie[] = []
  const gezien = new Set<string>()
  for (const s of uit.box3.schulden) {
    if (s.herkomst?.bron !== 'eigenwoningschuld') {
      schulden.push(s)
      continue
    }
    const nieuw = d.box3SchuldenUitEigenWoning.find((x) => x.herkomst?.sleutel === s.herkomst?.sleutel)
    if (!nieuw || gezien.has(s.herkomst.sleutel)) continue
    gezien.add(s.herkomst.sleutel)
    schulden.push({ ...s, waardeBegin: nieuw.waardeBegin, herkomst: { ...nieuw.herkomst! } })
  }
  for (const n of d.box3SchuldenUitEigenWoning) {
    if (!gezien.has(n.herkomst!.sleutel)) schulden.push({ ...n, herkomst: { ...n.herkomst! } })
  }
  uit.box3 = { ...uit.box3, schulden }
}

const lijstTekst = (l: JaarBedrag[] | undefined) => (l && l.length > 0 ? l.map((x) => `${x.jaar}: ${euro(x.bedrag)}`).join(', ') : 'geen')
const kortingTekst = (l: Korting[] | undefined) => (l && l.length > 0 ? l.map((k) => `uit ${k.verliesjaar}: ${euro(k.restant)}`).join(', ') : 'geen')
const reserveTekst = (l: Reserve[] | undefined) => (l && l.length > 0 ? l.map((t) => `${euro(t.bedrag)} (${t.datumToevoeging.slice(0, 4)})`).join(', ') : 'geen')

/** Regels voor "Wat verandert er" bij opnieuw overnemen, per persoon. */
export function wijzigingenPrive(po: PersoonInvoer, pn: PersoonInvoer, oud: HuishoudenInvoer, nieuw: HuishoudenInvoer): Array<{ label: string; oud: string; nieuw: string }> {
  const uit: Array<{ label: string; oud: string; nieuw: string }> = []
  const w = (label: string, a: string, b: string) => {
    if (a !== b) uit.push({ label, oud: a, nieuw: b })
  }
  w('Verliezen box 2', lijstTekst(po.box2Verliezen), lijstTekst(pn.box2Verliezen))
  w('Belastingkorting box 2', kortingTekst(po.box2Belastingkorting?.lopend), kortingTekst(pn.box2Belastingkorting?.lopend))
  const eigen = (h: HuishoudenInvoer) => (h.eigenWoning?.eigenwoningreserve ?? []).filter((t) => t.eigenaar === pn.id)
  w('Eigenwoningreserve', reserveTekst(eigen(oud)), reserveTekst(eigen(nieuw)))
  const box3 = (h: HuishoudenInvoer) =>
    h.box3.schulden
      .filter((s) => s.herkomst?.bron === 'eigenwoningschuld' && s.eigenaar === pn.id)
      .map((s) => euro(s.waardeBegin))
      .join(', ') || 'geen'
  w('Hypotheek, deel box 3', box3(oud), box3(nieuw))
  return uit
}
