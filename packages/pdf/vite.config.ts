import { createLibConfig } from '../../vite.lib.config'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default createLibConfig(__dirname, ['@react-pdf/renderer'])
