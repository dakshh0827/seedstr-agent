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

// Axios instance pre-configured for Seedstr
const seedstrAxios = axios.create({
  baseURL: SEEDSTR_BASE_URL,
  headers: {
    'Authorization': `Bearer ${SEEDSTR_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export const seedstrClient = {
  /**
   * Fetch available jobs from Seedstr
   * Returns an array of job objects
   */
  async fetchJobs() {
    try {

      const res = await seedstrAxios.get("/api/v2/jobs", {
        params: { limit: 20 }
      })

      return res.data?.jobs || res.data || []

    } catch (err) {
      throw new Error(
        `Seedstr fetchJobs failed: ${err.response?.data?.message || err.message}`
      )
    }
  },

  /**
   * Submit a solved solution back to Seedstr
   */
  async submitSolution(jobId, solution) {

    try {

      const res = await seedstrAxios.post(
        `/api/v2/jobs/${jobId}/respond`,
        {
          content: solution
        }
      )

      return res.data

    } catch (err) {

      throw new Error(
        `Seedstr respond failed: ${err.response?.data?.message || err.message}`
      )
    }

  },

  /**
   * Send a prompt to the AI coding agent webhook and return the solution
   */
  async callWebhook(prompt, sessionId = 'dev-session-001') {

    const res = await axios.post(
      AGENT_WEBHOOK_URL,
      { sessionId, chatInput: prompt },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000
      }
    )

    let data = res.data

    // handle array responses
    if (Array.isArray(data)) {
      if (data[0]?.text) {
        data = data[0].text
      } else {
        data = JSON.stringify(data)
      }
    }

    if (typeof data === 'object') {
      if (data.text) return cleanResponse(data.text)
      if (data.output) return cleanResponse(data.output)
      if (data.response) return cleanResponse(data.response)
    }

    return cleanResponse(data)
  },
};

// ─────────────────────────────────────────────
// Mock data for development / demo
// ─────────────────────────────────────────────
let mockJobCounter = 1;

function getMockJobs() {
  const prompts = [
    'Write a Python function to reverse a linked list in O(n) time.',
    'Create a React hook for debouncing user input.',
    'Implement a binary search algorithm in TypeScript.',
    'Write a SQL query to find the top 5 customers by revenue.',
    'Build an Express middleware for rate limiting.',
    'Create a Dockerfile for a Node.js application.',
  ];

  return Array.from({ length: 3 }, (_, i) => ({
    id: `mock-job-${mockJobCounter + i}`,
    prompt: prompts[(mockJobCounter + i) % prompts.length],
    status: 'pending',
    createdAt: new Date(Date.now() - i * 60000).toISOString(),
    difficulty: ['easy', 'medium', 'hard'][i % 3],
  }));
}

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
