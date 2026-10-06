'use client'

/**
 * Live herberekening voor de publieke calculator.
 *
 *  - De state gaat via useDeferredValue, zodat typen altijd voorgaat.
 *  - Normaal rekent een Web Worker (een huishouden met partner en optimale verdeling
 *    kost tientallen milliseconden per jaar). Er is altijd maar één vraag onderweg;
 *    wijzigingen in de tussentijd worden samengevoegd tot de laatste stand.
 *  - Zonder worker (SSR, eerste render, oude browser of een fout in de worker) rekent
 *    useMemo op de uitgestelde state op de hoofdthread.
 *  - Fouten van de engine komen terug als tekst in de uitkomst, nooit als crash.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { berekenAlles, type Uitkomst } from '@/lib/calculator/berekening'
import type { CalculatorState } from '@/lib/calculator/formulier'
import type { WorkerAntwoord, WorkerVraag } from '@/lib/calculator/bereken.worker'

export interface BerekeningStatus {
  uitkomst: Uitkomst
  /** De getoonde uitkomst hoort nog niet bij de laatste invoer. */
  bezig: boolean
}

type WorkerStand = 'start' | 'actief' | 'uit'

export function useBerekening(state: CalculatorState): BerekeningStatus {
  const uitgesteld = useDeferredValue(state)
  const [workerStand, setWorkerStand] = useState<WorkerStand>('start')
  const [workerUitkomst, setWorkerUitkomst] = useState<{ voor: CalculatorState; uitkomst: Uitkomst } | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const volgnummer = useRef(0)
  const onderweg = useRef<{ id: number; state: CalculatorState } | null>(null)
  const wachtend = useRef<CalculatorState | null>(null)
  const laatstVerstuurd = useRef<CalculatorState | null>(null)
  const verstuurRef = useRef<((s: CalculatorState) => void) | null>(null)

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setWorkerStand('uit')
      return
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('../lib/calculator/bereken.worker.ts', import.meta.url))
    } catch {
      setWorkerStand('uit')
      return
    }
    workerRef.current = worker

    const verstuur = (s: CalculatorState) => {
      const vraag: WorkerVraag = { id: ++volgnummer.current, state: s }
      onderweg.current = { id: vraag.id, state: s }
      laatstVerstuurd.current = s
      worker.postMessage(vraag)
    }

    worker.onmessage = (e: MessageEvent<WorkerAntwoord>) => {
      const vraag = onderweg.current
      onderweg.current = null
      if (!vraag || e.data.id !== vraag.id) return
      if (e.data.ok) {
        setWorkerUitkomst({ voor: vraag.state, uitkomst: e.data.uitkomst })
        setWorkerStand('actief')
      } else {
        // Onverwachte fout in de worker: terug naar rekenen op de hoofdthread.
        setWorkerStand('uit')
        return
      }
      const volgende = wachtend.current
      wachtend.current = null
      if (volgende && volgende !== vraag.state) verstuur(volgende)
    }
    worker.onerror = (e) => {
      e.preventDefault()
      onderweg.current = null
      setWorkerStand('uit')
    }

    verstuurRef.current = verstuur

    return () => {
      worker.terminate()
      workerRef.current = null
      verstuurRef.current = null
      onderweg.current = null
      wachtend.current = null
      laatstVerstuurd.current = null
    }
  }, [])

  useEffect(() => {
    if (workerStand === 'uit') return
    const verstuur = verstuurRef.current
    if (!verstuur || uitgesteld === laatstVerstuurd.current) return
    if (onderweg.current) wachtend.current = uitgesteld
    else verstuur(uitgesteld)
  }, [uitgesteld, workerStand])

  useEffect(() => {
    if (workerStand === 'uit' && workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
      verstuurRef.current = null
    }
  }, [workerStand])

  // Hoofdthread: zolang de worker nog geen antwoord heeft gegeven of uit staat.
  const gebruikHoofdthread = workerStand !== 'actief' || workerUitkomst === null
  const lokaal = useMemo(() => (gebruikHoofdthread ? berekenAlles(uitgesteld) : null), [gebruikHoofdthread, uitgesteld])

  const uitkomst = lokaal ?? workerUitkomst!.uitkomst
  const bezig = lokaal ? uitgesteld !== state : workerUitkomst!.voor !== state
  return { uitkomst, bezig }
}
