// BXP Token Keys - mapping job keys to their BXP token keys in inventory
const JOB_BXP_KEYS = {
  trucker: { bxpTokenKey: "exp_token_a|trucking|trucking", label: "Trucking" },
  mechanic: { bxpTokenKey: "exp_token_a|trucking|mechanic", label: "Mechanic" },
  garbage: { bxpTokenKey: "exp_token_a|trucking|garbage", label: "Garbage" },
  postop: { bxpTokenKey: "exp_token_a|trucking|postop", label: "PostOP" },
  pilot: { bxpTokenKey: "exp_token_a|piloting|piloting", label: "Airline" },
  helicopterpilot: { bxpTokenKey: "exp_token_a|piloting|heli", label: "Helicopter" },
  cargopilot: { bxpTokenKey: "exp_token_a|piloting|cargos", label: "Cargo" },
  busdriver: { bxpTokenKey: "exp_token_a|train|bus", label: "Bus Driver" },
  conductor: { bxpTokenKey: "exp_token_a|train|train", label: "Train" },
  emergency: { bxpTokenKey: "exp_token_a|ems|ems", label: "EMS" },
  firefighter: { bxpTokenKey: "exp_token_a|ems|fire", label: "Firefighting" },
  racer: { bxpTokenKey: "exp_token_a|player|racing", label: "Racing" },
  farmer: { bxpTokenKey: "exp_token_a|farming|farming", label: "Farming" },
  fisher: { bxpTokenKey: "exp_token_a|farming|fishing", label: "Fishing" },
  miner: { bxpTokenKey: "exp_token_a|farming|mining", label: "Mining" },
  business: { bxpTokenKey: "exp_token_a|business|business", label: "Business" },
  hunter: { bxpTokenKey: "exp_token_a|hunting|skill", label: "Hunting" },
  player: { bxpTokenKey: "exp_token_a|player|player", label: "Player" },
  strength: { bxpTokenKey: "exp_token_a|physical|strength", label: "Strength" },
};

// Storage keys
const STORAGE_KEYS = {
  POSITION: "bxp_tracker_position",
  SIZE: "bxp_tracker_size",
  FONT_SIZE: "bxp_font_size",
  SHOW_ZERO: "bxp_show_zero",
  AUTO_SELECT: "bxp_auto_select",
  TRACKING_DATA: "bxp_tracking_data"
};

// State
let bxpLogs = {}; // { jobKey: [{ time, bxp }, ...] }
let currentBxp = {}; // { jobKey: number }
let currentPrimary = {}; // { jobKey: number } - primary token amount
let currentSecondary = {}; // { jobKey: number } - secondary token amount
let sessionStart = {}; // { jobKey: timestamp }
let globalSessionStart = null; // Global timer start (first BXP gain across all jobs)
let autoSelectJobs = true;
let showZeroBxp = false;
let sessionPaused = false;
let pausedSessionElapsed = {}; // { jobKey: elapsedMs }

// DOM elements
const trackerApp = document.getElementById('tracker-app');
const summaryTbody = document.getElementById('summary-tbody');
const settingsPanel = document.getElementById('settings-panel');
const settingsIcon = document.getElementById('settings-icon');

// Initialize
function init() {
  loadSettings();
  restorePosition();
  restoreSize();
  setupEventListeners();
  setupDrag();
  setupResize();
  
  // Request initial data from game
  window.parent.postMessage({ type: "getData" }, "*");
  
  // Update display every second
  setInterval(updateDisplay, 1000);
}

// Load settings from localStorage
function loadSettings() {
  const storedData = localStorage.getItem(STORAGE_KEYS.TRACKING_DATA);
  if (storedData) {
    try {
      const data = JSON.parse(storedData);
      bxpLogs = data.bxpLogs || {};
      currentBxp = data.currentBxp || {};
      sessionStart = data.sessionStart || {};
      globalSessionStart = data.globalSessionStart || null;
      sessionPaused = data.sessionPaused || false;
      pausedSessionElapsed = data.pausedSessionElapsed || {};
    } catch (e) {
      console.warn("Failed to load tracking data:", e);
    }
  }
  
  const fontSize = localStorage.getItem(STORAGE_KEYS.FONT_SIZE) || "13";
  document.getElementById('font-size').value = fontSize;
  document.getElementById('font-size-value').textContent = fontSize;
  trackerApp.style.setProperty('--font-size', fontSize + 'px');
  
  showZeroBxp = localStorage.getItem(STORAGE_KEYS.SHOW_ZERO) === 'true';
  document.getElementById('show-zero-bxp').checked = showZeroBxp;
  
  autoSelectJobs = localStorage.getItem(STORAGE_KEYS.AUTO_SELECT) !== 'false';
  document.getElementById('auto-select-jobs').checked = autoSelectJobs;
  document.getElementById('toggle-auto-select').textContent = autoSelectJobs ? 'Disable Auto-Select' : 'Enable Auto-Select';
}

