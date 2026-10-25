import { isLobbyOrGenericTitle } from './AutoMeetingLogData.js';

export class MeetingMigration {
    constructor(instanceManager, autoMeetingLogDB) {
        this.instanceManager = instanceManager;
        this.db = autoMeetingLogDB;
    }

    // 기존 회의 데이터에 instanceId 추가 및 로비/기본 제목 정리
    async migrateMeetings(meetings) {
        const instanceId = await this.instanceManager.getInstanceId();
        
        return meetings.map(meeting => {
            const isGeneric = isLobbyOrGenericTitle(meeting.meetingTitle, meeting.meetingId);
            return {
                ...meeting,
                meetingTitle: isGeneric ? (meeting.aiTitle || meeting.generatedTitle || meeting.meetingId || 'Untitled Meeting') : meeting.meetingTitle,
                instanceId: meeting.instanceId || instanceId,
                migratedAt: new Date().toISOString()
            };
        });
    }

    // IndexedDB의 모든 회의 데이터 마이그레이션
    async migrateAllMeetings() {
        const meetings = await this.db.getAllMeetings();
        const migratedMeetings = await this.migrateMeetings(meetings);
        await this.db.mergeMeetings(migratedMeetings);
    }
} 