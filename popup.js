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
  
  const loadingSpinner = document.getElementById('loadingSpinner');

  // help panel elements
  const helpButton = document.getElementById('helpButton');
  const helpPanel = document.getElementById('helpPanel');
  const closePanel = document.getElementById('closePanel');
  
  const statusMessage = document.getElementById('statusMessage');
  const lastSyncTimeElement = document.getElementById('lastSyncTime');
  
  // load saved settings and update last sync time
  loadSavedSettings();
  updateLastSyncTime();
  
  // debounced save dettings function
  const debouncedSaveSettings = debounce(saveSettings, 300);

  // event listeners for thee original buttons
  saveButton.addEventListener('click', debouncedSaveSettings);
  syncNowButton.addEventListener('click', triggerSync);
  
  // add event listener for the reset button
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
  
  // encryption utilityyy
  const ENCRYPTION_KEY = 'your-encryption-key'; // replace with a secure key
  function encrypt(data) {
    return btoa(unescape(encodeURIComponent(data))); // base64 encoding
  }

  function decrypt(data) {
    return decodeURIComponent(escape(atob(data))); // decode
  }

  // function to load saved settings from storage
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
  
  // function to save settings to storage
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
  
  // function to validate inputs
  function validateInputs() {
    if (!notionTokenInput.value.trim()) {
      showStatus('✧ Notion token is required ✧', 'error');
      return false;
    }
    if (!notionPageIdInput.value.trim()) {
      showStatus('✧ Notion page ID is required ✧', 'error');
      return false;
    }
    if (!canvasTokenInput.value.trim()) {
      showStatus('✧ Canvas token is required ✧', 'error');
      return false;
    }
    if (!canvasUrlInput.value.trim() || !isValidUrl(canvasUrlInput.value.trim())) {
      showStatus('✧ Valid Canvas URL is required ✧', 'error');
      return false;
    }
    return true;
  }

  // function to check if a URL is valid
  function isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // updated triggerSync function to avoid logging sensitive data
  function triggerSync() {
    if (!validateInputs()) return;

    debouncedSaveSettings(); // save current settings before sync
    showLoadingSpinner(true);

    showStatus('✧ syncing in progress ✧');
    chrome.runtime.sendMessage({ action: 'startSync' }, function(response) {
      showLoadingSpinner(false);
      if (response && response.success) {
        showStatus('✧ sync completed successfully ✧', 'success');
        updateLastSyncTime();
      } else {
        const errorMsg = response && response.error ? response.error : 'unknown error';
        showStatus(`✧ sync failed: ${errorMsg} ✧`, 'error');
      }
    });
  }

  // function to show/hide the loading spinner
  function showLoadingSpinner(show) {
    loadingSpinner.style.display = show ? 'block' : 'none';
  }

  // function to reset settings both in UI and Chrome storage
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
  
  // debounce utility function
  function debounce(func, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

// create additional randomly positioned stars
function createRandomStars(count) {
  const starTypes = ['★', '☆', '✧', '✦', '✩'];
  const container = document.querySelector('.container');
  
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'bouncing-star';
    star.textContent = starTypes[Math.floor(Math.random() * starTypes.length)];
    
    // random position
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    
    // random animation parameters
    const xAmount = (Math.random() * 60 - 30) + 'px';
    const yAmount = (Math.random() * 60 - 30) + 'px';
    const duration = 8 + Math.random() * 7; // between 8-15 seconds
    
    star.style.top = top + '%';
    star.style.left = left + '%';
    star.style.setProperty('--x-amount', xAmount);
    star.style.setProperty('--y-amount', yAmount);
    star.style.animation = `bounce ${duration}s infinite ease-in-out`;
    
    // random size
    star.style.fontSize = (12 + Math.random() * 8) + 'px';
    
    // slight variations in opacity
    star.style.opacity = (0.3 + Math.random() * 0.4).toString();
    
    container.appendChild(star);
  }
}

// add 7 random stars
createRandomStars(7);

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