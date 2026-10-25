// ============================================================
// CloudSyncManager — syncs meetings from local IndexedDB to Supabase
//
// Setup:
//   1. Create a Supabase project and run supabase/schema.sql
//   2. Fill SUPABASE_URL and SUPABASE_ANON_KEY below with the
//      values from Supabase Dashboard -> Settings -> API
// ============================================================

const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-KEY';

const SESSION_KEY = 'cloudSession';
const PENDING_KEY = 'cloudPendingSyncs';
const LAST_SYNC_KEY = 'cloudLastSyncAt';
export const PENDING_RETRY_ALARM = 'cloudPendingRetry';

const TOKEN_REFRESH_MARGIN_SECONDS = 120;
const PUSH_BATCH_SIZE = 10;

export class CloudSyncManager {
    constructor() {
        this.baseUrl = SUPABASE_URL.replace(/\/+$/, '');
        this.anonKey = SUPABASE_ANON_KEY;
    }

    isConfigured() {
        return (
            this.baseUrl.startsWith('https://') &&
            !this.baseUrl.includes('YOUR-PROJECT-REF') &&
            !!this.anonKey &&
            !this.anonKey.includes('YOUR-SUPABASE')
        );
    }

    // ---------- session storage ----------

    async _loadSession() {
        const result = await chrome.storage.local.get(SESSION_KEY);
        return result[SESSION_KEY] || null;
    }

    async _saveSession(session) {
        await chrome.storage.local.set({ [SESSION_KEY]: session });
    }

    async getStatus() {
        const configured = this.isConfigured();
        if (!configured) {
            return { configured: false, loggedIn: false, email: null, lastSyncAt: null, pendingCount: 0 };
        }
        const session = await this._loadSession();
        const result = await chrome.storage.local.get([LAST_SYNC_KEY, PENDING_KEY]);
        const pending = result[PENDING_KEY] || [];
        return {
            configured: true,
            loggedIn: !!session,
            email: session?.user?.email || null,
            lastSyncAt: result[LAST_SYNC_KEY] || null,
            pendingCount: pending.length,
        };
    }

    // ---------- auth ----------

