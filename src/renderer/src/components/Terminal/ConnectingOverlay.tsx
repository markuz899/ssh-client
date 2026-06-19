import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import DecryptedText from '../ui/DecryptedText'
import type { Tab } from '../../lib/store'

interface Props {
  tab: Tab
  onRetry: () => void
  onClose: () => void
}

const STEPS = [
  'risoluzione host',
  'apertura socket tcp',
  'handshake protocollo ssh',
  'scambio chiavi (kex)',
  'autenticazione',
  'allocazione pty'
]

/**
 * Overlay a tutto pannello mostrato mentre la sessione si collega.
 * È l'elemento "firma" dell'app: radar pulsante, host in DecryptedText e una
 * sequenza di passi che si accendono uno alla volta. Sparisce a 'ready'.
 */
export default function ConnectingOverlay({ tab, onRetry, onClose }: Props): JSX.Element | null {
  const phase: 'busy' | 'error' | 'done' =
    tab.status === 'error'
      ? 'error'
      : tab.status === 'ready'
        ? 'done'
        : 'busy'

  const [step, setStep] = useState(0)
  useEffect(() => {
    if (phase !== 'busy') return
    const id = setInterval(() => {
      setStep((s) => {
        // Avanza fino a 'autenticazione' e lì resta in attesa dell'esito.
        const cap = tab.status === 'authenticating' ? STEPS.length - 1 : STEPS.length - 2
        return Math.min(s + 1, cap)
      })
    }, 480)
    return () => clearInterval(id)
  }, [phase, tab.status])

  const visible = phase !== 'done'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.35 }}
          className="scanlines absolute inset-0 z-20 flex items-center justify-center overflow-hidden bg-void/85 backdrop-blur-sm"
        >
          <div className="relative flex w-full max-w-lg flex-col items-center px-8">
            {/* Radar */}
            <div className="relative mb-9 h-40 w-40">
              {phase === 'busy' &&
                [0, 0.7, 1.4].map((d) => (
                  <span
                    key={d}
                    className="absolute inset-0 rounded-full border border-phosphor/40 animate-pulse-ring"
                    style={{ animationDelay: `${d}s` }}
                  />
                ))}
              <div
                className={`absolute inset-0 rounded-full border ${
                  phase === 'error' ? 'border-danger/50' : 'border-phosphor/30'
                }`}
              />
              <div className="absolute inset-5 rounded-full border border-line" />
              <div className="absolute inset-10 rounded-full border border-line" />
              {phase === 'busy' && (
                <motion.div
                  className="absolute inset-0 origin-center"
                  style={{
                    background:
                      'conic-gradient(from 0deg, rgba(94,246,255,0.42), transparent 28%)',
                    borderRadius: '9999px',
                    maskImage: 'radial-gradient(circle, transparent 14px, #000 15px)'
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`font-mono text-2xl ${
                    phase === 'error' ? 'text-danger' : 'text-phosphor text-glow'
                  }`}
                >
                  {phase === 'error' ? '×' : '⌁'}
                </span>
              </div>
            </div>

            {/* Host in decrypt */}
            <div className="mb-1 font-mono text-xs uppercase tracking-[0.32em] text-ink-dim">
              {phase === 'error' ? 'connessione interrotta' : 'collegamento in corso'}
            </div>
            <div className="mb-6 text-center font-mono text-lg text-ink">
              <span className="text-ink-dim">{tab.username}@</span>
              <DecryptedText
                text={tab.host}
                className={phase === 'error' ? 'text-danger' : 'text-phosphor text-glow'}
                trigger={tab.status}
              />
            </div>

            {/* Sequenza passi */}
            {phase === 'busy' && (
              <div className="w-full max-w-xs space-y-1.5 font-mono text-[12px]">
                {STEPS.map((label, i) => {
                  const state = i < step ? 'done' : i === step ? 'active' : 'pending'
                  return (
                    <div
                      key={label}
                      className={`flex items-center gap-2.5 transition-colors ${
                        state === 'pending' ? 'text-ink-faint' : 'text-ink'
                      }`}
                    >
                      <span
                        className={
                          state === 'done'
                            ? 'text-matrix'
                            : state === 'active'
                              ? 'text-phosphor'
                              : 'text-ink-faint'
                        }
                      >
                        {state === 'done' ? '✓' : state === 'active' ? '▸' : '·'}
                      </span>
                      <span className={state === 'active' ? 'text-glow' : ''}>{label}</span>
                      {state === 'active' && (
                        <motion.span
                          className="ml-auto text-phosphor"
                          animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                        >
                          ░░░
                        </motion.span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Errore */}
            {phase === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm text-center"
              >
                <p className="mb-5 font-mono text-[13px] leading-relaxed text-danger/90">
                  {tab.errorMessage ?? 'Errore sconosciuto.'}
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={onRetry}
                    className="no-drag rounded-md border border-phosphor/40 bg-phosphor/10 px-4 py-2 font-mono text-xs text-phosphor transition hover:bg-phosphor/20"
                  >
                    riprova
                  </button>
                  <button
                    onClick={onClose}
                    className="no-drag rounded-md border border-line px-4 py-2 font-mono text-xs text-ink-dim transition hover:text-ink"
                  >
                    chiudi tab
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
