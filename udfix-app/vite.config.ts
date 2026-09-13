import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'
import fs from 'fs'

/** Vite treats `.gz` as pre-compressed transport; our traineddata blobs are raw bytes misnamed `.gz`. */
function tesseractTraineddataDevPlugin(): Plugin {
  const serveRawGz = (
    req: { url?: string },
    res: {
      statusCode: number
      setHeader: (name: string, value: string) => void
      end: (chunk?: unknown) => void
    },
    next: () => void,
  ) => {
    const url = (req.url ?? '').split('?')[0]
    if (!url.startsWith('/tesseract/') || !url.endsWith('.traineddata.gz')) {
      next()
      return
    }
    const filePath = path.join(__dirname, 'public', url)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      next()
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-cache')
    fs.createReadStream(filePath).pipe(res as NodeJS.WritableStream)
  }

  return {
    name: 'tesseract-traineddata-raw-gz',
    configureServer(server) {
      server.middlewares.use(serveRawGz)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveRawGz)
    },
  }
}

/** Electron loadFile(file://) breaks ES modules tagged crossorigin (white screen). */
function electronProductionHtmlPlugin(): Plugin {
  return {
    name: 'electron-production-html',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(="anonymous")?/g, '')
    },
  }
}

function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  // Keep @tiptap/prosemirror in vendor-core — a separate vendor-tiptap chunk caused
  // circular imports (Cannot access 'Fe' before initialization) in production builds.
  if (id.includes('pdfjs') || id.includes('react-pdf')) return 'vendor-pdf'
  if (id.includes('dockview')) return 'vendor-dockview'
  if (id.includes('@fontsource')) return 'vendor-fonts'
  return 'vendor-core'
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 2500,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  plugins: [
    react(),
    electronProductionHtmlPlugin(),
    tesseractTraineddataDevPlugin(),
    nodePolyfills({
      include: ['buffer', 'stream', 'util', 'events', 'timers'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // dist-electron is main-process output; copying HTML there must not reload the renderer.
      ignored: ['**/dist-electron/**'],
    },
    /** Pre-transform heavy entry while Electron waits on :5173 — shrinks first paint in dev. */
    warmup: {
      clientFiles: [
        './index.html',
        './src/main.tsx',
        './src/App.tsx',
        './src/components/layout/MainLayout.tsx',
        './src/components/layout/DockviewWrapper.tsx',
        './src/components/editor/UdfixEditor.tsx',
      ],
    },
  },
  optimizeDeps: {
    exclude: ['dockview', 'dockview-core', 'dockview-react'],
    include: [
      'tiptap-table-plus',
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'zustand',
      '@tiptap/react',
      '@tiptap/core',
      '@tiptap/starter-kit',
      'sonner',
      'xml2js',
    ],
  },
})
