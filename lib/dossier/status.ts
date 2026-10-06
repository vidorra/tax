/** Status van een dossierjaar (los van de status van de belastingparameters). */
export const DOSSIER_STATUSSEN = ['concept', 'gecontroleerd', 'ingediend'] as const
export type DossierStatus = (typeof DOSSIER_STATUSSEN)[number]

export const DOSSIER_STATUS_INFO: Record<DossierStatus, { label: string; uitleg: string }> = {
  concept: { label: 'Concept', uitleg: 'Nog in bewerking.' },
  gecontroleerd: { label: 'Gecontroleerd', uitleg: 'Nagekeken, klaar om in te dienen.' },
  ingediend: { label: 'Ingediend', uitleg: 'De aangifte is verstuurd.' },
}

export function isDossierStatus(x: unknown): x is DossierStatus {
  return typeof x === 'string' && (DOSSIER_STATUSSEN as readonly string[]).includes(x)
}
