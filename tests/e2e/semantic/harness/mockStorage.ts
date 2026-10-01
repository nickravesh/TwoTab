/**
 * In-Memory Mock of chrome.storage.local for Offline E2E Testing
 *
 * Provides:
 * 1. Concurrency-safe in-memory map emulation.
 * 2. Deep clone serialization (simulating real Chrome extension storage).
 * 3. Fault injection (quota exceeded, write failures, artificial latency).
 * 4. Embedding vector inspection guard (asserts no Float32Array or 384-d vectors stored).
 * 5. Snapshot history inspection for rolling backups.
 */

import type { BackupSnapshot, TabGroup } from '@/lib/storage';

export interface StorageChange {
  oldValue?: any;
  newValue?: any;
}

export type StorageChangeCallback = (
  changes: Record<string, StorageChange>,
  areaName: string
) => void;

export class MockLocalStorage {
  private store = new Map<string, any>();
  private listeners: StorageChangeCallback[] = [];
  public simulateQuotaError = false;
  public simulateWriteError = false;
  public writeCallCount = 0;
  public readCallCount = 0;

  constructor(initialData?: Record<string, any>) {
    if (initialData) {
      for (const [k, v] of Object.entries(initialData)) {
        this.store.set(k, JSON.parse(JSON.stringify(v)));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // chrome.storage.local API Emulation
  // ---------------------------------------------------------------------------

  public get(
    keys?: string | string[] | Record<string, any> | null,
    callback?: (items: Record<string, any>) => void
  ): Promise<Record<string, any>> {
    this.readCallCount++;
    const result: Record<string, any> = {};

    if (keys === null || keys === undefined) {
      for (const [k, v] of this.store.entries()) {
        result[k] = JSON.parse(JSON.stringify(v));
      }
    } else if (typeof keys === 'string') {
      if (this.store.has(keys)) {
        result[keys] = JSON.parse(JSON.stringify(this.store.get(keys)));
      }
    } else if (Array.isArray(keys)) {
      for (const k of keys) {
        if (this.store.has(k)) {
          result[k] = JSON.parse(JSON.stringify(this.store.get(k)));
        }
      }
    } else if (typeof keys === 'object') {
      for (const [k, defaultVal] of Object.entries(keys)) {
        if (this.store.has(k)) {
          result[k] = JSON.parse(JSON.stringify(this.store.get(k)));
        } else {
          result[k] = defaultVal;
        }
      }
    }

    if (callback) {
      callback(result);
    }
    return Promise.resolve(result);
  }

  public set(
    items: Record<string, any>,
    callback?: () => void
  ): Promise<void> {
    this.writeCallCount++;

    if (this.simulateQuotaError) {
      const err = new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
      if (typeof chrome !== 'undefined') {
        (chrome.runtime as any).lastError = err;
      }
      if (callback) {
        callback();
        return Promise.resolve();
      }
      return Promise.reject(err);
    }

    if (this.simulateWriteError) {
      const err = new Error('Simulated atomic write failure');
      if (typeof chrome !== 'undefined') {
        (chrome.runtime as any).lastError = err;
      }
      if (callback) {
        callback();
        return Promise.resolve();
      }
      return Promise.reject(err);
    }

    if (typeof chrome !== 'undefined') {
      (chrome.runtime as any).lastError = undefined;
    }

    const changes: Record<string, StorageChange> = {};

    for (const [k, v] of Object.entries(items)) {
      const oldValue = this.store.has(k)
        ? JSON.parse(JSON.stringify(this.store.get(k)))
        : undefined;
      const newValue = JSON.parse(JSON.stringify(v));
      this.store.set(k, newValue);
      changes[k] = { oldValue, newValue };
    }

    for (const listener of this.listeners) {
      listener(changes, 'local');
    }

    if (callback) {
      callback();
    }
    return Promise.resolve();
  }

  public remove(
    keys: string | string[],
    callback?: () => void
  ): Promise<void> {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const changes: Record<string, StorageChange> = {};

    for (const k of keyList) {
      if (this.store.has(k)) {
        const oldValue = JSON.parse(JSON.stringify(this.store.get(k)));
        this.store.delete(k);
        changes[k] = { oldValue, newValue: undefined };
      }
    }

    for (const listener of this.listeners) {
      listener(changes, 'local');
    }

    if (callback) {
      callback();
    }
    return Promise.resolve();
  }

  public clear(callback?: () => void): Promise<void> {
    this.store.clear();
    if (callback) callback();
    return Promise.resolve();
  }

  public getBytesInUse(
    _keys?: string | string[] | null,
    callback?: (bytes: number) => void
  ): Promise<number> {
    let bytes = 0;
    for (const [k, v] of this.store.entries()) {
      bytes += k.length + JSON.stringify(v).length;
    }
    if (callback) callback(bytes);
    return Promise.resolve(bytes);
  }

  // ---------------------------------------------------------------------------
  // Change Listeners
  // ---------------------------------------------------------------------------

  public addListener(cb: StorageChangeCallback) {
    this.listeners.push(cb);
  }

  public removeListener(cb: StorageChangeCallback) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }

  // ---------------------------------------------------------------------------
  // Test Inspection & Invariant Helpers
  // ---------------------------------------------------------------------------

  public getAllData(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of this.store.entries()) {
      out[k] = JSON.parse(JSON.stringify(v));
    }
    return out;
  }

  public getSnapshots(): BackupSnapshot[] {
    const raw = this.store.get('_backupSnapshots');
    return raw ? JSON.parse(JSON.stringify(raw)) : [];
  }

  public getTabGroups(): TabGroup[] {
    const raw = this.store.get('tabGroups');
    return raw ? JSON.parse(JSON.stringify(raw)) : [];
  }

  /**
   * Asserts that no raw embedding vectors or tensors exist anywhere in storage.
   * Scans all keys, objects, and nested arrays for arrays of numbers resembling 384-d vectors.
   */
  public assertNoRawEmbeddings(): void {
    const scan = (val: any, path: string) => {
      if (val === null || val === undefined) return;
      if (val instanceof Float32Array || val instanceof Float64Array) {
        throw new Error(`Violation: raw typed array found at ${path}`);
      }
      if (Array.isArray(val)) {
        if (
          val.length === 384 &&
          val.every((item) => typeof item === 'number' && !isNaN(item))
        ) {
          throw new Error(`Violation: raw 384-dimensional vector found at ${path}`);
        }
        val.forEach((item, idx) => scan(item, `${path}[${idx}]`));
      } else if (typeof val === 'object') {
        for (const [k, v] of Object.entries(val)) {
          if (
            k.toLowerCase().includes('embedding') ||
            k.toLowerCase().includes('tensor') ||
            k.toLowerCase().includes('vector')
          ) {
            throw new Error(`Violation: embedding key '${k}' found in storage at ${path}`);
          }
          scan(v, `${path}.${k}`);
        }
      }
    };

    for (const [k, v] of this.store.entries()) {
      if (
        k.toLowerCase().includes('embedding') ||
        k.toLowerCase().includes('tensor') ||
        k.toLowerCase().includes('vector')
      ) {
        throw new Error(`Violation: embedding key '${k}' found in root storage`);
      }
      scan(v, k);
    }
  }

  public reset(): void {
    this.store.clear();
    this.listeners = [];
    this.simulateQuotaError = false;
    this.simulateWriteError = false;
    this.writeCallCount = 0;
    this.readCallCount = 0;
  }
}

/**
 * Installs MockLocalStorage onto globalThis.chrome.storage.local
 */
export function setupMockChromeStorage(initialData?: Record<string, any>): MockLocalStorage {
  const mock = new MockLocalStorage(initialData);

  if (typeof globalThis.chrome === 'undefined') {
    (globalThis as any).chrome = {};
  }
  if (!globalThis.chrome.runtime) {
    (globalThis.chrome as any).runtime = {
      lastError: undefined,
      getURL: (path: string) => `chrome-extension://mock-id/${path}`,
      sendMessage: () => Promise.resolve({}),
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
      },
    };
  }

  (globalThis.chrome as any).storage = {
    local: {
      get: (keys: any, cb: any) => mock.get(keys, cb),
      set: (items: any, cb: any) => mock.set(items, cb),
      remove: (keys: any, cb: any) => mock.remove(keys, cb),
      clear: (cb: any) => mock.clear(cb),
      getBytesInUse: (keys: any, cb: any) => mock.getBytesInUse(keys, cb),
    },
    onChanged: {
      addListener: (cb: any) => mock.addListener(cb),
      removeListener: (cb: any) => mock.removeListener(cb),
    },
  };

  return mock;
}
