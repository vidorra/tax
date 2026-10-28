'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Card, Field, INVOER_KLASSE, cn, veldIds } from '@/components/ui'
import { api } from '@/components/dossier/api'

const invoerKlasse = cn(INVOER_KLASSE, 'border-gray-200 px-3.5 hover:border-gray-300')
const MIN = 12

interface Uitnodiging {
  email: string
  naam: string | null
  soort: 'uitnodiging' | 'herstel'
}

/**
 * Account instellen via een uitnodiging of herstellink. Het token staat achter de # in de link: het komt zo niet in
 * serverlogs of de Referer. De pagina haalt het eruit en zet de adresbalk terug op de kale URL.
 */
export function InstellenFormulier() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [uitnodiging, setUitnodiging] = useState<Uitnodiging | null>(null)
  const [laden, setLaden] = useState(true)
  const [wachtwoord, setWachtwoord] = useState('')
  const [herhaal, setHerhaal] = useState('')
  const [qr, setQr] = useState<{ qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    const t = window.location.hash.replace(/^#/, '')
    if (t) window.history.replaceState(null, '', window.location.pathname)
    if (!t) {
      setLaden(false)
      setFout('Deze pagina werkt alleen met de link uit je uitnodiging. Open de link uit de mail opnieuw.')
      return
    }
    setToken(t)
    void api<Uitnodiging>('/api/account/instellen/controleer', { method: 'POST', body: { token: t } }).then((r) => {
      setLaden(false)
      if (!r.ok || !r.data) return setFout(r.fout)
      setUitnodiging(r.data)
    })
  }, [])

  const wachtwoordFout = wachtwoord.length > 0 && wachtwoord.length < MIN ? `Minimaal ${MIN} tekens.` : null
  const herhaalFout = herhaal.length > 0 && herhaal !== wachtwoord ? 'De wachtwoorden zijn niet gelijk.' : null

  async function kiesWachtwoord(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    const r = await api<{ qr: string; secret: string }>('/api/account/instellen', { method: 'POST', body: { token, wachtwoord } })
    setBezig(false)
    if (!r.ok || !r.data) return setFout(r.fout)
    setWachtwoord('')
    setHerhaal('')
    setQr(r.data)
  }

  async function bevestig(e: FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    const r = await api<{ ok: boolean }>('/api/account/instellen/bevestig', { method: 'POST', body: { code } })
    setBezig(false)
    if (!r.ok) {
      setCode('')
      return setFout(r.fout)
    }
    router.replace('/dossier/')
    router.refresh()
  }

  const ids = { ww: veldIds('instellen-wachtwoord'), herhaal: veldIds('instellen-herhaal'), code: veldIds('instellen-code') }

  if (laden) return <p className="text-sm text-gray-600">Bezig met controleren van je link</p>

  return (
    <Card>
      {fout && (
        <Alert variant="let-op" role="alert" className="mb-4">
          {fout}
        </Alert>
      )}
      {uitnodiging && !qr && (
        <form onSubmit={kiesWachtwoord} className="space-y-4" noValidate>
          <div>
            <h2 className="text-base font-medium text-gray-900">Stap 1: kies een wachtwoord</h2>
            <p className="mt-1 text-sm text-gray-600">
              {uitnodiging.soort === 'herstel'
                ? 'Je kiest een nieuw wachtwoord en koppelt daarna opnieuw een authenticator-app. Tot je dat hebt afgerond, werkt je oude wachtwoord nog.'
                : `Je account wordt aangemaakt voor ${uitnodiging.email}. Dat is ook het adres waarmee je inlogt.`}
            </p>
          </div>
          <input type="email" autoComplete="username" value={uitnodiging.email} readOnly hidden />
          <Field ids={ids.ww} label="Wachtwoord" hint={`Minimaal ${MIN} tekens. Een zin van een paar woorden werkt goed.`} error={wachtwoordFout}>
            <input
              id={ids.ww.invoer}
              type="password"
              autoComplete="new-password"
              required
              value={wachtwoord}
              aria-describedby={wachtwoordFout ? `${ids.ww.hint} ${ids.ww.fout}` : ids.ww.hint}
              aria-invalid={wachtwoordFout ? true : undefined}
              onChange={(e) => setWachtwoord(e.target.value)}
              className={invoerKlasse}
            />
          </Field>
          <Field ids={ids.herhaal} label="Herhaal wachtwoord" error={herhaalFout}>
            <input
              id={ids.herhaal.invoer}
              type="password"
              autoComplete="new-password"
              required
              value={herhaal}
              aria-describedby={herhaalFout ? ids.herhaal.fout : undefined}
              aria-invalid={herhaalFout ? true : undefined}
              onChange={(e) => setHerhaal(e.target.value)}
              className={invoerKlasse}
            />
          </Field>
          <Button type="submit" disabled={bezig || wachtwoord.length < MIN || herhaal !== wachtwoord} className="w-full">
            {bezig ? 'Bezig' : 'Verder'}
          </Button>
        </form>
      )}
      {qr && (
        <form onSubmit={bevestig} className="space-y-4" noValidate>
          <div>
            <h2 className="text-base font-medium text-gray-900">Stap 2: tweestapsverificatie</h2>
            <p className="mt-1 text-sm text-gray-600">
              Scan de code met een authenticator-app (bijvoorbeeld Google Authenticator, Microsoft Authenticator of 1Password). Lukt scannen niet, typ dan de sleutel over.
            </p>
          </div>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.qr} alt="QR-code voor je authenticator-app" width={220} height={220} className="rounded-xl border border-gray-200" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700">Sleutel om over te typen</p>
            <code className="mt-1 block break-all rounded-lg bg-gray-50 p-2 text-sm tracking-wider text-gray-900">{qr.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          </div>
          <Field ids={ids.code} label="Code uit je app">
            <input
              id={ids.code.invoer}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
              className={cn(invoerKlasse, 'tracking-[0.3em] tabular-nums')}
            />
          </Field>
          <Button type="submit" disabled={bezig || code.replace(/\s/g, '').length !== 6} className="w-full">
            {bezig ? 'Bezig met controleren' : 'Bevestigen en naar je dossier'}
          </Button>
        </form>
      )}
    </Card>
  )
}
