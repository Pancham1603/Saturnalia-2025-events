// Event Editor JavaScript
let mdeEditor;
let currentEventId = null;
let isDirty = false;
let saveTimeout = null;

// API helper function
async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await res.text());
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
    console.error('Failed to load user:', err);
    document.getElementById('auth').innerHTML = `<a href="/auth/google">Login with Google</a>`;
  }
}

// Load categories for the dropdown
async function loadCategories() {
  try {
    const categories = await api('/api/categories?hierarchical=true');
    window.ALL_CATEGORIES = categories;
    
    const categorySelect = document.getElementById('eventCategory');
    if (categorySelect) {
      // Clear existing options except the first one
      categorySelect.innerHTML = '<option value="">Select a category (optional)</option>';
      
      // Add categories and subcategories hierarchically
      categories.forEach(category => {
        // Add main category
        const option = document.createElement('option');
        option.value = category.slug || category.id;
        option.textContent = category.title || category.name;
        option.dataset.categoryId = category.id;
        categorySelect.appendChild(option);
        
        // Add subcategories with indentation
        if (category.subcategories && category.subcategories.length > 0) {
          category.subcategories.forEach(subcat => {
            const subOption = document.createElement('option');
            subOption.value = subcat.slug || subcat.id;
            subOption.textContent = `  └─ ${subcat.title || subcat.name}`;
            subOption.dataset.categoryId = subcat.id;
            subOption.dataset.parentId = category.id;
            categorySelect.appendChild(subOption);
          });
        }
      });
    }
  } catch (err) {
    console.error('Failed to load categories:', err);
    window.ALL_CATEGORIES = [];
  }
}

// Get URL parameters
function getUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  return {
    id: urlParams.get('id'),
    category: urlParams.get('category')
  };
}

// Set status indicator
function setStatus(type, message, icon = null) {
  const statusEl = document.getElementById('statusIndicator');
  const statusIcon = statusEl.querySelector('i');
  const statusText = statusEl.querySelector('span');
  
  // Remove all status classes
  statusEl.classList.remove('saved', 'saving', 'error');
  statusEl.classList.add(type);
  
  // Update icon
  if (icon) {
    statusIcon.className = `fas ${icon}`;
  } else {
    switch (type) {
      case 'saved':
        statusIcon.className = 'fas fa-check';
        break;
      case 'saving':
        statusIcon.className = 'fas fa-spinner fa-spin';
        break;
      case 'error':
        statusIcon.className = 'fas fa-exclamation-triangle';
        break;
    }
  }
  
  // Update text
  statusText.textContent = message;
}

