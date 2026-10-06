/**
 * Notatie van het fiscaal rapport (spec 1.11): hele euro's met een punt als duizendtalscheiding, een minteken
 * direct voor het getal, geen euroteken in tabellen; percentages met een komma; datums kort (dd-mm-jjjj) en
 * lang ('21 juni 2023').
 *
 * Het accountantspakket schrijft op één plek '20.00 %' (punt, spatie). Dat nemen we niet over: overal een komma.
 */

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** Hele euro's: 127935 wordt '127.935', -13260 wordt '-13.260', 0 wordt '0' (nooit '-0'). */
export function bedrag(n: number): string {
  const r = Math.round(n) + 0
  const abs = Math.abs(r)
  const tekst = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return r < 0 ? `-${tekst}` : tekst
}

/** Bedrag in lopende tekst (meldingen, verantwoording): '€ 1.234', negatief '-€ 1.234'. Tabellen houden bedrag(). */
export function euro(n: number): string {
  const r = Math.round(n) + 0
  return r < 0 ? `-€ ${bedrag(-r)}` : `€ ${bedrag(r)}`
}

/**
 * Varianten van een percentage:
 *  - 'label'  '9,32%'   in rekenregels in een label en bij investeringsaftrek ('100,00%'), twee decimalen;
 *  - 'tabel'  '1,44 %'  in de box 3-rendementstabel (spatie voor het procentteken);
 *  - 'geheel' '100%'    zonder decimalen (eigendomsdeel eigen woning).
 */
export type PercentageVariant = 'label' | 'tabel' | 'geheel'

/** Percentage uit een fractie: 0.0932 wordt '9,32%'. Met `decimalen` een ander aantal decimalen ('1,898%' in het schijvenstelsel). */
export function percentage(fractie: number, variant: PercentageVariant = 'label', decimalen: number = variant === 'geheel' ? 0 : 2): string {
  const waarde = Math.round(fractie * 100 * 10 ** decimalen) / 10 ** decimalen + 0
  const [heel, deel] = Math.abs(waarde).toFixed(decimalen).split('.')
  const heelMetPunten = heel.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const getal = `${waarde < 0 ? '-' : ''}${heelMetPunten}${deel !== undefined ? `,${deel}` : ''}`
  return variant === 'tabel' ? `${getal} %` : `${getal}%`
}

function delen(iso: string): { j: string; m: string; d: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? { j: m[1], m: m[2], d: m[3] } : null
}

/** '2024-03-14' wordt '14-03-2024'. Andere tekst blijft ongewijzigd. */
export function datumKort(iso: string): string {
  const x = delen(iso)
  return x ? `${x.d}-${x.m}-${x.j}` : iso
}

/** '2023-06-21' wordt '21 juni 2023'. Andere tekst blijft ongewijzigd. */
export function datumLang(iso: string): string {
  const x = delen(iso)
  return x ? `${Number(x.d)} ${MAANDEN[Number(x.m) - 1]} ${x.j}` : iso
}

/** Dag en maand: '2024-01-01' wordt '01-01'. */
export function dagMaand(iso: string): string {
  const x = delen(iso)
  return x ? `${x.d}-${x.m}` : iso
}

/** Periode binnen een jaar: '01-01 t/m 31-12'. */
export function periode(van: string, tot: string): string {
  return `${dagMaand(van)} t/m ${dagMaand(tot)}`
}

const TELWOORDEN = ['nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf']

/** Klein getal als woord ('drie'); boven twaalf als cijfer. */
export function telwoord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < TELWOORDEN.length ? TELWOORDEN[n] : String(n)
}
