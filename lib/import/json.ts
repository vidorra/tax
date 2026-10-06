/**
 * Ronde 2 (A4): de eigen JSON-export weer inlezen. Twee formaten: `ibcalculator-jaar` (ExportPagina, één jaar; met
 * aangiftestaat en accountant sinds ronde 2) en `ibcalculator-dossier-export` (versie 1, het hele dossier).
 *
 * In de browser: per jaar `valideerInvoer` (hooguit twaalf fouten met pad), opnieuw rekenen met de huidige parameters
 * (de samenvatting uit het bestand vertrouwen we niet), bestaat het jaar al en wat is nieuwer. Standaard: een nieuw
 * jaar Toevoegen, een bestaand jaar Overslaan. Het verzoek aan de server bevat alleen de jaren met Toevoegen of
 * Vervangen en alleen de onderdelen waarvan de schakelaar aan staat; Moneybird-koppelingen nooit. Puur.
 */
import type { HuishoudenInvoer } from '@/lib/tax/types'
import type { JsonFormaat, JsonImportJaar, JsonImportVoorstel, JsonJaarActie } from './types'
import { isDossierStatus } from '@/lib/dossier/status'
import { valideerInvoer } from '@/lib/dossier/valideer'
import { berekenDossier } from '@/lib/dossier/bereken'
import { getJaar } from '@/lib/tax/years'
import { DOSSIER_VERSIE, MAX_FOUTEN, MAX_JAREN, TEKST, type JsonBestaand, type JsonBron, type JsonBronJaar } from './json-keuzes'

export * from './json-keuzes'

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Bedragen van de accountant: minstens één getal bij een persoon (een export zonder bedragen geeft `{}`). */
const metBedragen = (x: unknown): boolean => isObj(x) && Object.values(x).some((p) => isObj(p) && Object.values(p).some((v) => typeof v === 'number'))

/** Aangiftestaat met iets van de gebruiker: vinkjes, negeringen, terugvragen of planning (niet alleen `controles.streng`). */
const metVoortgang = (x: unknown): boolean =>
  isObj(x) && ['invulhulp', 'genegeerd', 'terugvragen', 'planning'].some((k) => isObj(x[k]) && Object.keys(x[k] as object).length > 0)

/** Bestaat de variant voor dit jaar? (null of leeg: de standaard.) */
export function variantBestaat(jaar: number, variant: string | null | undefined): boolean {
  if (!variant) return true
  try {
    return getJaar(jaar).varianten.some((v) => v.id === variant)
  } catch {
    return false
  }
}

function standaardReken(invoer: HuishoudenInvoer, variant: string | null): number | null {
  try {
    const v = variant ?? undefined
    return berekenDossier({ ...invoer, variant: v }, { variant: v }).totaal.teBetalenIB
  } catch {
    return null
  }
}

/** Telt personen, ondernemingen en bezittingen zonder de invoer te vertrouwen. */
function tel(invoer: unknown): { personen: number; ondernemingen: number; posities: number } {
  if (!isObj(invoer)) return { personen: 0, ondernemingen: 0, posities: 0 }
  const personen = Array.isArray(invoer.personen) ? invoer.personen : []
  const ondernemingen = personen.reduce<number>((s, p) => s + (isObj(p) && Array.isArray(p.ondernemingen) ? p.ondernemingen.length : 0), 0)
  const posities = isObj(invoer.box3) && Array.isArray(invoer.box3.posities) ? invoer.box3.posities.length : 0
  return { personen: personen.length, ondernemingen, posities }
}

function leeg(fout: string, formaat: JsonFormaat = 'ibcalculator-jaar', versie = 0): { voorstel: JsonImportVoorstel; bron: null } {
  return { voorstel: { formaat, versie, jaren: [], ookBeschikbaar: { gegevens: false }, fouten: [fout] }, bron: null }
}

