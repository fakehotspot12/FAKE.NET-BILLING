'use strict';

class BoundedJsonCache {
  constructor(options = {}) {
    this.maxEntries = Math.max(1, Number(options.maxEntries) || 24);
    this.maxBytes = Math.max(1, Number(options.maxBytes) || 24 * 1024 * 1024);
    this.maxEntryBytes = Math.min(
      this.maxBytes,
      Math.max(1, Number(options.maxEntryBytes) || 2 * 1024 * 1024)
    );
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.entries = new Map();
    this.totalBytes = 0;
  }

  delete(key) {
    const existing = this.entries.get(key);
    if (!existing) return false;
    this.totalBytes = Math.max(0, this.totalBytes - existing.bytes);
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  pruneExpired(now = this.now()) {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) continue;
      if (this.delete(key)) removed += 1;
    }
    return removed;
  }

  prune() {
    this.pruneExpired();
    while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
  }

  getRaw(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.delete(key);
      return undefined;
    }

    // Refresh insertion order so pruning removes the least recently used entry.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.raw;
  }

  get(key) {
    const raw = this.getRaw(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      this.delete(key);
      return undefined;
    }
  }

  setRaw(key, raw, ttlMs) {
    if (!key || typeof raw !== 'string') return false;
    const bytes = Buffer.byteLength(raw);
    this.delete(key);
    if (bytes > this.maxEntryBytes || bytes > this.maxBytes) return false;

    this.entries.set(key, {
      raw,
      bytes,
      expiresAt: this.now() + Math.max(1, Number(ttlMs) || 1)
    });
    this.totalBytes += bytes;
    this.prune();
    return this.entries.has(key);
  }

  set(key, value, ttlMs) {
    let raw;
    try {
      raw = JSON.stringify(value);
    } catch {
      return false;
    }
    if (raw === undefined) return false;
    return this.setRaw(key, raw, ttlMs);
  }

  stats() {
    return {
      entries: this.entries.size,
      bytes: this.totalBytes,
      maxEntries: this.maxEntries,
      maxBytes: this.maxBytes,
      maxEntryBytes: this.maxEntryBytes
    };
  }
}

module.exports = { BoundedJsonCache };
