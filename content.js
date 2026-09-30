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
    const results = [];
    this.walkElements(root, (element) => {
      try {
        element.querySelectorAll(selector).forEach((match) => results.push(match));
      } catch {
        // Ignore unsupported selectors.
      }
    });
    return results;
  }

  static query(root, selector) {
    return this.queryAll(root, selector)[0] || null;
  }
}

class CaptionDom {
  static REGION_LABEL_PATTERN = /caption|subtitle|closed.?caption|زیرنویس|عنوان.?نویس|字幕|sous-titre|untertitel|leyenda/i;
  static BUTTON_LABEL_PATTERN = /caption|subtitle|closed.?caption|زیرنویس|عنوان.?نویس|字幕/i;
  static CAPTIONS_ON_PATTERN = /turn off|hide caption|disable caption|disable subtitle|خاموش|غیرفعال|بستن.*زیرنویس|关闭字幕/i;
  static CAPTIONS_OFF_PATTERN = /turn on|show caption|enable caption|enable subtitle|فعال.?سازی|روشن|نمایش.*زیرنویس|باز کردن.*زیرنویس|开启字幕/i;

  static getCaptionsRegion() {
    for (const element of DomHelper.queryAll(document, '[role="region"][aria-label]')) {
      const label = element.getAttribute('aria-label') || '';
      if (this.REGION_LABEL_PATTERN.test(label)) {
        return element;
      }
    }

    const captionEl = DomHelper.query(document, '.ygicle.VbkSUe, .ygicle[class*="VbkSU"], .nMcdL .ygicle');
    if (captionEl) {
      return (
        captionEl.closest('[role="region"]') ||
        captionEl.closest('.vNKgIf.UDinHf, .iOzk7, .a4cQT') ||
        captionEl.parentElement
      );
    }

    return document.querySelector('.vNKgIf.UDinHf') || document.querySelector('.iOzk7') || null;
  }

  static hasVisibleCaptionText() {
    return Boolean(
      DomHelper.query(document, '[role="region"][aria-label] .ygicle') ||
      DomHelper.query(document, '.ygicle.VbkSUe') ||
      DomHelper.query(document, '.ygicle[class*="VbkSU"]') ||
      DomHelper.query(document, '.nMcdL .ygicle')
    );
  }

  static findCaptionsButton() {
    const selectors = [
      'button[jsname="r6bRZb"]',
      'button[aria-label*="Turn on captions"]',
      'button[aria-label*="Turn off captions"]',
      'button[aria-label*="Captions"]',
      'button[aria-label*="captions"]',
      'button[aria-label*="Subtitles"]',
      'button[aria-label*="Closed captions"]',
      'button[aria-label*="زیرنویس"]',
      'button[aria-label*="عنوان"]',
      'button[aria-label*="字幕"]',
      'button[data-tooltip*="caption"]',
      'button[data-tooltip*="Caption"]',
      'button[data-tooltip*="زیرنویس"]',
    ];

    for (const selector of selectors) {
      const button = DomHelper.query(document, selector);
      if (button) {
        return button;
      }
    }

    for (const button of DomHelper.queryAll(document, 'button[aria-label], button[data-tooltip]')) {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-tooltip') || ''}`;
      if (this.BUTTON_LABEL_PATTERN.test(label)) {
        return button;
      }
    }

    for (const icon of DomHelper.queryAll(document, 'button i.google-symbols, button .google-symbols')) {
      const symbol = icon.textContent?.trim();
      if (symbol === 'closed_caption' || symbol === 'subtitles' || symbol === 'closed_caption_off') {
        const button = icon.closest('button');
        if (button) {
          return button;
        }
      }
    }

    return null;
  }

