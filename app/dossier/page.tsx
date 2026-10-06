import { Container, PageHeader } from '@/components/ui'
import { DatabaseFout, NietGeconfigureerd } from '@/components/dossier/NietGeconfigureerd'
import { Overzicht } from '@/components/dossier/Overzicht'
import { lijstJaren } from '@/lib/dossier/opslag'
import { databaseMelding, paginaContext } from '@/lib/dossier/pagina'
import { BESCHIKBARE_JAREN, CONCEPT_JAREN, getJaar } from '@/lib/tax/years'
import { VOORBEELD_JAAR } from '@/lib/voorbeeld'
import { laadTerugvragen } from '@/lib/dossier/terugvragen-opslag'
import { actiefHerstelpunt } from '@/lib/dossier/import-opslag'
import { vandaagAmsterdam } from '@/lib/dossier/nieuw-jaar-keuze'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Overzicht' }

export default async function DossierOverzicht() {
  const ctx = await paginaContext()
  if (ctx.soort === 'niet-geconfigureerd') return <NietGeconfigureerd ontbreekt={ctx.ontbreekt} />
  if (ctx.soort === 'fout') return <DatabaseFout melding={ctx.melding} />
  let jaren
  try {
    jaren = await lijstJaren(ctx.householdId)
  } catch (e) {
    return <DatabaseFout melding={databaseMelding(e)} />
  }
  const beschikbaar = BESCHIKBARE_JAREN().map((jaar) => ({ jaar, status: getJaar(jaar).status, concept: CONCEPT_JAREN.includes(jaar) }))
  // Ronde 2 (A5): de open verzoeken om bronbelasting terug te vragen, over alle jaren. Mislukt dat, dan laadt het
  // overzicht gewoon zonder de kaart.
  let terugvragen = null
  try {
    terugvragen = await laadTerugvragen(ctx.householdId, new Date().toISOString().slice(0, 10))
  } catch {
    terugvragen = null
  }
  // De laatste JSON-import die nog ongedaan kan worden gemaakt (blijft na herladen staan tot de datum verstreken is).
  let herstelpunt = null
  try {
    herstelpunt = await actiefHerstelpunt(ctx.householdId)
  } catch {
    herstelpunt = null
  }
  return (
    <Container breedte="normaal">
      <PageHeader kicker="Dossier" titel="Je belastingjaren" intro="Per jaar de volledige invoer van je huishouden, de berekening, planning en de vergelijking met je accountant. Alles staat versleuteld opgeslagen." />
      <Overzicht jaren={jaren} beschikbaar={beschikbaar} voorbeeldJaar={VOORBEELD_JAAR} terugvragen={terugvragen} herstelpunt={herstelpunt} vandaag={vandaagAmsterdam()} />
    </Container>
  )
}
