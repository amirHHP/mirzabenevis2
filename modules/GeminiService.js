export class GeminiService {
    constructor() {
        this.API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
        this.loadApiKey();
        this.loadLanguage();
    }

    async loadApiKey() {
        console.log('Loading API key from storage');
        return new Promise((resolve) => {
            chrome.storage.sync.get(['geminiApiKey'], (result) => {
                this.API_KEY = result.geminiApiKey || '';
                console.log('API key loaded:', this.API_KEY ? 'Present' : 'Not found');
                resolve();
            });
        });
    }

    async loadLanguage() {
        console.log('Loading language preference');
        return new Promise((resolve) => {
            chrome.storage.sync.get(['summaryLanguage'], (result) => {
                this.LANGUAGE = result.summaryLanguage || 'en';
                console.log('Language loaded:', this.LANGUAGE);
                resolve();
            });
        });
    }

    async getCachedSummary(meetingId) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['meetingSummaries'], (result) => {
                const summaries = result.meetingSummaries || {};
                resolve(summaries[meetingId]);
            });
        });
    }

    async saveSummaryToCache(meetingId, summary) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['meetingSummaries'], (result) => {
                const summaries = result.meetingSummaries || {};
                summaries[meetingId] = summary;
                chrome.storage.local.set({ meetingSummaries: summaries }, resolve);
            });
        });
    }

    async summarizeMeeting(meetingText, meetingId) {
        try {
            // Check cache first
            console.log('Checking cache for meeting:', meetingId);
            const cachedSummary = await this.getCachedSummary(meetingId);
            if (cachedSummary) {
                console.log('Found cached summary');
                return cachedSummary;
            }

            console.log('No cached summary found, generating new summary');
            if (!this.API_KEY) {
                await this.loadApiKey();
                if (!this.API_KEY) {
                    throw new Error('Gemini API key not found. Please set it in the extension options.');
                }
            }

            await this.loadLanguage();
            const languagePrompt = this.LANGUAGE === 'fa' ? 
                'لطفاً خلاصه‌ای مختصر از متن جلسه زیر به زبان فارسی ارائه دهید:\n\n' :
                'Please provide a concise summary of the following meeting transcript:\n\n';

            console.log('Preparing API request');
            const requestBody = {
                contents: [{
                    parts: [{
                        text: `${languagePrompt}${meetingText}`
                    }]
                }]
            };

            console.log('Sending request to Gemini API');
            const response = await fetch(`${this.API_URL}?key=${this.API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            console.log('Response status:', response.status);
            if (!response.ok) {
                const errorData = await response.json();
                console.error('API Error:', errorData);
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('API Response:', data);
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from API');
            }

            const summary = data.candidates[0].content.parts[0].text;
            
            // Save to cache
            console.log('Saving summary to cache');
            await this.saveSummaryToCache(meetingId, summary);

            return summary;
        } catch (error) {
            console.error('Error in summarizeMeeting:', error);
            throw error;
        }
    }
} 