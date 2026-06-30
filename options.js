const TRANSLATIONS = {
  en: {
    sectionMeetings: 'Auto Meeting Log',
    meetingLogs: 'Meeting Logs',
    sectionGemini: 'Gemini Settings',
    apiKeyLabel: 'Gemini API Key',
    apiKeyPlaceholder: 'Enter your API key',
    apiKeyHint: 'Stored securely in Chrome sync storage. Required for meeting summaries.',
    summaryLanguageLabel: 'Summary language',
    langEnglish: 'English',
    langPersian: 'Persian (Farsi)',
    saveSettings: 'Save settings',
    settingsSaved: 'Settings saved.',
    settingsSaveFailed: 'Failed to save settings.',
  },
  fa: {
    sectionMeetings: 'ثبت خودکار جلسه',
    meetingLogs: 'لیست جلسات',
    sectionGemini: 'تنظیمات جمینای',
    apiKeyLabel: 'کلید API جمینای',
    apiKeyPlaceholder: 'کلید API خود را وارد کنید',
    apiKeyHint: 'به‌صورت امن در حافظه همگام Chrome ذخیره می‌شود. برای خلاصه جلسات لازم است.',
    summaryLanguageLabel: 'زبان خلاصه',
    langEnglish: 'انگلیسی',
    langPersian: 'فارسی',
    saveSettings: 'ذخیره تنظیمات',
    settingsSaved: 'تنظیمات ذخیره شد.',
    settingsSaveFailed: 'خطا در ذخیره تنظیمات.',
  },
};

let currentUiLanguage = 'en';

const showMeetingsBtn = document.getElementById('show-meetings-btn');
const geminiKeyInput = document.getElementById('gemini-api-key');
const languageSelect = document.getElementById('gemini-summary-language');
const saveGeminiKeyBtn = document.getElementById('save-gemini-key-btn');
const statusEl = document.getElementById('options-status');
const langButtons = document.querySelectorAll('[data-ui-lang]');

function t(key) {
  return TRANSLATIONS[currentUiLanguage][key] || TRANSLATIONS.en[key] || key;
}

function applyUiLanguage(lang) {
  currentUiLanguage = lang === 'fa' ? 'fa' : 'en';
  document.documentElement.lang = currentUiLanguage;
  document.documentElement.dir = currentUiLanguage === 'fa' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  if (geminiKeyInput) {
    geminiKeyInput.placeholder = t('apiKeyPlaceholder');
  }

  langButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiLang === currentUiLanguage);
  });
}

function setStatus(messageKey, type) {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = messageKey ? t(messageKey) : '';
  statusEl.className = 'status';
  if (type) {
    statusEl.classList.add(type);
  }
}

if (showMeetingsBtn) {
  showMeetingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'meetings.html' });
  });
}

langButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.uiLang;
    applyUiLanguage(lang);
    if (chrome?.storage?.sync) {
      chrome.storage.sync.set({ uiLanguage: currentUiLanguage });
    }
  });
});

if (chrome?.storage?.sync) {
  chrome.storage.sync.get(['geminiApiKey', 'geminiSummaryLanguage', 'uiLanguage'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load settings:', chrome.runtime.lastError);
      return;
    }

    applyUiLanguage(result.uiLanguage === 'fa' ? 'fa' : 'en');

    if (geminiKeyInput) {
      geminiKeyInput.value = result.geminiApiKey || '';
    }
    if (languageSelect) {
      const storedLang = result.geminiSummaryLanguage;
      languageSelect.value = storedLang === 'fa' || storedLang === 'en' ? storedLang : 'en';
    }
  });
} else {
  applyUiLanguage('en');
}

if (saveGeminiKeyBtn && geminiKeyInput && chrome?.storage?.sync) {
  saveGeminiKeyBtn.addEventListener('click', () => {
    const value = geminiKeyInput.value.trim();
    const language = languageSelect ? languageSelect.value : 'en';
    chrome.storage.sync.set(
      {
        geminiApiKey: value,
        geminiSummaryLanguage: language,
        uiLanguage: currentUiLanguage,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to save settings:', chrome.runtime.lastError);
          setStatus('settingsSaveFailed', 'error');
          return;
        }
        setStatus('settingsSaved', 'success');
        setTimeout(() => setStatus('', null), 2000);
      }
    );
  });
}
