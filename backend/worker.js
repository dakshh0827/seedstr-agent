/**
 * Polling Worker
 * Handles STANDARD and SWARM jobs
 * Full ZIP upload pipeline: webhook → detect binary → upload → submitFileSolution
 */

import { seedstrClient, formatBytes } from './seedstrClient.js';
import { emitLog, emitJobUpdate, emitSolution, io } from './server.js';

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '10000');

let pollingTimer     = null;
let isRunning        = false;
let isPollInProgress = false;
let processedJobIds  = new Set();
let lastPollTime     = null;
let successCount     = 0;
let failureCount     = 0;
let currentJobId     = null;
let totalEarnings    = 0;

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

export function startWorker() {
  if (isRunning) {
    emitLog('warn', 'Worker is already running');
    return;
  }
  if (!seedstrClient.isConfigured()) {
    emitLog('warn', 'Cannot start — SEEDSTR_API_KEY not set. Register first.');
    return;
  }
  isRunning = true;
  emitLog('info', `Worker started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
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
  emitLog('warn', 'Worker stopped');
  emitWorkerStatus();
}

export function getWorkerStatus() {
  return {
    running:           isRunning,
    lastPollTime,
    successCount,
    failureCount,
    totalEarnings,
    processedJobCount: processedJobIds.size,
    currentJobId,
    pollIntervalMs:    POLL_INTERVAL_MS,
  };
}

export function resetProcessedJobs() {
  processedJobIds.clear();
  emitLog('info', 'Job cache cleared — will re-process all OPEN jobs');
  emitWorkerStatus();
}

// ─────────────────────────────────────────────
// Poll loop
// ─────────────────────────────────────────────

async function poll() {
  if (!isRunning) return;
  if (isPollInProgress) {
    emitLog('warn', 'Previous poll still running — skipping cycle');
    return;
  }

  isPollInProgress = true;
  lastPollTime = new Date().toISOString();
  emitLog('poll', 'Polling Seedstr...');

  try {
    let jobs;
    try {
      jobs = await seedstrClient.fetchJobs();
    } catch (err) {
      emitLog('error', `Poll failed: ${err.message}`);
      return;
    }

    // Only OPEN jobs not yet processed
    const newJobs = jobs.filter(j => {
      if (processedJobIds.has(j.id)) return false;
      if (j.status !== 'OPEN') return false;
      processedJobIds.add(j.id); // mark BEFORE any await to prevent double processing
      return true;
    });

    emitLog('poll', `${jobs.length} total | ${newJobs.length} new OPEN`, {
      total: jobs.length, new: newJobs.length,
    });
    io.emit('jobsList', jobs);

    for (const job of newJobs) {
      await processJob(job);
    }
  } finally {
    isPollInProgress = false;
    emitWorkerStatus();
  }
}

// ─────────────────────────────────────────────
// Job processor
// ─────────────────────────────────────────────

async function processJob(job) {
  currentJobId = job.id;
  const jobType = job.jobType || 'STANDARD';
  emitLog('info', `▶ ${jobType} job ${job.id}`, { jobId: job.id, jobType, budget: job.budget });
  emitJobUpdate({ ...job, status: 'processing' });

  // ── SWARM: accept slot first ──
  if (jobType === 'SWARM') {
    try {
      emitLog('info', `Claiming SWARM slot for ${job.id}...`, { jobId: job.id });
      const acc = await seedstrClient.acceptJob(job.id);
      emitLog('success',
        `SWARM slot claimed | ${acc.slotsRemaining} slots left | $${acc.acceptance?.budgetPerAgent}/agent`,
        { jobId: job.id }
      );
    } catch (err) {
      emitLog('warn', `SWARM slot unavailable for ${job.id}: ${err.message}`, { jobId: job.id });
      emitJobUpdate({ ...job, status: 'skipped', error: 'SWARM slot full or unavailable' });
      currentJobId = null;
      return;
    }
  }

  // ── Step 1: call the AI webhook ──
  let webhookResult;
  try {
    emitLog('info', `Calling webhook for job ${job.id}...`, { jobId: job.id });
    webhookResult = await seedstrClient.callWebhook(job.prompt, `session-${job.id}`);

    if (webhookResult.type === 'file') {
      emitLog('success',
        `Webhook returned ZIP: ${webhookResult.fileName} (${formatBytes(webhookResult.fileBuffer.length)})`,
        { jobId: job.id }
      );
      emitSolution({
        jobId:      job.id,
        prompt:     job.prompt,
        solution:   null,
        isZip:      true,
        fileName:   webhookResult.fileName,
        fileSize:   webhookResult.fileBuffer.length,
        // Send base64 so the frontend can unpack it in-browser
        fileBase64: webhookResult.fileBuffer.toString('base64'),
        timestamp:  new Date().toISOString(),
      });
    } else {
      emitLog('success', `Webhook returned text response`, { jobId: job.id });
      emitSolution({
        jobId:     job.id,
        prompt:    job.prompt,
        solution:  webhookResult.content,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    failureCount++;
    emitLog('error', `Webhook failed for ${job.id}: ${err.message}`, { jobId: job.id });
    emitJobUpdate({ ...job, status: 'failed', error: err.message });
    try {
      await seedstrClient.declineJob(job.id, 'Agent webhook processing error');
    } catch (_) {}
    currentJobId = null;
    return;
  }

  // ── Step 2: upload + submit ──
  try {
    let submitResult;

    if (webhookResult.type === 'file') {
      // ─── FILE path ───────────────────────────────────────
      // 2a. Upload the ZIP to Seedstr CDN
      emitLog('info', `Uploading ${webhookResult.fileName} to Seedstr...`, { jobId: job.id });

      const uploadResult = await seedstrClient.uploadFiles([{
        name:    webhookResult.fileName,
        content: webhookResult.fileBuffer, // Buffer — client converts to base64
        type:    webhookResult.mimeType,
      }]);

      if (!uploadResult?.files?.length) {
        throw new Error('Upload succeeded but returned no file URLs');
      }

      const uploaded = uploadResult.files[0];
      emitLog('success',
        `Uploaded: ${uploaded.name} (${formatBytes(uploaded.size)}) → ${uploaded.url}`,
        { jobId: job.id }
      );

      // 2b. Submit with responseType: FILE
      // content is required and must be >= 10 chars — use a meaningful summary
      const summary = buildFileSummary(job.prompt, uploaded);

      submitResult = await seedstrClient.submitFileSolution(
        job.id,
        summary,
        [{
          url:  uploaded.url,
          name: uploaded.name,
          size: uploaded.size,
          type: uploaded.type,
        }]
      );

    } else {
      // ─── TEXT path ──────────────────────────────────────
      submitResult = await seedstrClient.submitTextSolution(job.id, webhookResult.content);
    }

    // ── Success ──
    successCount++;
    const payout    = submitResult?.payout;
    const payoutStr = payout ? ` | 💰 ${payout.amountNative} ${payout.chain}` : '';

    emitLog('success', `✓ Job ${job.id} submitted${payoutStr}`, { jobId: job.id, payout });

    if (payout?.amountNative) {
      totalEarnings += Number(payout.amountNative) || 0;
    }

    emitJobUpdate({
      ...job,
      status:   'completed',
      solution: webhookResult.type === 'file'
        ? `[${webhookResult.fileName}]`
        : webhookResult.content,
      payout,
    });

  } catch (err) {
    failureCount++;
    emitLog('error', `Submit failed for ${job.id}: ${err.message}`, { jobId: job.id });
    emitJobUpdate({ ...job, status: 'submit_failed', error: err.message });
  }

  currentJobId = null;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Build a human-readable summary for FILE submissions.
 * The Seedstr API requires content >= 10 chars alongside the file attachment.
 */
function buildFileSummary(prompt, uploadedFile) {
  const truncated = prompt.length > 120 ? prompt.slice(0, 120) + '…' : prompt;
  return `Solution for: "${truncated}". Delivered as ${uploadedFile.name} (${formatBytes(uploadedFile.size)}).`;
}

function emitWorkerStatus() {
  io.emit('workerStatus', getWorkerStatus());
}