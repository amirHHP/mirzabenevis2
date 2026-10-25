import { LicenseManager } from './modules/LicenseManager.js';
import { AutoMeetingLogData } from './modules/AutoMeetingLogData.js';
import { BackupManager } from './modules/BackupManager.js';

const TRANSLATIONS = {
  en: {
    sectionMeetings: 'Auto Meeting Log',
    meetingLogs: 'Meeting Logs',
    backupMeetings: 'Backup All',
    sectionPro: 'Pro Account',
    proFreeBadge: 'Free',
    proActiveBadge: '⭐ Pro',
    proHint: 'Upgrade to Pro to backup all meetings and unlock premium features.',
    buyPro: 'Buy Pro License',
    licenseCodeLabel: 'Activation Code',
    licenseCodePlaceholder: 'Enter code (e.g. MBPRO-XXXX-...)',
    activatePro: 'Activate Pro',
    proActiveLabel: 'Pro Account Active',
    licenseLabel: 'License:',
    backupNow: 'Download Backup',
    deactivatePro: 'Deactivate',
    proMissingCode: 'Please enter an activation code.',
    proActivateSuccess: 'Pro account activated successfully!',
    proInvalidCode: 'Invalid activation code. Please check and try again.',
    proDeactivateSuccess: 'Pro account deactivated.',
    backupGenerating: 'Generating backup…',
    backupSuccess: 'Backup downloaded successfully ({count} meetings).',
    backupEmpty: 'No meetings found to backup.',
    backupRequiresPro: 'Pro account required to backup meetings.',
    sectionCloud: 'Cloud Sync',
    cloudEmailLabel: 'Email',
    cloudEmailPlaceholder: 'you@example.com',
    cloudPasswordLabel: 'Password',
    cloudPasswordPlaceholder: '••••••••',
    cloudHint: 'Connect your account so meeting logs sync to the web app automatically.',
    cloudLogin: 'Log in',
    cloudSignup: 'Sign up',
    cloudSyncNow: 'Sync now',
    cloudLogout: 'Log out',
    cloudNotConfigured: 'Cloud sync is not configured. Set Supabase URL and key in modules/CloudSyncManager.js.',
    cloudLoggedIn: 'Signed in. New meetings sync automatically.',
    cloudLoggedOut: 'Sign in to enable syncing with the web app.',
    lastSyncLabel: 'Last sync',
    pendingLabel: 'meetings waiting to retry',
    cloudWorking: 'Working…',
    cloudMissingFields: 'Please enter your email and password.',
    cloudLoginSuccess: 'Signed in successfully. Syncing all meetings…',
    cloudSignupSuccess: 'Account created. Check your inbox if confirmation is required, then log in.',
    cloudLogoutSuccess: 'Signed out.',
    cloudSyncSuccess: 'All meetings synced.',
    cloudErrorPrefix: 'Error: ',
    sectionGemini: 'Gemini Settings',
    apiKeyLabel: 'Gemini API Key',
    apiKeyPlaceholder: 'Enter your API key',
    apiKeyHint: 'Stored only on this device, in the extension’s local storage. It is not synced with your Google account. Required for meeting summaries and AI auto-titling.',
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
    backupMeetings: 'پشتیبان‌گیری',
    sectionPro: 'اکانت حرفه‌ای',
    proFreeBadge: 'رایگان',
    proActiveBadge: '⭐ حرفه‌ای',
    proHint: 'با تهیه نسخه حرفه‌ای، از تمامی جلسات خود نسخه پشتیبان تهیه کنید.',
    buyPro: 'خرید اکانت حرفه‌ای از سایت',
    licenseCodeLabel: 'کد فعال‌سازی',
    licenseCodePlaceholder: 'کد خریداری‌شده را وارد کنید',
    activatePro: 'فعال‌سازی نسخه حرفه‌ای',
    proActiveLabel: 'اکانت حرفه‌ای فعال است',
    licenseLabel: 'کد لایسنس:',
    backupNow: 'دانلود فایل پشتیبان',
    deactivatePro: 'غیرفعال‌سازی',
    proMissingCode: 'لطفاً کد فعال‌سازی را وارد کنید.',
    proActivateSuccess: 'اکانت حرفه‌ای با موفقیت فعال شد!',
    proInvalidCode: 'کد فعال‌سازی نامعتبر است. لطفاً کد را با دقت بررسی و مجدداً تلاش کنید.',
    proDeactivateSuccess: 'اکانت حرفه‌ای غیرفعال شد.',
    backupGenerating: 'در حال تهیه فایل پشتیبان…',
    backupSuccess: 'فایل پشتیبان با موفقیت دانلود شد ({count} جلسه).',
    backupEmpty: 'هیچ جلسه‌ای برای پشتیبان‌گیری وجود ندارد.',
    backupRequiresPro: 'برای پشتیبان‌گیری از تمام جلسات، اکانت حرفه‌ای الزامی است.',
    sectionCloud: 'همگام‌سازی ابری',
    cloudEmailLabel: 'ایمیل',
    cloudEmailPlaceholder: 'you@example.com',
    cloudPasswordLabel: 'رمز عبور',
    cloudPasswordPlaceholder: '••••••••',
    cloudHint: 'با ورود به حساب، لاگ جلسات به‌صورت خودکار با نسخه وب همگام می‌شود.',
    cloudLogin: 'ورود',
    cloudSignup: 'ثبت‌نام',
    cloudSyncNow: 'همگام‌سازی',
    cloudLogout: 'خروج',
    cloudNotConfigured: 'همگام‌سازی ابری تنظیم نشده است. آدرس و کلید Supabase را در modules/CloudSyncManager.js وارد کنید.',
    cloudLoggedIn: 'وارد شده‌اید. جلسات جدید خودکار سینک می‌شوند.',
    cloudLoggedOut: 'برای همگام‌سازی با نسخه وب وارد شوید.',
    lastSyncLabel: 'آخرین همگام‌سازی',
    pendingLabel: 'جلسه در انتظار تلاش مجدد',
    cloudWorking: 'در حال انجام…',
    cloudMissingFields: 'لطفاً ایمیل و رمز عبور را وارد کنید.',
    cloudLoginSuccess: 'ورود موفق. در حال همگام‌سازی همه جلسات…',
    cloudSignupSuccess: 'حساب ساخته شد. اگر تأیید ایمیل لازم است، ایمیل خود را بررسی و سپس وارد شوید.',
    cloudLogoutSuccess: 'خروج انجام شد.',
    cloudSyncSuccess: 'همه جلسات همگام شد.',
    cloudErrorPrefix: 'خطا: ',
    sectionGemini: 'تنظیمات جمینای',
    apiKeyLabel: 'کلید API جمینای',
    apiKeyPlaceholder: 'کلید API خود را وارد کنید',
    apiKeyHint: 'فقط روی همین دستگاه، در حافظهٔ محلی افزونه می‌ماند و با حساب گوگل همگام نمی‌شود. برای خلاصه و عنوان خودکار جلسه لازم است.',
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

  const licenseCodeInput = document.getElementById('license-code-input');
  if (licenseCodeInput) {
    licenseCodeInput.placeholder = t('licenseCodePlaceholder');
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

if (chrome?.storage?.local && chrome?.storage?.sync) {
  chrome.storage.local.get(['geminiApiKey'], (localResult) => {
    chrome.storage.sync.get(['geminiApiKey', 'geminiSummaryLanguage', 'uiLanguage'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to load settings:', chrome.runtime.lastError);
        return;
      }

      applyUiLanguage(result.uiLanguage === 'fa' ? 'fa' : 'en');

      const apiKey = localResult?.geminiApiKey || result.geminiApiKey || '';
      if (!localResult?.geminiApiKey && result.geminiApiKey) {
        chrome.storage.local.set({ geminiApiKey: result.geminiApiKey });
        chrome.storage.sync.remove('geminiApiKey');
      }

      if (geminiKeyInput) {
        geminiKeyInput.value = apiKey;
      }
      if (languageSelect) {
        const storedLang = result.geminiSummaryLanguage;
        languageSelect.value = storedLang === 'fa' || storedLang === 'en' ? storedLang : 'en';
      }
    });
  });
} else {
  applyUiLanguage('en');
}

if (saveGeminiKeyBtn && geminiKeyInput && chrome?.storage?.local && chrome?.storage?.sync) {
  saveGeminiKeyBtn.addEventListener('click', () => {
    const value = geminiKeyInput.value.trim();
    const language = languageSelect ? languageSelect.value : 'en';
    chrome.storage.local.set({ geminiApiKey: value }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save settings:', chrome.runtime.lastError);
        setStatus('settingsSaveFailed', 'error');
        return;
      }
      chrome.storage.sync.set(
        {
          geminiSummaryLanguage: language,
          uiLanguage: currentUiLanguage,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('Failed to save settings:', chrome.runtime.lastError);
            setStatus('settingsSaveFailed', 'error');
            return;
          }
          chrome.storage.sync.remove('geminiApiKey', () => {
            setStatus('settingsSaved', 'success');
            setTimeout(() => setStatus('', null), 2000);
          });
        }
      );
    });
  });
}

