/**
 * Systeemmailer met de gangbare variabelen:
 *   Resend (voorkeur):  RESEND_API_KEY + MAIL_FROM [+ MAIL_REPLY_TO]
 *   SMTP (nodemailer):  SMTP_HOST, SMTP_PORT (standaard 587, secure bij 465), SMTP_USER, SMTP_PASS, MAIL_FROM [+ MAIL_REPLY_TO]
 * Zonder config doet hij niets en geeft hij { ok: false, fout: 'mailer niet geconfigureerd' }.
 *
 * Server-only. verstuurMail gooit nooit. Foutteksten bevatten nooit de API-sleutel, het
 * SMTP-wachtwoord of een volledig mailadres: die worden vervangen door '***' of gemaskeerd.
 * nodemailer wordt alleen in het SMTP-pad geladen (dynamische import).
 *
 * Voor tests: zetResendFetch() en zetSmtpTransport(); RESEND_API_BASE mag naar een nep-Resend op
 * localhost wijzen (zie resendBasis).
 */

export interface MailBijlage {
  bestandsnaam: string
  inhoud: Buffer
  /** MIME-type, bijvoorbeeld 'application/octet-stream'. Zonder type leidt de mailer het af van de naam. */
  type?: string
}

export interface MailBericht {
  aan: string
  onderwerp: string
  tekst: string
  bijlagen?: MailBijlage[]
}

export type MailUitkomst = { ok: true; id?: string } | { ok: false; fout: string }

type Omgeving = Record<string, string | undefined>

export const RESEND_BASIS = 'https://api.resend.com'
export const MAIL_TIMEOUT_MS = 30_000
/** Maximale lengte van de response-body van Resend in een foutmelding. */
export const RESEND_FOUT_MAX = 240
/** Maximale lengte van een foutmelding van de mailer. */
export const MAIL_FOUT_MAX = 300

const SMTP_STANDAARD_POORT = 587
const ONTBREEKT_TRANSPORT = 'RESEND_API_KEY of SMTP_HOST, SMTP_USER en SMTP_PASS'

type ResendConfig = { soort: 'resend'; sleutel: string; van: string; antwoordAan: string }
type SmtpConfig = {
  soort: 'smtp'
  host: string
  poort: number
  secure: boolean
  gebruiker: string
  wachtwoord: string
  van: string
  antwoordAan: string
}

type SmtpTransport = { sendMail(m: Record<string, unknown>): Promise<unknown> }
type SmtpMaker = (opties: Record<string, unknown>) => SmtpTransport

let resendFetchOverride: typeof fetch | null = null
let smtpTransportOverride: SmtpMaker | null = null

/** Vervangt fetch voor Resend (tests). null zet de echte fetch terug. */
export function zetResendFetch(f: typeof fetch | null): void {
  resendFetchOverride = f
}

/** Vervangt nodemailer.createTransport (tests). null zet nodemailer terug. */
export function zetSmtpTransport(maak: SmtpMaker | null): void {
  smtpTransportOverride = maak
}

function waarde(env: Omgeving, naam: string): string {
  const v = env[naam]
  return typeof v === 'string' ? v.trim() : ''
}

function smtpPoort(env: Omgeving): number {
  const p = Number(waarde(env, 'SMTP_PORT'))
  return Number.isInteger(p) && p > 0 && p <= 65535 ? p : SMTP_STANDAARD_POORT
}

function leesConfig(env: Omgeving): ResendConfig | SmtpConfig | null {
  const van = waarde(env, 'MAIL_FROM')
  if (!van) return null
  const antwoordAan = waarde(env, 'MAIL_REPLY_TO') || van
  const sleutel = waarde(env, 'RESEND_API_KEY')
  if (sleutel) return { soort: 'resend', sleutel, van, antwoordAan }
  const host = waarde(env, 'SMTP_HOST')
  const gebruiker = waarde(env, 'SMTP_USER')
  const wachtwoord = waarde(env, 'SMTP_PASS')
  if (host && gebruiker && wachtwoord) {
    const poort = smtpPoort(env)
    return { soort: 'smtp', host, poort, secure: poort === 465, gebruiker, wachtwoord, van, antwoordAan }
  }
  return null
}

