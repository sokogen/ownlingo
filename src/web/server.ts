// Translation Queue UI Web Server
// ol-009: Translation Queue UI

import express, { Request, Response } from 'express';
import path from 'path';
import { Schema } from '../db/schema';
import { TranslationJobRunner } from '../jobs/job-runner';
import { MockAIProvider } from '../providers/ai-provider';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database and job runner
const schema = new Schema('./ownlingo.db');
const db = schema.getDatabase();
const provider = new MockAIProvider();
const jobRunner = new TranslationJobRunner(db, provider);

// SSE clients
const sseClients: Set<Response> = new Set();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get all jobs
app.get('/api/jobs', (req: Request, res: Response) => {
  const stmt = db.prepare(`
    SELECT * FROM translation_jobs
    ORDER BY created_at DESC
  `);
  const jobs = stmt.all();
  res.json(jobs);
});

// API: Get job details
app.get('/api/jobs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const stmt = db.prepare('SELECT * FROM translation_jobs WHERE id = ?');
  const job = stmt.get(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// API: Get job items
app.get('/api/jobs/:id/items', (req: Request, res: Response) => {
  const { id } = req.params;
  const stmt = db.prepare(`
    SELECT
      ji.*,
      r.title,
      r.resource_type
    FROM translation_job_items ji
    LEFT JOIN resources r ON ji.resource_id = r.id
    WHERE ji.job_id = ?
    ORDER BY ji.created_at ASC
  `);
  const items = stmt.all(id);
  res.json(items);
});

// API: Cancel a job
app.post('/api/jobs/:id/cancel', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await jobRunner.cancelJob(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: Retry failed items
app.post('/api/jobs/:id/retry', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await jobRunner.retryFailedItems(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get job logs (error messages)
app.get('/api/jobs/:id/logs', (req: Request, res: Response) => {
  const { id } = req.params;
  const stmt = db.prepare(`
    SELECT
      id,
      resource_id,
      target_locale,
      status,
      error_message,
      retry_count,
      updated_at
    FROM translation_job_items
    WHERE job_id = ? AND error_message IS NOT NULL
    ORDER BY updated_at DESC
  `);
  const logs = stmt.all(id);
  res.json(logs);
});

// SSE: Real-time updates
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  sseClients.add(res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Broadcast SSE event to all clients
function broadcastEvent(event: any) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(client => {
    client.write(data);
  });
}

// Listen to job runner events and broadcast to SSE clients
jobRunner.on('progress', (data) => {
  broadcastEvent({ type: 'progress', data });
});

jobRunner.on('job:completed', (data) => {
  broadcastEvent({ type: 'job:completed', data });
});

jobRunner.on('job:failed', (data) => {
  broadcastEvent({ type: 'job:failed', data });
});

jobRunner.on('job:cancelled', (data) => {
  broadcastEvent({ type: 'job:cancelled', data });
});

jobRunner.on('item:completed', (data) => {
  broadcastEvent({ type: 'item:completed', data });
});

jobRunner.on('item:failed', (data) => {
  broadcastEvent({ type: 'item:failed', data });
});

// Start job runner
jobRunner.start().then(() => {
  console.log('Job runner started');
}).catch((error) => {
  console.error('Failed to start job runner:', error);
});

// Start server
app.listen(PORT, () => {
  console.log(`Translation Queue UI running at http://localhost:${PORT}`);
});
