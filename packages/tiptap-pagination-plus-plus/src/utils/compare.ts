export function deepEqualIterative(a: any, b: any): boolean {
  // Quick reference check
  if (a === b) return true

  // One is null or type mismatch
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) {
    return false
  }

  // Stack for iterative traversal
  const stack = [{ x: a, y: b }]

  while (stack.length) {
    const _stackItem = stack.pop()
    if (!_stackItem) continue
    const { x, y } = _stackItem

    // If primitive mismatch
    if (x === y) continue
    if (typeof x !== typeof y) return false
    if (typeof x !== 'object') return false

    if (x == null || y == null) return false

    const xKeys = Object.keys(x)
    const yKeys = Object.keys(y)

    // Length mismatch
    if (xKeys.length !== yKeys.length) return false

    // Check keys
    for (const key of xKeys) {
      if (!(key in y)) return false

      const xVal = x[key]
      const yVal = y[key]

      // Same reference — skip
      if (xVal === yVal) continue

      // Push nested objects/arrays to stack
      if (typeof xVal === 'object' && typeof yVal === 'object') {
        stack.push({ x: xVal, y: yVal })
      } else {
        // Primitive compare
        if (xVal !== yVal) return false
      }
    }
  }

  return true
}

export function mapNumberEqual(a: Map<number, number>, b: Map<number, number>) {
  if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false

  for (const [k, v] of a) {
    if (b.get(k) !== v) return false
  }
  return true
}
