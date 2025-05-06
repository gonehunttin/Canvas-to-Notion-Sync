// set up alarm for daily sync (runs once per day)
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('dailySync', { 
    periodInMinutes: 1440 // 24 hours
  });
  console.log('✧ daily sync alarm set ✧');
  
  // check what day it is for no special reason
  checkForEasterEgg();
});

// listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailySync') {
    console.log('✧ running scheduled sync ✧');
    syncTasks().catch(error => {
      logError('scheduled sync', error);
    });
  }
});

// listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startSync') {
    console.log('✧ manual sync requested ✧');
    syncTasks().then(result => {
      console.log('✧ sync result:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('✧ sync error in message handler:', error);
      sendResponse({ success: false, error: error.message || 'Unknown error occurred' });
    });
    return true; // required for async sendResponse
  }
  return false;
});

// centralized error logging utility
function logError(context, error) {
  const errorMessage = error instanceof Error 
    ? error.message 
    : typeof error === 'string' 
      ? error 
      : JSON.stringify(error, null, 2);
  console.error(`✧ ${context} error:`, errorMessage, '✧');
}

// environment-specific logging
const DEBUG = true;
function debugLog(message, ...optionalParams) {
  if (DEBUG) {
    const sanitizedParams = optionalParams.map(param => {
      if (typeof param === 'object') {
        // remove sensitive fields from objects
        const { notionToken, canvasToken, ...safeParams } = param;
        return safeParams;
      }
      return param;
    });
    console.log(message, ...sanitizedParams);
  }
}

// favorite holiday
function checkForEasterEgg() {
  const today = new Date();
  if (today.getMonth() === 4 && today.getDate() === 1) { 
    console.log('you have one billion assignments due. haha just kidding happy april fools');
  }
}

// main synchronization function
async function syncTasks() {
  try {
    debugLog('✧ starting sync process ✧');
    
    // get settings
    const settings = await getSettings();
    debugLog('✧ settings loaded:', {
      notionPageIdPresent: !!settings.notionPageId,
      canvasUrlPresent: !!settings.canvasUrl,
      useDummyData: settings.useDummyData
    });
    
    validateSettings(settings);
    
    // create or get database
    debugLog('✧ creating or getting database ✧');
    const databaseId = await createOrGetDatabase(settings);
    if (!databaseId) {
      throw new Error('Failed to create or get database');
    }
    debugLog('✧ database ID:', databaseId, '✧');
    
    // get database schema
    debugLog('✧ fetching database schema ✧');
    const schema = await getDatabaseSchema(settings, databaseId);
    
    // update database title if it's Sunday
    if (isSunday()) {
      debugLog('✧ it\'s Sunday, updating database title ✧');
      await updateDatabaseTitle(settings, databaseId);
    }
    
    // clean old tasks
    debugLog('✧ cleaning old tasks ✧');
    await cleanOldTasks(settings, databaseId, schema);
    
    // fetch tasks from Canvas (or dummy data)
    debugLog('✧ fetching tasks from ' + (settings.useDummyData ? 'dummy data' : 'Canvas') + ' ✧');
    const tasks = await fetchCanvasTasks(settings);
    
    // filter active tasks and add them to Notion
    const activeTasks = tasks.filter(task => !task.completed);
    debugLog(`✧ fetched ${tasks.length} tasks; ${activeTasks.length} are active ✧`);
    
    if (activeTasks.length > 0) {
      debugLog('✧ adding active tasks to Notion ✧');
      for (const task of activeTasks) {
        await createNotionPage(settings, databaseId, task, schema);
      }
    }
    
    // update last sync time
    await chrome.storage.sync.set({ lastSyncTime: new Date().toISOString() });
    debugLog('✧ sync completed successfully ✧');
    
    return { success: true };
  } catch (error) {
    logError('sync', error);
    return { success: false, error: error.message || 'Unknown error occurred' };
  }
}

