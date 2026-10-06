import Link from 'next/link'
import { ArtikelLayout, artikelMetadata } from '@/components/kennisbank/ArtikelLayout'
import { BRONNEN } from '@/components/kennisbank/bronnen-lijst'
import { Tabel } from '@/components/kennisbank/Tabel'
import { StatusBadge } from '@/components/ui/StatusBadge'

const SLUG = 'zelfstandigenaftrek-en-mkb-vrijstelling'

export const metadata = artikelMetadata(SLUG)

export default function Pagina() {
  return (
    <ArtikelLayout
      slug={SLUG}
      intro={
        <p>
          De zelfstandigenaftrek en de MKB-winstvrijstelling verlagen de winst waarover je belasting betaalt. De zelfstandigenaftrek is in een paar jaar van € 3.750 naar € 900
          gegaan. En door de tariefmaatregel levert een aftrekpost in het toptarief minder op dan je zou denken.
        </p>
      }
      bronnen={[BRONNEN.minfin2026, BRONNEN.minfin2024, BRONNEN.belastingplan2027, BRONNEN.bdVoorlopigeAanslag, BRONNEN.bdArbeidsinkomen, BRONNEN.wetIb]}
    >
      <h2 id="zelfstandigenaftrek">Zelfstandigenaftrek</h2>
      <p>
        Haal je het <Link href="/kennisbank/urencriterium">urencriterium</Link>, dan mag je de zelfstandigenaftrek van je winst aftrekken. De aftrek is nooit hoger dan je
        winst, behalve voor starters. Wat je door een te lage winst niet kunt gebruiken, mag je negen jaar lang verrekenen met latere winst. Heb je op 1 januari de
        AOW-leeftijd bereikt, dan krijg je de helft.
      </p>
      <Tabel
        bijschrift="Zelfstandigenaftrek per jaar"
        kop={['Jaar', 'Bedrag', 'Status']}
        rijen={[
          ['2024', '€ 3.750', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['2025', '€ 2.470', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['2026', '€ 1.200', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['2027', '€ 900', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
        ]}
        noot="De afbouw naar € 900 in 2027 staat sinds het Belastingplan 2023 in de wet."
      />

      <h3 id="starters">Startersaftrek</h3>
      <p>
        Starters krijgen daarbovenop de startersaftrek van € 2.123, maximaal drie keer in de eerste vijf jaar. Volgens het Belastingplan 2027 daalt die naar € 10 in 2027 en
        verdwijnt hij in 2028 <StatusBadge status="voorstel" klein tooltip={false} />.
      </p>

      <h2 id="mkb">MKB-winstvrijstelling</h2>
      <p>
        Na de ondernemersaftrek is een deel van je winst vrijgesteld: de MKB-winstvrijstelling. Die was 13,31% in 2024 en is 12,70% in 2025, 2026 en 2027. De vrijstelling
        geldt ook bij verlies; dan wordt het verlies iets kleiner.
      </p>

      <h3 id="voorbeeld">Rekenvoorbeeld 2026</h3>
      <Tabel
        bijschrift="Van winst naar belastbare winst (2026)"
        kop={['', 'Bedrag']}
        rijen={[
          ['Winst uit onderneming', '€ 68.000'],
          ['Zelfstandigenaftrek', '− € 1.200'],
          ['Winst na ondernemersaftrek', '€ 66.800'],
          ['MKB-winstvrijstelling: 12,7% × € 66.800', '− € 8.484'],
          [<strong key="t">Belastbare winst</strong>, <strong key="b">€ 58.316</strong>],
        ]}
      />
      <p>
        Let op: voor de arbeidskorting en de combinatiekorting telt de winst vóór deze aftrekposten, in dit voorbeeld dus € 68.000.
      </p>

      <h2 id="tariefmaatregel">De tariefmaatregel</h2>
      <p>
        Boven de grens van de tweede schijf betaal je 49,5%. Toch mag je de ondernemersaftrek, de MKB-winstvrijstelling, de aftrek voor de eigen woning en de
        persoonsgebonden aftrek maar aftrekken tegen het tarief van de tweede schijf. In 2026 is dat 37,56%. Over het deel van die aftrekposten dat in de hoogste schijf valt,
        betaal je daarom 11,94% extra (49,5% − 37,56%).
      </p>
      <Tabel
        bijschrift="Tariefmaatregel per jaar"
        kop={['', '2024', '2025', '2026', '2027']}
        rijen={[
          ['Maximaal aftrektarief', '36,97%', '37,48%', '37,56%', <span key="a">38,16% <StatusBadge status="voorstel" klein tooltip={false} /></span>],
          ['Correctie in het toptarief', '12,53%', '12,02%', '11,94%', '11,34%'],
        ]}
      />
      <p>Lijfrentepremies, AOV-premies en reisaftrek vallen niet onder de tariefmaatregel. Die trek je af tegen je hoogste tarief.</p>

      <h2 id="marginaal">Wat kost een extra euro winst?</h2>
      <p>
        Een extra euro winst verhoogt ook je MKB-winstvrijstelling met 12,7 cent. Maar die vrijstelling levert in het toptarief maar 37,56% op. Netto betaal je over een extra
        euro winst daarom:
      </p>
      <p className="rounded-xl bg-white px-4 py-3 text-center font-medium tabular-nums text-gray-900 shadow-sm ring-1 ring-gray-200">
        49,5% − 12,7% × 37,56% ≈ 44,7%
      </p>
      <p>
        In 2024 was dat 44,6% en in 2027 wordt het ongeveer 44,65%. Zit je al boven het maximum voor de Zvw-bijdrage, dan komt daar niets bij. Je echte marginale druk hangt ook
        af van heffingskortingen en toeslagen die afbouwen met je inkomen. De calculator rekent die mee door het verschil uit te rekenen bij € 1.000 extra winst.
      </p>
      <p>
        Lees ook <Link href="/kennisbank/wat-verandert-er-in-2027">wat er in 2027 verandert</Link>.
      </p>
    </ArtikelLayout>
  )
}
