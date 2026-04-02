import { DEFAULT_STYLE_PREFIX } from '../constants'
import { PaginationPlusStorage } from '../types'

const VAR_SUFFIX_MAP = {
  pageWidth: 'page-width',
  pageHeight: 'page-height',
  marginTop: 'margin-top',
  marginBottom: 'margin-bottom',
  marginLeft: 'margin-left',
  marginRight: 'margin-right',
  contentMarginTop: 'content-margin-top',
  contentMarginBottom: 'content-margin-bottom',
  maxContentChildHeight: 'max-content-child-height',
} as const

type VarKey = keyof typeof VAR_SUFFIX_MAP
type VarSuffix = (typeof VAR_SUFFIX_MAP)[VarKey]
type VarName = `--${typeof DEFAULT_STYLE_PREFIX}-${VarSuffix}`

function getVarName(varKey: VarKey): VarName {
  const suffix = VAR_SUFFIX_MAP[varKey]
  return `--${DEFAULT_STYLE_PREFIX}-${suffix}`
}

function extractValuesFromStorage(storage: PaginationPlusStorage): Record<VarKey, string> {
  const { width: pageWidth, height: pageHeight } = storage.pageSize
  const {
    top: marginTop,
    bottom: marginBottom,
    left: marginLeft,
    right: marginRight,
  } = storage.pageMargins
  const contentMarginTop = storage.header.margins.top
  const contentMarginBottom = storage.footer.margins.bottom
  const maxContentChildHeight = pageHeight - contentMarginTop - contentMarginBottom
  return {
    pageWidth: `${pageWidth}px`,
    pageHeight: `${pageHeight}px`,
    marginTop: `${marginTop}px`,
    marginBottom: `${marginBottom}px`,
    marginLeft: `${marginLeft}px`,
    marginRight: `${marginRight}px`,
    contentMarginTop: `${contentMarginTop}px`,
    contentMarginBottom: `${contentMarginBottom}px`,
    maxContentChildHeight: `${maxContentChildHeight}px`, //TODO
  }
}

export function syncCssVars(el: HTMLElement, storage: PaginationPlusStorage, keys?: VarKey[]) {
  const toSync: VarKey[] = keys ?? (Object.keys(VAR_SUFFIX_MAP) as VarKey[])
  const values = extractValuesFromStorage(storage)
  for (const key of toSync) {
    const varName = getVarName(key)
    if (varName && values[key] != null) {
      el.style.setProperty(varName, values[key])
    }
  }
}

export function clearCssVars(el: HTMLElement) {
  for (const key in VAR_SUFFIX_MAP) {
    const varName = getVarName(key as VarKey)
    el.style.removeProperty(varName)
  }
}