  static isCaptionsButtonOn(button) {
    const ariaPressed = button.getAttribute('aria-pressed');
    const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-tooltip') || ''}`;
    const iconSymbol = button.querySelector('i.google-symbols, .google-symbols')?.textContent?.trim() || '';

    if (ariaPressed === 'true') {
      return true;
    }
    if (ariaPressed === 'false') {
      return false;
    }
    if (iconSymbol === 'closed_caption_off') {
      return true;
    }
    if (iconSymbol === 'closed_caption' || iconSymbol === 'subtitles') {
      return false;
    }
    if (this.CAPTIONS_ON_PATTERN.test(label)) {
      return true;
    }
    if (this.CAPTIONS_OFF_PATTERN.test(label)) {
      return false;
    }

    return this.hasVisibleCaptionText();
  }

  static isInCall() {
    const inCallSelectors = [
      'button[jsname="r8qRAd"]',
      'button[aria-label*="Leave call"]',
      'button[aria-label*="Leave meeting"]',
      'button[aria-label*="End call"]',
      'button[aria-label*="خروج"]',
      'button[aria-label*="ترک"]',
      'button[aria-label*="پایان"]',
    ];
    return inCallSelectors.some((selector) => Boolean(DomHelper.query(document, selector)));
  }

  static tryKeyboardShortcut() {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const init = { key: 'c', code: 'KeyC', bubbles: true, cancelable: true };
    const targets = [document.activeElement, document.body].filter(Boolean);

    targets.forEach((target) => {
      if (isMac) {
        target.dispatchEvent(new KeyboardEvent('keydown', { ...init, metaKey: true, shiftKey: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { ...init, metaKey: true, shiftKey: true }));
      } else {
        target.dispatchEvent(new KeyboardEvent('keydown', { ...init }));
        target.dispatchEvent(new KeyboardEvent('keyup', { ...init }));
      }
    });
  }

  static async tryOpenCaptionsFromMenu() {
    const moreButton =
      DomHelper.query(document, 'button[jsname="NakZHc"]') ||
      DomHelper.query(document, 'button[aria-label*="More options"]') ||
      DomHelper.query(document, 'button[aria-label*="گزینه"]') ||
      DomHelper.query(document, 'button[aria-label*="بیشتر"]');

    if (!moreButton) {
      return false;
    }

    moreButton.click();
    await Utils.sleep(400);

    const menuItems = DomHelper.queryAll(document, '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]');
    for (const item of menuItems) {
      const label = `${item.textContent || ''} ${item.getAttribute('aria-label') || ''}`;
      if (this.BUTTON_LABEL_PATTERN.test(label)) {
        item.click();
        return true;
      }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    return false;
  }

  static waitFor(predicate, timeoutMs = 120000, intervalMs = 300) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let settled = false;
      let observer;

      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        observer?.disconnect();
        resolve(value);
      };

      const check = () => {
        if (predicate()) {
          finish(true);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          finish(false);
        }
      };

      observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      check();
      const intervalId = setInterval(() => {
        check();
        if (settled) {
          clearInterval(intervalId);
        }
      }, intervalMs);
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
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(response);
        });
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
          console.log('Successfully saved:', messages);
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
    this.savedMessageKeys = new Set();
    this.savesInFlight = new Set();
    this.currentUtterance = null;
    this.liveBlock = null;
    this.isBackgroundActive = false;
    this.isSaving = false;
  }

  getCaptionsRegion() {
    return CaptionDom.getCaptionsRegion();
  }

  isCaptionInRegion(element) {
    const region = this.getCaptionsRegion();
    if (!region) {
      return CaptionDom.hasVisibleCaptionText();
    }
    return region.contains(element);
  }

  isCaptionBlock(element) {
    if (element?.matches?.('.nMcdL.bj4p3b') || element?.matches?.('.nMcdL')) {
      return true;
    }
    return this.isCaptionTextElement(element) && this.isCaptionInRegion(element);
  }

  findCaptionBlock(node) {
    let element = node;
    if (element?.nodeType === Node.TEXT_NODE) {
      element = element.parentElement;
    }
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    if (this.isCaptionBlock(element)) {
      return element;
    }

    const block =
      element.closest('.nMcdL.bj4p3b') ||
      element.closest('.nMcdL') ||
      element.closest('.ygicle.VbkSUe, .ygicle[class*="VbkSU"], .ygicle');

    if (block && (block.matches('.nMcdL') || this.isCaptionInRegion(block))) {
      return block;
    }

    return null;
  }

  getCaptionTextNode(blockNode) {
    if (blockNode?.matches?.('.ygicle')) {
      return blockNode;
    }
    return blockNode.querySelector('.ygicle.VbkSUe, .ygicle[class*="VbkSU"], .ygicle');
  }

  isCaptionTextElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    return (
      element.matches('.ygicle.VbkSUe') ||
      element.matches('.ygicle[class*="VbkSU"]') ||
      (element.matches('.ygicle') && !!element.closest('.nMcdL.bj4p3b, .nMcdL'))
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
      blockNode.closest('.nMcdL.bj4p3b') ||
      blockNode.closest('.nMcdL') ||
      blockNode.closest('.NmXUuc') ||
      blockNode.closest('.a4cQT') ||
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

  getBlockText(blockNode) {
    const captionNode = this.getCaptionTextNode(blockNode);
    return this.normalizeText(captionNode?.textContent || '');
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
    return `${actorIndex}::${text}`;
  }

  wasAlreadySaved(actorIndex, text) {
    return this.savedMessageKeys.has(this.makeSaveKey(actorIndex, text));
  }

  markAsSaved(actorIndex, text) {
    this.savedMessageKeys.add(this.makeSaveKey(actorIndex, text));
  }

  clearSupersededKeys(actorIndex, text) {
    const prefix = `${actorIndex}::`;
    for (const key of [...this.savedMessageKeys]) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const savedText = key.slice(prefix.length);
      if (text.startsWith(savedText) && savedText !== text) {
        this.savedMessageKeys.delete(key);
      }
    }
  }

  shouldSkipSave(utterance, text) {
    return !text || this.wasAlreadySaved(utterance.actorIndex, text);
  }

  startUtterance(blockNode, text) {
    this.currentUtterance = {
      blockNode,
      actorIndex: this.resolveActorIndex(blockNode),
      speakerKey: this.getSpeakerKey(blockNode),
      peakText: text,
    };
    this.liveBlock = blockNode;
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
        console.log('Saved caption:', text);
        return true;
      }
    } finally {
      this.savesInFlight.delete(saveKey);
    }

    return false;
  }

  async closeCurrentUtterance() {
    if (!this.currentUtterance) {
      return;
    }

    const utterance = this.currentUtterance;
    this.currentUtterance = null;

    const text = this.normalizeText(utterance.peakText);
    if (this.shouldSkipSave(utterance, text)) {
      return;
    }

    await this.saveUtterance(utterance);
  }

  updateUtterancePeak(blockNode, text) {
    if (!this.currentUtterance) {
      return;
    }

    const normalizedText = this.normalizeText(text);
    const previousPeak = this.normalizeText(this.currentUtterance.peakText);
    if (normalizedText.length >= previousPeak.length) {
      this.currentUtterance.peakText = normalizedText;
    }
    this.currentUtterance.blockNode = blockNode;
    this.liveBlock = blockNode;
  }

  async processCaptionBlock(blockNode) {
    const captionNode = this.getCaptionTextNode(blockNode);
    if (!captionNode || captionNode.matches('.NWpY1d')) {
      return;
    }

    const text = this.getBlockText(blockNode);
    if (!text) {
      return;
    }

    const speakerKey = this.getSpeakerKey(blockNode);

    if (!this.currentUtterance) {
      this.startUtterance(blockNode, text);
      return;
    }

    if (this.currentUtterance.speakerKey !== speakerKey) {
      await this.closeCurrentUtterance();
      this.startUtterance(blockNode, text);
      return;
    }

    this.updateUtterancePeak(blockNode, text);
  }

  handleMutations = (mutations) => {
    const blocksToProcess = new Set();

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          const block = this.findCaptionBlock(node);
          if (block) {
            blocksToProcess.add(block);
          }
        });
      }

      const block = this.findCaptionBlock(mutation.target);
      if (block) {
        blocksToProcess.add(block);
      }
    });

    blocksToProcess.forEach((block) => {
      void this.processCaptionBlock(block);
    });
  };

  scanExistingCaptions() {
    const region = this.getCaptionsRegion();
    const selector = '.nMcdL.bj4p3b, .nMcdL, .ygicle.VbkSUe, .ygicle[class*="VbkSU"], .ygicle';
    const scope = region || document;
    const rawBlocks = [...scope.querySelectorAll(selector)];
    const blocks = rawBlocks.filter((element) => {
      if (!element.matches('.ygicle')) {
        return true;
      }
      return !rawBlocks.some((other) => other !== element && other.contains(element));
    });

    if (blocks.length === 0) {
      return;
    }

    const lastBlock = blocks[blocks.length - 1];
    const text = this.getBlockText(lastBlock);
    if (text) {
      this.startUtterance(lastBlock, text);
    }
  }

  async flushPendingSaves() {
    await this.closeCurrentUtterance();
  }

  async waitForCaptions() {
    const inCall = await CaptionDom.waitFor(() => CaptionDom.isInCall() || CaptionDom.getCaptionsRegion(), 120000);
    if (!inCall) {
      console.warn('Captions region not found in time. Observing the page anyway.');
    } else if (CaptionDom.getCaptionsRegion()) {
      console.log('Captions region detected');
    } else {
      console.log('Meeting detected. Waiting for captions while observing the page.');
    }
    return CaptionDom.getCaptionsRegion() || document.body;
  }

  async run() {
    await this.waitForCaptions();
    this.scanExistingCaptions();
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });
    console.log('Captions observer started');
    this.addListeners();
  }

  addListeners() {
    window.addEventListener('beforeunload', this.handleUnload);
    window.addEventListener('unload', this.handleUnload);
    window.addEventListener('pagehide', this.handleUnload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.currentUtterance) {
        const block = this.currentUtterance.blockNode;
        const text = this.getBlockText(block);
        if (text.length > this.currentUtterance.peakText.length) {
          this.currentUtterance.peakText = text;
        }
      }
    });
    this.observeLeaveButton();

    // background script의 활성화 메시지 수신
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "background.activated") {
        console.log("Background script activated");
        this.isBackgroundActive = true;
        sendResponse({ success: true });
      }
    });
  }

  observeLeaveButton() {
    // 이벤트 핸들러를 한 번만 생성
    const handleLeaveClick = () => {
      console.log("Leave button clicked, saving messages...");
      // 이벤트 리스너를 한 번만 실행하도록 함
      if (!this.isSaving) {
        this.isSaving = true;
        this.handleUnload();
      }
    };

    // 통화 종료 버튼 감시
    const leaveButtonObserver = new MutationObserver((mutations) => {
      // 여러 종류의 통화 종료 버튼 선택자
      const leaveButtonSelectors = [
        'button[jsname="r8qRAd"]', // 기본 통화 종료 버튼
        'button[jsname="Hx74L"]',  // 모바일 통화 종료 버튼
        'button[jsname="Qx7uuf"]', // 다른 종류의 통화 종료 버튼
        'button[aria-label*="Leave"]', // aria-label에 "Leave"가 포함된 버튼
        'button[aria-label*="나가기"]'  // aria-label에 "나가기"가 포함된 버튼
      ];
      
      // 모든 선택자에 대해 버튼 확인
      leaveButtonSelectors.forEach(selector => {
        const leaveButton = document.querySelector(selector);
        if (leaveButton && !leaveButton.hasAttribute('data-leave-handler')) {
          leaveButton.setAttribute('data-leave-handler', 'true');
          leaveButton.addEventListener('click', handleLeaveClick);
        }
      });
    });

    // 페이지 전체를 감시하여 통화 종료 버튼이 나타날 때마다 이벤트 리스너 추가
    leaveButtonObserver.observe(document.body, { childList: true, subtree: true });
    
    // 초기 통화 종료 버튼 확인
    const leaveButtonSelectors = [
      'button[jsname="r8qRAd"]',
      'button[jsname="Hx74L"]',
      'button[jsname="Qx7uuf"]',
      'button[aria-label*="Leave"]',
      'button[aria-label*="나가기"]'
    ];
    
    leaveButtonSelectors.forEach(selector => {
      const initialLeaveButton = document.querySelector(selector);
      if (initialLeaveButton && !initialLeaveButton.hasAttribute('data-leave-handler')) {
        initialLeaveButton.setAttribute('data-leave-handler', 'true');
        initialLeaveButton.addEventListener('click', handleLeaveClick);
      }
    });
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
        console.error('Error saving captions on unload:', error);
      }
    }

    this.cleanup();
  }

  cleanup() {
    window.removeEventListener('beforeunload', this.handleUnload);
    window.removeEventListener('unload', this.handleUnload);
    window.removeEventListener('pagehide', this.handleUnload);
    this.observer.disconnect();
  }
}

