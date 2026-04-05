/**
 * Lightweight debug logger for the pagination plugin.
 *
 * Channels:
 *   plugin    — plugin state transitions (init, apply, meta)
 *   reflow    — reflow cycle entry/exit, dirty pages
 *   overflow  — overflow/underflow detection results
 *   split     — split and fuse operations
 *   deco      — decoration rebuilds
 *   pagemap   — PageMap mutations
 *
 * Enable all:    PaginationLogger.enable()
 * Enable some:   PaginationLogger.enable('reflow', 'split')
 * Disable all:   PaginationLogger.disable()
 *
 * Or via query string: ?paginationDebug=reflow,split
 */

export type LogChannel = 'plugin' | 'reflow' | 'overflow' | 'split' | 'deco' | 'pagemap'

const CHANNEL_STYLES: Record<LogChannel, string> = {
  plugin:   'color: #7c3aed; font-weight: bold',
  reflow:   'color: #0284c7; font-weight: bold',
  overflow: 'color: #b45309; font-weight: bold',
  split:    'color: #dc2626; font-weight: bold',
  deco:     'color: #059669; font-weight: bold',
  pagemap:  'color: #6b7280; font-weight: bold',
}

const CHANNEL_LABELS: Record<LogChannel, string> = {
  plugin:   '[pg:plugin]',
  reflow:   '[pg:reflow]',
  overflow: '[pg:overflow]',
  split:    '[pg:split]',
  deco:     '[pg:deco]',
  pagemap:  '[pg:pagemap]',
}

class Logger {
  private enabled: Set<LogChannel> = new Set()

  enable(...channels: LogChannel[]): void {
    if (channels.length === 0) {
      for (const ch of Object.keys(CHANNEL_LABELS) as LogChannel[]) {
        this.enabled.add(ch)
      }
    } else {
      for (const ch of channels) this.enabled.add(ch)
    }
  }

  disable(...channels: LogChannel[]): void {
    if (channels.length === 0) {
      this.enabled.clear()
    } else {
      for (const ch of channels) this.enabled.delete(ch)
    }
  }

  isEnabled(channel: LogChannel): boolean {
    return this.enabled.has(channel)
  }

  log(channel: LogChannel, message: string, ...data: unknown[]): void {
    if (!this.enabled.has(channel)) return
    const label = CHANNEL_LABELS[channel]
    const style = CHANNEL_STYLES[channel]
    if (data.length > 0) {
      console.log(`%c${label}%c ${message}`, style, '', ...data)
    } else {
      console.log(`%c${label}%c ${message}`, style, '')
    }
  }

  group(channel: LogChannel, label: string, fn: () => void): void {
    if (!this.enabled.has(channel)) return
    const prefix = CHANNEL_LABELS[channel]
    const style = CHANNEL_STYLES[channel]
    console.groupCollapsed(`%c${prefix}%c ${label}`, style, '')
    fn()
    console.groupEnd()
  }
}

export const logger = new Logger()

// Auto-enable channels from query string: ?paginationDebug=reflow,split
if (typeof window !== 'undefined') {
  try {
    const param = new URLSearchParams(window.location.search).get('paginationDebug')
    if (param !== null) {
      const channels = param === '' || param === 'all'
        ? []
        : (param.split(',').filter(Boolean) as LogChannel[])
      logger.enable(...channels)
    }
  } catch {
    // not in a browser context with location
  }
}
