import { MAX_CACHE_SIZE } from './config';
import { AtomicKey } from './types';

export class StyleCache {
  private cache: Map<string, Map<AtomicKey, string>>;
  private maxSize: number;
  private evictionFactor: number;

  constructor(maxSize: number = MAX_CACHE_SIZE, evictionFactor: number = 0.25) {
    this.maxSize = maxSize;
    this.evictionFactor = evictionFactor;
    this.cache = new Map<string, Map<AtomicKey, string>>();
  }

  private evict(n: number): void {
    const it = this.cache.keys();
    for (let i = 0; i < n; i++) {
      const { value, done } = it.next();
      if (done) break;
      this.cache.delete(value);
    }
  }

  get(styleStr: string): Map<AtomicKey, string> | undefined {
    return this.cache.get(styleStr);
  }

  set(styleStr: string, styles: Map<AtomicKey, string>): void {
    if (this.cache.size >= this.maxSize) {
      this.evict(Math.ceil(this.maxSize * this.evictionFactor));
    }
    this.cache.set(styleStr, styles);
  }

  has(styleStr: string): boolean {
    return this.cache.has(styleStr);
  }

  clear(): void {
    this.cache.clear();
  }

  delete(styleStr: string): boolean {
    return this.cache.delete(styleStr);
  }

  size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}

export const STYLE_CACHE = new StyleCache();
