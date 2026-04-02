const MM_MAPPING = {
  Q: 0.25,
  mm: 1,
  cm: 10,
  in: 25.4,
  pc: 25.4 / 6,
  pt: 25.4 / 72,
  px: 25.4 / 96, // CSS definition - px is a logical unit, not actual pixels.
} as const

const ABSOLUTE_LENGTH_UNITS = ['mm', 'cm', 'in', 'pc', 'pt', 'px'] as const

const VIEWPORT_RELATIVE_LENGTH_UNITS = ['vw', 'vh', 'vi', 'vb', 'vmin', 'vmax'] as const

const FONT_RELATIVE_LENGTH_UNITS = ['em', 'rem'] as const

const CHARACTER_RELATIVE_LENGTH_UNITS = ['ex', 'cap', 'ch', 'ic'] as const

const LINE_HEIGHT_RELATIVE_UNITS = ['lh', 'rlh'] as const

const RELATIVE_UNITS = [
  ...VIEWPORT_RELATIVE_LENGTH_UNITS,
  ...FONT_RELATIVE_LENGTH_UNITS,
  ...CHARACTER_RELATIVE_LENGTH_UNITS,
  ...LINE_HEIGHT_RELATIVE_UNITS,
] as const

const ALL_UNITS = [...ABSOLUTE_LENGTH_UNITS, ...RELATIVE_UNITS, '%'] as const

const CONVERSION_NOT_SUPPORTED = ['ex', 'cap', 'ch', 'vi', 'vb'] as const

export type CSSUnit = (typeof ALL_UNITS)[number]

// number assume pixels
export interface CSSLengthContext<T extends number | CSSLength = number> {
  fontSize: T
  rootFontSize: T
  lineHeight: T
  rootLineHeight: T
  viewportWidth: T
  viewportHeight: T
  parentWidth: T
  parentHeight: T
}

export class CSSLength {
  private value: number
  private unit: string

  private static readonly VALID_UNITS = new Set(ALL_UNITS)
  private static readonly NUMBER_REGEX = /^[+-]?(\d+\.?\d*|\.\d+)$/
  private static readonly PCT_REGEX = /^[+-]?(\d+\.?\d*|\.\d+)%$/
  private static readonly LENGTH_REGEX = /^[+-]?(\d+\.?\d*|\.\d+)([a-zA-Z%]+)$/

  static parse(input: string | number) {
    if (typeof input === 'number') {
      return new CSSLength(input, 'px')
    }
    const trimmed = input.trim()
    let match: RegExpExecArray | null

    if (CSSLength.NUMBER_REGEX.test(trimmed)) {
      return new CSSLength(parseFloat(trimmed), 'px')
    } else if ((match = CSSLength.PCT_REGEX.exec(trimmed))) {
      return new CSSLength(parseFloat(match[1]), '%')
    } else if ((match = CSSLength.LENGTH_REGEX.exec(trimmed))) {
      const unit = match[2]
      if (!CSSLength.VALID_UNITS.has(unit as CSSUnit)) {
        throw new Error(`Invalid CSS unit: "${unit}" in "${input}"`)
      }
      return new CSSLength(parseFloat(match[1]), unit as CSSUnit)
    } else {
      throw new Error(`Invalid CSS length: "${input}"`)
    }
  }

  constructor(length: number, unit: CSSUnit, context?: CSSLengthContext) {
    if (!CSSLength.VALID_UNITS.has(unit)) {
      throw new Error(`Invalid CSS unit: "${unit}"`)
    }
    if (typeof length !== 'number' || isNaN(length)) {
      throw new Error(`Invalid CSS length value: "${length}"`)
    }
    this.value = length
    this.unit = unit
  }

  toString() {
    return `${this.value}${this.unit}`
  }
}
