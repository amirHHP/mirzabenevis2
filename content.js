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
            // UI 동기화 요청 (현재 미팅 정보 포함)
            chrome.runtime.sendMessage({
              type: "meetings.syncMeetingUI",
              meetingStartTime: this.meetingInfo.meetingStartTime,
              isCurrentMeeting: true
            });
            return true;
          } else {
            console.error("Save response was not successful. Raw response:", response);
            throw new Error("Save response was not successful");
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
      return false;
    } catch (error) {
      console.error("Failed to save messages:", error);
      return false;
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
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        this.handleAddedNodes(mutation.addedNodes);
      } else if (mutation.type === "characterData") {
        // 텍스트 노드 내용이 변경될 때도 처리
        this.handleAddedNodes([mutation.target]);
      }
    });
  }

  handleAddedNodes(nodes) {
    nodes.forEach(node => {
      let messageNode = null;

      // 텍스트 노드인 경우: 부모를 기준으로 캡션 컨테이너 찾기
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (!parent) return;
        // Google Meet 자막 컨테이너 (예: `class="ygicle VbkSUe"`) 대응
        messageNode = parent.closest('.ygicle[class*="VbkSU"]') || parent.closest(".ygicle") || parent;
      }
      // 요소 노드가 추가된 경우: 내부에서 캡션 컨테이너(`.ygicle.VbkSU`) 찾기
      else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = /** @type {HTMLElement} */ (node);
        messageNode =
          element.matches('.ygicle[class*="VbkSU"]') || element.matches(".ygicle")
            ? element
            : element.querySelector('.ygicle[class*="VbkSU"]') || element.querySelector(".ygicle");
      }

      if (!messageNode) return;

      if (!this.nodeInfoMap.has(messageNode)) {
        console.log("Detected potential caption node:", messageNode.textContent?.trim());
        const speakerNode = messageNode.closest(".nMcdL.bj4p3b");

        if (speakerNode) {
          const name = speakerNode.querySelector(".KcIKyf.jxFHg")?.textContent.trim();
          const imageUrl = speakerNode.querySelector("img.Z6byG.r6DyN")?.src;

          let actorIndex = this.meeting.meetingInfo.participants.findIndex(p => p.imageUrl === imageUrl);
          if (actorIndex === -1) {
            this.meeting.meetingInfo.participants.push({ name, imageUrl });
            actorIndex = this.meeting.meetingInfo.participants.length - 1;
          }

          // 현재 화자 노드 저장 (화자 이름 노드는 저장하지 않음)
          if (!messageNode.closest(".KcIKyf.jxFHg")) {
            // 화자가 변경되었는지 확인
            const isNewSpeaker = this.lastSpeakerNode !== speakerNode;
            
            if (isNewSpeaker) {
              // 이전 화자의 메시지들 저장
              const existingNodeInfos = Array.from(this.meeting.messageNodeInfos.values())
                .filter(info => {
                  const isNameNode = info.node.closest(".KcIKyf.jxFHg") !== null;
                  return !isNameNode && info.node.textContent.trim() !== "";
                });

              if (existingNodeInfos.length > 0) {
                this.saveMessageInfos(existingNodeInfos).catch(error => {
                  console.error("Failed to save messages:", error);
                });
                // 노드 정보는 저장 시도 후 바로 삭제
                existingNodeInfos.forEach(info => {
                  this.meeting.removeMessageNodeInfo(info.node);
                  this.nodeInfoMap.delete(info.node);
                });
              }
            }

            // 현재 메시지 노드 정보 저장
            this.lastSpeakerNode = speakerNode;
            this.nodeInfoMap.set(messageNode, actorIndex);
            this.meeting.addMessageNodeInfo(messageNode, actorIndex, "caption");
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
      const success = await this.meeting.saveMessages(messages);
      if (success) {
        console.log("Messages saved successfully");
        // 저장 성공 후에 노드 정보 삭제
        nodeInfos.forEach(info => {
          this.meeting.removeMessageNodeInfo(info.node);
          this.nodeInfoMap.delete(info.node);
        });
      } else {
        throw new Error("Failed to save messages");
      }
    } catch (error) {
      console.error("Failed to save messages:", error);
      throw error; // 에러를 상위로 전파
    }
  }

  async waitForCaptions() {
    let captionsContainer;
    while (!captionsContainer) {
      // 자막 컨테이너 또는 자막 텍스트 노드가 나타날 때까지 대기
      captionsContainer = document.querySelector(".iOzk7") || document.querySelector('.ygicle[class*="VbkSU"]') || document.querySelector(".ygicle");
      await Utils.sleep(300);
    }
    console.log("Captions container detected");
    return captionsContainer;
  }

  async run() {
    await this.waitForCaptions();
    // 페이지 전체를 감시하여 어떤 위치에서든 자막이 생성되면 감지
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });
    console.log("Captions observer started");
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

  handleUnload = async (event) => {
    console.log("Saving messages...");
    
    // 남은 모든 메시지 저장
    const remainingNodeInfos = Array.from(this.meeting.messageNodeInfos.values());
    if (remainingNodeInfos.length > 0) {
      console.log(`Saving ${remainingNodeInfos.length} remaining messages...`);
      
      const messages = remainingNodeInfos.map((info) => ({
        actorIndex: info.actorIndex,
        text: info.node.textContent.trim(),
        timestamp: info.timestamp,
        type: info.type,
      }));
      
      try {
        // 저장 요청
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: "background.saveMeeting",
            meetingInfo: this.meeting.meetingInfo,
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
          console.log("All remaining messages saved successfully");
        } else {
          throw new Error("Failed to save remaining messages");
        }
      } catch (error) {
        console.error("Error saving messages:", error);
      }
    } else {
      console.log("No remaining messages to save");
    }
    
    this.cleanup();
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

  async enableCaptionsButton() {
    // 새 UI에서도 최대한 자막 버튼을 찾아보되,
    // 찾지 못하더라도 전체 흐름이 멈추지 않도록 베스트 에포트만 수행
    const maxAttempts = 10;
    let attempt = 0;

    const captionButtonSelectors = [
      'button[aria-label*="Captions"]',
      'button[aria-label*="Subtitles"]',
      'button[aria-label*="Closed captions"]',
      'button[jsname="r8qRAd"]'
    ];

    while (attempt < maxAttempts) {
      let captionBtn = null;
      for (const selector of captionButtonSelectors) {
        captionBtn = document.querySelector(selector);
        if (captionBtn) break;
      }

      if (captionBtn) {
        // 이미 켜져 있으면 그대로 두고, 꺼져 있으면 클릭
        const ariaPressed = captionBtn.getAttribute("aria-pressed");
        const ariaLabel = captionBtn.getAttribute("aria-label") || "";
        const isOn =
          ariaPressed === "true" ||
          /turn (off|off captions)/i.test(ariaLabel) ||
          /자막 끄기/.test(ariaLabel);

        if (!isOn) {
          captionBtn.click();
          console.log("Captions enabled (best-effort)");
        }
        return;
      }

      attempt++;
      await Utils.sleep(500);
    }

    console.warn("Could not find captions toggle button; continuing without auto-enabling.");
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
