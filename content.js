class Utils {
  static sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }
}

class DomHelper {
  static walkElements(root, callback) {
    const visit = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      callback(node);
      if (node.shadowRoot) {
        node.shadowRoot.childNodes.forEach(visit);
      }
      node.childNodes.forEach(visit);
    };
    visit(root);
  }

  static queryAll(root, selector) {
    if (!root) return [];
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  static query(root, selector) {
    if (!root) return null;
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }
}

class CaptionDom {
  static REGION_LABEL_PATTERN = /caption|subtitle|closed.?caption|زیرنویس|عنوان.?نویس|字幕|자막|sous-titre|untertitel|leyenda|subtítulo|subtitulo|legenda|legende|ترجمة|الترجمة/i;
  static BUTTON_LABEL_PATTERN = /caption|subtitle|closed.?caption|زیرنویس|عنوان.?نویس|字幕|자막|sous-titre|untertitel|leyenda|subtítulo|subtitulo|legenda|legende|ترجمة|الترجمة/i;
  static CAPTIONS_ON_PATTERN = /turn off|hide caption|disable caption|disable subtitle|خاموش|غیرفعال|بستن.*زیرنویس|关闭字幕|자막.*중지|desactivar.*subt|désactiver.*sous-titre|untertitel.*deaktivieren|desativar.*legenda|إيقاف.*الترجمة/i;
  static CAPTIONS_OFF_PATTERN = /turn on|show caption|enable caption|enable subtitle|فعال.?سازی|روشن|نمایش.*زیرنویس|باز کردن.*زیرنویس|开启字幕|자막.*사용|activar.*subt|activer.*sous-titre|untertitel.*aktivieren|ativar.*legenda|تشغيل.*الترجمة/i;

  static isAppShell(element) {
    if (!element || element.nodeType !== 1) return true;
    if (typeof document !== 'undefined' && (element === document.body || element === document.documentElement)) {
      return true;
    }
    return Boolean(element.matches?.('.a4cQT, .T4LgNb, [jscontroller="xoxr0b"]'));
  }

  static getCaptionsRegion() {
    for (const element of DomHelper.queryAll(document, '[role="region"][aria-label]')) {
      const label = element.getAttribute('aria-label') || '';
      if (this.REGION_LABEL_PATTERN.test(label) && !this.isAppShell(element)) {
        return element;
      }
    }

    const captionEl = DomHelper.query(document, '.ygicle.VbkSUe, .ygicle[class*="VbkSU"], .nMcdL .ygicle, .NmXUuc .ygicle');
    if (!captionEl) return null;

    const labeled = captionEl.closest('[role="region"][aria-label]');
    if (
      labeled &&
      this.REGION_LABEL_PATTERN.test(labeled.getAttribute('aria-label') || '') &&
      !this.isAppShell(labeled)
    ) {
      return labeled;
    }

    const block = captionEl.closest('.nMcdL, .NmXUuc') || captionEl;
    let best = this.isAppShell(block) ? null : block;
    let container = block.parentElement;
    while (container && !this.isAppShell(container)) {
      const buttons = container.querySelectorAll?.('button, [role="button"]') || [];
      if (buttons.length > 2) break;
      if (container.querySelector?.('[role="menu"], [role="listbox"], [role="dialog"]')) break;
      best = container;
      container = container.parentElement;
    }
    return best;
  }

  static hasVisibleCaptionText() {
    return Boolean(
      DomHelper.query(document, '[role="region"][aria-label] .ygicle') ||
      DomHelper.query(document, '.ygicle.VbkSUe') ||
      DomHelper.query(document, '.ygicle[class*="VbkSU"]') ||
      DomHelper.query(document, '.nMcdL .ygicle') ||
      DomHelper.query(document, '.NmXUuc .ygicle') ||
      DomHelper.query(document, '.nMcdL.bj4p3b')
    );
  }

  static findCaptionsButton() {
    const selectors = [
      'button[jsname="r6bRZb"]',
      'button[jsname="ds31cf"]',
      'button[data-tooltip-id*="captions" i]',
      'button[data-tooltip-id*="subtitles" i]',
      'button[aria-label*="Turn on captions" i]',
      'button[aria-label*="Turn off captions" i]',
      'button[aria-label*="Captions" i]',
      'button[aria-label*="captions" i]',
      'button[aria-label*="Subtitles" i]',
      'button[aria-label*="Closed captions" i]',
      'button[aria-label*="زیرنویس" i]',
      'button[aria-label*="عنوان" i]',
      'button[aria-label*="字幕" i]',
      'button[aria-label*="자막" i]',
      'button[aria-label*="sous-titre" i]',
      'button[aria-label*="subtítulo" i]',
      'button[aria-label*="subtitulo" i]',
      'button[aria-label*="untertitel" i]',
      'button[aria-label*="legenda" i]',
      'button[aria-label*="ترجمة" i]',
      'button[data-tooltip*="caption" i]',
      'button[data-tooltip*="Caption" i]',
      'button[data-tooltip*="subtitle" i]',
      'button[data-tooltip*="زیرنویس" i]',
      'button[data-tooltip*="자막" i]',
    ];

    for (const selector of selectors) {
      const button = DomHelper.query(document, selector);
      if (button) {
        return button;
      }
    }

    for (const button of DomHelper.queryAll(document, 'button[aria-label], button[data-tooltip], button[title]')) {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-tooltip') || ''} ${button.getAttribute('title') || ''}`;
      if (this.BUTTON_LABEL_PATTERN.test(label)) {
        return button;
      }
    }

    const iconSelectors = 'button [class*="google-symbols"], button [class*="material-icons"], button i, button [data-icon-name*="caption"]';
    for (const icon of DomHelper.queryAll(document, iconSelectors)) {
      const symbol = icon.textContent?.trim();
      if (symbol === 'closed_caption' || symbol === 'subtitles' || symbol === 'closed_caption_off' || symbol === 'subtitles_off' || symbol === 'closed_caption_disabled') {
        const button = icon.closest('button');
        if (button) {
          return button;
        }
      }
    }

    return null;
  }

  static isCaptionsButtonOn(button) {
    if (!button) return false;

    const ariaPressed = button.getAttribute('aria-pressed');
    if (ariaPressed === 'true') {
      return true;
    }
    if (ariaPressed === 'false') {
      return false;
    }

    const ariaChecked = button.getAttribute('aria-checked');
    if (ariaChecked === 'true') {
      return true;
    }
    if (ariaChecked === 'false') {
      return false;
    }

    const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-tooltip') || ''} ${button.getAttribute('title') || ''}`;
    if (this.CAPTIONS_ON_PATTERN.test(label)) {
      return true;
    }
    if (this.CAPTIONS_OFF_PATTERN.test(label)) {
      return false;
    }

    const iconSymbol = button.querySelector('[class*="symbols"], [class*="icons"], i')?.textContent?.trim() || '';
    if (iconSymbol === 'closed_caption_off' || iconSymbol === 'subtitles_off') {
      return true;
    }
    if (iconSymbol === 'closed_caption' || iconSymbol === 'subtitles') {
      return false;
    }

    if (button.classList?.contains('qs41qe') || button.classList?.contains('M9Bg4d')) {
      return true;
    }

    return this.hasVisibleCaptionText();
  }

  static isInCall() {
    const inCallSelectors = [
      'button[jsname="r8qRAd"]',
      'button[jsname="Hx74L"]',
      'button[jsname="CQyuld"]',
      'button[aria-label*="Leave call" i]',
      'button[aria-label*="Leave meeting" i]',
      'button[aria-label*="End call" i]',
      'button[aria-label*="خروج از تماس" i]',
      'button[aria-label*="ترک جلسه" i]',
      'button[aria-label*="ترک تماس" i]',
      'button[aria-label*="قطع تماس" i]',
      'button[aria-label*="پایان تماس" i]',
      'button[aria-label*="پایان جلسه" i]',
      'button[aria-label*="나가기" i]',
      'div[role="region"][aria-label*="call controls" i]',
      'div[role="region"][aria-label*="کنترل" i]',
      'div[data-allocation-index]',
      'button[jsname="B20Mich"]',
      'button[jsname="r6bRZb"]',
    ];
    return (
      inCallSelectors.some((selector) => Boolean(DomHelper.query(document, selector))) ||
      Boolean(this.findCaptionsButton()) ||
      Boolean(this.hasVisibleCaptionText())
    );
  }

