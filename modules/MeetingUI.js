import { GeminiService } from './GeminiService.js';

export class MeetingUI {
    constructor(autoMeetingLogDB) {
        this.autoMeetingLogDB = autoMeetingLogDB;
        this.selectedMeetingStartTime = null;
        this.currentMeeting = null;
        this.geminiService = new GeminiService();
        this.initializeButtons();
    }

    initializeButtons() {
        const copyButton = document.getElementById('copyToClipboard');
        const exportButton = document.getElementById('exportToTxt');
        const renameButton = document.getElementById('renameMeeting');
        const removeButton = document.getElementById('removeMeeting');
        const summarizeButton = document.getElementById('summarizeMeeting');

        copyButton.addEventListener('click', () => this.copyToClipboard());
        exportButton.addEventListener('click', () => this.exportToTxt());
        summarizeButton.addEventListener('click', () => this.summarizeMeeting());

        // Remove button logic
        removeButton.addEventListener('click', async () => {
            if (!this.currentMeeting) return;
            if (confirm('Are you sure you want to remove this meeting log?')) {
                await this.deleteMeeting(this.currentMeeting.meetingStartTime);
                this.currentMeeting = null;
                this.setActionButtonsEnabled(false);
                document.getElementById('captions').hidden = true;
            }
        });

        // Rename button logic
        renameButton.addEventListener('click', async () => {
            if (!this.currentMeeting) return;
            const newTitle = prompt('Enter new meeting name:', this.currentMeeting.meetingTitle);
            if (newTitle && newTitle.trim() && newTitle !== this.currentMeeting.meetingTitle) {
                await this.renameMeeting(this.currentMeeting.meetingStartTime, newTitle.trim());
            }
        });

        this.setActionButtonsEnabled(false);
    }

    setActionButtonsEnabled(enabled) {
        document.getElementById('renameMeeting').disabled = !enabled;
        document.getElementById('removeMeeting').disabled = !enabled;
        document.getElementById('copyToClipboard').disabled = !enabled;
        document.getElementById('exportToTxt').disabled = !enabled;
        document.getElementById('summarizeMeeting').disabled = !enabled;
    }

