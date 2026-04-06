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

      apply: (tr, prev, oldState, newState) => {
        logger.log('plugin', 'apply transaction', {
          meta: tr.getMeta(META.init)
            ? 'INIT_META'
            : tr.getMeta(META.pages)
              ? 'PAGES_META'
              : 'none',
          docChanged: tr.docChanged,
          steps: tr.steps.length,
          docSize: newState.doc.content.size,
          oldDocSize: oldState.doc.content.size,
        })

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
          if (oldState.doc.content.size !== newState.doc.content.size) {
            const result = newPageMap.snapBoundaries(newState.doc)
            logger.log('plugin', 'PAGES_META — doc size changed, ran snapBoundaries', { result })
          }

          splitRegistry.syncPageIndexes(newPageMap)
          const heightsCorrection = tr.getMeta(META.correction) as Map<number, number> | undefined
          logger.log('plugin', 'PAGES_META — applying corrected PageMap', {
            pages: newPageMap.length,
            heightsCorrection: heightsCorrection ? Object.fromEntries(heightsCorrection) : null,
          })
          return {
            ...prev,
            pageMap: newPageMap,
            decorations: buildDecorations(
              newState.doc,
              newPageMap,
              geometry,
              options,
              heightsCorrection
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

        logger.log(
          'plugin',
          'docChanged — positions mapped, dirty pages',
          pageMap.dirtyPages(),
          snapped ? '(boundaries snapped)' : ''
        )

        // If snap moved any boundary, rebuild decorations so widgets appear at
        // the correct (snapped) positions rather than the stale mapped ones.
        const decorations = snapped
          ? buildDecorations(newState.doc, pageMap, geometry, options)
          : prev.decorations.map(tr.mapping, tr.doc)

        // Dbug check
        if (snapped) {
          const corrected = tr.getMeta(META.correction) as Map<number, number> | undefined
          logger.log('plugin', 'after snapBoundaries:', {
            metaCorrection: corrected ? Object.fromEntries(corrected) : null,
            heightCache: Object.fromEntries(prev.heightCache),
          })
        }

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

            const { correctionTr, pageHeights } = reflowController.onViewUpdate(
              view,
              state.pageMap,
              state.heightCache
            )

            if (pageHeights) {
              // Always dispatch to carry updated page heights for accurate spacers,
              // even when no structural correction was needed.
              const tr = correctionTr ?? view.state.tr
              tr.setMeta(META.pages, state.pageMap)
              tr.setMeta(META.correction, pageHeights)
              logger.log(
                'reflow',
                correctionTr ? 'dispatching correction + heights' : 'dispatching heights only'
              )
              view.dispatch(tr)
            } else {
              logger.log('reflow', 'debounced — no dispatch')
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

      // Only process user-initiated transactions (not our own pagination corrections).
      // Our transactions always set addToHistory: false via ptx.finalize().
      const userTrs = trs.filter((tr) => tr.docChanged && tr.getMeta('addToHistory') !== false)
      if (userTrs.length === 0) return null

      // ── User split cleanup ─────────────────────────────────────────────────
      //
      // When the user presses Enter inside a split fragment, ProseMirror creates
      // two nodes that both inherit the original splitId + splitPart attrs.
      // We detect these duplicates and clear attrs from the correct fragment:
      //
      //   User split of 'head': top fragment loses connection to tail → clear top,
      //                         keep attrs on bottom (it still precedes the tail).
      //   User split of 'tail': top fragment still follows the head → keep top,
      //                         clear attrs from bottom (it's a new separate para).
      //   User split of 'mid':  top stays 'mid', bottom stays 'mid'.
      //
      const fixupTr = fixupSplitAttrs(newState, pluginState.splitRegistry)
      return fixupTr
    },
  })
}

// ── User split attr cleanup ────────────────────────────────────────────────────

