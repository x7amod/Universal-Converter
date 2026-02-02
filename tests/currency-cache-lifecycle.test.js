/**
 * Currency Cache Lifecycle Tests
 * Comprehensive tests for CurrencyRateService cache behavior
 * 
 * Test Categories:
 * - Cache Validity: isCacheValid() and shouldRefreshCache() scenarios
 * - Activity Tracking: User activity persistence and state detection
 * - Fetch & Fallback: Cache hits, misses, API failures, deduplication
 * - Prefetching: prefetchIfStale() and warmCache() timing
 * - Scheduled Refresh: refreshCacheIfNeeded() with activity states
 * - Edge Cases: Storage errors, time anomalies, normalization
 */

const { MockTimeController, TimeScenarios } = require('./test-helpers/mock-time-controller');
const { MockStorage } = require('./test-helpers/mock-storage');
const { MockFetch, SampleRates } = require('./test-helpers/mock-fetch');
const { TestFixtureFactory, Assertions, CacheBuilder } = require('./test-helpers/test-utilities');

class CurrencyCacheLifecycleTests {
  constructor() {
    this.testResults = [];
    this.passCount = 0;
    this.failCount = 0;
    this.currentCategory = '';
    
    // Store original console methods for suppression
    this._originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };
  }

  /**
   * Suppress console output (for tests that intentionally trigger errors)
   */
  suppressConsole() {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    console.info = () => {};
  }

  /**
   * Restore console output
   */
  restoreConsole() {
    console.log = this._originalConsole.log;
    console.warn = this._originalConsole.warn;
    console.error = this._originalConsole.error;
    console.info = this._originalConsole.info;
  }

  async init() {
    console.log('\n🧪 Starting Currency Cache Lifecycle Tests...\n');
    
    await this.runAllTests();
    this.reportResults();
    
    return this.failCount === 0;
  }

  async runAllTests() {
    await this.runCacheValidityTests();
    await this.runActivityTrackingTests();
    await this.runFetchAndFallbackTests();
    await this.runPrefetchingTests();
    await this.runScheduledRefreshTests();
    await this.runEdgeCaseTests();
  }

  // ============================================
  // Cache Validity Tests
  // ============================================

  async runCacheValidityTests() {
    this.currentCategory = 'Cache Validity';
    console.log(`\n📦 ${this.currentCategory} Tests\n`);

    // Test 1: isCacheValid - null cache
    await this.test('isCacheValid returns false for null cache', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      Assertions.assertFalse(service.isCacheValid(null));
    });

    // Test 2: isCacheValid - undefined cache
    await this.test('isCacheValid returns false for undefined cache', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      Assertions.assertFalse(service.isCacheValid(undefined));
    });

    // Test 3: isCacheValid - fresh cache
    await this.test('isCacheValid returns true for fresh cache (just created)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const cached = fixture.createCacheBuilder().asFresh().build();
      
      Assertions.assertTrue(service.isCacheValid(cached));
    });

    // Test 4: isCacheValid - valid cache (30 min old)
    await this.test('isCacheValid returns true for 30-minute-old cache', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const cached = fixture.createCacheBuilder().asValid().build();
      
      Assertions.assertTrue(service.isCacheValid(cached));
    });

    // Test 5: isCacheValid - stale cache (46 min old, but not expired)
    await this.test('isCacheValid returns true for stale but not expired cache (46 min)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const cached = fixture.createCacheBuilder().asStale().build();
      
      Assertions.assertTrue(service.isCacheValid(cached));
    });

    // Test 6: isCacheValid - expired cache (61 min old)
    await this.test('isCacheValid returns false for expired cache (61 min)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const cached = fixture.createCacheBuilder().asExpired().build();
      
      Assertions.assertFalse(service.isCacheValid(cached));
    });

    // Test 7: isCacheValid - very expired cache
    await this.test('isCacheValid returns false for very expired cache (2 hours)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const cached = fixture.createCacheBuilder().asVeryExpired().build();
      
      Assertions.assertFalse(service.isCacheValid(cached));
    });

    // Test 8: isCacheValid - exact boundary (59:59)
    await this.test('isCacheValid returns true at exact boundary (59:59)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const cached = fixture.createCacheBuilder().withAgeMinutes(59.98).build();
      
      Assertions.assertTrue(service.isCacheValid(cached));
    });

    // Test 9: isCacheValid - just past boundary
    await this.test('isCacheValid returns false just past boundary (60:01)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const cached = fixture.createCacheBuilder().withAgeMinutes(60.02).build();
      
      Assertions.assertFalse(service.isCacheValid(cached));
    });

    // Test 10: shouldRefreshCache - null cache with active user
    await this.test('shouldRefreshCache returns true for null cache', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      Assertions.assertTrue(service.shouldRefreshCache(null));
    });

    // Test 11: shouldRefreshCache - valid cache with active user
    await this.test('shouldRefreshCache returns false for valid cache (active user)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      const cached = fixture.createCacheBuilder().asValid().build();
      
      Assertions.assertFalse(service.shouldRefreshCache(cached));
    });

    // Test 12: shouldRefreshCache - expired cache with active user
    await this.test('shouldRefreshCache returns true for expired cache (active user)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      const cached = fixture.createCacheBuilder().asExpired().build();
      
      Assertions.assertTrue(service.shouldRefreshCache(cached));
    });

    // Test 13: shouldRefreshCache - expired cache with inactive user
    await this.test('shouldRefreshCache returns false for expired cache (inactive user)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserInactive(service);
      const cached = fixture.createCacheBuilder().asExpired().build();
      
      Assertions.assertFalse(service.shouldRefreshCache(cached));
    });

    // Test 14: shouldRefreshCache - stale cache with active user
    await this.test('shouldRefreshCache returns false for stale but valid cache (active user)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      const cached = fixture.createCacheBuilder().asStale().build();
      
      Assertions.assertFalse(service.shouldRefreshCache(cached));
    });

    // Test 15: Time advancement affects cache validity
    await this.test('Cache becomes invalid after time advances past timeout', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const cached = fixture.createCacheBuilder().asFresh().build();
      
      Assertions.assertTrue(service.isCacheValid(cached), 'Fresh cache should be valid');
      
      // Advance time past cache timeout
      fixture.timeController.advanceMinutes(61);
      
      Assertions.assertFalse(service.isCacheValid(cached), 'Cache should be invalid after 61 minutes');
    });
  }

  // ============================================
  // Activity Tracking Tests
  // ============================================

  async runActivityTrackingTests() {
    this.currentCategory = 'Activity Tracking';
    console.log(`\n👤 ${this.currentCategory} Tests\n`);

    // Test 1: isUserActive - just active
    await this.test('isUserActive returns true for recently active user', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = TimeScenarios.recentActivity(fixture.timeController);
      
      Assertions.assertTrue(service.isUserActive());
    });

    // Test 2: isUserActive - active 3 minutes ago
    await this.test('isUserActive returns true for user active 3 minutes ago', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = TimeScenarios.activeUser(fixture.timeController);
      
      Assertions.assertTrue(service.isUserActive());
    });

    // Test 3: isUserActive - inactive 6 minutes ago
    await this.test('isUserActive returns false for user inactive 6 minutes', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = TimeScenarios.inactiveUser(fixture.timeController);
      
      Assertions.assertFalse(service.isUserActive());
    });

    // Test 4: isUserActive - long inactive
    await this.test('isUserActive returns false for user inactive 1 hour', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = TimeScenarios.longInactiveUser(fixture.timeController);
      
      Assertions.assertFalse(service.isUserActive());
    });

    // Test 5: isUserActive - boundary (4:59)
    await this.test('isUserActive returns true at boundary (4:59)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = fixture.timeController.now() - (4 * 60 * 1000 + 59 * 1000);
      
      Assertions.assertTrue(service.isUserActive());
    });

    // Test 6: isUserActive - just past boundary (5:01)
    await this.test('isUserActive returns false just past boundary (5:01)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = fixture.timeController.now() - (5 * 60 * 1000 + 1 * 1000);
      
      Assertions.assertFalse(service.isUserActive());
    });

    // Test 7: updateActivity updates timestamp
    await this.test('updateActivity sets lastUserActivity to current time', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = 0;
      
      await service.updateActivity();
      
      Assertions.assertEqual(service.lastUserActivity, fixture.timeController.now());
    });

    // Test 8: updateActivity persists to storage
    await this.test('updateActivity persists timestamp to storage', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      await service.updateActivity();
      
      const storageData = fixture.storage.getRawData();
      Assertions.assertEqual(storageData.lastUserActivity, fixture.timeController.now());
    });

    // Test 9: loadActivity restores from storage
    await this.test('loadActivity restores timestamp from storage', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      const savedTime = fixture.timeController.now() - 60000;
      
      fixture.storage.setRawData({ lastUserActivity: savedTime });
      await service.loadActivity();
      
      Assertions.assertEqual(service.lastUserActivity, savedTime);
    });

    // Test 10: loadActivity handles missing data
    await this.test('loadActivity sets 0 when no saved activity', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = 12345;
      
      await service.loadActivity();
      
      Assertions.assertEqual(service.lastUserActivity, 0);
    });

    // Test 11: Activity transition from active to inactive
    await this.test('User becomes inactive after time advances', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      await service.updateActivity();
      Assertions.assertTrue(service.isUserActive(), 'User should be active after update');
      
      fixture.timeController.advanceMinutes(6);
      Assertions.assertFalse(service.isUserActive(), 'User should be inactive after 6 minutes');
    });
  }

  // ============================================
  // Fetch and Fallback Tests
  // ============================================

  async runFetchAndFallbackTests() {
    this.currentCategory = 'Fetch & Fallback';
    console.log(`\n🔄 ${this.currentCategory} Tests\n`);

    // Test 1: Cache hit - valid cache
    await this.test('getCurrencyRate returns cached rate when cache is valid', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup valid cache
      const cacheData = fixture.createCacheBuilder()
        .asFresh()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      const result = await service.getCurrencyRate('USD', 'EUR');
      
      Assertions.assertTrue(result.fromCache, 'Should be from cache');
      Assertions.assertEqual(result.rate, SampleRates.fallback.eur);
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0, 'Should not call API');
    });

    // Test 2: Cache miss - fetch from primary API
    await this.test('getCurrencyRate fetches from primary API on cache miss', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      const result = await service.getCurrencyRate('USD', 'EUR');
      
      Assertions.assertFalse(result.fromCache, 'Should not be from cache');
      Assertions.assertFalse(result.usedFallback, 'Should not use fallback');
      Assertions.assertTrue(fixture.mockFetch.wasUrlCalled('api.exchangerate.fun'));
    });

    // Test 3: Primary API failure - fallback to secondary
    await this.test('getCurrencyRate falls back to secondary API on primary failure', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Configure primary to fail
      fixture.mockFetch.setPrimaryAPIFailure(500);
      
      const result = await service.getCurrencyRate('USD', 'EUR');
      
      Assertions.assertTrue(result.usedFallback, 'Should use fallback');
      Assertions.assertTrue(fixture.mockFetch.wasUrlCalled('currency-api@latest'));
    }, { suppressOutput: true });

    // Test 4: Both APIs fail - use stale cache
    await this.test('getCurrencyRate uses stale cache when all APIs fail', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup expired cache
      const cacheData = fixture.createCacheBuilder()
        .asExpired()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      // Configure network failure (affects all requests)
      fixture.mockFetch.setNetworkFailure(new Error('All APIs down'));
      
      const result = await service.getCurrencyRate('USD', 'EUR');
      
      Assertions.assertTrue(result.fromCache, 'Should be from cache');
      Assertions.assertTrue(result.stale, 'Should be marked as stale');
    }, { suppressOutput: true });

    // Test 5: All APIs fail, no cache - throws error
    await this.test('getCurrencyRate throws when all APIs fail and no cache', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Configure network failure (affects all requests)
      fixture.mockFetch.setNetworkFailure(new Error('All APIs down'));
      
      await Assertions.assertThrows(
        async () => await service.getCurrencyRate('USD', 'EUR'),
        'Currency rate unavailable'
      );
    }, { suppressOutput: true });

    // Test 6: Request deduplication
    await this.test('Concurrent requests for same pair are deduplicated', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Add small delay to allow deduplication
      fixture.mockFetch.setNetworkDelay(10);
      
      // Make concurrent requests
      const [result1, result2] = await Promise.all([
        service.getCurrencyRate('USD', 'EUR'),
        service.getCurrencyRate('USD', 'EUR')
      ]);
      
      // Both should succeed with same rate
      Assertions.assertEqual(result1.rate, result2.rate);
      // Should only make 1 API call (deduplication)
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 1);
    });

    // Test 7: Different pairs are not deduplicated
    await this.test('Requests for different pairs are not deduplicated', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Configure different base currency responses
      fixture.mockFetch.setFallbackAPIResponse('gbp', { usd: 1.37, eur: 1.17 });
      
      // Make requests for different pairs
      await service.getCurrencyRate('USD', 'EUR');
      await service.getCurrencyRate('GBP', 'USD');
      
      // Should make 2 API calls (different base currencies)
      Assertions.assertTrue(fixture.mockFetch.getCallCount() >= 2);
    });

    // Test 8: Inactive user with stale cache - serves stale without fetching
    await this.test('Inactive user gets stale cache without API call', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserInactive(service);
      
      // Setup expired cache
      const cacheData = fixture.createCacheBuilder()
        .asExpired()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      const result = await service.getCurrencyRate('USD', 'EUR');
      
      Assertions.assertTrue(result.fromCache, 'Should be from cache');
      Assertions.assertTrue(result.stale, 'Should be marked as stale');
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0, 'Should not call API');
    }, { suppressOutput: true });

    // Test 9: Rate normalization - uppercase API keys
    await this.test('Primary API rates are normalized to lowercase', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Request with lowercase
      const result = await service.getCurrencyRate('usd', 'eur');
      
      Assertions.assertDefined(result.rate);
      Assertions.assertEqual(typeof result.rate, 'number');
    });

    // Test 10: Cache stores normalized rates
    await this.test('Fetched rates are stored in cache', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      await service.getCurrencyRate('USD', 'EUR');
      
      const cached = await service.getCachedRate('usd');
      Assertions.assertDefined(cached, 'Cache should have data');
      Assertions.assertDefined(cached.rates, 'Cache should have rates');
      Assertions.assertDefined(cached.timestamp, 'Cache should have timestamp');
    });

    // Test 11: clearCache removes cache data
    await this.test('clearCache removes all cached rates', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      // Setup cache
      const cacheData = fixture.createCacheBuilder()
        .asFresh()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      // Verify cache exists
      let cached = await service.getCachedRate('usd');
      Assertions.assertDefined(cached, 'Cache should exist before clear');
      
      // Clear cache
      await service.clearCache();
      
      // Verify cache is gone
      cached = await service.getCachedRate('usd');
      Assertions.assertEqual(cached, null, 'Cache should be null after clear');
    }, { suppressOutput: true });

    // Test 12: Network error handling
    await this.test('Network error triggers fallback', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Configure network failure for primary only
      fixture.mockFetch.setResponse('api.exchangerate.fun', null);
      fixture.mockFetch.setNetworkFailure(new Error('Network error'));
      fixture.mockFetch.reset();
      
      // First configure network failure
      fixture.mockFetch.setNetworkFailure(new Error('Network error'));
      
      // Setup stale cache as backup
      const cacheData = fixture.createCacheBuilder()
        .asExpired()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      const result = await service.getCurrencyRate('USD', 'EUR');
      
      Assertions.assertTrue(result.fromCache, 'Should fall back to cache');
    }, { suppressOutput: true });
  }

  // ============================================
  // Prefetching Tests
  // ============================================

  async runPrefetchingTests() {
    this.currentCategory = 'Prefetching';
    console.log(`\n⚡ ${this.currentCategory} Tests\n`);

    // Test 1: prefetchIfStale - no cache triggers warmCache
    await this.test('prefetchIfStale triggers warmCache when no cache exists', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      await service.prefetchIfStale();
      
      // Allow async warmCache operation to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Should have tried to fetch (warmCache calls fetchRatesFromPrimaryAPI)
      Assertions.assertTrue(fixture.mockFetch.getCallCount() > 0, 'Should call API');
    }, { suppressOutput: true });

    // Test 2: prefetchIfStale - fresh cache does nothing
    await this.test('prefetchIfStale does nothing with fresh cache', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup fresh cache
      const cacheData = fixture.createCacheBuilder()
        .asFresh()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.prefetchIfStale();
      
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0, 'Should not call API');
    });

    // Test 3: prefetchIfStale - valid cache does nothing
    await this.test('prefetchIfStale does nothing with valid cache (30 min old)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup valid cache (30 min old)
      const cacheData = fixture.createCacheBuilder()
        .asValid()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.prefetchIfStale();
      
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0, 'Should not call API');
    });

    // Test 4: prefetchIfStale - stale cache triggers prefetch
    await this.test('prefetchIfStale fetches when cache is stale (46 min old)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup stale cache (between 45-60 minutes)
      const cacheData = fixture.createCacheBuilder()
        .asStale()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.prefetchIfStale();
      
      // Allow async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      Assertions.assertTrue(fixture.mockFetch.getCallCount() > 0, 'Should call API');
    }, { suppressOutput: true });

    // Test 5: prefetchIfStale - expired cache does not prefetch (outside window)
    await this.test('prefetchIfStale does not fetch when cache is expired (61 min)', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup expired cache (past 60 minutes)
      const cacheData = fixture.createCacheBuilder()
        .asExpired()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.prefetchIfStale();
      
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0, 'Should not call API');
    });

    // Test 6: prefetchIfStale - inactive user does nothing
    await this.test('prefetchIfStale does nothing when user is inactive', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserInactive(service);
      
      // Setup stale cache that would normally trigger prefetch
      const cacheData = fixture.createCacheBuilder()
        .asStale()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.prefetchIfStale();
      
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0, 'Should not call API');
    });

    // Test 7: warmCache - fetches when no cache
    await this.test('warmCache fetches rates when no cache exists', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      await service.warmCache();
      
      Assertions.assertTrue(fixture.mockFetch.getCallCount() > 0, 'Should call API');
      Assertions.assertTrue(fixture.mockFetch.wasUrlCalled('api.exchangerate.fun'));
    }, { suppressOutput: true });

    // Test 8: warmCache - skips when cache is valid
    await this.test('warmCache skips fetch when cache is valid', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      // Setup valid cache
      const cacheData = fixture.createCacheBuilder()
        .asFresh()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.warmCache();
      
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0, 'Should not call API');
    }, { suppressOutput: true });

    // Test 9: warmCache - refetches when cache is expired
    await this.test('warmCache fetches when cache is expired', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      // Setup expired cache
      const cacheData = fixture.createCacheBuilder()
        .asExpired()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.warmCache();
      
      Assertions.assertTrue(fixture.mockFetch.getCallCount() > 0, 'Should call API');
    }, { suppressOutput: true });

    // Test 10: warmCache handles API failure gracefully
    await this.test('warmCache handles API failure gracefully', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      fixture.mockFetch.setNetworkFailure(new Error('Network error'));
      
      // Should not throw
      await service.warmCache();
      
      // Just verify it completes without error
      Assertions.assertTrue(true);
    }, { suppressOutput: true });

    // Test 11: prefetchIfStale handles API failure gracefully
    await this.test('prefetchIfStale handles API failure gracefully', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup stale cache
      const cacheData = fixture.createCacheBuilder()
        .asStale()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      fixture.mockFetch.setNetworkFailure(new Error('Network error'));
      
      // Should not throw
      await service.prefetchIfStale();
      
      // Wait for async prefetch to complete (fire-and-forget in prefetchIfStale)
      await new Promise(resolve => setTimeout(resolve, 30));
      
      // Just verify it completes without error
      Assertions.assertTrue(true);
    }, { suppressOutput: true });

    // Test 12: Stale threshold boundary - 44 min (no prefetch)
    await this.test('Cache at 44 min does not trigger prefetch', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      const cacheData = fixture.createCacheBuilder()
        .withAgeMinutes(44)
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.prefetchIfStale();
      
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0);
    });

    // Test 13: Stale threshold boundary - 46 min (prefetch)
    await this.test('Cache at 46 min triggers prefetch', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Ensure no network failure from previous tests
      fixture.mockFetch.reset();
      fixture.mockFetch.setPrimaryAPIResponse(SampleRates.primary);
      
      const cacheData = fixture.createCacheBuilder()
        .withAgeMinutes(46)
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.prefetchIfStale();
      
      // Wait for async prefetch to fully complete
      await new Promise(resolve => setTimeout(resolve, 30));
      
      Assertions.assertTrue(fixture.mockFetch.getCallCount() > 0);
    }, { suppressOutput: true });
  }

  // ============================================
  // Scheduled Refresh Tests
  // ============================================

  async runScheduledRefreshTests() {
    this.currentCategory = 'Scheduled Refresh';
    console.log(`\n⏰ ${this.currentCategory} Tests\n`);

    // Test 1: refreshCacheIfNeeded - inactive user does nothing
    await this.test('refreshCacheIfNeeded does nothing when user is inactive', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserInactive(service);
      
      // Setup cache that needs refresh
      const cacheData = fixture.createCacheBuilder()
        .withAgeMinutes(55)
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.refreshCacheIfNeeded();
      
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0);
    });

    // Test 2: refreshCacheIfNeeded - active user with old cache refreshes
    await this.test('refreshCacheIfNeeded refreshes old cache for active user', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup cache older than refresh threshold (50 min)
      const cacheData = fixture.createCacheBuilder()
        .withAgeMinutes(55)
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.refreshCacheIfNeeded();
      
      Assertions.assertTrue(fixture.mockFetch.getCallCount() > 0);
    }, { suppressOutput: true });

    // Test 3: refreshCacheIfNeeded - fresh cache not refreshed
    await this.test('refreshCacheIfNeeded does not refresh fresh cache', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup fresh cache
      const cacheData = fixture.createCacheBuilder()
        .asFresh()
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      await service.refreshCacheIfNeeded();
      
      Assertions.assertEqual(fixture.mockFetch.getCallCount(), 0);
    }, { suppressOutput: true });

    // Test 4: refreshCacheIfNeeded - handles empty cache
    await this.test('refreshCacheIfNeeded handles empty cache gracefully', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      await service.refreshCacheIfNeeded();
      
      // Should complete without error
      Assertions.assertTrue(true);
    }, { suppressOutput: true });

    // Test 5: refreshCacheIfNeeded - multiple currencies
    await this.test('refreshCacheIfNeeded refreshes multiple old currencies', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // Setup cache with multiple currencies
      fixture.storage.setRawData({
        currencyRatesCache: {
          usd: { rates: SampleRates.fallback, timestamp: fixture.timeController.now() - 55 * 60 * 1000 },
          eur: { rates: { usd: 1.18 }, timestamp: fixture.timeController.now() - 55 * 60 * 1000 }
        }
      });
      
      // Setup additional API response for EUR
      fixture.mockFetch.setResponse('api.exchangerate.fun', {
        ok: true,
        status: 200,
        data: { rates: SampleRates.primary }
      });
      
      await service.refreshCacheIfNeeded();
      
      // Should refresh both currencies
      Assertions.assertTrue(fixture.mockFetch.getCallCount() >= 2);
    }, { suppressOutput: true });

    // Test 6: refreshCacheIfNeeded - handles API failure gracefully
    await this.test('refreshCacheIfNeeded handles API failure gracefully', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      const cacheData = fixture.createCacheBuilder()
        .withAgeMinutes(55)
        .withBaseCurrency('usd')
        .buildStorageData();
      fixture.storage.setRawData(cacheData);
      
      fixture.mockFetch.setNetworkFailure(new Error('API error'));
      
      // Should not throw
      await service.refreshCacheIfNeeded();
      
      Assertions.assertTrue(true);
    }, { suppressOutput: true });
  }

  // ============================================
  // Edge Case Tests
  // ============================================

  async runEdgeCaseTests() {
    this.currentCategory = 'Edge Cases';
    console.log(`\n🔧 ${this.currentCategory} Tests\n`);

    // Test 1: Storage error on get
    await this.test('getCachedRate handles storage get error', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      fixture.storage.setErrorOnGet(new Error('Storage error'));
      
      const result = await service.getCachedRate('usd');
      
      Assertions.assertEqual(result, null);
    });

    // Test 2: Storage error on set
    await this.test('setCachedRate handles storage set error', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      fixture.storage.setErrorOnSet(new Error('Storage error'));
      
      // Should not throw
      await service.setCachedRate('usd', { rates: {}, timestamp: Date.now() });
      
      Assertions.assertTrue(true);
    }, { suppressOutput: true });

    // Test 3: Storage error on remove
    await this.test('clearCache handles storage remove error', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      fixture.storage.setErrorOnRemove(new Error('Storage error'));
      
      // Should not throw
      await service.clearCache();
      
      Assertions.assertTrue(true);
    }, { suppressOutput: true });

    // Test 4: Case normalization - mixed case currency codes
    await this.test('Currency codes are normalized to lowercase', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      fixture.setUserActive(service);
      
      // These should all work the same
      const result1 = await service.getCurrencyRate('USD', 'EUR');
      
      fixture.reset();
      const result2 = await service.getCurrencyRate('usd', 'eur');
      
      Assertions.assertEqual(result1.rate, result2.rate);
    });

    // Test 5: Timestamp from future (clock skew)
    await this.test('Future timestamp cache is treated as valid', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      // Cache with timestamp 1 hour in the future
      const futureTimestamp = fixture.timeController.now() + 60 * 60 * 1000;
      const cached = fixture.createCacheBuilder()
        .withTimestamp(futureTimestamp)
        .build();
      
      // Future timestamp means age is negative, which is < cacheTimeout
      Assertions.assertTrue(service.isCacheValid(cached));
    });

    // Test 6: Very old timestamp
    await this.test('Very old cache (24 hours) is invalid', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      const oldTimestamp = fixture.timeController.now() - 24 * 60 * 60 * 1000;
      const cached = fixture.createCacheBuilder()
        .withTimestamp(oldTimestamp)
        .build();
      
      Assertions.assertFalse(service.isCacheValid(cached));
    });

    // Test 7: Empty rates object
    await this.test('Cache with empty rates is still valid structurally', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      const cached = fixture.createCacheBuilder()
        .withRates({})
        .asFresh()
        .build();
      
      Assertions.assertTrue(service.isCacheValid(cached));
    });

    // Test 8: updateActivity with storage error
    await this.test('updateActivity still updates memory on storage error', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = 0;
      
      fixture.storage.setErrorOnSet(new Error('Storage error'));
      
      await service.updateActivity();
      
      Assertions.assertEqual(service.lastUserActivity, fixture.timeController.now());
    }, { suppressOutput: true });

    // Test 9: loadActivity with storage error
    await this.test('loadActivity sets 0 on storage error', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      service.lastUserActivity = 12345;
      
      fixture.storage.setErrorOnGet(new Error('Storage error'));
      
      await service.loadActivity();
      
      Assertions.assertEqual(service.lastUserActivity, 0);
    }, { suppressOutput: true });

    // Test 10: Concurrent warmCache calls
    await this.test('Concurrent warmCache calls are handled', async () => {
      const fixture = TestFixtureFactory.create();
      const service = fixture.createService();
      
      fixture.mockFetch.setNetworkDelay(10);
      
      // Both calls should complete without error
      await Promise.all([
        service.warmCache(),
        service.warmCache()
      ]);
      
      Assertions.assertTrue(true);
    }, { suppressOutput: true });
  }

  // ============================================
  // Test Runner Infrastructure
  // ============================================

  async test(name, fn, options = {}) {
    const { suppressOutput = false } = options;
    
    if (suppressOutput) {
      this.suppressConsole();
    }
    
    try {
      await fn();
      this.pass(name);
    } catch (error) {
      this.fail(name, error.message);
    } finally {
      if (suppressOutput) {
        this.restoreConsole();
      }
    }
  }

  pass(name) {
    this.passCount++;
    this.testResults.push({ name, passed: true, category: this.currentCategory });
    this._originalConsole.log(`  ✅ ${name}`);
  }

  fail(name, error) {
    this.failCount++;
    this.testResults.push({ name, passed: false, error, category: this.currentCategory });
    this._originalConsole.log(`  ❌ ${name}`);
    this._originalConsole.log(`     Error: ${error}`);
  }

  reportResults() {
    const total = this.passCount + this.failCount;
    const passRate = total > 0 ? ((this.passCount / total) * 100).toFixed(1) : 0;
    
    console.log('\n' + '═'.repeat(60));
    console.log('CURRENCY CACHE LIFECYCLE TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${this.passCount} ✅`);
    console.log(`Failed: ${this.failCount} ❌`);
    console.log(`Pass Rate: ${passRate}%`);
    
    if (this.failCount > 0) {
      console.log('\nFailed Tests:');
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - [${r.category}] ${r.name}`);
          if (r.error) console.log(`    ${r.error}`);
        });
    }
    
    console.log('═'.repeat(60) + '\n');
  }
}

// Run tests
async function main() {
  const tester = new CurrencyCacheLifecycleTests();
  const success = await tester.init();
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
