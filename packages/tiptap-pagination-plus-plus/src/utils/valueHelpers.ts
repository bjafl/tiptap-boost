type MapOrRecord<T extends string | number, V> = Record<T, V> | Map<T, V>

export function cascadeMaps<T extends string | number, V>(
  records: MapOrRecord<T, V>[] | MapOrRecord<T, V>,
  keys: (T | undefined)[][] | (T | undefined)[] | T | undefined,
  fallback: V
): V
export function cascadeMaps<T extends string | number, V>(
  records: MapOrRecord<T, V>[] | MapOrRecord<T, V>,
  keys: (T | undefined)[][] | (T | undefined)[] | T | undefined,
  fallback?: V
): V | undefined
export function cascadeMaps<T extends string | number, V>(
  records: MapOrRecord<T, V>[] | MapOrRecord<T, V>,
  keys: (T | undefined)[][] | (T | undefined)[] | T | undefined,
  fallback?: V
): V | undefined {
  if (keys === undefined) {
    return fallback
  }
  const getKeys = !Array.isArray(keys)
    ? () => [keys]
    : Array.isArray(keys[0])
      ? (index: number) => keys[index] as (T | undefined)[]
      : () => keys as (T | undefined)[]
  const getVal = (record: MapOrRecord<T, V>, key: T) =>
    record instanceof Map ? record.get(key) : (record as Record<T, V>)[key]

  const recordsArray = Array.isArray(records) ? records : [records]
  recordsArray.forEach((record, index) => {
    for (const key of getKeys(index)) {
      if (key === undefined) continue
      if (key in record) {
        const val = getVal(record, key)
        if (val !== undefined) {
          return val
        }
      }
    }
  })
  return fallback
}