/**
 * Detects and corrects split-attr inconsistencies caused by user edits:
 *
 * USER SPLIT (Enter inside a split fragment):
 *   Both resulting nodes inherit the same splitId + splitPart.
 *   'head' split: top loses connection to tail → clear top, keep bottom.
 *   'tail' split: top still follows the head → keep top, clear bottom.
 *   'mid'  split: both remain 'mid' — no change needed.
 *
 * USER JOIN (Backspace between two paragraphs where one has split attrs):
 *   The surviving node ends up with attrs from whichever half PM kept (usually
 *   the top). We check each registered splitId: if only one fragment remains
 *   in the doc but the chain originally had more, the lonely fragment's attrs
 *   must be cleared (the logical split no longer exists).
 *   Specifically — if a splitId has a 'head' in the doc but no 'tail', or a
 *   'tail' but no 'head', clear the surviving fragment's attrs.
 *
 * Returns a correction transaction, or null if no fixup was needed.
 */
function fixupSplitAttrs(
  editorState: import('@tiptap/pm/state').EditorState,
  _registry: SplitRegistry
): import('@tiptap/pm/state').Transaction | null {
  const { doc } = editorState
  let tr: import('@tiptap/pm/state').Transaction | null = null

  // Collect splitId → { part → positions[] }
  const byId = new Map<string, Map<string, number[]>>()

  doc.descendants((node, pos) => {
    const { splitId, splitPart } = node.attrs as {
      splitId?: string | null
      splitPart?: string | null
    }
    if (!splitId || !splitPart) return
    const partMap = byId.get(splitId) ?? new Map<string, number[]>()
    const positions = partMap.get(splitPart) ?? []
    positions.push(pos)
    partMap.set(splitPart, positions)
    byId.set(splitId, partMap)
  })

  for (const [splitId, partMap] of byId) {
    const headPositions = partMap.get('head') ?? []
    const tailPositions = partMap.get('tail') ?? []
    const midPositions = partMap.get('mid') ?? []

    // ── Duplicate splitPart: user split a fragment ──────────────────────────
    for (const [splitPart, positions] of partMap) {
      if (positions.length < 2) continue
      positions.sort((a, b) => a - b)
      const clearPos = splitPart === 'head' ? positions[0] : positions[positions.length - 1]
      const clearNode = doc.nodeAt(clearPos)
      if (!clearNode) continue
      logger.log(
        'split',
        `fixupSplitAttrs: duplicate ${splitPart} for ${splitId} at [${positions}] — clearing ${clearPos}`
      )
      if (!tr) tr = editorState.tr
      tr.setNodeMarkup(clearPos, null, { ...clearNode.attrs, splitId: null, splitPart: null })
    }

    // ── Incomplete chain: user joined across a split boundary ───────────────
    // A valid split chain needs at least a head and a tail (mids are optional).
    // If head exists without tail (or vice versa), the chain is broken — clear
    // all surviving fragments of this splitId.
    const hasHead = headPositions.length > 0
    const hasTail = tailPositions.length > 0
    const hasMid = midPositions.length > 0

    if (hasHead !== hasTail) {
      // Chain is broken — clear all survivors
      const allPositions = [...headPositions, ...tailPositions, ...midPositions]
      logger.log(
        'split',
        `fixupSplitAttrs: broken chain for ${splitId} (head=${hasHead} mid=${hasMid} tail=${hasTail}) — clearing ${allPositions}`
      )
      for (const pos of allPositions) {
        const node = doc.nodeAt(pos)
        if (!node) continue
        if (!tr) tr = editorState.tr
        tr.setNodeMarkup(pos, null, { ...node.attrs, splitId: null, splitPart: null })
      }
    } else if (!hasHead && !hasTail && hasMid) {
      // Only mid fragments remain — also broken
      logger.log(
        'split',
        `fixupSplitAttrs: orphaned mid(s) for ${splitId} — clearing ${midPositions}`
      )
      for (const pos of midPositions) {
        const node = doc.nodeAt(pos)
        if (!node) continue
        if (!tr) tr = editorState.tr
        tr.setNodeMarkup(pos, null, { ...node.attrs, splitId: null, splitPart: null })
      }
    }
  }

  if (tr) tr.setMeta('addToHistory', false)
  return tr
}
