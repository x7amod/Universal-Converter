/**
 * Mock Time Controller for Testing
 * Provides controllable time simulation for testing time-dependent logic
 */

class MockTimeController {
  constructor(initialTime = Date.now()) {
    this._currentTime = initialTime;
  }

  /**
   * Get current simulated time
   * @returns {number} Current mock timestamp
   */
  now() {
    return this._currentTime;
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
   * Reset time to initial value or specified timestamp
   * @param {number} timestamp - Optional new initial timestamp
   */
  reset(timestamp = null) {
    this._currentTime = timestamp !== null ? timestamp : Date.now();
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
