// File Manager JavaScript

// Global variables
let currentPath = '';
let currentFile = null;
let editor = null;
let hasUnsavedChanges = false;

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

// Browse filesystem
async function browse(path = '') {
  try {
    showLoading(true);
    const data = await api(`/api/filesystem/browse?path=${encodeURIComponent(path)}`);
    
    currentPath = path;
    updateBreadcrumb(path);
    renderFileTree(data.items);
    showLoading(false);
    
  } catch (err) {
    console.error('Failed to browse filesystem:', err);
    showError(err.message);
    showLoading(false);
  }
}

// Update breadcrumb navigation
function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById('breadcrumb');
  const parts = path ? path.split('/').filter(p => p) : [];
  
  let html = `
    <div class="breadcrumb-item ${!path ? 'active' : ''}" data-path="" onclick="navigate('')">
      <i class="fas fa-home"></i>
      Root
    </div>
  `;
  
  let currentBreadcrumbPath = '';
  for (let i = 0; i < parts.length; i++) {
    currentBreadcrumbPath += (i > 0 ? '/' : '') + parts[i];
    const isLast = i === parts.length - 1;
    
    html += `
      <div class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></div>
      <div class="breadcrumb-item ${isLast ? 'active' : ''}" data-path="${currentBreadcrumbPath}" onclick="navigate('${currentBreadcrumbPath}')">
        ${parts[i]}
      </div>
    `;
  }
  
  breadcrumb.innerHTML = html;
}

// Navigate to path
async function navigate(path) {
  if (hasUnsavedChanges) {
    if (!confirm('You have unsaved changes. Are you sure you want to navigate away?')) {
      return;
    }
    discardChanges();
  }
  
  await browse(path);
  clearFileView();
}

// Render file tree
function renderFileTree(items) {
  const treeEl = document.getElementById('fileTree');
  
  if (items.length === 0) {
    treeEl.innerHTML = '<div class="empty-folder">This folder is empty</div>';
    return;
  }
  
  let html = '';
  
  // Add parent directory link if not at root
  if (currentPath) {
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    html += `
      <div class="tree-item directory" onclick="navigate('${parentPath}')">
        <i class="icon fas fa-level-up-alt"></i>
        <span>.. (Parent Directory)</span>
      </div>
    `;
  }
  
  // Sort items: directories first, then files
  items.sort((a, b) => {
    if (a.is_directory && !b.is_directory) return -1;
    if (!a.is_directory && b.is_directory) return 1;
    return a.name.localeCompare(b.name);
  });
  
  items.forEach(item => {
    const icon = item.is_directory ? 
      '<i class="icon fas fa-folder"></i>' : 
      `<i class="icon fas ${getFileIcon(item.extension)}"></i>`;
    
    const sizeInfo = item.is_directory ? 
      '' : 
      formatFileSize(item.size);
    
    html += `
      <div class="tree-item ${item.is_directory ? 'directory' : 'file'}" 
           data-path="${item.path}" 
           data-is-directory="${item.is_directory}"
           onclick="${item.is_directory ? `navigate('${item.path}')` : `openFile('${item.path}')`}"
           oncontextmenu="showContextMenu(event, '${item.path}', ${item.is_directory})">
        ${icon}
        <span class="item-name">${item.name}</span>
        <span class="item-info">${sizeInfo}</span>
      </div>
    `;
  });
  
  treeEl.innerHTML = html;
}

