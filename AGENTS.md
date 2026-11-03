# AGENTS.md

Universal Converter is a Manifest V3 browser extension (Chrome and Firefox) that converts text selected on a page. It is plain JavaScript with globals, no bundler, transpiler, linter, or typechecker.

## Commands

- `npm run test:all` — run every suite; use this as the pre-finish check.
- `npm test` — only the core unit tests in `tests/test-runner.js` (cases live in `tests/test-cases.json`).
- `node tests/<suite-file>` — run one suite directly, e.g. `node tests/site-blocklist.test.js`.
- `npm run validate` — manifest/structure validation only.
- `npm run build` — runs `npm run test:all` first, then writes `build/`, `build-firefox/`, and root `.zip`/`.xpi` artifacts. It aborts on test failure. Generated output is gitignored; never edit it.
- `npm run lint` is a placeholder, not a real linter.

## Architecture

- `manifest.json` defines content-script load order: data files, then `utils/site-blocklist.js`, converters/detector/popup/settings, then `content.js`. These are classic scripts sharing `window.UnitConverter`, `window.UnitConverterData`, and `window.SiteBlocklist`; do not introduce ES modules without updating the manifest and Firefox build adapters.
- `content.js` handles selection and popup UI. `background.js` is the service worker for messaging, currency rates/cache, alarms, context menus, and toolbar icons. `settings-page/` and `quick-settings/` are separate extension pages.
- `utils/conversion-detector.js` checks dimensions, then units, then currency. Unit precedence is intentional. `detectUnit` returns `false` for "unit matched, no conversion needed" so uppercase measurements such as `5 KM`, `100 M`, and `10 Ft` do not fall through to currency symbols; keep that contract. Do not remove legitimate currency symbols from `data/currency-mappings.js` to fix unit collisions.
- Unit casing matters: `nm` is nanometer while `Nm` is newton-meter, and settings persist `Nm`.
- Timezone conversion returns `null` for invalid clock times and for equal offsets: same offset means the clock does not change, not a 0-hour conversion. Offsets such as `-00:30` must stay negative.
- `utils/currency-converter.js` `extractNumber` treats a single comma as a decimal only when exactly two digits follow (`12,50`); otherwise the comma is a thousands separator (`12,5` → 125, `1,234` → 1234). This is a known limitation left unfixed because `1,234` is genuinely ambiguous with US grouping; do not change it without symbol/locale context and tests.
- Defaults and metric/imperial presets live only in `utils/settings-manager.js`; both settings pages consume them. The settings page reloads its form on external `unitSettings` changes; preserve that to avoid one tab overwriting another tab's unit choice.
- Quick Settings' site toggle blocks and unblocks by adding/removing the hostname in `blockedSites` and clearing its `siteOverrides` entry; there is no separate per-site flag.
- Currency rates are fetched and cached by `background.js` in `chrome.storage.local` (`currencyRatesCache`); content scripts request rates through `chrome.runtime` messages. The cache is USD-based: non-USD pairs are derived as `to / from` from the USD entry (`_deriveRateFromUsdCache`). `refreshCurrencyCache` runs every 50 minutes via `alarms`. Tests inject mocks, so no network is used.
- Toolbar icon is per-tab (`chrome.action.setIcon({ tabId })`): the disabled variant is used when the hostname is blocked, `enabledGlobally` is false, or `siteOverrides[hostname] === false`. It refreshes on tab activation/update and settings changes; `iconRefreshes` is cleaned on tab removal.
- Firefox: `utils/build.js` generates the Firefox manifest from `manifest.json` (targeting Firefox 140+), rewrites `chrome.*` to `browser.*`, and rewrites font URLs in `content.css`. Firefox content scripts run with a different global, so globals shared with content scripts must also attach to `window` (see `utils/site-blocklist.js`); attaching only to `globalThis` leaves `window.SiteBlocklist` undefined and breaks every conversion.
- The content popup uses bundled Poppins from `fonts/`; keep `fonts/*.woff2` in `web_accessible_resources` or the popup silently falls back.
- The manifest intentionally omits the `tabs` permission. Ask the content script for the hostname via `getPageHostname`; `chrome.tabs.get()` is only a fallback for tabs without a content script (for example after an extension reload), and its `url` may be unavailable.
- Keep `alarms` in `manifest.json` for scheduled currency cache refresh. The Firefox manifest inherits Chrome permissions except `management`.

## Tests

- Add unit/detection regressions to `tests/test-cases.json`; `tests/test-runner.js` handles the supported `type` values. Write a JavaScript test only for behavior the JSON cases cannot express.
- Every suite must be registered in `tests/run-all-tests.js`; `npm run test:all` only runs the files listed there.
- `tests/build-manifest.test.js` imports `utils/build.js` and exercises adapters against temporary directories. Keep build methods callable independently of a full build.
- `tests/site-blocklist.test.js` includes a VM test for the Firefox content-script global (`window` vs `globalThis`); keep it when touching shared globals.
- Settings and toolbar-icon tests use JSDOM/VM mocks. Content-script message mocks must return `{ hostname }`, not `tab.url`; matching the real extension avoids false passes.
- Node tests do not cover live selection/popup behavior or real browser APIs. Load `build/` in Chrome or `build-firefox/` in Firefox (`about:debugging`). In Firefox, the action panel is not exposed to WebDriver BiDi; the per-tab toolbar icon can be read from a privileged `chrome://browser/content/browser.xhtml` context via the action button's `listStyleImage`.
