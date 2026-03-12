/**
 * Seedstr API Client — Full v2 implementation
 * ZIP-aware webhook caller with magic byte detection
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const SEEDSTR_BASE_URL = process.env.SEEDSTR_BASE_URL || 'https://www.seedstr.io';
let   SEEDSTR_API_KEY  = process.env.SEEDSTR_API_KEY  || '';

const AGENT_WEBHOOK_URL = process.env.AGENT_WEBHOOK_URL ||
  'http://3.144.12.2:5678/webhook/713b4a9e-0c1f-4814-addf-e3e379f4c1d9';

// Authenticated axios — header injected at request time so runtime key updates work instantly
const seedstrAxios = axios.create({
  baseURL: SEEDSTR_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});
seedstrAxios.interceptors.request.use(cfg => {
  if (SEEDSTR_API_KEY) cfg.headers['Authorization'] = `Bearer ${SEEDSTR_API_KEY}`;
  return cfg;
});

// Public axios — no auth needed (register, skills)
const publicAxios = axios.create({
  baseURL: SEEDSTR_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

export function setRuntimeApiKey(key) {
  SEEDSTR_API_KEY = key;
}

// ─────────────────────────────────────────────
// ZIP detection helpers
// ─────────────────────────────────────────────

/**
 * Check if a Buffer starts with ZIP magic bytes: PK\x03\x04
 * This is the most reliable way to detect a ZIP regardless of content-type header
 */
function isZipBuffer(buf) {
  return (
    buf.length > 3 &&
    buf[0] === 0x50 && // P
    buf[1] === 0x4b && // K
    buf[2] === 0x03 &&
    buf[3] === 0x04
  );
}

/**
 * Extract filename from Content-Disposition header
 * e.g. "attachment; filename="solution.zip""
 */
function extractFilename(headers) {
  const disposition = headers['content-disposition'] || '';
  const match = disposition.match(/filename[^;=\n]*=\s*["']?([^"';\n]+)["']?/i);
  if (match) return match[1].trim();

  // Fall back to content-type or generic name
  const ct = headers['content-type'] || '';
  if (ct.includes('zip')) return 'solution.zip';
  return 'solution.zip';
}

// ─────────────────────────────────────────────
// Main client
// ─────────────────────────────────────────────

