import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ---------- setup ----------

const isConfigured =
  typeof SUPABASE_URL === 'string' &&
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  typeof SUPABASE_ANON_KEY === 'string' &&
  !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE');

const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const TRANSLATIONS = {
  en: {
    authSubtitle: 'Your Google Meet transcripts, everywhere.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordHint: '••••••••',
    login: 'Log in',
    signup: 'Sign up',
    logout: 'Log out',
    refreshTitle: 'Refresh',
    webBadge: 'Web',
    searchPlaceholder: 'Search meetings…',
    emptyState: 'Select a meeting to view its transcript.',
    copy: 'Copy',
    exportTxt: 'Export TXT',
    delete: 'Delete',
    deleteMeeting: 'Delete meeting',
    deleteWarning: 'This deletes the meeting from the cloud and cannot be undone.',
    cancel: 'Cancel',
    notesLabel: 'Notes',
    notesPlaceholder: 'Write your notes here…',
    saveNotes: 'Save notes',
    noMeetings: 'No synced meetings yet. Record a meeting in the extension and it will appear here.',
    loading: 'Loading…',
    notConfigured: 'Supabase is not configured. Set your URL and anon key in web/config.js.',
    saved: 'Saved',
    titleSaved: 'Title updated',
    notesSaved: 'Notes saved',
    untitled: '(Untitled)',
    participantsLabel: 'participants',
    messagesLabel: 'messages',
    copied: 'Copied to clipboard',
    copyFailed: 'Copy failed',
    exported: 'Exported',
    deleted: 'Meeting deleted',
    signupNeedsConfirmation: 'Account created! Check your inbox to confirm your email, then log in.',
    unknownSpeaker: 'Unknown',
    selectFirst: 'Select a meeting first.',
  },
  fa: {
    authSubtitle: 'متن جلسات گوگل‌میت شما، همه‌جا در دسترس.',
    emailLabel: 'ایمیل',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'رمز عبور',
    passwordHint: '••••••••',
    login: 'ورود',
    signup: 'ثبت‌نام',
    logout: 'خروج',
    refreshTitle: 'به‌روزرسانی',
    webBadge: 'وب',
    searchPlaceholder: 'جستجو در جلسات…',
    emptyState: 'برای مشاهده متن جلسه، یک مورد را انتخاب کنید.',
    copy: 'کپی',
    exportTxt: 'خروجی TXT',
    delete: 'حذف',
    deleteMeeting: 'حذف جلسه',
    deleteWarning: 'این عمل جلسه را از حذف می‌کند و قابل بازگشت نیست.',
    cancel: 'انصراف',
    notesLabel: 'یادداشت‌ها',
    notesPlaceholder: 'یادداشت‌های خود را اینجا بنویسید…',
    saveNotes: 'ذخیره یادداشت',
    noMeetings: 'هنوز جلسه‌ای سینک نشده است. جلسه را با اکستنشن ضبط کنید تا اینجا نمایش داده شود.',
    loading: 'در حال بارگذاری…',
    notConfigured: 'سوپابیس تنظیم نشده است. آدرس و کلید خود را در web/config.js وارد کنید.',
    saved: 'ذخیره شد',
    titleSaved: 'عنوان به‌روزرسانی شد',
    notesSaved: 'یادداشت ذخیره شد',
    untitled: '(بدون عنوان)',
    participantsLabel: 'شرکت‌کننده',
    messagesLabel: 'پیام',
    copied: 'در کلیپ‌بورد کپی شد',
    copyFailed: 'کپی ناموفق بود',
    exported: 'خروجی گرفته شد',
    deleted: 'جلسه حذف شد',
    signupNeedsConfirmation: 'حساب ساخته شد! ایمیل خود را برای تأیید بررسی و سپس وارد شوید.',
    unknownSpeaker: 'ناشناس',
    selectFirst: 'ابتدا یک جلسه انتخاب کنید.',
  },
};

let lang = localStorage.getItem('mbWebLang') === 'fa' ? 'fa' : 'en';
const t = (key) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;

// ---------- elements ----------

