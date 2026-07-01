class Utils {
  static sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
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

  async saveMessages(messages) {
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
        });

        if (response && response.success) {
          console.log('Successfully saved:', messages);
          try {
            await RuntimeHelper.sendMessage({
              type: 'meetings.syncMeetingUI',
              meetingStartTime: this.meetingInfo.meetingStartTime,
              isCurrentMeeting: true,
            });
          } catch (syncError) {
            if (!RuntimeHelper.isContextInvalidated(syncError)) {
              console.warn('UI sync skipped:', syncError);
            }
          }
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
    return (
      document.querySelector('[role="region"][aria-label="Captions"]') ||
      document.querySelector('.vNKgIf.UDinHf') ||
      document.querySelector('.iOzk7')
    );
  }

  isCaptionBlock(element) {
    return Boolean(element?.matches?.('.nMcdL.bj4p3b') || element?.matches?.('.nMcdL'));
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
    return element.closest('.nMcdL.bj4p3b') || element.closest('.nMcdL');
  }

  getCaptionTextNode(blockNode) {
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

  resolveActorIndex(speakerNode) {
    const name =
      speakerNode.querySelector('.KcIKyf.jxFHg .NWpY1d')?.textContent.trim() ||
      speakerNode.querySelector('.KcIKyf.jxFHg')?.textContent.trim() ||
      speakerNode.querySelector('.NWpY1d')?.textContent.trim() ||
      'Unknown';
    const imageUrl = speakerNode.querySelector('img.Z6byG.r6DyN')?.src || '';

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
    const name =
      blockNode.querySelector('.KcIKyf.jxFHg .NWpY1d')?.textContent.trim() ||
      blockNode.querySelector('.KcIKyf.jxFHg')?.textContent.trim() ||
      blockNode.querySelector('.NWpY1d')?.textContent.trim() ||
      'Unknown';
    const imageUrl = blockNode.querySelector('img.Z6byG.r6DyN')?.src || '';
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

    if (this.savedMessageKeys.has(saveKey) || this.savesInFlight.has(saveKey)) {
      return false;
    }

    this.savesInFlight.add(saveKey);
    try {
      const success = await this.meeting.saveMessages([
        {
          actorIndex,
          text,
          timestamp: new Date().toISOString(),
          type: 'caption',
        },
      ]);

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
    await this.saveUtterance(utterance);
  }

  async processCaptionBlock(blockNode) {
    const captionNode = this.getCaptionTextNode(blockNode);
    if (!captionNode || captionNode.closest('.KcIKyf.jxFHg')) {
      return;
    }

    const text = this.getBlockText(blockNode);
    if (!text) {
      return;
    }

    if (!this.currentUtterance) {
      this.startUtterance(blockNode, text);
      return;
    }

    const sameBlock = this.currentUtterance.blockNode === blockNode;
    const speakerKey = this.getSpeakerKey(blockNode);
    const sameSpeaker = this.currentUtterance.speakerKey === speakerKey;

    if (!sameBlock || !sameSpeaker) {
      await this.closeCurrentUtterance();
      this.startUtterance(blockNode, text);
      return;
    }

    if (text.length > this.currentUtterance.peakText.length) {
      this.currentUtterance.peakText = text;
    }
  }

  collectNodesToProcess(mutation) {
    const nodes = new Set();
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => nodes.add(node));
      mutation.removedNodes.forEach((node) => nodes.add(node));
      if (mutation.target) {
        nodes.add(mutation.target);
      }
    } else if (mutation.type === 'characterData') {
      nodes.add(mutation.target);
    }
    return nodes;
  }

  handleMutations = (mutations) => {
    const blocksToProcess = new Set();

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.removedNodes.forEach((node) => {
          const block = this.findCaptionBlock(node);
          if (block && this.currentUtterance?.blockNode === block) {
            void this.closeCurrentUtterance();
          }
        });
      }

      this.collectNodesToProcess(mutation).forEach((node) => {
        const block = this.findCaptionBlock(node);
        if (block) {
          blocksToProcess.add(block);
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          node.querySelectorAll?.('.nMcdL.bj4p3b, .nMcdL').forEach((childBlock) => {
            blocksToProcess.add(childBlock);
          });
        }
      });
    });

    blocksToProcess.forEach((block) => {
      void this.processCaptionBlock(block);
    });
  };

  scanExistingCaptions() {
    const region = this.getCaptionsRegion();
    if (!region) {
      return;
    }

    const blocks = region.querySelectorAll('.nMcdL.bj4p3b, .nMcdL');
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
    const regionSelectors = [
      '[role="region"][aria-label="Captions"]',
      '.vNKgIf.UDinHf',
      '.iOzk7',
      '.ygicle.VbkSUe',
      '.ygicle[class*="VbkSU"]',
    ];
    const inCallSelectors = [
      'button[aria-label*="Leave call"]',
      'button[aria-label*="Leave meeting"]',
      'button[aria-label*="خروج"]',
      'button[jsname="r8qRAd"]',
    ];

    const maxWaitMs = 120000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
      for (const selector of regionSelectors) {
        const captionsContainer = document.querySelector(selector);
        if (captionsContainer) {
          console.log('Captions region detected:', selector);
          return captionsContainer;
        }
      }

      const inCall = inCallSelectors.some((selector) => document.querySelector(selector));
      if (inCall && Date.now() - startedAt > 5000) {
        console.log('Meeting detected. Waiting for captions while observing the page.');
        return document.body;
      }

      await Utils.sleep(300);
    }

    console.warn('Captions region not found in time. Observing the page anyway.');
    return document.body;
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

