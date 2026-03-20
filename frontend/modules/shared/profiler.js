/**
 * Frontend Profiler Module
 *
 * Provides performance profiling for the frontend, similar to the Python
 * exporter/profiling.py module. Uses the browser Performance API for
 * high-precision timing.
 *
 * Usage:
 *   import { profiler } from './profiler.js';
 *
 *   // Enable profiling
 *   profiler.enabled = true;
 *
 *   // Time a section
 *   profiler.start('mySection');
 *   // ... work ...
 *   profiler.end('mySection');
 *
 *   // Or use the section helper for automatic start/end
 *   const result = profiler.section('mySection', () => {
 *     return doWork();
 *   });
 *
 *   // Get report
 *   console.log(profiler.report());
 *
 * @module shared/profiler
 */

class FrontendProfiler {
  constructor() {
    this._enabled = false;
    this._timings = new Map();
    this._activeTimers = new Map();
    this._stack = [];
  }

  /**
   * Check if profiling is enabled
   */
  get enabled() {
    return this._enabled;
  }

  /**
   * Enable or disable profiling
   */
  set enabled(value) {
    this._enabled = value;
    if (value) {
      this.reset();
    }
  }

  /**
   * Record a timing measurement
   * @private
   */
  _record(name, elapsed) {
    if (!this._timings.has(name)) {
      this._timings.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: 0
      });
    }
    const entry = this._timings.get(name);
    entry.count += 1;
    entry.total += elapsed;
    entry.min = Math.min(entry.min, elapsed);
    entry.max = Math.max(entry.max, elapsed);
  }

  /**
   * Start timing a section
   * @param {string} name - Section name
   */
  start(name) {
    if (!this._enabled) return;

    // Create hierarchical name if nested
    const parent = this._stack.length > 0 ? this._stack[this._stack.length - 1] : null;
    const fullName = parent ? `${parent} > ${name}` : name;
    this._stack.push(fullName);
    this._activeTimers.set(fullName, performance.now());
  }

  /**
   * End timing a section
   * @param {string} name - Section name (must match start)
   */
  end(name) {
    if (!this._enabled) return;

    // Find the full name in the stack
    const parent = this._stack.length > 1 ? this._stack[this._stack.length - 2] : null;
    const fullName = parent ? `${parent} > ${name}` : name;

    const startTime = this._activeTimers.get(fullName);
    if (startTime !== undefined) {
      const elapsed = performance.now() - startTime;
      this._record(fullName, elapsed);
      this._activeTimers.delete(fullName);
    }

    // Pop from stack
    if (this._stack.length > 0 && this._stack[this._stack.length - 1] === fullName) {
      this._stack.pop();
    }
  }

  /**
   * Time a synchronous section using a callback
   * @param {string} name - Section name
   * @param {Function} fn - Function to execute
   * @returns {*} Result of the function
   */
  section(name, fn) {
    if (!this._enabled) {
      return fn();
    }

    this.start(name);
    try {
      return fn();
    } finally {
      this.end(name);
    }
  }

  /**
   * Time an async section using a callback
   * @param {string} name - Section name
   * @param {Function} fn - Async function to execute
   * @returns {Promise<*>} Result of the function
   */
  async sectionAsync(name, fn) {
    if (!this._enabled) {
      return fn();
    }

    this.start(name);
    try {
      return await fn();
    } finally {
      this.end(name);
    }
  }

  /**
   * Increment a counter (for tracking call counts without timing)
   * @param {string} name - Counter name
   */
  count(name) {
    if (!this._enabled) return;

    if (!this._timings.has(name)) {
      this._timings.set(name, {
        count: 0,
        total: 0,
        min: Infinity,
        max: 0
      });
    }
    this._timings.get(name).count += 1;
  }

  /**
   * Generate a human-readable profiling report
   * @returns {string} Formatted report
   */
  report() {
    if (this._timings.size === 0) {
      return 'No profiling data collected.';
    }

    const lines = [
      '',
      '='.repeat(70),
      'FRONTEND PROFILING REPORT',
      '='.repeat(70),
      ''
    ];

    // Sort by total time descending
    const sortedEntries = [...this._timings.entries()]
      .sort((a, b) => b[1].total - a[1].total);

    for (const [name, data] of sortedEntries) {
      const avg = data.count > 0 ? data.total / data.count : 0;
      const minVal = data.min !== Infinity ? data.min : 0;

      lines.push(`${name}:`);
      lines.push(
        `  total: ${data.total.toFixed(1)}ms | ` +
        `calls: ${data.count} | ` +
        `avg: ${avg.toFixed(2)}ms | ` +
        `min: ${minVal.toFixed(2)}ms | ` +
        `max: ${data.max.toFixed(2)}ms`
      );
      lines.push('');
    }

    lines.push('='.repeat(70));
    return lines.join('\n');
  }

  /**
   * Get profiling data as an object
   * @returns {Object} Profiling data
   */
  getData() {
    const result = {};
    for (const [name, data] of this._timings.entries()) {
      const avg = data.count > 0 ? data.total / data.count : 0;
      result[name] = {
        total_ms: data.total,
        count: data.count,
        avg_ms: avg,
        min_ms: data.min !== Infinity ? data.min : 0,
        max_ms: data.max
      };
    }
    return result;
  }

  /**
   * Clear all profiling data
   */
  reset() {
    this._timings.clear();
    this._activeTimers.clear();
    this._stack = [];
  }
}

// Singleton instance
export const profiler = new FrontendProfiler();

// Make profiler available globally for debugging and Playwright tests
if (typeof window !== 'undefined') {
  window.__profiler__ = profiler;

  // Auto-enable profiling if URL parameter is set
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('profiling') === '1') {
    profiler.enabled = true;
    console.log('[Profiler] Auto-enabled via URL parameter');
  }
} else if (typeof self !== 'undefined') {
  // Worker context - expose on self
  self.__profiler__ = profiler;
}

/**
 * Check if profiling should be enabled based on URL parameter or localStorage
 * @returns {boolean}
 */
export function isProfilingEnabled() {
  if (typeof window === 'undefined') return false;

  // Check URL parameter: ?profiling=1
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('profiling') === '1') return true;

  // Check localStorage
  if (localStorage.getItem('frontendProfiling') === '1') return true;

  return false;
}

/**
 * Auto-enable profiling based on URL/localStorage
 */
export function autoEnableFromConfig() {
  if (isProfilingEnabled()) {
    profiler.enabled = true;
    console.log('[Profiler] Profiling enabled');
  }
}

export default profiler;
