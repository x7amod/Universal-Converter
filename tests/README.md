# Universal Converter Tests

## Test Suites

### 1. Unit Converter Tests (`test-runner.js`)
Core unit conversion logic tests covering:
- Temperature conversions
- Length/distance conversions
- Weight/mass conversions
- Volume conversions
- Time conversions
- Speed conversions

### 2. Test Suite (`test-suite.js`)
Additional test scenarios and edge cases

### 3. **Popup Interaction Tests** (`popup-interaction-tests.js`)
Tests for popup behavior and user interaction:

#### Popup Creation
- Verifies popup DOM element is created correctly
- Checks popup content matches conversion data
- Validates popup positioning (left/top coordinates)

#### Popup Dismissal Tests
- **Dismiss on Click** - Simulates user clicking to dismiss popup
- **Dismiss on Scroll** - Verifies one-time scroll listener auto-dismisses popup
- **Dismiss on Resize** - Verifies one-time resize listener auto-dismisses popup

#### Selection Rect Capture (DOMException Prevention)
- **Selection Rect Captured Before Async** - Ensures selection rect is captured synchronously before async operations
- **Invalid Selection Handling** - Tests that invalid/cleared selections don't crash

#### Temporary Listener Cleanup
- Verifies scroll/resize listeners are attached when popup shows
- Confirms listeners are removed when popup is hidden
- Validates no memory leaks from lingering event listeners

### 4. **Currency Cache Lifecycle Tests** (`currency-cache-lifecycle.test.js`)
Comprehensive tests for CurrencyRateService cache behavior (67 tests):

#### Cache Validity (15 tests)
- `isCacheValid()` with null, undefined, fresh, valid, stale, and expired cache
- `shouldRefreshCache()` with various cache states and user activity
- Boundary conditions at exact cache timeout thresholds
- Time advancement affecting cache validity

#### Activity Tracking (11 tests)
- `isUserActive()` at various activity timestamps
- Activity boundary conditions (4:59 vs 5:01 minutes)
- `updateActivity()` persists to storage
- `loadActivity()` restores from storage on restart
- Activity transitions over time

#### Fetch & Fallback (12 tests)
- Cache hit returns cached rate without API call
- Cache miss triggers primary API fetch
- Primary API failure falls back to secondary API
- Both APIs fail uses stale cache
- All APIs fail with no cache throws error
- Request deduplication for concurrent requests
- Inactive user gets stale cache without API call
- Rate normalization (uppercase/lowercase)
- Cache storage after fetch

#### Prefetching (13 tests)
- `prefetchIfStale()` triggers `warmCache()` when no cache
- Fresh/valid cache skips prefetch
- Stale cache (45-60 min) triggers prefetch
- Expired cache does not prefetch
- Inactive user skips prefetch
- `warmCache()` fetches when needed, skips when valid
- API failure handling (graceful degradation)
- Stale threshold boundary tests (44 vs 46 minutes)

#### Scheduled Refresh (6 tests)
- `refreshCacheIfNeeded()` skips for inactive users
- Active user with old cache triggers refresh
- Fresh cache not refreshed
- Empty cache handled gracefully
- Multiple currencies refreshed
- API failure handling

#### Edge Cases (10 tests)
- Storage errors on get/set/remove
- Case normalization for currency codes
- Future timestamps (clock skew)
- Very old cache (24 hours)
- Empty rates object
- Activity updates with storage errors
- Concurrent `warmCache()` calls

### 5. Extension Validation (`validate-extension.js`)
Chrome extension structure and manifest validation

## Test Helpers

The Currency Cache Lifecycle Tests use dedicated test helpers in `tests/test-helpers/`:

| File | Description |
|------|-------------|
| `mock-time-controller.js` | Controllable time simulation with `advance()`, `advanceMinutes()` methods |
| `mock-storage.js` | In-memory chrome.storage implementation with error injection |
| `mock-fetch.js` | Configurable API response mocking with failure simulation |
| `test-utilities.js` | `TestFixtureFactory`, `CacheBuilder`, and assertion helpers |

## Running Tests

```bash
# Run all tests
npm run test:all

# Run with verbose output
npm run test:verbose

# Run specific test file
node tests/popup-interaction-tests.js
node tests/currency-cache-lifecycle.test.js

# Stop on first failure
npm run test:stop-on-failure
```

## Test Coverage

### Mock Environment

The popup interaction tests use JSDOM to create a realistic browser environment:
- Full DOM API support
- Event dispatching and handling
- `requestAnimationFrame` simulation
- Chrome extension API mocking

The currency cache tests use dependency injection for testability:
- Mock time controller for deterministic time-based tests
- Mock storage provider for isolated storage operations
- Mock fetch for API response simulation
- No actual network calls or storage writes

## Adding New Tests

To add a new popup interaction test:

```javascript
async testMyNewFeature() {
  const testName = 'My New Feature';
  try {
    // Setup
    const PopupManager = window.UnitConverter.PopupManager;
    const popupManager = new PopupManager();
    
    // Test logic
    // ...
    
    this.pass(testName);
  } catch (error) {
    this.fail(testName, error.message);
  }
}
```

Then add to `runAllTests()`:
```javascript
await this.testMyNewFeature();
```

## Adding Currency Cache Tests

To add a new currency cache lifecycle test:

```javascript
// In the appropriate test category method
await this.test('My new cache test', async () => {
  const fixture = TestFixtureFactory.create();
  const service = fixture.createService();
  fixture.setUserActive(service); // or setUserInactive()
  
  // Setup cache state
  const cacheData = fixture.createCacheBuilder()
    .withAgeMinutes(30)
    .withBaseCurrency('usd')
    .buildStorageData();
  fixture.storage.setRawData(cacheData);
  
  // Configure mock API if needed
  fixture.mockFetch.setPrimaryAPIResponse(SampleRates.primary);
  
  // Test logic
  const result = await service.getCurrencyRate('USD', 'EUR');
  
  // Assertions
  Assertions.assertTrue(result.fromCache);
}, { suppressOutput: true }); // Add if test triggers console output
```

## Dependencies

- `jsdom` - DOM environment simulation
- Node.js built-in modules (`fs`, `path`, `vm`)
