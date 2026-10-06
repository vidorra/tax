/**
 * Ronde 2 (A4): alle presets en per broker de vaste gegevens (namen van de bezittingen, waar het geld staat, of de
 * aanbieder Nederlands is voor de vraag over de vooraf ingevulde aangifte, en waar je de standen vindt).
 *
 * Herkenning op de kopregel en de voorloopregels, niet op de bestandsnaam (broker-import.md 4.3). Niet herkend: de
 * generieke kolomkoppeling (lib/import/generiek.ts). De gebruiker kan altijd een ander formaat kiezen.
 */
import type { Box3Categorie } from '@/lib/tax/types'
import type { BrokerFormaat, CsvBestand, Preset } from '../types'
import { bitvavo } from './bitvavo'
import { bux } from './bux'
import { coinbase } from './coinbase'
import { degiroPortefeuille, degiroRekening } from './degiro'
import { ibkr } from './ibkr'
import { rabobank } from './rabobank'
import { saxo } from './saxo'
import { trading212 } from './trading212'

export const PRESETS: Preset[] = [degiroRekening, degiroPortefeuille, ibkr, trading212, saxo, bux, rabobank, bitvavo, coinbase]

/** Eerste preset die het bestand herkent, of null (dan de generieke koppeling). */
export function herkenPreset(bestand: CsvBestand): Preset | null {
  for (const p of PRESETS) {
    try {
      if (p.herken(bestand)) return p
    } catch {
      // Een preset die op een vreemd bestand struikelt, herkent het niet.
    }
  }
  return null
}

export function presetVan(formaat: BrokerFormaat): Preset | null {
  return PRESETS.find((p) => p.formaat === formaat) ?? null
}

export type BrokerFamilie = 'degiro' | 'ibkr' | 'trading212' | 'saxo' | 'bux' | 'rabobank' | 'bitvavo' | 'coinbase' | 'generiek'

export const FAMILIE: Record<BrokerFormaat, BrokerFamilie> = {
  'degiro-rekening': 'degiro',
  'degiro-portefeuille': 'degiro',
  'ibkr-activity': 'ibkr',
  trading212: 'trading212',
  saxo: 'saxo',
  bux: 'bux',
  rabobank: 'rabobank',
  bitvavo: 'bitvavo',
  coinbase: 'coinbase',
  generiek: 'generiek',
}

export interface BrokerInfo {
  /** Naam in de UI: "DEGIRO". */
  naam: string
  /** Omschrijving van een nieuwe bezitting per rol (geen rekeningnummer). */
  namen: { effecten: string; geld: string; crypto: string }
  /** Categorie van het geld als die vaststaat; null = de import vraagt "Staat het geld bij een bank?". */
  geldCategorie: Box3Categorie | null
  /** Categorie bij het antwoord Ja (een bank in Nederland of in het buitenland). */
  bankCategorie: 'bankNL' | 'bankBuitenland'
  /** Nederlandse aanbieder: vraag of de rekening al in de vooraf ingevulde aangifte staat. */
  nederlands: boolean
  /** Crypto-aanbieder: munten zijn een eigen bezitting. */
  crypto: boolean
  /** Waar de waarde op 31 december staat, voor de uitleg bij een ontbrekende stand. */
  standen: string
}

export const BROKERS: Record<BrokerFamilie, BrokerInfo> = {
  degiro: {
    naam: 'DEGIRO',
    namen: { effecten: 'DEGIRO effecten', geld: 'DEGIRO geldrekening (flatexDEGIRO Bank, Duitsland)', crypto: 'DEGIRO crypto' },
    geldCategorie: 'bankBuitenland',
    bankCategorie: 'bankBuitenland',
    nederlands: true,
    crypto: false,
    standen: 'Exporteer in DEGIRO je portefeuille op die datum (Portefeuille, Exporteren, datum kiezen) en lees dat bestand mee in, of neem het bedrag over uit je jaaroverzicht.',
  },
  ibkr: {
    naam: 'Interactive Brokers',
    namen: { effecten: 'Interactive Brokers effecten', geld: 'Interactive Brokers geld', crypto: 'Interactive Brokers crypto' },
    geldCategorie: null,
    bankCategorie: 'bankBuitenland',
    nederlands: false,
    crypto: false,
    standen: 'Staat in de Activity Statement over het jaar, bij Net Asset Value (Prior Total en Current Total).',
  },
  trading212: {
    naam: 'Trading 212',
    namen: { effecten: 'Trading 212 effecten', geld: 'Trading 212 geld', crypto: 'Trading 212 crypto' },
    geldCategorie: null,
    bankCategorie: 'bankBuitenland',
    nederlands: false,
    crypto: false,
    standen: 'Staat in het jaaroverzicht (PDF) van Trading 212. Een export van de geschiedenis heeft geen standen.',
  },
  saxo: {
    naam: 'Saxo',
    namen: { effecten: 'Saxo effecten', geld: 'Saxo geldrekening', crypto: 'Saxo crypto' },
    geldCategorie: 'bankBuitenland',
    bankCategorie: 'bankBuitenland',
    nederlands: true,
    crypto: false,
    standen: 'Staat in het Fiscaal Jaaroverzicht van Saxo (half februari), bij de beginwaarde en de eindwaarde.',
  },
  bux: {
    naam: 'BUX',
    namen: { effecten: 'BUX effecten', geld: 'BUX geld', crypto: 'BUX crypto' },
    geldCategorie: null,
    bankCategorie: 'bankNL',
    nederlands: true,
    crypto: false,
    standen: 'Staat in het fiscaal jaaroverzicht dat BUX in februari stuurt.',
  },
  rabobank: {
    naam: 'Rabobank',
    namen: { effecten: 'Rabobank beleggen', geld: 'Rabobank beleggersrekening', crypto: 'Rabobank crypto' },
    geldCategorie: 'bankNL',
    bankCategorie: 'bankNL',
    nederlands: true,
    crypto: false,
    standen: 'Staat in het Jaaroverzicht beleggingsportefeuille van Rabobank, bij de waarde van de effecten.',
  },
  bitvavo: {
    naam: 'Bitvavo',
    namen: { effecten: 'Bitvavo effecten', geld: 'Bitvavo euro-saldo', crypto: 'Bitvavo crypto' },
    geldCategorie: null,
    bankCategorie: 'bankNL',
    nederlands: true,
    crypto: true,
    standen: 'Staat in het belastingrapport van Bitvavo (stand op 1 januari), op de desktop bij Transactiegeschiedenis.',
  },
  coinbase: {
    naam: 'Coinbase',
    namen: { effecten: 'Coinbase effecten', geld: 'Coinbase euro-saldo', crypto: 'Coinbase crypto' },
    geldCategorie: null,
    bankCategorie: 'bankBuitenland',
    nederlands: false,
    crypto: true,
    standen: 'Zoek de waarde op die datum op in Coinbase (Reports & statements), of reken het aantal munten maal de koers.',
  },
  generiek: {
    naam: 'Rekening uit het bestand',
    namen: { effecten: 'Beleggingen uit bestand', geld: 'Geld uit bestand', crypto: 'Crypto uit bestand' },
    geldCategorie: null,
    bankCategorie: 'bankNL',
    nederlands: false,
    crypto: false,
    standen: 'Neem het bedrag over uit het jaaroverzicht van je bank of broker.',
  },
}

export function brokerVan(formaat: BrokerFormaat): BrokerInfo {
  return BROKERS[FAMILIE[formaat]]
}