const $ = (id) => document.getElementById(id);
const authView = $('auth-view');
const appView = $('app-view');
const authEmail = $('auth-email');
const authPassword = $('auth-password');
const authStatus = $('auth-status');
const loginBtn = $('login-btn');
const signupBtn = $('signup-btn');
const logoutBtn = $('logout-btn');
const refreshBtn = $('refresh-btn');
const userEmailEl = $('user-email');
const searchInput = $('search-input');
const meetingsList = $('meetings-list');
const emptyState = $('empty-state');
const meetingDetail = $('meeting-detail');
const detailTitle = $('detail-title');
const detailMeta = $('detail-meta');
const transcriptEl = $('transcript');
const notesEditor = $('notes-editor');
const notesStatus = $('notes-status');
const titleSaved = $('title-saved');
const saveNotesBtn = $('save-notes-btn');
const copyBtn = $('copy-btn');
const exportBtn = $('export-btn');
const deleteBtn = $('delete-btn');
const deleteDialog = $('delete-dialog');
const deleteDialogText = $('delete-dialog-text');
const deleteConfirm = $('delete-confirm');
const deleteCancel = $('delete-cancel');

// ---------- state ----------

let meetings = [];
let selectedStartTime = null;
let currentUserId = null;

function rowToMeeting(row) {
  return {
    meetingStartTime: row.meeting_start_time,
    meetingId: row.meeting_id,
    meetingTitle: row.meeting_title,
    participants: Array.isArray(row.participants) ? row.participants : [],
    messages: Array.isArray(row.messages) ? row.messages : [],
    notesText: row.notes_text || '',
    summaryText: row.summary_text,
    lastUpdated: row.last_updated,
  };
}

function getSelectedMeeting() {
  return meetings.find((m) => m.meetingStartTime === selectedStartTime) || null;
}

// ---------- i18n / rendering helpers ----------

function applyLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  renderList();
  const meeting = getSelectedMeeting();
  if (meeting) {
    renderDetail(meeting);
  }
}

document.querySelectorAll('[data-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang;
    localStorage.setItem('mbWebLang', lang);
    applyLanguage();
  });
});

