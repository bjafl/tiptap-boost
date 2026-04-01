import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import type { AnyExtension } from '@tiptap/core'
import { getTestExtension as paginationGetExt } from './extensions/paginationPP'

// -- Extension registry --
// Add one line per extension you want available for e2e testing.
// The key matches the ?ext= query parameter.
// const extensionRegistry: Record<
//   string,
//   () => Promise<{
//     getTestExtension: (config: Record<string, unknown>) => AnyExtension
//   }>
// > = {
//   pagination: () => import('./extensions/paginationPP'),
//   // table: () => import('./extensions/table').then(mod => mod.getTestExtension),
// }
const extensionRegistry: Record<
  string,
  () => {
    getTestExtension: (config: Record<string, unknown>) => AnyExtension
  }
> = {
  pagination: () => ({ getTestExtension: paginationGetExt }),
  // table: () => import('./extensions/table').then(mod => mod.getTestExtension),
}

async function boot() {
  const params = new URLSearchParams(location.search)
  const extName = params.get('ext')
  const configJson = params.get('config')

  if (!extName) {
    document.body.textContent = 'Missing ?ext= parameter'
    return
  }

  if (!(extName in extensionRegistry)) {
    document.body.textContent = `Unknown extension: "${extName}". Available: ${Object.keys(extensionRegistry).join(', ')}`
    return
  }

  try {
    // const mod = await extensionRegistry[extName]()
    const mod = extensionRegistry[extName]()
    const config = configJson ? JSON.parse(configJson) : {}
    const content = config.content ?? '<p></p>'
    delete config.content

    const extension = mod.getTestExtension(config)

    const editor = new Editor({
      element: document.querySelector('#editor')!,
      extensions: [StarterKit, extension],
      content,
    })

    // Expose to Playwright
    ;(window as any).__editor = editor
    ;(window as any).__ready = true
  } catch (err) {
    document.body.textContent = `Boot error: ${err}`
    console.error(err)
  }
}

boot()
