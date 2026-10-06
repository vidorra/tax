import { createServer, type Server, type Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  geldigAdres,
  mailerSoort,
  maskeerAdres,
  maskeerFout,
  MAIL_TIMEOUT_MS,
  ontbrekendeMailVariabelen,
  resendBasis,
  verstuurMail,
  zetResendFetch,
  zetSmtpTransport,
  type MailBericht,
  isLoopback,
} from '../index'

const SLEUTEL = 're_geheim_9f8e7d6c5b4a3210XYZ'
const WACHTWOORD = 'smtp-wachtwoord-Zx81!kq'
const RESEND = { RESEND_API_KEY: SLEUTEL, MAIL_FROM: 'noreply@example.nl' }
const SMTP = { SMTP_HOST: 'smtp.example.nl', SMTP_USER: 'backup@example.nl', SMTP_PASS: WACHTWOORD, MAIL_FROM: 'backup@example.nl' }

const bericht = (extra: Partial<MailBericht> = {}): MailBericht => ({
  aan: 'jan@example.nl',
  onderwerp: 'Back-up februari 2027',
  tekst: 'Je back-up staat in de bijlage.',
  ...extra,
})

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>

function nepFetch(antwoord: () => Response | Promise<Response>): FetchMock {
  const f = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => antwoord())
  zetResendFetch(f as unknown as typeof fetch)
  return f
}

function verzonden(f: FetchMock): { url: string; init: RequestInit; body: Record<string, unknown> } {
  const [url, init] = f.mock.calls[0]
  return { url, init: init ?? {}, body: JSON.parse(String(init?.body)) as Record<string, unknown> }
}

afterEach(() => {
  zetResendFetch(null)
  zetSmtpTransport(null)
})

describe('mailerSoort', () => {
  it('kiest Resend als sleutel en afzender er zijn, ook als SMTP compleet is', () => {
    expect(mailerSoort(RESEND)).toBe('resend')
    expect(mailerSoort({ ...SMTP, RESEND_API_KEY: SLEUTEL })).toBe('resend')
  })
  it('valt terug op SMTP en geeft null zonder complete config', () => {
    expect(mailerSoort(SMTP)).toBe('smtp')
    expect(mailerSoort({})).toBeNull()
    expect(mailerSoort({ RESEND_API_KEY: SLEUTEL })).toBeNull()
    expect(mailerSoort({ ...SMTP, SMTP_PASS: '   ' })).toBeNull()
  })
})

describe('ontbrekendeMailVariabelen', () => {
  const TRANSPORT = 'RESEND_API_KEY of SMTP_HOST, SMTP_USER en SMTP_PASS'
  it('is leeg bij een complete Resend- of SMTP-config', () => {
    expect(ontbrekendeMailVariabelen(RESEND)).toEqual([])
    expect(ontbrekendeMailVariabelen(SMTP)).toEqual([])
    expect(ontbrekendeMailVariabelen({ ...SMTP, RESEND_API_KEY: SLEUTEL })).toEqual([])
  })
  it('noemt afzender en transport als alles ontbreekt', () => {
    expect(ontbrekendeMailVariabelen({})).toEqual(['MAIL_FROM', TRANSPORT])
  })
  it('noemt alleen het transport als er wel een afzender is', () => {
    expect(ontbrekendeMailVariabelen({ MAIL_FROM: 'a@b.nl' })).toEqual([TRANSPORT])
  })
  it('noemt alleen MAIL_FROM als er een sleutel of complete SMTP is', () => {
    expect(ontbrekendeMailVariabelen({ RESEND_API_KEY: SLEUTEL })).toEqual(['MAIL_FROM'])
    expect(ontbrekendeMailVariabelen({ ...SMTP, MAIL_FROM: undefined })).toEqual(['MAIL_FROM'])
  })
  it('noemt bij een halve SMTP-config precies de ontbrekende SMTP-variabelen', () => {
    expect(ontbrekendeMailVariabelen({ ...SMTP, SMTP_PASS: undefined })).toEqual(['SMTP_PASS'])
    expect(ontbrekendeMailVariabelen({ SMTP_HOST: 'smtp.x.nl' })).toEqual(['MAIL_FROM', 'SMTP_USER', 'SMTP_PASS'])
  })
  it('telt lege of alleen-spaties-waarden als ontbrekend', () => {
    expect(ontbrekendeMailVariabelen({ MAIL_FROM: '  ', RESEND_API_KEY: ' ' })).toEqual(['MAIL_FROM', TRANSPORT])
  })
  it('SMTP_PORT is geen vereiste', () => {
    expect(ontbrekendeMailVariabelen({ ...SMTP, SMTP_PORT: undefined })).toEqual([])
  })
})

