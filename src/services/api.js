import axios from 'axios';

// Configuration
const API_CONFIG = {
  // Replace this with your Google Apps Script Web App URL
  BASE_URL: 'https://script.google.com/macros/s/AKfycbx7ld5mQfVZAloeJMcufoubwuhsKbbIm4hCnDqiW5CPEUtK8pQIO68Lp4vkDT2HFVd05w/exec',
  REFRESH_INTERVAL: 30000, // 30 seconds (fallback)
  VERSION_CHECK_INTERVAL: 5000, // 5 seconds for version checks
};

class ManufacturingAPI {
  constructor() {
    this.apiClient = axios.create({
      timeout: 15000, // 15 second timeout (increased)
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const response = await this.apiClient.get(`${API_CONFIG.BASE_URL}?action=test`);
      return {
        success: true,
        message: response.data?.message || 'Connection successful',
        timestamp: response.data?.timestamp
      };
    } catch (error) {
      console.error('Connection test failed:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
        details: error.response?.data || error.message
      };
    }
  }

  /**
   * Get all active jobs (On Process status only)
   */
  async getActiveJobs() {
    try {
      const response = await this.apiClient.get(`${API_CONFIG.BASE_URL}?action=getActiveJobs`);
      
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data,
          count: response.data.count,
          timestamp: response.data.timestamp
        };
      } else {
        throw new Error(response.data?.error || 'Failed to fetch active jobs');
      }
    } catch (error) {
      console.error('Error fetching active jobs:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
        data: []
      };
    }
  }

  /**
   * Get machine status grouped by machine
   */
  async getMachineStatus() {
    try {
      const response = await this.apiClient.get(`${API_CONFIG.BASE_URL}?action=getMachineStatus`);
      
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data,
          timestamp: response.data.timestamp
        };
      } else {
        throw new Error(response.data?.error || 'Failed to fetch machine status');
      }
    } catch (error) {
      console.error('Error fetching machine status:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
        data: {}
      };
    }
  }

  /**
   * Get data version for smart polling (lightweight check)
   * DASHBOARD-ONLY FUNCTION - DOES NOT AFFECT ORIGINAL LOGGING
   */
  async getDataVersion() {
    try {
      const response = await this.apiClient.get(`${API_CONFIG.BASE_URL}?action=getVersion`);
      
      if (response.data && response.data.success) {
        return {
          success: true,
          version: response.data.version
        };
      } else {
        throw new Error(response.data?.error || 'Failed to fetch data version');
      }
    } catch (error) {
      console.error('Error fetching data version:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
        version: null
      };
    }
  }

  /**
   * Get all jobs (including completed ones)
   */
  async getAllJobs() {
    try {
      const response = await this.apiClient.get(`${API_CONFIG.BASE_URL}?action=getAllJobs`);
      
      if (response.data && response.data.success) {
        return {
          success: true,
          data: response.data.data,
          count: response.data.count,
          timestamp: response.data.timestamp
        };
      } else {
        throw new Error(response.data?.error || 'Failed to fetch all jobs');
      }
    } catch (error) {
      console.error('Error fetching all jobs:', error);
      return {
        success: false,
        error: this.getErrorMessage(error),
        data: []
      };
    }
  }

  /**
   * Get user-friendly error message
   */
  getErrorMessage(error) {
    if (error.code === 'ERR_NETWORK') {
      return 'Network error - check your API URL and internet connection';
    }
    if (error.response?.status === 404) {
      return 'API endpoint not found - check your Google Apps Script deployment';
    }
    if (error.response?.status === 403) {
      return 'Access denied - check your Google Apps Script permissions';
    }
    if (error.message?.includes('CORS')) {
      return 'CORS error - check your Google Apps Script CORS settings';
    }
    return error.message || 'Unknown error occurred';
  }

  /**
   * Update the API URL configuration
   */
  updateApiUrl(newUrl) {
    API_CONFIG.BASE_URL = newUrl;
  }

  /**
   * Get current API configuration
   */
  getConfig() {
    return { ...API_CONFIG };
  }
}

// Create a singleton instance
const manufacturingAPI = new ManufacturingAPI();

export default manufacturingAPI;
export { API_CONFIG };