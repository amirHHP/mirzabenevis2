import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper Mock Node Factory
class MockElement {
  constructor(tagName = 'DIV', className = '') {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.parentElement = null;
    this.childNodes = [];
    this._attributes = new Map();
    this.classList = {
      contains: (c) => (this.className || '').split(/\s+/).includes(c),
      add: (c) => {
        if (!this.classList.contains(c)) {
          this.className = (this.className ? this.className + ' ' : '') + c;
        }
      },
    };
    this.eventListeners = new Map();
    this.isContentEditable = false;
  }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(val) {
    this.childNodes = [];
    if (val !== undefined && val !== null) {
      this.childNodes.push({
        nodeType: 3,
        textContent: String(val),
        parentElement: this,
      });
    }
  }

  get innerText() {
    return this.textContent;
  }

  setAttribute(name, val) {
    this._attributes.set(name, String(val));
  }

  getAttribute(name) {
    return this._attributes.get(name) || null;
  }

  hasAttribute(name) {
    return this._attributes.has(name);
  }

  removeAttribute(name) {
    this._attributes.delete(name);
  }

  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  addEventListener(type, listener) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type).push(listener);
  }

  removeEventListener(type, listener) {
    const list = this.eventListeners.get(type) || [];
    this.eventListeners.set(
      type,
      list.filter((l) => l !== listener)
    );
  }

  dispatchEvent(event) {
    const list = this.eventListeners.get(event.type) || [];
    list.forEach((l) => l(event));
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, defaultPrevented: false });
  }

  matches(selector) {
    const parts = selector.split(',').map((s) => s.trim());
    return parts.some((part) => this._matchesSingle(part));
  }

  _matchesSingle(sel) {
    // Tag match
    const tagMatch = sel.match(/^([a-zA-Z0-9]+)/);
    if (tagMatch && this.tagName !== tagMatch[1].toUpperCase()) {
      return false;
    }
    // Class match: .class1.class2
    const classMatches = sel.match(/\.([a-zA-Z0-9_-]+)/g);
    if (classMatches) {
      for (const cm of classMatches) {
        if (!this.classList.contains(cm.slice(1))) return false;
      }
    }
    // Attribute match: [attr="val"] or [attr*="val"]
    const attrMatches = sel.match(/\[([a-zA-Z0-9_-]+)([*^$]?=)?["']?([^"'\]]*)["']?\]/g);
    if (attrMatches) {
      for (const am of attrMatches) {
        const m = am.match(/\[([a-zA-Z0-9_-]+)([*^$]?=)?["']?([^"'\]]*)["']?\]/);
        if (!m) continue;
        const attrName = m[1];
        const op = m[2];
        const expectedVal = m[3];
        const actualVal = this.getAttribute(attrName);
        if (actualVal === null) return false;
        if (op === '=') {
          if (actualVal !== expectedVal) return false;
        } else if (op === '*=') {
          if (!actualVal.toLowerCase().includes(expectedVal.toLowerCase())) return false;
        }
      }
    }
    return true;
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
      if (node.nodeType === 1) {
        if (node.matches(selector)) {
          results.push(node);
        }
        node.childNodes.forEach(visit);
      }
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

// Setup mock browser globals before importing content.js
const windowListeners = new Map();
global.window = {
  __MIRZABENEVIS_TEST__: true,
  addEventListener: (type, fn) => {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(fn);
  },
  removeEventListener: (type, fn) => {
    const list = windowListeners.get(type) || [];
    windowListeners.set(
      type,
      list.filter((f) => f !== fn)
    );
  },
  dispatchEvent: (event) => {
    const list = [...(windowListeners.get(event.type) || [])];
    list.forEach((f) => f(event));
    return true;
  },
  location: { href: 'https://meet.google.com/abc-defg-hij' },
};
global.document = new MockElement('HTML');
global.document.body = new MockElement('BODY');
global.document.documentElement = global.document;
global.document.activeElement = global.document.body;
global.document.body.parentElement = global.document;
global.document.childNodes.push(global.document.body);
global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
global.MutationObserver = class MockMutationObserver {
  constructor(cb) {
    this.cb = cb;
    this.disconnected = false;
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
};
global.KeyboardEvent = class MockKeyboardEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
};
global.chrome = {
  runtime: {
    id: 'test-ext-id',
    sendMessage: () => {},
    onMessage: { addListener: () => {} },
  },
};

// Import content.js after the shared deduplicator, which content.js calls at runtime.
await import('../modules/transcript-logic.js');
await import('../content.js');
const { CaptionDom, CaptionsObserver, MeetAssistant } = globalThis.MirzaBenevis;

describe('Permissions policy and unload deprecation verification', () => {
  it('content.js contains ZERO occurrences of addEventListener("unload") or addEventListener(\'unload\')', () => {
    const contentJsPath = path.resolve(__dirname, '../content.js');
    const contentJs = fs.readFileSync(contentJsPath, 'utf8');

    const unloadListenerRegex = /addEventListener\s*\(\s*['"]unload['"]/gi;
    const matches = contentJs.match(unloadListenerRegex);
    assert.equal(
      matches,
      null,
      'content.js must not addEventListener for "unload" event to comply with Chrome permissions policy'
    );
  });

  it('content.js does not invoke console.warn for normal captions initialization flow', () => {
    const contentJsPath = path.resolve(__dirname, '../content.js');
    const contentJs = fs.readFileSync(contentJsPath, 'utf8');

    assert.ok(
      !contentJs.includes("console.warn('Captions region not found in time"),
      'Must not trigger console.warn for captions region not found'
    );
    assert.ok(
      !contentJs.includes("console.warn('Meeting UI not ready yet"),
      'Must not trigger console.warn for meeting UI not ready yet'
    );
    assert.ok(
      !contentJs.includes("console.warn('Could not find captions toggle button"),
      'Must not trigger console.warn for captions button not found'
    );
  });
});

describe('CaptionDom resilient selectors and multilingual matching', () => {
  it('matches multilingual captions buttons in English, Persian, Korean, Arabic, French, German, Spanish', () => {
    const testCases = [
      { label: 'Turn on captions (c)', expected: true },
      { label: 'Turn off captions (c)', expected: true },
      { label: 'روشن کردن زیرنویس (c)', expected: true },
      { label: 'خاموش کردن زیرنویس (c)', expected: true },
      { label: 'فعال‌سازی زیرنویس', expected: true },
      { label: '자막 사용 (c)', expected: true },
      { label: '자막 사용 중지', expected: true },
      { label: 'تشغيل الترجمة والشرح (c)', expected: true },
      { label: 'إيقاف الترجمة', expected: true },
      { label: 'Activer les sous-titres (c)', expected: true },
      { label: 'Untertitel aktivieren (c)', expected: true },
      { label: 'Activar subtítulos (c)', expected: true },
      { label: 'Ativar legendas (c)', expected: true },
      { label: 'Unrelated button', expected: false },
    ];

    for (const { label, expected } of testCases) {
      const match = CaptionDom.BUTTON_LABEL_PATTERN.test(label);
      assert.equal(match, expected, `BUTTON_LABEL_PATTERN test failed for label: "${label}"`);
    }
  });

  it('detects captions ON vs OFF state accurately via isCaptionsButtonOn', () => {
    // 1. aria-pressed="true"
    const btn1 = new MockElement('BUTTON');
    btn1.setAttribute('aria-pressed', 'true');
    assert.equal(CaptionDom.isCaptionsButtonOn(btn1), true);

    // 2. aria-pressed="false"
    const btn2 = new MockElement('BUTTON');
    btn2.setAttribute('aria-pressed', 'false');
    assert.equal(CaptionDom.isCaptionsButtonOn(btn2), false);

    // 3. aria-checked="true"
    const btn3 = new MockElement('BUTTON');
    btn3.setAttribute('aria-checked', 'true');
    assert.equal(CaptionDom.isCaptionsButtonOn(btn3), true);

    // 4. Persian Turn OFF label -> Captions are ON
    const btn4 = new MockElement('BUTTON');
    btn4.setAttribute('aria-label', 'خاموش کردن زیرنویس (c)');
    assert.equal(CaptionDom.isCaptionsButtonOn(btn4), true);

    // 5. Korean Turn OFF label -> Captions are ON
    const btn5 = new MockElement('BUTTON');
    btn5.setAttribute('aria-label', '자막 사용 중지');
    assert.equal(CaptionDom.isCaptionsButtonOn(btn5), true);

    // 6. English Turn ON label -> Captions are OFF
    const btn6 = new MockElement('BUTTON');
    btn6.setAttribute('aria-label', 'Turn on captions (c)');
    assert.equal(CaptionDom.isCaptionsButtonOn(btn6), false);

    // 7. Active toggle class
    const btn7 = new MockElement('BUTTON', 'qs41qe');
    assert.equal(CaptionDom.isCaptionsButtonOn(btn7), true);

    // 8. Null button returns false gracefully without error
    assert.equal(CaptionDom.isCaptionsButtonOn(null), false);
  });

  it('findCaptionsButton locates button by jsname, aria-label, and Google symbol icons', () => {
    // Setup fresh container
    const container = new MockElement('DIV');
    global.document.body.childNodes = [container];

    // Case A: jsname="r6bRZb" (Desktop Google Meet captions button)
    const meetBtn = new MockElement('BUTTON');
    meetBtn.setAttribute('jsname', 'r6bRZb');
    container.appendChild(meetBtn);
    assert.equal(CaptionDom.findCaptionsButton(), meetBtn);

    // Clear
    container.childNodes = [];

    // Case B: icon span with closed_caption text
    const iconBtn = new MockElement('BUTTON');
    const iconSpan = new MockElement('SPAN', 'google-symbols');
    iconSpan.textContent = 'closed_caption';
    iconBtn.appendChild(iconSpan);
    container.appendChild(iconBtn);
    assert.equal(CaptionDom.findCaptionsButton(), iconBtn);

    // Clear
    container.childNodes = [];

    // Case C: Persian aria-label
    const persianBtn = new MockElement('BUTTON');
    persianBtn.setAttribute('aria-label', 'روشن کردن زیرنویس');
    container.appendChild(persianBtn);
    assert.equal(CaptionDom.findCaptionsButton(), persianBtn);
  });

  it('isInCall detects active meeting through leave buttons or call controls', () => {
    const container = new MockElement('DIV');
    global.document.body.childNodes = [container];

    // Pre-join: no controls -> false
    assert.equal(CaptionDom.isInCall(), false);

    // Leave button appears
    const leaveBtn = new MockElement('BUTTON');
    leaveBtn.setAttribute('jsname', 'r8qRAd');
    container.appendChild(leaveBtn);
    assert.equal(CaptionDom.isInCall(), true);

    // Persian leave button
    container.childNodes = [];
    const persianLeave = new MockElement('BUTTON');
    persianLeave.setAttribute('aria-label', 'خروج از جلسه');
    container.appendChild(persianLeave);
    assert.equal(CaptionDom.isInCall(), true);
  });

  it('tryKeyboardShortcut does NOT send shortcut if user is typing in input or textarea', () => {
    const input = new MockElement('INPUT');
    global.document.activeElement = input;

    let dispatched = false;
    input.addEventListener('keydown', () => {
      dispatched = true;
    });

    CaptionDom.tryKeyboardShortcut();
    assert.equal(dispatched, false, 'Must not dispatch shortcut into active input');

    // Reset activeElement to body
    global.document.activeElement = global.document.body;
  });

  it('tryKeyboardShortcut does NOT send shortcut if user is typing in role="textbox" or contenteditable', () => {
    const chatBox = new MockElement('DIV');
    chatBox.setAttribute('role', 'textbox');
    global.document.activeElement = chatBox;

    let dispatched = false;
    chatBox.addEventListener('keydown', () => {
      dispatched = true;
    });

    CaptionDom.tryKeyboardShortcut();
    assert.equal(dispatched, false, 'Must not dispatch shortcut into role=textbox chat box');

    const editable = new MockElement('DIV');
    editable.setAttribute('contenteditable', 'true');
    global.document.activeElement = editable;

    CaptionDom.tryKeyboardShortcut();
    assert.equal(dispatched, false, 'Must not dispatch shortcut into contenteditable div');

    global.document.activeElement = global.document.body;
  });
});

describe('CaptionsObserver lifecycle, unload safety, and observer disconnection', () => {
  it('cleanup() executes safely without throwing when observer is null or undefined', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };

    const obs = new CaptionsObserver(mockMeeting);
    obs.observer = null; // simulate null observer
    obs.leaveButtonObserver = null;

    assert.doesNotThrow(() => {
      obs.cleanup();
    });
  });

  it('cleanup() executes safely when observer.disconnect throws', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };

    const obs = new CaptionsObserver(mockMeeting);
    obs.observer = {
      disconnect() {
        throw new Error('Simulated DOMException');
      },
    };

    assert.doesNotThrow(() => {
      obs.cleanup();
    });
  });

  it('cleanup() clears pending utterance debounce timers so no delayed saves run after teardown', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };

    const obs = new CaptionsObserver(mockMeeting);
    let timerFired = false;
    const utterance = {
      actorIndex: 0,
      speakerKey: 'speaker-1',
      peakText: 'سلام',
      lastSavedText: '',
      debounceTimer: setTimeout(() => {
        timerFired = true;
      }, 50),
    };
    obs.activeUtterances.set('speaker-1', utterance);

    obs.cleanup();

    assert.equal(utterance.debounceTimer, null);
    assert.equal(timerFired, false, 'Debounce timer should be cancelled immediately on cleanup');
  });

  it('handleUnload guards against re-entrancy / double saving', async () => {
    let flushCount = 0;
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };

    const obs = new CaptionsObserver(mockMeeting);
    obs.flushPendingSaves = async () => {
      flushCount++;
    };

    // First unload call
    const p1 = obs.handleUnload();
    // Concurrent second unload call
    const p2 = obs.handleUnload();

    await Promise.all([p1, p2]);
    assert.equal(flushCount, 1, 'flushPendingSaves must only be called once');
  });

  it('observeLeaveButton attaches click listener that safely calls handleUnload without bug', () => {
    const container = new MockElement('DIV');
    global.document.body.childNodes = [container];

    const leaveBtn = new MockElement('BUTTON');
    leaveBtn.setAttribute('jsname', 'r8qRAd');
    container.appendChild(leaveBtn);

    let unloadCalled = false;
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };
    const obs = new CaptionsObserver(mockMeeting);
    obs.handleUnload = async () => {
      unloadCalled = true;
    };

    obs.observeLeaveButton();

    // Click the leave button
    leaveBtn.click();
    assert.equal(unloadCalled, true, 'Clicking leave button must trigger handleUnload');

    obs.cleanup();
  });

  it('beforeunload event flushes pending saves without being dropped when MeetAssistant is active', async () => {
    const assistant = new MeetAssistant();
    let saved = false;
    await assistant.init();
    assistant.captionsObserver.handleUnload = async () => {
      saved = true;
    };
    assistant.captionsObserver.addListeners();

    // Dispatch beforeunload on window
    global.window.dispatchEvent({ type: 'beforeunload' });

    assert.equal(saved, true, 'beforeunload must trigger CaptionsObserver.handleUnload to prevent caption data loss');
    assistant.destroy();
  });
});

