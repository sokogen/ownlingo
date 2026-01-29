# ownlingo

Shopify content translation automation system with background job processing.

## Features

- **Background Job System**: Asynchronous translation processing with priority queue
- **Job Types**:
  - `full`: Translate all content
  - `incremental`: Translate only changed content
  - `single`: Translate a specific resource
- **Progress Tracking**: Real-time progress updates with completion statistics
- **Retry Logic**: Automatic retry of failed items with configurable limits
- **Cancellation Support**: Cancel running jobs
- **Concurrency Control**: Respect AI provider rate limits
- **Translation Caching**: Avoid retranslating unchanged content
- **Content Hash System**: Detect content changes efficiently

## Installation

```bash
npm install
```

## Usage

### Basic Setup

```typescript
import { Schema, MockAIProvider, TranslationJobRunner, JobCreator } from 'ownlingo';

// Initialize database
const schema = new Schema('./translation.db');
const db = schema.getDatabase();

// Set up AI provider
const provider = new MockAIProvider();

// Create job runner
const runner = new TranslationJobRunner(db, provider, {
  maxConcurrency: 5,
  maxRetries: 3,
  retryDelay: 1000,
  pollInterval: 5000,
});

// Create job creator
const creator = new JobCreator(db);
```

### Creating Jobs

```typescript
// Full translation (all content)
const fullJobId = creator.createJob({
  type: 'full',
  sourceLocale: 'en',
  targetLocales: ['fr', 'es', 'de'],
  priority: 1,
});

// Incremental translation (only changed content)
const incrementalJobId = creator.createJob({
  type: 'incremental',
  sourceLocale: 'en',
  targetLocales: ['fr'],
  priority: 2,
});

// Single resource translation
const singleJobId = creator.createJob({
  type: 'single',
  sourceLocale: 'en',
  targetLocales: ['fr'],
  resourceId: 'resource_123',
  priority: 3,
});
```

### Running Jobs

```typescript
// Listen to events
runner.on('progress', (progress) => {
  console.log(`Job ${progress.jobId}: ${progress.progress}% complete`);
  console.log(`Completed: ${progress.completed}/${progress.total}`);
  console.log(`Failed: ${progress.failed}`);
});

runner.on('job:completed', ({ jobId }) => {
  console.log(`Job ${jobId} completed`);
});

runner.on('job:failed', ({ jobId, error }) => {
  console.error(`Job ${jobId} failed:`, error);
});

runner.on('item:completed', ({ jobId, itemId }) => {
  console.log(`Item ${itemId} completed in job ${jobId}`);
});

runner.on('item:cache-hit', ({ jobId, itemId }) => {
  console.log(`Item ${itemId} used cached translation`);
});

// Start processing
await runner.start();
```

### Job Management

```typescript
// Get job progress
const progress = runner.getJobProgress(jobId);
console.log(progress);
// {
//   jobId: 'job_123',
//   total: 100,
//   completed: 75,
//   failed: 2,
//   progress: 75
// }

// Cancel a job
await runner.cancelJob(jobId);

// Retry failed items
await runner.retryFailedItems(jobId);

// Stop the runner
await runner.stop();
```

### Content Hashing

```typescript
import { ContentHasher } from 'ownlingo';

// Generate hash for content
const hash = ContentHasher.hash({
  text: 'Hello world',
  metadata: { type: 'greeting' }
});

// Check if content changed
const hasChanged = ContentHasher.hasChanged(oldHash, newContent);
```

## Architecture

### Database Schema

- **resources**: Store Shopify content to translate
- **translation_jobs**: Track translation jobs with status and progress
- **translation_job_items**: Individual translation tasks within a job
- **translations**: Cache of completed translations

### Job Lifecycle

1. **Created**: Job is created with status `pending`
2. **Running**: Job is picked up by runner and status changes to `running`
3. **Processing**: Items are processed one by one
4. **Completed/Failed**: Job finishes with final status
5. **Cancelled**: Job can be cancelled at any time

### Event Flow

```
Job Created → Job Picked Up → Items Processing → Progress Updates → Job Completed
                                      ↓
                              Item Cache Check → Translation → Cache Store
                                      ↓
                              Retry on Failure (up to max retries)
```

## Testing

```bash
npm test
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run test:watch

# Lint
npm run lint
```

## License

MIT
