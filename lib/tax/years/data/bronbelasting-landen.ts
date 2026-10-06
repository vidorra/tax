/**
 * Landentabel voor buitenlandse bronbelasting in box 3 (ronde 2): statutair inhoudingspercentage, verdragstarief met
 * Nederland voor dividend en rente, en de termijn om terug te vragen. Jaaronafhankelijk, met een peildatum per land en
 * een changelog; `box3.bronbelastingMaxPct` (15%) staat in de jaarparameters.
 *
 * Verrekenbaar in Nederland = min(ingehouden, verdrag × bruto, bronbelastingMaxPct × bruto) (art. 25 Bvdb 2001 en het
 * besluit van 13 december 2024, §3.2.1). Wat boven het verdragstarief is ingehouden, vraag je terug in het bronland.
 *
 * Inhoud: de 25 landen uit fiscaal-ronde2.md 2.3. De tarieven en termijnen komen uit secundaire bronnen (PwC Worldwide
 * Tax Summaries, aangevuld met de sites van de buitenlandse belastingdiensten), dus elk land heeft status 'geschat' tot
 * iemand het bij de primaire bron (het verdrag en de wet van het bronland) heeft nagekeken. Termijnen waarover de bronnen
 * het niet eens zijn, staan op 'onzeker': de tool toont dan geen datum maar "termijn nakijken".
 *
 * Nagekeken bij de primaire bron (5 oktober 2026, zie de changelog):
 *  - Japan: verdrag 2010 (Trb. 2010, 249), art. 10 lid 2 onder b (dividend 10%) en art. 11 lid 2 (rente 10%; de
 *    vrijstelling van lid 3 geldt alleen voor overheden, centrale banken, financiële instellingen en pensioenfondsen,
 *    niet voor particulieren). PwC noemt voor rente 0 of 5%; dat is niet het verdragstarief voor een particulier.
 *  - Portugal: Código do IRS art. 71 lid 1: 28% bevrijdende bronheffing op dividend aan niet-inwoners (natuurlijke
 *    personen). De 25% van PwC is het tarief voor vennootschappen.
 *
 * Lezers nemen de tabel als argument (`{ tabel }`) zodat tests hun eigen tabel kunnen meegeven.
 */
import type { BronbelastingLand, Bron, ChangelogRegel } from '../../types'

const PEILDATUM = '2026-10-05'

const PWC: Bron = {
  titel: 'PwC Worldwide Tax Summaries, Corporate, Withholding taxes (rij Netherlands), aangevuld met de sites van de belastingdienst van het bronland; fiscaal-ronde2.md 2.3',
  url: 'https://taxsummaries.pwc.com/',
  datum: PEILDATUM,
}

const VERDRAG_JAPAN: Bron = {
  titel: 'Verdrag Nederland-Japan, Tokio 25-08-2010 (Trb. 2010, 249), art. 10 lid 2 en art. 11 lid 2 en 3',
  url: 'https://zoek.officielebekendmakingen.nl/trb-2010-249.html',
  datum: PEILDATUM,
}

const CIRS_PORTUGAL: Bron = {
  titel: 'Código do IRS, art. 71 (taxas liberatórias, 28%), Portal das Finanças; verdragstarief en termijn: fiscaal-ronde2.md 2.3',
  url: 'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/ra/Pages/irs71ra_201812.aspx',
  datum: PEILDATUM,
}

const land = (x: Omit<BronbelastingLand, 'status' | 'bron' | 'peildatum'> & Partial<Pick<BronbelastingLand, 'bron'>>): BronbelastingLand => ({
  status: 'geschat',
  bron: PWC,
  peildatum: PEILDATUM,
  ...x,
})