/** Welke backend er gebruikt wordt: Resend heeft voorrang op SMTP. null zonder complete config. */
export function mailerSoort(env: Omgeving = process.env): 'resend' | 'smtp' | null {
  return leesConfig(env)?.soort ?? null
}

/**
 * Namen van ontbrekende variabelen; leeg als er een complete Resend- of SMTP-config is.
 * Is er geen RESEND_API_KEY maar wel een deel van de SMTP-variabelen, dan staan de ontbrekende
 * SMTP-variabelen er los in (bijvoorbeeld 'SMTP_PASS'), want dan is voor SMTP gekozen.
 */
export function ontbrekendeMailVariabelen(env: Omgeving = process.env): string[] {
  if (leesConfig(env)) return []
  const ontbreekt: string[] = []
  if (!waarde(env, 'MAIL_FROM')) ontbreekt.push('MAIL_FROM')
  if (waarde(env, 'RESEND_API_KEY')) return ontbreekt
  const smtp = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']
  const aanwezig = smtp.filter((n) => waarde(env, n))
  if (aanwezig.length === smtp.length) return ontbreekt
  if (aanwezig.length === 0) ontbreekt.push(ONTBREEKT_TRANSPORT)
  else ontbreekt.push(...smtp.filter((n) => !waarde(env, n)))
  return ontbreekt
}

/**
 * API-basis van Resend. Alleen voor end-to-end-tests mag RESEND_API_BASE naar een nep-Resend op
 * localhost wijzen (http://127.0.0.1:<poort> of http://localhost:<poort>); elk ander adres wordt
 * genegeerd, zodat de API-sleutel nooit naar een ander adres kan lekken.
 */
export function resendBasis(env: Omgeving = process.env): string {
  const o = waarde(env, 'RESEND_API_BASE').replace(/\/$/, '')
  if (o && /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?$/.test(o)) return o
  return RESEND_BASIS
}

const ADRES =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

/** Eén kaal mailadres: geen naam ervoor, geen spaties, regeleinden of komma's, domein met een punt. */
export function geldigAdres(s: string): boolean {
  if (typeof s !== 'string' || s.length > 254) return false
  if (!ADRES.test(s)) return false
  const lokaal = s.slice(0, s.lastIndexOf('@'))
  return lokaal.length <= 64 && !lokaal.startsWith('.') && !lokaal.endsWith('.') && !lokaal.includes('..')
}

/** 'jan@example.nl' wordt 'j•••@example.nl'. Zonder '@' alleen '•••'. */
export function maskeerAdres(adres: string): string {
  const s = typeof adres === 'string' ? adres.trim() : ''
  const i = s.lastIndexOf('@')
  if (i < 0) return '•••'
  const eerste = Array.from(s.slice(0, i))[0] ?? ''
  const domein = s.slice(i + 1).replace(/[\s\x00-\x1f\x7f]/g, '')
  return `${eerste}•••@${domein}`
}

const ADRES_IN_TEKST = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g

function geheimen(env: Omgeving): string[] {
  const lijst: string[] = []
  for (const naam of ['RESEND_API_KEY', 'SMTP_PASS']) {
    const ruw = env[naam]
    if (typeof ruw !== 'string') continue
    for (const v of [ruw, ruw.trim()]) {
      if (!v) continue
      lijst.push(v, Buffer.from(v).toString('base64'))
    }
  }
  return [...new Set(lijst)].sort((a, b) => b.length - a.length)
}

/**
 * Haalt geheimen en volledige mailadressen uit een foutmelding: RESEND_API_KEY en SMTP_PASS (ook in
 * base64) worden '***', mailadressen worden gemaskeerd. Kort af tot MAIL_FOUT_MAX tekens.
 */
export function maskeerFout(tekst: string, env: Omgeving = process.env): string {
  const s = maskeer(tekst, env)
  return s.length > MAIL_FOUT_MAX ? `${s.slice(0, MAIL_FOUT_MAX - 1)}…` : s
}