// function to fetch tasks from Canvas or use dummy data
async function fetchCanvasTasks(settings) {
  if (settings.useDummyData) {
    debugLog('✧ using dummy task data ✧');
    return [
      {
        title: 'test task 1',
        due_date: '2025-05-10T12:00:00',
        description: 'this is a test task ⋆',
        priority: 'high',
        points: 10,
        class: 'how to survive the zombie apocalypse',
        completed: false
      },
      {
        title: 'test task 2',
        due_date: '2025-05-12T15:00:00',
        description: 'another test task ✧',
        priority: 'normal',
        points: 5,
        class: 'history of ur mom',
        completed: false
      },
      {
        title: 'completed task ✧',
        due_date: '2025-05-08T09:00:00',
        description: 'this task is done ⋆',
        priority: 'low',
        points: 8,
        class: 'chemistry',
        completed: true
      }
    ];
  } else {
    try {
      const url = `${settings.canvasUrl}/api/v1/users/self/todo`;
      const headers = {
        'Authorization': `Bearer ${settings.canvasToken}`
      };
      
      debugLog(`✧ fetching from Canvas API: ${url} ✧`);
      const response = await fetch(url, { 
        method: 'GET', 
        headers: headers 
      });
      
      if (response.ok) {
        const data = await response.json();
        debugLog('✧ fetched tasks from Canvas ✧');
        
        // process Canvas API response to match the expected format
        return data.map(item => ({
          title: item.assignment?.name || item.title || 'Untitled Task',
          due_date: item.assignment?.due_at || item.due_at,
          description: item.assignment?.description || item.description || '',
          priority: 'normal',
          points: item.assignment?.points_possible || 0,
          class: item.context_name || item.course_id || 'Unknown Class',
          completed: item.completed || false
        }));
      } else {
        const errorText = await response.text();
        logError('Canvas API', new Error(`Failed with ${response.status}: ${errorText}`));
        throw new Error(`Canvas API responded with ${response.status}: ${errorText}`);
      }
    } catch (error) {
      logError('Canvas fetch', error);
      throw new Error('Failed to fetch tasks from Canvas');
    }
  }
}

