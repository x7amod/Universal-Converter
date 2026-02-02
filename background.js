// Background service worker for Chrome Extension v3

// Track if context menu is being created to prevent duplicates
let isCreatingContextMenu = false;

// ============================================
// Currency Rate Service
// ============================================

/**
 * Currency rate fetching and caching service
 * Runs in background worker, handles all API calls
 * 
 * @param {Object} options - Optional configuration for testability
 * @param {Object} options.storageProvider - Storage provider (defaults to chrome.storage)
 * @param {Function} options.fetchFn - Fetch function (defaults to global fetch)
 * @param {Object} options.config - Configuration overrides (cacheTimeout, etc.)
 */
class CurrencyRateService {
  constructor(options = {}) {
    // API endpoints
    this.primaryURL = 'https://api.exchangerate.fun/latest';
    this.fallbackURL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/';
    
    // Dependency injection for testability
    this.storageProvider = options.storageProvider || null; // null = use chrome.storage
    this._fetchFn = options.fetchFn || null; // null = use global fetch
    
    // Configuration with overrides for testing
    const config = options.config || {};
    this.cacheStorageKey = config.cacheStorageKey || 'currencyRatesCache';
    this.cacheTimeout = config.cacheTimeout !== undefined ? config.cacheTimeout : 60 * 60 * 1000; // 60 minutes
    this.inactivityThreshold = config.inactivityThreshold !== undefined ? config.inactivityThreshold : 5 * 60 * 1000; // 5 minutes
    this.staleThreshold = config.staleThreshold !== undefined ? config.staleThreshold : 45 * 60 * 1000; // 45 minutes
    this.refreshThreshold = config.refreshThreshold !== undefined ? config.refreshThreshold : 50 * 60 * 1000; // 50 minutes
    
    // User activity tracking (must be loaded from storage on startup)
    this.lastUserActivity = 0;
    
    // In-flight request deduplication
    // Key: 'from-to' currency pair, Value: Promise
    // Note: This is best-effort only - lost when worker restarts
    this.inFlightRequests = new Map();
  }

  /**
   * Get current time - overridable for testing
   * @returns {number} Current timestamp in milliseconds
   */
  _getCurrentTime() {
    return Date.now();
  }

  /**
   * Internal fetch wrapper - uses injected fetch or global fetch
   * @param {string} url - URL to fetch
   * @returns {Promise<Response>} Fetch response
   */
  async _fetch(url) {
    const fetchFn = this._fetchFn || fetch;
    return fetchFn(url);
  }

  /**
   * Get storage - uses injected storage provider or chrome.storage
   * @returns {Object|null} Storage object or null
   */
  _getStorage() {
    if (this.storageProvider) {
      return this.storageProvider;
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
      return chrome.storage.local;
    }
    return null;
  }

  /**
   * Setup alarm for periodic cache refresh (every 50 minutes)
   */
  setupCacheRefreshAlarm() {
    try {
      if (typeof chrome !== 'undefined' && chrome.alarms) {
        chrome.alarms.create('refreshCurrencyCache', {
          periodInMinutes: 50
        });
        console.log('Cache refresh alarm set for every 50 minutes');
      }
    } catch (error) {
      console.warn('Failed to create cache refresh alarm:', error);
    }
  }

  /**
   * Load last user activity from persistent storage
   * Must be called on worker startup
   */
  async loadActivity() {
    try {
      const storage = this._getStorage();
      if (storage) {
        const result = await storage.get('lastUserActivity');
        this.lastUserActivity = result.lastUserActivity || 0;
      }
    } catch (error) {
      console.warn('Failed to load last activity:', error);
      this.lastUserActivity = 0;
    }
  }

  /**
   * Update last user activity timestamp and persist it
   */
  async updateActivity() {
    const now = this._getCurrentTime();
    this.lastUserActivity = now;
    
    try {
      const storage = this._getStorage();
      if (storage) {
        await storage.set({ lastUserActivity: now });
      }
    } catch (error) {
      console.warn('Failed to persist activity:', error);
    }
  }

