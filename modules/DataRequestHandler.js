export class DataRequestHandler {
    constructor(autoMeetingLogDB) {
        this.autoMeetingLogDB = autoMeetingLogDB;
    }

    async handleGetMeetings(sendResponse) {
        try {
            const meetings = await this.autoMeetingLogDB.getAllMeetings();
            sendResponse({ meetings: meetings });
        } catch (error) {
            console.error("Error getting meetings:", error);
            sendResponse({ meetings: [] });
        }
    }

    async handleSaveMeeting(request, sendResponse) {
        console.log("Starting to save meeting:", request.meetingInfo);
        try {
            await this.autoMeetingLogDB.saveMeeting(request.meetingInfo, request.messages);
            console.log("Meeting saved successfully.");
            
            // UI 업데이트 메시지 전송
            try {
                chrome.runtime.sendMessage({ type: "meetings.loadMeetingList" });
                console.log("UI update message sent");
            } catch (error) {
                console.log("UI update skipped:", error);
            }
            
            sendResponse({ success: true, message: "Meeting saved successfully." });
        } catch (error) {
            console.error("Error saving meeting:", error);
            sendResponse({ success: false, message: "Failed to save meeting: " + error.message });
        }
    }

    async handleSyncWithDrive(sendResponse) {
        try {
            const syncedCount = await this.autoMeetingLogDB.syncWithDrive();
            console.log(`Synced ${syncedCount} meetings from Drive`);
            sendResponse({ success: true, syncedCount });
            
            // UI 업데이트 메시지 전송
            try {
                chrome.runtime.sendMessage({ type: "meetings.loadMeetingList" });
                console.log("UI update message sent after sync");
            } catch (error) {
                console.log("UI update after sync skipped:", error);
            }
        } catch (error) {
            console.error("Error syncing with Drive:", error);
            sendResponse({ success: false, error: error.message });
        }
    }

    handleMessage(request, sender, sendResponse) {
        console.log("Received message:", request.type);
        
        if (request.type === "background.getMeetings") {
            this.handleGetMeetings(sendResponse);
            return true; // 비동기 응답을 위해 true 반환
        } else if (request.type === "background.saveMeeting") {
            this.handleSaveMeeting(request, sendResponse);
            return true; // 비동기 응답을 위해 true 반환
        } else if (request.type === "background.syncWithDrive") {
            this.handleSyncWithDrive(sendResponse);
            return true; // 비동기 응답을 위해 true 반환
        }
        return false;
    }
}