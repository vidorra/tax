/**
 * Ronde 2 (A3): controles op wat uit het vorige jaar is doorgerold. Saldi die afwijken van de uitkomst van vorig jaar
 * (dezelfde vergelijking als de kaart "Saldi uit {jaar}") en bedrijfsmiddelen uit een investering waarvan de aangenomen
 * levensduur nog niet is bevestigd. Puur: geen React, geen I/O.
 */
import type { ActiefInvoer } from '@/lib/tax/types'
import { saldiOpnieuwOvernemen } from '@/lib/dossier/doorrol'
import { itemSleutel } from '@/lib/dossier/ids'
import { veldVan } from '@/lib/dossier/veld'
import type { Controle, ControleRegel } from '../types'
import { lijstVingerafdruk } from '../vingerafdruk'
import { SECTIE, alleOndernemingen, waarOnderneming } from './hulp'

/** Id van het blok "Saldi uit {jaar}" op de jaarpagina (HuishoudenEditor zet het om de DoorrolKaart). */
export const SALDI_SECTIE = 'saldi-vorig-jaar'

/** Doorgerolde saldi wijken af van de uitkomst van vorig jaar. */
export const saldiVorigJaarRegel: ControleRegel = ({ invoer, vorig, jaar }) => {
  if (!vorig?.resultaat || vorig.invoer.jaar !== jaar - 1) return []
  const { wijzigingen } = saldiOpnieuwOvernemen(invoer, vorig.invoer, vorig.resultaat)
  if (wijzigingen.length === 0) return []
  const n = wijzigingen.length
  return [
    {
      id: 'saldi-vorig-jaar',
      regel: 'saldi-vorig-jaar',
      ernst: 'let-op',
      titel: `Saldi wijken af van ${jaar - 1}`,
      uitleg:
        n === 1
          ? `Eén saldo (${wijzigingen[0].label.toLocaleLowerCase('nl-NL')}) is anders dan de uitkomst van ${jaar - 1}. Was dat niet de bedoeling, neem de saldi dan opnieuw over.`
          : `${n} saldi, zoals verliezen of de oudedagsreserve, zijn anders dan de uitkomst van ${jaar - 1}. Was dat niet de bedoeling, neem ze dan opnieuw over.`,
      gebied: 'huishouden',
      veld: null,
      sectie: SALDI_SECTIE,
      linkLabel: `Naar Saldi uit ${jaar - 1}`,
      negeren: 'gezien',
      vingerafdruk: lijstVingerafdruk(wijzigingen.map((w) => [w.persoon, w.onderneming ?? '', w.label].join(':'))),
      oplossing: { label: `Neem de saldi uit ${jaar - 1} opnieuw over`, actie: 'saldi-opnieuw-overnemen' },
    },
  ]
}

const sleutelVan = (a: ActiefInvoer, i: number) => a.herkomst ?? String(i)

/** Bedrijfsmiddelen uit een investering met een aangenomen levensduur ('investering' = nog te bevestigen). */
export const levensduurRegel: ControleRegel = ({ invoer }) => {
  const uit: Controle[] = []
  for (const { p, o, sleutel } of alleOndernemingen(invoer)) {
    const lijst = (o.activa ?? []).map((a, i) => ({ a, i })).filter(({ a }) => a.bron === 'investering')
    if (lijst.length === 0) continue
    const jaren = [...new Set(lijst.map(({ a }) => a.levensduurJaren))]
    const eenJaren = jaren.length === 1 ? jaren[0] : undefined
    const n = lijst.length
    const eerste = lijst[0]
    uit.push({
      id: `levensduur:${p.id}:${sleutel}`,
      regel: 'levensduur',
      ernst: 'let-op',
      titel: 'Levensduur nog bevestigen',
      uitleg:
        n === 1
          ? `${eerste.a.omschrijving?.trim() || 'Een bedrijfsmiddel'} uit je investeringen heeft een aangenomen levensduur van ${eerste.a.levensduurJaren} jaar, zonder restwaarde. Klopt dat niet, pas het dan aan; anders trek je te veel af.`
          : `${n} bedrijfsmiddelen uit je investeringen hebben een aangenomen levensduur${eenJaren !== undefined ? ` van ${eenJaren} jaar` : ''}, zonder restwaarde. Klopt dat niet, pas het dan aan; anders trek je te veel af.`,
      waar: waarOnderneming(invoer, p, o),
      persoon: p.id,
      gebied: 'onderneming',
      veld: veldVan.onderneming(p.id, sleutel, `activa:${eerste.i}`, 'levensduurJaren'),
      sectie: SECTIE.ondernemingen(p.id),
      negeren: 'gezien',
      vingerafdruk: lijstVingerafdruk(lijst.map(({ a, i }) => sleutelVan(a, i))),
      oplossing: {
        label: eenJaren !== undefined ? `Bevestig ${eenJaren} jaar` : 'Bevestig de levensduur',
        pas: (d) => {
          const doel = d.personen.find((q) => q.id === p.id)?.ondernemingen.find((q, k) => itemSleutel(q, k) === sleutel)
          for (const a of doel?.activa ?? []) if (a.bron === 'investering') a.bron = 'handmatig'
        },
      },
    })
  }
  return uit
}

export const DOORROL_REGELS: ControleRegel[] = [saldiVorigJaarRegel, levensduurRegel]
