#!/usr/bin/env node
// Extension Validation Script
// Validates the Chrome extension structure and manifest

const fs = require('fs');
const path = require('path');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

class ExtensionValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.checks = 0;
    this.passed = 0;
  }

  check(condition, message, isWarning = false) {
    this.checks++;
    
    if (condition) {
      this.passed++;
      console.log(`${colors.green}✅ ${message}${colors.reset}`);
    } else {
      if (isWarning) {
        this.warnings.push(message);
        console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
      } else {
        this.errors.push(message);
        console.log(`${colors.red}❌ ${message}${colors.reset}`);
      }
    }
  }
  validateManifest() {
    console.log(`${colors.blue}🔍 Validating manifest.json${colors.reset}`);
    
    try {
      const manifestPath = path.join(__dirname, '..', 'manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Check required fields
      this.check(manifest.manifest_version === 3, 'Manifest version is 3 (required for Chrome Extensions)');
      this.check(typeof manifest.name === 'string' && manifest.name.length > 0, 'Extension name is present');
      this.check(typeof manifest.version === 'string', 'Version is present');
      this.check(typeof manifest.description === 'string', 'Description is present');

      // Check permissions
      this.check(Array.isArray(manifest.permissions), 'Permissions array exists');
      this.check(manifest.permissions.includes('activeTab'), 'activeTab permission granted');
      this.check(manifest.permissions.includes('storage'), 'storage permission granted');

      // Check action (title configured, popup optional for standalone design)
      this.check(manifest.action && manifest.action.default_title, 'Action configured with title');

      // Check content scripts
      this.check(Array.isArray(manifest.content_scripts), 'Content scripts array exists');
      this.check(manifest.content_scripts.length > 0, 'At least one content script defined');
      
      if (manifest.content_scripts.length > 0) {
        const contentScript = manifest.content_scripts[0];
        this.check(Array.isArray(contentScript.matches), 'Content script matches defined');
        this.check(contentScript.matches.includes('<all_urls>'), 'Content script runs on all URLs');
        this.check(Array.isArray(contentScript.js), 'Content script JS files defined');
        this.check(contentScript.js.length > 0, 'At least one JS file in content script');
      }

      // Check background script
      this.check(manifest.background && manifest.background.service_worker, 'Service worker (background script) configured');

      return manifest;

    } catch (error) {
      this.check(false, `Failed to read/parse manifest.json: ${error.message}`);
      return null;
    }
  }

  validateFiles() {
    console.log(`\n${colors.blue}📁 Validating file structure${colors.reset}`);    // Required files
    const requiredFiles = [
      'manifest.json',
      'background.js',
      'content.js',
      'settings-page/settings.html',
      'settings-page/settings.js',
      'content.css'
    ];requiredFiles.forEach(file => {
      const exists = fs.existsSync(path.join(__dirname, '..', file));
      this.check(exists, `Required file exists: ${file}`);
    });    // Required directories
    const requiredDirs = ['data', 'utils', 'icons', 'settings-page', 'tests'];
    requiredDirs.forEach(dir => {
      const exists = fs.existsSync(path.join(__dirname, '..', dir));
      this.check(exists, `Required directory exists: ${dir}`);
    });

    // Check module files
    const moduleFiles = [
      'data/conversion-data.js',
      'utils/unit-converter.js',
      'utils/conversion-detector.js',
      'utils/popup-manager.js',
      'utils/settings-manager.js'
    ];    moduleFiles.forEach(file => {
      const exists = fs.existsSync(path.join(__dirname, '..', file));
      this.check(exists, `Module file exists: ${file}`);
    });

    // Check icon files
    const iconSizes = [16, 32, 48, 128];
    iconSizes.forEach(size => {
      const iconFile = `icons/icon${size}.png`;
      const exists = fs.existsSync(path.join(__dirname, '..', iconFile));
      this.check(exists, `Icon file exists: ${iconFile}`, true); // Warning only
    });
  }

  validateSyntax() {
    console.log(`\n${colors.blue}🔧 Validating JavaScript syntax${colors.reset}`);    const jsFiles = [
      'background.js',
      'content.js',
      'settings-page/settings.js',
      'data/conversion-data.js',
      'utils/unit-converter.js',
      'utils/conversion-detector.js',
      'utils/popup-manager.js',
      'utils/settings-manager.js'
    ];jsFiles.forEach(file => {
      try {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          // Basic syntax check - look for obvious syntax errors
          const hasBasicErrors = content.includes('undefined..') || // Double dots after undefined
                                content.includes('null..') ||      // Double dots after null
                                content.includes(';;;;;;') ||      // Too many semicolons
                                content.includes('{{{{');          // Too many opening braces
          
          this.check(!hasBasicErrors, `Basic syntax check passed: ${file}`);
        }
      } catch (error) {
        this.check(false, `Syntax error in ${file}: ${error.message}`);
      }
    });
  }

  validateContentScriptOrder() {
    console.log(`\n${colors.blue}📜 Validating content script loading order${colors.reset}`);    try {
      const manifestPath = path.join(__dirname, '..', 'manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      if (manifest.content_scripts && manifest.content_scripts[0]) {
        const jsFiles = manifest.content_scripts[0].js;
        
        // Check that data loads first
        const dataIndex = jsFiles.findIndex(file => file.includes('conversion-data.js'));
        this.check(dataIndex === 0, 'conversion-data.js loads first');

        // Check that utils load before content.js
        const contentIndex = jsFiles.findIndex(file => file === 'content.js');
        const utilsFiles = jsFiles.filter(file => file.startsWith('utils/'));
        const lastUtilIndex = Math.max(...utilsFiles.map(file => jsFiles.indexOf(file)));
        
        this.check(contentIndex > lastUtilIndex, 'content.js loads after all utils');

        // Check all required files are included
        const requiredInManifest = [
          'data/conversion-data.js',
          'utils/unit-converter.js',
          'utils/conversion-detector.js',
          'utils/popup-manager.js',
          'utils/settings-manager.js',
          'content.js'
        ];

        requiredInManifest.forEach(file => {
          this.check(jsFiles.includes(file), `${file} included in manifest`);
        });
      }
    } catch (error) {
      this.check(false, `Failed to validate content script order: ${error.message}`);
    }
  }

  generateReport() {
    console.log(`\n${colors.bright}${colors.blue}📊 Validation Report${colors.reset}`);
    console.log(`${colors.bright}Total Checks: ${this.checks}${colors.reset}`);
    console.log(`${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`${colors.red}Errors: ${this.errors.length}${colors.reset}`);
    console.log(`${colors.yellow}Warnings: ${this.warnings.length}${colors.reset}`);

    if (this.errors.length > 0) {
      console.log(`\n${colors.red}❌ Errors that must be fixed:${colors.reset}`);
      this.errors.forEach(error => console.log(`  - ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log(`\n${colors.yellow}⚠️  Warnings:${colors.reset}`);
      this.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    if (this.errors.length === 0) {
      console.log(`\n${colors.green}🎉 Extension structure is valid!${colors.reset}`);
      return true;
    } else {
      console.log(`\n${colors.red}💥 Extension has ${this.errors.length} error(s) that must be fixed.${colors.reset}`);
      return false;
    }
  }

  validateFirefoxManifest() {
    console.log(`\n${colors.blue}🦊 Validating Firefox manifest.json${colors.reset}`);
    
    try {
      const manifestPath = path.join(__dirname, '..', 'build-firefox', 'manifest.json');
      
      if (!fs.existsSync(manifestPath)) {
        this.check(false, 'Firefox manifest.json exists (run npm run build first)');
        return null;
      }
      
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Check Firefox Manifest V3 fields
      this.check(manifest.manifest_version === 3, 'Firefox manifest version is 3');
      this.check(typeof manifest.name === 'string' && manifest.name.length > 0, 'Firefox extension name is present');
      this.check(typeof manifest.version === 'string', 'Firefox version is present');
      this.check(typeof manifest.description === 'string', 'Firefox description is present');

      // Check Firefox-specific browser_specific_settings field (REQUIRED for Firefox MV3)
      const hasModernField = manifest.browser_specific_settings && manifest.browser_specific_settings.gecko;
      this.check(hasModernField, 'Firefox browser_specific_settings.gecko field present');
      
      const geckoSettings = manifest.browser_specific_settings?.gecko;
      if (geckoSettings) {
        this.check(typeof geckoSettings.id === 'string', 'Firefox addon ID is present');
        this.check(typeof geckoSettings.strict_min_version === 'string', 'Firefox minimum version specified');
        this.check(typeof geckoSettings.data_collection_permissions === 'object', 'Firefox data_collection_permissions is object');
        if (typeof geckoSettings.data_collection_permissions === 'object') {
          this.check(Array.isArray(geckoSettings.data_collection_permissions.required), 'Firefox data_collection_permissions.required is array');
          if (Array.isArray(geckoSettings.data_collection_permissions.required)) {
            this.check(geckoSettings.data_collection_permissions.required.includes('none') || geckoSettings.data_collection_permissions.required.length > 0, 'Firefox data_collection_permissions.required contains valid values');
          }
        }
      }

      // Check permissions (V3 format)
      this.check(Array.isArray(manifest.permissions), 'Firefox permissions array exists');
      this.check(manifest.permissions.includes('activeTab'), 'Firefox activeTab permission granted');
      this.check(manifest.permissions.includes('storage'), 'Firefox storage permission granted');
      this.check(!manifest.permissions.includes('management'), 'Firefox management permission not present (not needed)');

      // Check action (V3) - Firefox V3 uses 'action' not 'browser_action'
      this.check(manifest.action && manifest.action.default_title, 'Firefox action configured');

      // Check background scripts (V3 Firefox format - uses 'scripts' array instead of 'service_worker')
      this.check(manifest.background && Array.isArray(manifest.background.scripts), 'Firefox background scripts array exists');
      this.check(!manifest.background?.service_worker, 'Firefox does not use service_worker (uses scripts array)');

      // Check content scripts
      this.check(Array.isArray(manifest.content_scripts), 'Firefox content scripts array exists');
      this.check(manifest.content_scripts.length > 0, 'Firefox has at least one content script defined');

      return manifest;

    } catch (error) {
      this.check(false, `Failed to read/parse Firefox manifest.json: ${error.message}`);
      return null;
    }
  }

  validateFirefoxFiles() {
    console.log(`\n${colors.blue}🦊 Validating Firefox build structure${colors.reset}`);
    
    const buildPath = path.join(__dirname, '..', 'build-firefox');
    
    if (!fs.existsSync(buildPath)) {
      this.check(false, 'Firefox build directory exists (run npm run build first)');
      return;
    }
    
    // Required files
    const requiredFiles = [
      'manifest.json',
      'background.js',
      'content.js',
      'content.css',
      'settings-page/settings.html',
      'settings-page/settings.js',
      'data/conversion-data.js',
      'data/currency-mappings.js',
      'utils/conversion-detector.js',
      'utils/currency-converter.js',
      'utils/popup-manager.js',
      'utils/settings-manager.js',
      'utils/unit-converter.js'
    ];

    requiredFiles.forEach(file => {
      const exists = fs.existsSync(path.join(buildPath, file));
      this.check(exists, `Firefox build file exists: ${file}`);
    });
  }

  validateFirefoxAPIReplacements() {
    console.log(`\n${colors.blue}🦊 Validating Firefox API compatibility${colors.reset}`);
    
    const backgroundPath = path.join(__dirname, '..', 'build-firefox', 'background.js');
    
    if (!fs.existsSync(backgroundPath)) {
      this.check(false, 'Firefox background.js exists for API validation');
      return;
    }
    
    try {
      const content = fs.readFileSync(backgroundPath, 'utf8');
      
      // Check for Firefox Manifest V3 compatibility shim
      this.check(content.includes('Firefox Manifest V3 compatibility'), 'Firefox Manifest V3 compatibility shim is present');
      
      // Firefox V3 supports chrome.* APIs natively, so we check the shim provides fallback
      const hasCompatibilityShim = content.includes('globalThis.chrome = browser') || content.includes('window.chrome = browser');
      this.check(hasCompatibilityShim, 'Firefox compatibility shim provides chrome API fallback');
      
      // In Manifest V3, Firefox can use chrome.action (it's cross-compatible)
      // We just need to ensure the compatibility shim is present for browser.* fallback
      this.check(content.includes('chrome.action') || content.includes('browser.action'), 'Firefox uses action API (V3 compatible)');
      
    } catch (error) {
      this.check(false, `Failed to validate Firefox API compatibility: ${error.message}`);
    }
  }

  validate() {
    console.log(`${colors.bright}${colors.yellow}🔍 Chrome Extension Validation${colors.reset}\n`);

    this.validateManifest();
    this.validateFiles();
    this.validateSyntax();
    this.validateContentScriptOrder();

    return this.generateReport();
  }

  validateWithFirefox() {
    console.log(`${colors.bright}${colors.yellow}🔍 Chrome & Firefox Extension Validation${colors.reset}\n`);

    // Chrome validation
    this.validateManifest();
    this.validateFiles();
    this.validateSyntax();
    this.validateContentScriptOrder();

    // Firefox validation (only if build exists)
    const firefoxBuildPath = path.join(__dirname, '..', 'build-firefox');
    if (fs.existsSync(firefoxBuildPath)) {
      this.validateFirefoxManifest();
      this.validateFirefoxFiles();
      this.validateFirefoxAPIReplacements();
    } else {
      console.log(`\n${colors.yellow}⚠️  Firefox build not found - skipping Firefox validation${colors.reset}`);
      console.log(`${colors.yellow}💡 Run 'npm run build' to create Firefox build${colors.reset}`);
    }

    return this.generateReport();
  }
}

// Run validation if this file is executed directly
if (require.main === module) {
  const validator = new ExtensionValidator();
  // Use Firefox validation to check both Chrome and Firefox builds
  const isValid = validator.validateWithFirefox();
  process.exit(isValid ? 0 : 1);
}

module.exports = ExtensionValidator;
