import { create } from 'zustand'
import { DEFAULT_BINDINGS, type ActionId } from './shortcuts'

// Impostazioni di aspetto, persistite in localStorage e applicate come
// variabili CSS su :root (vedi global.css). Tutto sincrono, niente flash.

export type BackgroundPreset = 'notte' | 'inchiostro' | 'ardesia'

export interface Settings {
  accent: string // hex
  ink: string // hex testo principale
  inkDim: string // hex testo secondario
  background: BackgroundPreset
  terminalFontSize: number
  animations: boolean
  shortcuts: Record<ActionId, string>
}

export const ACCENT_PRESETS = ['#5EF6FF', '#5BF08A', '#FFB347', '#C792EA', '#FF5C6A', '#5EA0F6']

export const BACKGROUNDS: Record<BackgroundPreset, { void: number[]; panel: number[]; elev: number[]; label: string }> = {
  notte: { label: 'Notte', void: [6, 10, 18], panel: [11, 18, 30], elev: [16, 26, 43] },
  inchiostro: { label: 'Inchiostro', void: [2, 3, 5], panel: [10, 11, 14], elev: [18, 20, 26] },
  ardesia: { label: 'Ardesia', void: [13, 17, 23], panel: [18, 24, 33], elev: [26, 34, 46] }
}

const DEFAULTS: Settings = {
  accent: '#5EF6FF',
  ink: '#D6E0EE',
  inkDim: '#93A2B8',
  background: 'notte',
  terminalFontSize: 13,
  animations: true,
  shortcuts: { ...DEFAULT_BINDINGS }
}

const STORAGE_KEY = 'phosphor.settings'

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbString(rgb: number[]): string {
  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`
}

function mix(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t))
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        ...DEFAULTS,
        ...parsed,
        // Merge profondo per non perdere binding aggiunti in versioni nuove.
        shortcuts: { ...DEFAULT_BINDINGS, ...(parsed.shortcuts ?? {}) }
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS
}

export function applySettings(s: Settings): void {
  const root = document.documentElement
  const accent = hexToRgb(s.accent)
  const bg = BACKGROUNDS[s.background]
  const set = (k: string, v: string): void => root.style.setProperty(k, v)

  set('--c-accent', rgbString(accent))
  set('--c-accent-dim', rgbString(mix(accent, bg.void, 0.45)))
  set('--c-accent-deep', rgbString(mix(accent, bg.void, 0.8)))

  const ink = hexToRgb(s.ink)
  const inkDim = hexToRgb(s.inkDim)
  set('--c-ink', rgbString(ink))
  set('--c-ink-dim', rgbString(inkDim))
  set('--c-ink-faint', rgbString(mix(inkDim, bg.void, 0.32)))

  set('--c-void', rgbString(bg.void))
  set('--c-panel', rgbString(bg.panel))
  set('--c-elev', rgbString(bg.elev))

  root.classList.toggle('no-anim', !s.animations)
}

interface SettingsState extends Settings {
  open: boolean
  setOpen: (v: boolean) => void
  update: (patch: Partial<Settings>) => void
  reset: () => void
}

function pickSettings(s: SettingsState): Settings {
  return {
    accent: s.accent,
    ink: s.ink,
    inkDim: s.inkDim,
    background: s.background,
    terminalFontSize: s.terminalFontSize,
    animations: s.animations,
    shortcuts: s.shortcuts
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  open: false,
  setOpen: (open) => set({ open }),
  update: (patch) => {
    set(patch)
    const s = pickSettings(get())
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    applySettings(s)
  },
  reset: () => {
    set(DEFAULTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS))
    applySettings(DEFAULTS)
  }
}))

// Applica subito le impostazioni salvate, prima del primo render.
applySettings(load())
