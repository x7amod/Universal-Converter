/**
 * Test Utilities for Currency Cache Lifecycle Tests
 * Cache builders, assertion helpers, and common test fixtures
 */

const { MockTimeController, TimeScenarios } = require('./mock-time-controller');
const { MockStorage } = require('./mock-storage');
const { MockFetch, SampleRates } = require('./mock-fetch');

// Setup mock chrome object before requiring background.js
// This prevents "chrome is not defined" errors
if (typeof global.chrome === 'undefined') {
  global.chrome = {
    action: {
      onClicked: { addListener: () => {} }
    },
    runtime: {
      id: 'test-extension-id',
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} },
      getURL: (path) => `chrome-extension://test/${path}`,
      reload: () => {}
    },
    storage: {
      sync: {
        get: async () => ({}),
        set: async () => {}
      },
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {}
      },
      onChanged: { addListener: () => {} }
    },
    tabs: {
      create: () => {},
      query: (opts, cb) => cb && cb([]),
      sendMessage: () => {}
    },
    alarms: {
      create: () => {},
      onAlarm: { addListener: () => {} }
    },
    contextMenus: {
      create: (opts, cb) => cb && cb(),
      removeAll: (cb) => cb && cb(),
      onClicked: { addListener: () => {} }
    },
    management: {
      getSelf: (cb) => cb && cb({ installType: 'development' })
    }
  };
}

/**
 * Cache Builder - Creates cache objects with specific configurations
 */
class CacheBuilder {
  constructor(timeController) {
    this.timeController = timeController;
    this._baseCurrency = 'usd';
    this._rates = { ...SampleRates.fallback };
    this._timestamp = null;
    this._usedFallback = false;
    this._apiTimestamp = null;
  }

  /**
   * Set base currency
   * @param {string} currency - Base currency code
   * @returns {CacheBuilder} this for chaining
   */
  withBaseCurrency(currency) {
    this._baseCurrency = currency.toLowerCase();
    return this;
  }

  /**
   * Set rates
   * @param {Object} rates - Rates object
   * @returns {CacheBuilder} this for chaining
   */
  withRates(rates) {
    this._rates = { ...rates };
    return this;
  }

  /**
   * Set cache as fresh (just created)
   * @returns {CacheBuilder} this for chaining
   */
  asFresh() {
    this._timestamp = TimeScenarios.freshCache(this.timeController);
    return this;
  }

  /**
   * Set cache as valid (not stale)
   * @returns {CacheBuilder} this for chaining
   */
  asValid() {
    this._timestamp = TimeScenarios.validCache(this.timeController);
    return this;
  }

  /**
   * Set cache as stale (between stale threshold and expired)
   * @returns {CacheBuilder} this for chaining
   */
  asStale() {
    this._timestamp = TimeScenarios.staleCache(this.timeController);
    return this;
  }

  /**
   * Set cache as expired
   * @returns {CacheBuilder} this for chaining
   */
  asExpired() {
    this._timestamp = TimeScenarios.expiredCache(this.timeController);
    return this;
  }

  /**
   * Set cache as very expired (2+ hours)
   * @returns {CacheBuilder} this for chaining
   */
  asVeryExpired() {
    this._timestamp = TimeScenarios.veryExpiredCache(this.timeController);
    return this;
  }

  /**
   * Set specific timestamp
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {CacheBuilder} this for chaining
   */
  withTimestamp(timestamp) {
    this._timestamp = timestamp;
    return this;
  }

  /**
   * Set cache age in minutes
   * @param {number} minutes - Age in minutes
   * @returns {CacheBuilder} this for chaining
   */
  withAgeMinutes(minutes) {
    this._timestamp = this.timeController.now() - (minutes * 60 * 1000);
    return this;
  }

  /**
   * Mark as from fallback API
   * @returns {CacheBuilder} this for chaining
   */
  fromFallback() {
    this._usedFallback = true;
    return this;
  }

