import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export function createLibConfig(dir: string, extraExternal: string[] = []) {
  return defineConfig({
    plugins: [
      react(),
      dts({
        include: ['src'],
        tsconfigPath: resolve(dir, 'tsconfig.build.json'),
        rollupTypes: true,
      }),
    ],
    build: {
      lib: {
        entry: resolve(dir, 'src/index.ts'),
        formats: ['es', 'cjs'],
        fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
      },
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          /^@tiptap\//,
          /^@prosemirror\//,
          ...extraExternal,
        ],
      },
    },
  })
}
