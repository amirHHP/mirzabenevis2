#!/usr/bin/env node

/**
 * MirzaBenevis — Pro License Generator & Verifier CLI
 *
 * Usage:
 *   node scripts/generate-license.js                  # Generate 5 sample keys
 *   node scripts/generate-license.js --count=10       # Generate 10 keys
 *   node scripts/generate-license.js --verify=MBPRO-... # Verify an existing key
 *   node scripts/generate-license.js --seed="user@email.com" # Deterministic key for email
 */

import { LicenseManager, MASTER_KEYS, DEFAULT_PURCHASE_URL } from '../modules/LicenseManager.js';

const manager = new LicenseManager();

async function main() {
    const args = process.argv.slice(2);
    let count = 5;
    let verifyKey = null;
    let seed = null;

    for (const arg of args) {
        if (arg.startsWith('--count=')) {
            count = parseInt(arg.split('=')[1], 10) || 5;
        } else if (arg.startsWith('--verify=')) {
            verifyKey = arg.split('=')[1];
        } else if (arg.startsWith('--seed=')) {
            seed = arg.split('=')[1];
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
MirzaBenevis Pro License Generator & Verifier
---------------------------------------------
Usage:
  node scripts/generate-license.js                Generate 5 random license keys
  node scripts/generate-license.js --count=20     Generate 20 random license keys
  node scripts/generate-license.js --seed=user1   Generate deterministic key from seed
  node scripts/generate-license.js --verify=KEY   Verify validity of a license key
`);
            process.exit(0);
        }
    }

    if (verifyKey) {
        console.log(`\nVerifying key: "${verifyKey}"`);
        const result = await manager.verifyKey(verifyKey);
        if (result.valid) {
            console.log(`✅ Status: VALID`);
            console.log(`   Normalized: ${result.normalized}`);
            console.log(`   Type: ${result.isMaster ? 'Master Promo Key' : 'Standard Cryptographic Key'}`);
            console.log(`   Masked: ${manager.maskKey(result.normalized)}`);
        } else {
            console.log(`❌ Status: INVALID`);
            console.log(`   Normalized: ${result.normalized || '(empty)'}`);
        }
        console.log('');
        process.exit(result.valid ? 0 : 1);
    }

    console.log('========================================================');
    console.log('   MirzaBenevis — Pro License Key Generator');
    console.log('========================================================\n');
    console.log(`Purchase URL: ${DEFAULT_PURCHASE_URL}`);
    console.log(`Master / Demo Keys (always valid):`);
    for (const mk of MASTER_KEYS) {
        console.log(`  ⭐ ${mk}`);
    }
    console.log('\nGenerated Cryptographic License Keys:');

    if (seed) {
        const key = await manager.generateKey(seed);
        console.log(`  🔑 ${key}  (Seed: "${seed}")`);
    } else {
        for (let i = 1; i <= count; i++) {
            const key = await manager.generateKey();
            const check = await manager.verifyKey(key);
            console.log(`  [${String(i).padStart(2, ' ')}] ${key}  ${check.valid ? '✓' : '✗'}`);
        }
    }

    console.log('\nKeys can be entered in either popup (options.html) or');
    console.log('the meeting logs page (meetings.html) to unlock full backup.\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
