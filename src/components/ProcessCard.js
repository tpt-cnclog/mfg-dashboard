import React from 'react';
import './ProcessCard.css';

const ProcessCard = ({ processData, calculateJobAge, downtime }) => {
  if (!processData) {
    return null;
  }

  const {
    machineName,
    processName,
    processNumber,
    stepNumber,
    status,
    startTime,
    dueDate,
    statusEmoji,
    statusColor
  } = processData;

  const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    try {
      // Handle ISO format from API (2025-08-28T02:43:23.368Z)
      if (timeString.includes('T')) {
        const date = new Date(timeString);
        return date.toLocaleDateString('en-GB', { 
          day: '2-digit', 
          month: '2-digit'
        }) + ' ' + date.toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      }
      // Handle CSV format "28/7/2025, 9:57:15"
      const [datePart, timePart] = timeString.split(', ');
      if (datePart && timePart) {
        const [day, month, year] = datePart.split('/');
        const [hour, minute] = timePart.split(':');
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      }
      return timeString;
    } catch (error) {
      return timeString;
    }
  };

  const formatDueDate = (timeString) => {
    if (!timeString) return 'N/A';
    try {
      // Handle ISO format
      if (timeString.includes('T')) {
        const date = new Date(timeString);
        return date.toLocaleDateString('en-GB', { 
          day: '2-digit', 
          month: '2-digit',
          year: 'numeric'
        });
      }
      // Handle CSV format "28/7/2025, 9:57:15" - only use date part
      const [datePart] = timeString.split(', ');
      if (datePart) {
        const [day, month, year] = datePart.split('/');
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
      return timeString;
    } catch (error) {
      return 'N/A';
    }
  };

  const getStatusClass = () => {
    if (status.includes('PAUSE')) return 'paused';
    if (status.includes('OT')) return 'overtime';
    if (status.includes('OPEN')) return 'active';
    return 'unknown';
  };

  return (
    <div className={`process-card ${getStatusClass()}`}>
      <div className="process-header">
        <div className="machine-status-line">
          <span className="machine-name">{machineName}</span>
          <span className="status-emoji">{statusEmoji}</span>
          {status.includes('PAUSE') && (
            <span className="pause-status">
              {downtime ? `PAUSED: ${downtime}` : 'PAUSED'}
            </span>
          )}
          {status.includes('OT') && (
            <span className="ot-status">OT</span>
          )}
        </div>
      </div>
      
      <div className="process-info">
        <div className="process-details">
          {processNumber && (
            <div className="process-left">
              <span className="process-number">#{processNumber}</span>
            </div>
          )}
          <div className="process-center">
            <span className="process-name">{processName}</span>
          </div>
          <div className="process-right">
            {stepNumber && (
              <>
                <span className="step-label">Step:</span>
                <span className="step-value">{stepNumber}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="timing-info">
        <div className="date-row">
          <div className="start-time">
            <span className="time-label">Started:</span>
            <span className="time-value">{formatTime(startTime)}</span>
          </div>
          {dueDate && (
            <div className="due-date">
              <span className="due-label">Due:</span>
              <span className="due-value">{formatDueDate(dueDate)}</span>
            </div>
          )}
        </div>
        <div className="duration">
          <span className="duration-label">อายุงาน:</span>
          <span className="duration-value">{calculateJobAge(startTime)}</span>
        </div>
      </div>
    </div>
  );
};

export default ProcessCard;