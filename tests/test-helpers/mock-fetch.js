/**
 * Mock Fetch Provider for Testing
 * Configurable API response mocking with failure injection
 */

class MockFetch {
  constructor() {
    this._responses = new Map();
    this._defaultResponse = null;
    this._callLog = [];
    this._callCount = 0;
    this._shouldFail = false;
    this._failureError = null;
    this._networkDelay = 0;
  }

  /**
   * Create a mock fetch function
   * @returns {Function} Mock fetch function
   */
  createFetchFunction() {
    const self = this;
    return async function(url) {
      self._callCount++;
      self._callLog.push({ url, timestamp: Date.now() });
      
      // Simulate network delay if configured
      if (self._networkDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, self._networkDelay));
      }
      
      // Check if should fail
      if (self._shouldFail) {
        if (self._failureError) {
          throw self._failureError;
        }
        throw new Error('Network request failed');
      }
      
      // Check for URL-specific response
      for (const [pattern, response] of self._responses) {
        if (url.includes(pattern)) {
          return self._createMockResponse(response);
        }
      }
      
      // Use default response if set
      if (self._defaultResponse) {
        return self._createMockResponse(self._defaultResponse);
      }
      
      // No response configured - return 404
      return self._createMockResponse({
        ok: false,
        status: 404,
        data: { error: 'Not found' }
      });
    };
  }

  /**
   * Create a mock Response object
   * @param {Object} config - Response configuration
   * @returns {Object} Mock Response object
   */
  _createMockResponse(config) {
    const { ok = true, status = 200, data = {}, headers = {} } = config;
    
    return {
      ok,
      status,
      headers: new Map(Object.entries(headers)),
      json: async () => data,
      text: async () => JSON.stringify(data)
    };
  }

  /**
   * Set response for a URL pattern
   * @param {string} urlPattern - URL pattern to match
   * @param {Object} response - Response configuration { ok, status, data }
   */
  setResponse(urlPattern, response) {
    this._responses.set(urlPattern, response);
  }

  /**
   * Set default response for unmatched URLs
   * @param {Object} response - Response configuration
   */
  setDefaultResponse(response) {
    this._defaultResponse = response;
  }

  /**
   * Configure to return successful primary API response
   * @param {Object} rates - Currency rates object
   * @param {number} timestamp - Optional API timestamp
   */
  setPrimaryAPIResponse(rates, timestamp = Date.now()) {
    this.setResponse('api.exchangerate.fun', {
      ok: true,
      status: 200,
      data: {
        base: 'USD',
        timestamp,
        rates
      }
    });
  }

  /**
   * Configure to return successful fallback API response
   * @param {string} baseCurrency - Base currency code
   * @param {Object} rates - Currency rates object
   */
  setFallbackAPIResponse(baseCurrency, rates) {
    this.setResponse(`currency-api@latest/v1/currencies/${baseCurrency}`, {
      ok: true,
      status: 200,
      data: {
        [baseCurrency]: rates
      }
    });
  }

  /**
   * Configure primary API to fail
   * @param {number} status - HTTP status code
   */
  setPrimaryAPIFailure(status = 500) {
    this.setResponse('api.exchangerate.fun', {
      ok: false,
      status,
      data: { error: 'Internal server error' }
    });
  }

  /**
   * Configure fallback API to fail
   * @param {number} status - HTTP status code
   */
  setFallbackAPIFailure(status = 500) {
    this.setResponse('currency-api@latest', {
      ok: false,
      status,
      data: { error: 'Internal server error' }
    });
  }

  /**
   * Configure all fetches to fail with network error
   * @param {Error} error - Optional custom error
   */
  setNetworkFailure(error = null) {
    this._shouldFail = true;
    this._failureError = error;
  }

  /**
   * Set network delay in milliseconds
   * @param {number} ms - Delay in milliseconds
   */
  setNetworkDelay(ms) {
    this._networkDelay = ms;
  }

  /**
   * Get call log
   * @returns {Array} Array of logged calls
   */
  getCallLog() {
    return [...this._callLog];
  }

  /**
   * Get call count
   * @returns {number} Number of fetch calls made
   */
  getCallCount() {
    return this._callCount;
  }

  /**
   * Check if a specific URL was called
   * @param {string} urlPattern - URL pattern to check
   * @returns {boolean} Whether URL was called
   */
  wasUrlCalled(urlPattern) {
    return this._callLog.some(call => call.url.includes(urlPattern));
  }

  /**
   * Get calls for a specific URL pattern
   * @param {string} urlPattern - URL pattern to filter by
   * @returns {Array} Matching calls
   */
  getCallsForUrl(urlPattern) {
    return this._callLog.filter(call => call.url.includes(urlPattern));
  }

  /**
   * Reset mock state
   */
  reset() {
    this._responses.clear();
    this._defaultResponse = null;
    this._callLog = [];
    this._callCount = 0;
    this._shouldFail = false;
    this._failureError = null;
    this._networkDelay = 0;
  }
}

// Sample currency rates for testing
const SampleRates = {
  // Primary API format (uppercase keys)
  primary: {
    USD: 1,
    EUR: 0.85,
    GBP: 0.73,
    JPY: 110.5,
    CAD: 1.25,
    AUD: 1.35,
    CHF: 0.92,
    CNY: 6.45,
    INR: 74.5,
    MXN: 20.15
  },
  
  // Fallback API format (lowercase keys)
  fallback: {
    usd: 1,
    eur: 0.85,
    gbp: 0.73,
    jpy: 110.5,
    cad: 1.25,
    aud: 1.35,
    chf: 0.92,
    cny: 6.45,
    inr: 74.5,
    mxn: 20.15
  }
};

module.exports = {
  MockFetch,
  SampleRates
};
