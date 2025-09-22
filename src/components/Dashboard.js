import React, { useState, useEffect, useCallback } from 'react';
import MachineCard from './MachineCard';
import manufacturingAPI from '../services/api';
import './Dashboard.css';

// Enhanced status parsing utility functions
const parseProcessStatus = (processStatusString, machineString) => {
  // Debug logging
  console.log('parseProcessStatus called with:', { processStatusString, machineString });
  
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
  
  // Create machine-status pairs
  const machineStatuses = machines.map((machine, index) => ({
    name: machine,
    status: statuses[index] || 'UNKNOWN',
    color: getStatusColor(statuses[index] || 'UNKNOWN'),
    emoji: getStatusEmoji(statuses[index] || 'UNKNOWN')
  }));
  
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
  
  // Calculate optimal grid class based on job count for fullscreen TV display
  const getOptimalGridClass = (jobCount) => {
    if (jobCount <= 6) return 'grid-1-6';
    if (jobCount <= 12) return 'grid-7-12';
    if (jobCount <= 20) return 'grid-13-20';
    if (jobCount <= 30) return 'grid-21-30';
    return 'grid-many';
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
          const statusInfo = parseProcessStatus(job.processStatus, job.machine);
          
          return {
            ...job,
            machineNo: job.machine || 'No Machine',
            projectNo: job.projectNo || 'N/A', // Explicitly map project number
            latestProcess: job.process || 'N/A',
            drawingNo: job.drawingNo || 'N/A',
            quantityOrdered: job.quantityOrdered || 0,
            projectStartDate: job.projectStartDate, // Explicitly pass through project start date
            statusLED: {
              color: 'green',
              text: 'On Process'
            },
            // Enhanced status information
            processStatusInfo: statusInfo,
            machines: statusInfo.machines,
            aggregateStatus: statusInfo.aggregate,
            statusDetail: statusInfo.detail,
            statusBadgeColor: statusInfo.badgeColor
          };
        });

        // Sort by start time (latest to oldest)
        const sortedJobs = transformedJobs.sort((a, b) => {
          const dateA = new Date(a.startTime);
          const dateB = new Date(b.startTime);
          return dateB - dateA; // Latest first
        });
        
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
  }, []);

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

  // Dynamic grid layout for fullscreen TV optimization
  useEffect(() => {
    if (isFullscreen && jobs.length > 0) {
      const jobsGrid = document.querySelector('.jobs-grid');
      if (jobsGrid) {
        // Remove existing grid classes
        jobsGrid.classList.remove('grid-1-6', 'grid-7-12', 'grid-13-20', 'grid-21-30', 'grid-many');
        
        // Add optimal grid class based on job count
        const gridClass = getOptimalGridClass(jobs.length);
        jobsGrid.classList.add(gridClass);
        
        console.log(`📺 TV Display: Applied ${gridClass} for ${jobs.length} jobs`);
      }
    }
  }, [jobs.length, isFullscreen]);

  // Auto-scroll functionality - only in fullscreen mode
  useEffect(() => {
    // ONLY start auto-scroll when we enter fullscreen mode
    if (!isFullscreen) {
      console.log('Not in fullscreen mode, no auto-scroll');
      return;
    }

    console.log('Fullscreen mode detected - setting up auto-scroll');
    
    let scrollInterval;
    let scrollDirection = 1; // 1 for down, -1 for up
    let isPaused = false;
    let pauseTimeout;
    
    const startAutoScroll = () => {
      // Try multiple possible scroll containers
      const containers = [
        document.querySelector('.jobs-grid'),
        document.querySelector('.dashboard-container'),
        document.querySelector('main'),
        document.documentElement,
        document.body
      ];
      
      let scrollContainer = null;
      
      for (const container of containers) {
        if (container) {
          console.log(`Checking container:`, container.className || container.tagName, {
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight,
            canScroll: container.scrollHeight > container.clientHeight
          });
          
          if (container.scrollHeight > container.clientHeight) {
            scrollContainer = container;
            console.log('Found scrollable container:', container.className || container.tagName);
            break;
          }
        }
      }
      
      // Check if there's content to scroll
      if (!scrollContainer) {
        console.log('No scrollable content found in any container');
        return;
      }

      // Detect manual scrolling
      let isAutoScrolling = false;
      
      const handleManualScroll = () => {
        // If we're currently auto-scrolling, ignore this scroll event
        if (isAutoScrolling) {
          return;
        }
        
        console.log('Manual scroll detected, pausing auto-scroll for 5 seconds');
        isPaused = true;
        
        // Clear existing pause timeout
        if (pauseTimeout) {
          clearTimeout(pauseTimeout);
        }
        
        // Resume auto-scroll after 5 seconds
        pauseTimeout = setTimeout(() => {
          console.log('Resuming auto-scroll after manual scroll pause');
          isPaused = false;
        }, 5000);
      };

      // Add scroll listener for manual scroll detection
      scrollContainer.addEventListener('scroll', handleManualScroll, { passive: true });
      
      console.log('Starting smooth auto-scroll');
      
      scrollInterval = setInterval(() => {
        if (isPaused) {
          return; // Skip auto-scroll while paused
        }
        
        isAutoScrolling = true; // Mark that we're auto-scrolling
        
        const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        const currentScroll = scrollContainer.scrollTop;
        const scrollStep = 1;
        
        const newScroll = currentScroll + (scrollDirection * scrollStep);
        
        // Check boundaries and reverse direction with pause
        if (newScroll >= maxScroll) {
          console.log('Reached bottom, pausing for 5 seconds before scrolling up');
          scrollDirection = -1; // Scroll up
          scrollContainer.scrollTop = maxScroll;
          isPaused = true;
          
          // Clear existing pause timeout
          if (pauseTimeout) {
            clearTimeout(pauseTimeout);
          }
          
          // Resume auto-scroll after 5 seconds
          pauseTimeout = setTimeout(() => {
            console.log('Resuming auto-scroll after bottom pause');
            isPaused = false;
          }, 5000);
        } else if (newScroll <= 0) {
          console.log('Reached top, pausing for 5 seconds before scrolling down');
          scrollDirection = 1; // Scroll down
          scrollContainer.scrollTop = 0;
          isPaused = true;
          
          // Clear existing pause timeout
          if (pauseTimeout) {
            clearTimeout(pauseTimeout);
          }
          
          // Resume auto-scroll after 5 seconds
          pauseTimeout = setTimeout(() => {
            console.log('Resuming auto-scroll after top pause');
            isPaused = false;
          }, 5000);
        } else {
          scrollContainer.scrollTop = newScroll;
        }
        
        // Reset auto-scrolling flag after a short delay
        setTimeout(() => {
          isAutoScrolling = false;
        }, 10);
      }, 30); // Smooth scrolling speed

      // Store reference for cleanup
      return { scrollContainer, handleManualScroll };
    };

    // Start after a delay
    let scrollSetup;
    const startTimeout = setTimeout(() => {
      scrollSetup = startAutoScroll();
    }, 2000);

    // Cleanup when exiting fullscreen
    return () => {
      console.log('Exiting fullscreen - stopping auto-scroll');
      clearTimeout(startTimeout);
      clearInterval(scrollInterval);
      if (pauseTimeout) {
        clearTimeout(pauseTimeout);
      }
      if (scrollSetup && scrollSetup.scrollContainer) {
        scrollSetup.scrollContainer.removeEventListener('scroll', scrollSetup.handleManualScroll);
      }
    };
  }, [isFullscreen]);

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
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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
            <div className="jobs-grid">
              {jobs.map((job, index) => (
                <MachineCard 
                  key={`${job.machineNo}-${job.projectNo}-${index}`} 
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