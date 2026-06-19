import { connect } from 'net'
import type { PingResult } from '../shared/types'

/**
 * Verifica la raggiungibilità di host:porta con una connessione TCP e ne misura
 * la latenza. Non apre una sessione SSH: è un semplice handshake di socket.
 */
export function tcpPing(host: string, port: number, timeoutMs = 4000): Promise<PingResult> {
  return new Promise((resolve) => {
    const start = Date.now()
    let settled = false
    const done = (reachable: boolean): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ reachable, ms: reachable ? Date.now() - start : -1 })
    }
    const socket = connect({ host, port })
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}