  /**
   * Mark as from primary API
   * @returns {CacheBuilder} this for chaining
   */
  fromPrimary() {
    this._usedFallback = false;
    return this;
  }

  /**
   * Build the cache entry object
   * @returns {Object} Cache entry
   */
  build() {
    const entry = {
      rates: this._rates,
      timestamp: this._timestamp !== null ? this._timestamp : this.timeController.now(),
      usedFallback: this._usedFallback
    };
    
    if (this._apiTimestamp !== null) {
      entry.apiTimestamp = this._apiTimestamp;
    }
    
    return entry;
  }

  /**
   * Build and return storage data object
   * @param {string} storageKey - Storage key name
   * @returns {Object} Storage data object
   */
  buildStorageData(storageKey = 'currencyRatesCache') {
    return {
      [storageKey]: {
        [this._baseCurrency]: this.build()
      }
    };
  }
}

/**
 * Test Fixture Factory - Creates common test setups
 */
class TestFixtureFactory {
  /**
   * Create a complete test fixture with all mocks
   * @param {Object} options - Configuration options
   * @returns {Object} Test fixture with timeController, storage, fetch, and service
   */
  static create(options = {}) {
    const timeController = new MockTimeController(options.initialTime || Date.now());
    const storage = new MockStorage();
    const mockFetch = new MockFetch();
    
    // Setup default API responses
    mockFetch.setPrimaryAPIResponse(SampleRates.primary);
    mockFetch.setFallbackAPIResponse('usd', SampleRates.fallback);
    
    return {
      timeController,
      storage,
      mockFetch,
      
      /**
       * Create a CurrencyRateService with test configuration
       * @param {Object} serviceConfig - Additional service config
       * @returns {Object} CurrencyRateService instance
       */
      createService: (serviceConfig = {}) => {
        // Import dynamically to avoid issues with chrome API checks
        const { CurrencyRateService } = require('../../background.js');
        
        const service = new CurrencyRateService({
          storageProvider: storage,
          fetchFn: mockFetch.createFetchFunction(),
          config: {
            // Use shorter timeouts for faster tests
            cacheTimeout: options.cacheTimeout || 60 * 60 * 1000, // 60 minutes
            inactivityThreshold: options.inactivityThreshold || 5 * 60 * 1000, // 5 minutes
            staleThreshold: options.staleThreshold || 45 * 60 * 1000, // 45 minutes
            refreshThreshold: options.refreshThreshold || 50 * 60 * 1000, // 50 minutes
            ...serviceConfig
          }
        });
        
        // Override _getCurrentTime to use mock time
        service._getCurrentTime = () => timeController.now();
        
        return service;
      },
      
      /**
       * Create a cache builder
       * @returns {CacheBuilder} Cache builder instance
       */
      createCacheBuilder: () => new CacheBuilder(timeController),
      
      /**
       * Setup user as active
       * @param {Object} service - CurrencyRateService instance
       */
      setUserActive: (service) => {
        service.lastUserActivity = TimeScenarios.recentActivity(timeController);
      },
      
      /**
       * Setup user as inactive
       * @param {Object} service - CurrencyRateService instance
       */
      setUserInactive: (service) => {
        service.lastUserActivity = TimeScenarios.inactiveUser(timeController);
      },
      
      /**
       * Reset all mocks
       */
      reset: () => {
        storage.reset();
        mockFetch.reset();
        mockFetch.setPrimaryAPIResponse(SampleRates.primary);
        mockFetch.setFallbackAPIResponse('usd', SampleRates.fallback);
      }
    };
  }

  /**
   * Create fixture with fast timeouts for quick tests
   * @returns {Object} Test fixture
   */
  static createFast() {
    return TestFixtureFactory.create({
      cacheTimeout: 60 * 1000, // 1 minute
      inactivityThreshold: 5 * 1000, // 5 seconds
      staleThreshold: 45 * 1000, // 45 seconds
      refreshThreshold: 50 * 1000 // 50 seconds
    });
  }
}

