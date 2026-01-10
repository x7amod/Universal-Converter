// Currency conversion utilities using Currency-Converter logic

// Global namespace for currency converter
window.UnitConverter = window.UnitConverter || {};

// Import currency mappings from currency-mappings.js


window.UnitConverter.CurrencyConverter = class {
    constructor() {
        // Primary API - FreeExchangeRateApi (https://github.com/haxqer/FreeExchangeRateApi)
        this.primaryURL = 'https://api.exchangerate.fun/latest';
        // Fallback API - fawazahmed0's Currency API
        this.fallbackURL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/';
        
        // Bulk rate cache - stores all rates for a base currency in session storage
        // Key: base currency code (e.g., 'usd'), Value: { rates: {...}, timestamp: number }
        this.cacheStorageKey = 'currencyRatesCache';
        this.cacheTimeout = 60 * 60 * 1000; // 60 minutes
        
        // Track user activity for cache updates logic
        this.lastUserActivity = Date.now();
        this.setupActivityTracking();
    }

    /**
     * Setup user activity tracking to only update cache when user is active
     */
    setupActivityTracking() {
        if (typeof document === 'undefined' || !document.addEventListener) return;
        
        const updateActivity = () => {
            this.lastUserActivity = Date.now();
        };
        
        // Track various user activities
        ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(event => {
            document.addEventListener(event, updateActivity, { passive: true });
        });
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
        // This prevents unnecessary API calls when user is away
        if (!this.isUserActive()) return true;
        
        return false;
    }

    /**
     * Extract currency symbol from text (from Currency-Converter)
     * Enhanced to detect explicit currency codes like "$89.99 CAD" or "CAD 89.99"
     */
    extractCurrencySymbol(str) {
        // Check if str is valid
        if (!str || typeof str !== 'string') {
            return '';
        }
        
        // First, check for explicit 3-letter currency codes (case insensitive)
        // These take priority over symbols since they're unambiguous
        const explicitCodeMatch = str.match(/\b([A-Za-z]{3})\b/);
        if (explicitCodeMatch) {
            const code = explicitCodeMatch[1].toUpperCase();
            // Check if this is a valid currency code
            if (window.currencySymbolToCurrencyCode && window.currencySymbolToCurrencyCode[code]) {
                return code;
            }
        }
        
        // Remove numbers, whitespace, commas, periods
        const cleanedStr = str.replace(/[0-9\s,.']+/g, '');

        // Match everything up to the first parenthesis (if present)
        const result = cleanedStr.match(/^[^\(\)]+/);

        return result ? result[0] : '';
    }

    /**
     * Extract number from text (from Currency-Converter)
     */
    extractNumber(str) {
        // Check if str is valid
        if (!str || typeof str !== 'string') {
            return null;
        }
        
        // Extract the part of the string with digits, commas, dots, apostrophes, and spaces
        let cleanedString = str.match(/(\d+[.,\d' \s]*)(?=\D|$)/);

        if (!cleanedString) return null;

        cleanedString = cleanedString[0];

        // Remove spaces and apostrophes (they're thousands separators)
        cleanedString = cleanedString.replace(/[ \']/g, '');

        // Determine format based on the presence of both ',' and '.'
        if (cleanedString.includes('.') && cleanedString.includes(',')) {
            if (cleanedString.indexOf('.') < cleanedString.indexOf(',')) {
                // European-style format: dot as thousands, comma as decimal
                cleanedString = cleanedString.replace(/\./g, '').replace(',', '.');
            } else {
                // US-style format: comma as thousands, dot as decimal
                cleanedString = cleanedString.replace(/,/g, '');
            }
        } else if (cleanedString.includes(',')) {
            // If only a comma is present, determine if it's decimal or thousands separator
            if (cleanedString.match(/,\d{2}$/)) {
                cleanedString = cleanedString.replace(',', '.');
            } else {
                cleanedString = cleanedString.replace(/,/g, '');
            }
        } else if (cleanedString.includes('.')) {
            // If only a dot is present, determine if it's decimal or thousands separator
            if (cleanedString.match(/\.\d{3}$/)) {
                // Dot as thousands separator
                cleanedString = cleanedString.replace(/\./g, '');
            }
        }

        let result = parseFloat(cleanedString);

        return isNaN(result) ? null : result;
    }

    /**
     * Detect currency from symbol (from Currency-Converter)
     */
    detectCurrency(currencySymbol) {
        const currencyCode = window.currencySymbolToCurrencyCode[currencySymbol];

        if (currencyCode === undefined) return 'Unknown currency';

        if (Array.isArray(currencyCode)) return this.guessCountryByCurrencyCode(currencyCode);

        return currencyCode;
    }

    /**
     * Guess currency code when multiple options available (from Currency-Converter)
     */
    guessCountryByCurrencyCode(currencyCodes) {
        const pageCountryCode = this.getPageCountryCode();
        let currencyCode = window.countryCodeToCurrencyCode[pageCountryCode];

        if (pageCountryCode !== 'No country code' && currencyCodes.includes(currencyCode)) {
            return currencyCode;
        }

        if (currencyCodes.includes('USD') && this.getPageLanguageCode() === 'EN') {
            return 'USD';
        }

        const pageTopLayerDomain = this.getPageTopLayerDomain();
        currencyCode = window.countryCodeToCurrencyCode[pageTopLayerDomain];

        if (currencyCodes.includes(currencyCode)) return currencyCode;

        return currencyCodes[0];
    }

    /**
     * Get page country code from language tag
     */
    getPageCountryCode() {
        // Check if we're in a browser environment
        if (typeof document === 'undefined' || !document.documentElement) {
            return 'No country code';
        }
        
        const lang = document.documentElement.lang;

        if (lang && lang.includes('-')) {
            const countryCode = lang.split('-')[1].toUpperCase();
            return countryCode;
        } else {
            return 'No country code';
        }
    }

    /**
     * Get page language code
     */
    getPageLanguageCode() {
        // Check if we're in a browser environment
        if (typeof document === 'undefined' || !document.documentElement) {
            return 'EN'; // Default to English
        }
        
        const lang = document.documentElement.lang;

        if (lang && lang.includes('-')) {
            const languageCode = lang.split('-')[0].toUpperCase();
            return languageCode;
        } else {
            return lang ? lang.toUpperCase() : 'EN';
        }
    }

    /**
     * Get top-level domain
     */
    getPageTopLayerDomain() {
        // Check if we're in a browser environment
        if (typeof window === 'undefined' || !window.location) {
            return 'com'; // Default
        }
        
        return window.location.origin.split('.').pop().toUpperCase();
    }

    /**
     * Get currency rate from API - tries primary API first, then fallbacks
     * Uses bulk caching to minimize API calls
     * @returns {Object} Object containing rate and source API info: { rate: number, usedFallback: boolean }
     */
    async getCurrencyRate(from, to) {
        const fromLower = from.toLowerCase();
        const toLower = to.toLowerCase();
        
        // Check bulk cache first
        let cached = null;
        try {
            cached = await this.getCachedRate(fromLower);
        } catch (error) {
            // Silently handle any cache retrieval errors (e.g., extension context invalidated)
            cached = null;
        }
        
        if (cached && this.isCacheValid(cached)) {
            const rate = cached.rates[toLower] || cached.rates[to.toUpperCase()];
            if (rate !== undefined) {
                // Return cached rate with fallback flag from cache
                return { 
                    rate: rate, 
                    usedFallback: cached.usedFallback || false 
                };
            }
        }

        // Fetch new rates - try primary API first, then fallback
        try {
            const rates = await this.fetchRatesFromPrimaryAPI(from);
            const rate = rates[toLower] || rates[to.toUpperCase()];
            if (rate !== undefined) {
                return { rate: rate, usedFallback: false };
            }
            throw new Error(`Rate not found for ${to}`);
        } catch (primaryError) {
            console.warn('Primary currency API failed, falling back to secondary API:', primaryError.message);
            
            try {
                const rates = await this.fetchRatesFromFallbackAPI(fromLower);
                const rate = rates[toLower];
                if (rate !== undefined) {
                    console.info('✅ Successfully fetched rates from fallback API');
                    return { rate: rate, usedFallback: true };
                }
                throw new Error(`Rate not found for ${to}`);
            } catch (fallbackError) {
                console.error('All currency APIs failed:', fallbackError.message);
                throw fallbackError;
            }
        }
    }

    /**
     * Fetch rates from primary API (api.exchangerate.fun)
     * Returns all rates and caches them
     */
    async fetchRatesFromPrimaryAPI(baseCurrency) {
        const url = `${this.primaryURL}?base=${baseCurrency.toUpperCase()}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Primary API response not ok: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Primary API returns: { timestamp, base, rates: { EUR: 0.92, ... } }
        if (!data.rates) {
            throw new Error('Invalid response format from primary API');
        }
        
        // Normalize rates to lowercase keys for consistent lookup
        const normalizedRates = {};
        for (const [code, rate] of Object.entries(data.rates)) {
            normalizedRates[code.toLowerCase()] = rate;
            normalizedRates[code.toUpperCase()] = rate; // Keep both for flexibility
        }
        
        // Cache all rates for this base currency in session storage
        try {
            await this.setCachedRate(baseCurrency.toLowerCase(), {
                rates: normalizedRates,
                timestamp: Date.now(),
                apiTimestamp: data.timestamp,
                usedFallback: false
            });
        } catch (error) {
            // Silently handle cache errors - extension might be reloading
        }
        
        return normalizedRates;
    }

    /**
     * Fetch rates from fallback API (fawazahmed0)
     * Returns all rates and caches them
     */
    async fetchRatesFromFallbackAPI(baseCurrency) {
        const url = `${this.fallbackURL}${baseCurrency}.json`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Fallback API failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Fallback API returns: { "usd": { "eur": 0.92, ... } }
        const rates = data[baseCurrency];
        if (!rates) {
            throw new Error('Invalid response format from fallback API');
        }
        
        // Cache all rates for this base currency in session storage
        try {
            await this.setCachedRate(baseCurrency, {
                rates: rates,
                timestamp: Date.now(),
                usedFallback: true
            });
        } catch (error) {
            // Silently handle cache errors - extension might be reloading
        }
        
        return rates;
    }

    /**
     * Format currency display (from )
     * Shows both currency code and symbol, e.g., "7.52 USD $"
     */
    formatCurrency(amount, currencyCode, userLocale = navigator.language) {
        const formattedAmount = new Intl.NumberFormat(userLocale, {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);

        let currencySymbol = this.getCurrencySymbol(currencyCode);

        if (Array.isArray(currencySymbol)) currencySymbol = currencySymbol[0];

        // Return format: "amount CURRENCY_CODE symbol"
        if (currencySymbol && currencySymbol !== currencyCode) {
            return `${formattedAmount} ${currencyCode.toUpperCase()} ${currencySymbol}`;
        } else {
            // Fallback if no symbol found, just show currency code
            return `${formattedAmount} ${currencyCode.toUpperCase()}`;
        }
    }

    /**
     * Get currency symbol from code
     */
    getCurrencySymbol(countryCode) {
        return window.currencyCodeToSymbol[countryCode];
    }

    /**
     * Get cached rate from local storage
     * @param {string} baseCurrency - Base currency code
     * @returns {Promise<Object|null>} Cached rate data or null
     */
    async getCachedRate(baseCurrency) {
        try {
            // Check if chrome.storage.local is available and accessible
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
                // Test if we can actually access it
                const result = await chrome.storage.local.get(this.cacheStorageKey);
                const cache = result[this.cacheStorageKey] || {};
                return cache[baseCurrency] || null;
            }
            return null;
        } catch (error) {
            // Silently fail if storage is not accessible
            // Common reasons: extension reloaded, context invalidated, or running outside extension
            // Don't log or re-throw - just return null to continue with fresh API fetch
            return null;
        }
    }

    /**
     * Set cached rate in local storage
     * @param {string} baseCurrency - Base currency code
     * @param {Object} data - Rate data to cache
     */
    async setCachedRate(baseCurrency, data) {
        try {
            // Check if chrome.storage.local is available and accessible
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
                const result = await chrome.storage.local.get(this.cacheStorageKey);
                const cache = result[this.cacheStorageKey] || {};
                cache[baseCurrency] = data;
                await chrome.storage.local.set({ [this.cacheStorageKey]: cache });
            }
        } catch (error) {
            // Silently fail if storage is not accessible
            // Common reasons: extension reloaded, context invalidated, or running outside extension
        }
    }

    /**
     * Clear the currency cache from local storage
     * This is useful for debugging or forcing fresh API calls
     */
    async clearCache() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
                await chrome.storage.local.remove(this.cacheStorageKey);
                console.info('🗑️ Currency cache cleared from local storage');
            }
        } catch (error) {
            // Silently fail - extension context may be invalidated
        }
    }

};

// Auto-initialize when the script loads
if (typeof window !== 'undefined') {
    window.UnitConverter.currencyConverter = new window.UnitConverter.CurrencyConverter();
}
