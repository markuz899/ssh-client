import { create } from 'zustand'
import { DEFAULT_BINDINGS, type ActionId } from './shortcuts'

// Impostazioni di aspetto, persistite in localStorage e applicate come
// variabili CSS su :root (vedi global.css). Tutto sincrono, niente flash.

export type BackgroundPreset = 'notte' | 'inchiostro' | 'ardesia' | 'nebbia' | 'giorno'

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

interface Background {
  void: number[]
  panel: number[]
  elev: number[]
  label: string
  mode?: 'dark' | 'light'
}

export const BACKGROUNDS: Record<BackgroundPreset, Background> = {
  notte: { label: 'Notte', void: [6, 10, 18], panel: [11, 18, 30], elev: [16, 26, 43] },
  inchiostro: { label: 'Inchiostro', void: [2, 3, 5], panel: [10, 11, 14], elev: [18, 20, 26] },
  ardesia: { label: 'Ardesia', void: [13, 17, 23], panel: [18, 24, 33], elev: [26, 34, 46] },
  // Slate morbido: meno nero puro → meno alone/affaticamento, miglior leggibilità.
  nebbia: { label: 'Nebbia', void: [18, 23, 31], panel: [26, 33, 44], elev: [36, 45, 59] },
  // Tema chiaro per ambienti luminosi.
  giorno: { label: 'Giorno', void: [233, 236, 241], panel: [245, 247, 251], elev: [255, 255, 255], mode: 'light' }
}

// Configurazioni complete selezionabili: ognuna combina accento, testo e sfondo
// in una palette coerente. Pensate per leggibilità: toni più tenui e meno saturi
// rispetto al fosforo originale, più una variante chiara.
export interface ThemePreset {
  id: string
  label: string
  blurb: string
  accent: string
  ink: string
  inkDim: string
  background: BackgroundPreset
}

export const THEMES: ThemePreset[] = [
  {
    id: 'fosforo',
    label: 'Fosforo',
    blurb: 'Ciano classico ad alto contrasto',
    accent: '#5EF6FF',
    ink: '#D6E0EE',
    inkDim: '#93A2B8',
    background: 'notte'
  },
  {
    id: 'brezza',
    label: 'Brezza',
    blurb: 'Verde-acqua tenue su slate morbido',
    accent: '#6FE3D2',
    ink: '#DCE6EE',
    inkDim: '#9FB4C0',
    background: 'nebbia'
  },
  {
    id: 'aurora',
    label: 'Aurora',
    blurb: 'Blu delicato, riposante',
    accent: '#8AB4FF',
    ink: '#DBE3F2',
    inkDim: '#9AAAC6',
    background: 'nebbia'
  },
  {
    id: 'ametista',
    label: 'Ametista',
    blurb: 'Lavanda morbida su ardesia',
    accent: '#CBA6F2',
    ink: '#E4DCF0',
    inkDim: '#AEA0C4',
    background: 'ardesia'
  },
  {
    id: 'salvia',
    label: 'Salvia',
    blurb: 'Verde salvia, basso affaticamento',
    accent: '#A6D8AE',
    ink: '#DCE6DA',
    inkDim: '#A2B6A2',
    background: 'nebbia'
  },
  {
    id: 'ambra',
    label: 'Ambra',
    blurb: 'Caldo, poca luce blu, per la sera',
    accent: '#F0C07A',
    ink: '#ECE0CC',
    inkDim: '#C0B298',
    background: 'inchiostro'
  },
  {
    id: 'rosa',
    label: 'Rosa cipria',
    blurb: 'Rosa tenue su ardesia',
    accent: '#F2A8C2',
    ink: '#EEDEE6',
    inkDim: '#C2A8B4',
    background: 'ardesia'
  },
  {
    id: 'giorno',
    label: 'Giorno',
    blurb: 'Tema chiaro per ambienti luminosi',
    accent: '#0E9AAE',
    ink: '#27313D',
    inkDim: '#5A6678',
    background: 'giorno'
  }
]

const eqHex = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

// Quale tema combacia con le impostazioni correnti (null = palette personalizzata).
export function activeThemeId(s: Pick<Settings, 'accent' | 'ink' | 'inkDim' | 'background'>): string | null {
  return (
    THEMES.find(
      (t) =>
        eqHex(t.accent, s.accent) &&
        eqHex(t.ink, s.ink) &&
        eqHex(t.inkDim, s.inkDim) &&
        t.background === s.background
    )?.id ?? null
  )
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

  // Tema chiaro/scuro: regola color-scheme (controlli nativi) e una classe
  // per attenuare gli effetti pensati per lo sfondo nero (glow, scanline).
  const light = bg.mode === 'light'
  root.style.colorScheme = light ? 'light' : 'dark'
  root.classList.toggle('theme-light', light)

  root.classList.toggle('no-anim', !s.animations)
}

interface SettingsState extends Settings {
  open: boolean
  setOpen: (v: boolean) => void
  update: (patch: Partial<Settings>) => void
  selectTheme: (t: ThemePreset) => void
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
  selectTheme: (t) =>
    get().update({ accent: t.accent, ink: t.ink, inkDim: t.inkDim, background: t.background }),
  reset: () => {
    set(DEFAULTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULTS))
    applySettings(DEFAULTS)
  }
}))

// Applica subito le impostazioni salvate, prima del primo render.
applySettings(load())