    formatMessageForExport(message, participants) {
        const speaker = participants[message.actorIndex];
        const timestamp = new Date(message.timestamp).toLocaleString('en-US', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        return `[${timestamp}] ${speaker.name}: ${message.text}`;
    }

    async copyToClipboard() {
        if (!this.currentMeeting) return;

        const convertedMeeting = this.convert(this.currentMeeting);
        const messages = convertedMeeting.messages
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .map(message => this.formatMessageForExport(message, convertedMeeting.participants))
            .join('\n');

        try {
            await navigator.clipboard.writeText(messages);
            this.showToast('Copied to clipboard!', 'success');
        } catch (err) {
            this.showToast('Failed to copy to clipboard', 'error');
            console.error('Failed to copy:', err);
        }
    }

    exportToTxt() {
        if (!this.currentMeeting) return;

        const convertedMeeting = this.convert(this.currentMeeting);
        const messages = convertedMeeting.messages
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .map(message => this.formatMessageForExport(message, convertedMeeting.participants))
            .join('\n');

        const blob = new Blob([messages], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${convertedMeeting.meetingTitle}_${new Date(convertedMeeting.meetingStartTime).toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(toast);
                }, 300);
            }, 2000);
        }, 100);
    }

    convertToKST(time, option = {}) {
        return new Date(time).toLocaleString({ timeZone: "Asia/Seoul", ...option });
    }

    convert(input) {
        // (convert 함수 내용)
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

    async loadMeetingList() {
        const meetings = await this.autoMeetingLogDB.getAllMeetings()
        const meetingListElement = document.getElementById("meeting-list");
        meetingListElement.innerHTML = "";

        if (meetings) {
            // Sort meetings in reverse chronological order.
            meetings.sort((a, b) => new Date(b.meetingStartTime) - new Date(a.meetingStartTime));

            meetings.forEach((meeting) => {
                const li = document.createElement("li");
                li.className = "list-group-item d-flex align-items-center justify-content-between";
                li.setAttribute("data-starttime", meeting.meetingStartTime);

                // Meeting title (with inline edit support)
                const titleContainer = document.createElement("span");
                titleContainer.className = "meeting-title-container flex-grow-1";
                const title = document.createElement("strong");
                title.textContent = meeting.meetingTitle;
                title.className = "meeting-title-text";
                titleContainer.appendChild(title);

                // Inline edit input (hidden by default)
                const editInput = document.createElement("input");
                editInput.type = "text";
                editInput.value = meeting.meetingTitle;
                editInput.className = "form-control meeting-title-edit-input";
                editInput.style.display = "none";
                titleContainer.appendChild(editInput);

                // Date
                const date = document.createElement("small");
                date.textContent = this.convertToKST(meeting.meetingStartTime);
                date.className = "ml-2 text-muted";
                titleContainer.appendChild(date);

                // Icon container
                const iconContainer = document.createElement("span");
                iconContainer.className = "meeting-icon-container ml-2";

                // Pen (edit) icon
                const penIcon = document.createElement("i");
                penIcon.className = "fas fa-pen text-primary meeting-pen-icon";
                penIcon.title = "Rename";
                penIcon.style.cursor = "pointer";
                penIcon.style.marginRight = "10px";
                iconContainer.appendChild(penIcon);

                // Trash icon
                const trashIcon = document.createElement("i");
                trashIcon.className = "fas fa-trash text-danger meeting-trash-icon";
                trashIcon.title = "Delete";
                trashIcon.style.cursor = "pointer";
                iconContainer.appendChild(trashIcon);

                // Add to li
                li.appendChild(titleContainer);
                li.appendChild(iconContainer);

                // Click to select meeting (ignore if editing)
                li.addEventListener("click", (e) => {
                    if (e.target === penIcon || e.target === trashIcon || editInput.style.display === "block") return;
                    this.showMessages(meeting);
                    this.setActiveMeeting(li);
                });

                // Pen icon click: show inline edit
                penIcon.addEventListener("click", (e) => {
                    e.stopPropagation();
                    title.style.display = "none";
                    editInput.style.display = "block";
                    editInput.focus();
                    editInput.select();
                });

                // Edit input: save on blur or Enter
                editInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        editInput.blur();
                    }
                });
                editInput.addEventListener("blur", async () => {
                    const newTitle = editInput.value.trim();
                    if (newTitle && newTitle !== meeting.meetingTitle) {
                        await this.renameMeeting(meeting.meetingStartTime, newTitle, title, editInput);
                    } else {
                        editInput.style.display = "none";
                        title.style.display = "inline";
                    }
                });

                // Trash icon click: delete with undo
                trashIcon.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const removedLi = li;
                    const removedMeeting = meeting;
                    removedLi.style.display = "none";
                    this.showToast('Meeting deleted. <a href="#" class="undo-link">Undo</a>', 'error');
                    let undo = false;
                    const undoHandler = (event) => {
                        if (event.target.classList.contains('undo-link')) {
                            event.preventDefault();
                            undo = true;
                            removedLi.style.display = "";
                            this.showToast('Delete undone.', 'success');
                            document.removeEventListener('click', undoHandler);
                        }
                    };
                    document.addEventListener('click', undoHandler);
                    setTimeout(async () => {
                        document.removeEventListener('click', undoHandler);
                        if (!undo) {
                            await this.deleteMeeting(removedMeeting.meetingStartTime);
                        }
                    }, 4000);
                });

                meetingListElement.appendChild(li);
            });

            this.reloadSelectedMeeting(meetings);
        }
    }

    async deleteMeeting(meetingStartTime) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: "background.deleteMeeting",
                meetingStartTime
            }, (response) => {
                if (response && response.success) {
                    this.showToast('Meeting deleted.', 'success');
                    this.loadMeetingList();
                } else {
                    this.showToast('Failed to delete meeting', 'error');
                }
                resolve();
            });
        });
    }

    async renameMeeting(meetingStartTime, newTitle, titleElem, inputElem) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: "background.renameMeeting",
                meetingStartTime,
                newTitle
            }, (response) => {
                if (response && response.success) {
                    titleElem.textContent = newTitle;
                    inputElem.style.display = "none";
                    titleElem.style.display = "inline";
                    this.showToast('Meeting renamed.', 'success');
                    this.loadMeetingList();
                } else {
                    this.showToast('Failed to rename meeting', 'error');
                }
                resolve();
            });
        });
    }

    reloadSelectedMeeting(meetings) {
        if (this.selectedMeetingStartTime) {
            const selectedItem = document.querySelector(`[data-starttime="${this.selectedMeetingStartTime}"]`);
            if (selectedItem) {
                const selectedMeeting = meetings.find((meeting) => meeting.meetingStartTime === this.selectedMeetingStartTime);
                if (selectedMeeting) {
                    this.showMessages(selectedMeeting);
                    this.setActiveMeeting(selectedItem);

                    // Scroll to the bottom of the messages container
                const messagesContainer = document.getElementById("captions");
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            }
        }
    }

    createParticipantAvatar(participant, selectedParticipant) {
        const participantAvatar = document.createElement("img");
        participantAvatar.className = "participant-avatar";
        participantAvatar.src = participant.imageUrl;
        participantAvatar.alt = participant.name;
        participantAvatar.title = participant.name;
        participantAvatar.addEventListener("click", () => {
            if (selectedParticipant !== participant.name) {
                selectedParticipant = participant.name;
                this.highlightMessagesBySpeaker(selectedParticipant);
            } else {
                selectedParticipant = null;
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
        time.textContent = ' ' + new Date(timestamp).toLocaleTimeString({ timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: true });
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
        this.currentMeeting = meeting;
        this.setActionButtonsEnabled(true);
        const copyButton = document.getElementById('copyToClipboard');
        const exportButton = document.getElementById('exportToTxt');
        
        copyButton.disabled = false;
        exportButton.disabled = false;

        const convertedMeeting = this.convert(meeting);
        const captionsElement = document.getElementById("captions");
        captionsElement.innerHTML = "";

        let messages = convertedMeeting.messages;
        let participants = convertedMeeting.participants;
        let selectedParticipant = null;

        const participantsContainer = document.createElement("div");
        participantsContainer.className = "participants-container";

        participants.forEach(participant => {
            const participantAvatar = this.createParticipantAvatar(participant, selectedParticipant);
            participantsContainer.appendChild(participantAvatar);
        });

        captionsElement.appendChild(participantsContainer);

        let lastSpeaker = null;
        let messageDiv = null;
        let currentDate = null;

        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        messages.forEach((message) => {
            const speaker = participants[message.actorIndex];
            const text = message.text;
            const timestamp = message.timestamp;

            const messageDate = new Date(timestamp).toLocaleDateString({ timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

            if (currentDate !== messageDate) {
                const dateDivider = this.createDateDivider(messageDate);
                captionsElement.appendChild(dateDivider);
                currentDate = messageDate;
            }

            if (lastSpeaker !== speaker.name) {
                messageDiv = this.createMessageElement(speaker, text, timestamp);
                captionsElement.appendChild(messageDiv);
            } else {
                this.appendMessageToElement(messageDiv, text);
            }

            lastSpeaker = speaker.name;
        });

        captionsElement.hidden = false;
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
        const meetingListElement = document.getElementById("meeting-list");
        const items = meetingListElement.querySelectorAll("li");
        items.forEach((item) => {
            item.classList.remove("active");
        });
        selectedItem.classList.add("active");
        this.selectedMeetingStartTime = selectedItem.getAttribute("data-starttime");
    }

    getSelectedMeeting() {
        return this.currentMeeting;
    }

    convertMeetingToText(meeting) {
        const convertedMeeting = this.convert(meeting);
        const messages = convertedMeeting.messages
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .map(message => this.formatMessageForExport(message, convertedMeeting.participants))
            .join('\n');

        return {
            meetingId: meeting.meetingId,
            text: messages
        };
    }

    async summarizeMeeting() {
        try {
            console.log('Summarize button clicked');
            const selectedMeeting = this.getSelectedMeeting();
            if (!selectedMeeting) {
                throw new Error('No meeting selected');
            }

            // Get language from storage
            const language = await new Promise(resolve => {
                chrome.storage.sync.get(['summaryLanguage'], result => {
                    resolve(result.summaryLanguage || 'en');
                });
            });

            console.log('Showing modal');
            const modal = document.getElementById('summaryModal');
            const summaryContent = document.getElementById('summaryContent');
            modal.style.display = 'block';
            modal.classList.add('show');

            // Set direction and font for modal and content
            if (language === 'fa') {
                modal.setAttribute('dir', 'rtl');
                summaryContent.style.fontFamily = 'Vazirmatn, Tahoma, Arial, sans-serif';
            } else {
                modal.setAttribute('dir', 'ltr');
                summaryContent.style.fontFamily = '';
            }

            // Show loading spinner/message
            summaryContent.innerHTML = `
                <div class="spinner-border text-primary" role="status" style="display:inline-block;width:2rem;height:2rem;vertical-align:middle;"></div>
                <span style="margin-left:1rem;vertical-align:middle;">Generating summary...</span>
            `;

            // Add event listeners for closing the modal
            const closeButtons = modal.querySelectorAll('[data-dismiss="modal"]');
            closeButtons.forEach(button => {
                button.addEventListener('click', () => {
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                });
            });

            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                }
            });

            console.log('Converting meeting');
            const meeting = this.convertMeetingToText(selectedMeeting);
            console.log('Meeting converted:', meeting);

            console.log('Sending request to Gemini API');
            const summary = await this.geminiService.summarizeMeeting(meeting.text, meeting.meetingId);
            console.log('Summary received:', summary);

            // Simple markdown to HTML converter
            function simpleMarkdown(md) {
                return md
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // bold
                    .replace(/\*(.*?)\*/g, '<em>$1</em>') // italic
                    .replace(/^\s*\* (.*)$/gm, '<li>$1</li>') // unordered list
                    .replace(/\n{2,}/g, '</p><p>') // paragraphs
                    .replace(/\n/g, '<br>') // line breaks
                    .replace(/^<p>/, '')
                    .replace(/<\/p>$/, '');
            }

            summaryContent.innerHTML = `<div class="summary-text"><p>${simpleMarkdown(summary)}</p></div>`;
        } catch (error) {
            console.error('Error in summarizeMeeting:', error);
            const summaryContent = document.getElementById('summaryContent');
            summaryContent.innerHTML = `
                <div class="error-message">
                    Error: ${error.message}
                </div>
            `;
        }
    }
}