function maskeer(tekst: string, env: Omgeving): string {
  let s = String(tekst ?? '')
  for (const g of geheimen(env)) s = s.split(g).join('***')
  return s.replace(ADRES_IN_TEKST, (m) => maskeerAdres(m)).replace(/[\r\n]+/g, ' ')
}

function heeftRegeleinde(s: string): boolean {
  return /[\r\n]/.test(s)
}

type Gecontroleerd = { ok: true; aan: string } | { ok: false; fout: string }

function controleer(b: MailBericht, cfg: ResendConfig | SmtpConfig | null): Gecontroleerd {
  if (!b || typeof b !== 'object') return { ok: false, fout: 'geen bericht' }
  if (typeof b.aan !== 'string' || typeof b.onderwerp !== 'string' || typeof b.tekst !== 'string') {
    return { ok: false, fout: 'bericht onvolledig: aan, onderwerp en tekst zijn verplicht' }
  }
  if (heeftRegeleinde(b.aan)) return { ok: false, fout: 'ontvangstadres bevat een regeleinde' }
  if (heeftRegeleinde(b.onderwerp)) return { ok: false, fout: 'onderwerp bevat een regeleinde' }
  const aan = b.aan.trim()
  if (!geldigAdres(aan)) return { ok: false, fout: 'ongeldig ontvangstadres' }
  if (b.bijlagen !== undefined) {
    if (!Array.isArray(b.bijlagen)) return { ok: false, fout: 'bijlagen moeten een lijst zijn' }
    for (const bijlage of b.bijlagen) {
      if (!bijlage || typeof bijlage.bestandsnaam !== 'string' || !bijlage.bestandsnaam.trim() || /[\r\n\0"\\/]/.test(bijlage.bestandsnaam)) {
        return { ok: false, fout: 'ongeldige bestandsnaam van een bijlage' }
      }
      if (!Buffer.isBuffer(bijlage.inhoud)) return { ok: false, fout: 'bijlage zonder inhoud' }
      if (bijlage.type !== undefined && (typeof bijlage.type !== 'string' || heeftRegeleinde(bijlage.type))) {
        return { ok: false, fout: 'ongeldig type van een bijlage' }
      }
    }
  }
  if (cfg && (heeftRegeleinde(cfg.van) || heeftRegeleinde(cfg.antwoordAan))) {
    return { ok: false, fout: 'MAIL_FROM of MAIL_REPLY_TO bevat een regeleinde' }
  }
  return { ok: true, aan }
}

function oorzaak(e: unknown): string {
  if (!(e instanceof Error)) return 'onbekende fout'
  const c = (e as Error & { cause?: unknown }).cause
  const code = c && typeof c === 'object' && 'code' in c && typeof (c as { code: unknown }).code === 'string' ? (c as { code: string }).code : ''
  return code ? `${e.message} (${code})` : e.message
}

async function viaResend(c: ResendConfig, aan: string, b: MailBericht, env: Omgeving): Promise<MailUitkomst> {
  const f = resendFetchOverride ?? fetch
  const bijlagen = b.bijlagen ?? []
  const body: Record<string, unknown> = {
    from: c.van,
    to: [aan],
    subject: b.onderwerp,
    text: b.tekst,
    reply_to: c.antwoordAan,
  }
  if (bijlagen.length) {
    body.attachments = bijlagen.map((a) => ({
      filename: a.bestandsnaam,
      content: a.inhoud.toString('base64'),
      ...(a.type ? { content_type: a.type } : {}),
    }))
  }
  let res: Response
  try {
    res = await f(`${resendBasis(env)}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.sleutel}`, 'content-type': 'application/json', 'user-agent': 'ibcalculator' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    })
  } catch (e) {
    const naam = e && typeof e === 'object' ? (e as { name?: unknown }).name : undefined
    if (naam === 'TimeoutError' || naam === 'AbortError') {
      return { ok: false, fout: `resend: geen antwoord binnen ${MAIL_TIMEOUT_MS / 1000} seconden` }
    }
    return { ok: false, fout: maskeerFout(`resend: ${oorzaak(e)}`, env) }
  }
  const tekst = await res.text().catch(() => '')
  if (!res.ok) {
    return { ok: false, fout: maskeerFout(`resend ${res.status}: ${maskeer(tekst, env).slice(0, RESEND_FOUT_MAX)}`, env) }
  }
  let id: string | undefined
  try {
    const data: unknown = JSON.parse(tekst)
    if (data && typeof data === 'object' && typeof (data as { id?: unknown }).id === 'string') id = (data as { id: string }).id
  } catch {
    /* geen JSON: verstuurd zonder id */
  }
  return id ? { ok: true, id } : { ok: true }
}