// helper function to get settings from storage
function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([
      'notionToken',
      'notionPageId',
      'canvasToken',
      'canvasUrl',
      'useDummyData'
    ], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

// validate settings
function validateSettings(settings) {
  debugLog('✧ validating settings ✧');
  if (!settings.notionToken) {
    throw new Error('Notion token is missing');
  }
  if (!settings.notionPageId) {
    throw new Error('Notion page ID is missing');
  }
  if (!settings.useDummyData && (!settings.canvasToken || !settings.canvasUrl)) {
    throw new Error('Canvas credentials are required when not using dummy data');
  }
}

// function to create or get database
async function createOrGetDatabase(settings) {
  try {
    // check if database ID is already stored
    const storedData = await new Promise(resolve => chrome.storage.sync.get(['databaseId'], resolve));
    if (storedData.databaseId) {
      debugLog('✧ using stored database ID:', storedData.databaseId, '✧');
      
      // verify database exists
      const exists = await verifyDatabaseExists(settings, storedData.databaseId);
      if (exists) {
        return storedData.databaseId;
      } else {
        debugLog('✧ stored database ID is invalid or database was deleted ✧');
        // remove invalid database ID from storage
        await chrome.storage.sync.remove('databaseId');
      }
    }

    debugLog('✧ no valid database ID found, creating new one ✧');
    
    // first verify the parent page exists
    const parentPageExists = await verifyPageExists(settings, settings.notionPageId);
    if (!parentPageExists) {
      throw new Error('Parent page does not exist or integration lacks access');
    }
    
    // try to query the parent page to see if a database already exists
    const pageUrl = `https://api.notion.com/v1/blocks/${settings.notionPageId}/children`;
    const headers = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Notion-Version': '2022-06-28'
    };
    
    const pageResponse = await fetch(pageUrl, {
      method: 'GET',
      headers: headers
    });
    
    if (!pageResponse.ok) {
      const pageErrorText = await pageResponse.text();
      throw new Error(`Error accessing Notion page: ${pageResponse.status} - ${pageErrorText}`);
    }
    
    const pageData = await pageResponse.json();
    const existingDatabases = pageData.results.filter(block => 
      block.type === 'child_database' && 
      block.child_database?.title?.includes('weekly tasks')
    );
    
    if (existingDatabases.length > 0) {
      const databaseId = existingDatabases[0].id;
      debugLog('✧ found existing database:', databaseId, '✧');
      // store the database ID in Chrome storage
      await chrome.storage.sync.set({ databaseId });
      return databaseId;
    }

    debugLog('✧ no existing database found, creating new one ✧');
    // create new database
    const url = 'https://api.notion.com/v1/databases';
    const createHeaders = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };
    
    const data = {
      parent: { page_id: settings.notionPageId },
      title: [
        { type: 'text', text: { content: 'weekly tasks ✧ ⋆' } }
      ],
      properties: {
        task: { title: {} },
        day: {
          select: {
            options: [
              { name: 'monday', color: 'blue' },
              { name: 'tuesday', color: 'green' },
              { name: 'wednesday', color: 'yellow' },
              { name: 'thursday', color: 'orange' },
              { name: 'friday', color: 'red' },
              { name: 'saturday', color: 'purple' },
              { name: 'sunday', color: 'pink' }
            ]
          }
        },
        points: { number: {} },
        'time due': { date: {} },
        class: { rich_text: {} },
        status: {
          select: {
            options: [
              { name: 'active', color: 'green' },
              { name: 'completed', color: 'red' }
            ]
          }
        },
        'already did this': { checkbox: {} }
      }
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: createHeaders,
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      const result = await response.json();
      debugLog('✧ database created successfully:', result.id, '✧');
      // store the new database ID in Chrome storage
      await chrome.storage.sync.set({ databaseId: result.id });
      return result.id;
    } else {
      const errorText = await response.text();
      logError('database creation', new Error(`Failed with ${response.status}: ${errorText}`));
      throw new Error(`Failed to create database: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    logError('database creation', error);
    throw error;
  }
}

// new function to verify if a Notion page exists
async function verifyPageExists(settings, pageId) {
  try {
    const url = `https://api.notion.com/v1/pages/${pageId}`;
    const headers = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Notion-Version': '2022-06-28'
    };

    debugLog(`✧ verifying page ID: ${pageId} ✧`);
    const response = await fetch(url, { method: 'GET', headers });
    
    if (response.ok) {
      debugLog('✧ page exists ✧');
      return true;
    } else if (response.status === 404) {
      debugLog('✧ page not found (404) ✧');
      return false;
    } else {
      const responseText = await response.text();
      logError('page verification', new Error(`Failed with ${response.status}: ${responseText}`));
      throw new Error(`Failed to verify page: ${response.status}`);
    }
  } catch (error) {
    logError('page verification', error);
    throw error;
  }
}

