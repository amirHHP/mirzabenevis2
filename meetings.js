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
});