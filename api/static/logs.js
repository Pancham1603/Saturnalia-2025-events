// Utility functions
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error);
  }
  return res.json();
}

function showLoading() {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('logs').classList.add('hidden');
  document.getElementById('emptyState').classList.add('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('logs').classList.remove('hidden');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#e53e3e' : type === 'success' ? '#38a169' : '#3182ce'};
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    z-index: 1001;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Auth functions
async function loadMe() {
  try {
    const me = await api('/api/me');
    window.CURRENT_USER = me;
    const authEl = document.getElementById('auth');
    if (me && me.email) {
      authEl.innerHTML = `
        <span>Welcome, ${me.name || me.email}</span>
        <a href="/auth/logout" class="btn btn-ghost">
          <i class="fas fa-sign-out-alt"></i>
          Logout
        </a>
      `;
    } else {
      authEl.innerHTML = `
        <a href="/auth/google" class="btn btn-primary">
          <i class="fab fa-google"></i>
          Login with Google
        </a>
      `;
    }
  } catch (err) {
    console.warn('Auth check failed:', err);
    showToast('Failed to check authentication status', 'error');
  }
}

// Logs functions
async function loadLogs() {
  showLoading();
  try {
    const logs = await api('/api/logs');
    const container = document.getElementById('logs');
    const emptyState = document.getElementById('emptyState');
    
    if (logs.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      hideLoading();
      return;
    }
    
    emptyState.classList.add('hidden');
    container.innerHTML = logs.map(log => {
      const date = new Date(log.timestamp).toLocaleString();
      const actionIcon = getActionIcon(log.action);
      return `
        <div class="log-entry">
          <div class="log-icon">
            <i class="${actionIcon}"></i>
          </div>
          <div class="log-content">
            <div class="log-header">
              <strong>${log.action.toUpperCase()}</strong>
              <span class="log-collection">${log.collection}</span>
              ${log.doc_id ? `<span class="log-id">(${log.doc_id.substring(0, 8)}...)</span>` : ''}
            </div>
            <div class="log-meta">
              <span class="log-time">${date}</span>
              ${log.user ? `<span class="log-user">by ${log.user}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    hideLoading();
  } catch (err) {
    console.error('Failed to load logs:', err);
    showToast('Failed to load activity logs', 'error');
    document.getElementById('logs').innerHTML = '<div class="log-entry error">Failed to load activity logs</div>';
    hideLoading();
  }
}

function getActionIcon(action) {
  switch (action.toLowerCase()) {
    case 'create':
    case 'insert':
      return 'fas fa-plus-circle text-success';
    case 'update':
    case 'edit':
      return 'fas fa-edit text-info';
    case 'delete':
    case 'remove':
      return 'fas fa-trash text-danger';
    case 'read':
    case 'view':
      return 'fas fa-eye text-secondary';
    default:
      return 'fas fa-circle text-muted';
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
  // Initial load
  await loadMe();
  await loadLogs();
  
  // Button event listeners
  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await loadLogs();
    showToast('Logs refreshed', 'success');
  });
});