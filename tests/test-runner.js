#!/usr/bin/env node
// JSON Test Runner for Unit Converter Extension
// This script loads test cases from test-cases.json and runs them efficiently

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

class JSONUnitConverterTester {
  constructor() {
    this.testResults = [];
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    
    // Mock window object for Node.js
    global.window = {};
    global.document = { location: { hostname: 'localhost' } };
    
    // Load modules and test cases
    this.loadModules();
    this.loadTestCases();
  }

  loadModules() {
    try {
      // Load conversion data
      const conversionDataPath = path.join(__dirname, '..', 'data', 'conversion-data.js');
      const conversionData = fs.readFileSync(conversionDataPath, 'utf8');
      eval(conversionData);

      // Load currency mappings
      const currencyMappingsPath = path.join(__dirname, '..', 'data', 'currency-mappings.js');
      const currencyMappings = fs.readFileSync(currencyMappingsPath, 'utf8');
      eval(currencyMappings);

      // Load unit converter
      const unitConverterPath = path.join(__dirname, '..', 'utils', 'unit-converter.js');
      const unitConverter = fs.readFileSync(unitConverterPath, 'utf8');
      eval(unitConverter);

      // Load currency converter
      const currencyConverterPath = path.join(__dirname, '..', 'utils', 'currency-converter.js');
      const currencyConverter = fs.readFileSync(currencyConverterPath, 'utf8');
      eval(currencyConverter);

      // Load conversion detector
      const detectorPath = path.join(__dirname, '..', 'utils', 'conversion-detector.js');
      const detector = fs.readFileSync(detectorPath, 'utf8');
      eval(detector);

      console.log(`${colors.green}✅ All modules loaded successfully${colors.reset}`);
      
      this.unitConverter = new global.window.UnitConverter.UnitConverter();
      this.detector = new global.window.UnitConverter.ConversionDetector(this.unitConverter);
      
      // Initialize the global currency converter instance
      if (typeof global.window.UnitConverter.CurrencyConverter !== 'undefined') {
        global.window.UnitConverter.currencyConverter = new global.window.UnitConverter.CurrencyConverter();
      }
      
      // Initialize currency pattern after mappings are loaded
      if (global.window.UnitConverterData && global.window.UnitConverterData.initializeCurrencyPattern) {
        global.window.UnitConverterData.initializeCurrencyPattern();
      }
      
    } catch (error) {
      console.error(`${colors.red}❌ Failed to load modules:${colors.reset}`, error.message);
      process.exit(1);
    }
  }

  loadTestCases() {
    try {
      const testCasesPath = path.join(__dirname, 'test-cases.json');
      const testCasesContent = fs.readFileSync(testCasesPath, 'utf8');
      this.testCases = JSON.parse(testCasesContent);
      console.log(`${colors.green}✅ Test cases loaded successfully from JSON${colors.reset}`);
      
      // Log test case counts
      Object.entries(this.testCases).forEach(([groupName, tests]) => {
        console.log(`   ${groupName}: ${tests.length} tests`);
      });
    } catch (error) {
      console.error(`${colors.red}❌ Failed to load test cases:${colors.reset}`, error.message);
      process.exit(1);
    }
  }

  assert(condition, testName, expected, actual) {
    this.testCount++;
    
    if (condition) {
      this.passCount++;
      console.log(`${colors.green}[PASS] ${testName}${colors.reset}`);
      this.testResults.push({ name: testName, status: 'PASS', expected, actual });
    } else {
      this.failCount++;
      console.log(`${colors.red}[FAIL] ${testName}${colors.reset}`);
      console.log(`   Expected: ${expected}`);
      console.log(`   Actual: ${actual}`);
      this.testResults.push({ name: testName, status: 'FAIL', expected, actual });
    }
  }

