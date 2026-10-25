import { InstanceManager } from './InstanceManager.js';
import {
    normalizeForComparison,
    wordsMatch,
    lcsWordMatchCount,
    classifyTextRelationship,
    mergeCaptionMessages,
    deduplicateMeetingMessages,
    mergeConsecutiveTexts,
} from './TranscriptDeduplicator.js';

export const LOBBY_TITLE_PHRASES = [
    'ready to join',
    'getting ready',
    'joining',
    'loading',
    'asking to join',
    'ask to join',
    'checking your audio and video',
    'check your audio and video',
    'waiting for approval',
    'waiting to be admitted',
    'waiting for the host',
    'someone will let you in soon',
    'preparing',
    'you can\'t join this call',
    'this call has ended',
    'return to home screen',
    'meeting has ended',
    'your meeting is ready',
    'join now',
    'join this video meeting',
    'join video meeting',
    'join this video call',
    'join video call',
    'join this meeting',
    'join this call',
    'join meeting',
    'join a meeting',
    'join call',
    'join with google meet',
    'join with meet',
    'join audio',
    'آماده پیوستن',
    'آماده‌اید بپیوندید',
    'آماده ملحق شدن',
    'در حال پیوستن',
    'در حال بارگذاری',
    'در حال آماده‌سازی',
    'درخواست برای پیوستن',
    'درخواست پیوستن',
    'درخواست ملحق شدن',
    'درخواست ورود',
    'در انتظار تأیید',
    'در انتظار تایید',
    'در انتظار ورود',
    'منتظر بمانید',
    'منتظر تأیید بمانید',
    'منتظر تایید بمانید',
    'بررسی صدا و تصویر',
    'بررسی وضعیت صوتی و تصویری',
    'جلسه شما آماده است',
    'جلسه پایان یافته',
    'پایان جلسه',
    'پیوستن به این جلسه ویدیویی',
    'پیوستن به جلسه ویدیویی',
    'پیوستن به این جلسه ویدئویی',
    'پیوستن به جلسه ویدئویی',
    'پیوستن به این جلسه تصویری',
    'پیوستن به جلسه تصویری',
    'پیوستن به این جلسه',
    'پیوستن به جلسه',
    'پیوستن به این تماس',
    'پیوستن به تماس',
    'ورود به جلسه',
    'ورود به این جلسه',
    'ورود به جلسه ویدیویی',
    'ورود به این جلسه ویدیویی',
    'ورود به جلسه ویدئویی',
    'ورود به این جلسه ویدئویی',
    'ورود به جلسه تصویری',
    'ورود به این جلسه تصویری',
    'جلسه ویدیویی',
    'جلسه ویدئویی',
    'جلسه تصویری',
    '참여 준비 완료',
    '참여 중',
    '로드 중',
    '지금 참여',
    '화상 회의 참여',
    'مستعد للانضمام',
    'جاهز للانضمام',
    'جارٍ الانضمام',
    'جارٍ التحميل',
    'طلب الانضمام',
    'انضمام الآن',
    'الانضمام الآن',
    'انضمام إلى اجتماع الفيديو',
    'الانضمام إلى اجتماع فيديو',
    'الانضمام إلى هذا الاجتماع',
    'الانضمام إلى اجتماع',
    'الانضمام إلى المكالمة'
];

const UI_CONTROL_PHRASES = [
    'turn off microphone',
    'turn on microphone',
    'turn off camera',
    'turn on camera',
    'leave call',
    'leave meeting',
    'end call',
    'raise hand',
    'lower hand',
    'more options',
    'meeting details',
    'chat with everyone',
    'people',
    'show everyone',
    'activities',
    'host controls',
    'turn on captions',
    'turn off captions',
    'خاموش کردن میکروفون',
    'روشن کردن میکروفون',
    'خاموش کردن دوربین',
    'روشن کردن دوربین',
    'ترک تماس',
    'خروج از تماس',
    'پایان تماس',
    'دست بلند کردن',
    'گزینه‌های بیشتر',
    'اطلاعات جلسه',
    'جزئیات جلسه',
    'افراد',
    'چت',
    'گفتگو',
    'فعالیت‌ها',
    'کنترل‌های میزبان',
    'فعال‌سازی زیرنویس',
    'خاموش کردن زیرنویس'
];

