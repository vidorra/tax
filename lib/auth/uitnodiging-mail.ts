/**
 * De mail bij een uitnodiging of herstellink, en het versturen ervan. Gewone tekst, via de systeemmailer
 * (lib/mail: Resend of SMTP, dezelfde instellingen als de back-up). De link bevat het token achter een #.
 *
 * Uitnodiging (nieuw account, nog zonder gegevens): lukt mailen niet, dan krijgt de beheerder de link om zelf door te
 * sturen. Herstellink (bestaand account): alleen per mail naar het account zelf, nooit naar de beheerder. Anders zou een
 * beheerder met de link het account van een ander kunnen overnemen en diens dossier lezen. Lukt mailen niet, dan wordt
 * de herstellink meteen ingetrokken. Na een afgerond herstel krijgt het account een bevestiging.
 */
import { absoluteUrl, SITE } from '@/lib/site'
import { mailerSoort, verstuurMail } from '@/lib/mail'
import { markeerGemaild, trekIn, type NieuweUitnodiging } from './uitnodiging'

export const INSTELLEN_PAD = '/account/instellen/'

export function instelLink(token: string, basis?: string): string {
  return `${absoluteUrl(INSTELLEN_PAD, basis)}#${token}`
}

const DATUM = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function datumTijd(d: Date): string {
  const delen = DATUM.formatToParts(d)
  const w = (t: Intl.DateTimeFormatPartTypes) => delen.find((p) => p.type === t)?.value ?? ''
  return `${w('day')} ${w('month')} ${w('year')} om ${w('hour')}:${w('minute')}`
}

export function uitnodigingMail(u: Pick<NieuweUitnodiging, 'soort' | 'naam' | 'token' | 'verloopt'>, door: string | null, basis?: string): { onderwerp: string; tekst: string } {
  const aanhef = u.naam ? `Hoi ${u.naam},` : 'Hoi,'
  const link = instelLink(u.token, basis)
  const handleiding = absoluteUrl('/handleiding/', basis)
  const geldig = `De link werkt één keer en is geldig tot ${datumTijd(u.verloopt)}.`
  if (u.soort === 'herstel') {
    return {
      onderwerp: `Herstel je toegang tot de ${SITE.naam}`,
      tekst: [
        aanhef,
        '',
        `${door ?? 'De beheerder'} heeft een herstellink voor je account gemaakt. Daarmee kies je een nieuw wachtwoord en koppel je opnieuw een authenticator-app. Je dossier blijft zoals het is.`,
        '',
        link,
        '',
        `${geldig} Zodra je de nieuwe code hebt bevestigd, werken je oude wachtwoord en je oude app niet meer en word je op andere apparaten uitgelogd.`,
        '',
        'Heb je hier niet om gevraagd? Negeer deze mail dan en laat het de beheerder weten.',
      ].join('\n'),
    }
  }
  return {
    onderwerp: `Je account voor de ${SITE.naam}`,
    tekst: [
      aanhef,
      '',
      `${door ?? 'De beheerder'} heeft je uitgenodigd voor de ${SITE.naam}: een rekentool voor de aangifte inkomstenbelasting van zzp'ers en hun partner. Je dossier staat versleuteld opgeslagen en alleen jij ziet het.`,
      '',
      'Stel je account in via deze link:',
      link,
      '',
      `${geldig} Je kiest een wachtwoord en koppelt een authenticator-app (bijvoorbeeld Google Authenticator, Microsoft Authenticator of 1Password) voor de tweestapsverificatie.`,
      '',
      `Hoe je de tool instelt en gebruikt, lees je in de handleiding: ${handleiding}`,
      '',
      'Heb je deze mail niet verwacht? Dan kun je hem negeren.',
    ].join('\n'),
  }
}

export type VerzendUitkomst = { gemaild: true } | { gemaild: false; link: string; melding: string }

export const HERSTEL_ZONDER_MAILER = 'Een herstellink gaat alleen per mail naar het account zelf, en er is geen mailer ingesteld (RESEND_API_KEY of SMTP_* en MAIL_FROM).'

/** Verstuurt de mail bij een uitnodiging. Lukt dat niet (geen mailer of een fout), dan de link voor de beheerder, met de reden. */
export async function verstuurUitnodiging(u: NieuweUitnodiging, door: string | null): Promise<VerzendUitkomst> {
  if (u.soort !== 'uitnodiging') throw new Error('Een herstellink gaat via verstuurHerstel.')
  if (!mailerSoort()) {
    return { gemaild: false, link: instelLink(u.token), melding: 'Er is geen mailer ingesteld (RESEND_API_KEY of SMTP_* en MAIL_FROM). Stuur de link zelf door.' }
  }
  const { onderwerp, tekst } = uitnodigingMail(u, door)
  const r = await verstuurMail({ aan: u.email, onderwerp, tekst })
  if (!r.ok) return { gemaild: false, link: instelLink(u.token), melding: `De mail is niet verstuurd (${r.fout}). Stuur de link zelf door.` }
  await markeerGemaild(u.id)
  return { gemaild: true }
}

/**
 * Verstuurt de herstellink naar het account zelf. Lukt dat niet, dan wordt de herstellink ingetrokken en komt er een
 * melding terug; de link zelf gaat nooit naar de beheerder.
 */
export async function verstuurHerstel(u: NieuweUitnodiging, door: string | null): Promise<{ ok: true } | { ok: false; melding: string }> {
  if (u.soort !== 'herstel') throw new Error('Een uitnodiging gaat via verstuurUitnodiging.')
  if (!mailerSoort()) {
    await trekIn(u.id)
    return { ok: false, melding: HERSTEL_ZONDER_MAILER }
  }
  const { onderwerp, tekst } = uitnodigingMail(u, door)
  const r = await verstuurMail({ aan: u.email, onderwerp, tekst })
  if (!r.ok) {
    await trekIn(u.id)
    return { ok: false, melding: `De mail is niet verstuurd (${r.fout}). De herstellink is ingetrokken; probeer het later opnieuw.` }
  }
  await markeerGemaild(u.id)
  return { ok: true }
}

/** Bevestiging aan het account na een afgerond herstel. Lukt mailen niet, dan alleen een regel in de log. */
export async function meldHerstelAfgerond(email: string, nu: Date = new Date()): Promise<void> {
  if (!mailerSoort()) return
  const r = await verstuurMail({
    aan: email,
    onderwerp: `Je toegang tot de ${SITE.naam} is hersteld`,
    tekst: [
      'Hoi,',
      '',
      `Op ${datumTijd(nu)} is voor je account een nieuw wachtwoord en een nieuwe authenticator-app ingesteld met een herstellink. Op andere apparaten ben je uitgelogd.`,
      '',
      'Was jij dit niet? Neem dan meteen contact op met de beheerder.',
    ].join('\n'),
  })
  if (!r.ok) console.warn('[account/herstel] bevestigingsmail niet verstuurd')
}
