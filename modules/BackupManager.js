// ============================================================
// BackupManager — Handles Full Backup and Restore of Meetings
// ============================================================

export class BackupManager {
    constructor(autoMeetingLogDB, licenseManager) {
        this.autoMeetingLogDB = autoMeetingLogDB;
        this.licenseManager = licenseManager;
    }

    /**
     * Creates a full backup payload of all meetings
     * Requires an active Pro account
     */
    async createBackup() {
        const isPro = await this.licenseManager.isPro();
        if (!isPro) {
            const error = new Error('PRO_REQUIRED');
            error.code = 'PRO_REQUIRED';
            throw error;
        }

        const meetings = await this.autoMeetingLogDB.getAllMeetings();
        if (!meetings || meetings.length === 0) {
            return {
                empty: true,
                count: 0,
                filename: null,
                jsonString: null,
                backupData: null
            };
        }

        const backupData = {
            appName: 'MirzaBenevis',
            version: '2.0.0',
            exportedAt: new Date().toISOString(),
            totalMeetings: meetings.length,
            meetings: meetings
        };

        const jsonString = JSON.stringify(backupData, null, 2);

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const filename = `mirzabenevis-backup-${yyyy}-${mm}-${dd}_${hh}-${min}.json`;

        return {
            empty: false,
            count: meetings.length,
            filename: filename,
            jsonString: jsonString,
            backupData: backupData
        };
    }

    /**
     * Initiates browser download of a backup file
     */
    downloadBackupFile(filename, jsonString) {
        if (!filename || !jsonString) return;

        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Restores meetings from a backup JSON string or object
     * Requires an active Pro account
     */
    async restoreBackup(jsonContent) {
        const isPro = await this.licenseManager.isPro();
        if (!isPro) {
            const error = new Error('PRO_REQUIRED');
            error.code = 'PRO_REQUIRED';
            throw error;
        }

        let parsed;
        if (typeof jsonContent === 'string') {
            try {
                parsed = JSON.parse(jsonContent);
            } catch (e) {
                const error = new Error('INVALID_JSON');
                error.code = 'INVALID_JSON';
                throw error;
            }
        } else if (typeof jsonContent === 'object' && jsonContent !== null) {
            parsed = jsonContent;
        } else {
            const error = new Error('INVALID_INPUT');
            error.code = 'INVALID_INPUT';
            throw error;
        }

        let meetings = [];
        if (Array.isArray(parsed)) {
            meetings = parsed;
        } else if (parsed && Array.isArray(parsed.meetings)) {
            meetings = parsed.meetings;
        } else {
            const error = new Error('INVALID_BACKUP_FORMAT');
            error.code = 'INVALID_BACKUP_FORMAT';
            throw error;
        }

        if (meetings.length === 0) {
            const error = new Error('NO_MEETINGS_IN_BACKUP');
            error.code = 'NO_MEETINGS_IN_BACKUP';
            throw error;
        }

        // Validate items have meetingStartTime
        const validMeetings = meetings.filter(m => m && typeof m === 'object' && m.meetingStartTime);
        if (validMeetings.length === 0) {
            const error = new Error('NO_VALID_MEETINGS');
            error.code = 'NO_VALID_MEETINGS';
            throw error;
        }

        // Ensure instanceId exists
        let instanceId = null;
        if (this.autoMeetingLogDB.instanceManager) {
            try {
                instanceId = await this.autoMeetingLogDB.instanceManager.getInstanceId();
                if (!instanceId) {
                    instanceId = await this.autoMeetingLogDB.instanceManager.createInstanceId();
                }
            } catch (_) {}
        }

        const normalizedMeetings = validMeetings.map(m => ({
            ...m,
            instanceId: m.instanceId || instanceId || 'restored-instance',
            lastUpdated: m.lastUpdated || new Date().toISOString()
        }));

        await this.autoMeetingLogDB.mergeMeetings(normalizedMeetings);

        return {
            success: true,
            restoredCount: normalizedMeetings.length
        };
    }
}
