// Global namespace
window.UnitConverter = window.UnitConverter || {};

/**
 * Currency converter utility class
 * Contains only extraction, detection, and formatting utilities
 * API fetching and caching is now handled by background worker
 */
window.UnitConverter.CurrencyConverter = class {
    constructor() {
        // No API URLs or caching logic needed
        // All rate fetching is done by background worker
    }

    /**
     * Extract currency symbol from text 
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
     * Extract number from text
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
            const dotCount = (cleanedString.match(/\./g) || []).length;
            
            if (dotCount > 1) {
                // Multiple dots: all but the last are thousands separators (e.g., "1.000.00" = 1000.00)
                const lastDotIndex = cleanedString.lastIndexOf('.');
                cleanedString = cleanedString.substring(0, lastDotIndex).replace(/\./g, '') + 
                               cleanedString.substring(lastDotIndex);
            } else if (cleanedString.match(/^\d{4,}\.\d{3}$/)) {
                // Single dot as thousands separator (e.g., "1234.567" = 1234567)
                // Only applies if 4+ digits before dot and exactly 3 after
                cleanedString = cleanedString.replace(/\./g, '');
            }
            // Otherwise, treat single dot as decimal point
        }

        let result = parseFloat(cleanedString);

        return isNaN(result) ? null : result;
    }

    /**
     * Detect currency from symbol
     */
    detectCurrency(currencySymbol) {
        const currencyCode = window.currencySymbolToCurrencyCode[currencySymbol];

        if (currencyCode === undefined) return 'Unknown currency';

        if (Array.isArray(currencyCode)) return this.guessCountryByCurrencyCode(currencyCode);

        return currencyCode;
    }

    /**
     * Guess currency code when multiple options available
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
     * Format currency display
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
