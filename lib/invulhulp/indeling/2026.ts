/**
 * Ronde 2 (A1): verwachte volgorde van de online aangifte IB over 2026. Die aangifte bestaat nog niet (opent 1 maart
 * 2027); dit is 2025 met de verschillen die vaststaan uit het formulier voorlopige aanslag 2026 en de toelichting
 * (belastingdienst-volgorde.md, hoofdstuk 6): de vragen over 6 maanden in het huishouden en co-ouderschap bij de
 * kinderen, de minderjarige kinderen in de kop van de bezittingen en de nieuwe klasse bij het jaar van de lening.
 * Status 'verwacht': nakijken zodra het programma open is (open punt 15).
 */
import type { InvulhulpIndeling } from '../types'
import { basisSchermen } from './schermen'

const leningjaarKlassen = [
  { label: 'voor 2012', van: null, tot: 2011 },
  { label: '2012', van: 2012, tot: 2012 },
  { label: '2013 tot en met 2017', van: 2013, tot: 2017 },
  { label: '2018 tot en met 2025', van: 2018, tot: 2025 },
  { label: '2026', van: 2026, tot: null },
]

const indeling: InvulhulpIndeling = {
  aangiftejaar: 2026,
  status: 'verwacht',
  bron: {
    titel: 'Afgeleid van IH2025 met het formulier voorlopige aanslag 2026 (IB 651E) en de toelichting 2026; belastingdienst-volgorde.md hoofdstuk 6',
    url: 'https://opleiding-ola.belastingdienst.nl/ola-simulatie/casussen?0',
    datum: '2026-10-05',
  },
  opentOp: '03-01',
  leningjaarKlassen,
  schermen: basisSchermen({
    leningjaarKlassen,
    bezittingenKop: '<aangever>, <partner> en minderjarige kinderen',
    kinderenHuishoudenVragen: true,
    kinderenJarenTerug: 19,
  }),
}

export default indeling
