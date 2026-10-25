import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper mock DOM node factory for testing content.js logic
class MockNode {
    constructor(nodeType, nodeName, className = '') {
        this.nodeType = nodeType;
        this.nodeName = nodeName;
        this.className = className;
        this.parentElement = null;
        this.childNodes = [];
        this._text = '';
        this._attributes = new Map();
    }

    get textContent() {
        if (this.nodeType === 3) return this._text;
        return this.childNodes.map(c => c.textContent).join('');
    }

    set textContent(val) {
        if (this.nodeType === 3) {
            this._text = val;
        } else {
            this.childNodes = [];
            if (val) {
                const textNode = new MockNode(3, '#text');
                textNode._text = val;
                this.appendChild(textNode);
            }
        }
    }

    setAttribute(name, val) {
        this._attributes.set(name, val);
    }

    getAttribute(name) {
        return this._attributes.get(name) || null;
    }

    appendChild(child) {
        child.parentElement = this;
        this.childNodes.push(child);
        return child;
    }

    matches(selector) {
        const parts = selector.split(',').map(s => s.trim());
        return parts.some(sel => {
            if (sel.startsWith('.')) {
                const classes = sel.slice(1).split('.');
                const thisClasses = (this.className || '').split(/\s+/);
                return classes.every(c => thisClasses.includes(c));
            }
            if (/^[a-zA-Z]+$/.test(sel)) {
                return (this.nodeName || '').toUpperCase() === sel.toUpperCase();
            }
            return false;
        });
    }

