# MFG Dashboard - AI Coding Agent Instructions

## Overview
This is a **React-based manufacturing dashboard** that displays real-time CNC machine job status by connecting to Google Apps Script backend APIs. The system is designed for live factory floor monitoring with automatic updates and responsive grid layouts.

## Architecture & Data Flow

### Frontend (React)
- **Main App**: `src/App.js` → `src/components/Dashboard.js` (single-page app)
- **Cards**: `src/components/MachineCard.js` displays individual job/machine status
- **API Service**: `src/services/api.js` handles all Google Apps Script communication
- **Polling Strategy**: 30-second intervals with version checking for efficiency

### Backend (Google Apps Script)
- **Complete Backend**: `google-apps-script-complete.js` (full production system)
- **Dashboard-Only API**: `dashboard-api.js` (lightweight read-only version)
- **Data Source**: Google Sheets "Production Summary" sheet
- **API Endpoints**: `?action=getActiveJobs`, `?action=getVersion`, `?action=test`

### Key Data Transformation Pattern
Jobs flow through this critical parsing pipeline in `Dashboard.js`:
```javascript
// Raw Google Sheets data → Enhanced job objects
const statusInfo = parseProcessStatus(job.processStatus, job.machine);
const transformedJobs = result.data.map(job => ({
  ...job,
  statusLED: { color: statusInfo.badgeColor },
  machines: statusInfo.machines, // Array of machine-status pairs
  aggregateStatus: statusInfo.aggregate // PAUSED, ACTIVE, OVERTIME, etc.
}));
```

## Critical Development Patterns

### Status Processing Logic
The `parseProcessStatus()` function in `Dashboard.js` is the **core business logic**:
- Parses comma-separated machine names and status strings
- Maps status priorities: `PAUSE` > `OT` > `OPEN` 
- Generates color codes: Red (paused), Blue (overtime), Green (active)
- Creates aggregate status with human-readable details

### Responsive Grid System
Dashboard uses **dynamic 2-row layout** with text scaling:
```javascript
// Auto-scales from 6 cards (normal) to 17+ cards (smallest text)
const calculateGridColumns = (cardCount) => Math.ceil(cardCount / 2);
const getTextScaleFactor = (cardCount) => {
  if (cardCount <= 6) return 1.0;
  if (cardCount <= 16) return 0.65;
  return 0.55; // 17+ cards
}
```

### Date/Time Handling Quirks
The system handles **mixed date formats** from Google Sheets:
- ISO format: `2025-08-28T02:43:23.368Z` 
- Thai CSV format: `28/7/2025, 9:57:15`
- Timezone: All backend times use `Asia/Bangkok`

### API Configuration
**Critical**: API URL is hardcoded in `src/services/api.js`:
```javascript
const API_CONFIG = {
  BASE_URL: 'https://script.google.com/macros/s/[SCRIPT_ID]/exec',
  REFRESH_INTERVAL: 30000,
  VERSION_CHECK_INTERVAL: 5000
};
```

## Development Workflows

### Local Development
```bash
npm start          # Start dev server (port 3000)
npm run build      # Production build
npm run deploy     # Deploy to GitHub Pages
```

### Testing API Connection
Use the built-in test endpoint: `?action=test` returns connection status and timestamp.

### Deployment Process
1. **Frontend**: Auto-deploys to GitHub Pages via `gh-pages` package
2. **Backend**: Manually deploy Google Apps Script files
3. **Configuration**: Update `API_CONFIG.BASE_URL` after backend deployment

## Google Apps Script Integration

### Deployment Strategy
- **Option 1**: Deploy `google-apps-script-complete.js` (full system with job control)
- **Option 2**: Deploy `dashboard-api.js` (read-only dashboard API)

### Required Google Sheets Structure
The backend expects "Production Summary" sheet with specific columns:
- Column 6: Status (`On Process`, `PAUSE`, `OT`)
- Column 7: Machine names (comma-separated for multi-machine jobs)
- Additional columns for part name, customer, drawing numbers, etc.

### Event-Driven Updates (Advanced)
The system supports **instant updates** via Google Apps Script edit triggers:
- Function: `onProductionSummaryEdit()` 
- Setup: Manual trigger configuration in Apps Script UI
- Benefit: Real-time updates instead of 30-second polling

## Component-Specific Patterns

### MachineCard Component
- **Time Calculations**: Uses `calculateJobAge()` to show "X hours Y minutes ago"
- **Multi-Machine Support**: Displays status badges for each machine in a job
- **Downtime Reasons**: Shows pause reasons in status banners

### Dashboard Component
- **Auto-Hide Header**: Disappears on scroll, reappears on mouse movement
- **Idle Detection**: Dims display after inactivity
- **Sort Logic**: Jobs sorted by start time (latest first), then machine name

## Common Issues & Solutions

### CORS Errors
Google Apps Script deployment must be set to "Anyone with access" for web app access.

### Date Parsing Failures
Always use the `parseDate()` utility in `Dashboard.js` - handles both ISO and Thai formats.

### Performance with Many Jobs
The responsive grid and text scaling automatically handles 20+ concurrent jobs.

### API Timeout Issues
Increase timeout in `api.js` if Google Sheets responses are slow:
```javascript
timeout: 15000 // Current setting
```

## Key Files to Understand
- `src/components/Dashboard.js` - Core business logic and data transformation
- `src/services/api.js` - All external API communication patterns
- `google-apps-script-complete.js` - Backend API implementation reference
- `src/components/Dashboard.css` - Responsive grid and animation patterns

## Project-Specific Conventions
- **Status Colors**: Consistent Red/Blue/Green across all components
- **Time Display**: Always 24-hour format (`HH:mm`)
- **Error Handling**: Log to console, show fallback values (never crash)
- **Data Freshness**: 30-second polling with version checking optimization