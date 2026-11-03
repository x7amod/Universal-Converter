// Settings management and storage utilities

// Global namespace for settings manager
window.UnitConverter = window.UnitConverter || {};

window.UnitConverter.SettingsManager = class {
  constructor() {
    // Use metric preset as default
    this.defaultSettings = {
      preset: 'metric',
      is12hr: true,
      enabledGlobally: true,
      siteOverrides: {}
    };
  }

  /**
   * Merge stored settings with the defaults for their preset
   * @param {Object} storedSettings - Settings loaded from storage
   * @returns {Object} - Fully expanded settings
   */
  resolveSettings(storedSettings = {}) {
    const stored = storedSettings && typeof storedSettings === 'object' ? { ...storedSettings } : {};
    const presetName = stored.preset === 'imperial' ? 'imperial' : 'metric';
    const preset = this.getPresets()[presetName] || {};
    const siteOverrides = stored.siteOverrides &&
      typeof stored.siteOverrides === 'object' &&
      !Array.isArray(stored.siteOverrides)
      ? stored.siteOverrides
      : {};

    // Migrate the old lowercase torque value, which is now the nanometer length unit
    if (stored.torqueUnit === 'nm') {
      stored.torqueUnit = 'Nm';
    }

    return {
      ...this.defaultSettings,
      ...preset,
      ...stored,
      siteOverrides
    };
  }
  
  /**
   * Load user settings from Chrome storage
   * @returns {Promise<Object>} - User settings object
   */
  async loadSettings() {
    try {
      // Check if chrome.storage is available and extension context is valid
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync && chrome.runtime?.id) {
        const result = await chrome.storage.sync.get(['unitSettings', 'blockedSites']);
        const storedSettings = result.unitSettings || {};

        return {
          ...this.resolveSettings(storedSettings),
          blockedSites: window.SiteBlocklist.normalizeList(result.blockedSites)
        };
      }
      return { ...this.resolveSettings(), blockedSites: [] };
    } catch (error) {
      console.error('Error loading settings:', error);
      return { ...this.resolveSettings(), blockedSites: [] };
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
        speedUnit: 'kmh',
        accelerationUnit: 'ms2',
        flowRateUnit: 'lmin',
        torqueUnit: 'Nm',
        pressureUnit: 'bar'
      },
      imperial: {
        lengthUnit: 'ft',
        weightUnit: 'lb',
        temperatureUnit: 'f',
        volumeUnit: 'gal',
        areaUnit: 'ft2',
        speedUnit: 'mph',
        accelerationUnit: 'fts2',
        flowRateUnit: 'galmin',
        torqueUnit: 'lbft',
        pressureUnit: 'psi'
      }
    };
  }
};
