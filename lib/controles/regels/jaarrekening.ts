/**
 * Ronde 2 (A3): controles op de jaarrekening van een onderneming. De kapitaalsvergelijking (F9, ontwerp 6.3), een
 * ontbrekende balans en de aansluiting van de beginbalans op de eindbalans van vorig jaar. Puur: geen React, geen I/O.
 *
 * Kapitaalsvergelijking (taak-A3 hoofdstuk 6), op de geboekte cijfers:
 *   kv       = kapitaalsvergelijking(o.jaarrekening)   ondernemingsvermogen eind − begin + onttrekkingen − stortingen
 *   saldo    = winstberekening.saldo, of de som van de rubrieken van de winst-en-verliesrekening
 *   inSaldo  = Σ HIR met zitInSaldo(r.mutatiesInSaldo, o, 'hir') (dotatie − vrijval − afboeking)
 *            + Σ egalisatie met zitInSaldo(r.inSaldo, o, 'egalisatie') (dotatie − onttrekking − vrijval)
 *   verschil = kv.winst − (saldo + inSaldo)
 * Correcties die de engine buiten het saldo toepast (correctieReserves, correctiePartner, auto.btwCorrectieAfgetrokken,
 * staking.bijgeteld) tellen niet mee. Ernst via kapitaalsvergelijkingErnst(verschil, ingevulde balansposten).
 */
import type { BalansPost, BalansStand, HuishoudenInvoer, OndernemingInvoer, OndernemingResultaat, PersoonId } from '@/lib/tax/types'
import { BALANS_POST_INFO, BALANS_POSTEN, heeftBalans, kapitaalsvergelijking, sluitAan } from '@/lib/dossier/jaarrekening'
import { itemSleutel } from '@/lib/dossier/ids'
import { veldVan } from '@/lib/dossier/veld'
import { saldoRubrieken } from '@/lib/rapport/afleiden'
import { zitInSaldo } from '@/lib/tax/modules/onderneming/in-saldo'
import { euro } from '@/lib/tax/uitleg'
import { kapitaalsvergelijkingErnst } from '../negeren'
import type { Controle, ControleRegel } from '../types'
import { bedragVingerafdruk, lijstVingerafdruk } from '../vingerafdruk'
import { SECTIE, alleOndernemingen, ondernemingNaam, waarOnderneming } from './hulp'

/** Aantal ingevulde balansposten van een stand (voor de tolerantie). */
function ingevuld(s: BalansStand | undefined): number {
  return s ? BALANS_POSTEN.filter((p) => typeof s[p] === 'number').length : 0
}

/** Het saldo zoals ingevoerd (geboekt): het saldo, de rubrieken van de jaarrekening of de uitgesplitste posten. */
export function geboektSaldo(o: OndernemingInvoer): number {
  const w = o.winstberekening
  if (w.soort === 'saldo') return w.saldo
  if ((o.jaarrekening?.winstEnVerlies?.length ?? 0) > 0) return saldoRubrieken(o.jaarrekening)
  return w.omzet + (w.wijzigingOnderhandenWerk ?? 0) + (w.financieleBatenLasten ?? 0) - w.kosten - (w.afschrijvingen ?? 0) - (o.beperktAftrekbaar ?? 0) - (o.auto?.autokosten ?? 0)
}

/** Mutaties van fiscale reserves die al in het saldo zitten (defensief: ontbrekende uitkomsten tellen als 0). */
export function reservesInSaldo(o: OndernemingInvoer, r: OndernemingResultaat | undefined): number {
  let som = 0
  for (const h of r?.herinvesteringsreserves ?? []) {
    const invoer = o.herinvesteringsreserves?.find((x) => x.id === h.id)
    if (zitInSaldo(invoer?.mutatiesInSaldo, o, 'hir')) som += (h.dotatie ?? 0) - (h.vrijval ?? 0) - (h.afboeking ?? 0)
  }
  for (const e of r?.egalisatiereserves ?? []) {
    const invoer = o.egalisatiereserves?.find((x) => x.id === e.id)
    if (zitInSaldo(invoer?.inSaldo, o, 'egalisatie')) som += (e.dotatie ?? 0) - (e.onttrekking ?? 0) - (e.vrijval ?? 0)
  }
  return som
}