// ---------- Cloud Sync ----------

const cloudLoginView = document.getElementById('cloud-login-view');
const cloudSessionView = document.getElementById('cloud-session-view');
const cloudStatusLine = document.getElementById('cloud-status');
const cloudActionStatus = document.getElementById('cloud-action-status');
const cloudEmailInput = document.getElementById('cloud-email');
const cloudPasswordInput = document.getElementById('cloud-password');
const cloudLoginBtn = document.getElementById('cloud-login-btn');
const cloudSignupBtn = document.getElementById('cloud-signup-btn');
const cloudSyncBtn = document.getElementById('cloud-sync-btn');
const cloudLogoutBtn = document.getElementById('cloud-logout-btn');
const cloudUserEmail = document.getElementById('cloud-user-email');

function sendCloudMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      const res = chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
      if (res && typeof res.catch === 'function') {
        res.catch((err) => reject(err));
      }
    } catch (err) {
      reject(err);
    }
  });
}

function setCloudStatus(message, type) {
  if (!cloudActionStatus) {
    return;
  }
  cloudActionStatus.textContent = message || '';
  cloudActionStatus.className = 'status';
  if (type) {
    cloudActionStatus.classList.add(type);
  }
}

function formatSyncTime(isoString) {
  try {
    return `${t('lastSyncLabel')}: ${new Date(isoString).toLocaleString()}`;
  } catch {
    return '';
  }
}

