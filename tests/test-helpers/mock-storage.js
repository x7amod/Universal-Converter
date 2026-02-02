/**
 * Mock Storage Provider for Testing
 * In-memory chrome.storage.local implementation with error injection capabilities
 */

class MockStorage {
  constructor() {
    this._data = {};
    this._errorOnGet = null;
    this._errorOnSet = null;
    this._errorOnRemove = null;
    this._operationLog = [];
    this._getCallCount = 0;
    this._setCallCount = 0;
    this._removeCallCount = 0;
  }

  /**
   * Get data from storage (matches chrome.storage.local.get API)
   * @param {string|string[]} keys - Key(s) to retrieve
   * @returns {Promise<Object>} Object with requested keys
   */
  async get(keys) {
    this._getCallCount++;
    this._operationLog.push({ operation: 'get', keys, timestamp: Date.now() });
    
    if (this._errorOnGet) {
      const error = this._errorOnGet;
      this._errorOnGet = null; // Reset after throwing
      throw error;
    }
    
    if (typeof keys === 'string') {
      return { [keys]: this._data[keys] };
    }
    
    if (Array.isArray(keys)) {
      const result = {};
      for (const key of keys) {
        if (this._data[key] !== undefined) {
          result[key] = this._data[key];
        }
      }
      return result;
    }
    
    // If no keys specified, return all data
    return { ...this._data };
  }

  /**
   * Set data in storage (matches chrome.storage.local.set API)
   * @param {Object} items - Object with key-value pairs to store
   * @returns {Promise<void>}
   */
  async set(items) {
    this._setCallCount++;
    this._operationLog.push({ operation: 'set', items, timestamp: Date.now() });
    
    if (this._errorOnSet) {
      const error = this._errorOnSet;
      this._errorOnSet = null; // Reset after throwing
      throw error;
    }
    
    for (const [key, value] of Object.entries(items)) {
      this._data[key] = JSON.parse(JSON.stringify(value)); // Deep clone to simulate real storage
    }
  }

  /**
   * Remove data from storage (matches chrome.storage.local.remove API)
   * @param {string|string[]} keys - Key(s) to remove
   * @returns {Promise<void>}
   */
  async remove(keys) {
    this._removeCallCount++;
    this._operationLog.push({ operation: 'remove', keys, timestamp: Date.now() });
    
    if (this._errorOnRemove) {
      const error = this._errorOnRemove;
      this._errorOnRemove = null; // Reset after throwing
      throw error;
    }
    
    const keysArray = Array.isArray(keys) ? keys : [keys];
    for (const key of keysArray) {
      delete this._data[key];
    }
  }

  /**
   * Clear all data from storage
   * @returns {Promise<void>}
   */
  async clear() {
    this._operationLog.push({ operation: 'clear', timestamp: Date.now() });
    this._data = {};
  }

  // Test helper methods

  /**
   * Set error to throw on next get operation
   * @param {Error} error - Error to throw
   */
  setErrorOnGet(error) {
    this._errorOnGet = error;
  }

  /**
   * Set error to throw on next set operation
   * @param {Error} error - Error to throw
   */
  setErrorOnSet(error) {
    this._errorOnSet = error;
  }

  /**
   * Set error to throw on next remove operation
   * @param {Error} error - Error to throw
   */
  setErrorOnRemove(error) {
    this._errorOnRemove = error;
  }

  /**
   * Get raw data for inspection
   * @returns {Object} Copy of internal data
   */
  getRawData() {
    return JSON.parse(JSON.stringify(this._data));
  }

  /**
   * Set raw data directly (for test setup)
   * @param {Object} data - Data to set
   */
  setRawData(data) {
    this._data = JSON.parse(JSON.stringify(data));
  }

  /**
   * Get operation log
   * @returns {Array} Array of logged operations
   */
  getOperationLog() {
    return [...this._operationLog];
  }

  /**
   * Get call counts
   * @returns {Object} Object with get, set, remove counts
   */
  getCallCounts() {
    return {
      get: this._getCallCount,
      set: this._setCallCount,
      remove: this._removeCallCount
    };
  }

  /**
   * Reset storage state and counters
   */
  reset() {
    this._data = {};
    this._errorOnGet = null;
    this._errorOnSet = null;
    this._errorOnRemove = null;
    this._operationLog = [];
    this._getCallCount = 0;
    this._setCallCount = 0;
    this._removeCallCount = 0;
  }
}

module.exports = { MockStorage };
