// ============================================================
// LicenseManager — Manages MirzaBenevis Pro Account & Licenses
// ============================================================

export const DEFAULT_PURCHASE_URL = 'https://mirzabenevis.com/pro';
export const SECRET_SALT = 'MIRZABENEVIS_PRO_SECRET_SALT_2025';

const STORAGE_KEYS = {
    IS_PRO: 'mirzabenevis_is_pro',
    LICENSE_KEY: 'mirzabenevis_pro_license',
    ACTIVATED_AT: 'mirzabenevis_pro_activated_at',
    PURCHASE_URL: 'mirzabenevis_pro_purchase_url'
};

function safeBroadcast(message) {
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            const res = chrome.runtime.sendMessage(message, () => {
                void chrome.runtime?.lastError;
            });
            if (res && typeof res.catch === 'function') {
                res.catch(() => {});
            }
        }
    } catch (_) {}
}

/**
 * Calculates SHA-256 hex string using Web Crypto API or Node crypto
 */
async function sha256Hex(str) {
    const enc = new TextEncoder();
    let subtle = globalThis.crypto?.subtle || 
                 (typeof window !== 'undefined' ? window.crypto?.subtle : 
                 (typeof self !== 'undefined' ? self.crypto?.subtle : null));

    if (!subtle && typeof process !== 'undefined') {
        try {
            const nodeCrypto = await import('crypto');
            return nodeCrypto.createHash('sha256').update(str).digest('hex').toUpperCase();
        } catch (_) {}
    }

    if (!subtle) {
        throw new Error('Web Crypto API is not available in this environment');
    }

    const buffer = await subtle.digest('SHA-256', enc.encode(str));
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

export class LicenseManager {
    constructor() {
        this.salt = SECRET_SALT;
        this.purchaseUrl = DEFAULT_PURCHASE_URL;
    }

    /**
     * Normalizes a user-input license key into standard MBPRO-XXXX-XXXX-XXXX-XXXX format
     */
    normalizeKey(rawKey) {
        if (!rawKey || typeof rawKey !== 'string') return '';
        const trimmed = rawKey.trim().toUpperCase();

        // Clean all non-alphanumeric chars
        const clean = trimmed.replace(/[^0-9A-Z]/g, '');

        // Standard key: MBPRO (5 chars) + 16 chars payload & checksum = 21 chars
        if (clean.startsWith('MBPRO') && clean.length === 21) {
            const p1 = clean.slice(5, 9);
            const p2 = clean.slice(9, 13);
            const c1 = clean.slice(13, 17);
            const c2 = clean.slice(17, 21);
            return `MBPRO-${p1}-${p2}-${c1}-${c2}`;
        }

        return trimmed.replace(/[\s_]/g, '-');
    }

    /**
     * Verifies if a given key is cryptographically valid
     */
    async verifyKey(rawKey) {
        const normalized = this.normalizeKey(rawKey);
        if (!normalized) return { valid: false, normalized: '' };

        // Match standard format: MBPRO-XXXX-XXXX-XXXX-XXXX
        const match = normalized.match(/^MBPRO-([0-9A-Z]{4})-([0-9A-Z]{4})-([0-9A-Z]{4})-([0-9A-Z]{4})$/);
        if (!match) {
            return { valid: false, normalized };
        }

        const payload = `${match[1]}-${match[2]}`;
        const providedChecksum = `${match[3]}-${match[4]}`;

        try {
            const hash = await sha256Hex(`MBPRO:${payload}:${this.salt}`);
            const expectedChecksum = `${hash.slice(0, 4)}-${hash.slice(4, 8)}`;
            const valid = providedChecksum === expectedChecksum;
            return { valid, normalized };
        } catch (error) {
            console.error('Error verifying key:', error);
            return { valid: false, normalized };
        }
    }

    /**
     * Generates a cryptographically valid license key
     * @param {string} [seed] Optional seed for payload
     */
    async generateKey(seed) {
        let hex = '';
        if (seed && typeof seed === 'string') {
            const seedHash = await sha256Hex(seed);
            hex = seedHash.slice(0, 8);
        } else {
            const randomBytes = new Uint8Array(8);
            if (globalThis.crypto?.getRandomValues) {
                globalThis.crypto.getRandomValues(randomBytes);
                hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8).toUpperCase();
            } else {
                hex = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 8).toUpperCase();
            }
        }

        const p1 = hex.slice(0, 4).padEnd(4, 'X').toUpperCase();
        const p2 = hex.slice(4, 8).padEnd(4, 'Y').toUpperCase();
        const payload = `${p1}-${p2}`;

        const hash = await sha256Hex(`MBPRO:${payload}:${this.salt}`);
        const c1 = hash.slice(0, 4);
        const c2 = hash.slice(4, 8);

        return `MBPRO-${payload}-${c1}-${c2}`;
    }

    /**
     * Masks a license key for display (e.g. MBPRO-••••-••••-ABCD)
     */
    maskKey(key) {
        if (!key) return '';
        const normalized = this.normalizeKey(key);
        const parts = normalized.split('-');
        if (parts.length === 5) {
            return `${parts[0]}-••••-••••-${parts[4]}`;
        }
        if (normalized.length > 8) {
            return `${normalized.slice(0, 4)}••••${normalized.slice(-4)}`;
        }
        return '••••••••';
    }

    /**
     * Checks if current user has an active Pro license
     * @returns {Promise<boolean>}
     */
    async isPro() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.storage) {
                // Fallback for non-extension environment
                try {
                    const local = localStorage.getItem(STORAGE_KEYS.IS_PRO);
                    const key = localStorage.getItem(STORAGE_KEYS.LICENSE_KEY);
                    if (local === 'true' && key) {
                        this.verifyKey(key).then(res => resolve(res.valid));
                        return;
                    }
                } catch (_) {}
                resolve(false);
                return;
            }

            chrome.storage.sync.get([STORAGE_KEYS.IS_PRO, STORAGE_KEYS.LICENSE_KEY], async (syncResult) => {
                if (syncResult?.[STORAGE_KEYS.IS_PRO] && syncResult?.[STORAGE_KEYS.LICENSE_KEY]) {
                    const check = await this.verifyKey(syncResult[STORAGE_KEYS.LICENSE_KEY]);
                    if (check.valid) {
                        resolve(true);
                        return;
                    }
                }

                // Check local storage fallback
                chrome.storage.local.get([STORAGE_KEYS.IS_PRO, STORAGE_KEYS.LICENSE_KEY], async (localResult) => {
                    if (localResult?.[STORAGE_KEYS.IS_PRO] && localResult?.[STORAGE_KEYS.LICENSE_KEY]) {
                        const check = await this.verifyKey(localResult[STORAGE_KEYS.LICENSE_KEY]);
                        if (check.valid) {
                            resolve(true);
                            return;
                        }
                    }
                    resolve(false);
                });
            });
        });
    }

    /**
     * Gets detailed license info
     */
    async getLicenseInfo() {
        return new Promise((resolve) => {
            const fallbackPurchaseUrl = this.purchaseUrl;

            const readFromStorage = (storageObj, fallback) => {
                const isPro = storageObj[STORAGE_KEYS.IS_PRO] === true;
                const licenseKey = storageObj[STORAGE_KEYS.LICENSE_KEY] || null;
                const activatedAt = storageObj[STORAGE_KEYS.ACTIVATED_AT] || null;
                const purchaseUrl = storageObj[STORAGE_KEYS.PURCHASE_URL] || fallbackPurchaseUrl;

                return {
                    isPro,
                    licenseKey,
                    maskedKey: licenseKey ? this.maskKey(licenseKey) : null,
                    activatedAt,
                    purchaseUrl
                };
            };

            if (typeof chrome === 'undefined' || !chrome.storage) {
                try {
                    const isPro = localStorage.getItem(STORAGE_KEYS.IS_PRO) === 'true';
                    const licenseKey = localStorage.getItem(STORAGE_KEYS.LICENSE_KEY);
                    const activatedAt = localStorage.getItem(STORAGE_KEYS.ACTIVATED_AT);
                    resolve({
                        isPro,
                        licenseKey,
                        maskedKey: licenseKey ? this.maskKey(licenseKey) : null,
                        activatedAt,
                        purchaseUrl: fallbackPurchaseUrl
                    });
                } catch (_) {
                    resolve({
                        isPro: false,
                        licenseKey: null,
                        maskedKey: null,
                        activatedAt: null,
                        purchaseUrl: fallbackPurchaseUrl
                    });
                }
                return;
            }

            chrome.storage.sync.get(
                [STORAGE_KEYS.IS_PRO, STORAGE_KEYS.LICENSE_KEY, STORAGE_KEYS.ACTIVATED_AT, STORAGE_KEYS.PURCHASE_URL],
                async (syncRes) => {
                    if (syncRes?.[STORAGE_KEYS.LICENSE_KEY]) {
                        const check = await this.verifyKey(syncRes[STORAGE_KEYS.LICENSE_KEY]);
                        if (check.valid) {
                            resolve(readFromStorage(syncRes));
                            return;
                        }
                    }

                    chrome.storage.local.get(
                        [STORAGE_KEYS.IS_PRO, STORAGE_KEYS.LICENSE_KEY, STORAGE_KEYS.ACTIVATED_AT, STORAGE_KEYS.PURCHASE_URL],
                        async (localRes) => {
                            if (localRes?.[STORAGE_KEYS.LICENSE_KEY]) {
                                const check = await this.verifyKey(localRes[STORAGE_KEYS.LICENSE_KEY]);
                                if (check.valid) {
                                    resolve(readFromStorage(localRes));
                                    return;
                                }
                            }
                            resolve({
                                isPro: false,
                                licenseKey: null,
                                maskedKey: null,
                                activatedAt: null,
                                purchaseUrl: syncRes?.[STORAGE_KEYS.PURCHASE_URL] || fallbackPurchaseUrl
                            });
                        }
                    );
                }
            );
        });
    }

    /**
     * Activates a license key
     */
    async activate(rawKey) {
        const { valid, normalized } = await this.verifyKey(rawKey);
        if (!valid) {
            return {
                success: false,
                message: 'INVALID_CODE',
                error: 'The entered activation code is invalid.'
            };
        }

        const now = new Date().toISOString();
        const data = {
            [STORAGE_KEYS.IS_PRO]: true,
            [STORAGE_KEYS.LICENSE_KEY]: normalized,
            [STORAGE_KEYS.ACTIVATED_AT]: now
        };

        // Save to chrome storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
            await new Promise((resolve) => {
                chrome.storage.sync.set(data, () => {
                    chrome.storage.local.set(data, resolve);
                });
            });

            // Notify other pages
            safeBroadcast({
                type: 'license.updated',
                isPro: true,
                licenseKey: normalized
            });
        } else {
            try {
                localStorage.setItem(STORAGE_KEYS.IS_PRO, 'true');
                localStorage.setItem(STORAGE_KEYS.LICENSE_KEY, normalized);
                localStorage.setItem(STORAGE_KEYS.ACTIVATED_AT, now);
            } catch (_) {}
        }

        return {
            success: true,
            licenseKey: normalized,
            maskedKey: this.maskKey(normalized),
            activatedAt: now
        };
    }

    /**
     * Deactivates the current license
     */
    async deactivate() {
        const data = {
            [STORAGE_KEYS.IS_PRO]: false,
            [STORAGE_KEYS.LICENSE_KEY]: null,
            [STORAGE_KEYS.ACTIVATED_AT]: null
        };

        if (typeof chrome !== 'undefined' && chrome.storage) {
            await new Promise((resolve) => {
                chrome.storage.sync.set(data, () => {
                    chrome.storage.local.set(data, resolve);
                });
            });

            safeBroadcast({
                type: 'license.updated',
                isPro: false
            });
        } else {
            try {
                localStorage.setItem(STORAGE_KEYS.IS_PRO, 'false');
                localStorage.removeItem(STORAGE_KEYS.LICENSE_KEY);
                localStorage.removeItem(STORAGE_KEYS.ACTIVATED_AT);
            } catch (_) {}
        }

        return { success: true };
    }

    /**
     * Sets a custom purchase URL
     */
    async setPurchaseUrl(url) {
        if (!url || typeof url !== 'string') return;
        this.purchaseUrl = url;
        if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
            chrome.storage.sync.set({ [STORAGE_KEYS.PURCHASE_URL]: url });
        }
    }
}