export const BRONBELASTING_LANDEN: readonly BronbelastingLand[] = [
  // Eerst de landen die het vaakst voorkomen (`veelgebruikt`), in de volgorde van de keuzelijst.
  land({
    code: 'US',
    naam: 'Verenigde Staten',
    veelgebruikt: true,
    dividend: { ingehouden: 0.3, verdrag: 0.15, opmerking: 'Met een W-8BEN bij je broker houdt de VS 15% in.' },
    rente: { ingehouden: 0, verdrag: 0, opmerking: 'Portfolio interest is in de VS vrijgesteld.' },
    terugvragen: { regel: 'onzeker', n: 0, procedure: 'Vraag eerst je broker om correctie (W-8BEN); anders Form 1040-NR bij de IRS' },
  }),
  land({
    code: 'DE',
    naam: 'Duitsland',
    veelgebruikt: true,
    dividend: { ingehouden: 0.26375, verdrag: 0.15, opmerking: '25% plus solidariteitstoeslag.' },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'eindJaarPlus', n: 4, procedure: 'Online verzoek bij het Bundeszentralamt für Steuern (BZSt)', url: 'https://www.bzst.de/' },
  }),
  land({
    code: 'FR',
    naam: 'Frankrijk',
    veelgebruikt: true,
    dividend: { ingehouden: 0.128, verdrag: 0.15, opmerking: '12,8% voor natuurlijke personen.' },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'eindJaarPlus', n: 2, procedure: 'Formulier 5000 met 5001', url: 'https://www.impots.gouv.fr/' },
  }),
  land({
    code: 'CH',
    naam: 'Zwitserland',
    veelgebruikt: true,
    dividend: { ingehouden: 0.35, verdrag: 0.15 },
    rente: { ingehouden: 0.35, verdrag: 0, opmerking: 'Rente: alles terugvragen.' },
    terugvragen: { regel: 'eindJaarPlus', n: 3, procedure: 'Formulier 82 I (particulieren), ook online bij de ESTV', url: 'https://www.estv.admin.ch/' },
  }),
  land({
    code: 'GB',
    naam: 'Verenigd Koninkrijk',
    veelgebruikt: true,
    dividend: { ingehouden: 0, verdrag: 0.15, opmerking: 'Alleen op uitkeringen van een REIT (PID) 20%.' },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'onzeker', n: 0, procedure: 'Verzoek op verdragsbasis bij HMRC' },
  }),
  land({
    code: 'BE',
    naam: 'België',
    veelgebruikt: true,
    dividend: { ingehouden: 0.3, verdrag: 0.15 },
    rente: { ingehouden: 0.3, verdrag: 0.1 },
    terugvragen: { regel: 'vanaf1JanPlus', n: 5, procedure: 'Formulier 276 Div-Aut; vak IV laat je afstempelen door de Nederlandse Belastingdienst', url: 'https://financien.belgium.be/' },
  }),
  land({
    code: 'IE',
    naam: 'Ierland',
    veelgebruikt: true,
    fondsland: true,
    dividend: { ingehouden: 0.25, verdrag: 0.15, opmerking: '0% met formulier V2A; Ierse fondsen (ETF) houden op hun uitkering meestal niets in.' },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'eindJaarPlus', n: 4, procedure: 'DWT-teruggaafverzoek bij Revenue, met formulier V2A', url: 'https://www.revenue.ie/' },
  }),
  land({
    code: 'LU',
    naam: 'Luxemburg',
    veelgebruikt: true,
    fondsland: true,
    dividend: { ingehouden: 0.15, verdrag: 0.15, opmerking: 'Fondsen (SICAV) houden niets in.' },
    rente: { ingehouden: 0, verdrag: 0 },
  }),
  // De rest alfabetisch op naam.
  land({
    code: 'AU',
    naam: 'Australië',
    dividend: { ingehouden: 0.3, verdrag: 0.15, opmerking: 'Alleen op het unfranked deel; franked dividend 0%.' },
    rente: { ingehouden: 0.1, verdrag: 0.1 },
    terugvragen: { regel: 'onzeker', n: 0, procedure: 'Verzoek bij de Australian Taxation Office (ATO), zonder standaardformulier' },
  }),
  land({
    code: 'CA',
    naam: 'Canada',
    dividend: { ingehouden: 0.25, verdrag: 0.15 },
    rente: { ingehouden: 0, verdrag: 0.1, opmerking: 'Zakelijke rente aan niet-verbonden partijen is meestal vrijgesteld.' },
    terugvragen: { regel: 'eindJaarPlus', n: 2, procedure: 'Formulier NR7-R bij de Canada Revenue Agency (CRA)' },
  }),
  land({
    code: 'CN',
    naam: 'China',
    dividend: { ingehouden: 0.1, verdrag: 0.1 },
    rente: { ingehouden: 0.1, verdrag: 0.1 },
  }),
  land({
    code: 'DK',
    naam: 'Denemarken',
    dividend: { ingehouden: 0.27, verdrag: 0.15 },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'maandenNaInhouding', n: 60, procedure: 'Online formulier van Skattestyrelsen, met woonplaatsverklaring' },
  }),
  land({
    code: 'FI',
    naam: 'Finland',
    dividend: { ingehouden: 0.3, verdrag: 0.15, opmerking: '35% bij nominee-registratie.' },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'eindJaarPlus', n: 3, procedure: 'Formulier 6164e bij Vero (natuurlijke personen), met woonplaatsverklaring' },
  }),
  land({
    code: 'HK',
    naam: 'Hongkong',
    dividend: { ingehouden: 0, verdrag: 0.1, opmerking: 'Hongkong houdt geen bronbelasting in op dividend.' },
    rente: { ingehouden: 0, verdrag: 0 },
  }),
  land({
    code: 'IN',
    naam: 'India',
    dividend: { ingehouden: 0.2, verdrag: 0.1, opmerking: '20% plus toeslag en 4% cess; het verdragstarief alleen met woonplaatsverklaring en Form 10F.' },
    rente: { ingehouden: 0.2, verdrag: 0.1 },
    terugvragen: { regel: 'onzeker', n: 0, procedure: 'Via de Indiase aangifte (ITR)' },
  }),
  land({
    code: 'IT',
    naam: 'Italië',
    dividend: { ingehouden: 0.26, verdrag: 0.15 },
    rente: { ingehouden: 0.26, verdrag: 0.1 },
    terugvragen: { regel: 'maandenNaInhouding', n: 48, procedure: 'Verzoek bij de Agenzia delle Entrate (Centro Operativo Pescara); de afhandeling duurt vaak jaren' },
  }),
  land({
    code: 'JP',
    naam: 'Japan',
    bron: VERDRAG_JAPAN,
    dividend: { ingehouden: 0.15315, verdrag: 0.1, opmerking: '15,315% op beursgenoteerde aandelen (met 2,1% toeslag); 20,42% op andere.' },
    rente: { ingehouden: 0.15315, verdrag: 0.1, opmerking: 'Verdrag art. 11 lid 2: 10% voor particulieren.' },
    terugvragen: { regel: 'jarenNaUitkering', n: 5, procedure: 'Form 11 met Form 3 en woonplaatsverklaring bij de National Tax Agency (NTA)' },
  }),
  land({
    code: 'NO',
    naam: 'Noorwegen',
    dividend: { ingehouden: 0.25, verdrag: 0.15 },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'eindJaarPlus', n: 5, procedure: 'Online bij Skatteetaten of formulier RF-1552E; geen uitbetaling onder NOK 50' },
  }),
  land({
    code: 'AT',
    naam: 'Oostenrijk',
    dividend: { ingehouden: 0.275, verdrag: 0.15 },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'eindJaarPlus', n: 5, procedure: 'Formulier ZS-RD1 na een elektronische voormelding bij het BMF' },
  }),
  land({
    code: 'PT',
    naam: 'Portugal',
    bron: CIRS_PORTUGAL,
    dividend: { ingehouden: 0.28, verdrag: 0.1, opmerking: '28% voor natuurlijke personen (art. 71 CIRS), 35% bij een land op de zwarte lijst.' },
    rente: { ingehouden: 0.28, verdrag: 0.1 },
    terugvragen: { regel: 'eindJaarPlus', n: 2, procedure: 'Formulier Modelo 22-RFI' },
  }),
  land({
    code: 'SG',
    naam: 'Singapore',
    dividend: { ingehouden: 0, verdrag: 0, opmerking: 'Singapore houdt geen bronbelasting in op dividend; er is niets te verrekenen.' },
    rente: { ingehouden: 0, verdrag: 0.1, opmerking: 'Meestal geen inhouding.' },
  }),
  land({
    code: 'ES',
    naam: 'Spanje',
    dividend: { ingehouden: 0.19, verdrag: 0.15 },
    rente: { ingehouden: 0, verdrag: 0.1, opmerking: 'Inwoners van de EU zijn meestal vrijgesteld.' },
    terugvragen: { regel: 'onzeker', n: 0, procedure: 'Formulier Modelo 210' },
  }),
  land({
    code: 'TW',
    naam: 'Taiwan',
    dividend: { ingehouden: 0.21, verdrag: 0.1, opmerking: 'Belastingregeling van 2001 tussen de vertegenwoordigingen.' },
    rente: { ingehouden: 0.15, verdrag: 0.1, opmerking: '15 tot 20% ingehouden.' },
    terugvragen: { regel: 'onzeker', n: 0, procedure: 'Verzoek bij het National Taxation Bureau' },
  }),
  land({
    code: 'KR',
    naam: 'Zuid-Korea',
    dividend: { ingehouden: 0.22, verdrag: 0.15, opmerking: '20% plus 2% lokale toeslag; het verdragstarief is inclusief de toeslag.' },
    rente: { ingehouden: 0.154, verdrag: 0.15, opmerking: '10% bij leningen van banken.' },
    terugvragen: { regel: 'onzeker', n: 0, procedure: 'Verzoek tot correctie bij de National Tax Service via de inhoudingsplichtige' },
  }),
  land({
    code: 'SE',
    naam: 'Zweden',
    dividend: { ingehouden: 0.3, verdrag: 0.15, opmerking: 'Het nieuwe verdrag van 24 juni 2026 houdt dezelfde tarieven en geldt pas na ratificatie.' },
    rente: { ingehouden: 0, verdrag: 0 },
    terugvragen: { regel: 'eindJaarPlus', n: 5, procedure: 'Formulier SKV 3740 bij Skatteverket (wacht vier maanden na de uitkering)' },
  }),
]

