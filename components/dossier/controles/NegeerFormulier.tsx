'use client'

/**
 * Ronde 2 (A3): negeren met een reden (fout) of afvinken als gezien met een optionele notitie (let op), inline onder
 * het item (ux-ronde2.md 4.3). Slaat direct op in de aangiftestaat (`{ direct: true }`) en wacht op het antwoord; lukt
 * dat niet, dan meldt de aanroeper "Niet opgeslagen. Opnieuw proberen" bij het item.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { Controle, GenegeerdeControle } from '@/lib/controles/types'
import { STAAT_GRENZEN } from '@/lib/dossier/aangiftestaat'
import { Button, Field, INVOER_KLASSE, cn, kondigAan, veldIds } from '@/components/ui'
import type { UseAangifteStaat } from '../useAangifteStaat'

export interface NegeerFormulierProps {
  controle: Controle
  staat: UseAangifteStaat
  onAnnuleer: () => void
  /** Vlak vóór het opslaan (het item verhuist dan naar Genegeerd): de aanroeper onthoudt waar de focus heen moet. */
  onVoorOpslaan?: () => void
  /** Na het versturen: true als het is opgeslagen. */
  onOpgeslagen: (ok: boolean) => void
}

/** De negering zoals hij in de aangiftestaat komt. */
export function maakNegering(c: Controle, reden: string, op: string): GenegeerdeControle {
  const r = reden.trim()
  return { id: c.id, ernst: c.ernst, titel: c.titel, vingerafdruk: c.vingerafdruk, op, ...(r ? { reden: r.slice(0, STAAT_GRENZEN.tekst) } : {}) }
}

export function NegeerFormulier({ controle: c, staat, onAnnuleer, onVoorOpslaan, onOpgeslagen }: NegeerFormulierProps) {
  const fout = c.ernst === 'fout'
  const [reden, setReden] = useState('')
  const [melding, setMelding] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const ids = veldIds(`negeer-${useId().replace(/:/g, '')}`)
  const veld = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    veld.current?.focus()
  }, [])

  async function verstuur() {
    if (fout && !reden.trim()) {
      setMelding('Vul een reden in. Die komt in het rapport.')
      veld.current?.focus()
      return
    }
    setBezig(true)
    onVoorOpslaan?.()
    staat.wijzig([{ soort: 'genegeerd', id: c.id, waarde: maakNegering(c, reden, new Date().toISOString()) }], { direct: true })
    const ok = await staat.flush()
    setBezig(false)
    if (ok) kondigAan(fout ? `${c.titel}: genegeerd. Opgeslagen.` : `${c.titel}: gezien. Opgeslagen.`)
    onOpgeslagen(ok)
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-white p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void verstuur()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onAnnuleer()
        }
      }}
    >
      <Field ids={ids} label={fout ? 'Waarom negeer je deze fout?' : 'Notitie (niet verplicht)'} hint="Komt in het rapport bij Bewust genegeerde controles." error={melding} verplicht={fout}>
        <textarea
          ref={veld}
          id={ids.invoer}
          rows={2}
          maxLength={STAAT_GRENZEN.tekst}
          value={reden}
          placeholder={fout ? 'Bijvoorbeeld: afronding in Moneybird, besproken met de adviseur' : undefined}
          aria-required={fout || undefined}
          aria-invalid={melding ? true : undefined}
          aria-describedby={melding ? `${ids.hint} ${ids.fout}` : ids.hint}
          onChange={(e) => {
            setReden(e.target.value)
            if (melding) setMelding(null)
          }}
          className={cn(INVOER_KLASSE, melding ? 'border-red-400' : 'border-gray-200 hover:border-gray-300', 'px-3.5')}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" grootte="sm" disabled={bezig} aria-busy={bezig}>
          {bezig ? 'Bezig met opslaan' : fout ? 'Negeren' : 'Gezien'}
        </Button>
        <Button variant="kaal" grootte="sm" onClick={onAnnuleer} disabled={bezig}>
          Annuleren
        </Button>
      </div>
    </form>
  )
}
