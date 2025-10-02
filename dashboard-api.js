/**
 * DASHBOARD API - SEPARATE DEPLOYMENT
 * Manufacturing Dashboard Backend Functions
 * 
 * This file contains only the dashboard-related functions extracted from the main backend.
 * Deploy this separately to Google Apps Script for the dashboard frontend.
 * 
 * DASHBOARD FUNCTIONS ONLY - NO JOB CONTROL LOGIC
 * Reads data from Production Summary sheet for dashboard display.
 */

// ========================================
// WEB SERVICE FUNCTIONS
// ========================================

/**
 * Handle GET requests for dashboard API
 */
function doGet(e) {
  // Dashboard API - Only if action parameter exists
  if (e.parameter.action) {
    try {
      const action = e.parameter.action;
      
      switch(action) {
        case 'getActiveJobs':
          return getDashboardActiveJobs();
        case 'getVersion':
          return getDashboardVersion();
        case 'test':
          return getDashboardTestConnection();
        default:
          return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: `Invalid dashboard action: ${action}. Available actions: getActiveJobs, getVersion, test`
          })).setMimeType(ContentService.MimeType.JSON);
      }
    } catch (error) {
      console.error('Dashboard API Error:', error);
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // Default response
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: "Invalid request. Use ?action=getActiveJobs, ?action=getVersion, or ?action=test"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle POST requests (not used by dashboard, return error)
 */
function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    error: "Dashboard API does not accept POST requests. Use GET with action parameter."
  })).setMimeType(ContentService.MimeType.JSON);
}

// ========================================
// DASHBOARD API FUNCTIONS
// ========================================

/**
 * Dashboard API: Get only active jobs from Production Summary sheet
 * SEPARATE FROM MAIN LOGGING FUNCTIONALITY
 */
