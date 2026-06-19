import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../../lib/store'
import RemoteEditor from './RemoteEditor'
import type { Connection, ConnectInput, SftpEntry, SftpStatus } from '@shared/types'

function inputFor(c: Connection): ConnectInput {
  return {
    connectionId: c.id,
    host: c.host,
    port: c.port,
    username: c.username,
    authMethod: c.authMethod,
    keyPath: c.keyPath
  }
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = b / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

function formatDate(ms: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: '2-digit'
  })
}

const joinPath = (dir: string, name: string): string =>
  dir === '/' ? `/${name}` : `${dir}/${name}`
const parentPath = (dir: string): string => {
  if (dir === '/' || !dir.includes('/')) return '/'
  const p = dir.slice(0, dir.lastIndexOf('/'))
  return p === '' ? '/' : p
}

export default function SftpBrowser({ connection }: { connection: Connection }): JSX.Element {
  const [status, setStatus] = useState<SftpStatus>('connecting')
  const [error, setError] = useState<string | undefined>()
  const [cwd, setCwd] = useState('/')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const [newFile, setNewFile] = useState<string | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editFile, setEditFile] = useState<{ path: string; name: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const sftpId = useRef<string | null>(null)
  const setSftpTarget = useStore((s) => s.setSftpTarget)

  // Apertura sessione SFTP.
  useEffect(() => {
    let cancelled = false
    let id: string | undefined
    let offStatus = (): void => undefined
    setStatus('connecting')
    setError(undefined)

    const start = async (): Promise<void> => {
      const res = await window.phosphor.sftp.open(inputFor(connection))
      if (cancelled) return
      if (!res.ok) {
        setStatus('error')
        setError(res.error)
        return
      }
      id = res.data.sftpId
      sftpId.current = id
      offStatus = window.phosphor.sftp.onStatus((e) => {
        if (e.sftpId !== id || cancelled) return
        if (e.status === 'error') {
          setStatus('error')
          setError(e.message)
        }
      })
      const home = await window.phosphor.sftp.home(id)
      if (cancelled || !home.ok) return
      setStatus('ready')
      navigate(home.data)
    }
    start()

    return () => {
      cancelled = true
      offStatus()
      if (id) window.phosphor.sftp.close(id)
      sftpId.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id])

  const navigate = async (path: string): Promise<void> => {
    const id = sftpId.current
    if (!id) return
    setLoading(true)
    const res = await window.phosphor.sftp.list(id, path)
    setLoading(false)
    if (res.ok) {
      setCwd(path)
      setEntries(res.data)
      setError(undefined)
    } else {
      setError(res.error)
    }
  }

  const refresh = (): Promise<void> => navigate(cwd)

  const goToPath = (): void => {
    const target = editingPath?.trim()
    setEditingPath(null)
    if (target) navigate(target.startsWith('/') ? target : `/${target}`)
  }

  const disconnect = (): void => {
    const id = sftpId.current
    if (id) window.phosphor.sftp.close(id)
    setSftpTarget(undefined)
  }

  const onEntryOpen = (e: SftpEntry): void => {
    if (e.type === 'dir') navigate(joinPath(cwd, e.name))
    else if (e.type === 'file') setEditFile({ path: joinPath(cwd, e.name), name: e.name })
  }

  const editEntry = (e: SftpEntry): void => setEditFile({ path: joinPath(cwd, e.name), name: e.name })

  const download = async (e: SftpEntry): Promise<void> => {
    const id = sftpId.current
    if (!id) return
    setBusy(`Scarico ${e.name}…`)
    await window.phosphor.sftp.download(id, joinPath(cwd, e.name), e.name)
    setBusy(null)
  }

  const remove = async (e: SftpEntry): Promise<void> => {
    if (!window.confirm(`Eliminare "${e.name}"?`)) return
    const id = sftpId.current
    if (!id) return
    setBusy(`Elimino ${e.name}…`)
    const res = await window.phosphor.sftp.remove(id, joinPath(cwd, e.name), e.type === 'dir')
    setBusy(null)
    if (!res.ok) setError(res.error)
    else refresh()
  }

  const uploadDialog = async (): Promise<void> => {
    const id = sftpId.current
    if (!id) return
    setBusy('Carico…')
    await window.phosphor.sftp.uploadDialog(id, cwd)
    setBusy(null)
    refresh()
  }

  const createFolder = async (): Promise<void> => {
    const id = sftpId.current
    const name = newFolder?.trim()
    if (!id || !name) {
      setNewFolder(null)
      return
    }
    setBusy(`Creo ${name}…`)
    const res = await window.phosphor.sftp.mkdir(id, joinPath(cwd, name))
    setBusy(null)
    setNewFolder(null)
    if (!res.ok) setError(res.error)
    else refresh()
  }

  const createFile = async (): Promise<void> => {
    const id = sftpId.current
    const name = newFile?.trim()
    if (!id || !name) {
      setNewFile(null)
      return
    }
    if (entries.some((e) => e.name === name)) {
      setError('Esiste già un elemento con questo nome.')
      setNewFile(null)
      return
    }
    const filePath = joinPath(cwd, name)
    setBusy(`Creo ${name}…`)
    const res = await window.phosphor.sftp.writeFile(id, filePath, '')
    setBusy(null)
    setNewFile(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await refresh()
    setEditFile({ path: filePath, name }) // apri subito il nuovo file nell'editor
  }

  const onDrop = async (ev: React.DragEvent): Promise<void> => {
    ev.preventDefault()
    setDragOver(false)
    const id = sftpId.current
    if (!id) return
    const paths = Array.from(ev.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p))
    if (paths.length === 0) return
    setBusy(`Carico ${paths.length} file…`)
    await window.phosphor.sftp.uploadPaths(id, cwd, paths)
    setBusy(null)
    refresh()
  }

  if (status === 'connecting' || status === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center"
        >
          <div className="relative mb-6 h-24 w-24">
            {status === 'connecting' &&
              [0, 0.6, 1.2].map((d) => (
                <span
                  key={d}
                  className="absolute inset-0 rounded-full border border-phosphor/40 animate-pulse-ring"
                  style={{ animationDelay: `${d}s` }}
                />
              ))}
            <div
              className={`absolute inset-0 flex items-center justify-center rounded-full border text-2xl ${
                status === 'error'
                  ? 'border-danger/50 text-danger'
                  : 'border-phosphor/40 text-phosphor text-glow'
              }`}
            >
              {status === 'error' ? '×' : '⇅'}
            </div>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-dim">
            {status === 'error' ? 'sftp non disponibile' : 'apertura sessione sftp'}
          </div>
          <div className="mt-1 font-mono text-base text-ink">{connection.name}</div>
          {status === 'error' && (
            <>
              <p className="mt-3 max-w-sm font-mono text-[12px] text-danger/90">{error}</p>
              <button
                onClick={() => setSftpTarget(undefined)}
                className="mt-4 rounded-md border border-line px-4 py-2 font-mono text-xs text-ink-dim transition hover:text-ink"
              >
                chiudi
              </button>
            </>
          )}
        </motion.div>
      </div>
    )
  }

  const segments = cwd.split('/').filter(Boolean)

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Barra percorso + azioni */}
      <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-4 py-2.5">
        <button
          onClick={() => navigate(parentPath(cwd))}
          disabled={cwd === '/'}
          title="Su"
          className="rounded-md border border-line px-2 py-1 font-mono text-[12px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor disabled:opacity-40"
        >
          ↑
        </button>
        {editingPath !== null ? (
          <input
            autoFocus
            value={editingPath}
            onChange={(e) => setEditingPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goToPath()
              if (e.key === 'Escape') setEditingPath(null)
            }}
            onBlur={() => setEditingPath(null)}
            placeholder="/var/www/effatta"
            className="min-w-0 flex-1 rounded-md border border-phosphor/50 bg-void/60 px-2.5 py-1 font-mono text-[12px] text-ink outline-none"
          />
        ) : (
          <div
            onClick={() => setEditingPath(cwd)}
            title="Clic per digitare un percorso"
            className="flex min-w-0 flex-1 cursor-text items-center gap-1 overflow-x-auto rounded-md border border-transparent px-1 font-mono text-[12px] hover:border-line"
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate('/')
              }}
              className="text-ink-dim hover:text-phosphor"
            >
              /
            </button>
            {segments.map((seg, i) => {
              const path = '/' + segments.slice(0, i + 1).join('/')
              return (
                <span key={path} className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(path)
                    }}
                    className="text-ink hover:text-phosphor"
                  >
                    {seg}
                  </button>
                  {i < segments.length - 1 && <span className="text-ink-faint">/</span>}
                </span>
              )
            })}
          </div>
        )}
        <button
          onClick={() => setEditingPath(editingPath === null ? cwd : null)}
          title="Vai a percorso"
          className="rounded-md border border-line px-2 py-1 font-mono text-[12px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor"
        >
          ⌖
        </button>
        <button
          onClick={() => {
            setNewFile('')
            setNewFolder(null)
          }}
          className="rounded-md border border-line px-2.5 py-1 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor"
        >
          ＋ file
        </button>
        <button
          onClick={() => {
            setNewFolder('')
            setNewFile(null)
          }}
          className="rounded-md border border-line px-2.5 py-1 font-mono text-[11px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor"
        >
          ＋ cartella
        </button>
        <button
          onClick={uploadDialog}
          className="rounded-md border border-phosphor/40 bg-phosphor/10 px-2.5 py-1 font-mono text-[11px] text-phosphor transition hover:bg-phosphor/20"
        >
          ↑ carica
        </button>
        <button
          onClick={refresh}
          title="Aggiorna"
          className="rounded-md border border-line px-2 py-1 font-mono text-[12px] text-ink-dim transition hover:border-phosphor/30 hover:text-phosphor"
        >
          ⟳
        </button>
        <button
          onClick={disconnect}
          title="Chiudi la connessione SFTP"
          className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1 font-mono text-[11px] text-danger transition hover:bg-danger/20"
        >
          ⏏ disconnetti
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {newFolder !== null && (
          <div className="flex items-center gap-2 border-b border-line bg-elev/40 px-4 py-2">
            <span className="text-amber">📁</span>
            <input
              autoFocus
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createFolder()
                if (e.key === 'Escape') setNewFolder(null)
              }}
              placeholder="nome cartella"
              className="flex-1 rounded-md border border-line bg-void/60 px-2.5 py-1 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
            />
            <button onClick={createFolder} className="font-mono text-[11px] text-phosphor">
              crea
            </button>
            <button onClick={() => setNewFolder(null)} className="font-mono text-[11px] text-ink-dim">
              ×
            </button>
          </div>
        )}

        {newFile !== null && (
          <div className="flex items-center gap-2 border-b border-line bg-elev/40 px-4 py-2">
            <span className="text-ink-dim">📄</span>
            <input
              autoFocus
              value={newFile}
              onChange={(e) => setNewFile(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createFile()
                if (e.key === 'Escape') setNewFile(null)
              }}
              placeholder="nome file (es. note.txt)"
              className="flex-1 rounded-md border border-line bg-void/60 px-2.5 py-1 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
            />
            <button onClick={createFile} className="font-mono text-[11px] text-phosphor">
              crea e apri
            </button>
            <button onClick={() => setNewFile(null)} className="font-mono text-[11px] text-ink-dim">
              ×
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center font-mono text-[12px] text-ink-dim">lettura…</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center font-mono text-[12px] text-ink-faint">
            Cartella vuota. Trascina qui dei file per caricarli.
          </div>
        ) : (
          <table className="w-full border-collapse font-mono text-[12px]">
            <tbody>
              <AnimatePresence initial={false}>
                {entries.map((e) => (
                  <motion.tr
                    key={e.name}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onDoubleClick={() => onEntryOpen(e)}
                    className="group border-b border-line/50 hover:bg-elev/40"
                  >
                    <td className="w-6 py-1.5 pl-4 pr-1">
                      <span className={e.type === 'dir' ? 'text-amber' : 'text-ink-dim'}>
                        {e.type === 'dir' ? '📁' : e.type === 'link' ? '🔗' : '📄'}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <button
                        onClick={() => onEntryOpen(e)}
                        className={`truncate text-left ${
                          e.type === 'dir' ? 'text-ink hover:text-phosphor' : 'text-ink'
                        }`}
                      >
                        {e.name}
                      </button>
                    </td>
                    <td className="hidden w-28 py-1.5 text-right text-ink-dim sm:table-cell">
                      {e.type === 'dir' ? '—' : formatBytes(e.size)}
                    </td>
                    <td className="hidden w-24 py-1.5 text-right text-ink-faint md:table-cell">
                      {e.mode}
                    </td>
                    <td className="hidden w-24 py-1.5 text-right text-ink-dim lg:table-cell">
                      {formatDate(e.mtime)}
                    </td>
                    <td className="w-24 py-1.5 pr-4 text-right">
                      <span className="inline-flex gap-2 opacity-0 transition group-hover:opacity-100">
                        {e.type === 'file' && (
                          <button
                            onClick={() => editEntry(e)}
                            title="Modifica"
                            className="text-ink-dim hover:text-phosphor"
                          >
                            ✎
                          </button>
                        )}
                        {e.type !== 'dir' && (
                          <button
                            onClick={() => download(e)}
                            title="Scarica"
                            className="text-ink-dim hover:text-phosphor"
                          >
                            ↓
                          </button>
                        )}
                        <button
                          onClick={() => remove(e)}
                          title="Elimina"
                          className="text-ink-dim hover:text-danger"
                        >
                          ×
                        </button>
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Stato operazione */}
      {busy && (
        <div className="border-t border-line bg-panel/80 px-4 py-1.5 font-mono text-[11px] text-phosphor">
          {busy}
        </div>
      )}
      {error && status === 'ready' && (
        <div className="border-t border-danger/40 bg-danger/10 px-4 py-1.5 font-mono text-[11px] text-danger">
          {error}
        </div>
      )}

      {/* Overlay drop */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-phosphor/60 bg-void/70">
          <div className="font-mono text-sm text-phosphor text-glow">rilascia per caricare in {cwd}</div>
        </div>
      )}

      {/* Editor remoto */}
      <AnimatePresence>
        {editFile && sftpId.current && (
          <RemoteEditor
            key={editFile.path}
            sftpId={sftpId.current}
            path={editFile.path}
            name={editFile.name}
            onClose={() => setEditFile(null)}
            onSaved={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