// Show loading overlay
function showLoading(show, message = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  const spinner = overlay.querySelector('span');
  
  if (show) {
    spinner.textContent = message;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// Update preview content
function updatePreview() {
  const previewEl = document.getElementById('previewContent');
  const markdown = mdeEditor.value();
  
  if (markdown.trim()) {
    previewEl.innerHTML = marked.parse(markdown);
  } else {
    previewEl.innerHTML = '<p class="text-muted">Start typing to see a live preview of your event...</p>';
  }
  
  // Mark as dirty
  markAsDirty();
}

// Helper function to mark as dirty and update UI
function markAsDirty() {
  if (!isDirty) {
    isDirty = true;
    setStatus('saving', 'Unsaved changes');
    updateButtonVisibility();
  }
}

// Auto-generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Load event data for editing
async function loadEventData(eventId) {
  try {
    showLoading(true, 'Loading event data...');
    const event = await api(`/api/events/${eventId}`);
    
    // Populate form fields
    document.getElementById('eventTitle').value = event.title || '';
    document.getElementById('eventSlug').value = event.slug || '';
    
    // Set category selection
    const categorySelect = document.getElementById('eventCategory');
    if (categorySelect && event.category_slug) {
      // Find the option with matching slug
      const option = Array.from(categorySelect.options).find(opt => 
        opt.value === event.category_slug
      );
      if (option) {
        categorySelect.value = event.category_slug;
      }
    }
    
    // Set markdown content
    if (mdeEditor) {
      mdeEditor.value(event.markdown || event.description || '');
      updatePreview();
    }
    
    // Update title
    document.getElementById('editorTitle').textContent = `Edit: ${event.title}`;
    
    // Mark as clean
    isDirty = false;
    setStatus('saved', 'Loaded');
    
    // Update button visibility after loading
    updateButtonVisibility();
    
    showLoading(false);
  } catch (err) {
    console.error('Failed to load event:', err);
    setStatus('error', 'Failed to load event');
    showLoading(false);
    alert('Failed to load event data: ' + err.message);
  }
}

// Auto-save functionality
function scheduleAutoSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  
  saveTimeout = setTimeout(async () => {
    if (isDirty && currentEventId) {
      await saveEvent(false); // Silent save
    }
  }, 2000); // Auto-save after 2 seconds of inactivity
}

// Save event
async function saveEvent(showFeedback = true) {
  const title = document.getElementById('eventTitle').value.trim();
  const slug = document.getElementById('eventSlug').value.trim();
  const categorySelect = document.getElementById('eventCategory');
  const categorySlug = categorySelect.value.trim();
  const markdown = mdeEditor.value();
  
  // Validate required fields
  if (!title) {
    alert('Please enter a title for the event');
    document.getElementById('eventTitle').focus();
    return false;
  }
  
  if (!slug) {
    alert('Please enter a slug for the event');
    document.getElementById('eventSlug').focus();
    return false;
  }
  
  const eventData = {
    title,
    slug,
    category_slug: categorySlug || null,
    markdown
  };
  
  try {
    if (showFeedback) {
      setStatus('saving', 'Saving...');
    }
    
    let result;
    if (currentEventId) {
      // Update existing event
      result = await api(`/api/events/${currentEventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });
    } else {
      // Create new event
      result = await api('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });
      
      // Update current event ID and URL
      currentEventId = result.id;
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('id', currentEventId);
      window.history.replaceState({}, '', newUrl);
      
      // Update title
      document.getElementById('editorTitle').textContent = `Edit: ${title}`;
    }
    
    isDirty = false;
    setStatus('saved', showFeedback ? 'Saved successfully' : 'Auto-saved');
    
    // Update button visibility after successful save
    updateButtonVisibility();
    
    return true;
  } catch (err) {
    console.error('Failed to save event:', err);
    setStatus('error', 'Failed to save');
    
    // Parse error message for better user feedback
    let errorMessage = err.message;
    try {
      const errorData = JSON.parse(err.message);
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch (parseErr) {
      // Keep original error message if parsing fails
    }
    
    if (showFeedback) {
      if (errorMessage.includes('already exists')) {
        alert('Cannot save: ' + errorMessage + '\n\nPlease choose a different title or slug.');
        // Focus on slug field for user to edit
        document.getElementById('eventSlug').focus();
      } else {
        alert('Failed to save event: ' + errorMessage);
      }
    }
    return false;
  }
}

// Check if slug is available
async function checkSlugAvailability(slug) {
  if (!slug) return { available: true };
  
  try {
    const params = currentEventId ? `?exclude_id=${currentEventId}` : '';
    const result = await api(`/api/events/check-slug/${encodeURIComponent(slug)}${params}`);
    return result;
  } catch (err) {
    console.error('Failed to check slug availability:', err);
    return { available: true }; // Default to available on error
  }
}

// Show slug validation feedback
function showSlugFeedback(available, slug) {
  const slugField = document.getElementById('eventSlug');
  const feedbackEl = document.getElementById('slugFeedback') || createSlugFeedbackElement();
  
  slugField.classList.remove('valid', 'invalid');
  
  if (available) {
    slugField.classList.add('valid');
    feedbackEl.innerHTML = '<i class="fas fa-check text-green-500"></i> Slug is available';
    feedbackEl.className = 'text-sm text-green-600 mt-1';
  } else {
    slugField.classList.add('invalid');
    feedbackEl.innerHTML = '<i class="fas fa-times text-red-500"></i> Slug already exists';
    feedbackEl.className = 'text-sm text-red-600 mt-1';
  }
}

// Create slug feedback element if it doesn't exist
function createSlugFeedbackElement() {
  const slugField = document.getElementById('eventSlug');
  const feedback = document.createElement('div');
  feedback.id = 'slugFeedback';
  slugField.parentNode.insertBefore(feedback, slugField.nextSibling);
  return feedback;
}

// Update button visibility based on current state
function updateButtonVisibility() {
  const cancelBtn = document.getElementById('cancelBtn');
  const backBtn = document.getElementById('backBtn');
  
  if (currentEventId && !isDirty) {
    // Event has been saved (either existing or newly created), hide cancel button
    cancelBtn.style.opacity = '0';
    setTimeout(() => {
      cancelBtn.style.display = 'none';
    }, 300);
    backBtn.style.display = 'inline-flex'; // Ensure back button is visible
    backBtn.style.opacity = '1';
  } else {
    // Event is not saved or has unsaved changes, show cancel button
    cancelBtn.style.display = 'inline-flex';
    cancelBtn.style.opacity = '1';
    backBtn.style.display = 'inline-flex';
    backBtn.style.opacity = '1';
  }
}

// Cancel editing
function cancelEditing() {
  if (isDirty) {
    if (!confirm('You have unsaved changes. Are you sure you want to leave?')) {
      return;
    }
  }
  
  // Navigate back to portal
  window.location.href = '/portal';
}

// Handle beforeunload event
function handleBeforeUnload(e) {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    return e.returnValue;
  }
}

// Initialize the editor
window.addEventListener('DOMContentLoaded', async () => {
  // Load user info and categories
  await loadMe();
  await loadCategories();
  
  // Get URL parameters
  const params = getUrlParams();
  currentEventId = params.id;
  
  // Initialize markdown editor
  const textarea = document.getElementById('markdownEditor');
  mdeEditor = new EasyMDE({
    element: textarea,
    spellChecker: false,
    autosave: {
      enabled: false // We'll handle our own auto-save
    },
    placeholder: "Write your event content in Markdown...",
    toolbar: [
      "bold", "italic", "strikethrough", "|",
      "heading-1", "heading-2", "heading-3", "|",
      "quote", "unordered-list", "ordered-list", "|",
      "link", "image", "table", "|",
      "code", "horizontal-rule", "|",
      "fullscreen"
    ],
    status: false, // We'll show our own status
    shortcuts: {
      "toggleFullScreen": null // Disable default fullscreen to avoid conflicts
    }
  });
  
  // Set up event listeners for the editor
  mdeEditor.codemirror.on('change', () => {
    updatePreview();
    scheduleAutoSave();
  });
  
  // Set up form field event listeners
  const titleField = document.getElementById('eventTitle');
  const slugField = document.getElementById('eventSlug');
  
  titleField.addEventListener('input', async (e) => {
    const title = e.target.value;
    
    // Auto-generate slug if it's empty or was auto-generated
    if (!slugField.value || slugField.dataset.autoGenerated === slugField.value) {
      const slug = generateSlug(title);
      slugField.value = slug;
      slugField.dataset.autoGenerated = slug;
      
      // Check availability for auto-generated slug
      if (slug) {
        const availability = await checkSlugAvailability(slug);
        showSlugFeedback(availability.available, slug);
      }
    }
    
    // Mark as dirty
    markAsDirty();
    
    scheduleAutoSave();
  });
  
  slugField.addEventListener('input', async (e) => {
    // Clear auto-generated flag when manually edited
    delete slugField.dataset.autoGenerated;
    
    markAsDirty();
    
    // Check slug availability
    const slug = e.target.value.trim();
    if (slug) {
      const availability = await checkSlugAvailability(slug);
      showSlugFeedback(availability.available, slug);
    } else {
      // Clear feedback if slug is empty
      const feedbackEl = document.getElementById('slugFeedback');
      if (feedbackEl) {
        feedbackEl.innerHTML = '';
      }
      slugField.classList.remove('valid', 'invalid');
    }
    
    scheduleAutoSave();
  });
  
  document.getElementById('eventCategory').addEventListener('change', () => {
    markAsDirty();
    scheduleAutoSave();
  });
  
  // Set up toolbar button event listeners
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const saved = await saveEvent(true);
    if (saved) {
      updateButtonVisibility();
    }
  });
  
  document.getElementById('cancelBtn').addEventListener('click', cancelEditing);
  
  document.getElementById('backBtn').addEventListener('click', () => {
    // Check if there are unsaved changes
    if (isDirty) {
      if (confirm('You have unsaved changes. Are you sure you want to go back? Your changes will be lost.')) {
        window.location.href = '/portal';
      }
    } else {
      window.location.href = '/portal';
    }
  });
  
  // Set up beforeunload handler
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  // Load event data if editing
  if (currentEventId) {
    await loadEventData(currentEventId);
  } else {
    // Pre-fill category if provided
    if (params.category) {
      const categorySelect = document.getElementById('eventCategory');
      // Find the option with matching slug
      const option = Array.from(categorySelect.options).find(opt => 
        opt.value === params.category
      );
      if (option) {
        categorySelect.value = params.category;
      }
    }
    
    setStatus('saved', 'Ready to create');
  }
  
  // Update button visibility based on initial state
  updateButtonVisibility();
  
  // Focus on title field
  titleField.focus();
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveEvent(true);
    }
    
    // Escape to cancel (if not focused on editor)
    if (e.key === 'Escape' && !e.target.closest('.CodeMirror')) {
      cancelEditing();
    }
  });
});