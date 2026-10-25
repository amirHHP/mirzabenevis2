import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeForComparison,
    wordsMatch,
    lcsWordMatchCount,
    classifyTextRelationship,
    mergeConsecutiveTexts,
    mergeCaptionMessages,
    deduplicateMeetingMessages,
} from '../modules/TranscriptDeduplicator.js';

describe('TranscriptDeduplicator - Persian Caption Integrity & Loss Prevention', () => {
    describe('mergeConsecutiveTexts - prevention of word loss and truncation', () => {
        it('preserves Persian name "ندا" when preceding text ends with "ندارم"', () => {
            const prev = 'من اطلاعی ندارم';
            const next = 'ندا جان نظر شما چیه؟';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'من اطلاعی ندارم ندا جان نظر شما چیه؟');
            assert.ok(merged.includes('ندا جان'), 'Must preserve "ندا جان" without truncation');
        });

        it('preserves Persian name "ندا" when next is solely "ندا"', () => {
            const prev = 'من اطلاعی ندارم';
            const next = 'ندا';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'من اطلاعی ندارم ندا');
        });

        it('preserves words sharing common stems like "میکنم" vs "میکروفون"', () => {
            const prev = 'من صحبت میکنم';
            const next = 'میکروفون قطع شد';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'من صحبت میکنم میکروفون قطع شد');
            assert.ok(merged.includes('میکروفون'), 'Must preserve "میکروفون"');
        });

        it('preserves connectors like "و" and "که" between consecutive sentence chunks', () => {
            const prev = 'ما جلسه رو شروع کردیم';
            const next = 'و تصمیم گرفتیم که روی پروژه کار کنیم';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'ما جلسه رو شروع کردیم و تصمیم گرفتیم که روی پروژه کار کنیم');
        });

        it('merges multi-word boundary roll-off cleanly without word duplication or loss', () => {
            const prev = 'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم';
            const next = 'و جلسه رو برگزار میکنیم فردا هم تعطیله';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(
                merged,
                'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم فردا هم تعطیله'
            );
        });

        it('preserves exact single-word boundary overlap without duplicating word', () => {
            const prev = 'سلام خوبی';
            const next = 'خوبی جلسه شروع شد';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'سلام خوبی جلسه شروع شد');
        });

        it('replaces truncated boundary word with the complete word from overlapping roll-off', () => {
            const prev = 'من مشکل ندا';
            const next = 'مشکل ندارم جلسه بعد';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'من مشکل ندارم جلسه بعد');
            assert.ok(!merged.includes('مشکل ندا جلسه'), 'Truncated word "ندا" must be replaced with "ندارم"');
        });

        it('replaces single-word truncated boundary stem with the complete word from next line', () => {
            const prev = 'من مشکل ندا';
            const next = 'ندارم جلسه بعد';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'من مشکل ندارم جلسه بعد');
            assert.ok(!merged.includes('ندا ندارم'), 'Truncated word "ندا" must be replaced with "ندارم"');
        });

        it('replaces single-word truncated boundary stem with diff > 3 (e.g. ندا -> نداشتیم)', () => {
            const prev = 'من مشکل ندا';
            const next = 'نداشتیم جلسه دیروز';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'من مشکل نداشتیم جلسه دیروز');
            assert.ok(!merged.includes('ندا نداشتیم'), 'Truncated word "ندا" must be replaced with "نداشتیم"');
        });

        it('does not drop short reactions like "نه" when previous text ends with word ending in those letters (e.g. خانه)', () => {
            const prev = 'من میرم خانه';
            const next = 'نه من نمیام';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'من میرم خانه نه من نمیام');

            const prev2 = 'من رفتم خانه';
            const next2 = 'نه';
            const merged2 = mergeConsecutiveTexts(prev2, next2);
            assert.equal(merged2, 'من رفتم خانه نه');
        });

        it('does not swallow short sentences like "او" when next text starts with word beginning with those letters (e.g. اوضاع)', () => {
            const prev = 'او';
            const next = 'اوضاع خیلی خوبه';
            const merged = mergeConsecutiveTexts(prev, next);
            assert.equal(merged, 'او اوضاع خیلی خوبه');
        });
    });

    describe('deduplicateMeetingMessages - complex multi-turn Persian conversations', () => {
        it('preserves complete words across rapid streaming Persian turns without fragment loss', () => {
            const t0 = new Date('2026-10-24T10:00:00Z').getTime();
            const rawMessages = [
                // Speaker 0 says sentence in progressive streaming frames
                { actorIndex: 0, text: 'من تصویرم', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'من تصویرم رو قطع میکنم', timestamp: new Date(t0 + 500).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'من تصویرم رو قطع میکنم چون اینترنت ضعیفه', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' },
                // Speaker 1 responds with "ندا"
                { actorIndex: 1, text: 'ندا', timestamp: new Date(t0 + 1500).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'ندا جان شما صدای منو داری؟', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
                // Speaker 2 confirms
                { actorIndex: 2, text: 'بله صدای شما کاملاً واضحه', timestamp: new Date(t0 + 3000).toISOString(), type: 'caption' },
                // Speaker 1 continues
                { actorIndex: 1, text: 'خب پس بریم سراغ دستور جلسه بعدی', timestamp: new Date(t0 + 4000).toISOString(), type: 'caption' },
            ];

            const cleaned = deduplicateMeetingMessages(rawMessages);

            // Should have 4 final complete messages
            assert.equal(cleaned.length, 4);

            // Speaker 0 complete message
            assert.equal(cleaned[0].actorIndex, 0);
            assert.equal(cleaned[0].text, 'من تصویرم رو قطع میکنم چون اینترنت ضعیفه');

            // Speaker 1 first turn with "ندا جان" complete
            assert.equal(cleaned[1].actorIndex, 1);
            assert.equal(cleaned[1].text, 'ندا جان شما صدای منو داری؟');

            // Speaker 2 confirmation
            assert.equal(cleaned[2].actorIndex, 2);
            assert.equal(cleaned[2].text, 'بله صدای شما کاملاً واضحه');

            // Speaker 1 second turn
            assert.equal(cleaned[3].actorIndex, 1);
            assert.equal(cleaned[3].text, 'خب پس بریم سراغ دستور جلسه بعدی');
        });

        it('does not drop intermediate fragments or trim words prematurely', () => {
            const t0 = new Date('2026-10-24T11:00:00Z').getTime();
            const transcript = [
                { actorIndex: 0, text: 'ما بررسی کردیم و متوجه شدیم', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'ما بررسی کردیم و متوجه شدیم که نیازی به تغییر دیتابیس نداریم', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'خیلی عالیه ممنون از پیگیری', timestamp: new Date(t0 + 3000).toISOString(), type: 'caption' },
            ];

            const result = deduplicateMeetingMessages(transcript);
            assert.equal(result.length, 2);
            assert.equal(result[0].text, 'ما بررسی کردیم و متوجه شدیم که نیازی به تغییر دیتابیس نداریم');
            assert.equal(result[1].text, 'خیلی عالیه ممنون از پیگیری');
        });

        it('cleans up in-progress truncated word frames when completed message arrives', () => {
            const t0 = new Date('2026-10-24T12:00:00Z').getTime();
            const transcript = [
                { actorIndex: 0, text: 'من مشکل ندا', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'من مشکل ندارم جلسه بعد صحبت میکنیم', timestamp: new Date(t0 + 800).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'سلام چطو', timestamp: new Date(t0 + 1500).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'سلام چطورین خوبین', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
            ];

            const result = deduplicateMeetingMessages(transcript);
            assert.equal(result.length, 2);
            assert.equal(result[0].text, 'من مشکل ندارم جلسه بعد صحبت میکنیم');
            assert.equal(result[1].text, 'سلام چطورین خوبین');
        });

        it('cleans up in-progress truncated word frames with length difference > 3 (e.g. ندا -> نداشتیم and تصو -> تصویرمون)', () => {
            const t0 = new Date('2026-10-24T12:00:00Z').getTime();
            const transcript = [
                { actorIndex: 0, text: 'من مشکل ندا', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'من مشکل نداشتیم جلسه دیروز در شرکت', timestamp: new Date(t0 + 800).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'تصو', timestamp: new Date(t0 + 1500).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'تصویرمون قطع شده بود', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
            ];

            const result = deduplicateMeetingMessages(transcript);
            assert.equal(result.length, 2);
            assert.equal(result[0].text, 'من مشکل نداشتیم جلسه دیروز در شرکت');
            assert.equal(result[1].text, 'تصویرمون قطع شده بود');
        });
    });
});