export const seedstrClient = {

  isConfigured: () => !!SEEDSTR_API_KEY,
  getWebhookUrl: () => AGENT_WEBHOOK_URL,

  // ── Registration ──

  async register(walletAddress, walletType = 'ETH', ownerUrl = null) {
    const payload = { walletAddress, walletType };
    if (ownerUrl) payload.ownerUrl = ownerUrl;
    try {
      const res = await publicAxios.post('/api/v2/register', payload);
      return res.data; // { success, apiKey, agentId }
    } catch (err) {
      throw new Error(`register: ${err.response?.data?.message || err.message}`);
    }
  },

  // ── Profile ──

  async getMe() {
    if (!SEEDSTR_API_KEY) return null;
    try {
      const res = await seedstrAxios.get('/api/v2/me');
      return res.data;
    } catch (err) {
      console.warn(`getMe failed: ${err.message}`);
      return null;
    }
  },

  async updateProfile({ name, bio, profilePicture, skills } = {}) {
    const payload = {};
    if (name)           payload.name           = name;
    if (bio)            payload.bio            = bio;
    if (profilePicture) payload.profilePicture = profilePicture;
    if (skills?.length) payload.skills         = skills;
    try {
      const res = await seedstrAxios.patch('/api/v2/me', payload);
      return res.data; // { success, agent }
    } catch (err) {
      throw new Error(`updateProfile: ${err.response?.data?.message || err.message}`);
    }
  },

  async verify() {
    try {
      const res = await seedstrAxios.post('/api/v2/verify');
      return res.data; // { success, message, isVerified, ownerTwitter }
    } catch (err) {
      throw new Error(`verify: ${err.response?.data?.message || err.message}`);
    }
  },

  // ── Skills ──

  async getSkills() {
    try {
      const res = await publicAxios.get('/api/v2/skills');
      return res.data;
    } catch (err) {
      throw new Error(`getSkills: ${err.response?.data?.message || err.message}`);
    }
  },

  // ── Jobs ──

  async fetchJobs(limit = 20, offset = 0) {
    try {
      const res = await seedstrAxios.get('/api/v2/jobs', { params: { limit, offset } });
      return res.data?.jobs || res.data || [];
    } catch (err) {
      throw new Error(`fetchJobs: ${err.response?.data?.message || err.message}`);
    }
  },

  async getJob(jobId) {
    try {
      const res = await seedstrAxios.get(`/api/v2/jobs/${jobId}`);
      return res.data;
    } catch (err) {
      throw new Error(`getJob: ${err.response?.data?.message || err.message}`);
    }
  },

  async acceptJob(jobId) {
    try {
      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/accept`);
      return res.data; // { success, acceptance, slotsRemaining, isFull }
    } catch (err) {
      throw new Error(`acceptJob: ${err.response?.data?.message || err.message}`);
    }
  },

  async declineJob(jobId, reason = null) {
    try {
      const res = await seedstrAxios.post(
        `/api/v2/jobs/${jobId}/decline`,
        reason ? { reason } : {}
      );
      return res.data;
    } catch (err) {
      throw new Error(`declineJob: ${err.response?.data?.message || err.message}`);
    }
  },

  /**
   * Submit plain text response
   */
  async submitTextSolution(jobId, content) {
    try {
      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/respond`, {
        content,
        responseType: 'TEXT',
      });
      return res.data; // { success, response, payout }
    } catch (err) {
      throw new Error(`submitTextSolution: ${err.response?.data?.message || err.message}`);
    }
  },

  /**
   * Submit file (ZIP) response
   * @param {string} jobId
   * @param {string} content  — summary text, min 10 chars (required by API)
   * @param {Array}  files    — [{ url, name, size, type }] from uploadFiles()
   */
  async submitFileSolution(jobId, content, files) {
    try {
      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/respond`, {
        content,
        responseType: 'FILE',
        files,
      });
      return res.data;
    } catch (err) {
      throw new Error(`submitFileSolution: ${err.response?.data?.message || err.message}`);
    }
  },

  /**
   * Upload files to Seedstr CDN
   * @param {Array} files — [{ name, content: Buffer, type }]
   * @returns {{ success, files: [{ url, name, size, type, key }] }}
   */
  async uploadFiles(files) {
    const prepared = files.map(f => ({
      name:    f.name,
      type:    f.type || 'application/zip',
      // Convert Buffer → base64 string; if already a string, pass as-is
      content: Buffer.isBuffer(f.content)
        ? f.content.toString('base64')
        : f.content,
    }));
    try {
      const res = await seedstrAxios.post('/api/v2/upload', { files: prepared });
      return res.data; // { success, files: [{ url, name, size, type, key }] }
    } catch (err) {
      throw new Error(`uploadFiles: ${err.response?.data?.message || err.message}`);
    }
  },

  // ── AI Webhook ──

  /**
   * Call the n8n agent webhook.
   *
   * Always requests arraybuffer so we receive raw bytes regardless of what
   * content-type the webhook sends back. We then check the ZIP magic bytes
   * (PK\x03\x04) to decide how to handle the response — this is more
   * reliable than trusting the content-type header.
   *
   * Returns one of:
   *   { type: 'file',  fileBuffer: Buffer, fileName: string, mimeType: string }
   *   { type: 'text',  content: string }
   */
  async callWebhook(prompt, sessionId = 'dev-session-001') {
    const res = await axios.post(
      AGENT_WEBHOOK_URL,
      { sessionId, chatInput: prompt },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000,
        responseType: 'arraybuffer', // always receive raw bytes
      }
    );

    const rawBuffer = Buffer.from(res.data);
    const contentType = (res.headers['content-type'] || '').toLowerCase();

    // ── ZIP detection: magic bytes first, content-type as fallback ──
    const looksLikeZip =
      isZipBuffer(rawBuffer) ||
      contentType.includes('zip') ||
      contentType.includes('octet-stream');

    if (looksLikeZip) {
      const fileName = extractFilename(res.headers);
      return {
        type:       'file',
        fileBuffer: rawBuffer,
        fileName:   fileName.endsWith('.zip') ? fileName : `${fileName}.zip`,
        mimeType:   'application/zip',
      };
    }

    // ── Text / JSON response ──
    const text = rawBuffer.toString('utf-8');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Plain text — clean and return
      return { type: 'text', content: cleanResponse(text) };
    }

    // Unwrap common n8n response shapes
    if (Array.isArray(data)) {
      data = data[0]?.text ?? data[0]?.output ?? JSON.stringify(data);
    } else if (typeof data === 'object' && data !== null) {
      data = data.text ?? data.output ?? data.response ?? data.content ?? JSON.stringify(data);
    }

    return { type: 'text', content: cleanResponse(String(data)) };
  },
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function cleanResponse(text) {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\b(copy|sql)\b\s*\n/gi, '')
    .replace(/```(\w+)?/g, '```')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatBytes(bytes) {
  if (!bytes) return '?';
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export { formatBytes };