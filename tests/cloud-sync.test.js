import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CloudSyncManager } from '../modules/CloudSyncManager.js';

describe('CloudSyncManager user id and pending retry', () => {
    it('reads the user id from the session user or the access token', () => {
        const sync = new CloudSyncManager();
        assert.equal(sync._userIdFromSession({ user: { id: 'from-user' } }), 'from-user');

        const payload = Buffer.from(JSON.stringify({ sub: 'from-token' })).toString('base64url');
        assert.equal(
            sync._userIdFromSession({ access_token: `header.${payload}.sig` }),
            'from-token'
        );
        assert.equal(sync._userIdFromSession({}), null);
    });

    it('includes user_id on each meeting row', () => {
        const sync = new CloudSyncManager();
        const row = sync.mapMeetingToRow(
            {
                meetingStartTime: '2026-10-25T10:00:00Z',
                meetingTitle: 'جلسه',
                messages: [],
            },
            'user-123'
        );
        assert.equal(row.user_id, 'user-123');
        assert.equal(row.meeting_start_time, '2026-10-25T10:00:00Z');
    });

    it('retries each pending meeting after a failed sync', async () => {
        const sync = new CloudSyncManager();
        sync.isConfigured = () => true;
        sync._loadSession = async () => ({ user: { id: 'user-123' } });
        const retried = [];
        sync.syncMeeting = async (_db, startTime) => {
            retried.push(startTime);
            return startTime === 't1';
        };

        global.chrome = {
            storage: {
                local: {
                    get: async () => ({ cloudPendingSyncs: ['t1', 't2'] }),
                    set: async () => {},
                },
            },
        };

        const synced = await sync.retryPending({});
        assert.deepEqual(retried, ['t1', 't2']);
        assert.equal(synced, 1);
    });
});