// Save tracking data
function saveTrackingData() {
  try {
    localStorage.setItem(STORAGE_KEYS.TRACKING_DATA, JSON.stringify({
      bxpLogs,
      currentBxp,
      sessionStart,
      globalSessionStart
      , sessionPaused,
      pausedSessionElapsed
    }));
  } catch (e) {
    console.warn("Failed to save tracking data:", e);
  }
}

// Pause the session timers (snapshot elapsed times)
function pauseSession() {
  sessionPaused = true;
  pausedSessionElapsed = {};
  const now = Date.now();
  Object.keys(sessionStart).forEach(jobKey => {
    const start = sessionStart[jobKey];
    if (start) pausedSessionElapsed[jobKey] = now - start;
  });
  saveTrackingData();
  updateDisplay();
  const btn = document.getElementById('pause-session-btn');
  if (btn) {
    btn.textContent = 'Pause/Start Timer';
    btn.title = 'Resume session';
  }
}

// Resume the session timers (restore start times shifted by paused elapsed)
function resumeSession() {
  const now = Date.now();
  Object.keys(pausedSessionElapsed).forEach(jobKey => {
    const elapsed = pausedSessionElapsed[jobKey];
    if (typeof elapsed === 'number') {
      sessionStart[jobKey] = now - elapsed;
    }
  });
  pausedSessionElapsed = {};
  sessionPaused = false;
  saveTrackingData();
  updateDisplay();
  const btn = document.getElementById('pause-session-btn');
  if (btn) {
    btn.textContent = 'Pause/Start Timer';
    btn.title = 'Pause session';
  }
}

function toggleSessionPause() {
  if (sessionPaused) resumeSession(); else pauseSession();
}

// Setup event listeners
function setupEventListeners() {
  // Settings panel toggle
  settingsIcon.onclick = () => {
    if (settingsPanel.style.display === 'none' || settingsPanel.style.display === '') {
      updateSettingsPanelPosition();
      settingsPanel.style.display = 'block';
    } else {
      settingsPanel.style.display = 'none';
    }
  };
  
  // Settings controls
  document.getElementById('show-zero-bxp').onchange = (e) => {
    showZeroBxp = e.target.checked;
    localStorage.setItem(STORAGE_KEYS.SHOW_ZERO, showZeroBxp);
    updateDisplay();
  };
  
  document.getElementById('auto-select-jobs').onchange = (e) => {
    autoSelectJobs = e.target.checked;
    localStorage.setItem(STORAGE_KEYS.AUTO_SELECT, autoSelectJobs);
    document.getElementById('toggle-auto-select').textContent = autoSelectJobs ? 'Disable Auto-Select' : 'Enable Auto-Select';
    updateDisplay();
  };
  
  document.getElementById('font-size').oninput = (e) => {
    const size = e.target.value;
    document.getElementById('font-size-value').textContent = size;
    trackerApp.style.setProperty('--font-size', size + 'px');
    localStorage.setItem(STORAGE_KEYS.FONT_SIZE, size);
  };
  
  document.getElementById('reload-button').onclick = () => {
    window.location.reload();
  };
  
  document.getElementById('toggle-auto-select').onclick = () => {
    autoSelectJobs = !autoSelectJobs;
    localStorage.setItem(STORAGE_KEYS.AUTO_SELECT, autoSelectJobs);
    document.getElementById('auto-select-jobs').checked = autoSelectJobs;
    document.getElementById('toggle-auto-select').textContent = autoSelectJobs ? 'Disable Auto-Select' : 'Enable Auto-Select';
    updateDisplay();
  };

  // Pause / Resume session button
  const pauseBtn = document.getElementById('pause-session-btn');
  if (pauseBtn) {
    pauseBtn.onclick = () => toggleSessionPause();
    // set initial label based on saved state
    pauseBtn.textContent = 'Pause/Start Timer';
    pauseBtn.title = sessionPaused ? 'Resume session' : 'Pause session';
  }
  
  // ESC key to pin window
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.parent.postMessage({ type: "pin" }, "*");
    }
  });
}

