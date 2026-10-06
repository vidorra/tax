/**
 * Hoofdstuk 1 Persoonlijke gegevens (spec hoofdstuk 2, "Hoofdstuk 1"). Naam en geboortedatum van de persoon en,
 * bij fiscaal partnerschap, van de partner. Geen burgerservicenummer. De samenlevingsvorm komt uit de
 * persoonlijke gegevens van het huishouden en geldt voor alle jaren; de engine kent alleen fiscaal partnerschap
 * voor het hele jaar. Past de samenlevingsvorm niet bij het partnerschap van dit jaar, dan blijft hij weg en
 * staat er een melding in de verantwoording.
 */
import type { GegevensBlok, HuishoudenGegevens, Sectie, TekstBlok } from '../model'
import { pastBij } from '../export'
import { datumKort } from '../notatie'
import { sectie, type RapportContext } from './bouwstenen'

const SAMENLEVINGSVORM: Record<NonNullable<HuishoudenGegevens['samenlevingsvorm']>, string> = {
  gehuwd: 'Gehuwd',
  'geregistreerd-partner': 'Geregistreerd partner',
  'samenwonend-met-contract': 'Samenwonend met samenlevingscontract',
  samenwonend: 'Samenwonend',
  alleenstaand: 'Alleenstaand',
}

type Samenlevingsvorm = NonNullable<HuishoudenGegevens['samenlevingsvorm']>

export function hoofdstukPersoonlijk(c: RapportContext): Sectie {
  const rijen: GegevensBlok['rijen'] = [
    { label: 'Naam', waarde: c.naam },
    { label: 'Geboortedatum', waarde: datumKort(c.pi.geboortedatum) },
  ]
  const ander = c.partners ? c.ander : undefined
  if (ander) {
    rijen.push({ label: 'Partner', kop: true, witVoor: 1 })
    rijen.push({ label: 'Naam', waarde: ander.naam })
    if (ander.pi) rijen.push({ label: 'Geboortedatum', waarde: datumKort(ander.pi.geboortedatum) })
  }
  const opgegeven = c.opties.gegevens?.samenlevingsvorm
  const vorm = opgegeven && pastBij(opgegeven, c.partners) ? opgegeven : undefined
  if (opgegeven && !vorm) {
    c.meldingen.push({
      ernst: 'let-op',
      tekst: `De samenlevingsvorm bij de persoonlijke gegevens (${SAMENLEVINGSVORM[opgegeven].toLowerCase()}) past niet bij de keuze voor ${c.jaar}: ${c.partners ? 'fiscale partners' : 'geen fiscale partner'}. Hoofdstuk 1 noemt de samenlevingsvorm daarom niet. Controleer beide gegevens.`,
    })
  }
  const situatie = vorm ? SAMENLEVINGSVORM[vorm] : !c.partners && !opgegeven ? 'Alleenstaand' : undefined
  if (situatie) rijen.push({ label: 'Persoonlijke situatie', waarde: situatie, witVoor: 1 })

  const zinnen: string[] = []
  if (ander) {
    if (vorm === 'samenwonend' || vorm === 'samenwonend-met-contract') {
      zinnen.push(`${c.naam} staat heel ${c.jaar} op hetzelfde adres ingeschreven als de huisgenoot.`)
      zinnen.push(`${c.naam} voldoet met de huisgenoot aan de voorwaarden fiscaal partnerschap.`)
      zinnen.push(`${c.naam} en de huisgenoot zijn heel ${c.jaar} fiscale partners.`)
    } else {
      zinnen.push(`${c.naam} en ${ander.naam} zijn heel ${c.jaar} fiscale partners.`)
    }
  } else {
    zinnen.push(`${c.naam} heeft in ${c.jaar} geen fiscale partner.`)
  }
  const tekst: TekstBlok[] = zinnen.map((t) => ({ soort: 'tekst', tekst: t, witVoor: 1 }))
  return sectie('Persoonlijke gegevens', 1, [{ soort: 'gegevens', rijen }, ...tekst], [], { nieuwePagina: true })
}