    async login(email, password) {
        if (!this.isConfigured()) {
            throw new Error('Supabase is not configured.');
        }
        const response = await fetch(`${this.baseUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: this._authHeaders(),
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(this._authErrorMessage(data));
        }
        await this._saveSession(data);
        return data.user?.email || email;
    }

    async signup(email, password) {
        if (!this.isConfigured()) {
            throw new Error('Supabase is not configured.');
        }
        const response = await fetch(`${this.baseUrl}/auth/v1/signup`, {
            method: 'POST',
            headers: this._authHeaders(),
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(this._authErrorMessage(data));
        }
        // Some projects require email confirmation; only persist a session when issued.
        if (data.access_token) {
            await this._saveSession(data);
        }
        return data;
    }

    async logout() {
        await chrome.storage.local.remove([SESSION_KEY, PENDING_KEY]);
    }

    async _getAccessToken() {
        let session = await this._loadSession();
        if (!session) {
            throw new Error('Not logged in.');
        }

        const expiresAt = (session.expires_at || 0) * 1000;
        if (expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_SECONDS * 1000) {
            return session.access_token;
        }

        const response = await fetch(`${this.baseUrl}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: this._authHeaders(),
            body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        const data = await response.json();
        if (!response.ok) {
            await chrome.storage.local.remove(SESSION_KEY);
            throw new Error(this._authErrorMessage(data));
        }
        await this._saveSession(data);
        return data.access_token;
    }

    _authHeaders() {
        return {
            apikey: this.anonKey,
            Authorization: `Bearer ${this.anonKey}`,
            'Content-Type': 'application/json',
        };
    }

    async _apiHeaders() {
        const token = await this._getAccessToken();
        return {
            ...this._authHeaders(),
            Authorization: `Bearer ${token}`,
        };
    }

    _authErrorMessage(data) {
        return (
            data?.error_description ||
            data?.msg ||
            data?.error ||
            data?.message ||
            'Authentication failed.'
        );
    }

    _userIdFromSession(session) {
        if (session?.user?.id) return session.user.id;
        const token = session?.access_token;
        if (!token || typeof token !== 'string') return null;
        const payload = token.split('.')[1];
        if (!payload) return null;
        try {
            const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
            const json = JSON.parse(atob(padded));
            return json.sub || null;
        } catch {
            return null;
        }
    }

    async _getUserId() {
        await this._getAccessToken();
        const session = await this._loadSession();
        const userId = this._userIdFromSession(session);
        if (!userId) {
            throw new Error('Cloud session has no user id.');
        }
        return userId;
    }

    // ---------- push ----------

    mapMeetingToRow(meeting, userId) {
        return {
            user_id: userId,
            meeting_start_time: meeting.meetingStartTime,
            meeting_id: meeting.meetingId || null,
            meeting_title: meeting.meetingTitle || null,
            participants: Array.isArray(meeting.participants) ? meeting.participants : [],
            messages: Array.isArray(meeting.messages) ? meeting.messages : [],
            notes_text: meeting.notesText ?? null,
            notes_updated_at: meeting.notesUpdatedAt || null,
            summary_text: meeting.summaryText ?? null,
            summary_language: meeting.summaryLanguage || null,
            summary_updated_at: meeting.summaryUpdatedAt || null,
            instance_id: meeting.instanceId || null,
            last_updated: meeting.lastUpdated ? new Date(meeting.lastUpdated).toISOString() : null,
        };
    }

    async pushMeetings(meetings) {
        if (!meetings.length) {
            return 0;
        }
        const headers = await this._apiHeaders();
        const userId = await this._getUserId();
        let pushed = 0;

        for (let i = 0; i < meetings.length; i += PUSH_BATCH_SIZE) {
            const chunk = meetings.slice(i, i + PUSH_BATCH_SIZE).map((m) => this.mapMeetingToRow(m, userId));
            const response = await fetch(
                `${this.baseUrl}/rest/v1/meetings?on_conflict=user_id,meeting_start_time`,
                {
                    method: 'POST',
                    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
                    body: JSON.stringify(chunk),
                }
            );
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Cloud push failed (${response.status}): ${errorBody}`);
            }
            pushed += chunk.length;
        }
        return pushed;
    }

    async syncMeeting(autoMeetingLogDB, meetingStartTime) {
        try {
            if (!(await this._loadSession())) {
                return false;
            }
            const meeting = await autoMeetingLogDB.getMeeting(meetingStartTime);
            if (!meeting) {
                return false;
            }
            await this.pushMeetings([meeting]);
            await this._dequeuePending([meetingStartTime]);
            return true;
        } catch (error) {
            console.warn(`Cloud sync deferred for meeting ${meetingStartTime}:`, error.message);
            await this._enqueuePending(meetingStartTime);
            return false;
        }
    }

    async syncAll(autoMeetingLogDB) {
        if (!(await this._loadSession())) {
            throw new Error('Not logged in.');
        }
        const meetings = await autoMeetingLogDB.getAllMeetings();
        const pendingResult = await chrome.storage.local.get(PENDING_KEY);
        const pending = pendingResult[PENDING_KEY] || [];

        const byStart = new Map(meetings.map((m) => [String(m.meetingStartTime), m]));
        for (const startTime of pending) {
            if (!byStart.has(String(startTime))) {
                const missing = await autoMeetingLogDB.getMeeting(startTime);
                if (missing) {
                    byStart.set(String(startTime), missing);
                }
            }
        }

        const all = [...byStart.values()];
        await this.pushMeetings(all);
        await chrome.storage.local.set({
            [PENDING_KEY]: [],
            [LAST_SYNC_KEY]: new Date().toISOString(),
        });
        return all.length;
    }

    async deleteMeetingRemote(meetingStartTime) {
        try {
            if (!(await this._loadSession())) {
                return false;
            }
            const headers = await this._apiHeaders();
            const userId = await this._getUserId();
            const response = await fetch(
                `${this.baseUrl}/rest/v1/meetings?meeting_start_time=eq.${encodeURIComponent(meetingStartTime)}&user_id=eq.${encodeURIComponent(userId)}`,
                { method: 'DELETE', headers: { ...headers, Prefer: 'return=minimal' } }
            );
            if (!response.ok && response.status !== 404) {
                throw new Error(`Cloud delete failed (${response.status})`);
            }
            return true;
        } catch (error) {
            console.warn('Cloud delete failed:', error.message);
            return false;
        }
    }

    async retryPending(autoMeetingLogDB) {
        if (!this.isConfigured()) return 0;
        const session = await this._loadSession();
        if (!session) return 0;

        const result = await chrome.storage.local.get(PENDING_KEY);
        const pending = [...(result[PENDING_KEY] || [])];
        let synced = 0;
        for (const startTime of pending) {
            const ok = await this.syncMeeting(autoMeetingLogDB, startTime);
            if (ok) synced += 1;
        }
        return synced;
    }

    async _schedulePendingRetry() {
        if (!chrome?.alarms?.create) return;
        await chrome.alarms.create(PENDING_RETRY_ALARM, { delayInMinutes: 1 });
    }

    // ---------- pending queue ----------

    async _enqueuePending(meetingStartTime) {
        const result = await chrome.storage.local.get(PENDING_KEY);
        const pending = new Set(result[PENDING_KEY] || []);
        pending.add(meetingStartTime);
        await chrome.storage.local.set({ [PENDING_KEY]: [...pending] });
        await this._schedulePendingRetry();
    }

    async _dequeuePending(startTimes) {
        const targets = new Set(startTimes.map(String));
        const result = await chrome.storage.local.get(PENDING_KEY);
        const pending = (result[PENDING_KEY] || []).filter((t) => !targets.has(String(t)));
        await chrome.storage.local.set({ [PENDING_KEY]: pending });
    }
}
