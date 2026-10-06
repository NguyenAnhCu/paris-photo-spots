import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShutdown } from './shutdown.js'

function fakeServer() {
  let onClosed: (() => void) | undefined
  return {
    close: vi.fn((cb: () => void) => {
      onClosed = cb
    }),
    closeAllConnections: vi.fn(),
    finishClosing: () => onClosed?.(),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createShutdown', () => {
  it('stops accepting connections, closes resources once requests finish, exits 0', async () => {
    const server = fakeServer()
    const closeResources = vi.fn().mockResolvedValue(undefined)
    const exit = vi.fn()
    createShutdown({ server, closeResources, exit, timeoutMs: 5_000 })()

    expect(server.close).toHaveBeenCalledOnce()
    expect(closeResources).not.toHaveBeenCalled() // in-flight requests still use the pool
    server.finishClosing()
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
    expect(closeResources).toHaveBeenCalledOnce()
    expect(server.closeAllConnections).not.toHaveBeenCalled()
  })

  // Regression: server.close() waited for every open connection, so a stuck request blocked deploys forever.
  it('force-closes connections and exits 1 when requests outlive the timeout', async () => {
    const server = fakeServer()
    const exit = vi.fn()
    createShutdown({ server, closeResources: vi.fn().mockResolvedValue(undefined), exit, timeoutMs: 5_000 })()

    await vi.advanceTimersByTimeAsync(4_999)
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(server.closeAllConnections).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('exits 1 when closing resources fails', async () => {
    const server = fakeServer()
    const exit = vi.fn()
    createShutdown({ server, closeResources: vi.fn().mockRejectedValue(new Error('pool')), exit, timeoutMs: 5_000 })()
    server.finishClosing()
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
  })

  it('ignores a second signal while already shutting down', () => {
    const server = fakeServer()
    const shutdown = createShutdown({ server, closeResources: vi.fn(), exit: vi.fn(), timeoutMs: 5_000 })
    shutdown()
    shutdown()
    expect(server.close).toHaveBeenCalledOnce()
  })
})
