const showMeetingsBtn = document.getElementById('show-meetings-btn');
if (showMeetingsBtn) {
  showMeetingsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'meetings.html' });
  });
}

const geminiKeyInput = document.getElementById('gemini-api-key');
const languageSelect = document.getElementById('gemini-summary-language');
const saveGeminiKeyBtn = document.getElementById('save-gemini-key-btn');
const statusEl = document.getElementById('options-status');

if (geminiKeyInput && chrome && chrome.storage && chrome.storage.sync) {
  chrome.storage.sync.get(['geminiApiKey', 'geminiSummaryLanguage'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load Gemini settings:', chrome.runtime.lastError);
      return;
    }
    geminiKeyInput.value = result.geminiApiKey || '';
    if (languageSelect) {
      const storedLang = result.geminiSummaryLanguage;
      languageSelect.value = storedLang === 'fa' || storedLang === 'en' ? storedLang : 'en';
    }
  });
}

if (saveGeminiKeyBtn && geminiKeyInput && chrome && chrome.storage && chrome.storage.sync) {
  saveGeminiKeyBtn.addEventListener('click', () => {
    const value = geminiKeyInput.value.trim();
    const language = languageSelect ? languageSelect.value : 'en';
    chrome.storage.sync.set({ geminiApiKey: value, geminiSummaryLanguage: language }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save Gemini settings:', chrome.runtime.lastError);
        if (statusEl) {
          statusEl.style.color = 'red';
          statusEl.textContent = 'Failed to save settings.';
        }
        return;
      }
      if (statusEl) {
        statusEl.style.color = 'green';
        statusEl.textContent = 'Settings saved.';
        setTimeout(() => {
          statusEl.textContent = '';
        }, 2000);
      }
    });
  });
}