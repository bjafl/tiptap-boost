import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src'],
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'react/index': resolve(__dirname, 'src/react/index.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'cjs' ? 'cjs' : 'js'}`,
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        /^@tiptap\//,
        /^prosemirror-/,
        /^@prosemirror\//,
        '@react-pdf/renderer',
      ],
    },
  },
})
