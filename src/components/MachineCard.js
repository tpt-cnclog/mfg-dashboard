import React from 'react';
import './MachineCard.css';

const MachineCard = ({ job }) => {
  if (!job) {
    return null;
  }

  const {
    machineNo,
    partName,
    customer,
    drawingNo,
    quantityOrdered,
    latestProcess,
    processNo,
    stepNo,
    startTime,
    projectStartDate,
    projectNo,
    status,
    statusLED,
    downtime, // Add downtime from job data
    // Enhanced status information
    machines,
    aggregateStatus,
    statusDetail,
    statusBadgeColor,
    processStatusInfo
  } = job;

  const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    try {
      // Handle ISO format from API (2025-08-28T02:43:23.368Z)
      if (timeString.includes('T')) {
        const date = new Date(timeString);
        return date.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      }
      // Handle CSV format "28/7/2025, 9:57:15"
      const [datePart, timePart] = timeString.split(', ');
      if (timePart) {
        return timePart;
      }
      return timeString;
    } catch (error) {
      return timeString;
    }
  };

  const formatDate = (timeString) => {
    if (!timeString) return 'N/A';
    try {
      // Handle ISO format from API (2025-08-28T02:43:23.368Z)
      if (timeString.includes('T')) {
        const date = new Date(timeString);
        return date.toLocaleDateString('en-GB', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
      }
      // Handle CSV format "28/7/2025, 9:57:15"
      const [datePart] = timeString.split(', ');
      return datePart;
    } catch (error) {
      return timeString;
    }
  };

  const calculateJobAge = (startTimeString) => {
    if (!startTimeString) return 'N/A';
    
    try {
      let startDate;
      
      // Handle ISO format from API (2025-08-28T02:43:23.368Z)
      if (startTimeString.includes('T')) {
        startDate = new Date(startTimeString);
      } else {
        // Handle CSV format "28/7/2025, 9:57:15"
        const [datePart, timePart] = startTimeString.split(', ');
        const [day, month, year] = datePart.split('/');
        const timeString = timePart || '00:00:00';
        startDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timeString}`);
      }
      
      if (isNaN(startDate.getTime())) {
        return 'Invalid Date';
      }
      
      const now = new Date();
      const diffMs = now - startDate;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (diffHours >= 24) {
        const days = Math.floor(diffHours / 24);
        const remainingHours = diffHours % 24;
        if (remainingHours > 0) {
          return `${days}d ${remainingHours}h`;
        }
        return `${days}d`;
      }
      
      return `${diffHours}h ${diffMinutes}m`;
    } catch (error) {
      return 'Error';
    }
  };

  // Enhanced machine status rendering
  const renderMachineStatus = () => {
    if (!machines || machines.length === 0) {
      return <span className="machine-id">{machineNo || 'No Machine'}</span>;
    }
    
    return (
      <div className="machine-status">
        {machines.map((machine, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="machine-separator">,</span>}
            <span 
              className={`machine-name ${getStatusClass(machine.status)}`}
              title={`${machine.name}: ${machine.status}`}
            >
              <span className="status-emoji">{machine.emoji}</span>
              {machine.name}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Aggregate status badge rendering
  const renderAggregateStatusBadge = () => {
    if (!aggregateStatus || aggregateStatus === 'ACTIVE') {
      return null; // Don't show badge for normal operation
    }
    
    const badgeText = getBadgeText(aggregateStatus, downtime);
    const badgeClass = getBadgeClass(aggregateStatus);
    
    return (
      <div className={`aggregate-status-badge ${badgeClass}`}>
        {badgeText}
      </div>
    );
  };

  // Render status indicator - hide when paused (info is in banner)
  const renderStatusIndicator = () => {
    // If there are paused machines, don't show the status indicator (info is in the banner)
    if (aggregateStatus && (aggregateStatus.includes('PAUSE') || aggregateStatus === 'PAUSED')) {
      return null;
    }
    
    // Show status indicator for active machines
    return (
      <div className="status-indicator">
        <span 
          className={`status-led status-led-${statusLED?.color || 'gray'}`}
          title={statusLED?.text || status}
        ></span>
        <span className="status-text">{statusLED?.text || status}</span>
      </div>
    );
  };

  // Helper functions
  const getStatusClass = (status) => {
    if (status.includes('PAUSE')) return 'paused';
    if (status.includes('OT')) return 'overtime';
    if (status.includes('OPEN')) return 'active';
    return 'unknown';
  };

  const getBadgeText = (aggregateStatus, downtime) => {
    switch (aggregateStatus) {
      case 'PARTIAL_PAUSE': 
        return downtime && downtime.trim() ? `PARTIAL PAUSE: ${downtime}` : 'PARTIAL PAUSE';
      case 'PAUSED': 
        return downtime && downtime.trim() ? `PAUSED: ${downtime}` : 'PAUSED';
      case 'OVERTIME': return 'OVERTIME';
      default: return aggregateStatus;
    }
  };

  const getBadgeClass = (aggregateStatus) => {
    if (aggregateStatus.includes('PAUSE')) return 'paused';
    if (aggregateStatus === 'OVERTIME') return 'overtime';
    if (aggregateStatus === 'ACTIVE') return 'active';
    return 'unknown';
  };

  return (
    <div className="machine-card">
      <div className="card-header">
        <div className="machine-info">
          {renderMachineStatus()}
          {renderAggregateStatusBadge()}
          {renderStatusIndicator()}
        </div>
      </div>

      <div className="process-info">
        <div className="process-step">
          <span className="process-label">Process:</span>
          <span className="process-value">{latestProcess || 'N/A'}</span>
        </div>
        <div className="process-step">
          <span className="process-label">Process No:</span>
          <span className="process-value">{processNo || 'N/A'}</span>
        </div>
        <div className="process-step">
          <span className="process-label">Step:</span>
          <span className="process-value">{stepNo || 'N/A'}</span>
        </div>
      </div>

      <div className="job-details">
        <div className="part-name">{partName}</div>
        <div className="customer-info">
          <span className="customer">{customer}</span>
        </div>
        <div className="job-specs">
          <span className="drawing">Drawing: {drawingNo || 'N/A'}</span>
          <span className="quantity">Qty Ordered: {quantityOrdered || 0}</span>
        </div>
      </div>

      <div className="timing-info">
        <div className="start-time">
          <span className="time-label">วันที่เริ่ม Process ล่าสุด:</span>
          <div className="time-details">
            <div className="datetime-info">
              <span className="time-date">{formatDate(startTime)}</span>
              <span className="time-time">{formatTime(startTime)}</span>
            </div>
            <div className="process-age-inline">
              <span className="process-age-label">Process Age:</span>
              <span className="age-value">{calculateJobAge(startTime)}</span>
            </div>
          </div>
        </div>
        <div className="job-age">
          <span className="age-label">Job Age:</span>
          <span className="age-value">{calculateJobAge(projectStartDate || startTime)}</span>
        </div>
      </div>

      <div className="project-info">
        <span className="project-no">Project: {projectNo}</span>
      </div>
    </div>
  );
};

export default MachineCard;