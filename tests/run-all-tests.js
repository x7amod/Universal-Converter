#!/usr/bin/env node
// Cross-platform test runner for Universal Converter Extension
// Works on Windows, Linux, and macOS

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ANSI color codes that work on most terminals
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
};

// Detect if colors are supported
const supportsColor = process.stdout.isTTY && process.env.NODE_ENV !== 'test';

function colorize(text, color) {
  if (!supportsColor) return text;
  return `${color}${text}${colors.reset}`;
}

class CrossPlatformTestRunner {
  constructor() {
    this.testFiles = [
      {
        name: 'Unit Converter Tests',
        script: 'tests/test-runner.js',
        description: 'Core unit conversion logic tests'
      },
      {
        name: 'Test Suite',
        script: 'tests/test-suite.js',
        description: 'Additional test scenarios'
      },
      {
        name: 'Popup Interaction Tests (DOM Tests)',
        script: 'tests/popup-interaction-tests.js',
        description: 'Popup creation and dismissal behavior tests'
      },
      {
        name: 'Currency Cache Lifecycle Tests',
        script: 'tests/currency-cache-lifecycle.test.js',
        description: 'Currency rate service cache behavior tests'
      },
      {
        name: 'Extension Validation',
        script: 'tests/validate-extension.js',
        description: 'Chrome extension structure validation'
      }
    ];
    
    this.testResults = [];
    this.verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
    this.stopOnFailure = process.argv.includes('--stop-on-failure');
  }

  writeHeader(title) {
    const line = '═'.repeat(79);
    console.log('');
    console.log(colorize(line, colors.blue + colors.bold));
    console.log(colorize(`  ${title}`, colors.white + colors.bold));
    console.log(colorize(line, colors.blue + colors.bold));
    console.log('');
  }

  writeTestResult(testName, passed, output, error, duration) {
    const status = passed 
      ? colorize('✅ PASSED', colors.green) 
      : colorize('❌ FAILED', colors.red);
    const durationStr = colorize(`(${duration.toFixed(2)}s)`, colors.yellow);
    
    console.log(`${colorize(testName, colors.cyan + colors.bold)} - ${status} ${durationStr}`);
    
    // Show failed test cases
    if (!passed && output) {
      const failedTests = this.extractFailedTests(output);
      if (failedTests.length > 0) {
        console.log(colorize('  Failed test cases:', colors.red + colors.bold));
        failedTests.forEach(test => {
          console.log(colorize(`    ❌ ${test}`, colors.red));
        });
      }
    }
    
    if (this.verbose && output) {
      console.log(colorize('Output:', colors.blue));
      output.split('\n').forEach(line => {
        if (line.trim()) console.log(`  ${line}`);
      });
    }
    
    if (error) {
      console.log(colorize('Error:', colors.red));
      error.split('\n').forEach(line => {
        if (line.trim()) console.log(`  ${line}`);
      });
    }
    
    console.log('');
  }

  extractFailedTests(output) {
    const failedTests = [];
    const lines = output.split('\n');
    
    // Look for [FAIL] markers
    for (const line of lines) {
      if (line.includes('[FAIL]')) {
        const testName = line.replace(/\[FAIL\]/g, '').trim();
        if (testName) {
          failedTests.push(testName);
        }
      }
    }
    
    // If no [FAIL] markers, look for "Failed Tests:" section
    if (failedTests.length === 0) {
      let inFailedSection = false;
      for (const line of lines) {
        if (line.includes('Failed Tests:')) {
          inFailedSection = true;
          continue;
        }
        if (inFailedSection && line.trim().startsWith('-')) {
          const testName = line.trim().replace(/^-\s*/, '');
          if (testName) {
            failedTests.push(testName);
          }
        }
        // Stop when we hit an empty line after the failed tests section
        if (inFailedSection && !line.trim()) {
          break;
        }
      }
    }
    
    return failedTests;
  }

  runNodeTest(scriptPath, testName) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let output = '';
      let error = '';
      
      // Check if Node.js is available
      const nodeProcess = spawn('node', ['--version'], { stdio: 'pipe' });
      
      nodeProcess.on('error', () => {
        const duration = (Date.now() - startTime) / 1000;
        resolve({
          name: testName,
          passed: false,
          duration,
          output: '',
          error: 'Node.js is not installed or not in PATH'
        });
      });
      