async function renderCloudView() {
  let status;
  try {
    status = await sendCloudMessage({ type: 'cloud.getStatus' });
  } catch {
    return;
  }

  if (!status?.configured) {
    if (cloudStatusLine) {
      cloudStatusLine.textContent = t('cloudNotConfigured');
    }
    if (cloudLoginView) cloudLoginView.hidden = true;
    if (cloudSessionView) cloudSessionView.hidden = true;
    return;
  }

  const pendingText =
    status.pendingCount > 0 ? ` · ${status.pendingCount} ${t('pendingLabel')}` : '';
  const syncTimeText = status.lastSyncAt
    ? ` · ${formatSyncTime(status.lastSyncAt)}`
    : '';

  if (status.loggedIn) {
    if (cloudStatusLine) {
      cloudStatusLine.textContent = t('cloudLoggedIn') + syncTimeText + pendingText;
    }
    if (cloudUserEmail) cloudUserEmail.textContent = status.email || '';
    if (cloudLoginView) cloudLoginView.hidden = true;
    if (cloudSessionView) cloudSessionView.hidden = false;
  } else {
    if (cloudStatusLine) {
      cloudStatusLine.textContent = t('cloudLoggedOut');
    }
    if (cloudLoginView) cloudLoginView.hidden = false;
    if (cloudSessionView) cloudSessionView.hidden = true;
  }
}