// Get file icon based on extension
function getFileIcon(extension) {
  switch (extension) {
    case '.md': return 'fa-file-alt';
    case '.json': return 'fa-file-code';
    case '.yaml':
    case '.yml': return 'fa-file-code';
    case '.txt': return 'fa-file-alt';
    case '.js': return 'fa-file-code';
    case '.css': return 'fa-file-code';
    case '.html': return 'fa-file-code';
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
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

// Open file for editing
async function openFile(path) {
  if (hasUnsavedChanges) {
    if (!confirm('You have unsaved changes. Are you sure you want to open another file?')) {
      return;
    }
    discardChanges();
  }
  
  try {
    showLoading(true);
    const fileData = await api(`/api/filesystem/read?path=${encodeURIComponent(path)}`);
    
    currentFile = fileData;
    displayFile(fileData);
    showLoading(false);
    
  } catch (err) {
    console.error('Failed to open file:', err);
    showError(err.message);
    showLoading(false);
  }
}

// Display file content
function displayFile(fileData) {
  // Update UI elements
  document.getElementById('currentFilePath').textContent = fileData.path;
  document.getElementById('noFileSelected').style.display = 'none';
  document.getElementById('editorContainer').style.display = 'block';
  
  // Update file metadata in the header (with null checks)
  const fileMeta = document.getElementById('fileMeta');
  const fileTypeHeader = document.getElementById('fileTypeHeader');
  const fileSizeHeader = document.getElementById('fileSizeHeader');
  const fileModifiedHeader = document.getElementById('fileModifiedHeader');
  
  if (fileMeta) fileMeta.style.display = 'flex';
  if (fileTypeHeader) fileTypeHeader.textContent = fileData.extension || 'txt';
  if (fileSizeHeader) fileSizeHeader.textContent = formatFileSize(fileData.size);
  if (fileModifiedHeader) fileModifiedHeader.textContent = formatRelativeTime(fileData.modified);
  
  // Initialize editor
  initializeEditor(fileData.content, fileData.extension);
  
  // Mark file tree item as active
  document.querySelectorAll('.tree-item').forEach(item => item.classList.remove('active'));
  const activeItem = document.querySelector(`[data-path="${fileData.path}"]`);
  if (activeItem) {
    activeItem.classList.add('active');
  }
}

// Initialize editor
function initializeEditor(content, extension) {
  const textarea = document.getElementById('fileContent');
  
  // Destroy existing editor
  if (editor) {
    editor.toTextArea();
    editor = null;
  }
  
  // Set content
  textarea.value = content;
  
  // Check if mobile device
  const isMobile = window.innerWidth <= 768;
  
  // Initialize appropriate editor based on file type
  if (extension === '.md') {
    // Mobile-optimized toolbar for small screens
    const mobileToolbar = isMobile ? 
      ["bold", "italic", "|", "heading", "quote", "|", "unordered-list", "ordered-list", "|", "link", "|", "preview", "fullscreen"] :
      ["bold", "italic", "strikethrough", "|", "heading", "quote", "unordered-list", "ordered-list", "|", "link", "image", "|", "preview", "side-by-side", "fullscreen"];
    
    // Use EasyMDE for markdown files
    editor = new EasyMDE({
      element: textarea,
      spellChecker: false,
      autosave: { enabled: false },
      placeholder: "Enter markdown content...",
      toolbar: mobileToolbar,
      status: isMobile ? ["lines", "words"] : ["lines", "words", "cursor"],
      minHeight: isMobile ? "250px" : "300px",
      maxHeight: isMobile ? "400px" : "600px"
    });
    
    // Listen for changes
    editor.codemirror.on('change', () => {
      markAsChanged();
    });

    // Add fullscreen and side-by-side event listeners
    addEditorModeListeners();
    
    // Mobile-specific adjustments
    if (isMobile) {
      // Adjust editor for mobile
      setTimeout(() => {
        const editorWrapper = editor.codemirror.getWrapperElement();
        if (editorWrapper) {
          editorWrapper.style.fontSize = '14px';
          editorWrapper.style.lineHeight = '1.4';
        }
      }, 100);
    }
  } else {
    // Use plain textarea for other file types
    textarea.style.display = 'block';
    textarea.style.width = '100%';
    textarea.style.height = isMobile ? '250px' : '400px';
    textarea.style.fontFamily = 'monospace';
    textarea.style.fontSize = isMobile ? '14px' : '14px';
    textarea.style.border = '1px solid #e2e8f0';
    textarea.style.borderRadius = '6px';
    textarea.style.padding = isMobile ? '0.75rem' : '1rem';
    textarea.style.lineHeight = '1.4';
    
    // Listen for changes
    textarea.addEventListener('input', markAsChanged);
  }
}

// Add event listeners for editor modes
function addEditorModeListeners() {
  if (!editor) return;

  // Monitor for fullscreen and side-by-side modes
  const checkEditorModes = () => {
    const editorElement = editor.codemirror.getWrapperElement().closest('.EasyMDEContainer');
    const isFullscreen = editor.isFullscreenActive && editor.isFullscreenActive();
    const isSideBySide = editor.isSideBySideActive && editor.isSideBySideActive();

    if (isFullscreen) {
      editorElement.classList.add('editor-fullscreen');
      document.body.style.overflow = 'hidden';
    } else if (isSideBySide) {
      editorElement.classList.add('editor-side-by-side');
      document.body.style.overflow = 'hidden';
    } else {
      editorElement.classList.remove('editor-fullscreen', 'editor-side-by-side');
      document.body.style.overflow = '';
    }
  };

  // Check modes periodically and on toolbar clicks
  setInterval(checkEditorModes, 100);
  
  // Add click listeners to toolbar buttons
  setTimeout(() => {
    const toolbar = document.querySelector('.editor-toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', () => {
        setTimeout(checkEditorModes, 50);
      });
    }
  }, 100);

  // Listen for escape key to exit fullscreen modes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const editorElement = editor.codemirror.getWrapperElement().closest('.EasyMDEContainer');
      if (editorElement.classList.contains('editor-fullscreen') || 
          editorElement.classList.contains('editor-side-by-side')) {
        // Click the appropriate toolbar button to exit the mode
        const fullscreenBtn = document.querySelector('.editor-toolbar .fa-expand');
        const sideBySideBtn = document.querySelector('.editor-toolbar .fa-columns');
        if (fullscreenBtn && editorElement.classList.contains('editor-fullscreen')) {
          fullscreenBtn.click();
        }
        if (sideBySideBtn && editorElement.classList.contains('editor-side-by-side')) {
          sideBySideBtn.click();
        }
      }
    }
  });
}