      nodeProcess.on('close', (code) => {
        if (code !== 0) {
          const duration = (Date.now() - startTime) / 1000;
          resolve({
            name: testName,
            passed: false,
            duration,
            output: '',
            error: 'Node.js is not available'
          });
          return;
        }
        
        // Run the actual test
        const testProcess = spawn('node', [scriptPath], {
          stdio: 'pipe',
          cwd: process.cwd()
        });
        
        testProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        testProcess.stderr.on('data', (data) => {
          error += data.toString();
        });
        
        testProcess.on('error', (err) => {
          error += err.message;
        });
        
        testProcess.on('close', (exitCode) => {
          const duration = (Date.now() - startTime) / 1000;
          const passed = exitCode === 0;
          
          resolve({
            name: testName,
            passed,
            duration,
            output: output.trim(),
            error: error.trim(),
            exitCode
          });
        });
      });
    });
  }

  showSummary(results) {
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;
    const totalCount = results.length;
    const successRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(1) : 0;
    
    this.writeHeader('TEST SUMMARY');
    
    console.log(colorize('Overall Results:', colors.white + colors.bold));
    console.log(`  Total Tests: ${colorize(totalCount, colors.bold)}`);
    console.log(`  Passed: ${colorize(passedCount, colors.green + colors.bold)}`);
    console.log(`  Failed: ${colorize(failedCount, colors.red + colors.bold)}`);
    console.log(`  Success Rate: ${colorize(`${successRate}%`, colors.bold)}`);
    console.log(`  Total Duration: ${colorize(`${totalDuration.toFixed(2)}s`, colors.yellow + colors.bold)}`);
    console.log('');
    
    console.log(colorize('Test Details:', colors.white + colors.bold));
    results.forEach(result => {
      const status = result.passed 
        ? colorize('✅ PASSED', colors.green) 
        : colorize('❌ FAILED', colors.red);
      const durationStr = colorize(`(${result.duration.toFixed(2)}s)`, colors.yellow);
      console.log(`  ${colorize(result.name, colors.bold)}: ${status} ${durationStr}`);
      
      if (!result.passed) {
        // Extract and show failed test cases
        const failedTests = this.extractFailedTests(result.output);
        if (failedTests.length > 0) {
          console.log(colorize('    Failed test cases:', colors.red));
          failedTests.forEach(test => {
            console.log(colorize(`      • ${test}`, colors.red));
          });
        }
        
        if (result.error) {
          const errorLine = result.error.split('\n')[0];
          console.log(`    ${colorize(`Error: ${errorLine}`, colors.red)}`);
        }
      }
    });
    
    console.log('');
    
    if (failedCount === 0) {
      console.log(colorize('🎉 All tests passed! 🎉', colors.green + colors.bold));
    } else {
      console.log(colorize(`⚠️  ${failedCount} test(s) failed!`, colors.red + colors.bold));
    }
    
    console.log('');
    console.log(colorize(`Test run completed at ${new Date().toLocaleString()}`, colors.blue + colors.bold));
    console.log('');
  }

  async run() {
    this.writeHeader('UNIVERSAL CONVERTER TEST RUNNER');
    
    console.log(colorize('Starting automated test suite...', colors.white + colors.bold));
    console.log(`Platform: ${colorize(os.platform(), colors.cyan)} ${colorize(os.arch(), colors.cyan)}`);
    console.log(`Node.js version: ${colorize(process.version, colors.cyan)}`);
    console.log(`Working directory: ${colorize(process.cwd(), colors.cyan)}`);
    console.log('');
    
    // Check if we're in the right directory
    if (!fs.existsSync('manifest.json')) {
      console.log(colorize('❌ Error: manifest.json not found. Please run this script from the extension root directory.', colors.red));
      process.exit(1);
    }
    
    // Check if currency-mappings.js exists
    if (!fs.existsSync('data/currency-mappings.js')) {
      console.log(colorize('⚠️  Warning: data/currency-mappings.js not found. Some tests may fail.', colors.yellow));
    }
    
    // Run each test
    for (const test of this.testFiles) {
      console.log(colorize(`Running: ${test.name}`, colors.cyan + colors.bold));
      console.log(colorize(`Description: ${test.description}`, colors.white));
      console.log(colorize(`Script: ${test.script}`, colors.white));
      console.log('');
      
      if (!fs.existsSync(test.script)) {
        console.log(colorize(`❌ Test script not found: ${test.script}`, colors.red));
        console.log('');
        
        this.testResults.push({
          name: test.name,
          passed: false,
          duration: 0,
          output: '',
          error: `Test script not found: ${test.script}`,
          exitCode: 1
        });
        
        if (this.stopOnFailure) {
          console.log(colorize('Stopping due to --stop-on-failure flag', colors.red));
          break;
        }
        continue;
      }
      
      const result = await this.runNodeTest(test.script, test.name);
      this.testResults.push(result);
      this.writeTestResult(result.name, result.passed, result.output, result.error, result.duration);
      
      if (this.stopOnFailure && !result.passed) {
        console.log(colorize('Stopping due to --stop-on-failure flag', colors.red));
        break;
      }
    }
    
    // Show summary
    this.showSummary(this.testResults);
    
    // Set exit code based on results
    const failedCount = this.testResults.filter(r => !r.passed).length;
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Universal Converter Test Runner

Usage: node tests/run-all-tests.js [options]

Options:
  --verbose, -v           Show detailed test output
  --stop-on-failure       Stop on first test failure
  --help, -h              Show this help message

Examples:
  node tests/run-all-tests.js
  node tests/run-all-tests.js --verbose
  node tests/run-all-tests.js --stop-on-failure
`);
  process.exit(0);
}

// Run the tests
const runner = new CrossPlatformTestRunner();
runner.run().catch(error => {
  console.error(colorize(`❌ Unexpected error: ${error.message}`, colors.red));
  process.exit(1);
});
