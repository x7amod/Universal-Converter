# Universal Converter Tests

Plain Node.js tests. No test framework, no bundler. `jsdom` is the only test dependency; everything else is Node built-ins.

`npm run test:all` starts each suite in its own child process (120 s timeout per suite) and runs them in this order:

| # | Suite | File | Focus |
|---|-------|------|-------|
| 1 | Extension Validation | `validate-extension.js` | Package structure and syntax |
| 2 | Currency Cache Lifecycle | `currency-cache-lifecycle.test.js` | Cache, activity, fetch, refresh |
| 3 | Website Blacklist | `site-blocklist.test.js` | Blocking, settings, toolbar icon |
| 4 | Build Manifest | `build-manifest.test.js` | Firefox build adapters |
| 5 | Unit Converter | `test-runner.js` + `test-cases.json` | Conversions and detection |
| 6 | Popup Interaction | `popup-interaction-tests.js` | Full selection → popup pipeline |

A full run takes a few seconds locally. Every suite must be listed in `run-all-tests.js`; a new file that is not registered there never runs in `test:all`.

## Commands

```bash
npm run test:all            # every suite (the pre-finish check)
npm test                    # JSON unit/detection cases only
npm run test:verbose        # test:all with each suite's full output
npm run test:stop-on-failure
npm run validate            # structure + manifest + Firefox build validation
npm run build               # runs test:all, then writes build/, build-firefox/, archives
node tests/<suite-file>     # one suite directly, e.g. node tests/site-blocklist.test.js
npm run test:browser        # prints how to open tests/test.html manually
```

`npm run build` aborts if any suite fails, so CI (`npm run build`) runs everything once.

## Suites

### 1. Extension Validation (`validate-extension.js`)

Checks the extension as a package, not its behaviour:

- `manifest.json` required fields, permissions, hosts, and resource declarations
- Required files and icons exist
- Every source file parses: `new vm.Script(content)` — this is a real syntax check
- Content scripts are loaded in dependency order (data first, `content.js` last)
- If `build-firefox/` exists and is current: Firefox manifest, required files, and `chrome.*` → `browser.*` rewrite

Chrome-only checks always run. Firefox checks are skipped with a warning when there is no fresh Firefox build.

### 2. Currency Cache Lifecycle (`currency-cache-lifecycle.test.js`)

Tests against `CurrencyRateService` from `background.js` with injected time, storage, and fetch — no network, no real storage:

- **Cache validity** – null/fresh/valid/stale/expired boundaries
- **Activity tracking** – 5-minute active/inactive boundary, persistence, restore
- **Fetch & fallback** – cache hits, foreign pairs derived from the USD cache, primary → fallback, stale fallback, deduplication, all-APIs-fail error
- **Prefetching** – 44/46-minute stale threshold, inactive users, `warmCache()`
- **Scheduled refresh** – `refreshCacheIfNeeded()` including the USD-entry-only refresh
- **Edge cases** – storage errors, future timestamps, empty rates, concurrent warmups

### 3. Website Blacklist (`site-blocklist.test.js`)

Settings, hostname blocking, and per-tab toolbar icon state, using JSDOM/VM and mocked `chrome.*` APIs:

- `SiteBlocklist` hostname matching and list normalization
- Firefox content-script global: the module must attach to `window`, not only `globalThis`
- Settings add/remove, metric/imperial presets, reload on external `unitSettings` changes
- Quick Settings block/unblock via `blockedSites`
- Tab activation/update and settings changes refresh the per-tab icon; `iconRefreshes` is cleaned on tab removal

Message mocks return `{ hostname }`, matching the real extension (not `tab.url`).

### 4. Build Manifest (`build-manifest.test.js`)

Imports `utils/build.js` and exercises the build adapters against temporary directories:

- Generated Firefox manifest keeps `host_permissions`
- `alarms` stays declared for scheduled cache refresh
- Poppins `.woff2` files are present and web-accessible
- Firefox CSS uses relative font URLs and drops the extension-id placeholder

### 5. Unit Converter (`test-runner.js` + `test-cases.json`)

