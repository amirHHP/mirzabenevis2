import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeForComparison,
    wordsMatch,
    isTruncatedStem,
    lcsWordMatchCount,
    classifyTextRelationship,
    mergeCaptionMessages,
    deduplicateMeetingMessages,
    mergeConsecutiveTexts,
} from '../modules/TranscriptDeduplicator.js';

describe('TranscriptDeduplicator', () => {
    describe('normalizeForComparison', () => {
        it('normalizes Persian punctuation and characters', () => {
            const raw = 'خوب، بریم آقا؟ بله؛ حتماً!';
            const norm = normalizeForComparison(raw);
            assert.equal(norm, 'خوب بریم آقا بله حتماً');
        });

        it('normalizes English punctuation and casing', () => {
            const raw = 'Hello, World! How are you doing?';
            const norm = normalizeForComparison(raw);
            assert.equal(norm, 'hello world how are you doing');
        });

        it('normalizes zero-width non-joiners and whitespace', () => {
            const raw = 'می\u200cکنم   و    می\u200bروم\u00a0اینجا';
            const norm = normalizeForComparison(raw);
            assert.equal(norm, 'می کنم و می روم اینجا');
        });

        it('handles null and undefined gracefully', () => {
            assert.equal(normalizeForComparison(null), '');
            assert.equal(normalizeForComparison(undefined), '');
            assert.equal(normalizeForComparison(''), '');
        });
    });

    describe('wordsMatch', () => {
        it('matches identical words', () => {
            assert.equal(wordsMatch('سلام', 'سلام'), true);
            assert.equal(wordsMatch('test', 'test'), true);
        });

        it('matches prefix stems such as Persian خوب / خوبه', () => {
            assert.equal(wordsMatch('خوب', 'خوبه'), true);
            assert.equal(wordsMatch('خوبه', 'خوب'), true);
        });

        it('does not treat long prefixes as the same word', () => {
            assert.equal(wordsMatch('ندا', 'نداشتیم'), false);
            assert.equal(wordsMatch('نداشتیم', 'ندا'), false);
            assert.equal(wordsMatch('تصو', 'تصویرمون'), false);
            assert.equal(wordsMatch('میخو', 'میخواستیم'), false);
            assert.equal(wordsMatch('سلام', 'سلامت'), false);
            assert.equal(isTruncatedStem('ندا', 'نداشتیم'), true);
            assert.equal(isTruncatedStem('تصو', 'تصویرمون'), true);
            assert.equal(isTruncatedStem('سلام', 'سلامت'), false);
            assert.equal(
                classifyTextRelationship('من مشکل ندا', 'من مشکل نداشتیم جلسه دیروز'),
                'extension'
            );
        });

        it('matches inflected verbs with common stems >= 3 chars such as میکنم / میکنند', () => {
            assert.equal(wordsMatch('میکنم', 'میکنند'), true);
            assert.equal(wordsMatch('میرود', 'میروند'), true);
            assert.equal(wordsMatch('نمیکی', 'نمیکردی'), true);
        });

        it('matches Persian colloquial truncated forms such as رب / ربع and من / منو', () => {
            assert.equal(wordsMatch('رب', 'ربع'), true);
            assert.equal(wordsMatch('ربع', 'رب'), true);
            assert.equal(wordsMatch('من', 'منو'), true);
            assert.equal(wordsMatch('منو', 'من'), true);
        });

        it('requires numbers to match strictly without false prefix stem matching', () => {
            assert.equal(wordsMatch('12', '12'), true);
            assert.equal(wordsMatch('12', '13'), false);
            assert.equal(wordsMatch('12', '123'), false);
            assert.equal(wordsMatch('۱۲', '۱۲'), true);
            assert.equal(wordsMatch('۱۲', '۱۳'), false);
            assert.equal(wordsMatch('۱۲', '۱۲۳'), false);
        });

        it('does not match unrelated words', () => {
            assert.equal(wordsMatch('سلام', 'خداحافظ'), false);
            assert.equal(wordsMatch('من', 'تو'), false);
            assert.equal(wordsMatch('دانشگاه', 'دانمارک'), false);
            assert.equal(wordsMatch('president', 'presentation'), false);
            assert.equal(wordsMatch('catastrophe', 'category'), false);
            assert.equal(wordsMatch('car', 'carpet'), false);
            assert.equal(wordsMatch('نهار', 'نه'), false);
            assert.equal(wordsMatch('منوچهر', 'من'), false);
        });
    });

    describe('lcsWordMatchCount', () => {
        it('computes exact LCS match count for identical or subset word arrays', () => {
            const a = ['ما', 'صداتو', 'میشنیدیم'];
            const b = ['ما', 'هم', 'صداتو', 'میشنیدیم'];
            assert.equal(lcsWordMatchCount(a, b), 3);
            assert.equal(lcsWordMatchCount(b, a), 3);
        });

        it('handles stem revisions via wordsMatch in LCS alignment', () => {
            const a = ['من', 'تصویرمو', 'قطع', 'میکنند'];
            const b = ['من', 'هم', 'تصویرمو', 'قطع', 'میکنم'];
            assert.equal(lcsWordMatchCount(a, b), 4);
        });

        it('returns 0 for empty arrays or disjoint words', () => {
            assert.equal(lcsWordMatchCount([], ['سلام']), 0);
            assert.equal(lcsWordMatchCount(['سلام'], []), 0);
            assert.equal(lcsWordMatchCount(['سلام', 'خوبی'], ['خداحافظ', 'فردا']), 0);
        });
    });

    describe('classifyTextRelationship', () => {
        it('detects duplicate text with punctuation variance', () => {
            const rel1 = classifyTextRelationship('سلام دوستان', 'سلام دوستان.');
            assert.equal(rel1, 'duplicate');

            const rel2 = classifyTextRelationship('خوب، بریم؟', 'خوب بریم');
            assert.equal(rel2, 'duplicate');
        });

        it('detects direct prefix extensions in Persian and English', () => {
            const rel1 = classifyTextRelationship('من تصویرمو', 'من تصویرمو قطع میکنم');
            assert.equal(rel1, 'extension');

            const rel2 = classifyTextRelationship('hello world', 'hello world how are you');
            assert.equal(rel2, 'extension');
        });

        it('detects extensions when streaming STT inserts particles or words', () => {
            // "ما صداتو میشنیدیم" -> "ما هم صداتو میشنیدیم" (particle "هم" inserted)
            const rel1 = classifyTextRelationship(
                'ما صداتو میشنیدیم',
                'ما هم صداتو میشنیدیم'
            );
            assert.equal(rel1, 'extension');

            // "این فیلم دیدی" -> "این فیلم رو دیدی" (particle "رو" inserted)
            const rel2 = classifyTextRelationship(
                'این فیلم دیدی',
                'این فیلم رو دیدی'
            );
            assert.equal(rel2, 'extension');

            // Extended with both particle insertion and continuation
            const rel3 = classifyTextRelationship(
                'این فیلم دیدی',
                'این فیلم رو دیدی دیروز تو سینما'
            );
            assert.equal(rel3, 'extension');

            // Persian text beginning with digits
            const rel4 = classifyTextRelationship(
                '۱۲ ربع زدی',
                '۱۲ ربع زدی بابا'
            );
            assert.equal(rel4, 'extension');

            // Colloquial truncation revision from screenshot: "۱۲ رب" -> "۱۲ ربع زدی بابا"
            const rel5 = classifyTextRelationship(
                '۱۲ رب',
                '۱۲ ربع زدی بابا'
            );
            assert.equal(rel5, 'extension');

            // Mixed Persian and English code-switching starting with Persian digits
            const rel6 = classifyTextRelationship(
                '۱۲ تا PR مرج شد',
                '۱۲ تا PR مرج شد امروز صبح'
            );
            assert.equal(rel6, 'extension');
        });

        it('detects subsumed shorter frames even when words shift positions', () => {
            const rel = classifyTextRelationship(
                'ما هم صداتو میشنیدیم کامل',
                'ما صداتو میشنیدیم'
            );
            assert.equal(rel, 'subsumed');
        });

        it('detects extensions with streaming STT revisions in Persian', () => {
            // "خوبه" -> "خوب،" revision and sentence extension
            const rel1 = classifyTextRelationship(
                'خوبه بریم آقا؟ بریم این دفاع کنیم امیر به',
                'خوب، بریم آقا؟ بریم این دفاع کنیم امیر به تو'
            );
            assert.equal(rel1, 'extension');

            // "میکنند" -> "میکنم" verb revision and sentence extension
            const rel2 = classifyTextRelationship(
                'من تصویرمو قطع میکنند عذر میخوام',
                'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم'
            );
            assert.equal(rel2, 'extension');
        });

        it('detects subsumed shorter frames', () => {
            const rel = classifyTextRelationship(
                'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم',
                'من تصویرمو قطع میکنم عذر میخوام'
            );
            assert.equal(rel, 'subsumed');
        });

        it('detects distinct, unrelated sentences (sentence change / shrink)', () => {
            const rel1 = classifyTextRelationship(
                'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم',
                'من گفتم مگه چی گفتم'
            );
            assert.equal(rel1, 'none');

            const rel2 = classifyTextRelationship(
                'سلام دوستان روزتون بخیر',
                'پروپوزال رو آماده کردید؟'
            );
            assert.equal(rel2, 'none');

            // Word-boundary: "من" is not an extension of "منوچهر" and "نه" is not subsumed by "نهار خوردی"
            const rel3 = classifyTextRelationship('من', 'منوچهر آمد');
            assert.equal(rel3, 'none');

            // Distinct equal-length sentences sharing >= 70% words must NOT overwrite each other
            const rel5 = classifyTextRelationship('من به علی گفتم', 'من به رضا گفتم');
            assert.equal(rel5, 'none');

            // Stem-revision equal-length sentences DO qualify as extension
            const rel6 = classifyTextRelationship('خوب بریم', 'خوبه بریم');
            assert.equal(rel6, 'extension');
        });
    });

    describe('mergeConsecutiveTexts', () => {
        it('merges exact duplicates into a single text', () => {
            assert.equal(mergeConsecutiveTexts('سلام', 'سلام'), 'سلام');
            assert.equal(mergeConsecutiveTexts('سلام خوبی؟', 'سلام خوبی.'), 'سلام خوبی.');
        });

        it('handles prefix extensions cleanly without duplication', () => {
            assert.equal(
                mergeConsecutiveTexts('سلام', 'سلام وقتتون بخیر'),
                'سلام وقتتون بخیر'
            );
        });

        it('handles suffix containment without duplication', () => {
            assert.equal(
                mergeConsecutiveTexts('سلام وقتتون بخیر', 'وقتتون بخیر'),
                'سلام وقتتون بخیر'
            );
        });

        it('merges boundary-overlapping phrases', () => {
            assert.equal(
                mergeConsecutiveTexts('سلام خوبی', 'خوبی جلسه شروع شد'),
                'سلام خوبی جلسه شروع شد'
            );
        });

        it('merges rolling STT spans across Google Meet line roll-off', () => {
            const span1 = 'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم';
            const span2 = 'و جلسه رو برگزار میکنیم فردا هم تعطیله';
            assert.equal(
                mergeConsecutiveTexts(span1, span2),
                'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم فردا هم تعطیله'
            );
        });

        it('joins distinct non-overlapping sentences with space', () => {
            assert.equal(
                mergeConsecutiveTexts('من رفتم', 'او آمد'),
                'من رفتم او آمد'
            );
        });

        it('handles empty or null inputs gracefully', () => {
            assert.equal(mergeConsecutiveTexts('', 'سلام'), 'سلام');
            assert.equal(mergeConsecutiveTexts('سلام', ''), 'سلام');
            assert.equal(mergeConsecutiveTexts(null, 'سلام'), 'سلام');
            assert.equal(mergeConsecutiveTexts('سلام', null), 'سلام');
        });
    });

    describe('mergeCaptionMessages', () => {
        it('merges single speaker incremental captions with replacePrefix', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').toISOString();
            const t1 = new Date('2026-10-06T10:00:02Z').toISOString();

            let messages = [];
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'سلام', timestamp: t0, type: 'caption' },
            ], true);
            assert.equal(messages.length, 1);
            assert.equal(messages[0].text, 'سلام');

            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'سلام دوستان عزیز', timestamp: t1, type: 'caption' },
            ], true);
            assert.equal(messages.length, 1);
            assert.equal(messages[0].text, 'سلام دوستان عزیز');
        });

        it('handles interleaving speakers and preserves chronological order', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();

            // A speaks partial: "من"
            let messages = mergeCaptionMessages([], [
                { actorIndex: 0, text: 'من', timestamp: new Date(t0).toISOString(), type: 'caption' }
            ], true);

            // B speaks: "خوبه بریم آقا؟"
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 1, text: 'خوبه بریم آقا؟', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' }
            ], true);

            // A completes sentence: "من تصویرمو قطع میکنم"
            // Must remove A's obsolete "من", keep B, and append A's complete sentence at end
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'من تصویرمو قطع میکنم', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' }
            ], true);

            assert.equal(messages.length, 2);
            assert.equal(messages[0].actorIndex, 1);
            assert.equal(messages[0].text, 'خوبه بریم آقا؟');
            assert.equal(messages[1].actorIndex, 0);
            assert.equal(messages[1].text, 'من تصویرمو قطع میکنم');
        });

        it('does not remove earlier messages if outside the 30-second window', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();
            const t1 = t0 + 45000; // 45 seconds later

            let messages = mergeCaptionMessages([], [
                { actorIndex: 0, text: 'بله', timestamp: new Date(t0).toISOString(), type: 'caption' },
            ], true);

            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'بله درسته', timestamp: new Date(t1).toISOString(), type: 'caption' },
            ], true);

            // Because > 30s elapsed, the earlier "بله" was an independent past utterance
            assert.equal(messages.length, 2);
            assert.equal(messages[0].text, 'بله');
            assert.equal(messages[1].text, 'بله درسته');
        });

        it('preserves short answers and reactions across intervening speakers', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();

            let messages = [
                { actorIndex: 0, text: 'بله درسته آقا', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'آیا فردا میایی؟', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
            ];

            // Actor 0 answers "بله" to Actor 1's question
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'بله', timestamp: new Date(t0 + 4000).toISOString(), type: 'caption' },
            ], true, 30000);

            // Must preserve all 3 messages - "بله" must not be dropped as subsumed by "بله درسته آقا"
            assert.equal(messages.length, 3);
            assert.equal(messages[0].text, 'بله درسته آقا');
            assert.equal(messages[1].text, 'آیا فردا میایی؟');
            assert.equal(messages[2].text, 'بله');
        });

        it('preserves repeated answers or greetings across intervening speakers', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();

            let messages = [
                { actorIndex: 0, text: 'سلام', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'سلام خوبی؟', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' },
            ];

            // Actor 0 responds "سلام"
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'سلام', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
            ], true, 30000);

            assert.equal(messages.length, 3);
            assert.equal(messages[2].actorIndex, 0);
            assert.equal(messages[2].text, 'سلام');
        });

        it('ignores out-of-order subsumed frames and exact duplicates', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();

            let messages = mergeCaptionMessages([], [
                { actorIndex: 0, text: 'جلسه شروع شد', timestamp: new Date(t0).toISOString(), type: 'caption' },
            ], true);

            // Exact duplicate with punctuation
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'جلسه شروع شد.', timestamp: new Date(t0 + 500).toISOString(), type: 'caption' },
            ], true);
            assert.equal(messages.length, 1);

            // Shorter partial frame arriving late
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'جلسه شروع', timestamp: new Date(t0 + 800).toISOString(), type: 'caption' },
            ], true);
            assert.equal(messages.length, 1);
            assert.equal(messages[0].text, 'جلسه شروع شد');
        });

        it('preserves short affirmative answers across intervening questions', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();

            let messages = [
                { actorIndex: 0, text: 'آیا موافقی؟', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'بله', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'فردا ساعت چند بریم؟', timestamp: new Date(t0 + 10000).toISOString(), type: 'caption' },
            ];

            // Actor 1 answers the second question with a longer sentence starting with "بله"
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 1, text: 'بله ساعت ۵ خوبه', timestamp: new Date(t0 + 12000).toISOString(), type: 'caption' },
            ], true, 30000);

            // Actor 1's initial "بله" answer to the first question must NOT be deleted!
            assert.equal(messages.length, 4);
            assert.equal(messages[0].text, 'آیا موافقی؟');
            assert.equal(messages[1].text, 'بله');
            assert.equal(messages[2].text, 'فردا ساعت چند بریم؟');
            assert.equal(messages[3].text, 'بله ساعت ۵ خوبه');
        });

        it('handles rapid cross-talk where two participants speak alternately within 1-second intervals', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();

            let messages = [];
            const crossTalk = [
                { actorIndex: 0, text: 'سلام', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'سلام', timestamp: new Date(t0 + 500).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'خوبی؟', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'خوبم ممنون', timestamp: new Date(t0 + 1500).toISOString(), type: 'caption' },
            ];

            crossTalk.forEach(msg => {
                messages = mergeCaptionMessages(messages, [msg], true, 30000);
            });

            assert.equal(messages.length, 4);
            assert.equal(messages[0].text, 'سلام');
            assert.equal(messages[1].text, 'سلام');
            assert.equal(messages[2].text, 'خوبی؟');
            assert.equal(messages[3].text, 'خوبم ممنون');
        });

        it('preserves non-caption messages', () => {
            let messages = [
                { actorIndex: 0, text: 'System started', type: 'system' },
            ];
            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'First caption', type: 'caption' },
            ], true);

            assert.equal(messages.length, 2);
            assert.equal(messages[0].type, 'system');
            assert.equal(messages[1].type, 'caption');
        });

        it('does not replace previous message if elapsed time > 12s for immediately preceding message from same speaker', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();
            const t1 = t0 + 15000; // 15s later

            let messages = mergeCaptionMessages([], [
                { actorIndex: 0, text: 'سلام', timestamp: new Date(t0).toISOString(), type: 'caption' },
            ], true);

            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'سلام دوستان عزیز', timestamp: new Date(t1).toISOString(), type: 'caption' },
            ], true);

            // Because > 12s elapsed, "سلام" was an independent past sentence and must be preserved
            assert.equal(messages.length, 2);
            assert.equal(messages[0].text, 'سلام');
            assert.equal(messages[1].text, 'سلام دوستان عزیز');
        });

        it('preserves distinct equal-length sentences spoken consecutively by same speaker', () => {
            const t0 = new Date('2026-10-06T10:00:00Z').getTime();

            let messages = mergeCaptionMessages([], [
                { actorIndex: 0, text: 'من به علی گفتم', timestamp: new Date(t0).toISOString(), type: 'caption' },
            ], true);

            messages = mergeCaptionMessages(messages, [
                { actorIndex: 0, text: 'من به رضا گفتم', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
            ], true);

            assert.equal(messages.length, 2);
            assert.equal(messages[0].text, 'من به علی گفتم');
            assert.equal(messages[1].text, 'من به رضا گفتم');
        });
    });

    describe('deduplicateMeetingMessages against full Persian meeting dataset', () => {
        it('cleans the exact stuttered meeting sequence from the user report', () => {
            const t0 = new Date('2026-10-06T10:06:00Z').getTime();

            // The exact sequence of captions captured in the user screenshot
            const pollutedTranscript = [
                { actorIndex: 0, text: 'من', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'خوبه بریم آقا؟ بریم این دفاع کنیم امیر به', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'من تصویرمو قطع میکنند عذر میخوام', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'خوب، بریم آقا؟ بریم این دفاع کنیم امیر به تو', timestamp: new Date(t0 + 3000).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم', timestamp: new Date(t0 + 4000).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'من گفتم مگه چی گفتم گفتم بزا بریم کی گفتم خداحافظ من منظورم این نیست جلسه رو تموم کنیم اول متوجه شد جمله بعد منظورم این که بیا بریم', timestamp: new Date(t0 + 5000).toISOString(), type: 'caption' },
                { actorIndex: 2, text: 'پروپوزال صحبت میکنیم', timestamp: new Date(t0 + 6000).toISOString(), type: 'caption' },
                { actorIndex: 2, text: 'پارسی گیم خب اون میتونه یه جور دیگه باشه', timestamp: new Date(t0 + 7000).toISOString(), type: 'caption' },
                { actorIndex: 2, text: 'سرویسش', timestamp: new Date(t0 + 8000).toISOString(), type: 'caption' },
                { actorIndex: 2, text: 'یعنی آخرش تحلیل داده میشه به یک کسی دیگه این از بین میره', timestamp: new Date(t0 + 9000).toISOString(), type: 'caption' },
                { actorIndex: 2, text: 'چی', timestamp: new Date(t0 + 10000).toISOString(), type: 'caption' },
                { actorIndex: 2, text: 'آها خب نه دیگه الان انگار که یک تیم اتک وجود داره که هست ها هر جوری بشن تیم است بنابراین تو نمیتونی بگی که آقا این تحویل تیم اتکار میشه همینجوری که تیم پروژه هم داره میگیره پروژه فلان هم داره اصلا نگهداری دیتا وجود داره در اینجا حالا میتوانیم اذن تعریف کنیم ما خیلی دیور پیچیده میشه یعنی ما باید ماه های آینده را هم ببینیم بگید ببین من پیش بینی میکنم اینجوری میشه و بعد این اتفاق می افتد میتوانم بگین این کار خیلی سبکه دستمش هم که میخواد بره سمت فروش فقط اون تیکتون میمونه', timestamp: new Date(t0 + 11000).toISOString(), type: 'caption' },
                { actorIndex: 0, text: 'آره منم میخواستم بگم همونو بنویس چرا بیچارگی رو بردی بالا لامصب', timestamp: new Date(t0 + 12000).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'یا امیر بودی من که خودم نظرم مثبته یعنی اوکی', timestamp: new Date(t0 + 13000).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'نه اتک همه وایستن عرفان این همه', timestamp: new Date(t0 + 14000).toISOString(), type: 'caption' },
                { actorIndex: 1, text: 'من گفتم مگه چی گفتم گفتم بزا بریم کی گفتم خداحافظ من منظورم این نیست جلسه رو تموم کنیم اول متوجه شد جمله بعد منظورم این که بیا بریم ته میگه ببین دیگه تو این جمله را گفتی من در جواب گفتم خب بیا بریم رو همون وایسا دفاع کنیم', timestamp: new Date(t0 + 15000).toISOString(), type: 'caption' },
            ];

            const cleaned = deduplicateMeetingMessages(pollutedTranscript);

            // Verifications:
            // 1. Initial "من" fragment is removed
            assert.equal(cleaned.some(m => m.actorIndex === 0 && m.text === 'من'), false);

            // 2. Partial "خوبه بریم آقا؟ بریم این دفاع کنیم امیر به" is removed
            assert.equal(cleaned.some(m => m.text === 'خوبه بریم آقا؟ بریم این دفاع کنیم امیر به'), false);

            // 3. Intermediate "من تصویرمو قطع میکنند عذر میخوام" is removed
            assert.equal(cleaned.some(m => m.text === 'من تصویرمو قطع میکنند عذر میخوام'), false);

            // 4. Salar's earlier sentence is extended cleanly by his later expanded paragraph
            assert.equal(cleaned.some(m => m.text.includes('دستتون بیشتر از این نگه دارم')), true);
            assert.equal(cleaned.some(m => m.text.includes('خوب، بریم آقا؟ بریم این دفاع کنیم امیر به تو')), true);
            assert.equal(cleaned.some(m => m.text.includes('ته میگه ببین دیگه تو این جمله را گفتی')), true);

            // 5. Original array must not be mutated
            assert.equal(pollutedTranscript.length, 16);
            assert.ok(cleaned.length < pollutedTranscript.length);
        });

        it('cleans the latest live meeting sequence from user screenshot (12:24 PM session)', () => {
            const t0 = new Date('2026-10-18T12:24:00Z').getTime();

            // The dialogue captured in the latest user screenshot
            // Actor 0: Safa Vahidafshar
            // Actor 1: You
            const rawSession = [
                // Safa partial STT frame followed by complete utterance
                { actorIndex: 0, text: '۱۲ و نیم ببخشید سلام کاش میوت نمیکی که ما هم صداتو', timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 0, text: '۱۲ و نیم ببخشید سلام کاش میوت نمیکی که ما هم صداتو میشنیدیم', timestamp: new Date(t0 + 1000).toISOString(), type: 'caption' },
                // You responds
                { actorIndex: 1, text: 'سلام میگم چی ۱۲ و نیمه', timestamp: new Date(t0 + 2000).toISOString(), type: 'caption' },
                // Safa replies
                { actorIndex: 0, text: 'این جلسه', timestamp: new Date(t0 + 3000).toISOString(), type: 'caption' },
                // You confirms
                { actorIndex: 1, text: 'باشه', timestamp: new Date(t0 + 4000).toISOString(), type: 'caption' },
                // You starts speaking next clause: STT produces truncated "۱۲ رب"
                { actorIndex: 1, text: '۱۲ رب', timestamp: new Date(t0 + 5000).toISOString(), type: 'caption' },
                // Safa apologizes
                { actorIndex: 0, text: 'همین دیر کردم ببخشید', timestamp: new Date(t0 + 6000).toISOString(), type: 'caption' },
                // You completes the thought with correct spelling: "۱۲ ربع زدی بابا"
                { actorIndex: 1, text: '۱۲ ربع زدی بابا', timestamp: new Date(t0 + 7000).toISOString(), type: 'caption' },
                // Safa explains
                { actorIndex: 0, text: 'میگم من فکر کردم ۱۲ و نیمه خودم دوازده رب زدم', timestamp: new Date(t0 + 8000).toISOString(), type: 'caption' },
                // You reacts
                { actorIndex: 1, text: 'تو فکر کردی', timestamp: new Date(t0 + 9000).toISOString(), type: 'caption' },
                // Safa replies
                { actorIndex: 0, text: 'آره یعنی نه مثل تو فکر بزرگی ندارم که', timestamp: new Date(t0 + 10000).toISOString(), type: 'caption' },
                // You answers
                { actorIndex: 1, text: 'آره همون افکار کوچیک ما رو رسونده اینجا', timestamp: new Date(t0 + 11000).toISOString(), type: 'caption' },
                // Safa changes topic
                { actorIndex: 0, text: 'این فیلم دیدی', timestamp: new Date(t0 + 12000).toISOString(), type: 'caption' },
            ];

            const cleaned = deduplicateMeetingMessages(rawSession);

            // 1. Initial partial frame of Safa's message is removed
            assert.equal(cleaned.some(m => m.text === '۱۲ و نیم ببخشید سلام کاش میوت نمیکی که ما هم صداتو'), false);
            assert.equal(cleaned.some(m => m.text === '۱۲ و نیم ببخشید سلام کاش میوت نمیکی که ما هم صداتو میشنیدیم'), true);

            // 2. Truncated "۱۲ رب" is replaced by complete "۱۲ ربع زدی بابا"
            assert.equal(cleaned.some(m => m.text === '۱۲ رب'), false);
            assert.equal(cleaned.some(m => m.text === '۱۲ ربع زدی بابا'), true);

            // 3. Independent affirmative "باشه" is preserved
            assert.equal(cleaned.some(m => m.text === 'باشه'), true);

            // 4. All conversation turns remain intact
            assert.equal(cleaned.some(m => m.text === 'سلام میگم چی ۱۲ و نیمه'), true);
            assert.equal(cleaned.some(m => m.text === 'این جلسه'), true);
            assert.equal(cleaned.some(m => m.text === 'همین دیر کردم ببخشید'), true);
            assert.equal(cleaned.some(m => m.text === 'این فیلم دیدی'), true);
        });

        it('cleans the extended streaming monologue from user report without repetition or paragraph duplication', () => {
            const t0 = new Date('2026-11-12T18:02:00Z').getTime();

            const p1 = 'اوکی ببین من از یه حدود دو سه ماه پیش دو ماه پیش حدود';
            const p2 = 'اوکی ببین من از یه حدود دو سه ماه پیش حدودا به بچه ها جوین شدم بابت اینکه خب این کار استیلا و اینا رو انجام داده بودیم و یه مقداری شرکت دچار وضعیت ترنزیشن دچار یه سری بحران ها شده بود دیگه که خیلی هم طبیعیه که مثلاً حالا بچه';
            const p3 = 'اوکی ببین من از یه حدود دو سه ماه پیش حدودا به بچه ها جوین شدم بابت اینکه خب این کار استیلا و اینا رو انجام داده بودیم و یه مقداری شرکت دچار وضعیت ترنزیشن دچار یه سری بحران ها شده بود دیگه که خیلی هم طبیعیه که مثلاً حالا مدل جدید بچه ها جا بیفته استیم چجوری بشه جا بیفته و حالا همه این اتفاقایی که افتاده من به بچه ها شدم که یه مقداری کمک بکنم که یه ذره اینا رو با هم فکر کنیم از نظر ارگانیزیشن درستش بکنیم و جوین شدنم هم خیلی به صورت چون منم نیستم و اختلاف ساعتمون هم زیاده و اینها به صورت مثلاً ۳۰ ۴۰ ساعت در ماهه و بیشتر من به صورت یه مثلاً یه ذه';
            const p4 = 'اوکی ببین من از یه حدود دو سه ماه پیش حدودا به بچه ها جوین شدم بابت اینکه خب این کار استیلا و اینا رو انجام داده بودیم و یه مقداری شرکت دچار وضعیت ترنزیشن دچار یه سری بحران ها شده بود دیگه که خیلی هم طبیعیه که مثلاً حالا مدل جدید بچه ها جا بیفته استیم چجوری بشه جا بیفته و حالا همه این اتفاقایی که افتاده من به بچه ها شدم که یه مقداری کمک بکنم که یه ذره اینا رو با هم فکر کنیم از نظر ارگانیزیشن درستش بکنیم و جوین شدنم هم خیلی به صورت چون منم نیستم و اختلاف ساعتمون هم زیاده و اینها به صورت مثلاً ۳۰ ۴۰ ساعت در ماهه و بیشتر من به صورت یه مثلاً یه ذهنی یه ور دیگه با هم برین استور کنیم با هم بسازیم تا اینکه مثلا من بگم چیکار بکنم مثلا این مدلی نیست که من بیام بگم شما این کار را بکنید و برود و اینا بیشتر اینه که مثلا رو بیارم بچه ها ما با هم صحبت کنیم چیزی که به نظر من میرسه رو بیاریم چکش کاری کنیم به یه سوشن برسیم یعنی این مدلیه کاری که داره میکنه من با صفا با من صحبت کرد و قرار شد که من باهات صحبت کنم حالا یه هیستوری از اینکه مشغول چه کاری بودی و چی شده و سی ان چی شده';

            // Verify classification recognizes incremental revisions and extensions
            assert.equal(classifyTextRelationship(p1, p2), 'extension');
            assert.equal(classifyTextRelationship(p2, p3), 'extension');
            assert.equal(classifyTextRelationship(p3, p4), 'extension');

            // Verify mergeConsecutiveTexts returns the complete text rather than duplicating
            assert.equal(mergeConsecutiveTexts(p1, p2), p2);
            assert.equal(mergeConsecutiveTexts(p2, p3), p3);
            assert.equal(mergeConsecutiveTexts(p3, p4), p4);

            const streamMessages = [
                { actorIndex: 0, text: p1, timestamp: new Date(t0).toISOString(), type: 'caption' },
                { actorIndex: 0, text: p2, timestamp: new Date(t0 + 13000).toISOString(), type: 'caption' },
                { actorIndex: 0, text: p3, timestamp: new Date(t0 + 26000).toISOString(), type: 'caption' },
                { actorIndex: 0, text: p4, timestamp: new Date(t0 + 39000).toISOString(), type: 'caption' },
            ];

            const cleaned = deduplicateMeetingMessages(streamMessages);
            assert.equal(cleaned.length, 1, 'Incremental chunks must be merged into 1 clean message');
            assert.equal(cleaned[0].text, p4);
        });

        it('handles empty and null arrays gracefully', () => {
            assert.deepEqual(deduplicateMeetingMessages([]), []);
            assert.deepEqual(deduplicateMeetingMessages(null), []);
            assert.deepEqual(deduplicateMeetingMessages(undefined), []);
        });
    });
});