  /**
   * Check if user has been active recently (within configured threshold)
   */
  isUserActive() {
    return (this._getCurrentTime() - this.lastUserActivity) < this.inactivityThreshold;
  }

  /**
   * Check if cache can be served (not expired)
   */
  isCacheValid(cached) {
    if (!cached) return false;
    const cacheAge = this._getCurrentTime() - cached.timestamp;
    return cacheAge < this.cacheTimeout;
  }

  /**
   * Check if we should attempt to refresh the cache
   * Only refresh when user is active and cache is stale
   */
  shouldRefreshCache(cached) {
    if (!cached) return true;
    if (!this.isUserActive()) return false; // Don't refresh if user inactive
    
    const cacheAge = this._getCurrentTime() - cached.timestamp;
    return cacheAge >= this.cacheTimeout; // Refresh if expired
  }

  /**
   * Get currency rate - main entry point
   * Handles caching, deduplication, and API fallback
   * @param {string} from - Source currency code
   * @param {string} to - Target currency code
   * @returns {Promise<Object>} { rate: number, usedFallback: boolean, fromCache: boolean }
   */
  async getCurrencyRate(from, to) {
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();
    const pairKey = `${fromLower}-${toLower}`;
    
    // Check if there's already a request in flight for this pair
    if (this.inFlightRequests.has(pairKey)) {
      return await this.inFlightRequests.get(pairKey);
    }
    
    // Create new request promise
    const requestPromise = this._fetchCurrencyRate(fromLower, toLower);
    this.inFlightRequests.set(pairKey, requestPromise);
    
    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up in-flight request after completion
      this.inFlightRequests.delete(pairKey);
    }
  }

  /**
   * Internal method to fetch currency rate
   * @private
   */
  async _fetchCurrencyRate(fromLower, toLower) {
    // Check cache first
    let cached = null;
    try {
      cached = await this.getCachedRate(fromLower);
    } catch (error) {
      console.warn('Cache retrieval error:', error);
    }
    
    // Serve from cache if valid
    if (cached && this.isCacheValid(cached)) {
      const rate = cached.rates[toLower];
      if (rate !== undefined) {
        return { 
          rate: rate, 
          usedFallback: cached.usedFallback || false,
          fromCache: true
        };
      }
    }

    // Cache is expired or missing - try to fetch new data if user is active
    // If fetch fails and we have stale cache, use it as fallback
    let staleRate = null;
    if (cached && cached.rates) {
      staleRate = cached.rates[toLower];
    }
    
    // Don't fetch if user inactive and we have stale cache
    if (!this.shouldRefreshCache(cached) && staleRate !== null && staleRate !== undefined) {
      console.log('User inactive, serving stale cache');
      return {
        rate: staleRate,
        usedFallback: cached.usedFallback || false,
        fromCache: true,
        stale: true
      };
    }

    // Fetch new rates - try primary API first, then fallback
    try {
      const rates = await this.fetchRatesFromPrimaryAPI(fromLower);
      const rate = rates[toLower] || rates[toLower.toUpperCase()];
      if (rate !== undefined) {
        return { rate: rate, usedFallback: false, fromCache: false };
      }
      throw new Error(`Rate not found for ${toLower}`);
    } catch (primaryError) {
      console.warn('Primary currency API failed:', primaryError.message);
      
      // Try fallback API
      try {
        const rates = await this.fetchRatesFromFallbackAPI(fromLower);
        const rate = rates[toLower];
        if (rate !== undefined) {
          console.info('Successfully fetched rates from fallback API');
          return { rate: rate, usedFallback: true, fromCache: false };
        }
        throw new Error(`Rate not found for ${toLower}`);
      } catch (fallbackError) {
        console.error('All currency APIs failed:', fallbackError.message);
        
        // If we have stale cache, use it as last resort
        if (staleRate !== null && staleRate !== undefined) {
          console.warn('Using stale cache due to API failure');
          return { 
            rate: staleRate, 
            usedFallback: cached.usedFallback || false,
            fromCache: true,
            stale: true
          };
        }
        
        throw new Error('Currency rate unavailable');
      }
    }
  }

  /**
   * Fetch rates from primary API (api.exchangerate.fun)
   */
  async fetchRatesFromPrimaryAPI(baseCurrency) {
    const url = `${this.primaryURL}?base=${baseCurrency.toUpperCase()}`;
    
    const response = await this._fetch(url);
    if (!response.ok) {
      throw new Error(`Primary API response not ok: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.rates) {
      throw new Error('Invalid response format from primary API');
    }
    
    // Normalize all rate keys to lowercase for consistent lookups
    const normalizedRates = {};
    for (const [code, rate] of Object.entries(data.rates)) {
      normalizedRates[code.toLowerCase()] = rate;
    }
    
    // Cache all rates for this base currency
    try {
      await this.setCachedRate(baseCurrency.toLowerCase(), {
        rates: normalizedRates,
        timestamp: this._getCurrentTime(),
        apiTimestamp: data.timestamp,
        usedFallback: false
      });
    } catch (error) {
      console.warn('Cache storage error:', error);
    }
    
    return normalizedRates;
  }

  /**
   * Fetch rates from fallback API (fawazahmed0)
   */
  async fetchRatesFromFallbackAPI(baseCurrency) {
    const url = `${this.fallbackURL}${baseCurrency}.json`;
    
    const response = await this._fetch(url);
    if (!response.ok) {
      throw new Error(`Fallback API failed: ${response.status}`);
    }
    
    const data = await response.json();
    const rates = data[baseCurrency];
    
    if (!rates) {
      throw new Error('Invalid response format from fallback API');
    }
    
    // Cache all rates
    try {
      await this.setCachedRate(baseCurrency, {
        rates: rates,
        timestamp: this._getCurrentTime(),
        usedFallback: true
      });
    } catch (error) {
      console.warn('Cache storage error:', error);
    }
    
    return rates;
  }

  /**
   * Get cached rate from storage
   */
  async getCachedRate(baseCurrency) {
    try {
      const storage = this._getStorage();
      if (storage) {
        const result = await storage.get(this.cacheStorageKey);
        const cache = result[this.cacheStorageKey] || {};
        return cache[baseCurrency] || null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Set cached rate in storage
   */
  async setCachedRate(baseCurrency, data) {
    try {
      const storage = this._getStorage();
      if (storage) {
        const result = await storage.get(this.cacheStorageKey);
        const cache = result[this.cacheStorageKey] || {};
        cache[baseCurrency] = data;
        await storage.set({ [this.cacheStorageKey]: cache });
      }
    } catch (error) {
      console.warn('Failed to set cache:', error);
    }
  }

  /**
   * Clear the currency cache
   */
  async clearCache() {
    try {
      const storage = this._getStorage();
      if (storage) {
        await storage.remove(this.cacheStorageKey);
        console.info('Currency cache cleared');
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  /**
   * Warm cache with all currencies
   * Fetches all currency rates by using USD as base (API returns all rates in one call)
   */
  async warmCache() {
    console.log('Warming currency cache with all currencies...');
    
    try {
      // Check if USD rates are already cached
      const cached = await this.getCachedRate('usd');
      if (cached && this.isCacheValid(cached)) {
        const numCurrencies = Object.keys(cached.rates).length;
        console.log(`Cache already warm with ${numCurrencies} currencies`);
        return;
      }
      
      // Fetch all rates using USD as base currency
      // The API returns ALL currency rates in a single call
      const rates = await this.fetchRatesFromPrimaryAPI('usd');
      const numCurrencies = Object.keys(rates).length;
      console.log(`Successfully cached ${numCurrencies} currency rates`);
    } catch (error) {
      console.warn('Cache warming failed:', error.message);
    }
  }

  /**
   * Prefetch fresh rates if cache is getting stale
   * Called on activity pings to proactively refresh before user needs it
   * Fire-and-forget pattern - doesn't block the caller
   */
  async prefetchIfStale() {
    // Only prefetch if user is active
    if (!this.isUserActive()) return;
    
    try {
      const cached = await this.getCachedRate('usd');
      
      if (!cached) {
        // No cache at all - warm it up
        this.warmCache().catch(() => {});
        return;
      }
      
      const cacheAge = this._getCurrentTime() - cached.timestamp;
      
      // If cache is between staleThreshold and cacheTimeout, prefetch fresh data
      if (cacheAge > this.staleThreshold && cacheAge < this.cacheTimeout) {
        console.log(`Prefetching fresh rates (cache age: ${Math.round(cacheAge / 60000)} min)`);
        
        // Fire and forget - don't await, don't throw errors up
        this.fetchRatesFromPrimaryAPI('usd').catch(err => {
          console.warn('Background prefetch failed:', err.message);
        });
      }
    } catch (error) {
      // Silently fail - background optimization
    }
  }

  /**
   * Refresh cache for active currencies if user is active
   * Used by alarm-based refresh (fallback mechanism)
   */
  async refreshCacheIfNeeded() {
    if (!this.isUserActive()) {
      //console.log('User inactive, skipping cache refresh');
      return;
    }

    console.log('Refreshing currency cache...');
    
    try {
      const storage = this._getStorage();
      if (!storage) return;
      
      const result = await storage.get(this.cacheStorageKey);
      const cache = result[this.cacheStorageKey] || {};
      
      for (const [currency, data] of Object.entries(cache)) {
        const cacheAge = this._getCurrentTime() - data.timestamp;
        
        // Refresh if older than refreshThreshold
        if (cacheAge > this.refreshThreshold) {
          try {
            await this.fetchRatesFromPrimaryAPI(currency);
            console.log(`Refreshed rates for ${currency.toUpperCase()}`);
          } catch (error) {
            console.warn(`Failed to refresh ${currency.toUpperCase()}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn('Cache refresh error:', error);
    }
  }
}

