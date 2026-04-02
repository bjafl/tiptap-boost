const MM_MAPPING = {
  Q: 0.25,
  mm: 1,
  cm: 10,
  in: 25.4,
  pc: 25.4 / 6,
  pt: 25.4 / 72,
  px: 25.4 / 96, // CSS definition - px is a logical unit, not actual pixels.
} as const

const ABSOLUTE_LENGTH_UNITS = ['mm', 'cm', 'in', 'pc', 'pt', 'px', 'Q'] as const

const VIEWPORT_RELATIVE_LENGTH_UNITS = ['vw', 'vh', 'vmin', 'vmax'] as const

const FONT_RELATIVE_LENGTH_UNITS = ['em', 'rem'] as const

const LINE_HEIGHT_RELATIVE_UNITS = ['lh', 'rlh'] as const

// Context-dependent units that need special handling (no reliable conversion without font metrics)
const CONTEXT_ONLY_UNITS = ['vi', 'vb', 'ex', 'cap', 'ch', 'ic'] as const

const RELATIVE_UNITS = [
  ...VIEWPORT_RELATIVE_LENGTH_UNITS,
  ...FONT_RELATIVE_LENGTH_UNITS,
  ...LINE_HEIGHT_RELATIVE_UNITS,
  ...CONTEXT_ONLY_UNITS,
] as const

const ALL_UNITS = [...ABSOLUTE_LENGTH_UNITS, ...RELATIVE_UNITS, '%'] as const

export type CSSUnit = (typeof ALL_UNITS)[number]
export type CSSLengthValue = `${number}${CSSUnit}` | number
// All context values are in px
export interface CSSLengthContext {
  fontSize: number
  rootFontSize: number
  lineHeight: number
  rootLineHeight: number
  viewportWidth: number
  viewportHeight: number
  /** Used for % — typically the containing block's inline size */
  parentWidth: number
}

export class CSSLength {
  private value: number
  private unit: CSSUnit

  private static readonly VALID_UNITS = new Set(ALL_UNITS)
  private static readonly NUMBER_REGEX = /^[+-]?(\d+\.?\d*|\.\d+)$/
  private static readonly PCT_REGEX = /^[+-]?(\d+\.?\d*|\.\d+)%$/
  private static readonly LENGTH_REGEX = /^[+-]?(\d+\.?\d*|\.\d+)([a-zA-Z%]+)$/

  constructor(value: number, unit: CSSUnit) {
    if (!CSSLength.VALID_UNITS.has(unit)) {
      throw new Error(`Invalid CSS unit: "${unit}"`)
    }
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`Invalid CSS length value: "${value}"`)
    }
    this.value = value
    this.unit = unit
  }

  static parse(input: string | number): CSSLength {
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

  /** Convert to CSS pixels. Absolute units require no context. */
  toPx(context?: CSSLengthContext): number {
    const unit = this.unit

    // Absolute units — convert via mm as intermediate
    if (unit in MM_MAPPING) {
      const mm = this.value * MM_MAPPING[unit as keyof typeof MM_MAPPING]
      return mm / MM_MAPPING.px
    }

    const ctx = context
    if (!ctx) {
      throw new Error(`Context required to convert "${unit}" to px`)
    }

    switch (unit) {
      case 'em':
        return this.value * ctx.fontSize
      case 'rem':
        return this.value * ctx.rootFontSize
      case 'vw':
        return (this.value / 100) * ctx.viewportWidth
      case 'vh':
        return (this.value / 100) * ctx.viewportHeight
      case 'vmin':
        return (this.value / 100) * Math.min(ctx.viewportWidth, ctx.viewportHeight)
      case 'vmax':
        return (this.value / 100) * Math.max(ctx.viewportWidth, ctx.viewportHeight)
      case 'lh':
        return this.value * ctx.lineHeight
      case 'rlh':
        return this.value * ctx.rootLineHeight
      case '%':
        return (this.value / 100) * ctx.parentWidth
      case 'ic':
        // Approximation: treat as font-size (advance of a fullwidth glyph ≈ 1em)
        return this.value * ctx.fontSize
      default:
        throw new Error(
          `Conversion to px not supported for unit "${unit}" (no reliable metric without font data)`
        )
    }
  }

  mul(factor: number): CSSLength {
    return new CSSLength(this.value * factor, this.unit)
  }

  div(divisor: number): CSSLength {
    return new CSSLength(this.value / divisor, this.unit)
  }

  add(other: CSSLength, context?: CSSLengthContext): CSSLength {
    if (this.unit === other.unit) {
      return new CSSLength(this.value + other.value, this.unit)
    }
    return new CSSLength(this.toPx(context) + other.toPx(context), 'px')
  }

  sub(other: CSSLength, context?: CSSLengthContext): CSSLength {
    if (this.unit === other.unit) {
      return new CSSLength(this.value - other.value, this.unit)
    }
    return new CSSLength(this.toPx(context) - other.toPx(context), 'px')
  }

  equals(other: CSSLength, context?: CSSLengthContext): boolean {
    return CSSLength.compare(this, other, context) === 0
  }

  /** Returns negative, zero, or positive — same contract as Array.sort compareFn. */
  static compare(a: CSSLength, b: CSSLength, context?: CSSLengthContext): number {
    if (a.unit === b.unit) return a.value - b.value
    return a.toPx(context) - b.toPx(context)
  }

  /** Convenience: parse and convert to px in one call. */
  static toPixels(input: number | string, context?: CSSLengthContext): number {
    return CSSLength.parse(input).toPx(context)
  }

  static sum(lengths: (CSSLength | CSSLengthValue)[], context?: CSSLengthContext): CSSLength {
    if (lengths.every((len) => typeof len === 'number')) {
      const total = (lengths as number[]).reduce((acc, curr) => acc + curr, 0)
      return new CSSLength(total, 'px')
    }
    const cssLengths = lengths.map((len) => (len instanceof CSSLength ? len : CSSLength.parse(len)))
    if (cssLengths.every((len) => len.unit === cssLengths[0].unit)) {
      const totalValue = cssLengths.reduce((acc, curr) => acc + curr.value, 0)
      return new CSSLength(totalValue, cssLengths[0].unit)
    }
    return cssLengths.reduce((acc, curr) => acc.add(curr, context), new CSSLength(0, 'px'))
  }

  toString(): string {
    return `${this.value}${this.unit}`
  }
}
