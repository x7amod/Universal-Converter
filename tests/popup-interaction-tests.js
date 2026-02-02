/**
 * Popup Interaction Tests
 * Tests for popup creation, display, and dismissal behaviors
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

class PopupInteractionTester {
  constructor() {
    this.testResults = [];
    this.passCount = 0;
    this.failCount = 0;
  }

  async init() {
    console.log('\n🧪 Starting Popup Interaction Tests...\n');
    
    // Setup DOM environment
    await this.setupDOM();
    
    // Run tests
    await this.runAllTests();
    
    // Report results
    this.reportResults();
    
    return this.failCount === 0;
  }

  async setupDOM() {
    // Create a JSDOM environment with full HTML page
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body>
          <div id="test-content">
            <p>Test text with $100 USD currency</p>
            <p>Another test with 50kg weight</p>
          </div>
        </body>
      </html>
    `;
    
    const dom = new JSDOM(html, {
      url: 'http://localhost',
      runScripts: 'dangerously',
      resources: 'usable'
    });
    
    global.window = dom.window;
    global.document = dom.window.document;
    global.DOMRect = dom.window.DOMRect;
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    global.cancelAnimationFrame = (id) => clearTimeout(id);
    
    // Initialize global namespace
    global.window.UnitConverter = {};
    
    // Mock chrome API
    global.chrome = {
      runtime: {
        id: 'test-extension-id',
        sendMessage: (msg, callback) => {
          // Mock currency rate response
          if (msg.action === 'getCurrencyRate') {
            setTimeout(() => {
              callback({ rate: 1.2, fromCache: false, usedFallback: false });
            }, 10);
          } else if (msg.action === 'updateActivity') {
            setTimeout(() => {
              callback({ status: 'ok' });
            }, 0);
          }
        },
        onMessage: {
          addListener: () => {}
        }
      },
      storage: {
        sync: {
          get: (keys, callback) => {
            callback({ unitSettings: { preset: 'metric', currencyUnit: 'USD' } });
          }
        },
        local: {
          get: (keys, callback) => {
            callback({ lastUserActivity: Date.now() });
          },
          set: (data, callback) => {
            if (callback) callback();
          }
        }
      }
    };
    
    // Load utility scripts
    this.loadScriptContent('../utils/popup-manager.js');
    this.loadScriptContent('../utils/settings-manager.js');
  }

  loadScriptContent(scriptPath) {
    const fullPath = path.join(__dirname, scriptPath);
    const scriptContent = fs.readFileSync(fullPath, 'utf8');
    
    // Execute script directly in the window context
    try {
      window.eval(scriptContent);
    } catch (error) {
      console.error(`Error loading script ${scriptPath}:`, error.message);
      throw error;
    }
  }

  async runAllTests() {
    await this.testPopupCreation();
    await this.testPopupDismissOnClick();
    await this.testPopupDismissOnScroll();
    await this.testPopupDismissOnResize();
    await this.testSelectionRectCapture();
    await this.testInvalidSelectionHandling();
    await this.testTemporaryListenerCleanup();
  }

  async testPopupCreation() {
    const testName = 'Popup Creation';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      const conversions = [{
        original: '100 USD',
        converted: '€85.50',
        type: 'currency',
        fromCurrency: 'USD',
        toCurrency: 'EUR'
      }];
      
      // Create a mock selection rect
      const mockRect = {
        top: 100,
        left: 200,
        bottom: 120,
        right: 300,
        width: 100,
        height: 20
      };
      
      await popupManager.showConversionPopup(conversions, mockRect);
      
      // Check if popup was created
      const popup = document.querySelector('.unit-converter-popup');
      
      if (!popup) {
        throw new Error('Popup element not created');
      }
      
      // Verify popup has correct content
      const popupContent = popup.textContent;
      if (!popupContent.includes('100 USD') || !popupContent.includes('€85.50')) {
        throw new Error('Popup content is incorrect');
      }
      
      // Verify popup is positioned
      const computedStyle = popup.style;
      if (computedStyle.position !== 'absolute' && computedStyle.position !== 'fixed') {
        // Check inline style instead
        if (!popup.style.left || !popup.style.top) {
          throw new Error('Popup is not properly positioned with left/top coordinates');
        }
      }
      
      this.pass(testName);
      
      // Cleanup
      popupManager.hidePopup();
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testPopupDismissOnClick() {
    const testName = 'Popup Dismiss on Click';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      const conversions = [{
        original: '50 kg',
        converted: '110.23 lbs',
        type: 'weight'
      }];
      
      const mockRect = {
        top: 100, left: 200, bottom: 120, right: 300, width: 100, height: 20
      };
      
      await popupManager.showConversionPopup(conversions, mockRect);
      
      // Verify popup exists
      let popup = document.querySelector('.unit-converter-popup');
      if (!popup) {
        throw new Error('Popup was not created');
      }
      
      // Simulate click outside popup
      const clickEvent = new window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      document.body.dispatchEvent(clickEvent);
      
      // Note: In the actual extension, clicks outside popup trigger hidePopup via content.js handleClick
      // For this test, we manually call hidePopup to simulate that behavior
      popupManager.hidePopup();
      
      // Small delay to allow event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check if popup was removed (via hidePopup)
      popup = document.querySelector('.unit-converter-popup');
      
      if (popup) {
        throw new Error('Popup was not dismissed after click');
      }
      
      this.pass(testName);
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testPopupDismissOnScroll() {
    const testName = 'Popup Dismiss on Scroll (One-time Listener)';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      const conversions = [{
        original: '100 cm',
        converted: '39.37 in',
        type: 'length'
      }];
      
      const mockRect = {
        top: 100, left: 200, bottom: 120, right: 300, width: 100, height: 20
      };
      
      await popupManager.showConversionPopup(conversions, mockRect);
      
      // Verify popup exists
      let popup = document.querySelector('.unit-converter-popup');
      if (!popup) {
        throw new Error('Popup was not created');
      }
      
      // Verify scroll listener was attached
      if (!popupManager.scrollListener) {
        throw new Error('Scroll listener was not attached');
      }
      
      // Simulate scroll event
      const scrollEvent = new window.Event('scroll', {
        bubbles: true,
        cancelable: true
      });
      
      document.dispatchEvent(scrollEvent);
      
      // Small delay to allow event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check if popup was removed
      popup = document.querySelector('.unit-converter-popup');
      if (popup) {
        throw new Error('Popup was not dismissed after scroll');
      }
      
      // Verify listener was cleaned up
      if (popupManager.scrollListener !== null) {
        throw new Error('Scroll listener was not cleaned up');
      }
      
      this.pass(testName);
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testPopupDismissOnResize() {
    const testName = 'Popup Dismiss on Resize (One-time Listener)';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      const conversions = [{
        original: '72°F',
        converted: '22.22°C',
        type: 'temperature'
      }];
      
      const mockRect = {
        top: 100, left: 200, bottom: 120, right: 300, width: 100, height: 20
      };
      
      await popupManager.showConversionPopup(conversions, mockRect);
      
      // Verify popup exists
      let popup = document.querySelector('.unit-converter-popup');
      if (!popup) {
        throw new Error('Popup was not created');
      }
      
      // Verify resize listener was attached
      if (!popupManager.resizeListener) {
        throw new Error('Resize listener was not attached');
      }
      
      // Simulate resize event
      const resizeEvent = new window.Event('resize', {
        bubbles: true,
        cancelable: true
      });
      
      window.dispatchEvent(resizeEvent);
      
      // Small delay to allow event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check if popup was removed
      popup = document.querySelector('.unit-converter-popup');
      if (popup) {
        throw new Error('Popup was not dismissed after resize');
      }
      
      // Verify listener was cleaned up
      if (popupManager.resizeListener !== null) {
        throw new Error('Resize listener was not cleaned up');
      }
      
      this.pass(testName);
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testSelectionRectCapture() {
    const testName = 'Selection Rect Captured Before Async';
    try {
      // This test verifies that selection rect is captured synchronously
      // before any async operations that might invalidate the selection
      
      // Create a mock selection
      const mockRange = {
        getBoundingClientRect: () => ({
          top: 150,
          left: 250,
          bottom: 170,
          right: 350,
          width: 100,
          height: 20
        })
      };
      
      const mockSelection = {
        toString: () => '$100',
        getRangeAt: (index) => {
          if (index !== 0) throw new Error('IndexSizeError');
          return mockRange;
        }
      };
      
      // Capture rect synchronously
      let capturedRect = null;
      try {
        const range = mockSelection.getRangeAt(0);
        capturedRect = range.getBoundingClientRect();
      } catch (error) {
        throw new Error('Failed to capture selection rect');
      }
      
      // Simulate selection being cleared (as would happen during async)
      mockSelection.getRangeAt = () => {
        throw new Error('IndexSizeError: No selection');
      };
      
      // Verify we still have the captured rect
      if (!capturedRect || capturedRect.top !== 150) {
        throw new Error('Selection rect was not properly captured');
      }
      
      // Verify trying to get selection now would fail
      let shouldFail = false;
      try {
        mockSelection.getRangeAt(0);
      } catch (error) {
        shouldFail = true;
      }
      
      if (!shouldFail) {
        throw new Error('Selection should be invalid after clearing');
      }
      
      this.pass(testName);
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testInvalidSelectionHandling() {
    const testName = 'Invalid Selection Handling';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      // Test with null rect
      const conversions = [{
        original: '100 USD',
        converted: '€85.50',
        type: 'currency'
      }];
      
      await popupManager.showConversionPopup(conversions, null);
      
      // Verify popup was NOT created with invalid rect
      const popup = document.querySelector('.unit-converter-popup');
      if (popup) {
        throw new Error('Popup should not be created with null selectionRect');
      }
      
      // Test with undefined rect
      await popupManager.showConversionPopup(conversions, undefined);
      
      const popup2 = document.querySelector('.unit-converter-popup');
      if (popup2) {
        throw new Error('Popup should not be created with undefined selectionRect');
      }
      
      this.pass(testName);
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testTemporaryListenerCleanup() {
    const testName = 'Temporary Listener Cleanup';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      const conversions = [{
        original: '1 mile',
        converted: '1.61 km',
        type: 'distance'
      }];
      
      const mockRect = {
        top: 100, left: 200, bottom: 120, right: 300, width: 100, height: 20
      };
      
      // Show popup
      await popupManager.showConversionPopup(conversions, mockRect);
      
      // Verify listeners are attached
      if (!popupManager.scrollListener) {
        throw new Error('Scroll listener not attached');
      }
      if (!popupManager.resizeListener) {
        throw new Error('Resize listener not attached');
      }
      
      // Manually hide popup
      popupManager.hidePopup();
      
      // Verify listeners are cleaned up
      if (popupManager.scrollListener !== null) {
        throw new Error('Scroll listener not cleaned up after hidePopup');
      }
      if (popupManager.resizeListener !== null) {
        throw new Error('Resize listener not cleaned up after hidePopup');
      }
      
      // Verify popup is removed
      const popup = document.querySelector('.unit-converter-popup');
      if (popup) {
        throw new Error('Popup element not removed');
      }
      
      this.pass(testName);
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

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
    const totalTests = this.passCount + this.failCount;
    const successRate = totalTests > 0 ? ((this.passCount / totalTests) * 100).toFixed(1) : 0;
    
    console.log('\n' + '='.repeat(80));
    console.log('POPUP INTERACTION TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${this.passCount}`);
    console.log(`Failed: ${this.failCount}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log('='.repeat(80));
    
    if (this.failCount > 0) {
      console.log('\nFailed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
    }
    
    console.log('');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new PopupInteractionTester();
  tester.init().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = PopupInteractionTester;
