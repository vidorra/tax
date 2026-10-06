/**
 * Ronde 2 (A1): volgorde en woorden van de online aangifte IB over 2024 (IH2024), nagekeken in de Online Aangifte
 * Simulatie van de Belastingdienst op 5 oktober 2026. Gelijk aan 2025 (zelfde schermen, labels en veld-id's), met deze
 * verschillen (belastingdienst-volgorde.md, hoofdstuk 6): het werkelijk rendement in box 3 gaat met een apart formulier
 * (params: `box3.tegenbewijs.kanaal`), de kop van de bezittingen noemt de minderjarige kinderen, en de jaartallen in de
 * vragen schuiven een jaar op (plaatshouders in de labels).
 */
import type { InvulhulpIndeling } from '../types'
import { basisSchermen } from './schermen'

const leningjaarKlassen = [
  { label: 'voor 2012', van: null, tot: 2011 },
  { label: '2012', van: 2012, tot: 2012 },
  { label: '2013 tot en met 2017', van: 2013, tot: 2017 },
  { label: '2018 tot en met 2023', van: 2018, tot: 2023 },
  { label: '2024', van: 2024, tot: null },
]

const indeling: InvulhulpIndeling = {
  aangiftejaar: 2024,
  status: 'nagekeken',
  nagekekenOp: '2026-10-05',
  bron: {
    titel: 'Online Aangifte Simulatie, formulier IH2024 (IB 650E); belastingdienst-volgorde.md',
    url: 'https://opleiding-ola.belastingdienst.nl/ola-simulatie/casussen?0',
    datum: '2026-10-05',
  },
  opentOp: '03-01',
  leningjaarKlassen,
  schermen: basisSchermen({
    leningjaarKlassen,
    bezittingenKop: '<aangever>, <partner> en uw minderjarige kinderen',
    kinderenHuishoudenVragen: false,
    kinderenJarenTerug: 19,
  }),
}

export default indeling
