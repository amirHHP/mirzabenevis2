export class MeetingMigration {
    constructor(instanceManager, autoMeetingLogDB) {
        this.instanceManager = instanceManager;
        this.db = autoMeetingLogDB;
    }

    // 기존 회의 데이터에 instanceId 추가 및 'Meet' 기본 제목 정리
    async migrateMeetings(meetings) {
        const instanceId = await this.instanceManager.getInstanceId();
        
        return meetings.map(meeting => {
            const isGeneric = meeting.meetingTitle === 'Meet' || meeting.meetingTitle === 'Google Meet';
            return {
                ...meeting,
                meetingTitle: isGeneric ? (meeting.meetingId || '') : meeting.meetingTitle,
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