export interface KapitaalsvergelijkingUitkomst {
  kv: number
  saldo: number
  inSaldo: number
  verschil: number
  posten: number
  ernst: 'fout' | 'let-op' | null
}

/** De vergelijking voor één onderneming; null zonder begin- of eindbalans. */
export function vergelijkKapitaal(o: OndernemingInvoer, r: OndernemingResultaat | undefined): KapitaalsvergelijkingUitkomst | null {
  const kv = kapitaalsvergelijking(o.jaarrekening)
  if (!kv) return null
  const saldo = geboektSaldo(o)
  const inSaldo = reservesInSaldo(o, r)
  const verschil = Math.round(kv.winst - (saldo + inSaldo))
  const posten = ingevuld(o.jaarrekening?.begin) + ingevuld(o.jaarrekening?.eind)
  return { kv: kv.winst, saldo, inSaldo, verschil, posten, ernst: kapitaalsvergelijkingErnst(verschil, posten) }
}

const saldoVeld = (p: PersoonId, sleutel: string, o: OndernemingInvoer) =>
  veldVan.onderneming(p, sleutel, o.winstberekening.soort === 'saldo' ? 'winstberekening.saldo' : 'winstberekening.omzet')

export const kapitaalsvergelijkingRegel: ControleRegel = ({ invoer, resultaat }) => {
  const uit: Controle[] = []
  for (const { p, o, index, sleutel } of alleOndernemingen(invoer)) {
    const r = resultaat?.personen.find((x) => x.id === p.id)?.ondernemingen[index]
    const v = vergelijkKapitaal(o, r)
    if (!v || !v.ernst) continue
    const verwacht = v.saldo + v.inSaldo
    const saldoTekst = v.inSaldo !== 0 ? `${euro(verwacht)} (${euro(v.saldo)} plus ${euro(v.inSaldo)} aan reserves die in het saldo zitten)` : euro(v.saldo)
    const fout = v.ernst === 'fout'
    uit.push({
      id: `kapitaalsvergelijking:${p.id}:${sleutel}`,
      regel: 'kapitaalsvergelijking',
      ernst: v.ernst,
      titel: fout ? 'Kapitaalsvergelijking sluit niet' : 'Kapitaalsvergelijking wijkt iets af',
      uitleg: fout
        ? `De winst volgens de balans is ${euro(v.kv)}, het saldo van de winstberekening ${saldoTekst}: ${euro(Math.abs(v.verschil))} verschil. In de aangifte moet dit aansluiten.`
        : `${euro(Math.abs(v.verschil))} verschil tussen balans en saldo; dat is waarschijnlijk afronding.`,
      waar: waarOnderneming(invoer, p, o),
      persoon: p.id,
      gebied: 'onderneming',
      veld: saldoVeld(p.id, sleutel, o),
      sectie: SECTIE.ondernemingen(p.id),
      negeren: fout ? 'met-reden' : 'gezien',
      vingerafdruk: bedragVingerafdruk('verschil', v.verschil),
      ...(fout && o.winstberekening.soort === 'saldo'
        ? {
            oplossing: {
              label: `Gebruik ${euro(v.kv - v.inSaldo)} uit de balans`,
              pas: (d: HuishoudenInvoer) => {
                const doel = d.personen.find((q) => q.id === p.id)?.ondernemingen.find((q, k) => itemSleutel(q, k) === sleutel)
                if (doel?.winstberekening.soort === 'saldo') doel.winstberekening.saldo = Math.round(v.kv - v.inSaldo)
              },
            },
          }
        : {}),
    })
  }
  return uit
}

