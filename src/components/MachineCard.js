import React from 'react';
import ProcessCard from './ProcessCard';
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
    
    console.log('Parsing date:', startTimeString); // Debug log
    
    try {
      let startDate;
      
      // Handle ISO format from API (2025-08-28T02:43:23.368Z)
      if (startTimeString.includes('T') && startTimeString.includes('Z')) {
        startDate = new Date(startTimeString);
      }
      // Handle standard date string that JavaScript can parse directly
      else if (!startTimeString.includes('/') || startTimeString.includes('-')) {
        startDate = new Date(startTimeString);
      }
      // Handle Thai CSV format "28/7/2025, 9:57:15" or similar
      else if (startTimeString.includes('/')) {
        const parts = startTimeString.split(/[,\s]+/);
        const datePart = parts[0];
        const timePart = parts[1] || '00:00:00';
        
        const dateComponents = datePart.split('/');
        if (dateComponents.length === 3) {
          let day, month, year;
          
          // Try different date formats
          if (dateComponents[2].length === 4) {
            // DD/MM/YYYY or MM/DD/YYYY
            day = parseInt(dateComponents[0]);
            month = parseInt(dateComponents[1]) - 1; // JavaScript months are 0-indexed
            year = parseInt(dateComponents[2]);
          } else {
            // MM/DD/YY or DD/MM/YY
            day = parseInt(dateComponents[0]);
            month = parseInt(dateComponents[1]) - 1;
            year = parseInt(dateComponents[2]);
            if (year < 100) year += 2000; // Convert 2-digit year
          }
          
          // Parse time if available
          const timeComponents = timePart.split(':');
          const hour = parseInt(timeComponents[0]) || 0;
          const minute = parseInt(timeComponents[1]) || 0;
          const second = parseInt(timeComponents[2]) || 0;
          
          startDate = new Date(year, month, day, hour, minute, second);
        }
      }
      
      // Fallback: try JavaScript's built-in parsing
      if (!startDate || isNaN(startDate.getTime())) {
        startDate = new Date(startTimeString);
      }
      
      // Final check
      if (!startDate || isNaN(startDate.getTime())) {
        console.warn('Could not parse date:', startTimeString);
        return 'Invalid Date';
      }
      
      const now = new Date();
      const diffMs = now - startDate;
      
      // Handle negative differences (future dates)
      if (diffMs < 0) {
        return 'Future';
      }
      
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
      console.error('Date parsing error:', error, 'for input:', startTimeString);
      return 'Error';
    }
  };

  // Parse process data from the machines array
  const parseProcessData = () => {
    if (!machines || machines.length === 0) {
      return [{
        machineName: machineNo || 'No Machine',
        processName: latestProcess || 'N/A',
        processNumber: processNo || 'N/A',
        stepNumber: stepNo || 'N/A',
        status: status || 'UNKNOWN',
        startTime: startTime,
        dueDate: job.dueDate,
        statusEmoji: getStatusEmoji(status || 'UNKNOWN'),
        statusColor: getStatusColor(status || 'UNKNOWN')
      }];
    }

    return machines.map((machine, index) => ({
      machineName: machine.name,
      processName: machine.processName || latestProcess || 'N/A',
      processNumber: machine.processNumber || processNo || 'N/A',
      stepNumber: machine.stepNumber || stepNo || 'N/A',
      status: machine.status,
      startTime: machine.startTime || startTime,
      dueDate: machine.dueDate || job.dueDate,
      downtime: machine.downtime || '', // Individual machine downtime
      statusEmoji: machine.emoji,
      statusColor: machine.color
    }));
  };

  const processData = parseProcessData();

  const getStatusEmoji = (status) => {
    if (status.includes('PAUSE')) return '🔴';
    if (status.includes('OT')) return '🔵';
    if (status.includes('OPEN')) return '🟢';
    return '⚪';
  };

  const getStatusColor = (status) => {
    if (status.includes('PAUSE')) return '#f44336'; // Red
    if (status.includes('OT')) return '#2196f3';    // Blue
    if (status.includes('OPEN')) return '#4caf50';  // Green
    return '#9e9e9e'; // Gray
  };

  return (
    <div className="machine-card">
      {/* Job Header - Common Information */}
      <div className="job-header">
        <div className="job-title">
          <span className="part-name">{partName}</span>
          <span className="customer">{customer}</span>
        </div>
        <div className="job-details">
          <span className="drawing">Drawing: {drawingNo || 'N/A'}</span>
          <span className="quantity">Qty: {quantityOrdered || 0}</span>
        </div>
      </div>

      {/* Process Cards Container */}
      <div className="process-cards-container">
        {processData.map((process, index) => (
          <ProcessCard 
            key={index}
            processData={process}
            calculateJobAge={calculateJobAge}
            downtime={process.downtime}
          />
        ))}
      </div>
    </div>
  );
};

export default MachineCard;