async function handleCloudAuth(action) {
  const email = cloudEmailInput ? cloudEmailInput.value.trim() : '';
  const password = cloudPasswordInput ? cloudPasswordInput.value : '';
  if (!email || !password) {
    setCloudStatus(t('cloudMissingFields'), 'error');
    return;
  }

  setCloudButtonsDisabled(true);
  setCloudStatus(t('cloudWorking'), null);
  try {
    const response = await sendCloudMessage({ type: `cloud.${action}`, email, password });
    if (!response?.success) {
      throw new Error(response?.message || 'Request failed.');
    }
    if (action === 'signup' && response.needsEmailConfirmation) {
      setCloudStatus(t('cloudSignupSuccess'), 'success');
      return;
    }
    setCloudStatus(t('cloudLoginSuccess'), 'success');
    await sendCloudMessage({ type: 'cloud.syncAll' }).catch(() => {});
    await renderCloudView();
  } catch (error) {
    setCloudStatus(t('cloudErrorPrefix') + error.message, 'error');
  } finally {
    setCloudButtonsDisabled(false);
    setTimeout(() => setCloudStatus('', null), 4000);
  }
}

function setCloudButtonsDisabled(disabled) {
  [cloudLoginBtn, cloudSignupBtn, cloudSyncBtn, cloudLogoutBtn].forEach((btn) => {
    if (btn) btn.disabled = disabled;
  });
}

if (cloudLoginBtn) {
  cloudLoginBtn.addEventListener('click', () => handleCloudAuth('login'));
}
if (cloudSignupBtn) {
  cloudSignupBtn.addEventListener('click', () => handleCloudAuth('signup'));
}
if (cloudLogoutBtn) {
  cloudLogoutBtn.addEventListener('click', async () => {
    setCloudButtonsDisabled(true);
    try {
      await sendCloudMessage({ type: 'cloud.logout' });
      setCloudStatus(t('cloudLogoutSuccess'), 'success');
      await renderCloudView();
    } catch (error) {
      setCloudStatus(t('cloudErrorPrefix') + error.message, 'error');
    } finally {
      setCloudButtonsDisabled(false);
    }
  });
}
if (cloudSyncBtn) {
  cloudSyncBtn.addEventListener('click', async () => {
    setCloudButtonsDisabled(true);
    setCloudStatus(t('cloudWorking'), null);
    try {
      const response = await sendCloudMessage({ type: 'cloud.syncAll' });
      if (!response?.success) {
        throw new Error(response?.message || 'Sync failed.');
      }
      setCloudStatus(`${t('cloudSyncSuccess')} (${response.syncedCount})`, 'success');
      await renderCloudView();
    } catch (error) {
      setCloudStatus(t('cloudErrorPrefix') + error.message, 'error');
    } finally {
      setCloudButtonsDisabled(false);
    }
  });
}

renderCloudView();
// Refresh views when the UI language changes
document.querySelectorAll('[data-ui-lang]').forEach((btn) => {
  btn.addEventListener('click', () => {
    renderCloudView();
    renderProView();
  });
});

// ---------- Pro Account & Backup ----------

const licenseManager = new LicenseManager();
const autoMeetingLogDB = new AutoMeetingLogData();
const backupManager = new BackupManager(autoMeetingLogDB, licenseManager);

const proFreeView = document.getElementById('pro-free-view');
const proActiveView = document.getElementById('pro-active-view');
const proBadge = document.getElementById('pro-badge');
const proMaskedKey = document.getElementById('pro-masked-key');
const licenseCodeInput = document.getElementById('license-code-input');
const activateLicenseBtn = document.getElementById('activate-license-btn');
const buyProLink = document.getElementById('buy-pro-link');
const proBackupBtn = document.getElementById('pro-backup-btn');
const proDeactivateBtn = document.getElementById('pro-deactivate-btn');
const proActionStatus = document.getElementById('pro-action-status');
const backupMeetingsBtn = document.getElementById('backup-meetings-btn');

