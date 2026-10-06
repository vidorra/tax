import { describe, expect, it } from 'vitest'
import { LEGE_STAAT, pasStaatToe, type AangifteStaat, type StaatWijziging } from '@/lib/dossier/aangiftestaat'
import { HERHAAL_NA_MS, StaatWachtrij, type VerstuurAntwoord, type WachtrijStand } from '../aangiftestaat-wachtrij'

const OP = '2026-10-05T10:00:00.000Z'
const vink = (sleutel: string): StaatWijziging => ({ soort: 'veld', persoon: 'A', sleutel, waarde: { afgevinkt: { vingerafdruk: '1', op: OP } } })

/** Handmatige klok: timers lopen pas als de test `tik` aanroept. */
function klok() {
  let id = 0
  const timers = new Map<number, { fn: () => void; ms: number }>()
  return {
    timers: {
      zet: (fn: () => void, ms: number) => {
        timers.set(++id, { fn, ms })
        return id
      },
      wis: (t: unknown) => void timers.delete(t as number),
    },
    gepland: () => [...timers.values()].map((t) => t.ms),
    async tik() {
      const nu = [...timers.entries()]
      timers.clear()
      for (const [, t] of nu) t.fn()
      await new Promise((r) => setTimeout(r, 0))
    },
  }
}

function server(antwoorden: Array<Partial<VerstuurAntwoord> | 'netwerk'>) {
  let staat: AangifteStaat = LEGE_STAAT
  const verzonden: Array<{ wijzigingen: StaatWijziging[]; keepalive: boolean }> = []
  const verstuur = async (wijzigingen: StaatWijziging[], o: { keepalive: boolean }): Promise<VerstuurAntwoord> => {
    verzonden.push({ wijzigingen, keepalive: o.keepalive })
    const a = antwoorden.shift() ?? {}
    if (a === 'netwerk') return { ok: false, status: 0, data: null, fout: 'Geen verbinding' }
    if (a.ok === false) return { ok: false, status: a.status ?? 500, data: null, fout: a.fout ?? null }
    const r = pasStaatToe(staat, wijzigingen)
    if ('fout' in r) return { ok: false, status: 422, data: null, fout: r.fout }
    staat = r.staat
    return { ok: true, status: 200, data: { staat, bijgewerkt: OP }, fout: null }
  }
  return { verstuur, verzonden, staat: () => staat }
}

function maak(antwoorden: Array<Partial<VerstuurAntwoord> | 'netwerk'> = []) {
  const k = klok()
  const s = server(antwoorden)
  const standen: WachtrijStand[] = []
  let laatste: AangifteStaat | null = null
  let herladen = 0
  const w = new StaatWachtrij({
    verstuur: s.verstuur,
    onStaat: (st) => (laatste = st),
    onStand: (st) => standen.push(st),
    herlaad: () => herladen++,
    timers: k.timers,
  })
  return { w, k, s, standen, laatste: () => laatste, herladen: () => herladen }
}

describe('StaatWachtrij', () => {
  it('verstuurt na rust en bundelt wijzigingen', async () => {
    const t = maak()
    t.w.voegToe([vink('a')])
    t.w.voegToe([vink('b')])
    expect(t.k.gepland()).toEqual([800])
    await t.k.tik()
    expect(t.s.verzonden).toHaveLength(1)
    expect(t.s.verzonden[0].wijzigingen).toHaveLength(2)
    expect(t.w.huidigeStand.opslag).toBe('opgeslagen')
    expect(Object.keys(t.laatste()?.invulhulp?.velden.A ?? {})).toEqual(['a', 'b'])
  })

  it('flush verstuurt meteen, zonder op de timer te wachten', async () => {
    const t = maak()
    t.w.voegToe([vink('a')])
    expect(await t.w.flush()).toBe(true)
    expect(t.s.verzonden).toHaveLength(1)
    expect(t.k.gepland()).toEqual([])
  })

  it('bijWeggaan verstuurt direct met keepalive (navigeren binnen Next, pagehide)', async () => {
    const t = maak()
    t.w.voegToe([vink('a')])
    t.w.bijWeggaan()
    await new Promise((r) => setTimeout(r, 0))
    expect(t.s.verzonden).toEqual([{ wijzigingen: [vink('a')], keepalive: true }])
  })

  it('een geweigerd pakket (422) valt weg, de staat wordt herladen en latere wijzigingen gaan door', async () => {
    const t = maak([{ ok: false, status: 422, fout: 'te veel velden in de invulhulp' }])
    t.w.voegToe([vink('a')])
    await t.k.tik()
    expect(t.herladen()).toBe(1)
    expect(t.w.huidigeStand.geweigerd).toBe(true)
    expect(t.w.huidigeStand.fout).toContain('te veel velden in de invulhulp')
    expect(t.w.wachtend).toHaveLength(0)
    t.w.voegToe([vink('b')])
    await t.k.tik()
    expect(t.s.verzonden).toHaveLength(2)
    expect(t.s.staat().invulhulp?.velden.A?.b).toBeDefined()
    expect(t.w.huidigeStand.opslag).toBe('opgeslagen')
  })

  it('een netwerkfout of 5xx blijft in de wachtrij en wordt opnieuw geprobeerd met oplopende wachttijd', async () => {
    const t = maak(['netwerk', { ok: false, status: 503 }])
    t.w.voegToe([vink('a')], { direct: true })
    await t.k.tik()
    expect(t.w.huidigeStand.opslag).toBe('mislukt')
    expect(t.w.huidigeStand.volgendePoging).toBe(HERHAAL_NA_MS[0])
    expect(t.w.wachtend).toHaveLength(1)
    expect(t.k.gepland()).toEqual([HERHAAL_NA_MS[0]])
    await t.k.tik()
    expect(t.k.gepland()).toEqual([HERHAAL_NA_MS[1]])
    await t.k.tik()
    expect(t.w.huidigeStand.opslag).toBe('opgeslagen')
    expect(t.s.verzonden).toHaveLength(3)
    expect(t.herladen()).toBe(0)
  })

  it('legt wat nog wacht over een staat van de server', () => {
    const t = maak()
    t.w.voegToe([vink('x')])
    const over = t.w.legOver(LEGE_STAAT)
    expect(over.invulhulp?.velden.A?.x).toBeDefined()
  })
})