// Listen for game data
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "data" || !msg.data) return;
  
  const data = msg.data;
  
  // Parse inventory
  let invObj;
  try {
    invObj = typeof data.inventory === "string" ? JSON.parse(data.inventory) : data.inventory;
  } catch (e) {
    console.warn("Failed to parse inventory:", e);
    return;
  }
  
  if (!invObj || typeof invObj !== "object") {
    return;
  }
  
  const now = Date.now();
  
  // Process each job's BXP
  Object.keys(JOB_BXP_KEYS).forEach(jobKey => {
    const jobInfo = JOB_BXP_KEYS[jobKey];
    if (!jobInfo) return;
    
    const expectedKey = jobInfo.bxpTokenKey;
    const altKey = expectedKey.replace("exp_token_a|", "exp_token|");
    
    const primaryAmount = invObj[expectedKey]?.amount ?? 0;
    const secondaryAmount = invObj[altKey]?.amount ?? 0;
    const combinedAmount =  secondaryAmount;
    
    // Skip if no data for this job
    if (primaryAmount === 0 && secondaryAmount === 0 && 
        !(expectedKey in invObj) && !(altKey in invObj)) {
      return;
    }
    
    const amount = secondaryAmount; // Use secondary for tracking BXP rate
    const previousAmount = currentBxp[jobKey];
    
    // Store both amounts for display
    currentPrimary[jobKey] = primaryAmount;
    currentSecondary[jobKey] = secondaryAmount;
    
    // Initialize tracking for this job
    if (typeof previousAmount !== "number") {
      currentBxp[jobKey] = amount;
      bxpLogs[jobKey] = [{ time: now, bxp: amount }];
      // Don't start session timer yet - wait for first BXP gain
    } else if (amount !== previousAmount) {
      // BXP changed
      if (amount < previousAmount) {
        // BXP decreased (sold/given away) - reset tracking
        console.log(`BXP decreased for ${jobKey}: ${previousAmount} → ${amount}`);
        bxpLogs[jobKey] = [{ time: now, bxp: amount }];
        // Reset session start - will start again on next gain
        delete sessionStart[jobKey];
        // Also clear any paused elapsed time so it doesn't get restored on resume
        if (pausedSessionElapsed && pausedSessionElapsed[jobKey] != null) {
          delete pausedSessionElapsed[jobKey];
        }
      } else {
        // BXP increased - start session timer if not already started
        if (!sessionStart[jobKey]) {
          sessionStart[jobKey] = now;
        }
        
        // Start global session timer on first BXP gain
        if (globalSessionStart === null) {
          globalSessionStart = now;
        }
        
        // Add to log
        bxpLogs[jobKey].push({ time: now, bxp: amount });
        
        // Keep only last 120 entries (2 hours at 1 entry per minute)
        if (bxpLogs[jobKey].length > 120) {
          bxpLogs[jobKey] = bxpLogs[jobKey].slice(-120);
        }
      }
      
      currentBxp[jobKey] = amount;
      saveTrackingData();
    }
  });
  
  updateDisplay();
});

// Calculate BXP per hour for a job
function calculateBxpPerHour(jobKey) {
  const log = bxpLogs[jobKey] || [];
  if (log.length < 2) return null;
  
  const now = Date.now();
  const first = log[0];
  const last = log[log.length - 1];
  
  const duration = last.time - first.time;
  const bxpGained = last.bxp - first.bxp;
  
  if (duration <= 0 || bxpGained <= 0) return null;
  
  const hours = duration / (1000 * 60 * 60);
  if (hours <= 0) return null;
  
  // Use recent window (last 10 minutes) for more accurate rate if available
  const RECENT_WINDOW = 10 * 60 * 1000; // 10 minutes
  const recentEntries = log.filter(entry => now - entry.time <= RECENT_WINDOW);
  
  if (recentEntries.length >= 2) {
    const recentFirst = recentEntries[0];
    const recentLast = recentEntries[recentEntries.length - 1];
    const recentDuration = recentLast.time - recentFirst.time;
    const recentBxp = recentLast.bxp - recentFirst.bxp;
    
    if (recentDuration > 0 && recentBxp > 0) {
      const recentHours = recentDuration / (1000 * 60 * 60);
      if (recentHours > 0) {
        // Weighted average: 70% recent, 30% session
        const recentRate = recentBxp / recentHours;
        const sessionRate = bxpGained / hours;
        return Math.round(recentRate * 0.7 + sessionRate * 0.3);
      }
    }
  }
  
  return Math.round(bxpGained / hours);
}

// Calculate BXP per minute for a job
function calculateBxpPerMinute(jobKey) {
  const perHour = calculateBxpPerHour(jobKey);
  return perHour !== null ? Math.round(perHour / 60) : null;
}

