/**
 * Ronde 2 (contract, na de toets): de wachtrij achter useAangifteStaat, zonder React zodat hij te testen is.
 *
 * - `voegToe` legt wijzigingen in de wachtrij en verstuurt na `vertraging` ms rust (of meteen met `direct`).
 * - `flush()` verstuurt alles wat wacht en wacht op het antwoord; JaarNav, Aanpassen en een statuswijziging in de
 *   editor roepen dit eerst aan (geen verloren vinkjes bij navigeren binnen Next, geen PUT met een nieuwe status vóór
 *   de PATCH van een net gezette negering).
 * - `bijWeggaan()` verstuurt direct met `keepalive` (unmount, pagehide, visibilitychange naar hidden).
 * - Fouten: een 4xx (behalve 408 en 429) betekent dat de server deze wijzigingen weigert. Dan valt dat pakket weg, staat
 *   er een melding en wordt de staat opnieuw geladen; latere wijzigingen gaan gewoon door. Netwerkfouten, 5xx, 408 en
 *   429 blijven in de wachtrij en worden opnieuw geprobeerd na 2, 5, 15, 30 en daarna elke 60 seconden, met een
 *   zichtbare status en een knop om meteen opnieuw te proberen.
 */
import { STAAT_GRENZEN, pasStaatToe, type AangifteStaat, type StaatWijziging } from '@/lib/dossier/aangiftestaat'

export type StaatOpslag = 'opgeslagen' | 'wacht' | 'bezig' | 'mislukt'

export interface VerstuurAntwoord {
  ok: boolean
  status: number
  data: { staat: AangifteStaat; bijgewerkt: string | null } | null
  fout: string | null
}

export interface WachtrijStand {
  opslag: StaatOpslag
  /** Melding in gewoon Nederlands; null als alles goed gaat. */
  fout: string | null
  /** Er is een pakket geweigerd (4xx): de UI laadt de staat opnieuw. */
  geweigerd: boolean
  /** Over hoeveel ms de volgende poging is; null als er geen poging gepland is. */
  volgendePoging: number | null
}

export interface WachtrijOpties {
  verstuur: (wijzigingen: StaatWijziging[], opties: { keepalive: boolean }) => Promise<VerstuurAntwoord>
  /** Nieuwe staat van de server (de wachtrij legt wat nog wacht er zelf overheen via `legOver`). */
  onStaat: (staat: AangifteStaat, bijgewerkt: string | null) => void
  onStand: (stand: WachtrijStand) => void
  /** Na een geweigerd pakket: de staat opnieuw laden. */
  herlaad: () => void
  vertraging?: number
  timers?: { zet: (fn: () => void, ms: number) => unknown; wis: (t: unknown) => void }
}

export const HERHAAL_NA_MS = [2000, 5000, 15000, 30000, 60000] as const

const opnieuwProberen = (status: number) => status === 0 || status >= 500 || status === 408 || status === 429

export class StaatWachtrij {
  private wachtrij: StaatWijziging[] = []
  private onderweg: Promise<void> | null = null
  private timer: unknown = null
  private pogingen = 0
  private stand: WachtrijStand = { opslag: 'opgeslagen', fout: null, geweigerd: false, volgendePoging: null }
  private readonly vertraging: number
  private readonly timers: NonNullable<WachtrijOpties['timers']>