    closest(selector) {
        let curr = this;
        while (curr) {
            if (curr.nodeType === 1 && curr.matches(selector)) {
                return curr;
            }
            curr = curr.parentElement;
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        const visit = (node) => {
            if (node.nodeType === 1 && node.matches(selector)) {
                results.push(node);
            }
            node.childNodes.forEach(visit);
        };
        this.childNodes.forEach(visit);
        return results;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    contains(other) {
        let curr = other;
        while (curr) {
            if (curr === this) return true;
            curr = curr.parentElement;
        }
        return false;
    }
}

function createElement(className, text = '', tagName = 'DIV') {
    const el = new MockNode(1, tagName, className);
    if (text) {
        const textNode = new MockNode(3, '#text');
        textNode.textContent = text;
        el.appendChild(textNode);
    }
    return el;
}

// We extract CaptionsObserver methods or test the logic implemented in content.js
import {
    normalizeForComparison,
    wordsMatch,
    classifyTextRelationship,
    mergeConsecutiveTexts,
} from '../modules/TranscriptDeduplicator.js';

describe('CaptionsObserver DOM and Utterance Tracking logic', () => {
    function isSpeakerHeaderNode(node) {
        if (!node || node.nodeType !== 1) return false;
        return Boolean(
            node.matches?.('.KcIKyf, .NWpY1d, .jxFHg, img') ||
            node.closest?.('.KcIKyf, .NWpY1d, .jxFHg')
        );
    }

    function isCaptionBlock(element) {
        if (element?.matches?.('.nMcdL.bj4p3b, .nMcdL, .NmXUuc')) {
            return true;
        }
        return (
            element?.matches?.('.ygicle.VbkSUe') ||
            (element?.matches?.('.ygicle') && !!element?.closest?.('.nMcdL.bj4p3b, .nMcdL'))
        );
    }

    function findCaptionBlock(node) {
        let element = node;
        if (element?.nodeType === 3) {
            element = element.parentElement;
        }
        if (!element || element.nodeType !== 1) {
            return null;
        }

        // 1. Look for the ancestor speaker container FIRST (.nMcdL, .NmXUuc, etc.)
        const speakerBlock =
            element.closest('.nMcdL.bj4p3b, .nMcdL, .NmXUuc') ||
            (element.matches?.('.nMcdL.bj4p3b, .nMcdL, .NmXUuc') ? element : null);
        if (speakerBlock) {
            return speakerBlock;
        }

        // 2. Innermost speaker row. A meeting shell that also holds tiles or menus is not a caption.
        let curr = element;
        while (
            curr &&
            curr.getAttribute?.('role') !== 'region' &&
            !curr.matches?.('.a4cQT, [jscontroller="xoxr0b"]')
        ) {
            const hasCaption = Boolean(curr.querySelector?.('.ygicle'));
            const hasSpeaker = Boolean(curr.querySelector?.('.NWpY1d, .KcIKyf, .jxFHg'));
            const buttons = curr.querySelectorAll?.('button') || [];
            if (hasCaption && hasSpeaker && buttons.length <= 2) {
                return curr;
            }
            curr = curr.parentElement;
        }

        // 3. Check if element itself is a caption block
        if (isCaptionBlock(element)) {
            return element;
        }

        // 4. Fallback
        const block = element.closest('.ygicle.VbkSUe, .ygicle');
        if (block) {
            return block.parentElement?.closest?.('.nMcdL, .NmXUuc') || block;
        }
        return null;
    }

    function getBlockText(blockNode) {
        if (!blockNode) return '';

        const ancestor = findCaptionBlock(blockNode);
        const target = (ancestor && ancestor !== blockNode && !blockNode.matches?.('.nMcdL, .NmXUuc'))
            ? ancestor
            : blockNode;

        const dedicated = target.matches?.('.nMcdL, .NmXUuc, .ygicle');
        const buttons = target.querySelectorAll?.('button') || [];
        const hasMenu = Boolean(target.querySelector?.('[role="menu"], [role="listbox"]'));
        if (!dedicated && (buttons.length > 2 || hasMenu || !ancestor)) {
            return '';
        }

        if (target.matches?.('.ygicle') && (!target.parentElement || target.parentElement === global.document?.body)) {
            return (target.textContent || '').replace(/\s+/g, ' ').trim();
        }

        const pieces = [];
        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 1) { // Element
                if (isSpeakerHeaderNode(node)) return;
                const tag = (node.tagName || '').toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') return;
                if (node.childNodes && node.childNodes.length > 0) {
                    for (const child of node.childNodes) {
                        walk(child);
                    }
                } else if (node.textContent && typeof node.textContent === 'string' && !node.querySelector) {
                    const t = node.textContent.trim();
                    if (t) pieces.push(t);
                }
            } else if (node.nodeType === 3) { // Text
                const t = (node.textContent || '').trim();
                if (t) pieces.push(t);
            }
        };

        walk(target);
        return pieces.join(' ').replace(/\s+/g, ' ').trim();
    }

    it('findCaptionBlock finds the ancestor .nMcdL container instead of inner .ygicle span', () => {
        const container = createElement('nMcdL bj4p3b');
        const speakerName = createElement('KcIKyf jxFHg NWpY1d', 'Erfan Gholizade');
        container.appendChild(speakerName);

        const captionSpan1 = createElement('ygicle VbkSUe', 'من تصویرمو');
        const captionSpan2 = createElement('ygicle VbkSUe', 'قطع میکنم');
        container.appendChild(captionSpan1);
        container.appendChild(captionSpan2);

        // Target is the inner text node or span
        const textNode = captionSpan1.childNodes[0];

        const matchedBlock = findCaptionBlock(textNode);
        assert.equal(matchedBlock, container, 'Must match outer speaker container, not inner span');

        const matchedFromSpan2 = findCaptionBlock(captionSpan2);
        assert.equal(matchedFromSpan2, container, 'Must match outer speaker container from second span');
    });

    it('getBlockText concatenates all .ygicle spans in the block without duplication', () => {
        const container = createElement('nMcdL');
        const span1 = createElement('ygicle', 'خوب، بریم آقا؟');
        const span2 = createElement('ygicle', 'بریم این دفاع کنیم');
        container.appendChild(span1);
        container.appendChild(span2);

        const text = getBlockText(container);
        assert.equal(text, 'خوب، بریم آقا؟ بریم این دفاع کنیم');
    });

    it('getBlockText captures connector spans and sentence fragments without dropping words', () => {
        const container = createElement('nMcdL bj4p3b');
        const speaker = createElement('KcIKyf jxFHg NWpY1d', 'Mohammad');
        container.appendChild(speaker);

        const textContainer = createElement('iTTPOb');
        const span1 = createElement('ygicle VbkSUe', 'من تصویرمو قطع میکنم');
        const connector = createElement('', ' چون ', 'SPAN');
        const span2 = createElement('ygicle VbkSUe', 'اینترنت جواب نمیده');
        textContainer.appendChild(span1);
        textContainer.appendChild(connector);
        textContainer.appendChild(span2);
        container.appendChild(textContainer);

        const text = getBlockText(container);
        assert.equal(text, 'من تصویرمو قطع میکنم چون اینترنت جواب نمیده');
        assert.ok(!text.includes('Mohammad'), 'Speaker name must be stripped');
        assert.ok(text.includes('چون'), 'Connector "چون" must be captured');
    });

    it('getBlockText captures raw text node connectors between spans without dropping words', () => {
        const container = createElement('nMcdL bj4p3b');
        const speaker = createElement('KcIKyf jxFHg NWpY1d', 'Mohammad');
        container.appendChild(speaker);

        const textContainer = createElement('iTTPOb');
        const span1 = createElement('ygicle VbkSUe', 'من تصویرمو قطع میکنم');
        const textNode = new MockNode(3, '#text');
        textNode.textContent = ' چون ';
        const span2 = createElement('ygicle VbkSUe', 'اینترنت جواب نمیده');
        textContainer.appendChild(span1);
        textContainer.appendChild(textNode);
        textContainer.appendChild(span2);
        container.appendChild(textContainer);

        const text = getBlockText(container);
        assert.equal(text, 'من تصویرمو قطع میکنم چون اینترنت جواب نمیده');
        assert.ok(!text.includes('Mohammad'), 'Speaker name must be stripped');
        assert.ok(text.includes('چون'), 'Raw text node connector "چون" must be captured');
    });

    it('getBlockText resolves outer speaker block when called on a child span', () => {
        const container = createElement('nMcdL');
        const span1 = createElement('ygicle', 'سلام دوستان');
        const span2 = createElement('ygicle', 'ندا هستم');
        container.appendChild(span1);
        container.appendChild(span2);

        const textFromChild = getBlockText(span2);
        assert.equal(textFromChild, 'سلام دوستان ندا هستم');
    });

    it('tracks multiple overlapping speakers independently without premature flushes', async () => {
        const savedCalls = [];
        const mockMeeting = {
            meetingInfo: { participants: [] },
            saveMessages: async (msgs) => {
                savedCalls.push(...msgs);
                return true;
            }
        };

        const activeUtterances = new Map();

        function processUpdate(speakerKey, actorIndex, text) {
            const active = activeUtterances.get(speakerKey);
            if (!active) {
                activeUtterances.set(speakerKey, {
                    speakerKey,
                    actorIndex,
                    peakText: text,
                    lastSavedText: '',
                });
                return;
            }

            const rel = classifyTextRelationship(active.peakText, text);
            if (rel === 'none') {
                // Flush previous sentence
                mockMeeting.saveMessages([{
                    actorIndex: active.actorIndex,
                    text: active.peakText,
                    type: 'caption'
                }]);
                // Start new sentence
                activeUtterances.set(speakerKey, {
                    speakerKey,
                    actorIndex,
                    peakText: text,
                    lastSavedText: '',
                });
            } else if (rel === 'extension') {
                active.peakText = text;
            }
        }

        // Speaker 1 speaks frame 1
        processUpdate('Salar::img1', 1, 'خوب بریم');
        // Speaker 0 speaks frame 1 (interleaving!)
        processUpdate('Erfan::img0', 0, 'من تصویرمو');

        // Neither should be flushed yet because they are tracked independently!
        assert.equal(savedCalls.length, 0);

        // Speaker 1 speaks frame 2
        processUpdate('Salar::img1', 1, 'خوب، بریم آقا؟ بریم این دفاع کنیم امیر به تو');
        // Speaker 0 speaks frame 2
        processUpdate('Erfan::img0', 0, 'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم');

        // Still no flush triggered by interleaving!
        assert.equal(savedCalls.length, 0);
        assert.equal(activeUtterances.get('Salar::img1').peakText, 'خوب، بریم آقا؟ بریم این دفاع کنیم امیر به تو');
        assert.equal(activeUtterances.get('Erfan::img0').peakText, 'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم');

        // Now Speaker 1 starts a NEW sentence in the same block (utterance shrink / unrelated text)
        processUpdate('Salar::img1', 1, 'من گفتم مگه چی گفتم');

        // Salar's previous sentence MUST be flushed immediately!
        assert.equal(savedCalls.length, 1);
        assert.equal(savedCalls[0].actorIndex, 1);
        assert.equal(savedCalls[0].text, 'خوب، بریم آقا؟ بریم این دفاع کنیم امیر به تو');

        // Erfan's utterance must remain unaffected in activeUtterances
        assert.equal(activeUtterances.get('Erfan::img0').peakText, 'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم');
    });

    it('flushes and cleans up utterance when block is removed from DOM', () => {
        const savedCalls = [];
        const docBody = createElement('body');

        const blockA = createElement('nMcdL', 'Speaker A captions');
        const blockB = createElement('nMcdL', 'Speaker B captions');
        docBody.appendChild(blockA);
        docBody.appendChild(blockB);

        const activeUtterances = new Map();
        activeUtterances.set('A', { blockNode: blockA, peakText: 'Speaker A captions' });
        activeUtterances.set('B', { blockNode: blockB, peakText: 'Speaker B captions' });

        // Simulate Google Meet removing block A
        blockA.parentElement = null;
        docBody.childNodes = [blockB];

        // removedNodes handler logic
        for (const [key, utterance] of [...activeUtterances.entries()]) {
            if (!docBody.contains(utterance.blockNode)) {
                savedCalls.push(utterance.peakText);
                activeUtterances.delete(key);
            }
        }

        assert.equal(savedCalls.length, 1);
        assert.equal(savedCalls[0], 'Speaker A captions');
        assert.equal(activeUtterances.has('A'), false);
        assert.equal(activeUtterances.has('B'), true);
    });

    it('findCaptionBlock and mutation discovery find speaker blocks inside newly added parent containers', () => {
        const parentWrapper = createElement('a4cQT');
        const speakerBlock = createElement('nMcdL bj4p3b');
        const captionSpan = createElement('ygicle VbkSUe', 'سلام دوستان');
        speakerBlock.appendChild(captionSpan);
        parentWrapper.appendChild(speakerBlock);

        // findCaptionBlock directly on inner span finds speakerBlock
        assert.equal(findCaptionBlock(captionSpan), speakerBlock);

        // Discovery on parent container finds the inner speakerBlock
        const innerBlocks = parentWrapper.querySelectorAll('.nMcdL.bj4p3b, .nMcdL, .NmXUuc, .ygicle.VbkSUe, .ygicle');
        assert.ok(innerBlocks.length > 0);
        const resolved = findCaptionBlock(innerBlocks[0]);
        assert.equal(resolved, speakerBlock);
    });

    it('wasAlreadySaved does not block repeated affirmations like "بله" or "بله متشکرم"', () => {
        const savedMessageKeys = new Map();
        function makeSaveKey(actorIndex, text) {
            return `${actorIndex}::${normalizeForComparison(text)}`;
        }
        function wasAlreadySaved(actorIndex, text) {
            const key = makeSaveKey(actorIndex, text);
            const lastSavedTime = savedMessageKeys.get(key);
            if (lastSavedTime && Date.now() - lastSavedTime < 30000) {
                return true;
            }
            return false;
        }

        // Suppose 10 minutes ago, actor 0 said "بله متشکرم از شما"
        savedMessageKeys.set(makeSaveKey(0, 'بله متشکرم از شما'), Date.now() - 600000);

        // Actor 0 saying "بله" or "بله متشکرم" must NOT be blocked!
        assert.equal(wasAlreadySaved(0, 'بله'), false);
        assert.equal(wasAlreadySaved(0, 'بله متشکرم'), false);
    });

    it('processCaptionBlock detects utterance shrink when new sentence starts with prefix word like "من"', async () => {
        const savedUtterances = [];
        const activeUtterances = new Map();

        const block = createElement('nMcdL');
        const nameNode = createElement('NWpY1d', 'Erfan');
        block.appendChild(nameNode);
        const span = createElement('ygicle', '');
        block.appendChild(span);

        // Helper mock observer
        const observer = {
            getBlockText: (b) => getBlockText(b),
            getSpeakerKey: () => 'Erfan::',
            activeUtterances,
            async flushUtterance(u) {
                if (u.peakText && u.peakText !== u.lastSavedText) {
                    savedUtterances.push(u.peakText);
                    u.lastSavedText = u.peakText;
                }
            },
            startUtterance(b, text) {
                const u = {
                    peakText: text,
                    lastSavedText: '',
                    lastUpdated: Date.now(),
                };
                activeUtterances.set('Erfan::', u);
                return u;
            },
            async processCaptionBlock(b) {
                const text = this.getBlockText(b);
                const active = this.activeUtterances.get('Erfan::');
                if (!active) {
                    this.startUtterance(b, text);
                    return;
                }
                const rel = classifyTextRelationship(active.peakText, text);
                if (rel === 'none') {
                    await this.flushUtterance(active);
                    this.startUtterance(b, text);
                    return;
                }
                if (rel === 'extension') {
                    active.peakText = text;
                    active.lastUpdated = Date.now();
                    return;
                }
                if (rel === 'subsumed') {
                    const normOlder = normalizeForComparison(active.peakText);
                    const normNewer = normalizeForComparison(text);
                    const olderWords = normOlder.split(' ').filter(Boolean);
                    const newerWords = normNewer.split(' ').filter(Boolean);
                    const wordDrop = olderWords.length - newerWords.length;
                    const shrinkRatio = olderWords.length > 0 ? (wordDrop / olderWords.length) : 0;
                    if (wordDrop >= 4 || shrinkRatio >= 0.5) {
                        // Utterance shrink!
                        await this.flushUtterance(active);
                        this.startUtterance(b, text);
                        return;
                    }
                }
            }
        };

        // Frame 1: Long sentence completes
        span.textContent = 'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم';
        await observer.processCaptionBlock(block);
        assert.equal(activeUtterances.get('Erfan::').peakText, 'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم');

        // Frame 2: Speaker starts a new sentence in the same block starting with "من" (shrink from 11 words to 1)
        span.textContent = 'من';
        await observer.processCaptionBlock(block);

        // Previous sentence must have been flushed, and active utterance must now be "من"
        assert.equal(savedUtterances.length, 1);
        assert.equal(savedUtterances[0], 'من تصویرمو قطع میکنم عذر میخوام دستتون بیشتر از این نگه دارم');
        assert.equal(activeUtterances.get('Erfan::').peakText, 'من');

        // Frame 3: Extension of second sentence
        span.textContent = 'من گفتم مگه چی گفتم';
        await observer.processCaptionBlock(block);
        assert.equal(activeUtterances.get('Erfan::').peakText, 'من گفتم مگه چی گفتم');
    });

    it('processCaptionBlock does not trigger shrink on minor STT beam search wobble of 2 words', async () => {
        const savedUtterances = [];
        const activeUtterances = new Map();

        const block = createElement('nMcdL');
        const nameNode = createElement('NWpY1d', 'Erfan');
        block.appendChild(nameNode);
        const span = createElement('ygicle', '');
        block.appendChild(span);

        const observer = {
            getBlockText: (b) => getBlockText(b),
            getSpeakerKey: () => 'Erfan::',
            activeUtterances,
            async flushUtterance(u) {
                if (u.peakText && u.peakText !== u.lastSavedText) {
                    savedUtterances.push(u.peakText);
                    u.lastSavedText = u.peakText;
                }
            },
            startUtterance(b, text) {
                const u = {
                    peakText: text,
                    lastSavedText: '',
                    lastUpdated: Date.now(),
                };
                activeUtterances.set('Erfan::', u);
                return u;
            },
            async processCaptionBlock(b) {
                const text = this.getBlockText(b);
                const active = this.activeUtterances.get('Erfan::');
                if (!active) {
                    this.startUtterance(b, text);
                    return;
                }
                const rel = classifyTextRelationship(active.peakText, text);
                if (rel === 'none') {
                    await this.flushUtterance(active);
                    this.startUtterance(b, text);
                    return;
                }
                if (rel === 'extension') {
                    active.peakText = text;
                    active.lastUpdated = Date.now();
                    return;
                }
                if (rel === 'subsumed') {
                    const normOlder = normalizeForComparison(active.peakText);
                    const normNewer = normalizeForComparison(text);
                    const olderWords = normOlder.split(' ').filter(Boolean);
                    const newerWords = normNewer.split(' ').filter(Boolean);
                    const wordDrop = olderWords.length - newerWords.length;
                    const shrinkRatio = olderWords.length > 0 ? (wordDrop / olderWords.length) : 0;
                    if (wordDrop >= 4 || shrinkRatio >= 0.5) {
                        // Utterance shrink!
                        await this.flushUtterance(active);
                        this.startUtterance(b, text);
                        return;
                    }
                    active.lastUpdated = Date.now();
                }
            }
        };

        // Frame 1: Speaker produces 10 words
        span.textContent = 'ما امروز در جلسه تصمیم گرفتیم که روی پروژه کار کنیم';
        await observer.processCaptionBlock(block);
        assert.equal(activeUtterances.get('Erfan::').peakText, 'ما امروز در جلسه تصمیم گرفتیم که روی پروژه کار کنیم');

        // Frame 2: Beam search drops 2 words (10 words -> 8 words, 20% drop)
        span.textContent = 'ما امروز در جلسه تصمیم گرفتیم که روی پروژه';
        await observer.processCaptionBlock(block);

        // MUST NOT flush utterance or reset peakText!
        assert.equal(savedUtterances.length, 0);
        assert.equal(activeUtterances.get('Erfan::').peakText, 'ما امروز در جلسه تصمیم گرفتیم که روی پروژه کار کنیم');

        // Frame 3: Beam search resumes and completes sentence
        span.textContent = 'ما امروز در جلسه تصمیم گرفتیم که روی پروژه کار کنیم حتما';
        await observer.processCaptionBlock(block);
        assert.equal(savedUtterances.length, 0);
        assert.equal(activeUtterances.get('Erfan::').peakText, 'ما امروز در جلسه تصمیم گرفتیم که روی پروژه کار کنیم حتما');
    });

    it('processCaptionBlock recognizes Google Meet tail roll-off and preserves peakText without duplicate save', async () => {
        const savedUtterances = [];
        const activeUtterances = new Map();

        const block = createElement('nMcdL');
        const nameNode = createElement('NWpY1d', 'Erfan');
        block.appendChild(nameNode);
        const span = createElement('ygicle', '');
        block.appendChild(span);

        const observer = {
            getBlockText: (b) => getBlockText(b),
            getSpeakerKey: () => 'Erfan::',
            activeUtterances,
            async flushUtterance(u) {
                if (u.peakText && u.peakText !== u.lastSavedText) {
                    savedUtterances.push(u.peakText);
                    u.lastSavedText = u.peakText;
                }
            },
            startUtterance(b, text) {
                const u = {
                    peakText: text,
                    lastSavedText: '',
                    lastUpdated: Date.now(),
                };
                activeUtterances.set('Erfan::', u);
                return u;
            },
            async processCaptionBlock(b) {
                const text = this.getBlockText(b);
                const active = this.activeUtterances.get('Erfan::');
                if (!active) {
                    this.startUtterance(b, text);
                    return;
                }
                const rel = classifyTextRelationship(active.peakText, text);
                if (rel === 'none') {
                    const merged = mergeConsecutiveTexts(active.peakText, text);
                    if (merged && merged !== `${active.peakText} ${text}` && merged.length > active.peakText.length) {
                        active.peakText = merged;
                        active.lastUpdated = Date.now();
                        return;
                    }
                    await this.flushUtterance(active);
                    this.startUtterance(b, text);
                    return;
                }
                if (rel === 'extension') {
                    active.peakText = text;
                    active.lastUpdated = Date.now();
                    return;
                }
                if (rel === 'subsumed') {
                    const normOlder = normalizeForComparison(active.peakText);
                    const normNewer = normalizeForComparison(text);
                    const isTailRollOff = normOlder.endsWith(normNewer) || (
                        Boolean(active.lastSavedText) && normalizeForComparison(active.lastSavedText).endsWith(normNewer)
                    );
                    if (isTailRollOff) {
                        active.lastUpdated = Date.now();
                        return;
                    }

                    const olderWords = normOlder.split(' ').filter(Boolean);
                    const newerWords = normNewer.split(' ').filter(Boolean);
                    const wordDrop = olderWords.length - newerWords.length;
                    const shrinkRatio = olderWords.length > 0 ? (wordDrop / olderWords.length) : 0;
                    if (wordDrop >= 4 || shrinkRatio >= 0.5) {
                        await this.flushUtterance(active);
                        this.startUtterance(b, text);
                        return;
                    }
                }
            }
        };

        // Frame 1: Full sentence rendered
        span.textContent = 'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم';
        await observer.processCaptionBlock(block);
        assert.equal(activeUtterances.get('Erfan::').peakText, 'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم');

        // Flush utterance (e.g. timeout / debounce)
        await observer.flushUtterance(activeUtterances.get('Erfan::'));
        assert.equal(savedUtterances.length, 1);
        assert.equal(savedUtterances[0], 'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم');

        // Frame 2: Google Meet rolls off span 1 ("من فردا با علی میرم شرکت"), leaving only tail
        span.textContent = 'و جلسه رو برگزار میکنیم';
        await observer.processCaptionBlock(block);

        // MUST NOT start a new utterance or save a duplicate "و جلسه رو برگزار میکنیم"
        assert.equal(savedUtterances.length, 1);
        assert.equal(activeUtterances.get('Erfan::').peakText, 'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم');

        // Frame 3: Speaker continues speaking, new words appended after the tail
        span.textContent = 'و جلسه رو برگزار میکنیم فردا هم تعطیله';
        await observer.processCaptionBlock(block);

        // Boundary-aware merge stitches the continuation smoothly
        assert.equal(
            activeUtterances.get('Erfan::').peakText,
            'من فردا با علی میرم شرکت و جلسه رو برگزار میکنیم فردا هم تعطیله'
        );
    });

    it('does not capture Meet chrome when a caption block sits inside the meeting shell', () => {
        const shell = createElement('meeting-root');
        for (let i = 0; i < 6; i++) {
            shell.appendChild(createElement('', 'Press Down Arrow to open the hover tray and Escape to close it.'));
            shell.appendChild(createElement('', 'Mute', 'BUTTON'));
        }
        const menu = createElement('language-menu', 'Persian (Iran) Afrikaans (South Africa) BETA Zulu (South Africa) BETA Font size Default Tiny');
        shell.appendChild(menu);

        const speaker = createElement('nMcdL bj4p3b');
        speaker.appendChild(createElement('NWpY1d', 'Erfan Gholizade'));
        const span = createElement('ygicle VbkSUe', 'فقط همین جمله');
        speaker.appendChild(span);
        shell.appendChild(speaker);

        const hint = shell.childNodes[0];
        assert.equal(findCaptionBlock(hint), null);
        assert.equal(getBlockText(shell), '');
        assert.equal(findCaptionBlock(span), speaker);
        assert.equal(getBlockText(span), 'فقط همین جمله');
    });

    it('isolates multiple speakers inside an .a4cQT container without attribution leakage', () => {
        const region = createElement('a4cQT');
        region.setAttribute('role', 'region');

        const speaker1 = createElement('speaker-container');
        const header1 = createElement('KcIKyf jxFHg');
        const name1 = createElement('NWpY1d', 'Ali');
        header1.appendChild(name1);
        const span1 = createElement('ygicle VbkSUe', 'سلام دوستان');
        speaker1.appendChild(header1);
        speaker1.appendChild(span1);

        const speaker2 = createElement('speaker-container');
        const header2 = createElement('KcIKyf jxFHg');
        const name2 = createElement('NWpY1d', 'Sara');
        header2.appendChild(name2);
        const span2 = createElement('ygicle VbkSUe', 'درود به همگی');
        speaker2.appendChild(header2);
        speaker2.appendChild(span2);

        region.appendChild(speaker1);
        region.appendChild(speaker2);

        // Target span1 finds Ali's speaker container, NOT the shared region
        const block1 = findCaptionBlock(span1);
        assert.equal(block1, speaker1);
        assert.equal(getBlockText(block1), 'سلام دوستان');

        // Target span2 finds Sara's speaker container, NOT the shared region
        const block2 = findCaptionBlock(span2);
        assert.equal(block2, speaker2);
        assert.equal(getBlockText(block2), 'درود به همگی');
    });
});
