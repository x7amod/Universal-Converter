// Popup script for settings management
document.addEventListener('DOMContentLoaded', async function() {
  // Initialize currency list dynamically
  await initializeCurrencyList();
  
  const elements = {
    metricBtn: document.getElementById('metricBtn'),
    imperialBtn: document.getElementById('imperialBtn'),
    customBtn: document.getElementById('customBtn'),
    lengthUnit: document.getElementById('lengthUnit'),
    weightUnit: document.getElementById('weightUnit'),
    temperatureUnit: document.getElementById('temperatureUnit'),
    volumeUnit: document.getElementById('volumeUnit'),
    areaUnit: document.getElementById('areaUnit'),
    speedUnit: document.getElementById('speedUnit'),
    accelerationUnit: document.getElementById('accelerationUnit'),
    flowRateUnit: document.getElementById('flowRateUnit'),
    torqueUnit: document.getElementById('torqueUnit'),
    pressureUnit: document.getElementById('pressureUnit'),
    timezoneUnit: document.getElementById('timezoneUnit'),
    time12Btn: document.getElementById('time12Btn'),
    time24Btn: document.getElementById('time24Btn'),
    currencyUnit: document.getElementById('currencyUnit')
  };
  
  // Preset configurations
  const presets = {
    metric: {
      lengthUnit: 'm',
      weightUnit: 'kg',
      temperatureUnit: 'c',
      volumeUnit: 'l',
      areaUnit: 'm2',
      speedUnit: 'kmh',
      accelerationUnit: 'ms2',
      flowRateUnit: 'lmin',
      torqueUnit: 'nm',
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
  
  // Dynamic currency list initialization
  async function initializeCurrencyList() {
    const currencySelect = document.getElementById('currencyUnit');
    
    // Clear existing options (using textContent is safer than innerHTML)
    currencySelect.textContent = '';
    
    // Add all currencies from the mapping
    if (typeof countryNameToCurrencyCode !== 'undefined') {
      populateSelectList(currencySelect, countryNameToCurrencyCode, 'USD');
    } else {
      // Fallback to basic currency list if mapping not loaded
      const basicCurrencies = {
        'United States Dollar': 'USD',
        'Euro': 'EUR', 
        'British Pound Sterling': 'GBP',
        'Japanese Yen': 'JPY',
        'Canadian Dollar': 'CAD',
        'Australian Dollar': 'AUD',
        'Swiss Franc': 'CHF',
        'Chinese Yuan': 'CNY',
        'Indian Rupee': 'INR',
        'South Korean Won': 'KRW'
      };
      populateSelectList(currencySelect, basicCurrencies, 'USD');
      console.warn('countryNameToCurrencyCode mapping not found. Loaded basic currency list.');
    }
  }
  
  // Populate select list function
  function populateSelectList(selectElement, dataList, defaultOption) {
    for (const key in dataList) {
      const option = document.createElement('option');
      option.value = dataList[key];
      option.text = key;
      selectElement.appendChild(option);
    }

    if (defaultOption && !checkValueExists(selectElement, defaultOption)) {
      removeOptionByValue(selectElement, defaultOption);
    }
  }
  
  // Check if value exists in select list
  function checkValueExists(list, value) {
    const options = list.options;
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === value) {
        return true;
      }
    }
    return false;
  }
  
  // Remove option by value
  function removeOptionByValue(list, value) {
    const options = list.options;
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === value) {
        list.remove(i);
        break;
      }
    }
  }
  
  // Load saved settings
  await loadSettings();
    // Event listeners for preset buttons with auto-save
  elements.metricBtn.addEventListener('click', () => {
    applyPreset('metric');
    saveSettings(); // Auto-save when preset is applied
  });
  elements.imperialBtn.addEventListener('click', () => {
    applyPreset('imperial');
    saveSettings(); // Auto-save when preset is applied
  });
  elements.customBtn.addEventListener('click', () => {
    applyPreset('custom');
    saveSettings(); // Auto-save when preset is applied
  });
  // Event listeners for unit selectors with auto-save (excluding currency and timezone)
  [elements.lengthUnit, elements.weightUnit, elements.temperatureUnit, 
   elements.volumeUnit, elements.areaUnit, elements.speedUnit, elements.accelerationUnit,
   elements.flowRateUnit, elements.torqueUnit, elements.pressureUnit].forEach(select => {
    select.addEventListener('change', () => {
      updateActivePreset();
      saveSettings(); // Auto-save when any setting changes
    });
  });
  
  // Currency, timezone and time format changes don't affect preset status
  elements.currencyUnit.addEventListener('change', () => {
    saveSettings();
  });
  
  elements.timezoneUnit.addEventListener('change', () => {
    saveSettings();
  });
  
  elements.time12Btn.addEventListener('click', () => {
    elements.time12Btn.classList.add('active');
    elements.time24Btn.classList.remove('active');
    saveSettings();
  });
  
  elements.time24Btn.addEventListener('click', () => {
    elements.time24Btn.classList.add('active');
    elements.time12Btn.classList.remove('active');
    saveSettings();
  });
  
  // Migrate old unit values to new simplified options
  function migrateUnitSettings(settings) {
    const unitMappings = {
      // Length mappings
      lengthUnit: { 
        'm': 'm', 'cm': 'm', 'mm': 'm', 'km': 'm',  // All metric -> m
        'in': 'ft', 'ft': 'ft', 'yd': 'ft', 'mi': 'ft'  // All imperial -> ft
      },
      // Area mappings
      areaUnit: {
        'm2': 'm2', 'cm2': 'm2', 'km2': 'm2',  // All metric -> m2
        'ft2': 'ft2', 'in2': 'ft2', 'acre': 'ft2'  // All imperial -> ft2
      },
      // Speed mappings
      speedUnit: {
        'kmh': 'kmh', 'ms': 'kmh',  // Metric -> kmh
        'mph': 'mph', 'fps': 'mph',  // Imperial -> mph
        'kn': 'kn',  // Nautical stays
        'mach': 'mach'  // Mach stays
      },
      // Acceleration mappings
      accelerationUnit: {
        'ms2': 'ms2', 'cms2': 'ms2', 'kms2': 'ms2',  // Metric -> ms2
        'fts2': 'fts2', 'ins2': 'fts2',  // Imperial -> fts2
        'gforce': 'gforce'  // g-force stays
      },
      // Flow Rate mappings
      flowRateUnit: {
        'lmin': 'lmin', 'lpm': 'lmin', 'mlmin': 'lmin', 'mls': 'lmin', 
        'ls': 'lmin', 'lh': 'lmin', 'm3s': 'lmin', 'm3h': 'lmin', 'm3min': 'lmin',  // All metric -> lmin
        'galmin': 'galmin', 'gpm': 'galmin', 'gals': 'galmin', 'galh': 'galmin', 
        'cfm': 'galmin', 'cfs': 'galmin'  // All imperial -> galmin
      },
      // Torque mappings
      torqueUnit: {
        'nm': 'nm', 'kgm': 'nm', 'kgfm': 'nm',  // Metric -> nm
        'lbft': 'lbft', 'lbin': 'lbft', 'ozin': 'lbft'  // Imperial -> lbft
      },
      // Volume mappings
      volumeUnit: {
        'l': 'l', 'ml': 'l',  // Metric -> l
        'gal': 'gal', 'qt': 'gal', 'pt': 'gal', 'cup': 'gal', 'fl_oz': 'gal'  // Imperial -> gal
      },
      // Weight mappings
      weightUnit: {
        'kg': 'kg', 'g': 'kg', 't': 'kg', 'mg': 'kg',  // Metric -> kg
        'lb': 'lb', 'oz': 'lb'  // Imperial -> lb
      }
    };
    
    // Apply migrations
    for (const [unitType, mappings] of Object.entries(unitMappings)) {
      if (settings[unitType] && mappings[settings[unitType]]) {
        settings[unitType] = mappings[settings[unitType]];
      }
    }
    
    return settings;
  }

  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['unitSettings']);
      let settings = result.unitSettings || presets.metric;
      
      // Migrate old settings to new simplified options
      settings = migrateUnitSettings(settings);
      
      elements.lengthUnit.value = settings.lengthUnit || 'm';
      elements.weightUnit.value = settings.weightUnit || 'kg';
      elements.temperatureUnit.value = settings.temperatureUnit || 'c';
      elements.volumeUnit.value = settings.volumeUnit || 'l';
      elements.areaUnit.value = settings.areaUnit || 'm2';
      elements.speedUnit.value = settings.speedUnit || 'kmh';
      elements.accelerationUnit.value = settings.accelerationUnit || 'ms2';
      elements.flowRateUnit.value = settings.flowRateUnit || 'lmin';
      elements.torqueUnit.value = settings.torqueUnit || 'nm';
      elements.pressureUnit.value = settings.pressureUnit || 'bar';
      elements.timezoneUnit.value = settings.timezoneUnit || 'auto';
      
      // Set time format buttons based on settings
      const is12hr = settings.is12hr !== false; // Default to 12hr (true)
      if (is12hr) {
        elements.time12Btn.classList.add('active');
        elements.time24Btn.classList.remove('active');
      } else {
        elements.time24Btn.classList.add('active');
        elements.time12Btn.classList.remove('active');
      }
      
      elements.currencyUnit.value = settings.currencyUnit || 'USD';
      
      updateActivePreset(settings.preset || 'metric');
    } catch (error) {
      console.error('Error loading settings:', error);
      applyPreset('metric');
    }
  }
  
  function applyPreset(presetName) {
    if (presetName !== 'custom' && presets[presetName]) {
      const preset = presets[presetName];
      
      elements.lengthUnit.value = preset.lengthUnit;
      elements.weightUnit.value = preset.weightUnit;
      elements.temperatureUnit.value = preset.temperatureUnit;
      elements.volumeUnit.value = preset.volumeUnit;
      elements.areaUnit.value = preset.areaUnit;
      elements.speedUnit.value = preset.speedUnit;
      elements.accelerationUnit.value = preset.accelerationUnit;
      elements.flowRateUnit.value = preset.flowRateUnit;
      elements.torqueUnit.value = preset.torqueUnit;
      elements.pressureUnit.value = preset.pressureUnit;
    }
    updateActivePreset(presetName);
  }
  
  function updateActivePreset(activePreset = null) {
    // Remove active class from all buttons
    [elements.metricBtn, elements.imperialBtn, elements.customBtn].forEach(btn => {
      btn.classList.remove('active');
    });
    
    if (activePreset) {
      // Set the specified preset as active
      if (activePreset === 'metric') elements.metricBtn.classList.add('active');
      else if (activePreset === 'imperial') elements.imperialBtn.classList.add('active');
      else if (activePreset === 'custom') elements.customBtn.classList.add('active');
    } else {
      // Auto-detect based on current settings (excluding currency and timezone)
      const currentSettings = {
        lengthUnit: elements.lengthUnit.value,
        weightUnit: elements.weightUnit.value,
        temperatureUnit: elements.temperatureUnit.value,
        volumeUnit: elements.volumeUnit.value,
        areaUnit: elements.areaUnit.value,
        speedUnit: elements.speedUnit.value,
        accelerationUnit: elements.accelerationUnit.value,
        flowRateUnit: elements.flowRateUnit.value,
        torqueUnit: elements.torqueUnit.value,
        pressureUnit: elements.pressureUnit.value
      };
      
      // Compare against preset configurations (excluding currency and timezone)
      const metricSettings = {
        lengthUnit: presets.metric.lengthUnit,
        weightUnit: presets.metric.weightUnit,
        temperatureUnit: presets.metric.temperatureUnit,
        volumeUnit: presets.metric.volumeUnit,
        areaUnit: presets.metric.areaUnit,
        speedUnit: presets.metric.speedUnit,
        accelerationUnit: presets.metric.accelerationUnit,
        flowRateUnit: presets.metric.flowRateUnit,
        torqueUnit: presets.metric.torqueUnit,
        pressureUnit: presets.metric.pressureUnit
      };
      
      const imperialSettings = {
        lengthUnit: presets.imperial.lengthUnit,
        weightUnit: presets.imperial.weightUnit,
        temperatureUnit: presets.imperial.temperatureUnit,
        volumeUnit: presets.imperial.volumeUnit,
        areaUnit: presets.imperial.areaUnit,
        speedUnit: presets.imperial.speedUnit,
        accelerationUnit: presets.imperial.accelerationUnit,
        flowRateUnit: presets.imperial.flowRateUnit,
        torqueUnit: presets.imperial.torqueUnit,
        pressureUnit: presets.imperial.pressureUnit
      };
      
      const isMetric = JSON.stringify(currentSettings) === JSON.stringify(metricSettings);
      const isImperial = JSON.stringify(currentSettings) === JSON.stringify(imperialSettings);
      
      if (isMetric) {
        elements.metricBtn.classList.add('active');
      } else if (isImperial) {
        elements.imperialBtn.classList.add('active');
      } else {
        elements.customBtn.classList.add('active');
      }
    }
  }
  
  async function saveSettings() {
    const settings = {
      preset: getActivePreset(),
      lengthUnit: elements.lengthUnit.value,
      weightUnit: elements.weightUnit.value,
      temperatureUnit: elements.temperatureUnit.value,
      volumeUnit: elements.volumeUnit.value,
      areaUnit: elements.areaUnit.value,
      speedUnit: elements.speedUnit.value,
      accelerationUnit: elements.accelerationUnit.value,
      flowRateUnit: elements.flowRateUnit.value,
      torqueUnit: elements.torqueUnit.value,
      pressureUnit: elements.pressureUnit.value,
      timezoneUnit: elements.timezoneUnit.value,
      is12hr: elements.time12Btn.classList.contains('active'),
      currencyUnit: elements.currencyUnit.value
    };
    
    try {
      await chrome.storage.sync.set({ unitSettings: settings });
      
      // Notify content scripts about settings update
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'settingsUpdated' });
        } catch (error) {
          // Ignore errors for tabs that don't have the content script
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }
  
  function getActivePreset() {
    if (elements.metricBtn.classList.contains('active')) return 'metric';
    if (elements.imperialBtn.classList.contains('active')) return 'imperial';
    return 'custom';
  }
});