describe('geldigAdres', () => {
  it('accepteert gewone adressen', () => {
    for (const a of ['jan@example.nl', 'j.de-vries+backup@mail.example.co.uk', "o'brien@x.io"]) expect(geldigAdres(a)).toBe(true)
  })
  it('weigert lijsten, namen, spaties, regeleinden en rommel', () => {
    for (const a of [
      '',
      'jan',
      'jan@localhost',
      'jan@example.nl,piet@example.nl',
      'jan@example.nl; piet@example.nl',
      'Jan <jan@example.nl>',
      'jan @example.nl',
      ' jan@example.nl',
      'jan@example.nl\r\nBcc: x@evil.nl',
      'jan@example.nl\n',
      'jan@@example.nl',
      '.jan@example.nl',
      'jan..de@example.nl',
      'jan@-example.nl',
      `${'a'.repeat(65)}@example.nl`,
      `jan@${'a'.repeat(250)}.nl`,
    ]) {
      expect(geldigAdres(a), a).toBe(false)
    }
    expect(geldigAdres(undefined as unknown as string)).toBe(false)
  })
})

describe('maskeerAdres', () => {
  it('toont alleen de eerste letter en het domein', () => {
    expect(maskeerAdres('jan@example.nl')).toBe('j•••@example.nl')
    expect(maskeerAdres('  Voorbeeld.Persoon@example.invalid ')).toBe('V•••@example.invalid')
  })
  it('gaat netjes om met randgevallen', () => {
    expect(maskeerAdres('')).toBe('•••')
    expect(maskeerAdres('geen-adres')).toBe('•••')
    expect(maskeerAdres('@example.nl')).toBe('•••@example.nl')
    expect(maskeerAdres('a@b@example.nl')).toBe('a•••@example.nl')
    expect(maskeerAdres(null as unknown as string)).toBe('•••')
  })
})

describe('resendBasis', () => {
  it('is standaard de echte API', () => {
    expect(resendBasis({})).toBe('https://api.resend.com')
  })
  it('volgt RESEND_API_BASE alleen naar een http-loopbackadres', () => {
    expect(resendBasis({ RESEND_API_BASE: 'http://127.0.0.1:4010' })).toBe('http://127.0.0.1:4010')
    expect(resendBasis({ RESEND_API_BASE: 'http://localhost:4010/' })).toBe('http://localhost:4010')
  })
  it('negeert elk ander adres', () => {
    for (const o of [
      'https://127.0.0.1:4010',
      'http://evil.nl',
      'http://127.0.0.1.evil.nl:4010',
      'http://localhost@evil.nl',
      'http://127.0.0.1:4010@evil.nl',
      'http://127.0.0.1:4010/pad',
      'http://10.0.0.1:4010',
      'https://api.resend.com.evil.nl',
    ]) {
      expect(resendBasis({ RESEND_API_BASE: o }), o).toBe('https://api.resend.com')
    }
  })
})

