// Recently Deleted JavaScript

// Global variables
let currentData = null;

// API helper function
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let errorMessage = 'Unknown error occurred';
    
    try {
      // First try to parse as JSON to get backend error message
      const errorData = await res.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
      } else if (typeof errorData === 'string') {
        errorMessage = errorData;
      }
    } catch (jsonError) {
      // If JSON parsing fails, try text
      try {
        const clonedRes = res.clone();
        const errorText = await clonedRes.text();
        if (errorText && errorText.trim()) {
          // Try to extract error from JSON-like text
          try {
            const parsed = JSON.parse(errorText);
            errorMessage = parsed.error || errorText;
          } catch (parseError) {
            errorMessage = errorText;
          }
        }
      } catch (textError) {
        // Final fallback to HTTP status
        errorMessage = `Server error (${res.status})`;
      }
    }
    
    throw new Error(errorMessage);
  }
  return res.json();
}

// Load current user info
async function loadMe() {
  try {
    const me = await api('/api/me');
    const authEl = document.getElementById('auth');
    if (me && me.email) {
      authEl.innerHTML = `
        <a href="/auth/logout" class="btn btn-ghost">
          <i class="fas fa-sign-out-alt"></i>
          Logout
        </a>
      `;
    } else {
      authEl.innerHTML = `<a href="/auth/google">Login with Google</a>`;
    }
  } catch (err) {
    console.error('Failed to load user:', err);
    document.getElementById('auth').innerHTML = `<a href="/auth/google">Login with Google</a>`;
  }
}

// Load recently deleted files
async function loadRecentlyDeleted() {
  try {
    const container = document.getElementById('recentlyDeletedContent');
    container.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-spinner"></i>
        <span>Loading deleted files...</span>
      </div>
    `;
    
    const data = await api('/api/filesystem/recently-deleted');
    currentData = data;
    renderRecentlyDeleted(data.items, data.count);
    updateStats(data.count);
    
  } catch (err) {
    console.error('Failed to load recently deleted files:', err);
    document.getElementById('recentlyDeletedContent').innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error Loading Deleted Files</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

// Update stats display
function updateStats(count) {
  const statsEl = document.getElementById('deletedStats');
  const fileCountEl = document.getElementById('fileCount');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const clearAllBtn = document.getElementById('clearAllBtn');
  
  if (count > 0) {
    statsEl.style.display = 'flex';
    fileCountEl.textContent = `${count} file${count !== 1 ? 's' : ''}`;
    lastUpdatedEl.textContent = new Date().toLocaleString();
    clearAllBtn.style.display = 'inline-flex';
  } else {
    statsEl.style.display = 'none';
    clearAllBtn.style.display = 'none';
  }
}

// Render recently deleted files
function renderRecentlyDeleted(items, count) {
  const container = document.getElementById('recentlyDeletedContent');
  
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="empty-deleted-state">
        <i class="fas fa-trash-alt"></i>
        <h3>No Deleted Files</h3>
        <p>Files you delete will appear here and can be restored.<br>
        Deleted files are safely preserved until you choose to permanently delete them.</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  items.forEach(item => {
    const deletedDate = new Date(item.deleted_date);
    const formattedDate = deletedDate.toLocaleDateString();
    const formattedTime = deletedDate.toLocaleTimeString();
    const relativeTime = formatRelativeTime(item.deleted_date);
    
    html += `
      <div class="deleted-file-item">
        <div class="deleted-file-info">
          <div class="deleted-file-icon">
            <i class="fas ${getFileIcon(item.extension)}"></i>
          </div>
          <div class="deleted-file-details">
            <div class="deleted-file-name">${escapeHtml(item.original_name)}</div>
            <div class="deleted-file-meta">
              <div class="meta-item">
                <i class="fas fa-clock"></i>
                <span>Deleted ${relativeTime}</span>
              </div>
              <div class="meta-item">
                <i class="fas fa-calendar"></i>
                <span>${formattedDate} at ${formattedTime}</span>
              </div>
              <div class="meta-item">
                <i class="fas fa-weight-hanging"></i>
                <span>${formatFileSize(item.size)}</span>
              </div>
              <div class="meta-item">
                <i class="fas fa-file-alt"></i>
                <span>${item.extension || 'No extension'}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="deleted-file-actions">
          <button class="btn btn-restore" onclick="restoreFile('${escapeHtml(item.name)}', '${escapeHtml(item.original_name)}')" title="Restore file to original location">
            <i class="fas fa-undo"></i>
            Restore
          </button>
          <button class="btn btn-delete-permanent" onclick="permanentlyDeleteFile('${escapeHtml(item.name)}', '${escapeHtml(item.original_name)}')" title="Delete permanently (cannot be undone)">
            <i class="fas fa-trash-alt"></i>
            Delete Forever
          </button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Get file icon based on extension
function getFileIcon(extension) {
  if (!extension) return 'fa-file';
  
  switch (extension.toLowerCase()) {
    case '.md': return 'fa-file-alt';
    case '.json': return 'fa-file-code';
    case '.yaml':
    case '.yml': return 'fa-file-code';
    case '.txt': return 'fa-file-alt';
    case '.js': return 'fa-file-code';
    case '.ts': return 'fa-file-code';
    case '.css': return 'fa-file-code';
    case '.html': return 'fa-file-code';
    case '.vue': return 'fa-file-code';
    case '.config': return 'fa-cog';
    default: return 'fa-file';
  }
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format relative time for display
function formatRelativeTime(timestamp) {
  const now = new Date();
  const modified = new Date(timestamp);
  const diff = now - modified;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  return 'Just now';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Restore file from recently deleted
async function restoreFile(fileName, originalName) {
  if (!confirm(`Are you sure you want to restore "${originalName}"?\n\nThis will move the file back to its original location.`)) {
    return;
  }
  
  try {
    showLoading(true, 'Restoring file...');
    
    await api('/api/filesystem/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deleted_filename: fileName,
        original_name: originalName
      })
    });
    
    showSuccess(`File "${originalName}" restored successfully!`);
    loadRecentlyDeleted();
    showLoading(false);
    
  } catch (err) {
    console.error('Failed to restore file:', err);
    showError(err.message);
    showLoading(false);
  }
}

// Permanently delete file
async function permanentlyDeleteFile(fileName, originalName) {
  if (!confirm(`⚠️ PERMANENT DELETION WARNING ⚠️\n\nAre you absolutely sure you want to permanently delete "${originalName}"?\n\nThis action CANNOT be undone. The file will be completely removed from the system.`)) {
    return;
  }
  
  // Double confirmation for permanent deletion
  if (!confirm(`Last chance!\n\nClick OK to permanently delete "${originalName}" forever.\nClick Cancel to keep the file.`)) {
    return;
  }
  
  try {
    showLoading(true, 'Permanently deleting file...');
    
    await api('/api/filesystem/delete-permanent', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deleted_filename: fileName
      })
    });
    
    showSuccess(`File "${originalName}" permanently deleted!`);
    loadRecentlyDeleted();
    showLoading(false);
    
  } catch (err) {
    console.error('Failed to permanently delete file:', err);
    showError(err.message);
    showLoading(false);
  }
}

