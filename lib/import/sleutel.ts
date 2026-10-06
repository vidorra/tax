/**
 * Ronde 2 (A4): de rekeningsleutel in `PositieHerkomst.sleutel`. Twee bezittingen van dezelfde rekening (effecten en
 * geld) en een tweede import van die rekening hebben dezelfde sleutel, zonder dat het rekeningnummer in het dossier staat.
 *
 *   sleutel = familie + ':' + hex(HMAC-SHA256(geheim, normaliseer(rekeningnummer))).slice(0, 16)
 *
 * `geheim` is per huishouden en komt van de server (GET /api/dossier/import/sleutel: HMAC van de dossiersleutel met
 * 'rekeningsleutel:<householdId>'); zonder dat geheim is het nummer er niet uit terug te vinden, ook niet door alle
 * nummers te proberen. Een rekening zonder nummer krijgt een willekeurige id (`familie:r-xxxxxxxx`). Puur: SubtleCrypto
 * (browser en Node 20), het geheim komt als argument binnen.
 */

/** Wat in de sleutel voor de dubbele punt staat: dezelfde broker, ook bij twee formaten (DEGIRO rekening en portefeuille). */
export const SLEUTEL_PATROON = /^[a-z0-9-]+:([0-9a-f]{16}|r-[a-z0-9]{8})$/

/** Hoofdletters, alleen letters en cijfers: "NL12 RABO 0123 4567 89" en "nl12rabo0123456789" zijn hetzelfde nummer. */
export function normaliseerNummer(nummer: string): string {
  return nummer.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function base64urlNaarBytes(b64: string): Uint8Array {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const vol = s + '==='.slice((s.length + 3) % 4)
  const bin = atob(vol)
  const uit = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i)
  return uit
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Rekeningsleutel met HMAC-SHA256; `geheim` is base64url zoals de server het geeft. */
export async function rekeningSleutel(familie: string, rekeningnummer: string, geheim: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('SubtleCrypto ontbreekt')
  const sleutel = await subtle.importKey('raw', base64urlNaarBytes(geheim) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await subtle.sign('HMAC', sleutel, new TextEncoder().encode(normaliseerNummer(rekeningnummer)) as BufferSource)
  return `${familie}:${hex(mac).slice(0, 16)}`
}

/**
 * Sleutel voor een rekening zonder nummer ("Nieuwe rekening"). `willekeurig` geeft acht tekens [a-z0-9]; standaard uit
 * crypto.getRandomValues. Zo blijft de functie testbaar.
 */
export function nieuweRekeningSleutel(familie: string, willekeurig: () => string = willekeurigeTekens): string {
  const r = willekeurig().toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(8, '0').slice(0, 8)
  return `${familie}:r-${r}`
}

function willekeurigeTekens(): string {
  const bytes = new Uint8Array(8)
  globalThis.crypto.getRandomValues(bytes)
  const tekens = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return [...bytes].map((b) => tekens[b % tekens.length]).join('')
}

/** De familie (broker) uit een sleutel: 'degiro:ab12…' geeft 'degiro'. */
export function familieUitSleutel(sleutel: string): string {
  return sleutel.split(':')[0] ?? ''
}
