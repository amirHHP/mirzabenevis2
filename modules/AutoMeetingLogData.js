import { InstanceManager } from './InstanceManager.js';

export class AutoMeetingLogData {
    constructor() {
        this.dbName = 'AutoMeetingLogDB';
        this.dbVersion = 1;
        this.instanceManager = new InstanceManager();
    }

    async open() {
        return new Promise((resolve, reject) => {
            // 버전 번호를 명시하지 않으면 이미 존재하는 DB의 현재 버전을 사용하고,
            // 없으면 자동으로 생성되면서 onupgradeneeded 가 한 번만 호출됩니다.
            // 이렇게 하면 "requested version (1) is less than the existing version (2)" 오류를 피할 수 있습니다.
            const request = self.indexedDB.open('AutoMeetingLogDB');

            request.onupgradeneeded = function (event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('meetings')) {
                    const objectStore = db.createObjectStore('meetings', { keyPath: 'meetingStartTime' });
                    console.log("Store created:", objectStore);
                }
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async saveMeeting(meetingInfo, messages) {
        const db = await this.open();
        
        // instanceId 가져오기 (없으면 생성)
        let instanceId = await this.instanceManager.getInstanceId();
        if (!instanceId) {
            instanceId = await this.instanceManager.createInstanceId();
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');

            transaction.oncomplete = () => {
                console.log('Transaction completed');
                resolve();
            };

            transaction.onerror = (event) => {
                console.error('Transaction error:', event.target.error);
                reject(event.target.error);
            };

            const getRequest = objectStore.get(meetingInfo.meetingStartTime);

            getRequest.onsuccess = (event) => {
                const storedData = event.target.result;
                const filteredMessages = messages.filter(message => message.text && message.text.trim() !== '');
                const updatedMessages = storedData
                    ? [...storedData.messages, ...filteredMessages]
                    : filteredMessages;

                const putRequest = objectStore.put({ 
                    ...meetingInfo, 
                    messages: updatedMessages,
                    lastUpdated: new Date().toISOString(),
                    instanceId: instanceId  // 모든 새 데이터에 instanceId 추가
                });

                putRequest.onerror = (event) => {
                    console.error('Save Fail:', event.target.error);
                    reject(event.target.error);
                };

                putRequest.onsuccess = () => {
                    console.log('Save Success');
                };
            };

            getRequest.onerror = () => {
                const filteredMessages = messages.filter(message => message.text && message.text.trim() !== '');
                const putRequest = objectStore.put({ 
                    ...meetingInfo, 
                    messages: filteredMessages,
                    lastUpdated: new Date().toISOString(),
                    instanceId: instanceId  // 모든 새 데이터에 instanceId 추가
                });

                putRequest.onerror = (event) => {
                    console.error('Save Fail:', event.target.error);
                    reject(event.target.error);
                };

                putRequest.onsuccess = () => {
                    console.log('Save Success');
                };
            };
        });
    }

    async getAllMeetings() {
        const db = await this.open();
        return new Promise(async (resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.getAll();

            request.onsuccess = async (event) => {
                let meetings = event.target.result;
                
                // instanceId가 없는 회의 데이터 확인 및 자동 수정
                const meetingsNeedingInstanceId = meetings.filter(meeting => !meeting.instanceId);
                
                if (meetingsNeedingInstanceId.length > 0) {
                    console.log(`Found ${meetingsNeedingInstanceId.length} meetings without instanceId, fixing...`);
                    
                    // instanceId 가져오기 (없으면 생성)
                    let instanceId = await this.instanceManager.getInstanceId();
                    if (!instanceId) {
                        instanceId = await this.instanceManager.createInstanceId();
                    }
                    
                    // instanceId가 없는 회의들에 instanceId 추가
                    const updateTransaction = db.transaction(['meetings'], 'readwrite');
                    const updateObjectStore = updateTransaction.objectStore('meetings');
                    
                    for (const meeting of meetingsNeedingInstanceId) {
                        const updatedMeeting = {
                            ...meeting,
                            instanceId: instanceId,
                            migratedAt: new Date().toISOString()
                        };
                        updateObjectStore.put(updatedMeeting);
                        
                        // 메모리상의 데이터도 업데이트
                        const index = meetings.findIndex(m => m.meetingStartTime === meeting.meetingStartTime);
                        if (index !== -1) {
                            meetings[index] = updatedMeeting;
                        }
                    }
                    
                    updateTransaction.oncomplete = () => {
                        console.log(`Successfully added instanceId to ${meetingsNeedingInstanceId.length} meetings`);
                        resolve(meetings);
                    };
                    
                    updateTransaction.onerror = (event) => {
                        console.error('Error updating meetings with instanceId:', event.target.error);
                        resolve(meetings); // 업데이트 실패해도 기존 데이터는 반환
                    };
                } else {
                    resolve(meetings);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getMeeting(meetingStartTime) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readonly');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.get(meetingStartTime);

            request.onsuccess = (event) => {
                resolve(event.target.result || null);
            };

            request.onerror = (event) => {
                console.error('Error getting meeting:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async deleteMeeting(meetingStartTime) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');

            transaction.oncomplete = () => {
                console.log('Delete transaction completed');
                resolve();
            };

            transaction.onerror = (event) => {
                console.error('Delete transaction error:', event.target.error);
                reject(event.target.error);
            };

            const request = objectStore.delete(meetingStartTime);

            request.onsuccess = () => {
                console.log('Meeting deleted successfully');
            };

            request.onerror = (event) => {
                console.error('Delete request error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async updateMeetingTitle(meetingStartTime, newTitle) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.get(meetingStartTime);

            request.onsuccess = (event) => {
                const meeting = event.target.result;
                if (!meeting) {
                    resolve(false);
                    return;
                }

                const updatedMeeting = {
                    ...meeting,
                    meetingTitle: newTitle,
                    lastUpdated: new Date().toISOString()
                };

                const updateRequest = objectStore.put(updatedMeeting);

                updateRequest.onsuccess = () => {
                    resolve(true);
                };

                updateRequest.onerror = (updateEvent) => {
                    console.error('Error updating meeting title:', updateEvent.target.error);
                    reject(updateEvent.target.error);
                };
            };

            request.onerror = (event) => {
                console.error('Error loading meeting for title update:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async updateMeetingSummary(meetingStartTime, summaryText, language) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.get(meetingStartTime);

            request.onsuccess = (event) => {
                const meeting = event.target.result;
                if (!meeting) {
                    resolve(false);
                    return;
                }

                const updatedMeeting = {
                    ...meeting,
                    summaryText,
                    summaryLanguage: language || 'en',
                    summaryUpdatedAt: new Date().toISOString()
                };

                const updateRequest = objectStore.put(updatedMeeting);

                updateRequest.onsuccess = () => {
                    resolve(true);
                };

                updateRequest.onerror = (updateEvent) => {
                    console.error('Error updating meeting summary:', updateEvent.target.error);
                    reject(updateEvent.target.error);
                };
            };

            request.onerror = (event) => {
                console.error('Error loading meeting for summary update:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async updateMeetingNotes(meetingStartTime, notesText) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.get(meetingStartTime);

            request.onsuccess = (event) => {
                const meeting = event.target.result;
                if (!meeting) {
                    resolve(false);
                    return;
                }

                const updatedMeeting = {
                    ...meeting,
                    notesText: notesText || '',
                    notesUpdatedAt: new Date().toISOString()
                };

                const updateRequest = objectStore.put(updatedMeeting);

                updateRequest.onsuccess = () => {
                    resolve(true);
                };

                updateRequest.onerror = (updateEvent) => {
                    console.error('Error updating meeting notes:', updateEvent.target.error);
                    reject(updateEvent.target.error);
                };
            };

            request.onerror = (event) => {
                console.error('Error loading meeting for notes update:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async mergeMeetings(meetings) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
            for (const meeting of meetings) {
                objectStore.put(meeting);
            }
        });
    }
}