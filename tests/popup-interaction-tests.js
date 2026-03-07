/**
 * Popup Interaction Tests
 *
 * Real integration tests that load the full extension pipeline (content.js +
 * popup-manager.js + all dependencies) into a JSDOM environment and exercise
 * the actual mouseup -> click event sequence that caused the race condition
 * where unit-conversion popups were suppressed but currency ones were not.
 *
 * What makes these tests meaningful:
 *   - chrome.storage.sync.get returns a real async Promise (10ms delay) so the
 *     `await` inside showConversionPopup() genuinely yields to the macro-task
 *     queue, reproducing the exact timing of the race condition.
 *   - content.js is loaded and its event listeners are registered on document,
 *     so tests fire native DOM events instead of calling internal methods.
 *   - The _conversionInFlight flag is exercised indirectly through the event flow.
 */

const { JSDOM } = require('jsdom');
const fs   = require('fs');
const path = require('path');

class PopupInteractionTester {
  constructor() {
    this.testResults = [];
    this.passCount   = 0;
    this.failCount   = 0;
    this.dom         = null;
    this.win         = null;
    this.doc         = null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init() {
    console.log('\nStarting Popup Interaction Tests...\n');

    await this.setupDOM();
    await this.runAllTests();
    this.reportResults();

    return this.failCount === 0;
  }

  async setupDOM() {
    this.dom = new JSDOM(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body></body></html>`,
      { url: 'http://localhost', runScripts: 'dangerously', resources: 'usable' }
    );

    this.win = this.dom.window;
    this.doc = this.dom.window.document;

    global.window   = this.win;
    global.document = this.doc;
    global.DOMRect  = this.win.DOMRect;
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    global.cancelAnimationFrame  = (id) => clearTimeout(id);

    this.win.UnitConverter     = {};
    this.win.UnitConverterData = {};

    // -- chrome API mock -------------------------------------------------------
    // chrome.storage.sync.get returns a REAL async Promise (10ms delay) so that
    // `await chrome.storage.sync.get(...)` inside popup-manager.js genuinely
    // yields to the macro-task queue. Without this, the race condition timing
    // cannot be reproduced in tests and the tests become meaningless.
    this.win.chrome = {
      runtime: {
        id: 'test-extension-id',
        lastError: null,
        sendMessage: (msg, callback) => {
          if (typeof callback === 'function') {
            setTimeout(() => {
              if (msg && msg.action === 'getCurrencyRate') {
                callback({ rate: 0.92, fromCache: false, usedFallback: false });
              } else {
                callback({ status: 'ok' });
              }
            }, 10);
          }
          // Return a thenable for fire-and-forget callers that use .catch()
          return Promise.resolve();
        },
        onMessage: { addListener: () => {} }
      },
      storage: {
        sync: {
          // Must return a Promise -- SettingsManager and PopupManager both use the
          // Promise form: `await chrome.storage.sync.get([...])`
          get: (_keys) =>
            new Promise(resolve =>
              setTimeout(
                () => resolve({ unitSettings: { preset: 'us', currencyUnit: 'EUR', is12hr: true } }),
                10
              )
            ),
          set: () => Promise.resolve()
        },
        local: {
          get: (_keys, cb) => { if (cb) cb({ lastUserActivity: Date.now() }); return Promise.resolve({}); },
          set: (_data, cb) => { if (cb) cb(); return Promise.resolve(); }
        }
      }
    };
    global.chrome = this.win.chrome;

    // Polyfill Range.getBoundingClientRect — JSDOM does not implement it.
    // content.js calls range.getBoundingClientRect() synchronously before any
    // async work; without this polyfill the try/catch swallows the TypeError
    // and returns early, so no popup is ever shown.
    this.win.Range.prototype.getBoundingClientRect = function () {
      return { top: 50, left: 50, bottom: 70, right: 200, width: 150, height: 20 };
    };

    // Load all scripts in dependency order
    for (const rel of [
      '../data/conversion-data.js',
      '../data/currency-mappings.js',
      '../utils/unit-converter.js',
      '../utils/currency-converter.js',
      '../utils/conversion-detector.js',
      '../utils/settings-manager.js',
      '../utils/popup-manager.js',
      // content.js must come last -- its bottom-of-file init() call registers
      // event listeners and depends on all of the above being present.
      '../content.js'
    ]) {
      this.loadScript(rel);
    }

    // Wait for content.js init() to complete: it awaits loadUserSettings()
    // which uses the storage mock (10ms). Use 300ms to match CI timing headroom.
    await this.wait(300);
  }

  loadScript(relPath) {
    const abs     = path.join(__dirname, relPath);
    const content = fs.readFileSync(abs, 'utf8');
    try {
      this.win.eval(content);
    } catch (err) {
      console.error(`Error loading ${relPath}: ${err.message}`);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Test helpers
  // ---------------------------------------------------------------------------

  /**
   * Insert a text node into the body, select it, and return the container div
   * so callers can remove it during cleanup.
   */
  setSelection(text) {
    const container       = this.doc.createElement('div');
    container.textContent = text;
    this.doc.body.appendChild(container);

    const range = this.doc.createRange();
    range.selectNodeContents(container);
    const sel = this.win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    return container;
  }

  clearSelection() {
    this.win.getSelection().removeAllRanges();
  }

  fireMouseup(target) {
    target.dispatchEvent(
      new this.win.MouseEvent('mouseup', { bubbles: true, cancelable: true, view: this.win })
    );
  }

  fireClick(target) {
    target.dispatchEvent(
      new this.win.MouseEvent('click', { bubbles: true, cancelable: true, view: this.win })
    );
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up between tests: clear selection, remove any leftover popups, and
   * fire one click (with cleared selection) to consume any stale
   * _conversionInFlight flag and reset currentlyDisplayedText.
   */
  async cleanup(testNodes = []) {
    this.clearSelection();
    this.fireClick(this.doc.body);
    await this.wait(20);
    this.doc.querySelectorAll('.unit-converter-popup').forEach(p => p.remove());
    testNodes.forEach(n => { if (n && n.parentNode) n.remove(); });
  }

  // ---------------------------------------------------------------------------
  // Test suite
  // ---------------------------------------------------------------------------

  async runAllTests() {
    // -- Integration tests: full event pipeline (content.js + popup-manager) --
    await this.testUnitConversionAppearsAfterMouseup();
    await this.testGestureClickDoesNotDismissPopup();
    await this.testStandaloneClickDismissesPopup();
    await this.testCurrencyConversionAppearsAfterMouseup();
    await this.testNoPopupForUnrecognizedText();
    await this.testNoPopupForSameUnitCurrency();
    await this.testClickOnPopupDoesNotDismiss();
    await this.testRapidReselectionShowsOnePopup();

    // -- Unit tests: PopupManager in isolation --------------------------------
    await this.testPopupManagerRaceGuard();
    await this.testPopupPersistsOnScroll();
    await this.testPopupPersistsOnResize();
    await this.testPopupCleanup();
  }

  // ---------------------------------------------------------------------------
  // Integration tests
  // ---------------------------------------------------------------------------

  async testUnitConversionAppearsAfterMouseup() {
    const name  = 'Unit conversion popup appears after mouseup';
    const nodes = [];
    try {
      // 50 lbs -> kg (us to metric)
      nodes.push(this.setSelection('50 lbs'));

      // Simulate the real browser sequence: mouseup then the paired click
      this.fireMouseup(this.doc);
      this.fireClick(this.doc.body); // this is the gesture click -- should be absorbed

      // Wait for async pipeline: processCurrencyConversions (sync no-op for units)
      // -> showConversionPopup -> chrome.storage.sync.get (10ms mock) -> popup shown
      await this.wait(300);

      const popup = this.doc.querySelector('.unit-converter-popup');
      if (!popup) throw new Error('Popup not shown for unit conversion');

      const text = popup.textContent;
      if (!text.includes('lbs') && !text.includes('lb') && !text.includes('kg')) {
        throw new Error(`Popup content unexpected: "${text.trim().slice(0, 80)}"`);
      }

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
    } finally {
      await this.cleanup(nodes);
    }
  }

  async testGestureClickDoesNotDismissPopup() {
    const name  = 'Click paired with mouseup (gesture click) does not dismiss popup';
    const nodes = [];
    try {
      nodes.push(this.setSelection('100 miles'));

      // Step 1: fire mouseup -- handleTextSelection runs synchronously until the
      // first `await`. Before that first await, _conversionInFlight is set to
      // true. dispatchEvent returns here with the flag already set.
      this.fireMouseup(this.doc);

      // Step 2: fire click in the SAME synchronous tick -- the paired gesture
      // click. handleClick must see _conversionInFlight === true and stand down.
      this.fireClick(this.doc.body);

      // Step 3: let the async pipeline finish
      await this.wait(300);

      const popup = this.doc.querySelector('.unit-converter-popup');
      if (!popup) {
        throw new Error(
          'Popup was dismissed by the gesture click -- race condition is present'
        );
      }

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
    } finally {
      await this.cleanup(nodes);
    }
  }

  async testStandaloneClickDismissesPopup() {
    const name  = 'Standalone click outside popup dismisses it';
    const nodes = [];
    try {
      // 100 F -> C (us to metric)
      nodes.push(this.setSelection('100 F'));

      this.fireMouseup(this.doc);
      this.fireClick(this.doc.body); // gesture click -- absorbed
      await this.wait(300);

      if (!this.doc.querySelector('.unit-converter-popup')) {
        throw new Error('Prerequisite failed: popup did not appear');
      }

      // Now clear selection and do a plain standalone click
      this.clearSelection();
      this.fireClick(this.doc.body);
      await this.wait(20);

      const popup = this.doc.querySelector('.unit-converter-popup');
      if (popup) throw new Error('Popup was not dismissed by standalone click');

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
    } finally {
      await this.cleanup(nodes);
    }
  }

  async testCurrencyConversionAppearsAfterMouseup() {
    const name  = 'Currency conversion popup appears after mouseup';
    const nodes = [];
    try {
      // Mock target currency is EUR; $50 is USD -- USD != EUR so conversion runs.
      nodes.push(this.setSelection('$50'));

      this.fireMouseup(this.doc);
      this.fireClick(this.doc.body);

      // Currency path: processCurrencyConversions awaits sendMessage (10ms mock)
      // + showConversionPopup awaits storage (10ms mock) -- allow 150ms total.
      await this.wait(300);

      const popup = this.doc.querySelector('.unit-converter-popup');
      if (!popup) throw new Error('Popup not shown for currency conversion');

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
    } finally {
      await this.cleanup(nodes);
    }
  }

  async testNoPopupForUnrecognizedText() {
    const name  = 'No popup for unrecognized/non-convertible text';
    const nodes = [];
    try {
      nodes.push(this.setSelection('hello world'));

      this.fireMouseup(this.doc);
      await this.wait(300);

      const popup = this.doc.querySelector('.unit-converter-popup');
      if (popup) throw new Error('Popup shown for non-convertible text');

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
    } finally {
      await this.cleanup(nodes);
    }
  }

  async testNoPopupForSameUnitCurrency() {
    const name  = 'No popup when source currency equals target currency';
    const nodes = [];
    try {
      // Mock target currency is EUR; selecting "50 EUR" -> EUR == EUR -> no conversion.
      nodes.push(this.setSelection('50 EUR'));

      this.fireMouseup(this.doc);
      await this.wait(300);

      const popup = this.doc.querySelector('.unit-converter-popup');
      if (popup) throw new Error('Popup shown for same-currency conversion (EUR -> EUR)');

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
    } finally {
      await this.cleanup(nodes);
    }
  }

  async testClickOnPopupDoesNotDismiss() {
    const name  = 'Click on the popup itself does not dismiss it';
    const nodes = [];
    try {
      // 5 miles -> km (us to metric)
      nodes.push(this.setSelection('5 miles'));

      this.fireMouseup(this.doc);
      this.fireClick(this.doc.body);
      await this.wait(300);

      const popup = this.doc.querySelector('.unit-converter-popup');
      if (!popup) throw new Error('Prerequisite failed: popup did not appear');

      // Click directly on the popup element (handleClick guards against
      // .unit-converter-popup targets via event.target.closest())
      this.clearSelection();
      this.fireClick(popup);
      await this.wait(20);

      if (!this.doc.querySelector('.unit-converter-popup')) {
        throw new Error('Popup was dismissed when clicked on itself');
      }

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
    } finally {
      await this.cleanup(nodes);
    }
  }

  async testRapidReselectionShowsOnePopup() {
    const name  = 'Rapid re-selection shows exactly one popup (no duplicates)';
    const nodes = [];
    try {
      // First selection
      nodes.push(this.setSelection('50 lbs'));
      this.fireMouseup(this.doc);
      this.fireClick(this.doc.body);
      await this.wait(20); // pipeline started but storage mock not resolved yet

      // Re-select before the first popup lands
      this.clearSelection();
      nodes.push(this.setSelection('100 miles'));
      this.fireMouseup(this.doc);
      this.fireClick(this.doc.body);

      await this.wait(300);

      const popups = this.doc.querySelectorAll('.unit-converter-popup');
      if (popups.length !== 1) {
        throw new Error(`Expected 1 popup, found ${popups.length}`);
      }

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
    } finally {
      await this.cleanup(nodes);
    }
  }

  // ---------------------------------------------------------------------------
  // PopupManager unit tests (isolated, no content.js event flow)
  // ---------------------------------------------------------------------------

  async testPopupManagerRaceGuard() {
    const name = 'PopupManager race guard prevents stale operation from showing popup';
    try {
      const PM   = this.win.UnitConverter.PopupManager;
      const pm   = new PM();
      const rect = { top: 0, left: 0, bottom: 20, right: 100, width: 100, height: 20 };
      const convs = [{ original: '1 km', converted: '0.62 mi', type: 'length' }];

      const op1 = pm.generateOperationId();
      const op2 = pm.generateOperationId();

      // Start op1 but cancel it before the storage mock (10ms) resolves
      const promise1 = pm.showConversionPopup(convs, rect, op1);
      await this.wait(5);
      pm.cancelCurrentOperation();
      pm.hidePopup();

      // Start op2 -- this one should win
      await pm.showConversionPopup(convs, rect, op2);
      await promise1; // op1 should have been rejected quietly by the race guard

      await this.wait(30);

      const popups = this.doc.querySelectorAll('.unit-converter-popup');
      if (popups.length !== 1) {
        throw new Error(`Expected 1 popup, found ${popups.length}`);
      }
      if (pm.currentOperationId !== op2) {
        throw new Error(`Expected currentOperationId to be op2, got ${pm.currentOperationId}`);
      }

      this.pass(name);
      pm.hidePopup();
    } catch (e) {
      this.fail(name, e.message);
      this.doc.querySelectorAll('.unit-converter-popup').forEach(p => p.remove());
    }
  }

  async testPopupPersistsOnScroll() {
    const name = 'Popup persists after scroll event';
    try {
      const PM   = this.win.UnitConverter.PopupManager;
      const pm   = new PM();
      const rect = { top: 100, left: 200, bottom: 120, right: 300, width: 100, height: 20 };
      const convs = [{ original: '100 cm', converted: '39.37 in', type: 'length' }];

      await pm.showConversionPopup(convs, rect);
      if (!this.doc.querySelector('.unit-converter-popup')) throw new Error('Popup not created');

      this.doc.dispatchEvent(new this.win.Event('scroll', { bubbles: true }));
      await this.wait(30);

      if (!this.doc.querySelector('.unit-converter-popup')) {
        throw new Error('Popup was dismissed by scroll event');
      }

      this.pass(name);
      pm.hidePopup();
    } catch (e) {
      this.fail(name, e.message);
      this.doc.querySelector('.unit-converter-popup')?.remove();
    }
  }

  async testPopupPersistsOnResize() {
    const name = 'Popup persists after window resize event';
    try {
      const PM   = this.win.UnitConverter.PopupManager;
      const pm   = new PM();
      const rect = { top: 100, left: 200, bottom: 120, right: 300, width: 100, height: 20 };
      const convs = [{ original: '72 F', converted: '22.22 C', type: 'temperature' }];

      await pm.showConversionPopup(convs, rect);
      if (!this.doc.querySelector('.unit-converter-popup')) throw new Error('Popup not created');

      this.win.dispatchEvent(new this.win.Event('resize', { bubbles: true }));
      await this.wait(30);

      if (!this.doc.querySelector('.unit-converter-popup')) {
        throw new Error('Popup was dismissed by resize event');
      }

      this.pass(name);
      pm.hidePopup();
    } catch (e) {
      this.fail(name, e.message);
      this.doc.querySelector('.unit-converter-popup')?.remove();
    }
  }

  async testPopupCleanup() {
    const name = 'hidePopup() removes the DOM element and nulls the reference';
    try {
      const PM   = this.win.UnitConverter.PopupManager;
      const pm   = new PM();
      const rect = { top: 100, left: 200, bottom: 120, right: 300, width: 100, height: 20 };
      const convs = [{ original: '1 mile', converted: '1.61 km', type: 'distance' }];

      await pm.showConversionPopup(convs, rect);
      if (!this.doc.querySelector('.unit-converter-popup')) throw new Error('Popup not created');

      pm.hidePopup();

      if (this.doc.querySelector('.unit-converter-popup')) {
        throw new Error('Popup DOM element was not removed');
      }
      if (pm.conversionPopup !== null) {
        throw new Error('conversionPopup reference not nulled after hidePopup()');
      }

      this.pass(name);
    } catch (e) {
      this.fail(name, e.message);
      this.doc.querySelector('.unit-converter-popup')?.remove();
    }
  }

  // ---------------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------------

  pass(testName) {
    this.testResults.push({ name: testName, status: 'PASS' });
    this.passCount++;
    console.log(`✅ ${testName}`);
  }

  fail(testName, errorMessage) {
    this.testResults.push({ name: testName, status: 'FAIL', error: errorMessage });
    this.failCount++;
    console.error(`❌ ${testName}`);
    console.error(`   Error: ${errorMessage}`);
  }

  reportResults() {
    const total = this.passCount + this.failCount;
    const rate  = total > 0 ? ((this.passCount / total) * 100).toFixed(1) : 0;

    console.log('\n' + '='.repeat(80));
    console.log('POPUP INTERACTION TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Total Tests:   ${total}`);
    console.log(`Passed:        ${this.passCount}`);
    console.log(`Failed:        ${this.failCount}`);
    console.log(`Success Rate:  ${rate}%`);
    console.log('='.repeat(80));

    if (this.failCount > 0) {
      console.log('\nFailed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    }
    console.log('');
  }
}

if (require.main === module) {
  const tester = new PopupInteractionTester();
  tester.init()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => { console.error('Test suite crashed:', err); process.exit(1); });
}

module.exports = PopupInteractionTester;