describe('MeetAssistant resilient initialization and graceful destruction', () => {
  it('destroy() safely cleans up late observers and intervals without throwing', () => {
    const assistant = new MeetAssistant();
    assistant._lateCaptionsObserver = new global.MutationObserver(() => {});
    assistant._lateCaptionsInterval = setInterval(() => {}, 10000);

    assert.doesNotThrow(() => {
      assistant.destroy();
    });

    assert.equal(assistant._lateCaptionsObserver, null);
    assert.equal(assistant._lateCaptionsInterval, null);
  });

  it('enableCaptionsButton detects already visible captions immediately', async () => {
    const assistant = new MeetAssistant();
    assistant.areCaptionsVisible = () => true;

    // Should return immediately without waiting or throwing
    await assert.doesNotReject(async () => {
      await assistant.enableCaptionsButton();
    });
  });

  it('enableCaptionsButton does not double-click if button is found and clicked once', async () => {
    const assistant = new MeetAssistant();
    let clickCount = 0;
    const btn = new MockElement('BUTTON');
    btn.setAttribute('jsname', 'r6bRZb');
    btn.setAttribute('aria-pressed', 'false');

    btn.addEventListener('click', () => {
      clickCount++;
      // Meet turns aria-pressed true on click
      btn.setAttribute('aria-pressed', 'true');
    });

    assistant.findCaptionsButton = () => btn;
    assistant.areCaptionsVisible = () => false;

    await assistant.enableCaptionsButton();

    assert.equal(clickCount, 1, 'Captions button must only be clicked once');
  });

  it('observeForLateCaptions concurrency lock prevents simultaneous rapid enable attempts', async () => {
    const assistant = new MeetAssistant();
    let clicks = 0;
    const btn = new MockElement('BUTTON');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      clicks++;
    });

    assistant.findCaptionsButton = () => btn;
    assistant.areCaptionsVisible = () => false;

    assistant.observeForLateCaptions();

    // Simulate 20 rapid mutations
    for (let i = 0; i < 20; i++) {
      assistant._lateCaptionsObserver?.cb?.();
    }

    // Give microtasks time to settle
    await new Promise((r) => setTimeout(r, 100));

    assert.ok(clicks <= 1, `Concurrent rapid mutations must be locked/throttled, got ${clicks} clicks`);
    assistant.destroy();
  });
});

