/**
 * Versleuteling van dossierinhoud op applicatieniveau.
 *
 * AES-256-GCM met een sleutel van 32 bytes uit DOSSIER_KEY (base64) en een willekeurige IV van
 * 12 bytes per bericht. De GCM-tag detecteert elke wijziging van de versleutelde tekst; ontsleutelen
 * gooit dan een fout. Alleen server-side gebruiken (node:crypto).
 *
 * Formaten, alle delen base64url:
 *  v2.<iv>.<tag>.<data>  met een context als AAD (bijvoorbeeld `dossier_years:<huishouden>:<jaar>`).
 *                        De context staat niet in de tekst; wie ontsleutelt, geeft dezelfde context mee.
 *                        Zo werkt een gekopieerde ciphertext niet in een andere rij of een ander huishouden.
 *  v1.<iv>.<tag>.<data>  zonder AAD (oude gegevens). Blijft leesbaar; bij de volgende opslag wordt
 *                        de rij als v2 herschreven.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSIE = 'v1'
const VERSIE_AAD = 'v2'
const IV_BYTES = 12
const TAG_BYTES = 16
const SLEUTEL_BYTES = 32

export class DossierSleutelFout extends Error {
  constructor(melding: string) {
    super(melding)
    this.name = 'DossierSleutelFout'
  }
}

/** Leest en controleert DOSSIER_KEY; gooit een duidelijke fout als die ontbreekt of niet klopt. */
export function dossierSleutel(bron: string | undefined = process.env.DOSSIER_KEY): Buffer {
  const ruw = bron?.trim()
  if (!ruw) throw new DossierSleutelFout('DOSSIER_KEY ontbreekt. Maak er een met: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"')
  const sleutel = Buffer.from(ruw, 'base64')
  if (sleutel.length !== SLEUTEL_BYTES) {
    throw new DossierSleutelFout(`DOSSIER_KEY moet ${SLEUTEL_BYTES} bytes zijn (base64), maar is ${sleutel.length} bytes.`)
  }
  return sleutel
}

/** true als DOSSIER_KEY aanwezig is en precies 32 bytes bevat. */
export function sleutelGeldig(bron: string | undefined = process.env.DOSSIER_KEY): boolean {
  try {
    dossierSleutel(bron)
    return true
  } catch {
    return false
  }
}

export class OntsleutelFout extends Error {
  constructor(melding: string) {
    super(melding)
    this.name = 'OntsleutelFout'
  }
}

/** Versleutelt als v2 met `context` als AAD, of als v1 zonder context. */
export function versleutel(obj: unknown, context?: string): string {
  const sleutel = dossierSleutel()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', sleutel, iv)
  if (context !== undefined) cipher.setAAD(Buffer.from(context, 'utf8'))
  const data = Buffer.concat([cipher.update(JSON.stringify(obj ?? null), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [context !== undefined ? VERSIE_AAD : VERSIE, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.')
}

/**
 * Ontsleutelt v1 (zonder AAD) en v2 (met AAD). Een v2-tekst vraagt dezelfde context als bij het
 * versleutelen; een andere of ontbrekende context geeft een OntsleutelFout.
 */
export function ontsleutel<T>(s: string, context?: string): T {
  const sleutel = dossierSleutel()
  const delen = typeof s === 'string' ? s.split('.') : []
  if (delen.length !== 4 || (delen[0] !== VERSIE && delen[0] !== VERSIE_AAD)) throw new OntsleutelFout('Versleutelde gegevens hebben een onbekend formaat.')
  const iv = Buffer.from(delen[1], 'base64url')
  const tag = Buffer.from(delen[2], 'base64url')
  const data = Buffer.from(delen[3], 'base64url')
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new OntsleutelFout('Versleutelde gegevens hebben een onbekend formaat.')
  if (delen[0] === VERSIE_AAD && context === undefined) throw new OntsleutelFout('Ontsleutelen mislukt: de context van deze gegevens ontbreekt.')
  try {
    const decipher = createDecipheriv('aes-256-gcm', sleutel, iv)
    if (delen[0] === VERSIE_AAD) decipher.setAAD(Buffer.from(context!, 'utf8'))
    decipher.setAuthTag(tag)
    const tekst = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    return JSON.parse(tekst) as T
  } catch {
    throw new OntsleutelFout('Ontsleutelen mislukt: de gegevens zijn gewijzigd of de DOSSIER_KEY klopt niet.')
  }
}

export function sha256(tekst: string): string {
  return createHash('sha256').update(tekst, 'utf8').digest('hex')
}

/** Hash van de parameters zonder functies (varianten hebben een `pas`-functie). */
export function paramsHash(params: unknown): string {
  return sha256(JSON.stringify(params, (_k, v: unknown) => (typeof v === 'function' ? undefined : v)))
}
