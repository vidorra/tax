'use client'

import { Mail, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, ChipGroup, Field, INVOER_KLASSE, Section, cn, veldIds } from '@/components/ui'
import { api } from '@/components/dossier/api'
import { formatMoment } from '@/components/dossier/koppelingen/indeling'

const invoerKlasse = cn(INVOER_KLASSE, 'border-gray-200 px-3.5 hover:border-gray-300')

type Rol = 'beheerder' | 'gebruiker'

interface Account {
  id: number
  email: string
  naam: string | null
  rol: Rol
  aangemaakt: string
  laatstIngelogd: string | null
}

interface Uitnodiging {
  id: number
  soort: 'uitnodiging' | 'herstel'
  email: string
  naam: string | null
  rol: Rol
  aangemaakt: string
  verloopt: string
  gemaild: boolean
  status: 'open' | 'verlopen' | 'gebruikt' | 'ingetrokken'
}

interface Overzicht {
  accounts: Account[]
  uitnodigingen: Uitnodiging[]
  jij: number
  mailer: boolean
}

type Verzonden = { gemaild: true } | { gemaild: false; link: string; melding: string }

const ROLLEN = [
  { value: 'gebruiker' as const, label: 'Gebruiker' },
  { value: 'beheerder' as const, label: 'Beheerder' },
]

const STATUS: Record<Uitnodiging['status'], string> = { open: 'Open', verlopen: 'Verlopen', gebruikt: 'Gebruikt', ingetrokken: 'Ingetrokken' }

/** Melding na versturen: gemaild, of de link om zelf door te sturen. */
function VerzondenMelding({ uitkomst, email, onSluit }: { uitkomst: Verzonden; email: string; onSluit: () => void }) {
  const [gekopieerd, setGekopieerd] = useState(false)
  if (uitkomst.gemaild) {
    return (
      <Alert variant="info" role="status" className="mt-4">
        De mail is verstuurd naar {email}.{' '}
        <button type="button" onClick={onSluit} className="font-medium underline underline-offset-2 hover:text-gray-900">
          Sluiten
        </button>
      </Alert>
    )
  }
  return (
    <Alert variant="let-op" role="status" className="mt-4" titel="Stuur de link zelf door">
      <p>{uitkomst.melding}</p>
      <code className="mt-2 block break-all rounded-lg bg-white/70 p-2 text-xs text-gray-900">{uitkomst.link}</code>
      <p className="mt-2 text-xs">De link werkt één keer. Stuur hem alleen naar {email}, bijvoorbeeld via een berichtenapp.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          grootte="sm"
          variant="secundair"
          onClick={() => {
            void navigator.clipboard.writeText(uitkomst.link).then(() => setGekopieerd(true))
          }}
        >
          {gekopieerd ? 'Gekopieerd' : 'Link kopiëren'}
        </Button>
        <Button type="button" grootte="sm" variant="kaal" onClick={onSluit}>
          Sluiten
        </Button>
      </div>
    </Alert>
  )
}

