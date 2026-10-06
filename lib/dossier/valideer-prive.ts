/**
 * Ronde 2 (A2): vormcontrole van de privévelden (aanslag, voorlopige aanslag, eigen woning, box 2-verlies), aangeroepen
 * op de markeringen in valideer.ts. Alleen vorm, geen fiscale regels; meldingen als "pad: wat er mis is".
 */
type Obj = Record<string, unknown>
type Fout = (pad: string, melding: string) => void

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)
const isGetal = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isDatum = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T00:00:00Z`))
const isJaar = (x: unknown): x is number => isGetal(x) && Number.isInteger(x) && x >= 1990 && x <= 2100

function getal(o: Obj, veld: string, pad: string, fout: Fout, opties: { verplicht?: boolean; nietNegatief?: boolean; aandeel?: boolean } = {}): void {
  const v = o[veld]
  if (v === undefined || v === null) {
    if (opties.verplicht) fout(`${pad}.${veld}`, 'verplicht getal ontbreekt')
    return
  }
  if (!isGetal(v)) return fout(`${pad}.${veld}`, 'moet een getal zijn')
  if (opties.nietNegatief && v < 0) fout(`${pad}.${veld}`, 'mag niet negatief zijn')
  if (opties.aandeel && (v < 0 || v > 1)) fout(`${pad}.${veld}`, 'moet een aandeel tussen 0 en 1 zijn')
}

function datum(o: Obj, veld: string, pad: string, fout: Fout, verplicht = false): void {
  const v = o[veld]
  if (v === undefined || v === null || v === '') {
    if (verplicht) fout(`${pad}.${veld}`, 'datum ontbreekt')
    return
  }
  if (!isDatum(v)) fout(`${pad}.${veld}`, 'moet een datum zijn (JJJJ-MM-DD)')
}

function lijst(o: Obj, veld: string, pad: string, fout: Fout, elk: (x: Obj, p: string) => void): void {
  const v = o[veld]
  if (v === undefined) return
  if (!Array.isArray(v)) return fout(`${pad}.${veld}`, 'moet een lijst zijn')
  v.forEach((x, i) => (isObj(x) ? elk(x, `${pad}.${veld}[${i}]`) : fout(`${pad}.${veld}[${i}]`, 'moet een object zijn')))
}

function object(o: Obj, veld: string, pad: string, fout: Fout, elk: (x: Obj, p: string) => void): void {
  const v = o[veld]
  if (v === undefined) return
  if (!isObj(v)) return fout(`${pad}.${veld}`, 'moet een object zijn')
  elk(v, `${pad}.${veld}`)
}

/** Huishouden: `aangifteGedaan` (ja/nee). */
export function valideerPriveHuishouden(obj: Obj, fout: Fout): void {
  if (obj.aangifteGedaan !== undefined && typeof obj.aangifteGedaan !== 'boolean') fout('invoer.aangifteGedaan', 'moet ja of nee (true/false) zijn')
}

/** Persoon: voorlopigeAanslagDetails, box2Verliezen, box2InkomenVorigJaar, box2Belastingkorting. */
export function valideerPrivePersoon(p: Obj, pad: string, jaar: unknown, fout: Fout): void {
  object(p, 'voorlopigeAanslagDetails', pad, fout, (d, dp) => {
    for (const k of Object.keys(d)) if (k !== 'ib' && k !== 'zvw') fout(`${dp}.${k.slice(0, 40)}`, 'onbekend veld')
    for (const h of ['ib', 'zvw']) {
      object(d, h, dp, fout, (x, xp) => {
        datum(x, 'dagtekening', xp, fout)
        getal(x, 'betaald', xp, fout, { nietNegatief: true })
      })
    }
  })
  lijst(p, 'box2Verliezen', pad, fout, (v, vp) => {
    getal(v, 'jaar', vp, fout, { verplicht: true })
    getal(v, 'bedrag', vp, fout, { verplicht: true, nietNegatief: true })
    if (isGetal(v.jaar) && !Number.isInteger(v.jaar)) fout(`${vp}.jaar`, 'moet een heel jaartal zijn')
    else if (isGetal(v.jaar) && isGetal(jaar) && v.jaar >= jaar) fout(`${vp}.jaar`, `moet een eerder jaar zijn dan ${jaar}`)
  })
  getal(p, 'box2InkomenVorigJaar', pad, fout)
  object(p, 'box2Belastingkorting', pad, fout, (k, kp) => {
    if (k.verzoek !== undefined && typeof k.verzoek !== 'boolean') fout(`${kp}.verzoek`, 'moet ja of nee (true/false) zijn')
    lijst(k, 'lopend', kp, fout, (l, lp) => {
      if (!isJaar(l.verliesjaar)) fout(`${lp}.verliesjaar`, 'moet een jaartal zijn')
      if (!isJaar(l.eersteJaar)) fout(`${lp}.eersteJaar`, 'moet een jaartal zijn')
      else if (isJaar(l.verliesjaar) && l.eersteJaar < l.verliesjaar) fout(`${lp}.eersteJaar`, 'kan niet vóór het verliesjaar liggen')
      getal(l, 'restant', lp, fout, { verplicht: true, nietNegatief: true })
    })
  })
}

const REDENEN = ['bijleenregeling', 'aflossingseis']

/** Leningdeel: standBegin, standEind ≥ 0; eigenwoningschuld { begin ≥ 0, reden }. */
export function valideerLeningdeelPrive(l: Obj, lp: string, fout: Fout): void {
  getal(l, 'standBegin', lp, fout, { nietNegatief: true })
  getal(l, 'standEind', lp, fout, { nietNegatief: true })
  object(l, 'eigenwoningschuld', lp, fout, (e, ep) => {
    getal(e, 'begin', ep, fout, { verplicht: true, nietNegatief: true })
    if (typeof e.reden !== 'string' || !REDENEN.includes(e.reden)) fout(`${ep}.reden`, `onbekende waarde, kies uit ${REDENEN.join(', ')}`)
  })
}

/** Eigen woning: periodeHoofdverblijf, vorigeWoning, eigenwoningreserve, aankoop, verbeteringen. */
export function valideerWoningPrive(ew: Obj, fout: Fout): void {
  const pad = 'eigenWoning'
  object(ew, 'periodeHoofdverblijf', pad, fout, (x, xp) => {
    datum(x, 'van', xp, fout, true)
    datum(x, 'tot', xp, fout, true)
    if (isDatum(x.van) && isDatum(x.tot) && x.tot < x.van) fout(`${xp}.tot`, 'ligt vóór de begindatum')
  })
  object(ew, 'vorigeWoning', pad, fout, (x, xp) => {
    datum(x, 'leverdatum', xp, fout, true)
    for (const v of ['verkoopprijs', 'verkoopkosten', 'eigenwoningschuld']) getal(x, v, xp, fout, { verplicht: true, nietNegatief: true })
    getal(x, 'aandeelA', xp, fout, { verplicht: true, aandeel: true })
  })
  lijst(ew, 'eigenwoningreserve', pad, fout, (t, tp) => {
    if (t.eigenaar !== 'A' && t.eigenaar !== 'B') fout(`${tp}.eigenaar`, "moet 'A' of 'B' zijn")
    datum(t, 'datumToevoeging', tp, fout, true)
    getal(t, 'bedrag', tp, fout, { verplicht: true, nietNegatief: true })
  })
  object(ew, 'aankoop', pad, fout, (x, xp) => {
    datum(x, 'leverdatum', xp, fout, true)
    getal(x, 'koopsom', xp, fout, { verplicht: true, nietNegatief: true })
    getal(x, 'kostenKoper', xp, fout, { verplicht: true, nietNegatief: true })
    getal(x, 'aandeelA', xp, fout, { verplicht: true, aandeel: true })
  })
  lijst(ew, 'verbeteringen', pad, fout, (v, vp) => {
    datum(v, 'datum', vp, fout, true)
    getal(v, 'kosten', vp, fout, { verplicht: true, nietNegatief: true })
  })
}

/** Box 3-schuld: herkomst { bron 'eigenwoningschuld', jaar, sleutel }. */
export function valideerSchuldPrive(s: Obj, sp: string, fout: Fout): void {
  object(s, 'herkomst', sp, fout, (h, hp) => {
    for (const k of Object.keys(h)) if (!['bron', 'jaar', 'sleutel'].includes(k)) fout(`${hp}.${k.slice(0, 40)}`, 'onbekend veld')
    if (h.bron !== 'eigenwoningschuld') fout(`${hp}.bron`, "moet 'eigenwoningschuld' zijn")
    if (!isJaar(h.jaar)) fout(`${hp}.jaar`, 'moet een jaartal zijn')
    if (typeof h.sleutel !== 'string' || h.sleutel.length === 0 || h.sleutel.length > 200) fout(`${hp}.sleutel`, 'moet een korte tekst zijn')
  })
}