class MeetingTitleExtractor {
  static cleanTitle(rawTitle, meetingId = '') {
    if (!rawTitle || typeof rawTitle !== 'string') {
      return '';
    }
    let title = rawTitle.trim();
    if (!title) return '';

    // Remove notification counter prefix like (1) or (2)
    title = title.replace(/^\(\d+\)\s*/, '').trim();

    // Remove prefixes: "Meet - ", "Meet – " (\u2013), "Meet — " (\u2014), "Meet: ", "Google Meet - ", etc.
    title = title.replace(/^(?:Google\s+)?Meet\s*[-–—:|]\s*/i, '').trim();

    // Remove suffixes: " - Google Meet", " – Google Meet", " - Meet", " – Meet", etc.
    title = title.replace(/\s*[-–—:|]\s*(?:Google\s+)?Meet$/i, '').trim();

    // If title is just "Meet" or "Google Meet"
    if (/^(?:Google\s+)?Meet$/i.test(title)) {
      return '';
    }

    // If title is "Untitled Meeting" or empty
    if (/^Untitled(?:\s+Meeting)?$/i.test(title)) {
      return '';
    }

    return title;
  }

  static getTitleFromDom(meetingId = '') {
    // 1. Check data-meeting-title attribute or data-call-title
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

    // 2. Google Meet meeting details / header selectors
    const selectors = [
      'div[jsname="r4nke"]',
      '.u6vdEc',
      'div[jscontroller="prU8yb"] .u6vdEc',
      'div[jscontroller="prU8yb"]',
      'div.roS0pe',
      'div.YVO4Fc',
      'div.J37v0b',
      '[data-unresolved-meeting-id]',
      '[aria-label*="Meeting details"]',
      '[aria-label*="اطلاعات جلسه"]',
      '[aria-label*="جزئیات جلسه"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent?.trim();
        const cleaned = this.cleanTitle(text, meetingId);
        if (cleaned && cleaned !== meetingId) {
          return cleaned;
        }
      }
    }

