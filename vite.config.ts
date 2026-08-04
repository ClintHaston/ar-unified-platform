import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// public/sw.js ships a literal __BUILD_ID__ so it stays readable and works
// unmodified on the dev server. This stamps the real one into dist/sw.js after
// the build.
//
// The id is a hash of the emitted bundle's filenames, NOT a timestamp. Vite
// already content-hashes every asset, so identical source produces identical
// filenames produces an identical id — and the browser, which decides there is
// an update by byte-comparing sw.js, correctly sees nothing to do. A timestamp
// would hand every rebuild a "new" worker and put the whole fleet through a
// skipWaiting + reload cycle for a deploy that changed nothing.
function stampServiceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'ar-stamp-sw',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir },
    // writeBundle, not generateBundle: sw.js is a public/ file, and Vite copies
    // public/ to disk itself rather than routing it through the bundle graph,
    // so there is nothing to rewrite until the copy has landed.
    writeBundle(_options, bundle) {
      const id = createHash('sha256')
        .update(Object.keys(bundle).sort().join('\n'))
        .digest('hex')
        .slice(0, 12)
      const swPath = resolve(outDir, 'sw.js')
      const src = readFileSync(swPath, 'utf8')
      if (!src.includes('__BUILD_ID__')) {
        this.error('dist/sw.js has no __BUILD_ID__ placeholder to stamp')
      }
      writeFileSync(swPath, src.replace(/__BUILD_ID__/g, id))
      this.info(`stamped dist/sw.js with build id ${id}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  server: {
    port: 4000,
    host: true,
  },
})
