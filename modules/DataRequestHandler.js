import { CloudSyncManager } from './CloudSyncManager.js';
import { LicenseManager } from './LicenseManager.js';
import { BackupManager } from './BackupManager.js';

export class DataRequestHandler {
    constructor(
        autoMeetingLogDB,
        cloudSync = new CloudSyncManager(),
        licenseManager = new LicenseManager(),
        backupManager = new BackupManager(autoMeetingLogDB, licenseManager)
    ) {
        this.autoMeetingLogDB = autoMeetingLogDB;
        this.cloudSync = cloudSync;
        this.licenseManager = licenseManager;
        this.backupManager = backupManager;
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
            await this.autoMeetingLogDB.saveMeeting(request.meetingInfo, request.messages, {
                replacePrefix: Boolean(request.replacePrefix),
            });
            console.log("Meeting saved successfully.");
            
            // UI 업데이트 메시지 전송
            try {
                chrome.runtime.sendMessage({ type: "meetings.loadMeetingList" });
                chrome.runtime.sendMessage({
                    type: "meetings.syncMeetingUI",
                    meetingStartTime: request.meetingInfo.meetingStartTime,
                    isCurrentMeeting: true,
                });
                console.log("UI update message sent");
            } catch (error) {
                console.log("UI update skipped:", error);
            }
            
            sendResponse({ success: true, message: "Meeting saved successfully." });

            // Push to cloud in the background (fire-and-forget)
            this.cloudSync
                .syncMeeting(this.autoMeetingLogDB, request.meetingInfo.meetingStartTime)
                .catch((error) => console.warn("Cloud sync skipped:", error.message));
        } catch (error) {
            console.error("Error saving meeting:", error);
            sendResponse({ success: false, message: "Failed to save meeting: " + error.message });
        }
    }

    async handleCloudLogin(request, sendResponse) {
        try {
            const email = await this.cloudSync.login(request.email, request.password);
            sendResponse({ success: true, email });
        } catch (error) {
            sendResponse({ success: false, message: error.message });
        }
    }

    async handleCloudSignup(request, sendResponse) {
        try {
            const result = await this.cloudSync.signup(request.email, request.password);
            sendResponse({
                success: true,
                needsEmailConfirmation: !result.access_token,
                email: result.user?.email || request.email,
            });
        } catch (error) {
            sendResponse({ success: false, message: error.message });
        }
    }

    async handleCloudLogout(sendResponse) {
        try {
            await this.cloudSync.logout();
            sendResponse({ success: true });
        } catch (error) {
            sendResponse({ success: false, message: error.message });
        }
    }

    async handleCloudStatus(sendResponse) {
        try {
            sendResponse(await this.cloudSync.getStatus());
        } catch (error) {
            sendResponse({ configured: false, loggedIn: false, message: error.message });
        }
    }

    async handleCloudSyncAll(sendResponse) {
        try {
            const syncedCount = await this.cloudSync.syncAll(this.autoMeetingLogDB);
            console.log(`Cloud sync completed for ${syncedCount} meetings`);
            sendResponse({ success: true, syncedCount });
        } catch (error) {
            console.error("Cloud sync failed:", error);
            sendResponse({ success: false, message: error.message });
        }
    }

    async handleDeleteMeeting(request, sendResponse) {
        try {
            await this.autoMeetingLogDB.deleteMeeting(request.meetingStartTime);
            // Best-effort remote delete so the web app stays consistent
            await this.cloudSync.deleteMeetingRemote(request.meetingStartTime);

            try {
                chrome.runtime.sendMessage({ type: "meetings.loadMeetingList" });
            } catch (error) {
                console.log("UI update skipped:", error);
            }
            sendResponse({ success: true });
        } catch (error) {
            console.error("Error deleting meeting:", error);
            sendResponse({ success: false, message: "Failed to delete meeting: " + error.message });
        }
    }

    async handleCloudDeleteRemote(request, sendResponse) {
        const deleted = await this.cloudSync.deleteMeetingRemote(request.meetingStartTime);
        sendResponse({ success: deleted });
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

    async handleUpdateMeetingTitle(request, sendResponse) {
        try {
            const { meetingStartTime, meetingTitle } = request;
            if (!meetingStartTime || !meetingTitle) {
                sendResponse?.({ success: false, message: "Missing parameters" });
                return;
            }
            await this.autoMeetingLogDB.updateMeetingTitle(meetingStartTime, meetingTitle);
            try {
                chrome.runtime.sendMessage({ type: "meetings.loadMeetingList" });
                chrome.runtime.sendMessage({
                    type: "meetings.syncMeetingUI",
                    meetingStartTime,
                    isCurrentMeeting: true,
                });
            } catch (_) {}

            this.cloudSync
                .syncMeeting(this.autoMeetingLogDB, meetingStartTime)
                .catch(() => {});

            sendResponse?.({ success: true });
        } catch (error) {
            console.error("Error updating meeting title:", error);
            sendResponse?.({ success: false, message: error.message });
        }
    }

    async handleLicenseGetStatus(sendResponse) {
        try {
            const info = await this.licenseManager.getLicenseInfo();
            sendResponse({ success: true, ...info });
        } catch (error) {
            sendResponse({ success: false, message: error.message });
        }
    }

    async handleLicenseActivate(request, sendResponse) {
        try {
            const result = await this.licenseManager.activate(request.key);
            sendResponse(result);
        } catch (error) {
            sendResponse({ success: false, message: error.message });
        }
    }

    async handleLicenseDeactivate(sendResponse) {
        try {
            const result = await this.licenseManager.deactivate();
            sendResponse(result);
        } catch (error) {
            sendResponse({ success: false, message: error.message });
        }
    }

    async handleBackupCreate(sendResponse) {
        try {
            const result = await this.backupManager.createBackup();
            sendResponse({ success: true, ...result });
        } catch (error) {
            sendResponse({ success: false, message: error.message, code: error.code });
        }
    }

    async handleBackupRestore(request, sendResponse) {
        try {
            const result = await this.backupManager.restoreBackup(request.backupContent);
            try {
                chrome.runtime.sendMessage({ type: "meetings.loadMeetingList" });
            } catch (_) {}
            sendResponse({ success: true, ...result });
        } catch (error) {
            sendResponse({ success: false, message: error.message, code: error.code });
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
        } else if (request.type === "background.updateMeetingTitle") {
            this.handleUpdateMeetingTitle(request, sendResponse);
            return true;
        } else if (request.type === "background.syncWithDrive") {
            this.handleSyncWithDrive(sendResponse);
            return true; // 비동기 응답을 위해 true 반환
        } else if (request.type === "background.deleteMeeting") {
            this.handleDeleteMeeting(request, sendResponse);
            return true;
        } else if (request.type === "cloud.deleteMeeting") {
            this.handleCloudDeleteRemote(request, sendResponse);
            return true;
        } else if (request.type === "cloud.login") {
            this.handleCloudLogin(request, sendResponse);
            return true;
        } else if (request.type === "cloud.signup") {
            this.handleCloudSignup(request, sendResponse);
            return true;
        } else if (request.type === "cloud.logout") {
            this.handleCloudLogout(sendResponse);
            return true;
        } else if (request.type === "cloud.getStatus") {
            this.handleCloudStatus(sendResponse);
            return true;
        } else if (request.type === "cloud.syncAll") {
            this.handleCloudSyncAll(sendResponse);
            return true;
        } else if (request.type === "license.getStatus") {
            this.handleLicenseGetStatus(sendResponse);
            return true;
        } else if (request.type === "license.activate") {
            this.handleLicenseActivate(request, sendResponse);
            return true;
        } else if (request.type === "license.deactivate") {
            this.handleLicenseDeactivate(sendResponse);
            return true;
        } else if (request.type === "backup.create") {
            this.handleBackupCreate(sendResponse);
            return true;
        } else if (request.type === "backup.restore") {
            this.handleBackupRestore(request, sendResponse);
            return true;
        }
        return false;
    }
}