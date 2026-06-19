/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tutti i colori tematizzabili passano da variabili CSS (vedi global.css
        // e useSettings) così le Impostazioni possono cambiarli a runtime.
        void: 'rgb(var(--c-void) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        elev: 'rgb(var(--c-elev) / <alpha-value>)',
        line: 'var(--c-line)',
        phosphor: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          dim: 'rgb(var(--c-accent-dim) / <alpha-value>)',
          deep: 'rgb(var(--c-accent-deep) / <alpha-value>)'
        },
        matrix: 'rgb(var(--c-matrix) / <alpha-value>)',
        amber: 'rgb(var(--c-amber) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          dim: 'rgb(var(--c-ink-dim) / <alpha-value>)',
          faint: 'rgb(var(--c-ink-faint) / <alpha-value>)'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--c-accent) / 0.25), 0 0 24px -4px rgb(var(--c-accent) / 0.35)',
        'glow-sm': '0 0 12px -2px rgb(var(--c-accent) / 0.45)',
        panel: '0 24px 60px -20px rgba(0,0,0,0.7)'
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' }
        },
        flicker: {
          '0%,19%,21%,23%,25%,54%,56%,100%': { opacity: '1' },
          '20%,24%,55%': { opacity: '0.55' }
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.6)', opacity: '0.8' },
          '100%': { transform: 'scale(2.4)', opacity: '0' }
        }
      },
      animation: {
        scan: 'scan 6s linear infinite',
        flicker: 'flicker 4s linear infinite',
        'pulse-ring': 'pulse-ring 2.2s ease-out infinite'
      }
    }
  },
  plugins: []
}
