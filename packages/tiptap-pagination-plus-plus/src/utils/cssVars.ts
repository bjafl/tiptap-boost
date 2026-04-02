import { DEFAULT_STYLE_PREFIX } from '../constants'
import { PaginationPlusStorage } from '../types'
import { CSSLengthValue } from './CSSLength'

const VAR_SUFFIX_MAP = {
  pageWidth: 'page-width',
  pageHeight: 'page-height',
  pageMarginTop: 'page-margin-top',
  pageMarginBottom: 'page-margin-bottom',
  pageMarginLeft: 'page-margin-left',
  pageMarginRight: 'page-margin-right',
  // contentMarginTop: 'content-margin-top',
  // contentMarginBottom: 'content-margin-bottom',
  // maxContentChildHeight: 'max-content-child-height',
} as const

type VarKey = keyof typeof VAR_SUFFIX_MAP
// type VarSuffix = (typeof VAR_SUFFIX_MAP)[VarKey]
// type VarName = `--${string}-${VarSuffix}`

function getVarName(varKey: VarKey, prefix: string = DEFAULT_STYLE_PREFIX): string {
  const suffix = VAR_SUFFIX_MAP[varKey]
  return `--${prefix}-${suffix}`
}

function extractValuesFromStorage(storage: PaginationPlusStorage): Record<VarKey, CSSLengthValue> {
  const { width: pageWidth, height: pageHeight } = storage.pageSize
  const {
    top: marginTop,
    bottom: marginBottom,
    left: marginLeft,
    right: marginRight,
  } = storage.pageMargins
  // const contentMarginTop = storage.header.margins.top
  // const contentMarginBottom = storage.footer.margins.bottom
  // const maxContentChildHeight = pageHeight - contentMarginTop - contentMarginBottom
  return {
    pageWidth: pageWidth,
    pageHeight: pageHeight,
    pageMarginTop: marginTop,
    pageMarginBottom: marginBottom,
    pageMarginLeft: marginLeft,
    pageMarginRight: marginRight,
    // contentMarginTop: contentMarginTop,
    // contentMarginBottom: contentMarginBottom,
    // maxContentChildHeight: maxContentChildHeight, //TODO
  }
}

export function syncCssVars(el: HTMLElement, storage: PaginationPlusStorage, keys?: VarKey[]) {
  const toSync: VarKey[] = keys ?? (Object.keys(VAR_SUFFIX_MAP) as VarKey[])
  const values = extractValuesFromStorage(storage)
  for (const key of toSync) {
    const varName = getVarName(key, storage.cssClassPrefix)
    if (varName && values[key] != null) {
      const value = values[key]
      el.style.setProperty(varName, typeof value === 'number' ? `${value}px` : value)
    }
  }
}

export function clearCssVars(el: HTMLElement) {
  for (const key in VAR_SUFFIX_MAP) {
    const varName = getVarName(key as VarKey)
    el.style.removeProperty(varName)
  }
}
