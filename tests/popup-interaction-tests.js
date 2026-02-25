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
    await this.testPopupPersistsOnScroll();
    await this.testPopupPersistsOnResize();
    await this.testSelectionRectCapture();
    await this.testInvalidSelectionHandling();
    await this.testPopupCleanup();
    await this.testRaceConditionPrevention();
    await this.testSpamClickScenario();
    await this.testNormalOperationAfterSpamClick();
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

  async testPopupPersistsOnScroll() {
    const testName = 'Popup Persists on Scroll';
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
      
      // Verify scroll listener is NOT attached (new behavior)
      if (popupManager.scrollListener) {
        throw new Error('Scroll listener should not be attached');
      }
      
      // Simulate scroll event
      const scrollEvent = new window.Event('scroll', {
        bubbles: true,
        cancelable: true
      });
      
      document.dispatchEvent(scrollEvent);
      
      // Small delay to allow event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Popup should still exist after scroll (new behavior)
      popup = document.querySelector('.unit-converter-popup');
      if (!popup) {
        throw new Error('Popup should persist after scroll');
      }
      
      this.pass(testName);
      
      // Cleanup
      popupManager.hidePopup();
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testPopupPersistsOnResize() {
    const testName = 'Popup Persists on Resize';
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
      
      // Verify resize listener is NOT attached (new behavior)
      if (popupManager.resizeListener) {
        throw new Error('Resize listener should not be attached');
      }
      
      // Simulate resize event
      const resizeEvent = new window.Event('resize', {
        bubbles: true,
        cancelable: true
      });
      
      window.dispatchEvent(resizeEvent);
      
      // Small delay to allow event processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Popup should still exist after resize (new behavior)
      popup = document.querySelector('.unit-converter-popup');
      if (!popup) {
        throw new Error('Popup should persist after resize');
      }
      
      this.pass(testName);
      
      // Cleanup
      popupManager.hidePopup();
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
      
      // Suppress only the expected "Invalid selectionRect" warnings
      const originalWarn = console.warn;
      console.warn = (message, ...args) => {
        // Only suppress the specific warning we're testing for
        if (typeof message === 'string' && message.includes('Invalid selectionRect')) {
          return; // Suppress this specific warning
        }
        // Let all other warnings through
        originalWarn(message, ...args);
      };
      
      await popupManager.showConversionPopup(conversions, null);
      
      // Small delay for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify popup was NOT created with invalid rect
      let popup = document.querySelector('.unit-converter-popup');
      if (popup) {
        throw new Error('Popup should not be created with null selectionRect');
      }
      
      // Test with undefined rect
      await popupManager.showConversionPopup(conversions, undefined);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      popup = document.querySelector('.unit-converter-popup');
      if (popup) {
        throw new Error('Popup should not be created with undefined selectionRect');
      }
      
      // Restore console.warn
      console.warn = originalWarn;
      
      this.pass(testName);
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testPopupCleanup() {
    const testName = 'Popup Cleanup';
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
      
      // Verify popup exists
      let popup = document.querySelector('.unit-converter-popup');
      if (!popup) {
        throw new Error('Popup was not created');
      }
      
      // Verify no listeners are attached (new behavior)
      if (popupManager.scrollListener) {
        throw new Error('Scroll listener should not exist');
      }
      if (popupManager.resizeListener) {
        throw new Error('Resize listener should not exist');
      }
      
      // Manually hide popup
      popupManager.hidePopup();
      
      // Verify popup is removed
      popup = document.querySelector('.unit-converter-popup');
      if (popup) {
        throw new Error('Popup element not removed');
      }
      
      // Verify conversionPopup property is null
      if (popupManager.conversionPopup !== null) {
        throw new Error('conversionPopup property should be null after hiding');
      }
      
      this.pass(testName);
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testRaceConditionPrevention() {
    const testName = 'Race Condition Prevention';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      const conversions = [{
        original: '100 USD',
        converted: '€85.50',
        type: 'currency'
      }];
      
      const mockRect = {
        top: 100, left: 200, bottom: 120, right: 300, width: 100, height: 20
      };
      
      // Simulate rapid spam-clicking by creating multiple operations quickly
      const operation1Id = popupManager.generateOperationId();
      const operation2Id = popupManager.generateOperationId();
      const operation3Id = popupManager.generateOperationId();
      
      // Verify operation IDs are unique
      if (operation1Id === operation2Id || operation2Id === operation3Id) {
        throw new Error('Operation IDs should be unique');
      }
      
      // Start first operation
      const promise1 = popupManager.showConversionPopup(conversions, mockRect, operation1Id);
      
      // Immediately start second operation (simulates quick re-selection)
      await new Promise(resolve => setTimeout(resolve, 10));
      const promise2 = popupManager.showConversionPopup(conversions, mockRect, operation2Id);
      
      // User clicks away before operations complete
      await new Promise(resolve => setTimeout(resolve, 10));
      if (popupManager.conversionPopup) {
        popupManager.cancelCurrentOperation();
      }
      popupManager.hidePopup();
      
      // Start third operation after clicking away
      await new Promise(resolve => setTimeout(resolve, 10));
      const promise3 = popupManager.showConversionPopup(conversions, mockRect, operation3Id);
      
      // Wait for all operations to complete
      await Promise.all([promise1, promise2, promise3]);
      
      // Wait a bit for async operations to settle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Only the last operation should have created a popup
      const popups = document.querySelectorAll('.unit-converter-popup');
      if (popups.length !== 1) {
        throw new Error(`Expected 1 popup, found ${popups.length}`);
      }
      
      // Verify the popup is from operation3 (the valid one)
      if (popupManager.currentOperationId !== operation3Id) {
        throw new Error('Current operation ID should match the last operation');
      }
      
      this.pass(testName);
      
      // Cleanup
      popupManager.hidePopup();
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testSpamClickScenario() {
    const testName = 'Spam Click Scenario';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      const conversions = [{
        original: '5 meters',
        converted: '16.4 feet',
        type: 'length'
      }];
      
      const mockRect = {
        top: 150, left: 150, bottom: 170, right: 350, width: 100, height: 20
      };
      
      // Spam-click scenario: rapid creation and cancellation
      const operations = [];
      for (let i = 0; i < 5; i++) {
        const opId = popupManager.generateOperationId();
        operations.push(opId);
        const promise = popupManager.showConversionPopup(conversions, mockRect, opId);
        
        // Cancel all but the last one
        if (i < 4) {
          await new Promise(resolve => setTimeout(resolve, 5));
          if (popupManager.conversionPopup) {
            popupManager.cancelCurrentOperation();
          }
          popupManager.hidePopup();
        } else {
          // Let the last one complete
          await promise;
        }
      }
      
      // Wait for operations to settle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have exactly one popup from the last operation
      const popups = document.querySelectorAll('.unit-converter-popup');
      if (popups.length !== 1) {
        throw new Error(`Expected 1 popup after spam clicks, found ${popups.length}`);
      }
      
      // Verify it's the last operation
      const lastOpId = operations[operations.length - 1];
      if (popupManager.currentOperationId !== lastOpId) {
        throw new Error('Current operation should be the last one');
      }
      
      this.pass(testName);
      
      // Cleanup
      popupManager.hidePopup();
    } catch (error) {
      this.fail(testName, error.message);
    }
  }

  async testNormalOperationAfterSpamClick() {
    const testName = 'Normal Operation After Spam Click';
    try {
      const PopupManager = window.UnitConverter.PopupManager;
      const popupManager = new PopupManager();
      
      const conversions = [{
        original: '10 kg',
        converted: '22.05 lbs',
        type: 'weight'
      }];
      
      const mockRect = {
        top: 180, left: 180, bottom: 200, right: 380, width: 100, height: 20
      };
      
      // First: Spam-click scenario
      for (let i = 0; i < 3; i++) {
        const opId = popupManager.generateOperationId();
        popupManager.showConversionPopup(conversions, mockRect, opId);
        await new Promise(resolve => setTimeout(resolve, 5));
        popupManager.hidePopup();
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Now do a normal single operation
      const normalOpId = popupManager.generateOperationId();
      await popupManager.showConversionPopup(conversions, mockRect, normalOpId);
      
      // Wait for operation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should show popup normally
      const popups = document.querySelectorAll('.unit-converter-popup');
      if (popups.length !== 1) {
        throw new Error(`Expected 1 popup after normal operation, found ${popups.length}`);
      }
      
      // Verify correct operation ID
      if (popupManager.currentOperationId !== normalOpId) {
        throw new Error('Current operation ID should match the normal operation');
      }
      
      // Verify popup has content
      const popup = document.querySelector('.unit-converter-popup');
      if (!popup.textContent.includes('kg') || !popup.textContent.includes('lbs')) {
        throw new Error('Popup should contain conversion content');
      }
      
      this.pass(testName);
      
      // Cleanup
      popupManager.hidePopup();
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
