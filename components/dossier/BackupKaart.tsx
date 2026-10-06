'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { DatabaseBackup } from 'lucide-react'
import type { BackupRun, BackupStatus, BackupStatusPubliek } from '@/lib/backup/types'
import { amsterdamDatum, INHAALDAGEN } from '@/lib/backup/planning'
import { formatGrootte, momentenNL, tijdstipNL } from '@/lib/backup/weergave'
import { Alert, Button, Section, cn, formatDatum } from '@/components/ui'
import { backupApi } from './api'

const STATUS: Record<BackupStatus, { label: string; klasse: string }> = {
  verstuurd: { label: 'Verstuurd', klasse: 'border-primary/30 bg-primary/5 text-primary-dark' },
  bezig: { label: 'Bezig', klasse: 'border-gray-200 bg-white text-gray-700' },
  mislukt: { label: 'Mislukt', klasse: 'border-amber-200 bg-amber-50 text-amber-900' },
  'te-groot': { label: 'Te groot', klasse: 'border-amber-200 bg-amber-50 text-amber-900' },
}

function RunLabel({ status }: { status: BackupStatus }) {
  const s = STATUS[status]
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium leading-none', s.klasse)}>{s.label}</span>
}

function RunRegel({ run }: { run: BackupRun }) {
  const details = [run.soort === 'handmatig' ? 'op verzoek' : 'gepland', run.bytes ? formatGrootte(run.bytes) : null].filter(Boolean).join(', ')
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <RunLabel status={run.status} />
        <span className="text-gray-900">{tijdstipNL(run.afgerondOp ?? run.gestartOp)}</span>
        <span className="text-gray-500">({details})</span>
      </div>
      {(run.status === 'mislukt' || run.status === 'te-groot') && run.fout && <p className="text-xs leading-relaxed text-gray-600">{run.fout}</p>}
    </div>
  )
}

function Rij({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-gray-600">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

type Uitkomst = { goed: boolean; tekst: string }

/** Kaart in het dossieroverzicht: wanneer de back-up gaat, hoe de laatste ging en een knop om er nu een te mailen. */
export function BackupKaart() {
  const [status, setStatus] = useState<BackupStatusPubliek | null>(null)
  const [laadFout, setLaadFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [uitkomst, setUitkomst] = useState<Uitkomst | null>(null)

  useEffect(() => {
    let actief = true
    void backupApi.status().then((r) => {
      if (!actief) return
      if (r.ok && r.data) setStatus(r.data)
      else setLaadFout(r.fout ?? 'De status van de back-up kon niet worden geladen.')
    })
    return () => {
      actief = false
    }
  }, [])

  async function mailNu() {
    setBezig(true)
    setUitkomst(null)
    const r = await backupApi.mailNu()
    setBezig(false)
    if (!r.ok || !r.data) {
      setUitkomst({ goed: false, tekst: r.fout ?? 'Er ging iets mis. Probeer het opnieuw.' })
      if (r.status === 503 || r.status === 409) {
        const s = await backupApi.status()
        if (s.ok && s.data) setStatus(s.data)
      }
      return
    }
    const { resultaat, backup } = r.data
    setStatus(backup)
    if (resultaat.status === 'verstuurd') {
      const bestand = resultaat.bestandsnaam ? ` Bestand ${resultaat.bestandsnaam}${resultaat.bytes ? `, ${formatGrootte(resultaat.bytes)}` : ''}.` : ''
      setUitkomst({ goed: true, tekst: `De back-up is gemaild naar ${backup.ontvanger ?? 'het ingestelde adres'}.${bestand}` })
    } else if (resultaat.status === 'te-groot') {
      setUitkomst({ goed: false, tekst: resultaat.reden ?? 'De back-up is te groot om te mailen.' })
    } else {
      setUitkomst({ goed: false, tekst: `De back-up is niet gelukt. ${resultaat.reden ?? ''}`.trim() })
    }
  }

  const openstaand = status ? status.volgende <= amsterdamDatum(new Date()) : false

  return (
    <Section id="backup" icon={<DatabaseBackup />} title="Back-up" subtitle="Een versleutelde kopie van alle gegevens, twee keer per jaar per mail.">
      <div className="space-y-4">
        {!status && !laadFout && (
          <p role="status" className="text-sm text-gray-500">
            Status van de back-up laden
          </p>
        )}
        {laadFout && (
          <Alert variant="let-op" role="alert">
            {laadFout}
          </Alert>
        )}

        {status && !status.geconfigureerd && (
          <Alert variant="actie" titel="De back-up is nog niet ingericht">
            <p>Zet of controleer deze variabelen op de server en start de app opnieuw:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {status.ontbreekt.map((naam) => (
                <li key={naam}>
                  <code className="rounded bg-white px-1 py-0.5 text-xs">{naam}</code>
                </li>
              ))}
            </ul>
            <p className="mt-2">Welke waarden je nodig hebt en hoe je de mailer instelt, staat in de README onder Back-up.</p>
          </Alert>
        )}

        {status?.geconfigureerd && (
          <>
            <p className="text-sm text-gray-700">
              Op {momentenNL(status.momenten)} mailt de server een versleutelde back-up van alle gegevens naar <span className="font-medium text-gray-900">{status.ontvanger}</span>.
            </p>
            <dl className="divide-y divide-gray-100 border-y border-gray-100 text-sm">
              <Rij term="Laatste back-up">{status.laatste ? <RunRegel run={status.laatste} /> : <span className="text-gray-700">Nog geen back-up gemaakt.</span>}</Rij>
              {status.laatsteGeslaagd && status.laatste?.status !== 'verstuurd' && (
                <Rij term="Laatst gelukt">
                  <span className="text-gray-900">{tijdstipNL(status.laatsteGeslaagd.afgerondOp ?? status.laatsteGeslaagd.gestartOp)}</span>
                </Rij>
              )}
              <Rij term="Volgende back-up">
                <span className="text-gray-900">{formatDatum(status.volgende)}</span>
                {openstaand && <span className="block text-xs leading-relaxed text-gray-600">Deze staat nog open. De server probeert hem automatisch te versturen tot {INHAALDAGEN} dagen na die datum.</span>}
              </Rij>
            </dl>
            <Button variant="secundair" onClick={mailNu} disabled={bezig} aria-busy={bezig}>
              <DatabaseBackup aria-hidden="true" className="h-4 w-4" />
              {bezig ? 'Back-up wordt gemaakt en gemaild' : 'Nu een back-up mailen'}
            </Button>
          </>
        )}

        {uitkomst && (
          <Alert variant={uitkomst.goed ? 'info' : 'let-op'} role="status">
            {uitkomst.tekst}
          </Alert>
        )}

        <p className="text-xs leading-relaxed text-gray-500">Om een back-up terug te zetten heb je DOSSIER_KEY nodig. Bewaar die sleutel apart, bijvoorbeeld in je wachtwoordmanager.</p>
      </div>
    </Section>
  )
}