describe('maskeerFout', () => {
  it('vervangt sleutel, wachtwoord (ook base64) en mailadressen', () => {
    const env = { RESEND_API_KEY: SLEUTEL, SMTP_PASS: WACHTWOORD }
    const b64 = Buffer.from(WACHTWOORD).toString('base64')
    const s = maskeerFout(`key ${SLEUTEL} pass ${WACHTWOORD} b64 ${b64} aan jan@example.nl\nregel 2`, env)
    expect(s).toBe('key *** pass *** b64 *** aan j•••@example.nl regel 2')
  })
  it('kort lange meldingen af', () => {
    expect(maskeerFout('x'.repeat(1000), {}).length).toBeLessThanOrEqual(300)
  })
})

describe('verstuurMail via Resend', () => {
  it('stuurt de juiste payload met base64-bijlage en reply_to', async () => {
    const f = nepFetch(() => json({ id: 'mail-123' }))
    const inhoud = Buffer.from([0, 1, 2, 250, 255, 128])
    const uit = await verstuurMail(
      bericht({ bijlagen: [{ bestandsnaam: 'ibcalculator-2027-02-01.ibcbak', inhoud, type: 'application/octet-stream' }] }),
      { ...RESEND, MAIL_REPLY_TO: 'antwoord@example.nl' },
    )
    expect(uit).toEqual({ ok: true, id: 'mail-123' })
    expect(f).toHaveBeenCalledTimes(1)
    const { url, init, body } = verzonden(f)
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    const h = new Headers(init.headers)
    expect(h.get('authorization')).toBe(`Bearer ${SLEUTEL}`)
    expect(h.get('content-type')).toBe('application/json')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(body).toEqual({
      from: 'noreply@example.nl',
      to: ['jan@example.nl'],
      subject: 'Back-up februari 2027',
      text: 'Je back-up staat in de bijlage.',
      reply_to: 'antwoord@example.nl',
      attachments: [{ filename: 'ibcalculator-2027-02-01.ibcbak', content: inhoud.toString('base64'), content_type: 'application/octet-stream' }],
    })
    expect(Buffer.from(String((body.attachments as Array<{ content: string }>)[0].content), 'base64').equals(inhoud)).toBe(true)
  })

  it('gebruikt MAIL_FROM als reply_to zonder MAIL_REPLY_TO en laat attachments weg zonder bijlagen', async () => {
    const f = nepFetch(() => json({ id: 'x' }))
    await verstuurMail(bericht(), RESEND)
    const { body } = verzonden(f)
    expect(body.reply_to).toBe('noreply@example.nl')
    expect('attachments' in body).toBe(false)
  })

  it('laat content_type weg als de bijlage geen type heeft', async () => {
    const f = nepFetch(() => json({ id: 'x' }))
    await verstuurMail(bericht({ bijlagen: [{ bestandsnaam: 'a.ibcbak', inhoud: Buffer.from('abc') }] }), RESEND)
    expect(verzonden(f).body.attachments).toEqual([{ filename: 'a.ibcbak', content: 'YWJj' }])
  })

  it('trimt het ontvangstadres', async () => {
    const f = nepFetch(() => json({ id: 'x' }))
    await verstuurMail(bericht({ aan: '  jan@example.nl ' }), RESEND)
    expect(verzonden(f).body.to).toEqual(['jan@example.nl'])
  })

  it('stuurt naar een nep-Resend op loopback als RESEND_API_BASE dat zegt', async () => {
    const f = nepFetch(() => json({ id: 'x' }))
    await verstuurMail(bericht(), { ...RESEND, RESEND_API_BASE: 'http://127.0.0.1:4010' })
    expect(verzonden(f).url).toBe('http://127.0.0.1:4010/emails')
  })

  it('geeft ok zonder id als de response geen JSON met id is', async () => {
    nepFetch(() => new Response('geaccepteerd', { status: 200 }))
    expect(await verstuurMail(bericht(), RESEND)).toEqual({ ok: true })
    nepFetch(() => json({ data: null }))
    expect(await verstuurMail(bericht(), RESEND)).toEqual({ ok: true })
  })

  it('zet een foutstatus om naar "resend <status>: <body>"', async () => {
    nepFetch(() => json({ statusCode: 422, message: 'Invalid `from` field.' }, 422))
    expect(await verstuurMail(bericht(), RESEND)).toEqual({
      ok: false,
      fout: 'resend 422: {"statusCode":422,"message":"Invalid `from` field."}',
    })
  })

  it('kort de body af tot 240 tekens', async () => {
    nepFetch(() => new Response('y'.repeat(1000), { status: 500 }))
    const uit = await verstuurMail(bericht(), RESEND)
    expect(uit).toEqual({ ok: false, fout: `resend 500: ${'y'.repeat(240)}` })
  })

  it('zet nooit de API-sleutel of een volledig mailadres in de fout', async () => {
    nepFetch(() => new Response(`{"message":"API key ${SLEUTEL} is invalid for jan@example.nl"}`, { status: 401 }))
    const uit = await verstuurMail(bericht(), RESEND)
    expect(uit.ok).toBe(false)
    const fout = (uit as { fout: string }).fout
    expect(fout).not.toContain(SLEUTEL)
    expect(fout).not.toContain('jan@example.nl')
    expect(fout).toBe('resend 401: {"message":"API key *** is invalid for j•••@example.nl"}')
  })

  it('maskeert de sleutel ook als die precies op de afkapgrens valt', async () => {
    nepFetch(() => new Response(`${'z'.repeat(230)}${SLEUTEL}`, { status: 400 }))
    const fout = ((await verstuurMail(bericht(), RESEND)) as { fout: string }).fout
    expect(fout).not.toContain(SLEUTEL.slice(0, 10))
    expect(fout.endsWith('***')).toBe(true)
  })

  it('vangt netwerkfouten af en maskeert ze', async () => {
    nepFetch(() => {
      throw new TypeError(`fetch failed voor ${SLEUTEL}`, { cause: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) })
    })
    expect(await verstuurMail(bericht(), RESEND)).toEqual({ ok: false, fout: 'resend: fetch failed voor *** (ECONNREFUSED)' })
  })

  it('meldt een time-out in gewone taal', async () => {
    nepFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    })
    expect(await verstuurMail(bericht(), RESEND)).toEqual({
      ok: false,
      fout: `resend: geen antwoord binnen ${MAIL_TIMEOUT_MS / 1000} seconden`,
    })
  })

  it('gooit nooit, ook niet als fetch synchroon gooit', async () => {
    const f = (() => {
      throw new Error(`kapot ${SLEUTEL}`)
    }) as unknown as typeof fetch
    zetResendFetch(f)
    const uit = await verstuurMail(bericht(), RESEND)
    expect(uit).toEqual({ ok: false, fout: 'resend: kapot ***' })
  })
})

