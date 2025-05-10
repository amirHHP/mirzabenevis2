import { AutoMeetingLogData as AutoMeetingLogData } from './modules/AutoMeetingLogData.js';
import { DataRequestHandler } from './modules/DataRequestHandler.js';

console.log("Background script initialized");

const autoMeetingLogDB = new AutoMeetingLogData();
const requestHandler = new DataRequestHandler(autoMeetingLogDB);

// Google Meet 페이지가 열릴 때 background script를 활성화
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('https://meet.google.com/')) {
    console.log("Google Meet page loaded, activating background script");
    // background script가 활성화되었음을 content script에 알림
    chrome.tabs.sendMessage(tabId, { type: "background.activated" }).catch(() => {
      // content script가 아직 로드되지 않았을 수 있음
      console.log("Content script not ready yet");
    });
  }
});

// 탭이 닫힐 때 저장 요청이 처리되었는지 확인
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`Tab ${tabId} closed, ensuring all save requests are processed`);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request.type);
  
  // 저장 요청인 경우 즉시 처리
  if (request.type === "background.saveMeeting") {
    console.log("Processing save request for meeting:", request.meetingInfo.meetingId);
    
    // 저장 요청 처리
    const result = requestHandler.handleMessage(request, sender, sendResponse);
    console.log("Save request result:", result);
    
    // 응답이 비동기인 경우에도 응답을 보장
    if (result === true) {
      return true; // 비동기 응답을 위해 true 반환
    }
    
    return result;
  }
  
  // 다른 메시지 처리
  const result = requestHandler.handleMessage(request, sender, sendResponse);
  console.log("Message handling result:", result);
  return result;
});