// Initialize currency service
const currencyService = new CurrencyRateService();

// Service worker initialization happens in onInstalled and onStartup event handlers below

// Handle extension icon click to open settings page
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('settings-page/settings.html')
  });
});

chrome.runtime.onInstalled.addListener(async (details) => {
  // Initialize service worker
  await currencyService.loadActivity();
  currencyService.setupCacheRefreshAlarm();
  
  // Create context menu
  createContextMenu();
  
  // Open settings page on first install
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('settings-page/settings.html')
    });
  }
  
  // Set default settings if none exist
  try {
    const result = await chrome.storage.sync.get(['unitSettings']);
    if (!result.unitSettings) {
      await chrome.storage.sync.set({ unitSettings: { preset: 'metric' } });
    }
  } catch (error) {
    console.error('Error initializing settings:', error);
  }
  
  // Warm cache with common currencies on install/update
  // Fire and forget - no setTimeout needed in service worker
  currencyService.warmCache().catch(err => {
    console.warn('Cache warming failed:', err);
  });
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSettings') {
    chrome.storage.sync.get(['unitSettings'])
      .then(result => {
        sendResponse({ settings: result.unitSettings });
      })
      .catch(error => {
        console.error('Error getting settings:', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'getCurrencyRate') {
    // Handle currency rate request from content script
    const { from, to } = request;
    
    if (!from || !to) {
      sendResponse({ error: 'Missing from or to currency' });
      return false;
    }
    
    currencyService.getCurrencyRate(from, to)
      .then(result => {
        sendResponse({ 
          rate: result.rate, 
          usedFallback: result.usedFallback,
          fromCache: result.fromCache,
          stale: result.stale
        });
      })
      .catch(error => {
        console.error('Error getting currency rate:', error);
        sendResponse({ error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'updateActivity') {
    // Throttled activity ping from content script
    currencyService.updateActivity()
      .then(() => {
        // Proactively refresh if cache is getting stale (fire and forget)
        currencyService.prefetchIfStale().catch(() => {});
        sendResponse({ status: 'ok' });
      })
      .catch(error => {
        console.warn('Error updating activity:', error);
        sendResponse({ status: 'ok' }); // Still respond
      });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'clearCurrencyCache') {
    // Clear cache request
    currencyService.clearCache()
      .then(() => {
        sendResponse({ status: 'Currency cache cleared' });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true;
  }
});

// Listen for storage changes and notify content scripts
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.unitSettings) {
    // Notify all tabs about settings change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'settingsUpdated',
          newSettings: changes.unitSettings.newValue
        }).catch(() => {
          // Ignore errors for tabs without content script
        });
      });
    });
  }
});

