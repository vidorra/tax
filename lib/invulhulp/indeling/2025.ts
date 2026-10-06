/**
 * Ronde 2 (A1): volgorde en woorden van de online aangifte IB over 2025 (IH2025), nagekeken in de Online Aangifte
 * Simulatie van de Belastingdienst op 5 oktober 2026 (ronde2/belastingdienst-volgorde.md, hoofdstuk 2 en 5).
 * Verandert het programma, dan verandert dit bestand (of de gedeelde opbouw in schermen.ts).
 */
import type { InvulhulpIndeling } from '../types'
import { basisSchermen } from './schermen'

const leningjaarKlassen = [
  { label: 'voor 2012', van: null, tot: 2011 },
  { label: '2012', van: 2012, tot: 2012 },
  { label: '2013 tot en met 2017', van: 2013, tot: 2017 },
  { label: '2018 tot en met 2024', van: 2018, tot: 2024 },
  { label: '2025', van: 2025, tot: null },
]

const indeling: InvulhulpIndeling = {
  aangiftejaar: 2025,
  status: 'nagekeken',
  nagekekenOp: '2026-10-05',
  bron: {
    titel: 'Online Aangifte Simulatie, formulier IH2025 (IB 650E); belastingdienst-volgorde.md',
    url: 'https://opleiding-ola.belastingdienst.nl/ola-simulatie/casussen?0',
    datum: '2026-10-05',
  },
  opentOp: '03-01',
  leningjaarKlassen,
  schermen: basisSchermen({
    leningjaarKlassen,
    bezittingenKop: '<aangever> en <partner>',
    kinderenHuishoudenVragen: false,
    kinderenJarenTerug: 19,
  }),
}

export default indeling