  constructor(private readonly o: WachtrijOpties) {
    this.vertraging = o.vertraging ?? 800
    this.timers = o.timers ?? { zet: (fn, ms) => setTimeout(fn, ms), wis: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) }
  }

  /** Wat er nog wacht, voor `legOver`. */
  get wachtend(): readonly StaatWijziging[] {
    return this.wachtrij
  }

  get huidigeStand(): WachtrijStand {
    return this.stand
  }

  /** Legt de wijzigingen die nog wachten over een staat van de server. */
  legOver(basis: AangifteStaat): AangifteStaat {
    if (this.wachtrij.length === 0) return basis
    const r = pasStaatToe(basis, this.wachtrij)
    return 'fout' in r ? basis : r.staat
  }

  voegToe(wijzigingen: StaatWijziging[], opties: { direct?: boolean } = {}): void {
    if (wijzigingen.length === 0) return
    this.wachtrij.push(...wijzigingen)
    if (this.stand.opslag !== 'bezig') this.zetStand({ opslag: 'wacht', fout: this.stand.opslag === 'mislukt' ? this.stand.fout : null, geweigerd: false, volgendePoging: null })
    this.plan(opties.direct ? 0 : this.vertraging)
  }

  /** Verstuurt alles wat wacht en wacht tot het klaar is. true = alles opgeslagen. */
  async flush(opties: { keepalive?: boolean } = {}): Promise<boolean> {
    this.wisTimer()
    for (let i = 0; i < 20; i++) {
      if (this.onderweg) await this.onderweg
      if (this.wachtrij.length === 0) return this.stand.opslag !== 'mislukt'
      await this.stuur(opties.keepalive ?? false)
      if (this.stand.opslag === 'mislukt') return false
    }
    return this.wachtrij.length === 0
  }

  /** Bij weggaan (unmount, pagehide, verborgen tabblad): meteen versturen met keepalive, niet wachten. */
  bijWeggaan(): void {
    if (this.wachtrij.length === 0) return
    void this.flush({ keepalive: true })
  }

  /** Meteen opnieuw proberen (knop "Opnieuw proberen"). */
  opnieuw(): void {
    this.pogingen = 0
    this.plan(0)
  }

  stop(): void {
    this.wisTimer()
  }

  private plan(ms: number): void {
    this.wisTimer()
    this.timer = this.timers.zet(() => {
      this.timer = null
      void this.stuur(false)
    }, ms)
  }

  private wisTimer(): void {
    if (this.timer !== null) this.timers.wis(this.timer)
    this.timer = null
  }

  private zetStand(s: WachtrijStand): void {
    this.stand = s
    this.o.onStand(s)
  }

  private stuur(keepalive: boolean): Promise<void> {
    if (this.onderweg) return this.onderweg
    if (this.wachtrij.length === 0) return Promise.resolve()
    const pakket = this.wachtrij.slice(0, STAAT_GRENZEN.wijzigingen)
    this.wachtrij = this.wachtrij.slice(pakket.length)
    this.zetStand({ ...this.stand, opslag: 'bezig', volgendePoging: null })
    const klaar = (async () => {
      let r: VerstuurAntwoord
      try {
        r = await this.o.verstuur(pakket, { keepalive })
      } catch {
        r = { ok: false, status: 0, data: null, fout: null }
      }
      if (r.ok && r.data) {
        this.pogingen = 0
        this.o.onStaat(this.legOver(r.data.staat), r.data.bijgewerkt)
        if (this.wachtrij.length > 0) {
          this.zetStand({ opslag: 'wacht', fout: null, geweigerd: false, volgendePoging: null })
          this.plan(0)
        } else this.zetStand({ opslag: 'opgeslagen', fout: null, geweigerd: false, volgendePoging: null })
        return
      }
      if (!opnieuwProberen(r.status)) {
        // Geweigerd: dit pakket valt weg; de rest gaat door. De staat wordt opnieuw geladen.
        this.zetStand({
          opslag: this.wachtrij.length > 0 ? 'wacht' : 'opgeslagen',
          fout: `Een wijziging kon niet worden opgeslagen${r.fout ? `: ${r.fout.replace(/\.$/, '')}` : ''}. We hebben de opgeslagen stand opnieuw geladen.`,
          geweigerd: true,
          volgendePoging: null,
        })
        this.o.herlaad()
        if (this.wachtrij.length > 0) this.plan(0)
        return
      }
      // Tijdelijk mis: terug vooraan in de wachtrij en later opnieuw.
      this.wachtrij = [...pakket, ...this.wachtrij]
      const wacht = HERHAAL_NA_MS[Math.min(this.pogingen, HERHAAL_NA_MS.length - 1)]
      this.pogingen++
      this.zetStand({
        opslag: 'mislukt',
        fout: r.status === 0 ? 'Niet opgeslagen: geen verbinding. We proberen het zo opnieuw.' : 'Niet opgeslagen. We proberen het zo opnieuw.',
        geweigerd: false,
        volgendePoging: wacht,
      })
      this.plan(wacht)
    })()
    this.onderweg = klaar.finally(() => {
      this.onderweg = null
    })
    return this.onderweg
  }
}
