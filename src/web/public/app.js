// Translation Queue UI - Client-side logic
// ol-009: Translation Queue UI

let jobs = [];
let currentTab = 'active';
let eventSource = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventSource();
  loadJobs();
  setupTabs();
  setupModal();

  // Reload jobs every 10 seconds as fallback
  setInterval(loadJobs, 10000);
});

// Setup Server-Sent Events for real-time updates
function setupEventSource() {
  eventSource = new EventSource('/api/events');

  eventSource.onopen = () => {
    updateConnectionStatus(true);
  };

  eventSource.onerror = () => {
    updateConnectionStatus(false);
  };

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleRealtimeEvent(data);
  };
}

// Handle real-time events
function handleRealtimeEvent(event) {
  switch (event.type) {
    case 'connected':
      console.log('Connected to server');
      break;

    case 'progress':
    case 'job:completed':
    case 'job:failed':
    case 'job:cancelled':
    case 'item:completed':
    case 'item:failed':
      // Reload jobs to get updated data
      loadJobs();
      break;
  }
}

// Update connection status indicator
function updateConnectionStatus(connected) {
  const dot = document.getElementById('connectionStatus');
  const text = document.getElementById('connectionText');

  if (connected) {
    dot.classList.add('connected');
    dot.classList.remove('disconnected');
    text.textContent = 'Connected';
  } else {
    dot.classList.remove('connected');
    dot.classList.add('disconnected');
    text.textContent = 'Disconnected';
  }
}

// Load all jobs from API
async function loadJobs() {
  try {
    const response = await fetch('/api/jobs');
    jobs = await response.json();
    renderJobs();
  } catch (error) {
    console.error('Failed to load jobs:', error);
  }
}

// Setup tab switching
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderJobs();
    });
  });
}

// Filter jobs by current tab
function getFilteredJobs() {
  switch (currentTab) {
    case 'active':
      return jobs.filter(j => j.status === 'running');
    case 'pending':
      return jobs.filter(j => j.status === 'pending');
    case 'completed':
      return jobs.filter(j => j.status === 'completed');
    case 'all':
    default:
      return jobs;
  }
}