// Handle cache refresh alarm
if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'refreshCurrencyCache') {
      currencyService.refreshCacheIfNeeded().catch(err => {
        console.warn('Scheduled cache refresh failed:', err);
      });
    }
  });
}

// Handle context menu (optional future feature)
chrome.runtime.onStartup.addListener(async () => {
  // Load persisted activity state
  await currencyService.loadActivity();
  
  // Setup alarm on startup
  currencyService.setupCacheRefreshAlarm();
  
  createContextMenu();
});

/**
 * Create context menu for the extension icon
 */
function createContextMenu() {
  // Prevent duplicate creation attempts
  if (isCreatingContextMenu) {
    return;
  }
  
  isCreatingContextMenu = true;
  
  // Clear existing context menus first to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error('Error removing context menus:', chrome.runtime.lastError);
    }
    
    // Create Settings context menu item
    try {
      chrome.contextMenus.create({
        id: 'open-settings',
        title: 'Universal Converter Settings',
        contexts: ['action']
      }, () => {
        if (chrome.runtime.lastError) {
          // Silently ignore duplicate errors - menu item already exists
          if (!chrome.runtime.lastError.message.includes('duplicate')) {
            console.error('Error creating settings menu:', chrome.runtime.lastError);
          }
        }
      });
    } catch (error) {
      console.error('Error creating settings context menu:', error);
    }
    
    // Only add developer tools in development mode
    // Check if we're in development by looking for unpacked extension
    try {
      chrome.management.getSelf((extensionInfo) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting extension info:', chrome.runtime.lastError);
          isCreatingContextMenu = false;
          return;
        }
        
        if (extensionInfo.installType === 'development') {
          chrome.contextMenus.create({
            id: 'clear-currency-cache',
            title: 'Clear Currency Cache',
            contexts: ['action']
          }, () => {
            if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes('duplicate')) {
              console.error('Error creating cache menu:', chrome.runtime.lastError);
            }
          });
          
          chrome.contextMenus.create({
            id: 'reload-extension',
            title: 'Reload Extension',
            contexts: ['action']
          }, () => {
            if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes('duplicate')) {
              console.error('Error creating reload menu:', chrome.runtime.lastError);
            }
            // Reset flag after all menus are created
            isCreatingContextMenu = false;
          });
        } else {
          // Reset flag if not in development mode
          isCreatingContextMenu = false;
        }
      });
    } catch (error) {
      console.error('Error in chrome.management.getSelf:', error);
      isCreatingContextMenu = false;
    }
  });
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-settings') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('settings-page/settings.html')
    });
  } else if (info.menuItemId === 'clear-currency-cache') {
    // Clear currency cache using background service
    currencyService.clearCache()
      .then(() => {
        console.log('Currency cache cleared');
      })
      .catch(error => {
        console.error('Failed to clear cache:', error);
      });
  } else if (info.menuItemId === 'reload-extension') {
    // Reload the extension
    chrome.runtime.reload();
  }
});

// Export for Node.js testing environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CurrencyRateService };
}
