/**
 * Parametertabel voor de jaarpagina's: de belangrijkste cijfers van een jaar met
 * hun status, rechtstreeks uit de jaarparameters (geen eigen getallen).
 */
import type { BlokNaam, Status, TaxYearParams } from '@/lib/tax/types'
import { STATUS_RANG } from '@/lib/tax/types'
import { getJaar, veldStatus } from '@/lib/tax/years'

export interface ParameterRij {
  id: string
  groep: string
  label: string
  waarde: string
  status: Status
  /** Pad in de params, voor de liefhebber. */
  parameter: string
}

const eur = (n: number) => `€ ${Math.round(n).toLocaleString('nl-NL')}`
const pct = (f: number, decimalen = 2) => `${(f * 100).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: decimalen })}%`

function rij(p: TaxYearParams, groep: string, id: string, label: string, waarde: string, blok: BlokNaam, veld: string): ParameterRij {
  return { id, groep, label, waarde, status: veldStatus(p, blok, veld), parameter: `${blok}.${veld}` }
}

export function parameterRijen(p: TaxYearParams): ParameterRij[] {
  const b1 = p.box1.waarde
  const o = p.ondernemer.waarde
  const hk = p.heffingskortingen.waarde
  const z = p.zvw.waarde
  const b3 = p.box3.waarde
  const rijen: ParameterRij[] = []

  let vanaf = 0
  b1.schijven.forEach((s, i) => {
    const bereik = s.tot === null ? `vanaf ${eur(vanaf)}` : i === 0 ? `tot ${eur(s.tot)}` : `${eur(vanaf)} tot ${eur(s.tot)}`
    rijen.push(rij(p, 'Box 1', `schijf-${i + 1}`, `Schijf ${i + 1}, ${bereik}`, pct(s.tarief), 'box1', 'schijven'))
    if (s.tot !== null) vanaf = s.tot
  })
  if (b1.schijven.length >= 2) {
    const grens = b1.schijven[b1.schijven.length - 2].tot
    if (grens !== null) rijen.push(rij(p, 'Box 1', 'toptariefgrens', 'Grens toptarief', eur(grens), 'box1', 'schijven'))
  }

  rijen.push(rij(p, 'Ondernemer', 'zelfstandigenaftrek', 'Zelfstandigenaftrek', eur(o.zelfstandigenaftrek), 'ondernemer', 'zelfstandigenaftrek'))
  rijen.push(rij(p, 'Ondernemer', 'mkb', 'MKB-winstvrijstelling', pct(o.mkbWinstvrijstelling), 'ondernemer', 'mkbWinstvrijstelling'))

  rijen.push(rij(p, 'Heffingskortingen', 'ahk', 'Algemene heffingskorting, maximaal', eur(hk.algemeen.max), 'heffingskortingen', 'algemeen'))
  rijen.push(rij(p, 'Heffingskortingen', 'arbeidskorting', 'Arbeidskorting, maximaal', eur(hk.arbeid.max), 'heffingskortingen', 'arbeid'))
  rijen.push(rij(p, 'Heffingskortingen', 'iack', 'Combinatiekorting (IACK), maximaal', hk.iack.actief ? eur(hk.iack.max) : 'vervallen', 'heffingskortingen', 'iack'))

  rijen.push(rij(p, 'Zvw', 'zvw-pct', 'Zvw-bijdrage voor ondernemers', pct(z.pctOndernemer), 'zvw', 'pctOndernemer'))
  rijen.push(rij(p, 'Zvw', 'zvw-max', 'Maximum bijdrage-inkomen Zvw', eur(z.maxBijdrageInkomen), 'zvw', 'maxBijdrageInkomen'))

  rijen.push(rij(p, 'Box 3', 'box3-tarief', 'Tarief box 3', pct(b3.tarief), 'box3', 'tarief'))
  if (b3.regime === 'werkelijkRendement') {
    rijen.push({ id: 'box3-regime', groep: 'Box 3', label: 'Stelsel', waarde: 'werkelijk rendement', status: veldStatus(p, 'box3', 'regime'), parameter: 'box3.regime' })
    if (b3.regime2028) rijen.push(rij(p, 'Box 3', 'box3-hvr', 'Heffingsvrij resultaat per persoon', eur(b3.regime2028.heffingsvrijResultaat), 'box3', 'regime2028'))
  } else {
    rijen.push(rij(p, 'Box 3', 'box3-hvv', 'Heffingsvrij vermogen per persoon', eur(b3.heffingsvrijVermogen), 'box3', 'heffingsvrijVermogen'))
    rijen.push(rij(p, 'Box 3', 'box3-bank', 'Forfait banktegoeden', pct(b3.forfaitBank), 'box3', 'forfaitBank'))
    rijen.push(rij(p, 'Box 3', 'box3-overig', 'Forfait overige bezittingen', pct(b3.forfaitOverig), 'box3', 'forfaitOverig'))
    rijen.push(rij(p, 'Box 3', 'box3-schulden', 'Forfait schulden', pct(b3.forfaitSchulden), 'box3', 'forfaitSchulden'))
  }
  return rijen
}

export interface VariantRij extends ParameterRij {
  varianten: Array<{ id: string; waarde: string; status: Status }>
}

/**
 * Rijen van de standaardset naast elke variant. Een waarde die de variant wijzigt
 * krijgt de status van de variant als die lager is.
 */
export function parameterRijenMetVarianten(jaar: number): { varianten: Array<{ id: string; label: string; status: Status }>; rijen: VariantRij[] } {
  const basis = getJaar(jaar)
  const basisRijen = parameterRijen(basis)
  const varianten = basis.varianten.map((v) => ({ id: v.id, label: v.label, status: v.status }))
  const perVariant = varianten.map((v) => ({ v, rijen: parameterRijen(getJaar(jaar, v.id)) }))
  const rijen = basisRijen.map((r) => ({
    ...r,
    varianten: perVariant.map(({ v, rijen: vr }) => {
      const andere = vr.find((x) => x.id === r.id)
      if (!andere) return { id: v.id, waarde: '–', status: v.status }
      const gewijzigd = andere.waarde !== r.waarde
      const status = gewijzigd && STATUS_RANG[v.status] < STATUS_RANG[andere.status] ? v.status : andere.status
      return { id: v.id, waarde: andere.waarde, status }
    }),
  }))
  return { varianten, rijen }
}