function setProStatus(messageKey, type, count) {
  if (!proActionStatus) return;
  let msg = messageKey ? t(messageKey) : '';
  if (count !== undefined) {
    msg = msg.replace('{count}', count);
  }
  proActionStatus.textContent = msg;
  proActionStatus.className = 'status';
  if (type) {
    proActionStatus.classList.add(type);
  }
}

async function renderProView() {
  const info = await licenseManager.getLicenseInfo();
  if (info.isPro) {
    if (proFreeView) proFreeView.hidden = true;
    if (proActiveView) proActiveView.hidden = false;
    if (proBadge) {
      proBadge.textContent = t('proActiveBadge');
      proBadge.className = 'pro-badge-active';
    }
    if (proMaskedKey) {
      proMaskedKey.textContent = info.maskedKey || '';
    }
  } else {
    if (proFreeView) proFreeView.hidden = false;
    if (proActiveView) proActiveView.hidden = true;
    if (proBadge) {
      proBadge.textContent = t('proFreeBadge');
      proBadge.className = 'pro-badge-free';
    }
    if (buyProLink && info.purchaseUrl) {
      buyProLink.href = info.purchaseUrl;
    }
  }
}

async function handlePerformBackup(btn) {
  const isPro = await licenseManager.isPro();
  if (!isPro) {
    setProStatus('backupRequiresPro', 'error');
    const proCard = document.getElementById('pro-card');
    if (proCard) {
      proCard.scrollIntoView({ behavior: 'smooth' });
    }
    if (licenseCodeInput) {
      licenseCodeInput.focus();
    }
    setTimeout(() => setProStatus('', null), 4000);
    return;
  }

  if (btn) btn.disabled = true;
  setProStatus('backupGenerating', null);

  try {
    const backupRes = await backupManager.createBackup();
    if (backupRes.empty) {
      setProStatus('backupEmpty', 'error');
      return;
    }
    backupManager.downloadBackupFile(backupRes.filename, backupRes.jsonString);
    setProStatus('backupSuccess', 'success', backupRes.count);
  } catch (error) {
    console.error('Backup error:', error);
    setProStatus('backupRequiresPro', 'error');
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => setProStatus('', null), 5000);
  }
}

if (activateLicenseBtn && licenseCodeInput) {
  activateLicenseBtn.addEventListener('click', async () => {
    const code = licenseCodeInput.value.trim();
    if (!code) {
      setProStatus('proMissingCode', 'error');
      return;
    }

    activateLicenseBtn.disabled = true;
    setProStatus('cloudWorking', null);

    try {
      const res = await licenseManager.activate(code);
      if (!res.success) {
        setProStatus('proInvalidCode', 'error');
        return;
      }
      setProStatus('proActivateSuccess', 'success');
      licenseCodeInput.value = '';
      await renderProView();
    } catch (e) {
      setProStatus('proInvalidCode', 'error');
    } finally {
      activateLicenseBtn.disabled = false;
      setTimeout(() => setProStatus('', null), 4000);
    }
  });
}

if (proDeactivateBtn) {
  proDeactivateBtn.addEventListener('click', async () => {
    proDeactivateBtn.disabled = true;
    try {
      await licenseManager.deactivate();
      setProStatus('proDeactivateSuccess', 'success');
      await renderProView();
    } catch (e) {
      console.error(e);
    } finally {
      proDeactivateBtn.disabled = false;
      setTimeout(() => setProStatus('', null), 3000);
    }
  });
}

if (proBackupBtn) {
  proBackupBtn.addEventListener('click', () => handlePerformBackup(proBackupBtn));
}

if (backupMeetingsBtn) {
  backupMeetingsBtn.addEventListener('click', () => handlePerformBackup(backupMeetingsBtn));
}

chrome.runtime?.onMessage?.addListener((req) => {
  if (req.type === 'license.updated') {
    renderProView();
  }
});

renderProView();
