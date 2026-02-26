export class MeetingUI {
    constructor(autoMeetingLogDB) {
        this.autoMeetingLogDB = autoMeetingLogDB;
        this.selectedMeetingStartTime = null;
        this.deleteModal = null;
        this.initializeDeleteModal();
        this.initializeToolbarButtons();
    }

    initializeDeleteModal() {
        const modal = document.getElementById('deleteModal');
        const confirmButton = document.getElementById('confirmDelete');
        
        // Bootstrap 5 Modal 인스턴스 생성
        this.deleteModal = new bootstrap.Modal(modal, {
            keyboard: true,
            backdrop: 'static',  // 배경 클릭으로 닫히지 않도록 설정
            focus: true          // 모달이 열릴 때 포커스 관리 활성화
        });
        
        if (confirmButton) {
            confirmButton.addEventListener('click', async () => {
                if (this.selectedMeetingStartTime) {
                    try {
                        await this.autoMeetingLogDB.deleteMeeting(this.selectedMeetingStartTime);
                        
                        // 삭제된 항목 찾기
                        const deletedItem = document.querySelector(`[data-starttime="${this.selectedMeetingStartTime}"]`);
                        if (deletedItem) {
                            // 삭제 애니메이션 적용
                            deletedItem.style.transition = 'all 0.2s ease-out';
                            deletedItem.style.height = '0';
                            deletedItem.style.opacity = '0';
                            deletedItem.style.marginTop = '0';
                            deletedItem.style.marginBottom = '0';
                            
                            // 애니메이션 완료 후 항목 제거
                            setTimeout(() => {
                                const parentContainer = deletedItem.closest('.meetings-container');
                                if (parentContainer) {
                                    deletedItem.remove();
                                    
                                    // 그룹 내 남은 항목 수 확인
                                    const remainingItems = parentContainer.querySelectorAll('.list-group-item').length;
                                    const groupHeader = parentContainer.previousElementSibling;
                                    
                                    if (remainingItems === 0 && groupHeader) {
                                        // 그룹 내 항목이 없으면 그룹도 제거
                                        const group = groupHeader.parentElement;
                                        if (group) {
                                            group.style.transition = 'all 0.2s ease-out';
                                            group.style.height = '0';
                                            group.style.opacity = '0';
                                            group.style.marginTop = '0';
                                            setTimeout(() => group.remove(), 200);
                                        }
                                    } else if (groupHeader) {
                                        // 그룹 헤더의 카운트 업데이트
                                        const countElement = groupHeader.querySelector('.count');
                                        if (countElement) {
                                            countElement.textContent = `(${remainingItems})`;
                                        }
                                    }
                                }
                            }, 200);
                            
                            // UI 상태 초기화
                            const captionsElement = document.getElementById('captions');
                            if (captionsElement) {
                                captionsElement.innerHTML = '';
                                captionsElement.hidden = true;
                            }
                            this.selectedMeetingStartTime = null;
                        }
                        
                        this.deleteModal.hide();
                    } catch (error) {
                        console.error('Failed to delete meeting:', error);
                        alert('Failed to delete meeting');
                    }
                }
            });
        }

        // 모달 이벤트 리스너 추가
        if (modal) {
            // 모달이 표시되기 전
            modal.addEventListener('show.bs.modal', () => {
                // aria-hidden 속성 제거 (접근성 문제 해결)
                modal.removeAttribute('aria-hidden');
            });

            // 모달이 완전히 표시된 후
            modal.addEventListener('shown.bs.modal', () => {
                // 첫 번째 버튼에 포커스 설정 (Cancel 버튼)
                const cancelButton = modal.querySelector('.btn-link');
                if (cancelButton) {
                    cancelButton.focus();
                }
            });

            // 모달이 숨겨지기 시작할 때
            modal.addEventListener('hide.bs.modal', () => {
                // aria-hidden 속성 복원
                modal.setAttribute('aria-hidden', 'true');
            });

            // 모달이 완전히 닫힌 후 처리
            modal.addEventListener('hidden.bs.modal', () => {
                this.selectedMeetingStartTime = null;
                const titleElement = document.getElementById('deleteMeetingTitle');
                const timeElement = document.getElementById('deleteMeetingTime');
                if (titleElement) titleElement.textContent = '';
                if (timeElement) timeElement.textContent = '';
            });
        }
    }

    // 미팅 시간을 포맷하는 함수
    formatMeetingTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    convertToKST(time, option = {}) {
        return new Date(time).toLocaleString(undefined, { timeZone: "Asia/Seoul", ...option });
    }

    convert(input) {
        let output;

        if (!input.captions) {
            output = input;
        } else {
            output = {
                meetingId: input.meetingId,
                meetingTitle: input.meetingTitle,
                meetingStartTime: input.meetingStartTime,
                participants: [],
                messages: [],
            };

            // Extract participants and messages from captions
            input.captions.forEach((caption) => {
                // Check if participant already exists in participants array
                let participantIndex = output.participants.findIndex((p) => p.name === caption.speaker.name);

                // If participant doesn't exist, add them to the array
                if (participantIndex === -1) {
                    output.participants.push({
                        name: caption.speaker.name,
                        imageUrl: caption.speaker.imageUrl,
                    });
                    participantIndex = output.participants.length - 1; // Update participant index
                }

                // Add message to the messages array
                output.messages.push({
                    actorIndex: participantIndex,
                    text: caption.text,
                    timestamp: caption.timestamp,
                    type: "caption",
                });
            });
        }

        return output;
    }

    generateMeetingPlainText(meeting) {
        const convertedMeeting = this.convert(meeting);
        const { meetingTitle, meetingId, meetingStartTime, participants, messages } = convertedMeeting;

        const headerLines = [];
        headerLines.push(`Title: ${meetingTitle || meetingId || 'Untitled meeting'}`);
        headerLines.push(`Start time: ${new Date(meetingStartTime).toLocaleString()}`);
        headerLines.push('');

        const sortedMessages = [...messages].sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        const lines = sortedMessages.map((msg) => {
            const speaker = participants[msg.actorIndex];
            const speakerName = speaker?.name || 'Unknown';
            const time = new Date(msg.timestamp).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            return `[${time}] ${speakerName}: ${msg.text}`;
        });

        return [...headerLines, ...lines].join('\n');
    }

    // 미팅 목록을 로드하고 표시
    async loadMeetingList() {
        try {
            const meetings = await this.autoMeetingLogDB.getAllMeetings();
            this.updateMeetingList(meetings);
        } catch (error) {
            console.error('Error loading meeting list:', error);
        }
    }

    async getSelectedMeeting() {
        if (!this.selectedMeetingStartTime) {
            alert('Please select a meeting first.');
            return null;
        }
        try {
            const meeting = await this.autoMeetingLogDB.getMeeting(this.selectedMeetingStartTime);
            if (!meeting) {
                alert('Could not load the selected meeting.');
            }
            return meeting;
        } catch (error) {
            console.error('Error loading selected meeting:', error);
            alert('Failed to load the selected meeting.');
            return null;
        }
    }

    initializeToolbarButtons() {
        const exportBtn = document.getElementById('exportTxtBtn');
        const copyBtn = document.getElementById('copyClipboardBtn');
        const summarizeBtn = document.getElementById('summarizeBtn');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.handleExportTxt();
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                this.handleCopyToClipboard();
            });
        }

        if (summarizeBtn) {
            summarizeBtn.addEventListener('click', () => {
                this.handleSummarizeMeeting(summarizeBtn);
            });
        }
    }

    async handleExportTxt() {
        const meeting = await this.getSelectedMeeting();
        if (!meeting) return;

        const text = this.generateMeetingPlainText(meeting);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        const safeTitle = (meeting.meetingTitle || meeting.meetingId || 'meeting')
            .replace(/[\\\/:*?"<>|]+/g, '_')
            .slice(0, 100);
        link.download = `${safeTitle || 'meeting'}.txt`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async handleCopyToClipboard() {
        const meeting = await this.getSelectedMeeting();
        if (!meeting) return;

        const text = this.generateMeetingPlainText(meeting);

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            alert('Meeting captions copied to clipboard.');
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            alert('Failed to copy to clipboard.');
        }
    }

    async getGeminiApiKey() {
        return new Promise((resolve) => {
            try {
                if (!chrome || !chrome.storage || !chrome.storage.sync) {
                    resolve(null);
                    return;
                }
                chrome.storage.sync.get(['geminiApiKey'], (result) => {
                    resolve(result.geminiApiKey || null);
                });
            } catch (error) {
                console.error('Error getting Gemini API key:', error);
                resolve(null);
            }
        });
    }

    async getGeminiLanguagePreference() {
        return new Promise((resolve) => {
            try {
                if (!chrome || !chrome.storage || !chrome.storage.sync) {
                    resolve('en');
                    return;
                }
                chrome.storage.sync.get(['geminiSummaryLanguage'], (result) => {
                    const value = result.geminiSummaryLanguage;
                    if (value === 'fa' || value === 'en') {
                        resolve(value);
                    } else {
                        resolve('en');
                    }
                });
            } catch (error) {
                console.error('Error getting Gemini summary language:', error);
                resolve('en');
            }
        });
    }

    async callGeminiSummarize(apiKey, text, language) {
        const endpoint =
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent' +
            `?key=${encodeURIComponent(apiKey)}`;
        const languageName = language === 'fa' ? 'Persian (Farsi)' : 'English';
        const prompt =
            `Summarize the following meeting transcript into concise bullet points in ${languageName}, focusing on key topics, decisions, and action items. ` +
            `Write the summary only in ${languageName}.\n\n` +
            text;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const candidate = data.candidates && data.candidates[0];
        const parts = candidate && candidate.content && candidate.content.parts;
        const summary =
            parts && parts.length
                ? parts
                      .map((p) => p.text || '')
                      .join('')
                      .trim()
                : '';
        if (!summary) {
            throw new Error('Gemini returned an empty summary.');
        }
        return summary;
    }

    renderMarkdownToHtml(markdownText) {
        if (!markdownText) return '';

        const escapeHtml = (str) =>
            str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

        const escaped = escapeHtml(markdownText);
        const lines = escaped.split('\n');
        let html = '';
        let inList = false;

        const flushList = () => {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
        };

        lines.forEach((rawLine) => {
            const line = rawLine.trimEnd();
            if (!line.trim()) {
                flushList();
                html += '<br />';
                return;
            }

            // Bold **text**
            const withBold = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

            if (/^[-*]\s+/.test(withBold)) {
                if (!inList) {
                    html += '<ul>';
                    inList = true;
                }
                const itemText = withBold.replace(/^[-*]\s+/, '');
                html += `<li>${itemText}</li>`;
            } else {
                flushList();
                html += `<p>${withBold}</p>`;
            }
        });

        flushList();
        return html;
    }

    showSummary(summaryText, language) {
        const captionsElement = document.getElementById('captions');
        if (!captionsElement) return;

        const mainContainer =
            captionsElement.querySelector('.meeting-main-column') || captionsElement;

        let summaryContainer = mainContainer.querySelector('.summary-container');
        if (!summaryContainer) {
            summaryContainer = document.createElement('div');
            summaryContainer.className = 'summary-container';
            summaryContainer.innerHTML = `
                <h3 class="summary-title">Summary</h3>
                <div class="summary-body"></div>
            `;

            const titleContainer = mainContainer.querySelector('.meeting-title-container');
            if (titleContainer) {
                mainContainer.insertBefore(summaryContainer, titleContainer.nextSibling);
            } else {
                mainContainer.prepend(summaryContainer);
            }
        }

        if (language === 'fa') {
            summaryContainer.classList.add('rtl');
        } else {
            summaryContainer.classList.remove('rtl');
        }

        const languageLabel = language === 'fa' ? 'Persian' : 'English';
        const titleEl = summaryContainer.querySelector('.summary-title');
        if (titleEl) {
            titleEl.textContent = `Summary (${languageLabel})`;
        }

        const bodyEl = summaryContainer.querySelector('.summary-body');
        if (bodyEl) {
            bodyEl.innerHTML = this.renderMarkdownToHtml(summaryText);
        }
    }

    async handleSummarizeMeeting(buttonElement) {
        const meeting = await this.getSelectedMeeting();
        if (!meeting) return;

        const apiKey = await this.getGeminiApiKey();
        if (!apiKey) {
            alert(
                'Gemini API key is not set. Please open the extension options and save your Gemini API key first.'
            );
            return;
        }

        const language = await this.getGeminiLanguagePreference();

        const originalHtml = buttonElement ? buttonElement.innerHTML : '';
        if (buttonElement) {
            buttonElement.disabled = true;
            buttonElement.innerHTML =
                '<span class="spin me-1"><i class="bi bi-arrow-repeat"></i></span>Summarizing...';
        }

        try {
            const text = this.generateMeetingPlainText(meeting);
            const summary = await this.callGeminiSummarize(apiKey, text, language);
            this.showSummary(summary, language);
            try {
                await this.autoMeetingLogDB.updateMeetingSummary(
                    meeting.meetingStartTime,
                    summary,
                    language
                );
            } catch (saveError) {
                console.error('Failed to save summary to meeting record:', saveError);
            }
        } catch (error) {
            console.error('Failed to summarize meeting:', error);
            alert('Failed to summarize meeting: ' + (error.message || 'Unknown error'));
        } finally {
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.innerHTML = originalHtml || 'Summarize';
            }
        }
    }

    async reloadSelectedMeeting(meetings) {
        try {
            if (this.selectedMeetingStartTime) {
                const selectedItem = document.querySelector(`[data-starttime="${this.selectedMeetingStartTime}"]`);
                if (selectedItem) {
                    // 현재 선택된 미팅의 최신 데이터를 가져옵니다
                    const selectedMeeting = await this.autoMeetingLogDB.getMeeting(this.selectedMeetingStartTime);
                    if (selectedMeeting) {
                        // 메시지 컨테이너의 현재 스크롤 위치를 저장
                        const messagesContainer = document.getElementById("captions");
                        if (!messagesContainer) return;

                        const wasScrolledToBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 10;
                        
                        // 메시지를 업데이트
                        this.showMessages(selectedMeeting);

                        // 이전에 스크롤이 맨 아래에 있었다면 다시 맨 아래로 스크롤
                        if (wasScrolledToBottom) {
                            setTimeout(() => {
                                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                            }, 100);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error reloading selected meeting:', error);
            // Extension context가 무효화된 경우 페이지를 새로고침
            if (error.message.includes('Extension context invalidated')) {
                console.log('Extension context invalidated, reloading page...');
                window.location.reload();
            }
        }
    }

    createParticipantAvatar(participant, selectedParticipant) {
        const participantAvatar = document.createElement("img");
        participantAvatar.className = "participant-avatar";
        participantAvatar.src = participant.imageUrl;
        participantAvatar.alt = participant.name;
        participantAvatar.title = participant.name;
        participantAvatar.setAttribute('data-participant-name', participant.name);
        participantAvatar.addEventListener("click", () => {
            const wasSelected = participantAvatar.classList.contains('selected');
            
            // 모든 참여자 아바타에서 selected 클래스 제거
            document.querySelectorAll('.participant-avatar').forEach(avatar => {
                avatar.classList.remove('selected');
            });
            
            if (!wasSelected) {
                // 현재 클릭된 참여자를 선택 상태로 만들기
                participantAvatar.classList.add('selected');
                this.highlightMessagesBySpeaker(participant.name);
            } else {
                // 이미 선택된 참여자를 다시 클릭하면 선택 해제
                this.clearHighlightedMessages();
            }
        });
        return participantAvatar;
    }

    createDateDivider(messageDate) {
        const dateDivider = document.createElement("div");
        dateDivider.className = "date-divider";

        const horizontalLineLeft = document.createElement("hr");
        horizontalLineLeft.className = "horizontal-line left";
        dateDivider.appendChild(horizontalLineLeft);

        const dateText = document.createElement("span");
        dateText.className = "date-text";
        dateText.textContent = messageDate;
        dateDivider.appendChild(dateText);

        const horizontalLineRight = document.createElement("hr");
        horizontalLineRight.className = "horizontal-line right";
        dateDivider.appendChild(horizontalLineRight);

        return dateDivider;
    }

    createMessageElement(speaker, text, timestamp) {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message";

        const avatar = document.createElement("img");
        avatar.className = "avatar";
        avatar.src = speaker.imageUrl;
        avatar.alt = speaker.name;
        messageDiv.appendChild(avatar);

        const textContainer = document.createElement("div");
        textContainer.className = "text-container";

        const name = document.createElement("p");
        name.className = "name-text";
        name.textContent = speaker.name;

        const time = document.createElement("span");
        time.className = "time-text";
        time.textContent = ' ' + new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true });
        name.appendChild(time);
        textContainer.appendChild(name);

        const contentP = document.createElement("p");
        contentP.textContent = text;
        contentP.className = "content-p";
        textContainer.appendChild(contentP);

        messageDiv.appendChild(textContainer);

        return messageDiv;
    }

    appendMessageToElement(messageDiv, text) {
        const contentP = document.createElement("p");
        contentP.textContent = text;
        contentP.className = "content-p";
        messageDiv.querySelector(".text-container").appendChild(contentP);
    }

    showMessages(meeting) {
        try {
            const convertedMeeting = this.convert(meeting);
            const captionsElement = document.getElementById("captions");
            if (!captionsElement) return;

            // 현재 스크롤 위치 저장
            const wasScrolledToBottom = captionsElement.scrollHeight - captionsElement.scrollTop <= captionsElement.clientHeight + 10;
            
            captionsElement.innerHTML = "";

            const layoutContainer = document.createElement('div');
            layoutContainer.className = 'meeting-layout';

            const mainColumn = document.createElement('div');
            mainColumn.className = 'meeting-main-column';

            const notesColumn = document.createElement('div');
            notesColumn.className = 'meeting-notes-column';

            layoutContainer.appendChild(mainColumn);
            layoutContainer.appendChild(notesColumn);
            captionsElement.appendChild(layoutContainer);

            let messages = convertedMeeting.messages;
            let participants = convertedMeeting.participants;
            let selectedParticipant = null;

            // 회의 제목 표시
            const titleContainer = document.createElement("div");
            titleContainer.className = "meeting-title-container";
            titleContainer.innerHTML = `
                <h2 class="meeting-title-header">
                    ${convertedMeeting.meetingTitle || convertedMeeting.meetingId}
                    <button type="button" class="btn btn-link btn-sm rename-meeting-btn">
                        <i class="bi bi-pencil"></i>
                    </button>
                </h2>
                <div class="meeting-start-time">${new Date(convertedMeeting.meetingStartTime).toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    weekday: 'long'
                })}</div>
            `;
            mainColumn.appendChild(titleContainer);

            const renameButton = titleContainer.querySelector('.rename-meeting-btn');
            if (renameButton) {
                renameButton.addEventListener('click', async () => {
                    const currentTitle = convertedMeeting.meetingTitle || convertedMeeting.meetingId || '';
                    const newTitle = prompt('Enter a new meeting name:', currentTitle);
                    if (newTitle === null) {
                        return;
                    }
                    const trimmed = newTitle.trim();
                    if (!trimmed) {
                        alert('Meeting name cannot be empty.');
                        return;
                    }
                    try {
                        const updated = await this.autoMeetingLogDB.updateMeetingTitle(
                            convertedMeeting.meetingStartTime,
                            trimmed
                        );
                        if (updated) {
                            const headerEl = titleContainer.querySelector('.meeting-title-header');
                            if (headerEl) {
                                // First child node is the text node before the button
                                headerEl.childNodes[0].textContent = trimmed + ' ';
                            }
                            this.loadMeetingList();
                        } else {
                            alert('Failed to update meeting name.');
                        }
                    } catch (error) {
                        console.error('Error updating meeting name:', error);
                        alert('Failed to update meeting name.');
                    }
                });
            }

            if (meeting.summaryText) {
                this.showSummary(meeting.summaryText, meeting.summaryLanguage || 'en');
            }

            const participantsContainer = document.createElement("div");
            participantsContainer.className = "participants-container";

            participants.forEach(participant => {
                const participantAvatar = this.createParticipantAvatar(participant, selectedParticipant);
                participantsContainer.appendChild(participantAvatar);
            });

            mainColumn.appendChild(participantsContainer);

            const notesContainer = document.createElement('div');
            notesContainer.className = 'notes-container';
            notesContainer.innerHTML = `
                <div class="notes-header">
                    <h3 class="notes-title">Notes</h3>
                    <p class="notes-subtitle">Private notes for this meeting</p>
                </div>
                <div class="notes-body">
                    <textarea class="notes-textarea" placeholder="Write anything you want about this meeting..."></textarea>
                    <div class="notes-footer">
                        <button type="button" class="btn btn-sm btn-primary notes-save-btn">
                            <i class="bi bi-save me-1"></i>
                            Save
                        </button>
                        <span class="notes-status"></span>
                    </div>
                </div>
            `;
            notesColumn.appendChild(notesContainer);

            const notesTextarea = notesContainer.querySelector('.notes-textarea');
            const notesSaveBtn = notesContainer.querySelector('.notes-save-btn');
            const notesStatus = notesContainer.querySelector('.notes-status');

            if (notesTextarea) {
                notesTextarea.value = meeting.notesText || '';
            }

            const updateStatus = (text, type) => {
                if (!notesStatus) return;
                notesStatus.textContent = text || '';
                notesStatus.classList.remove('text-success', 'text-danger', 'text-muted');
                if (type) {
                    notesStatus.classList.add(type);
                }
            };

            const saveNotes = async () => {
                if (!notesTextarea || !notesSaveBtn) return;
                const currentText = notesTextarea.value;
                const originalHtml = notesSaveBtn.innerHTML;
                notesSaveBtn.disabled = true;
                notesSaveBtn.innerHTML =
                    '<span class="spin me-1"><i class="bi bi-arrow-repeat"></i></span>Saving...';
                updateStatus('', null);

                try {
                    const ok = await this.autoMeetingLogDB.updateMeetingNotes(
                        convertedMeeting.meetingStartTime,
                        currentText
                    );
                    if (ok) {
                        meeting.notesText = currentText;
                        updateStatus('Saved', 'text-success');
                    } else {
                        updateStatus('Unable to save notes for this meeting.', 'text-danger');
                    }
                } catch (error) {
                    console.error('Error saving meeting notes:', error);
                    updateStatus('Failed to save notes', 'text-danger');
                } finally {
                    notesSaveBtn.disabled = false;
                    notesSaveBtn.innerHTML = originalHtml;
                }
            };

            if (notesSaveBtn) {
                notesSaveBtn.addEventListener('click', () => {
                    saveNotes();
                });
            }

            if (notesTextarea) {
                notesTextarea.addEventListener('blur', () => {
                    if ((meeting.notesText || '') !== notesTextarea.value) {
                        saveNotes();
                    }
                });
            }

            let lastSpeaker = null;
            let messageDiv = null;
            let currentDate = null;

            messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            messages.forEach((message) => {
                const speaker = participants[message.actorIndex];
                const text = message.text;
                const timestamp = message.timestamp;

                const messageDate = new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });

                if (currentDate !== messageDate) {
                    const dateDivider = this.createDateDivider(messageDate);
                    mainColumn.appendChild(dateDivider);
                    currentDate = messageDate;
                }

                if (lastSpeaker !== speaker.name) {
                    messageDiv = this.createMessageElement(speaker, text, timestamp);
                    mainColumn.appendChild(messageDiv);
                } else {
                    this.appendMessageToElement(messageDiv, text);
                }

                lastSpeaker = speaker.name;
            });

            captionsElement.hidden = false;

            // 이전에 스크롤이 맨 아래에 있었다면 다시 맨 아래로 스크롤
            if (wasScrolledToBottom) {
                setTimeout(() => {
                    captionsElement.scrollTop = captionsElement.scrollHeight;
                }, 100);
            }
        } catch (error) {
            console.error('Error showing messages:', error);
            // Extension context가 무효화된 경우 페이지를 새로고침
            if (error.message.includes('Extension context invalidated')) {
                console.log('Extension context invalidated, reloading page...');
                window.location.reload();
            }
        }
    }

    highlightMessagesBySpeaker(speakerName) {
        const messageElements = document.querySelectorAll(".message");

        messageElements.forEach(messageElement => {
            const nameText = messageElement.querySelector(".name-text");
            const textContainer = messageElement.querySelector(".text-container");

            if (nameText && nameText.textContent.includes(speakerName)) {
                textContainer.classList.add("highlight");
            } else {
                textContainer.classList.remove("highlight");
            }
        });
    }

    clearHighlightedMessages() {
        const messageElements = document.querySelectorAll(".message");

        messageElements.forEach(messageElement => {
            const textContainer = messageElement.querySelector(".text-container");
            textContainer.classList.remove("highlight");
        });
    }

    setActiveMeeting(selectedItem) {
        const items = document.querySelectorAll('.list-group-item');
        items.forEach((item) => {
            item.classList.remove('active');
        });
        selectedItem.classList.add('active');
        this.selectedMeetingStartTime = selectedItem.getAttribute('data-starttime');
    }

    selectMeeting(meeting) {
        this.selectedMeetingStartTime = meeting.meetingStartTime;
        this.showMessages(meeting);
        
        // 이전에 선택된 항목의 active 클래스 제거
        const previousActive = document.querySelector('.list-group-item.active');
        if (previousActive) {
            previousActive.classList.remove('active');
        }
        
        // 현재 선택된 항목에 active 클래스 추가
        const currentItem = document.querySelector(`[data-starttime="${meeting.meetingStartTime}"]`);
        if (currentItem) {
            currentItem.classList.add('active');
        }
    }

    showDeleteConfirmation(meeting) {
        this.selectedMeetingStartTime = meeting.meetingStartTime;
        
        // 모달에 미팅 정보 표시
        document.getElementById('deleteMeetingTitle').textContent = meeting.meetingTitle || '(Untitled)';
        document.getElementById('deleteMeetingTime').textContent = new Date(meeting.meetingStartTime).toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        // 모달 표시
        this.deleteModal.show();
    }

    // 미팅 목록을 업데이트하되 선택 상태는 유지
    updateMeetingList(meetings) {
        const meetingList = document.querySelector('#meeting-list');
        const existingGroups = new Map();
        
        // 기존 그룹 정보 저장
        meetingList.querySelectorAll('.meeting-group').forEach(group => {
            const header = group.querySelector('.meeting-group-header');
            if (header) {
                const date = header.getAttribute('data-date');
                if (date) {
                    existingGroups.set(date, group);
                }
            }
        });

        // 월별로 회의 그룹화
        const meetingsByDate = {};
        meetings.forEach(meeting => {
            const date = new Date(meeting.meetingStartTime).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long'
            });
            if (!meetingsByDate[date]) {
                meetingsByDate[date] = [];
            }
            meetingsByDate[date].push(meeting);
        });

        // 각 월별 그룹 내에서 회의를 시간 역순으로 정렬
        Object.values(meetingsByDate).forEach(meetings => {
            meetings.sort((a, b) => new Date(b.meetingStartTime) - new Date(a.meetingStartTime));
        });

        // 월별로 정렬된 그룹 생성 또는 업데이트
        const sortedDates = Object.entries(meetingsByDate)
            .sort(([dateA, meetingsA], [dateB, meetingsB]) => {
                // 각 그룹의 가장 최근 회의 시간으로 정렬
                const latestA = Math.max(...meetingsA.map(m => new Date(m.meetingStartTime).getTime()));
                const latestB = Math.max(...meetingsB.map(m => new Date(m.meetingStartTime).getTime()));
                return latestB - latestA;  // 최신 월이 상단에 오도록 정렬
            });

        // 새로운 DOM 구조를 생성
        const fragment = document.createDocumentFragment();

        sortedDates.forEach(([date, meetings]) => {
            let groupDiv = existingGroups.get(date);
            const isNewGroup = !groupDiv;
            
            if (isNewGroup) {
                // 새 그룹 생성
                groupDiv = document.createElement('div');
                groupDiv.className = 'meeting-group';
                
                const header = document.createElement('div');
                header.className = 'meeting-group-header';
                header.setAttribute('data-date', date);
                header.innerHTML = `
                    <i class="bi bi-calendar me-2"></i>
                    ${date}
                    <span class="count">(${meetings.length})</span>
                    <i class="bi bi-chevron-down float-end"></i>
                `;
                
                // 헤더 클릭 이벤트 추가
                header.addEventListener('click', () => {
                    header.classList.toggle('collapsed');
                    const container = header.nextElementSibling;
                    if (container) {
                        container.classList.toggle('collapsed');
                        if (container.classList.contains('collapsed')) {
                            container.style.maxHeight = '0';
                        } else {
                            container.style.maxHeight = container.scrollHeight + 'px';
                        }
                    }
                });
                
                const container = document.createElement('div');
                container.className = 'meetings-container';
                container.style.maxHeight = '1000px'; // 초기 상태는 펼쳐진 상태
                
                groupDiv.appendChild(header);
                groupDiv.appendChild(container);
            } else {
                // 기존 그룹을 fragment로 이동
                groupDiv.remove();
            }

            const container = groupDiv.querySelector('.meetings-container');
            const existingMeetings = new Map();
            
            // 기존 미팅 정보 저장
            container.querySelectorAll('.list-group-item').forEach(item => {
                const startTime = item.getAttribute('data-starttime');
                if (startTime) {
                    existingMeetings.set(startTime, item);
                }
            });

            // 미팅 목록 업데이트
            meetings.forEach(meeting => {
                const existingItem = existingMeetings.get(meeting.meetingStartTime);
                
                if (!existingItem) {
                    // 새 미팅 항목 생성
                    const li = document.createElement('div');
                    li.className = 'list-group-item';
                    li.setAttribute('data-starttime', meeting.meetingStartTime);
                    
                    const time = this.formatMeetingTime(meeting.meetingStartTime);
                    const fullTitle = meeting.meetingTitle || meeting.meetingId;
                    li.innerHTML = `
                        <span class="meeting-title" title="${fullTitle}"># ${fullTitle}</span>
                        <span class="meeting-time">${time}</span>
                        <button class="delete-button" aria-label="Delete meeting">
                            <i class="bi bi-x"></i>
                        </button>
                    `;
                    
                    // 클릭 이벤트 리스너 추가
                    li.addEventListener('click', (event) => {
                        if (!event.target.closest('.delete-button')) {
                            this.selectMeeting(meeting);
                        }
                    });
                    
                    // 삭제 버튼 이벤트 리스너
                    const deleteButton = li.querySelector('.delete-button');
                    if (deleteButton) {
                        deleteButton.addEventListener('click', (event) => {
                            event.stopPropagation();
                            this.showDeleteConfirmation(meeting);
                        });
                    }
                    
                    container.appendChild(li);
                }
                existingMeetings.delete(meeting.meetingStartTime);
            });

            // 더 이상 존재하지 않는 미팅 제거
            existingMeetings.forEach((item) => {
                item.remove();
            });

            // 그룹 내 미팅 수 업데이트
            const countElement = groupDiv.querySelector('.count');
            if (countElement) {
                const currentCount = container.querySelectorAll('.list-group-item').length;
                countElement.textContent = `(${currentCount})`;
            }

            fragment.appendChild(groupDiv);
            existingGroups.delete(date);
        });

        // 더 이상 존재하지 않는 그룹 제거
        existingGroups.forEach((group) => {
            group.remove();
        });

        // 한 번에 DOM 업데이트
        meetingList.innerHTML = '';
        meetingList.appendChild(fragment);

        // 현재 선택된 미팅이 있으면 active 상태 복원
        if (this.selectedMeetingStartTime) {
            const selectedItem = document.querySelector(`[data-starttime="${this.selectedMeetingStartTime}"]`);
            if (selectedItem) {
                selectedItem.classList.add('active');
            }
        }
    }
}