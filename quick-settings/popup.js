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
  let blockedSites = [];

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

    const latest = await loadSettings();
    blockedSites = latest.blockedSites;
    renderState(latest.unitSettings);

    elements.globalToggle.addEventListener('change', async () => {
      const latest = await loadSettings();
      blockedSites = latest.blockedSites;
      const updated = {
        ...latest.unitSettings,
        enabledGlobally: elements.globalToggle.checked
      };

      await saveUnitSettings(updated);
      renderState(updated);
    });

    elements.siteToggle.addEventListener('change', async () => {
      if (!isSiteToggleAvailable || !activeHostname) {
        return;
      }

      const latest = await loadSettings();
      const siteOverrides = sanitizeSiteOverrides(latest.unitSettings.siteOverrides);
      let updatedBlockedSites = latest.blockedSites;

      if (elements.siteToggle.checked) {
        const parentBlock = updatedBlockedSites.find(site =>
          activeHostname !== site && activeHostname.endsWith(`.${site}`)
        );
        if (parentBlock) {
          elements.siteToggle.checked = false;
          elements.siteStatus.textContent = `Blocked ${parentBlock}; remove it in Settings.`;
          elements.siteStatus.classList.add('error');
          return;
        }
        updatedBlockedSites = updatedBlockedSites.filter(site => site !== activeHostname);
        delete siteOverrides[activeHostname];
      } else {
        if (!window.SiteBlocklist.isBlocked(activeHostname, updatedBlockedSites)) {
          updatedBlockedSites = [...updatedBlockedSites, activeHostname];
        }
        delete siteOverrides[activeHostname];
      }

      const updated = {
        ...latest.unitSettings,
        siteOverrides
      };

      try {
        await chrome.storage.sync.set({
          unitSettings: normalizeUnitSettings(updated),
          blockedSites: window.SiteBlocklist.normalizeList(updatedBlockedSites)
        });
        blockedSites = window.SiteBlocklist.normalizeList(updatedBlockedSites);
        renderState(updated);
      } catch (error) {
        blockedSites = latest.blockedSites;
        renderState(latest.unitSettings);
        elements.siteStatus.textContent = 'Could not update this website.';
        elements.siteStatus.classList.add('error');
      }
    });

    elements.goToSettingsBtn.addEventListener('click', async () => {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('settings-page/settings.html')
      });
      window.close();
    });
  }

  function renderState(unitSettings) {
    const normalized = normalizeUnitSettings(unitSettings);

    elements.globalToggle.checked = normalized.enabledGlobally;

    if (isSiteToggleAvailable && activeHostname) {
      const blockingSite = blockedSites.find(site =>
        activeHostname === site || activeHostname.endsWith(`.${site}`)
      );
      const siteEnabled = !blockingSite && normalized.siteOverrides[activeHostname] !== false;
      elements.siteToggle.checked = siteEnabled;
      elements.siteToggle.disabled = false;
      elements.siteStatus.textContent = blockingSite ? `Blocked ${blockingSite}` : `Site: ${activeHostname}`;
      elements.siteStatus.classList.toggle('error', Boolean(blockingSite));
    } else {
      elements.siteToggle.checked = false;
      elements.siteToggle.disabled = true;
    }
  }
});

async function loadSettings() {
  const result = await chrome.storage.sync.get(['unitSettings', 'blockedSites']);
  return {
    unitSettings: normalizeUnitSettings(result.unitSettings || {}),
    blockedSites: window.SiteBlocklist.normalizeList(result.blockedSites)
  };
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
