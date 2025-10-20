import React, { useState, useEffect, useCallback } from 'react';
import MachineCard from './MachineCard';
import manufacturingAPI from '../services/api';
import './Dashboard.css';

// Enhanced status parsing utility functions
const parseProcessStatus = (processStatusString, machineString, processString, processNoString, stepString, startTimeString, dueDateString, downtimeString) => {
  // Debug logging
  console.log('parseProcessStatus called with:', { 
    processStatusString, 
    machineString, 
    processString, 
    processNoString, 
    stepString, 
    startTimeString,
    dueDateString,
    downtimeString 
  });
  
  if (!processStatusString || !machineString) {
    console.log('Missing data - processStatus:', processStatusString, 'machine:', machineString);
    return { 
      aggregate: 'UNKNOWN', 
      machines: [],
      detail: 'No status data'
    };
  }
  
  // Parse comma-separated values, handle quoted strings
  const statuses = processStatusString.replace(/"/g, '').split(',').map(s => s.trim().toUpperCase());
  const machines = machineString.replace(/"/g, '').split(',').map(m => m.trim());
  const processes = processString ? processString.replace(/"/g, '').split(',').map(p => p.trim()) : [];
  const processNumbers = processNoString ? processNoString.replace(/"/g, '').split(',').map(p => p.trim()) : [];
  const steps = stepString ? stepString.replace(/"/g, '').split(',').map(s => s.trim()) : [];
  
  // Special handling for start times - they come as "date, time, date, time" format
  // We need to recombine them into proper datetime strings
  const rawStartTimes = startTimeString ? startTimeString.replace(/"/g, '').split(',').map(t => t.trim()) : [];
  const startTimes = [];
  for (let i = 0; i < rawStartTimes.length; i += 2) {
    if (i + 1 < rawStartTimes.length) {
      // Combine date and time parts
      startTimes.push(`${rawStartTimes[i]}, ${rawStartTimes[i + 1]}`);
    } else {
      // If odd number, just use what we have
      startTimes.push(rawStartTimes[i]);
    }
  }
  
  // Same handling for due dates if they have the same format
  const rawDueDates = dueDateString ? dueDateString.replace(/"/g, '').split(',').map(d => d.trim()) : [];
  const dueDates = [];
  for (let i = 0; i < rawDueDates.length; i += 2) {
    if (i + 1 < rawDueDates.length && rawDueDates[i + 1].includes(':')) {
      // If next item looks like time, combine them
      dueDates.push(`${rawDueDates[i]}, ${rawDueDates[i + 1]}`);
    } else {
      // Otherwise, just use the date part
      dueDates.push(rawDueDates[i]);
    }
  }
  
  const downtimes = downtimeString ? downtimeString.replace(/"/g, '').split(',').map(d => d.trim()) : [];
  
  // Create machine-status pairs with full process details
  const machineStatuses = machines.map((machine, index) => ({
    name: machine,
    status: statuses[index] || 'UNKNOWN',
    processName: processes[index] || 'N/A',
    processNumber: processNumbers[index] || 'N/A',
    stepNumber: steps[index] || 'N/A',
    startTime: startTimes[index] || startTimeString,
    dueDate: dueDates[index] || dueDateString,
    downtime: '', // Will be assigned based on status below
    color: getStatusColor(statuses[index] || 'UNKNOWN'),
    emoji: getStatusEmoji(statuses[index] || 'UNKNOWN')
  }));
  
  // Assign downtime reasons to paused machines
  const pausedMachineIndices = machineStatuses
    .map((machine, index) => machine.status.includes('PAUSE') ? index : -1)
    .filter(index => index !== -1);
  
  // Distribute downtime reasons to paused machines
  pausedMachineIndices.forEach((machineIndex, downtimeIndex) => {
    if (downtimeIndex < downtimes.length && downtimes[downtimeIndex]) {
      machineStatuses[machineIndex].downtime = downtimes[downtimeIndex];
    } else if (downtimes.length > 0 && downtimes[0]) {
      // If there are fewer downtime reasons than paused machines, use the first one
      machineStatuses[machineIndex].downtime = downtimes[0];
    }
  });
  
  // Count status types
  const pausedMachines = machineStatuses.filter(m => m.status.includes('PAUSE'));
  const otMachines = machineStatuses.filter(m => m.status.includes('OT'));
  const activeMachines = machineStatuses.filter(m => m.status.includes('OPEN'));
  
  // Determine aggregate status with priority: PAUSE > OT > OPEN
  let aggregate, detail, badgeColor;
  if (pausedMachines.length > 0) {
    if (pausedMachines.length === machines.length) {
      aggregate = 'PAUSED';
      detail = `All machines paused`;
      badgeColor = '#f44336'; // Red
    } else {
      aggregate = 'PARTIAL_PAUSE';
      detail = `${pausedMachines.map(m => m.name).join(', ')} paused`;
      badgeColor = '#f44336'; // Red
    }
  } else if (otMachines.length > 0) {
    aggregate = 'OVERTIME';
    detail = `${otMachines.map(m => m.name).join(', ')} in overtime`;
    badgeColor = '#2196f3'; // Blue
  } else if (activeMachines.length > 0) {
    aggregate = 'ACTIVE';
    detail = null; // Remove detail for active machines
    badgeColor = '#4caf50'; // Green
  } else {
    aggregate = 'UNKNOWN';
    detail = 'Status unclear';
    badgeColor = '#9e9e9e'; // Gray
  }
  
  return { aggregate, machines: machineStatuses, detail, badgeColor };
};

const getStatusColor = (status) => {
  if (status.includes('PAUSE')) return '#f44336'; // Red
  if (status.includes('OT')) return '#2196f3';    // Blue
  if (status.includes('OPEN')) return '#4caf50';  // Green
  return '#9e9e9e'; // Gray
};

const getStatusEmoji = (status) => {
  if (status.includes('PAUSE')) return '🔴';
  if (status.includes('OT')) return '🔵';
  if (status.includes('OPEN')) return '🟢';
  return '⚪';
};

const Dashboard = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Global sort function for consistent job ordering
  const sortJobs = useCallback((jobsToSort) => {
    return [...jobsToSort].sort((a, b) => {
      // Helper function to parse dates robustly
      const parseDate = (dateStr) => {
        if (!dateStr) return new Date(0);
        
        let date = new Date(dateStr);
        if (!isNaN(date.getTime())) return date;
        
        // Try parsing Thai format: DD/MM/YYYY HH:mm
        const thaiMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
        if (thaiMatch) {
          const day = parseInt(thaiMatch[1]);
          const month = parseInt(thaiMatch[2]) - 1;
          const year = parseInt(thaiMatch[3]);
          const hour = parseInt(thaiMatch[4]);
          const minute = parseInt(thaiMatch[5]);
          date = new Date(year, month, day, hour, minute);
          if (!isNaN(date.getTime())) return date;
        }
        
        return new Date(0);
      };
      
      const dateA = parseDate(a.startTime);
      const dateB = parseDate(b.startTime);
      
      // Primary sort: by date (latest first)
      const dateDiff = dateB.getTime() - dateA.getTime();
      if (dateDiff !== 0) return dateDiff;
      
      // Secondary sort: by machine name for consistent ordering
      const machineA = (a.machineNo || '').toString();
      const machineB = (b.machineNo || '').toString();
      return machineA.localeCompare(machineB);
    });
  }, []);
  
  // Ensure jobs stay sorted whenever they change
  useEffect(() => {
    if (jobs.length > 0) {
      const sorted = sortJobs(jobs);
      // Only update if the order actually changed
      const orderChanged = JSON.stringify(sorted.map(j => j.machineNo)) !== JSON.stringify(jobs.map(j => j.machineNo));
      if (orderChanged) {
        setJobs(sorted);
      }
    }
  }, [jobs, sortJobs]);
  
  // Dynamic grid calculation for 2-row layout
  const calculateGridColumns = (cardCount) => {
    if (cardCount === 0) return 1;
    // Calculate optimal columns for 2 rows
    const optimalColumns = Math.ceil(cardCount / 2);
    return optimalColumns;
  };
  
  // Calculate text scale factor based on number of cards
  const getTextScaleFactor = (cardCount) => {
    if (cardCount <= 6) return 1.0;      // Normal size for 6 or fewer cards
    if (cardCount <= 8) return 0.9;      // Slightly smaller for 7-8 cards
    if (cardCount <= 12) return 0.75;    // Smaller for 9-12 cards
    if (cardCount <= 16) return 0.65;    // Even smaller for 13-16 cards
    return 0.55;                         // Smallest for 17+ cards
  };
  
  // Simple 30-second polling cycle - reliable and straightforward

  const fetchActiveJobs = useCallback(async () => {

    try {
      setLoading(true);
      const result = await manufacturingAPI.getActiveJobs();
      
      if (result.success) {
        // Transform API data to match MachineCard expectations
        const transformedJobs = result.data.map(job => {
          // Parse process status for enhanced machine status
          const statusInfo = parseProcessStatus(
            job.processStatus, 
            job.machine,
            job.process,
            job.processNo,
            job.stepNo,
            job.startTime,
            job.dueDate,
            job.downtime
          );
          
          // Generate enhanced status text with downtime reason
          const getStatusText = (processStatus, aggregateStatus, downtime) => {
            // Check if there's any pause in the job
            const hasPause = processStatus === 'PAUSE' || 
                           (typeof processStatus === 'string' && processStatus.includes('PAUSE')) ||
                           (typeof aggregateStatus === 'string' && aggregateStatus.includes('PAUSE')) || 
                           aggregateStatus === 'PAUSED';
            
            if (hasPause) {
              // For paused jobs, just show "Paused" (reason will be in the banner)
              return 'Paused';
            }
            
            // For non-paused jobs, just show "On Process" (no downtime reasons)
            return 'On Process';
          };
          
          return {
            ...job,
            machineNo: job.machine || 'No Machine',
            projectNo: job.projectNo || 'N/A', // Explicitly map project number
            latestProcess: job.process || 'N/A',
            drawingNo: job.drawingNo || 'N/A',
            quantityOrdered: job.quantityOrdered || 0,
            projectStartDate: job.projectStartDate, // Explicitly pass through project start date
            dueDate: job.dueDate, // Include due date
            statusLED: {
              color: (job.processStatus === 'PAUSE' || 
                     (typeof job.processStatus === 'string' && job.processStatus.includes('PAUSE')) ||
                     (typeof statusInfo.aggregate === 'string' && statusInfo.aggregate.includes('PAUSE'))) ? 'orange' : 'green',
              text: getStatusText(job.processStatus, statusInfo.aggregate, job.downtime)
            },
            // Enhanced status information
            processStatusInfo: statusInfo,
            machines: statusInfo.machines,
            aggregateStatus: statusInfo.aggregate,
            statusDetail: statusInfo.detail,
            statusBadgeColor: statusInfo.badgeColor
          };
        });

        // Use global sort function for consistent ordering
        const sortedJobs = sortJobs(transformedJobs);
        
        setJobs(sortedJobs);
        setLastUpdated(new Date());
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to fetch data: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sortJobs]);

  // Initial data fetch
  useEffect(() => {
    fetchActiveJobs();
  }, [fetchActiveJobs]);

  // Simple 30-second polling system - back to basics for reliability
  useEffect(() => {
    console.log('🔄 Using simple 30-second polling cycle');
    
    // Simple, consistent 30-second interval
    const pollingInterval = setInterval(() => {
      fetchActiveJobs();
    }, 30000); // 30 seconds

    return () => clearInterval(pollingInterval);
  }, [fetchActiveJobs]);

  // No auto-scroll functionality - removed for better TV experience
  useEffect(() => {
    console.log('Auto-scroll functionality disabled');
  }, [isFullscreen]);

  // Re-sort jobs when fullscreen mode changes to ensure correct order
  useEffect(() => {
    if (jobs.length > 0) {
      console.log('🔄 Fullscreen state changed, re-sorting jobs');
      const sortedJobs = sortJobs(jobs);
      setJobs(sortedJobs);
    }
  }, [isFullscreen, sortJobs]);

  // Header visibility based on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // Simple logic: hide when scrolling down past 100px
      if (currentScrollY > 100 && currentScrollY > lastScrollY) {
        console.log('Hiding header - scrolled down past 100px');
        setIsHeaderVisible(false);
      } 
      // Show when scrolling up or at top
      else if (currentScrollY < lastScrollY || currentScrollY < 10) {
        console.log('Showing header - scrolled up or at top');
        setIsHeaderVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    const handleMouseMove = (e) => {
      // Show header when mouse is near the top of the screen
      if (e.clientY < 60) {
        setIsHeaderVisible(true);
      }
    };

    // Add scroll and mouse listeners
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [lastScrollY]);

  // Idle detection
  useEffect(() => {
    const IDLE_TIME = 5000; // 5 seconds of inactivity
    let timer;

    const startIdleTimer = () => {
      if (timer) clearTimeout(timer);
      
      timer = setTimeout(() => {
        console.log('Dashboard went idle - hiding header');
        setIsIdle(true);
        if (window.scrollY > 10) {
          setIsHeaderVisible(false);
        }
      }, IDLE_TIME);
    };

    const resetIdleTimer = () => {
      console.log('User activity detected - resetting idle timer');
      setIsIdle(false);
      startIdleTimer();
    };

    // Activity events to track
    const events = ['mousedown', 'keypress', 'touchstart', 'click'];

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, resetIdleTimer, true);
    });

    // Start initial timer
    startIdleTimer();

    // Cleanup
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(event => {
        document.removeEventListener(event, resetIdleTimer, true);
      });
    };
  }, []);

  // Fullscreen mode toggle
  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      // Enter fullscreen
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) { // Safari
          await document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) { // IE/Edge
          await document.documentElement.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } catch (error) {
        console.log('Fullscreen request failed:', error);
        // Fallback to our custom fullscreen mode
        setIsFullscreen(true);
      }
    } else {
      // Exit fullscreen
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { // Safari
          await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { // IE/Edge
          await document.msExitFullscreen();
        }
        setIsFullscreen(false);
      } catch (error) {
        console.log('Exit fullscreen failed:', error);
        // Fallback
        setIsFullscreen(false);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // F11 or F key for fullscreen
      if (e.key === 'F11' || (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        toggleFullscreen();
      }
      // Escape to exit fullscreen
      else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    const handleFullscreenChange = () => {
      // Detect when user exits fullscreen using browser controls (F11, Escape, etc.)
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );
      
      if (!isCurrentlyFullscreen && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  // Update current time every second when in fullscreen mode
  useEffect(() => {
    if (!isFullscreen) return;

    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timeInterval);
  }, [isFullscreen]);

  const handleRefresh = () => {
    fetchActiveJobs();
  };

  const formatCurrentTime = (date) => {
    const options = {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false // 24-hour format is more common in Thailand
    };
    return date.toLocaleDateString('th-TH', options);
  };

  const formatLastUpdated = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString();
  };

  return (
    <div className={`dashboard-container ${isIdle ? 'idle' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      {!isFullscreen && (
        <header className={`dashboard-header ${isHeaderVisible ? 'visible' : 'hidden'}`}>
          <div className="header-content">
            <div className="header-left">
              <div className="logo-container">
                <img 
                  src={`${process.env.PUBLIC_URL}/company-logo.png`}
                  alt="Company Logo" 
                  className="dashboard-logo"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div className="logo-placeholder" style={{display: 'none'}}>
                  🏭
                </div>
              </div>
              <h1 className="dashboard-title">MFG Dashboard</h1>
            </div>
            <div className="dashboard-controls">
              <div className="status-info">
                <span className="job-count">{jobs.length} Active Jobs</span>
                {lastUpdated && (
                  <span className="last-updated">
                    Last updated: {formatLastUpdated(lastUpdated)}
                  </span>
                )}
              </div>
              <button 
                onClick={handleRefresh} 
                className="refresh-button"
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button 
                onClick={toggleFullscreen} 
                className="fullscreen-button"
                title="Fullscreen Mode (F)"
              >
                <span className="fullscreen-icon">⛶</span>
                <span className="fullscreen-text">Full Screen</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {isFullscreen && (
        <>
          <button 
            onClick={toggleFullscreen} 
            className="exit-fullscreen-btn"
            title="Exit Fullscreen (Esc)"
          >
            ✕
          </button>
          <div className="fullscreen-time-display">
            {formatCurrentTime(currentTime)}
          </div>
        </>
      )}

      <main className={`dashboard-main ${isFullscreen ? 'fullscreen-main' : ''}`}>
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
            <button onClick={handleRefresh} className="retry-button">
              Retry
            </button>
          </div>
        )}

        {loading && jobs.length === 0 ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading active jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            <h3>No Active Jobs</h3>
            <p>All machines are currently idle or no data available.</p>
            <button onClick={handleRefresh} className="refresh-button">
              Check Again
            </button>
          </div>
        ) : (
          <>
            <div 
              className="jobs-grid"
              style={isFullscreen ? {
                gridTemplateColumns: `repeat(${calculateGridColumns(jobs.length)}, 1fr)`,
                fontSize: `${getTextScaleFactor(jobs.length)}em`
              } : {}}
            >
              {jobs.map((job, index) => (
                <MachineCard 
                  key={`${job.machineNo}-${job.projectNo}-${job.startTime}-${index}`} 
                  job={job} 
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;