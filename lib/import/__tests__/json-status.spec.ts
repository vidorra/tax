/**
 * Review ronde 2, bevindingen 14 en 15: de status van een jaar bij de JSON-import (Ingediend uit het dossier blijft) en
 * de vaste regel met Ongedaan maken op het overzicht.
 */
import { describe, expect, it } from 'vitest'
import { herstelpuntTekst, statusNaImport, statusOpmerking } from '../json-keuzes'
import { importMelding } from '@/lib/dossier/import-opslag'

describe('status na de import', () => {
  it('Ingediend uit het dossier of het bestand blijft; Gecontroleerd wordt Concept', () => {
    expect(statusNaImport('concept', 'ingediend')).toBe('ingediend')
    expect(statusNaImport('gecontroleerd', 'ingediend')).toBe('ingediend')
    expect(statusNaImport('ingediend', 'concept')).toBe('ingediend')
    expect(statusNaImport('gecontroleerd', 'concept')).toBe('concept')
    expect(statusNaImport('concept', 'gecontroleerd')).toBe('concept')
    expect(statusNaImport(undefined)).toBe('concept')
  })

  it('het paneel zegt vóór bevestigen wat er met de status gebeurt', () => {
    expect(statusOpmerking(2024, 'vervangen', 'concept', 'ingediend')).toBe('2024 staat in je dossier op Ingediend en blijft daarop staan. De indiendatum blijft bewaard.')
    expect(statusOpmerking(2024, 'vervangen', 'concept', 'gecontroleerd')).toBe('Na vervangen staat 2024 op Concept in plaats van Gecontroleerd.')
    expect(statusOpmerking(2024, 'vervangen', 'ingediend', 'concept')).toBe('Na vervangen staat 2024 op Ingediend, zoals in het bestand.')
    expect(statusOpmerking(2024, 'vervangen', 'concept', 'concept')).toBeNull()
    expect(statusOpmerking(2024, 'overslaan', 'concept', 'ingediend')).toBeNull()
    expect(statusOpmerking(2025, 'toevoegen', 'gecontroleerd', undefined)).toBe('2025 komt op Concept te staan: de controles kunnen met de huidige regels anders uitkomen.')
    expect(statusOpmerking(2025, 'toevoegen', 'ingediend', undefined)).toBe('2025 komt op Ingediend te staan, zoals in het bestand.')
  })

  it('de klaar-melding noemt de status uit het dossier', () => {
    expect(importMelding(2024, 'vervangen', 'concept', 'ingediend')).toBe('2024 is vervangen; de vorige versie is bewaard. Het blijft op Ingediend staan, want je had het al ingediend.')
    expect(importMelding(2024, 'vervangen', 'concept', 'gecontroleerd')).toBe('2024 is vervangen; de vorige versie is bewaard. Het stond op Gecontroleerd en staat nu op Concept, zoals in het bestand.')
    expect(importMelding(2024, 'vervangen', 'concept', 'concept')).toBe('2024 is vervangen; de vorige versie is bewaard.')
    expect(importMelding(2024, 'vervangen', 'ingediend', 'concept')).toBe('2024 is vervangen; de vorige versie is bewaard. Het staat op Ingediend, zoals in het bestand.')
  })
})

describe('vaste regel met Ongedaan maken', () => {
  it('noemt de datum, wat er veranderde en tot wanneer', () => {
    expect(herstelpuntTekst({ herstelpuntId: 3, aangemaakt: '2026-10-05', tot: '2026-11-04', vervangen: [2025], toegevoegd: [2024], gegevens: false })).toBe(
      'Import van 5 oktober 2026: 2025 vervangen en 2024 toegevoegd. Ongedaan maken kan tot 4 november 2026.',
    )
    expect(herstelpuntTekst({ herstelpuntId: 3, aangemaakt: '2026-10-05', tot: '2026-11-04', vervangen: [2023, 2024], toegevoegd: [], gegevens: true })).toBe(
      'Import van 5 oktober 2026: 2023 en 2024 vervangen en je persoonlijke gegevens vervangen. Ongedaan maken kan tot 4 november 2026.',
    )
  })
})