// Render jobs list
function renderJobs() {
  const container = document.getElementById('jobsContainer');
  const filteredJobs = getFilteredJobs();

  if (filteredJobs.length === 0) {
    container.innerHTML = `
      <div class="no-jobs">
        <h3>No jobs found</h3>
        <p>There are no ${currentTab === 'all' ? '' : currentTab} jobs at the moment.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredJobs.map(job => renderJobCard(job)).join('');

  // Attach event listeners
  filteredJobs.forEach((job, index) => {
    const card = container.children[index];

    // Card click to show details
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('btn')) {
        showJobDetails(job.id);
      }
    });

    // Cancel button
    const cancelBtn = card.querySelector('.btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelJob(job.id);
      });
    }

    // Retry button
    const retryBtn = card.querySelector('.btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        retryJob(job.id);
      });
    }
  });
}

// Render a single job card
function renderJobCard(job) {
  const createdDate = new Date(job.created_at).toLocaleString();
  const progressPercent = job.progress || 0;

  let progressClass = '';
  if (job.status === 'completed') progressClass = 'completed';
  if (job.status === 'failed') progressClass = 'failed';

  const showCancel = job.status === 'pending' || job.status === 'running';
  const showRetry = job.status === 'completed' && job.failed_items > 0;

  return `
    <div class="job-card">
      <div class="job-header">
        <div class="job-info">
          <h3>Job ${job.id}</h3>
          <div class="job-meta">
            Type: ${job.type} | Created: ${createdDate}
          </div>
        </div>
        <div class="job-status">
          <span class="status-badge ${job.status}">${job.status}</span>
        </div>
      </div>

      <div class="progress-section">
        <div class="progress-bar">
          <div class="progress-fill ${progressClass}" style="width: ${progressPercent}%"></div>
        </div>
        <div class="progress-stats">
          <span>Total: ${job.total_items}</span>
          <span>Completed: ${job.completed_items}</span>
          ${job.failed_items > 0 ? `<span style="color: #ef4444;">Failed: ${job.failed_items}</span>` : ''}
          <span>${progressPercent.toFixed(1)}%</span>
        </div>
      </div>

      ${showCancel || showRetry ? `
        <div class="job-actions">
          ${showCancel ? '<button class="btn btn-cancel">Cancel</button>' : ''}
          ${showRetry ? '<button class="btn btn-retry">Retry Failed</button>' : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// Cancel a job
async function cancelJob(jobId) {
  if (!confirm('Are you sure you want to cancel this job?')) {
    return;
  }

  try {
    const response = await fetch(`/api/jobs/${jobId}/cancel`, {
      method: 'POST'
    });

    if (response.ok) {
      loadJobs();
    } else {
      alert('Failed to cancel job');
    }
  } catch (error) {
    console.error('Cancel job error:', error);
    alert('Failed to cancel job');
  }
}

// Retry failed items in a job
async function retryJob(jobId) {
  if (!confirm('Retry all failed items in this job?')) {
    return;
  }

  try {
    const response = await fetch(`/api/jobs/${jobId}/retry`, {
      method: 'POST'
    });

    if (response.ok) {
      loadJobs();
    } else {
      alert('Failed to retry job');
    }
  } catch (error) {
    console.error('Retry job error:', error);
    alert('Failed to retry job');
  }
}

// Setup modal
function setupModal() {
  const modal = document.getElementById('jobModal');
  const closeBtn = document.getElementById('closeModal');

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

// Show job details in modal
async function showJobDetails(jobId) {
  const modal = document.getElementById('jobModal');
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');

  modalBody.innerHTML = '<div class="loading">Loading job details...</div>';
  modal.classList.add('active');

  try {
    // Load job details and items in parallel
    const [jobResponse, itemsResponse, logsResponse] = await Promise.all([
      fetch(`/api/jobs/${jobId}`),
      fetch(`/api/jobs/${jobId}/items`),
      fetch(`/api/jobs/${jobId}/logs`)
    ]);

    const job = await jobResponse.json();
    const items = await itemsResponse.json();
    const logs = await logsResponse.json();

    modalTitle.textContent = `Job ${job.id}`;
    modalBody.innerHTML = renderJobDetails(job, items, logs);
  } catch (error) {
    console.error('Failed to load job details:', error);
    modalBody.innerHTML = '<div class="error-message">Failed to load job details</div>';
  }
}

// Render job details
function renderJobDetails(job, items, logs) {
  const createdDate = new Date(job.created_at).toLocaleString();
  const startedDate = job.started_at ? new Date(job.started_at).toLocaleString() : 'N/A';
  const completedDate = job.completed_at ? new Date(job.completed_at).toLocaleString() : 'N/A';

  const targetLocales = JSON.parse(job.target_locales).join(', ');

  return `
    <div class="detail-section">
      <h3>Job Information</h3>
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label">Status</div>
          <div class="detail-value">
            <span class="status-badge ${job.status}">${job.status}</span>
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Type</div>
          <div class="detail-value">${job.type}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Priority</div>
          <div class="detail-value">${job.priority}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Source Locale</div>
          <div class="detail-value">${job.source_locale}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Target Locales</div>
          <div class="detail-value">${targetLocales}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Created</div>
          <div class="detail-value">${createdDate}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Started</div>
          <div class="detail-value">${startedDate}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">Completed</div>
          <div class="detail-value">${completedDate}</div>
        </div>
      </div>

      ${job.error_message ? `
        <div class="error-message" style="margin-top: 10px;">
          <strong>Error:</strong> ${job.error_message}
        </div>
      ` : ''}
    </div>

    <div class="detail-section">
      <h3>Progress</h3>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${job.progress}%"></div>
      </div>
      <div class="progress-stats" style="margin-top: 10px;">
        <span>Total: ${job.total_items}</span>
        <span>Completed: ${job.completed_items}</span>
        <span>Failed: ${job.failed_items}</span>
        <span>${job.progress.toFixed(1)}%</span>
      </div>
    </div>

    <div class="detail-section">
      <h3>Items (${items.length})</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Type</th>
            <th>Target</th>
            <th>Status</th>
            <th>Retries</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.title || item.resource_id}</td>
              <td>${item.resource_type || 'N/A'}</td>
              <td>${item.target_locale}</td>
              <td><span class="status-badge ${item.status}">${item.status}</span></td>
              <td>${item.retry_count}/${item.max_retries}</td>
              <td>${item.error_message ? `<span class="error-message">${item.error_message}</span>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${logs.length > 0 ? `
      <div class="detail-section">
        <h3>Error Logs (${logs.length})</h3>
        <table class="items-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Resource</th>
              <th>Target</th>
              <th>Status</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => `
              <tr>
                <td>${new Date(log.updated_at).toLocaleString()}</td>
                <td>${log.resource_id}</td>
                <td>${log.target_locale}</td>
                <td><span class="status-badge ${log.status}">${log.status}</span></td>
                <td><span class="error-message">${log.error_message}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;
}
