/**
 * Ronde 2 (A6): vormcontrole van de regelingen van de onderneming (herinvesteringsreserve, kostenegalisatiereserve,
 * staking, auto, stakingslijfrente, genoten stakingsaftrek). Aangeroepen vanuit valideer.ts op de markeringen van A6,
 * met de hulpfuncties van de controle daar. Alleen vorm, geen fiscale regels.
 */
import { ID_PATROON } from './ids'

type Obj = Record<string, unknown>

/** De hulpfuncties van de controle in valideer.ts (structureel, zodat die klasse daar niet geëxporteerd hoeft). */
export interface VormControle {
  fout(pad: string, melding: string): void
  getal(o: Obj, veld: string, pad: string, verplicht?: boolean): void
  tekst(o: Obj, veld: string, pad: string, verplicht?: boolean): void
  datum(o: Obj, veld: string, pad: string, verplicht?: boolean): void
  bool(o: Obj, veld: string, pad: string, verplicht?: boolean): void
  keuze(o: Obj, veld: string, pad: string, opties: string[], verplicht?: boolean): void
  lijst(o: Obj, veld: string, pad: string, verplicht: boolean, elk: (x: Obj, pad: string) => void): void
}

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isGetal = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const MIN_JAAR = 1990
const MAX_JAAR = 2100
const isJaar = (x: unknown) => isGetal(x) && Number.isInteger(x) && x >= MIN_JAAR && x <= MAX_JAAR

function nietNegatief(c: VormControle, o: Obj, velden: string[], pad: string, verplicht: string[] = []): void {
  for (const v of velden) {
    c.getal(o, v, pad, verplicht.includes(v))
    if (isGetal(o[v]) && (o[v] as number) < 0) c.fout(`${pad}.${v}`, 'mag niet negatief zijn')
  }
}

function jaarVeld(c: VormControle, o: Obj, veld: string, pad: string, verplicht = false): void {
  c.getal(o, veld, pad, verplicht)
  if (o[veld] !== undefined && !isJaar(o[veld])) c.fout(`${pad}.${veld}`, 'moet een heel jaartal zijn')
}

function uniekeIds(c: VormControle, lijst: unknown, pad: string): void {
  if (!Array.isArray(lijst)) return
  const gezien = new Set<string>()
  lijst.forEach((x, i) => {
    if (!isObj(x)) return
    const p = `${pad}[${i}].id`
    if (typeof x.id !== 'string' || !ID_PATROON.test(x.id)) c.fout(p, 'moet een korte id zijn (letters, cijfers, - of _)')
    else if (gezien.has(x.id)) c.fout(p, 'komt twee keer voor')
    else gezien.add(x.id)
  })
}

/** StakingInvoer bovenop stakingswinst, stakingsaftrekEerderGebruikt en gedeeltelijk. */
export function valideerStaking(c: VormControle, s: Obj, pad: string): void {
  c.keuze(s, 'soort', pad, ['geheel', 'gedeeltelijk', 'geruisloosBV', 'doorschuiving'])
  c.keuze(s, 'gebeurtenis', pad, ['gestopt', 'verkocht', 'bv', 'deel'])
  c.bool(s, 'stakingswinstInSaldo', pad)
  c.datum(s, 'datum', pad)
  nietNegatief(c, s, ['goodwill', 'stakingskosten', 'eerderGenotenStakingsaftrek'], pad)
  c.lijst(s, 'posten', pad, false, (post, pp) => {
    c.keuze(post, 'soort', pp, ['onroerend', 'immaterieel', 'overigeActiva', 'overig'], true)
    c.tekst(post, 'omschrijving', pp, true)
    c.tekst(post, 'actiefHerkomst', pp)
    c.getal(post, 'waardeOfOpbrengst', pp, true)
    c.getal(post, 'fiscaleBoekwaarde', pp, true)
    c.bool(post, 'naarPrive', pp)
    c.bool(post, 'inSaldo', pp)
  })
}