  // Generic test runner for different test types
  runTestCase(testCase) {
    const { name, type, input, expected, tolerance = 0 } = testCase;

    switch (type) {
      case 'conversion':
        const result = this.unitConverter.convert(input.value, input.from, input.to);
        this.assert(Math.abs(result - expected) < tolerance, name, expected, result);
        break;

      case 'conversionNull':
        const nullResult = this.unitConverter.convert(input.value, input.from, input.to);
        this.assert(nullResult === expected, name, expected, nullResult);
        break;

      case 'normalize':
        const normalized = this.unitConverter.normalizeUnit(input);
        this.assert(normalized === expected, name, expected, normalized);
        break;

      case 'unitType':
        const unitType = this.unitConverter.getUnitType(input);
        this.assert(unitType === expected, name, expected, unitType);
        break;

      case 'bestUnit':
        const bestUnit = this.unitConverter.getBestUnit(input.value, input.unitType, input.sourceUnit);
        this.assert(bestUnit.unit === expected, name, expected, bestUnit.unit);
        break;

      case 'bestUnitWithValue':
        const bestUnitWithValue = this.unitConverter.getBestUnit(input.value, input.unitType, input.sourceUnit);
        const condition = bestUnitWithValue.unit === expected.unit && bestUnitWithValue.value === expected.value;
        this.assert(condition, name, `${expected.value} ${expected.unit}`, `${bestUnitWithValue.value} ${bestUnitWithValue.unit}`);
        break;

      case 'format':
        const formatted = this.unitConverter.formatResult(input.value, input.unit);
        this.assert(formatted === expected, name, expected, formatted);
        break;

      case 'patternDetection':
        const conversions = this.detector.findConversions(input.text, input.userSettings);
        const hasMinConversions = conversions.length >= expected.minConversions;
        const detectionStatus = hasMinConversions ? 'detected' : 'not detected';
        this.assert(hasMinConversions, `${name.replace(' detected', '')} ${detectionStatus}`, `>=${expected.minConversions} conversions`, conversions.length);
        break;

      case 'patternDetectionType':
        const typeConversions = this.detector.findConversions(input.text, input.userSettings);
        if (typeConversions.length > 0) {
          const detectedAs = `detected as ${typeConversions[0].type}`;
          this.assert(typeConversions[0].type === expected, `${name.replace(' detected as ' + expected, '')} ${detectedAs}`, expected, typeConversions[0].type);
        } else {
          this.assert(false, `${name.replace(' detected as ' + expected, '')} not detected`, expected, 'no conversions found');
        }
        break;

      case 'dimensionDetection':
        const dimConversions = this.detector.findConversions(input.text, input.userSettings);
        const dimensionFound = dimConversions.find(conv => conv.type === 'dimensions');
        this.assert(dimensionFound !== undefined, name, 'detected', dimensionFound ? 'detected' : 'not detected');
        break;

      case 'dimensionConversion':
        const dimConvResult = this.detector.findConversions(input.text, input.userSettings);
        const dimensionConv = dimConvResult.find(conv => conv.type === 'dimensions');
        if (dimensionConv) {
          const containsUnit = dimensionConv.converted.includes(expected.containsUnit);
          this.assert(containsUnit, name, `contains ${expected.containsUnit}`, dimensionConv.converted);
        } else {
          this.assert(false, name, 'dimension conversion', 'not found');
        }
        break;

      case 'doubleDetectionCount':
        const doubleDetectConversions = this.detector.findConversions(input.text, input.userSettings);
        this.assert(doubleDetectConversions.length === expected, name, expected, doubleDetectConversions.length);
        break;

      case 'doubleDetectionType':
        const doubleDetectTypeConversions = this.detector.findConversions(input.text, input.userSettings);
        if (doubleDetectTypeConversions.length > 0) {
          this.assert(doubleDetectTypeConversions[0].type === expected, name, expected, doubleDetectTypeConversions[0].type);
        } else {
          this.assert(false, name, expected, 'no conversions found');
        }
        break;

      case 'originalBugFix':
        const bugFixConversions = this.detector.findConversions(input.text, input.userSettings);
        
        // Test count
        this.assert(bugFixConversions.length === expected.count, 
          `${name} (count)`, expected.count, bugFixConversions.length);
        
        // Test type
        if (bugFixConversions.length > 0) {
          this.assert(bugFixConversions[0].type === expected.type, 
            `${name} (type)`, expected.type, bugFixConversions[0].type);
          
          // Test all dimensions included
          if (expected.allDimensions && bugFixConversions[0].converted) {
            const converted = bugFixConversions[0].converted;
            // Check for converted values (0.37 × 1.11 × 0.32 m) instead of original cm values
            const hasAllDimensions = converted.includes('0.37') && converted.includes('1.11') && converted.includes('0.32');
            this.assert(hasAllDimensions, 
              `${name} (all dimensions)`, 'all dimensions included', hasAllDimensions ? 'all included' : 'some missing');
          }
        }
        break;

      case 'timezonePatternTest':
        // Test if timezone patterns are recognized in text
        const timezonePattern = global.window.UnitConverterData?.PATTERNS?.timezone;
        if (timezonePattern) {
          const hasMatch = timezonePattern.test(input.text);
          this.assert(hasMatch === expected.hasTimePattern, name, expected.hasTimePattern ? 'pattern matched' : 'pattern not matched', hasMatch ? 'pattern matched' : 'pattern not matched');
        } else {
          this.assert(false, name, 'timezone pattern available', 'timezone pattern not found');
        }
        break;

      case 'regexTest':
        // Test if a regex pattern matches text
        const pattern = input.pattern;
        if (pattern) {
          // Reset regex state if it's global
          if (pattern.global) {
            pattern.lastIndex = 0;
          }
          const hasMatch = pattern.test(input.text);
          this.assert(hasMatch === expected.hasMatch, name, expected.hasMatch ? 'pattern should match' : 'pattern should not match', hasMatch ? 'pattern matched' : 'pattern did not match');
        } else {
          this.assert(false, name, 'pattern provided', 'no pattern found');
        }
        break;

      case 'patternFromDataTest':
        // Test using actual patterns from conversion data
        const dataPattern = global.window.UnitConverterData?.UNIT_PATTERNS?.[input.patternType];
        if (dataPattern) {
          // Reset regex state if it's global
          if (dataPattern.global) {
            dataPattern.lastIndex = 0;
          }
          const hasMatch = dataPattern.test(input.text);
          this.assert(hasMatch === expected.hasMatch, name, expected.hasMatch ? 'pattern should match' : 'pattern should not match', hasMatch ? 'pattern matched' : 'pattern did not match');
        } else {
          this.assert(false, name, `${input.patternType} pattern available`, `${input.patternType} pattern not found in conversion data`);
        }
        break;

      case 'singleSelection':
        // Handle single selection tests with different structure
        const userSettings = Object.assign({}, input);
        delete userSettings.selectedText; // Remove selectedText from userSettings
        const singleSelectionConversions = this.detector.findConversions(input.selectedText, userSettings);
        
        if (expected.hasConversion) {
          // Should have exactly one conversion
          this.assert(singleSelectionConversions.length === 1, 
            name, '1 conversion', singleSelectionConversions.length);
          
          if (singleSelectionConversions.length > 0 && expected.conversionType) {
            this.assert(singleSelectionConversions[0].type === expected.conversionType, 
              `${name} (type)`, expected.conversionType, singleSelectionConversions[0].type);
          }
        } else {
          // Should have no conversions
          this.assert(singleSelectionConversions.length === 0, 
            name, '0 conversions', singleSelectionConversions.length);
        }
        break;

      case 'timezoneConversion':
        // Handle timezone conversion tests
        const timezoneResult = this.unitConverter.convertTimezone(input.time, input.from, input.to);
        if (timezoneResult && timezoneResult.formatted && timezoneResult.timezone) {
          const actualResult = `${timezoneResult.formatted} ${timezoneResult.timezone}`;
          this.assert(actualResult === expected, name, expected, actualResult);
        } else {
          this.assert(false, name, expected, 'conversion failed');
        }
        break;

      // Handle legacy test formats that might not follow standard structure
      default:
        // Check if this is a legacy dimension format test
        if (testCase.text && testCase.expectedCount !== undefined) {
          this.runLegacyDimensionTest(testCase);
        } else if (testCase.text && testCase.expectedTypeNot !== undefined) {
          this.runLegacyNonDimensionTest(testCase);
        } else {
          console.log(`${colors.yellow}[WARNING] Unknown test type: ${type || 'undefined'}${colors.reset}`);
          console.log(`   Test case:`, JSON.stringify(testCase, null, 2));
        }
    }
  }