describe('verstuurMail: invoercontrole en header-injectie', () => {
  const gevallen: Array<[string, Partial<MailBericht>, string]> = [
    ['CRLF in aan', { aan: 'jan@example.nl\r\nBcc: x@evil.nl' }, 'ontvangstadres bevat een regeleinde'],
    ['LF achter aan', { aan: 'jan@example.nl\n' }, 'ontvangstadres bevat een regeleinde'],
    ['CR in onderwerp', { onderwerp: 'Back-up\rBcc: x@evil.nl' }, 'onderwerp bevat een regeleinde'],
    ['LF in onderwerp', { onderwerp: 'Back-up\nX: y' }, 'onderwerp bevat een regeleinde'],
    ['twee adressen', { aan: 'jan@example.nl,x@evil.nl' }, 'ongeldig ontvangstadres'],
    ['naam met adres', { aan: 'Jan <jan@example.nl>' }, 'ongeldig ontvangstadres'],
    ['leeg adres', { aan: '' }, 'ongeldig ontvangstadres'],
    ['CRLF in bestandsnaam', { bijlagen: [{ bestandsnaam: 'a\r\nX: y', inhoud: Buffer.from('a') }] }, 'ongeldige bestandsnaam van een bijlage'],
    ['pad in bestandsnaam', { bijlagen: [{ bestandsnaam: '../etc/passwd', inhoud: Buffer.from('a') }] }, 'ongeldige bestandsnaam van een bijlage'],
    ['bijlage zonder Buffer', { bijlagen: [{ bestandsnaam: 'a.ibcbak', inhoud: 'tekst' as unknown as Buffer }] }, 'bijlage zonder inhoud'],
    ['CRLF in type', { bijlagen: [{ bestandsnaam: 'a.ibcbak', inhoud: Buffer.from('a'), type: 'x\r\ny: z' }] }, 'ongeldig type van een bijlage'],
  ]
  for (const [naam, extra, fout] of gevallen) {
    it(`weigert ${naam} zonder iets te versturen`, async () => {
      const f = nepFetch(() => json({ id: 'x' }))
      const maak = vi.fn()
      zetSmtpTransport(maak)
      expect(await verstuurMail(bericht(extra), RESEND)).toEqual({ ok: false, fout })
      expect(await verstuurMail(bericht(extra), SMTP)).toEqual({ ok: false, fout })
      expect(f).not.toHaveBeenCalled()
      expect(maak).not.toHaveBeenCalled()
    })
  }

  it('zet het ongeldige adres niet in de fout', async () => {
    nepFetch(() => json({ id: 'x' }))
    const uit = await verstuurMail(bericht({ aan: 'geheim.adres@example' }), RESEND)
    expect(JSON.stringify(uit)).not.toContain('geheim.adres')
  })

  it('weigert een onvolledig bericht', async () => {
    nepFetch(() => json({ id: 'x' }))
    expect((await verstuurMail(null as unknown as MailBericht, RESEND)).ok).toBe(false)
    expect((await verstuurMail({ aan: 'jan@example.nl' } as MailBericht, RESEND)).ok).toBe(false)
  })

  it('weigert een regeleinde in MAIL_REPLY_TO', async () => {
    const f = nepFetch(() => json({ id: 'x' }))
    const uit = await verstuurMail(bericht(), { ...RESEND, MAIL_REPLY_TO: 'a@b.nl\nBcc: x@evil.nl' })
    expect(uit).toEqual({ ok: false, fout: 'MAIL_FROM of MAIL_REPLY_TO bevat een regeleinde' })
    expect(f).not.toHaveBeenCalled()
  })

  it('geeft "mailer niet geconfigureerd" zonder config', async () => {
    const f = nepFetch(() => json({ id: 'x' }))
    expect(await verstuurMail(bericht(), {})).toEqual({ ok: false, fout: 'mailer niet geconfigureerd' })
    expect(await verstuurMail(bericht(), { MAIL_FROM: 'a@b.nl', SMTP_HOST: 'h' })).toEqual({ ok: false, fout: 'mailer niet geconfigureerd' })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('verstuurMail via SMTP (nep-transport)', () => {
  function nepTransport(sendMail: (m: Record<string, unknown>) => Promise<unknown>) {
    const transport = { sendMail: vi.fn(sendMail), close: vi.fn() }
    const maak = vi.fn((_opties: Record<string, unknown>) => transport)
    zetSmtpTransport(maak)
    return { maak, transport }
  }

  it('maakt een transport op poort 587 zonder secure en verstuurt het bericht', async () => {
    const f = nepFetch(() => json({ id: 'x' }))
    const { maak, transport } = nepTransport(async () => ({ messageId: '<abc@example.nl>' }))
    const inhoud = Buffer.from('versleuteld')
    const uit = await verstuurMail(bericht({ bijlagen: [{ bestandsnaam: 'b.ibcbak', inhoud, type: 'application/octet-stream' }] }), SMTP)
    expect(uit).toEqual({ ok: true, id: '<abc@example.nl>' })
    expect(f).not.toHaveBeenCalled()
    expect(maak).toHaveBeenCalledTimes(1)
    expect(maak.mock.calls[0][0]).toMatchObject({
      host: 'smtp.example.nl',
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
      auth: { user: 'backup@example.nl', pass: WACHTWOORD },
    })
    const m = transport.sendMail.mock.calls[0][0]
    expect(m).toMatchObject({
      from: 'backup@example.nl',
      to: 'jan@example.nl',
      subject: 'Back-up februari 2027',
      text: 'Je back-up staat in de bijlage.',
      replyTo: 'backup@example.nl',
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    expect(m.attachments).toEqual([{ filename: 'b.ibcbak', content: inhoud, contentType: 'application/octet-stream' }])
    expect(transport.close).toHaveBeenCalled()
  })

  it('zet secure aan bij poort 465 en gebruikt MAIL_REPLY_TO', async () => {
    const { maak, transport } = nepTransport(async () => ({}))
    const uit = await verstuurMail(bericht(), { ...SMTP, SMTP_PORT: '465', MAIL_REPLY_TO: 'antwoord@example.nl' })
    expect(uit).toEqual({ ok: true })
    expect(maak.mock.calls[0][0]).toMatchObject({ port: 465, secure: true, requireTLS: false })
    expect(transport.sendMail.mock.calls[0][0]).toMatchObject({ replyTo: 'antwoord@example.nl' })
  })

  it('eist geen STARTTLS bij een mailserver op dezelfde machine (loopback)', async () => {
    const { maak } = nepTransport(async () => ({}))
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) await verstuurMail(bericht(), { ...SMTP, SMTP_HOST: host })
    expect(maak.mock.calls.map((c) => c[0].requireTLS)).toEqual([false, false, false])
    expect(isLoopback('127.0.0.1.example.nl')).toBe(false)
    expect(isLoopback('smtp.example.nl')).toBe(false)
  })

  it('valt terug op 587 bij een onzinnige poort', async () => {
    const { maak } = nepTransport(async () => ({}))
    await verstuurMail(bericht(), { ...SMTP, SMTP_PORT: 'abc' })
    expect(maak.mock.calls[0][0]).toMatchObject({ port: 587, secure: false })
  })

  it('maskeert wachtwoord en adressen in een SMTP-fout', async () => {
    nepTransport(async () => {
      throw Object.assign(new Error(`Invalid login: 535 auth failed for backup@example.nl with ${WACHTWOORD}`), { code: 'EAUTH' })
    })
    const uit = await verstuurMail(bericht(), SMTP)
    expect(uit).toEqual({ ok: false, fout: 'smtp EAUTH: Invalid login: 535 auth failed for b•••@example.nl with ***' })
  })

  it('gooit nooit, ook niet als het maken van het transport gooit', async () => {
    zetSmtpTransport(() => {
      throw new Error(`kapot ${WACHTWOORD}`)
    })
    expect(await verstuurMail(bericht(), SMTP)).toEqual({ ok: false, fout: 'smtp: kapot ***' })
  })
})

/**
 * Minimale SMTP-server op 127.0.0.1, om het echte nodemailer-pad (dynamische import, AUTH, DATA) te
 * testen zonder netwerk naar buiten. Geen STARTTLS, dus nodemailer praat platte tekst.
 */
function nepSmtp(opties: { authOk: boolean }) {
  const ontvangen: { auth: string[]; mailFrom: string[]; rcptTo: string[]; data: string[] } = { auth: [], mailFrom: [], rcptTo: [], data: [] }
  const sockets = new Set<Socket>()
  const server: Server = createServer((sock) => {
    sockets.add(sock)
    sock.on('close', () => sockets.delete(sock))
    let buffer = ''
    let inData = false
    let data = ''
    const zeg = (r: string) => sock.write(`${r}\r\n`)
    zeg('220 nep.local ESMTP')
    sock.on('data', (chunk) => {
      buffer += chunk.toString('latin1')
      for (;;) {
        if (inData) {
          const eind = buffer.indexOf('\r\n.\r\n')
          if (eind < 0) return
          data += buffer.slice(0, eind)
          buffer = buffer.slice(eind + 5)
          inData = false
          ontvangen.data.push(data)
          data = ''
          zeg('250 2.0.0 Ok: queued as NEP123')
          continue
        }
        const nl = buffer.indexOf('\r\n')
        if (nl < 0) return
        const regel = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 2)
        const cmd = regel.toUpperCase()
        if (cmd.startsWith('EHLO')) {
          sock.write('250-nep.local\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 52428800\r\n')
        } else if (cmd.startsWith('AUTH PLAIN')) {
          ontvangen.auth.push(regel.slice(11))
          zeg(opties.authOk ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication credentials invalid')
        } else if (cmd.startsWith('MAIL FROM')) {
          ontvangen.mailFrom.push(regel)
          zeg('250 2.1.0 Ok')
        } else if (cmd.startsWith('RCPT TO')) {
          ontvangen.rcptTo.push(regel)
          zeg('250 2.1.5 Ok')
        } else if (cmd === 'DATA') {
          inData = true
          zeg('354 End data with <CR><LF>.<CR><LF>')
        } else if (cmd === 'QUIT') {
          zeg('221 2.0.0 Bye')
          sock.end()
        } else if (cmd === 'RSET' || cmd === 'NOOP') {
          zeg('250 Ok')
        } else {
          zeg('502 5.5.2 Error: command not recognized')
        }
      }
    })
  })
  return {
    ontvangen,
    start: () => new Promise<number>((res) => server.listen(0, '127.0.0.1', () => res((server.address() as { port: number }).port))),
    stop: () =>
      new Promise<void>((res) => {
        for (const s of sockets) s.destroy()
        server.close(() => res())
      }),
  }
}

describe('verstuurMail via SMTP (echte nodemailer tegen een nep-server)', () => {
  it('logt in, verstuurt het bericht met bijlage en geeft het message-id terug', async () => {
    const nep = nepSmtp({ authOk: true })
    const poort = await nep.start()
    try {
      const inhoud = Buffer.from('versleutelde back-up \x00\x01\x02')
      const uit = await verstuurMail(
        bericht({ bijlagen: [{ bestandsnaam: 'ibcalculator-2027-02-01.ibcbak', inhoud, type: 'application/octet-stream' }] }),
        { ...SMTP, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(poort) },
      )
      expect(uit.ok).toBe(true)
      expect((uit as { id?: string }).id).toMatch(/^<.+>$/)
      expect(Buffer.from(nep.ontvangen.auth[0], 'base64').toString()).toBe(`\u0000backup@example.nl\u0000${WACHTWOORD}`)
      expect(nep.ontvangen.mailFrom[0]).toContain('<backup@example.nl>')
      expect(nep.ontvangen.rcptTo).toEqual(['RCPT TO:<jan@example.nl>'])
      const data = nep.ontvangen.data[0]
      expect(data).toContain('Subject: Back-up februari 2027')
      expect(data).toContain('Reply-To: backup@example.nl')
      expect(data).toContain('filename=ibcalculator-2027-02-01.ibcbak')
      expect(data).toContain(inhoud.toString('base64'))
    } finally {
      await nep.stop()
    }
  })

  it('geeft een gemaskeerde fout bij een geweigerde login', async () => {
    const nep = nepSmtp({ authOk: false })
    const poort = await nep.start()
    try {
      const uit = await verstuurMail(bericht(), { ...SMTP, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(poort) })
      expect(uit.ok).toBe(false)
      const fout = (uit as { fout: string }).fout
      expect(fout).toMatch(/^smtp EAUTH: /)
      expect(fout).toContain('535')
      expect(fout).not.toContain(WACHTWOORD)
      expect(fout).not.toContain(Buffer.from(WACHTWOORD).toString('base64'))
      expect(fout).not.toContain('backup@example.nl')
      expect(fout).not.toContain('jan@example.nl')
    } finally {
      await nep.stop()
    }
  })
})
