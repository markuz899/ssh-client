import type { SessionDataEvent, SessionStatusEvent } from '@shared/types'

// Instrada gli eventi push del main verso il terminale giusto, in base al
// sessionId. I TerminalView si registrano qui quando montano.

type DataHandler = (data: string) => void
const dataHandlers = new Map<string, DataHandler>()
const statusHandlers = new Set<(e: SessionStatusEvent) => void>()

let initialized = false

export function initSessionBus(): () => void {
  if (initialized) return () => undefined
  initialized = true
  const offData = window.phosphor.session.onData((e: SessionDataEvent) => {
    dataHandlers.get(e.sessionId)?.(e.data)
  })
  const offStatus = window.phosphor.session.onStatus((e: SessionStatusEvent) => {
    statusHandlers.forEach((h) => h(e))
  })
  return () => {
    offData()
    offStatus()
    initialized = false
  }
}

export function registerData(sessionId: string, handler: DataHandler): () => void {
  dataHandlers.set(sessionId, handler)
  return () => {
    if (dataHandlers.get(sessionId) === handler) dataHandlers.delete(sessionId)
  }
}

export function onStatus(handler: (e: SessionStatusEvent) => void): () => void {
  statusHandlers.add(handler)
  return () => statusHandlers.delete(handler)
}
