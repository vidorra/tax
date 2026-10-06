import type { BronLink } from './Bronnen'

/** Primaire bronnen uit hoofdstuk 14 van het plan, één plek voor alle artikelen. */
export const BRONNEN = {
  minfin2026: {
    titel: 'Ministerie van Financiën, Belangrijkste wijzigingen belastingen 2026, bijlage Fiscale parameters 2025-2026 (16 december 2025)',
    url: 'https://open.overheid.nl/documenten/c3d48c04-1009-4ffe-a54b-cebf13427ab5/file',
  },
  minfin2024: {
    titel: 'Ministerie van Financiën, bijlage Fiscale parameters 2021-2024',
    url: 'https://open.overheid.nl/documenten/dcbb490f-d406-4842-ac33-b5c397e19df0/file',
  },
  belastingplan2027: {
    titel: 'Wetsvoorstel Belastingplan 2027 met memorie van toelichting (15 september 2026)',
    url: 'https://www.rijksfinancien.nl/sites/default/files/bestanden/belastingplan-2027/wetsvoorstel-belastingplan-2027/Wetsvoorstel-Belastingplan-2027.pdf',
  },
  amendementIack: {
    titel: 'Gewijzigd amendement Grinwis c.s. over de IACK (Kamerstuk 36418, nr. 61)',
    url: 'https://zoek.officielebekendmakingen.nl/kst-36418-61.html',
  },
  bdIack: {
    titel: 'Belastingdienst, voorwaarden inkomensafhankelijke combinatiekorting',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/aftrek-en-kortingen/content/voorwaarden-inkomensafhankelijke-combinatiekorting',
  },
  bdVoorlopigeAanslag: {
    titel: 'Belastingdienst, tarieven en heffingskortingen voorlopige aanslag 2026',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/voorlopige-aanslag/content/voorlopige-aanslag-tarieven-en-heffingskortingen',
  },
  bdArbeidsinkomen: {
    titel: 'Belastingdienst, inkomen uit werk (arbeidsinkomen)',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/inkomstenbelasting/heffingskortingen_boxen_tarieven/heffingskortingen/arbeidskorting/inkomen_uit_werk',
  },
  bdLijfrente: {
    titel: 'Belastingdienst, lijfrentepremies aftrekken (volgorde reserveringsruimte en jaarruimte)',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/werk_en_inkomen/lijfrente/aftrekken-lijfrentepremies/',
  },
  bdKia2026: {
    titel: 'Belastingdienst, kleinschaligheidsinvesteringsaftrek 2026',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/winst/inkomstenbelasting/veranderingen-inkomstenbelasting-2026/investeringsaftrek-2026/kleinschaligheidsinvesteringsaftrek-2026',
  },
  bdZvw: {
    titel: 'Belastingdienst, percentages inkomensafhankelijke bijdrage Zvw',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/werk_en_inkomen/zorgverzekeringswet/veranderingen-bijdrage-zvw/percentages-zvw',
  },
  bdBox3Berekening: {
    titel: 'Belastingdienst, berekening box 3-inkomen 2024',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/berekening-box-3-inkomen-2024',
  },
  bdOwr: {
    titel: 'Belastingdienst, veelgestelde vragen Opgaaf werkelijk rendement',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/box-3/content/veelgestelde-vragen-opgaaf-werkelijk-rendement',
  },
  bdCrypto: {
    titel: 'Belastingdienst, cryptovaluta',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/werk-en-inkomen/content/cryptovaluta',
  },
  bdHandhaving: {
    titel: 'Belastingdienst, handhaving arbeidsrelaties',
    url: 'https://www.belastingdienst.nl/wps/wcm/connect/nl/arbeidsrelaties/content/handhaving',
  },
  wetIb: {
    titel: 'Wet inkomstenbelasting 2001 (onder meer art. 2.15, 2.17, 3.6, 3.127, 5.24, 8.14a en 10a.29)',
    url: 'https://wetten.overheid.nl/BWBR0011353/2026-01-01',
  },
  toeslagenkaart2026: {
    titel: 'Belastingdienst, Toeslagenkaart 2026',
    url: 'https://download.belastingdienst.nl/toeslagen/docs/toeslagenkaart_2025_tg7101z61pl.pdf',
  },
  kot2026: {
    titel: 'Rijksoverheid, bedragen kinderopvangtoeslag 2026',
    url: 'https://www.rijksoverheid.nl/onderwerpen/kinderopvangtoeslag/bedragen-kinderopvangtoeslag-2026',
  },
  kotStelsel: {
    titel: 'Rijksoverheid, kabinet zet stap naar nieuw financieringsstelsel kinderopvang (21 september 2026)',
    url: 'https://www.rijksoverheid.nl/actueel/nieuws/2026/09/21/kabinet-zet-belangrijke-stap-naar-nieuwe-financieringsstelsel-kinderopvang',
  },
  kgb36923: {
    titel: 'Wetsvoorstel 36923 (kindgebonden budget), tweede nota van wijziging (17 september 2026)',
    url: 'https://www.eerstekamer.nl/behandeling/20260917/nota_van_wijziging_tweede_nota_van/document3/f=/vn0zmz4cg0yw.pdf',
  },
  szw2027: {
    titel: 'Begroting Sociale Zaken en Werkgelegenheid 2027',
    url: 'https://www.rijksfinancien.nl/sites/default/files/kamerstuk_pdf/kst-37020-XV-2_0.pdf',
  },
  vermogensgrens36932: {
    titel: 'Wetsvoorstel 36932 (vereenvoudiging, vermogensgrens toeslagen 2027)',
    url: 'https://www.eerstekamer.nl/wetsvoorstel/36932_wet_vereenvoudiging',
  },
  rechtsvermoeden: {
    titel: 'Staatsblad 2026, 207 (rechtsvermoeden arbeidsovereenkomst bij uurtarief)',
    url: 'https://zoek.officielebekendmakingen.nl/stb-2026-207.html',
  },
  zelfstandigenwet: {
    titel: "Rijksoverheid, Zelfstandigenwet biedt meer duidelijkheid en erkenning voor zzp'ers (1 oktober 2026)",
    url: 'https://www.rijksoverheid.nl/actueel/nieuws/2026/10/01/zelfstandigenwet-biedt-meer-duidelijkheid-en-erkenning-voor-zzpers',
  },
  baz36912: {
    titel: 'Wetsvoorstel 36912 (basisverzekering arbeidsongeschiktheid zelfstandigen)',
    url: 'https://www.tweedekamer.nl/kamerstukken/wetsvoorstellen/detail?qry=wetsvoorstel%3A36912&cfg=wetsvoorsteldetails',
  },
  dac8: {
    titel: 'Wetsvoorstel 36782 (implementatie DAC8)',
    url: 'https://www.eerstekamer.nl/wetsvoorstel/36782_wet_implementatie_eu',
  },
  bedragIneens: {
    titel: 'Rijksoverheid, Eerste Kamer stemt in met in één keer deel van pensioen opnemen (16 juni 2026)',
    url: 'https://www.rijksoverheid.nl/actueel/nieuws/2026/06/16/eerste-kamer-stemt-in-met-in-een-keer-deel-van-pensioen-opnemen',
  },
  kennisgroepen: {
    titel: 'Belastingdienst, kennisgroepstandpunten',
    url: 'https://kennisgroepen.belastingdienst.nl/',
  },
} satisfies Record<string, BronLink>