  // Handle legacy dimension format tests
  runLegacyDimensionTest(testCase) {
    const userSettings = {
      lengthUnit: 'm',
      areaUnit: 'm2',
      weightUnit: 'kg',
      temperatureUnit: 'c',
      volumeUnit: 'l',
      currencyUnit: 'USD'
    };

    const conversions = this.detector.findConversions(testCase.text, userSettings);
    
    this.assert(conversions.length === testCase.expectedCount, 
      testCase.name, testCase.expectedCount, conversions.length);
    
    if (conversions.length > 0 && testCase.expectedType) {
      this.assert(conversions[0].type === testCase.expectedType, 
        `${testCase.name} (type)`, testCase.expectedType, conversions[0].type);
    }
  }

  // Handle legacy non-dimension tests
  runLegacyNonDimensionTest(testCase) {
    const userSettings = {
      lengthUnit: 'm',
      areaUnit: 'm2',
      weightUnit: 'kg',
      temperatureUnit: 'c',
      volumeUnit: 'l',
      currencyUnit: 'USD'
    };

    const conversions = this.detector.findConversions(testCase.text, userSettings);
    
    this.assert(conversions.length === testCase.expectedCount, 
      testCase.name, testCase.expectedCount, conversions.length);
    
    if (conversions.length > 0 && testCase.expectedTypeNot) {
      this.assert(conversions[0].type !== testCase.expectedTypeNot, 
        `${testCase.name} (not ${testCase.expectedTypeNot})`, `not ${testCase.expectedTypeNot}`, conversions[0].type);
    }
  }

