export class InstanceManager {
    constructor() {
        this.instanceIdKey = 'instanceId';
    }

    // instanceId 존재 여부 확인
    async hasInstanceId() {
        const result = await chrome.storage.local.get(this.instanceIdKey);
        return !!result[this.instanceIdKey];
    }

    // instanceId 생성
    async createInstanceId() {
        let instanceId;

        try {
            if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
                // 최신 브라우저에서 지원
                instanceId = globalThis.crypto.randomUUID();
            } else if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
                // randomUUID 미지원 브라우저용 폴백
                const bytes = new Uint8Array(16);
                globalThis.crypto.getRandomValues(bytes);
                const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
                instanceId = [
                    hex.substring(0, 8),
                    hex.substring(8, 12),
                    hex.substring(12, 16),
                    hex.substring(16, 20),
                    hex.substring(20)
                ].join('-');
            } else {
                // crypto 자체가 없는 아주 오래된 환경용 폴백
                instanceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            }
        } catch (e) {
            // 어떤 이유로든 위 로직이 실패하면 최후의 수단으로 Math.random 사용
            console.error('Failed to generate UUID with crypto, falling back to Math.random:', e);
            instanceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }

        await chrome.storage.local.set({ [this.instanceIdKey]: instanceId });
        return instanceId;
    }

    // instanceId 조회
    async getInstanceId() {
        const result = await chrome.storage.local.get(this.instanceIdKey);
        return result[this.instanceIdKey];
    }
} 