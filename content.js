class Utils {
  static sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
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
    try {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        console.error("Chrome runtime not available");
        return;
      }

      // background script가 응답할 때까지 최대 3번 시도
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: "background.saveMeeting",
              meetingInfo: this.meetingInfo,
              messages: messages,
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            });
          });

          if (response && response.success) {
            console.log("Successfully saved:", messages);
            return;
          } else {
            console.error("Error occurred while saving the meeting:", response);
          }
        } catch (error) {
          console.error(`Attempt ${retryCount + 1} failed:`, error);
          retryCount++;
          if (retryCount < maxRetries) {
            await Utils.sleep(1000); // 1초 대기 후 재시도
          }
        }
      }
      
      console.error("Failed to save messages after", maxRetries, "attempts");
    } catch (error) {
      console.error("Failed to save messages:", error);
    }
  }
}

class CaptionsObserver {
  constructor(meeting) {
    this.meeting = meeting;
    this.observer = new MutationObserver(this.handleMutations);
    this.nodeInfoMap = new WeakMap();
    this.lastSpeakerNode = null;
    this.isBackgroundActive = false;
    this.isSaving = false;
  }

  handleMutations = (mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        if (mutation.addedNodes.length > 0) {
          this.handleAddedNodes(mutation.addedNodes);
        }
      }
    });
  }

  handleAddedNodes(nodes) {
    nodes.forEach(node => {
      if (node.nodeName && node.nodeName === "#text") {
        const messageNode = node.parentElement;

        if (!this.nodeInfoMap.has(messageNode)) {
          const speakerNode = messageNode.closest(".nMcdL.bj4p3b");

          if (speakerNode) {
            const name = speakerNode.querySelector(".KcIKyf.jxFHg")?.textContent.trim();
            const imageUrl = speakerNode.querySelector("img.Z6byG.r6DyN")?.src;

            let actorIndex = this.meeting.meetingInfo.participants.findIndex(p => p.imageUrl === imageUrl);
            if (actorIndex === -1) {
              this.meeting.meetingInfo.participants.push({ name, imageUrl });
              actorIndex = this.meeting.meetingInfo.participants.length - 1;
            }

            // 새로운 메시지가 들어오면 기존 메시지들 저장
            const existingNodeInfos = Array.from(this.meeting.messageNodeInfos.values())
              .filter(info => {
                // 화자 이름 노드인지 확인
                const isNameNode = info.node.closest(".KcIKyf.jxFHg") !== null;
                // 화자 이름만 있는 노드는 제외
                return !isNameNode && info.node.textContent.trim() !== "";
              });

            if (existingNodeInfos.length > 0) {
              this.saveMessageInfos(existingNodeInfos);
              // 저장 후 기존 노드들의 정보를 맵에서 제거
              existingNodeInfos.forEach(info => {
                this.meeting.removeMessageNodeInfo(info.node);
                this.nodeInfoMap.delete(info.node);
              });
            }

            // 현재 화자 노드 저장 (화자 이름 노드는 저장하지 않음)
            if (!messageNode.closest(".KcIKyf.jxFHg")) {
              this.lastSpeakerNode = speakerNode;
              this.nodeInfoMap.set(messageNode, actorIndex);
              this.meeting.addMessageNodeInfo(messageNode, actorIndex, "caption");
            }
          }
        }
      }
    });
  }

  async saveMessageInfos(nodeInfos) {
    if (!nodeInfos || nodeInfos.length === 0) {
      console.log("No messages to save");
      return;
    }

    const messages = nodeInfos.map((info) => ({
      actorIndex: info.actorIndex,
      text: info.node.textContent.trim(),
      timestamp: info.timestamp,
      type: info.type,
    }));

    try {
      if (!this.isBackgroundActive) {
        console.log("Waiting for background script to activate...");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      await this.meeting.saveMessages(messages);
      console.log("Messages saved successfully");
    } catch (error) {
      console.error("Failed to save messages:", error);
    }
  }

  async waitForCaptions() {
    let captionsContainer;
    while (!captionsContainer) {
      captionsContainer = document.querySelector(".iOzk7");
      await Utils.sleep(300);
    }
    return captionsContainer;
  }

  async run() {
    const captionsContainer = await this.waitForCaptions();
    this.observer.observe(captionsContainer, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
    this.addListeners();
  }

  addListeners() {
    window.addEventListener("beforeunload", this.handleUnload);
    window.addEventListener("unload", this.handleUnload);
    
    // Google Meet 세션 종료 감지
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

  handleUnload = (event) => {
    console.log("Saving messages...");
    
    // 남은 모든 메시지 저장 - 동기적으로 처리
    const remainingNodeInfos = Array.from(this.meeting.messageNodeInfos.values());
    if (remainingNodeInfos.length > 0) {
      console.log(`Saving ${remainingNodeInfos.length} remaining messages...`);
      
      // 동기적으로 메시지 변환
      const messages = remainingNodeInfos.map((info) => ({
        actorIndex: info.actorIndex,
        text: info.node.textContent.trim(),
        timestamp: info.timestamp,
        type: info.type,
      }));
      
      // 동기적으로 저장 요청
      try {
        // 저장 요청 전에 로그 출력
        console.log("Sending save request for messages:", messages.length);
        
        chrome.runtime.sendMessage({
          type: "background.saveMeeting",
          meetingInfo: this.meeting.meetingInfo,
          messages: messages,
        }, (response) => {
          if (response && response.success) {
            console.log("All remaining messages saved successfully");
          } else {
            console.error("Error saving remaining messages:", response);
            this.cleanup();
          }
        });
        
        // 저장 요청 후 로그 출력
        console.log("Save request sent");
      } catch (error) {
        console.error("Error sending save request:", error);
        this.cleanup();
      }
    } else {
      console.log("No remaining messages to save");
      this.cleanup();
    }
  }

  cleanup() {
    // 이벤트 리스너 제거
    window.removeEventListener("beforeunload", this.handleUnload);
    window.removeEventListener("unload", this.handleUnload);

    // Observer 종료
    this.observer.disconnect();
  }
}

class MeetingExtractor {
  static extractMeetingInfo() {
    const meetingTitleElement = document.querySelector("div[data-meeting-title]");
    let meetingTitle = meetingTitleElement
      ? meetingTitleElement.getAttribute("data-meeting-title").trim()
      : document.title;

    if (meetingTitle.startsWith("Meet - ")) {
      meetingTitle = meetingTitle.replace("Meet - ", "");
    }

    const meetingURL = window.location.href;
    const meetingId = new URL(meetingURL).pathname.split("/")[1];
    const meetingStartTime = new Date().toISOString();
    const participants = [];

    console.log("Meeting Id:", meetingId);
    console.log("Meeting Title:", meetingTitle);
    console.log("Meeting Start Time:", meetingStartTime);

    return { meetingId, meetingTitle, meetingStartTime, participants };
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

  async enableCaptionsButton() {
    const captionBtn = document.querySelector('button[jsname="r8qRAd"]');
    if (!captionBtn) {
      await Utils.sleep(1000);
      return this.enableCaptionsButton();
    }

    const isCaptionsOn = captionBtn.getAttribute("aria-label") === "자막 끄기";
    if (!isCaptionsOn) {
      captionBtn.click();
      console.log("Captions enabled");
    }
  }

  async init() {
    this.meeting = new Meeting(MeetingExtractor.extractMeetingInfo());
    // this.participantsObserver = new ParticipantsOpserver(this.meeting);
    this.captionsObserver = new CaptionsObserver(this.meeting);
  }

  async run() {
    await this.enableCaptionsButton();
    await this.init();
    // await this.participantsObserver.run()
    await this.captionsObserver.run();
  }
}

(async function () {
  const meetAssistant = new MeetAssistant();
  await meetAssistant.run();
})();