function showStatus(el, message, type = '', timeout = 2500) {
  if (!el || !message) return;
  el.textContent = message;
  el.className = `save-indicator visible${type ? ` ${type}` : ''}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.className = 'save-indicator';
  }, timeout);
}

// ---------- auth ----------

function setAuthButtonsDisabled(disabled) {
  loginBtn.disabled = disabled;
  signupBtn.disabled = disabled;
}

function setAuthStatus(message, type = '') {
  authStatus.textContent = message;
  authStatus.className = `status ${type}`;
}

loginBtn.addEventListener('click', async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;
  setAuthButtonsDisabled(true);
  setAuthStatus(t('loading'));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setAuthButtonsDisabled(false);
  if (error) {
    setAuthStatus(error.message, 'error');
  }
});

signupBtn.addEventListener('click', async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;
  setAuthButtonsDisabled(true);
  setAuthStatus(t('loading'));
  const { data, error } = await supabase.auth.signUp({ email, password });
  setAuthButtonsDisabled(false);
  if (error) {
    setAuthStatus(error.message, 'error');
  } else if (!data.session) {
    setAuthStatus(t('signupNeedsConfirmation'), 'success');
  }
});

logoutBtn.addEventListener('click', () => supabase.auth.signOut());

async function enterApp(user) {
  currentUserId = user?.id || null;
  userEmailEl.textContent = user?.email || '';
  authView.hidden = true;
  appView.hidden = false;
  await loadMeetings();
}

async function leaveApp() {
  meetings = [];
  selectedStartTime = null;
  currentUserId = null;
  meetingsList.innerHTML = '';
  meetingDetail.hidden = true;
  emptyState.hidden = false;
  appView.hidden = true;
  authView.hidden = false;
}

// ---------- data ----------

async function loadMeetings() {
  meetingsList.innerHTML = `<div class="list-status">${t('loading')}</div>`;
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .order('meeting_start_time', { ascending: false });

  if (error) {
    meetingsList.innerHTML = `<div class="list-status">${error.message}</div>`;
    return;
  }

  meetings = (data || []).map(rowToMeeting);
  renderList();

  if (selectedStartTime && !getSelectedMeeting()) {
    selectedStartTime = null;
    meetingDetail.hidden = true;
    emptyState.hidden = false;
  }
}

refreshBtn.addEventListener('click', loadMeetings);

// ---------- meetings list ----------

function matchesSearch(meeting, query) {
  const haystacks = [meeting.meetingTitle || '', meeting.meetingId || ''];
  for (const message of meeting.messages.slice(0, 200)) {
    haystacks.push(message.text || '');
  }
  return haystacks.join('\n').toLowerCase().includes(query);
}

function renderList() {
  if (!meetingsList) return;

  const query = (searchInput.value || '').trim().toLowerCase();
  const filtered = query ? meetings.filter((m) => matchesSearch(m, query)) : meetings;

  if (meetings.length === 0) {
    meetingsList.innerHTML = `<div class="list-status">${t('noMeetings')}</div>`;
    return;
  }
  if (filtered.length === 0) {
    meetingsList.innerHTML = `<div class="list-status">${t('emptyState')}</div>`;
    return;
  }

  meetingsList.innerHTML = '';
function getDisplayTitle(meeting) {
  if (meeting?.meetingTitle && meeting.meetingTitle !== 'Meet' && meeting.meetingTitle !== 'Google Meet') {
    return meeting.meetingTitle;
  }
  return meeting?.meetingId || t('untitled');
}

  filtered.forEach((meeting) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'meeting-item' + (meeting.meetingStartTime === selectedStartTime ? ' active' : '');

    const title = document.createElement('p');
    title.className = 'meeting-item-title';
    title.textContent = getDisplayTitle(meeting);

    const meta = document.createElement('div');
    meta.className = 'meeting-item-meta';

    const time = document.createElement('span');
    time.textContent = formatDate(meeting.meetingStartTime);

    const count = document.createElement('span');
    count.textContent = `${meeting.messages.length} ${t('messagesLabel')}`;

    meta.append(time, count);
    item.append(title, meta);
    item.dataset.startTime = meeting.meetingStartTime;
    item.addEventListener('click', () => selectMeeting(meeting.meetingStartTime));
    meetingsList.appendChild(item);
  });
}

searchInput.addEventListener('input', renderList);

function formatDate(isoString) {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatTime(isoString) {
  try {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

// ---------- detail view ----------

function selectMeeting(startTime) {
  selectedStartTime = startTime;
  const meeting = getSelectedMeeting();
  if (!meeting) return;

  document.querySelectorAll('.meeting-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.startTime === startTime);
  });

  renderDetail(meeting);
}

function renderDetail(meeting) {
  emptyState.hidden = true;
  meetingDetail.hidden = false;

  detailTitle.textContent = (meeting.meetingTitle && meeting.meetingTitle !== 'Meet' && meeting.meetingTitle !== 'Google Meet')
    ? meeting.meetingTitle
    : (meeting.meetingId || '');
  titleSaved.className = 'save-indicator';

  detailMeta.innerHTML = '';
  const start = document.createElement('span');
  start.textContent = new Date(meeting.meetingStartTime).toLocaleString();
  const participants = document.createElement('span');
  participants.textContent = `${meeting.participants.length} ${t('participantsLabel')}`;
  const messages = document.createElement('span');
  messages.textContent = `${meeting.messages.length} ${t('messagesLabel')}`;
  detailMeta.append(start, participants, messages);

  renderTranscript(meeting);
  notesEditor.value = meeting.notesText || '';
}

function renderTranscript(meeting) {
  transcriptEl.innerHTML = '';

  const sorted = [...meeting.messages].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'list-status';
    empty.textContent = t('emptyState');
    transcriptEl.appendChild(empty);
    return;
  }

  sorted.forEach((msg) => {
    const speaker = meeting.participants[msg.actorIndex];
    const wrap = document.createElement('div');
    wrap.className = 'message' + (msg.type !== 'caption' ? ' system' : '');

    const head = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'message-speaker';
    name.textContent = speaker?.name || t('unknownSpeaker');
    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = formatTime(msg.timestamp);
    head.append(name, time);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = msg.text || '';

    wrap.append(head, bubble);
    transcriptEl.appendChild(wrap);
  });
}

// ---------- edit actions ----------

async function persistUpdate(values) {
  const meeting = getSelectedMeeting();
  if (!meeting || !currentUserId) return false;

  const { error } = await supabase
    .from('meetings')
    .update({ ...values, last_updated: new Date().toISOString() })
    .eq('user_id', currentUserId)
    .eq('meeting_start_time', meeting.meetingStartTime);

  if (error) {
    console.error('Update failed:', error.message);
    return false;
  }
  Object.assign(meeting, values);
  return true;
}

detailTitle.addEventListener('blur', async () => {
  const meeting = getSelectedMeeting();
  if (!meeting) return;
  const newTitle = detailTitle.textContent.replace(/\u00a0/g, ' ').trim();
  if (newTitle === (meeting.meetingTitle || '')) return;
  const ok = await persistUpdate({ meeting_title: newTitle || null });
  showStatus(titleSaved, ok ? t('titleSaved') : 'Error', ok ? '' : 'error');
  renderList();
});

detailTitle.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    detailTitle.blur();
  }
});

saveNotesBtn.addEventListener('click', async () => {
  const meeting = getSelectedMeeting();
  if (!meeting) {
    showStatus(notesStatus, t('selectFirst'), 'error');
    return;
  }
  const ok = await persistUpdate({
    notes_text: notesEditor.value,
    notes_updated_at: new Date().toISOString(),
  });
  showStatus(notesStatus, ok ? t('notesSaved') : 'Error', ok ? '' : 'error');
});

// ---------- export / copy ----------

function generatePlainText(meeting) {
  const headerLines = [
    `Title: ${getDisplayTitle(meeting)}`,
    `Start time: ${new Date(meeting.meetingStartTime).toLocaleString()}`,
    '',
  ];

  const sorted = [...meeting.messages].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  const lines = sorted.map((msg) => {
    const speakerName = meeting.participants[msg.actorIndex]?.name || t('unknownSpeaker');
    return `[${formatTime(msg.timestamp)}] ${speakerName}: ${msg.text}`;
  });

  if ((meeting.notesText || '').trim()) {
    lines.push('', '--- Notes ---', meeting.notesText.trim());
  }

  return [...headerLines, ...lines].join('\n');
}

function requireSelection() {
  const meeting = getSelectedMeeting();
  if (!meeting) {
    alert(t('selectFirst'));
  }
  return meeting;
}

copyBtn.addEventListener('click', async () => {
  const meeting = requireSelection();
  if (!meeting) return;
  try {
    await navigator.clipboard.writeText(generatePlainText(meeting));
    showStatus(titleSaved, t('copied'), '');
  } catch {
    showStatus(titleSaved, t('copyFailed'), 'error');
  }
});

exportBtn.addEventListener('click', () => {
  const meeting = requireSelection();
  if (!meeting) return;
  const blob = new Blob([generatePlainText(meeting)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeTitle = (getDisplayTitle(meeting) || 'meeting').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 60);
  link.href = url;
  link.download = `${safeTitle}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  showStatus(titleSaved, t('exported'), '');
});

