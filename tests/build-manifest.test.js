const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ExtensionBuilder = require('../utils/build.js');

function testFirefoxManifestHostPermissions() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-firefox-manifest-'));
  try {
    const builder = new ExtensionBuilder();
    builder.firefoxBuildDir = tempDir;
    assert.equal(builder.createFirefoxManifest(), true);

    const chromeManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const firefoxManifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'manifest.json'), 'utf8'));
    assert.deepEqual(firefoxManifest.host_permissions, chromeManifest.host_permissions);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function testScheduledRefreshPermission() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.ok(manifest.permissions.includes('alarms'), 'manifest.json must declare the alarms permission');
}

function testBundledFontsAreAccessible() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const resources = (manifest.web_accessible_resources || []).flatMap(entry => entry.resources || []);
  assert.ok(resources.includes('fonts/*.woff2'), 'fonts must be web-accessible for content-script CSS');
  for (const weight of [400, 500, 600, 700]) {
    for (const suffix of ['', '-ext']) {
      assert.ok(
        fs.existsSync(path.join(ROOT, 'fonts', `poppins-${weight}${suffix}.woff2`)),
        `missing Poppins ${weight}${suffix} font`
      );
    }
  }
}

testFirefoxManifestHostPermissions();
testScheduledRefreshPermission();
testBundledFontsAreAccessible();
console.log('Build manifest tests passed (Firefox permissions, alarms, bundled fonts).');
