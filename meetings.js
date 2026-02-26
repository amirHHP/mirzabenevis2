import { AutoMeetingLogData as AutoMeetingLogData } from './modules/AutoMeetingLogData.js';
import { MeetingUI } from './modules/MeetingUI.js';

const autoMeetingLogDB = new AutoMeetingLogData()
const meetingUI = new MeetingUI(autoMeetingLogDB);

document.addEventListener("DOMContentLoaded", () => {
    meetingUI.loadMeetingList();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "meetings.loadMeetingList") {
        meetingUI.loadMeetingList();
    }
    if (request.type === "meetings.syncMeetingUI") {
        // 현재 선택된 미팅의 startTime을 저장
        const currentSelectedStartTime = meetingUI.selectedMeetingStartTime;
        
        // 미팅 목록을 새로 불러오되, 선택된 미팅을 유지
        autoMeetingLogDB.getAllMeetings().then(meetings => {
            // 미팅 목록 UI 업데이트
            meetingUI.updateMeetingList(meetings);
            
            // 저장된 미팅이 현재 선택된 미팅이면 내용도 갱신
            if (currentSelectedStartTime === request.meetingStartTime) {
                const savedMeeting = meetings.find(m => m.meetingStartTime === currentSelectedStartTime);
                if (savedMeeting) {
                    meetingUI.showMessages(savedMeeting);
                }
            }
        });
    }
});