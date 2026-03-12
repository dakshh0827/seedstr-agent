/**
 * Seedstr API Client + Webhook Caller
 * Handles all external HTTP calls to Seedstr Platform
 * API Documentation: https://www.seedstr.io/api/v2
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const SEEDSTR_BASE_URL = process.env.SEEDSTR_BASE_URL || 'https://www.seedstr.io';
const SEEDSTR_API_KEY  = process.env.SEEDSTR_API_KEY  || '';

// AI Agent Webhook URL (your deployed agent)
const AGENT_WEBHOOK_URL = process.env.AGENT_WEBHOOK_URL ||
  'http://3.144.12.2:5678/webhook/713b4a9e-0c1f-4814-addf-e3e379f4c1d9';

// Axios instance pre-configured for Seedstr (authenticated)
const seedstrAxios = axios.create({
  baseURL: SEEDSTR_BASE_URL,
  headers: {
    'Authorization': `Bearer ${SEEDSTR_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Axios instance for public endpoints (no auth required)
const seedstrPublicAxios = axios.create({
  baseURL: SEEDSTR_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export const seedstrClient = {
  // ─────────────────────────────────────────────
  // Agent Registration & Profile
  // ─────────────────────────────────────────────

  /**
   * POST /api/v2/register - Register a new agent
   * @param {string} walletAddress - Solana or Ethereum wallet address
   * @param {string} walletType - "ETH" or "SOL" (default: "ETH")
   * @param {string} ownerUrl - URL to agent's homepage (optional)
   * @returns {Object} { success, apiKey, agentId }
   */
  async register(walletAddress, walletType = 'ETH', ownerUrl = null) {
    try {
      const payload = { walletAddress, walletType };
      if (ownerUrl) payload.ownerUrl = ownerUrl;
      
      const res = await seedstrPublicAxios.post('/api/v2/register', payload);
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr register failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  /**
   * GET /api/v2/me - Get current agent's profile and stats
   * @returns {Object} Agent profile with verification status
   */
  async getMe() {
    try {
      if (!SEEDSTR_API_KEY) return null;
      const res = await seedstrAxios.get('/api/v2/me');
      return res.data;
    } catch (err) {
      console.warn(`Could not fetch agent profile: ${err.message}`);
      return null;
    }
  },

  /**
   * PATCH /api/v2/me - Update agent profile
   * @param {Object} profileData - { name, bio, profilePicture, skills }
   * @returns {Object} { success, agent }
   */
  async updateProfile(profileData) {
    try {
      const res = await seedstrAxios.patch('/api/v2/me', profileData);
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr updateProfile failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  /**
   * POST /api/v2/verify - Trigger Twitter verification check
   * @returns {Object} { success, message, isVerified, ownerTwitter }
   */
  async verify() {
    try {
      const res = await seedstrAxios.post('/api/v2/verify');
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr verify failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  // ─────────────────────────────────────────────
  // Jobs Management
  // ─────────────────────────────────────────────

  /**
   * GET /api/v2/jobs - Fetch available jobs
   * @param {number} limit - Max jobs to return (default: 20, max: 50)
   * @param {number} offset - Pagination offset
   * @returns {Array} Array of job objects
   */
  async fetchJobs(limit = 20, offset = 0) {
    try {
      const res = await seedstrAxios.get('/api/v2/jobs', {
        params: { limit, offset }
      });
      return res.data?.jobs || res.data || [];
    } catch (err) {
      throw new Error(
        `Seedstr fetchJobs failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  /**
   * GET /api/v2/jobs/:id - Get job details
   * @param {string} jobId - The job ID
   * @returns {Object} Job details
   */
  async getJob(jobId) {
    try {
      const res = await seedstrAxios.get(`/api/v2/jobs/${jobId}`);
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr getJob failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  /**
   * POST /api/v2/jobs/:id/accept - Accept a SWARM job
   * @param {string} jobId - The job ID
   * @returns {Object} { success, acceptance, slotsRemaining, isFull }
   */
  async acceptJob(jobId) {
    try {
      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/accept`);
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr accept failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  /**
   * POST /api/v2/jobs/:id/decline - Decline a job
   * @param {string} jobId - The job ID
   * @param {string} reason - Reason for declining (optional)
   * @returns {Object} { success, message }
   */
  async declineJob(jobId, reason = null) {
    try {
      const payload = reason ? { reason } : {};
      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/decline`, payload);
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr decline failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  /**
   * POST /api/v2/jobs/:id/respond - Submit a response to a job
   * @param {string} jobId - The job ID
   * @param {string} content - Response content
   * @param {string} responseType - 'TEXT' (default) or 'FILE'
   * @param {Array} files - Array of file attachments (for FILE type)
   * @returns {Object} { success, response, payout }
   */
  async submitSolution(jobId, content, responseType = 'TEXT', files = null) {
    try {
      const payload = { content, responseType };
      if (responseType === 'FILE' && files) {
        payload.files = files;
      }
      
      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/respond`, payload);
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr respond failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  // ─────────────────────────────────────────────
  // File Upload
  // ─────────────────────────────────────────────

  /**
   * POST /api/v2/upload - Upload files for attachment
   * @param {Array} files - Array of { name, content (base64), type }
   * @returns {Object} { success, files: [{ url, name, size, type, key }] }
   */
  async uploadFiles(files) {
    try {
      const res = await seedstrAxios.post('/api/v2/upload', { files });
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr upload failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  // ─────────────────────────────────────────────
  // Skills
  // ─────────────────────────────────────────────

  /**
   * GET /api/v2/skills - List available predefined skills
   * @returns {Object} { skills: [], maxPerAgent: 15 }
   */
  async getSkills() {
    try {
      const res = await seedstrPublicAxios.get('/api/v2/skills');
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr getSkills failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  // ─────────────────────────────────────────────
  // Public Agent & Platform Data
  // ─────────────────────────────────────────────

  /**
   * GET /api/v2/agents/:id - Get public agent profile
   * @param {string} agentId - The agent ID
   * @returns {Object} Agent public profile
   */
  async getAgent(agentId) {
    try {
      const res = await seedstrPublicAxios.get(`/api/v2/agents/${agentId}`);
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr getAgent failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  /**
   * GET /api/v2/leaderboard - Get top agents
   * @param {string} sortBy - 'reputation', 'earnings', or 'jobs'
   * @param {number} limit - Max agents to return (default: 50, max: 100)
   * @returns {Object} { agents: [], total: number }
   */
  async getLeaderboard(sortBy = 'reputation', limit = 50) {
    try {
      const res = await seedstrPublicAxios.get('/api/v2/leaderboard', {
        params: { sortBy, limit }
      });
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr getLeaderboard failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  /**
   * GET /api/v2/stats - Get platform-wide statistics
   * @returns {Object} Platform stats
   */
  async getStats() {
    try {
      const res = await seedstrPublicAxios.get('/api/v2/stats');
      return res.data;
    } catch (err) {
      throw new Error(
        `Seedstr getStats failed: ${err.response?.data?.message || err.message}`
      );
    }
  },

  // ─────────────────────────────────────────────
  // AI Agent Webhook
  // ─────────────────────────────────────────────

  /**
   * Send a prompt to the AI coding agent webhook
   * @param {string} prompt - The coding prompt
   * @param {string} sessionId - Session identifier
   * @returns {string} Cleaned solution response
   */
  async callWebhook(prompt, sessionId = 'dev-session-001') {
    const res = await axios.post(
      AGENT_WEBHOOK_URL,
      { sessionId, chatInput: prompt },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000
      }
    );

    let data = res.data;

    // Handle array responses
    if (Array.isArray(data)) {
      if (data[0]?.text) {
        data = data[0].text;
      } else {
        data = JSON.stringify(data);
      }
    }

    if (typeof data === 'object') {
      if (data.text) return cleanResponse(data.text);
      if (data.output) return cleanResponse(data.output);
      if (data.response) return cleanResponse(data.response);
    }

    return cleanResponse(data);
  },

  /**
   * Get the configured webhook URL
   * @returns {string} Webhook URL
   */
  getWebhookUrl() {
    return AGENT_WEBHOOK_URL;
  },

  /**
   * Check if API key is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!SEEDSTR_API_KEY;
  },
};

function cleanResponse(text) {
  if (!text) return ""

  let cleaned = text

  // remove markdown headers
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, "")

  // remove copy/sql artifacts
  cleaned = cleaned.replace(/\b(copy|sql)\b\s*\n/gi, "")

  // normalize code blocks
  cleaned = cleaned.replace(/```(\w+)?/g, "```")

  // remove excessive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n")

  return cleaned.trim()
}