const DEFAULT_UNIT_SETTINGS = {
  preset: 'metric',
  is12hr: true,
  enabledGlobally: true,
  siteOverrides: {}
};

document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    siteToggle: document.getElementById('siteToggle'),
    globalToggle: document.getElementById('globalToggle'),
    siteStatus: document.getElementById('siteStatus'),
    goToSettingsBtn: document.getElementById('goToSettingsBtn')
  };

  let activeHostname = '';
  let isSiteToggleAvailable = false;

  init().catch(error => {
    console.error('Quick settings initialization failed:', error);
    elements.siteStatus.textContent = 'Failed to load quick settings.';
    elements.siteStatus.classList.add('error');
  });

  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = tab && tab.url ? tab.url : '';

    activeHostname = extractHostname(tabUrl);
    isSiteToggleAvailable = Boolean(activeHostname);

    if (isSiteToggleAvailable) {
      elements.siteStatus.textContent = `Site: ${activeHostname}`;
      elements.siteStatus.classList.remove('error');
      elements.siteToggle.disabled = false;
    } else {
      elements.siteStatus.textContent = 'Site toggle unavailable on this page.';
      elements.siteStatus.classList.add('error');
      elements.siteToggle.disabled = true;
    }

    const unitSettings = await loadUnitSettings();
    renderState(unitSettings);

    elements.globalToggle.addEventListener('change', async () => {
      const latest = await loadUnitSettings();
      const updated = {
        ...latest,
        enabledGlobally: elements.globalToggle.checked
      };

      await saveUnitSettings(updated);
      renderState(updated);
    });

    elements.siteToggle.addEventListener('change', async () => {
      if (!isSiteToggleAvailable || !activeHostname) {
        return;
      }

      const latest = await loadUnitSettings();
      const siteOverrides = sanitizeSiteOverrides(latest.siteOverrides);

      if (elements.siteToggle.checked) {
        delete siteOverrides[activeHostname];
      } else {
        siteOverrides[activeHostname] = false;
      }

      const updated = {
        ...latest,
        siteOverrides
      };

      await saveUnitSettings(updated);
      renderState(updated);
    });

    elements.goToSettingsBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      let settingsUrl = chrome.runtime.getURL('settings-page/settings.html');
      try {
        const response = tab && await chrome.tabs.sendMessage(tab.id, { action: 'getPageHostname' });
        const hostname = response && response.hostname;
        if (hostname) settingsUrl += `?hostname=${encodeURIComponent(hostname)}`;
      } catch (error) {
        // Open settings without a site hint on browser-restricted pages.
      }
      await chrome.tabs.create({
        url: settingsUrl
      });
      window.close();
    });
  }

  function renderState(unitSettings) {
    const normalized = normalizeUnitSettings(unitSettings);

    elements.globalToggle.checked = normalized.enabledGlobally;

    if (isSiteToggleAvailable && activeHostname) {
      const siteEnabled = normalized.siteOverrides[activeHostname] !== false;
      elements.siteToggle.checked = siteEnabled;
      elements.siteToggle.disabled = false;
    } else {
      elements.siteToggle.checked = false;
      elements.siteToggle.disabled = true;
    }
  }
});

async function loadUnitSettings() {
  const result = await chrome.storage.sync.get(['unitSettings']);
  return normalizeUnitSettings(result.unitSettings || {});
}

async function saveUnitSettings(unitSettings) {
  await chrome.storage.sync.set({ unitSettings: normalizeUnitSettings(unitSettings) });
}

function normalizeUnitSettings(unitSettings) {
  return {
    ...DEFAULT_UNIT_SETTINGS,
    ...unitSettings,
    siteOverrides: sanitizeSiteOverrides(unitSettings.siteOverrides)
  };
}

function sanitizeSiteOverrides(siteOverrides) {
  if (!siteOverrides || typeof siteOverrides !== 'object' || Array.isArray(siteOverrides)) {
    return {};
  }

  return { ...siteOverrides };
}

function extractHostname(urlString) {
  if (!urlString) {
    return '';
  }

  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.hostname;
  } catch (error) {
    return '';
  }
}
