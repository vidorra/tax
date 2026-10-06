/**
 * Web Worker voor de publieke calculator: rekent de state door zonder de
 * hoofdthread (en dus het typen) te blokkeren. Logt niets.
 */
import { berekenAlles } from './berekening'
import type { CalculatorState } from './formulier'

export interface WorkerVraag {
  id: number
  state: CalculatorState
}

export type WorkerAntwoord = { id: number; ok: true; uitkomst: ReturnType<typeof berekenAlles> } | { id: number; ok: false; fout: string }

// Minimaal type voor de worker-scope (de webworker-lib botst met de DOM-lib in dit project).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerVraag>) => void) | null
  postMessage: (bericht: WorkerAntwoord) => void
}

ctx.onmessage = (e: MessageEvent<WorkerVraag>) => {
  const { id, state } = e.data
  let antwoord: WorkerAntwoord
  try {
    antwoord = { id, ok: true, uitkomst: berekenAlles(state) }
  } catch (err) {
    antwoord = { id, ok: false, fout: err instanceof Error ? err.message : 'Onbekende fout' }
  }
  ctx.postMessage(antwoord)
}
