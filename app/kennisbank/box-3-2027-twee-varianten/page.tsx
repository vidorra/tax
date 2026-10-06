import Link from 'next/link'
import { ArtikelLayout, artikelMetadata } from '@/components/kennisbank/ArtikelLayout'
import { BRONNEN } from '@/components/kennisbank/bronnen-lijst'
import { Tabel } from '@/components/kennisbank/Tabel'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge } from '@/components/ui/StatusBadge'

const SLUG = 'box-3-2027-twee-varianten'

export const metadata = artikelMetadata(SLUG)

export default function Pagina() {
  return (
    <ArtikelLayout
      slug={SLUG}
      intro={
        <p>
          Voor box 3 in 2027 liggen twee voorstellen op tafel. Het Belastingplan 2027 indexeert de bedragen zoals gebruikelijk (de sleuteltabel). De brief van 29 september 2026
          halveert het heffingsvrij vermogen en verhoogt het forfait voor beleggingen. Voor wie spaargeld, beleggingen of crypto heeft, scheelt dat flink.
        </p>
      }
      statusNoot={
        <p>
          Beide varianten zijn voorstellen. De Tweede Kamer stemt op 12 november 2026, de Eerste Kamer op 15 december 2026. De calculator rekent beide varianten door, zodat je
          het verschil ziet.
        </p>
      }
      bronnen={[
        BRONNEN.belastingplan2027,
        BRONNEN.minfin2026,
        BRONNEN.bdBox3Berekening,
        BRONNEN.bdOwr,
        BRONNEN.bdCrypto,
        BRONNEN.dac8,
        BRONNEN.vermogensgrens36932,
        BRONNEN.wetIb,
      ]}
    >
      <h2 id="hoe-werkt-het">Hoe box 3 nu werkt</h2>
      <p>
        Van 2023 tot en met 2027 geldt een overbruggingsstelsel. De Belastingdienst gaat uit van een vast rendement per soort bezit, het forfait, en belast dat met 36%:
      </p>
      <ul>
        <li>banktegoeden tegen het bankforfait;</li>
        <li>beleggingen, crypto en andere bezittingen tegen het forfait voor overige bezittingen;</li>
        <li>schulden boven de schuldendrempel verlagen het rendement tegen het schuldforfait.</li>
      </ul>
      <p>
        Over het deel van je vermogen boven het heffingsvrij vermogen betaal je belasting. Fiscale partners tellen hun vermogen bij elkaar en hebben samen twee keer het
        heffingsvrij vermogen. Vermogen op naam van een minderjarig kind telt mee bij de ouders, zonder eigen heffingsvrij vermogen. Peildatum is 1 januari.
      </p>

      <h2 id="varianten">De twee varianten naast elkaar</h2>
      <Tabel
        bijschrift="Box 3: 2026 en de twee varianten voor 2027"
        kop={['', '2026', '2027 Belastingplan', '2027 brief 29-9']}
        rijen={[
          ['Heffingsvrij vermogen per persoon', '€ 59.357', '€ 60.098', '€ 30.846'],
          ['Forfait overige bezittingen', '6,00%', '6,37%', '7,87%'],
          ['Forfait banktegoeden', '1,28%', '1,27%', '1,27%'],
          ['Forfait schulden', '2,70%', '2,85%', '2,85%'],
          ['Schuldendrempel per persoon', '€ 3.800', 'circa € 3.800', 'circa € 3.800'],
          ['Vrijstelling groene beleggingen', '€ 26.715', '€ 200', '€ 200'],
          ['Tarief', '36%', '36%', '36%'],
        ]}
        noot="De forfaits voor bank en schulden zijn in beide jaren voorlopig. Het definitieve percentage volgt na afloop van het jaar. De vrijstelling voor groene beleggingen van € 200 in 2027 staat al in de wet."
      />

      <h3 id="voorbeeld">Wat betekent dat?</h3>
      <p>
        Een stel met samen € 126.000 vermogen heeft in 2026 een grondslag van circa € 7.300: het vermogen min twee keer € 59.357. Met de variant van de brief stijgt die
        grondslag in 2027 naar circa € 64.300. Over dat hele bedrag wordt dan een rendement berekend, met een hoger forfait voor beleggingen. In de variant van het
        Belastingplan stijgt het heffingsvrij vermogen iets en gaat alleen het forfait voor beleggingen licht omhoog, naar 6,37%.
      </p>
      <p>
        Een hoger box 3-inkomen verhoogt ook je verzamelinkomen. Dat telt mee voor de afbouw van de algemene heffingskorting en voor toeslagen zoals de
        kinderopvangtoeslag.
      </p>

      <h2 id="tegenbewijs">Tegenbewijs: werkelijk rendement opgeven</h2>
      <p>
        Was je werkelijke rendement lager dan het forfaitaire rendement? Dan mag je dat aantonen (Wet tegenbewijsregeling box 3, voor de jaren 2017 tot en met 2027). De
        Belastingdienst rekent dan met het laagste van de twee. Het werkelijke rendement bestaat uit:
      </p>
      <ul>
        <li>rente, dividend (bruto) en huur;</li>
        <li>waardeveranderingen van al je bezittingen, ook als je niets hebt verkocht;</li>
        <li>min de betaalde rente op schulden.</li>
      </ul>
      <p>
        Kosten mag je niet aftrekken, en het heffingsvrij vermogen, de schuldendrempel en verliesverrekening tussen jaren tellen niet mee. Voor vastgoed in eigen gebruik telt
        vanaf 2026 een voordeel van 5,06% van de WOZ-waarde.
      </p>
      <Tabel
        bijschrift="Hoe je tegenbewijs levert"
        kop={['Belastingjaar', 'Kanaal']}
        getallenVanaf={9}
        rijen={[
          ['Tot en met 2024', 'Formulier Opgaaf werkelijk rendement, binnen de termijn uit de brief van de Belastingdienst'],
          ['2025 en later', 'Rechtstreeks in de aangifte inkomstenbelasting'],
        ]}
      />

      <h2 id="peildatum">Let op rond de peildatum</h2>
      <p>
        Beleggingen omzetten in spaargeld vlak voor 1 januari, of juist een schuld aangaan, levert meestal niets op. Gebeurt dat binnen drie maanden rond de peildatum zonder
        zakelijke reden, dan negeert de Belastingdienst de omzetting.
      </p>
      <p>
        Crypto telt mee tegen de koers op 1 januari bij het platform dat je gebruikt. Vanaf 2026 geven cryptoplatforms saldi en transacties door aan de Belastingdienst (DAC8);
        de eerste aanlevering is uiterlijk 31 januari 2027.
      </p>

      <h2 id="toeslagen">Gevolg voor toeslagen</h2>
      <p>
        Voor het kindgebonden budget en de zorgtoeslag geldt een vermogensgrens per huishouden. In 2026 is die € 146.011 zonder en € 184.633 met toeslagpartner. Voor 2027 is
        voorgesteld om die te verlagen naar € 119.122 en € 158.748 <StatusBadge status="voorstel" klein tooltip={false} />. Voor de kinderopvangtoeslag geldt geen
        vermogensgrens.
      </p>

      <h2 id="2028">Vanaf 2028: een nieuw stelsel</h2>
      <p>
        Het wetsvoorstel Wet werkelijk rendement box 3 (36748) is op 12 februari 2026 door de Tweede Kamer aangenomen. De Eerste Kamer heeft nog niet gestemd, en op 29 september
        2026 is een novelle aangekondigd. Het plan voor 2028:
      </p>
      <ul>
        <li>aandelen, fondsen en vastgoed: belasting over de winst bij verkoop (vermogenswinst);</li>
        <li>crypto: belasting over de jaarlijkse waardestijging (vermogensaanwas), tot 2030;</li>
        <li>banktegoeden: belasting over het werkelijke rendement;</li>
        <li>een heffingsvrij resultaat van € 1.000 en een tarief van 36%.</li>
      </ul>
      <Alert variant="actie" titel="Bewaar je aankoopbedragen">
        Bij een vermogenswinstbelasting telt het verschil tussen verkoopprijs en aanschafwaarde. Houd daarom nu al bij wat je voor je beleggingen en crypto hebt betaald.
      </Alert>
      <p>
        Wil je zien wat de varianten voor jou betekenen? Gebruik de <Link href="/box-3">box 3-calculator</Link>, of lees{' '}
        <Link href="/kennisbank/wat-verandert-er-in-2027">wat er verder verandert in 2027</Link>.
      </p>
    </ArtikelLayout>
  )
}
