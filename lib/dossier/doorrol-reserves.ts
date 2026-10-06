/**
 * Ronde 2 (A6): doorrol van de herinvesteringsreserve, de kostenegalisatiereserve en de genoten stakingsaftrek.
 *
 * - Herinvesteringsreserve: de stand eind wordt `standBegin` van volgend jaar; vrijgevallen en opgebruikte reserves en
 *   reserves na hun `uiterlijkJaar` vallen weg. Het deel van de boekwaarde-eis dat al gedekt is
 *   (`boekwaardeEis.gedektEind`), wordt `boekwaardeEisGedekt` van volgend jaar. Een afboeking op een investering gaat mee naar het middel in het register
 *   (`ActiefInvoer.herinvesteringsreserveAfboeking`), met het bedrag waarover investeringsaftrek is genoten
 *   (`investeringsaftrekGrondslag`), zodat afschrijving en desinvesteringsbijtelling erop aansluiten.
 * - Kostenegalisatiereserve: de stand eind wordt `standBegin`; dotatie en onttrekking beginnen leeg; een vervallen of
 *   opgebruikte reserve valt weg.
 * - Genoten stakingsaftrek (art. 3.79 lid 4): wat eerder was genoten plus de stakingsaftrek van vorig jaar.
 *
 * Zonder uitkomst van vorig jaar rekenen we de reserves zelf uit met de parameters van vorig jaar. Puur: geen I/O.
 */
import type {
  ActiefInvoer,
  EgalisatiereserveInvoer,
  HerinvesteringsreserveInvoer,
  InvesteringInvoer,
  OndernemingInvoer,
  OndernemingResultaat,
  PersoonInvoer,
  PersoonResultaat,
  TaxYearParams,
} from '@/lib/tax/types'
import { berekenReserves } from '@/lib/tax/modules/onderneming/reserves'
import { euro } from '@/lib/tax/uitleg'
import { itemSleutel } from './ids'

const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** Afboeking van een herinvesteringsreserve op een middel in het register, op de vaste herkomst-id van dat middel. */
export interface HirAfboekingRegister {
  herkomst: string
  afboeking: number
  /** Bedrag waarover investeringsaftrek is genoten; ontbreekt bij `kiaOverVolBedrag` (dan de aanschafwaarde). */
  grondslag?: number
}

export interface DoorrolReserves {
  herinvesteringsreserves?: HerinvesteringsreserveInvoer[]
  egalisatiereserves?: EgalisatiereserveInvoer[]
  hirAfboekingRegister?: HirAfboekingRegister[]
}

/** Afgeboekt bedrag op een investering van vorig jaar: uit de uitkomst (na de grenzen), anders het gevraagde bedrag. */
function afboekingVan(inv: InvesteringInvoer, index: number, ro: OndernemingResultaat | undefined): number {
  const hir = inv.herinvesteringsreserve
  if (!hir) return 0
  const r = ro?.herinvesteringsreserves?.find((x) => x.id === hir.reserveId)
  const uit = r?.perInvestering?.find((x) => x.investering === itemSleutel(inv, index) || x.investering === (inv.id || String(index)))
  return Math.max(0, Math.round(uit?.bedrag ?? hir.afboeking))
}

/** Velden voor een nieuw middel uit een investering met een afgeboekte herinvesteringsreserve (doorrol-actief). */
export function afboekingNaarActief(inv: InvesteringInvoer, index: number, ro: OndernemingResultaat | undefined): Pick<ActiefInvoer, 'herinvesteringsreserveAfboeking' | 'investeringsaftrekGrondslag'> {
  const afboeking = afboekingVan(inv, index, ro)
  if (afboeking <= 0) return {}
  return {
    herinvesteringsreserveAfboeking: afboeking,
    ...(inv.herinvesteringsreserve?.kiaOverVolBedrag ? {} : { investeringsaftrekGrondslag: Math.max(0, Math.round(inv.bedrag - afboeking)) }),
  }
}

/**
 * Reserves van een onderneming voor volgend jaar, en de afboekingen op middelen die al in het register stonden
 * (`inRegister`: investering-index naar register-index, zoals de doorrol die koppelt).
 */
