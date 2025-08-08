// Background service worker for Chrome Extension v3

// Handle extension icon click to open settings page
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('settings-page/settings.html')
  });
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Unit Converter extension installed');
  
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
      const defaultSettings = {
        preset: 'metric',
        lengthUnit: 'm',
        weightUnit: 'kg',
        temperatureUnit: 'c',
        volumeUnit: 'l',
        areaUnit: 'm2'
      };
      await chrome.storage.sync.set({ unitSettings: defaultSettings });
      console.log('Default settings initialized');
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
  console.log('Unit Converter extension started');
  createContextMenu();
});

/**
 * Create context menu for the extension icon
 */
function createContextMenu() {
  // Clear existing context menus first
  chrome.contextMenus.removeAll(() => {
    // Create Settings context menu item
    chrome.contextMenus.create({
      id: 'open-settings',
      title: 'Universal Converter Settings',
      contexts: ['action']
    });
    
    // Only add Reload Extension in development mode
    // Check if we're in development by looking for unpacked extension
    chrome.management.getSelf((extensionInfo) => {
      if (extensionInfo.installType === 'development') {
        chrome.contextMenus.create({
          id: 'reload-extension',
          title: 'Reload Extension',
          contexts: ['action']
        });
      }
    });
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
  } else if (info.menuItemId === 'reload-extension') {
    // Reload the extension
    chrome.runtime.reload();
  }
});
