export class AutoMeetingLogData {
    async open() {
        return new Promise((resolve, reject) => {
            const request = self.indexedDB.open('AutoMeetingLogDB', 1);

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
                    lastUpdated: new Date().toISOString()
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
                    lastUpdated: new Date().toISOString()
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
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readonly');
            const objectStore = transaction.objectStore('meetings');
            const request = objectStore.getAll();

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async deleteMeeting(meetingStartTime) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const deleteRequest = objectStore.delete(meetingStartTime);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = (event) => reject(event.target.error);
        });
    }

    async updateMeetingTitle(meetingStartTime, newTitle) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['meetings'], 'readwrite');
            const objectStore = transaction.objectStore('meetings');
            const getRequest = objectStore.get(meetingStartTime);
            getRequest.onsuccess = (event) => {
                const meeting = event.target.result;
                if (meeting) {
                    meeting.meetingTitle = newTitle;
                    const putRequest = objectStore.put(meeting);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = (event) => reject(event.target.error);
                } else {
                    reject(new Error('Meeting not found'));
                }
            };
            getRequest.onerror = (event) => reject(event.target.error);
        });
    }
}