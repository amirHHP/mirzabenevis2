import { LicenseManager } from './LicenseManager.js';
import { BackupManager } from './BackupManager.js';
import { deduplicateMeetingMessages, mergeConsecutiveTexts } from './TranscriptDeduplicator.js';
import { isLobbyOrGenericTitle } from './AutoMeetingLogData.js';

function safeSendMessage(message) {
    try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            const res = chrome.runtime.sendMessage(message, () => {
                void chrome.runtime?.lastError;
            });
            if (res && typeof res.catch === 'function') {
                res.catch(() => {});
            }
        }
    } catch (_) {}
}

export class MeetingUI {
    static QUOTA_EXCEEDED_MESSAGE =
        'سهمیه روزانه کلید Gemini شما به پایان رسیده است. لطفاً فردا مجدداً تلاش کنید یا از کلید دیگری استفاده نمایید';

    isQuotaExceededError(error) {
        if (!error) return false;
        if (error.status === 429 || Number(error.status) === 429) return true;
        const msg = String(error.message || error);
        return (
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.toLowerCase().includes('quota')
        );
    }

    constructor(autoMeetingLogDB) {
        this.autoMeetingLogDB = autoMeetingLogDB;
        this.selectedMeetingStartTime = null;
        this.deleteModal = null;
        this.proModal = null;
        this.backupModal = null;
        this.proInfoModal = null;
        this.licenseManager = new LicenseManager();
        this.backupManager = new BackupManager(this.autoMeetingLogDB, this.licenseManager);

        this.initializeDeleteModal();
        this.initializeToolbarButtons();
        this.initializeSidebarResizer();
        this.initializeProAndBackup();
    }

    getDisplayTitle(meeting) {
        const title = meeting?.meetingTitle;
        if (title && !this.isGenericTitle(title, meeting?.meetingId)) {
            return title;
        }
        return meeting?.aiTitle || meeting?.generatedTitle || meeting?.meetingId || 'Untitled Meeting';
    }

    isGenericTitle(title, meetingId) {
        return isLobbyOrGenericTitle(title, meetingId);
    }