export function isLobbyOrGenericTitle(title, meetingId = '') {
    if (!title || typeof title !== 'string') return true;
    let t = title.trim();
    if (!t) return true;

    // Remove leading bidi control marks
    t = t.replace(/^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]+/gu, '').trim();

    // Remove notification counter prefix like (1), (2), (۱), (۲)
    t = t.replace(/^\([\d\u0660-\u0669\u06F0-\u06F9]+\)\s*/u, '').trim();

    // Remove prefixes/suffixes like "Meet - ", "Meet: ", " - Google Meet", "# Meet", "گوگل میت", "میت", etc.
    t = t.replace(/^(?:Google\s+)?Meet\s*[-–—:|#]\s*/i, '').trim();
    t = t.replace(/\s*[-–—:|#]\s*(?:Google\s+)?Meet$/i, '').trim();
    t = t.replace(/^(?:گوگل\s+)?میت\s*[-–—:|#]\s*/iu, '').trim();
    t = t.replace(/\s*[-–—:|#]\s*(?:گوگل\s+)?میت$/iu, '').trim();

    // Strip leading/trailing punctuation, bidi control marks, hashes, bullets, etc.
    const cleaned = t
        .replace(/^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069?!؟.\-_–—:|#()·•]+/gu, '')
        .replace(/[\s\u200e\u200f\u202a-\u202e\u2066-\u2069?!؟.\-_–—:|#()·•]+$/gu, '')
        .trim()
        .toLowerCase();

    if (!cleaned) return true;
    if (
        cleaned === 'meet' ||
        cleaned === 'google meet' ||
        cleaned === 'میت' ||
        cleaned === 'گوگل میت' ||
        cleaned === 'untitled' ||
        cleaned === 'untitled meeting' ||
        cleaned === 'بدون عنوان' ||
        cleaned === 'جلسه بدون عنوان'
    ) {
        return true;
    }
    if (meetingId && (cleaned === meetingId.toLowerCase() || t === meetingId)) {
        return true;
    }
    if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(cleaned)) {
        return true;
    }

    // Pure clock or time + meeting code (e.g. "12:30 PM | abc-defg-hij", "12:30 · abc-defg-hij", "۱۲:۳۰ | abc-defg-hij", "10:15")
    if (/^[\d\u0660-\u0669\u06F0-\u06F9]{1,2}:[\d\u0660-\u0669\u06F0-\u06F9]{2}(?::[\d\u0660-\u0669\u06F0-\u06F9]{2})?\s*(?:am|pm|ق\.?ظ|ب\.?ظ|ق\u200cظ|ب\u200cظ)?(?:\s*[-–—|·•]\s*[a-z]{3}-[a-z]{4}-[a-z]{3})?$/iu.test(cleaned)) {
        return true;
    }

    // Check UI control labels/tooltips
    if (UI_CONTROL_PHRASES.some(phrase => cleaned === phrase || cleaned.startsWith(phrase))) {
        return true;
    }

    // Check lobby phrases with word boundary / punctuation match
    return LOBBY_TITLE_PHRASES.some(phrase => {
        if (cleaned === phrase) return true;
        if (cleaned.startsWith(phrase + ' ') || cleaned.startsWith(phrase + '...') || cleaned.startsWith(phrase + '?') || cleaned.startsWith(phrase + '؟')) {
            return true;
        }
        if (cleaned.endsWith(' ' + phrase) || cleaned.endsWith('...' + phrase)) {
            return true;
        }
        return false;
    });
}

export {
    normalizeForComparison,
    wordsMatch,
    lcsWordMatchCount,
    classifyTextRelationship,
    mergeCaptionMessages,
    deduplicateMeetingMessages,
    mergeConsecutiveTexts,
};

export class AutoMeetingLogData {
    static isLobbyOrGenericTitle = isLobbyOrGenericTitle;
    static normalizeForComparison = normalizeForComparison;
    static wordsMatch = wordsMatch;
    static lcsWordMatchCount = lcsWordMatchCount;
    static classifyTextRelationship = classifyTextRelationship;
    static mergeCaptionMessages = mergeCaptionMessages;
    static deduplicateMeetingMessages = deduplicateMeetingMessages;
    static mergeConsecutiveTexts = mergeConsecutiveTexts;

    constructor() {
        this.dbName = 'AutoMeetingLogDB';
        this.dbVersion = 1;
        this.instanceManager = new InstanceManager();
    }

    async open() {
        return new Promise((resolve, reject) => {
            // 버전 번호를 명시하지 않으면 이미 존재하는 DB의 현재 버전을 사용하고,
            // 없으면 자동으로 생성되면서 onupgradeneeded 가 한 번만 호출됩니다.
            // 이렇게 하면 "requested version (1) is less than the existing version (2)" 오류를 피할 수 있습니다.
            const request = self.indexedDB.open('AutoMeetingLogDB');

            request.onupgradeneeded = function (event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('meetings')) {
                    const objectStore = db.createObjectStore('meetings', { keyPath: 'meetingStartTime' });
                    console.log("Store created:", objectStore);
                }
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    normalizeForComparison(text) {
        return normalizeForComparison(text);
    }

    wordsMatch(w1, w2) {
        return wordsMatch(w1, w2);
    }

    lcsWordMatchCount(wordsA, wordsB) {
        return lcsWordMatchCount(wordsA, wordsB);
    }

    classifyTextRelationship(olderText, newerText) {
        return classifyTextRelationship(olderText, newerText);
    }

    deduplicateMeetingMessages(messages, windowMs = 30000) {
        return deduplicateMeetingMessages(messages, windowMs);
    }

    mergeCaptionMessages(existingMessages, incomingMessages, replacePrefix = false, windowMs = 30000) {
        return mergeCaptionMessages(existingMessages, incomingMessages, replacePrefix, windowMs);
    }

    async saveMeeting(meetingInfo, messages, options = {}) {
        const db = await this.open();
        
        // instanceId 가져오기 (없으면 생성)
        let instanceId = await this.instanceManager.getInstanceId();
        if (!instanceId) {
            instanceId = await this.instanceManager.createInstanceId();
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');

            transaction.oncomplete = () => {
                console.log('Transaction completed');
                resolve();
            };

            transaction.onerror = (event) => {
                console.error('Transaction error:', event.target.error);
                reject(event.target.error);
            };

            const getRequest = objectStore.get(meetingInfo.meetingStartTime);

            getRequest.onsuccess = (event) => {
                const storedData = event.target.result;
                const filteredMessages = messages.filter(message => message.text && message.text.trim() !== '');
                const updatedMessages = this.mergeCaptionMessages(
                    storedData?.messages,
                    filteredMessages,
                    options.replacePrefix
                );

                let finalTitle = meetingInfo.meetingTitle;
                if (storedData?.meetingTitle && !isLobbyOrGenericTitle(storedData.meetingTitle, meetingInfo.meetingId)) {
                    if (isLobbyOrGenericTitle(finalTitle, meetingInfo.meetingId) || finalTitle === meetingInfo.meetingId) {
                        finalTitle = storedData.meetingTitle;
                    }
                } else if (isLobbyOrGenericTitle(finalTitle, meetingInfo.meetingId)) {
                    finalTitle = storedData?.aiTitle || storedData?.generatedTitle || meetingInfo.aiTitle || meetingInfo.generatedTitle || meetingInfo.meetingId || 'Untitled Meeting';
                }

                const putRequest = objectStore.put({ 
                    ...storedData,
                    ...meetingInfo, 
                    meetingTitle: finalTitle,
                    messages: updatedMessages,
                    summaryText: storedData?.summaryText ?? meetingInfo.summaryText,
                    summaryLanguage: storedData?.summaryLanguage ?? meetingInfo.summaryLanguage,
                    summaryUpdatedAt: storedData?.summaryUpdatedAt ?? meetingInfo.summaryUpdatedAt,
                    notesText: storedData?.notesText ?? meetingInfo.notesText,
                    notesUpdatedAt: storedData?.notesUpdatedAt ?? meetingInfo.notesUpdatedAt,
                    lastUpdated: new Date().toISOString(),
                    instanceId: instanceId  // 모든 새 데이터에 instanceId 추가
                });

                putRequest.onerror = (event) => {
                    console.error('Save Fail:', event.target.error);
                    reject(event.target.error);
                };

                putRequest.onsuccess = () => {
                    console.log('Save Success');
                };
            };

            getRequest.onerror = () => {
                const filteredMessages = messages.filter(message => message.text && message.text.trim() !== '');
                const updatedMessages = this.mergeCaptionMessages([], filteredMessages, options.replacePrefix);
                let finalTitle = meetingInfo.meetingTitle;
                if (isLobbyOrGenericTitle(finalTitle, meetingInfo.meetingId)) {
                    finalTitle = meetingInfo.aiTitle || meetingInfo.generatedTitle || meetingInfo.meetingId || 'Untitled Meeting';
                }
                const putRequest = objectStore.put({
                    ...meetingInfo,
                    meetingTitle: finalTitle,
                    messages: updatedMessages,
                    lastUpdated: new Date().toISOString(),
                    instanceId: instanceId
                });

                putRequest.onerror = (event) => {
                    console.error('Save Fail:', event.target.error);
                    reject(event.target.error);
                };

                putRequest.onsuccess = () => {
                    console.log('Save Success');
                };
            };
        });
    }

    async getAllMeetings() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readonly');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.getAll();

            request.onsuccess = (event) => {
                resolve(event.target.result || []);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getMeeting(meetingStartTime) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readonly');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.get(meetingStartTime);

            request.onsuccess = (event) => {
                resolve(event.target.result || null);
            };

            request.onerror = (event) => {
                console.error('Error getting meeting:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async deleteMeeting(meetingStartTime) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');

            transaction.oncomplete = () => {
                console.log('Delete transaction completed');
                resolve();
            };

            transaction.onerror = (event) => {
                console.error('Delete transaction error:', event.target.error);
                reject(event.target.error);
            };

            const request = objectStore.delete(meetingStartTime);

            request.onsuccess = () => {
                console.log('Meeting deleted successfully');
            };

            request.onerror = (event) => {
                console.error('Delete request error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async updateMeetingTitle(meetingStartTime, newTitle, meetingId = null) {
        if (!meetingStartTime || !newTitle) {
            return false;
        }
        let instanceId = await this.instanceManager.getInstanceId();
        if (!instanceId) {
            instanceId = await this.instanceManager.createInstanceId();
        }
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.get(meetingStartTime);

            request.onsuccess = (event) => {
                const meeting = event.target.result;
                const mId = meeting?.meetingId || meetingId;
                let finalTitle = newTitle;
                if (meeting?.meetingTitle && !isLobbyOrGenericTitle(meeting.meetingTitle, mId)) {
                    if (isLobbyOrGenericTitle(finalTitle, mId) || finalTitle === mId) {
                        finalTitle = meeting.meetingTitle;
                    }
                } else if (isLobbyOrGenericTitle(finalTitle, mId)) {
                    finalTitle = meeting?.aiTitle || meeting?.generatedTitle || mId || 'Untitled Meeting';
                }

                let updatedMeeting;
                if (!meeting) {
                    updatedMeeting = {
                        meetingStartTime,
                        meetingId: meetingId || '',
                        meetingTitle: finalTitle,
                        participants: [],
                        messages: [],
                        instanceId,
                        lastUpdated: new Date().toISOString()
                    };
                } else {
                    updatedMeeting = {
                        ...meeting,
                        meetingTitle: finalTitle,
                        ...(meetingId && !meeting.meetingId ? { meetingId } : {}),
                        instanceId: meeting.instanceId || instanceId,
                        lastUpdated: new Date().toISOString()
                    };
                }

                const updateRequest = objectStore.put(updatedMeeting);

                updateRequest.onsuccess = () => {
                    resolve(true);
                };

                updateRequest.onerror = (updateEvent) => {
                    console.error('Error updating meeting title:', updateEvent.target.error);
                    reject(updateEvent.target.error);
                };
            };

            request.onerror = (event) => {
                console.error('Error loading meeting for title update:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async updateMeetingSummary(meetingStartTime, summaryText, language) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.get(meetingStartTime);

            request.onsuccess = (event) => {
                const meeting = event.target.result;
                if (!meeting) {
                    resolve(false);
                    return;
                }

                const updatedMeeting = {
                    ...meeting,
                    summaryText,
                    summaryLanguage: language || 'en',
                    summaryUpdatedAt: new Date().toISOString()
                };

                const updateRequest = objectStore.put(updatedMeeting);

                updateRequest.onsuccess = () => {
                    resolve(true);
                };

                updateRequest.onerror = (updateEvent) => {
                    console.error('Error updating meeting summary:', updateEvent.target.error);
                    reject(updateEvent.target.error);
                };
            };

            request.onerror = (event) => {
                console.error('Error loading meeting for summary update:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async updateMeetingNotes(meetingStartTime, notesText) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.get(meetingStartTime);

            request.onsuccess = (event) => {
                const meeting = event.target.result;
                if (!meeting) {
                    resolve(false);
                    return;
                }

                const updatedMeeting = {
                    ...meeting,
                    notesText: notesText || '',
                    notesUpdatedAt: new Date().toISOString()
                };

                const updateRequest = objectStore.put(updatedMeeting);

                updateRequest.onsuccess = () => {
                    resolve(true);
                };

                updateRequest.onerror = (updateEvent) => {
                    console.error('Error updating meeting notes:', updateEvent.target.error);
                    reject(updateEvent.target.error);
                };
            };

            request.onerror = (event) => {
                console.error('Error loading meeting for notes update:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async mergeMeetings(meetings) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
            for (const meeting of meetings) {
                objectStore.put(meeting);
            }
        });
    }
}