// improved function to create a Notion page (task)
async function createNotionPage(settings, databaseId, task, schema) {
  try {
    // verify database exists before proceeding
    const dbExists = await verifyDatabaseExists(settings, databaseId);
    if (!dbExists) {
      debugLog('✧ database does not exist, recreating it ✧');
      const newDatabaseId = await createOrGetDatabase(settings);
      if (!newDatabaseId) {
        throw new Error('Failed to recreate database');
      }
      // update the current database ID for this operation
      databaseId = newDatabaseId;
      // get fresh schema for the new database
      schema = await getDatabaseSchema(settings, newDatabaseId);
    }
    
    const notionData = mapCanvasTaskToNotion(task, databaseId, schema);
    const url = 'https://api.notion.com/v1/pages';
    const headers = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };
    
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        debugLog(`✧ using database ID: ${databaseId} ✧`);
        debugLog(`✧ Notion API URL: ${url} ✧`);
        debugLog('✧ task data being sent to Notion:', JSON.stringify(notionData, null, 2));
        
        const response = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(notionData)
        });
        
        const responseText = await response.text();
        debugLog(`✧ Notion API response (${response.status}):`, responseText);
        
        if (response.ok) {
          debugLog(`✧ task '${task.title}' added to notion ✧`);
          return JSON.parse(responseText);
        } else if ([429, 500, 502, 503, 504].includes(response.status)) {
          const waitTime = Math.pow(2, attempt);
          debugLog(`✧ got ${response.status}. waiting ${waitTime}s (attempt ${attempt}) ✧`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        } else {
          // handle 404 specifically
          if (response.status === 404 && attempt === 1) {
            debugLog('✧ got 404 on first attempt, trying to recreate database ✧');
            // force recreation of database
            await chrome.storage.sync.remove('databaseId');
            const newDatabaseId = await createOrGetDatabase(settings);
            if (newDatabaseId) {
              databaseId = newDatabaseId;
              schema = await getDatabaseSchema(settings, newDatabaseId);
              notionData.parent.database_id = newDatabaseId;
              continue; // try again with new database ID
            }
          }
          
          logError('task addition', new Error(`Failed with ${response.status}: ${responseText}`));
          throw new Error(`Failed to add task: ${response.status} - ${responseText}`);
        }
      } catch (error) {
        logError('task addition', error);
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  } catch (error) {
    logError('task addition', error);
    throw error;
  }
}

// function to verify database exists with improved debugging
async function verifyDatabaseExists(settings, databaseId) {
  try {
    const url = `https://api.notion.com/v1/databases/${databaseId}`;
    const headers = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Notion-Version': '2022-06-28'
    };

    debugLog(`✧ verifying database ID: ${databaseId} ✧`);
    
    const response = await fetch(url, { method: 'GET', headers });
    
    // get full response text for debugging
    const responseText = await response.text();
    debugLog(`✧ Notion API response (${response.status}):`, responseText);

    if (response.ok) {
      debugLog('✧ database exists ✧');
      return true;
    } else if (response.status === 404) {
      debugLog('✧ database not found (404) ✧');
      return false;
    } else {
      logError('database verification', new Error(`Failed with ${response.status}: ${responseText}`));
      throw new Error(`Failed to verify database: ${response.status}`);
    }
  } catch (error) {
    logError('database verification', error);
    throw error;
  }
}

// function to get database schema
async function getDatabaseSchema(settings, databaseId) {
  try {
    const url = `https://api.notion.com/v1/databases/${databaseId}`;
    const headers = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Notion-Version': '2022-06-28'
    };
    
    const response = await fetch(url, { 
      method: 'GET', 
      headers: headers 
    });
    
    if (response.ok) {
      const result = await response.json();
      if (!result.properties) {
        throw new Error('Invalid schema response: missing properties');
      }
      debugLog('✧ schema retrieved successfully ✧');
      return result.properties;
    } else {
      const errorText = await response.text();
      logError('schema retrieval', new Error(`Failed with ${response.status}: ${errorText}`));
      throw new Error(`Failed to retrieve schema: ${response.status}`);
    }
  } catch (error) {
    logError('schema retrieval', error);
    throw error;
  }
}

// function to update database title on Sundays
async function updateDatabaseTitle(settings, databaseId) {
  try {
    const startOfWeek = getStartOfWeek();
    const newTitle = `weekly tasks ✧ week of ${startOfWeek} ⋆`;
    
    const url = `https://api.notion.com/v1/databases/${databaseId}`;
    const headers = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };
    
    const data = {
      title: [
        { type: 'text', text: { content: newTitle } }
      ]
    };
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      debugLog(`✧ database title updated: ${newTitle} ✧`);
    } else {
      const errorText = await response.text();
      logError('title update', new Error(`Failed with ${response.status}: ${errorText}`));
      throw new Error(`Failed to update database title: ${response.status}`);
    }
  } catch (error) {
    logError('title update', error);
    throw error;
  }
}

