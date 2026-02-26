import { InstanceManager } from './InstanceManager.js';
import { MeetingMigration } from './MeetingMigration.js';
import { AutoMeetingLogData } from './AutoMeetingLogData.js';

export class SyncInitializer {
    constructor() {
        this.instanceManager = new InstanceManager();
        this.autoMeetingLogDB = new AutoMeetingLogData();
        this.migration = new MeetingMigration(this.instanceManager, this.autoMeetingLogDB);
    }

    async initialize() {
        // 1. instanceId 존재 여부 확인
        const hasInstanceId = await this.instanceManager.hasInstanceId();
        
        if (!hasInstanceId) {
            // 2. instanceId가 없으면 생성
            await this.instanceManager.createInstanceId();
            
            // 3. 기존 회의 데이터 마이그레이션
            await this.migration.migrateAllMeetings();
        }
    }
} 