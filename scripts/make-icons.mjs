// Genera le icone dell'app (PNG multi-risoluzione + .icns macOS) dal master SVG.
// Uso: npm run icons   (richiede `iconutil`, presente su macOS)
import { Resvg } from '@resvg/resvg-js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = resolve(root, 'build')
const svg = readFileSync(resolve(buildDir, 'icon.svg'), 'utf8')

function render(size) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return r.render().asPng()
}

// Icona principale (Windows/Linux fallback e anteprime).
writeFileSync(resolve(buildDir, 'icon.png'), render(1024))

// Iconset per macOS -> .icns
const iconset = resolve(buildDir, 'icon.iconset')
if (existsSync(iconset)) rmSync(iconset, { recursive: true, force: true })
mkdirSync(iconset, { recursive: true })

const specs = [
  [16, '16x16'],
  [32, '16x16@2x'],
  [32, '32x32'],
  [64, '32x32@2x'],
  [128, '128x128'],
  [256, '128x128@2x'],
  [256, '256x256'],
  [512, '256x256@2x'],
  [512, '512x512'],
  [1024, '512x512@2x']
]
for (const [size, name] of specs) {
  writeFileSync(resolve(iconset, `icon_${name}.png`), render(size))
}

try {
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', resolve(buildDir, 'icon.icns')])
  rmSync(iconset, { recursive: true, force: true })
  console.log('✓ build/icon.png e build/icon.icns generati')
} catch (e) {
  console.warn('PNG generati; `iconutil` non disponibile, .icns non creato.', e.message)
}