// Mark file as changed
function markAsChanged() {
  if (!hasUnsavedChanges) {
    hasUnsavedChanges = true;
    document.getElementById('saveBtn').style.display = 'inline-flex';
    document.getElementById('discardBtn').style.display = 'inline-flex';
    document.getElementById('currentFilePath').textContent += ' (unsaved)';
  }
}

// Save file
async function saveFile() {
  if (!currentFile || !hasUnsavedChanges) return;
  
  try {
    const content = editor ? editor.value() : document.getElementById('fileContent').value;
    
    showLoading(true, 'Saving file...');
    
    await api('/api/filesystem/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: currentFile.path,
        content: content
      })
    });
    
    hasUnsavedChanges = false;
    document.getElementById('saveBtn').style.display = 'none';
    document.getElementById('discardBtn').style.display = 'none';
    document.getElementById('currentFilePath').textContent = currentFile.path;
    
    showSuccess('File saved successfully!');
    showLoading(false);
    
  } catch (err) {
    console.error('Failed to save file:', err);
    showError(err.message);
    showLoading(false);
  }
}

// Discard changes
function discardChanges() {
  if (!currentFile) return;
  
  hasUnsavedChanges = false;
  document.getElementById('saveBtn').style.display = 'none';
  document.getElementById('discardBtn').style.display = 'none';
  document.getElementById('currentFilePath').textContent = currentFile.path;
  
  // Restore original content
  if (editor) {
    editor.value(currentFile.content);
  } else {
    document.getElementById('fileContent').value = currentFile.content;
  }
}

// Clear file view
function clearFileView() {
  currentFile = null;
  hasUnsavedChanges = false;
  
  document.getElementById('currentFilePath').textContent = 'No file selected';
  document.getElementById('noFileSelected').style.display = 'flex';
  document.getElementById('editorContainer').style.display = 'none';
  document.getElementById('saveBtn').style.display = 'none';
  document.getElementById('discardBtn').style.display = 'none';
  
  // Hide file metadata in header (with null check)
  const fileMeta = document.getElementById('fileMeta');
  if (fileMeta) fileMeta.style.display = 'none';
  
  if (editor) {
    editor.toTextArea();
    editor = null;
  }
  
  // Clear active state
  document.querySelectorAll('.tree-item').forEach(item => item.classList.remove('active'));
}