  static tryKeyboardShortcut() {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable ||
        active.getAttribute?.('role') === 'textbox' ||
        active.getAttribute?.('contenteditable') === 'true')
    ) {
      return;
    }

    const init = {
      key: 'c',
      code: 'KeyC',
      keyCode: 67,
      which: 67,
      bubbles: true,
      cancelable: true,
    };

    const targets = [document.body, document.documentElement, window].filter(Boolean);
    targets.forEach((target) => {
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', init));
        target.dispatchEvent(new KeyboardEvent('keyup', init));
      } catch {}
    });
  }

  static async tryOpenCaptionsFromMenu() {
    const moreButton =
      DomHelper.query(document, 'button[jsname="NakZHc"]') ||
      DomHelper.query(document, 'button[aria-label*="More options" i]') ||
      DomHelper.query(document, 'button[aria-label*="گزینه" i]') ||
      DomHelper.query(document, 'button[aria-label*="بیشتر" i]') ||
      DomHelper.query(document, 'button[aria-label*="More" i]');

    if (!moreButton) {
      return false;
    }

    const alreadyExpanded = moreButton.getAttribute?.('aria-expanded') === 'true';
    if (!alreadyExpanded) {
      moreButton.click();
      await Utils.sleep(400);
    }

    const menuItems = DomHelper.queryAll(document, '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]');
    for (const item of menuItems) {
      const label = `${item.textContent || ''} ${item.getAttribute('aria-label') || ''}`;
      if (this.BUTTON_LABEL_PATTERN.test(label) || label.includes('closed_caption') || label.includes('subtitles')) {
        item.click();
        return true;
      }
    }

    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    } catch {}
    return false;
  }

  static waitFor(predicate, timeoutMs = 120000, intervalMs = 300) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let settled = false;
      let observer = null;
      let intervalId = null;

      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
        try {
          observer?.disconnect();
        } catch {}
        observer = null;
        resolve(value);
      };

      const check = () => {
        try {
          if (predicate()) {
            finish(true);
            return;
          }
        } catch {}
        if (Date.now() - startedAt >= timeoutMs) {
          finish(false);
        }
      };

      try {
        observer = new MutationObserver(check);
        observer.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      } catch {}

      check();
      if (!settled) {
        intervalId = setInterval(check, intervalMs);
      }
    });
  }
}

class RuntimeHelper {
  static isAvailable() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  static isContextInvalidated(error) {
    const message = String(error?.message || error || '');
    return message.includes('Extension context invalidated');
  }

  static sendMessage(message) {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        reject(new Error('Extension context invalidated.'));
        return;
      }

      try {
        const res = chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(response);
        });
        if (res && typeof res.catch === 'function') {
          res.catch((err) => reject(err));
        }
      } catch (error) {
        reject(error);
      }
    });
  }
}

class MessageNodeInfo {
  constructor(node, actorIndex, type, timestamp = new Date().toISOString()) {
    this.node = node;
    this.timestamp = timestamp;
    this.actorIndex = actorIndex;
    this.type = type;
  }
}

class Meeting {
  constructor(meetingInfo) {
    this.meetingInfo = meetingInfo;
    this.messageNodeInfos = new Map();
  }

  addMessageNodeInfo(node, actorIndex, type) {
    if (!this.messageNodeInfos.has(node)) {
      const messageNodeInfo = new MessageNodeInfo(node, actorIndex, type);
      this.messageNodeInfos.set(node, messageNodeInfo);
    }
  }

  removeMessageNodeInfo(node) {
    this.messageNodeInfos.delete(node);
  }

  async saveMessages(messages, options = {}) {
    if (!RuntimeHelper.isAvailable()) {
      console.warn('Extension context unavailable. Reload Google Meet after updating the extension.');
      return false;
    }

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const response = await RuntimeHelper.sendMessage({
          type: 'background.saveMeeting',
          meetingInfo: this.meetingInfo,
          messages,
          replacePrefix: Boolean(options.replacePrefix),
        });

        if (response && response.success) {
          console.log('Successfully saved captions');
          return true;
        }

        throw new Error('Save response was not successful');
      } catch (error) {
        if (RuntimeHelper.isContextInvalidated(error)) {
          console.warn('Extension context invalidated. Reload Google Meet to continue logging.');
          return false;
        }

        console.error(`Attempt ${retryCount + 1} failed:`, error);
        retryCount += 1;
        if (retryCount < maxRetries) {
          await Utils.sleep(1000);
        }
      }
    }

    console.error('Failed to save messages after', maxRetries, 'attempts');
    return false;
  }

  async syncMeetingTitle(newTitle) {
    if (!RuntimeHelper.isAvailable()) {
      return false;
    }
    try {
      await RuntimeHelper.sendMessage({
        type: 'background.updateMeetingTitle',
        meetingStartTime: this.meetingInfo.meetingStartTime,
        meetingTitle: newTitle,
        meetingId: this.meetingInfo.meetingId,
      });
      return true;
    } catch (error) {
      if (!RuntimeHelper.isContextInvalidated(error)) {
        console.warn('Failed to sync meeting title update:', error);
      }
      return false;
    }
  }
}

class CaptionsObserver {
  constructor(meeting) {
    this.meeting = meeting;
    this.observer = new MutationObserver(this.handleMutations);
    this.savedMessageKeys = new Map(); // key -> timestamp
    this.savesInFlight = new Set();
    this.activeUtterances = new Map();
    this.liveBlock = null;
    this.isBackgroundActive = false;
    this.isSaving = false;
    this.debounceMs = 2500;
    this.maxFlushMs = 12000;
  }

  get currentUtterance() {
    let latest = null;
    for (const u of this.activeUtterances.values()) {
      if (!latest || u.lastUpdated > latest.lastUpdated) {
        latest = u;
      }
    }
    return latest;
  }

  set currentUtterance(val) {
    if (val && val.speakerKey) {
      this.activeUtterances.set(val.speakerKey, val);
    }
  }

  getCaptionsRegion() {
    if (this._cachedRegion && (typeof document === 'undefined' || document.body?.contains(this._cachedRegion))) {
      return this._cachedRegion;
    }
    const region = CaptionDom.getCaptionsRegion();
    if (region) {
      this._cachedRegion = region;
    }
    return region;
  }

  isCaptionInRegion(element) {
    const region = this.getCaptionsRegion();
    if (!region || !element) return false;
    return region.contains(element);
  }

  isCaptionBlock(element) {
    if (element?.matches?.('.nMcdL.bj4p3b, .nMcdL, .NmXUuc')) {
      return true;
    }
    return this.isCaptionTextElement(element) && this.isCaptionInRegion(element);
  }

  isSpeakerHeaderNode(node) {
    if (!node || node.nodeType !== 1) return false;
    return Boolean(
      node.matches?.('.KcIKyf, .NWpY1d, .jxFHg, img') ||
      node.closest?.('.KcIKyf, .NWpY1d, .jxFHg')
    );
  }

