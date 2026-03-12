/**
 * Polling Worker
 * Automatically polls Seedstr for new jobs, solves them, and submits solutions
 */

import { seedstrClient } from './seedstrClient.js';
import { emitLog, emitJobUpdate, emitSolution, io } from './server.js';

const POLL_INTERVAL_MS = 10000; // 10 seconds

let pollingTimer     = null;
let isRunning        = false;
let isPollInProgress = false;  // prevents concurrent poll cycles
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
  poll(); // run immediately
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

  // CRITICAL: skip this tick if a previous poll cycle is still processing jobs
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

    // Filter to only truly new jobs — mark them immediately to prevent re-processing
    const newJobs = jobs.filter(j => {
      if (processedJobIds.has(j.id)) return false;
      if (j.status !== 'pending') return false;
      // Mark as "in-flight" right now, before any await, so concurrent polls skip it
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

  // ── Step 1: Call the AI coding agent webhook ──
  let solution;
  try {
    emitLog('info', `Calling webhook agent for job ${job.id}...`, { jobId: job.id });
    solution = await seedstrClient.callWebhook(
      job.prompt,
      `session-${job.id}`
    );
    emitLog('success', `Agent returned solution for job ${job.id}`, { jobId: job.id });
    emitSolution({
      jobId: job.id,
      prompt: job.prompt,
      solution,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    failureCount++;
    emitLog('error', `Webhook failed for job ${job.id}: ${err.message}`, { jobId: job.id });
    emitJobUpdate({ ...job, status: 'failed', error: err.message });
    // processedJobIds already has this id — leave it so we don't retry endlessly
    currentJobId = null;
    return;
  }

  // ── Step 2: Submit solution to Seedstr ──
  try {
    emitLog('info', `Submitting solution for job ${job.id}...`, { jobId: job.id });
    await seedstrClient.submitSolution(job.id, solution);
    successCount++;
    emitLog('success', `Job ${job.id} completed and submitted ✓`, { jobId: job.id });
    emitJobUpdate({ ...job, status: 'completed', solution });
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