  // Run test suites by category
  runTestSuite(suiteName, testCases) {
    console.log(`\n${colors.blue}[Testing ${suiteName}]${colors.reset}`);
    
    testCases.forEach(testCase => {
      this.runTestCase(testCase);
    });
  }

  // Generate test report
  generateReport() {
    console.log(`\n${colors.bright}${colors.blue}[Test Report]${colors.reset}`);
    console.log(`${colors.bright}Total Tests: ${this.testCount}${colors.reset}`);
    console.log(`${colors.green}Passed: ${this.passCount}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.failCount}${colors.reset}`);
    
    const successRate = ((this.passCount / this.testCount) * 100).toFixed(1);
    console.log(`${colors.bright}Success Rate: ${successRate}%${colors.reset}`);

    if (this.failCount > 0) {
      console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
      this.testResults
        .filter(result => result.status === 'FAIL')
        .forEach(result => {
          console.log(`  - ${result.name}`);
        });
      
      process.exit(1); // Exit with error code for CI/CD
    } else {
      console.log(`\n${colors.green}[All tests passed!]${colors.reset}`);
    }
  }

  // Run all tests
  async runAllTests() {
    console.log(`${colors.bright}${colors.yellow}[Starting Unit Converter Tests]${colors.reset}\n`);
    
    // Run grouped test suites from JSON
    this.runTestSuite('Detection Tests', this.testCases.Detection);
    this.runTestSuite('Autosizing Tests', this.testCases.Autosizing);
    this.runTestSuite('Conversion Tests', this.testCases.Conversions);
    this.runTestSuite('Other Tests', this.testCases.OtherTests);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new JSONUnitConverterTester();
  tester.runAllTests().then(() => {
    tester.generateReport();
  }).catch(error => {
    console.error(`${colors.red}❌ Test suite failed:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = JSONUnitConverterTester;
