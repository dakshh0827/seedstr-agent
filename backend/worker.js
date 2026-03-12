/**
 * Polling Worker
 * Automatically polls Seedstr for new jobs, solves them, and submits solutions
 */

import { seedstrClient } from './seedstrClient.js';
import { emitLog, emitJobUpdate, emitSolution, io } from './server.js';

const POLL_INTERVAL_MS = 10000; // 10 seconds

let pollingTimer     = null;
let isRunning        = false;
let isPollInProgress = false;
let processedJobIds  = new Set();
let lastPollTime     = null;
let successCount     = 0;
let failureCount     = 0;
let currentJobId     = null;

// ─────────────────────────────────────────────
// Worker lifecycle
// ─────────────────────────────────────────────

export function startWorker() {
  if (isRunning) {
    emitLog('warn', 'Worker already running');
    return;
  }
  isRunning = true;
  emitLog('info', `Polling worker started (interval: ${POLL_INTERVAL_MS / 1000}s)`);
  emitWorkerStatus();
  poll();
  pollingTimer = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopWorker() {
  if (!isRunning) return;
  clearInterval(pollingTimer);
  pollingTimer = null;
  isRunning = false;
  isPollInProgress = false;
  emitLog('warn', 'Polling worker stopped');
  emitWorkerStatus();
}

export function getWorkerStatus() {
  return {
    running: isRunning,
    lastPollTime,
    successCount,
    failureCount,
    processedJobCount: processedJobIds.size,
    currentJobId,
    pollIntervalMs: POLL_INTERVAL_MS,
  };
}

// ─────────────────────────────────────────────
// Core poll loop
// ─────────────────────────────────────────────

async function poll() {
  if (!isRunning) return;

  if (isPollInProgress) {
    emitLog('warn', 'Previous poll still running — skipping this cycle');
    return;
  }

  isPollInProgress = true;
  lastPollTime = new Date().toISOString();
  emitLog('poll', 'Polling Seedstr for new jobs...');

  try {
    let jobs;
    try {
      jobs = await seedstrClient.fetchJobs();
    } catch (err) {
      emitLog('error', `Poll failed: ${err.message}`);
      return;
    }

    const newJobs = jobs.filter(j => {
      if (processedJobIds.has(j.id)) return false;
      if (j.status !== 'OPEN' && j.status !== 'pending') return false; 
      processedJobIds.add(j.id);
      return true;
    });

    emitLog('poll', `Found ${jobs.length} total jobs, ${newJobs.length} new`, { total: jobs.length, new: newJobs.length });
    io.emit('jobsList', jobs);

    for (const job of newJobs) {
      await processJob(job);
    }
  } finally {
    isPollInProgress = false;
    emitWorkerStatus();
  }
}

async function processJob(job) {
  currentJobId = job.id;
  emitLog('info', `Processing job ${job.id}...`, { jobId: job.id });
  emitJobUpdate({ ...job, status: 'processing' });

  // ── Step 1: Handle V2 Swarm Acceptance ──
  if (job.jobType === 'SWARM') {
    try {
      emitLog('info', `Accepting SWARM job ${job.id} to claim a slot...`, { jobId: job.id });
      await seedstrClient.acceptJob(job.id);
    } catch (err) {
      emitLog('warn', `Could not accept SWARM job ${job.id} (may be full): ${err.message}`, { jobId: job.id });
      emitJobUpdate({ ...job, status: 'failed', error: 'Failed to claim slot' });
      currentJobId = null;
      return;
    }
  }

  // ── Step 2: Call the AI coding agent webhook ──
  let solution;
  try {
    emitLog('info', `Calling webhook agent for job ${job.id}...`, { jobId: job.id });
    solution = await seedstrClient.callWebhook(job.prompt, `session-${job.id}`);
    
    emitLog('success', `Agent returned solution for job ${job.id}`, { jobId: job.id });
    
    // Emit for the UI to show the text portion
    emitSolution({
      jobId: job.id,
      prompt: job.prompt,
      solution: typeof solution === 'string' ? solution : solution.text,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    failureCount++;
    emitLog('error', `Webhook failed for job ${job.id}: ${err.message}`, { jobId: job.id });
    emitJobUpdate({ ...job, status: 'failed', error: err.message });
    
    // Explicitly decline job if webhook crashes
    try {
      await seedstrClient.declineJob(job.id, "Webhook failed to generate a response");
      emitLog('warn', `Declined job ${job.id} due to webhook failure.`);
    } catch (e) {}

    currentJobId = null;
    return;
  }

  // ── Step 3: Handle File Uploads (if applicable) & Submit ──
  try {
    let finalContent = solution;
    let uploadedFiles = null;

    // Check if the webhook returned a file payload
    if (typeof solution === 'object' && solution.file && solution.file.content) {
      emitLog('info', `Uploading file ${solution.file.name} to Seedstr...`, { jobId: job.id });
      
      // Upload to Seedstr's /api/v2/upload endpoint
      uploadedFiles = await seedstrClient.uploadFile(
        solution.file.name,
        solution.file.content,
        solution.file.type || 'application/zip'
      );
      
      finalContent = solution.text || `Attached file: ${solution.file.name}`;
      emitLog('success', `File uploaded successfully.`, { jobId: job.id });
    }

    emitLog('info', `Submitting final solution for job ${job.id}...`, { jobId: job.id });
    
    // Submit the response (will auto-switch to 'FILE' responseType if uploadedFiles exists)
    await seedstrClient.submitSolution(job.id, finalContent, uploadedFiles);
    
    successCount++;
    emitLog('success', `Job ${job.id} completed and submitted ✓`, { jobId: job.id });
    emitJobUpdate({ ...job, status: 'completed', solution: finalContent });
  } catch (err) {
    failureCount++;
    emitLog('error', `Submission failed for job ${job.id}: ${err.message}`, { jobId: job.id });
    emitJobUpdate({ ...job, status: 'submit_failed', error: err.message });
  }

  currentJobId = null;
}

function emitWorkerStatus() {
  io.emit('workerStatus', getWorkerStatus());
}