export const BRONBELASTING_LANDEN_CHANGELOG: readonly ChangelogRegel[] = [
  {
    datum: '2026-10-05',
    wat: 'Tabel aangemaakt in het contract van ronde 2, nog zonder landen (onderdeel bronbelasting vult hem)',
    bron: { titel: 'fiscaal-ronde2.md 2.3 (verdragstarieven en termijnen per land)', datum: '2026-10-05' },
  },
  {
    datum: '2026-10-05',
    wat: 'De 25 landen uit fiscaal-ronde2.md 2.3 gevuld (status geschat, peildatum 5-10-2026); veelgebruikt: VS, DE, FR, CH, VK, BE, IE, LU; termijnen van VS, VK, ES, AU, KR, TW en IN op onzeker',
    bron: PWC,
  },
  {
    datum: '2026-10-05',
    wat: 'Japan, rente: verdragstarief 10% (verdrag 2010 art. 11 lid 2; de vrijstelling van lid 3 geldt niet voor particulieren) in plaats van de 0 of 5% van PwC',
    bron: VERDRAG_JAPAN,
  },
  {
    datum: '2026-10-05',
    wat: 'Portugal: ingehouden 28% voor natuurlijke personen (art. 71 CIRS) in plaats van de 25% van PwC (tarief voor vennootschappen); verdragstarief 10% en termijn nog secundair',
    bron: CIRS_PORTUGAL,
  },
]

/** Het land met deze ISO-code, of undefined. */
export function landUitTabel(code: string, tabel: readonly BronbelastingLand[] = BRONBELASTING_LANDEN): BronbelastingLand | undefined {
  const c = code.trim().toUpperCase()
  return tabel.find((l) => l.code === c)
}
