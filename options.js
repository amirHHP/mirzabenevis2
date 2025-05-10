document.getElementById('show-meetings-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'meetings.html' });
});