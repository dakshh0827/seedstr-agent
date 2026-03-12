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

export const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', methods: ['GET', 'POST'] },
});

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

export function emitLog(type, message, meta = {}) {
  const entry = { id: Date.now() + Math.random(), type, message, meta, timestamp: new Date().toISOString() };
  io.emit('log', entry);
  console.log(`[${type.toUpperCase()}] ${message}`);
  return entry;
}

export function emitJobUpdate(job) { io.emit('jobUpdate', job); }
export function emitSolution(solution) { io.emit('solution', solution); }

// REST Endpoints
app.get('/api/status', async (req, res) => {
  const agentProfile = await seedstrClient.getMe();
  res.json({
    online: true, workerStatus: getWorkerStatus(), agentProfile,
    webhookUrl: process.env.AGENT_WEBHOOK_URL || 'NOT_SET',
    seedstrBase: process.env.SEEDSTR_BASE_URL || 'NOT_SET',
    timestamp: new Date().toISOString(),
  });
});

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

app.post('/api/solve-job', async (req, res) => {
  const { prompt, jobId, sessionId } = req.body;
  if (!prompt) return res.status(400).json({ success: false, error: 'prompt is required' });

  try {
    emitLog('info', `Sending prompt to webhook agent...`, { jobId });
    const solution = await seedstrClient.callWebhook(prompt, sessionId || `session-${Date.now()}`);
    
    // Cleanly extract text for the UI so it doesn't return 'undefined'
    let displaySolution = solution;
    if (typeof solution === 'object' && solution.file) {
       displaySolution = `${solution.text}\n\n[Attached File Payload Generated: ${solution.file.name}]`;
    }

    emitLog('success', `Received solution from agent`, { jobId });
    emitSolution({ jobId, prompt, solution: displaySolution, timestamp: new Date().toISOString() });
    
    // Return rawSolution as well so the submit route can use it
    res.json({ success: true, solution: displaySolution, rawSolution: solution });
  } catch (err) {
    emitLog('error', `Webhook call failed: ${err.message}`, { jobId });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/submit-job', async (req, res) => {
  const { jobId, solution, rawSolution } = req.body;
  if (!jobId || !solution) return res.status(400).json({ success: false, error: 'jobId and solution required' });

  try {
    let finalContent = solution;
    let uploadedFiles = null;

    // Detect if we need to call the Seedstr V2 Upload endpoint first
    if (rawSolution && typeof rawSolution === 'object' && rawSolution.file) {
      emitLog('info', `Uploading file ${rawSolution.file.name} to Seedstr...`);
      uploadedFiles = await seedstrClient.uploadFile(
        rawSolution.file.name,
        rawSolution.file.content,
        rawSolution.file.type || 'application/zip'
      );
      finalContent = rawSolution.text || `Attached file: ${rawSolution.file.name}`;
      emitLog('success', `File uploaded successfully.`);
    }

    emitLog('info', `Submitting solution for job ${jobId} to Seedstr...`);
    const result = await seedstrClient.submitSolution(jobId, finalContent, uploadedFiles);
    emitLog('success', `Solution submitted for job ${jobId}`, { jobId });
    res.json({ success: true, result });
  } catch (err) {
    emitLog('error', `Submit failed for job ${jobId}: ${err.message}`, { jobId });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worker/start', (req, res) => { startWorker(); res.json({ success: true, message: 'Worker started' }); });
app.post('/api/worker/stop', (req, res) => { stopWorker(); res.json({ success: true, message: 'Worker stopped' }); });

io.on('connection', (socket) => {
  socket.emit('log', { id: Date.now(), type: 'info', message: 'Connected to agent backend', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Seedstr Agent Backend running on port ${PORT}`);
  console.log(`   Webhook: ${process.env.AGENT_WEBHOOK_URL}`);
  startWorker();
});