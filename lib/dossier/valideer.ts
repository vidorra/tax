/**
 * Vormcontrole van een HuishoudenInvoer uit het dossier of de API. Controleert types, verplichte
 * velden en keuzelijsten; geen fiscale regels (dat doet de engine met waarschuwingen).
 * Geeft een lijst met Nederlandse foutmeldingen; leeg betekent geldig.
 */
import { BESCHIKBARE_JAREN } from '@/lib/tax/years'
import { controleerGrenzen } from './grenzen'
import { isBalansPost, isWvRubriek, JAARREKENING_GRENZEN, WV_RUBRIEKEN } from './jaarrekening'
import { ID_PATROON } from './ids'
import { valideerPriveHuishouden, valideerPrivePersoon, valideerLeningdeelPrive, valideerWoningPrive, valideerSchuldPrive } from './valideer-prive'
import { controleerHerkomst } from '@/lib/import/herkomst'
import { SAMENWERKING_PARTNER, TBS_SOORTEN } from '@/lib/tax/modules/partner'
import { valideerInvesteringHir, valideerOndernemingRegelingen, valideerPersoonStaking, valideerStaking, valideerStakingslijfrente } from './valideer-regelingen-onderneming'

type Obj = Record<string, unknown>

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isGetal = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isDatum = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`))
/** Vaste herkomst van een doorgerold bedrijfsmiddel (ActiefInvoer.herkomst, OndernemingInvoer.doorrolUitgesloten). */
const isHerkomst = (x: unknown): x is string => typeof x === 'string' && /^(inv|act):\d{4}:\d{1,4}$/.test(x)

const BOX3_CATEGORIEEN = ['bankNL', 'bankBuitenland', 'contant', 'groen', 'beleggingen', 'crypto', 'vorderingen', 'onroerend', 'overig', 'nettolijfrente']
const LOON_SOORTEN = ['loon', 'uwv-zez', 'uwv-overig', 'pensioen']
const REGELINGEN = ['kia', 'eia', 'mia-1', 'mia-2', 'mia-3', 'geen']
const OPVANG = ['dagopvang', 'bso', 'gastouder']
const AFLOSSING = ['annuitair', 'lineair', 'aflossingsvrij', 'overig']
const ACTIEF_METHODE = ['lineair', 'willekeurig-starter', 'vamil', 'direct']
const VERDEELPOSTEN = ['eigenWoning', 'pga', 'box3', 'box2', 'dividendbelasting']

class Controle {
  fouten: string[] = []
  fout(pad: string, melding: string) {
    if (this.fouten.length < 100) this.fouten.push(`${pad}: ${melding}`)
  }
  getal(o: Obj, veld: string, pad: string, verplicht = false) {
    const v = o[veld]
    if (v === undefined || v === null) {
      if (verplicht) this.fout(`${pad}.${veld}`, 'verplicht getal ontbreekt')
      return
    }
    if (!isGetal(v)) this.fout(`${pad}.${veld}`, 'moet een getal zijn')
  }
  tekst(o: Obj, veld: string, pad: string, verplicht = false) {
    const v = o[veld]
    if (v === undefined || v === null) {
      if (verplicht) this.fout(`${pad}.${veld}`, 'verplichte tekst ontbreekt')
      return
    }
    if (typeof v !== 'string') this.fout(`${pad}.${veld}`, 'moet tekst zijn')
    else if (v.length > 500) this.fout(`${pad}.${veld}`, 'tekst is te lang')
  }
  datum(o: Obj, veld: string, pad: string, verplicht = false) {
    const v = o[veld]
    if (v === undefined || v === null || v === '') {
      if (verplicht) this.fout(`${pad}.${veld}`, 'datum ontbreekt')
      return
    }
    if (!isDatum(v)) this.fout(`${pad}.${veld}`, 'moet een datum zijn (JJJJ-MM-DD)')
  }
  bool(o: Obj, veld: string, pad: string, verplicht = false) {
    const v = o[veld]
    if (v === undefined) {
      if (verplicht) this.fout(`${pad}.${veld}`, 'ja/nee ontbreekt')
      return
    }
    if (typeof v !== 'boolean') this.fout(`${pad}.${veld}`, 'moet ja of nee (true/false) zijn')
  }
  keuze(o: Obj, veld: string, pad: string, opties: string[], verplicht = false) {
    const v = o[veld]
    if (v === undefined) {
      if (verplicht) this.fout(`${pad}.${veld}`, 'keuze ontbreekt')
      return
    }
    if (typeof v !== 'string' || !opties.includes(v)) this.fout(`${pad}.${veld}`, `onbekende waarde, kies uit ${opties.join(', ')}`)
  }
  lijst(o: Obj, veld: string, pad: string, verplicht: boolean, elk: (x: Obj, pad: string) => void) {
    const v = o[veld]
    if (v === undefined) {
      if (verplicht) this.fout(`${pad}.${veld}`, 'lijst ontbreekt')
      return
    }
    if (!Array.isArray(v)) return this.fout(`${pad}.${veld}`, 'moet een lijst zijn')
    if (v.length > 500) return this.fout(`${pad}.${veld}`, 'lijst is te lang')
    v.forEach((x, i) => {
      const p = `${pad}.${veld}[${i}]`
      if (!isObj(x)) this.fout(p, 'moet een object zijn')
      else elk(x, p)
    })
  }
  /** Ronde 2: optionele vaste id's in een lijst (lib/dossier/ids.ts): kort, veilig als sleutel, en uniek. */
  lijstIds(o: Obj, veld: string, pad: string) {
    const v = o[veld]
    if (!Array.isArray(v)) return
    const gezien = new Set<string>()
    v.forEach((x, i) => {
      if (!isObj(x) || x.id === undefined) return
      const p = `${pad}.${veld}[${i}].id`
      if (typeof x.id !== 'string' || !ID_PATROON.test(x.id)) this.fout(p, 'moet een korte id zijn (letters, cijfers, - of _)')
      else if (gezien.has(x.id)) this.fout(p, 'komt twee keer voor')
      else gezien.add(x.id)
    })
  }
}

const BRON_VELDEN = new Set(['soort', 'koppelingId', 'administratieId', 'administratieNaam', 'jaar', 'geimporteerdOp'])

/** Herkomst van de cijfers van een onderneming (OndernemingInvoer.bron): strikte vorm, geen extra velden. */
function bronGeldig(c: Controle, b: unknown, pad: string): void {
  if (!isObj(b)) return c.fout(pad, 'moet een object zijn')
  for (const k of Object.keys(b)) if (!BRON_VELDEN.has(k)) c.fout(`${pad}.${k.slice(0, 40)}`, 'onbekend veld')
  if (b.soort !== 'moneybird') c.fout(`${pad}.soort`, "moet 'moneybird' zijn")
  if (typeof b.koppelingId !== 'string' || !/^(env|[1-9]\d{0,8})$/.test(b.koppelingId)) c.fout(`${pad}.koppelingId`, "moet 'env' of een nummer zijn")
  if (typeof b.administratieId !== 'string' || !/^\d{1,30}$/.test(b.administratieId)) c.fout(`${pad}.administratieId`, 'moet een Moneybird-nummer zijn')
  if (b.administratieNaam !== undefined) {
    if (typeof b.administratieNaam !== 'string') c.fout(`${pad}.administratieNaam`, 'moet tekst zijn')
    else if (b.administratieNaam.length > 200) c.fout(`${pad}.administratieNaam`, 'tekst is te lang')
  }
  if (!isGetal(b.jaar) || !Number.isInteger(b.jaar) || b.jaar < 2000 || b.jaar > 2100) c.fout(`${pad}.jaar`, 'moet een jaartal zijn')
  if (typeof b.geimporteerdOp !== 'string' || b.geimporteerdOp.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(b.geimporteerdOp) || Number.isNaN(Date.parse(b.geimporteerdOp))) {
    c.fout(`${pad}.geimporteerdOp`, 'moet een ISO-tijdstip zijn')
  }
}

const JAARREKENING_VELDEN = new Set(['begin', 'eind', 'specificaties', 'mva', 'onttrekkingen', 'stortingen', 'winstEnVerlies', 'omschrijvingActiviteiten', 'bron'])
const JAARREKENING_BRONNEN = ['moneybird', 'handmatig']

/**
 * Jaarrekening voor het rapport (OndernemingInvoer.jaarrekening): strikte vorm zonder extra velden,
 * alleen bekende posten en rubrieken, eindige bedragen binnen JAARREKENING_GRENZEN.bedrag, begrensde
 * teksten en lijsten. Leeg is ontbrekend; null telt niet als leeg.
 */
function jaarrekeningGeldig(c: Controle, j: unknown, pad: string): void {
  if (!isObj(j)) return c.fout(pad, 'moet een object zijn')
  const G = JAARREKENING_GRENZEN
  for (const k of Object.keys(j)) if (!JAARREKENING_VELDEN.has(k)) c.fout(`${pad}.${k.slice(0, 40)}`, 'onbekend veld')

  const bedrag = (v: unknown, p: string, opties: { verplicht?: boolean; nietNegatief?: boolean } = {}) => {
    if (v === undefined) {
      if (opties.verplicht) c.fout(p, 'verplicht bedrag ontbreekt')
      return
    }
    if (!isGetal(v)) return c.fout(p, 'moet een getal zijn')
    if (Math.abs(v) > G.bedrag) return c.fout(p, 'bedrag buiten het redelijke bereik')
    if (opties.nietNegatief && v < 0) c.fout(p, 'mag niet negatief zijn')
  }
  const tekst = (v: unknown, p: string, max: number, verplicht = false) => {
    if (v === undefined) {
      if (verplicht) c.fout(p, 'verplichte tekst ontbreekt')
      return
    }
    if (typeof v !== 'string') c.fout(p, 'moet tekst zijn')
    else if (v.length > max) c.fout(p, `tekst is langer dan ${max} tekens`)
  }
  const strikt = (x: Obj, p: string, velden: string[]) => {
    for (const k of Object.keys(x)) if (!velden.includes(k)) c.fout(`${p}.${k.slice(0, 40)}`, 'onbekend veld')
  }
  const lijst = (veld: string, max: number, elk: (x: Obj, p: string) => void) => {
    const v = j[veld]
    if (v === undefined) return
    const p = `${pad}.${veld}`
    if (!Array.isArray(v)) return c.fout(p, 'moet een lijst zijn')
    if (v.length > max) return c.fout(p, `maximaal ${max} regels`)
    v.forEach((x, i) => (isObj(x) ? elk(x, `${p}[${i}]`) : c.fout(`${p}[${i}]`, 'moet een object zijn')))
  }

  for (const peildatum of ['begin', 'eind'] as const) {
    const s = j[peildatum]
    if (s === undefined) continue
    const p = `${pad}.${peildatum}`
    if (!isObj(s)) {
      c.fout(p, 'moet een object zijn')
      continue
    }
    for (const [post, v] of Object.entries(s)) {
      if (!isBalansPost(post)) c.fout(`${p}.${post.slice(0, 40)}`, 'onbekende balanspost')
      else bedrag(v, `${p}.${post}`)
    }
  }

  lijst('specificaties', G.specificaties, (s, p) => {
    strikt(s, p, ['post', 'omschrijving', 'begin', 'eind'])
    if (!isBalansPost(s.post)) c.fout(`${p}.post`, 'onbekende balanspost')
    tekst(s.omschrijving, `${p}.omschrijving`, G.omschrijving, true)
    bedrag(s.begin, `${p}.begin`, { verplicht: true })
    bedrag(s.eind, `${p}.eind`, { verplicht: true })
  })

  if (j.mva !== undefined) {
    const p = `${pad}.mva`
    if (!isObj(j.mva)) c.fout(p, 'moet een object zijn')
    else {
      strikt(j.mva, p, ['aanschafwaarde', 'restwaarde'])
      bedrag(j.mva.aanschafwaarde, `${p}.aanschafwaarde`, { verplicht: true, nietNegatief: true })
      bedrag(j.mva.restwaarde, `${p}.restwaarde`, { verplicht: true, nietNegatief: true })
    }
  }

  for (const veld of ['onttrekkingen', 'stortingen'] as const) {
    lijst(veld, G[veld], (r, p) => {
      strikt(r, p, ['omschrijving', 'bedrag'])
      tekst(r.omschrijving, `${p}.omschrijving`, G.omschrijving, true)
      bedrag(r.bedrag, `${p}.bedrag`, { verplicht: true })
    })
  }

  const gezien = new Set<string>()
  lijst('winstEnVerlies', WV_RUBRIEKEN.length, (r, p) => {
    strikt(r, p, ['rubriek', 'bedrag'])
    if (!isWvRubriek(r.rubriek)) c.fout(`${p}.rubriek`, 'onbekende rubriek')
    else if (gezien.has(r.rubriek)) c.fout(`${p}.rubriek`, `rubriek ${r.rubriek} komt twee keer voor`)
    else gezien.add(r.rubriek)
    bedrag(r.bedrag, `${p}.bedrag`, { verplicht: true })
  })

  tekst(j.omschrijvingActiviteiten, `${pad}.omschrijvingActiviteiten`, G.omschrijvingActiviteiten)
  if (j.bron !== undefined && !JAARREKENING_BRONNEN.includes(j.bron as string)) c.fout(`${pad}.bron`, "moet 'moneybird' of 'handmatig' zijn")
}

function eigenaarGeldig(x: unknown, kindIds: Set<string>): boolean {
  if (x === 'A' || x === 'B') return true
  return typeof x === 'string' && x.startsWith('kind:') && kindIds.has(x.slice(5))
}

export function valideerInvoer(obj: unknown): string[] {
  const c = new Controle()
  if (!isObj(obj)) return ['invoer: moet een object zijn']
  // Eerst de harde grenzen (lijstlengtes, bedragen, prototype-sleutels), zodat de engine nooit
  // met een invoer draait die de server lang bezig houdt.
  const grenzen = controleerGrenzen(obj)
  if (grenzen.length > 0) return grenzen

  if (!isGetal(obj.jaar) || !Number.isInteger(obj.jaar)) c.fout('jaar', 'moet een heel getal zijn')
  else if (!BESCHIKBARE_JAREN().includes(obj.jaar)) c.fout('jaar', `geen parameters voor ${obj.jaar}; beschikbaar: ${BESCHIKBARE_JAREN().join(', ')}`)
  if (obj.variant !== undefined && obj.variant !== null && typeof obj.variant !== 'string') c.fout('variant', 'moet tekst zijn')
  c.bool(obj, 'fiscaalPartner', 'invoer', true)
  c.getal(obj, 'opgegevenToetsingsinkomen', 'invoer')
  valideerPriveHuishouden(obj, c.fout.bind(c))

  // Personen
  if (!Array.isArray(obj.personen) || obj.personen.length < 1 || obj.personen.length > 2) {
    c.fout('personen', 'één of twee personen nodig')
  } else {
    const ids = new Set<string>()
    obj.personen.forEach((p, i) => {
      const pad = `personen[${i}]`
      if (!isObj(p)) return c.fout(pad, 'moet een object zijn')
      if (p.id !== 'A' && p.id !== 'B') c.fout(`${pad}.id`, "moet 'A' of 'B' zijn")
      else if (ids.has(p.id)) c.fout(`${pad}.id`, `persoon ${p.id} komt twee keer voor`)
      else ids.add(p.id)
      c.tekst(p, 'naam', pad)
      // Leeg mag (een nieuwe persoon, of nog niet ingevuld): de controle "Geboortedatum ontbreekt" vangt het en de
      // berekening rekent zolang met een standaard (lib/dossier/bereken.ts). Ontbreken of een andere vorm mag niet.
      if (p.geboortedatum !== '') c.datum(p, 'geboortedatum', pad, true)
      for (const v of ['resultaatOverigWerk', 'periodiekeUitkeringen', 'restantPgaVorigJaar', 'voorlopigeAanslagIB', 'voorlopigeAanslagZvw', 'partneralimentatie']) c.getal(p, v, pad)

      c.lijstIds(p, 'ondernemingen', pad)
      c.lijst(p, 'ondernemingen', pad, true, (o, op) => {
        c.tekst(o, 'naam', op, true)
        c.getal(o, 'startjaar', op, true)
        for (const v of ['maandenGewerkt', 'beperktAftrekbaar', 'zakelijkeKmPrive', 'startersaftrekEerderGebruikt', 'soUren']) c.getal(o, v, op)
        c.bool(o, 'kmAftrekAlInSaldo', op)
        const wb = o.winstberekening
        if (!isObj(wb)) c.fout(`${op}.winstberekening`, 'ontbreekt')
        else if (wb.soort === 'saldo') {
          c.getal(wb, 'saldo', `${op}.winstberekening`, true)
          c.getal(wb, 'afschrijvingenInSaldo', `${op}.winstberekening`)
          if (isGetal(wb.afschrijvingenInSaldo) && wb.afschrijvingenInSaldo < 0) c.fout(`${op}.winstberekening.afschrijvingenInSaldo`, 'mag niet negatief zijn')
        } else if (wb.soort === 'uitgesplitst') {
          c.getal(wb, 'omzet', `${op}.winstberekening`, true)
          c.getal(wb, 'kosten', `${op}.winstberekening`, true)
          for (const v of ['wijzigingOnderhandenWerk', 'financieleBatenLasten', 'afschrijvingen']) c.getal(wb, v, `${op}.winstberekening`)
        } else c.fout(`${op}.winstberekening.soort`, "moet 'saldo' of 'uitgesplitst' zijn")
        if (!isObj(o.uren)) c.fout(`${op}.uren`, 'ontbreekt')
        else {
          c.getal(o.uren, 'onderneming', `${op}.uren`, true)
          for (const v of ['loondienst', 'zwangerschapWeken', 'gemiddeldeUrenPerWeekVoorVerlof']) c.getal(o.uren, v, `${op}.uren`)
          c.bool(o.uren, 'urencriteriumGehaald', `${op}.uren`)
          c.bool(o.uren, 'urencriteriumVorigJaar', `${op}.uren`)
        }
        if (o.staking !== undefined) {
          if (!isObj(o.staking)) c.fout(`${op}.staking`, 'moet een object zijn')
          else {
            c.getal(o.staking, 'stakingswinst', `${op}.staking`, true)
            c.bool(o.staking, 'stakingsaftrekEerderGebruikt', `${op}.staking`)
            c.bool(o.staking, 'gedeeltelijk', `${op}.staking`)
            valideerStaking(c, o.staking, `${op}.staking`)
          }
        }
        valideerOndernemingRegelingen(c, o, op)
        c.keuze(o, 'samenwerkingMetPartner', op, [...SAMENWERKING_PARTNER])
        if (o.meewerkendePartner !== undefined) {
          const mp = o.meewerkendePartner
          const mpp = `${op}.meewerkendePartner`
          if (!isObj(mp)) c.fout(mpp, 'moet een object zijn')
          else {
            c.getal(mp, 'uren', mpp, true)
            c.getal(mp, 'vergoeding', mpp, true)
            c.bool(mp, 'vergoedingInKosten', mpp)
            for (const v of ['uren', 'vergoeding']) if (isGetal(mp[v]) && (mp[v] as number) < 0) c.fout(`${mpp}.${v}`, 'mag niet negatief zijn')
          }
        }
        if (o.werkruimte !== undefined) {
          const w = o.werkruimte
          const wp = `${op}.werkruimte`
          if (!isObj(w)) c.fout(wp, 'moet een object zijn')
          else {
            for (const v of ['zelfstandig', 'werkplekElders']) c.bool(w, v, wp, true)
            for (const v of ['deelInkomenInOfVanuit', 'deelInkomenIn']) {
              c.getal(w, v, wp, true)
              if (isGetal(w[v]) && ((w[v] as number) < 0 || (w[v] as number) > 1)) c.fout(`${wp}.${v}`, 'moet tussen 0 en 1 liggen')
            }
            c.getal(w, 'kosten', wp, true)
          }
        }
        if (o.for !== undefined) {
          if (!isObj(o.for)) c.fout(`${op}.for`, 'moet een object zijn')
          else {
            c.getal(o.for, 'stand', `${op}.for`, true)
            c.getal(o.for, 'ondernemingsvermogenEinde', `${op}.for`)
            c.getal(o.for, 'vrijwilligeAfname', `${op}.for`)
          }
        }
        if (o.auto !== undefined) {
          if (!isObj(o.auto)) c.fout(`${op}.auto`, 'moet een object zijn')
          else {
            c.getal(o.auto, 'cataloguswaarde', `${op}.auto`, true)
            c.datum(o.auto, 'datumEersteToelating', `${op}.auto`, true)
            c.bool(o.auto, 'nulEmissie', `${op}.auto`, true)
            c.getal(o.auto, 'autokosten', `${op}.auto`, true)
            c.getal(o.auto, 'priveKm', `${op}.auto`)
          }
        }
        c.lijstIds(o, 'investeringen', op)
        c.lijst(o, 'investeringen', op, false, (inv, ip) => {
          c.tekst(inv, 'omschrijving', ip, true)
          c.datum(inv, 'datum', ip, true)
          c.getal(inv, 'bedrag', ip, true)
          c.getal(inv, 'betaald', ip)
          c.keuze(inv, 'regeling', ip, REGELINGEN)
          for (const v of ['inGebruik', 'uitgesloten', 'gekochtVanPartner', 'gemeld']) c.bool(inv, v, ip)
          if (isGetal(inv.betaald) && inv.betaald < 0) c.fout(`${ip}.betaald`, 'mag niet negatief zijn')
          valideerInvesteringHir(c, inv, ip)
        })
        c.lijst(o, 'activa', op, false, (a, ap) => {
          c.tekst(a, 'omschrijving', ap, true)
          c.datum(a, 'aanschafdatum', ap, true)
          c.getal(a, 'aanschafwaarde', ap, true)
          c.getal(a, 'restwaarde', ap, true)
          c.getal(a, 'levensduurJaren', ap, true)
          c.keuze(a, 'methode', ap, ACTIEF_METHODE, true)
          // Activaregister (G02): bedragen niet negatief, levensduur minstens een jaar, verkoop en investeringsaftrek als object.
          for (const v of ['aanschafwaarde', 'restwaarde', 'woz', 'boekwaardeBegin', 'willekeurigBedrag']) if (isGetal(a[v]) && (a[v] as number) < 0) c.fout(`${ap}.${v}`, 'mag niet negatief zijn')
          if (isGetal(a.levensduurJaren) && a.levensduurJaren < 1) c.fout(`${ap}.levensduurJaren`, 'moet minstens 1 jaar zijn')
          c.keuze(a, 'soort', ap, ['bedrijfsmiddel', 'goodwill', 'gebouw'])
          c.getal(a, 'woz', ap)
          c.getal(a, 'boekwaardeBegin', ap)
          c.getal(a, 'willekeurigBedrag', ap)
          c.keuze(a, 'bron', ap, ['investering', 'moneybird', 'handmatig'])
          if (a.herkomst !== undefined && !isHerkomst(a.herkomst)) c.fout(`${ap}.herkomst`, "moet 'inv:<jaar>:<nummer>' of 'act:<jaar>:<nummer>' zijn")
          if (a.verkocht !== undefined) {
            if (!isObj(a.verkocht)) c.fout(`${ap}.verkocht`, 'moet een object zijn')
            else {
              c.datum(a.verkocht, 'datum', `${ap}.verkocht`, true)
              c.getal(a.verkocht, 'verkoopprijs', `${ap}.verkocht`, true)
              if (isGetal(a.verkocht.verkoopprijs) && a.verkocht.verkoopprijs < 0) c.fout(`${ap}.verkocht.verkoopprijs`, 'mag niet negatief zijn')
              if (isDatum(a.verkocht.datum) && isDatum(a.aanschafdatum) && a.verkocht.datum < a.aanschafdatum) c.fout(`${ap}.verkocht.datum`, 'ligt vóór de aanschafdatum')
            }
          }
          if (a.investeringsaftrek !== undefined) {
            const ia = a.investeringsaftrek
            const iap = `${ap}.investeringsaftrek`
            if (!isObj(ia)) c.fout(iap, 'moet een object zijn')
            else {
              c.keuze(ia, 'regeling', iap, ['kia', 'eia', 'mia-1', 'mia-2', 'mia-3'], true)
              c.getal(ia, 'jaar', iap, true)
              if (isGetal(ia.jaar) && (!Number.isInteger(ia.jaar) || ia.jaar < 1990 || ia.jaar > 2100)) c.fout(`${iap}.jaar`, 'moet een jaartal zijn')
              c.getal(ia, 'genotenPct', iap, true)
              if (isGetal(ia.genotenPct) && (ia.genotenPct < 0 || ia.genotenPct > 1)) c.fout(`${iap}.genotenPct`, 'moet een fractie tussen 0 en 1 zijn')
            }
          }
        })
        c.lijst(o, 'desinvesteringen', op, false, (d, dp) => {
          c.tekst(d, 'omschrijving', dp, true)
          c.getal(d, 'verkoopprijs', dp, true)
          c.getal(d, 'investeringsjaar', dp, true)
          c.getal(d, 'genotenPct', dp, true)
          c.getal(d, 'genotenAftrek', dp)
          for (const v of ['verkoopprijs', 'genotenAftrek']) if (isGetal(d[v]) && (d[v] as number) < 0) c.fout(`${dp}.${v}`, 'mag niet negatief zijn')
          if (isGetal(d.investeringsjaar) && (!Number.isInteger(d.investeringsjaar) || d.investeringsjaar < 1990 || d.investeringsjaar > 2100)) c.fout(`${dp}.investeringsjaar`, 'moet een heel jaartal zijn')
          if (isGetal(d.genotenPct) && (d.genotenPct < 0 || d.genotenPct > 1)) c.fout(`${dp}.genotenPct`, 'moet een fractie tussen 0 en 1 zijn')
        })
        // Contract van de herstelronde: alle bedrijfsmiddelen in het register, andere verkopen, verwijderde doorgerolde middelen.
        c.bool(o, 'activaVolledig', op)
        c.getal(o, 'overigeVerkopen', op)
        if (isGetal(o.overigeVerkopen) && o.overigeVerkopen < 0) c.fout(`${op}.overigeVerkopen`, 'mag niet negatief zijn')
        if (o.doorrolUitgesloten !== undefined) {
          const du = o.doorrolUitgesloten
          if (!Array.isArray(du)) c.fout(`${op}.doorrolUitgesloten`, 'moet een lijst zijn')
          else if (du.length > 500) c.fout(`${op}.doorrolUitgesloten`, 'lijst is te lang')
          else du.forEach((x, i) => !isHerkomst(x) && c.fout(`${op}.doorrolUitgesloten[${i}]`, "moet 'inv:<jaar>:<nummer>' of 'act:<jaar>:<nummer>' zijn"))
        }
        if (o.bron !== undefined) bronGeldig(c, o.bron, `${op}.bron`)
        if (o.jaarrekening !== undefined) jaarrekeningGeldig(c, o.jaarrekening, `${op}.jaarrekening`)
        c.lijst(o, 'opdrachtgevers', op, false, (og, ogp) => {
          c.tekst(og, 'naam', ogp, true)
          c.getal(og, 'omzet', ogp, true)
          c.getal(og, 'uurtarief', ogp)
          c.getal(og, 'duurMaanden', ogp)
          c.bool(og, 'viaPlatform', ogp)
        })
      })

      c.lijstIds(p, 'loon', pad)
      c.lijst(p, 'loon', pad, true, (l, lp) => {
        c.tekst(l, 'omschrijving', lp, true)
        c.keuze(l, 'soort', lp, LOON_SOORTEN, true)
        c.getal(l, 'bruto', lp, true)
        c.getal(l, 'ingehoudenLoonheffing', lp, true)
        c.getal(l, 'zvwBijdrageloon', lp)
      })

      const iv = p.inkomensvoorziening
      if (!isObj(iv)) c.fout(`${pad}.inkomensvoorziening`, 'ontbreekt')
      else {
        const ip = `${pad}.inkomensvoorziening`
        c.getal(iv, 'lijfrentePremies', ip, true)
        c.getal(iv, 'aovPremies', ip, true)
        for (const v of ['forOmzetting', 'nettolijfrenteInleg', 'premiegrondslagInkomenVorigJaar', 'forToenameVorigJaar']) c.getal(iv, v, ip)
        valideerStakingslijfrente(c, iv, ip)
        c.lijst(iv, 'historie', ip, false, (h, hp) => {
          c.getal(h, 'jaar', hp, true)
          c.getal(h, 'premiegrondslagInkomen', hp, true)
          c.getal(h, 'alGebruikt', hp, true)
          c.getal(h, 'forToenameVorigJaar', hp)
          c.getal(h, 'jaarruimteOverride', hp)
        })
      }
      // Saldi uit eerdere jaren (doorrol): per jaar een bedrag, uit een jaar vóór dit jaar, niet negatief.
      for (const veld of ['verliezen', 'nietBenutteZelfstandigenaftrek']) {
        c.lijst(p, veld, pad, false, (v, vp) => {
          c.getal(v, 'jaar', vp, true)
          c.getal(v, 'bedrag', vp, true)
          if (isGetal(v.jaar) && !Number.isInteger(v.jaar)) c.fout(`${vp}.jaar`, 'moet een heel jaartal zijn')
          else if (isGetal(v.jaar) && isGetal(obj.jaar) && v.jaar >= obj.jaar) c.fout(`${vp}.jaar`, `moet een eerder jaar zijn dan ${obj.jaar}`)
          if (isGetal(v.bedrag) && v.bedrag < 0) c.fout(`${vp}.bedrag`, 'mag niet negatief zijn')
        })
      }
      if (isGetal(p.restantPgaVorigJaar) && p.restantPgaVorigJaar < 0) c.fout(`${pad}.restantPgaVorigJaar`, 'mag niet negatief zijn')
      valideerPrivePersoon(p, pad, obj.jaar, c.fout.bind(c))
      // Een verwijzing naar een onderneming of bezitting die er niet meer is, is geen vormfout: de engine rekent die regel
      // niet mee en meldt het, zodat opslaan nooit vastloopt op een weggehaalde onderneming.
      c.getal(p, 'voortgewenteldeBronbelasting', pad)
      if (isGetal(p.voortgewenteldeBronbelasting) && p.voortgewenteldeBronbelasting < 0) c.fout(`${pad}.voortgewenteldeBronbelasting`, 'mag niet negatief zijn')
      c.lijstIds(p, 'terbeschikkingstellingen', pad)
      c.lijst(p, 'terbeschikkingstellingen', pad, false, (t, tp) => {
        c.tekst(t, 'id', tp, true)
        c.tekst(t, 'omschrijving', tp, true)
        c.keuze(t, 'soort', tp, [...TBS_SOORTEN], true)
        if (!isObj(t.aan)) c.fout(`${tp}.aan`, 'ontbreekt')
        else {
          if (t.aan.persoon !== 'A' && t.aan.persoon !== 'B') c.fout(`${tp}.aan.persoon`, "moet 'A' of 'B' zijn")
          else if (t.aan.persoon === p.id) c.fout(`${tp}.aan.persoon`, 'moet de partner zijn')
          c.tekst(t.aan, 'ondernemingId', `${tp}.aan`)
          c.getal(t.aan, 'ondernemingIndex', `${tp}.aan`)
        }
        c.getal(t, 'vergoeding', tp, true)
        for (const v of ['kosten', 'afschrijving', 'waardeBijAanvang', 'boekwaardeBegin']) {
          c.getal(t, v, tp)
          if (isGetal(t[v]) && (t[v] as number) < 0) c.fout(`${tp}.${v}`, 'mag niet negatief zijn')
        }
        if (isGetal(t.vergoeding) && t.vergoeding < 0) c.fout(`${tp}.vergoeding`, 'mag niet negatief zijn')
        c.tekst(t, 'box3PositieId', tp)
        c.bool(t, 'vergoedingInKosten', tp)
        if (t.einde !== undefined) {
          if (!isObj(t.einde)) c.fout(`${tp}.einde`, 'moet een object zijn')
          else {
            c.datum(t.einde, 'datum', `${tp}.einde`, true)
            c.getal(t.einde, 'opbrengst', `${tp}.einde`, true)
          }
        }
      })
      valideerPersoonStaking(c, p, pad)
    })
    if (obj.fiscaalPartner === true && obj.personen.length !== 2) c.fout('personen', 'met een fiscaal partner zijn twee personen nodig')
  }

  // Kinderen
  const kindIds = new Set<string>()
  c.lijst(obj, 'kinderen', 'invoer', true, (k, kp) => {
    c.tekst(k, 'id', kp, true)
    if (typeof k.id === 'string') kindIds.add(k.id)
    c.tekst(k, 'naam', kp)
    c.datum(k, 'geboortedatum', kp, true)
    c.datum(k, 'inHuishoudenVanaf', kp)
    c.lijst(k, 'opvang', kp, false, (o, op) => {
      c.keuze(o, 'soort', op, OPVANG, true)
      c.getal(o, 'urenPerMaand', op, true)
      c.getal(o, 'uurtarief', op, true)
      c.getal(o, 'maanden', op, true)
      c.datum(o, 'startdatum', op)
    })
  })

  // Eigen woning
  if (obj.eigenWoning !== undefined) {
    const ew = obj.eigenWoning
    if (!isObj(ew)) c.fout('eigenWoning', 'moet een object zijn')
    else {
      c.getal(ew, 'woz', 'eigenWoning', true)
      for (const v of ['rente', 'financieringskosten', 'erfpacht']) c.getal(ew, v, 'eigenWoning')
      c.lijstIds(ew, 'leningdelen', 'eigenWoning')
      c.lijst(ew, 'leningdelen', 'eigenWoning', false, (l, lp) => {
        c.tekst(l, 'omschrijving', lp, true)
        c.getal(l, 'hoofdsom', lp, true)
        c.datum(l, 'startdatum', lp, true)
        c.keuze(l, 'aflossingsvorm', lp, AFLOSSING, true)
        c.getal(l, 'rente', lp, true)
        c.bool(l, 'overgangsrecht', lp)
        valideerLeningdeelPrive(l, lp, c.fout.bind(c))
      })
      valideerWoningPrive(ew, c.fout.bind(c))
    }
  }

  // Box 3
  const b3 = obj.box3
  if (!isObj(b3)) c.fout('box3', 'ontbreekt')
  else {
    // Voor het werkelijk rendement: een negatieve storting is een opname en andersom, dus beide niet negatief.
    // Directe opbrengsten mogen negatief zijn (negatieve rente op een banktegoed, art. 5.27 lid 2).
    const box3NietNegatief = (o: Obj, veld: string, pad: string) => {
      const v = o[veld]
      if (isGetal(v) && v < 0) c.fout(`${pad}.${veld}`, 'mag niet negatief zijn')
    }
    c.bool(b3, 'tegenbewijs', 'box3')
    c.lijst(b3, 'posities', 'box3', true, (pos, pp) => {
      c.tekst(pos, 'id', pp, true)
      c.tekst(pos, 'omschrijving', pp, true)
      c.keuze(pos, 'categorie', pp, BOX3_CATEGORIEEN, true)
      if (!eigenaarGeldig(pos.eigenaar, kindIds)) c.fout(`${pp}.eigenaar`, "moet 'A', 'B' of 'kind:<id van een kind>' zijn")
      c.getal(pos, 'waardeBegin', pp, true)
      for (const v of ['waardeEind', 'stortingen', 'onttrekkingen', 'directeOpbrengsten', 'dividendbelasting', 'aanschafwaarde']) c.getal(pos, v, pp)
      for (const v of ['stortingen', 'onttrekkingen']) box3NietNegatief(pos, v, pp)
      c.datum(pos, 'categoriewisselDatum', pp)
      if (pos.bronbelasting !== undefined) {
        if (!isObj(pos.bronbelasting)) c.fout(`${pp}.bronbelasting`, 'moet een object zijn')
        else {
          c.getal(pos.bronbelasting, 'bedrag', `${pp}.bronbelasting`, true)
          c.getal(pos.bronbelasting, 'brutoInkomsten', `${pp}.bronbelasting`, true)
        }
      }
      c.lijstIds(pos, 'bronbelastingen', pp)
      c.lijst(pos, 'bronbelastingen', pp, false, (b, bp) => {
        c.tekst(b, 'id', bp, true)
        if (typeof b.land !== 'string' || !(b.land === '' || /^[A-Z]{2}$/.test(b.land))) c.fout(`${bp}.land`, 'moet leeg zijn of een landcode van twee hoofdletters')
        c.keuze(b, 'soort', bp, ['dividend', 'rente'], true)
        for (const v of ['brutoInkomsten', 'bedrag']) {
          c.getal(b, v, bp, true)
          if (isGetal(b[v]) && (b[v] as number) < 0) c.fout(`${bp}.${v}`, 'mag niet negatief zijn')
        }
        c.datum(b, 'datum', bp)
        c.getal(b, 'verdragstarief', bp)
        if (isGetal(b.verdragstarief) && (b.verdragstarief < 0 || b.verdragstarief > 1)) c.fout(`${bp}.verdragstarief`, 'moet tussen 0 en 1 liggen')
      })
      if (pos.herkomst !== undefined) controleerHerkomst(pos.herkomst, `${pp}.herkomst`, (p, m) => c.fout(p, m))
      if (pos.woz !== undefined) {
        const wp = `${pp}.woz`
        if (!isObj(pos.woz)) c.fout(wp, 'moet een object zijn')
        else {
          c.getal(pos.woz, 'begin', wp, true)
          c.getal(pos.woz, 'eind', wp, true)
          for (const v of ['begin', 'eind']) box3NietNegatief(pos.woz, v, wp)
          const dagen = pos.woz.dagenEigenGebruik
          if (dagen !== undefined && dagen !== null && (!isGetal(dagen) || !Number.isInteger(dagen) || dagen < 0 || dagen > 366)) {
            c.fout(`${wp}.dagenEigenGebruik`, 'moet een heel aantal dagen zijn, van 0 tot en met 366')
          }
        }
      }
    })
    c.lijst(b3, 'schulden', 'box3', true, (s, sp) => {
      c.tekst(s, 'id', sp, true)
      c.tekst(s, 'omschrijving', sp, true)
      if (!eigenaarGeldig(s.eigenaar, kindIds)) c.fout(`${sp}.eigenaar`, "moet 'A', 'B' of 'kind:<id van een kind>' zijn")
      c.getal(s, 'waardeBegin', sp, true)
      c.getal(s, 'waardeEind', sp)
      c.getal(s, 'betaaldeRente', sp)
      box3NietNegatief(s, 'betaaldeRente', sp)
      valideerSchuldPrive(s, sp, c.fout.bind(c))
    })
  }

  // PGA en box 2
  if (obj.pga !== undefined) {
    if (!isObj(obj.pga)) c.fout('pga', 'moet een object zijn')
    else for (const v of ['giftenGewoon', 'giftenPeriodiek', 'giftenCultureel', 'specifiekeZorgkosten', 'scholing']) c.getal(obj.pga, v, 'pga')
  }
  c.lijstIds(obj, 'box2', 'invoer')
  c.lijst(obj, 'box2', 'invoer', false, (b, bp) => {
    if (b.eigenaar !== 'A' && b.eigenaar !== 'B') c.fout(`${bp}.eigenaar`, "moet 'A' of 'B' zijn")
    c.getal(b, 'dividend', bp, true)
    c.getal(b, 'ingehoudenDividendbelasting', bp, true)
    c.getal(b, 'vervreemdingsvoordeel', bp)
    c.getal(b, 'schuldAanBV', bp)
  })

  // Verdeling
  if (obj.verdeling !== 'optimaal') {
    if (!isObj(obj.verdeling)) c.fout('verdeling', "moet 'optimaal' of een verdeling per post zijn")
    else
      for (const post of VERDEELPOSTEN) {
        const v = obj.verdeling[post]
        if (!isGetal(v) || v < 0 || v > 1) c.fout(`verdeling.${post}`, 'moet een aandeel tussen 0 en 1 zijn')
      }
  }

  return c.fouten
}
