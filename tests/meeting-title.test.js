import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Setup mock browser globals before importing content.js
global.window = {
  __MIRZABENEVIS_TEST__: true,
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: 'https://meet.google.com/abc-defg-hij', pathname: '/abc-defg-hij' },
};
global.document = {
  title: 'Meet',
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
};
global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
global.chrome = {
  runtime: {
    id: 'test-ext-id',
    sendMessage: () => {},
    onMessage: { addListener: () => {} },
  },
};

await import('../content.js');
const { MeetingTitleExtractor } = globalThis.MirzaBenevis;

import { AutoMeetingLogData, isLobbyOrGenericTitle } from '../modules/AutoMeetingLogData.js';
import { MeetingUI } from '../modules/MeetingUI.js';
import { MeetingMigration } from '../modules/MeetingMigration.js';

describe('Meeting Title Extraction & Generic Title Filtering', () => {
  const genericTitles = [
    '# Meet',
    'Meet',
    'Google Meet',
    '?Ready to join',
    'Ready to join?',
    '‎?Ready to join‏',
    '...Loading',
    'Loading...',
    'Meet - ?Ready to join',
    'Meet - ...Loading',
    'Untitled Meeting',
    '(Untitled)',
    'در حال بارگذاری...',
    '...در حال بارگذاری',
    'آماده پیوستن؟',
    '؟آماده پیوستن',
    'abc-defg-hij',
    'Meet - abc-defg-hij',
    'Google Meet - abc-defg-hij',
    'گوگل میت',
    'میت',
    '۱۲:۳۰ | abc-defg-hij',
    '12:30 PM | abc-defg-hij',
    '\u200E(1) Meet - abc-defg-hij',
    '(۱) گوگل میت - abc-defg-hij',
    'Join this video meeting',
    'join this video meeting',
    'join video meeting',
    'join this meeting',
    'join this call',
    'join meeting',
    'پیوستن به این جلسه ویدیویی',
    'پیوستن به جلسه ویدیویی',
    'پیوستن به این جلسه',
    'پیوستن به جلسه',
    'ورود به جلسه',
    'ورود به این جلسه',
    'Meet - Join this video meeting',
    'Google Meet - پیوستن به این جلسه ویدیویی',
    '‎Join this video meeting‏',
    'Join this video meeting?',
  ];

  const validTitles = [
    'بررسی ریسک‌های پنل جدید',
    'جلسه هفتگی تیم فرانت',
    'Sprint Planning #42',
    'Design Sync: Mobile App',
    '1:1 Catch-up with Manager',
  ];

  it('MeetingTitleExtractor.isLobbyOrGenericTitle identifies all lobby and placeholder titles', () => {
    for (const title of genericTitles) {
      assert.equal(
        MeetingTitleExtractor.isLobbyOrGenericTitle(title, 'abc-defg-hij'),
        true,
        `Expected "${title}" to be identified as generic/lobby title`
      );
    }
  });

  it('MeetingTitleExtractor.isLobbyOrGenericTitle preserves genuine meeting titles', () => {
    for (const title of validTitles) {
      assert.equal(
        MeetingTitleExtractor.isLobbyOrGenericTitle(title, 'abc-defg-hij'),
        false,
        `Expected "${title}" to be preserved as a valid meeting title`
      );
    }
  });

  it('MeetingTitleExtractor.cleanTitle strips prefixes, suffixes, and returns empty for lobby titles', () => {
    assert.equal(MeetingTitleExtractor.cleanTitle('Meet - بررسی ریسک‌های پنل جدید'), 'بررسی ریسک‌های پنل جدید');
    assert.equal(MeetingTitleExtractor.cleanTitle('(2) بررسی ریسک‌های پنل جدید - Google Meet'), 'بررسی ریسک‌های پنل جدید');
    assert.equal(MeetingTitleExtractor.cleanTitle('\u200E(1) Meet – بررسی ریسک‌های پنل جدید'), 'بررسی ریسک‌های پنل جدید');
    assert.equal(MeetingTitleExtractor.cleanTitle('(۱) بررسی ریسک‌های پنل جدید – گوگل میت'), 'بررسی ریسک‌های پنل جدید');
    assert.equal(MeetingTitleExtractor.cleanTitle('۱۲:۳۰ | بررسی ریسک‌های پنل جدید'), 'بررسی ریسک‌های پنل جدید');
    assert.equal(MeetingTitleExtractor.cleanTitle('12:30 PM | بررسی ریسک‌های پنل جدید'), 'بررسی ریسک‌های پنل جدید');
    assert.equal(MeetingTitleExtractor.cleanTitle('?Ready to join'), '');
    assert.equal(MeetingTitleExtractor.cleanTitle('...Loading'), '');
    assert.equal(MeetingTitleExtractor.cleanTitle('# Meet'), '');
    assert.equal(MeetingTitleExtractor.cleanTitle('Meet - abc-defg-hij', 'abc-defg-hij'), '');
    assert.equal(MeetingTitleExtractor.cleanTitle('۱۲:۳۰ | abc-defg-hij', 'abc-defg-hij'), '');
    assert.equal(MeetingTitleExtractor.cleanTitle('گوگل میت', 'abc-defg-hij'), '');
  });

  it('AutoMeetingLogData.isLobbyOrGenericTitle matches MeetingTitleExtractor behavior', () => {
    for (const title of genericTitles) {
      assert.equal(
        isLobbyOrGenericTitle(title, 'abc-defg-hij'),
        true,
        `Expected "${title}" to be generic in AutoMeetingLogData`
      );
    }
    for (const title of validTitles) {
      assert.equal(
        isLobbyOrGenericTitle(title, 'abc-defg-hij'),
        false,
        `Expected "${title}" to be valid in AutoMeetingLogData`
      );
    }
  });

  it('MeetingUI.getDisplayTitle displays meetingId instead of generic lobby titles', () => {
    const fakeDB = {};
    const ui = new MeetingUI(fakeDB);

    assert.equal(
      ui.getDisplayTitle({ meetingTitle: '?Ready to join', meetingId: 'xyz-uvwx-rst' }),
      'xyz-uvwx-rst'
    );
    assert.equal(
      ui.getDisplayTitle({ meetingTitle: '...Loading', meetingId: 'xyz-uvwx-rst' }),
      'xyz-uvwx-rst'
    );
    assert.equal(
      ui.getDisplayTitle({ meetingTitle: '# Meet', meetingId: 'xyz-uvwx-rst' }),
      'xyz-uvwx-rst'
    );
    assert.equal(
      ui.getDisplayTitle({ meetingTitle: 'Join this video meeting', meetingId: 'xyz-uvwx-rst' }),
      'xyz-uvwx-rst'
    );
    assert.equal(
      ui.getDisplayTitle({ meetingTitle: 'پیوستن به این جلسه ویدیویی', meetingId: 'xyz-uvwx-rst' }),
      'xyz-uvwx-rst'
    );
    assert.equal(
      ui.getDisplayTitle({ meetingTitle: 'Join this video meeting', meetingId: 'xyz-uvwx-rst', aiTitle: 'جلسه برنامه‌ریزی فصل پاییز' }),
      'جلسه برنامه‌ریزی فصل پاییز'
    );
    assert.equal(
      ui.getDisplayTitle({ meetingTitle: 'بررسی ریسک‌های پنل جدید', meetingId: 'xyz-uvwx-rst' }),
      'بررسی ریسک‌های پنل جدید'
    );
  });

  it('MeetingMigration.migrateMeetings sanitizes all generic/lobby titles from existing records', async () => {
    const fakeInstanceManager = {
      getInstanceId: async () => 'inst-123',
    };
    const migration = new MeetingMigration(fakeInstanceManager, {});

    const oldMeetings = [
      { meetingTitle: '?Ready to join', meetingId: 'aaa-bbbb-ccc', meetingStartTime: '2026-10-19T08:00:00Z' },
      { meetingTitle: '...Loading', meetingId: 'ddd-eeee-fff', meetingStartTime: '2026-10-19T09:00:00Z' },
      { meetingTitle: '# Meet', meetingId: 'ggg-hhhh-iii', meetingStartTime: '2026-10-19T10:00:00Z' },
      { meetingTitle: 'بررسی ریسک‌های پنل جدید', meetingId: 'jjj-kkkk-lll', meetingStartTime: '2026-10-19T11:00:00Z' },
      { meetingTitle: 'Join this video meeting', meetingId: 'mmm-nnnn-ooo', meetingStartTime: '2026-10-19T12:00:00Z' },
      { meetingTitle: 'پیوستن به این جلسه ویدیویی', meetingId: 'ppp-qqqq-rrr', meetingStartTime: '2026-10-19T13:00:00Z' },
      { meetingTitle: 'Join this video meeting', meetingId: 'sss-tttt-uuu', aiTitle: 'طراحی معماری سیستم', meetingStartTime: '2026-10-19T14:00:00Z' },
    ];

    const migrated = await migration.migrateMeetings(oldMeetings);

    assert.equal(migrated[0].meetingTitle, 'aaa-bbbb-ccc');
    assert.equal(migrated[1].meetingTitle, 'ddd-eeee-fff');
    assert.equal(migrated[2].meetingTitle, 'ggg-hhhh-iii');
    assert.equal(migrated[3].meetingTitle, 'بررسی ریسک‌های پنل جدید');
    assert.equal(migrated[4].meetingTitle, 'mmm-nnnn-ooo');
    assert.equal(migrated[5].meetingTitle, 'ppp-qqqq-rrr');
    assert.equal(migrated[6].meetingTitle, 'طراحی معماری سیستم');
  });

  it('rejects UI control labels and clock patterns while preserving valid timed titles', () => {
    const controlsAndClocks = [
      'Turn off microphone',
      'Turn on microphone',
      'خاموش کردن میکروفون',
      'روشن کردن میکروفون',
      'Leave call',
      'خروج از تماس',
      'Meeting details',
      'اطلاعات جلسه',
      '12:30 PM | abc-defg-hij',
      '10:15 AM',
      '10:15',
    ];

    for (const phrase of controlsAndClocks) {
      assert.equal(
        MeetingTitleExtractor.isLobbyOrGenericTitle(phrase, 'abc-defg-hij'),
        true,
        `Expected "${phrase}" to be recognized as generic/control`
      );
      assert.equal(
        isLobbyOrGenericTitle(phrase, 'abc-defg-hij'),
        true,
        `Expected "${phrase}" to be recognized as generic/control in AutoMeetingLogData`
      );
    }

    const timedMeetings = [
      '10:15 - Team Standup',
      'Sprint Review (10:30 AM)',
      '1:1 Catch-up with Manager',
    ];

    for (const title of timedMeetings) {
      assert.equal(
        MeetingTitleExtractor.isLobbyOrGenericTitle(title, 'abc-defg-hij'),
        false,
        `Expected "${title}" to be preserved as a valid title`
      );
    }
  });

  it('getTitleFromDom extracts calendar title from document.title before bottom bar controls', () => {
    const origTitle = global.document.title;
    try {
      global.document.title = 'Meet - طراحی معماری سیستم جدید';
      const extracted = MeetingTitleExtractor.getTitleFromDom('abc-defg-hij');
      assert.equal(extracted, 'طراحی معماری سیستم جدید');
    } finally {
      global.document.title = origTitle;
    }
  });

  it('AutoMeetingLogData.updateMeetingTitle creates stub record if meeting not yet saved', async () => {
    let storedRecord = null;
    const mockStore = {
      get: () => {
        const req = { onsuccess: null, onerror: null, result: null };
        queueMicrotask(() => req.onsuccess?.({ target: req }));
        return req;
      },
      put: (data) => {
        storedRecord = data;
        const req = { onsuccess: null, onerror: null };
        queueMicrotask(() => req.onsuccess?.({ target: req }));
        return req;
      }
    };
    const mockDb = {
      transaction: () => ({
        objectStore: () => mockStore
      })
    };
    const logData = new AutoMeetingLogData();
    logData.open = async () => mockDb;
    logData.instanceManager = {
      getInstanceId: async () => 'inst-test-1',
      createInstanceId: async () => 'inst-test-1'
    };

    const startTime = '2026-10-22T10:00:00.000Z';
    const success = await logData.updateMeetingTitle(startTime, 'جلسه بازبینی کد', 'abc-defg-hij');
    assert.equal(success, true);
    assert.ok(storedRecord);
    assert.equal(storedRecord.meetingStartTime, startTime);
    assert.equal(storedRecord.meetingId, 'abc-defg-hij');
    assert.equal(storedRecord.meetingTitle, 'جلسه بازبینی کد');
    assert.equal(storedRecord.instanceId, 'inst-test-1');
  });

  it('AutoMeetingLogData.updateMeetingTitle prevents overwriting valid title with generic title', async () => {
    let putRecord = null;
    const existingMeeting = {
      meetingStartTime: '2026-10-22T10:00:00.000Z',
      meetingId: 'abc-defg-hij',
      meetingTitle: 'جلسه بازبینی کد',
      messages: [],
      participants: []
    };
    const mockStore = {
      get: () => {
        const req = { onsuccess: null, onerror: null, result: existingMeeting };
        queueMicrotask(() => req.onsuccess?.({ target: req }));
        return req;
      },
      put: (data) => {
        putRecord = data;
        const req = { onsuccess: null, onerror: null };
        queueMicrotask(() => req.onsuccess?.({ target: req }));
        return req;
      }
    };
    const mockDb = {
      transaction: () => ({
        objectStore: () => mockStore
      })
    };
    const logData = new AutoMeetingLogData();
    logData.open = async () => mockDb;
    logData.instanceManager = {
      getInstanceId: async () => 'inst-test-1',
      createInstanceId: async () => 'inst-test-1'
    };

    await logData.updateMeetingTitle('2026-10-22T10:00:00.000Z', 'Turn off microphone', 'abc-defg-hij');
    assert.equal(putRecord.meetingTitle, 'جلسه بازبینی کد', 'Existing valid title should be preserved');
  });
});