  // Meet tiles, hover trays, and the caption settings menu sit in the same page as
  // the caption overlay. A container that holds those controls is not one utterance.
  isMeetChromeShell(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.querySelector?.('[role="menu"], [role="listbox"], [role="dialog"], [role="option"], [role="menuitem"]')) {
      return true;
    }
    const dedicatedCaption = element.matches?.('.nMcdL, .NmXUuc, .ygicle');
    const buttons = element.querySelectorAll?.('button, [role="button"]') || [];
    if (!dedicatedCaption && buttons.length > 2) return true;
    const descendants = element.querySelectorAll?.('*') || [];
    if (!dedicatedCaption && descendants.length > 80) return true;
    return false;
  }

  isSingleCaptionUtterance(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.getAttribute?.('role') === 'region') return false;
    if (element.matches?.('.a4cQT, [jscontroller="xoxr0b"]')) return false;
    const hasCaption = Boolean(element.querySelector?.('.ygicle'));
    const hasSpeaker = Boolean(element.querySelector?.('.NWpY1d, .KcIKyf, .jxFHg'));
    if (!hasCaption || !hasSpeaker) return false;
    return !this.isMeetChromeShell(element);
  }

  isSafeCaptionTarget(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.matches?.('.ygicle')) return true;
    if (this.isMeetChromeShell(element) && !element.matches?.('.nMcdL, .NmXUuc')) return false;
    if (element.matches?.('.nMcdL, .NmXUuc')) return true;
    return this.isSingleCaptionUtterance(element);
  }

  isUiControl(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'button' || tag === 'select' || tag === 'option' || tag === 'input' || tag === 'textarea') {
      return true;
    }
    const role = (node.getAttribute?.('role') || '').toLowerCase();
    return ['button', 'menu', 'listbox', 'option', 'menuitem', 'dialog', 'tab', 'slider', 'combobox', 'list'].includes(role);
  }

  isIconLigature(text) {
    return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(text || '');
  }

  isMeetChromeText(text) {
    const value = text || '';
    if (/hover tray|Open caption settings|Take notes with Gemini|Others might still see your full video|to your main screen|More options for |This call is open to anyone/i.test(value)) {
      return true;
    }
    const betaMarks = value.match(/\bBETA\b/g);
    if (betaMarks && betaMarks.length >= 3) return true;
    const icons = value.match(/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g);
    return Boolean(icons && icons.length >= 2);
  }

  findCaptionBlock(node) {
    let element = node;
    const isText = element?.nodeType === 3 || (typeof Node !== 'undefined' && element?.nodeType === Node.TEXT_NODE);
    if (isText) {
      element = element.parentElement;
    }
    const isElem = element?.nodeType === 1 || (typeof Node !== 'undefined' && element?.nodeType === Node.ELEMENT_NODE);
    if (!element || !isElem) {
      return null;
    }

    // 1. Look for the ancestor speaker container FIRST (.nMcdL, .NmXUuc, etc.)
    const speakerBlock =
      element.closest('.nMcdL.bj4p3b, .nMcdL, .NmXUuc') ||
      (element.matches?.('.nMcdL.bj4p3b, .nMcdL, .NmXUuc') ? element : null);
    if (speakerBlock) {
      return speakerBlock;
    }

    // 2. Innermost speaker row that actually holds caption text. Stop before a shell
    // that also contains tiles, pin/mute controls, or the caption language menu.
    let curr = element;
    while (
      curr &&
      curr !== (typeof document !== 'undefined' ? document.body : null) &&
      curr !== (typeof document !== 'undefined' ? document.documentElement : null) &&
      curr.getAttribute?.('role') !== 'region' &&
      !curr.matches?.('.a4cQT, [jscontroller="xoxr0b"]')
    ) {
      if (this.isSingleCaptionUtterance(curr)) {
        return curr;
      }
      curr = curr.parentElement;
    }

    // 3. Check if element itself is a caption block
    if (this.isCaptionBlock(element)) {
      return element;
    }

    // 4. Fallback to closest caption element or its parent
    const block = element.closest('.ygicle.VbkSUe, .ygicle[class*="VbkSU"], .ygicle');
    if (block && (block.matches('.nMcdL') || this.isCaptionInRegion(block))) {
      return block.parentElement?.closest?.('.nMcdL, .NmXUuc') || block;
    }

    return null;
  }

  getCaptionTextNode(blockNode) {
    if (blockNode?.matches?.('.ygicle')) {
      return blockNode;
    }
    return blockNode.querySelector?.('.ygicle.VbkSUe, .ygicle[class*="VbkSU"], .ygicle') || null;
  }

  isCaptionTextElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    return (
      element.matches('.ygicle.VbkSUe') ||
      element.matches('.ygicle[class*="VbkSU"]') ||
      (element.matches('.ygicle') && !!element.closest('.nMcdL.bj4p3b, .nMcdL, .NmXUuc'))
    );
  }

  findCaptionTextNode(node) {
    const block = this.findCaptionBlock(node);
    if (!block) {
      return null;
    }
    return this.getCaptionTextNode(block);
  }

  getSpeakerContext(blockNode) {
    return (
      blockNode.closest('.nMcdL.bj4p3b, .nMcdL, .NmXUuc') ||
      (blockNode.matches?.('.nMcdL.bj4p3b, .nMcdL, .NmXUuc') ? blockNode : null) ||
      blockNode.parentElement
    );
  }

  resolveActorIndex(blockNode) {
    const speakerNode = this.getSpeakerContext(blockNode);
    const name =
      speakerNode?.querySelector('.KcIKyf.jxFHg .NWpY1d')?.textContent.trim() ||
      speakerNode?.querySelector('.KcIKyf.jxFHg')?.textContent.trim() ||
      speakerNode?.querySelector('.NWpY1d')?.textContent.trim() ||
      'Unknown';
    const imageUrl = speakerNode?.querySelector('img.Z6byG.r6DyN')?.src || '';

    let actorIndex = this.meeting.meetingInfo.participants.findIndex(
      (p) => (imageUrl && p.imageUrl === imageUrl) || p.name === name
    );
    if (actorIndex === -1) {
      this.meeting.meetingInfo.participants.push({ name, imageUrl });
      actorIndex = this.meeting.meetingInfo.participants.length - 1;
    }
    return actorIndex;
  }

  normalizeText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  dedupApi() {
    const api = globalThis.MirzaTranscript;
    if (!api) {
      throw new Error('Transcript deduplicator is not loaded');
    }
    return api;
  }

  normalizeForComparison(text) {
    return this.dedupApi().normalizeForComparison(text);
  }

  wordsMatch(w1, w2) {
    return this.dedupApi().wordsMatch(w1, w2);
  }

  lcsWordMatchCount(wordsA, wordsB) {
    return this.dedupApi().lcsWordMatchCount(wordsA, wordsB);
  }

  classifyTextRelationship(olderText, newerText) {
    return this.dedupApi().classifyTextRelationship(olderText, newerText);
  }

  mergeConsecutiveTexts(prev, next) {
    return this.dedupApi().mergeConsecutiveTexts(prev, next);
  }

  getBlockText(blockNode) {
    if (!blockNode) return '';

    // If blockNode is inside an ancestor speaker block, use that container
    // so we never read only an isolated fragment or child span.
    const ancestor = this.findCaptionBlock(blockNode);
    const target = (ancestor && ancestor !== blockNode && !blockNode.matches?.('.nMcdL, .NmXUuc'))
      ? ancestor
      : blockNode;

    if (!this.isSafeCaptionTarget(target)) {
      return '';
    }

    if (target.matches?.('.ygicle') && (!target.parentElement || target.parentElement === (typeof document !== 'undefined' ? document.body : null))) {
      const onlySpan = this.normalizeText(target.textContent || '');
      return this.isMeetChromeText(onlySpan) ? '' : onlySpan;
    }

    const pieces = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 1) { // Element
        if (this.isSpeakerHeaderNode(node)) return;
        if (this.isUiControl(node)) return;
        const tag = (node.tagName || '').toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') return;
        if (node.childNodes && node.childNodes.length > 0) {
          for (const child of node.childNodes) {
            walk(child);
          }
        } else if (node.textContent && typeof node.textContent === 'string' && !node.querySelector) {
          const t = node.textContent.trim();
          if (t && !this.isIconLigature(t)) pieces.push(t);
        }
      } else if (node.nodeType === 3) { // Text
        const t = (node.textContent || '').trim();
        if (t && !this.isIconLigature(t)) pieces.push(t);
      }
    };

    walk(target);
    const text = this.normalizeText(pieces.join(' '));
    return this.isMeetChromeText(text) ? '' : text;
  }

  getSpeakerKey(blockNode) {
    const speakerNode = this.getSpeakerContext(blockNode);
    const name =
      speakerNode?.querySelector('.KcIKyf.jxFHg .NWpY1d')?.textContent.trim() ||
      speakerNode?.querySelector('.KcIKyf.jxFHg')?.textContent.trim() ||
      speakerNode?.querySelector('.NWpY1d')?.textContent.trim() ||
      'Unknown';
    const imageUrl = speakerNode?.querySelector('img.Z6byG.r6DyN')?.src || '';
    return `${name}::${imageUrl}`;
  }

  makeSaveKey(actorIndex, text) {
    return `${actorIndex}::${this.normalizeForComparison(text)}`;
  }

  wasAlreadySaved(actorIndex, text) {
    const normText = this.normalizeForComparison(text);
    if (!normText) return true;
    const key = this.makeSaveKey(actorIndex, text);
    const lastSavedTime = this.savedMessageKeys.get(key);
    if (lastSavedTime && Date.now() - lastSavedTime < 2500) {
      return true;
    }
    return false;
  }

  markAsSaved(actorIndex, text) {
    const key = this.makeSaveKey(actorIndex, text);
    const now = Date.now();
    this.savedMessageKeys.set(key, now);
    for (const [k, timestamp] of this.savedMessageKeys.entries()) {
      if (now - timestamp > 60000) {
        this.savedMessageKeys.delete(k);
      }
    }
  }

  clearSupersededKeys(actorIndex, text) {
    const prefix = `${actorIndex}::`;
    for (const [key] of this.savedMessageKeys.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const savedText = key.slice(prefix.length);
      const rel = this.classifyTextRelationship(savedText, text);
      if (rel === 'extension') {
        this.savedMessageKeys.delete(key);
      }
    }
  }

  shouldSkipSave(utterance, text) {
    return !text || this.wasAlreadySaved(utterance.actorIndex, text);
  }

  scheduleDebouncedFlush(utterance) {
    if (utterance.debounceTimer) {
      clearTimeout(utterance.debounceTimer);
    }
    utterance.debounceTimer = setTimeout(() => {
      utterance.debounceTimer = null;
      void this.flushUtterance(utterance);
    }, this.debounceMs);
  }

  startUtterance(blockNode, text) {
    const speakerKey = this.getSpeakerKey(blockNode);
    const actorIndex = this.resolveActorIndex(blockNode);
    const now = Date.now();
    const utterance = {
      blockNode,
      actorIndex,
      speakerKey,
      peakText: this.normalizeText(text),
      lastSavedText: '',
      lastUpdated: now,
      firstStartedAt: now,
      lastSavedAt: 0,
      debounceTimer: null,
    };
    this.activeUtterances.set(speakerKey, utterance);
    this.liveBlock = blockNode;
    this.scheduleDebouncedFlush(utterance);
    return utterance;
  }

  async flushUtterance(utterance) {
    if (!utterance) return false;
    const text = this.normalizeText(utterance.peakText);
    if (!text || text === utterance.lastSavedText) {
      return false;
    }
    const saved = await this.saveUtterance(utterance);
    if (saved) {
      utterance.lastSavedText = text;
      utterance.lastSavedAt = Date.now();
    }
    return saved;
  }

  async saveUtterance(utterance) {
    if (!utterance) {
      return false;
    }

    const text = this.normalizeText(utterance.peakText);
    if (!text) {
      return false;
    }

    const { actorIndex } = utterance;
    const saveKey = this.makeSaveKey(actorIndex, text);

    if (this.savesInFlight.has(saveKey)) {
      return false;
    }

    if (this.wasAlreadySaved(actorIndex, text)) {
      return false;
    }

    this.clearSupersededKeys(actorIndex, text);
    this.savesInFlight.add(saveKey);
    try {
      const success = await this.meeting.saveMessages(
        [
          {
            actorIndex,
            text,
            timestamp: new Date().toISOString(),
            type: 'caption',
          },
        ],
        { replacePrefix: true }
      );

      if (success) {
        this.markAsSaved(actorIndex, text);
        console.log('Saved caption');
        return true;
      }
    } finally {
      this.savesInFlight.delete(saveKey);
    }

    return false;
  }

  async closeCurrentUtterance() {
    await this.flushPendingSaves();
  }

  updateUtterancePeak(blockNode, text) {
    const speakerKey = this.getSpeakerKey(blockNode);
    const active = this.activeUtterances.get(speakerKey);
    if (!active) {
      this.startUtterance(blockNode, text);
      return;
    }
    const normalizedText = this.normalizeText(text);
    const previousPeak = this.normalizeText(active.peakText);
    if (normalizedText.length >= previousPeak.length) {
      active.peakText = normalizedText;
    }
    active.blockNode = blockNode;
    active.lastUpdated = Date.now();
    this.liveBlock = blockNode;
    this.scheduleDebouncedFlush(active);
  }

  async processCaptionBlock(blockNode) {
    if (!blockNode || (typeof document !== 'undefined' && document.body && !document.body.contains(blockNode))) {
      return;
    }

    const captionNode = this.getCaptionTextNode(blockNode);
    if (!captionNode || captionNode.matches?.('.NWpY1d')) {
      return;
    }

    const text = this.getBlockText(blockNode);
    if (!text) {
      return;
    }

    const speakerKey = this.getSpeakerKey(blockNode);
    const active = this.activeUtterances.get(speakerKey);

    if (!active) {
      this.startUtterance(blockNode, text);
      return;
    }

    // If previous sentence was already flushed and has been idle, start fresh turn
    const timeSinceLastUpdate = Date.now() - active.lastUpdated;
    if (active.lastSavedText && timeSinceLastUpdate > 4000) {
      const relWithSaved = this.classifyTextRelationship(active.lastSavedText, text);
      if (relWithSaved !== 'extension' && relWithSaved !== 'duplicate') {
        if (active.debounceTimer) {
          clearTimeout(active.debounceTimer);
          active.debounceTimer = null;
        }
        await this.flushUtterance(active);
        this.startUtterance(blockNode, text);
        return;
      }
    }

    const rel = this.classifyTextRelationship(active.peakText, text);

    if (rel === 'none') {
      // Check if incoming text extends active.peakText across Google Meet line roll-off
      const merged = this.mergeConsecutiveTexts(active.peakText, text);
      if (merged && merged !== `${active.peakText} ${text}` && merged.length > active.peakText.length) {
        active.peakText = this.normalizeText(merged);
        active.blockNode = blockNode;
        active.lastUpdated = Date.now();
        this.liveBlock = blockNode;
        this.scheduleDebouncedFlush(active);
        return;
      }

      // Speaker finished previous sentence and started a new one in the same block!
      // Finalize and flush the previous sentence before starting the new one.
      if (active.debounceTimer) {
        clearTimeout(active.debounceTimer);
        active.debounceTimer = null;
      }
      await this.flushUtterance(active);
      this.startUtterance(blockNode, text);
      return;
    }

    if (rel === 'extension') {
      active.peakText = this.normalizeText(text);
      active.blockNode = blockNode;
      active.lastUpdated = Date.now();
      this.liveBlock = blockNode;

      const lastFlush = active.lastSavedAt || active.firstStartedAt || 0;
      if (Date.now() - lastFlush >= this.maxFlushMs) {
        if (active.debounceTimer) {
          clearTimeout(active.debounceTimer);
          active.debounceTimer = null;
        }
        void this.flushUtterance(active);
        this.scheduleDebouncedFlush(active);
      } else {
        this.scheduleDebouncedFlush(active);
      }
      return;
    }

    if (rel === 'subsumed') {
      const normOlder = this.normalizeForComparison(active.peakText);
      const normNewer = this.normalizeForComparison(text);

      // Check if incoming text is simply the tail of current peakText (Google Meet roll-off)
      const isTailRollOff = normOlder.endsWith(normNewer) || (
        Boolean(active.lastSavedText) && this.normalizeForComparison(active.lastSavedText).endsWith(normNewer)
      );

      if (isTailRollOff) {
        active.blockNode = blockNode;
        active.lastUpdated = Date.now();
        this.liveBlock = blockNode;
        this.scheduleDebouncedFlush(active);
        return;
      }

      // If the incoming text shrank significantly compared to peakText (and is not tail roll-off),
      // it is an utterance shrink (new sentence) rather than a minor STT frame rewrite.
      const olderWords = normOlder.split(' ').filter(Boolean);
      const newerWords = normNewer.split(' ').filter(Boolean);

      const wordDrop = olderWords.length - newerWords.length;
      const shrinkRatio = olderWords.length > 0 ? (wordDrop / olderWords.length) : 0;
      if (wordDrop >= 4 || shrinkRatio >= 0.5) {
        if (active.debounceTimer) {
          clearTimeout(active.debounceTimer);
          active.debounceTimer = null;
        }
        await this.flushUtterance(active);
        this.startUtterance(blockNode, text);
        return;
      }

      active.blockNode = blockNode;
      active.lastUpdated = Date.now();
      this.liveBlock = blockNode;
      this.scheduleDebouncedFlush(active);
      return;
    }

    if (rel === 'duplicate') {
      active.blockNode = blockNode;
      active.lastUpdated = Date.now();
      this.liveBlock = blockNode;
      this.scheduleDebouncedFlush(active);
      return;
    }
  }

  handleMutations = (mutations) => {
    const blocksToProcess = new Set();
    let hasRemovedNodes = false;

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        if (mutation.removedNodes.length > 0) {
          hasRemovedNodes = true;
        }

        mutation.addedNodes.forEach((node) => {
          if (!node) return;
          const block = this.findCaptionBlock(node);
          if (block) {
            blocksToProcess.add(block);
          } else if (node.nodeType === 1) {
            const innerBlocks = node.querySelectorAll?.('.nMcdL.bj4p3b, .nMcdL, .NmXUuc, .ygicle.VbkSUe, .ygicle');
            if (innerBlocks && innerBlocks.length > 0) {
              innerBlocks.forEach((ib) => {
                const b = this.findCaptionBlock(ib);
                if (b) blocksToProcess.add(b);
              });
            }
          }
        });
      }

      const block = this.findCaptionBlock(mutation.target);
      if (block) {
        blocksToProcess.add(block);
      }
    });

    // 1. Process all updated and added blocks first so all child text spans are read
    // and utterances updated before any decision to flush is made.
    blocksToProcess.forEach((block) => {
      void this.processCaptionBlock(block);
    });

    // 2. Handle genuinely removed nodes: if any active utterance's blockNode is no longer in document.body
    if (hasRemovedNodes && this.activeUtterances.size > 0) {
      for (const [speakerKey, utterance] of [...this.activeUtterances.entries()]) {
        if (!document.body.contains(utterance.blockNode)) {
          // Check if there is still an active block in DOM for this speaker before giving up
          let foundBlock = null;
          const region = this.getCaptionsRegion();
          if (region) {
            const speakerBlocks = region.querySelectorAll?.('.nMcdL.bj4p3b, .nMcdL, .NmXUuc');
            if (speakerBlocks && speakerBlocks.length > 0) {
              for (const b of speakerBlocks) {
                if (this.getSpeakerKey(b) === speakerKey) {
                  foundBlock = b;
                  break;
                }
              }
            }
          }
          if (foundBlock) {
            utterance.blockNode = foundBlock;
            continue;
          }

          if (utterance.debounceTimer) {
            clearTimeout(utterance.debounceTimer);
            utterance.debounceTimer = null;
          }
          void this.flushUtterance(utterance);
          this.activeUtterances.delete(speakerKey);
        }
      }
    }
  };

  scanExistingCaptions() {
    const region = this.getCaptionsRegion();
    if (!region) return;
    const selector = '.nMcdL.bj4p3b, .nMcdL, .NmXUuc, .ygicle.VbkSUe, .ygicle[class*="VbkSU"], .ygicle';
    const rawBlocks = [...region.querySelectorAll(selector)];
    const blocks = rawBlocks.filter((element) => {
      if (!element.matches('.ygicle')) {
        return true;
      }
      return !rawBlocks.some((other) => other !== element && other.contains(element));
    });

    blocks.forEach((block) => {
      const text = this.getBlockText(block);
      if (text) {
        this.processCaptionBlock(block);
      }
    });
  }

  async flushPendingSaves() {
    const promises = [];
    for (const [speakerKey, utterance] of [...this.activeUtterances.entries()]) {
      if (utterance.debounceTimer) {
        clearTimeout(utterance.debounceTimer);
        utterance.debounceTimer = null;
      }
      promises.push(this.flushUtterance(utterance));
    }
    this.activeUtterances.clear();
    await Promise.all(promises);
  }

  async waitForCaptions() {
    if (CaptionDom.getCaptionsRegion()) {
      console.log('Captions region detected');
      return CaptionDom.getCaptionsRegion();
    }
    const inCall = await CaptionDom.waitFor(() => CaptionDom.isInCall() || CaptionDom.getCaptionsRegion(), 20000);
    if (CaptionDom.getCaptionsRegion()) {
      console.log('Captions region detected');
    } else if (inCall) {
      console.log('Meeting detected. Waiting for the captions region.');
    } else {
      console.log('Meeting UI not ready yet. Will attach when captions appear.');
    }
    return CaptionDom.getCaptionsRegion();
  }

  observeCaptionsRegion(region) {
    if (this._disposed || !region) return;
    this._cachedRegion = region;
    if (!this.observer) {
      this.observer = new MutationObserver(this.handleMutations);
    }
    try {
      this.observer.disconnect();
      this.observer.observe(region, {
        childList: true,
        subtree: true,
        characterData: true,
        characterDataOldValue: true,
      });
    } catch (error) {
      console.error('Failed to observe captions region:', error);
    }
  }

  async run() {
    this.addListeners();
    const region = await this.waitForCaptions();
    if (region) {
      this.observeCaptionsRegion(region);
      this.scanExistingCaptions();
    }
    this._regionTimer = setInterval(() => {
      if (this._disposed) return;
      const next = CaptionDom.getCaptionsRegion();
      if (!next || next === this._cachedRegion) return;
      this.observeCaptionsRegion(next);
      this.scanExistingCaptions();
    }, 1000);
    this._regionTimer.unref?.();
    console.log('Captions observer started');
  }

  handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      for (const utterance of this.activeUtterances.values()) {
        const block = utterance.blockNode;
        if (block && (document.body?.contains?.(block) || document.documentElement?.contains?.(block))) {
          const text = this.getBlockText(block);
          if (text.length > (utterance.peakText || '').length) {
            utterance.peakText = text;
          }
        }
        void this.flushUtterance(utterance);
      }
    }
  };

  addListeners() {
    window.addEventListener('beforeunload', this.handleUnload);
    window.addEventListener('pagehide', this.handleUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.observeLeaveButton();

    chrome?.runtime?.onMessage?.addListener?.((message, sender, sendResponse) => {
      if (message.type === "background.activated") {
        console.log("Background script activated");
        this.isBackgroundActive = true;
        sendResponse({ success: true });
      }
    });
  }

  observeLeaveButton() {
    const handleLeaveClick = () => {
      console.log("Leave button clicked, saving messages...");
      void this.handleUnload();
    };

    const leaveButtonSelectors = [
      'button[jsname="r8qRAd"]',
      'button[jsname="Hx74L"]',
      'button[jsname="CQyuld"]',
      'button[jsname="Qx7uuf"]',
      'button[aria-label*="Leave call" i]',
      'button[aria-label*="Leave meeting" i]',
      'button[aria-label*="End call" i]',
      'button[aria-label*="خروج از تماس" i]',
      'button[aria-label*="ترک جلسه" i]',
      'button[aria-label*="ترک تماس" i]',
      'button[aria-label*="قطع تماس" i]',
      'button[aria-label*="پایان تماس" i]',
      'button[aria-label*="پایان جلسه" i]',
      'button[aria-label*="나가기" i]',
    ];

    const attachLeaveListeners = () => {
      leaveButtonSelectors.forEach((selector) => {
        try {
          const leaveButtons = document.querySelectorAll(selector);
          leaveButtons.forEach((btn) => {
            if (btn && !btn.hasAttribute('data-leave-handler')) {
              btn.setAttribute('data-leave-handler', 'true');
              btn.addEventListener('click', handleLeaveClick);
            }
          });
        } catch {}
      });
    };

    // Use delegated click event listener to catch leave button clicks without full-body MutationObserver
    this.onDocumentClick = (e) => {
      const target = e?.target;
      if (!target) return;
      for (const selector of leaveButtonSelectors) {
        if (target.matches?.(selector) || target.closest?.(selector)) {
          handleLeaveClick();
          break;
        }
      }
    };

    try {
      document.addEventListener('click', this.onDocumentClick, true);
    } catch {}

    attachLeaveListeners();
  }

  handleUnload = async () => {
    if (this.isSaving) {
      return;
    }
    this.isSaving = true;

    try {
      await this.flushPendingSaves();
    } catch (error) {
      if (!RuntimeHelper.isContextInvalidated(error)) {
        console.error('Error saving captions on page unload:', error);
      }
    }

    this.cleanup();
  }

  cleanup() {
    this._disposed = true;
    if (this._regionTimer) {
      clearInterval(this._regionTimer);
      this._regionTimer = null;
    }
    window.removeEventListener('beforeunload', this.handleUnload);
    window.removeEventListener('pagehide', this.handleUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    if (this.onDocumentClick) {
      try {
        document.removeEventListener('click', this.onDocumentClick, true);
      } catch {}
      this.onDocumentClick = null;
    }

    for (const utterance of this.activeUtterances.values()) {
      if (utterance.debounceTimer) {
        clearTimeout(utterance.debounceTimer);
        utterance.debounceTimer = null;
      }
    }

    if (this.leaveButtonObserver) {
      try {
        this.leaveButtonObserver.disconnect();
      } catch {}
      this.leaveButtonObserver = null;
    }
    try {
      this.observer?.disconnect();
    } catch {}
    this.observer = null;
  }
}

class MeetingTitleExtractor {
  static LOBBY_TITLE_PHRASES = [
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

  static UI_CONTROL_PHRASES = [
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

  static isLobbyOrGenericTitle(title, meetingId = '') {
    if (!title || typeof title !== 'string') return true;
    let t = title.trim();
    if (!t) return true;

    // Remove leading bidi control marks
    t = t.replace(/^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]+/gu, '').trim();

    // Remove notification counter prefix like (1), (2), (۱), (۲)
    t = t.replace(/^\([\d\u0660-\u0669\u06F0-\u06F9]+\)\s*/u, '').trim();

    // Remove prefixes/suffixes: "Meet - ", "Meet: ", " - Google Meet", "# Meet", "گوگل میت", "میت", etc.
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
    if (this.UI_CONTROL_PHRASES.some(phrase => cleaned === phrase || cleaned.startsWith(phrase))) {
      return true;
    }

    // Check lobby phrases with word boundary / punctuation match
    return this.LOBBY_TITLE_PHRASES.some(phrase => {
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

  static cleanTitle(rawTitle, meetingId = '') {
    if (!rawTitle || typeof rawTitle !== 'string') {
      return '';
    }
    let title = rawTitle.trim();
    if (!title) return '';

    // Remove leading bidi control marks
    title = title.replace(/^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]+/gu, '').trim();

    // Remove notification counter prefix like (1), (2), (۱), (۲)
    title = title.replace(/^\([\d\u0660-\u0669\u06F0-\u06F9]+\)\s*/u, '').trim();

    // Remove English prefixes/suffixes
    title = title.replace(/^(?:Google\s+)?Meet\s*[-–—:|#]\s*/i, '').trim();
    title = title.replace(/\s*[-–—:|#]\s*(?:Google\s+)?Meet$/i, '').trim();

    // Remove Persian prefixes/suffixes
    title = title.replace(/^(?:گوگل\s+)?میت\s*[-–—:|#]\s*/iu, '').trim();
    title = title.replace(/\s*[-–—:|#]\s*(?:گوگل\s+)?میت$/iu, '').trim();

    // Remove clock prefix if present (e.g. from .u6vdEc: "12:30 PM | Title" or "12:30 · Title" or "۱۲:۳۰ | Title")
    title = title.replace(/^[\d\u0660-\u0669\u06F0-\u06F9]{1,2}:[\d\u0660-\u0669\u06F0-\u06F9]{2}(?::[\d\u0660-\u0669\u06F0-\u06F9]{2})?\s*(?:am|pm|ق\.?ظ|ب\.?ظ|ق\u200cظ|ب\u200cظ)?\s*[-–—|·•]\s*/iu, '').trim();

    // Strip stray punctuation/bidi chars from edges while preserving title content
    title = title
      .replace(/^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069?!؟.\-_–—:|#()·•]+/gu, '')
      .replace(/[\s\u200e\u200f\u202a-\u202e\u2066-\u2069?!؟.\-_–—:|#()·•]+$/gu, '')
      .trim();

    if (!title) return '';

    // Check if this is a lobby or generic title
    if (this.isLobbyOrGenericTitle(title, meetingId)) {
      return '';
    }

    return title;
  }

  static getTitleFromScripts(meetingId = '') {
    if (!meetingId || typeof document === 'undefined') return '';
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent;
        if (!content || !content.includes(meetingId)) continue;

        // Search for JSON/JS arrays containing meetingId and string titles
        const regex = new RegExp(`\\[[^\\]]*?"${meetingId}"[^\\]]*?\\]`, 'g');
        let match;
        while ((match = regex.exec(content)) !== null) {
          try {
            const arr = JSON.parse(match[0]);
            if (Array.isArray(arr)) {
              for (const item of arr) {
                if (typeof item === 'string') {
                  const cleaned = this.cleanTitle(item, meetingId);
                  if (
                    cleaned &&
                    cleaned !== meetingId &&
                    !cleaned.startsWith('spaces/') &&
                    !cleaned.startsWith('http') &&
                    !cleaned.includes('/') &&
                    !/^[a-z0-9_-]{15,}$/i.test(cleaned) &&
                    cleaned.length >= 2 &&
                    cleaned.length <= 120
                  ) {
                    return cleaned;
                  }
                }
              }
            }
          } catch {}
        }
      }
    } catch {}
    return '';
  }

  static getTitleFromDom(meetingId = '') {
    // 1. Check Document title FIRST — Google Meet sets document.title
    // to "Meet - <Title>" or "<Title> - Google Meet" for calendar meetings
    if (typeof document !== 'undefined' && document.title) {
      const docTitleCleaned = this.cleanTitle(document.title, meetingId);
      if (docTitleCleaned && docTitleCleaned !== meetingId) {
        return docTitleCleaned;
      }
    }

    // 2. Check data-meeting-title attribute or data-call-title
    if (typeof document !== 'undefined') {
      const dataTitleEl = document.querySelector('[data-meeting-title]');
      if (dataTitleEl) {
        const attrTitle = dataTitleEl.getAttribute('data-meeting-title');
        const cleaned = this.cleanTitle(attrTitle, meetingId);
        if (cleaned && cleaned !== meetingId) return cleaned;
        const textTitle = dataTitleEl.textContent;
        const cleanedText = this.cleanTitle(textTitle, meetingId);
        if (cleanedText && cleanedText !== meetingId) return cleanedText;
      }

      const dataCallEl = document.querySelector('[data-call-title]');
      if (dataCallEl) {
        const cleaned = this.cleanTitle(dataCallEl.getAttribute('data-call-title') || dataCallEl.textContent, meetingId);
        if (cleaned && cleaned !== meetingId) return cleaned;
      }

      // 3. Check meta tags
      const metaSelectors = [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="title"]'
      ];
      for (const sel of metaSelectors) {
        const meta = document.querySelector(sel);
        if (meta) {
          const content = meta.getAttribute('content');
          const cleaned = this.cleanTitle(content, meetingId);
          if (cleaned && cleaned !== meetingId) return cleaned;
        }
      }

      // 4. Meeting Details side panel / dialog (if open or rendered in DOM)
      const panelSelectors = [
        'div[data-panel-id="1"] h2',
        'div[data-panel-id="1"] [role="heading"]',
        'div[aria-label*="Meeting details" i] h2',
        'div[aria-label*="Meeting details" i] [role="heading"]',
        'div[aria-label*="اطلاعات جلسه" i] h2',
        'div[aria-label*="جزئیات جلسه" i] h2',
        'div[role="complementary"] h2',
        'div[role="complementary"] [role="heading"]',
        '.G4gCq'
      ];
      for (const sel of panelSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.textContent?.trim();
          const cleaned = this.cleanTitle(text, meetingId);
          if (cleaned && cleaned !== meetingId) return cleaned;
        }
      }

      // 5. Dedicated title spans in bottom meeting info area (text only, NOT control buttons)
      // Prioritize child title spans first so parent clock/separator is not picked up
      const infoSelectors = [
        'div.roS0pe',
        'div.YVO4Fc',
        'div.J37v0b',
        'div.AWCOae',
        'div.CYZHgf',
        'div[jsname="r4nke"]',
        '.u6vdEc'
      ];
      for (const sel of infoSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.textContent?.trim();
          const cleaned = this.cleanTitle(text, meetingId);
          if (cleaned && cleaned !== meetingId) return cleaned;
        }
      }
    }

    // 6. Script tags (AF_initDataCallback / page bootstrap data)
    const scriptTitle = this.getTitleFromScripts(meetingId);
    if (scriptTitle) {
      return scriptTitle;
    }

    return '';
  }

  static extractMeetingInfo() {
    try {
      const meetingURL = typeof window !== 'undefined' ? window.location?.href || '' : '';
      const meetingId = meetingURL ? (new URL(meetingURL).pathname.split('/')[1] || '') : '';
      const meetingStartTime = new Date().toISOString();
      const participants = [];

      let meetingTitle = this.getTitleFromDom(meetingId);

      // If still no clean title, use meetingId as placeholder —
      // MeetingTitleObserver will replace it once the real title loads after join
      if (!meetingTitle) {
        meetingTitle = meetingId || 'Untitled Meeting';
      }

      console.log('Meeting Id:', meetingId);
      console.log('Meeting Title:', meetingTitle);
      console.log('Meeting Start Time:', meetingStartTime);

      return { meetingId, meetingTitle, meetingStartTime, participants };
    } catch (error) {
      console.error('Error extracting meeting info:', error);
      const meetingId = (typeof window !== 'undefined' ? window.location?.pathname?.split('/')?.[1] : '') || '';
      return {
        meetingId,
        meetingTitle: meetingId || 'Untitled Meeting',
        meetingStartTime: new Date().toISOString(),
        participants: []
      };
    }
  }
}

class MeetingTitleObserver {
  constructor(meeting) {
    this.meeting = meeting;
    this.observer = null;
    this.headObserver = null;
    this.pollInterval = null;
    this.hasFoundCalendarTitle = false;
    this._attemptedPanelToggle = false;
  }

  start() {
    this.checkAndUpdate();

    // Observe document title element
    const titleEl = document.querySelector('title');
    if (titleEl) {
      this.observer = new MutationObserver(() => this.checkAndUpdate());
      this.observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    // Also observe document head
    if (document.head) {
      this.headObserver = new MutationObserver(() => this.checkAndUpdate());
      this.headObserver.observe(document.head, { childList: true, subtree: true });
    }

    // Poll periodically as Google Meet loads meeting details / calendar event info after join
    let count = 0;
    this.pollInterval = setInterval(() => {
      count++;
      this.checkAndUpdate();
      if (!this.hasFoundCalendarTitle && count >= 2 && CaptionDom.isInCall()) {
        void this.tryFetchFromDetailsPanel();
      }
      if (this.hasFoundCalendarTitle || count > 60) {
        clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.checkAndUpdate(), 30000);
      }
    }, 2500);
  }

  async tryFetchFromDetailsPanel() {
    if (this.hasFoundCalendarTitle || !CaptionDom.isInCall()) return;

    // Check if panel is already in DOM
    const panel = document.querySelector(
      'div[data-panel-id="1"], div[aria-label*="Meeting details" i], div[aria-label*="اطلاعات جلسه" i], div[aria-label*="جزئیات جلسه" i], div[role="complementary"]'
    );
    if (panel) {
      const h = panel.querySelector('h2, h3, [role="heading"], .G4gCq');
      const cleaned = MeetingTitleExtractor.cleanTitle(h?.textContent || '', this.meeting.meetingInfo.meetingId);
      if (cleaned) {
        console.log('Auto-detected meeting title from details panel:', cleaned);
        this.meeting.meetingInfo.meetingTitle = cleaned;
        this.hasFoundCalendarTitle = true;
        void this.meeting.syncMeetingTitle(cleaned);
      }
    }
  }

  checkAndUpdate() {
    const meetingId = this.meeting.meetingInfo.meetingId;
    const currentTitle = this.meeting.meetingInfo.meetingTitle;
    const detected = MeetingTitleExtractor.getTitleFromDom(meetingId);

    if (!detected) return;

    const isGeneric = (t) => MeetingTitleExtractor.isLobbyOrGenericTitle(t, meetingId);
    const isBetter =
      isGeneric(currentTitle) ||
      (currentTitle === meetingId && detected !== meetingId);

    if (isBetter && detected !== currentTitle) {
      console.log('Auto-detected meeting title:', detected);
      this.meeting.meetingInfo.meetingTitle = detected;
      if (detected !== meetingId) {
        this.hasFoundCalendarTitle = true;
      }
      void this.meeting.syncMeetingTitle(detected);
    }
  }

  stop() {
    try {
      this.observer?.disconnect();
    } catch {}
    this.observer = null;

    try {
      this.headObserver?.disconnect();
    } catch {}
    this.headObserver = null;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

class ParticipantsOpserver {
  constructor(meeting) {
    this.meeting = meeting;
    this.observer = new MutationObserver(this.handleMutations);
  }

  handleMutations = (mutations) => {
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
        mutation.addedNodes.forEach(addedNode => {
          if (addedNode.querySelector(".ZjFb7c")) {
            const participant = this.extractParticipantInfo(addedNode);
            console.log("Join Participant: ", participant)
            // this.processParticipantEvent("join", participant);
          }
        });

        mutation.removedNodes.forEach(removedNode => {
          if (removedNode.querySelector(".ZjFb7c")) {
            const participant = this.extractParticipantInfo(removedNode);
            console.log("Leave Participant: ", participant)
            // this.processParticipantEvent("leave", participant);
          }
        });
      }
    });
  };

  processParticipantEvent(type, participant) {
    const timestamp = new Date().toISOString();
    const participants = this.meeting.meetingInfo.participants;
    const actorIndex = participants.findIndex((p) => p.name === participant.name);

    if (actorIndex === -1 && type === "join") {
      participants.push(participant);
    }

    const text = participant.name + " " + type + "ed the meeting";
    const messageInfo = { actorIndex, timestamp, text, type: type };

    this.meeting.saveMessages([messageInfo]);
  }

  extractParticipantInfo(participantNode) {
    const name = participantNode.querySelector('div.EY8ABd-OWXEXe-TAWMXe').innerText;
    const imageUrl = participantNode.querySelector('img[src]').src;

    return { name, imageUrl };
  }

  initParticipant(container) {
    const nodes = container.querySelectorAll('div [jsname="E2KThb"]')
    nodes.forEach(node => {
      const participant = this.extractParticipantInfo(node);
      this.processParticipantEvent("join", participant);
    });
  }

  async waitForParticipants() {
    let participantsContainer;
    while (!participantsContainer) {
      participantsContainer = document.querySelector('div.dkjMxf');
      await Utils.sleep(300);
    }
    return participantsContainer;
  }

  async run() {
    this.addListeners()

    const participansContainer = await this.waitForParticipants();

    this.initParticipant(participansContainer)

    this.observer.observe(participansContainer, { childList: true });
  }

  addListeners() {
    window.addEventListener("beforeunload", this.handleUnload);
    window.addEventListener("pagehide", this.handleUnload);
  }

  handleUnload = () => {
    window.removeEventListener("beforeunload", this.handleUnload);
    window.removeEventListener("pagehide", this.handleUnload);

    try {
      this.observer?.disconnect();
    } catch {}
    this.observer = null;
  }

  cleanup() {
    this.handleUnload();
  }
}

class MeetAssistant {
  constructor() {
    this.captionsObserver = null;
    this.participantsObserver = null;
    this.titleObserver = null;
    this._lateCaptionsObserver = null;
    this._lateCaptionsInterval = null;
    this._isLateChecking = false;
  }

  areCaptionsVisible() {
    return CaptionDom.hasVisibleCaptionText();
  }

  findCaptionsButton() {
    return CaptionDom.findCaptionsButton();
  }

  async enableCaptionsButton() {
    try {
      if (this.areCaptionsVisible()) {
        console.log('Captions already visible');
        return;
      }

      // 1. If not yet in call and captions button is not visible, wait for meeting UI to load
      if (!CaptionDom.isInCall() && !this.findCaptionsButton()) {
        const joined = await CaptionDom.waitFor(
          () => CaptionDom.isInCall() || this.findCaptionsButton() || this.areCaptionsVisible(),
          30000
        );
        if (!joined) {
          console.log('Meeting UI not ready yet. Captions will be enabled when controls appear.');
        }
      }

      if (this.areCaptionsVisible()) {
        console.log('Captions already visible');
        return;
      }

      // 2. Try clicking the captions button if present
      const captionBtn = this.findCaptionsButton();
      if (captionBtn) {
        if (CaptionDom.isCaptionsButtonOn(captionBtn)) {
          console.log('Captions already turned on');
          return;
        }
        captionBtn.click();
        const enabled = await CaptionDom.waitFor(
          () => this.areCaptionsVisible() || CaptionDom.isCaptionsButtonOn(captionBtn),
          2500,
          250
        );
        if (enabled) {
          console.log('Captions enabled');
          return;
        }
      }

      // 3. Try keyboard shortcut 'c' (if not typing in input/textarea/contenteditable)
      CaptionDom.tryKeyboardShortcut();
      const shortcutSuccess = await CaptionDom.waitFor(
        () => this.areCaptionsVisible() || (this.findCaptionsButton() && CaptionDom.isCaptionsButtonOn(this.findCaptionsButton())),
        1500,
        250
      );
      if (shortcutSuccess) {
        console.log('Captions enabled via keyboard shortcut');
        return;
      }

      // 4. Try opening captions via the "More options" (3 dots) menu
      const menuOpened = await CaptionDom.tryOpenCaptionsFromMenu();
      if (menuOpened) {
        const menuSuccess = await CaptionDom.waitFor(
          () => this.areCaptionsVisible() || (this.findCaptionsButton() && CaptionDom.isCaptionsButtonOn(this.findCaptionsButton())),
          1500,
          250
        );
        if (menuSuccess) {
          console.log('Captions enabled via menu');
          return;
        }
      }

      // 5. If still not visible, observe for controls to appear later (e.g. after waiting room)
      if (!this.areCaptionsVisible()) {
        console.log('Could not find captions toggle button immediately. Watching for controls to appear...');
        this.observeForLateCaptions();
      }
    } catch (err) {
      if (!RuntimeHelper.isContextInvalidated(err)) {
        console.error('enableCaptionsButton error:', err);
      }
    }
  }

  observeForLateCaptions() {
    if (this._lateCaptionsObserver || this.areCaptionsVisible()) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 30;
    let lastAttemptTime = 0;

    const cleanup = () => {
      if (this._lateCaptionsObserver) {
        try {
          this._lateCaptionsObserver.disconnect();
        } catch {}
        this._lateCaptionsObserver = null;
      }
      if (this._lateCaptionsInterval) {
        clearInterval(this._lateCaptionsInterval);
        this._lateCaptionsInterval = null;
      }
    };

    const tryEnable = async () => {
      if (this._isLateChecking) return;
      this._isLateChecking = true;

      try {
        if (this.areCaptionsVisible()) {
          cleanup();
          return;
        }

        const now = Date.now();
        if (now - lastAttemptTime < 2000) {
          return;
        }
        lastAttemptTime = now;

        const btn = this.findCaptionsButton();
        if (btn) {
          if (CaptionDom.isCaptionsButtonOn(btn)) {
            cleanup();
            return;
          }
          btn.click();
          const enabled = await CaptionDom.waitFor(
            () => this.areCaptionsVisible() || CaptionDom.isCaptionsButtonOn(btn),
            2000,
            200
          );
          if (enabled) {
            console.log('Captions enabled via late observer');
            cleanup();
            return;
          }
        } else if (CaptionDom.isInCall()) {
          CaptionDom.tryKeyboardShortcut();
          const enabled = await CaptionDom.waitFor(
            () => this.areCaptionsVisible() || (this.findCaptionsButton() && CaptionDom.isCaptionsButtonOn(this.findCaptionsButton())),
            1500,
            200
          );
          if (enabled) {
            console.log('Captions enabled via late shortcut');
            cleanup();
            return;
          }
        }

        attempts++;
        if (attempts >= maxAttempts) {
          cleanup();
        }
      } finally {
        this._isLateChecking = false;
      }
    };

    try {
      let lastCheck = 0;
      this._lateCaptionsObserver = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastCheck < 1000) return;
        lastCheck = now;
        if (this.findCaptionsButton() || CaptionDom.isInCall()) {
          if (!this._isLateChecking && now - lastAttemptTime >= 2000) {
            void tryEnable();
          }
        }
      });
      const target = document.body || document.documentElement;
      if (target) {
        this._lateCaptionsObserver.observe(target, {
          childList: true,
          subtree: true,
        });
      }
    } catch {}

    this._lateCaptionsInterval = setInterval(() => {
      if (this.findCaptionsButton() || CaptionDom.isInCall()) {
        void tryEnable();
      }
    }, 3000);
  }

  destroy() {
    if (this._lateCaptionsObserver) {
      try {
        this._lateCaptionsObserver.disconnect();
      } catch {}
      this._lateCaptionsObserver = null;
    }
    if (this._lateCaptionsInterval) {
      clearInterval(this._lateCaptionsInterval);
      this._lateCaptionsInterval = null;
    }
    try {
      this.titleObserver?.stop();
    } catch {}
    if (this.captionsObserver) {
      void this.captionsObserver.handleUnload?.();
    }
  }

  async init() {
    this.meeting = new Meeting(MeetingTitleExtractor.extractMeetingInfo());
    this.titleObserver = new MeetingTitleObserver(this.meeting);
    this.titleObserver.start();
    // this.participantsObserver = new ParticipantsOpserver(this.meeting);
    this.captionsObserver = new CaptionsObserver(this.meeting);

    const handleExit = () => {
      if (this._lateCaptionsObserver) {
        try {
          this._lateCaptionsObserver.disconnect();
        } catch {}
        this._lateCaptionsObserver = null;
      }
      if (this._lateCaptionsInterval) {
        clearInterval(this._lateCaptionsInterval);
        this._lateCaptionsInterval = null;
      }
      try {
        this.titleObserver?.stop();
      } catch {}
    };
    window.addEventListener('beforeunload', handleExit);
    window.addEventListener('pagehide', handleExit);
  }

  async run() {
    // Best-effort auto-toggle captions
    this.enableCaptionsButton().catch(err => {
      if (!RuntimeHelper.isContextInvalidated(err)) {
        console.error("enableCaptionsButton error:", err);
      }
    });
    await this.init();
    // await this.participantsObserver.run()
    await this.captionsObserver.run();
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__MIRZABENEVIS_TEST__) {
  (async function () {
    const meetAssistant = new MeetAssistant();
    await meetAssistant.run();
  })();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CaptionDom,
    CaptionsObserver,
    MeetAssistant,
    MeetingTitleExtractor,
    MeetingTitleObserver,
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.MirzaBenevis = {
    CaptionDom,
    CaptionsObserver,
    MeetAssistant,
    MeetingTitleExtractor,
    MeetingTitleObserver,
  };
}
