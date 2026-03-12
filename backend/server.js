/**
 * Seedstr Agent Backend Server
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { seedstrClient, setRuntimeApiKey } from './seedstrClient.js';
import { startWorker, stopWorker, getWorkerStatus, resetProcessedJobs } from './worker.js';

dotenv.config();

const app        = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin:  process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH'],
  },
});

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));

// 50 MB limit — needed for base64-encoded ZIP payloads in /api/upload
app.use(express.json({ limit: '50mb' }));

// ─────────────────────────────────────────────
// Logging helpers
// ─────────────────────────────────────────────
export function emitLog(type, message, meta = {}) {
  const entry = {
    id:        Date.now() + Math.random(),
    type,      // 'info' | 'success' | 'error' | 'warn' | 'poll'
    message,
    meta,
    timestamp: new Date().toISOString(),
  };
  io.emit('log', entry);
  console.log(`[${type.toUpperCase()}] ${message}`);
  return entry;
}
export function emitJobUpdate(job) { io.emit('jobUpdate', job); }
export function emitSolution(sol)  { io.emit('solution', sol);  }

// ─────────────────────────────────────────────
// Profile cache — avoid a live API call on every /status request
// ─────────────────────────────────────────────
let cachedProfile    = null;
let profileFetchedAt = 0;
const PROFILE_TTL_MS = 60_000;

async function getCachedProfile() {
  if (!seedstrClient.isConfigured()) return null;
  if (Date.now() - profileFetchedAt > PROFILE_TTL_MS) {
    cachedProfile    = await seedstrClient.getMe();
    profileFetchedAt = Date.now();
  }
  return cachedProfile;
}

function invalidateProfileCache() {
  cachedProfile    = null;
  profileFetchedAt = 0;
}

// ─────────────────────────────────────────────
// REST Endpoints
// ─────────────────────────────────────────────

/** GET /api/status */
app.get('/api/status', async (req, res) => {
  const agentProfile = await getCachedProfile();
  res.json({
    online:       true,
    workerStatus: getWorkerStatus(),
    agentProfile,
    webhookUrl:   seedstrClient.getWebhookUrl(),
    seedstrBase:  process.env.SEEDSTR_BASE_URL || 'https://www.seedstr.io',
    configured:   seedstrClient.isConfigured(),
    timestamp:    new Date().toISOString(),
  });
});

// ── Registration ──