async function maakSmtpTransport(opties: Record<string, unknown>): Promise<SmtpTransport> {
  if (smtpTransportOverride) return smtpTransportOverride(opties)
  const nm = await import('nodemailer')
  const createTransport = nm.createTransport ?? nm.default.createTransport
  return createTransport(opties as import('nodemailer/lib/smtp-transport').Options) as unknown as SmtpTransport
}

/** Loopbackadres: verkeer blijft op de eigen machine. */
export function isLoopback(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
}

async function viaSmtp(c: SmtpConfig, aan: string, b: MailBericht, env: Omgeving): Promise<MailUitkomst> {
  let transport: SmtpTransport | null = null
  try {
    transport = await maakSmtpTransport({
      host: c.host,
      port: c.poort,
      secure: c.secure,
      // Zonder impliciete TLS (465) is STARTTLS verplicht: anders gaan wachtwoord en bericht leesbaar over de lijn
      // bij een server die STARTTLS niet aanbiedt of bij een downgrade onderweg. Een mailserver op dezelfde
      // machine (loopback) is de uitzondering: dat verkeer verlaat de machine niet.
      requireTLS: !c.secure && !isLoopback(c.host),
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: c.gebruiker, pass: c.wachtwoord },
      connectionTimeout: MAIL_TIMEOUT_MS,
      greetingTimeout: MAIL_TIMEOUT_MS,
      socketTimeout: 2 * MAIL_TIMEOUT_MS,
    })
    const info = await transport.sendMail({
      from: c.van,
      to: aan,
      subject: b.onderwerp,
      text: b.tekst,
      replyTo: c.antwoordAan,
      attachments: (b.bijlagen ?? []).map((a) => ({
        filename: a.bestandsnaam,
        content: a.inhoud,
        ...(a.type ? { contentType: a.type } : {}),
      })),
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    const id = info && typeof info === 'object' && typeof (info as { messageId?: unknown }).messageId === 'string'
      ? (info as { messageId: string }).messageId
      : undefined
    return id ? { ok: true, id } : { ok: true }
  } catch (e) {
    const code = e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : ''
    const melding = e instanceof Error ? e.message : 'onbekende fout'
    return { ok: false, fout: maskeerFout(`smtp${code ? ` ${code}` : ''}: ${melding}`, env) }
  } finally {
    const sluit = (transport as { close?: unknown } | null)?.close
    if (typeof sluit === 'function') {
      try {
        sluit.call(transport)
      } catch {
        /* sluiten mag niets breken */
      }
    }
  }
}

/** Verstuurt één bericht via Resend of SMTP. Gooit nooit; de foutmelding bevat geen geheimen. */
export async function verstuurMail(b: MailBericht, env: Omgeving = process.env): Promise<MailUitkomst> {
  try {
    const cfg = leesConfig(env)
    const check = controleer(b, cfg)
    if (!check.ok) return check
    if (!cfg) return { ok: false, fout: 'mailer niet geconfigureerd' }
    if (cfg.soort === 'resend') return await viaResend(cfg, check.aan, b, env)
    return await viaSmtp(cfg, check.aan, b, env)
  } catch (e) {
    return { ok: false, fout: maskeerFout(`mailfout: ${e instanceof Error ? e.message : 'onbekend'}`, env) }
  }
}