// ---------- delete ----------

deleteBtn.addEventListener('click', () => {
  const meeting = getSelectedMeeting();
  if (!meeting) {
    alert(t('selectFirst'));
    return;
  }
  deleteDialogText.textContent = `${getDisplayTitle(meeting)} — ${formatDate(meeting.meetingStartTime)}`;
  deleteDialog.showModal();
});

deleteCancel.addEventListener('click', () => deleteDialog.close());

deleteConfirm.addEventListener('click', async () => {
  const meeting = getSelectedMeeting();
  if (!meeting || !currentUserId) return;
  deleteConfirm.disabled = true;
  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('user_id', currentUserId)
    .eq('meeting_start_time', meeting.meetingStartTime);
  deleteConfirm.disabled = false;
  deleteDialog.close();

  if (error) {
    console.error('Delete failed:', error.message);
    return;
  }

  meetings = meetings.filter((m) => m.meetingStartTime !== meeting.meetingStartTime);
  selectedStartTime = null;
  meetingDetail.hidden = true;
  emptyState.hidden = false;
  renderList();
});

// ---------- boot ----------

applyLanguage();

if (!isConfigured) {
  authView.hidden = false;
  setAuthStatus(t('notConfigured'), 'error');
} else {
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      enterApp(data.session.user);
    } else {
      authView.hidden = false;
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      enterApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      leaveApp();
    }
  });
}
