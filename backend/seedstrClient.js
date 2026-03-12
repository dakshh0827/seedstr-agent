/**
 * Seedstr API Client + Webhook Caller
 * Handles all external HTTP calls
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const SEEDSTR_BASE_URL = process.env.SEEDSTR_BASE_URL || 'https://api.seedstr.io';
const SEEDSTR_API_KEY  = process.env.SEEDSTR_API_KEY  || '';
const AGENT_WEBHOOK_URL = process.env.AGENT_WEBHOOK_URL ||
  'http://3.144.12.2:5678/webhook/713b4a9e-0c1f-4814-addf-e3e379f4c1d9';

const seedstrAxios = axios.create({
  baseURL: SEEDSTR_BASE_URL,
  headers: {
    'Authorization': `Bearer ${SEEDSTR_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export const seedstrClient = {
  async getMe() {
    try {
      if (!SEEDSTR_API_KEY) return null;
      const res = await seedstrAxios.get("/api/v2/me");
      return res.data;
    } catch (err) {
      return null;
    }
  },

  async fetchJobs() {
    try {
      const res = await seedstrAxios.get("/api/v2/jobs", { params: { limit: 20 } });
      return res.data?.jobs || res.data || [];
    } catch (err) {
      throw new Error(`Seedstr fetchJobs failed: ${err.response?.data?.message || err.message}`);
    }
  },

  async acceptJob(jobId) {
    try {
      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/accept`);
      return res.data;
    } catch (err) {
      throw new Error(`Seedstr accept failed: ${err.response?.data?.message || err.message}`);
    }
  },

  async declineJob(jobId, reason) {
    try {
      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/decline`, { reason });
      return res.data;
    } catch (err) {
      throw new Error(`Seedstr decline failed: ${err.response?.data?.message || err.message}`);
    }
  },

  async uploadFile(name, base64Content, type = 'application/zip') {
    try {
      const res = await seedstrAxios.post('/api/v2/upload', {
        files: [{ name, content: base64Content, type }]
      });
      return res.data.files;
    } catch (err) {
      throw new Error(`Seedstr file upload failed: ${err.response?.data?.message || err.message}`);
    }
  },

  async submitSolution(jobId, content, files = null) {
    try {
      const payload = {
        content: content,
        responseType: files && files.length > 0 ? 'FILE' : 'TEXT'
      };
      if (files && files.length > 0) payload.files = files;

      const res = await seedstrAxios.post(`/api/v2/jobs/${jobId}/respond`, payload);
      return res.data;
    } catch (err) {
      throw new Error(`Seedstr respond failed: ${err.response?.data?.message || err.message}`);
    }
  },

  async callWebhook(prompt, sessionId = 'dev-session-001') {
    // 🛑 MOCK FOR TESTING ZIP UPLOADS
    if (prompt === 'TEST_ZIP') {
      const dummyBase64Zip = "UEsDBAoAAAAAACRTfVYAAAAAAAAAAAAAAAAJAAAAaGVsbG8udHh0UEsBAhQDCgAAAAAAJFN9VgAAAAAAAAAAAAAAAQkAAAAAAAAAAAAAAKSBAAAAAGhlbGxvLnR4dFBLBQYAAAAAAQABADcAAAAZAAAAAAA=";
      return {
        text: "This is a local test response. Here is your dummy zip file.",
        file: {
          name: "test-dummy.zip",
          type: "application/zip",
          content: dummyBase64Zip
        }
      };
    }
    // 🛑 END MOCK

    const res = await axios.post(
      AGENT_WEBHOOK_URL,
      { sessionId, chatInput: prompt },
      { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
    );

    let data = res.data;
    if (Array.isArray(data)) data = data[0];

    // Detect if webhook returned a file object
    if (data && typeof data === 'object' && data.file) {
      return {
        text: data.text || "Here is your requested file.",
        file: data.file
      };
    }

    if (typeof data === 'object') {
      if (data.text) return cleanResponse(data.text);
      if (data.output) return cleanResponse(data.output);
      if (data.response) return cleanResponse(data.response);
    }

    return cleanResponse(JSON.stringify(data));
  },
};

function cleanResponse(text) {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, "");
  cleaned = cleaned.replace(/\b(copy|sql)\b\s*\n/gi, "");
  cleaned = cleaned.replace(/```(\w+)?/g, "```");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}