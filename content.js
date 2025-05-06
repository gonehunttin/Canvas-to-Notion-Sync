document.addEventListener('DOMContentLoaded', function() {
  // UI elements
  const notionTokenInput = document.getElementById('notionToken');
  const notionPageIdInput = document.getElementById('notionPageId');
  const canvasTokenInput = document.getElementById('canvasToken');
  const canvasUrlInput = document.getElementById('canvasUrl');
  const useDummyDataCheckbox = document.getElementById('useDummyData');
  
  const saveButton = document.getElementById('saveBtn');
  const syncNowButton = document.getElementById('syncNowBtn');
  const resetButton = document.getElementById('resetButton');
  
  // help panel elements
  const helpButton = document.getElementById('helpButton');
  const helpPanel = document.getElementById('helpPanel');
  const closePanel = document.getElementById('closePanel');
  
  const statusMessage = document.getElementById('statusMessage');
  const lastSyncTimeElement = document.getElementById('lastSyncTime');
  
  // encryption utility
  const ENCRYPTION_KEY = 'your-encryption-key';
  function encrypt(data) {
    return btoa(unescape(encodeURIComponent(data))); // base64 encoding
  }

  function decrypt(data) {
    return decodeURIComponent(escape(atob(data))); // decode base64
  }

  // load saved settings and update last sync time
  loadSavedSettings();
  updateLastSyncTime();
  
  // event listeners for thee original buttons
  saveButton.addEventListener('click', saveSettings);
  syncNowButton.addEventListener('click', triggerSync);
  
  // event listener for the reset button
  resetButton.addEventListener('click', resetSettings);
  
  // help panel toggle
  helpButton.addEventListener('click', function() {
    helpPanel.classList.toggle('open');
  });
  
  // close panel when X is clicked
  if (closePanel) {
    closePanel.addEventListener('click', function() {
      helpPanel.classList.remove('open');
    });
  }
  
  // close panel if user clicks outside of it
  document.addEventListener('click', function(event) {
    if (!helpPanel.contains(event.target) && event.target !== helpButton) {
      helpPanel.classList.remove('open');
    }
  });
  
  // function to load saved settings from Chrome storage
  function loadSavedSettings() {
    chrome.storage.sync.get([
      'notionToken',
      'notionPageId',
      'canvasToken',
      'canvasUrl',
      'useDummyData'
    ], function(result) {
      if (result.notionToken) notionTokenInput.value = decrypt(result.notionToken);
      if (result.notionPageId) notionPageIdInput.value = decrypt(result.notionPageId);
      if (result.canvasToken) canvasTokenInput.value = decrypt(result.canvasToken);
      if (result.canvasUrl) canvasUrlInput.value = decrypt(result.canvasUrl);
      if (result.useDummyData !== undefined) useDummyDataCheckbox.checked = result.useDummyData;
    });
  }
  
  // function to save settings to Chrome storage
  function saveSettings() {
    const settings = {
      notionToken: encrypt(notionTokenInput.value),
      notionPageId: encrypt(notionPageIdInput.value),
      canvasToken: encrypt(canvasTokenInput.value),
      canvasUrl: encrypt(canvasUrlInput.value),
      useDummyData: useDummyDataCheckbox.checked
    };
  
    chrome.storage.sync.set(settings, function() {
      showStatus('✧ settings saved successfully ✧', 'success');
    });
  }
  
  // function to trigger synchronization by messaging the background script
  function triggerSync() {
    saveSettings(); // save current settings before sync
    
    showStatus('✧ syncing in progress ✧');
    
    chrome.runtime.sendMessage({ action: 'startSync' }, function(response) {
      if (response && response.success) {
        showStatus('✧ sync completed successfully ✧', 'success');
        updateLastSyncTime();
      } else {
        const errorMsg = response && response.error ? response.error : 'unknown error';
        showStatus(`✧ sync failed: ${errorMsg} ✧`, 'error');
      }
    });
  }
  
  // new function to reset settings both in UI and Chrome storage
  function resetSettings() {
    // clear input fields and checkbox
    notionTokenInput.value = '';
    notionPageIdInput.value = '';
    canvasTokenInput.value = '';
    canvasUrlInput.value = '';
    useDummyDataCheckbox.checked = false;
    
    // remove settings from storage
    chrome.storage.sync.remove(['notionToken', 'notionPageId', 'canvasToken', 'canvasUrl', 'useDummyData'], function() {
      showStatus('✧ settings reset ✧', 'success');
    });
  }
  
  // helper function to display status messages
  function showStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message';
    if (type) {
      statusMessage.classList.add(type);
    }
    
    // auto-clear the message after 3 seconds for success messages
    if (type === 'success') {
      setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = 'status-message';
      }, 3000);
    }
  }
  
  // update the displayed last sync time from storage
  function updateLastSyncTime() {
    chrome.storage.sync.get('lastSyncTime', function(result) {
      if (result.lastSyncTime) {
        const date = new Date(result.lastSyncTime);
        lastSyncTimeElement.textContent = date.toLocaleString();
      } else {
        lastSyncTimeElement.textContent = 'never';
      }
    });
  }
});