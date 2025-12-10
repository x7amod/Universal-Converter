// Main content script - orchestrates unit conversion functionality

// Global instances
let unitConverter;
let conversionDetector;
let popupManager;
let settingsManager;
let userSettings = {};

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
  document.addEventListener('click', hidePopup);
  document.addEventListener('scroll', hidePopup);
  window.addEventListener('resize', hidePopup);
}

/**
 * Handle text selection events using Currency-Converter approach
 * @param {Event} event - Mouse up event
 */
async function handleTextSelection(event) {
  setTimeout(async () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
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
            
            await processCurrencyConversions(conversions);
            popupManager.showConversionPopup(conversions, selection);
            return;
          }
        }
      }
      
      // Fallback to regular unit conversions
      const conversions = conversionDetector.findConversions(selectedText, userSettings);
      
      if (conversions.length > 0) {
        await processCurrencyConversions(conversions);
        popupManager.showConversionPopup(conversions, selection);
      } else {
        hidePopup();
      }
    } else {
      hidePopup();
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
 * @param {Array} conversions - Array of conversion objects
 */
async function processCurrencyConversions(conversions) {
  if (!window.UnitConverter.currencyConverter) {
    console.error('Currency converter not available');
    return;
  }
  
  for (const conversion of conversions) {
    if (conversion.type === 'currency' && conversion.needsAsyncProcessing) {
      try {
        //console.log('Processing currency conversion:', conversion);
        
        // Get the conversion rate
        const rate = await window.UnitConverter.currencyConverter.getCurrencyRate(
          conversion.fromCurrency.toLowerCase(), 
          conversion.toCurrency.toLowerCase()
        );
        
        //console.log('Got rate:', rate);
        
        if (rate && rate > 0) {
          const convertedAmount = conversion.originalValue * rate;
          const formattedResult = window.UnitConverter.currencyConverter.formatCurrency(
            convertedAmount, 
            conversion.toCurrency
          );
          
          //console.log('Formatted result:', formattedResult);
          
          conversion.converted = formattedResult;
          conversion.convertedValue = convertedAmount;
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
 * Hide the conversion popup
 */
function hidePopup() {
  popupManager.hidePopup();
}

/**
 * Listen for messages from background script or popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'settingsUpdated') {
    loadUserSettings();
    sendResponse({ status: 'Settings updated' });
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
