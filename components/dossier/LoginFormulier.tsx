'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Card, Field, INVOER_KLASSE, cn, veldIds } from '@/components/ui'
import { api } from './api'

const invoerKlasse = cn(INVOER_KLASSE, 'border-gray-200 px-3.5 hover:border-gray-300')

export function LoginFormulier() {
  const router = useRouter()
  const [stap, setStap] = useState<'wachtwoord' | 'code'>('wachtwoord')
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [code, setCode] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function stuurWachtwoord(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    const r = await api<{ stap: string }>('/api/auth/login', { method: 'POST', body: { email, wachtwoord } })
    setBezig(false)
    if (!r.ok) return setFout(r.fout)
    setWachtwoord('')
    setStap('code')
  }

  async function stuurCode(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    const r = await api<{ ok: boolean }>('/api/auth/2fa', { method: 'POST', body: { code } })
    setBezig(false)
    if (!r.ok) {
      setCode('')
      if (r.status === 401 && /verlopen/.test(r.fout ?? '')) setStap('wachtwoord')
      return setFout(r.fout)
    }
    router.replace('/dossier/')
    router.refresh()
  }

  const emailIds = veldIds('login-email')
  const wwIds = veldIds('login-wachtwoord')
  const codeIds = veldIds('login-code')

  return (
    <Card>
      {fout && (
        <Alert variant="let-op" role="alert" className="mb-4">
          {fout}
        </Alert>
      )}
      {stap === 'wachtwoord' ? (
        <form onSubmit={stuurWachtwoord} className="space-y-4" noValidate>
          <Field ids={emailIds} label="E-mailadres">
            <input id={emailIds.invoer} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={invoerKlasse} />
          </Field>
          <Field ids={wwIds} label="Wachtwoord">
            <input id={wwIds.invoer} type="password" autoComplete="current-password" required value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} className={invoerKlasse} />
          </Field>
          <Button type="submit" disabled={bezig || !email || !wachtwoord} className="w-full">
            {bezig ? 'Bezig met controleren' : 'Verder'}
          </Button>
        </form>
      ) : (
        <form onSubmit={stuurCode} className="space-y-4" noValidate>
          <p className="text-sm text-gray-700">Vul de code van zes cijfers uit je authenticator-app in.</p>
          <Field ids={codeIds} label="Code uit je app" hint="De code verandert elke 30 seconden.">
            <input
              id={codeIds.invoer}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={7}
              autoFocus
              required
              value={code}
              aria-describedby={codeIds.hint}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
              className={cn(invoerKlasse, 'tracking-[0.3em] tabular-nums')}
            />
          </Field>
          <Button type="submit" disabled={bezig || code.replace(/\s/g, '').length !== 6} className="w-full">
            {bezig ? 'Bezig met controleren' : 'Inloggen'}
          </Button>
          <Button variant="kaal" grootte="sm" onClick={() => setStap('wachtwoord')} className="w-full">
            Terug naar e-mail en wachtwoord
          </Button>
        </form>
      )}
    </Card>
  )
}
