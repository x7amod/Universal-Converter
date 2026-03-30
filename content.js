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

// Track latest async conversion operation to avoid stale popup updates
let currentOperationId = null;

// Flag set synchronously in handleTextSelection when async conversion work is about
// to start. Consumed once by handleClick so the paired click from the same
// mouseup->click gesture does not cancel the in-flight popup operation.


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
  pingActivityToBackground();
}

/**
 * Handle text selection events
 * @param {Event} event - Mouse up event
 */
async function handleTextSelection(event) {
  // Generate unique operation ID for this conversion
  const operationId = String(Date.now()); currentOperationId = operationId;
  
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  // Send activity ping to background (throttled)
  pingActivityToBackground();
  
  // Guard: Only process single-line selections (no line breaks)
  if (!selectedText || selectedText.length === 0 || selectedText.includes('\n') || selectedText.includes('\r')) {
    popupManager.removePopup();
    currentlyDisplayedText = null;
    return;
  }
  
  // Skip if we're re-selecting the same text that's already displayed
  if (currentlyDisplayedText === selectedText && popupManager.activePopup) {
    return;
  }
  
  // Capture selection rect BEFORE any async operations (selection can be cleared by user)
  let selectionRect = null;
  try {
    const range = selection.getRangeAt(0);
    selectionRect = range.getBoundingClientRect();
  } catch (error) {
    // Selection was cleared or invalid
    popupManager.removePopup();
    return;
  }
  
  // Use unified detector for currency, dimensions, and regular units
  const conversions = conversionDetector.findConversions(selectedText, userSettings);
  
  if (conversions.length === 0) {
    popupManager.removePopup();
    currentlyDisplayedText = null;
    return;
  }
  
  
  
  try {
    popupManager.suppressGestureClickOnce();
    await processCurrencyConversions(conversions, operationId);
    showConversions(conversions, selectionRect, operationId);
    currentlyDisplayedText = selectedText;
  } catch (error) {
    
    console.error('Error showing conversion popup:', error);
    popupManager.removePopup();
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
 * @param {string} operationId - Operation ID to validate before updating conversions
 */
async function processCurrencyConversions(conversions, operationId) {
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
          conversion.converted = 'Extension reloaded - refresh page';
          conversion.needsAsyncProcessing = false;
          continue;
        }
        
        //console.log('Processing currency conversion:', conversion);
        
        // Request rate from background worker
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



function showConversions(conversions, selectionRect, operationId) {
  if (operationId !== currentOperationId) return; // Prevent race conditions

  const contentNode = popupManager.buildPopupNode(conversions);

  const margin = 10;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  // Use the popup's CSS min-width as a conservative width estimate for clamping
  const estimatedPopupWidth = 250; // px, matches popup CSS min-width
  // Rough height estimate for deciding above/below placement
  const estimatedPopupHeight = 200; // px

  // Horizontal positioning: center on the selection, then clamp within viewport
  const selectionCenterX = selectionRect.left + (selectionRect.width / 2);
  let left = selectionCenterX + window.scrollX - (estimatedPopupWidth / 2);
  left = Math.max(margin, Math.min(left, viewportWidth - estimatedPopupWidth - margin));

  // Vertical positioning: prefer below, but place above if there isn't enough space
  const spaceBelow = viewportHeight - selectionRect.bottom;
  const spaceAbove = selectionRect.top;
  let top;

  if (spaceBelow < estimatedPopupHeight && spaceAbove > spaceBelow) {
    // Place above the selection
    top = selectionRect.top + window.scrollY - estimatedPopupHeight - margin;
  } else {
    // Default: place below the selection
    top = selectionRect.bottom + window.scrollY + margin;
  }
  popupManager.showPopup(contentNode, left, top);
}