// Format time duration
function formatDuration(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// Update display
function updateDisplay() {
  const jobsToShow = [];
  
  Object.keys(JOB_BXP_KEYS).forEach(jobKey => {
    const jobInfo = JOB_BXP_KEYS[jobKey];
    const bxp = currentBxp[jobKey] || 0;
    
    // Filter based on settings
    if (!showZeroBxp && bxp === 0) return;
    if (autoSelectJobs && bxp === 0) return;
    
    const bxpPerHour = calculateBxpPerHour(jobKey);
    const bxpPerMinute = calculateBxpPerMinute(jobKey);
    const startTime = sessionStart[jobKey];
    let sessionTime = null;
    if (startTime) {
      if (sessionPaused && pausedSessionElapsed[jobKey] != null) {
        sessionTime = pausedSessionElapsed[jobKey];
      } else {
        sessionTime = Date.now() - startTime;
      }
    }
    
    const primary = currentPrimary[jobKey] || 0;
    const secondary = currentSecondary[jobKey] || 0;
    const combined = primary + secondary;
    
    jobsToShow.push({
      jobKey,
      label: jobInfo.label,
      bxp,
      combined,
      bxpPerHour,
      bxpPerMinute,
      sessionTime
    });
  });
  
  // Sort by BXP per hour (descending), then by BXP (descending)
  jobsToShow.sort((a, b) => {
    const aRate = a.bxpPerHour || 0;
    const bRate = b.bxpPerHour || 0;
    if (aRate !== bRate) return bRate - aRate;
    return b.bxp - a.bxp;
  });
  
  // Render table
  if (jobsToShow.length === 0) {
    summaryTbody.innerHTML = '<tr><td colspan="6" class="no-data">No BXP data to display</td></tr>';
    return;
  }
  
  summaryTbody.innerHTML = jobsToShow.map(job => {
    const bxpPerHourDisplay = job.bxpPerHour !== null 
      ? `<span class="bxp-per-hour">${job.bxpPerHour.toLocaleString()}</span>`
      : '<span style="color: #666;">—</span>';
    
    const bxpPerMinuteDisplay = job.bxpPerMinute !== null
      ? `<span class="bxp-per-minute">${job.bxpPerMinute.toLocaleString()}</span>`
      : '<span style="color: #666;">—</span>';
    
    const sessionTimeDisplay = job.sessionTime !== null
      ? formatDuration(job.sessionTime)
      : '<span style="color: #666;">—</span>';
    
    return `
      <tr>
        <td>${job.label}</td>
        <td><span class="bxp-value">${job.bxp.toLocaleString()}</span></td>
        <td><span class="bxp-value">${job.combined.toLocaleString()}</span></td>
        <td>${bxpPerHourDisplay}</td>
        <td>${bxpPerMinuteDisplay}</td>
        <td class="session-time">${sessionTimeDisplay}</td>
      </tr>
    `;
  }).join('');
}

// Drag functionality
function setupDrag() {
  const dragHandle = document.getElementById('drag-handle');
  let isDragging = false;
  let dragOffsetX = 0, dragOffsetY = 0;
  
  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target === settingsIcon) return;
    isDragging = true;
    const rect = trackerApp.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      trackerApp.style.left = `${e.clientX - dragOffsetX}px`;
      trackerApp.style.top = `${e.clientY - dragOffsetY}px`;
      trackerApp.style.position = 'absolute';
      
      localStorage.setItem(STORAGE_KEYS.POSITION, JSON.stringify({
        left: trackerApp.style.left,
        top: trackerApp.style.top
      }));
      
      updateSettingsPanelPosition();
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = '';
  });
}

// Resize functionality
function setupResize() {
  const resizeHandle = document.getElementById('resize-handle');
  let isResizing = false;
  let startX = 0, startY = 0, startW = 0, startH = 0;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = trackerApp.getBoundingClientRect();
    startW = rect.width;
    startH = rect.height;
    document.body.style.userSelect = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const newW = Math.max(400, Math.min(window.innerWidth, startW + (e.clientX - startX)));
    const newH = Math.max(150, Math.min(window.innerHeight, startH + (e.clientY - startY)));
    trackerApp.style.width = newW + 'px';
    trackerApp.style.height = newH + 'px';
    
    updateSettingsPanelPosition();
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.userSelect = '';
      localStorage.setItem(STORAGE_KEYS.SIZE, JSON.stringify({
        width: trackerApp.style.width,
        height: trackerApp.style.height
      }));
    }
  });
}

// Restore position
function restorePosition() {
  const pos = localStorage.getItem(STORAGE_KEYS.POSITION);
  if (pos) {
    try {
      const { left, top } = JSON.parse(pos);
      trackerApp.style.left = left;
      trackerApp.style.top = top;
      trackerApp.style.position = 'absolute';
    } catch (e) {}
  }
}

// Restore size
function restoreSize() {
  const size = localStorage.getItem(STORAGE_KEYS.SIZE);
  if (size) {
    try {
      const { width, height } = JSON.parse(size);
      trackerApp.style.width = width;
      trackerApp.style.height = height;
    } catch (e) {}
  }
}

// Update settings panel position
function updateSettingsPanelPosition() {
  if (settingsPanel.style.display === 'block') {
    const rect = trackerApp.getBoundingClientRect();
    settingsPanel.style.top = `${rect.top}px`;
    settingsPanel.style.left = `${rect.right + 10}px`;
  }
}

// Initialize on load
init();

