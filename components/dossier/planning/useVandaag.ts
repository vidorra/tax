'use client'

/**
 * Ronde 2 (A2): de datum van vandaag in de browser, voor componenten die geen `vandaag` van de server krijgen (de
 * editor). Op de server en tijdens de hydratatie null, daarna de datum (ISO, lokale tijd): zo tonen server en browser
 * eerst hetzelfde en verschijnt een regel die van vandaag afhangt pas na het laden. De rekenmodules krijgen de datum
 * als argument (nooit Date.now() in een module).
 */
import { useSyncExternalStore } from 'react'

const geen = () => () => undefined

function lokaleDatum(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useVandaag(): string | null {
  return useSyncExternalStore(geen, lokaleDatum, () => null)
}
