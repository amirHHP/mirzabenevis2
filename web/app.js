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

// ---------- transcript deduplication helpers ----------

function normalizeForComparison(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/[\u200c\u200b\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordsMatch(w1, w2) {
  if (w1 === w2) return true;
  if (!w1 || !w2) return false;

  // Numbers must match exactly to prevent false stem matches (e.g. 12 vs 123)
  const hasDigits = /[\d\u0660-\u0669\u06F0-\u06F9]/.test(w1) || /[\d\u0660-\u0669\u06F0-\u06F9]/.test(w2);
  if (hasDigits) return w1 === w2;

  const minLen = Math.min(w1.length, w2.length);
  const maxLen = Math.max(w1.length, w2.length);
  if (minLen < 2) return false;

  let common = 0;
  while (common < minLen && w1[common] === w2[common]) {
    common++;
  }

  if (minLen === 2) {
    // For 2-letter words, match if both letters match and maxLen <= 3 (e.g. رب vs ربع, من vs منو)
    return common === 2 && maxLen <= 3;
  }

  // Pure prefix: only a one-character colloquial tail on a short word (خوب / خوبه).
  if (common === minLen && maxLen > minLen) {
    return maxLen - minLen === 1 && minLen <= 3;
  }

  if (Math.abs(w1.length - w2.length) > 3) return false;

  // Must share a significant common stem covering most of the shorter word and good ratio of maxLen
  return common >= 3 && common >= minLen - 2 && (common / maxLen) >= 0.55;
}

/**
 * True when `shorter` is an unfinished streaming fragment of `longer`
 * (ندا -> نداشتیم). Not used for ordinary word equality.
 */
function isTruncatedStem(shorter, longer) {
  if (!shorter || !longer || shorter === longer) return false;
  if (shorter.length < 3 || longer.length - shorter.length < 2) return false;
  const hasDigits = /[\d\u0660-\u0669\u06F0-\u06F9]/.test(shorter) || /[\d\u0660-\u0669\u06F0-\u06F9]/.test(longer);
  if (hasDigits) return false;
  if (!/[^\x00-\x7F]/.test(shorter) && !/[^\x00-\x7F]/.test(longer)) return false;
  return longer.startsWith(shorter);
}

function coversInOrder(shorterWords, longerWords) {
  if (!shorterWords.length || longerWords.length < shorterWords.length) return false;
  for (let i = 0; i < shorterWords.length; i++) {
    const a = shorterWords[i];
    const b = longerWords[i];
    if (a === b || wordsMatch(a, b) || isTruncatedStem(a, b)) continue;
    return false;
  }
  return true;
}

function lcsWordMatchCount(wordsA, wordsB) {
  const m = wordsA.length;
  const n = wordsB.length;
  if (m === 0 || n === 0) return 0;

  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (wordsMatch(wordsA[i], wordsB[j])) {
        dp[i + 1][j + 1] = Math.max(dp[i][j] + 1, dp[i + 1][j], dp[i][j + 1]);
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  return dp[m][n];
}

function classifyTextRelationship(olderText, newerText) {
  const normOlder = normalizeForComparison(olderText);
  const normNewer = normalizeForComparison(newerText);
  if (!normOlder || !normNewer) return 'none';
  if (normOlder === normNewer) return 'duplicate';
  if (normNewer.startsWith(normOlder + ' ')) return 'extension';
  if (normOlder.startsWith(normNewer + ' ')) return 'subsumed';

  const olderWords = normOlder.split(' ').filter(Boolean);
  const newerWords = normNewer.split(' ').filter(Boolean);
  if (olderWords.length === 0 || newerWords.length === 0) return 'none';

  if (newerWords.length > olderWords.length && coversInOrder(olderWords, newerWords)) {
    return 'extension';
  }
  if (olderWords.length > newerWords.length && coversInOrder(newerWords, olderWords)) {
    return 'subsumed';
  }

  if (newerWords.length === olderWords.length) {
    const K = olderWords.length;
    const matchCount = lcsWordMatchCount(olderWords, newerWords);
    if (matchCount === K) return 'extension';
    return 'none';
  }

  if (newerWords.length > olderWords.length) {
    const K = olderWords.length;
    const matchCount = lcsWordMatchCount(olderWords, newerWords);

    let commonPrefix = 0;
    while (commonPrefix < olderWords.length && commonPrefix < newerWords.length) {
      const w1 = olderWords[commonPrefix];
      const w2 = newerWords[commonPrefix];
      if (w1 === w2 || wordsMatch(w1, w2) || isTruncatedStem(w1, w2) || isTruncatedStem(w2, w1)) {
        commonPrefix++;
      } else {
        break;
      }
    }

    if (commonPrefix >= 3 && (commonPrefix / K >= 0.5 || commonPrefix >= 5)) {
      return 'extension';
    }

    const threshold = K <= 4 ? K : Math.ceil(K * 0.7);
    if (matchCount >= threshold && (matchCount / K) >= 0.7) return 'extension';
  } else {
    const K = newerWords.length;
    const matchCount = lcsWordMatchCount(olderWords, newerWords);

    let commonPrefix = 0;
    while (commonPrefix < newerWords.length && commonPrefix < olderWords.length) {
      const w1 = olderWords[commonPrefix];
      const w2 = newerWords[commonPrefix];
      if (w1 === w2 || wordsMatch(w1, w2) || isTruncatedStem(w1, w2) || isTruncatedStem(w2, w1)) {
        commonPrefix++;
      } else {
        break;
      }
    }

    if (commonPrefix >= 3 && (commonPrefix / K >= 0.5 || commonPrefix >= 5)) {
      return 'subsumed';
    }

    const threshold = K <= 4 ? K : Math.ceil(K * 0.7);
    if (matchCount >= threshold && (matchCount / K) >= 0.7) return 'subsumed';
  }

  return 'none';
}

const STANDALONE_REACTIONS = new Set([
  'بله', 'آره', 'سلام', 'درود', 'خداحافظ', 'نه', 'مرسی', 'ممنون', 'متشکرم', 'باشه', 'اوکی', 'چشم', 'حتما', 'حتماً', 'درسته', 'دقیقا', 'دقیقاً', 'خوبه', 'ممنونم'
]);

function mergeConsecutiveTexts(prev, next) {
  const p = (prev || '').trim();
  const n = (next || '').trim();
  if (!p) return n;
  if (!n) return p;

  const normP = normalizeForComparison(p);
  const normN = normalizeForComparison(n);
  if (!normN) return p;
  if (!normP) return n;
  if (normP === normN) return n.length >= p.length ? n : p;

  const rel = classifyTextRelationship(p, n);
  if (rel === 'extension') return n;
  if (rel === 'subsumed') return p;
  if (rel === 'duplicate') return n.length >= p.length ? n : p;

  // Full prefix or suffix containment at word boundaries
  if (normN.startsWith(normP + ' ')) {
    return n;
  }
  if (normP.startsWith(normN + ' ') || normP.endsWith(' ' + normN)) {
    return p;
  }

  const pWords = p.split(/\s+/);
  const nWords = n.split(/\s+/);
  const maxOverlapWords = Math.min(pWords.length, nWords.length);
  let overlapCount = 0;

  for (let count = maxOverlapWords; count >= 1; count--) {
    const pSuffix = pWords.slice(pWords.length - count);
    const nPrefix = nWords.slice(0, count);

    let allMatch = true;
    for (let i = 0; i < count; i++) {
      const wP = normalizeForComparison(pSuffix[i]);
      const wN = normalizeForComparison(nPrefix[i]);
      const hasDigits = /[\d\u0660-\u0669\u06F0-\u06F9]/.test(wP) || /[\d\u0660-\u0669\u06F0-\u06F9]/.test(wN);
      if (count === 1) {
        const isCompletedPrefix = !hasDigits && (isTruncatedStem(wP, wN) || wordsMatch(wP, wN));
        if (wP !== wN && !isCompletedPrefix) {
          allMatch = false;
          break;
        }
      } else if (wP !== wN && !wordsMatch(wP, wN) && (hasDigits || !isTruncatedStem(wP, wN))) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      overlapCount = count;
      break;
    }
  }

  if (overlapCount > 0) {
    const pPrefixWords = pWords.slice(0, pWords.length - overlapCount);
    const pOverlapWords = pWords.slice(pWords.length - overlapCount);
    const nOverlapWords = nWords.slice(0, overlapCount);
    const nRemainingWords = nWords.slice(overlapCount);

    const mergedOverlapWords = [];
    for (let i = 0; i < overlapCount; i++) {
      const pW = pOverlapWords[i];
      const nW = nOverlapWords[i];
      const normPW = normalizeForComparison(pW);
      const normNW = normalizeForComparison(nW);
      // If nW is equal or longer, prefer nW to replace truncated partial words with full words
      if (normNW.length >= normPW.length) {
        mergedOverlapWords.push(nW);
      } else {
        mergedOverlapWords.push(pW);
      }
    }

    const allWords = [...pPrefixWords, ...mergedOverlapWords, ...nRemainingWords];
    return allWords.join(' ');
  }

  return `${p} ${n}`;
}

function mergeCaptionMessages(existingMessages, incomingMessages, replacePrefix = false, windowMs = 30000) {
  let messages = existingMessages ? [...existingMessages] : [];

  incomingMessages.forEach((incoming) => {
    const newText = (incoming.text || '').trim();
    if (!newText) return;

    if (!replacePrefix) {
      const last = messages[messages.length - 1];
      if (
        last &&
        last.actorIndex === incoming.actorIndex &&
        last.type === 'caption' &&
        normalizeForComparison(last.text) === normalizeForComparison(newText)
      ) {
        return;
      }
      messages.push(incoming);
      return;
    }

    const incomingTime = incoming.timestamp ? new Date(incoming.timestamp).getTime() : NaN;
    let isSubsumedOrDup = false;
    const indicesToRemove = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const prev = messages[i];
      if (prev.actorIndex !== incoming.actorIndex || prev.type !== 'caption') continue;

      const prevTime = prev.timestamp ? new Date(prev.timestamp).getTime() : NaN;
      const timeDiff = (!isNaN(incomingTime) && !isNaN(prevTime))
        ? (incomingTime - prevTime)
        : 0;

      if (!isNaN(incomingTime) && !isNaN(prevTime)) {
        if (timeDiff > windowMs) break;
      } else if (messages.length - 1 - i > 25) {
        break;
      }

      const isImmediatelyPreceding = (i === messages.length - 1);
      const rel = classifyTextRelationship(prev.text, newText);

      if (rel === 'extension') {
        if (isImmediatelyPreceding) {
          const normPrev = normalizeForComparison(prev.text);
          const isShortReaction = STANDALONE_REACTIONS.has(normPrev) || normPrev.split(' ').filter(Boolean).length <= 2;
          if (isShortReaction && timeDiff > 12000) break;
          if (timeDiff > windowMs) break;
        } else {
          const normPrev = normalizeForComparison(prev.text);
          const isShortReaction = STANDALONE_REACTIONS.has(normPrev);
          if (isShortReaction || timeDiff > 5000) {
            continue;
          }
        }
        indicesToRemove.push(i);
      } else if (isImmediatelyPreceding && (rel === 'duplicate' || rel === 'subsumed')) {
        if (timeDiff <= windowMs) {
          isSubsumedOrDup = true;
          break;
        }
      }
    }

    if (isSubsumedOrDup) return;

    if (indicesToRemove.length > 0) {
      const removeSet = new Set(indicesToRemove);
      messages = messages.filter((_, idx) => !removeSet.has(idx));
    }

    messages.push(incoming);
  });

  return messages;
}

function deduplicateMeetingMessages(messages, windowMs = 30000) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const sorted = [...messages].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeA - timeB;
  });

  let result = [];
  sorted.forEach((msg) => {
    if (msg.type && msg.type !== 'caption') {
      result.push({ ...msg });
      return;
    }
    result = mergeCaptionMessages(result, [{ ...msg }], true, windowMs);
  });

  return result;
}

