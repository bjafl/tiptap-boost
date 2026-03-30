import { createLibConfig } from '../../vite.lib.config'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default createLibConfig(__dirname, {
  entries: {
    index: 'src/index.ts',
    react: 'src/react/index.ts',
  },
  react: true,
  formats: ['es', 'cjs'],
  external: ['@react-pdf/renderer'],
})