The bulk of the behavioural coverage. Cases are JSON objects grouped as `Detection`, `Autosizing`, `Conversions`, `OtherTests`, and `Decimal Detection`. The runner `eval`s the real data/utils files, then dispatches on `type`.

Covered areas: conversions, null/invalid input, unit normalization and types, best unit and formatting, pattern detection, display units, timezone offsets and conversions, currency mapping/codes, comma/dot number extraction, and decimal-value detection.

An unknown `type` is a failed assertion, not a skipped case — a typo cannot silently remove coverage.

### 6. Popup Interaction (`popup-interaction-tests.js`)

Loads the full pipeline (`content.js`, `popup-manager.js`, and dependencies) into JSDOM and drives real `mouseup`/`click` events:

- Unit and currency popups appear after selection; rapid re-selection leaves one popup
- The click paired with a selection mouseup is absorbed; a later click outside dismisses
- Clicks and mouseups inside the popup do not dismiss it
- Scroll and resize do **not** dismiss the popup
- `removePopup()` removes the DOM node and nulls `activePopup`
- Unrecognized text, same-currency selections, and blocked sites show no popup; blocked sites also request no rates

Popups are detected with `waitFor(assertion)` polling, not fixed sleeps. Add new positive tests the same way.

## Test Helpers (`test-helpers/`)

| File | Provides |
|------|----------|
| `mock-time-controller.js` | `MockTimeController` (`now`, `advance`, `advanceMinutes`, `reset`) and `TimeScenarios` timestamps |
| `mock-storage.js` | In-memory `chrome.storage.local` with error injection (`setErrorOnGet/Set/Remove`), `getRawData`/`setRawData`, `reset` |
| `mock-fetch.js` | Configurable fetch responses (`setResponse`, primary/fallback helpers, failure and delay injection), call log/count, and `SampleRates` |
| `test-utilities.js` | `TestFixtureFactory.create()`, `CacheBuilder`, and the `Assertions` helpers |

`TestFixtureFactory.create()` wires mock time/storage/fetch into a `CurrencyRateService` and exposes `setUserActive` / `setUserInactive`, `createCacheBuilder()`, and `reset()`.

`Assertions` provides `assertEqual`, `assertTrue`, `assertFalse`, `assertDefined`, and async `assertThrows`. `assertThrows` fails when the function does not throw, even without an expected message.

## Adding Tests

### Unit/detection case (preferred)

Add an object to the matching group in `test-cases.json`:

```json
{
  "name": "Length: 2 km to miles",
  "type": "conversion",
  "input": { "text": "2 km", "from": "km", "to": "mi" },
  "expected": 1.2427
}
```

Use an existing `type` (see the `switch` in `test-runner.js`). If the behaviour cannot be expressed as a case, write a JavaScript test.

### Currency cache test

```javascript
await this.test('My new cache test', async () => {
  const fixture = TestFixtureFactory.create();
  const service = fixture.createService();
  fixture.setUserActive(service);

  fixture.storage.setRawData(
    fixture.createCacheBuilder().withAgeMinutes(30).buildStorageData()
  );
  fixture.mockFetch.setPrimaryAPIResponse(SampleRates.primary);

  const result = await service.getCurrencyRate('USD', 'EUR');
  Assertions.assertTrue(result.fromCache);
}, { suppressOutput: true });
```

### Popup test

```javascript
async testMyNewFeature() {
  const name = 'My New Feature';
  try {
    this.setSelection('50 lbs');
    this.fireMouseup(this.doc);
    await this.waitFor(() => this.doc.querySelector('.unit-converter-popup'), 'popup');
    this.pass(name);
  } catch (error) {
    this.fail(name, error.message);
  } finally {
    await this.cleanup();
  }
}
```

Then register it in `runAllTests()`.

### New suite

Add the file to `this.testFiles` in `run-all-tests.js`, or it will not run under `npm run test:all`.

## Notes

- Node tests do not cover real browser APIs or live selection behaviour. For that, load `build/` in Chrome or `build-firefox/` in Firefox (`about:debugging`). `tests/test.html` is the manual page for local checks.
- Tests must not hit the network; all fetches and storage calls go through the helpers above.
- CI runs on Node 24 via `.github/workflows/ci.yml` with `npm run build`.
