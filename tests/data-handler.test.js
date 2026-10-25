import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DataRequestHandler } from '../modules/DataRequestHandler.js';

describe('DataRequestHandler Message Routing and Error Safety', () => {
    it('handles cloud.syncMeeting message and calls cloudSync.syncMeeting', async () => {
        let syncedStartTime = null;
        const mockDB = {};
        const mockCloudSync = {
            syncMeeting: async (db, startTime) => {
                syncedStartTime = startTime;
            }
        };

        const handler = new DataRequestHandler(mockDB, mockCloudSync);

        let response = null;
        const handled = handler.handleMessage(
            { type: 'cloud.syncMeeting', meetingStartTime: '2026-10-06T10:00:00Z' },
            { url: 'chrome-extension://test-id/meetings.html' },
            (res) => { response = res; }
        );

        assert.equal(handled, true, 'cloud.syncMeeting must be recognized and handled');

        // Allow async handler to execute
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(syncedStartTime, '2026-10-06T10:00:00Z');
        assert.deepEqual(response, { success: true });
    });

    it('handles cloud.syncMeeting error gracefully without crashing', async () => {
        const mockDB = {};
        const mockCloudSync = {
            syncMeeting: async () => {
                throw new Error('Network timeout');
            }
        };

        const handler = new DataRequestHandler(mockDB, mockCloudSync);

        let response = null;
        const handled = handler.handleMessage(
            { type: 'cloud.syncMeeting', meetingStartTime: '2026-10-06T10:00:00Z' },
            { url: 'chrome-extension://test-id/meetings.html' },
            (res) => { response = res; }
        );

        assert.equal(handled, true);
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(response?.success, false);
        assert.match(response?.message, /Network timeout/);
    });

    it('safely broadcasts UI updates even if chrome.runtime has no receivers', async () => {
        // Setup mock chrome runtime where sendMessage invokes callback with runtime.lastError
        let errorChecked = false;
        global.chrome = {
            runtime: {
                get lastError() {
                    errorChecked = true;
                    return { message: 'Could not establish connection. Receiving end does not exist.' };
                },
                sendMessage: (msg, cb) => {
                    if (cb) cb();
                }
            }
        };

        let saved = false;
        const mockDB = {
            saveMeeting: async () => { saved = true; },
        };
        const mockCloudSync = {
            syncMeeting: async () => {}
        };

        const handler = new DataRequestHandler(mockDB, mockCloudSync);

        let response = null;
        await handler.handleSaveMeeting(
            {
                meetingInfo: { meetingStartTime: '2026-10-06T10:00:00Z' },
                messages: []
            },
            (res) => { response = res; }
        );

        assert.equal(saved, true);
        assert.equal(response?.success, true);
        assert.equal(errorChecked, true, 'safeBroadcast must inspect chrome.runtime.lastError to suppress console errors');
    });

    it('rejects cloud login from the Meet content script', () => {
        let called = false;
        const handler = new DataRequestHandler({}, {
            login: async () => {
                called = true;
            },
        });

        let response = null;
        const handled = handler.handleMessage(
            { type: 'cloud.login', email: 'a@b.c', password: 'secret' },
            { url: 'https://meet.google.com/abc-defg-hij' },
            (res) => { response = res; }
        );

        assert.equal(handled, false);
        assert.equal(called, false);
        assert.equal(response?.success, false);
    });

    it('allows caption saves from the Meet content script', () => {
        const handler = new DataRequestHandler({
            saveMeeting: async () => {},
        }, { syncMeeting: async () => {} });

        const handled = handler.handleMessage(
            {
                type: 'background.saveMeeting',
                meetingInfo: { meetingStartTime: '2026-10-06T10:00:00Z' },
                messages: [],
            },
            { url: 'https://meet.google.com/abc-defg-hij' },
            () => {}
        );

        assert.equal(handled, true);
    });
});
