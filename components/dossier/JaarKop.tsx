import type { ReactNode } from 'react'
import type { Status } from '@/lib/tax/types'
import type { JaarBadges, JaarTerug } from '@/lib/dossier/jaar-tabs'
import { PageHeader, StatusBadge } from '@/components/ui'
import { DossierStatusLabel } from './DossierStatusLabel'
import type { DossierStatus } from '@/lib/dossier/status'
import { JaarNav, type JaarTab } from './JaarNav'

export interface JaarKopProps {
  jaar: number
  titel: string
  /** Tekst onder de titel; mag meer dan één alinea zijn (de invulhulp zet er de status van de volgorde onder). */
  intro?: ReactNode
  tab: JaarTab
  status: DossierStatus
  paramsStatus: Status
  /** Ronde 2: badges voor de tabrij; elke jaarpagina geeft `p.badges` van laadJaarPagina door. */
  badges?: JaarBadges
  /** Ronde 2: knop terug na springen naar een veld (de jaarpagina leest `?terug=` met `leesTerug`). */
  terug?: JaarTerug
}

export function JaarKop({ jaar, titel, intro, tab, status, paramsStatus, badges, terug }: JaarKopProps) {
  return (
    <>
      <JaarNav jaar={jaar} actief={tab} badges={badges} terug={terug} />
      <PageHeader
        kicker={`Dossier ${jaar}`}
        titel={titel}
        intro={intro}
        badge={
          <>
            <DossierStatusLabel status={status} />
            {paramsStatus !== 'definitief' && <StatusBadge status={paramsStatus} klein tooltipKant="links" />}
          </>
        }
      />
    </>
  )
}