    initializeDeleteModal() {
        const modal = document.getElementById('deleteModal');
        const confirmButton = document.getElementById('confirmDelete');
        
        // Bootstrap 5 Modal 인스턴스 생성
        if (modal && typeof bootstrap !== 'undefined') {
            this.deleteModal = new bootstrap.Modal(modal, {
                keyboard: true,
                backdrop: 'static',  // 배경 클릭으로 닫히지 않도록 설정
                focus: true          // 모달이 열릴 때 포کر스 관리 활성화
            });
        }
        
        if (confirmButton) {
            confirmButton.addEventListener('click', async () => {
                if (this.selectedMeetingStartTime) {
                    try {
                        const deletedStartTime = this.selectedMeetingStartTime;
                        await this.autoMeetingLogDB.deleteMeeting(deletedStartTime);

                        // Keep the cloud copy in sync (fire-and-forget)
                        safeSendMessage({ type: 'cloud.deleteMeeting', meetingStartTime: deletedStartTime });
                        
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
            hour12: false
        });
    }

    formatMeetingDay(timestamp) {
        const date = new Date(timestamp);
        return date.getDate().toString();
    }

    convertToKST(time, option = {}) {
        return new Date(time).toLocaleString(undefined, { timeZone: "Asia/Seoul", ...option });
    }

    deduplicateMessages(messages, windowMs = 30000) {
        return deduplicateMeetingMessages(messages, windowMs);
    }

    convert(input) {
        if (!input) return input;
        let output;

        if (!input.captions) {
            output = {
                ...input,
                participants: Array.isArray(input.participants) ? [...input.participants] : [],
                messages: Array.isArray(input.messages) ? [...input.messages] : [],
            };
        } else {
            output = {
                ...input,
                meetingId: input.meetingId,
                meetingTitle: input.meetingTitle,
                meetingStartTime: input.meetingStartTime,
                participants: [],
                messages: [],
            };

            // Extract participants and messages from captions
            input.captions.forEach((caption) => {
                // Check if participant already exists in participants array
                let participantIndex = output.participants.findIndex((p) => p.name === caption?.speaker?.name);

                // If participant doesn't exist, add them to the array
                if (participantIndex === -1) {
                    output.participants.push({
                        name: caption?.speaker?.name || 'Unknown',
                        imageUrl: caption?.speaker?.imageUrl || '',
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

        // Self-healing deduplication pass:
        // Cleans fragmented, stuttered, and duplicated captions on the fly
        // without mutating or corrupting the original stored meeting record.
        output.messages = this.deduplicateMessages(output.messages);

        return output;
    }

    generateMeetingPlainText(meeting) {
        const convertedMeeting = this.convert(meeting);
        const { meetingTitle, meetingId, meetingStartTime, participants, messages } = convertedMeeting;

        const headerLines = [];
        headerLines.push(`Title: ${this.getDisplayTitle(convertedMeeting)}`);
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
            const text = msg.text || '';
            const hasRtl = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
            const startsWithNonRtl = /^[\d\u0660-\u0669\u06F0-\u06F9\s\p{P}\p{S}]/u.test(text.trim());
            const needsRlm = hasRtl && startsWithNonRtl && !text.startsWith('\u200F');
            const formattedText = needsRlm ? `\u200F${text}` : text;
            return `[${time}] ${speakerName}: ${formattedText}`;
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
        const autoTitleBtn = document.getElementById('autoTitleBtn');
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

        if (autoTitleBtn) {
            autoTitleBtn.addEventListener('click', () => {
                this.handleAutoTitleMeeting(autoTitleBtn);
            });
        }

        if (summarizeBtn) {
            summarizeBtn.addEventListener('click', () => {
                this.handleSummarizeMeeting(summarizeBtn);
            });
        }
    }

    initializeProAndBackup() {
        const proModalEl = document.getElementById('proModal');
        const backupModalEl = document.getElementById('backupModal');
        const proInfoModalEl = document.getElementById('proInfoModal');

        if (proModalEl && typeof bootstrap !== 'undefined') {
            this.proModal = new bootstrap.Modal(proModalEl, { keyboard: true });
        }
        if (backupModalEl && typeof bootstrap !== 'undefined') {
            this.backupModal = new bootstrap.Modal(backupModalEl, { keyboard: true });
        }
        if (proInfoModalEl && typeof bootstrap !== 'undefined') {
            this.proInfoModal = new bootstrap.Modal(proInfoModalEl, { keyboard: true });
        }

        const proStatusBtn = document.getElementById('proStatusBtn');
        const backupAllBtn = document.getElementById('backupAllBtn');
        const proPurchaseLink = document.getElementById('proPurchaseLink');
        const proModalKeyInput = document.getElementById('proModalKeyInput');
        const proModalActivateBtn = document.getElementById('proModalActivateBtn');
        const proModalStatus = document.getElementById('proModalStatus');

        const doDownloadBackupBtn = document.getElementById('doDownloadBackupBtn');
        const doSelectRestoreBtn = document.getElementById('doSelectRestoreBtn');
        const restoreFileInput = document.getElementById('restoreFileInput');
        const backupModalStatus = document.getElementById('backupModalStatus');

        const proInfoOpenBackupBtn = document.getElementById('proInfoOpenBackupBtn');
        const proInfoDeactivateBtn = document.getElementById('proInfoDeactivateBtn');
        const proInfoStatus = document.getElementById('proInfoStatus');

        const showStatus = (el, message, type = 'danger') => {
            if (!el) return;
            el.className = `alert alert-${type} py-2 px-3 mt-3`;
            el.textContent = message;
            el.style.display = 'block';
        };

        const hideStatus = (el) => {
            if (!el) return;
            el.style.display = 'none';
            el.textContent = '';
        };

        const updateProUI = async () => {
            const info = await this.licenseManager.getLicenseInfo();
            if (proPurchaseLink && info.purchaseUrl) {
                proPurchaseLink.href = info.purchaseUrl;
            }
            if (backupAllBtn) {
                backupAllBtn.title = info.isPro
                    ? 'پشتیبان‌گیری از جلسات (اکانت حرفه‌ای فعال)'
                    : 'پشتیبان‌گیری از جلسات (مخصوص اکانت حرفه‌ای)';
            }
        };

        if (proStatusBtn) {
            proStatusBtn.addEventListener('click', async () => {
                const isPro = await this.licenseManager.isPro();
                if (isPro) {
                    const info = await this.licenseManager.getLicenseInfo();
                    const maskedEl = document.getElementById('proInfoMaskedKey');
                    const dateEl = document.getElementById('proInfoDate');
                    if (maskedEl) maskedEl.textContent = info.maskedKey || '';
                    if (dateEl) {
                        try {
                            dateEl.textContent = info.activatedAt ? new Date(info.activatedAt).toLocaleString() : '';
                        } catch (_) {
                            dateEl.textContent = info.activatedAt || '';
                        }
                    }
                    hideStatus(proInfoStatus);
                    this.proInfoModal?.show();
                } else {
                    hideStatus(proModalStatus);
                    if (proModalKeyInput) proModalKeyInput.value = '';
                    this.proModal?.show();
                }
            });
        }

        if (backupAllBtn) {
            backupAllBtn.addEventListener('click', async () => {
                const isPro = await this.licenseManager.isPro();
                if (!isPro) {
                    hideStatus(proModalStatus);
                    if (proModalKeyInput) proModalKeyInput.value = '';
                    this.proModal?.show();
                } else {
                    hideStatus(backupModalStatus);
                    const meetings = await this.autoMeetingLogDB.getAllMeetings();
                    const countEl = document.getElementById('backupMeetingCount');
                    if (countEl) countEl.textContent = meetings.length;
                    this.backupModal?.show();
                }
            });
        }

        if (proModalActivateBtn && proModalKeyInput) {
            proModalActivateBtn.addEventListener('click', async () => {
                const key = proModalKeyInput.value.trim();
                if (!key) {
                    showStatus(proModalStatus, 'لطفاً کد فعال‌سازی را وارد کنید.', 'danger');
                    return;
                }
                proModalActivateBtn.disabled = true;
                proModalActivateBtn.innerHTML = '<span class="spinner-border spinner-border-sm ms-2" role="status"></span><span>در حال بررسی…</span>';
                try {
                    const result = await this.licenseManager.activate(key);
                    if (result.success) {
                        showStatus(proModalStatus, 'اکانت حرفه‌ای با موفقیت فعال شد! 🎉', 'success');
                        await updateProUI();
                        setTimeout(async () => {
                            this.proModal?.hide();
                            const meetings = await this.autoMeetingLogDB.getAllMeetings();
                            const countEl = document.getElementById('backupMeetingCount');
                            if (countEl) countEl.textContent = meetings.length;
                            this.backupModal?.show();
                        }, 1000);
                    } else {
                        showStatus(proModalStatus, 'کد فعال‌سازی نامعتبر است. لطفاً کد را با دقت بررسی و مجدداً امتحان کنید.', 'danger');
                    }
                } catch (error) {
                    showStatus(proModalStatus, 'خطا در فعال‌سازی: ' + error.message, 'danger');
                } finally {
                    proModalActivateBtn.disabled = false;
                    proModalActivateBtn.innerHTML = '<i class="bi bi-patch-check-fill ms-2"></i><span>فعال‌سازی اکانت حرفه‌ای</span>';
                }
            });
        }

        if (doDownloadBackupBtn) {
            doDownloadBackupBtn.addEventListener('click', async () => {
                doDownloadBackupBtn.disabled = true;
                doDownloadBackupBtn.innerHTML = '<span class="spinner-border spinner-border-sm ms-2" role="status"></span><span>در حال تهیه فایل پشتیبان…</span>';
                hideStatus(backupModalStatus);
                try {
                    const backupRes = await this.backupManager.createBackup();
                    if (backupRes.empty) {
                        showStatus(backupModalStatus, 'هیچ جلسه‌ای برای پشتیبان‌گیری وجود ندارد.', 'warning');
                        return;
                    }
                    this.backupManager.downloadBackupFile(backupRes.filename, backupRes.jsonString);
                    showStatus(backupModalStatus, `فایل پشتیبان با موفقیت دانلود شد (${backupRes.count} جلسه).`, 'success');
                } catch (error) {
                    showStatus(backupModalStatus, 'خطا در تهیه نسخه پشتیبان: ' + error.message, 'danger');
                } finally {
                    doDownloadBackupBtn.disabled = false;
                    doDownloadBackupBtn.innerHTML = '<i class="bi bi-cloud-arrow-down-fill ms-2"></i><span>دانلود فایل پشتیبان (JSON)</span>';
                }
            });
        }

        if (doSelectRestoreBtn && restoreFileInput) {
            doSelectRestoreBtn.addEventListener('click', () => {
                restoreFileInput.value = '';
                restoreFileInput.click();
            });

            restoreFileInput.addEventListener('change', async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;

                hideStatus(backupModalStatus);
                doSelectRestoreBtn.disabled = true;
                doSelectRestoreBtn.innerHTML = '<span class="spinner-border spinner-border-sm ms-2" role="status"></span><span>در حال خواندن فایل…</span>';

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const content = e.target?.result;
                        const restoreRes = await this.backupManager.restoreBackup(content);
                        showStatus(backupModalStatus, `تعداد ${restoreRes.restoredCount} جلسه با موفقیت بازیابی شد! 🎉`, 'success');
                        await this.loadMeetingList();
                        const meetings = await this.autoMeetingLogDB.getAllMeetings();
                        const countEl = document.getElementById('backupMeetingCount');
                        if (countEl) countEl.textContent = meetings.length;
                    } catch (error) {
                        let msg = error.message;
                        if (error.code === 'INVALID_JSON') msg = 'فایل انتخاب شده معتبر نیست (فرمت JSON نامعتبر).';
                        if (error.code === 'INVALID_BACKUP_FORMAT' || error.code === 'NO_VALID_MEETINGS') msg = 'ساختار فایل پشتیبان معتبر نیست.';
                        showStatus(backupModalStatus, 'خطا در بازیابی فایل: ' + msg, 'danger');
                    } finally {
                        doSelectRestoreBtn.disabled = false;
                        doSelectRestoreBtn.innerHTML = '<i class="bi bi-folder2-open ms-2"></i><span>انتخاب فایل پشتیبان جهت بازیابی</span>';
                    }
                };
                reader.onerror = () => {
                    showStatus(backupModalStatus, 'خطا در خواندن فایل انتخاب شده.', 'danger');
                    doSelectRestoreBtn.disabled = false;
                    doSelectRestoreBtn.innerHTML = '<i class="bi bi-folder2-open ms-2"></i><span>انتخاب فایل پشتیبان جهت بازیابی</span>';
                };
                reader.readAsText(file);
            });
        }

        if (proInfoOpenBackupBtn) {
            proInfoOpenBackupBtn.addEventListener('click', async () => {
                this.proInfoModal?.hide();
                const meetings = await this.autoMeetingLogDB.getAllMeetings();
                const countEl = document.getElementById('backupMeetingCount');
                if (countEl) countEl.textContent = meetings.length;
                this.backupModal?.show();
            });
        }

        if (proInfoDeactivateBtn) {
            proInfoDeactivateBtn.addEventListener('click', async () => {
                if (!confirm('آیا از غیرفعال‌سازی اکانت حرفه‌ای مطمئن هستید؟')) {
                    return;
                }
                await this.licenseManager.deactivate();
                await updateProUI();
                this.proInfoModal?.hide();
            });
        }

        chrome.runtime?.onMessage?.addListener((req) => {
            if (req.type === 'license.updated') {
                updateProUI();
            }
        });

        updateProUI();
    }

    initializeSidebarResizer() {
        const setup = () => {
            const sidebar = document.querySelector('.meeting-list');
            const resizer = document.getElementById('sidebarResizer');
            if (!sidebar || !resizer) return;

            const STORAGE_KEY = 'mirzabenevis_sidebar_width';
            const DEFAULT_WIDTH = 260;
            const MIN_WIDTH = 180;
            const MAX_WIDTH_CAP = 600;
            const MIN_CONTENT_WIDTH = 320;

            const getMaxWidth = () => {
                const container = sidebar.parentElement || document.querySelector('.container') || document.body;
                const containerWidth = container.clientWidth || window.innerWidth;
                return Math.min(MAX_WIDTH_CAP, Math.max(MIN_WIDTH, containerWidth - MIN_CONTENT_WIDTH));
            };

            const applyWidth = (targetWidth, save = true) => {
                const minW = MIN_WIDTH;
                const maxW = getMaxWidth();
                const clamped = Math.max(minW, Math.min(targetWidth, maxW));

                sidebar.style.width = `${clamped}px`;
                sidebar.style.flexBasis = `${clamped}px`;
                resizer.setAttribute('aria-valuenow', Math.round(clamped).toString());

                if (save) {
                    try {
                        localStorage.setItem(STORAGE_KEY, Math.round(clamped).toString());
                    } catch (e) {}
                }
                return clamped;
            };

            // Restore previously saved width
            try {
                const savedWidth = localStorage.getItem(STORAGE_KEY);
                if (savedWidth) {
                    const parsed = parseInt(savedWidth, 10);
                    if (!isNaN(parsed) && parsed > 0) {
                        applyWidth(parsed, false);
                    }
                }
            } catch (e) {}

            let isDragging = false;
            let startX = 0;
            let startWidth = 0;

            const onMouseMove = (e) => {
                if (!isDragging) return;
                const deltaX = e.clientX - startX;
                applyWidth(startWidth + deltaX, false);
            };

            const onMouseUp = () => {
                if (!isDragging) return;
                isDragging = false;
                document.body.classList.remove('sidebar-resizing');
                resizer.classList.remove('is-dragging');
                window.removeEventListener('mousemove', onMouseMove, { capture: true });
                window.removeEventListener('mouseup', onMouseUp, { capture: true });

                const finalWidth = sidebar.getBoundingClientRect().width;
                try {
                    localStorage.setItem(STORAGE_KEY, Math.round(finalWidth).toString());
                } catch (e) {}
            };

            resizer.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                isDragging = true;
                startX = e.clientX;
                startWidth = sidebar.getBoundingClientRect().width;

                document.body.classList.add('sidebar-resizing');
                resizer.classList.add('is-dragging');

                window.addEventListener('mousemove', onMouseMove, { capture: true });
                window.addEventListener('mouseup', onMouseUp, { capture: true });
            });

            // Touch events support
            const onTouchMove = (e) => {
                if (!isDragging || !e.touches || e.touches.length === 0) return;
                const deltaX = e.touches[0].clientX - startX;
                applyWidth(startWidth + deltaX, false);
            };

            const onTouchEnd = () => {
                if (!isDragging) return;
                isDragging = false;
                document.body.classList.remove('sidebar-resizing');
                resizer.classList.remove('is-dragging');
                window.removeEventListener('touchmove', onTouchMove, { capture: true });
                window.removeEventListener('touchend', onTouchEnd, { capture: true });
                window.removeEventListener('touchcancel', onTouchEnd, { capture: true });

                const finalWidth = sidebar.getBoundingClientRect().width;
                try {
                    localStorage.setItem(STORAGE_KEY, Math.round(finalWidth).toString());
                } catch (e) {}
            };

            resizer.addEventListener('touchstart', (e) => {
                if (!e.touches || e.touches.length === 0) return;
                isDragging = true;
                startX = e.touches[0].clientX;
                startWidth = sidebar.getBoundingClientRect().width;

                document.body.classList.add('sidebar-resizing');
                resizer.classList.add('is-dragging');

                window.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
                window.addEventListener('touchend', onTouchEnd, { capture: true });
                window.addEventListener('touchcancel', onTouchEnd, { capture: true });
            }, { passive: true });

            // Double click to reset to default width
            resizer.addEventListener('dblclick', () => {
                applyWidth(DEFAULT_WIDTH, true);
            });

            // Keyboard accessibility
            resizer.addEventListener('keydown', (e) => {
                const step = 15;
                const currentWidth = sidebar.getBoundingClientRect().width;
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    applyWidth(currentWidth - step, true);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    applyWidth(currentWidth + step, true);
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    applyWidth(MIN_WIDTH, true);
                } else if (e.key === 'End') {
                    e.preventDefault();
                    applyWidth(MAX_WIDTH_CAP, true);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    applyWidth(DEFAULT_WIDTH, true);
                }
            });

            // Adjust on window resize if needed
            window.addEventListener('resize', () => {
                const currentWidth = sidebar.getBoundingClientRect().width;
                const maxW = getMaxWidth();
                if (currentWidth > maxW) {
                    applyWidth(maxW, false);
                }
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setup, { once: true });
        } else {
            setup();
        }
    }

    async handleExportTxt() {
        const meeting = await this.getSelectedMeeting();
        if (!meeting) return;

        const text = this.generateMeetingPlainText(meeting);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        const safeTitle = (this.getDisplayTitle(meeting) || 'meeting')
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
        const read = (area, keys) => new Promise((resolve) => {
            try {
                if (!chrome?.storage?.[area]) {
                    resolve({});
                    return;
                }
                chrome.storage[area].get(keys, (result) => resolve(result || {}));
            } catch (error) {
                console.error('Error reading Gemini settings:', error);
                resolve({});
            }
        });

        const local = await read('local', ['geminiApiKey']);
        if (local.geminiApiKey) return local.geminiApiKey;

        const sync = await read('sync', ['geminiApiKey']);
        if (!sync.geminiApiKey) return null;

        try {
            await new Promise((resolve) => chrome.storage.local.set({ geminiApiKey: sync.geminiApiKey }, resolve));
            await new Promise((resolve) => chrome.storage.sync.remove('geminiApiKey', resolve));
        } catch (error) {
            console.error('Error moving Gemini API key to local storage:', error);
        }
        return sync.geminiApiKey;
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

    static SUMMARY_CHUNK_CHARS = 12000;
    static SUMMARY_MAX_CHARS = 96000;

    splitTranscript(text, maxChars = MeetingUI.SUMMARY_CHUNK_CHARS) {
        const source = text || '';
        if (!source) return [];
        if (source.length <= maxChars) return [source];

        const chunks = [];
        let rest = source;
        while (rest.length > maxChars) {
            let cut = rest.lastIndexOf('\n', maxChars);
            if (cut < maxChars * 0.5) cut = maxChars;
            chunks.push(rest.slice(0, cut));
            rest = rest.slice(cut).trimStart();
        }
        if (rest) chunks.push(rest);
        return chunks;
    }

    async summarizeTranscript(apiKey, text, language) {
        const capped = (text || '').slice(0, MeetingUI.SUMMARY_MAX_CHARS);
        let pieces = this.splitTranscript(capped);
        if (pieces.length === 0) {
            return this.callGeminiSummarize(apiKey, '', language);
        }

        for (let round = 0; pieces.length > 1 && round < 4; round++) {
            const partials = [];
            for (const piece of pieces) {
                partials.push(await this.callGeminiSummarize(apiKey, piece, language));
            }
            pieces = this.splitTranscript(partials.join('\n\n'));
        }

        return this.callGeminiSummarize(
            apiKey,
            pieces.join('\n\n').slice(0, MeetingUI.SUMMARY_CHUNK_CHARS),
            language
        );
    }

    buildSummaryPrompt(text, language) {
        if (language === 'fa') {
            return (
                'شما یک دستیار ارشد و تحلیل‌گر تخصصی برای مستندسازی و استخراج صورت‌جلسه هستید.\n' +
                'متن زیر پیاده‌سازی مکالمات (Transcript) یک جلسه آنلاین است که شامل زمان، نام گویندگان و متن صحبت‌های آنان است.\n\n' +
                'وظیفه شما این است که با دقت این مکالمات را تحلیل کرده و یک صورت‌جلسه ساختاریافته، شفاف، دقیق و کاملاً کاربردی به زبان فارسی تهیه کنید.\n\n' +
                '### دستورالعمل‌ها و اصول خلاصه‌سازی:\n' +
                '۱. **نویززدایی و پالایش**: تعارفات، احوال‌پرسی‌های اولیه، بررسی‌های فنی صدا و تصویر (مثل «صدام هست؟»، «تصویر واضحه؟»)، قطعی‌ها و صحبت‌های نامرتبط با هدف جلسه را کاملاً حذف کنید.\n' +
                '۲. **امانت‌داری و دقت بالا**: خلاصه را صرفاً بر اساس واقعیات و صحبت‌های قطعی مطرح‌شده در جلسه بنویسید. از حدس و گمان یا افزودن موارد تاییدنشده بپرهیزید.\n' +
                '۳. **حفظ جزئیات مهم**: اسامی اشخاص، متریک‌ها و ارقام، نام سامانه‌ها و ابزارها، و مهلت‌های زمانی را دقیق ذکر کنید.\n' +
                '۴. **لحن رسمی و فارسی سلیس**: متنی خوانا، حرفه‌ای و روان تولید کنید و از ترجمه کلمه‌به‌کلمه یا ساختارهای نامتعارف بپرهیزید.\n' +
                '۵. **جلسات کوتاه یا بدون محتوا**: در صورتی که متن جلسه بسیار کوتاه است یا بحث معناداری شکل نگرفته، در یک جمله ذکر کنید که گفتگوی قابل توجهی برای خلاصه‌سازی ثبت نشده است.\n\n' +
                '### ساختار الزامی خروجی (دقیقاً بر اساس قالب مارک‌داون زیر):\n\n' +
                '### 🎯 خلاصه اجرایی\n' +
                '(۱ الی ۳ جمله واضح و کلیدی درباره هدف اصلی تشکیل جلسه و خروجی یا نتیجه نهایی آن)\n\n' +
                '### 💬 مباحث و موضوعات کلیدی\n' +
                '- **[عنوان موضوع/محور]**: توضیح کوتاه پیرامون نکات مطرح‌شده، ایده‌ها، چالش‌ها و نظرات گویندگان.\n\n' +
                '### ✅ تصمیمات اتخاذ شده\n' +
                '- تصمیمات، مصوبات و توافقات نهایی جلسه به صورت موارد مشخص. (اگر تصمیمی نهایی نشد: *تصمیم قطعی اتخاذ نشد.*)\n\n' +
                '### 📌 اقدامات و وظایف بعدی (Action Items)\n' +
                '- **[نام مسئول]**: [شرح وظیفه مشخص] — [مهلت انجام/ددلاین در صورت تعیین شدن]\n' +
                '(اگر وظیفه‌ای تعیین نشد: *اقدام بعدی مشخصی تعیین نشد.*)\n\n' +
                '---\n' +
                'متن مکالمات جلسه:\n' +
                text
            );
        }

        return (
            'You are an executive assistant and expert meeting minutes specialist.\n' +
            'Below is the raw transcript of an online meeting containing timestamps, speaker names, and spoken dialogue.\n\n' +
            'Your objective is to analyze the conversation and produce clear, executive-grade meeting minutes in English.\n\n' +
            '### Core Guidelines:\n' +
            '1. **Filter Out Noise**: Completely ignore pleasantries, greetings, technical/audio checks ("Can you hear me?", "Can you see my screen?"), interruptions, and tangential banter.\n' +
            '2. **Strict Factuality**: Rely only on what is explicitly stated in the transcript. Do not assume, extrapolate, or hallucinate facts or intentions.\n' +
            '3. **Preserve Key Specifics**: Keep technical terms, project/product names, metrics, targets, and dates accurate.\n' +
            '4. **Professional Tone**: Write concise, polished business English.\n' +
            '5. **Sparse Transcripts**: If the transcript is extremely short or lacks substantive content, briefly note that there was no significant discussion to summarize.\n\n' +
            '### Required Output Format (use this exact Markdown structure):\n\n' +
            '### 🎯 Executive Summary\n' +
            '(1-3 concise sentences capturing the primary purpose and key takeaway of the meeting)\n\n' +
            '### 💬 Key Discussion Points\n' +
            '- **[Topic/Theme]**: Core arguments, ideas, context, or challenges discussed.\n\n' +
            '### ✅ Decisions Made\n' +
            '- Clear bullet points of finalized agreements and approvals. (If none were finalized, state: *No definitive decisions made.*)\n\n' +
            '### 📌 Action Items & Next Steps\n' +
            '- **[Owner]**: [Specific task or deliverable] — [Deadline if mentioned]\n' +
            '(If no tasks were assigned, state: *No action items identified.*)\n\n' +
            '---\n' +
            'Meeting Transcript:\n' +
            text
        );
    }

    async callGeminiSummarize(apiKey, text, language) {
        const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        const prompt = this.buildSummaryPrompt(text, language);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.2
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Gemini API error: ${response.status} ${errorText}`);
            error.status = response.status;
            throw error;
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
        let listType = null;

        const flushList = () => {
            if (listType) {
                html += `</${listType}>`;
                listType = null;
            }
        };

        lines.forEach((rawLine) => {
            const line = rawLine.trimEnd();
            if (!line.trim()) {
                flushList();
                return;
            }

            // Divider: --- or ***
            if (/^[-*_]{3,}$/.test(line.trim())) {
                flushList();
                html += '<hr class="summary-divider" />';
                return;
            }

            // Headings: #, ##, ###, ####
            const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
            if (headingMatch) {
                flushList();
                const level = headingMatch[1].length;
                let headingContent = headingMatch[2];
                headingContent = headingContent
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
                const tag = level <= 2 ? 'h4' : 'h5';
                html += `<${tag} class="summary-heading">${headingContent}</${tag}>`;
                return;
            }

            // Bold & Italic inline formatting
            let formatted = line
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

            // Unordered list: - item or * item
            if (/^[-*]\s+/.test(formatted)) {
                if (listType !== 'ul') {
                    flushList();
                    html += '<ul class="summary-list">';
                    listType = 'ul';
                }
                const itemText = formatted.replace(/^[-*]\s+/, '');
                html += `<li>${itemText}</li>`;
            }
            // Ordered list: 1. item or ۱. item
            else if (/^(\d+|[۰-۹]+)[.)]\s+/.test(formatted)) {
                if (listType !== 'ol') {
                    flushList();
                    html += '<ol class="summary-list">';
                    listType = 'ol';
                }
                const itemText = formatted.replace(/^(\d+|[۰-۹]+)[.)]\s+/, '');
                html += `<li>${itemText}</li>`;
            } else {
                flushList();
                html += `<p class="summary-paragraph">${formatted}</p>`;
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

        const languageLabel = language === 'fa' ? 'فارسی' : 'English';
        const titlePrefix = language === 'fa' ? 'خلاصه هوشمند جلسه' : 'Summary';
        const titleEl = summaryContainer.querySelector('.summary-title');
        if (titleEl) {
            titleEl.textContent = `${titlePrefix} (${languageLabel})`;
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
            const summary = await this.summarizeTranscript(apiKey, text, language);
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
            if (this.isQuotaExceededError(error)) {
                console.warn('Gemini quota exceeded (429):', error.message || error);
                alert(MeetingUI.QUOTA_EXCEEDED_MESSAGE);
            } else {
                console.error('Failed to summarize meeting:', error);
                alert('Failed to summarize meeting: ' + (error.message || 'Unknown error'));
            }
        } finally {
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.innerHTML = originalHtml || 'Summarize';
            }
        }
    }

    async callGeminiGenerateTitle(apiKey, text, language) {
        const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        const languageName = language === 'fa' ? 'Persian (Farsi)' : 'English';
        const prompt =
            `You are an expert meeting assistant. Based on the following meeting transcript, generate a short, professional, and descriptive meeting title (3 to 6 words maximum) in ${languageName}. ` +
            `Focus on the primary topic or purpose of the meeting. ` +
            `Return ONLY the title text on a single line, with no quotation marks, no markdown symbols, no bullets, and no trailing period.\n\n` +
            text.slice(0, 6000);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
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
            const error = new Error(`Gemini API error: ${response.status} ${errorText}`);
            error.status = response.status;
            throw error;
        }

        const data = await response.json();
        const candidate = data.candidates && data.candidates[0];
        const parts = candidate && candidate.content && candidate.content.parts;
        let title = parts && parts.length ? parts.map((p) => p.text || '').join('').trim() : '';
        title = title.replace(/^["'#*`\s]+|["'#*`\s.]+$/g, '').trim();
        if (!title) {
            throw new Error('Gemini returned an empty title.');
        }
        return title;
    }

    async handleAutoTitleMeeting(buttonElement) {
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
                '<span class="spin me-1"><i class="bi bi-arrow-repeat"></i></span>Generating...';
        }

        try {
            const convertedMeeting = this.convert(meeting);
            const text = this.generateMeetingPlainText(convertedMeeting);
            if (!text || !convertedMeeting.messages || convertedMeeting.messages.length === 0) {
                alert('This meeting has no transcript/captions to generate a title from.');
                return;
            }

            const title = await this.callGeminiGenerateTitle(apiKey, text, language);
            const updated = await this.autoMeetingLogDB.updateMeetingTitle(
                meeting.meetingStartTime,
                title
            );

            if (updated) {
                meeting.meetingTitle = title;
                const titleText = document.querySelector('.meeting-title-text');
                if (titleText) {
                    titleText.textContent = title;
                }
                this.loadMeetingList();
                safeSendMessage({
                    type: 'cloud.syncMeeting',
                    meetingStartTime: meeting.meetingStartTime
                });
            } else {
                alert('Failed to update meeting title.');
            }
        } catch (error) {
            if (this.isQuotaExceededError(error)) {
                console.warn('Gemini quota exceeded (429):', error.message || error);
                alert(MeetingUI.QUOTA_EXCEEDED_MESSAGE);
            } else {
                console.error('Failed to generate meeting title:', error);
                alert('Failed to generate title: ' + (error.message || 'Unknown error'));
            }
        } finally {
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.innerHTML = originalHtml;
            }
        }
    }

    async trySilentAutoTitle(convertedMeeting, buttonElement = null) {
        // Disabled: Background silent auto-titling is disabled to avoid Gemini quota exhaustion.
        // AI meeting titling is strictly triggered on-demand by the user via the "Auto Title" button.
        return;
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

    getMeetingParticipants(meeting) {
        if (!meeting) return [];

        if (Array.isArray(meeting.participants) && meeting.participants.length > 0) {
            return meeting.participants.filter(p => p && (p.name || p.imageUrl));
        }

        if (Array.isArray(meeting.captions) && meeting.captions.length > 0) {
            const list = [];
            meeting.captions.forEach(c => {
                const name = c?.speaker?.name;
                const imageUrl = c?.speaker?.imageUrl || '';
                if (name && !list.some(p => p.name === name)) {
                    list.push({ name, imageUrl });
                }
            });
            if (list.length > 0) return list;
        }

        return [];
    }

    getColorForName(name) {
        const colors = [
            '#2563eb', // blue
            '#7c3aed', // purple
            '#059669', // green
            '#db2777', // pink
            '#d97706', // amber
            '#0891b2', // cyan
            '#4f46e5', // indigo
            '#dc2626', // red
            '#0d9488', // teal
            '#9333ea', // violet
        ];
        if (!name) return colors[0];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    }

    getInitials(name) {
        if (!name) return '?';
        const trimmed = name.trim();
        if (!trimmed) return '?';
        return trimmed.charAt(0).toUpperCase();
    }

    createAvatarFallback(name) {
        const fallback = document.createElement('div');
        fallback.className = 'meeting-avatar-initial';
        fallback.style.backgroundColor = this.getColorForName(name);
        fallback.textContent = this.getInitials(name);
        if (name) {
            fallback.title = name;
        }
        return fallback;
    }

    createMeetingAvatarsElement(meeting) {
        const participants = this.getMeetingParticipants(meeting);
        const container = document.createElement('div');
        container.className = 'meeting-avatars';

        if (participants.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'meeting-avatar-empty';
            empty.title = 'No participants recorded';
            empty.innerHTML = '<i class="bi bi-camera-video"></i>';
            container.appendChild(empty);
            return container;
        }

        const maxDisplay = 3;
        const total = participants.length;
        const displayCount = total > maxDisplay ? 2 : total;

        for (let i = 0; i < displayCount; i++) {
            const p = participants[i];
            const name = p.name || 'Participant';
            if (p.imageUrl && p.imageUrl.trim() !== '') {
                const img = document.createElement('img');
                img.className = 'meeting-avatar-img';
                img.src = p.imageUrl;
                img.alt = name;
                img.title = name;
                img.onerror = () => {
                    const fallback = this.createAvatarFallback(name);
                    img.replaceWith(fallback);
                };
                container.appendChild(img);
            } else {
                const fallback = this.createAvatarFallback(name);
                container.appendChild(fallback);
            }
        }

        if (total > maxDisplay) {
            const more = document.createElement('div');
            more.className = 'meeting-avatar-more';
            const remainingCount = total - displayCount;
            more.textContent = `+${remainingCount}`;
            const remainingNames = participants.slice(displayCount).map(p => p.name || 'Participant').join(', ');
            more.title = remainingNames;
            container.appendChild(more);
        }

        return container;
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
        textContainer.setAttribute("dir", "auto");

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
        contentP.setAttribute("dir", "auto");
        textContainer.appendChild(contentP);

        messageDiv.appendChild(textContainer);

        return messageDiv;
    }

    appendMessageToElement(messageDiv, text) {
        const contentP = document.createElement("p");
        contentP.textContent = text;
        contentP.className = "content-p";
        contentP.setAttribute("dir", "auto");
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
            const displayTitle = this.getDisplayTitle(convertedMeeting);
            const titleContainer = document.createElement("div");
            titleContainer.className = "meeting-title-container";

            const headerEl = document.createElement('h2');
            headerEl.className = 'meeting-title-header';

            const titleText = document.createElement('span');
            titleText.className = 'meeting-title-text';
            titleText.textContent = displayTitle;

            const renameButton = document.createElement('button');
            renameButton.type = 'button';
            renameButton.className = 'btn btn-link btn-sm rename-meeting-btn';
            renameButton.title = 'Rename meeting';
            const renameIcon = document.createElement('i');
            renameIcon.className = 'bi bi-pencil';
            renameButton.appendChild(renameIcon);

            const autoTitleButton = document.createElement('button');
            autoTitleButton.type = 'button';
            autoTitleButton.className = 'btn btn-link btn-sm auto-title-btn';
            autoTitleButton.title = 'Auto-generate title with AI';
            const autoTitleIcon = document.createElement('i');
            autoTitleIcon.className = 'bi bi-stars';
            autoTitleButton.appendChild(autoTitleIcon);

            headerEl.appendChild(titleText);
            headerEl.appendChild(renameButton);
            headerEl.appendChild(autoTitleButton);

            const timeEl = document.createElement('div');
            timeEl.className = 'meeting-start-time';
            timeEl.textContent = new Date(convertedMeeting.meetingStartTime).toLocaleString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                weekday: 'long'
            });

            titleContainer.appendChild(headerEl);
            titleContainer.appendChild(timeEl);
            mainColumn.appendChild(titleContainer);

            if (renameButton) {
                renameButton.addEventListener('click', async () => {
                    const currentTitle = this.getDisplayTitle(convertedMeeting);
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
                            trimmed,
                            convertedMeeting.meetingId
                        );
                        if (updated) {
                            convertedMeeting.meetingTitle = trimmed;
                            titleText.textContent = trimmed;
                            this.loadMeetingList();
                            safeSendMessage({
                                type: 'cloud.syncMeeting',
                                meetingStartTime: convertedMeeting.meetingStartTime
                            });
                        } else {
                            alert('Failed to update meeting name.');
                        }
                    } catch (error) {
                        console.error('Error updating meeting name:', error);
                        alert('Failed to update meeting name.');
                    }
                });
            }

            if (autoTitleButton) {
                autoTitleButton.addEventListener('click', () => {
                    this.handleAutoTitleMeeting(autoTitleButton);
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
            let lastActorIndex = null;
            let lastTimestamp = null;
            let messageDiv = null;
            let currentDate = null;

            messages.sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeA - timeB;
            });

            messages.forEach((message) => {
                const speaker = participants[message.actorIndex] || { name: 'Unknown', imageUrl: '' };
                const text = (message.text || '').trim();
                if (!text) return;
                const timestamp = message.timestamp;
                const msgTime = new Date(timestamp).getTime();

                const messageDate = new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });

                if (currentDate !== messageDate) {
                    const dateDivider = this.createDateDivider(messageDate);
                    mainColumn.appendChild(dateDivider);
                    currentDate = messageDate;
                    lastSpeaker = null;
                    lastActorIndex = null;
                    lastTimestamp = null;
                    messageDiv = null;
                }

                const isSameSpeaker = lastActorIndex !== null
                    ? (lastActorIndex === message.actorIndex)
                    : (lastSpeaker === speaker.name);

                const isWithinTurn =
                    isSameSpeaker &&
                    messageDiv &&
                    lastTimestamp !== null &&
                    !isNaN(msgTime) &&
                    (msgTime - lastTimestamp <= 15000) &&
                    (msgTime - lastTimestamp >= 0);

                if (isWithinTurn) {
                    const textContainer = messageDiv.querySelector(".text-container");
                    const existingPs = textContainer ? textContainer.querySelectorAll(".content-p") : [];
                    const activeP = existingPs.length > 0 ? existingPs[existingPs.length - 1] : null;
                    if (activeP) {
                        const prev = activeP.textContent || '';
                        activeP.textContent = prev ? mergeConsecutiveTexts(prev, text) : text;
                    } else {
                        this.appendMessageToElement(messageDiv, text);
                    }
                } else if (isSameSpeaker && messageDiv && lastTimestamp !== null && !isNaN(msgTime) && (msgTime - lastTimestamp <= 60000) && (msgTime - lastTimestamp >= 0)) {
                    this.appendMessageToElement(messageDiv, text);
                } else {
                    messageDiv = this.createMessageElement(speaker, text, timestamp);
                    mainColumn.appendChild(messageDiv);
                }

                lastSpeaker = speaker.name;
                lastActorIndex = message.actorIndex;
                lastTimestamp = msgTime;
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
        document.getElementById('deleteMeetingTitle').textContent = this.getDisplayTitle(meeting);
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
                
                const time = this.formatMeetingTime(meeting.meetingStartTime);
                const day = this.formatMeetingDay(meeting.meetingStartTime);
                const fullTitle = this.getDisplayTitle(meeting);
                const fullDate = new Date(meeting.meetingStartTime).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });

