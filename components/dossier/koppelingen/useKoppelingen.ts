'use client'

import { useCallback, useEffect, useState } from 'react'
import type { MbKoppelingPubliek } from '@/lib/moneybird/types'
import { koppelingenApi } from '../api'

export interface KoppelingenStaat {
  koppelingen: MbKoppelingPubliek[]
  laden: boolean
  fout: string | null
  vernieuw: () => Promise<void>
}

/** Haalt de Moneybird-koppelingen op (zonder tokens, alleen de publieke velden). */
export function useKoppelingen(): KoppelingenStaat {
  const [koppelingen, setKoppelingen] = useState<MbKoppelingPubliek[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)

  const vernieuw = useCallback(async () => {
    setLaden(true)
    const r = await koppelingenApi.lijst()
    setLaden(false)
    if (!r.ok || !r.data) {
      setFout(r.fout ?? 'De koppelingen konden niet worden geladen.')
      return
    }
    setFout(null)
    setKoppelingen(r.data.koppelingen)
  }, [])

  useEffect(() => {
    void vernieuw()
  }, [vernieuw])

  return { koppelingen, laden, fout, vernieuw }
}
