// Background service worker for Chrome Extension v3

// Track if context menu is being created to prevent duplicates
let isCreatingContextMenu = false;

// ============================================
// Currency Rate Service
// ============================================

/**
 * Currency rate fetching and caching service
 * Runs in background worker, handles all API calls
 */
class CurrencyRateService {
  constructor() {
    // API endpoints
    this.primaryURL = 'https://api.exchangerate.fun/latest';
    this.fallbackURL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/';
    
    // Cache configuration
    this.cacheStorageKey = 'currencyRatesCache';
    this.cacheTimeout = 60 * 60 * 1000; // 60 minutes
    
    // User activity tracking
    this.lastUserActivity = Date.now();
    
    // In-flight request deduplication
    // Key: 'from-to' currency pair, Value: Promise
    this.inFlightRequests = new Map();
    
    // Alarm will be set up after service worker is fully initialized
    // Don't call chrome.alarms.create in constructor - may not be ready yet
  }

  /**
   * Setup alarm for periodic cache refresh (every 50 minutes)
   * Call this after service worker is initialized
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
   * Update last user activity timestamp
   */
  updateActivity() {
    this.lastUserActivity = Date.now();
  }

  /**
   * Check if user has been active recently (within last 5 minutes)
   */
  isUserActive() {
    const inactivityThreshold = 5 * 60 * 1000; // 5 minutes
    return (Date.now() - this.lastUserActivity) < inactivityThreshold;
  }

  /**
   * Check if cache is valid - only refresh if user is active
   */
  isCacheValid(cached) {
    if (!cached) return false;
    
    const cacheAge = Date.now() - cached.timestamp;
    
    // If cache is within timeout, it's valid
    if (cacheAge < this.cacheTimeout) return true;
    
    // If cache is expired but user is inactive, still use it (don't refresh)
    if (!this.isUserActive()) return true;
    
    return false;
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
    
    if (cached && this.isCacheValid(cached)) {
      const rate = cached.rates[toLower] || cached.rates[toLower.toUpperCase()];
      if (rate !== undefined) {
        return { 
          rate: rate, 
          usedFallback: cached.usedFallback || false,
          fromCache: true
        };
      }
    }

    // If cache is stale but exists, try to fetch new data
    // If fetch fails, we'll return the stale cache as fallback
    let staleRate = null;
    if (cached && cached.rates) {
      staleRate = cached.rates[toLower] || cached.rates[toLower.toUpperCase()];
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
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Primary API response not ok: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.rates) {
      throw new Error('Invalid response format from primary API');
    }
    
    // Normalize rates to both lowercase and uppercase keys
    const normalizedRates = {};
    for (const [code, rate] of Object.entries(data.rates)) {
      normalizedRates[code.toLowerCase()] = rate;
      normalizedRates[code.toUpperCase()] = rate;
    }
    
    // Cache all rates for this base currency
    try {
      await this.setCachedRate(baseCurrency.toLowerCase(), {
        rates: normalizedRates,
        timestamp: Date.now(),
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
    
    const response = await fetch(url);
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
        timestamp: Date.now(),
        usedFallback: true
      });
    } catch (error) {
      console.warn('Cache storage error:', error);
    }
    
    return rates;
  }

  /**
   * Get cached rate from chrome.storage.local
   */
  async getCachedRate(baseCurrency) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
        const result = await chrome.storage.local.get(this.cacheStorageKey);
        const cache = result[this.cacheStorageKey] || {};
        return cache[baseCurrency] || null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Set cached rate in chrome.storage.local
   */
  async setCachedRate(baseCurrency, data) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
        const result = await chrome.storage.local.get(this.cacheStorageKey);
        const cache = result[this.cacheStorageKey] || {};
        cache[baseCurrency] = data;
        await chrome.storage.local.set({ [this.cacheStorageKey]: cache });
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
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
        await chrome.storage.local.remove(this.cacheStorageKey);
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
        const numCurrencies = Object.keys(cached.rates).length / 2; // Divided by 2 because we store both upper and lower case
        console.log(`Successfully Cache already warm with ${numCurrencies} currencies`);
        return;
      }
      
      // Fetch all rates using USD as base currency
      // The API returns ALL currency rates in a single call
      const rates = await this.fetchRatesFromPrimaryAPI('usd');
      const numCurrencies = Object.keys(rates).length / 2; // Divided by 2 because we store both upper and lower case
      console.log(`Successfully Cached ${numCurrencies} currency rates`);
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
      
      const cacheAge = Date.now() - cached.timestamp;
      const staleThreshold = 45 * 60 * 1000; // 45 minutes
      
      // If cache is between 45-60 minutes old, prefetch fresh data
      if (cacheAge > staleThreshold && cacheAge < this.cacheTimeout) {
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
      const result = await chrome.storage.local.get(this.cacheStorageKey);
      const cache = result[this.cacheStorageKey] || {};
      
      for (const [currency, data] of Object.entries(cache)) {
        const cacheAge = Date.now() - data.timestamp;
        
        // Refresh if older than 50 minutes
        if (cacheAge > 50 * 60 * 1000) {
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

// Setup alarm after service is initialized (chrome.alarms may not be ready in constructor)
setTimeout(() => {
  currencyService.setupCacheRefreshAlarm();
}, 100);

// Handle extension icon click to open settings page
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('settings-page/settings.html')
  });
});

chrome.runtime.onInstalled.addListener(async (details) => {
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
      //console.log('Default settings initialized');
    }
  } catch (error) {
    console.error('Error initializing settings:', error);
  }
  
  // Warm cache with common currencies on install/update
  setTimeout(() => {
    currencyService.warmCache().catch(err => {
      console.warn('Cache warming failed:', err);
    });
  }, 2000); // Delay to avoid blocking other initialization
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
    currencyService.updateActivity();
    
    // Proactively refresh if cache is getting stale (fire and forget)
    currencyService.prefetchIfStale().catch(() => {});
    
    sendResponse({ status: 'ok' });
    return false;
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
chrome.runtime.onStartup.addListener(() => {
  //console.log('Unit Converter extension started');
  createContextMenu();
  
  // Setup alarm on startup as well
  currencyService.setupCacheRefreshAlarm();
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
        console.log('✅ Currency cache cleared');
      })
      .catch(error => {
        console.error('Failed to clear cache:', error);
      });
  } else if (info.menuItemId === 'reload-extension') {
    // Reload the extension
    chrome.runtime.reload();
  }
});