function rowToMeeting(row) {
  const rawMessages = Array.isArray(row.messages) ? row.messages : [];
  return {
    meetingStartTime: row.meeting_start_time,
    meetingId: row.meeting_id,
    meetingTitle: row.meeting_title,
    aiTitle: row.ai_title || row.aiTitle,
    generatedTitle: row.generated_title || row.generatedTitle,
    participants: Array.isArray(row.participants) ? row.participants : [],
    messages: deduplicateMeetingMessages(rawMessages),
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
    meetingsList.innerHTML = '';
    const status = document.createElement('div');
    status.className = 'list-status';
    status.textContent = error.message;
    meetingsList.appendChild(status);
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

// ---------- title helpers ----------

const LOBBY_TITLE_PHRASES = [
  'ready to join',
  'getting ready',
  'joining',
  'loading',
  'asking to join',
  'ask to join',
  'checking your audio and video',
  'check your audio and video',
  'waiting for approval',
  'waiting to be admitted',
  'waiting for the host',
  'someone will let you in soon',
  'preparing',
  'you can\'t join this call',
  'this call has ended',
  'return to home screen',
  'meeting has ended',
  'your meeting is ready',
  'join now',
  'join this video meeting',
  'join video meeting',
  'join this video call',
  'join video call',
  'join this meeting',
  'join this call',
  'join meeting',
  'join a meeting',
  'join call',
  'join with google meet',
  'join with meet',
  'join audio',
  'آماده پیوستن',
  'آماده‌اید بپیوندید',
  'آماده ملحق شدن',
  'در حال پیوستن',
  'در حال بارگذاری',
  'در حال آماده‌سازی',
  'درخواست برای پیوستن',
  'درخواست پیوستن',
  'درخواست ملحق شدن',
  'درخواست ورود',
  'در انتظار تأیید',
  'در انتظار تایید',
  'در انتظار ورود',
  'منتظر بمانید',
  'منتظر تأیید بمانید',
  'منتظر تایید بمانید',
  'بررسی صدا و تصویر',
  'بررسی وضعیت صوتی و تصویری',
  'جلسه شما آماده است',
  'جلسه پایان یافته',
  'پایان جلسه',
  'پیوستن به این جلسه ویدیویی',
  'پیوستن به جلسه ویدیویی',
  'پیوستن به این جلسه ویدئویی',
  'پیوستن به جلسه ویدئویی',
  'پیوستن به این جلسه تصویری',
  'پیوستن به جلسه تصویری',
  'پیوستن به این جلسه',
  'پیوستن به جلسه',
  'پیوستن به این تماس',
  'پیوستن به تماس',
  'ورود به جلسه',
  'ورود به این جلسه',
  'ورود به جلسه ویدیویی',
  'ورود به این جلسه ویدیویی',
  'ورود به جلسه ویدئویی',
  'ورود به این جلسه ویدئویی',
  'ورود به جلسه تصویری',
  'ورود به این جلسه تصویری',
  'جلسه ویدیویی',
  'جلسه ویدئویی',
  'جلسه تصویری',
  '참여 준비 완료',
  '참여 중',
  '로드 중',
  '지금 참여',
  '화상 회의 참여',
  'مستعد للانضمام',
  'جاهز للانضمام',
  'جارٍ الانضمام',
  'جارٍ التحميل',
  'طلب الانضمام',
  'انضمام الآن',
  'الانضمام الآن',
  'انضمام إلى اجتماع الفيديو',
  'الانضمام إلى اجتماع فيديو',
  'الانضمام إلى هذا الاجتماع',
  'الانضمام إلى اجتماع',
  'الانضمام إلى المكالمة'
];

const UI_CONTROL_PHRASES = [
  'turn off microphone',
  'turn on microphone',
  'turn off camera',
  'turn on camera',
  'leave call',
  'leave meeting',
  'end call',
  'raise hand',
  'lower hand',
  'more options',
  'meeting details',
  'chat with everyone',
  'people',
  'show everyone',
  'activities',
  'host controls',
  'turn on captions',
  'turn off captions',
  'خاموش کردن میکروفون',
  'روشن کردن میکروفون',
  'خاموش کردن دوربین',
  'روشن کردن دوربین',
  'ترک تماس',
  'خروج از تماس',
  'پایان تماس',
  'دست بلند کردن',
  'گزینه‌های بیشتر',
  'اطلاعات جلسه',
  'جزئیات جلسه',
  'افراد',
  'چت',
  'گفتگو',
  'فعالیت‌ها',
  'کنترل‌های میزبان',
  'فعال‌سازی زیرنویس',
  'خاموش کردن زیرنویس'
];

function isLobbyOrGenericTitle(title, meetingId = '') {
  if (!title || typeof title !== 'string') return true;
  let t = title.trim();
  if (!t) return true;

  // Remove leading bidi control marks
  t = t.replace(/^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]+/gu, '').trim();

  // Remove notification count like (1), (2), (۱), (۲)
  t = t.replace(/^\([\d\u0660-\u0669\u06F0-\u06F9]+\)\s*/u, '').trim();

  // Strip prefixes/suffixes like "Meet - ", " - Google Meet", "گوگل میت", "میت"
  t = t.replace(/^(?:Google\s+)?Meet\s*[-–—:|#]\s*/i, '').trim();
  t = t.replace(/\s*[-–—:|#]\s*(?:Google\s+)?Meet$/i, '').trim();
  t = t.replace(/^(?:گوگل\s+)?میت\s*[-–—:|#]\s*/iu, '').trim();
  t = t.replace(/\s*[-–—:|#]\s*(?:گوگل\s+)?میت$/iu, '').trim();

  // Strip leading/trailing punctuation, bidi control marks, hashes, bullets, etc.
  const cleaned = t
    .replace(/^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069?!؟.\-_–—:|#()·•]+/gu, '')
    .replace(/[\s\u200e\u200f\u202a-\u202e\u2066-\u2069?!؟.\-_–—:|#()·•]+$/gu, '')
    .trim()
    .toLowerCase();

  if (!cleaned) return true;
  if (
    cleaned === 'meet' ||
    cleaned === 'google meet' ||
    cleaned === 'میت' ||
    cleaned === 'گوگل میت' ||
    cleaned === 'untitled' ||
    cleaned === 'untitled meeting' ||
    cleaned === 'بدون عنوان' ||
    cleaned === 'جلسه بدون عنوان'
  ) {
    return true;
  }
  if (meetingId && (cleaned === meetingId.toLowerCase() || t === meetingId)) {
    return true;
  }
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(cleaned)) {
    return true;
  }

  // Pure clock or time + meeting code (e.g. "12:30 PM | abc-defg-hij", "12:30 · abc-defg-hij", "۱۲:۳۰ | abc-defg-hij", "10:15")
  if (/^[\d\u0660-\u0669\u06F0-\u06F9]{1,2}:[\d\u0660-\u0669\u06F0-\u06F9]{2}(?::[\d\u0660-\u0669\u06F0-\u06F9]{2})?\s*(?:am|pm|ق\.?ظ|ب\.?ظ|ق\u200cظ|ب\u200cظ)?(?:\s*[-–—|·•]\s*[a-z]{3}-[a-z]{4}-[a-z]{3})?$/iu.test(cleaned)) {
    return true;
  }

  // Check UI control labels/tooltips
  if (UI_CONTROL_PHRASES.some(phrase => cleaned === phrase || cleaned.startsWith(phrase))) {
    return true;
  }

  return LOBBY_TITLE_PHRASES.some(phrase => {
    if (cleaned === phrase) return true;
    if (cleaned.startsWith(phrase + ' ') || cleaned.startsWith(phrase + '...') || cleaned.startsWith(phrase + '?') || cleaned.startsWith(phrase + '؟')) {
      return true;
    }
    if (cleaned.endsWith(' ' + phrase) || cleaned.endsWith('...' + phrase)) {
      return true;
    }
    return false;
  });
}

function getDisplayTitle(meeting) {
  if (meeting?.meetingTitle && !isLobbyOrGenericTitle(meeting.meetingTitle, meeting?.meetingId)) {
    return meeting.meetingTitle;
  }
  return meeting?.aiTitle || meeting?.generatedTitle || meeting?.meetingId || t('untitled');
}

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

  let lastActorIndex = null;
  let lastTimestamp = null;
  let lastBubble = null;
  let lastType = null;

  sorted.forEach((msg) => {
    const speaker = meeting.participants[msg.actorIndex];
    const text = (msg.text || '').trim();
    if (!text && msg.type === 'caption') return;

    const msgTime = msg.timestamp ? new Date(msg.timestamp).getTime() : NaN;
    const isSameSpeaker = lastActorIndex !== null && lastActorIndex === msg.actorIndex;

    if (isSameSpeaker && lastBubble && msg.type === 'caption') {
      const prevText = lastBubble.textContent || '';
      const rel = prevText ? classifyTextRelationship(prevText, text) : 'none';
      if (rel === 'extension') {
        lastBubble.textContent = text;
        lastTimestamp = msgTime;
        return;
      }
      if (rel === 'duplicate' || rel === 'subsumed') {
        lastTimestamp = msgTime;
        return;
      }
    }

    const isWithin15s =
      isSameSpeaker &&
      lastType === 'caption' &&
      msg.type === 'caption' &&
      !isNaN(msgTime) &&
      lastTimestamp !== null &&
      !isNaN(lastTimestamp) &&
      msgTime - lastTimestamp <= 15000 &&
      msgTime - lastTimestamp >= 0;

    if (isWithin15s && lastBubble) {
      const prevText = lastBubble.textContent || '';
      lastBubble.textContent = prevText ? mergeConsecutiveTexts(prevText, text) : text;
      lastTimestamp = msgTime;
      return;
    }

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
    bubble.setAttribute('dir', 'auto');
    bubble.textContent = text;

    wrap.append(head, bubble);
    transcriptEl.appendChild(wrap);

    lastActorIndex = msg.actorIndex;
    lastTimestamp = msgTime;
    lastBubble = bubble;
    lastType = msg.type;
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
    const text = msg.text || '';
    const hasRtl = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
    const startsWithNonRtl = /^[\d\u0660-\u0669\u06F0-\u06F9\s\p{P}\p{S}]/u.test(text.trim());
    const needsRlm = hasRtl && startsWithNonRtl && !text.startsWith('\u200F');
    const formattedText = needsRlm ? `\u200F${text}` : text;
    return `[${formatTime(msg.timestamp)}] ${speakerName}: ${formattedText}`;
  });

  if ((meeting.summaryText || '').trim()) {
    lines.push('', '--- Summary ---', meeting.summaryText.trim());
  }

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