// Context menu functionality
function showContextMenu(event, path, isDirectory) {
  event.preventDefault();
  event.stopPropagation();
  
  // Check context menu permissions
  const isInsideVitepress = path.startsWith('.vitepress/');
  const isInsideRecentlyDeleted = path.startsWith('recently_deleted/');
  
  if (isInsideVitepress || isInsideRecentlyDeleted) {
    // Inside .vitepress or recently_deleted folder - hide context menu (no operations allowed)
    return;
  }
  
  if (!isDirectory) {
    // Outside .vitepress folder - only allow .md files and specific VitePress config files
    const filename = path.split('/').pop().toLowerCase();
    const isAllowed = (path.toLowerCase().endsWith('.md') || 
                      ['config.js', 'config.ts', 'config.mjs', 'config.json', 'package.json'].includes(filename) ||
                      filename.endsWith('.vue'));
    if (!isAllowed) {
      return;
    }
  }
  
  const contextMenu = document.getElementById('contextMenu');
  contextMenu.style.display = 'block';
  contextMenu.style.left = event.pageX + 'px';
  contextMenu.style.top = event.pageY + 'px';
  
  // Store path for context actions
  contextMenu.dataset.path = path;
  contextMenu.dataset.isDirectory = isDirectory;
}

// Hide context menu
function hideContextMenu() {
  document.getElementById('contextMenu').style.display = 'none';
}

// Create new file/folder
function showCreateModal(type) {
  const modal = document.getElementById('createModal');
  const title = document.getElementById('createModalTitle');
  const typeInput = document.getElementById('createType');
  const pathInput = document.getElementById('createPath');
  const nameInput = document.getElementById('createName');
  
  if (type === 'folder') {
    title.textContent = 'Create New Folder';
    nameInput.placeholder = 'Enter folder name';
  } else {
    title.textContent = 'Create New Markdown File';
    nameInput.placeholder = 'Enter file name (without .md extension)';
  }
  
  typeInput.value = type;
  pathInput.value = currentPath || ''; // Ensure path is always set
  nameInput.value = '';
  
  modal.classList.remove('hidden');
  nameInput.focus();
}

// Create file/folder
async function createItem() {
  const form = document.getElementById('createForm');
  const formData = new FormData(form);
  
  try {
    let fileName = formData.get('name')?.trim();
    const fileType = formData.get('type');
    const isDirectory = fileType === 'folder';
    
    if (!fileName) {
      showError('Name is required');
      return;
    }
    
    // For files, ensure .md extension and restrict to markdown files only
    if (!isDirectory) {
      // Check if user is trying to create a non-markdown file
      if (fileName.includes('.') && !fileName.toLowerCase().endsWith('.md')) {
        showError('Only markdown (.md) files can be created');
        return;
      }
      
      // Add .md extension if not present
      if (!fileName.toLowerCase().endsWith('.md')) {
        fileName += '.md';
      }
    }
    
    const data = {
      path: currentPath || '', // Use current path, default to root if empty
      name: fileName,
      is_directory: isDirectory
    };
    
    showLoading(true, 'Creating...');
    
    await api('/api/filesystem/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    hideCreateModal();
    await browse(currentPath);
    showSuccess(`${data.is_directory ? 'Folder' : 'File'} created successfully!`);
    showLoading(false);
    
  } catch (err) {
    console.error('Failed to create item:', err);
    showError(err.message);
    showLoading(false);
  }
}

// Show rename modal
function showRenameModal(path) {
  const modal = document.getElementById('renameModal');
  const pathInput = document.getElementById('renamePath');
  const nameInput = document.getElementById('renameName');
  
  pathInput.value = path;
  nameInput.value = path.split('/').pop();
  
  modal.classList.remove('hidden');
  nameInput.focus();
  nameInput.select();
}

// Rename item
async function renameItem() {
  const form = document.getElementById('renameForm');
  const formData = new FormData(form);
  
  try {
    const data = {
      old_path: formData.get('path'),
      new_name: formData.get('name')
    };
    
    if (!data.new_name) {
      showError('Name is required');
      return;
    }
    
    showLoading(true, 'Renaming...');
    
    await api('/api/filesystem/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    hideRenameModal();
    await browse(currentPath);
    showSuccess('Item renamed successfully!');
    showLoading(false);
    
    // If the renamed item was the current file, clear the view
    if (currentFile && currentFile.path === data.old_path) {
      clearFileView();
    }
    
  } catch (err) {
    console.error('Failed to rename item:', err);
    showError(err.message);
    showLoading(false);
  }
}

// Delete item
async function deleteItem(path) {
  if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
    return;
  }
  
  try {
    showLoading(true, 'Deleting...');
    
    await api('/api/filesystem/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path })
    });
    
    await browse(currentPath);
    showSuccess('Item deleted successfully!');
    showLoading(false);
    
    // If the deleted item was the current file, clear the view
    if (currentFile && currentFile.path === path) {
      clearFileView();
    }
    
  } catch (err) {
    console.error('Failed to delete item:', err);
    showError(err.message);
    showLoading(false);
  }
}