export function doorrolReserves(
  o: OndernemingInvoer,
  ro: OndernemingResultaat | undefined,
  params: TaxYearParams | null,
  vorigJaar: number,
  nieuwJaar: number,
  inRegister: ReadonlyMap<number, number>,
): DoorrolReserves {
  const uit: DoorrolReserves = {}
  const heeftHir = (o.herinvesteringsreserves ?? []).length > 0
  const heeftEg = (o.egalisatiereserves ?? []).length > 0
  if (heeftHir || heeftEg) {
    const berekend = (heeftHir && !ro?.herinvesteringsreserves) || (heeftEg && !ro?.egalisatiereserves) ? (params ? berekenReserves(o, { params, jaar: vorigJaar, investeringSleutel: itemSleutel }) : null) : null
    const hirUit = ro?.herinvesteringsreserves ?? berekend?.herinvesteringsreserves
    const egUit = ro?.egalisatiereserves ?? berekend?.egalisatiereserves
    if (heeftHir && hirUit) {
      uit.herinvesteringsreserves = (o.herinvesteringsreserves ?? []).flatMap((r) => {
        const u = hirUit.find((x) => x.id === r.id)
        if (!u || u.standEind <= 0 || nieuwJaar > u.uiterlijkJaar) return []
        const volgend: HerinvesteringsreserveInvoer = { ...kopie(r), standBegin: Math.round(u.standEind) }
        // Boekwaarde-eis over alle vervangende middelen samen (art. 3.54 lid 2): het gedekte deel rolt door.
        if (u.boekwaardeEis) volgend.boekwaardeEisGedekt = Math.round(u.boekwaardeEis.gedektEind)
        return [volgend]
      })
    }
    if (heeftEg && egUit) {
      uit.egalisatiereserves = (o.egalisatiereserves ?? []).flatMap((e) => {
        const u = egUit.find((x) => x.id === e.id)
        if (!u || u.standEind <= 0 || e.vervallen) return []
        return [{ id: e.id, omschrijving: e.omschrijving, standBegin: Math.round(u.standEind), ...(e.inSaldo !== undefined ? { inSaldo: e.inSaldo } : {}) }]
      })
    }
  }
  const register = o.activa ?? []
  const afboekingen: HirAfboekingRegister[] = []
  for (const [k, i] of inRegister) {
    const inv = (o.investeringen ?? [])[k]
    const a = register[i]
    if (!inv || !a || a.herinvesteringsreserveAfboeking !== undefined) continue
    const velden = afboekingNaarActief(inv, k, ro)
    if (!velden.herinvesteringsreserveAfboeking) continue
    afboekingen.push({
      herkomst: a.herkomst ?? `act:${vorigJaar}:${i}`,
      afboeking: velden.herinvesteringsreserveAfboeking,
      ...(velden.investeringsaftrekGrondslag !== undefined ? { grondslag: velden.investeringsaftrekGrondslag } : {}),
    })
  }
  if (afboekingen.length > 0) uit.hirAfboekingRegister = afboekingen
  return uit
}

/**
 * Zet de doorgerolde reserves in een onderneming van dit jaar. Samenvoegen op id: van een bestaande reserve blijven de
 * keuzes van dit jaar staan (voornemen, verlengde termijn, in het saldo, dotatie en onttrekking), de stand begin en de
 * herkomst komen uit vorig jaar. Een reserve die vorig jaar al bestond maar niet meer doorloopt, gaat eruit; een
 * reserve die dit jaar is ontstaan (of een nieuwe kostenegalisatiereserve zonder stand) blijft.
 */
