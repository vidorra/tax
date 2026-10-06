import { describe, expect, it } from 'vitest'
import { umamiScript } from '../umami'

describe('umamiScript', () => {
  it('geeft id en script-URL als beide zijn gezet', () => {
    expect(umamiScript(' abc-123 ', ' https://stats.example.nl/script.js ')).toEqual({ websiteId: 'abc-123', src: 'https://stats.example.nl/script.js' })
  })

  it('geen statistiek zonder id of zonder script-URL', () => {
    expect(umamiScript(undefined, 'https://stats.example.nl/script.js')).toBeNull()
    expect(umamiScript('abc-123', undefined)).toBeNull()
    expect(umamiScript('abc-123', '  ')).toBeNull()
  })

  it('geen statistiek bij een ongeldige of niet-http(s) URL', () => {
    expect(umamiScript('abc-123', 'stats.example.nl/script.js')).toBeNull()
    expect(umamiScript('abc-123', 'javascript:alert(1)')).toBeNull()
  })
})