/** Leest het bestand en maakt het voorstel per jaar. */
export function leesJsonExport(
  tekst: string,
  opties: { bestaand: JsonBestaand[]; reken?: (invoer: HuishoudenInvoer, variant: string | null) => number | null },
): { voorstel: JsonImportVoorstel; bron: JsonBron | null } {
  let data: unknown
  try {
    data = JSON.parse(tekst.charCodeAt(0) === 0xfeff ? tekst.slice(1) : tekst)
  } catch {
    return leeg(TEKST.geenJson)
  }
  if (!isObj(data) || (data.formaat !== 'ibcalculator-jaar' && data.formaat !== 'ibcalculator-dossier-export')) return leeg(TEKST.anderFormaat)
  const formaat = data.formaat as JsonFormaat
  const versie = data.versie === undefined ? 1 : data.versie
  if (typeof versie !== 'number' || !Number.isInteger(versie) || versie < 1) return leeg(TEKST.anderFormaat, formaat)
  if (versie > DOSSIER_VERSIE) return leeg(TEKST.nieuwer, formaat, versie)

  const jaren: JsonBronJaar[] = []
  let gegevens: unknown | null = null
  const statusVan = (x: unknown) => (isDossierStatus(x) ? x : undefined)
  const tekstOf = (x: unknown) => (typeof x === 'string' ? x : undefined)
  const teBetalen = (s: unknown) => (isObj(s) && typeof s.teBetalenIB === 'number' && Number.isFinite(s.teBetalenIB) ? { teBetalenIB: s.teBetalenIB } : {})
  if (formaat === 'ibcalculator-jaar') {
    if (typeof data.jaar !== 'number' || !Number.isInteger(data.jaar)) return leeg(TEKST.anderFormaat, formaat, versie)
    jaren.push({
      jaar: data.jaar,
      variant: typeof data.variant === 'string' && data.variant ? data.variant : null,
      status: statusVan(data.status),
      invoer: data.invoer,
      accountant: isObj(data.accountant) ? data.accountant : null,
      aangiftestaat: isObj(data.aangiftestaat) ? data.aangiftestaat : null,
      bijgewerkt: tekstOf(data.bijgewerkt) ?? tekstOf(data.geexporteerd),
      ...teBetalen(data.samenvatting),
    })
  } else {
    const hh = Array.isArray(data.huishoudens) ? data.huishoudens.find(isObj) : undefined
    if (!hh) return leeg(TEKST.geenJaren, formaat, versie)
    gegevens = isObj(hh.gegevens) && Object.keys(hh.gegevens).length > 0 ? hh.gegevens : null
    for (const j of Array.isArray(hh.jaren) ? hh.jaren : []) {
      if (!isObj(j) || typeof j.jaar !== 'number' || !Number.isInteger(j.jaar)) continue
      jaren.push({
        jaar: j.jaar,
        variant: typeof j.variant === 'string' && j.variant ? j.variant : null,
        status: statusVan(j.status),
        invoer: j.invoer,
        accountant: isObj(j.accountant) ? j.accountant : null,
        aangiftestaat: isObj(j.aangiftestaat) ? j.aangiftestaat : null,
        bijgewerkt: tekstOf(j.bijgewerkt),
        ...teBetalen(isObj(j.laatsteBerekening) ? j.laatsteBerekening.samenvatting : undefined),
      })
    }
  }
  if (jaren.length === 0) return leeg(TEKST.geenJaren, formaat, versie)

  // Dubbele jaren: het eerste telt.
  const gezien = new Set<number>()
  const uniek = jaren.filter((j) => (gezien.has(j.jaar) ? false : (gezien.add(j.jaar), true))).slice(0, MAX_JAREN)
  const reken = opties.reken ?? standaardReken
  const uit: JsonImportJaar[] = uniek
    .map((j) => {
      const fouten = valideerInvoer(j.invoer).slice(0, MAX_FOUTEN)
      if (fouten.length === 0 && isObj(j.invoer) && j.invoer.jaar !== j.jaar) fouten.push(`invoer.jaar: hoort bij ${String(j.invoer.jaar)}, niet bij ${j.jaar}`)
      if (fouten.length === 0 && !variantBestaat(j.jaar, j.variant)) fouten.push(`variant: onbekende variant voor ${j.jaar}`)
      const berekend = fouten.length === 0 ? reken(j.invoer as HuishoudenInvoer, j.variant) : null
      if (fouten.length === 0 && berekend === null) fouten.push('De berekening lukt niet met deze invoer.')
      const mogelijk = fouten.length === 0
      const dossier = opties.bestaand.find((b) => b.jaar === j.jaar)
      return {
        jaar: j.jaar,
        mogelijk,
        fouten,
        bestaat: Boolean(dossier),
        standaard: (mogelijk && !dossier ? 'toevoegen' : 'overslaan') as JsonJaarActie,
        bestand: { ...(j.bijgewerkt ? { bijgewerkt: j.bijgewerkt } : {}), ...(j.status ? { status: j.status } : {}), ...(j.teBetalenIB !== undefined ? { teBetalenIB: j.teBetalenIB } : {}), ...tel(j.invoer) },
        ...(dossier ? { dossier: { bijgewerkt: dossier.bijgewerkt, ...(dossier.teBetalenIB !== undefined ? { teBetalenIB: dossier.teBetalenIB } : {}), ...(dossier.status ? { status: dossier.status } : {}) } } : {}),
        ...(berekend !== null && mogelijk ? { berekend: { teBetalenIB: berekend } } : {}),
        dossierNieuwer: Boolean(dossier && j.bijgewerkt && dossier.bijgewerkt > j.bijgewerkt),
        heeft: { accountant: metBedragen(j.accountant), aangiftestaat: metVoortgang(j.aangiftestaat) },
      }
    })
    .sort((a, b) => b.jaar - a.jaar)
  return {
    voorstel: { formaat, versie, ...(typeof data.geexporteerd === 'string' ? { geexporteerd: data.geexporteerd } : {}), jaren: uit, ookBeschikbaar: { gegevens: gegevens !== null }, fouten: [] },
    bron: { formaat, versie, jaren: uniek, gegevens },
  }
}
