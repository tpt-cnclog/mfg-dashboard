# MFG Dashboard

A real-time manufacturing dashboard that displays "On Process" CNC jobs with live data integration from Google Sheets.

🌐 **Live Demo**: https://tpt-cnclog.github.io/mfg-dashboard/

![Dashboard Preview](https://via.placeholder.com/800x400/667eea/ffffff?text=MFG+Dashboard)

## 🚀 Features

### Core Functionality
- **Real-time Data**: Auto-refreshes every 30 seconds with live job data
- **Job Monitoring**: Displays active CNC jobs with complete details
- **Job Age Tracking**: Shows how long each job has been running
- **Responsive Design**: Works on desktop, tablet, and large displays

### Advanced UI Features
- **True Fullscreen Mode**: Hide browser UI completely for wall-mounted displays
- **Auto-hiding Header**: Header disappears during scrolling and idle periods
- **Idle Detection**: Dimmed interface after 5 seconds of inactivity
- **5×2 Grid Layout**: Optimized for manufacturing floor viewing
- **Logo Integration**: Company branding in header

### Manufacturing-Focused
- **Machine Status**: Real-time status of CNC machines (CL08, MC13, etc.)
- **Process Tracking**: Shows current process (CRP, MRP) and step numbers
- **Job Details**: Drawing numbers, quantities, start times, and project info
- **Visual Status**: Color-coded status indicators for quick recognition

## 🛠️ Technology Stack

- **Frontend**: React 18.2.0
- **Styling**: Pure CSS with CSS Grid/Flexbox
- **Data Source**: Google Sheets via Google Apps Script API
- **HTTP Client**: Axios for API requests
- **Deployment**: Can be deployed to any static hosting service

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google Sheets with manufacturing data
- Google Apps Script setup for API

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/tpt-cnclog/mfg-dashboard.git
cd mfg-dashboard
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure API Endpoint
Edit `src/services/api.js` and update the API URL to your Google Apps Script:
```javascript
const API_BASE_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL';
```

### 4. Start Development Server
```bash
npm start
```

The dashboard will open at `http://localhost:3000`

## 🔧 Google Apps Script Setup

### 1. Create New Apps Script Project
1. Go to [Google Apps Script](https://script.google.com)
2. Create a new project
3. Replace the default code with the content from `google-apps-script-complete.js`

### 2. Configure Sheet Access
Update the script with your Google Sheet ID:
```javascript
const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
const SHEET_NAME = 'Production Summary'; // Or your sheet name
```

### 3. Deploy as Web App
1. Click "Deploy" → "New deployment"
2. Choose "Web app" as type
3. Set execute as "Me" 
4. Set access to "Anyone"
5. Deploy and copy the web app URL

### 4. Update API Configuration
Use the deployed web app URL in your React app's API configuration.

## 📊 Data Format

The Google Sheets should contain columns for:
- **STATUS**: Job status (must contain "On Process" for active jobs)
- **Machine no.**: Machine identifier (CL08, MC13, etc.)
- **PROCESS**: Current process (CRP, MRP, etc.)
- **PROCESS NO.**: Process step number
- **STEP**: Current step number
- **Drawing No.**: Part drawing number
- **Quantity Ordered**: Number of parts
- **START DATE**: Job start date
- **START TIME**: Job start time

## 🎮 Usage

### Normal Mode
- View all active jobs in a 5×2 grid layout
- Auto-refreshing header with job count and last update time
- Click refresh button for manual updates

### Fullscreen Mode
- Click "⛶ Full Screen" button or press `F` key
- True fullscreen mode hides all browser UI
- Perfect for wall-mounted displays
- Press `Escape` or click ✕ to exit

### Keyboard Shortcuts
- `F` or `F11`: Enter fullscreen mode
- `Escape`: Exit fullscreen mode

## 🔧 Configuration

### Refresh Interval
Change auto-refresh interval in `src/components/Dashboard.js`:
```javascript
const REFRESH_INTERVAL = 30000; // 30 seconds
```

### Grid Layout
Modify grid layout in `src/components/Dashboard.css`:
```css
.jobs-grid {
  grid-template-columns: repeat(5, 1fr); /* 5 columns */
}
```

### Styling Customization
- Update colors and themes in CSS files
- Modify card layouts in `MachineCard.css`
- Adjust responsive breakpoints as needed

## 📱 Responsive Design

- **Desktop**: 5×2 grid layout for optimal viewing
- **Tablet**: Responsive grid that adapts to screen size
- **Large Displays**: Fullscreen mode optimized for manufacturing floors

## 🚀 Deployment

### GitHub Pages (Automated)
```bash
npm run deploy
```
Automatically builds and deploys to: https://tpt-cnclog.github.io/mfg-dashboard/

### Static Hosting (Manual)
```bash
npm run build
```
Deploy the `build` folder to:
- Netlify
- Vercel
- AWS S3
- Any static hosting service

### Network Access
For local network access (manufacturing floor):
```bash
npm start -- --host 0.0.0.0
```
Access via: `http://YOUR_IP_ADDRESS:3000`

## 🔒 Security Considerations

- Google Apps Script handles CORS automatically
- No sensitive data is stored in the frontend
- All data comes from your private Google Sheets
- Consider implementing authentication for production use

## 🐛 Troubleshooting

### Common Issues

1. **No Data Showing**
   - Check Google Apps Script deployment URL
   - Verify sheet permissions and data format
   - Check browser console for API errors

2. **Fullscreen Not Working**
   - Some browsers block fullscreen requests
   - Ensure user interaction before fullscreen request
   - Check browser compatibility

3. **Network Access Issues**
   - Verify firewall settings
   - Check network configuration
   - Ensure proper CORS setup in Apps Script

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For support and questions:
- Create an issue in this repository
- Check the troubleshooting section above
- Review the Google Apps Script documentation

---

**Built for manufacturing excellence** 🏭