// function to clean old tasks
async function cleanOldTasks(settings, databaseId, schema) {
  try {
    const startOfWeek = getStartOfWeek();
    const url = `https://api.notion.com/v1/databases/${databaseId}/query`;
    const headers = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };
    
    const filters = [
      { property: 'time due', date: { before: startOfWeek } }
    ];
    
    if ('already did this' in schema) {
      filters.push({ property: 'already did this', checkbox: { equals: true } });
    }
    
    const queryData = { 
      filter: { 
        or: filters 
      } 
    };
    
    debugLog(`✧ querying database with ID: ${databaseId} ✧`);
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(queryData)
    });
    
    if (response.ok) {
      const result = await response.json();
      const pages = result.results || [];
      
      if (pages.length > 0) {
        for (const page of pages) {
          await archivePage(settings, page.id);
        }
        debugLog(`✧ archived ${pages.length} old tasks ✧`);
      } else {
        debugLog('✧ no old tasks to archive ✧');
      }
    } else if (response.status === 404) {
      debugLog('✧ database not found (404), attempting to recreate it ✧');
      const newDatabaseId = await createOrGetDatabase(settings);
      debugLog(`✧ recreated database with ID: ${newDatabaseId} ✧`);
    } else {
      const errorText = await response.text();
      logError('task query', new Error(`Failed with ${response.status}: ${errorText}`));
      throw new Error(`Failed to query tasks: ${response.status}`);
    }
  } catch (error) {
    logError('task query', error);
    throw error;
  }
}

// function to archive a Notion page
async function archivePage(settings, pageId) {
  try {
    const url = `https://api.notion.com/v1/pages/${pageId}`;
    const headers = {
      'Authorization': `Bearer ${settings.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    };
    
    const data = { archived: true };
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify(data)
    });
    
    if (response.ok) {
      debugLog(`✧ archived page ${pageId} successfully ✧`);
    } else {
      const errorText = await response.text();
      logError('page archive', new Error(`Failed with ${response.status}: ${errorText}`));
      throw new Error(`Failed to archive page: ${response.status}`);
    }
  } catch (error) {
    logError('page archive', error);
    throw error;
  }
}

// function to map Canvas task to Notion format
function mapCanvasTaskToNotion(task, databaseId, schema) {
  const title = task.title || 'untitled task';
  const dueDate = task.due_date;
  const points = task.points || 0;
  const className = task.class || 'general';
  
  let day = 'monday';
  let formattedDate = null;
  
  if (dueDate) {
    try {
      const dt = new Date(dueDate);
      formattedDate = dt.toISOString();
      day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dt.getDay()];
    } catch (e) {
      logError('date parsing', e);
      formattedDate = dueDate;
    }
  }
  
  const status = task.completed ? 'completed' : 'active';
  
  const properties = {
    task: { title: [{ text: { content: title } }] },
    day: { select: { name: day } },
    points: { number: points },
    class: { rich_text: [{ text: { content: className } }] },
    status: { select: { name: status } }
  };
  
  if (formattedDate) {
    properties['time due'] = { date: { start: formattedDate } };
  }
  
  if ('already did this' in schema) {
    properties['already did this'] = { checkbox: false };
  }
  
  return {
    parent: { database_id: databaseId },
    properties: properties
  };
}

// helper function to check if today is Sunday
function isSunday() {
  return new Date().getDay() === 0;
}

// helper function to get start of week (Monday) in ISO format
function getStartOfWeek() {
  const today = new Date();
  const day = today.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust to get Monday
  const monday = new Date(today.setDate(diff));
  return monday.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}