/**
 * Seedstr Agent Backend Server
 * Express server that bridges the Seedstr job API with the AI coding agent webhook
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { seedstrClient } from './seedstrClient.js';
import { startWorker, stopWorker, getWorkerStatus } from './worker.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.IO for real-time UI updates
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
}));
app.use(express.json());

// ─────────────────────────────────────────────
// Logging utility – broadcasts to UI via socket
// ─────────────────────────────────────────────
export function emitLog(type, message, meta = {}) {
  const entry = {
    id: Date.now() + Math.random(),
    type,        // 'info' | 'success' | 'error' | 'warn' | 'poll'
    message,
    meta,
    timestamp: new Date().toISOString(),
  };
  io.emit('log', entry);
  console.log(`[${type.toUpperCase()}] ${message}`);
  return entry;
}

export function emitJobUpdate(job) {
  io.emit('jobUpdate', job);
}

export function emitSolution(solution) {
  io.emit('solution', solution);
}

// ─────────────────────────────────────────────
// REST Endpoints
// ─────────────────────────────────────────────

/** GET /api/status – returns agent + worker status */
app.get('/api/status', (req, res) => {
  res.json({
    online: true,
    workerStatus: getWorkerStatus(),
    webhookUrl: process.env.AGENT_WEBHOOK_URL || 'NOT_SET',
    seedstrBase: process.env.SEEDSTR_BASE_URL || 'NOT_SET',
    timestamp: new Date().toISOString(),
  });
});

/** GET /api/jobs – fetch available jobs from Seedstr */
app.get('/api/jobs', async (req, res) => {
  try {
    emitLog('poll', 'Fetching jobs from Seedstr...');
    const jobs = await seedstrClient.fetchJobs();
    emitLog('success', `Fetched ${jobs.length} jobs from Seedstr`);
    res.json({ success: true, jobs });
  } catch (err) {
    emitLog('error', `Failed to fetch jobs: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/solve-job – send a prompt to the coding agent webhook */
app.post('/api/solve-job', async (req, res) => {
  const { prompt, jobId, sessionId } = req.body;
  if (!prompt) return res.status(400).json({ success: false, error: 'prompt is required' });

  try {
    emitLog('info', `Sending prompt to webhook agent...`, { jobId });
    const solution = await seedstrClient.callWebhook(prompt, sessionId || `session-${Date.now()}`);
    emitLog('success', `Received solution from agent`, { jobId });
    emitSolution({ jobId, prompt, solution, timestamp: new Date().toISOString() });
    res.json({ success: true, solution });
  } catch (err) {
    emitLog('error', `Webhook call failed: ${err.message}`, { jobId });
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/submit-job – submit solution back to Seedstr */
app.post('/api/submit-job', async (req, res) => {
  const { jobId, solution } = req.body;
  if (!jobId || !solution) return res.status(400).json({ success: false, error: 'jobId and solution required' });

  try {
    emitLog('info', `Submitting solution for job ${jobId} to Seedstr...`);
    const result = await seedstrClient.submitSolution(jobId, solution);
    emitLog('success', `Solution submitted for job ${jobId}`, { jobId });
    res.json({ success: true, result });
  } catch (err) {
    emitLog('error', `Submit failed for job ${jobId}: ${err.message}`, { jobId });
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/worker/start – start the polling worker */
app.post('/api/worker/start', (req, res) => {
  startWorker();
  res.json({ success: true, message: 'Worker started' });
});

/** POST /api/worker/stop – stop the polling worker */
app.post('/api/worker/stop', (req, res) => {
  stopWorker();
  res.json({ success: true, message: 'Worker stopped' });
});

// ─────────────────────────────────────────────
// Socket.IO connection
// ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  socket.emit('log', {
    id: Date.now(),
    type: 'info',
    message: 'Connected to agent backend',
    timestamp: new Date().toISOString(),
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Seedstr Agent Backend running on port ${PORT}`);
  console.log(`   Webhook: ${process.env.AGENT_WEBHOOK_URL}`);
  console.log(`   Seedstr: ${process.env.SEEDSTR_BASE_URL}\n`);
  startWorker(); // auto-start polling worker
});
