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
    projectNo,
    status,
    statusLED
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
        startDate = new Date(startTimeString);
      }
      
      const now = new Date();
      const diffMs = now - startDate;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (diffDays > 0) {
        return `${diffDays}d ${diffHours}h`;
      } else if (diffHours > 0) {
        return `${diffHours}h ${diffMinutes}m`;
      } else {
        return `${diffMinutes}m`;
      }
    } catch (error) {
      return 'N/A';
    }
  };

  return (
    <div className="machine-card">
      <div className="card-header">
        <div className="machine-info">
          <span className="machine-id">{machineNo || 'No Machine'}</span>
          <div className="status-indicator">
            <span 
              className={`status-led status-led-${statusLED?.color || 'gray'}`}
              title={statusLED?.text || status}
            ></span>
            <span className="status-text">{statusLED?.text || status}</span>
          </div>
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
          <span className="time-label">วันที่เริ่ม Process:</span>
          <div className="time-details">
            <span className="time-date">{formatDate(startTime)}</span>
            <span className="time-time">{formatTime(startTime)}</span>
          </div>
        </div>
        <div className="job-age">
          <span className="age-label">Job Age:</span>
          <span className="age-value">{calculateJobAge(startTime)}</span>
        </div>
      </div>

      <div className="project-info">
        <span className="project-no">Project: {projectNo}</span>
      </div>
    </div>
  );
};

export default MachineCard;