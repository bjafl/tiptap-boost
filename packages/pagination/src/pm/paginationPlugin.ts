import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet } from '@tiptap/pm/view'
import type { PaginationOptions, HeightCache } from '../types'
import type { PageGeometry } from '../utils/PageGeometry'
import { PageMap } from './PageMap'
import { SplitRegistry } from './SplitRegistry'
import { ReflowController } from './ReflowController'
import { buildDecorations } from './buildDecorations'
import { META } from '../constants'
import { logger } from '../utils/logger'

// ── Plugin state ───────────────────────────────────────────────────────────────

interface PaginationPluginState {
  pageMap: PageMap
  decorations: DecorationSet
  heightCache: HeightCache
  splitRegistry: SplitRegistry
  initialized: boolean
}

// ── Plugin key ─────────────────────────────────────────────────────────────────

export const paginationPluginKey = new PluginKey<PaginationPluginState>('tbPagination')

// ── Factory ────────────────────────────────────────────────────────────────────

export function getPaginationPlugin(
  options: PaginationOptions,
  geometry: PageGeometry
): Plugin<PaginationPluginState> {
  // Shared instances — created once, passed into the plugin closure.
  const splitRegistry = new SplitRegistry()
  const reflowController = new ReflowController(options, geometry, splitRegistry)

  return new Plugin<PaginationPluginState>({
    key: paginationPluginKey,

    // ── State ──────────────────────────────────────────────────────────────

    state: {
      init: (_config, editorState) => {
        const pageMap = new PageMap()
        // Build a rough initial page map without DOM (estimates only)
        pageMap.rebuild(editorState.doc, geometry)

        return {
          pageMap,
          decorations: buildDecorations(editorState.doc, pageMap, geometry, options),
          heightCache: new Map(),
          splitRegistry,
          initialized: false,
        }
      },

      apply: (tr, prev, _oldState, newState) => {
        // ── INIT_META: fonts are ready, trigger first reflow ──
        if (tr.getMeta(META.init)) {
          const pageMap = new PageMap()
          pageMap.rebuild(newState.doc, geometry)
          for (let i = 0; i < pageMap.length; i++) pageMap.markDirty(i)

          logger.log('plugin', 'INIT — fonts ready, rebuilt PageMap', {
            pages: pageMap.length,
            dirty: pageMap.dirtyPages(),
          })

          return {
            ...prev,
            pageMap,
            decorations: buildDecorations(newState.doc, pageMap, geometry, options),
            initialized: true,
          }
        }

        // ── PAGES_META: view.update dispatched a corrected page map ──
        const newPageMap: PageMap | undefined = tr.getMeta(META.pages)
        if (newPageMap !== undefined) {
          splitRegistry.syncPageIndexes(newPageMap)
          logger.log('plugin', 'PAGES_META — applying corrected PageMap', {
            pages: newPageMap.length,
          })
          return {
            ...prev,
            pageMap: newPageMap,
            decorations: buildDecorations(
              newState.doc,
              newPageMap,
              geometry,
              options,
              tr.getMeta(META.correction) as Map<number, number> | undefined
            ),
          }
        }

        // ── Doc changed: map positions and mark dirty ──
        if (!tr.docChanged) return prev

        const pageMap = prev.pageMap
        // markDirtyFromTransaction must run BEFORE applyMapping:
        // step maps use old positions, which must be compared against old page positions.
        // After applyMapping the positions are in new coordinates and the match fails.
        pageMap.markDirtyFromTransaction(tr)
        pageMap.applyMapping(tr.mapping)
        // Snap any boundary that landed inside a merged node (e.g. after backspace
        // at a page boundary). Without this a node straddles two pages and is
        // double-counted by detectOverflow, producing no correction.
        const snapped = pageMap.snapBoundaries(newState.doc)
        splitRegistry.applyMapping(tr.mapping)

        logger.log('plugin', 'docChanged — positions mapped, dirty pages', pageMap.dirtyPages(), snapped ? '(boundaries snapped)' : '')

        // If snap moved any boundary, rebuild decorations so widgets appear at
        // the correct (snapped) positions rather than the stale mapped ones.
        const decorations = snapped
          ? buildDecorations(newState.doc, pageMap, geometry, options)
          : prev.decorations.map(tr.mapping, tr.doc)

        return {
          ...prev,
          pageMap,
          decorations,
        }
      },
    },

    // ── Decorations ────────────────────────────────────────────────────────

    props: {
      decorations(state) {
        return paginationPluginKey.getState(state)?.decorations
      },
    },

    // ── View lifecycle ─────────────────────────────────────────────────────

    view: (editorView) => {
      // Wait for fonts before first reflow — avoids incorrect height measurements
      logger.log('plugin', 'view created — waiting for fonts.ready')
      document.fonts.ready.then(() => {
        logger.log('plugin', 'fonts.ready — dispatching INIT_META')
        if (!editorView.isDestroyed) {
          editorView.dispatch(editorView.state.tr.setMeta(META.init, true))
        }
      })

      let pendingRaf: ReturnType<typeof requestAnimationFrame> | null = null

      return {
        update: (view) => {
          const pluginState = paginationPluginKey.getState(view.state)
          if (!pluginState?.initialized) return
          if (pluginState.pageMap.dirtyPages().length === 0) return
          if (pendingRaf !== null) return

          pendingRaf = requestAnimationFrame(() => {
            pendingRaf = null
            if (view.isDestroyed) return

            // Re-read state inside RAF — may have changed since scheduling
            const state = paginationPluginKey.getState(view.state)
            if (!state?.initialized || state.pageMap.dirtyPages().length === 0) return

            logger.log('reflow', 'RAF fired — dirty pages', state.pageMap.dirtyPages())

            const correctionTr = reflowController.onViewUpdate(
              view,
              state.pageMap,
              state.heightCache
            )

            if (correctionTr) {
              logger.log('reflow', 'dispatching correction transaction')
              correctionTr.setMeta(META.pages, state.pageMap)
              view.dispatch(correctionTr)
            } else {
              logger.log('reflow', 'no correction needed')
            }
          })
        },

        destroy: () => {
          if (pendingRaf !== null) {
            cancelAnimationFrame(pendingRaf)
            pendingRaf = null
          }
        },
      }
    },

    // ── appendTransaction: sync cache-based block moves ────────────────────

    appendTransaction: (trs, _oldState, newState) => {
      const pluginState = paginationPluginKey.getState(newState)
      if (!pluginState?.initialized) return null

      const docChanged = trs.some((tr) => tr.docChanged)
      if (!docChanged) return null

      // Build a temporary view-like object — appendTransaction has no view,
      // so Phase 1 uses cache-based estimation only (no DOM calls).
      // ReflowController.onAppendTransaction is a no-op without a real EditorView.
      // Instead we just ensure PageMap is marked dirty — Phase 2 (view.update)
      // handles the actual DOM-based work.
      return null
    },
  })
}
