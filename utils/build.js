#!/usr/bin/env node
// Chrome Extension Build Script
// This script packages the extension for distribution

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

class ExtensionBuilder {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.buildDir = path.join(this.rootDir, 'build');
    this.firefoxBuildDir = path.join(this.rootDir, 'build-firefox');
    this.version = this.getVersion();
    
    // Files and directories to include in the build
    this.includeFiles = [
      'manifest.json',
      'background.js',
      'content.js',
      'content.css'
    ];
    
    this.includeDirs = [
      'data',
      'utils',
      'settings-page',
      'icons'
    ];
    
    // Files and directories to exclude
    this.excludePatterns = [
      'tests',
      'node_modules',
      '.git',
      '.github',
      'build',
      'run-tests.ps1',
      'package.json',
      'package-lock.json',
      '.gitignore',
      'img' // Usually development assets
    ];
    
    // Files to exclude from specific directories
    this.excludeFromDirs = {
      'utils': ['build.js'], // Don't include the build script itself
      'tests': ['*'] // Exclude all test files
    };
  }
  
  getVersion() {
    try {
      const manifestPath = path.join(this.rootDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return manifest.version || '1.0.0';
    } catch (error) {
      console.warn(`${colors.yellow}⚠️  Could not read version from manifest.json, using 1.0.0${colors.reset}`);
      return '1.0.0';
    }
  }
  
  cleanBuildDir() {
    console.log(`${colors.blue}🧹 Cleaning build directories...${colors.reset}`);
    
    // Clean Chrome build
    if (fs.existsSync(this.buildDir)) {
      fs.rmSync(this.buildDir, { recursive: true, force: true });
    }
    fs.mkdirSync(this.buildDir, { recursive: true });
    
    // Clean Firefox build
    if (fs.existsSync(this.firefoxBuildDir)) {
      fs.rmSync(this.firefoxBuildDir, { recursive: true, force: true });
    }
    fs.mkdirSync(this.firefoxBuildDir, { recursive: true });
    
    console.log(`${colors.green}✅ Build directories cleaned${colors.reset}`);
  }
  
  copyFile(src, dest) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
  
  copyDirectory(src, dest, excludeFiles = []) {
    if (!fs.existsSync(src)) {
      console.warn(`${colors.yellow}⚠️  Source directory does not exist: ${src}${colors.reset}`);
      return;
    }
    
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    
    for (const item of items) {
      // Skip excluded files
      if (excludeFiles.includes(item) || excludeFiles.includes('*')) {
        continue;
      }
      
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);
      
      if (stat.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        this.copyFile(srcPath, destPath);
      }
    }
  }
  
  copyExtensionFiles() {
    console.log(`${colors.blue}📁 Copying extension files...${colors.reset}`);
    
    // Copy individual files
    for (const file of this.includeFiles) {
      const srcPath = path.join(this.rootDir, file);
      const destPath = path.join(this.buildDir, file);
      
      if (fs.existsSync(srcPath)) {
        this.copyFile(srcPath, destPath);
        console.log(`${colors.green}  ✅ ${file}${colors.reset}`);
      } else {
        console.warn(`${colors.yellow}  ⚠️  File not found: ${file}${colors.reset}`);
      }
    }
    
    // Copy directories
    for (const dir of this.includeDirs) {
      const srcPath = path.join(this.rootDir, dir);
      const destPath = path.join(this.buildDir, dir);
      const excludeFiles = this.excludeFromDirs[dir] || [];
      
      if (fs.existsSync(srcPath)) {
        this.copyDirectory(srcPath, destPath, excludeFiles);
        console.log(`${colors.green}  ✅ ${dir}/${colors.reset}`);
      } else {
        console.warn(`${colors.yellow}  ⚠️  Directory not found: ${dir}${colors.reset}`);
      }
    }
  }
  
  validateBuild() {
    console.log(`${colors.blue}🔍 Validating build...${colors.reset}`);
    
    const requiredFiles = [
      'manifest.json',
      'background.js',
      'content.js',
      'content.css',
      'data/conversion-data.js',
      'data/currency-mappings.js',
      'utils/conversion-detector.js',
      'utils/currency-converter.js',
      'utils/popup-manager.js',
      'utils/settings-manager.js',
      'utils/unit-converter.js',
      'settings-page/settings.html',
      'settings-page/settings.js',
      'settings-page/settings.css'
    ];
    
    let isValid = true;
    
    for (const file of requiredFiles) {
      const filePath = path.join(this.buildDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`${colors.green}  ✅ ${file}${colors.reset}`);
      } else {
        console.log(`${colors.red}  ❌ Missing: ${file}${colors.reset}`);
        isValid = false;
      }
    }
    
    // Validate manifest.json
    try {
      const manifestPath = path.join(this.buildDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      if (manifest.manifest_version === 3) {
        console.log(`${colors.green}  ✅ Manifest v3 format${colors.reset}`);
      } else {
        console.log(`${colors.red}  ❌ Invalid manifest version${colors.reset}`);
        isValid = false;
      }
      
    } catch (error) {
      console.log(`${colors.red}  ❌ Invalid manifest.json${colors.reset}`);
      isValid = false;
    }
    
    return isValid;
  }
  
  getBuildStats() {
    const stats = {
      files: 0,
      directories: 0,
      totalSize: 0
    };
    
    const calculateStats = (dir) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          stats.directories++;
          calculateStats(itemPath);
        } else {
          stats.files++;
          stats.totalSize += stat.size;
        }
      }
    };
    
    calculateStats(this.buildDir);
    return stats;
  }
  
  createZipArchive() {
    console.log(`${colors.blue}📦 Creating ZIP archive...${colors.reset}`);
    
    const zipName = `universal-converter-v${this.version}.zip`;
    const zipPath = path.join(this.rootDir, zipName);
    
    return new Promise((resolve, reject) => {
      try {
        // Remove existing zip if it exists
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        
        // Create ZIP using archiver
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', {
          zlib: { level: 9 } // Maximum compression
        });
        
        output.on('close', () => {
          const zipStats = fs.statSync(zipPath);
          const zipSizeMB = (zipStats.size / (1024 * 1024)).toFixed(2);
          console.log(`${colors.green}  ✅ Created: ${zipName} (${zipSizeMB} MB)${colors.reset}`);
          resolve(zipPath);
        });
        
        archive.on('error', (err) => {
          console.log(`${colors.red}  ❌ Failed to create ZIP: ${err.message}${colors.reset}`);
          reject(err);
        });
        
        archive.pipe(output);
        
        // Add the entire build directory to the ZIP
        archive.directory(this.buildDir, false);
        
        archive.finalize();
        
      } catch (error) {
        console.log(`${colors.red}  ❌ Failed to create ZIP: ${error.message}${colors.reset}`);
        reject(error);
      }
    });
  }
  
  createFirefoxManifest() {
    console.log(`${colors.blue}🦊 Creating Firefox manifest...${colors.reset}`);
    
    try {
      const chromeManifestPath = path.join(this.rootDir, 'manifest.json');
      const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));
      
      // Create Firefox-compatible Manifest V3
      const firefoxManifest = {
        manifest_version: 3,
        name: chromeManifest.name,
        version: chromeManifest.version,
        description: chromeManifest.description,
        
        // Firefox-specific fields (REQUIRED for Manifest V3)
        browser_specific_settings: {
          gecko: {
            id: "universal-converter@extension.com",
            strict_min_version: "140.0",
            data_collection_permissions: {
              required: ["none"]
            }
          }
        },
        
        // Permissions
        permissions: chromeManifest.permissions || [
          "activeTab",
          "storage",
          "contextMenus",
          "management"
        ],
        
        // Firefox uses 'scripts' array instead of 'service_worker'
        background: {
          scripts: ["background.js"]
        },
        
        // Content scripts
        content_scripts: chromeManifest.content_scripts,
        
        // action (V3)
        action: chromeManifest.action || {
          default_title: "Universal Converter"
        },
        
        // Icons
        icons: chromeManifest.icons,
        
        // Options page (if present)
        options_ui: chromeManifest.options_ui,
        
        // Web accessible resources (V3 format)
        web_accessible_resources: chromeManifest.web_accessible_resources || []
      };
      
      // Remove undefined fields
      Object.keys(firefoxManifest).forEach(key => {
        if (firefoxManifest[key] === undefined) {
          delete firefoxManifest[key];
        }
      });
      
      const firefoxManifestPath = path.join(this.firefoxBuildDir, 'manifest.json');
      fs.writeFileSync(firefoxManifestPath, JSON.stringify(firefoxManifest, null, 2));
      
      console.log(`${colors.green}  ✅ Firefox Manifest V3 created with gecko ID and data_collection_permissions${colors.reset}`);
      return true;
      
    } catch (error) {
      console.log(`${colors.red}  ❌ Failed to create Firefox manifest: ${error.message}${colors.reset}`);
      return false;
    }
  }

  adaptBackgroundScriptForFirefox() {
    console.log(`${colors.blue}🔄 Adapting background script for Firefox...${colors.reset}`);
    
    try {
      const chromeBackgroundPath = path.join(this.buildDir, 'background.js');
      const firefoxBackgroundPath = path.join(this.firefoxBuildDir, 'background.js');
      
      let backgroundContent = fs.readFileSync(chromeBackgroundPath, 'utf8');
      
      // Firefox Manifest V3 compatibility
      // Firefox V3 supports chrome.* APIs, but we add a compatibility layer for browser.* as well
      backgroundContent = backgroundContent
        // Add compatibility shim at the top
        .replace(/^/, `// Firefox Manifest V3 compatibility shim
// Firefox supports both chrome.* and browser.* APIs
if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
  globalThis.chrome = browser;
}

`);
      
      fs.writeFileSync(firefoxBackgroundPath, backgroundContent);
      console.log(`${colors.green}  ✅ Background script adapted for Firefox Manifest V3${colors.reset}`);
      return true;
      
    } catch (error) {
      console.log(`${colors.red}  ❌ Failed to adapt background script: ${error.message}${colors.reset}`);
      return false;
    }
  }

  copyExtensionFilesForFirefox() {
    console.log(`${colors.blue}📁 Copying extension files for Firefox...${colors.reset}`);
    
    // First copy all Chrome files to Firefox build
    for (const file of this.includeFiles) {
      if (file === 'manifest.json') continue; // Skip, we'll create a custom one
      
      const srcPath = path.join(this.buildDir, file);
      const destPath = path.join(this.firefoxBuildDir, file);
      
      if (fs.existsSync(srcPath)) {
        this.copyFile(srcPath, destPath);
        console.log(`${colors.green}  ✅ ${file}${colors.reset}`);
      }
    }
    
    // Copy directories
    for (const dir of this.includeDirs) {
      const srcPath = path.join(this.buildDir, dir);
      const destPath = path.join(this.firefoxBuildDir, dir);
      
      if (fs.existsSync(srcPath)) {
        this.copyDirectory(srcPath, destPath);
        console.log(`${colors.green}  ✅ ${dir}/${colors.reset}`);
      }
    }
  }

  validateFirefoxBuild() {
    console.log(`${colors.blue}🔍 Validating Firefox build...${colors.reset}`);
    
    const requiredFiles = [
      'manifest.json',
      'background.js',
      'content.js',
      'content.css',
      'data/conversion-data.js',
      'data/currency-mappings.js',
      'utils/conversion-detector.js',
      'utils/currency-converter.js',
      'utils/popup-manager.js',
      'utils/settings-manager.js',
      'utils/unit-converter.js',
      'settings-page/settings.html',
      'settings-page/settings.js',
      'settings-page/settings.css'
    ];
    
    let isValid = true;
    
    for (const file of requiredFiles) {
      const filePath = path.join(this.firefoxBuildDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`${colors.green}  ✅ ${file}${colors.reset}`);
      } else {
        console.log(`${colors.red}  ❌ Missing: ${file}${colors.reset}`);
        isValid = false;
      }
    }
    
    // Validate Firefox manifest.json
    try {
      const manifestPath = path.join(this.firefoxBuildDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      if (manifest.manifest_version === 3) {
        console.log(`${colors.green}  ✅ Manifest v3 format (Firefox)${colors.reset}`);
      } else {
        console.log(`${colors.red}  ❌ Invalid manifest version for Firefox${colors.reset}`);
        isValid = false;
      }
      
      if (manifest.browser_specific_settings?.gecko?.id) {
        console.log(`${colors.green}  ✅ Firefox gecko application ID: ${manifest.browser_specific_settings.gecko.id}${colors.reset}`);
      } else if (manifest.applications?.gecko?.id) {
        console.log(`${colors.green}  ✅ Firefox gecko application ID (deprecated field): ${manifest.applications.gecko.id}${colors.reset}`);
      } else {
        console.log(`${colors.red}  ❌ Missing Firefox gecko application ID${colors.reset}`);
        isValid = false;
      }
      
      if (manifest.browser_specific_settings?.gecko?.data_collection_permissions !== undefined) {
        console.log(`${colors.green}  ✅ data_collection_permissions: ${manifest.browser_specific_settings.gecko.data_collection_permissions}${colors.reset}`);
      } else {
        console.log(`${colors.yellow}  ⚠️  Missing data_collection_permissions (will be required in future)${colors.reset}`);
      }
      
      if (manifest.background?.scripts) {
        console.log(`${colors.green}  ✅ Using background.scripts (Firefox-compatible)${colors.reset}`);
      } else if (manifest.background?.service_worker) {
        console.log(`${colors.red}  ❌ Using service_worker (not supported in Firefox)${colors.reset}`);
        isValid = false;
      }
      
    } catch (error) {
      console.log(`${colors.red}  ❌ Invalid Firefox manifest.json${colors.reset}`);
      isValid = false;
    }
    
    return isValid;
  }

  createFirefoxZipArchive() {
    console.log(`${colors.blue}📦 Creating Firefox ZIP archive...${colors.reset}`);
    
    const zipName = `universal-converter-firefox-v${this.version}.zip`;
    const zipPath = path.join(this.rootDir, zipName);
    
    return new Promise((resolve, reject) => {
      try {
        // Remove existing zip if it exists
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        
        // Create ZIP using archiver
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', {
          zlib: { level: 9 } // Maximum compression
        });
        
        output.on('close', () => {
          const zipStats = fs.statSync(zipPath);
          const zipSizeMB = (zipStats.size / (1024 * 1024)).toFixed(2);
          console.log(`${colors.green}  ✅ Created: ${zipName} (${zipSizeMB} MB)${colors.reset}`);
          resolve(zipPath);
        });
        
        archive.on('error', (err) => {
          console.log(`${colors.red}  ❌ Failed to create Firefox ZIP: ${err.message}${colors.reset}`);
          reject(err);
        });
        
        archive.pipe(output);
        
        // Add the entire Firefox build directory to the ZIP
        archive.directory(this.firefoxBuildDir, false);
        
        archive.finalize();
        
      } catch (error) {
        console.log(`${colors.red}  ❌ Failed to create Firefox ZIP: ${error.message}${colors.reset}`);
        reject(error);
      }
    });
  }

  createFirefoxXpiArchive() {
    console.log(`${colors.blue}📦 Creating Firefox XPI package...${colors.reset}`);
    
    const xpiName = `universal-converter-firefox-v${this.version}.xpi`;
    const xpiPath = path.join(this.rootDir, xpiName);
    
    return new Promise((resolve, reject) => {
      try {
        // Remove existing xpi if it exists
        if (fs.existsSync(xpiPath)) {
          fs.unlinkSync(xpiPath);
        }
        
        // Create XPI using archiver (XPI is just a ZIP with .xpi extension)
        const output = fs.createWriteStream(xpiPath);
        const archive = archiver('zip', {
          zlib: { level: 9 } // Maximum compression
        });
        
        output.on('close', () => {
          const xpiStats = fs.statSync(xpiPath);
          const xpiSizeMB = (xpiStats.size / (1024 * 1024)).toFixed(2);
          console.log(`${colors.green}  ✅ Created: ${xpiName} (${xpiSizeMB} MB)${colors.reset}`);
          resolve(xpiPath);
        });
        
        archive.on('error', (err) => {
          console.log(`${colors.red}  ❌ Failed to create Firefox XPI: ${err.message}${colors.reset}`);
          reject(err);
        });
        
        archive.pipe(output);
        
        // Add the entire Firefox build directory to the XPI
        archive.directory(this.firefoxBuildDir, false);
        
        archive.finalize();
        
      } catch (error) {
        console.log(`${colors.red}  ❌ Failed to create Firefox XPI: ${error.message}${colors.reset}`);
        reject(error);
      }
    });
  }

  adaptCurrencyConverterForFirefox() {
    console.log(`${colors.blue}💱 Adapting currency converter for Firefox...${colors.reset}`);
    
    try {
      const currencyConverterPath = path.join(this.firefoxBuildDir, 'utils', 'currency-converter.js');
      
      if (!fs.existsSync(currencyConverterPath)) {
        console.log(`${colors.yellow}  ⚠️  Currency converter not found, skipping adaptation${colors.reset}`);
        return true;
      }
      
      let currencyContent = fs.readFileSync(currencyConverterPath, 'utf8');
      
      // Add Firefox compatibility shim at the beginning
      const firefoxCompatibilityCode = `// Firefox Manifest V3 compatibility
if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
  globalThis.chrome = browser;
}

`;
      
      // Add the compatibility code at the beginning if not already present
      if (!currencyContent.includes('Firefox Manifest V3 compatibility')) {
        currencyContent = firefoxCompatibilityCode + currencyContent;
      }
      
      fs.writeFileSync(currencyConverterPath, currencyContent);
      console.log(`${colors.green}  ✅ Currency converter adapted for Firefox${colors.reset}`);
      return true;
      
    } catch (error) {
      console.log(`${colors.red}  ❌ Failed to adapt currency converter: ${error.message}${colors.reset}`);
      return false;
    }
  }

  adaptSettingsPageForFirefox() {
    console.log(`${colors.blue}⚙️  Adapting settings page for Firefox...${colors.reset}`);
    
    try {
      const settingsPath = path.join(this.firefoxBuildDir, 'settings-page', 'settings.js');
      
      if (!fs.existsSync(settingsPath)) {
        console.log(`${colors.yellow}  ⚠️  Settings page not found, skipping adaptation${colors.reset}`);
        return true;
      }
      
      let settingsContent = fs.readFileSync(settingsPath, 'utf8');
      
      // Replace Chrome APIs with browser APIs for Firefox
      settingsContent = settingsContent
        .replace(/chrome\.storage/g, 'browser.storage')
        .replace(/chrome\.tabs/g, 'browser.tabs')
        .replace(/chrome\.runtime/g, 'browser.runtime');
      
      // Add Firefox compatibility shim at the top
      const firefoxShim = `// Firefox compatibility shim for settings page
if (typeof browser !== 'undefined' && typeof chrome === 'undefined') {
  window.chrome = browser;
}

`;
      
      settingsContent = firefoxShim + settingsContent;
      
      fs.writeFileSync(settingsPath, settingsContent);
      console.log(`${colors.green}  ✅ Settings page adapted for Firefox${colors.reset}`);
      return true;
      
    } catch (error) {
      console.log(`${colors.red}  ❌ Failed to adapt settings page: ${error.message}${colors.reset}`);
      return false;
    }
  }

  async build() {
    console.log(`${colors.bright}${colors.cyan}🚀 Building Universal Converter Extension v${this.version}${colors.reset}`);
    console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    try {
      // Step 0: Run tests first
      console.log(`${colors.blue}🧪 Running tests before build...${colors.reset}`);
      const testsPath = path.join(this.rootDir, 'tests', 'run-all-tests.js');
      
      if (!fs.existsSync(testsPath)) {
        console.log(`${colors.yellow}⚠️  Tests not found at ${testsPath}, skipping tests${colors.reset}`);
      } else {
        try {
          // Run the tests and capture output
          execSync(`node "${testsPath}"`, {
            cwd: this.rootDir,
            stdio: 'inherit', // Show test output in real-time
            encoding: 'utf8'
          });
          console.log(`${colors.green}✅ All tests passed!${colors.reset}`);
          console.log('');
        } catch (error) {
          console.log(`${colors.red}❌ Tests failed! Build aborted.${colors.reset}`);
          console.log(`${colors.yellow}💡 Fix the failing tests before building the extension.${colors.reset}`);
          process.exit(1);
        }
      }
      
      // Step 1: Clean build directory
      this.cleanBuildDir();
      
      // Step 2: Copy extension files
      this.copyExtensionFiles();
      
      // Step 3: Validate build
      const isValid = this.validateBuild();
      
      if (!isValid) {
        throw new Error('Build validation failed');
      }
      
      // Step 4: Get build statistics
      const stats = this.getBuildStats();
      const sizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
      
      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.bright}${colors.green}✅ Build completed successfully!${colors.reset}`);
      console.log(`${colors.green}   📊 Files: ${stats.files}, Directories: ${stats.directories}${colors.reset}`);
      console.log(`${colors.green}   💾 Total size: ${sizeMB} MB${colors.reset}`);
      console.log(`${colors.green}   📁 Build location: ${this.buildDir}${colors.reset}`);
      
      // Step 5: Create ZIP archive
      const zipPath = await this.createZipArchive();
      
      if (zipPath) {
        console.log(`${colors.green}   📦 Chrome ZIP: ${path.basename(zipPath)}${colors.reset}`);
      }
      
      // Firefox build steps
      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.bright}${colors.cyan}🦊 Building Firefox version (Manifest V3)...${colors.reset}`);
      
      // Copy files to Firefox build
      this.copyExtensionFilesForFirefox();
      
      // Create Firefox-specific manifest
      const isFirefoxManifestCreated = this.createFirefoxManifest();
      
      // Adapt background script for Firefox
      const isBackgroundScriptAdapted = this.adaptBackgroundScriptForFirefox();
      
      // Adapt currency converter for Firefox
      const isCurrencyConverterAdapted = this.adaptCurrencyConverterForFirefox();
      
      // Adapt settings page for Firefox
      const isSettingsPageAdapted = this.adaptSettingsPageForFirefox();
      
      if (!isFirefoxManifestCreated || !isBackgroundScriptAdapted || !isCurrencyConverterAdapted || !isSettingsPageAdapted) {
        throw new Error('Firefox build preparation failed');
      }
      
      // Validate Firefox build
      const isFirefoxBuildValid = this.validateFirefoxBuild();
      
      if (!isFirefoxBuildValid) {
        throw new Error('Firefox build validation failed');
      }
      
      // Create Firefox ZIP archive
      const firefoxZipPath = await this.createFirefoxZipArchive();
      
      if (firefoxZipPath) {
        console.log(`${colors.green}   📦 Firefox ZIP: ${path.basename(firefoxZipPath)}${colors.reset}`);
      }
      
      // Create Firefox XPI package
      const firefoxXpiPath = await this.createFirefoxXpiArchive();
      
      if (firefoxXpiPath) {
        console.log(`${colors.green}   📦 Firefox XPI: ${path.basename(firefoxXpiPath)}${colors.reset}`);
      }
      
      // Final summary
      console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.bright}${colors.green}🎉 Both extensions ready for distribution!${colors.reset}`);
      console.log(`${colors.green}   � Chrome build: build/${colors.reset}`);
      console.log(`${colors.green}   📁 Firefox build: build-firefox/${colors.reset}`);
      console.log(`${colors.cyan}   💡 Chrome: Load 'build' folder as unpacked extension${colors.reset}`);
      console.log(`${colors.cyan}   💡 Firefox: Load 'build-firefox' folder in about:debugging${colors.reset}`);
      
    } catch (error) {
      console.log(`${colors.red}❌ Build failed: ${error.message}${colors.reset}`);
      process.exit(1);
    }
  }
}

// Run the build when script is executed directly
if (require.main === module) {
  const builder = new ExtensionBuilder();
  builder.build().catch(error => {
    console.log(`${colors.red}❌ Build failed: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = ExtensionBuilder;