/** Herinvesteringsreserves, kostenegalisatiereserves, winstBron en de nieuwe velden van de auto. */
export function valideerOndernemingRegelingen(c: VormControle, o: Obj, pad: string): void {
  c.keuze(o, 'winstBron', pad, ['boekhouding', 'fiscaal-rapport'])
  uniekeIds(c, o.herinvesteringsreserves, `${pad}.herinvesteringsreserves`)
  c.lijst(o, 'herinvesteringsreserves', pad, false, (r, rp) => {
    jaarVeld(c, r, 'ontstaanJaar', rp, true)
    nietNegatief(c, r, ['bedragOntstaan', 'standBegin', 'boekwaardeEisGedekt'], rp, ['bedragOntstaan', 'standBegin'])
    c.bool(r, 'voornemen', rp, true)
    c.bool(r, 'mutatiesInSaldo', rp)
    jaarVeld(c, r, 'termijnVerlengdTot', rp)
    if (isGetal(r.termijnVerlengdTot) && isGetal(r.ontstaanJaar) && r.termijnVerlengdTot < r.ontstaanJaar) c.fout(`${rp}.termijnVerlengdTot`, 'ligt vóór het jaar waarin de reserve ontstond')
    const h = r.herkomst
    if (!isObj(h)) c.fout(`${rp}.herkomst`, 'ontbreekt')
    else {
      c.tekst(h, 'omschrijving', `${rp}.herkomst`, true)
      c.tekst(h, 'actiefHerkomst', `${rp}.herkomst`)
      nietNegatief(c, h, ['opbrengst', 'boekwaardeOud'], `${rp}.herkomst`, ['boekwaardeOud'])
      c.bool(h, 'langlopend', `${rp}.herkomst`, true)
      c.bool(h, 'schadeloosstelling', `${rp}.herkomst`)
    }
  })
  uniekeIds(c, o.egalisatiereserves, `${pad}.egalisatiereserves`)
  c.lijst(o, 'egalisatiereserves', pad, false, (e, ep) => {
    c.tekst(e, 'omschrijving', ep, true)
    nietNegatief(c, e, ['standBegin', 'dotatie', 'onttrekking'], ep, ['standBegin'])
    c.bool(e, 'vervallen', ep)
    c.bool(e, 'inSaldo', ep)
  })
  const a = o.auto
  if (isObj(a)) {
    const ap = `${pad}.auto`
    nietNegatief(c, a, ['dagwaarde', 'eigenBijdrage'], ap)
    c.bool(a, 'rittenregistratie', ap)
    c.datum(a, 'terBeschikkingSinds', ap)
    c.datum(a, 'terBeschikkingTot', ap)
    if (typeof a.terBeschikkingSinds === 'string' && typeof a.terBeschikkingTot === 'string' && a.terBeschikkingTot < a.terBeschikkingSinds) c.fout(`${ap}.terBeschikkingTot`, 'ligt vóór de datum waarop de auto ter beschikking kwam')
    if (a.btw !== undefined) {
      const b = a.btw
      const bp = `${ap}.btw`
      if (!isObj(b)) c.fout(bp, 'moet een object zijn')
      else {
        c.bool(b, 'aftrekOpKosten', bp)
        c.bool(b, 'aftrekBijAanschaf', bp, true)
        jaarVeld(c, b, 'jaarIngebruikname', bp)
        c.keuze(b, 'methode', bp, ['forfait', 'kilometers'], true)
        nietNegatief(c, b, ['priveKmInclWoonWerk', 'totaalKm', 'btwOpKosten', 'btwBijAanschaf'], bp)
        c.bool(b, 'inAutokosten', bp)
      }
    }
  }
}

/** InvesteringInvoer.herinvesteringsreserve. */
export function valideerInvesteringHir(c: VormControle, inv: Obj, pad: string): void {
  const h = inv.herinvesteringsreserve
  if (h === undefined) return
  const hp = `${pad}.herinvesteringsreserve`
  if (!isObj(h)) return c.fout(hp, 'moet een object zijn')
  c.tekst(h, 'reserveId', hp, true)
  nietNegatief(c, h, ['afboeking'], hp, ['afboeking'])
  for (const v of ['kiaOverVolBedrag', 'nieuwLanglopend', 'zelfdeFunctie']) c.bool(h, v, hp)
}

/** InkomensvoorzieningInvoer.stakingslijfrente. */
export function valideerStakingslijfrente(c: VormControle, iv: Obj, pad: string): void {
  const s = iv.stakingslijfrente
  if (s === undefined) return
  const sp = `${pad}.stakingslijfrente`
  if (!isObj(s)) return c.fout(sp, 'moet een object zijn')
  nietNegatief(c, s, ['premie', 'waardePensioenaanspraken', 'eerderAfgetrokkenLijfrentepremies', 'eerdereStakingslijfrenten', 'eerdereForOmzettingen'], sp, ['premie'])
  c.datum(s, 'betaaldOp', sp)
  c.keuze(s, 'categorie', sp, ['hoog', 'midden', 'laag'])
}

/** PersoonInvoer.genotenStakingsaftrek. */
export function valideerPersoonStaking(c: VormControle, p: Obj, pad: string): void {
  nietNegatief(c, p, ['genotenStakingsaftrek'], pad)
}
