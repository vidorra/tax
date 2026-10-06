import Link from 'next/link'
import { ArtikelLayout, artikelMetadata } from '@/components/kennisbank/ArtikelLayout'
import { BRONNEN } from '@/components/kennisbank/bronnen-lijst'
import { Tabel } from '@/components/kennisbank/Tabel'
import { StatusBadge } from '@/components/ui/StatusBadge'

const SLUG = 'wat-verandert-er-in-2027'

export const metadata = artikelMetadata(SLUG)

export default function Pagina() {
  return (
    <ArtikelLayout
      slug={SLUG}
      intro={
        <p>
          Op Prinsjesdag 2026 is het Belastingplan 2027 ingediend. Op 29 september 2026 volgde een brief met extra maatregelen voor box 1, 2 en 3. Een deel van de wijzigingen voor
          zzp&apos;ers staat al jaren in de wet, een ander deel is nog een voorstel. Hieronder per onderwerp wat er verandert en hoe zeker dat is.
        </p>
      }
      statusNoot={
        <p>
          De Tweede Kamer stemt op 12 november 2026 over het Belastingplan, de Eerste Kamer op 15 december 2026. Voor de brief van 29 september 2026 is begin oktober nog geen
          zekere meerderheid. Bedragen met het label voorstel of geschat kunnen dus nog veranderen.
        </p>
      }
      bronnen={[BRONNEN.belastingplan2027, BRONNEN.minfin2026, BRONNEN.amendementIack, BRONNEN.kgb36923, BRONNEN.vermogensgrens36932, BRONNEN.rechtsvermoeden, BRONNEN.zelfstandigenwet]}
    >
      <h2 id="vast">Wat al vaststaat</h2>
      <p>Deze wijzigingen voor 2027 zijn al wet. Ze gaan dus door, wat er in november en december ook gebeurt:</p>
      <ul>
        <li>
          De <strong>zelfstandigenaftrek</strong> daalt van € 1.200 naar € 900. Dat besluit stamt uit het Belastingplan 2023.
        </li>
        <li>
          De <strong>MKB-winstvrijstelling</strong> blijft 12,70%.
        </li>
        <li>
          Het <strong>toptarief</strong> in box 1 blijft 49,50%.
        </li>
        <li>
          De <strong>Hillen-aftrek</strong>, voor wie weinig of geen hypotheekrente betaalt, daalt naar 67,067%.
        </li>
        <li>
          De <strong>combinatiekorting (IACK)</strong> gaat wettelijk omlaag: het maximum daalt in 2027 met € 134 (prijspeil 2023).
        </li>
        <li>
          Bij <strong>arbeidsrelaties</strong> geldt vanaf 31 december 2026 een rechtsvermoeden van een arbeidsovereenkomst bij een uurtarief van € 38 of minder.
        </li>
      </ul>

      <h2 id="box-1">Box 1: tarieven en schijven</h2>
      <p>
        De eerste twee tarieven gaan omhoog en de grens van de tweede schijf wordt bevroren op € 78.426. De brief van 29 september 2026 verhoogt die grens juist naar € 80.578.
        Het Belastingplan indexeert de bedragen in de inkomstenbelasting maar voor 48% van de inflatiecorrectie.
      </p>
      <Tabel
        bijschrift="Box 1 in 2026 en 2027"
        kop={['', '2026', '2027', 'Status 2027']}
        rijen={[
          ['Grens schijf 1', '€ 38.883', '€ 39.247', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Tarief schijf 1 (inclusief premies)', '35,75%', '36,23%', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Tarief schijf 2', '37,56%', '38,16%', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Begin toptarief', '€ 78.426', '€ 78.426 (brief: € 80.578)', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Toptarief', '49,50%', '49,50%', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['Maximaal aftrektarief (tariefmaatregel)', '37,56%', '38,16%', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
        ]}
        getallenVanaf={1}
      />
      <p>
        Door het hogere aftrektarief kost extra winst in de toptariefzone in 2027 ongeveer 44,65%, tegen 44,7% in 2026. Hoe dat werkt, lees je in{' '}
        <Link href="/kennisbank/zelfstandigenaftrek-en-mkb-vrijstelling">zelfstandigenaftrek en MKB-winstvrijstelling</Link>.
      </p>

      <h2 id="kortingen">Heffingskortingen</h2>
      <Tabel
        bijschrift="Heffingskortingen in 2026 en 2027"
        kop={['', '2026', '2027', 'Status 2027']}
        rijen={[
          ['Algemene heffingskorting, maximum', '€ 3.115', '€ 3.154', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Algemene heffingskorting, afbouw vanaf', '€ 29.736', '€ 30.910', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Afbouwpercentage', '6,398%', '6,638% (brief: circa 6,35%)', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Arbeidskorting, maximum', '€ 5.685', '€ 5.929 (brief: circa € 5.889)', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Arbeidskorting nul bij', '€ 132.920', '€ 138.909', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Combinatiekorting, maximum', '€ 3.032', '€ 2.918', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
        ]}
      />
      <p>
        De brief van 29 september 2026 beperkt de extra verhoging van de arbeidskorting tot € 133, in plaats van € 173 in het Belastingplan. Meer over de combinatiekorting en
        de afbouw tot 2035 staat in het artikel over de <Link href="/kennisbank/combinatiekorting-iack">IACK</Link>.
      </p>

      <h2 id="ondernemer">Ondernemersregelingen</h2>
      <Tabel
        bijschrift="Ondernemersregelingen in 2026 en 2027"
        kop={['', '2026', '2027', 'Status 2027']}
        rijen={[
          ['Zelfstandigenaftrek', '€ 1.200', '€ 900', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['Startersaftrek', '€ 2.123', '€ 10 (2028: nul)', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['MKB-winstvrijstelling', '12,70%', '12,70%', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
          ['Stakingsaftrek', '€ 3.630', '€ 908 (nul per 2030)', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Meewerkaftrek', '1,25% tot 4%', '0,32% tot 1% (nul per 2030)', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['KIA, 28% tot', '€ 71.683', 'circa € 72.578', <StatusBadge key="s" status="geschat" klein tooltip={false} />],
          ['KIA, maximum', '€ 20.072', 'circa € 20.322', <StatusBadge key="s" status="geschat" klein tooltip={false} />],
          ['Energie-investeringsaftrek (EIA)', '40%', '45,5%', <StatusBadge key="s" status="voorstel" klein tooltip={false} />],
          ['Kilometervergoeding privéauto', '€ 0,25', '€ 0,25', <StatusBadge key="s" status="definitief" klein tooltip={false} />],
        ]}
      />
      <ul>
        <li>De kilometervergoeding van € 0,25 geldt met terugwerkende kracht vanaf 1 januari 2026, eerst via een beleidsbesluit en straks in de wet.</li>
        <li>De leeftijdsgrens voor youngtimers gaat naar 17 jaar (2028: 20 jaar). Willekeurige afschrijving voor starters vervalt per 2028.</li>
        <li>De KIA-bedragen voor 2027 zijn nog niet gepubliceerd. Een eerder geplande versobering uit de Voorjaarsnota 2026 is geschrapt.</li>
      </ul>

      <h2 id="box-2">Box 2</h2>
      <p>
        Voor wie een BV heeft of overweegt: het hoge tarief in box 2 blijft in het Belastingplan 31%. De brief van 29 september 2026 verlaagt het tijdelijk naar 29,2% voor
        2027 tot en met 2030. De grens voor excessief lenen bij je eigen BV gaat volgens de brief van € 500.000 naar € 420.000, en daarna met € 80.000 per jaar omlaag tot €
        100.000 in 2031.
      </p>

      <h2 id="box-3">Box 3: twee varianten</h2>
      <p>Box 3 verschilt het meest tussen de twee voorstellen. Het heffingsvrij vermogen halveert in de variant van de brief.</p>
      <Tabel
        bijschrift="Box 3 in 2027"
        kop={['', '2026', '2027 Belastingplan', '2027 brief 29-9']}
        rijen={[
          ['Heffingsvrij vermogen per persoon', '€ 59.357', '€ 60.098', '€ 30.846'],
          ['Forfait overige bezittingen', '6,00%', '6,37%', '7,87%'],
          ['Forfait banktegoeden', '1,28%', '1,27%', '1,27%'],
          ['Forfait schulden', '2,70%', '2,85%', '2,85%'],
          ['Tarief', '36%', '36%', '36%'],
        ]}
        noot="Bank- en schuldforfait zijn voorlopig: de definitieve percentages volgen na afloop van het jaar."
      />
      <p>
        Hoe dat uitpakt en hoe tegenbewijs werkt, lees je in <Link href="/kennisbank/box-3-2027-twee-varianten">box 3 in 2027: twee varianten</Link>.
      </p>

      <h2 id="toeslagen">Toeslagen en kind</h2>
      <ul>
        <li>
          <strong>Kinderopvangtoeslag</strong>: de maximum uurprijs voor dagopvang gaat van € 11,23 naar € 11,60 en het percentage van 96% geldt tot een toetsingsinkomen van
          € 71.903 (voorstel, het besluit verschijnt half oktober in het Staatsblad).
        </li>
        <li>
          <strong>Kindgebonden budget</strong>: het maximum per kind onder 12 jaar gaat naar € 2.653. Het afbouwpercentage wordt 8,05% en boven € 61.917 komt er een tweede
          afbouw van 9,95%.
        </li>
        <li>
          <strong>Vermogensgrens</strong> voor kindgebonden budget en zorgtoeslag: van € 146.011 en € 184.633 naar € 119.122 zonder en € 158.748 met toeslagpartner
          (voorstel, wet 36932).
        </li>
        <li>
          <strong>Kinderbijslag</strong>: de raming voor een kind tot en met 5 jaar is € 321,89 per kwartaal, als het wetsvoorstel voor hogere kindbedragen wordt aangenomen.
        </li>
      </ul>
      <p>
        Meer in het artikel over <Link href="/kennisbank/kinderopvangtoeslag-voor-zzpers">kinderopvangtoeslag voor zzp&apos;ers</Link>.
      </p>

      <h2 id="zvw">Zvw-bijdrage</h2>
      <p>
        De inkomensafhankelijke bijdrage Zvw voor ondernemers is in 2026 4,85% tot een inkomen van € 79.409. Voor 2027 is de verwachting 5,02% tot € 82.547. Het ministerie van
        VWS stelt die cijfers in november vast.
      </p>

      <h2 id="arbeidsrelatie">Arbeidsrelatie</h2>
      <p>
        De Belastingdienst handhaaft de Wet DBA vanaf 2027 weer volledig, ook met verzuimboetes. Het rechtsvermoeden bij een uurtarief van € 38 of minder geldt vanaf 31
        december 2026. Over de Zelfstandigenwet loopt van 1 tot en met 29 oktober 2026 een consultatie; de beoogde ingangsdatum is 1 januari 2028. Zie ook het artikel over het{' '}
        <Link href="/kennisbank/urencriterium">urencriterium</Link>.
      </p>

      <h2 id="tijdlijn">Wanneer weet je het zeker?</h2>
      <Tabel
        bijschrift="Belangrijke momenten"
        kop={['Wanneer', 'Wat']}
        getallenVanaf={9}
        rijen={[
          ['Half oktober 2026', 'Besluit kinderopvangtoeslag 2027 in het Staatsblad'],
          ['November 2026', 'Zvw-percentage, minimumloon en zorgtoeslag 2027'],
          ['12 november 2026', 'Stemming Tweede Kamer over het Belastingplan 2027'],
          ['15 december 2026', 'Stemming Eerste Kamer; daarna de definitieve parameters'],
          ['Februari 2027', 'Definitieve box 3-percentages voor bank en schulden over 2026'],
        ]}
      />
      <p>We werken de cijfers in de calculator op die momenten bij. Bij elk bedrag zie je welke status het heeft.</p>
    </ArtikelLayout>
  )
}
