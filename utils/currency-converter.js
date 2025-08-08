// Currency conversion utilities using Currency-Converter logic

// Global namespace for currency converter
window.UnitConverter = window.UnitConverter || {};

// Import currency mappings from currency-mappings.js


window.UnitConverter.CurrencyConverter = class {
    constructor() {
        this.baseURL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/';
        this.fallbackURL = 'https://currency-api.pages.dev/v1/currencies/';
        this.rateCache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Extract currency symbol from text (from Currency-Converter)
     */
    extractCurrencySymbol(str) {
        // Check if str is valid
        if (!str || typeof str !== 'string') {
            return '';
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
     * Get currency rate from API (from Currency-Converter)
     */
    async getCurrencyRate(from, to) {
        const cacheKey = `${from}-${to}`;
        const cached = this.rateCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.rate;
        }

        // Using data from the Currency API by Fawaz Ahmed (https://github.com/fawazahmed0/exchange-api)
        const url = this.baseURL + from + '.json';
        const fallbackUrl = this.fallbackURL + from + '.json';

        try {
            let response = await fetch(url);

            if (!response.ok) {
                response = await fetch(fallbackUrl);

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
            }

            const data = await response.json();
            const rate = data[from][to];
            
            // Cache the result
            this.rateCache.set(cacheKey, {
                rate: rate,
                timestamp: Date.now()
            });
            
            return rate;
        } catch (error) {
            throw error;
        }
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

};

// Auto-initialize when the script loads
if (typeof window !== 'undefined') {
    window.UnitConverter.currencyConverter = new window.UnitConverter.CurrencyConverter();
}
