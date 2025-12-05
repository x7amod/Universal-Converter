// Settings management and storage utilities

// Global namespace for settings manager
window.UnitConverter = window.UnitConverter || {};

window.UnitConverter.SettingsManager = class {
  constructor() {
    this.defaultSettings = {
      preset: 'metric',
      lengthUnit: 'm',
      weightUnit: 'kg',
      temperatureUnit: 'c',
      volumeUnit: 'l',
      areaUnit: 'm2',
      accelerationUnit: 'ms2',
      flowRateUnit: 'lmin'
    };
  }
  
  /**
   * Load user settings from Chrome storage
   * @returns {Promise<Object>} - User settings object
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['unitSettings']);
      return result.unitSettings || this.defaultSettings;
    } catch (error) {
      console.error('Error loading settings:', error);
      return this.defaultSettings;
    }
  }
  
  /**
   * Save user settings to Chrome storage
   * @param {Object} settings - Settings object to save
   * @returns {Promise<boolean>} - Success status
   */
  async saveSettings(settings) {
    try {
      await chrome.storage.sync.set({ unitSettings: settings });
      
      // Notify all tabs about settings update
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { 
            action: 'settingsUpdated',
            newSettings: settings
          });
        } catch (error) {
          // Ignore errors for tabs without content script
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }
  
  /**
   * Get preset configurations
   * @returns {Object} - Preset configurations
   */
  getPresets() {
    return {
      metric: {
        lengthUnit: 'm',
        weightUnit: 'kg',
        temperatureUnit: 'c',
        volumeUnit: 'l',
        areaUnit: 'm2',
        accelerationUnit: 'ms2',
        flowRateUnit: 'lmin'
      },
      imperial: {
        lengthUnit: 'ft',
        weightUnit: 'lb',
        temperatureUnit: 'f',
        volumeUnit: 'gal',
        areaUnit: 'ft2',
        accelerationUnit: 'fts2',
        flowRateUnit: 'galmin'
      }
    };
  }
  
  /**
   * Apply a preset to settings
   * @param {string} presetName - Name of the preset
   * @param {Object} currentSettings - Current settings to merge with
   * @returns {Object} - Updated settings
   */
  applyPreset(presetName, currentSettings = {}) {
    const presets = this.getPresets();
    const preset = presets[presetName];
    
    if (!preset) {
      return { ...this.defaultSettings, ...currentSettings };
    }
    
    return {
      ...currentSettings,
      preset: presetName,
      ...preset
    };
  }
  
  /**
   * Detect if current settings match a preset
   * @param {Object} settings - Settings to check
   * @returns {string} - Preset name or 'custom'
   */
  detectPreset(settings) {
    const presets = this.getPresets();
    
    for (const [presetName, presetConfig] of Object.entries(presets)) {
      const matches = Object.keys(presetConfig).every(key => 
        settings[key] === presetConfig[key]
      );
      
      if (matches) {
        return presetName;
      }
    }
      return 'custom';
  }
};