export function pasReservesToe(o: OndernemingInvoer, d: DoorrolReserves, jaar: number): void {
  if (d.herinvesteringsreserves) {
    const bestaand = o.herinvesteringsreserves ?? []
    const uitVorig = d.herinvesteringsreserves.map((r) => {
      const b = bestaand.find((x) => x.id === r.id)
      if (!b) return kopie(r)
      const samen: HerinvesteringsreserveInvoer = { ...kopie(b), ontstaanJaar: r.ontstaanJaar, bedragOntstaan: r.bedragOntstaan, herkomst: kopie(r.herkomst), standBegin: r.standBegin }
      if (r.boekwaardeEisGedekt !== undefined) samen.boekwaardeEisGedekt = r.boekwaardeEisGedekt
      else delete samen.boekwaardeEisGedekt
      return samen
    })
    const eigen = bestaand.filter((b) => !d.herinvesteringsreserves!.some((r) => r.id === b.id) && b.ontstaanJaar >= jaar)
    const lijst = [...uitVorig, ...eigen.map((b) => kopie(b))]
    if (lijst.length > 0) o.herinvesteringsreserves = lijst
    else delete o.herinvesteringsreserves
  }
  if (d.egalisatiereserves) {
    const bestaand = o.egalisatiereserves ?? []
    const uitVorig = d.egalisatiereserves.map((e) => {
      const b = bestaand.find((x) => x.id === e.id)
      return b ? { ...kopie(b), standBegin: e.standBegin } : kopie(e)
    })
    const eigen = bestaand.filter((b) => !d.egalisatiereserves!.some((e) => e.id === b.id) && !(b.standBegin > 0))
    const lijst = [...uitVorig, ...eigen.map((b) => kopie(b))]
    if (lijst.length > 0) o.egalisatiereserves = lijst
    else delete o.egalisatiereserves
  }
  for (const x of d.hirAfboekingRegister ?? []) {
    const a = (o.activa ?? []).find((y) => y.herkomst === x.herkomst)
    if (!a || a.herinvesteringsreserveAfboeking !== undefined) continue
    a.herinvesteringsreserveAfboeking = x.afboeking
    if (x.grondslag !== undefined) a.investeringsaftrekGrondslag = x.grondslag
  }
}

/** Genoten stakingsaftrek na vorig jaar (art. 3.79 lid 4): eerder genoten plus de stakingsaftrek van vorig jaar. */
export function genotenStakingsaftrekNa(p: PersoonInvoer, r: PersoonResultaat): number | undefined {
  const eerder = Math.max(
    Math.max(0, p.genotenStakingsaftrek ?? 0),
    ...p.ondernemingen.map((o) => Math.max(0, o.staking?.eerderGenotenStakingsaftrek ?? 0)),
    ...r.ondernemingen.map((o) => Math.max(0, o.staking?.eerderGenoten ?? 0)),
  )
  const totaal = Math.round(eerder + Math.max(0, r.ondernemersaftrek.stakingsaftrek))
  return totaal > 0 ? totaal : undefined
}

/** Regels voor "Wat verandert er" bij opnieuw overnemen: per reserve de stand op 1 januari. */
export function reserveWijzigingen(oud: OndernemingInvoer, nieuw: OndernemingInvoer): Array<{ label: string; oud: string; nieuw: string }> {
  const uit: Array<{ label: string; oud: string; nieuw: string }> = []
  const hirNaam = (r: HerinvesteringsreserveInvoer) => `Herinvesteringsreserve uit ${r.herkomst.omschrijving.trim() || r.ontstaanJaar}`
  const ids = new Set([...(oud.herinvesteringsreserves ?? []).map((r) => r.id), ...(nieuw.herinvesteringsreserves ?? []).map((r) => r.id)])
  for (const id of ids) {
    const a = oud.herinvesteringsreserves?.find((r) => r.id === id)
    const b = nieuw.herinvesteringsreserves?.find((r) => r.id === id)
    const tekst = (r: HerinvesteringsreserveInvoer | undefined) => (r ? euro(r.standBegin) : 'niet in de lijst')
    if (tekst(a) !== tekst(b)) uit.push({ label: `${hirNaam((b ?? a)!)}: stand 1 januari`, oud: tekst(a), nieuw: tekst(b) })
  }
  const egIds = new Set([...(oud.egalisatiereserves ?? []).map((r) => r.id), ...(nieuw.egalisatiereserves ?? []).map((r) => r.id)])
  for (const id of egIds) {
    const a = oud.egalisatiereserves?.find((r) => r.id === id)
    const b = nieuw.egalisatiereserves?.find((r) => r.id === id)
    const tekst = (r: EgalisatiereserveInvoer | undefined) => (r ? euro(r.standBegin) : 'niet in de lijst')
    if (tekst(a) !== tekst(b)) uit.push({ label: `Kostenegalisatiereserve ${(b ?? a)!.omschrijving}: stand 1 januari`, oud: tekst(a), nieuw: tekst(b) })
  }
  return uit
}
