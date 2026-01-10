// Background service worker for Chrome Extension v3

// Track if context menu is being created to prevent duplicates
let isCreatingContextMenu = false;

// Handle extension icon click to open settings page
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('settings-page/settings.html')
  });
});

chrome.runtime.onInstalled.addListener(async (details) => {
  //console.log('Unit Converter extension installed');
  
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

// Handle context menu (optional future feature)
chrome.runtime.onStartup.addListener(() => {
  //console.log('Unit Converter extension started');
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
    // Clear currency cache in all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'clearCurrencyCache'
        }).catch(() => {
          // Ignore errors for tabs without content script
        });
      });
    });
    console.log('Currency cache cleared in all tabs');
  } else if (info.menuItemId === 'reload-extension') {
    // Reload the extension
    chrome.runtime.reload();
  }
});