    // 3. Document title
    const docTitleCleaned = this.cleanTitle(document.title, meetingId);
    if (docTitleCleaned) {
      return docTitleCleaned;
    }

    return '';
  }

  static extractMeetingInfo() {
    try {
      const meetingURL = window.location.href;
      const meetingId = new URL(meetingURL).pathname.split('/')[1] || '';
      const meetingStartTime = new Date().toISOString();
      const participants = [];

      let meetingTitle = this.getTitleFromDom(meetingId);
      if (!meetingTitle) {
        meetingTitle = meetingId || 'Untitled Meeting';
      }

      console.log('Meeting Id:', meetingId);
      console.log('Meeting Title:', meetingTitle);
      console.log('Meeting Start Time:', meetingStartTime);

      return { meetingId, meetingTitle, meetingStartTime, participants };
    } catch (error) {
      console.error('Error extracting meeting info:', error);
      const meetingId = window.location.pathname.split('/')[1] || '';
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
      if (this.hasFoundCalendarTitle || count > 60) {
        clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.checkAndUpdate(), 30000);
      }
    }, 2500);
  }

  checkAndUpdate() {
    const meetingId = this.meeting.meetingInfo.meetingId;
    const currentTitle = this.meeting.meetingInfo.meetingTitle;
    const detected = MeetingTitleExtractor.getTitleFromDom(meetingId);

    if (!detected) return;

    const isGeneric = (t) => !t || t === 'Meet' || t === 'Google Meet' || t === 'Untitled Meeting';
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
    if (this.observer) this.observer.disconnect();
    if (this.headObserver) this.headObserver.disconnect();
    if (this.pollInterval) clearInterval(this.pollInterval);
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
    window.addEventListener("unload", this.handleUnload);
  }

  handleUnload = () => {
    // 이렇게 하면 이벤트 리스너가 제거됩니다.
    window.removeEventListener("beforeunload", this.handleUnload);
    window.removeEventListener("unload", this.handleUnload);

    // Observer를 종료하고 자원을 해제합니다.
    this.observer.disconnect();
  }
}

