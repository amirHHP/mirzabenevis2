import { AutoMeetingLogData as AutoMeetingLogData } from './modules/AutoMeetingLogData.js';
import { DataRequestHandler } from './modules/DataRequestHandler.js';
import { SyncInitializer } from './modules/SyncInitializer.js';
import { CloudSyncManager, PENDING_RETRY_ALARM } from './modules/CloudSyncManager.js';
import { LicenseManager } from './modules/LicenseManager.js';
import { BackupManager } from './modules/BackupManager.js';

console.log("Background script initialized");

const autoMeetingLogDB = new AutoMeetingLogData();
const cloudSync = new CloudSyncManager();
const licenseManager = new LicenseManager();
const backupManager = new BackupManager(autoMeetingLogDB, licenseManager);
const requestHandler = new DataRequestHandler(autoMeetingLogDB, cloudSync, licenseManager, backupManager);

function retryCloudPending() {
  cloudSync.retryPending(autoMeetingLogDB).catch((error) => {
    console.warn('Pending cloud sync retry failed:', error?.message || error);
  });
}

retryCloudPending();

chrome.runtime.onStartup.addListener(() => {
  retryCloudPending();
});

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PENDING_RETRY_ALARM) {
      retryCloudPending();
    }
  });
}

// Google Meet 페이지가 열릴 때 background script를 활성화
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('https://meet.google.com/')) {
    console.log("Google Meet page loaded, activating background script");
    // background script가 활성화되었음을 content script에 알림
    try {
      const res = chrome.tabs.sendMessage(tabId, { type: "background.activated" }, () => {
        if (chrome.runtime?.lastError) {
          // content script not ready yet
          console.log("Content script not ready yet");
        }
      });
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch (_) {}
  }
});

// 탭이 닫힐 때 저장 요청이 처리되었는지 확인
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`Tab ${tabId} closed, ensuring all save requests are processed`);
});

// 확장 프로그램 설치/업데이트 시 초기화
chrome.runtime.onInstalled.addListener(async () => {
    const initializer = new SyncInitializer();
    await initializer.initialize();
});

// 메시지 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Ignore internal UI broadcast messages in background script
    if (request.type === "meetings.loadMeetingList" || request.type === "meetings.syncMeetingUI") {
      return false;
    }

    console.log("Background received message:", request.type);
    const result = requestHandler.handleMessage(request, sender, sendResponse);
    return result === true;
});