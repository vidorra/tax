/**
 * Bouwt het fiscaal rapport van één belastingplichtige uit invoer, uitkomst en parameters. Puur: geen I/O en geen
 * Date.now() (de datum komt uit de opties). Volgorde zoals het rapport van de accountant: hoofdstuk 1
 * persoonlijke gegevens, 2 inkomstenbelasting, 3 belastbaar inkomen, 4 bijlagen, 5 winstaangifte per onderneming en
 * daarna ondernemersaftrek. Een sectie zonder inhoud valt weg; de verantwoording noemt wat is weggelaten en
 * waarom. De nummering loopt door over wat er staat.
 */
import type { BouwRapport, RapportDocument, Sectie } from './model'
import { RAPPORT_MODEL_VERSIE } from './model'
import { nummer } from './nummering'
import { heeftInhoud, uniekeSlugs, type RapportContext } from './secties/bouwstenen'
import { kopregel, titelVan } from './secties/kopregel'
import { voorblad } from './secties/voorblad'
import { verantwoording } from './secties/verantwoording'
import { hoofdstukPersoonlijk } from './secties/persoonlijk'
import { hoofdstukInkomstenbelasting } from './secties/inkomstenbelasting'
import { hoofdstukBelastbaarInkomen } from './secties/belastbaar-inkomen'
import { hoofdstukBijlagen } from './secties/bijlagen'
import { hoofdstukkenWinstaangifte } from './secties/winstaangifte'
import { hoofdstukOndernemersaftrek } from './secties/ondernemersaftrek'

/** Haalt lege secties weg, van binnen naar buiten. */
function snoei(s: Sectie | null | undefined): Sectie | null {
  if (!s) return null
  s.secties = s.secties.map(snoei).filter((x): x is Sectie => x !== null)
  return heeftInhoud(s) ? s : null
}

export const bouwRapport: BouwRapport = (invoer, resultaat, params, opties) => {
  const id = opties.persoon
  const pIndex = resultaat.personen.findIndex((x) => x.id === id)
  const piIndex = invoer.personen.findIndex((x) => x.id === id)
  if (pIndex < 0 || piIndex < 0) throw new Error(`Persoon ${id} staat niet in dit dossier.`)
  const p = resultaat.personen[pIndex]
  const pi = invoer.personen[piIndex]
  const partners = invoer.fiscaalPartner && invoer.personen.length === 2
  const anderInvoer = invoer.personen.find((x) => x.id !== id)
  const naam = opties.naam(id)

  const c: RapportContext = {
    invoer,
    r: resultaat,
    P: params,
    opties,
    jaar: invoer.jaar,
    id,
    naam,
    p,
    pi,
    pIndex,
    piIndex,
    partners,
    ander: anderInvoer
      ? { id: anderInvoer.id, naam: opties.naam(anderInvoer.id), pi: anderInvoer, p: resultaat.personen.find((x) => x.id === anderInvoer.id) }
      : undefined,
    weggelaten: [],
    meldingen: [],
  }

  const slugs = uniekeSlugs(pi.ondernemingen.map((o) => o.naam))
  const ruw: Array<Sectie | null> = [
    hoofdstukPersoonlijk(c),
    hoofdstukInkomstenbelasting(c),
    hoofdstukBelastbaarInkomen(c),
    hoofdstukBijlagen(c),
    ...hoofdstukkenWinstaangifte(c, slugs),
    hoofdstukOndernemersaftrek(c),
  ]
  if (pi.ondernemingen.length === 0) {
    c.weggelaten.push('Winstaangifte en ondernemersaftrek: weggelaten, er is geen onderneming ingevoerd.')
  }
  const hoofdstukken = ruw.map(snoei).filter((x): x is Sectie => x !== null)

  const doc: RapportDocument = {
    modelVersie: RAPPORT_MODEL_VERSIE,
    jaar: invoer.jaar,
    persoon: id,
    titel: titelVan(invoer.jaar),
    naam,
    kopregel: kopregel(invoer.jaar, naam, opties.vandaag),
    voorblad: voorblad(c),
    // Na de hoofdstukken: die vullen de lijst met weggelaten onderdelen en de meldingen van de controles.
    verantwoording: verantwoording(c),
    hoofdstukken,
    // Ronde 2 (A3): open fouten in een jaar dat niet is ingediend (lib/rapport/controles.ts).
    ...(opties.controles?.concept ? { concept: true } : {}),
  }
  nummer(doc)
  return doc
}