describe('CaptionsObserver Persian streaming caption extraction and debounce stability', () => {
  it('observes the captions region and ignores the meeting shell', async () => {
    const region = new MockElement('DIV');
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', 'Captions');
    const shell = new MockElement('DIV', 'a4cQT');
    shell.textContent = 'Press Down Arrow to open the hover tray';
    global.document.body.appendChild(shell);
    global.document.body.appendChild(region);

    assert.equal(CaptionDom.getCaptionsRegion(), region);
    assert.equal(CaptionDom.isAppShell(shell), true);

    const obs = new CaptionsObserver({
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: async () => true,
    });
    const observed = [];
    obs.observer.observe = (target) => {
      observed.push(target);
    };
    await obs.run();
    assert.equal(observed[0], region);
    assert.equal(observed.includes(global.document.body), false);
    obs.cleanup();

    global.document.body.childNodes = global.document.body.childNodes.filter(
      (node) => node !== region && node !== shell
    );
  });

  it('uses the caption wrapper under the meeting shell, not the shell itself', () => {
    const shell = new MockElement('DIV', 'a4cQT');
    const wrapper = new MockElement('DIV', 'caption-wrap');
    const block = new MockElement('DIV', 'nMcdL');
    const span = new MockElement('SPAN', 'ygicle VbkSUe');
    span.textContent = 'سلام';
    block.appendChild(span);
    wrapper.appendChild(block);
    shell.appendChild(wrapper);
    global.document.body.appendChild(shell);

    assert.equal(CaptionDom.getCaptionsRegion(), wrapper);

    global.document.body.childNodes = global.document.body.childNodes.filter((node) => node !== shell);
  });

  it('getBlockText extracts all child text spans including connectors without dropping words', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };
    const obs = new CaptionsObserver(mockMeeting);

    const block = new MockElement('DIV', 'nMcdL bj4p3b');
    const speaker = new MockElement('DIV', 'KcIKyf jxFHg NWpY1d');
    speaker.textContent = 'Erfan Gholizade';
    block.appendChild(speaker);

    const textWrapper = new MockElement('DIV', 'iTTPOb');
    const span1 = new MockElement('SPAN', 'ygicle VbkSUe');
    span1.textContent = 'من تصویرم رو قطع می‌کنم';
    const span2 = new MockElement('SPAN', '');
    span2.textContent = ' چون ';
    const span3 = new MockElement('SPAN', 'ygicle VbkSUe');
    span3.textContent = 'اینترنت جواب نمی‌ده';

    textWrapper.appendChild(span1);
    textWrapper.appendChild(span2);
    textWrapper.appendChild(span3);
    block.appendChild(textWrapper);

    const extracted = obs.getBlockText(block);
    assert.equal(extracted, 'من تصویرم رو قطع می‌کنم چون اینترنت جواب نمی‌ده');
    assert.ok(!extracted.includes('Erfan'), 'Speaker name must not be included in caption text');
    assert.ok(extracted.includes('چون'), 'Connector span "چون" must be preserved');
  });

  it('getBlockText extracts words and connectors in raw text nodes between spans without dropping', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };
    const obs = new CaptionsObserver(mockMeeting);

    const block = new MockElement('DIV', 'nMcdL bj4p3b');
    const speaker = new MockElement('DIV', 'KcIKyf jxFHg NWpY1d');
    speaker.textContent = 'Mohammad';
    block.appendChild(speaker);

    const textWrapper = new MockElement('DIV', 'iTTPOb');
    const span1 = new MockElement('SPAN', 'ygicle VbkSUe');
    span1.textContent = 'من تصویرم رو قطع می‌کنم';
    const rawTextNode = { nodeType: 3, textContent: ' چون ', parentElement: textWrapper };
    const span3 = new MockElement('SPAN', 'ygicle VbkSUe');
    span3.textContent = 'اینترنت جواب نمی‌ده';

    textWrapper.appendChild(span1);
    textWrapper.childNodes.push(rawTextNode);
    textWrapper.appendChild(span3);
    block.appendChild(textWrapper);

    const extracted = obs.getBlockText(block);
    assert.equal(extracted, 'من تصویرم رو قطع می‌کنم چون اینترنت جواب نمی‌ده');
    assert.ok(extracted.includes('چون'), 'Raw text node "چون" must be captured');
  });

  it('getBlockText resolves ancestor container when passed an inner .ygicle span', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };
    const obs = new CaptionsObserver(mockMeeting);

    const block = new MockElement('DIV', 'nMcdL');
    const span1 = new MockElement('SPAN', 'ygicle');
    span1.textContent = 'سلام دوستان';
    const span2 = new MockElement('SPAN', 'ygicle');
    span2.textContent = 'ندا هستم';
    block.appendChild(span1);
    block.appendChild(span2);

    // Calling getBlockText on span2 resolves to block and captures the complete utterance
    const textFromSpan = obs.getBlockText(span2);
    assert.equal(textFromSpan, 'سلام دوستان ندا هستم');
  });

  it('CaptionsObserver has debounceMs >= 2000 to prevent premature mid-word streaming flushes', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };
    const obs = new CaptionsObserver(mockMeeting);
    assert.ok(obs.debounceMs >= 2000, `debounceMs should be >= 2000ms, got ${obs.debounceMs}`);
  });

  it('mergeConsecutiveTexts in CaptionsObserver preserves "ندا" without boundary truncation', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };
    const obs = new CaptionsObserver(mockMeeting);

    const prev = 'من اطلاعی ندارم';
    const next = 'ندا جان نظر شما چیه؟';
    const merged = obs.mergeConsecutiveTexts(prev, next);
    assert.equal(merged, 'من اطلاعی ندارم ندا جان نظر شما چیه؟');
  });

  it('mergeConsecutiveTexts in CaptionsObserver completes 3+ letter truncated stem with diff > 3 (ندا -> نداشتیم)', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test', participants: [] },
      saveMessages: () => {},
    };
    const obs = new CaptionsObserver(mockMeeting);

    const prev = 'من مشکل ندا';
    const next = 'نداشتیم جلسه دیروز';
    const merged = obs.mergeConsecutiveTexts(prev, next);
    assert.equal(merged, 'من مشکل نداشتیم جلسه دیروز');
    assert.ok(!merged.includes('ندا نداشتیم'), 'Cut-off word "ندا" must be replaced with "نداشتیم"');
  });

  it('ignores Meet UI chrome around a caption and keeps only the spoken line', () => {
    const mockMeeting = {
      meetingInfo: { meetingId: 'test-meeting', participants: [] },
      saveMessages: async () => true,
    };
    const obs = new CaptionsObserver(mockMeeting);

    const shell = new MockElement('DIV', 'meeting-root');
    for (let i = 0; i < 6; i++) {
      const hint = new MockElement('DIV');
      hint.textContent = 'Press Down Arrow to open the hover tray and Escape to close it.';
      const mute = new MockElement('BUTTON');
      mute.textContent = 'Mute';
      shell.appendChild(hint);
      shell.appendChild(mute);
    }

    const menu = new MockElement('DIV');
    menu.setAttribute('role', 'listbox');
    menu.textContent = 'Persian (Iran) Afrikaans (South Africa) BETA Albanian (Albania) BETA Zulu (South Africa) BETA Font size Default Tiny Small Medium Large';
    shell.appendChild(menu);

    const block = new MockElement('DIV', 'nMcdL bj4p3b');
    const speaker = new MockElement('DIV', 'NWpY1d');
    speaker.textContent = 'Erfan Gholizade';
    const span = new MockElement('SPAN', 'ygicle VbkSUe');
    span.textContent = 'فقط همین جمله';
    block.appendChild(speaker);
    block.appendChild(span);
    shell.appendChild(block);
    global.document.body.appendChild(shell);

    const hint = shell.childNodes[0];
    assert.equal(obs.findCaptionBlock(hint), null);
    assert.equal(obs.getBlockText(shell), '');
    assert.equal(obs.isMeetChromeText(menu.textContent), true);

    obs.handleMutations([
      {
        type: 'childList',
        target: hint,
        addedNodes: [...hint.childNodes],
        removedNodes: [],
      },
      {
        type: 'childList',
        target: menu,
        addedNodes: [...menu.childNodes],
        removedNodes: [],
      },
    ]);
    assert.equal(obs.activeUtterances.size, 0);

    obs.handleMutations([
      {
        type: 'childList',
        target: block,
        addedNodes: [span],
        removedNodes: [],
      },
    ]);
    assert.equal(obs.currentUtterance.peakText, 'فقط همین جمله');
    assert.equal(obs.currentUtterance.peakText.includes('hover tray'), false);
    assert.equal(obs.currentUtterance.peakText.includes('BETA'), false);

    if (obs.currentUtterance?.debounceTimer) {
      clearTimeout(obs.currentUtterance.debounceTimer);
    }
    const shellIdx = global.document.body.childNodes.indexOf(shell);
    if (shellIdx !== -1) global.document.body.childNodes.splice(shellIdx, 1);
  });

  it('handleMutations processes added/modified blocks before removed nodes, preventing premature mid-word flush during span replacement', async () => {
    const savedMessages = [];
    const mockMeeting = {
      meetingInfo: { meetingId: 'test-meeting', participants: [] },
      saveMessages: async (msgs) => {
        savedMessages.push(...msgs);
        return true;
      },
    };
    const obs = new CaptionsObserver(mockMeeting);

    // Initial speaker container with in-progress stem
    const block = new MockElement('DIV', 'nMcdL bj4p3b');
    const speaker = new MockElement('DIV', 'KcIKyf jxFHg NWpY1d');
    speaker.textContent = 'Mohammad';
    block.appendChild(speaker);

    const textWrapper = new MockElement('DIV', 'iTTPOb');
    const oldSpan = new MockElement('SPAN', 'ygicle VbkSUe');
    oldSpan.textContent = 'من مشکل ندا';
    textWrapper.appendChild(oldSpan);
    block.appendChild(textWrapper);

    global.document.body.appendChild(block);

    // Trigger initial frame
    obs.handleMutations([
      {
        type: 'childList',
        target: block,
        addedNodes: [oldSpan],
        removedNodes: [],
      },
    ]);

    const utterance = obs.currentUtterance;
    assert.ok(utterance, 'Utterance must be active');
    assert.equal(utterance.peakText, 'من مشکل ندا');

    // Simulate Google Meet streaming update: oldSpan is removed and replaced with newSpan in textWrapper
    const newSpan = new MockElement('SPAN', 'ygicle VbkSUe');
    newSpan.textContent = 'من مشکل نداشتیم جلسه دیروز';

    // Remove oldSpan and append newSpan in mock DOM
    const oldIdx = textWrapper.childNodes.indexOf(oldSpan);
    if (oldIdx !== -1) textWrapper.childNodes.splice(oldIdx, 1);
    oldSpan.parentElement = null;
    textWrapper.appendChild(newSpan);

    obs.handleMutations([
      {
        type: 'childList',
        target: textWrapper,
        addedNodes: [newSpan],
        removedNodes: [oldSpan],
      },
    ]);

    // Active utterance must NOT have been prematurely flushed on oldSpan removal;
    // instead it should have read all child spans and updated peakText to the complete sentence.
    assert.equal(obs.currentUtterance.peakText, 'من مشکل نداشتیم جلسه دیروز');
    assert.equal(savedMessages.length, 0, 'No premature flush should occur while speech is actively streaming');

    // Clean up
    if (obs.currentUtterance?.debounceTimer) {
      clearTimeout(obs.currentUtterance.debounceTimer);
    }
    const blockIdx = global.document.body.childNodes.indexOf(block);
    if (blockIdx !== -1) global.document.body.childNodes.splice(blockIdx, 1);
  });
});