function getDashboardActiveJobs() {
  try {
    const now = new Date().getTime();
    const cacheKey = 'dashboardActiveJobsCache';
    
    // Try to get cached data first (optimized for 10-20s polling)
    try {
      const cache = PropertiesService.getDocumentProperties();
      const cachedValue = cache.getProperty(cacheKey);
      if (cachedValue) {
        const cachedData = JSON.parse(cachedValue);
        // Use cache if it's less than 15 seconds old (shorter than polling interval)
        if (cachedData && (now - cachedData.timestamp) < 15000) {
          console.log('📦 Returning cached active jobs data');
          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            data: cachedData.data,
            timestamp: cachedData.originalTimestamp,
            count: cachedData.data.length,
            cached: true,
            cacheAge: Math.floor((now - cachedData.timestamp) / 1000)
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    } catch (cacheError) {
      // Continue without cache if error
      console.log('Cache read error:', cacheError);
    }
    
    // Fetch fresh data
    console.log('🔄 Fetching fresh active jobs data');
    
    // Use getActiveSpreadsheet to match original code pattern
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Production Summary');
    
    if (!sheet) {
      // Return empty result instead of error to avoid breaking main functionality
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        data: [],
        timestamp: new Date().toISOString(),
        count: 0,
        message: 'Production Summary sheet not found'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const allData = getDashboardSheetData(sheet);
    const activeJobs = allData.filter(job => 
      job.status === 'On Process'
    );
    
    const result = {
      success: true,
      data: activeJobs,
      timestamp: new Date().toISOString(),
      count: activeJobs.length,
      cached: false
    };
    
    // Cache the result for 15 seconds
    try {
      const cache = PropertiesService.getDocumentProperties();
      cache.setProperty(cacheKey, JSON.stringify({
        data: activeJobs,
        timestamp: now,
        originalTimestamp: result.timestamp
      }));
      console.log('💾 Cached active jobs data for 15 seconds');
    } catch (cacheError) {
      console.log('Cache write error:', cacheError);
      // Continue without caching if error
    }
    
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // Log error but don't break main functionality
    console.error('getDashboardActiveJobs Error:', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
      data: [],
      count: 0
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Dashboard API: Test connection
 */
function getDashboardTestConnection() {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Dashboard API is working!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Dashboard API: Get data version for event-driven updates
 * WORKS WITH EVENT TRIGGERS FOR MINIMAL EXECUTIONS
 */
function getDashboardVersion() {
  try {
    const now = new Date().getTime();
    const cacheKey = 'dashboardVersionCache';
    const invalidationKey = 'dashboardInvalidated';
    
    // Check if data was invalidated due to sheet edits
    let dataInvalidated = false;
    try {
      const cache = PropertiesService.getScriptProperties();
      const invalidationData = cache.getProperty(invalidationKey);
      if (invalidationData) {
        const invalidation = JSON.parse(invalidationData);
        // If invalidated in last 30 seconds, force fresh data
        if ((now - invalidation.timestamp) < 30000) {
          dataInvalidated = true;
          console.log('🔔 Data invalidated by sheet edit, forcing fresh data');
          cache.deleteProperty(invalidationKey); // Clear flag
        }
      }
    } catch (invalidationError) {
      // Continue without invalidation check
    }
    
    // Try to get cached version if not invalidated
    if (!dataInvalidated) {
      try {
        const cache = PropertiesService.getScriptProperties();
        const cachedValue = cache.getProperty(cacheKey);
        if (cachedValue) {
          const cachedData = JSON.parse(cachedValue);
          // Use cache if it's less than 8 seconds old (optimized for 10-20s polling)
          if (cachedData && (now - cachedData.timestamp) < 8000) {
            return ContentService.createTextOutput(JSON.stringify({
              success: true,
              version: cachedData.version,
              cached: true,
              eventDriven: true,
              cacheAge: Math.floor((now - cachedData.timestamp) / 1000)
            })).setMimeType(ContentService.MimeType.JSON);
          }
        }
      } catch (cacheError) {
        // Continue without cache if error
      }
    }
    
    // Fetch fresh data (only when invalidated or cache expired)
    const ss = SpreadsheetApp.openById('1-WD-HFlRKFUJJvM1mwPKR07J_xZ2nwPaEobLlRoUlVc');
    const sheet = ss.getSheetByName('Production Summary');
    
    if (!sheet) {
      throw new Error('Production Summary sheet not found');
    }
    
    // Improved change detection - check more data for better sensitivity
    const lastRow = sheet.getLastRow();
    
    console.log(`🔍 Checking sheet data: ${lastRow} rows`);
    
    // More comprehensive hash for better change detection
    let quickHash = lastRow * 31; // Base on row count
    if (lastRow > 1) {
      try {
        // Check status column (column 6) and machine column for more reliable detection
        const statusRange = sheet.getRange(2, 6, Math.min(10, lastRow - 1), 1); // Status column
        const machineRange = sheet.getRange(2, 7, Math.min(10, lastRow - 1), 1); // Machine column
        const statusValues = statusRange.getValues();
        const machineValues = machineRange.getValues();
        
        // Create hash from status and machine data
        for (let i = 0; i < statusValues.length; i++) {
          const statusVal = String(statusValues[i][0] || '');
          const machineVal = String(machineValues[i][0] || '');
          quickHash += (statusVal.length + machineVal.length) * (i + 1);
          // Add first character of each value for more sensitivity
          if (statusVal.length > 0) quickHash += statusVal.charCodeAt(0) * (i + 1);
          if (machineVal.length > 0) quickHash += machineVal.charCodeAt(0) * (i + 2);
        }
        
        console.log(`📊 Generated hash: ${Math.abs(quickHash) % 1000000} from ${statusValues.length} status entries`);
      } catch (hashError) {
        console.log('⚠️ Hash generation error, using timestamp fallback:', hashError);
        // Fallback to timestamp-based hash
        quickHash = lastRow * Math.floor(now / 30000); // Change every 30 seconds max
      }
    }
    
    const version = {
      lastModified: now,
      rowCount: lastRow,
      dataHash: Math.abs(quickHash) % 1000000,
      timestamp: new Date().toISOString(),
      eventDriven: true
    };
    
    console.log(`✅ Version generated:`, {
      rows: lastRow,
      hash: version.dataHash,
      timestamp: version.timestamp
    });
    
    // Cache for 8 seconds (optimized for 10-20s polling intervals)
    try {
      const cache = PropertiesService.getScriptProperties();
      cache.setProperty(cacheKey, JSON.stringify({
        version: version,
        timestamp: now
      }));
    } catch (cacheError) {
      // Continue without caching if error
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      version: version,
      cached: false,
      eventDriven: true,
      invalidated: dataInvalidated
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('getDashboardVersion Error:', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
      version: {
        lastModified: new Date().getTime(),
        rowCount: 0,
        dataHash: 0,
        timestamp: new Date().toISOString(),
        eventDriven: true
      }
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Parse sheet data into structured format for dashboard
 */
function getDashboardSheetData(sheet) {
  try {
    const values = sheet.getDataRange().getValues();
    if (!values || values.length === 0) {
      return [];
    }
    
    const headers = values[0];
    const data = [];
    
    // Find column indices (handle different column name variations)
    const colIndices = {
      projectNo: Math.max(headers.indexOf('Project No'), headers.indexOf('Project No.')),
      partName: headers.indexOf('Part Name'),
      customer: headers.indexOf('Customer'),
      drawingNo: Math.max(headers.indexOf('Drawing No'), headers.indexOf('Drawing No.')),
      quantityOrdered: headers.indexOf('Quantity Ordered'),
      projectStartDate: Math.max(
        headers.indexOf('Project Start date'), 
        headers.indexOf('Project Start Date'),
        headers.findIndex(h => h && h.trim().toLowerCase() === 'project start date')
      ),
      status: Math.max(headers.indexOf('Status'), headers.indexOf('STATUS')),
      machine: Math.max(headers.indexOf('Machine'), headers.indexOf('Machine no.')),
      process: Math.max(headers.indexOf('Process'), headers.indexOf('Lastest Process')),
      processNo: Math.max(headers.indexOf('Process No'), headers.indexOf('Process No.')),
      stepNo: Math.max(headers.indexOf('Step No'), headers.indexOf('Step No.')),
      startTime: Math.max(headers.indexOf('Start Time'), headers.indexOf('Start time')),
      operator: Math.max(headers.indexOf('Operator'), -1), // No operator column in CSV
      processStatus: Math.max(headers.indexOf('PROCESS STATUS'), headers.indexOf('Process Status')),
      downtime: headers.indexOf('Downtime')
    };
    
    // Debug: Log headers and column indices
    console.log('Headers:', headers);
    console.log('Column Indices:', colIndices);
    console.log('Project Start Date Index:', colIndices.projectStartDate);
    
    // Parse data rows (skip header)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      // Skip empty rows
      if (!row[colIndices.projectNo] && !row[colIndices.partName]) {
        continue;
      }
      
      const jobData = {
        projectNo: row[colIndices.projectNo] || '',
        partName: row[colIndices.partName] || '',
        customer: row[colIndices.customer] || '',
        drawingNo: row[colIndices.drawingNo] || '',
        quantityOrdered: row[colIndices.quantityOrdered] || 0,
        projectStartDate: row[colIndices.projectStartDate] || '',
        status: row[colIndices.status] || '',
        machine: row[colIndices.machine] || '',
        process: row[colIndices.process] || '',
        processNo: row[colIndices.processNo] || '',
        stepNo: row[colIndices.stepNo] || '',
        startTime: row[colIndices.startTime] || '',
        operator: row[colIndices.operator] || '',
        processStatus: row[colIndices.processStatus] || '',
        downtime: row[colIndices.downtime] || '',
        rowIndex: i + 1
      };
      
      data.push(jobData);
    }
    
    return data;
  } catch (error) {
    console.error('getDashboardSheetData Error:', error);
    return []; // Return empty array instead of throwing
  }
}

// ========================================
// CACHE MANAGEMENT FUNCTIONS
// ========================================

/**
 * Invalidate dashboard cache when data changes
 * DASHBOARD-ONLY FUNCTION
 * 
 * This function can be called manually or by triggers when the data changes
 */
function invalidateDashboardCache() {
  try {
    const scriptCache = PropertiesService.getScriptProperties();
    const documentCache = PropertiesService.getDocumentProperties();
    
    // Clear version cache to force fresh data
    scriptCache.deleteProperty('dashboardVersionCache');
    
    // Clear data caches (new for 10-20s polling optimization)
    documentCache.deleteProperty('dashboardActiveJobsCache');
    
    // Set invalidation flag with timestamp
    scriptCache.setProperty('dashboardInvalidated', JSON.stringify({
      timestamp: new Date().getTime(),
      reason: 'Manual cache invalidation or data change detected'
    }));
    
    console.log('🗑️ Dashboard cache invalidated due to data change (version + data caches cleared)');
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Dashboard cache invalidated successfully',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('Cache invalidation failed:', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Manual cache clear function (for testing/debugging)
 */
function clearAllDashboardCache() {
  try {
    const scriptCache = PropertiesService.getScriptProperties();
    const documentCache = PropertiesService.getDocumentProperties();
    
    // Clear all dashboard-related cache keys
    scriptCache.deleteProperty('dashboardVersionCache');
    scriptCache.deleteProperty('dashboardInvalidated');
    documentCache.deleteProperty('dashboardActiveJobsCache');
    
    console.log('🧹 All dashboard caches cleared manually');
    
    return {
      success: true,
      message: 'All dashboard caches cleared successfully',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Manual cache clear failed:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}