/** POST /api/register */
app.post('/api/register', async (req, res) => {
  const { walletAddress, walletType, ownerUrl } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ success: false, error: 'walletAddress required' });
  }
  try {
    emitLog('info', `Registering wallet ${walletAddress.slice(0, 10)}...`);
    const result = await seedstrClient.register(walletAddress, walletType, ownerUrl);
    if (result.apiKey) {
      setRuntimeApiKey(result.apiKey);
      invalidateProfileCache();
      emitLog('success', `Registered! Agent ID: ${result.agentId} — API key activated in memory`);
    }
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Registration failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Profile ──

/** GET /api/profile */
app.get('/api/profile', async (req, res) => {
  try {
    const profile = await getCachedProfile();
    if (!profile) {
      return res.status(404).json({ success: false, error: 'No profile. Set SEEDSTR_API_KEY.' });
    }
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** PATCH /api/profile */
app.patch('/api/profile', async (req, res) => {
  const { name, bio, profilePicture, skills } = req.body;
  try {
    emitLog('info', 'Updating agent profile...');
    const result = await seedstrClient.updateProfile({ name, bio, profilePicture, skills });
    invalidateProfileCache();
    emitLog('success', 'Profile updated');
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Profile update failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/verify */
app.post('/api/verify', async (req, res) => {
  try {
    emitLog('info', 'Triggering Twitter verification...');
    const result = await seedstrClient.verify();
    invalidateProfileCache();
    emitLog(
      result.isVerified ? 'success' : 'warn',
      result.isVerified
        ? `Verified! Twitter: ${result.ownerTwitter}`
        : 'Not verified yet — post your verification tweet first'
    );
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Verification failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Skills ──

/** GET /api/skills */
app.get('/api/skills', async (req, res) => {
  try {
    const result = await seedstrClient.getSkills();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Jobs ──

/** GET /api/jobs */
app.get('/api/jobs', async (req, res) => {
  const { limit, offset } = req.query;
  try {
    emitLog('poll', 'Manual job fetch...');
    const jobs = await seedstrClient.fetchJobs(parseInt(limit) || 20, parseInt(offset) || 0);
    emitLog('success', `Fetched ${jobs.length} jobs`);
    res.json({ success: true, jobs });
  } catch (err) {
    emitLog('error', `fetchJobs failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/jobs/:id */
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await seedstrClient.getJob(req.params.id);
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/jobs/:id/accept */
app.post('/api/jobs/:id/accept', async (req, res) => {
  try {
    emitLog('info', `Accepting job ${req.params.id}...`);
    const result = await seedstrClient.acceptJob(req.params.id);
    emitLog('success', `Job ${req.params.id} accepted`);
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Accept failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/jobs/:id/decline */
app.post('/api/jobs/:id/decline', async (req, res) => {
  const { reason } = req.body;
  try {
    const result = await seedstrClient.declineJob(req.params.id, reason);
    emitLog('warn', `Job ${req.params.id} declined`);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Manual solve (test panel) ──

/** POST /api/solve-job */
app.post('/api/solve-job', async (req, res) => {
  const { prompt, jobId, sessionId } = req.body;
  if (!prompt) return res.status(400).json({ success: false, error: 'prompt required' });

  try {
    emitLog('info', `Manual webhook call...`, { jobId });
    const result = await seedstrClient.callWebhook(
      prompt,
      sessionId || `manual-${Date.now()}`
    );

    const displaySolution = result.type === 'file'
      ? `[ZIP returned: ${result.fileName}]`
      : result.content;

    emitLog('success', `Webhook returned [${result.type}]`, { jobId });
    emitSolution({ jobId, prompt, solution: displaySolution, timestamp: new Date().toISOString() });
    res.json({ success: true, solution: displaySolution, responseType: result.type });
  } catch (err) {
    emitLog('error', `Webhook failed: ${err.message}`, { jobId });
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Manual submit ──

/** POST /api/submit-job */
app.post('/api/submit-job', async (req, res) => {
  const { jobId, solution, responseType, files } = req.body;
  if (!jobId || !solution) {
    return res.status(400).json({ success: false, error: 'jobId and solution required' });
  }
  try {
    emitLog('info', `Submitting job ${jobId} [${responseType || 'TEXT'}]...`);
    let result;
    if (responseType === 'FILE' && files?.length) {
      result = await seedstrClient.submitFileSolution(jobId, solution, files);
    } else {
      result = await seedstrClient.submitTextSolution(jobId, solution);
    }
    const payout = result?.payout;
    emitLog('success',
      `Submitted job ${jobId}${payout ? ` | 💰 ${payout.amountNative} ${payout.chain}` : ''}`
    );
    res.json({ success: true, result });
  } catch (err) {
    emitLog('error', `Submit failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── File upload ──

/** POST /api/upload */
app.post('/api/upload', async (req, res) => {
  const { files } = req.body;
  if (!Array.isArray(files) || !files.length) {
    return res.status(400).json({ success: false, error: 'files array required' });
  }
  try {
    emitLog('info', `Uploading ${files.length} file(s)...`);
    const result = await seedstrClient.uploadFiles(files);
    emitLog('success', `Uploaded ${result.files?.length || 0} file(s)`);
    res.json({ success: true, ...result });
  } catch (err) {
    emitLog('error', `Upload failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Worker controls ──

/** POST /api/worker/start */
app.post('/api/worker/start', (req, res) => {
  startWorker();
  res.json({ success: true, status: getWorkerStatus() });
});

/** POST /api/worker/stop */
app.post('/api/worker/stop', (req, res) => {
  stopWorker();
  res.json({ success: true, status: getWorkerStatus() });
});

/** POST /api/worker/reset */
app.post('/api/worker/reset', (req, res) => {
  resetProcessedJobs();
  res.json({ success: true, message: 'Job cache cleared' });
});

/** GET /api/worker/status */
app.get('/api/worker/status', (req, res) => {
  res.json({ success: true, status: getWorkerStatus() });
});

// ─────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  socket.emit('log', {
    id:        Date.now(),
    type:      'info',
    message:   'Connected to Seedstr agent backend',
    timestamp: new Date().toISOString(),
  });
  socket.emit('workerStatus', getWorkerStatus());
  socket.on('disconnect', () => console.log(`[WS] Client disconnected: ${socket.id}`));
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Seedstr Agent Backend — port ${PORT}`);
  console.log(`   Webhook:  ${seedstrClient.getWebhookUrl()}`);
  console.log(`   Seedstr:  ${process.env.SEEDSTR_BASE_URL || 'https://www.seedstr.io'}`);
  console.log(`   API Key:  ${seedstrClient.isConfigured() ? '✓ configured' : '✗ NOT SET — register first'}\n`);

  if (seedstrClient.isConfigured()) {
    startWorker();
  } else {
    console.log('⚠  Worker not started. Set SEEDSTR_API_KEY in .env or register via the dashboard.\n');
  }
});