// Clear all deleted files
async function clearAllDeletedFiles() {
  if (!currentData || !currentData.items || currentData.items.length === 0) {
    showError('No files to clear');
    return;
  }
  
  const fileCount = currentData.items.length;
  if (!confirm(`⚠️ BULK PERMANENT DELETION WARNING ⚠️\n\nAre you sure you want to permanently delete ALL ${fileCount} deleted files?\n\nThis action CANNOT be undone. All files will be completely removed from the system.`)) {
    return;
  }
  
  // Double confirmation for bulk deletion
  if (!confirm(`FINAL CONFIRMATION\n\nThis will permanently delete ${fileCount} files forever.\n\nType "DELETE ALL" in the next prompt to confirm.`)) {
    return;
  }
  
  const confirmation = prompt('Type "DELETE ALL" to confirm permanent deletion of all files:');
  if (confirmation !== 'DELETE ALL') {
    showError('Confirmation text did not match. Operation cancelled.');
    return;
  }
  
  try {
    showLoading(true, `Permanently deleting ${fileCount} files...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of currentData.items) {
      try {
        await api('/api/filesystem/delete-permanent', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deleted_filename: item.name
          })
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to delete ${item.name}:`, err);
        errorCount++;
      }
    }
    
    if (errorCount === 0) {
      showSuccess(`All ${successCount} files permanently deleted!`);
    } else {
      showError(`${successCount} files deleted successfully, ${errorCount} files failed to delete.`);
    }
    
    loadRecentlyDeleted();
    showLoading(false);
    
  } catch (err) {
    console.error('Failed to clear all files:', err);
    showError('Failed to clear all files: ' + err.message);
    showLoading(false);
  }
}

// Utility functions
function showLoading(show, message = 'Loading...') {
  let loading = document.getElementById('globalLoading');
  if (!loading) {
    loading = document.createElement('div');
    loading.id = 'globalLoading';
    loading.className = 'loading-overlay hidden';
    loading.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-spinner fa-spin"></i>
        <span id="loadingMessage">${message}</span>
      </div>
    `;
    document.body.appendChild(loading);
  }
  
  const messageEl = document.getElementById('loadingMessage');
  if (messageEl) messageEl.textContent = message;
  
  if (show) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}

function showSuccess(message) {
  showNotification('success', message);
}

function showError(message) {
  showNotification('error', message);
}

function showNotification(type, message) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="notification-close">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

// Initialize the application
window.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
  await loadRecentlyDeleted();
  
  // Set up event listeners
  document.getElementById('refreshBtn').addEventListener('click', loadRecentlyDeleted);
  document.getElementById('clearAllBtn').addEventListener('click', clearAllDeletedFiles);
  
  // Auto-refresh every 30 seconds
  setInterval(loadRecentlyDeleted, 30000);
});