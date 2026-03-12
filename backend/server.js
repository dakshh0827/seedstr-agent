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
app.get('/api/status', async (req, res) => {
  // Fetch live stats from the Seedstr API
  const agentProfile = await seedstrClient.getMe();
  
  res.json({
    online: true,
    workerStatus: getWorkerStatus(),
    agentProfile,
    webhookUrl: seedstrClient.getWebhookUrl(),
    seedstrBase: process.env.SEEDSTR_BASE_URL || 'https://www.seedstr.io',
    configured: seedstrClient.isConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// Agent Registration & Profile Endpoints
// ─────────────────────────────────────────────

/** POST /api/register – register a new agent */
app.post('/api/register', async (req, res) => {
  const { walletAddress, walletType, ownerUrl } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ success: false, error: 'walletAddress is required' });
  }

  try {
    emitLog('info', `Registering new agent with wallet: ${walletAddress.slice(0, 8)}...`);
    const result = await seedstrClient.register(walletAddress, walletType, ownerUrl);
    emitLog('success', `Agent registered successfully! ID: ${result.agentId}`);
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Registration failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/profile – get current agent profile */
app.get('/api/profile', async (req, res) => {
  try {
    const profile = await seedstrClient.getMe();
    if (!profile) {
      return res.status(404).json({ success: false, error: 'No profile found. Is API key configured?' });
    }
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PATCH /api/profile – update agent profile */
app.patch('/api/profile', async (req, res) => {
  const { name, bio, profilePicture, skills } = req.body;
  
  try {
    emitLog('info', 'Updating agent profile...');
    const result = await seedstrClient.updateProfile({ name, bio, profilePicture, skills });
    emitLog('success', 'Profile updated successfully');
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Profile update failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/verify – trigger Twitter verification */
app.post('/api/verify', async (req, res) => {
  try {
    emitLog('info', 'Triggering Twitter verification check...');
    const result = await seedstrClient.verify();
    if (result.isVerified) {
      emitLog('success', `Agent verified! Twitter: ${result.ownerTwitter}`);
    } else {
      emitLog('warn', 'Verification pending - post verification tweet first');
    }
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Verification failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// Jobs Endpoints
// ─────────────────────────────────────────────

/** GET /api/jobs – fetch available jobs from Seedstr */
app.get('/api/jobs', async (req, res) => {
  const { limit, offset } = req.query;
  
  try {
    emitLog('poll', 'Fetching jobs from Seedstr...');
    const jobs = await seedstrClient.fetchJobs(
      parseInt(limit) || 20,
      parseInt(offset) || 0
    );
    emitLog('success', `Fetched ${jobs.length} jobs from Seedstr`);
    res.json({ success: true, jobs });
  } catch (err) {
    emitLog('error', `Failed to fetch jobs: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/jobs/:id – get specific job details */
app.get('/api/jobs/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const job = await seedstrClient.getJob(id);
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/jobs/:id/accept – accept a SWARM job */
app.post('/api/jobs/:id/accept', async (req, res) => {
  const { id } = req.params;
  
  try {
    emitLog('info', `Accepting SWARM job ${id}...`);
    const result = await seedstrClient.acceptJob(id);
    emitLog('success', `Accepted job ${id}, slots remaining: ${result.slotsRemaining}`);
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Failed to accept job ${id}: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/jobs/:id/decline – decline a job */
app.post('/api/jobs/:id/decline', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  try {
    emitLog('warn', `Declining job ${id}...`);
    const result = await seedstrClient.declineJob(id, reason);
    emitLog('info', `Declined job ${id}`);
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Failed to decline job ${id}: ${err.message}`);
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
  const { jobId, solution, responseType, files } = req.body;
  if (!jobId || !solution) return res.status(400).json({ success: false, error: 'jobId and solution required' });

  try {
    emitLog('info', `Submitting solution for job ${jobId} to Seedstr...`);
    const result = await seedstrClient.submitSolution(jobId, solution, responseType, files);
    emitLog('success', `Solution submitted for job ${jobId}`, { jobId });
    if (result.payout) {
      emitLog('success', `Payout received: ${result.payout.amountNative} ${result.payout.chain}`);
    }
    res.json({ success: true, result });
  } catch (err) {
    emitLog('error', `Submit failed for job ${jobId}: ${err.message}`, { jobId });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// File Upload Endpoint
// ─────────────────────────────────────────────

/** POST /api/upload – upload files for attachment */
app.post('/api/upload', async (req, res) => {
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ success: false, error: 'files array is required' });
  }

  try {
    emitLog('info', `Uploading ${files.length} file(s)...`);
    const result = await seedstrClient.uploadFiles(files);
    emitLog('success', `Uploaded ${result.files?.length || 0} file(s) successfully`);
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Upload failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// Skills Endpoint
// ─────────────────────────────────────────────

/** GET /api/skills – list available skills */
app.get('/api/skills', async (req, res) => {
  try {
    const result = await seedstrClient.getSkills();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// Public Data Endpoints
// ─────────────────────────────────────────────

/** GET /api/agents/:id – get public agent profile */
app.get('/api/agents/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const agent = await seedstrClient.getAgent(id);
    res.json({ success: true, agent });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/leaderboard – get top agents */
app.get('/api/leaderboard', async (req, res) => {
  const { sortBy, limit } = req.query;
  
  try {
    const result = await seedstrClient.getLeaderboard(
      sortBy || 'reputation',
      parseInt(limit) || 50
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/stats – get platform statistics */
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await seedstrClient.getStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// Worker Control Endpoints
// ─────────────────────────────────────────────

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

/** GET /api/worker/status – get worker status */
app.get('/api/worker/status', (req, res) => {
  res.json({ success: true, status: getWorkerStatus() });
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
  console.log(`   Webhook: ${seedstrClient.getWebhookUrl()}`);
  console.log(`   Seedstr: ${process.env.SEEDSTR_BASE_URL || 'https://www.seedstr.io'}`);
  console.log(`   API Key: ${seedstrClient.isConfigured() ? 'Configured ✓' : 'NOT SET ✗'}\n`);
  startWorker(); // auto-start polling worker
});