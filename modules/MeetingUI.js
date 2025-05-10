export class MeetingUI {
    constructor(autoMeetingLogDB) {
        this.autoMeetingLogDB = autoMeetingLogDB;
        this.selectedMeetingStartTime = null;
        this.currentMeeting = null;
        this.initializeButtons();
    }

    initializeButtons() {
        const copyButton = document.getElementById('copyToClipboard');
        const exportButton = document.getElementById('exportToTxt');

        copyButton.addEventListener('click', () => this.copyToClipboard());
        exportButton.addEventListener('click', () => this.exportToTxt());
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
                li.className = "list-group-item";
                li.innerHTML = `<strong>${meeting.meetingTitle}</strong><br><small>${this.convertToKST(
                    meeting.meetingStartTime,
                )}</small>`;
                li.setAttribute("data-starttime", meeting.meetingStartTime);
                li.addEventListener("click", () => {
                    this.showMessages(meeting);
                    this.setActiveMeeting(li);
                });
                meetingListElement.appendChild(li);
            });

            this.reloadSelectedMeeting(meetings);
        }
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
}