class MeetAssistant {
  constructor() {
    this.captionsObserver = null;
    this.participantsObserver = null;
    this.titleObserver = null;
  }

  areCaptionsVisible() {
    return CaptionDom.hasVisibleCaptionText();
  }

  findCaptionsButton() {
    return CaptionDom.findCaptionsButton();
  }

  async enableCaptionsButton() {
    if (this.areCaptionsVisible()) {
      console.log('Captions already visible');
      return;
    }

    const joined = await CaptionDom.waitFor(() => CaptionDom.isInCall(), 90000);
    if (!joined) {
      console.warn('Meeting UI not ready yet. Captions will be enabled when controls appear.');
    }

    await CaptionDom.waitFor(
      () => this.findCaptionsButton() || this.areCaptionsVisible(),
      120000
    );

    if (this.areCaptionsVisible()) {
      console.log('Captions already visible');
      return;
    }

    const captionBtn = this.findCaptionsButton();
    if (captionBtn && !CaptionDom.isCaptionsButtonOn(captionBtn)) {
      captionBtn.click();
      await Utils.sleep(800);
      if (this.areCaptionsVisible() || CaptionDom.isCaptionsButtonOn(captionBtn)) {
        console.log('Captions enabled');
        return;
      }
    }

    CaptionDom.tryKeyboardShortcut();
    await Utils.sleep(800);
    if (this.areCaptionsVisible()) {
      console.log('Captions enabled via keyboard shortcut');
      return;
    }

    await CaptionDom.tryOpenCaptionsFromMenu();
    await Utils.sleep(800);
    if (this.areCaptionsVisible()) {
      console.log('Captions enabled via menu');
      return;
    }

    if (!this.areCaptionsVisible()) {
      console.warn('Could not find captions toggle button. Turn captions on manually in Google Meet.');
    }
  }

  async init() {
    this.meeting = new Meeting(MeetingTitleExtractor.extractMeetingInfo());
    this.titleObserver = new MeetingTitleObserver(this.meeting);
    this.titleObserver.start();
    // this.participantsObserver = new ParticipantsOpserver(this.meeting);
    this.captionsObserver = new CaptionsObserver(this.meeting);

    window.addEventListener('beforeunload', () => {
      this.titleObserver?.stop();
    });
  }

  async run() {
    // 자막 버튼 자동 토글은 베스트 에포트로 비동기 수행
    this.enableCaptionsButton().catch(err => console.error("enableCaptionsButton error:", err));
    await this.init();
    // await this.participantsObserver.run()
    await this.captionsObserver.run();
  }
}

(async function () {
  const meetAssistant = new MeetAssistant();
  await meetAssistant.run();
})();