class MeetingExtractor {
  static extractMeetingInfo() {
    try {
      // 회의 제목 추출 시도
      let meetingTitle = document.title;
      if (meetingTitle.startsWith("Meet - ")) {
        meetingTitle = meetingTitle.replace("Meet - ", "");
      }

      // URL에서 회의 ID 추출
      const meetingURL = window.location.href;
      const meetingId = new URL(meetingURL).pathname.split("/")[1];
      const meetingStartTime = new Date().toISOString();
      const participants = [];

      console.log("Meeting Id:", meetingId);
      console.log("Meeting Title:", meetingTitle);
      console.log("Meeting Start Time:", meetingStartTime);

      return { meetingId, meetingTitle, meetingStartTime, participants };
    } catch (error) {
      console.error("Error extracting meeting info:", error);
      // 기본값 반환
      return {
        meetingId: window.location.pathname.split("/")[1],
        meetingTitle: "Untitled Meeting",
        meetingStartTime: new Date().toISOString(),
        participants: []
      };
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
  }

  findCaptionsButton() {
    const selectors = [
      'button[aria-label*="Turn on captions"]',
      'button[aria-label*="Turn off captions"]',
      'button[aria-label*="Captions"]',
      'button[aria-label*="captions"]',
      'button[aria-label*="Subtitles"]',
      'button[aria-label*="Closed captions"]',
      'button[aria-label*="زیرنویس"]',
      'button[aria-label*="عنوان"]',
      'button[data-tooltip*="caption"]',
      'button[data-tooltip*="Caption"]',
      'button[data-tooltip*="زیرنویس"]',
    ];

    for (const selector of selectors) {
      try {
        const button = document.querySelector(selector);
        if (button) {
          return button;
        }
      } catch {
        // Some selector patterns may be unsupported; continue.
      }
    }

    const labelPattern = /caption|subtitle|closed.?caption|زیرنویس|عنوان.?نویس/i;
    for (const button of document.querySelectorAll('button[aria-label]')) {
      const label = button.getAttribute('aria-label') || '';
      if (labelPattern.test(label)) {
        return button;
      }
    }

    for (const icon of document.querySelectorAll('button i.google-symbols, button .google-symbols')) {
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

  areCaptionsVisible() {
    return Boolean(
      document.querySelector('[role="region"][aria-label="Captions"] .ygicle') ||
      document.querySelector('.ygicle.VbkSUe') ||
      document.querySelector('.ygicle[class*="VbkSU"]')
    );
  }

  async enableCaptionsButton() {
    const maxAttempts = 30;
    let attempt = 0;

    while (attempt < maxAttempts) {
      const captionBtn = this.findCaptionsButton();

      if (captionBtn) {
        const ariaPressed = captionBtn.getAttribute('aria-pressed');
        const ariaLabel = captionBtn.getAttribute('aria-label') || '';
        const iconSymbol = captionBtn.querySelector('i.google-symbols, .google-symbols')?.textContent?.trim() || '';
        const isOn =
          ariaPressed === 'true' ||
          iconSymbol === 'closed_caption_off' ||
          /turn off/i.test(ariaLabel) ||
          /off captions/i.test(ariaLabel) ||
          /خاموش/.test(ariaLabel) ||
          /زیرنویس.*خاموش/.test(ariaLabel) ||
          /غیرفعال.*زیرنویس/.test(ariaLabel);

        if (!isOn) {
          captionBtn.click();
          console.log('Captions enabled');
        }
        return;
      }

      if (this.areCaptionsVisible()) {
        console.log('Captions already visible');
        return;
      }

      attempt += 1;
      await Utils.sleep(500);
    }

    if (!this.areCaptionsVisible()) {
      console.warn('Could not find captions toggle button. Turn captions on manually in Google Meet.');
    }
  }

  async init() {
    this.meeting = new Meeting(MeetingExtractor.extractMeetingInfo());
    // this.participantsObserver = new ParticipantsOpserver(this.meeting);
    this.captionsObserver = new CaptionsObserver(this.meeting);
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
