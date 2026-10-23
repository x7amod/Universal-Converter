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
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'chrome-extension://test/settings-page/settings.html?hostname=shop.example.com'
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
      }
    },
    tabs: {
      async query() { return []; },
      async sendMessage() { return {}; }
    }
  };
  const ready = new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  window.eval(settingsScript);
  await ready;

  const addCurrent = window.document.getElementById('blockCurrentSiteBtn');
  await waitFor(() => window.document.querySelector('.empty-state'));
  addCurrent.click();
  await waitFor(() => storage.blockedSites.includes('shop.example.com'));

  const input = window.document.getElementById('blockedSiteInput');
  input.value = 'https://blog.example.net/path';
  window.document.getElementById('blockedSiteForm').dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true })
  );
  await waitFor(() => storage.blockedSites.includes('blog.example.net'));

  await waitFor(() => window.document.querySelector('button[data-hostname="blog.example.net"]'));
  window.document.querySelector('button[data-hostname="blog.example.net"]').click();
  await waitFor(() => !storage.blockedSites.includes('blog.example.net'));
  assert.deepEqual(storage.blockedSites, ['shop.example.com']);
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
  await testTabAndIconUpdates();
  console.log('Website blacklist tests passed (matching, settings, live tab/icon updates).');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
