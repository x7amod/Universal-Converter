const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const SiteBlocklist = require('../utils/site-blocklist');

async function waitFor(assertion) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (assertion()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(assertion(), 'timed out waiting for expected state');
}

async function testDomainMatching() {
  assert.equal(SiteBlocklist.normalizeHostname(' HTTPS://Example.COM:443/path?q=1 '), 'example.com');
  assert.equal(SiteBlocklist.isBlocked('shop.example.com', ['example.com']), true);
  assert.equal(SiteBlocklist.isBlocked('example.com', ['example.com']), true);
  assert.equal(SiteBlocklist.isBlocked('notexample.com', ['example.com']), false);
  assert.equal(SiteBlocklist.isBlocked('example.com.attacker.test', ['example.com']), false);
  assert.deepEqual(SiteBlocklist.normalizeList(['Example.com', 'https://example.com/path', 'bad value']), ['example.com']);
}

async function testSettingsAddAndRemove() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'settings-page/settings.html'), 'utf8')
    .replace(/<script[^>]*><\/script>/g, '');
  const settingsScript = fs.readFileSync(path.join(root, 'settings-page/settings.js'), 'utf8');
  const storage = { unitSettings: {}, blockedSites: [] };
  const storageChanged = makeEvent();
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'chrome-extension://test/settings-page/settings.html'
  });
  const { window } = dom;
  window.SiteBlocklist = SiteBlocklist;
  window.countryNameToCurrencyCode = { 'United States Dollar': 'USD' };
  window.chrome = {
    storage: {
      sync: {
        async get(keys) {
          return Object.fromEntries(keys.map(key => [key, storage[key]]));
        },
        async set(values) {
          Object.assign(storage, values);
        }
      },
      onChanged: storageChanged
    }
  };
  const ready = new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  window.eval(settingsScript);
  await ready;

  const blockedSitesGroup = window.document.querySelector('.blocked-sites-group');
  assert.equal(blockedSitesGroup.tagName, 'DIV');
  assert.ok(blockedSitesGroup.classList.contains('preference-row'));
  assert.equal(window.document.getElementById('blockCurrentSiteBtn'), null);
  await waitFor(() => window.document.querySelector('.empty-state'));

  storage.blockedSites = ['quick-settings.example.com'];
  storageChanged.listener({ blockedSites: { newValue: storage.blockedSites } }, 'sync');
  await waitFor(() => window.document.querySelector('button[data-hostname="quick-settings.example.com"]'));

  const input = window.document.getElementById('blockedSiteInput');
  input.value = 'https://blog.example.net/path';
  window.document.getElementById('blockedSiteForm').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true })
  );
  await waitFor(() => storage.blockedSites.includes('blog.example.net'));

  await waitFor(() => window.document.querySelector('button[data-hostname="blog.example.net"]'));
  window.document.querySelector('button[data-hostname="blog.example.net"]').click();
  await waitFor(() => !storage.blockedSites.includes('blog.example.net'));
  assert.deepEqual(storage.blockedSites, ['quick-settings.example.com']);
  dom.window.close();
}

