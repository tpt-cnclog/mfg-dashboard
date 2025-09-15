import React, { useState, useEffect, useCallback } from 'react';
import MachineCard from './MachineCard';
import manufacturingAPI from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isIdle, setIsIdle] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fetchActiveJobs = useCallback(async () => {

    try {
      setLoading(true);
      const result = await manufacturingAPI.getActiveJobs();
      
      if (result.success) {
        // Transform API data to match MachineCard expectations
        const transformedJobs = result.data.map(job => ({
          ...job,
          machineNo: job.machine || 'No Machine',
          latestProcess: job.process || 'N/A',
          drawingNo: job.drawingNo || 'N/A',
          quantityOrdered: job.quantityOrdered || 0,
          statusLED: {
            color: 'green',
            text: 'On Process'
          }
        }));

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

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchActiveJobs();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchActiveJobs]);

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

  const handleRefresh = () => {
    fetchActiveJobs();
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
        <button 
          onClick={toggleFullscreen} 
          className="exit-fullscreen-btn"
          title="Exit Fullscreen (Esc)"
        >
          ✕
        </button>
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
            {jobs.length > 10 && (
              <div className="scroll-hint">
                ↕ Scroll to see all jobs ↕
              </div>
            )}
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