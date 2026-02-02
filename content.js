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

// Track currently displayed text to prevent redundant popup updates
let currentlyDisplayedText = null;

/**
 * Check if extension context is still valid
 */
function isExtensionContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

/**
 * Send throttled activity ping to background worker
 */
function pingActivityToBackground() {
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    return;
  }
  
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
}

/**
 * Handle click events for activity tracking
 * @param {Event} event - Click event
 */
function handleClick(event) {
  // Send activity ping to background (throttled)
  pingActivityToBackground();
  
  // Don't hide popup if clicking on the popup itself or its children
  if (event.target.closest('.unit-converter-popup')) {
    return;
  }
  
  // Hide popup when clicking outside
  popupManager.hidePopup();
  currentlyDisplayedText = null;
}

/**
 * Handle text selection events
 * @param {Event} event - Mouse up event
 */
async function handleTextSelection(event) {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  // Send activity ping to background (throttled)
  pingActivityToBackground();
  
  // Guard: Only process single-line selections (no line breaks)
  if (!selectedText || selectedText.length === 0 || selectedText.includes('\n') || selectedText.includes('\r')) {
    popupManager.hidePopup();
    currentlyDisplayedText = null;
    return;
  }
  
  // Skip if we're re-selecting the same text that's already displayed
  if (currentlyDisplayedText === selectedText && popupManager.conversionPopup) {
    return;
  }
  
  // Capture selection rect BEFORE any async operations (selection can be cleared by user)
  let selectionRect = null;
  try {
    const range = selection.getRangeAt(0);
    selectionRect = range.getBoundingClientRect();
  } catch (error) {
    // Selection was cleared or invalid
    popupManager.hidePopup();
    return;
  }
  
  // Try currency conversion first
  const currencyConverter = window.UnitConverter.currencyConverter;
  const currencySymbol = currencyConverter.extractCurrencySymbol(selectedText);
  const detectedCurrency = currencyConverter.detectCurrency(currencySymbol);
  
  if (detectedCurrency !== 'Unknown currency') {
    const extractedNumber = currencyConverter.extractNumber(selectedText);
    const targetCurrency = userSettings.currencyUnit || 'USD';
    
    // Only convert if we have a valid number and currencies are different
    if (extractedNumber && detectedCurrency.toUpperCase() !== targetCurrency.toUpperCase()) {
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
        original: `${extractedNumber} ${detectedCurrency}`,
        converted: '...'
      }];
      
      try {
        await processCurrencyConversions(conversions);
        await popupManager.showConversionPopup(conversions, selectionRect);
        currentlyDisplayedText = selectedText;
      } catch (error) {
        console.error('Error showing currency conversion popup:', error);
      }
      return;
    }
  }
  
  // Fallback: Try regular unit conversions
  const conversions = conversionDetector.findConversions(selectedText, userSettings);
  
  if (conversions.length === 0) {
    popupManager.hidePopup();
    currentlyDisplayedText = null;
    return;
  }
  
  try {
    await processCurrencyConversions(conversions);
    await popupManager.showConversionPopup(conversions, selectionRect);
    currentlyDisplayedText = selectedText;
  } catch (error) {
    console.error('Error showing conversion popup:', error);
    popupManager.hidePopup();
    currentlyDisplayedText = null;
  }
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
        // Check if extension context is still valid before making API call
        if (!isExtensionContextValid()) {
          console.warn('Extension context invalidated, skipping currency conversion');
          continue;
        }
        
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

// Listen for messages from background
if (isExtensionContextValid()) {
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
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