/** De aangifte vraagt de balans; zonder begin- of eindbalans kan de kapitaalsvergelijking niet. */
export const balansOntbreektRegel: ControleRegel = ({ invoer }) => {
  const uit: Controle[] = []
  for (const { p, o, sleutel } of alleOndernemingen(invoer)) {
    const begin = heeftBalans(o.jaarrekening?.begin)
    const eind = heeftBalans(o.jaarrekening?.eind)
    if (begin && eind) continue
    const welke = !begin && !eind ? 'beide' : !begin ? 'begin' : 'eind'
    const peildatum = welke === 'eind' ? 'eind' : 'begin'
    uit.push({
      id: `balans-ontbreekt:${p.id}:${sleutel}`,
      regel: 'balans-ontbreekt',
      ernst: 'let-op',
      titel: welke === 'beide' ? 'Balans ontbreekt' : welke === 'begin' ? 'Beginbalans ontbreekt' : 'Eindbalans ontbreekt',
      uitleg: `De aangifte vraagt de balans van ${ondernemingNaam(o)}. De berekening klopt ook zonder.`,
      waar: waarOnderneming(invoer, p, o),
      persoon: p.id,
      gebied: 'onderneming',
      veld: veldVan.onderneming(p.id, sleutel, `jaarrekening.${peildatum}.${BALANS_POSTEN[0]}`),
      sectie: SECTIE.ondernemingen(p.id),
      negeren: 'gezien',
      vingerafdruk: welke,
    })
  }
  return uit
}

/** De onderneming van vorig jaar: op vaste id, anders op naam. */
function vorigeOnderneming(vorig: HuishoudenInvoer, persoon: PersoonId, o: OndernemingInvoer): OndernemingInvoer | undefined {
  const lijst = vorig.personen.find((x) => x.id === persoon)?.ondernemingen ?? []
  return (o.id ? lijst.find((x) => x.id === o.id) : undefined) ?? lijst.find((x) => x.naam.trim() !== '' && x.naam.trim() === o.naam.trim())
}

/** Beginbalans wijkt af van de eindbalans van vorig jaar (alleen als beide er zijn). */
export const beginbalansRegel: ControleRegel = ({ invoer, vorig, jaar }) => {
  if (!vorig) return []
  const uit: Controle[] = []
  for (const { p, o, sleutel } of alleOndernemingen(invoer)) {
    const begin = o.jaarrekening?.begin
    const vo = vorigeOnderneming(vorig.invoer, p.id, o)
    const eindVorig = vo?.jaarrekening?.eind
    if (!begin || !eindVorig || !heeftBalans(begin) || !heeftBalans(eindVorig)) continue
    const anders: Array<{ post: BalansPost; begin: number; eind: number }> = []
    for (const post of BALANS_POSTEN) {
      const b = begin[post] ?? 0
      const e = eindVorig[post] ?? 0
      if (!sluitAan(b, e)) anders.push({ post, begin: b, eind: e })
    }
    if (anders.length === 0) continue
    const eerste = anders[0]
    const label = BALANS_POST_INFO[eerste.post].label.toLocaleLowerCase('nl-NL')
    const rest = anders.length - 1
    uit.push({
      id: `beginbalans:${p.id}:${sleutel}`,
      regel: 'beginbalans',
      ernst: 'let-op',
      titel: `Beginbalans sluit niet op ${jaar - 1}`,
      uitleg: `De beginbalans van ${ondernemingNaam(o)} wijkt af van de eindbalans van ${jaar - 1}: ${label} ${euro(eerste.begin)} tegen ${euro(eerste.eind)}${rest > 0 ? `, en nog ${rest} ${rest === 1 ? 'post' : 'posten'}` : ''}.`,
      waar: waarOnderneming(invoer, p, o),
      persoon: p.id,
      gebied: 'onderneming',
      veld: veldVan.onderneming(p.id, sleutel, `jaarrekening.begin.${eerste.post}`),
      sectie: SECTIE.ondernemingen(p.id),
      negeren: 'gezien',
      vingerafdruk: lijstVingerafdruk(anders.map((a) => bedragVingerafdruk(a.post, a.begin - a.eind))),
      oplossing: {
        label: `Neem de eindbalans van ${jaar - 1} over`,
        pas: (d) => {
          const doel = d.personen.find((q) => q.id === p.id)?.ondernemingen.find((q, k) => itemSleutel(q, k) === sleutel)
          if (!doel) return
          doel.jaarrekening = { ...(doel.jaarrekening ?? {}), begin: { ...eindVorig } }
        },
      },
    })
  }
  return uit
}

export const JAARREKENING_REGELS: ControleRegel[] = [kapitaalsvergelijkingRegel, balansOntbreektRegel, beginbalansRegel]
