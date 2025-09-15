// ========================================
// FUNCTION INDEX - BACKEND.JS OVERVIEW
// ========================================
/*
UTILITY FUNCTIONS (Lines ~30-50):
  - getCNCLogSheet() - Get/create main CNC LOG sheet

STRING NORMALIZATION FUNCTIONS (Lines ~55-80):
  - normalize(str) - General string normalization
  - normalizeDrawingNo(str) - Drawing number specific normalization
  - normalizeProjectNo(str) - Project number normalization (removes leading zeros)

DATE AND TIME UTILITY FUNCTIONS (Lines ~85-120):
  - isWorkingDay(date) - Check if date is Mon-Sat
  - setTime(date, h, m) - Set specific time on date
  - formatLocalTimestamp(date) - Format as 'M/D/YYYY HH:mm:ss'
  - msToHHMMSS(ms) - Convert milliseconds to HH:mm:ss

TIME CALCULATION FUNCTIONS (Lines ~125-200):
  - calculateWorkingTimeMs(start, end, customWorkEnd) - Working hours calculation
  - calculateWorkingTime(start, end) - Legacy working time function
  - calculateOtTimeMs(start, end) - OT hours calculation (17:30-22:30)

PAUSE AND OT TIME FORMATTING FUNCTIONS (Lines ~205-300):
  - formatPauseTimesSummary(pauseTimes) - Format pause times for display
  - sumPauseTypeMs(pauseTimes, type) - Sum pause time by type
  - formatReasonSummary(pauseTimes) - Format pause reasons
  - getLastReasonByType(pauseTimes, type) - Get last reason of specific type
  - formatOtTimesSummary(otTimes) - Format OT times for display
  - autoStopOtSessions(otTimes) - Auto-stop OT at 22:30

SHEET FORMATTING FUNCTIONS (Lines ~305-370):
  - applyRowFormatting(sheet, rowNum) - Common row formatting logic
  - formatLastRow() - Format the last row in sheet
  - formatRow(rowNum) - Format specific row
  - fixDrawingNoColumn() - Fix date-to-string conversion in Drawing No column

JOB VALIDATION FUNCTIONS (Lines ~375-420):
  - isDuplicateOpenJob(data, sheet) - Check for duplicate open jobs

MAIN BUSINESS LOGIC FUNCTIONS (Lines ~425-1050):
  - submitLog(data) - Main entry point for all job operations
    ├── START_OT logic - Start overtime sessions
    ├── STOP_OT logic - Stop overtime sessions  
    ├── CONTINUE logic - Resume paused jobs
    ├── PAUSE logic - Pause active jobs
    └── CLOSE logic - Complete and close jobs

DAILY REPORT FUNCTIONS (Lines ~1055-1150):
  - getDailyReportSheet() - Get/create daily report sheet
  - submitDailyReport(data) - Submit daily report data

WEB SERVICE FUNCTIONS (Lines ~1155-1200):
  - doPost(e) - Handle POST requests from frontend
  - doGet(e) - Handle GET requests for open jobs query

SCHEDULED TASK FUNCTIONS (Lines ~1105-1144):
  - createDailyTrigger() - Set up 22:30 auto-stop trigger
  - autoStopAllOTJobs() - Auto-stop all OT jobs at 22:30
*/

// ========================================
// CONSTANTS AND CONFIGURATION
// ========================================

const SHEET_NAME = "CNC LOG";

const WORK_HOURS = {
  START: { h: 8, m: 30 },
  LUNCH_START: { h: 12, m: 0 },
  LUNCH_END: { h: 13, m: 0 },
  BREAK_START: { h: 15, m: 0 },
  BREAK_END: { h: 15, m: 10 },
  WORK_END: { h: 16, m: 45 }
};

const OT_HOURS = {
  START: { h: 17, m: 30 },
  END: { h: 22, m: 30 }
};
  // Utility to extract MFG value from QR code JSON
  function extractMFGField(data) {
    if (!data || !data.MFG) return '';
    if (Array.isArray(data.MFG)) {
      return data.MFG.join(',');
    }
    return data.MFG;
  }
  // ...existing code...

// ========================================
// DATA VALIDATION AND SAFETY FUNCTIONS
// ========================================

/**
 * Validates that critical data was written correctly to a row
 * Returns validation results to help detect write failures
 */
function validateRowData(sheet, rowNum, expectedValues) {
  const validationResults = {
    success: true,
    errors: [],
    warnings: []
  };
  
  try {
    // Get current row data
    const currentRow = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Check expected values
    for (const [colIndex, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = currentRow[colIndex - 1]; // Convert to 0-based index
      
      if (expectedValue !== null && actualValue !== expectedValue) {
        validationResults.success = false;
        validationResults.errors.push({
          column: colIndex,
          expected: expectedValue,
          actual: actualValue
        });
      }
    }
    
    // Check for critical empty values
    const criticalColumns = {
      13: 'End Employee Code',
      14: 'End Time',
      19: 'Status'
    };
    
    for (const [colIndex, description] of Object.entries(criticalColumns)) {
      const value = currentRow[colIndex - 1];
      if (value === null || value === undefined || value === '') {
        validationResults.warnings.push({
          column: colIndex,
          description: description,
          issue: 'Empty value'
        });
      }
    }
    
  } catch (validationError) {
    validationResults.success = false;
    validationResults.errors.push({
      type: 'validation_error',
      message: validationError.toString()
    });
  }
  
  return validationResults;
}

/**
 * Safely parses JSON with detailed error logging
 */
function safeParseJSON(jsonString, defaultValue = [], context = '') {
  try {
    return jsonString ? JSON.parse(jsonString) : defaultValue;
  } catch (parseError) {
    console.error(`❌ JSON parsing failed${context ? ' for ' + context : ''}:`, parseError);
    console.error('📋 Raw JSON string:', jsonString);
    return defaultValue;
  }
}

/**
 * Creates a data backup before critical operations
 */
function createDataBackup(sheet, rowNum) {
  try {
    const currentRow = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    const backup = {
      timestamp: new Date().toISOString(),
      rowNumber: rowNum,
      data: [...currentRow] // Create a copy
    };
    
    console.log(`💾 Created backup for row ${rowNum}`);
    return backup;
  } catch (backupError) {
    console.error(`❌ Failed to create backup for row ${rowNum}:`, backupError);
    return null;
  }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Get or create the main CNC LOG sheet
 */
function getCNCLogSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    console.error(`Sheet '${SHEET_NAME}' not found`);
    throw new Error(`Sheet '${SHEET_NAME}' not found`);
  }
  return sheet;
}

// ========================================
// STRING NORMALIZATION FUNCTIONS
// ========================================

function normalize(str) {
  // Convert to string, trim, remove invisible/zero-width chars, normalize Unicode, and lowercase
  return (str || '')
    .toString()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u202F\u2060\u180E]/g, '') // Remove zero-width/invisible spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()
    .toLowerCase();
}

