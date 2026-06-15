import { describe, it, expect } from 'vitest'
import { reservePort, isPortBindable } from '../../electron/port'

describe('reservePort', () => {
  it('returns a port greater than 0', async () => {
    const port = await reservePort()
    expect(port).toBeGreaterThan(0)
  })

  it('returns a bindable port', async () => {
    const port = await reservePort()
    const bindable = await isPortBindable(port)
    expect(bindable).toBe(true)
  })
})
