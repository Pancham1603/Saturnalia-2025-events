// API helper function
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    // Clone the response so we can read it multiple times if needed
    const clonedRes = res.clone();
    try {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Unknown error occurred');
    } catch (parseError) {
      // If response is not JSON, fall back to text from the cloned response
      try {
        const errorText = await clonedRes.text();
        throw new Error(errorText || 'Unknown error occurred');
      } catch (textError) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
    }
  }
  return res.json();
}

// Load current user info
async function loadMe() {
  try {
    const me = await api('/api/me');
    window.CURRENT_USER = me;
    const authEl = document.getElementById('auth');
    if (me && me.email) {
      authEl.innerHTML = `
        <a href="/auth/logout" class="btn btn-ghost">
          <i class="fas fa-sign-out-alt"></i>
          Logout
        </a>
      `;
      
      // Show logs button for admins and superusers (both mobile and header versions)
      const logsBtn = document.getElementById('logsBtn');
      const logsBtnHeader = document.getElementById('logsBtnHeader');
      const logsCard = document.getElementById('logsCard');
      if (me.admin || me.superuser) {
        if (logsBtn) logsBtn.style.display = 'inline-flex';
        if (logsBtnHeader) logsBtnHeader.style.display = 'inline-flex';
        if (logsCard) logsCard.style.display = 'block';
      }
      
      // Show user management button for superusers only (both mobile and header versions)
      const usersBtn = document.getElementById('usersBtn');
      const usersBtnHeader = document.getElementById('usersBtnHeader');
      const userManagementCard = document.getElementById('userManagementCard');
      if (me.superuser) {
        if (usersBtn) usersBtn.style.display = 'inline-flex';
        if (usersBtnHeader) usersBtnHeader.style.display = 'inline-flex';
        if (userManagementCard) userManagementCard.style.display = 'block';
      }
    } else {
      authEl.innerHTML = `<a href="/auth/google">Login with Google</a>`;
    }
  } catch (err) {
    console.error('Failed to load user:', err);
    document.getElementById('auth').innerHTML = `<a href="/auth/google">Login with Google</a>`;
  }
}

// Helper function to show/hide loading state
function showLoading(show, message = 'Loading...') {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    if (show) {
      loadingEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${message}`;
      loadingEl.classList.remove('hidden');
    } else {
      loadingEl.classList.add('hidden');
    }
  }
}

// Helper function to show notification
function showNotification(message, type = 'info', duration = 3000) {
  // Create notification element if it doesn't exist
  let notificationContainer = document.getElementById('notifications');
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notifications';
    notificationContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
    `;
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement('div');
  notification.style.cssText = `
    padding: 12px 16px;
    margin-bottom: 8px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 400px;
    word-wrap: break-word;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
  `;

  // Set color based on type
  switch (type) {
    case 'success':
      notification.style.background = '#10b981';
      notification.style.color = 'white';
      break;
    case 'error':
      notification.style.background = '#ef4444';
      notification.style.color = 'white';
      break;
    case 'warning':
      notification.style.background = '#f59e0b';
      notification.style.color = 'white';
      break;
    default:
      notification.style.background = '#3b82f6';
      notification.style.color = 'white';
  }

  notification.textContent = message;
  notificationContainer.appendChild(notification);

  // Animate in
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  });

  // Auto remove
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, duration);
}

// Initialize the application
async function initialize() {
  try {
    await loadMe();
    
    // Add event listeners for file manager navigation
    const fileManagerBtn = document.getElementById('fileManagerBtn');
    const fileManagerBtnHeader = document.getElementById('fileManagerBtnHeader');
    
    console.log('File Manager buttons found:', {
      fileManagerBtn: !!fileManagerBtn,
      fileManagerBtnHeader: !!fileManagerBtnHeader
    });
    
    if (fileManagerBtn) {
      fileManagerBtn.addEventListener('click', (e) => {
        console.log('File manager button clicked');
        window.location.href = '/filemanager';
      });
    }
    
    if (fileManagerBtnHeader) {
      fileManagerBtnHeader.addEventListener('click', (e) => {
        console.log('File manager header button clicked');
        window.location.href = '/filemanager';
      });
    }
    
    // Add event listeners for user management navigation (if buttons exist)
    const usersBtn = document.getElementById('usersBtn');
    const usersBtnHeader = document.getElementById('usersBtnHeader');
    
    console.log('Users buttons found:', {
      usersBtn: !!usersBtn,
      usersBtnHeader: !!usersBtnHeader
    });
    
    if (usersBtn) {
      usersBtn.addEventListener('click', (e) => {
        console.log('Users button clicked');
        window.location.href = '/users';
      });
    }
    
    if (usersBtnHeader) {
      usersBtnHeader.addEventListener('click', (e) => {
        console.log('Users header button clicked');
        window.location.href = '/users';
      });
    }
    
    // Add event listeners for logs navigation (if buttons exist)
    const logsBtn = document.getElementById('logsBtn');
    const logsBtnHeader = document.getElementById('logsBtnHeader');
    
    console.log('Logs buttons found:', {
      logsBtn: !!logsBtn,
      logsBtnHeader: !!logsBtnHeader
    });
    
    if (logsBtn) {
      logsBtn.addEventListener('click', (e) => {
        console.log('Logs button clicked');  
        window.location.href = '/logs';
      });
    }
    
    if (logsBtnHeader) {
      logsBtnHeader.addEventListener('click', (e) => {
        console.log('Logs header button clicked');
        window.location.href = '/logs';
      });
    }
    
  } catch (err) {
    console.error('Failed to initialize application:', err);
    showNotification('Failed to initialize application', 'error');
  }
}

// Run when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initialize();

  // Manual VitePress rebuild button logic
  const rebuildBtn = document.getElementById('rebuildDocsBtn');
  const statusDiv = document.getElementById('rebuildDocsStatus');
  if (rebuildBtn) {
    rebuildBtn.addEventListener('click', async () => {
      rebuildBtn.disabled = true;
      statusDiv.textContent = 'Rebuilding documentation...';
      try {
        const res = await fetch('/api/rebuild-docs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        const data = await res.json();
        if (data.vitepress_rebuild) {
          showNotification('Documentation rebuilt successfully!', 'success');
          statusDiv.textContent = 'Documentation rebuilt successfully.';
        } else {
          showNotification('Rebuild failed: ' + (data.vitepress_output || 'Unknown error'), 'error');
          statusDiv.textContent = 'Rebuild failed: ' + (data.vitepress_output || 'Unknown error');
        }
      } catch (err) {
        showNotification('Error rebuilding docs: ' + err.message, 'error');
        statusDiv.textContent = 'Error rebuilding docs: ' + err.message;
      }
      rebuildBtn.disabled = false;
    });
  }
});