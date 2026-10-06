/**
 * Hulpfuncties voor de publieke API: vormcontrole van een HuishoudenInvoer met
 * begrijpelijke foutmeldingen en een eenvoudige rate limiter in het geheugen.
 * Logt niets; foutmeldingen noemen paden en verwachte types, nooit bedragen.
 */
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { BESCHIKBARE_JAREN, getJaar } from '@/lib/tax/years'

export const MAX_BODY_BYTES = 100 * 1024

type Ruw = Record<string, unknown>
const isObj = (x: unknown): x is Ruw => typeof x === 'object' && x !== null && !Array.isArray(x)
const isGetal = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

export type Validatie = { ok: true; invoer: HuishoudenInvoer } | { ok: false; fouten: string[] }

const MAX_FOUTEN = 20

/** Controleert de vorm (niet de fiscale juistheid) van een HuishoudenInvoer. */
export function valideerInvoer(x: unknown): Validatie {
  const fouten: string[] = []
  const fout = (m: string) => {
    if (fouten.length < MAX_FOUTEN) fouten.push(m)
  }
  const getal = (o: Ruw, veld: string, pad: string, verplicht = true) => {
    if (o[veld] === undefined) {
      if (verplicht) fout(`${pad}.${veld} ontbreekt (getal verwacht).`)
    } else if (!isGetal(o[veld])) fout(`${pad}.${veld} moet een getal zijn.`)
  }
  const lijst = (o: Ruw, veld: string, pad: string, verplicht = true): unknown[] | null => {
    const naam = pad ? `${pad}.${veld}` : veld
    if (o[veld] === undefined) {
      if (verplicht) fout(`${naam} ontbreekt (lijst verwacht).`)
      return null
    }
    if (!Array.isArray(o[veld])) {
      fout(`${naam} moet een lijst zijn.`)
      return null
    }
    return o[veld] as unknown[]
  }

  if (!isObj(x)) return { ok: false, fouten: ['De body moet een JSON-object zijn (HuishoudenInvoer).'] }

  const jaren = BESCHIKBARE_JAREN()
  if (!isGetal(x.jaar) || !Number.isInteger(x.jaar)) fout('jaar ontbreekt of is geen geheel getal.')
  else if (!jaren.includes(x.jaar)) fout(`jaar ${x.jaar} is niet beschikbaar. Kies uit ${jaren.join(', ')}.`)
  if (x.variant !== undefined && typeof x.variant !== 'string') fout('variant moet een tekst zijn.')
  if (typeof x.fiscaalPartner !== 'boolean') fout('fiscaalPartner ontbreekt (true of false).')

  const personen = lijst(x, 'personen', '')
  if (personen) {
    if (personen.length < 1 || personen.length > 2) fout('personen moet één of twee personen bevatten.')
    const ids = new Set<string>()
    personen.forEach((p, i) => {
      const pad = `personen[${i}]`
      if (!isObj(p)) return fout(`${pad} moet een object zijn.`)
      if (p.id !== 'A' && p.id !== 'B') fout(`${pad}.id moet 'A' of 'B' zijn.`)
      else if (ids.has(p.id)) fout(`${pad}.id '${p.id}' komt twee keer voor.`)
      else ids.add(p.id)
      if (typeof p.geboortedatum !== 'string' || !ISO_DATUM.test(p.geboortedatum)) fout(`${pad}.geboortedatum moet een datum zijn als 'JJJJ-MM-DD'.`)
      const ondernemingen = lijst(p, 'ondernemingen', pad)
      ondernemingen?.forEach((o, j) => {
        const opad = `${pad}.ondernemingen[${j}]`
        if (!isObj(o)) return fout(`${opad} moet een object zijn.`)
        if (typeof o.naam !== 'string') fout(`${opad}.naam ontbreekt (tekst verwacht).`)
        const w = o.winstberekening
        if (!isObj(w)) fout(`${opad}.winstberekening ontbreekt.`)
        else if (w.soort === 'saldo') getal(w, 'saldo', `${opad}.winstberekening`)
        else if (w.soort === 'uitgesplitst') {
          getal(w, 'omzet', `${opad}.winstberekening`)
          getal(w, 'kosten', `${opad}.winstberekening`)
        } else fout(`${opad}.winstberekening.soort moet 'saldo' of 'uitgesplitst' zijn.`)
        if (!isObj(o.uren)) fout(`${opad}.uren ontbreekt (object met onderneming).`)
        else getal(o.uren, 'onderneming', `${opad}.uren`)
        if (!isGetal(o.startjaar) || !Number.isInteger(o.startjaar)) fout(`${opad}.startjaar moet een jaartal zijn.`)
        if (o.maandenGewerkt !== undefined && (!isGetal(o.maandenGewerkt) || o.maandenGewerkt < 0 || o.maandenGewerkt > 12)) fout(`${opad}.maandenGewerkt moet tussen 0 en 12 liggen.`)
        for (const veld of ['investeringen', 'activa', 'desinvesteringen', 'opdrachtgevers'] as const) lijst(o, veld, opad, false)
      })
      const loon = lijst(p, 'loon', pad)
      loon?.forEach((l, j) => {
        const lpad = `${pad}.loon[${j}]`
        if (!isObj(l)) return fout(`${lpad} moet een object zijn.`)
        getal(l, 'bruto', lpad)
        getal(l, 'ingehoudenLoonheffing', lpad)
      })
      if (!isObj(p.inkomensvoorziening)) fout(`${pad}.inkomensvoorziening ontbreekt (object met lijfrentePremies en aovPremies).`)
      else {
        getal(p.inkomensvoorziening, 'lijfrentePremies', `${pad}.inkomensvoorziening`)
        getal(p.inkomensvoorziening, 'aovPremies', `${pad}.inkomensvoorziening`)
      }
      for (const veld of ['voorlopigeAanslagIB', 'voorlopigeAanslagZvw', 'resultaatOverigWerk', 'periodiekeUitkeringen'] as const) getal(p, veld, pad, false)
    })
  }

  const kinderen = lijst(x, 'kinderen', '')
  kinderen?.forEach((k, i) => {
    const pad = `kinderen[${i}]`
    if (!isObj(k)) return fout(`${pad} moet een object zijn.`)
    if (typeof k.id !== 'string') fout(`${pad}.id ontbreekt (tekst verwacht).`)
    if (typeof k.geboortedatum !== 'string' || !ISO_DATUM.test(k.geboortedatum)) fout(`${pad}.geboortedatum moet een datum zijn als 'JJJJ-MM-DD'.`)
    lijst(k, 'opvang', pad, false)
  })

  if (!isObj(x.box3)) fout('box3 ontbreekt (object met posities en schulden).')
  else {
    lijst(x.box3, 'posities', 'box3')?.forEach((p, i) => {
      if (!isObj(p)) return fout(`box3.posities[${i}] moet een object zijn.`)
      if (typeof p.categorie !== 'string') fout(`box3.posities[${i}].categorie ontbreekt.`)
      getal(p, 'waardeBegin', `box3.posities[${i}]`)
    })
    lijst(x.box3, 'schulden', 'box3')?.forEach((s, i) => {
      if (!isObj(s)) return fout(`box3.schulden[${i}] moet een object zijn.`)
      getal(s, 'waardeBegin', `box3.schulden[${i}]`)
    })
  }

  if (x.eigenWoning !== undefined) {
    if (!isObj(x.eigenWoning)) fout('eigenWoning moet een object zijn.')
    else getal(x.eigenWoning, 'woz', 'eigenWoning')
  }

  const v = x.verdeling
  if (v !== 'optimaal') {
    if (!isObj(v)) fout("verdeling moet 'optimaal' zijn of een object met eigenWoning, pga, box3, box2 en dividendbelasting (0 tot en met 1).")
    else
      for (const veld of ['eigenWoning', 'pga', 'box3', 'box2', 'dividendbelasting']) {
        if (!isGetal(v[veld]) || (v[veld] as number) < 0 || (v[veld] as number) > 1) fout(`verdeling.${veld} moet een getal van 0 tot en met 1 zijn.`)
      }
  }

  return fouten.length ? { ok: false, fouten } : { ok: true, invoer: x as unknown as HuishoudenInvoer }
}