/**
 * Assertion Helpers
 */
const Assertions = {
  /**
   * Assert cache is valid
   * @param {Object} service - CurrencyRateService instance
   * @param {Object} cached - Cached data
   * @param {string} message - Error message prefix
   */
  assertCacheValid(service, cached, message = '') {
    if (!service.isCacheValid(cached)) {
      throw new Error(`${message} Expected cache to be valid, but it was invalid`);
    }
  },

  /**
   * Assert cache is invalid
   * @param {Object} service - CurrencyRateService instance
   * @param {Object} cached - Cached data
   * @param {string} message - Error message prefix
   */
  assertCacheInvalid(service, cached, message = '') {
    if (service.isCacheValid(cached)) {
      throw new Error(`${message} Expected cache to be invalid, but it was valid`);
    }
  },

  /**
   * Assert should refresh cache
   * @param {Object} service - CurrencyRateService instance
   * @param {Object} cached - Cached data
   * @param {string} message - Error message prefix
   */
  assertShouldRefresh(service, cached, message = '') {
    if (!service.shouldRefreshCache(cached)) {
      throw new Error(`${message} Expected shouldRefreshCache to be true, but it was false`);
    }
  },

  /**
   * Assert should not refresh cache
   * @param {Object} service - CurrencyRateService instance
   * @param {Object} cached - Cached data
   * @param {string} message - Error message prefix
   */
  assertShouldNotRefresh(service, cached, message = '') {
    if (service.shouldRefreshCache(cached)) {
      throw new Error(`${message} Expected shouldRefreshCache to be false, but it was true`);
    }
  },

  /**
   * Assert user is active
   * @param {Object} service - CurrencyRateService instance
   * @param {string} message - Error message prefix
   */
  assertUserActive(service, message = '') {
    if (!service.isUserActive()) {
      throw new Error(`${message} Expected user to be active, but they were inactive`);
    }
  },

  /**
   * Assert user is inactive
   * @param {Object} service - CurrencyRateService instance
   * @param {string} message - Error message prefix
   */
  assertUserInactive(service, message = '') {
    if (service.isUserActive()) {
      throw new Error(`${message} Expected user to be inactive, but they were active`);
    }
  },

  /**
   * Assert equal with detailed message
   * @param {*} actual - Actual value
   * @param {*} expected - Expected value
   * @param {string} message - Error message
   */
  assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`${message} Expected ${expected}, but got ${actual}`);
    }
  },

  /**
   * Assert truthy
   * @param {*} value - Value to check
   * @param {string} message - Error message
   */
  assertTrue(value, message = '') {
    if (!value) {
      throw new Error(`${message} Expected truthy value, but got ${value}`);
    }
  },

  /**
   * Assert falsy
   * @param {*} value - Value to check
   * @param {string} message - Error message
   */
  assertFalse(value, message = '') {
    if (value) {
      throw new Error(`${message} Expected falsy value, but got ${value}`);
    }
  },

  /**
   * Assert value is defined
   * @param {*} value - Value to check
   * @param {string} message - Error message
   */
  assertDefined(value, message = '') {
    if (value === undefined || value === null) {
      throw new Error(`${message} Expected value to be defined, but got ${value}`);
    }
  },

  /**
   * Assert async function throws
   * @param {Function} asyncFn - Async function to call
   * @param {string} expectedMessage - Expected error message (partial match)
   * @param {string} message - Error message prefix
   */
  async assertThrows(asyncFn, expectedMessage = null, message = '') {
    try {
      await asyncFn();
      throw new Error(`${message} Expected function to throw, but it did not`);
    } catch (error) {
      if (expectedMessage && !error.message.includes(expectedMessage)) {
        throw new Error(`${message} Expected error message to include "${expectedMessage}", but got "${error.message}"`);
      }
    }
  }
};

module.exports = {
  CacheBuilder,
  TestFixtureFactory,
  Assertions,
  SampleRates
};
