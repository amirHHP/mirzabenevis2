import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MeetingUI } from '../modules/MeetingUI.js';
import { AutoMeetingLogData } from '../modules/AutoMeetingLogData.js';

describe('AutoMeetingLogData and MeetingUI integration', () => {
    it('AutoMeetingLogData exposes static and instance deduplication methods', () => {
        const db = new AutoMeetingLogData();
        assert.equal(typeof AutoMeetingLogData.mergeCaptionMessages, 'function');
        assert.equal(typeof db.mergeCaptionMessages, 'function');
        assert.equal(typeof AutoMeetingLogData.deduplicateMeetingMessages, 'function');
        assert.equal(typeof db.deduplicateMeetingMessages, 'function');
        assert.equal(typeof AutoMeetingLogData.lcsWordMatchCount, 'function');
        assert.equal(typeof db.lcsWordMatchCount, 'function');
        assert.equal(typeof AutoMeetingLogData.wordsMatch, 'function');
        assert.equal(typeof db.wordsMatch, 'function');
    });

    it('MeetingUI.convert() cleans fragmented messages in modern meeting structure without mutating original', () => {
        // Mock DB for MeetingUI constructor (no IndexedDB needed for convert)
        const mockDB = {};
        // Stub browser globals that MeetingUI constructor touches
        global.document = {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
        };
        global.window = {};
        const storageMock = {
            get: (k, cb) => (cb ? cb({}) : Promise.resolve({})),
            set: (v, cb) => (cb ? cb() : Promise.resolve()),
        };
        global.chrome = {
            runtime: { sendMessage: () => {}, onMessage: { addListener: () => {} } },
            storage: {
                local: storageMock,
                sync: storageMock,
            },
        };

        const ui = new MeetingUI(mockDB);

        const t0 = new Date('2026-10-06T10:00:00Z').getTime();
        const rawMeeting = {
            meetingId: 'abc-defg-hij',
            meetingTitle: 'جلسه تیم فنی',
            meetingStartTime: new Date(t0).toISOString(),
            participants: [
                { name: 'Erfan', imageUrl: '' },
                { name: 'Salar', imageUrl: '' },
            ],
            messages: [
                { actorIndex: 0, text: 'من', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'خوبه بریم آقا؟', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'من تصویرمو قطع میکنم', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'خوب، بریم آقا؟ بریم این دفاع کنیم', timestamp: new Date(t0 + 3000).toISOString(), type: 'caption' },
            ],
        };

        const converted = ui.convert(rawMeeting);

        // Verify converted has clean messages
        assert.equal(converted.messages.length, 2);
        assert.equal(converted.messages[0].actorIndex, 0);
        assert.equal(converted.messages[0].text, 'من تصویرمو قطع میکنم');
        assert.equal(converted.messages[1].actorIndex, 1);
        assert.equal(converted.messages[1].text, 'خوب، بریم آقا؟ بریم این دفاع کنیم');

        // Verify original meeting was NOT mutated
        assert.equal(rawMeeting.messages.length, 4);
        assert.equal(rawMeeting.messages[0].text, 'من');

        // Verify generateMeetingPlainText uses clean converted messages
        const plainText = ui.generateMeetingPlainText(rawMeeting);
        assert.ok(!plainText.includes('[') || plainText.includes('Erfan: من تصویرمو قطع میکنم'));
        assert.ok(!plainText.includes('Erfan: من\n'));
    });

    it('MeetingUI.convert() supports legacy captions format and deduplicates', () => {
        const mockDB = {};
        const ui = new MeetingUI(mockDB);
        const t0 = new Date('2026-10-06T10:00:00Z').getTime();

        const legacyMeeting = {
            meetingId: 'xyz-uvw-rst',
            meetingTitle: 'جلسه بازاریابی',
            meetingStartTime: new Date(t0).toISOString(),
            captions: [
                {
                    speaker: { name: 'Salar', imageUrl: '' },
                    text: 'شروع کنیم',
                    timestamp: new Date(t0).toISOString(),
                },
                {
                    speaker: { name: 'Salar', imageUrl: '' },
                    text: 'شروع کنیم دوستان عزیز',
                    timestamp: new Date(t0 + 2000).toISOString(),
                },
            ],
        };

        const converted = ui.convert(legacyMeeting);
        assert.equal(converted.participants.length, 1);
        assert.equal(converted.participants[0].name, 'Salar');
        assert.equal(converted.messages.length, 1);
        assert.equal(converted.messages[0].text, 'شروع کنیم دوستان عزیز');
    });

    it('sets dir="auto" on textContainer and contentP in createMessageElement and appendMessageToElement', () => {
        class MockElement {
            constructor(tagName = 'div') {
                this.tagName = tagName.toUpperCase();
                this.className = '';
                this._textContent = '';
                this.childNodes = [];
                this.children = [];
                this.attributes = new Map();
            }
            get textContent() {
                if (this.childNodes.length > 0) return this.childNodes.map(c => c.textContent).join('');
                return this._textContent;
            }
            set textContent(val) {
                this.childNodes = [];
                this.children = [];
                this._textContent = String(val ?? '');
            }
            setAttribute(name, val) { this.attributes.set(name, String(val)); }
            getAttribute(name) { return this.attributes.get(name) || null; }
            appendChild(child) {
                this.childNodes.push(child);
                this.children.push(child);
                return child;
            }
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
            querySelectorAll(selector) {
                const matches = [];
                const visit = (el) => {
                    for (const child of el.children) {
                        if (selector.startsWith('.') && (child.className || '').split(/\s+/).includes(selector.slice(1))) {
                            matches.push(child);
                        }
                        visit(child);
                    }
                };
                visit(this);
                return matches;
            }
        }

        global.document = {
            createElement: (tag) => new MockElement(tag),
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
        };

        const ui = new MeetingUI({});
        const speaker = { name: 'Erfan', imageUrl: 'avatar.png' };
        const msgDiv = ui.createMessageElement(speaker, '۱۲ ربع زدی بابا', '2026-10-06T10:00:00Z');

        const textContainer = msgDiv.querySelector('.text-container');
        assert.ok(textContainer);
        assert.equal(textContainer.getAttribute('dir'), 'auto');

        const contentP = textContainer.querySelector('.content-p');
        assert.ok(contentP);
        assert.equal(contentP.getAttribute('dir'), 'auto');
        assert.equal(contentP.textContent, '۱۲ ربع زدی بابا');

        // Test appendMessageToElement
        ui.appendMessageToElement(msgDiv, '۱۲ و نیم ببخشید سلام');
        const paragraphs = textContainer.querySelectorAll('.content-p');
        assert.equal(paragraphs.length, 2);
        assert.equal(paragraphs[1].getAttribute('dir'), 'auto');
        assert.equal(paragraphs[1].textContent, '۱۲ و نیم ببخشید سلام');
    });

    it('prepends RLM (\\u200F) before RTL text starting with digits in generateMeetingPlainText', () => {
        const ui = new MeetingUI({});
        const t0 = new Date('2026-10-06T10:00:00Z').getTime();

        const meeting = {
            meetingTitle: 'تست بیدی',
            meetingStartTime: new Date(t0).toISOString(),
            participants: [{ name: 'Erfan', imageUrl: '' }],
            messages: [
                // Starts with Persian digits
                { actorIndex: 0, text: '۱۲ ربع زدی بابا', timestamp: new Date(t0).toISOString(), type: 'caption' },
                // Starts with ASCII digits
                { actorIndex: 0, text: '12 و نیم سلام', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' },
                // Starts with strong Persian letter
                { actorIndex: 0, text: 'سلام دوستان', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
                // Pure English
                { actorIndex: 0, text: 'Hello world', timestamp: new Date(t0 + 3000).toISOString(), type: 'caption' },
            ],
        };

        const text = ui.generateMeetingPlainText(meeting);

        // Lines with RTL text starting with digits MUST have RLM prepended
        assert.ok(text.includes('Erfan: \u200F۱۲ ربع زدی بابا'));
        assert.ok(text.includes('Erfan: \u200F12 و نیم سلام'));

        // Normal Persian text starting with strong RTL letter should not need extra RLM
        assert.ok(text.includes('Erfan: سلام دوستان'));

        // English text should not have RLM
        assert.ok(text.includes('Erfan: Hello world'));
        assert.ok(!text.includes('\u200FHello world'));
    });

    it('flows consecutive messages within 15s into active paragraph in showMessages', () => {
        class MockElement {
            constructor(tagName = 'div') {
                this.tagName = tagName.toUpperCase();
                this.className = '';
                this._textContent = '';
                this.childNodes = [];
                this.children = [];
                this.attributes = new Map();
                this.hidden = false;
                this.innerHTML = '';
                this.style = {};
                this.scrollHeight = 100;
                this.scrollTop = 0;
                this.clientHeight = 100;
                this.classList = {
                    classes: new Set(),
                    add: (...cls) => cls.forEach(c => this.classList.classes.add(c)),
                    remove: (...cls) => cls.forEach(c => this.classList.classes.delete(c)),
                    contains: (c) => this.classList.classes.has(c),
                };
            }
            get textContent() {
                if (this.childNodes.length > 0) return this.childNodes.map(c => c.textContent).join('');
                return this._textContent;
            }
            set textContent(val) {
                this.childNodes = [];
                this.children = [];
                this._textContent = String(val ?? '');
            }
            setAttribute(name, val) { this.attributes.set(name, String(val)); }
            getAttribute(name) { return this.attributes.get(name) || null; }
            removeAttribute(name) { this.attributes.delete(name); }
            appendChild(child) {
                this.childNodes.push(child);
                this.children.push(child);
                return child;
            }
            addEventListener() {}
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
            querySelectorAll(selector) {
                const matches = [];
                const visit = (el) => {
                    for (const child of el.children) {
                        const classes = (child.className || '').split(/\s+/);
                        if (selector.startsWith('.') && classes.includes(selector.slice(1))) {
                            matches.push(child);
                        }
                        visit(child);
                    }
                };
                visit(this);
                return matches;
            }
        }

        const captionsEl = new MockElement('div');
        global.document = {
            createElement: (tag) => new MockElement(tag),
            getElementById: (id) => (id === 'captions' ? captionsEl : null),
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
        };

        const ui = new MeetingUI({});
        const t0 = new Date('2026-10-06T10:00:00Z').getTime();

        const meeting = {
            meetingTitle: '<img src=x onerror=alert(1)>',
            meetingStartTime: new Date(t0).toISOString(),
            participants: [
                { name: 'Erfan', imageUrl: '' },
                { name: 'Salar', imageUrl: '' },
            ],
            messages: [
                // Erfan fragment 1
                { actorIndex: 0, text: 'سلام خسته نباشید', timestamp: new Date(t0).toISOString(), type: 'caption' },
                // Erfan fragment 2 (within 5 seconds -> conversational turn)
                { actorIndex: 0, text: '۱۲ ربع جلسه داریم', timestamp: new Date(t0 + 5000).toISOString(), type: 'caption' },
                // Erfan fragment 3 (30 seconds later -> new paragraph)
                { actorIndex: 0, text: 'ببخشید دیر شد', timestamp: new Date(t0 + 35000).toISOString(), type: 'caption' },
                // Salar speaks (different speaker -> new message block)
                { actorIndex: 1, text: 'خواهش میکنم مشکلی نیست', timestamp: new Date(t0 + 36000).toISOString(), type: 'caption' },
            ],
        };

        ui.showMessages(meeting);

        const titleEl = captionsEl.querySelector('.meeting-title-text');
        assert.equal(titleEl.textContent, '<img src=x onerror=alert(1)>');
        assert.equal(titleEl.tagName, 'SPAN');

        const messages = captionsEl.querySelectorAll('.message');
        assert.equal(messages.length, 2); // 1 for Erfan, 1 for Salar

        const erfanPs = messages[0].querySelectorAll('.content-p');
        // Fragments 1 & 2 were within 15s, so flowed into first paragraph
        // Fragment 3 was 30s later (>15s), so created second paragraph in same container
        assert.equal(erfanPs.length, 2);
        assert.equal(erfanPs[0].textContent, 'سلام خسته نباشید ۱۲ ربع جلسه داریم');
        assert.equal(erfanPs[1].textContent, 'ببخشید دیر شد');

        const salarPs = messages[1].querySelectorAll('.content-p');
        assert.equal(salarPs.length, 1);
        assert.equal(salarPs[0].textContent, 'خواهش میکنم مشکلی نیست');
    });
});

describe('Gemini Quota Management and On-Demand Titling Control', () => {
    it('trySilentAutoTitle is disabled and never invokes Gemini API', async () => {
        let geminiCalled = false;
        const ui = new MeetingUI({});
        ui.getGeminiApiKey = async () => 'mock-api-key';
        ui.callGeminiGenerateTitle = async () => {
            geminiCalled = true;
            return 'New Title';
        };

        const meeting = {
            meetingId: 'abc-defg-hij',
            meetingTitle: 'abc-defg-hij',
            meetingStartTime: '2026-10-24T10:00:00Z',
            messages: [
                { actorIndex: 0, text: 'سلام دوستان جلسه شروع شد' },
                { actorIndex: 1, text: 'سلام من هم آمدم' },
            ],
        };

        await ui.trySilentAutoTitle(meeting);
        assert.equal(geminiCalled, false, 'trySilentAutoTitle must be disabled and never call Gemini API');
    });

    it('handleAutoTitleMeeting catches 429 quota error gracefully with Persian alert message', async () => {
        let alertedMessage = null;
        let errorLogged = false;
        let warnLogged = false;

        const originalAlert = global.alert;
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;

        global.alert = (msg) => {
            alertedMessage = msg;
        };
        console.error = (...args) => {
            errorLogged = true;
            originalConsoleError(...args);
        };
        console.warn = () => {
            warnLogged = true;
        };

        try {
            const ui = new MeetingUI({});
            ui.getSelectedMeeting = async () => ({
                meetingId: 'abc-defg-hij',
                meetingTitle: 'abc-defg-hij',
                meetingStartTime: '2026-10-24T10:00:00Z',
                messages: [
                    { actorIndex: 0, text: 'سلام دوستان جلسه شروع شد' },
                ],
            });
            ui.getGeminiApiKey = async () => 'mock-api-key';
            ui.callGeminiGenerateTitle = async () => {
                const err = new Error('Gemini API error: 429 Quota Exceeded (RESOURCE_EXHAUSTED)');
                err.status = 429;
                throw err;
            };

            const mockBtn = { disabled: false, innerHTML: 'Auto Title' };
            await ui.handleAutoTitleMeeting(mockBtn);

            assert.equal(mockBtn.disabled, false);
            assert.equal(errorLogged, false, 'Should not spam console.error on quota 429');
            assert.equal(warnLogged, true, 'Should log clean console.warn on quota 429');
            assert.equal(
                alertedMessage,
                'سهمیه روزانه کلید Gemini شما به پایان رسیده است. لطفاً فردا مجدداً تلاش کنید یا از کلید دیگری استفاده نمایید'
            );
        } finally {
            global.alert = originalAlert;
            console.error = originalConsoleError;
            console.warn = originalConsoleWarn;
        }
    });

    it('handleGenerateSummary catches 429 quota error gracefully with Persian alert message', async () => {
        let alertedMessage = null;
        let errorLogged = false;
        let warnLogged = false;

        const originalAlert = global.alert;
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;

        global.alert = (msg) => {
            alertedMessage = msg;
        };
        console.error = (...args) => {
            errorLogged = true;
            originalConsoleError(...args);
        };
        console.warn = () => {
            warnLogged = true;
        };

        try {
            const meeting = {
                meetingId: 'abc-defg-hij',
                meetingTitle: 'abc-defg-hij',
                meetingStartTime: '2026-10-24T10:00:00Z',
                messages: [
                    { actorIndex: 0, text: 'سلام دوستان جلسه شروع شد و پروپوزال تایید شد' },
                ],
            };
            const ui = new MeetingUI({});
            ui.getSelectedMeeting = async () => meeting;
            ui.getGeminiApiKey = async () => 'mock-api-key';
            ui.callGeminiSummarize = async () => {
                const err = new Error('Gemini API error: 429 Quota Exceeded');
                err.status = 429;
                throw err;
            };

            const mockBtn = { disabled: false, innerHTML: 'Summarize' };
            await ui.handleSummarizeMeeting(mockBtn);

            assert.equal(mockBtn.disabled, false);
            assert.equal(errorLogged, false, 'Should not spam console.error on quota 429');
            assert.equal(warnLogged, true, 'Should log clean console.warn on quota 429');
            assert.equal(
                alertedMessage,
                'سهمیه روزانه کلید Gemini شما به پایان رسیده است. لطفاً فردا مجدداً تلاش کنید یا از کلید دیگری استفاده نمایید'
            );
        } finally {
            global.alert = originalAlert;
            console.error = originalConsoleError;
            console.warn = originalConsoleWarn;
        }
    });

    it('summarizes a long transcript in chunks no larger than the request cap', async () => {
        const ui = new MeetingUI({});
        const sent = [];
        ui.callGeminiSummarize = async (_key, text) => {
            sent.push(text);
            return 'خلاصه بخش';
        };

        const text = `${'خط جلسه.\n'.repeat(4000)}`;
        const summary = await ui.summarizeTranscript('key', text, 'fa');

        assert.equal(summary, 'خلاصه بخش');
        assert.ok(sent.length > 1);
        assert.ok(sent.every((piece) => piece.length <= MeetingUI.SUMMARY_CHUNK_CHARS));

        sent.length = 0;
        await ui.summarizeTranscript('key', 'x'.repeat(MeetingUI.SUMMARY_MAX_CHARS + 5000), 'en');
        const transcriptPieces = sent.filter((piece) => piece.startsWith('x'));
        const covered = transcriptPieces.reduce((sum, piece) => sum + piece.length, 0);
        assert.ok(covered <= MeetingUI.SUMMARY_MAX_CHARS);
        assert.ok(covered > MeetingUI.SUMMARY_CHUNK_CHARS);
    });
});

