'use client'

/**
 * Ronde 2 (A6): de bijzondere situaties van één onderneming (ontwerp 9.1, taak-A6 9.1). Per actieve situatie uit
 * ONDERNEMING_SITUATIES een SituatieBlok (onder elkaar), daaronder de kale knop "Bijzondere situatie toevoegen" met de
 * opties die nog niet actief zijn. Na een keuze krijgt het nieuwe blok de focus op zijn kop. Weghalen met bedragen
 * vraagt bevestiging (SituatieBlok); daarna een melding met Ongedaan maken, die de velden van de onderneming terugzet die
 * het weghalen veranderde.
 */
import { useEffect, useState } from 'react'
import type { OndernemingInvoer } from '@/lib/tax/types'
import { SituatieKiezer } from './SituatieKiezer'
import { OngedaanMelding, SituatieBlok } from './SituatieBlok'
import { ONDERNEMING_SITUATIES, type OndernemingSituatie, type OndernemingSituatieContext } from './onderneming-situaties'

type Velden = Record<string, unknown>

interface Ongedaan {
  id: string
  tekst: string
  /** Velden van de onderneming zoals ze vóór het weghalen waren (undefined = bestond niet). */
  terug: Velden
}

const kopie = <T,>(x: T): T => (x === undefined ? x : (JSON.parse(JSON.stringify(x)) as T))

/** Anker van een situatieblok, voor springen en zoeken (contract `ONDERNEMING_SITUATIES`). */
export const situatieAnker = (situatie: string, persoon: string, ondernemingId: string) => `situatie-${situatie}-${persoon}-${ondernemingId}`

export function OndernemingSituatieLijst({ ctx }: { ctx: OndernemingSituatieContext }) {
  const [nieuw, setNieuw] = useState<string | null>(null)
  const [ongedaan, setOngedaan] = useState<Ongedaan | null>(null)
  const kiezerId = `situaties-${ctx.persoon.id}-${ctx.ondernemingId}`

  // `focusBijTonen` werkt alleen bij het verschijnen van een blok; daarna weer leeg, zodat een blok dat later langs een
  // andere weg terugkomt (bijvoorbeeld de schakelaar bij een verkocht middel) de focus niet wegneemt.
  useEffect(() => {
    if (!nieuw) return
    const t = setTimeout(() => setNieuw(null), 0)
    return () => clearTimeout(t)
  }, [nieuw])

  useEffect(() => {
    if (!ongedaan) return
    document.getElementById(kiezerId)?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [ongedaan, kiezerId])

  const beschikbaar = ONDERNEMING_SITUATIES.filter((s) => s.beschikbaar?.(ctx) ?? true)
  // De staking staat als laatste blok onderaan (ontwerp 9.2); de rest in de volgorde van het register.
  const actief = ONDERNEMING_SITUATIES.filter((s) => s.actief(ctx)).sort((a, b) => Number(a.id === 'staking') - Number(b.id === 'staking'))
  const opties = beschikbaar.filter((s) => !s.actief(ctx)).map((s) => s.optie)

  function kies(id: string) {
    const s = ONDERNEMING_SITUATIES.find((x) => x.id === id)
    if (!s) return
    setOngedaan(null)
    setNieuw(id)
    s.voegToe(ctx)
  }

  function haalWeg(s: OndernemingSituatie) {
    // Wat het weghalen aan deze onderneming verandert, op een kopie, zodat Ongedaan maken alleen die velden terugzet.
    const voor = kopie(ctx.onderneming) as unknown as Velden
    const na = kopie(ctx.onderneming)
    s.haalWeg({ ...ctx, onderneming: na, pas: (fn) => fn(na) })
    const naV = na as unknown as Velden
    const sleutels = [...new Set([...Object.keys(voor), ...Object.keys(naV)])].filter((k) => JSON.stringify(voor[k]) !== JSON.stringify(naV[k]))
    ctx.pas((x) => {
      const xv = x as unknown as Velden
      for (const k of sleutels) {
        if (naV[k] === undefined) delete xv[k]
        else xv[k] = kopie(naV[k])
      }
    })
    setNieuw(null)
    setOngedaan({ id: s.id, tekst: `${s.optie.label} is weggehaald.`, terug: Object.fromEntries(sleutels.map((k) => [k, kopie(voor[k])])) })
  }

  function zetTerug() {
    if (!ongedaan) return
    const { terug, id } = ongedaan
    ctx.pas((x: OndernemingInvoer) => {
      const xv = x as unknown as Velden
      for (const [k, v] of Object.entries(terug)) {
        if (v === undefined) delete xv[k]
        else xv[k] = kopie(v)
      }
    })
    setOngedaan(null)
    setNieuw(id)
  }

  return (
    <div className="space-y-4">
      {actief.map((s) => (
        <SituatieBlok
          key={s.id}
          id={situatieAnker(s.id, ctx.persoon.id, ctx.ondernemingId)}
          titel={s.titel(ctx)}
          situatie={s.naam ?? s.optie.label.toLowerCase()}
          heeftBedragen={s.heeftBedragen(ctx)}
          onWeghalen={() => haalWeg(s)}
          focusBijTonen={nieuw === s.id}
        >
          {s.blok(ctx)}
        </SituatieBlok>
      ))}
      {ongedaan && <OngedaanMelding tekst={ongedaan.tekst} onOngedaan={zetTerug} onSluit={() => setOngedaan(null)} />}
      {/* De lijst van de kiezer heeft `hidden` én de klasse `grid`; die klasse wint van [hidden] uit de basisstijl, zodat de
          lijst altijd open stond (fout in het contract, gemeld). Deze klasse op de wrapper verbergt hem weer als hij dicht is. */}
      <SituatieKiezer id={kiezerId} opties={opties} onKies={kies} />
    </div>
  )
}
