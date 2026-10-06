/**
 * Ronde 2 (A5): doorrol van de bronbelasting en de terbeschikkingstellingen naar het volgende jaar. Gebruikt op de
 * markeringen in lib/dossier/doorrol.ts en lib/dossier/nieuw-jaar.ts. Puur: geen React, geen I/O.
 *
 *  - Voortgewentelde bronbelasting (art. 25a Bvdb): wat vorig jaar niet in de box 3-belasting paste
 *    (`PersoonResultaat.bronbelasting.naarVolgendJaar`) wordt `voortgewenteldeBronbelasting` van dit jaar. De
 *    Belastingdienst legt het vast in een beschikking bij de aanslag; de gebruiker past het aan als dat afwijkt.
 *  - Terbeschikkingstelling: de boekwaarde aan het einde van vorig jaar per regel (op id) wordt `boekwaardeBegin`.
 *  - Nieuw jaar: bronbelastingregels zijn jaarbedragen en gaan niet mee; een terbeschikkingstelling die vorig jaar
 *    eindigde (`einde`), valt weg; de andere blijven als sjabloon.
 */
import type { PersoonInvoer, PersoonResultaat, VermogensPositie } from '@/lib/tax/types'
import { euro } from '@/lib/tax/uitleg'

/** Saldi van de persoon voor DoorrolPersoonSaldi (markering doorrol-saldi-A5). */
export function doorrolSaldiBronbelasting(r: PersoonResultaat): { voortgewenteldeBronbelasting: number; tbsBoekwaarden?: Record<string, number> } {
  const boekwaarden: Record<string, number> = {}
  for (const regel of r.overigWerkDetail?.terbeschikkingstelling?.regels ?? []) {
    if (regel.boekwaardeEind !== undefined && regel.boekwinst === undefined) boekwaarden[regel.id] = Math.round(regel.boekwaardeEind)
  }
  return {
    voortgewenteldeBronbelasting: Math.max(0, Math.round(r.bronbelasting?.naarVolgendJaar ?? 0)),
    ...(Object.keys(boekwaarden).length > 0 ? { tbsBoekwaarden: boekwaarden } : {}),
  }
}

/** Zet de voortgewentelde bronbelasting (of haalt hem weg) en de boekwaarde begin per terbeschikkingstelling. */
export function pasDoorrolBronbelastingToe(p: PersoonInvoer, s: { voortgewenteldeBronbelasting?: number; tbsBoekwaarden?: Record<string, number> }): void {
  if (s.voortgewenteldeBronbelasting !== undefined) {
    if (s.voortgewenteldeBronbelasting > 0) p.voortgewenteldeBronbelasting = s.voortgewenteldeBronbelasting
    else delete p.voortgewenteldeBronbelasting
  }
  for (const t of p.terbeschikkingstellingen ?? []) {
    const b = s.tbsBoekwaarden?.[t.id]
    if (b !== undefined) t.boekwaardeBegin = b
  }
}

/** Nieuw jaar, per persoon: een geëindigde terbeschikkingstelling valt weg; zonder uitkomst geen oude voortwenteling. */
export function nieuwJaarPersoonBronbelasting(p: PersoonInvoer, metResultaat: boolean): void {
  if (p.terbeschikkingstellingen) {
    const lopend = p.terbeschikkingstellingen.filter((t) => !t.einde)
    if (lopend.length > 0) p.terbeschikkingstellingen = lopend
    else delete p.terbeschikkingstellingen
  }
  // Zonder uitkomst van vorig jaar weten we niet wat er na de verrekening overbleef: niet ongemerkt dubbel tellen.
  if (!metResultaat) delete p.voortgewenteldeBronbelasting
}

/** Nieuw jaar, per positie: bronbelastingregels zijn jaarbedragen. */
export function nieuwJaarPositieBronbelasting(pos: VermogensPositie): void {
  delete pos.bronbelastingen
}

/** Wijzigingen bij opnieuw overnemen (markering wijzigingen-persoon-A5). */
export function bronbelastingWijzigingen(po: PersoonInvoer, pn: PersoonInvoer): Array<{ label: string; oud: string; nieuw: string }> {
  const bedrag = (n: number | undefined) => (n === undefined ? 'geen' : euro(n))
  const uit: Array<{ label: string; oud: string; nieuw: string }> = []
  const a = bedrag(po.voortgewenteldeBronbelasting)
  const b = bedrag(pn.voortgewenteldeBronbelasting)
  if (a !== b) uit.push({ label: 'Bronbelasting uit eerdere jaren', oud: a, nieuw: b })
  for (const t of pn.terbeschikkingstellingen ?? []) {
    const o = po.terbeschikkingstellingen?.find((x) => x.id === t.id)
    const oud = o?.boekwaardeBegin === undefined ? 'leeg' : euro(o.boekwaardeBegin)
    const nieuw = t.boekwaardeBegin === undefined ? 'leeg' : euro(t.boekwaardeBegin)
    if (oud !== nieuw) uit.push({ label: `Terbeschikkingstelling ${t.omschrijving || t.id}: boekwaarde begin`, oud, nieuw })
  }
  return uit
}