                if (!existingItem) {
                    // 새 미팅 항목 생성 (RTL: 제목 -> 아바타 -> 날짜 -> 시간 -> 삭제 버튼)
                    const li = document.createElement('div');
                    li.className = 'list-group-item';
                    li.setAttribute('data-starttime', meeting.meetingStartTime);

                    // 1. اول اسم جلسه
                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'meeting-title';
                    titleSpan.title = fullTitle;
                    titleSpan.textContent = fullTitle;
                    li.appendChild(titleSpan);

                    // 2. بعد تصویر
                    const avatarsElement = this.createMeetingAvatarsElement(meeting);
                    li.appendChild(avatarsElement);

                    // 3. بعد تاریخ (فقط چندیم روز)
                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'meeting-date';
                    dateSpan.title = fullDate;
                    dateSpan.textContent = day;
                    li.appendChild(dateSpan);

                    // 4. بعد ساعت (فقط ساعت و دقیقه)
                    const timeSpan = document.createElement('span');
                    timeSpan.className = 'meeting-time';
                    timeSpan.title = time;
                    timeSpan.textContent = time;
                    li.appendChild(timeSpan);

                    // 5. دکمه حذف
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'delete-button';
                    deleteButton.setAttribute('aria-label', 'Delete meeting');
                    deleteButton.innerHTML = '<i class="bi bi-x"></i>';
                    li.appendChild(deleteButton);
                    
                    // 클릭 이벤트 리스너 추가
                    li.addEventListener('click', (event) => {
                        if (!event.target.closest('.delete-button')) {
                            this.selectMeeting(meeting);
                        }
                    });
                    
                    // 삭제 버튼 이벤트 리스너
                    deleteButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.showDeleteConfirmation(meeting);
                    });
                    
                    container.appendChild(li);
                } else {
                    // 기존 항목 내용 업데이트 (RTL 순서 유지)
                    existingItem.innerHTML = '';

                    const titleSpan = document.createElement('span');
                    titleSpan.className = 'meeting-title';
                    titleSpan.title = fullTitle;
                    titleSpan.textContent = fullTitle;
                    existingItem.appendChild(titleSpan);

                    const avatarsElement = this.createMeetingAvatarsElement(meeting);
                    existingItem.appendChild(avatarsElement);

                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'meeting-date';
                    dateSpan.title = fullDate;
                    dateSpan.textContent = day;
                    existingItem.appendChild(dateSpan);

                    const timeSpan = document.createElement('span');
                    timeSpan.className = 'meeting-time';
                    timeSpan.title = time;
                    timeSpan.textContent = time;
                    existingItem.appendChild(timeSpan);

                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'delete-button';
                    deleteButton.setAttribute('aria-label', 'Delete meeting');
                    deleteButton.innerHTML = '<i class="bi bi-x"></i>';
                    deleteButton.addEventListener('click', (event) => {
                        event.stopPropagation();
                        this.showDeleteConfirmation(meeting);
                    });
                    existingItem.appendChild(deleteButton);
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