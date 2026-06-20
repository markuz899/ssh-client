import { useState } from 'react'
import { applyLocal, gatherLocal } from '../lib/backup'

type Note = { kind: 'ok' | 'error' | 'info'; text: string } | null

export default function BackupSection(): JSX.Element {
  const [exportPass, setExportPass] = useState('')
  const [exportPass2, setExportPass2] = useState('')
  const [importPass, setImportPass] = useState('')
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [exportNote, setExportNote] = useState<Note>(null)
  const [importNote, setImportNote] = useState<Note>(null)

  const runExport = async (): Promise<void> => {
    setExportNote(null)
    if (exportPass.length < 8) {
      setExportNote({ kind: 'error', text: 'La passphrase deve avere almeno 8 caratteri.' })
      return
    }
    if (exportPass !== exportPass2) {
      setExportNote({ kind: 'error', text: 'Le due passphrase non coincidono.' })
      return
    }
    setBusy('export')
    const res = await window.phosphor.config.export(exportPass, gatherLocal())
    setBusy(null)
    if (!res.ok) {
      setExportNote({ kind: 'error', text: res.error })
    } else if (res.data) {
      setExportNote({ kind: 'ok', text: 'Backup esportato e cifrato.' })
      setExportPass('')
      setExportPass2('')
    } else {
      setExportNote({ kind: 'info', text: 'Esportazione annullata.' })
    }
  }

  const runImport = async (): Promise<void> => {
    setImportNote(null)
    if (!importPass) {
      setImportNote({ kind: 'error', text: 'Inserisci la passphrase del backup.' })
      return
    }
    if (
      !window.confirm(
        'Il ripristino sostituisce le connessioni e le impostazioni attuali. Continuare?'
      )
    ) {
      return
    }
    setBusy('import')
    const res = await window.phosphor.config.import(importPass)
    setBusy(null)
    if (!res.ok) {
      setImportNote({ kind: 'error', text: res.error })
      return
    }
    if (res.data === null) {
      setImportNote({ kind: 'info', text: 'Importazione annullata.' })
      return
    }
    applyLocal(res.data.local)
    setImportNote({ kind: 'ok', text: 'Configurazione ripristinata. Riavvio…' })
    setTimeout(() => window.location.reload(), 900)
  }

  return (
    <div className="space-y-5">
      <p className="font-mono text-[11px] leading-relaxed text-ink-dim">
        Esporta tutto (connessioni, segreti, comandi, tunnel, impostazioni, chiavi AI e chat) in un
        unico file <span className="text-phosphor">.json</span> cifrato con una passphrase. Usalo
        per ripristinare la configurazione su un altro PC.
      </p>

      {/* Esporta */}
      <div className="space-y-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">esporta</div>
        <input
          type="password"
          value={exportPass}
          onChange={(e) => setExportPass(e.target.value)}
          placeholder="passphrase (min. 8 caratteri)"
          className="w-full rounded-md border border-line bg-void/60 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
        />
        <input
          type="password"
          value={exportPass2}
          onChange={(e) => setExportPass2(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runExport()}
          placeholder="ripeti la passphrase"
          className="w-full rounded-md border border-line bg-void/60 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
        />
        <button
          onClick={runExport}
          disabled={busy !== null}
          className="w-full rounded-md border border-phosphor/40 bg-phosphor/10 px-3 py-2 font-mono text-[12px] text-phosphor transition hover:bg-phosphor/20 disabled:opacity-40"
        >
          {busy === 'export' ? 'esporto…' : '↧ esporta backup'}
        </button>
        {exportNote && <NoteLine note={exportNote} />}
      </div>

      <div className="h-px bg-line" />

      {/* Importa */}
      <div className="space-y-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">ripristina</div>
        <input
          type="password"
          value={importPass}
          onChange={(e) => setImportPass(e.target.value)}
          placeholder="passphrase del backup"
          className="w-full rounded-md border border-line bg-void/60 px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-phosphor/50"
        />
        <button
          onClick={runImport}
          disabled={busy !== null}
          className="w-full rounded-md border border-line px-3 py-2 font-mono text-[12px] text-ink-dim transition hover:border-phosphor/40 hover:text-phosphor disabled:opacity-40"
        >
          {busy === 'import' ? 'ripristino…' : '↥ importa backup…'}
        </button>
        <p className="font-mono text-[10px] text-ink-faint">
          Il ripristino sostituisce la configurazione attuale e riavvia l’interfaccia.
        </p>
        {importNote && <NoteLine note={importNote} />}
      </div>
    </div>
  )
}

function NoteLine({ note }: { note: NonNullable<Note> }): JSX.Element {
  const color =
    note.kind === 'ok' ? 'text-matrix' : note.kind === 'error' ? 'text-danger' : 'text-ink-dim'
  const glyph = note.kind === 'ok' ? '✓' : note.kind === 'error' ? '✕' : '·'
  return <div className={`font-mono text-[11px] ${color}`}>{glyph} {note.text}</div>
}
