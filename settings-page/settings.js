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
    currencyUnit: document.getElementById('currencyUnit'),
    currencyHint: document.getElementById('currencyHint'),
    currencyHintDismiss: document.getElementById('currencyHintDismiss'),
    blockedSiteForm: document.getElementById('blockedSiteForm'),
    blockedSiteInput: document.getElementById('blockedSiteInput'),
    blockedSitesList: document.getElementById('blockedSitesList'),
    blockedSitesStatus: document.getElementById('blockedSitesStatus')
  };

  let persistedUnitSettings = {};
  let blockedSites = [];
  
  const settingsManager = new window.UnitConverter.SettingsManager();
  const presets = settingsManager.getPresets();
  
  // Dynamic currency list initialization
  async function initializeCurrencyList() {
    const currencySelect = document.getElementById('currencyUnit');
    
    // Clear existing options
    currencySelect.textContent = '';
    
    // Add all currencies from the mapping
    if (typeof countryNameToCurrencyCode !== 'undefined') {
      populateSelectList(currencySelect, countryNameToCurrencyCode);
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
      populateSelectList(currencySelect, basicCurrencies);
      console.warn('countryNameToCurrencyCode mapping not found. Loaded basic currency list.');
    }
  }
  
  // Populate select list function
  function populateSelectList(selectElement, dataList) {
    for (const key in dataList) {
      const option = document.createElement('option');
      option.value = dataList[key];
      option.text = key;
      selectElement.appendChild(option);
    }
  }
  
  // Load saved settings
  await loadSettings();
  await loadBlockedSites();

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync') return;

    if (changes.unitSettings) {
      persistedUnitSettings = changes.unitSettings.newValue || {};
      loadSettings();
    }

    if (changes.blockedSites) {
      blockedSites = window.SiteBlocklist.normalizeList(changes.blockedSites.newValue);
      renderBlockedSites();
    }
  });

  elements.blockedSiteForm.addEventListener('submit', async event => {
    event.preventDefault();
    await addBlockedSite(elements.blockedSiteInput.value);
  });

  elements.blockedSitesList.addEventListener('click', async event => {
    const button = event.target.closest('button[data-hostname]');
    if (button) await removeBlockedSite(button.dataset.hostname);
  });

    // Event listeners for preset buttons with auto-save
  elements.metricBtn.addEventListener('click', () => {
    applyPreset('metric');
    saveSettings();
  });
  elements.imperialBtn.addEventListener('click', () => {
    applyPreset('imperial');
    saveSettings();
  });
  elements.customBtn.addEventListener('click', () => {
    applyPreset('custom');
    saveSettings();
  });
  // Event listeners for unit selectors with auto-save (excluding currency and timezone)
  [elements.lengthUnit, elements.weightUnit, elements.temperatureUnit, 
   elements.volumeUnit, elements.areaUnit, elements.speedUnit, elements.accelerationUnit,
   elements.flowRateUnit, elements.torqueUnit, elements.pressureUnit].forEach(select => {
    select.addEventListener('change', () => {
      updateActivePreset();
      saveSettings();
    });
  });
  
  // The install tab is opened with ?firstRun=1 to remind the user to pick a target currency
  if (new URLSearchParams(window.location.search).has('firstRun')) {
    elements.currencyHint.hidden = false;
  }

  elements.currencyHintDismiss.addEventListener('click', () => {
    elements.currencyHint.hidden = true;
  });

  // Currency, timezone and time format changes don't affect preset status
  elements.currencyUnit.addEventListener('change', () => {
    elements.currencyHint.hidden = true;
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
  
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['unitSettings']);
      persistedUnitSettings = result.unitSettings || {};

      const settings = settingsManager.resolveSettings(persistedUnitSettings);
      
      elements.lengthUnit.value = settings.lengthUnit || 'm';
      elements.weightUnit.value = settings.weightUnit || 'kg';
      elements.temperatureUnit.value = settings.temperatureUnit || 'c';
      elements.volumeUnit.value = settings.volumeUnit || 'l';
      elements.areaUnit.value = settings.areaUnit || 'm2';
      elements.speedUnit.value = settings.speedUnit || 'kmh';
      elements.accelerationUnit.value = settings.accelerationUnit || 'ms2';
      elements.flowRateUnit.value = settings.flowRateUnit || 'lmin';
      elements.torqueUnit.value = settings.torqueUnit === 'nm' ? 'Nm' : (settings.torqueUnit || 'Nm');
      elements.pressureUnit.value = settings.pressureUnit || 'bar';
      elements.timezoneUnit.value = settings.timezoneUnit || 'auto';
      
      // Set time format buttons based on settings
      const is12hr = typeof settings.is12hr === 'boolean' ? settings.is12hr : true;
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

  async function loadBlockedSites() {
    try {
      const result = await chrome.storage.sync.get(['blockedSites']);
      blockedSites = window.SiteBlocklist.normalizeList(result.blockedSites);
      renderBlockedSites();
    } catch (error) {
      setBlockedSitesStatus('Could not load blocked websites.', true);
    }
  }

  async function addBlockedSite(value) {
    const hostname = window.SiteBlocklist.normalizeHostname(value);
    if (!hostname) {
      setBlockedSitesStatus('Enter a valid website or domain.', true);
      return;
    }
    if (blockedSites.includes(hostname)) {
      setBlockedSitesStatus(`${hostname} is already blocked.`, true);
      return;
    }

    await saveBlockedSites([...blockedSites, hostname], `Blocked ${hostname}.`);
    elements.blockedSiteInput.value = '';
  }

  async function removeBlockedSite(hostname) {
    await saveBlockedSites(blockedSites.filter(site => site !== hostname), `Unblocked ${hostname}.`);
  }

  async function saveBlockedSites(sites, message) {
    const updated = window.SiteBlocklist.normalizeList(sites);
    try {
      await chrome.storage.sync.set({ blockedSites: updated });
      blockedSites = updated;
      renderBlockedSites();
      setBlockedSitesStatus(message);
    } catch (error) {
      setBlockedSitesStatus('Could not save blocked websites.', true);
    }
  }

  function renderBlockedSites() {
    elements.blockedSitesList.replaceChildren();
    if (blockedSites.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'No blocked websites.';
      elements.blockedSitesList.appendChild(empty);
      return;
    }

    blockedSites.forEach(hostname => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = hostname;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.hostname = hostname;
      button.setAttribute('aria-label', `Unblock ${hostname}`);
      button.textContent = 'Remove';
      item.append(label, button);
      elements.blockedSitesList.appendChild(item);
    });
  }

  function setBlockedSitesStatus(message, isError = false) {
    elements.blockedSitesStatus.textContent = message;
    elements.blockedSitesStatus.classList.toggle('error', isError);
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
      ...persistedUnitSettings,
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
      currencyUnit: elements.currencyUnit.value,
      enabledGlobally: typeof persistedUnitSettings.enabledGlobally === 'boolean'
        ? persistedUnitSettings.enabledGlobally
        : true,
      siteOverrides: persistedUnitSettings.siteOverrides &&
        typeof persistedUnitSettings.siteOverrides === 'object' &&
        !Array.isArray(persistedUnitSettings.siteOverrides)
        ? persistedUnitSettings.siteOverrides
        : {}
    };
    
    try {
      await chrome.storage.sync.set({ unitSettings: settings });
      persistedUnitSettings = settings;
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
