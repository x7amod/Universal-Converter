// Main content script - orchestrates unit conversion functionality

// Global instances
let unitConverter;
let conversionDetector;
let popupManager;
let settingsManager;
let userSettings = {};

// Throttle activity pings to background (max once per 5 minutes)
let lastActivityPing = 0;
const ACTIVITY_PING_THROTTLE = 5 * 60 * 1000; // 5 minutes

/**
 * Send throttled activity ping to background worker
 */
function pingActivityToBackground() {
  const now = Date.now();
  if (now - lastActivityPing > ACTIVITY_PING_THROTTLE) {
    lastActivityPing = now;
    chrome.runtime.sendMessage({ action: 'updateActivity' }).catch(() => {
      // Ignore errors if background is not ready
    });
  }
}

/**
 * Initialize the extension components
 */
async function init() {
  try {
    // Wait for all scripts to load
    if (!window.UnitConverter || !window.UnitConverterData) {
      setTimeout(init, 100);
      return;
    }

    // Initialize currency pattern from mappings
    if (window.UnitConverterData.initializeCurrencyPattern) {
      window.UnitConverterData.initializeCurrencyPattern();
    }

    unitConverter = new window.UnitConverter.UnitConverter();
    conversionDetector = new window.UnitConverter.ConversionDetector(unitConverter);
    popupManager = new window.UnitConverter.PopupManager();
    settingsManager = new window.UnitConverter.SettingsManager();
    
    await loadUserSettings();
    setupEventListeners();
    
    //console.log('Unit Converter extension initialized successfully'); // debugging if something goes wrong
  } catch (error) {
    console.error('Error initializing Unit Converter extension:', error);
  }
}

/**
 * Load user settings from storage
 */
async function loadUserSettings() {
  userSettings = await settingsManager.loadSettings();
}

/**
 * Setup event listeners for text selection and popup management
 */
function setupEventListeners() {
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('click', handleClick);
  document.addEventListener('scroll', () => popupManager.hidePopup());
  window.addEventListener('resize', () => popupManager.hidePopup());
}

/**
 * Handle click events for activity tracking
 * @param {Event} event - Click event
 */
function handleClick(event) {
  // Send activity ping to background (throttled)
  pingActivityToBackground();
  
  // Hide popup when clicking
  popupManager.hidePopup();
}

/**
 * Handle text selection events using Currency-Converter approach
 * @param {Event} event - Mouse up event
 */
async function handleTextSelection(event) {
  setTimeout(async () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // Send activity ping to background (throttled)
    pingActivityToBackground();
    
    // Only process single-line selections (no line breaks)
    if (selectedText && selectedText.length > 0 && !selectedText.includes('\n') && !selectedText.includes('\r')) {
      // Use Currency-Converter logic for currency detection
      const currencyConverter = window.UnitConverter.currencyConverter;
      const detectedCurrency = currencyConverter.detectCurrency(currencyConverter.extractCurrencySymbol(selectedText));
      
      if (detectedCurrency !== 'Unknown currency') {
        // Currency detected - handle currency conversion
        const extractedNumber = currencyConverter.extractNumber(selectedText);
        
        if (extractedNumber) {
          const targetCurrency = userSettings.currencyUnit || 'USD';
          
          if (detectedCurrency.toUpperCase() !== targetCurrency.toUpperCase()) {
            const conversions = [{
              match: selectedText,
              originalValue: extractedNumber,
              originalUnit: detectedCurrency,
              targetUnit: targetCurrency.toUpperCase(),
              type: 'currency',
              needsAsyncProcessing: true,
              fromCurrency: detectedCurrency,
              toCurrency: targetCurrency.toUpperCase(),
              convertedValue: '...',
              // Add properties expected by popup
              original: `${extractedNumber} ${detectedCurrency}`,
              converted: '...'
            }];
            
            try {
              await processCurrencyConversions(conversions);
              await popupManager.showConversionPopup(conversions, selection);
            } catch (error) {
              console.error('Error showing currency conversion popup:', error);
            }
            return;
          }
        }
      }
      
      // Fallback to regular unit conversions
      const conversions = conversionDetector.findConversions(selectedText, userSettings);
      
      if (conversions.length > 0) {
        try {
          await processCurrencyConversions(conversions);
          await popupManager.showConversionPopup(conversions, selection);
        } catch (error) {
          console.error('Error showing conversion popup:', error);
          popupManager.hidePopup();
        }
      } else {
        popupManager.hidePopup();
      }
    } else {
      popupManager.hidePopup();
    }
  }, 10);
}

/**
 * Check if text contains multiple lines
 * @param {string} text - Text to check
 * @returns {boolean} - True if multi-line
 */
function isMultiLine(text) {
  return text.includes('\n') || text.includes('\r');
}

/**
 * Process currency conversions that need async API calls
 * Now requests rates from background worker instead of direct API calls
 * @param {Array} conversions - Array of conversion objects
 */
async function processCurrencyConversions(conversions) {
  // Validate conversions array
  if (!Array.isArray(conversions) || conversions.length === 0) {
    console.warn('Invalid conversions array provided to processCurrencyConversions');
    return;
  }
  
  if (!window.UnitConverter.currencyConverter) {
    console.error('Currency converter not available');
    return;
  }
  
  for (const conversion of conversions) {
    if (conversion.type === 'currency' && conversion.needsAsyncProcessing) {
      try {
        //console.log('Processing currency conversion:', conversion);
        
        // Request rate from background worker instead of direct API call
        const rateInfo = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'getCurrencyRate',
            from: conversion.fromCurrency.toLowerCase(),
            to: conversion.toCurrency.toLowerCase()
          }, response => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response);
            }
          });
        });
        
        //console.log('Got rate info from background:', rateInfo);
        
        if (rateInfo && rateInfo.rate && rateInfo.rate > 0) {
          const convertedAmount = conversion.originalValue * rateInfo.rate;
          const formattedResult = window.UnitConverter.currencyConverter.formatCurrency(
            convertedAmount, 
            conversion.toCurrency
          );
          
          //console.log('Formatted result:', formattedResult);
          
          conversion.converted = formattedResult;
          conversion.convertedValue = convertedAmount;
          conversion.usedFallback = rateInfo.usedFallback;
          conversion.fromCache = rateInfo.fromCache;
          conversion.stale = rateInfo.stale;
          conversion.needsAsyncProcessing = false;
        } else {
          console.warn('Unable to get valid exchange rate');
          conversion.converted = 'Rate unavailable';
          conversion.needsAsyncProcessing = false;
        }
      } catch (error) {
        console.error('Currency conversion error:', error);
        conversion.converted = 'Conversion failed';
        conversion.needsAsyncProcessing = false;
      }
    }
  }
}

/**
  // Note: clearCurrencyCache is now handled by background worker
  // No need to handle it here anymore Listen for messages from background script or popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'settingsUpdated') {
    loadUserSettings();
    sendResponse({ status: 'Settings updated' });
  } else if (request.action === 'clearCurrencyCache') {
    // Clear the currency cache
    if (window.UnitConverter && window.UnitConverter.currencyConverter) {
      window.UnitConverter.currencyConverter.clearCache();
      sendResponse({ status: 'Currency cache cleared' });
    } else {
      sendResponse({ status: 'Currency converter not available' });
    }
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