async function testQuickSettingsBlockedSites() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'quick-settings/popup.html'), 'utf8')
    .replace(/<script[^>]*><\/script>/g, '');
  const popupScript = fs.readFileSync(path.join(root, 'quick-settings/popup.js'), 'utf8');
  const storage = { unitSettings: {}, blockedSites: ['shop.example.com'] };
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'chrome-extension://test/quick-settings/popup.html' });
  const { window } = dom;
  window.SiteBlocklist = SiteBlocklist;
  window.chrome = {
    tabs: { async query() { return [{ id: 1, url: 'https://shop.example.com/page' }]; } },
    runtime: { getURL: url => `chrome-extension://test/${url}` },
    storage: {
      sync: {
        async get(keys) { return Object.fromEntries(keys.map(key => [key, storage[key]])); },
        async set(values) { Object.assign(storage, values); }
      }
    }
  };

  const ready = new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  window.eval(popupScript);
  await ready;

  const toggle = window.document.getElementById('siteToggle');
  await waitFor(() => window.document.getElementById('siteStatus').textContent === 'Blocked shop.example.com');
  assert.equal(toggle.checked, false);
  assert.equal(window.document.getElementById('siteStatus').textContent, 'Blocked shop.example.com');

  toggle.checked = true;
  toggle.dispatchEvent(new window.Event('change'));
  await waitFor(() => storage.blockedSites.length === 0);
  assert.equal(toggle.checked, true);

  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change'));
  await waitFor(() => storage.blockedSites.includes('shop.example.com'));
  assert.equal(toggle.checked, false);

  storage.blockedSites = ['example.com'];
  toggle.checked = true;
  toggle.dispatchEvent(new window.Event('change'));
  await waitFor(() => window.document.getElementById('siteStatus').textContent === 'Blocked example.com; remove it in Settings.');
  assert.equal(toggle.checked, false);
  assert.deepEqual(storage.blockedSites, ['example.com']);
  dom.window.close();
}

function makeEvent() {
  return {
    listener: null,
    addListener(listener) { this.listener = listener; }
  };
}

async function testTabAndIconUpdates() {
  const iconCalls = [];
  const sentMessages = [];
  const hosts = { 1: 'shop.example.com', 2: 'notexample.com' };
  const tabs = [{ id: 1 }, { id: 2 }];
  let blockedSites = ['example.com'];
  const settingsChanged = makeEvent();
  const activated = makeEvent();
  const updated = makeEvent();
  const runtime = {
    id: 'test',
    lastError: null,
    onInstalled: makeEvent(),
    onStartup: makeEvent(),
    onMessage: makeEvent(),
    getURL: path => `chrome-extension://test/${path}`,
    getManifest: () => ({})
  };
  const chrome = {
    action: { onClicked: makeEvent(), setIcon: async details => iconCalls.push(details) },
    alarms: { create() {}, onAlarm: makeEvent() },
    contextMenus: {
      onClicked: makeEvent(),
      removeAll(callback) { callback(); },
      create(_details, callback) { if (callback) callback(); }
    },
    runtime,
    storage: {
      sync: { async get() { return { blockedSites }; }, async set() {}, async remove() {} },
      onChanged: settingsChanged
    },
    tabs: {
      onActivated: activated,
      onUpdated: updated,
      async query(_query, callback) {
        if (callback) callback(tabs);
        return tabs;
      },
      async sendMessage(tabId, message) {
        sentMessages.push({ tabId, message });
        if (message.action === 'getPageHostname') return { hostname: hosts[tabId] };
        return {};
      },
      async create() {}
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  vm.runInNewContext(source, {
    chrome,
    SiteBlocklist,
    importScripts() {},
    console,
    fetch,
    Map,
    Date,
    Promise
  });

  activated.listener({ tabId: 1 });
  updated.listener(2, { status: 'complete' });
  await waitFor(() => iconCalls.some(call => call.tabId === 1 && call.path[16].endsWith('-disabled.png')));
  await waitFor(() => iconCalls.some(call => call.tabId === 2 && call.path[16] === 'icons/icon16.png'));

  blockedSites = [];
  settingsChanged.listener({ blockedSites: { oldValue: ['example.com'], newValue: [] } }, 'sync');
  assert.ok(sentMessages.some(({ message }) => message.action === 'settingsUpdated'));
  await waitFor(() => {
    const latest = iconCalls.filter(call => call.tabId === 1).at(-1);
    return latest && latest.path[16] === 'icons/icon16.png';
  });
}

(async () => {
  await testDomainMatching();
  await testSettingsAddAndRemove();
  await testQuickSettingsBlockedSites();
  await testTabAndIconUpdates();
  console.log('Website blacklist tests passed (matching, settings, quick settings, live tab/icon updates).');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