/** Controleert of een variant voor dit jaar bestaat; geeft een foutmelding of null. */
export function controleerVariant(jaar: number, variant: string | undefined): string | null {
  if (!variant) return null
  const bekend = getJaar(jaar).varianten.map((v) => v.id)
  return bekend.includes(variant) ? null : `Onbekende variant '${variant.slice(0, 40)}' voor ${jaar}. Beschikbaar: ${bekend.join(', ') || 'geen'}.`
}

/** Vaste-venster rate limiter in het geheugen (per proces). */
export function maakRateLimiter(opties: { max: number; vensterMs: number; maxSleutels?: number }) {
  const tellers = new Map<string, { aantal: number; reset: number }>()
  const maxSleutels = opties.maxSleutels ?? 10000
  return function controleer(sleutel: string, nu: number = Date.now()): { toegestaan: boolean; resterend: number; resetOver: number } {
    if (tellers.size > maxSleutels) {
      for (const [k, t] of tellers) if (t.reset <= nu) tellers.delete(k)
      if (tellers.size > maxSleutels) tellers.clear()
    }
    let t = tellers.get(sleutel)
    if (!t || t.reset <= nu) {
      t = { aantal: 0, reset: nu + opties.vensterMs }
      tellers.set(sleutel, t)
    }
    t.aantal++
    const resetOver = Math.max(0, t.reset - nu)
    return { toegestaan: t.aantal <= opties.max, resterend: Math.max(0, opties.max - t.aantal), resetOver }
  }
}

/** IP-adres uit de proxyheaders (CapRover/nginx), anders een vaste sleutel. */
export function clientSleutel(headers: Headers): string {
  const doorgestuurd = headers.get('x-forwarded-for')
  if (doorgestuurd) {
    const eerste = doorgestuurd.split(',')[0]?.trim()
    if (eerste) return eerste
  }
  return headers.get('x-real-ip')?.trim() || 'onbekend'
}
