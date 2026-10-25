import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LicenseManager } from '../modules/LicenseManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Console Errors, CSP, and License Broadcast Safety', () => {
  it('manifest.json permits unsafe-inline in style-src for extension_pages', () => {
    const manifestPath = path.join(rootDir, 'manifest.json');
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    const csp = manifest.content_security_policy?.extension_pages || '';
    assert.match(
      csp,
      /style-src[^;]*'unsafe-inline'/,
      'extension_pages CSP must include \'unsafe-inline\' in style-src'
    );
  });

  it('meetings.html contains zero inline style attributes', () => {
    const htmlPath = path.join(rootDir, 'meetings.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    // Match style="..." attributes (case-insensitive)
    const styleMatches = content.match(/\sstyle\s*=\s*["'][^"']*["']/gi);
    assert.equal(
      styleMatches,
      null,
      `Found inline style attributes in meetings.html: ${JSON.stringify(styleMatches)}`
    );
  });

  it('options.html contains zero inline style attributes', () => {
    const htmlPath = path.join(rootDir, 'options.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    const styleMatches = content.match(/\sstyle\s*=\s*["'][^"']*["']/gi);
    assert.equal(
      styleMatches,
      null,
      `Found inline style attributes in options.html: ${JSON.stringify(styleMatches)}`
    );
  });

  it('LicenseManager.activate safely broadcasts license.updated without uncaught rejection when no listeners exist', async () => {
    let messageSent = null;
    let callbackCheckedLastError = false;

    // Simulate Chrome MV3 where sendMessage takes a callback or returns a Promise,
    // and when no listener exists, chrome.runtime.lastError is populated
    global.chrome = {
      storage: {
        sync: {
          set: (data, cb) => cb && cb(),
        },
        local: {
          set: (data, cb) => cb && cb(),
        },
      },
      runtime: {
        get lastError() {
          callbackCheckedLastError = true;
          return { message: 'Could not establish connection. Receiving end does not exist.' };
        },
        sendMessage: (msg, cb) => {
          messageSent = msg;
          if (typeof cb === 'function') {
            cb();
          }
          // Return a rejected promise if called without callback or for promise-based polyfills
          return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
        },
      },
    };

    const manager = new LicenseManager();
    const key = await manager.generateKey('license-broadcast-test');
    const res = await manager.activate(key);

    assert.equal(res.success, true);
    assert.deepEqual(messageSent, {
      type: 'license.updated',
      isPro: true,
      licenseKey: key,
    });
    assert.equal(callbackCheckedLastError, true, 'safeBroadcast must inspect lastError to suppress Chrome errors');
  });

  it('LicenseManager.deactivate safely broadcasts license.updated without uncaught rejection when no listeners exist', async () => {
    let messageSent = null;
    let callbackCheckedLastError = false;

    global.chrome = {
      storage: {
        sync: {
          set: (data, cb) => cb && cb(),
        },
        local: {
          set: (data, cb) => cb && cb(),
        },
      },
      runtime: {
        get lastError() {
          callbackCheckedLastError = true;
          return { message: 'Could not establish connection. Receiving end does not exist.' };
        },
        sendMessage: (msg, cb) => {
          messageSent = msg;
          if (typeof cb === 'function') {
            cb();
          }
          return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
        },
      },
    };

    const manager = new LicenseManager();
    const res = await manager.deactivate();

    assert.equal(res.success, true);
    assert.deepEqual(messageSent, {
      type: 'license.updated',
      isPro: false,
    });
    assert.equal(callbackCheckedLastError, true, 'safeBroadcast must inspect lastError to suppress Chrome errors');
  });
});
