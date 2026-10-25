/**
 * TranscriptDeduplicator.js
 *
 * Core deduplication and normalization engine for MirzaBenevis.
 * Cleans streaming speech-to-text (STT) fragments, punctuation updates,
 * speaker interleaving artifacts, and stuttered captions.
 */

/**
 * Normalizes text for comparison by:
 * - Lowercasing
 * - Stripping all Unicode punctuation and symbols (e.g. ، ؟ . ! etc.)
 * - Normalizing zero-width non-joiners (\u200c), zero-width spaces (\u200b), and non-breaking spaces (\u00a0)
 * - Collapsing multiple whitespace characters into a single ASCII space
 */
function normalizeForComparison(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[\p{P}\p{S}]/gu, ' ')
        .replace(/[\u200c\u200b\u00a0]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Determines whether two words are considered a match in streaming STT:
 * - Exact equality
 * - A one-character colloquial extension of a short word (e.g. "خوب" vs "خوبه")
 * - A shared stem when the lengths are close (e.g. "میکنند" vs "میکنم")
 * Long prefixes such as "سلام"/"سلامت" or "ندا"/"نداشتیم" are not the same word.
 * Those are handled only as an in-order streaming completion.
 */
function wordsMatch(w1, w2) {
    if (w1 === w2) return true;
    if (!w1 || !w2) return false;

    // Numbers must match exactly to prevent false stem matches (e.g. 12 vs 123)
    const hasDigits = /[\d\u0660-\u0669\u06F0-\u06F9]/.test(w1) || /[\d\u0660-\u0669\u06F0-\u06F9]/.test(w2);
    if (hasDigits) return w1 === w2;

    const minLen = Math.min(w1.length, w2.length);
    const maxLen = Math.max(w1.length, w2.length);
    if (minLen < 2) return false;

    let common = 0;
    while (common < minLen && w1[common] === w2[common]) {
        common++;
    }

    if (minLen === 2) {
        // For 2-letter words, match if both letters match and maxLen <= 3 (e.g. رب vs ربع, من vs منو)
        return common === 2 && maxLen <= 3;
    }

    // Pure prefix: only a one-character colloquial tail on a short word (خوب / خوبه).
    if (common === minLen && maxLen > minLen) {
        return maxLen - minLen === 1 && minLen <= 3;
    }

    if (Math.abs(w1.length - w2.length) > 3) return false;

    // Must share a significant common stem covering most of the shorter word and good ratio of maxLen
    return common >= 3 && common >= minLen - 2 && (common / maxLen) >= 0.55;
}

/**
 * True when `shorter` is an unfinished streaming fragment of `longer`
 * (ندا -> نداشتیم). Not used for ordinary word equality.
 */
function isTruncatedStem(shorter, longer) {
    if (!shorter || !longer || shorter === longer) return false;
    if (shorter.length < 3 || longer.length - shorter.length < 2) return false;
    const hasDigits = /[\d\u0660-\u0669\u06F0-\u06F9]/.test(shorter) || /[\d\u0660-\u0669\u06F0-\u06F9]/.test(longer);
    if (hasDigits) return false;
    if (!/[^\x00-\x7F]/.test(shorter) && !/[^\x00-\x7F]/.test(longer)) return false;
    return longer.startsWith(shorter);
}

function coversInOrder(shorterWords, longerWords) {
    if (!shorterWords.length || longerWords.length < shorterWords.length) return false;
    for (let i = 0; i < shorterWords.length; i++) {
        const a = shorterWords[i];
        const b = longerWords[i];
        if (a === b || wordsMatch(a, b) || isTruncatedStem(a, b)) continue;
        return false;
    }
    return true;
}

/**
 * Computes the Longest Common Subsequence (LCS) match count between two word arrays,
 * using wordsMatch to accommodate streaming STT stem variants and minor inflections.
 */
function lcsWordMatchCount(wordsA, wordsB) {
    const m = wordsA.length;
    const n = wordsB.length;
    if (m === 0 || n === 0) return 0;

    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            if (wordsMatch(wordsA[i], wordsB[j])) {
                dp[i + 1][j + 1] = Math.max(dp[i][j] + 1, dp[i + 1][j], dp[i][j + 1]);
            } else {
                dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    return dp[m][n];
}

/**
 * Classifies the relationship between an older text and a newer text:
 * - 'duplicate': normalized text is identical
 * - 'extension': newer text extends/completes older text (older text is obsolete)
 * - 'subsumed': older text is already longer and covers newer text (newer text is an obsolete frame)
 * - 'none': texts represent distinct, unrelated utterances or new conversational turns
 */
function classifyTextRelationship(olderText, newerText) {
    const normOlder = normalizeForComparison(olderText);
    const normNewer = normalizeForComparison(newerText);
    if (!normOlder || !normNewer) return 'none';
    if (normOlder === normNewer) return 'duplicate';
    if (normNewer.startsWith(normOlder + ' ')) return 'extension';
    if (normOlder.startsWith(normNewer + ' ')) return 'subsumed';

    const olderWords = normOlder.split(' ').filter(Boolean);
    const newerWords = normNewer.split(' ').filter(Boolean);
    if (olderWords.length === 0 || newerWords.length === 0) return 'none';

    // Streaming growth keeps word order. A cut-off stem may complete in place
    // (ندا -> نداشتیم) and new words may follow. This does not match stems
    // that merely share a prefix somewhere else in the sentence.
    if (newerWords.length > olderWords.length && coversInOrder(olderWords, newerWords)) {
        return 'extension';
    }

    if (newerWords.length === olderWords.length) {
        // Equal length: must match 100% of words (including stem variants) to be an extension/revision
        const K = olderWords.length;
        const matchCount = lcsWordMatchCount(olderWords, newerWords);
        if (matchCount === K) {
            return 'extension';
        }
        return 'none';
    }

    if (newerWords.length > olderWords.length) {
        const K = olderWords.length;
        const matchCount = lcsWordMatchCount(olderWords, newerWords);
        const threshold = K <= 4 ? K : (K - 1);
        if (matchCount >= threshold && (matchCount / K) >= 0.8) {
            return 'extension';
        }
    } else {
        const K = newerWords.length;
        const matchCount = lcsWordMatchCount(olderWords, newerWords);
        const threshold = K <= 4 ? K : (K - 1);
        if (matchCount >= threshold && (matchCount / K) >= 0.8) {
            return 'subsumed';
        }
    }

    return 'none';
}

const STANDALONE_REACTIONS = new Set([
    'بله', 'آره', 'سلام', 'درود', 'خداحافظ', 'نه', 'مرسی', 'ممنون', 'متشکرم', 'باشه', 'اوکی', 'چشم', 'حتما', 'حتماً', 'درسته', 'دقیقا', 'دقیقاً', 'خوبه', 'ممنونم'
]);

/**
 * Merges two consecutive texts by eliminating boundary overlap, exact duplicates,
 * or substring subsumptions.
 */
function mergeConsecutiveTexts(prev, next) {
    const p = (prev || '').trim();
    const n = (next || '').trim();
    if (!p) return n;
    if (!n) return p;

    // Exact equality (ignoring punctuation/case)
    const normP = normalizeForComparison(p);
    const normN = normalizeForComparison(n);
    if (!normN) return p;
    if (!normP) return n;
    if (normP === normN) return n.length >= p.length ? n : p;

    // Full prefix or suffix containment at word boundaries
    if (normN.startsWith(normP + ' ')) {
        return n;
    }
    if (normP.startsWith(normN + ' ') || normP.endsWith(' ' + normN)) {
        return p;
    }

    // Word-based boundary overlap
    const pWords = p.split(/\s+/);
    const nWords = n.split(/\s+/);
    const maxOverlapWords = Math.min(pWords.length, nWords.length);
    let overlapCount = 0;

    for (let count = maxOverlapWords; count >= 1; count--) {
        const pSuffix = pWords.slice(pWords.length - count);
        const nPrefix = nWords.slice(0, count);

        let allMatch = true;
        for (let i = 0; i < count; i++) {
            const wP = normalizeForComparison(pSuffix[i]);
            const wN = normalizeForComparison(nPrefix[i]);
            const hasDigits = /[\d\u0660-\u0669\u06F0-\u06F9]/.test(wP) || /[\d\u0660-\u0669\u06F0-\u06F9]/.test(wN);
            if (count === 1) {
                const isCompletedPrefix = !hasDigits && (isTruncatedStem(wP, wN) || wordsMatch(wP, wN));
                if (wP !== wN && !isCompletedPrefix) {
                    allMatch = false;
                    break;
                }
            } else if (wP !== wN && !wordsMatch(wP, wN) && (hasDigits || !isTruncatedStem(wP, wN))) {
                allMatch = false;
                break;
            }
        }

        if (allMatch) {
            overlapCount = count;
            break;
        }
    }

    if (overlapCount > 0) {
        const pPrefixWords = pWords.slice(0, pWords.length - overlapCount);
        const pOverlapWords = pWords.slice(pWords.length - overlapCount);
        const nOverlapWords = nWords.slice(0, overlapCount);
        const nRemainingWords = nWords.slice(overlapCount);

        const mergedOverlapWords = [];
        for (let i = 0; i < overlapCount; i++) {
            const pW = pOverlapWords[i];
            const nW = nOverlapWords[i];
            const normPW = normalizeForComparison(pW);
            const normNW = normalizeForComparison(nW);
            // If nW is equal or longer, prefer nW to replace truncated partial words with full words
            if (normNW.length >= normPW.length) {
                mergedOverlapWords.push(nW);
            } else {
                mergedOverlapWords.push(pW);
            }
        }

        const allWords = [...pPrefixWords, ...mergedOverlapWords, ...nRemainingWords];
        return allWords.join(' ');
    }

    return `${p} ${n}`;
}

/**
 * Merges incoming caption messages into existing messages with chronological deduplication.
 *
 * When replacePrefix is true:
 * Searches backwards within recent window (default 30s) for partial messages from the same actor.
 * If incoming extends an earlier partial message separated by intervening messages from other speakers,
 * removes the obsolete partial message(s) and appends the complete message at the current position
 * (preserving chronological conversation order without destructive in-place overwriting).
 */
function mergeCaptionMessages(existingMessages, incomingMessages, replacePrefix = false, windowMs = 30000) {
    let messages = existingMessages ? [...existingMessages] : [];

    incomingMessages.forEach((incoming) => {
        const newText = (incoming.text || '').trim();
        if (!newText) {
            return;
        }

        if (!replacePrefix) {
            const last = messages[messages.length - 1];
            if (
                last &&
                last.actorIndex === incoming.actorIndex &&
                last.type === 'caption' &&
                normalizeForComparison(last.text) === normalizeForComparison(newText)
            ) {
                return;
            }
            messages.push(incoming);
            return;
        }

        const incomingTime = incoming.timestamp ? new Date(incoming.timestamp).getTime() : NaN;
        let isSubsumedOrDup = false;
        const indicesToRemove = [];

        // Search backwards within recent window (default 30 seconds) for partial messages from same actor
        for (let i = messages.length - 1; i >= 0; i--) {
            const prev = messages[i];
            if (prev.actorIndex !== incoming.actorIndex || prev.type !== 'caption') {
                continue;
            }

            const prevTime = prev.timestamp ? new Date(prev.timestamp).getTime() : NaN;
            const timeDiff = (!isNaN(incomingTime) && !isNaN(prevTime))
                ? (incomingTime - prevTime)
                : 0;

            if (!isNaN(incomingTime) && !isNaN(prevTime)) {
                if (timeDiff > windowMs) {
                    // Beyond time window, stop searching back for this actor
                    break;
                }
            } else if (messages.length - 1 - i > 25) {
                // Fallback max message lookback if timestamps are missing
                break;
            }

            const isImmediatelyPreceding = (i === messages.length - 1);
            const rel = classifyTextRelationship(prev.text, newText);

            if (rel === 'extension') {
                if (isImmediatelyPreceding) {
                    // In-progress STT extension for consecutive message from same speaker
                    if (timeDiff > 12000) {
                        break;
                    }
                } else {
                    // Intervening messages from other speakers:
                    // Only replace if recent (<= 5s) and not a standalone reaction/greeting
                    const normPrev = normalizeForComparison(prev.text);
                    const isShortReaction = STANDALONE_REACTIONS.has(normPrev);
                    if (isShortReaction || timeDiff > 5000) {
                        continue;
                    }
                }
                indicesToRemove.push(i);
            } else if (isImmediatelyPreceding && (rel === 'duplicate' || rel === 'subsumed')) {
                // Only treat as duplicate or subsumed if directly following same speaker within 12s
                if (timeDiff <= 12000) {
                    isSubsumedOrDup = true;
                    break;
                }
            }
        }

        if (isSubsumedOrDup) {
            return;
        }

        if (indicesToRemove.length > 0) {
            const removeSet = new Set(indicesToRemove);
            messages = messages.filter((_, idx) => !removeSet.has(idx));
        }

        messages.push(incoming);
    });

    return messages;
}

/**
 * Self-healing deduplication pass for an entire array of messages (e.g. from IndexedDB or Supabase).
 * Returns a new array with deduplicated messages without mutating the input array.
 */
function deduplicateMeetingMessages(messages, windowMs = 30000) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return [];
    }

    // Sort chronologically first to ensure correct sequential evaluation
    const sorted = [...messages].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
    });

    let result = [];
    sorted.forEach((msg) => {
        // If message is not caption, preserve directly
        if (msg.type && msg.type !== 'caption') {
            result.push({ ...msg });
            return;
        }
        result = mergeCaptionMessages(result, [{ ...msg }], true, windowMs);
    });

    return result;
}

globalThis.MirzaTranscript = {
  normalizeForComparison,
  wordsMatch,
  isTruncatedStem,
  lcsWordMatchCount,
  classifyTextRelationship,
  mergeConsecutiveTexts,
  mergeCaptionMessages,
  deduplicateMeetingMessages,
};