function normalizeDrawingNo(str) {
  return (str || '').toString().replace(/^'/, '').trim().toLowerCase();
}

// Robust normalization for project numbers: remove leading zeros, invisible chars, normalize Unicode, trim, lowercase
function normalizeProjectNo(str) {
  return (str || '')
    .toString()
    .replace(/^0+/, '') // Remove leading zeros
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u202F\u2060\u180E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ========================================
// DATE AND TIME UTILITY FUNCTIONS
// ========================================

function isWorkingDay(date) {
  const day = date.getDay();
  // Sunday = 0, Saturday = 6
  return day >= 1 && day <= 6;
}

function setTime(date, h, m) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
}

// Helper: Format date as 'M/D/YYYY HH:mm:ss' in local time
function formatLocalTimestamp(date) {
  const d = new Date(date);
  const M = d.getMonth() + 1;
  const D = d.getDate();
  const Y = d.getFullYear();
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${M}/${D}/${Y} ${h}:${m}:${s}`;
}

// Helper: Convert ms to HH:mm:ss
function msToHHMMSS(ms) {
  // Return empty string for zero duration to avoid showing 0:00:00
  if (!ms || ms === 0) return '';
  
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Helper: Convert ms to HH:mm:ss with custom placeholder for zero values
function msToHHMMSSWithPlaceholder(ms, placeholder = '-') {
  // Return placeholder for zero duration
  if (!ms || ms === 0) return placeholder;
  
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ========================================
// TIME CALCULATION FUNCTIONS
// ========================================

// Helper: Calculate working time in ms between two dates, only counting working hours
function calculateWorkingTimeMs(start, end, customWorkEnd) {
  // Working hours: Mon-Sat, 08:30–12:00 and 13:00–16:45 (or custom)
  // Break: 15:00–15:10 (excluded)
  const WORK_END = customWorkEnd || WORK_HOURS.WORK_END;

  let totalMs = 0;
  let current = new Date(start);

  while (current < end) {
    if (isWorkingDay(current)) {
      // Morning session: 08:30–12:00
      let morningStart = setTime(current, WORK_HOURS.START.h, WORK_HOURS.START.m);
      let morningEnd = setTime(current, WORK_HOURS.LUNCH_START.h, WORK_HOURS.LUNCH_START.m);
      if (end > morningStart && start < morningEnd) {
        let sessionStart = new Date(Math.max(current, morningStart));
        let sessionEnd = new Date(Math.min(end, morningEnd));
        if (sessionEnd > sessionStart) totalMs += sessionEnd - sessionStart;
      }

      // Afternoon session 1: 13:00–15:00
      let afternoonStart = setTime(current, WORK_HOURS.LUNCH_END.h, WORK_HOURS.LUNCH_END.m);
      let breakStart = setTime(current, WORK_HOURS.BREAK_START.h, WORK_HOURS.BREAK_START.m);
      if (end > afternoonStart && start < breakStart) {
        let sessionStart = new Date(Math.max(current, afternoonStart));
        let sessionEnd = new Date(Math.min(end, breakStart));
        if (sessionEnd > sessionStart) totalMs += sessionEnd - sessionStart;
      }

      // Afternoon session 2: 15:10–WORK_END (16:45 or custom)
      let breakEnd = setTime(current, WORK_HOURS.BREAK_END.h, WORK_HOURS.BREAK_END.m);
      let afternoonEnd = setTime(current, WORK_END.h, WORK_END.m);
      if (end > breakEnd && start < afternoonEnd) {
        let sessionStart = new Date(Math.max(current, breakEnd));
        let sessionEnd = new Date(Math.min(end, afternoonEnd));
        if (sessionEnd > sessionStart) totalMs += sessionEnd - sessionStart;
      }
    }
    // Move to next day
    current = setTime(new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1), WORK_HOURS.START.h, WORK_HOURS.START.m);
  }
  return totalMs;
}

// Helper: Calculate working time between two dates, only counting working hours (legacy function for compatibility)
function calculateWorkingTime(start, end) {
  const totalMs = calculateWorkingTimeMs(start, end);
  return msToHHMMSS(totalMs);
}

// Helper: Calculate OT time in ms between two dates during OT hours (17:30-22:30)
function calculateOtTimeMs(start, end) {
  // OT hours: Mon-Sat, 17:30–22:30
  let totalMs = 0;
  let current = new Date(start);

  while (current < end) {
    if (isWorkingDay(current)) {
      // OT session: 17:30–22:30
      let otStart = setTime(current, OT_HOURS.START.h, OT_HOURS.START.m);
      let otEnd = setTime(current, OT_HOURS.END.h, OT_HOURS.END.m);
      
      if (end > otStart && start < otEnd) {
        let sessionStart = new Date(Math.max(current, otStart));
        let sessionEnd = new Date(Math.min(end, otEnd));
        if (sessionEnd > sessionStart) {
          totalMs += sessionEnd - sessionStart;
        }
      }
    }
    // Move to next day
    current = setTime(new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1), OT_HOURS.START.h, OT_HOURS.START.m);
  }
  return totalMs;
}

// Helper: Calculate total pause time in ms including both working hours AND OT hours
function calculateTotalPauseTimeMs(start, end) {
  // This function calculates pause duration spanning both working hours (08:30-16:45) 
  // and OT hours (17:30-22:30) to ensure accurate pause time tracking
  const workingTimeMs = calculateWorkingTimeMs(start, end);
  const otTimeMs = calculateOtTimeMs(start, end);
  return workingTimeMs + otTimeMs;
}

// Helper: Calculate pause time considering actual OT sessions (more accurate)
function calculatePauseTimeWithOTSessions(pauseStart, pauseEnd, otSessions) {
  // Calculate working hours pause time
  const workingTimeMs = calculateWorkingTimeMs(pauseStart, pauseEnd);
  
  // Calculate OT time only for periods that overlap with actual OT sessions
  let otTimeMs = 0;
  
  if (otSessions && otSessions.length > 0) {
    for (let otSession of otSessions) {
      if (otSession.start && otSession.end) {
        const otStart = new Date(otSession.start);
        const otEnd = new Date(otSession.end);
        
        // Check if pause period overlaps with this OT session
        const overlapStart = new Date(Math.max(pauseStart.getTime(), otStart.getTime()));
        const overlapEnd = new Date(Math.min(pauseEnd.getTime(), otEnd.getTime()));
        
        if (overlapEnd > overlapStart) {
          // Calculate OT time only during the overlap period
          otTimeMs += calculateOtTimeMs(overlapStart, overlapEnd);
        }
      }
    }
  }
  
  return workingTimeMs + otTimeMs;
}

// ========================================
// PAUSE AND OT TIME FORMATTING FUNCTIONS
// ========================================

// Helper: Format pause/resume summary for sheet
function formatPauseTimesSummary(pauseTimes, otSessions) {
  if (!pauseTimes || !pauseTimes.length) return '';
  var validPauses = [];
  var counter = 1;
  
  pauseTimes.forEach(function(p) {
    if (p.pause && p.resume) {
      // Completed pauses - แสดงการหยุดงานที่เสร็จสิ้นแล้ว
      var duration = msToHHMMSS(calculatePauseTimeWithOTSessions(new Date(p.pause), new Date(p.resume), otSessions));
      var typeLabel = (p.type === 'DOWNTIME') ? 'Downtime' : 'Normal Pause';
      var reason = p.reason ? ' - ' + p.reason : '';
      var pauseStart = p.pause_local || formatLocalTimestamp(p.pause);
      var pauseEnd = p.resume_local || formatLocalTimestamp(p.resume);
      
      validPauses.push(counter + '. ' + typeLabel + ': ' + pauseStart + ' ถึง ' + pauseEnd + ' (' + duration + ')' + reason);
      counter++;
    } else if (p.pause && !p.resume) {
      // Active pause - แสดงการหยุดงานที่กำลังดำเนินอยู่
      var typeLabel = (p.type === 'DOWNTIME') ? 'Downtime' : 'Normal Pause';
      var reason = p.reason ? ' - ' + p.reason : '';
      var pauseStart = p.pause_local || formatLocalTimestamp(p.pause);
      
      validPauses.push(counter + '. ' + typeLabel + ': ' + pauseStart + ' ถึง [กำลังหยุด]' + reason);
      counter++;
    }
  });
  
  return validPauses.join(' | ');
}

function sumPauseTypeMs(pauseTimes, type, otSessions) {
  if (!pauseTimes) return 0;
  return pauseTimes.reduce(function(sum, p) {
    if (p.type === type && p.pause && p.resume) {
      // Use accurate calculation that considers actual OT sessions
      return sum + calculatePauseTimeWithOTSessions(new Date(p.pause), new Date(p.resume), otSessions);
    }
    return sum;
  }, 0);
}

// Helper: Calculate total pause time with OT session awareness
function calculateTotalPauseTimeWithOTSessions(pauseTimes, otSessions) {
  if (!pauseTimes) return 0;
  let totalMs = 0;
  
  for (let p of pauseTimes) {
    if (p.pause && p.resume) {
      totalMs += calculatePauseTimeWithOTSessions(new Date(p.pause), new Date(p.resume), otSessions);
    }
  }
  
  return totalMs;
}

// Helper: Format reason summary with numbering from first to last
function formatReasonSummary(pauseTimes) {
  if (!pauseTimes || !pauseTimes.length) return '';
  var reasons = [];
  var counter = 1;
  
  pauseTimes.forEach(function(p) {
    if (p.reason && p.reason.trim()) {
      var typeLabel = (p.type === 'DOWNTIME') ? 'Downtime' : 'Normal Pause';
      reasons.push(counter + '. ' + typeLabel + ': ' + p.reason.trim());
      counter++;
    }
  });
  
  return reasons.join(' | ');
}

function getLastReasonByType(pauseTimes, type) {
  if (!pauseTimes) return '';
  for (let i = pauseTimes.length - 1; i >= 0; i--) {
    if (pauseTimes[i].type === type && pauseTimes[i].reason) {
      return pauseTimes[i].reason;
    }
  }
  return '';
}

// Helper: Format OT times summary with numbering
function formatOtTimesSummary(otTimes) {
  if (!otTimes || !otTimes.length) return '';
  var validOtSessions = [];
  var counter = 1;
  
  otTimes.forEach(function(ot) {
    if (ot.start && ot.end) {
      var startLocal = ot.start_local || formatLocalTimestamp(ot.start);
      var endLocal = ot.end_local || formatLocalTimestamp(ot.end);
      var duration = msToHHMMSS(calculateOtTimeMs(new Date(ot.start), new Date(ot.end)));
      var autoStoppedNote = ot.autoStopped ? ' (Auto-stopped)' : '';
      
      validOtSessions.push(counter + '. ' + startLocal + ' to ' + endLocal + ' (' + duration + ')' + autoStoppedNote);
      counter++;
    }
  });
  
  return validOtSessions.join(' | ');
}

// Helper: Set OT end to 22:30 if not stopped, and add a note (used by other functions)
function autoStopOtSessions(otTimes) {
  let changed = false;
  const now = new Date();
  
  otTimes.forEach(ot => {
    if (ot.start && !ot.end) {
      const startDate = new Date(ot.start);
      // Set end time to 22:30 of the same day as OT start
      const otEnd = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate(),
        OT_HOURS.END.h,
        OT_HOURS.END.m,
        0,
        0
      );
      
      // If current time is past 22:30 or we're on a different day, stop the OT
      if (now > otEnd || now.getDate() !== startDate.getDate()) {
        ot.end = otEnd.toISOString();
        ot.end_local = formatLocalTimestamp(otEnd);
        ot.autoStopped = true;
        ot.note = 'OT stopped automatically at 22:30';
        changed = true;
      }
    }
  });
  return changed;
}

// ========================================
// SHEET FORMATTING FUNCTIONS
// ========================================

/**
 * Common formatting logic for both formatLastRow and formatRow
 * Eliminates code duplication between the two functions
 */
function applyRowFormatting(sheet, rowNum) {
  try {
    const lastCol = sheet.getLastColumn();

    // Add borders to the row
    sheet.getRange(rowNum, 1, 1, lastCol).setBorder(true, true, true, true, true, true);

    // Center all columns except Part Name (column 4), Pause Times (col 20), and Pause Times Json (col 24), and Reason Summary (col 25)
    for (var col = 1; col <= lastCol; col++) {
      if (col === 4 || col === 20 || col === 24 || col === 25 || col === 27) {
        sheet.getRange(rowNum, col).setHorizontalAlignment("left");
      } else {
        sheet.getRange(rowNum, col).setHorizontalAlignment("center");
      }
    }

    // Get the value of the Status column (column 19) with retry mechanism
    var statusCell = sheet.getRange(rowNum, 19);
    var status = null;
    
    // Retry mechanism for status reading (addresses race condition)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        status = statusCell.getValue();
        if (status !== null && status !== undefined && status !== '') {
          break; // Successfully got a value
        }
        if (attempt < 2) {
          console.log(`⚠️ Status read attempt ${attempt + 1} returned empty, retrying...`);
          Utilities.sleep(100); // Small delay before retry
        }
      } catch (readError) {
        console.error(`❌ Status read attempt ${attempt + 1} failed:`, readError);
        if (attempt < 2) {
          Utilities.sleep(100);
        }
      }
    }
    
    // Normalize status value
    status = (status || '').toString().trim().toUpperCase();
    console.log(`🎨 Formatting row ${rowNum} with status: "${status}"`);

    // Set background and font color based on status (only the status cell)
    const statusStyles = {
      "OPEN": { background: "#FFF59D", color: "#222", weight: "bold" },
      "CLOSE": { background: "#00C853", color: "#fff", weight: "bold" },
      "FAILED CLOSE": { background: "#FF5252", color: "#fff", weight: "bold" },
      "PAUSE": { background: "#90caf9", color: "#222", weight: "bold" },
      "OT": { background: "#90caf9", color: "#222", weight: "bold" }
    };

    const style = statusStyles[status];
    if (style) {
      try {
        statusCell.setBackground(style.background);
        statusCell.setFontColor(style.color);
        statusCell.setFontWeight(style.weight);
        console.log(`✅ Applied ${status} formatting to row ${rowNum}`);
      } catch (formatError) {
        console.error(`❌ Failed to apply formatting to row ${rowNum}:`, formatError);
      }
    } else {
      // Default formatting for unrecognized status
      try {
        statusCell.setBackground(null);
        statusCell.setFontColor("#222");
        statusCell.setFontWeight("normal");
        console.log(`ℹ️ Applied default formatting to row ${rowNum} (status: "${status}")`);
      } catch (formatError) {
        console.error(`❌ Failed to apply default formatting to row ${rowNum}:`, formatError);
      }
    }
    
  } catch (formatError) {
    console.error(`❌ Critical error in applyRowFormatting for row ${rowNum}:`, formatError);
  }
}

// Add borders and color to the last row based on status
function formatLastRow() {
  var sheet = getCNCLogSheet();
  var lastRow = sheet.getLastRow();
  applyRowFormatting(sheet, lastRow);
}

function formatRow(rowNum) {
  var sheet = getCNCLogSheet();
  applyRowFormatting(sheet, rowNum);
}

function fixDrawingNoColumn() {
  var sheet = getCNCLogSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { // skip header
    var cell = data[i][4]; // Drawing No. is column 5 (index 4)
    if (cell instanceof Date) {
      // Convert date to d/m format
      var asString = cell.getDate() + '/' + (cell.getMonth() + 1);
      // Write back as a string with a leading single quote
      sheet.getRange(i + 1, 5).setValue("'" + asString);
    }
  }
}

// ========================================
// JOB VALIDATION FUNCTIONS
// ========================================

// Check for duplicate OPEN job with the same key fields
function isDuplicateOpenJob(data, sheet) {
  try {
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rowProjectNo = normalizeProjectNo(row[1]); // Column B (index 1) - Project No
      const rowPartName = normalize(row[3]); // Column D (index 3) - Part Name  
      const rowProcessName = normalize(row[6]); // Column G (index 6) - Process Name
      const rowProcessNo = String(row[7] || '').trim(); // Column H (index 7) - Process No
      const rowStepNo = String(row[8] || '').trim(); // Column I (index 8) - Step No
      const rowMachineNo = String(row[9] || '').trim().toUpperCase(); // Column J (index 9) - Machine No
      const rowStatus = String(row[18] || '').trim().toUpperCase(); // Column S (index 18) - Status
      
      // Check if this is an OPEN job with identical key fields
      if (rowStatus === 'OPEN' &&
          rowProjectNo === normalizeProjectNo(data.projectNo) &&
          rowPartName === normalize(data.partName) &&
          rowProcessName === normalize(data.processName) &&
          rowProcessNo === String(data.processNo || '').trim() &&
          rowStepNo === String(data.stepNo || '').trim() &&
          rowMachineNo === String(data.machineNo || '').trim().toUpperCase()) {
        
        return true;
      }
    }
  } catch (e) {
    console.error('Error in isDuplicateOpenJob:', e.toString());
  }
  return false;
}

// ========================================
// MAIN BUSINESS LOGIC FUNCTIONS
// ========================================

function submitLog(data) {
  console.log('📨 submitLog called with data:', JSON.stringify(data, null, 2));

  // Get fresh sheet data for each operation to avoid stale reads
  const sheet = getCNCLogSheet();
  
  // For critical operations, always get fresh data
  const values = sheet.getDataRange().getValues();
  console.log(`📊 Processing ${values.length - 1} rows from sheet`);

  // ←—— HERE'S THE ENHANCED GUARD: loosen for START_OT/STOP_OT but add logging
  if (
    data.status === "OPEN" ||
    data.action === "START_OT" ||
    data.action === "STOP_OT"
  ) {
    console.log('🔄 Processing START/OT/STOP logic; action=', data.action, 'status=', data.status);

    // START_OT logic
    if (String(data.action).toUpperCase().replace(/\s+/g, '') === 'START_OT') {
      console.log('🚀 START_OT: Processing START_OT request with data:', JSON.stringify(data));
      
      for (let i = values.length - 1; i > 0; i--) {
        const row = values[i];
        
        console.log(`🔍 START_OT: Checking row ${i}:`, {
          rowProjectNo: row[1],
          rowProcessName: row[6],
          rowProcessNo: row[7],
          rowStepNo: row[8],
          rowMachineNo: row[9],
          rowStatus: row[18],
          dataProjectNo: data.projectNo,
          dataProcessName: data.processName,
          dataProcessNo: data.processNo,
          dataStepNo: data.stepNo,
          dataMachineNo: data.machineNo,
          projectMatch: normalizeProjectNo(String(row[1])) == normalizeProjectNo(String(data.projectNo)),
          processNameMatch: normalize(String(row[6])) == normalize(String(data.processName)),
          processNoMatch: normalize(String(row[7])) == normalize(String(data.processNo)),
          stepNoMatch: normalize(String(row[8])) == normalize(String(data.stepNo)),
          machineNoMatch: normalize(String(row[9])) == normalize(String(data.machineNo)),
          statusMatch: (row[18] == "OPEN" || row[18] == "OT")
        });
        
        if (
          normalizeProjectNo(String(row[1])) == normalizeProjectNo(String(data.projectNo)) &&
          normalize(String(row[6])) == normalize(String(data.processName)) &&
          normalize(String(row[7])) == normalize(String(data.processNo)) &&
          normalize(String(row[8])) == normalize(String(data.stepNo)) &&
          normalize(String(row[9])) == normalize(String(data.machineNo)) &&
          (row[18] == "OPEN" || row[18] == "OT")
        ) {
          console.log('🔄 Starting START_OT operation for row:', i + 1);
          
          try {
            // Parse existing OT data with error handling
            let otTimes = [];
            try { 
              otTimes = row[25] ? JSON.parse(row[25]) : []; 
            } catch (e) { 
              console.error('Failed to parse OT times:', e);
              otTimes = []; 
            }
            
            // Auto-stop any existing open OT sessions first
            if (autoStopOtSessions(otTimes)) {
              console.log('🔄 Auto-stopped existing OT sessions');
            }
            
            // Time validation
            const now = new Date();
            const todayEndLimit = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              OT_HOURS.END.h,
              OT_HOURS.END.m,
              0,
              0
            );
            
            if (now >= todayEndLimit) {
              throw new Error("ไม่สามารถเริ่ม OT ได้หลัง 22:30");
            }
            
            const todayStartLimit = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              OT_HOURS.START.h,
              OT_HOURS.START.m,
              0,
              0
            );
            
            if (now < todayStartLimit) {
              throw new Error("ไม่สามารถเริ่ม OT ก่อน 17:30");
            }
            
            // Add new OT session
            otTimes.push({
              start: now.toISOString(),
              start_local: formatLocalTimestamp(now)
            });
            
            // ATOMIC UPDATE for START_OT
            const startOtUpdates = [
              [["OT"]],                        // Status (column 19)
              [[JSON.stringify(otTimes)]]      // OT Times JSON (column 26)
            ];
            
            const startOtRanges = [
              sheet.getRange(i + 1, 19, 1, 1),
              sheet.getRange(i + 1, 26, 1, 1)
            ];
            
            // Execute atomic update
            for (let idx = 0; idx < startOtRanges.length; idx++) {
              try {
                startOtRanges[idx].setValues(startOtUpdates[idx]);
              } catch (writeError) {
                console.error(`❌ Failed to write START_OT cell ${idx + 1}:`, writeError);
              }
            }
            
            SpreadsheetApp.flush();
            console.log('✅ START_OT operation completed successfully');
            
            // Apply formatting with delay
            Utilities.sleep(200);
            formatRow(i + 1);
            
            return;
            
          } catch (startOtError) {
            console.error('❌ Critical error in START_OT operation:', startOtError);
            throw new Error(`เกิดข้อผิดพลาดในการเริ่ม OT: ${startOtError.message}`);
          }
        }
      }
      throw new Error("ไม่พบงานที่เปิดอยู่สำหรับการเริ่ม OT\n(หมายเหตุ: หากงานอยู่ในสถานะพักงาน กรุณาดำเนินการต่อก่อนเริ่ม OT)");
    }

    // STOP_OT logic
    if (data.action === 'STOP_OT') {
      for (let i = values.length - 1; i > 0; i--) {
        const row = values[i];
        console.log('Comparing for OT STOP:', {
          rowIndex: i,
          projectNo: [normalizeProjectNo(row[1]), normalizeProjectNo(data.projectNo)],
          processName: [normalize(row[6]), normalize(data.processName)],
          processNo: [normalize(row[7]), normalize(data.processNo)],
          stepNo: [normalize(row[8]), normalize(data.stepNo)],
          machineNo: [normalize(row[9]), normalize(data.machineNo)],
          status: row[18]
        });
        if (
          normalizeProjectNo(row[1]) == normalizeProjectNo(data.projectNo) &&
          normalize(row[6]) == normalize(data.processName) &&
          normalize(row[7]) == normalize(data.processNo) &&
          normalize(row[8]) == normalize(data.stepNo) &&
          normalize(row[9]) == normalize(data.machineNo) &&
          (row[18] == "OT" || row[18] == "PAUSE")
        ) {
          console.log('🔄 Starting STOP_OT operation for row:', i + 1);
          
          try {
            // Parse existing OT data with error handling
            let otTimes = [];
            try { 
              otTimes = row[25] ? JSON.parse(row[25]) : []; 
            } catch (e) { 
              console.error('Failed to parse OT times:', e);
              otTimes = []; 
            }
            
            // Find and close open OT session
            let hasOpenOT = false;
            for (let j = otTimes.length - 1; j >= 0; j--) {
              if (otTimes[j].start && !otTimes[j].end) {
                const now = new Date();
                otTimes[j].end = now.toISOString();
                otTimes[j].end_local = formatLocalTimestamp(now);
                hasOpenOT = true;
                break;
              }
            }
            
            if (!hasOpenOT) {
              throw new Error("ไม่พบเซสชัน OT ที่เปิดอยู่สำหรับการหยุด OT");
            }
            
            // Calculate OT totals
            let totalOtMs = 0;
            for (let ot of otTimes) {
              if (ot.start && ot.end) {
                const start = new Date(ot.start);
                const end = new Date(ot.end);
                totalOtMs += calculateOtTimeMs(start, end);
              }
            }
            
            // Determine new status (preserve PAUSE if job was paused)
            const newStatus = row[18] === "PAUSE" ? "PAUSE" : "OPEN";
            
            // ATOMIC UPDATE for STOP_OT
            const stopOtUpdates = [
              [[newStatus]],                                      // Status (column 19)
              [[JSON.stringify(otTimes)]],                        // OT Times JSON (column 26)
              [[formatOtTimesSummary(otTimes)]],                  // OT Summary (column 27)
              [[msToHHMMSSWithPlaceholder(totalOtMs)]]            // OT Duration (column 28)
            ];
            
            const stopOtRanges = [
              sheet.getRange(i + 1, 19, 1, 1),
              sheet.getRange(i + 1, 26, 1, 1),
              sheet.getRange(i + 1, 27, 1, 1),
              sheet.getRange(i + 1, 28, 1, 1)
            ];
            
            // Execute atomic update
            for (let idx = 0; idx < stopOtRanges.length; idx++) {
              try {
                stopOtRanges[idx].setValues(stopOtUpdates[idx]);
              } catch (writeError) {
                console.error(`❌ Failed to write STOP_OT cell ${idx + 1}:`, writeError);
              }
            }
            
            SpreadsheetApp.flush();
            console.log('✅ STOP_OT operation completed successfully');
            
            // Apply formatting with delay
            Utilities.sleep(200);
            formatRow(i + 1);
            
            return;
            
          } catch (stopOtError) {
            console.error('❌ Critical error in STOP_OT operation:', stopOtError);
            throw new Error(`เกิดข้อผิดพลาดในการหยุด OT: ${stopOtError.message}`);
          }
        }
      }
      throw new Error("ไม่พบงานที่ตรงกันหรือไม่มีเซสชัน OT ที่เปิดอยู่สำหรับการหยุด OT");
    }

    // CONTINUE logic
    if (data.action === "CONTINUE") {
      console.log('CONTINUE action received. Incoming data:', JSON.stringify(data));
      for (let i = values.length - 1; i > 0; i--) {
        const row = values[i];
        console.log('Checking row', i, {
          projectNo: row[1],
          processName: row[6],
          processNo: row[7],
          stepNo: row[8],
          machineNo: row[9],
          status: row[18],
          norm_projectNo: normalizeProjectNo(row[1]),
          norm_data_projectNo: normalizeProjectNo(data.projectNo),
          norm_processName: normalize(row[6]),
          norm_data_processName: normalize(data.processName),
          norm_processNo: normalize(row[7]),
          norm_data_processNo: normalize(data.processNo),
          norm_stepNo: normalize(row[8]),
          norm_data_stepNo: normalize(data.stepNo),
          norm_machineNo: normalize(row[9]),
          norm_data_machineNo: normalize(data.machineNo)
        });
        if (
          normalizeProjectNo(row[1]) == normalizeProjectNo(data.projectNo) &&
          normalize(row[6]) == normalize(data.processName) &&
          normalize(row[7]) == normalize(data.processNo) &&
          normalize(row[8]) == normalize(data.stepNo) &&
          normalize(row[9]) == normalize(data.machineNo) &&
          row[18] == "PAUSE"
        ) {
          console.log('🔄 Starting CONTINUE operation for row:', i + 1);
          
          try {
            // Parse existing data with error handling
            let pauseTimes = [];
            let otTimes = [];
            try { 
              pauseTimes = JSON.parse(row[23] || "[]"); 
            } catch (e) { 
              console.error('Failed to parse pause times:', e);
              pauseTimes = []; 
            }
            try { 
              otTimes = row[25] ? JSON.parse(row[25]) : []; 
            } catch (e) { 
              console.error('Failed to parse OT times:', e);
              otTimes = []; 
            }
            
            // Find the last active pause
            let lastPauseIdx = pauseTimes.length - 1;
            while (
              lastPauseIdx >= 0 &&
              (!pauseTimes[lastPauseIdx].pause || pauseTimes[lastPauseIdx].resume)
            ) {
              lastPauseIdx--;
            }
            
            if (lastPauseIdx < 0) {
              throw new Error("ไม่พบช่วงเวลาหยุดที่ยังไม่ถูกดำเนินการต่อ");
            }

            // Resume the pause
            const resumeTime = new Date();
            pauseTimes[lastPauseIdx].resume = resumeTime.toISOString();
            pauseTimes[lastPauseIdx].resume_local = formatLocalTimestamp(resumeTime);
            if (!pauseTimes[lastPauseIdx].pause_local && pauseTimes[lastPauseIdx].pause) {
              pauseTimes[lastPauseIdx].pause_local = formatLocalTimestamp(pauseTimes[lastPauseIdx].pause);
            }

            // Context-aware status determination
            let shouldBeOT = false;
            const hasActiveOTSession = otTimes.some(ot => ot.start && !ot.end);
            
            const currentTime = new Date();
            const otStartToday = new Date();
            otStartToday.setHours(OT_HOURS.START.h, OT_HOURS.START.m, 0, 0);
            const otEndToday = new Date();
            otEndToday.setHours(OT_HOURS.END.h, OT_HOURS.END.m, 0, 0);
            const isWithinOTHours = currentTime >= otStartToday && currentTime <= otEndToday;
            
            shouldBeOT = hasActiveOTSession && isWithinOTHours;
            
            // Calculate totals
            let totalPaused = calculateTotalPauseTimeWithOTSessions(pauseTimes, otTimes);
            let totalDowntime = sumPauseTypeMs(pauseTimes, 'DOWNTIME', otTimes);
            let totalNormalPause = sumPauseTypeMs(pauseTimes, 'PAUSE', otTimes);
            
            // TRUE ATOMIC UPDATE for continue operation (columns 19-25)
            const continueRange = sheet.getRange(i + 1, 19, 1, 7); // 7 columns: 19-25
            const continueValues = [[
              shouldBeOT ? "OT" : "OPEN",                                // Column 19: Status
              formatPauseTimesSummary(pauseTimes, otTimes),              // Column 20: Pause Summary
              msToHHMMSSWithPlaceholder(totalDowntime),                  // Column 21: Downtime
              msToHHMMSSWithPlaceholder(totalNormalPause),               // Column 22: Normal Pause
              msToHHMMSSWithPlaceholder(totalPaused),                    // Column 23: Total Pause
              JSON.stringify(pauseTimes),                                // Column 24: Pause JSON
              formatReasonSummary(pauseTimes)                            // Column 25: Reason Summary
            ]];
            
            // Single atomic write
            console.log('📝 Executing atomic CONTINUE update');
            continueRange.setValues(continueValues);
            SpreadsheetApp.flush();
            console.log('✅ CONTINUE operation completed successfully');
            
            // Apply formatting with delay
            Utilities.sleep(200);
            formatRow(i + 1);
            console.log('🎨 Continue formatting applied');
            
            return;
            
          } catch (continueError) {
            console.error('❌ Critical error in CONTINUE operation:', continueError);
            throw new Error(`เกิดข้อผิดพลาดในการดำเนินงานต่อ: ${continueError.message}`);
          }
        }
      }
      throw new Error("ไม่พบงานที่อยู่ในสถานะ PAUSE สำหรับการดำเนินการต่อ");
    }

    // Duplicate‑OPEN check
    if (isDuplicateOpenJob(data, sheet)) {
      throw new Error(`พบงานที่เปิดอยู่แล้วในระบบ:\nProject: ${data.projectNo}\nPart: ${data.partName}\nProcess: ${data.processName} (${data.processNo})\nStep: ${data.stepNo}\nMachine: ${data.machineNo}\n\nกรุณาปิดงานเดิมก่อนเริ่มงานใหม่`);
    }

    // New OPEN row
    let logNos = [];
    if (sheet.getLastRow() > 1) {
      logNos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    }
    const maxLogNo = logNos.length ? Math.max(...logNos.filter(n => !isNaN(n) && n !== "")) : 0;
    const logNo = maxLogNo + 1;
      const row = [
  logNo,
  data.projectNo || "",
  data.customerName || "",
  data.partName || "",
  "'" + (data.drawingNo || ""),
  data.quantityOrdered || "",
  data.processName || "",
  data.processNo || "",
  data.stepNo || "",
  data.machineNo || "",
  data.employeeCode || "",
  new Date(),
  "", // End Employee Code
  "", // End Time
  "", // Process Time
  "", // FG
  "", // NG
  "", // Rework
  "OPEN", // Status
  "", // Pause Times
  "", // Total Downtime
  "", // Total Normal Pause
  "", // Total Pause Time
  JSON.stringify([]), // Pause time Json
  "", // เหตุผลพักงาน
  "", // OT Times (Json)
  "", // OT Times
  "", // OT Duration
  "", // Remark
  extractMFGField(data), // MFG
  "", // Date
  ""  // Month
      ];
  console.log('MFG value to append:', extractMFGField(data));
    console.log("Appending row:", row);
    sheet.appendRow(row);
    console.log("Row appended successfully");
    formatLastRow();
    return;

  } else if (data.status === "PAUSE") {
    // PAUSE logic
    console.log('PAUSE action received. Incoming data:', JSON.stringify(data));
    for (let i = values.length - 1; i > 0; i--) {
      const row = values[i];
      console.log('Checking row for PAUSE', i, {
        projectNo: row[1],
        processName: row[6],
        processNo: row[7],
        stepNo: row[8],
        machineNo: row[9],
        status: row[18],
        matchProject: normalizeProjectNo(row[1]) == normalizeProjectNo(data.projectNo),
        matchProcess: normalize(row[6]) == normalize(data.processName),
        matchProcessNo: normalize(row[7]) == normalize(data.processNo),
        matchStepNo: normalize(row[8]) == normalize(data.stepNo),
        matchMachineNo: normalize(row[9]) == normalize(data.machineNo),
        validStatus: (row[18] == "OPEN" || row[18] == "OT"),
        statusMatches: row[18]
      });
      
      // Enhanced status check for comparison
      const rawStatus = row[18];
      const trimmedStatus = (rawStatus || '').toString().trim();
      console.log('Enhanced status check:', {
        rawStatus: rawStatus,
        trimmedStatus: trimmedStatus,
        statusLength: trimmedStatus.length,
        statusCharCodes: trimmedStatus.split('').map(c => c.charCodeAt(0)),
        isOT: trimmedStatus === "OT",
        isOpen: trimmedStatus === "OPEN"
      });
      
      if (
        normalizeProjectNo(row[1]) == normalizeProjectNo(data.projectNo) &&
        normalize(row[6]) == normalize(data.processName) &&
        normalize(row[7]) == normalize(data.processNo) &&
        normalize(row[8]) == normalize(data.stepNo) &&
        normalize(row[9]) == normalize(data.machineNo) &&
        (trimmedStatus === "OPEN" || trimmedStatus === "OT")
      ) {
        console.log('🔄 Starting PAUSE operation for row:', i + 1);
        
        try {
          // Parse existing data with error handling
          let pauseTimes = [];
          let otTimes = [];
          try { 
            pauseTimes = JSON.parse(row[23] || "[]"); 
          } catch (e) { 
            console.error('Failed to parse pause times:', e);
            pauseTimes = []; 
          }
          try { 
            otTimes = row[25] ? JSON.parse(row[25]) : []; 
          } catch (e) { 
            console.error('Failed to parse OT times:', e);
            otTimes = []; 
          }
          
          const now = new Date();
          const pauseType = data.pauseType || "PAUSE";
          const pauseReason = data.pauseReason || "";
          const isOT = row[18] === "OT";
          
          // Add new pause entry
          pauseTimes.push({
            type: pauseType,
            reason: pauseReason,
            pause: now.toISOString(),
            pause_local: formatLocalTimestamp(now),
            wasInOT: isOT
          });
          
          // Calculate totals
          let totalPaused = calculateTotalPauseTimeWithOTSessions(pauseTimes, otTimes);
          let totalDowntime = sumPauseTypeMs(pauseTimes, 'DOWNTIME', otTimes);
          let totalNormalPause = sumPauseTypeMs(pauseTimes, 'PAUSE', otTimes);
          
          // TRUE ATOMIC UPDATE for pause operation (columns 19-25)
          const pauseRange = sheet.getRange(i + 1, 19, 1, 7); // 7 columns: 19-25
          const pauseValues = [[
            "PAUSE",                                                    // Column 19: Status
            formatPauseTimesSummary(pauseTimes, otTimes),              // Column 20: Pause Summary
            msToHHMMSSWithPlaceholder(totalDowntime),                  // Column 21: Downtime
            msToHHMMSSWithPlaceholder(totalNormalPause),               // Column 22: Normal Pause
            msToHHMMSSWithPlaceholder(totalPaused),                    // Column 23: Total Pause
            JSON.stringify(pauseTimes),                                // Column 24: Pause JSON
            formatReasonSummary(pauseTimes)                            // Column 25: Reason Summary
          ]];
          
          // Single atomic write
          console.log('📝 Executing atomic PAUSE update');
          pauseRange.setValues(pauseValues);
          SpreadsheetApp.flush();
          console.log('✅ PAUSE operation completed successfully');
          
          // Apply formatting with delay
          Utilities.sleep(200);
          formatRow(i + 1);
          console.log('🎨 Pause formatting applied');
          
          return;
          
        } catch (pauseError) {
          console.error('❌ Critical error in PAUSE operation:', pauseError);
          throw new Error(`เกิดข้อผิดพลาดในการหยุดงาน: ${pauseError.message}`);
        }
      }
    }
    throw new Error("ไม่พบงานที่อยู่ในสถานะ OPEN หรือ OT สำหรับการหยุดชั่วคราว");

  } else if (data.status === "CLOSE") {
    // STOP form submission
    let found = false;
    for (let i = values.length - 1; i > 0; i--) {
      const row = values[i];
      console.log('--- STOP FORM COMPARISON ---', {
        rowIndex: i,
        projectNo: row[1],
        processName: row[6],
        processNo: row[7],
        stepNo: row[8],
        machineNo: row[9],
        status: row[18],
        data: data
      });
      if (
        normalizeProjectNo(row[1]) == normalizeProjectNo(data.projectNo) &&
        normalize(row[6]) == normalize(data.processName) &&
        normalize(row[7]) == normalize(data.processNo) &&
        normalize(row[8]) == normalize(data.stepNo) &&
        normalize(row[9]) == normalize(data.machineNo)
      ) {
        if (row[18] == "PAUSE") {
          throw new Error('กรุณากด "ดำเนินงานต่อ" ก่อนที่จะกดปิดงาน งานที่คุณจะปิด อยู่ในสถานะพักงาน');
        }
        if (row[18] == "OPEN" || row[18] == "OT") {
          // --- TRULY ATOMIC CLOSE LOGIC START ---
          console.log('🔄 Starting CLOSE operation for row:', i + 1);
          
          try {
            // Capture end time and employee code with debugging
            const endTime = new Date();
            const endEmployeeCode = data.employeeCode || "";
            const startTime = row[11] instanceof Date ? row[11] : new Date(row[11]);
            
            // DEBUG: Log critical variables for Machine Setting
            console.log('🔍 CLOSE DEBUG INFO:', {
              processName: row[6],
              isMachineSetting: normalize(row[6]) === normalize('Machine Setting'),
              endTime: endTime,
              endTimeType: typeof endTime,
              endTimeValid: endTime instanceof Date,
              endTimeISO: endTime.toISOString(),
              endEmployee: endEmployeeCode
            });
            
            // Parse existing data with error handling
            let pauseTimes = [];
            let otTimes = [];
            try { 
              pauseTimes = JSON.parse(row[23] || "[]"); 
            } catch (e) { 
              console.error('Failed to parse pause times:', e);
              pauseTimes = []; 
            }
            try { 
              otTimes = JSON.parse(row[25] || "[]"); 
            } catch (e) { 
              console.error('Failed to parse OT times:', e);
              otTimes = []; 
            }

            // Handle OT session closure if job was in OT status
            let wasInOT = row[18] === "OT";
            if (wasInOT && otTimes.length > 0) {
              let lastOtSession = otTimes[otTimes.length - 1];
              if (lastOtSession.start && !lastOtSession.end) {
                lastOtSession.end = endTime.toISOString();
                lastOtSession.end_local = formatLocalTimestamp(endTime);
                console.log('🕐 Closed OT session at:', formatLocalTimestamp(endTime));
              }
            }

            // Auto-stop any other open OT sessions
            if (autoStopOtSessions(otTimes)) {
              console.log('🔄 Auto-stopped additional OT sessions');
            }

            // Calculate all totals ONCE
            let totalOtMs = 0;
            for (let ot of otTimes) {
              if (ot.start && ot.end) {
                const start = new Date(ot.start);
                const end = new Date(ot.end);
                totalOtMs += calculateOtTimeMs(start, end);
              }
            }

            let totalPaused = calculateTotalPauseTimeWithOTSessions(pauseTimes, otTimes);
            let totalDowntime = sumPauseTypeMs(pauseTimes, 'DOWNTIME', otTimes);
            let totalNormalPause = sumPauseTypeMs(pauseTimes, 'PAUSE', otTimes);

            // Calculate process time
            let customWorkEnd = undefined;
            if (normalize(row[6]) === normalize('Machine Setting')) {
              customWorkEnd = { h: 22, m: 30 };
            }
            let regularTimeMs = calculateWorkingTimeMs(startTime, endTime, customWorkEnd);
            let processMs = regularTimeMs + totalOtMs - totalPaused;
            if (processMs < 0) processMs = 0;

            // Prepare FG/NG/Rework values
            let fgValue, ngValue, reworkValue;
            if (normalize(row[6]) !== normalize('Machine Setting')) {
              fgValue = data.fg || 0;
              ngValue = data.ng || 0;
              reworkValue = data.rework || 0;
            } else {
              fgValue = '-';
              ngValue = '-';
              reworkValue = '-';
            }

            // TRUE ATOMIC UPDATE - Single API call for ALL data (columns 13-28)
            const updateRange = sheet.getRange(i + 1, 13, 1, 16); // 16 columns: 13 to 28

            // Ensure endTime is a proper Date object and convert to string if needed
            let safeEndTime = endTime instanceof Date ? endTime : new Date(endTime);
            if (isNaN(safeEndTime.getTime())) {
              // fallback to current time if invalid
              safeEndTime = new Date();
            }
            // Format as 'd/M/yyyy, HH:mm:ss' in Asia/Bangkok timezone
            const endTimeValue = Utilities.formatDate(safeEndTime, 'Asia/Bangkok', 'd/M/yyyy, HH:mm:ss');

            // Validate all update values
            const updateValues = [[
              endEmployeeCode || '',                                 // Column 13: End Employee
              endTimeValue,                                          // Column 14: End Time (validated)
              msToHHMMSSWithPlaceholder(processMs) || '',            // Column 15: Process Time
              fgValue != null ? fgValue : '',                        // Column 16: FG
              ngValue != null ? ngValue : '',                        // Column 17: NG
              reworkValue != null ? reworkValue : '',                // Column 18: Rework
              "CLOSE",                                               // Column 19: Status
              formatPauseTimesSummary(pauseTimes, otTimes) || '',    // Column 20: Pause Summary
              msToHHMMSSWithPlaceholder(totalDowntime) || '',        // Column 21: Downtime
              msToHHMMSSWithPlaceholder(totalNormalPause) || '',     // Column 22: Normal Pause
              msToHHMMSSWithPlaceholder(totalPaused) || '',          // Column 23: Total Pause
              JSON.stringify(pauseTimes) || '',                      // Column 24: Pause JSON
              formatReasonSummary(pauseTimes) || '',                 // Column 25: Reason Summary
              JSON.stringify(otTimes) || '',                         // Column 26: OT JSON
              formatOtTimesSummary(otTimes) || '',                   // Column 27: OT Summary
              msToHHMMSSWithPlaceholder(totalOtMs) || ''             // Column 28: OT Duration
            ]];

            // Log the values being written
            console.log('📝 ATOMIC UPDATE DEBUG:', {
              rowNumber: i + 1,
              processName: row[6],
              isMachineSetting: normalize(row[6]) === normalize('Machine Setting'),
              originalEndTime: endTime,
              safeEndTime: safeEndTime,
              endTimeValue: endTimeValue,
              updateValues_preview: {
                column13_endEmployee: updateValues[0][0],
                column14_endTime: updateValues[0][1],
                column14_endTime_type: typeof updateValues[0][1],
                column14_endTime_valid: !!updateValues[0][1],
                column15_processTime: updateValues[0][2],
                column19_status: updateValues[0][6]
              }
            });

            // SPECIAL MACHINE SETTING DEBUG: Try individual cell write for end time
            let atomicWriteSuccess = false;
            try {
              updateRange.setValues(updateValues);
              SpreadsheetApp.flush();
              atomicWriteSuccess = true;
              console.log('✅ Atomic write successful');
            } catch (writeError) {
              console.error('❌ Atomic write failed:', writeError);
              console.error('❌ Failed values:', updateValues);
              // Fallback: try to write End Time individually
              try {
                const endTimeCell = sheet.getRange(i + 1, 14, 1, 1);
                endTimeCell.setValue(endTimeValue);
                SpreadsheetApp.flush();
                const verifyEndTime = endTimeCell.getValue();
                console.log('🔧 Fallback individual end time write:', {
                  writtenValue: verifyEndTime,
                  valueType: typeof verifyEndTime,
                  isEmpty: !verifyEndTime || verifyEndTime === ""
                });
              } catch (individualError) {
                console.error('🔧 Individual end time write failed:', individualError);
              }
              throw new Error(`เกิดข้อผิดพลาดในการเขียนข้อมูล: ${writeError.message}`);
            }

            // SINGLE ATOMIC WRITE - All data written in one API call
            console.log('📝 Executing TRULY atomic write of 16 columns');
            try {
              updateRange.setValues(updateValues);
              console.log('✅ Atomic write successful');
            } catch (writeError) {
              console.error('❌ Atomic write failed:', writeError);
              console.error('❌ Failed values:', updateValues);
              throw new Error(`เกิดข้อผิดพลาดในการเขียนข้อมูล: ${writeError.message}`);
            }
            
            // Single flush after the atomic write
            SpreadsheetApp.flush();
            console.log('✅ CLOSE operation completed successfully with atomic write');
            
            // VERIFICATION: Read back the data to confirm it was written correctly
            try {
              const verificationRange = sheet.getRange(i + 1, 13, 1, 7); // Check first 7 columns of the update
              const writtenValues = verificationRange.getValues()[0];
              console.log('🔍 VERIFICATION - Data written to sheet:', {
                column13_endEmployee: writtenValues[0],
                column14_endTime: writtenValues[1],
                column15_processTime: writtenValues[2],
                column16_fg: writtenValues[3],
                column17_ng: writtenValues[4],
                column18_rework: writtenValues[5],
                column19_status: writtenValues[6],
                endTimeCheck: writtenValues[1] ? 'END_TIME_SAVED' : 'END_TIME_MISSING'
              });
              
              // SPECIAL MACHINE SETTING VERIFICATION
              if (normalize(row[6]) === normalize('Machine Setting')) {
                console.log('🔧 MACHINE SETTING END TIME SPECIFIC VERIFICATION:');
                const endTimeOnly = sheet.getRange(i + 1, 14, 1, 1).getValue();
                console.log('🔧 Direct end time cell read:', {
                  cellValue: endTimeOnly,
                  cellType: typeof endTimeOnly,
                  cellEmpty: !endTimeOnly || endTimeOnly === "",
                  cellString: String(endTimeOnly),
                  cellDate: endTimeOnly instanceof Date ? endTimeOnly.toISOString() : 'NOT_A_DATE'
                });
                
                // Check cell formatting
                const cellFormat = sheet.getRange(i + 1, 14, 1, 1).getNumberFormat();
                console.log('🔧 End time cell format:', cellFormat);
              }
            } catch (verifyError) {
              console.error('⚠️ Verification failed:', verifyError);
            }
            
            // Apply formatting with verification
            try {
              // Small delay to ensure Google Sheets has processed the status change
              Utilities.sleep(200);
              formatRow(i + 1);
              console.log('🎨 Formatting applied');
            } catch (formatError) {
              console.error('⚠️ Formatting failed but data was saved:', formatError);
            }
            
            found = true;
            return;
            
          } catch (closeError) {
            console.error('❌ Critical error in CLOSE operation:', closeError);
            throw new Error(`เกิดข้อผิดพลาดในการปิดงาน: ${closeError.message}`);
          }
        }
      }
    }
    if (!found) {
      throw new Error("ไม่เจอข้อมูลของการเริ่มงาน โปรดลองอีกครั้ง");
    }
  }
}

// ========================================
// DAILY REPORT FUNCTIONS
// ========================================

/**
 * Get or create the daily report sheet
 */
function getDailyReportSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName('รายงานประจำวัน');
  
  if (!sheet) {
    // Create sheet if it doesn't exist
    sheet = spreadsheet.insertSheet('รายงานประจำวัน');
    
    // Add headers
    const headers = [
      'Log No.',
      'วันที่',
      'Project No.',
      'Customer Name',
      'Part Name',
      'Drawing No.',
      'Quantity Ordered',
      'Process Name',
      'Process No.',
      'Step No.',
      'Machine No.',
      'รหัสพนักงาน',
      'FG',
      'NG',
      'Rework',
      'Remark',
      'Timestamp'
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format header row
    sheet.getRange(1, 1, 1, headers.length).setBackground('#4CAF50');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#FFFFFF');
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setHorizontalAlignment('center');
    
    // Set column widths
    sheet.setColumnWidth(1, 80);   // Log No.
    sheet.setColumnWidth(2, 100);  // วันที่
    sheet.setColumnWidth(3, 120);  // Project No.
    sheet.setColumnWidth(4, 150);  // Customer Name
    sheet.setColumnWidth(5, 150);  // Part Name
    sheet.setColumnWidth(6, 120);  // Drawing No.
    sheet.setColumnWidth(7, 120);  // Quantity Ordered
    sheet.setColumnWidth(8, 100);  // Process Name
    sheet.setColumnWidth(9, 80);   // Process No.
    sheet.setColumnWidth(10, 80);  // Step No.
    sheet.setColumnWidth(11, 100); // Machine No.
    sheet.setColumnWidth(12, 120); // รหัสพนักงาน
    sheet.setColumnWidth(13, 60);  // FG
    sheet.setColumnWidth(14, 60);  // NG
    sheet.setColumnWidth(15, 80);  // Rework
    sheet.setColumnWidth(16, 200); // Remark
    sheet.setColumnWidth(17, 150); // Timestamp
  }
  
  return sheet;
}

/**
 * Submit daily report data to the daily report sheet
 */
function submitDailyReport(data) {
  try {
    const sheet = getDailyReportSheet();
    
    // Generate auto-increment Log No.
    const lastRow = sheet.getLastRow();
    const logNo = lastRow > 1 ? lastRow : 1;
    
    // Create row data
    const row = [
      logNo,                   // Log No.
      data.date,               // วันที่
      data.projectNo,          // Project No.
      data.customerName,       // Customer Name
      data.partName,           // Part Name
      data.drawingNo,          // Drawing No.
      data.quantityOrdered,    // Quantity Ordered
      data.processName,        // Process Name
      data.processNo,          // Process No.
      data.stepNo,             // Step No.
      data.machineNo,          // Machine No.
      data.employeeCode,       // รหัสพนักงาน
      data.fg,                 // FG
      data.ng,                 // NG
      data.rework,             // Rework
      data.remark || '',       // Remark
      new Date()               // Timestamp
    ];
    
    // Append row to sheet
    sheet.appendRow(row);
    
    // Format the new row
    const newRowNum = sheet.getLastRow();
    sheet.getRange(newRowNum, 1, 1, row.length).setBorder(true, true, true, true, true, true);
    
    // Center align most columns except Remark
    for (let col = 1; col <= row.length; col++) {
      if (col === 16) { // Remark column
        sheet.getRange(newRowNum, col).setHorizontalAlignment('left');
      } else {
        sheet.getRange(newRowNum, col).setHorizontalAlignment('center');
      }
    }
    
    SpreadsheetApp.flush();
    
    return true;
    
  } catch (error) {
    throw new Error('เกิดข้อผิดพลาดในการบันทึกรายงานประจำวัน: ' + error.toString());
  }
}

/**
 * Submit QC report data to the main CNC LOG sheet
 */
function submitQCReport(data) {
  try {
    console.log('Submitting QC Report:', JSON.stringify(data));
    
    const sheet = getCNCLogSheet();
    const now = new Date();
    
    // Get next log number
    let logNos = [];
    if (sheet.getLastRow() > 1) {
      logNos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
    }
    const maxLogNo = logNos.length ? Math.max(...logNos.filter(n => !isNaN(n) && n !== "")) : 0;
    const logNo = maxLogNo + 1;
    
    // Create QC row with instant completion
    const row = [
      logNo,                                    // 1. Log No.
      data.projectNo || "",                     // 2. Project No.
      data.customerName || "",                  // 3. Customer Name
      data.partName || "",                      // 4. Part Name
      "'" + (data.drawingNo || ""),            // 5. Drawing No.
      data.quantityOrdered || "",               // 6. Quantity Ordered
      "QC",                                     // 7. Process Name
      "-",                                      // 8. Process No.
      "-",                                      // 9. Step No.
      "-",                                      // 10. Machine No.
      data.employeeCode || "",                  // 11. รหัสพนักงาน (who started)
      now,                                      // 12. Start Time
      data.employeeCode || "",                  // 13. รหัสพนักงานที่จบงาน (who ended)
      now,                                      // 14. End Time (same as start - instant)
      "-",                                      // 15. Process Time (QC is instant)
      data.fg || 0,                            // 16. FG
      data.ng || 0,                            // 17. NG (from QC form input)
      data.rework || 0,                        // 18. Rework (from QC form input)
      "CLOSE",                                  // 19. Status (immediately closed)
      "",                                       // 20. Pause Times
      "",                                       // 21. Total Downtime
      "",                                       // 22. Total Normal Pause
      "",                                       // 23. Total Pause Time
      JSON.stringify([]),                       // 24. Pause time Json
      "",                                       // 25. เหตุผลพักงาน
      JSON.stringify([]),                       // 26. OT Times (Json)
      "",                                       // 27. OT Times
      "",                                       // 28. OT Duration
      data.remark || ""                         // 29. Remark
    ];
    
    console.log("Appending QC row:", row);
    sheet.appendRow(row);
    
    // Format the new row using the standard formatting function
    formatLastRow();
    
    SpreadsheetApp.flush();
    
    return true;
    
  } catch (error) {
    throw new Error('เกิดข้อผิดพลาดในการบันทึก QC Report: ' + error.toString());
  }
}

// ========================================
// WEB SERVICE FUNCTIONS
// ========================================

function doPost(e) {
  var data = {};
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: "Invalid JSON format" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    if (data.action === 'DAILY_REPORT') {
      submitDailyReport(data);
      return ContentService.createTextOutput(JSON.stringify({ status: "OK" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'QC_REPORT') {
      submitQCReport(data);
      return ContentService.createTextOutput(JSON.stringify({ status: "OK" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    submitLog(data);
    return ContentService.createTextOutput(JSON.stringify({ status: "OK" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  if (e.parameter.mode === 'openJobs') {
    const projectNo = normalizeProjectNo(e.parameter.projectNo || '');
    const partName = normalize(e.parameter.partName || '');
    
    const sheet = getCNCLogSheet();
    const values = sheet.getDataRange().getValues();
    const openJobs = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      if (
        normalizeProjectNo(row[1]) == projectNo &&
        normalize(row[3]) == partName &&
        (row[18] == "OPEN" || row[18] == "PAUSE" || row[18] == "OT")
      ) {
        const job = {
          processName: row[6],
          processNo: row[7],
          stepNo: row[8],
          machineNo: row[9],
          status: row[18]
        };
        openJobs.push(job);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(openJobs))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput("Invalid request");
}

// ========================================
// SCHEDULED TASK FUNCTIONS
// ========================================

// Create a trigger to run at 22:30 every day
function createDailyTrigger() {
  // Delete any existing triggers first
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoStopAllOTJobs') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // Create new trigger for 22:30
  var now = new Date();
  var triggerTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), OT_HOURS.END.h, OT_HOURS.END.m, 0);
  if (now > triggerTime) {
    triggerTime.setDate(triggerTime.getDate() + 1);
  }
  
  ScriptApp.newTrigger('autoStopAllOTJobs')
    .timeBased()
    .at(triggerTime)
    .create();
}

// Function that runs automatically at 22:30 to stop all OT jobs
function autoStopAllOTJobs() {
  console.log('🔄 Starting auto-stop all OT jobs at 22:30');
  
  try {
    const sheet = getCNCLogSheet();
    let rowsChanged = 0;
    const batchUpdates = [];
    
    // Get fresh data to avoid stale reads
    const values = sheet.getDataRange().getValues();
    console.log(`📊 Processing ${values.length - 1} rows for auto-stop`);
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      try {
        // Parse OT data safely
        let otTimes = [];
        try { 
          otTimes = row[25] ? JSON.parse(row[25]) : []; 
        } catch (e) { 
          console.error(`Row ${i + 1}: Failed to parse OT times:`, e);
          continue;
        }
        
        // Only process rows with OT times
        if (otTimes.length === 0) continue;
        
        let changed = false;
        const now = new Date();
        
        // Check for open OT sessions
        for (let ot of otTimes) {
          if (ot.start && !ot.end) {
            const startDate = new Date(ot.start);
            const otEnd = new Date(
              startDate.getFullYear(),
              startDate.getMonth(),
              startDate.getDate(),
              OT_HOURS.END.h,
              OT_HOURS.END.m,
              0,
              0
            );
            
            // Only auto-stop if past 22:30 or different day
            if (now > otEnd || now.getDate() !== startDate.getDate()) {
              ot.end = otEnd.toISOString();
              ot.end_local = formatLocalTimestamp(otEnd);
              ot.autoStopped = true;
              ot.note = 'OT stopped automatically at 22:30';
              changed = true;
              console.log(`🕐 Auto-stopped OT for row ${i + 1}`);
            }
          }
        }
        
        if (changed) {
          // Calculate totals
          let totalOtMs = 0;
          for (let ot of otTimes) {
            if (ot.start && ot.end) {
              const start = new Date(ot.start);
              const end = new Date(ot.end);
              totalOtMs += calculateOtTimeMs(start, end);
            }
          }
          
          // Prepare batch updates for this row
          const rowUpdates = [
            {
              range: sheet.getRange(i + 1, 26, 1, 1),
              values: [[JSON.stringify(otTimes)]]
            },
            {
              range: sheet.getRange(i + 1, 27, 1, 1),
              values: [[formatOtTimesSummary(otTimes)]]
            },
            {
              range: sheet.getRange(i + 1, 28, 1, 1),
              values: [[msToHHMMSSWithPlaceholder(totalOtMs)]]
            }
          ];
          
          // Only change status if job was in OT status
          if (row[18] === "OT") {
            rowUpdates.push({
              range: sheet.getRange(i + 1, 19, 1, 1),
              values: [["OPEN"]]
            });
          }
          
          batchUpdates.push(...rowUpdates);
          rowsChanged++;
        }
        
      } catch (rowError) {
        console.error(`❌ Error processing row ${i + 1}:`, rowError);
        // Continue with other rows
      }
    }
    
    // Execute all batch updates atomically
    if (batchUpdates.length > 0) {
      console.log(`📝 Executing ${batchUpdates.length} batch updates for auto-stop`);
      
      for (const update of batchUpdates) {
        try {
          update.range.setValues(update.values);
        } catch (updateError) {
          console.error('❌ Failed to execute batch update:', updateError);
        }
      }
      
      SpreadsheetApp.flush();
      console.log(`✅ Auto-stop completed: ${rowsChanged} rows updated`);
    } else {
      console.log('ℹ️ No OT sessions required auto-stopping');
    }
    
    // Set up next day's trigger
    createDailyTrigger();
    
  } catch (e) {
    console.error('❌ Critical error in autoStopAllOTJobs:', e);
    // Still try to set up next trigger even if auto-stop failed
    try {
      createDailyTrigger();
    } catch (triggerError) {
      console.error('❌ Failed to create next day trigger:', triggerError);
    }
  }
}
