/**
 * Mock Time Controller for Testing
 * Provides controllable time simulation for testing time-dependent logic
 */

class MockTimeController {
  constructor(initialTime = Date.now()) {
    this._currentTime = initialTime;
    this._isActive = false;
    this._originalDateNow = null;
  }

  /**
   * Get current simulated time
   * @returns {number} Current mock timestamp
   */
  now() {
    return this._currentTime;
  }

  /**
   * Set absolute time
   * @param {number} timestamp - New timestamp in milliseconds
   */
  setTime(timestamp) {
    this._currentTime = timestamp;
  }

  /**
   * Advance time by specified milliseconds
   * @param {number} ms - Milliseconds to advance
   */
  advance(ms) {
    this._currentTime += ms;
  }

  /**
   * Advance time by specified minutes
   * @param {number} minutes - Minutes to advance
   */
  advanceMinutes(minutes) {
    this.advance(minutes * 60 * 1000);
  }

  /**
   * Advance time by specified hours
   * @param {number} hours - Hours to advance
   */
  advanceHours(hours) {
    this.advance(hours * 60 * 60 * 1000);
  }

  /**
   * Reset time to initial value or specified timestamp
   * @param {number} timestamp - Optional new initial timestamp
   */
  reset(timestamp = null) {
    this._currentTime = timestamp !== null ? timestamp : Date.now();
  }

  /**
   * Install mock time globally (replaces Date.now)
   * Use with caution - affects all code using Date.now()
   */
  install() {
    if (this._isActive) return;
    this._originalDateNow = Date.now;
    const self = this;
    Date.now = function() {
      return self._currentTime;
    };
    this._isActive = true;
  }

  /**
   * Uninstall mock time and restore original Date.now
   */
  uninstall() {
    if (!this._isActive) return;
    if (this._originalDateNow) {
      Date.now = this._originalDateNow;
    }
    this._isActive = false;
  }

  /**
   * Create a time provider function for CurrencyRateService
   * @returns {Function} A function that returns current mock time
   */
  createTimeProvider() {
    const self = this;
    return function() {
      return self._currentTime;
    };
  }
}

// Helper functions for common time scenarios
const TimeScenarios = {
  // Fresh cache timestamp (just created)
  freshCache: (timeController) => timeController.now() - 1000,
  
  // Cache that's 30 minutes old (still valid, not stale)
  validCache: (timeController) => timeController.now() - (30 * 60 * 1000),
  
  // Cache that's 46 minutes old (stale but not expired - triggers prefetch)
  staleCache: (timeController) => timeController.now() - (46 * 60 * 1000),
  
  // Cache that's 61 minutes old (expired)
  expiredCache: (timeController) => timeController.now() - (61 * 60 * 1000),
  
  // Cache that's 2 hours old (very expired)
  veryExpiredCache: (timeController) => timeController.now() - (2 * 60 * 60 * 1000),
  
  // User activity timestamp (just active)
  recentActivity: (timeController) => timeController.now() - 1000,
  
  // User activity 3 minutes ago (still active)
  activeUser: (timeController) => timeController.now() - (3 * 60 * 1000),
  
  // User activity 6 minutes ago (inactive)
  inactiveUser: (timeController) => timeController.now() - (6 * 60 * 1000),
  
  // User activity 1 hour ago (long inactive)
  longInactiveUser: (timeController) => timeController.now() - (60 * 60 * 1000)
};

module.exports = {
  MockTimeController,
  TimeScenarios
};
