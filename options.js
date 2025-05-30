document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('geminiApiKey');
    const saveButton = document.getElementById('save');
    const statusMessage = document.getElementById('status-message');
    const languageInput = document.getElementById('summaryLanguage');

    // Load saved settings
    chrome.storage.sync.get(['geminiApiKey', 'summaryLanguage'], (result) => {
        apiKeyInput.value = result.geminiApiKey || '';
        languageInput.value = result.summaryLanguage || 'en';
    });

    // Save settings
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        const language = languageInput.value;
        
        if (!apiKey) {
            showStatus('Please enter a valid API key', 'error');
            return;
        }

        // Disable the save button while saving
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        chrome.storage.sync.set({
            geminiApiKey: apiKey,
            summaryLanguage: language
        }, () => {
            if (chrome.runtime.lastError) {
                showStatus('Error saving API key: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus('Settings saved successfully!', 'success');
            }
            
            // Re-enable the save button
            saveButton.disabled = false;
            saveButton.textContent = 'Save';
        });
    });

    // Show meetings button
    document.getElementById('show-meetings-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'meetings.html' });
    });

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.style.display = 'block';
        
        // Hide the message after 3 seconds
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }
});