/**
 * Maakt het fiscaal rapport (PDF en Excel) uit de voorbeeldaangiftes, om de opmaak te bekijken zonder dossier.
 *
 *   npm run rapport:voorbeeld -- <map> [--datum 2026-10-04]
 *
 * Bronnen: het verzonnen voorbeeldhuishouden in lib/voorbeeld (2024 en 2021, met jaarrekening) en, alleen lokaal,
 * elke privé-fixture (een JSON-bestand met `invoer`) in de mappen van PRIVE_MAPPEN, als die er zijn (zie README).
 * Per bron een submap met het rapport van persoon A en van beide partners, elk als PDF en als Excel. Heeft een
 * fixture de bedragen van de accountant, dan staan die in de verantwoording als vergelijking. Geen namen: de
 * personen heten 'Persoon A' en 'Persoon B'. De uitvoer van een privé-fixture bevat echte bedragen: schrijf die
 * nooit in de repository.
 *
 * Met --datum staat er een vaste datum op het rapport (handig om twee versies te vergelijken); anders nu.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HuishoudenInvoer, PersoonId } from '../lib/tax/types'
import { berekenHuishouden } from '../lib/tax/engine'
import { getJaar } from '../lib/tax/years/index'
import type { AccountantRegels } from '../lib/dossier/accountant'
import { lokaalTijdstip, rapportBestandsnaam, rapportInvoer, toolVersieTekst, type RapportKeuze } from '../lib/rapport/export'
import { bouwRapporten } from '../lib/rapport/rapporten'
import { rapportPdfBytes } from '../components/dossier/rapport-pdf'
import { rapportXlsxBytes } from '../components/dossier/rapport-xlsx'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface Bron {
  map: string
  pad: string
}

const VOORBEELDEN: Bron[] = [
  { map: 'voorbeeld-2024', pad: 'lib/voorbeeld/huishouden-2024.json' },
  { map: 'voorbeeld-2021', pad: 'lib/voorbeeld/huishouden-2021.json' },
]

/** Mappen met privé-fixtures: alleen lokaal (gitignored); in een schone kloon bestaan ze niet. */
const PRIVE_MAPPEN = ['lib/tax/__tests__/prive', 'lib/rapport/__tests__/prive']

/** Elke JSON-fixture in de privé-mappen, met een submap per bestand ('prive-tax-<naam>'). */
function priveBronnen(): Bron[] {
  const uit: Bron[] = []
  for (const m of PRIVE_MAPPEN) {
    const abs = join(ROOT, m)
    if (!existsSync(abs)) continue
    const soort = m.split('/')[1]
    for (const f of readdirSync(abs).filter((x) => x.endsWith('.json')).sort()) {
      uit.push({ map: `prive-${soort}-${basename(f, '.json')}`, pad: join(m, f) })
    }
  }
  return uit
}

/** Velden uit `verwacht` van de fixture die bij een regel van de accountantsvergelijking horen. */
const ACCOUNTANT_VELDEN: Record<string, string> = {
  winst: 'winstUitOnderneming',
  zelfstandigenaftrek: 'zelfstandigenaftrek',
  mkb: 'mkbVrijstelling',
  belastbareWinst: 'belastbareWinst',
  inkomensvoorziening: 'inkomensvoorziening',
  box1Inkomen: 'box1Inkomen',
  box1Belasting: 'box1Belasting',
  premie: 'premie',
  box3Belasting: 'box3Belasting',
  heffingskortingen: 'heffingskortingen',
  verschuldigd: 'verschuldigdIB',
  teBetalen: 'teBetalenIB',
  zvw: 'zvwBijdrage',
  zvwTeBetalen: 'zvwTeBetalen',
}

interface Fixture {
  invoer: HuishoudenInvoer
  verwacht?: Partial<Record<PersoonId, Record<string, unknown>>>
  /** Bedragen waarin het rapport van de accountant afwijkt van `verwacht`. */
  rapport?: Partial<Record<PersoonId, Record<string, unknown>>>
}

/** De bedragen uit het rapport van de accountant: `verwacht`, met de afwijkingen uit `rapport` eroverheen. */
function accountantUitFixture(f: Fixture): AccountantRegels {
  const uit: AccountantRegels = {}
  for (const id of ['A', 'B'] as const) {
    const bron = { ...(f.verwacht?.[id] ?? {}), ...(f.rapport?.[id] ?? {}) }
    const regels: Record<string, number> = {}
    for (const [regel, veld] of Object.entries(ACCOUNTANT_VELDEN)) {
      const v = bron[veld]
      if (typeof v === 'number' && Number.isFinite(v)) regels[regel] = v
    }
    if (Object.keys(regels).length > 0) uit[id] = regels
  }
  return uit
}

function optie(argv: string[], naam: string): string | undefined {
  const i = argv.indexOf(`--${naam}`)
  return i >= 0 ? argv[i + 1] : undefined
}

async function main() {
  const argv = process.argv.slice(2)
  const datum = optie(argv, 'datum')
  const doel = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--datum')
  if (!doel) {
    console.error('Gebruik: npm run rapport:voorbeeld -- <map> [--datum 2026-10-04]')
    process.exit(1)
  }
  if (datum !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    console.error('--datum verwacht een datum als 2026-10-04.')
    process.exit(1)
  }
  const vandaag = datum ?? lokaalTijdstip(new Date())
  const pakket = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
  const toolVersie = toolVersieTekst(pakket.version, process.env.GIT_SHA)

  let aantal = 0
  for (const bron of [...VOORBEELDEN, ...priveBronnen()]) {
    const pad = join(ROOT, bron.pad)
    if (!existsSync(pad)) {
      console.log(`${bron.map}: overgeslagen, ${bron.pad} bestaat niet`)
      continue
    }
    const fixture = JSON.parse(readFileSync(pad, 'utf8')) as Partial<Fixture>
    if (!fixture.invoer) {
      console.log(`${bron.map}: overgeslagen, ${bron.pad} heeft geen invoer`)
      continue
    }
    const invoer = fixture.invoer
    const resultaat = berekenHuishouden(invoer, { variant: invoer.variant })
    const params = getJaar(invoer.jaar, invoer.variant)
    const naam = (id: PersoonId) => invoer.personen.find((p) => p.id === id)?.naam?.trim() || `Persoon ${id}`
    const keuzes: RapportKeuze[] = invoer.personen.length > 1 ? ['A', 'beide'] : ['A']
    const map = join(resolve(doel), bron.map)
    mkdirSync(map, { recursive: true })

    for (const keuze of keuzes) {
      const docs = bouwRapporten(invoer, resultaat, params, keuze, {
        vandaag,
        dossierStatus: 'concept',
        accountant: accountantUitFixture(fixture as Fixture),
        toolVersie,
        naam,
      })
      const namen = docs.map((d) => d.naam)
      const pdf = join(map, rapportBestandsnaam(invoer.jaar, namen, 'pdf'))
      const xlsx = join(map, rapportBestandsnaam(invoer.jaar, namen, 'xlsx'))
      writeFileSync(pdf, await rapportPdfBytes(docs))
      // Zelfde invoer als de exportpagina: bij één persoon niet de persoonlijke invoer van de ander.
      writeFileSync(xlsx, await rapportXlsxBytes(docs, { invoer: rapportInvoer(invoer, resultaat, keuze) }))
      aantal += 2
      console.log(`${bron.map}: ${pdf}`)
      console.log(`${bron.map}: ${xlsx}`)
    }
  }
  console.log(`${aantal} bestanden geschreven.`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