// Modal functions
function hideCreateModal() {
  document.getElementById('createModal').classList.add('hidden');
}

function hideRenameModal() {
  document.getElementById('renameModal').classList.add('hidden');
}

// Utility functions
function showLoading(show, message = 'Loading...') {
  // Implementation similar to portal.js
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
  await browse('');
  
  // Set up event listeners
  document.getElementById('refreshBtn').addEventListener('click', () => browse(currentPath));
  document.getElementById('newFileBtn').addEventListener('click', () => showCreateModal('file'));
  document.getElementById('newFolderBtn').addEventListener('click', () => showCreateModal('folder'));
  
  document.getElementById('saveBtn').addEventListener('click', saveFile);
  document.getElementById('discardBtn').addEventListener('click', discardChanges);
  
  // Context menu events
  document.getElementById('contextRename').addEventListener('click', () => {
    const path = document.getElementById('contextMenu').dataset.path;
    hideContextMenu();
    showRenameModal(path);
  });
  
  document.getElementById('contextDelete').addEventListener('click', () => {
    const path = document.getElementById('contextMenu').dataset.path;
    hideContextMenu();
    deleteItem(path);
  });
  
  // Modal events
  document.getElementById('closeCreateModal').addEventListener('click', hideCreateModal);
  document.getElementById('cancelCreateBtn').addEventListener('click', hideCreateModal);
  document.getElementById('confirmCreateBtn').addEventListener('click', createItem);
  
  document.getElementById('closeRenameModal').addEventListener('click', hideRenameModal);
  document.getElementById('cancelRenameBtn').addEventListener('click', hideRenameModal);
  document.getElementById('confirmRenameBtn').addEventListener('click', renameItem);
  
  // Hide context menu on click elsewhere
  document.addEventListener('click', hideContextMenu);
  
  // Handle window close/reload with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    }
  });
  
  // Handle keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+S to save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      if (hasUnsavedChanges) {
        saveFile();
      }
    }
    
    // Escape to hide context menu
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });
  
  // Mobile-specific enhancements
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // Handle window resize for mobile responsiveness
  const handleResize = debounce(() => {
    if (editor) {
      const isMobile = window.innerWidth <= 768;
      const container = document.querySelector('.editor-container');
      if (container) {
        // Adjust editor height on mobile
        const viewportHeight = window.innerHeight;
        const headerHeight = 60; // Approximate header height
        const footerSpace = 40; // Space for mobile UI elements
        const availableHeight = viewportHeight - headerHeight - footerSpace;
        
        if (isMobile) {
          editor.codemirror.setSize(null, Math.max(300, availableHeight - 200));
        } else {
          editor.codemirror.setSize(null, 400);
        }
      }
    }
  }, 100);
  
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 100); // Delay to allow orientation to complete
  });
  
  // Touch event optimizations for mobile
  if ('ontouchstart' in window) {
    // Optimize touch scrolling
    document.body.style.webkitOverflowScrolling = 'touch';
    
    // Handle touch events for context menu
    let touchTimer;
    let touchStartPos = { x: 0, y: 0 };
    
    document.addEventListener('touchstart', (e) => {
      touchStartPos.x = e.touches[0].clientX;
      touchStartPos.y = e.touches[0].clientY;
      
      // Clear any existing timer
      if (touchTimer) {
        clearTimeout(touchTimer);
      }
      
      // Set timer for long press detection
      touchTimer = setTimeout(() => {
        // Long press detected - could trigger context menu on mobile
        const target = e.target.closest('.file-item');
        if (target) {
          e.preventDefault();
          // Haptic feedback if available
          if (navigator.vibrate) {
            navigator.vibrate(50);
          }
        }
      }, 500);
    });
    
    document.addEventListener('touchmove', (e) => {
      // Cancel long press if user moves finger too much
      const moveX = Math.abs(e.touches[0].clientX - touchStartPos.x);
      const moveY = Math.abs(e.touches[0].clientY - touchStartPos.y);
      
      if (moveX > 10 || moveY > 10) {
        if (touchTimer) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
      }
    });
    
    document.addEventListener('touchend', () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    });
  }

});