export function AccountsBeheer() {
  const [data, setData] = useState<Overzicht | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [naam, setNaam] = useState('')
  const [rol, setRol] = useState<Rol>('gebruiker')
  const [verzonden, setVerzonden] = useState<{ uitkomst: Verzonden; email: string } | null>(null)
  const [verwijder, setVerwijder] = useState<{ id: number; email: string; bevestiging: string } | null>(null)

  const laad = useCallback(async () => {
    const r = await api<Overzicht>('/api/beheer/accounts')
    if (!r.ok || !r.data) return setFout(r.fout)
    setData(r.data)
  }, [])

  useEffect(() => {
    void laad()
  }, [laad])

  async function actie(sleutel: string, pad: string, method: string, body?: unknown, naVerzenden?: string) {
    setBezig(sleutel)
    setFout(null)
    const r = await api<Verzonden & { ok?: boolean }>(pad, { method, body })
    setBezig(null)
    if (!r.ok) return setFout(r.fout)
    if (naVerzenden && r.data && 'gemaild' in r.data) setVerzonden({ uitkomst: r.data, email: naVerzenden })
    await laad()
  }

  async function nodigUit(e: FormEvent) {
    e.preventDefault()
    const adres = email.trim()
    await actie('uitnodigen', '/api/beheer/uitnodigingen', 'POST', { email: adres, naam, rol }, adres)
    setEmail('')
    setNaam('')
    setRol('gebruiker')
  }

  const ids = { email: veldIds('beheer-email'), naam: veldIds('beheer-naam'), bevestig: veldIds('beheer-bevestig') }

  if (!data) {
    return fout ? (
      <Alert variant="let-op" role="alert">
        {fout}
      </Alert>
    ) : (
      <p className="text-sm text-gray-600">Bezig met laden</p>
    )
  }

  const openUitnodigingen = data.uitnodigingen.filter((u) => u.status !== 'gebruikt')

  return (
    <div className="space-y-6">
      {fout && (
        <Alert variant="let-op" role="alert">
          {fout}
        </Alert>
      )}

      <Section icon={<UserPlus />} title="Account uitnodigen" subtitle="De uitnodiging is 7 dagen geldig en werkt één keer. Het nieuwe account ziet alleen zijn eigen dossier.">
        {!data.mailer && (
          <Alert variant="info" className="mb-4">
            Er is geen mailer ingesteld. Na het uitnodigen krijg je de link te zien om zelf door te sturen.
          </Alert>
        )}
        <form onSubmit={nodigUit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field ids={ids.email} label="E-mailadres">
              <input id={ids.email.invoer} type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} className={invoerKlasse} />
            </Field>
            <Field ids={ids.naam} label="Naam" hint="Optioneel, voor de aanhef in de mail.">
              <input id={ids.naam.invoer} type="text" autoComplete="off" maxLength={80} value={naam} aria-describedby={ids.naam.hint} onChange={(e) => setNaam(e.target.value)} className={invoerKlasse} />
            </Field>
          </div>
          <ChipGroup<Rol> label="Rol" kolommen={2} value={rol} onChange={setRol} options={ROLLEN} />
          <p className="text-xs text-gray-500">Een beheerder kan ook accounts uitnodigen, herstellen en verwijderen, en krijgt de back-ups.</p>
          <Button type="submit" disabled={bezig !== null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}>
            <Mail aria-hidden="true" className="h-4 w-4" />
            {bezig === 'uitnodigen' ? 'Bezig met versturen' : 'Uitnodiging versturen'}
          </Button>
        </form>
        {verzonden && <VerzondenMelding uitkomst={verzonden.uitkomst} email={verzonden.email} onSluit={() => setVerzonden(null)} />}
      </Section>

      <Section
        icon={<Users />}
        title="Accounts"
        subtitle="Telefoon kwijt of wachtwoord vergeten: stuur een herstellink. Die gaat alleen per mail naar het account zelf, en het oude wachtwoord werkt tot het nieuwe is ingesteld."
      >
        {!data.mailer && (
          <Alert variant="info" className="mb-4">
            Herstellinks kunnen alleen per mail. Stel een mailer in (RESEND_API_KEY of SMTP en MAIL_FROM) om ze te kunnen sturen.
          </Alert>
        )}
        <ul className="divide-y divide-gray-100">
          {data.accounts.map((a) => {
            const jij = a.id === data.jij
            return (
              <li key={a.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {a.naam ?? a.email}
                    {jij && <span className="ml-2 text-xs font-normal text-gray-500">(jij)</span>}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {a.naam ? `${a.email} · ` : ''}
                    {a.rol === 'beheerder' ? 'Beheerder' : 'Gebruiker'} · {a.laatstIngelogd ? `laatst ingelogd ${formatMoment(a.laatstIngelogd, true)}` : 'nog niet ingelogd'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    grootte="sm"
                    variant="secundair"
                    disabled={bezig !== null || !data.mailer}
                    onClick={() => void actie(`herstel-${a.id}`, `/api/beheer/accounts/${a.id}/herstel`, 'POST', undefined, a.email)}
                  >
                    {bezig === `herstel-${a.id}` ? 'Bezig' : 'Herstellink sturen'}
                  </Button>
                  <Button
                    type="button"
                    grootte="sm"
                    variant="kaal"
                    disabled={bezig !== null}
                    onClick={() => void actie(`rol-${a.id}`, `/api/beheer/accounts/${a.id}`, 'PATCH', { rol: a.rol === 'beheerder' ? 'gebruiker' : 'beheerder' })}
                  >
                    {a.rol === 'beheerder' ? 'Maak gebruiker' : 'Maak beheerder'}
                  </Button>
                  {!jij && (
                    <Button type="button" grootte="sm" variant="kaal" disabled={bezig !== null} className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => setVerwijder({ id: a.id, email: a.email, bevestiging: '' })}>
                      Verwijderen
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {verwijder && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
            <p className="text-sm font-medium text-gray-900">Account {verwijder.email} verwijderen</p>
            <p className="mt-1 text-sm text-gray-700">Het account en het hele dossier (alle jaren, koppelingen en gegevens) worden verwijderd. Dat kan niet ongedaan worden gemaakt, behalve met een back-up.</p>
            <Field ids={ids.bevestig} label="Typ het e-mailadres ter bevestiging" className="mt-3">
              <input id={ids.bevestig.invoer} type="text" autoComplete="off" value={verwijder.bevestiging} onChange={(e) => setVerwijder({ ...verwijder, bevestiging: e.target.value })} className={invoerKlasse} />
            </Field>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={bezig !== null || verwijder.bevestiging.trim().toLowerCase() !== verwijder.email}
                className="bg-red-700 hover:bg-red-800"
                onClick={() => {
                  const id = verwijder.id
                  setVerwijder(null)
                  void actie(`verwijder-${id}`, `/api/beheer/accounts/${id}`, 'DELETE')
                }}
              >
                Definitief verwijderen
              </Button>
              <Button type="button" variant="kaal" onClick={() => setVerwijder(null)}>
                Annuleren
              </Button>
            </div>
          </div>
        )}
      </Section>

      {openUitnodigingen.length > 0 && (
        <Section icon={<Mail />} title="Uitnodigingen en herstellinks" subtitle="Van de laatste 30 dagen. Opnieuw versturen maakt een nieuwe link; de oude werkt dan niet meer.">
          <ul className="divide-y divide-gray-100">
            {openUitnodigingen.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{u.naam ? `${u.naam} (${u.email})` : u.email}</p>
                  <p className="text-xs text-gray-500">
                    {u.soort === 'herstel' ? 'Herstellink' : 'Uitnodiging'} · {STATUS[u.status]}
                    {u.status === 'open' ? ` tot ${formatMoment(u.verloopt, true)}` : ''}
                    {u.status === 'open' && !u.gemaild ? ' · niet gemaild' : ''}
                  </p>
                </div>
                {(u.status === 'open' || u.status === 'verlopen') && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" grootte="sm" variant="secundair" disabled={bezig !== null} onClick={() => void actie(`opnieuw-${u.id}`, `/api/beheer/uitnodigingen/${u.id}`, 'POST', undefined, u.email)}>
                      {bezig === `opnieuw-${u.id}` ? 'Bezig' : 'Opnieuw versturen'}
                    </Button>
                    {u.status === 'open' && (
                      <Button type="button" grootte="sm" variant="kaal" disabled={bezig !== null} onClick={() => void actie(`intrekken-${u.id}`, `/api/beheer/uitnodigingen/${u.id}`, 'DELETE')}>
                        Intrekken
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
