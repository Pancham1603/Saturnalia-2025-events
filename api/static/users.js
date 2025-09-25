// User Management JavaScript
let users = [];
let filteredUsers = [];
let currentUser = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await loadCurrentUser();
    await loadUsers();
    setupEventListeners();
});

// Load current user info
async function loadCurrentUser() {
    console.log('Loading current user...');
    try {
        const response = await fetch('/api/me');
        console.log('Current user response status:', response.status);
        if (response.ok) {
            currentUser = await response.json();
            console.log('Current user:', currentUser);
            
            // Check if user is actually logged in (has email/name)
            if (currentUser && currentUser.email) {
                document.getElementById('auth').innerHTML = `
                    <div class="user-info">
                        <img src="${currentUser.picture || ''}" alt="Profile" class="user-avatar" style="display: ${currentUser.picture ? 'block' : 'none'}">
                        <a href="/auth/logout" class="btn btn-secondary btn-sm">Logout</a>
                    </div>
                `;
            } else {
                console.log('User not logged in');
                // Redirect to login if not logged in
                window.location.href = '/';
            }
        } else {
            console.error('Current user response not ok:', response.status);
            // Redirect to login on error
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

// Load all users
async function loadUsers() {
    console.log('Loading users...');
    showLoading(true);
    try {
        const response = await fetch('/api/users');
        console.log('Response status:', response.status);
        if (response.ok) {
            users = await response.json();
            console.log('Loaded users:', users.length);
            filteredUsers = [...users];
            renderUsers();
        } else {
            let errorMessage = 'Failed to load users';
            // Clone the response so we can read it multiple times if needed
            const clonedResponse = response.clone();
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (parseError) {
                // If response is not JSON, fall back to text from the cloned response
                try {
                    const errorText = await clonedResponse.text();
                    errorMessage = errorText || errorMessage;
                } catch (textError) {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
            }
            console.error('Failed to load users:', response.status, errorMessage);
            if (response.status === 403) {
                showError('Access denied: Superuser privileges required to view user management.');
                // Hide the users table and show access denied message
                document.getElementById('usersTable').classList.add('hidden');
                document.getElementById('emptyState').innerHTML = `
                    <i class="fas fa-lock"></i>
                    <h3>Access Denied</h3>
                    <p>You need superuser privileges to access user management.</p>
                    <a href="/portal" class="btn btn-primary">Back to Portal</a>
                `;
                document.getElementById('emptyState').classList.remove('hidden');
            } else {
                showError(errorMessage);
            }
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showError('Error loading users');
    } finally {
        showLoading(false);
    }
}

// Setup event listeners
function setupEventListeners() {
    const searchBox = document.getElementById('searchBox');
    searchBox.addEventListener('input', debounce(handleSearch, 300));
    
    const confirmModal = document.getElementById('confirmModal');
    const confirmCancel = document.getElementById('confirmCancel');
    const confirmOk = document.getElementById('confirmOk');
    
    confirmCancel.addEventListener('click', hideConfirmModal);
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            hideConfirmModal();
        }
    });
}

// Debounce function
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

// Handle search
function handleSearch(event) {
    const query = event.target.value.toLowerCase().trim();
    
    if (query === '') {
        filteredUsers = [...users];
    } else {
        filteredUsers = users.filter(user => 
            user.name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query)
        );
    }
    
    renderUsers();
}

// Render users in both table and card views
function renderUsers() {
    const grid = document.getElementById('usersGrid');
    const table = document.getElementById('usersTable');
    const cards = document.getElementById('usersCards');
    const emptyState = document.getElementById('emptyState');
    
    if (filteredUsers.length === 0) {
        grid.innerHTML = '';
        cards.innerHTML = '';
        table.classList.add('hidden');
        cards.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    table.classList.remove('hidden');
    cards.classList.remove('hidden');
    
    // Render table rows
    grid.innerHTML = filteredUsers.map(user => createUserRow(user)).join('');
    
    // Render mobile cards
    cards.innerHTML = filteredUsers.map(user => createUserCard(user)).join('');
}

// Create user row HTML
function createUserRow(user) {
    const initials = getInitials(user.name);
    const isCurrentUser = currentUser && user.id === currentUser.id;
    const canModify = !isCurrentUser;
    
    const roles = [];
    if (user.superuser) roles.push('superuser');
    else if (user.admin) roles.push('admin');
    else roles.push('user');
    
    const rolesBadges = roles.map(role => 
        `<span class="role-badge ${role}">${role}</span>`
    ).join('');
    
    const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown';
    const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never';
    
    return `
        <div class="user-row" data-user-id="${user.id}">
            <div class="user-avatar">
                ${user.picture ? 
                    `<img src="${user.picture}" alt="${user.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` :
                    initials
                }
            </div>
            
            <div class="user-info">
                <div class="user-name">${user.name} ${isCurrentUser ? '(You)' : ''}</div>
            </div>
            
            <div class="user-email">${user.email}</div>
            
            <div class="role-badges">
                ${rolesBadges}
            </div>
            
            <div class="user-date">${createdDate}</div>
            
            <div class="user-date">${lastLogin}</div>
            
            <div class="user-actions">
                ${canModify ? `
                    ${user.superuser ? 
                        `<button onclick="toggleSuperuser('${user.id}', false)" class="btn btn-warning btn-sm" title="Remove superuser privileges">
                            <i class="fas fa-crown"></i>
                            Remove Superuser
                        </button>` :
                        user.admin ? 
                        `<button onclick="toggleAdmin('${user.id}', false)" class="btn btn-primary btn-sm" title="Remove admin privileges">
                            <i class="fas fa-user-shield"></i>
                            Remove Admin
                        </button>
                        <button onclick="toggleSuperuser('${user.id}', true)" class="btn btn-success btn-sm" title="Promote to superuser">
                            <i class="fas fa-arrow-up"></i>
                            Make Superuser
        
                        </button>` :
                        `<button onclick="toggleAdmin('${user.id}', true)" class="btn btn-success btn-sm" title="Grant admin privileges">
                            <i class="fas fa-user-shield"></i>
                            Make Admin
                        </button>`
                    }
                ` : '<span class="text-muted">—</span>'}
            </div>
        </div>
    `;
}

// Create user card HTML for mobile view
function createUserCard(user) {
    const initials = getInitials(user.name);
    const isCurrentUser = currentUser && user.id === currentUser.id;
    const canModify = !isCurrentUser;
    
    const roles = [];
    if (user.superuser) roles.push('superuser');
    else if (user.admin) roles.push('admin');
    else roles.push('user');
    
    const rolesBadges = roles.map(role => 
        `<span class="role-badge ${role}">${role}</span>`
    ).join('');
    
    const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown';
    const lastLogin = user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never';
    
    return `
        <div class="user-card" data-user-id="${user.id}">
            <div class="user-card-header">
                <div class="user-card-avatar">
                    ${user.picture ? 
                        `<img src="${user.picture}" alt="${user.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` :
                        initials
                    }
                </div>
                <div class="user-card-info">
                    <h3>${user.name} ${isCurrentUser ? '(You)' : ''}</h3>
                    <p>${user.email}</p>
                </div>
            </div>
            
            <div class="user-card-details">
                <div class="user-card-detail">
                    <strong>Role:</strong>
                    <span>${rolesBadges}</span>
                </div>
                <div class="user-card-detail">
                    <strong>Joined:</strong>
                    <span>${createdDate}</span>
                </div>
                <div class="user-card-detail">
                    <strong>Last Login:</strong>
                    <span>${lastLogin}</span>
                </div>
            </div>
            
            <div class="user-card-actions">
                ${canModify ? `
                    ${user.superuser ? 
                        `<button onclick="toggleSuperuser('${user.id}', false)" class="btn btn-warning btn-sm" title="Remove superuser privileges">
                            <i class="fas fa-crown"></i>
                            Remove Superuser
                        </button>` :
                        user.admin ? 
                        `<button onclick="toggleAdmin('${user.id}', false)" class="btn btn-primary btn-sm" title="Remove admin privileges">
                            <i class="fas fa-user-shield"></i>
                            Remove Admin
                        </button>
                        <button onclick="toggleSuperuser('${user.id}', true)" class="btn btn-success btn-sm" title="Promote to superuser">
                            <i class="fas fa-arrow-up"></i>
                            Make Superuser
                        </button>` :
                        `<button onclick="toggleAdmin('${user.id}', true)" class="btn btn-success btn-sm" title="Grant admin privileges">
                            <i class="fas fa-user-shield"></i>
                            Make Admin
                        </button>`
                    }
                ` : '<span class="text-muted">—</span>'}
            </div>
        </div>
    `;
}

// Get initials from name
function getInitials(name) {
    return name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
}

// Toggle admin role
async function toggleAdmin(userId, makeAdmin) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    const action = makeAdmin ? 'grant admin privileges to' : 'remove admin privileges from';
    const message = `Are you sure you want to ${action} ${user.name}?`;
    
    showConfirmModal(message, async () => {
        try {
            const response = await fetch(`/api/users/${userId}/admin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ admin: makeAdmin })
            });
            
            if (response.ok) {
                const result = await response.json();
                showSuccess(result.message);
                await loadUsers(); // Reload to get updated data
            } else {
                const error = await response.json();
                showError(error.error || 'Failed to update user role');
            }
        } catch (error) {
            console.error('Error updating admin role:', error);
            showError('Error updating user role');
        }
    });
}

// Toggle superuser role
async function toggleSuperuser(userId, makeSuperuser) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    const action = makeSuperuser ? 'grant superuser privileges to' : 'remove superuser privileges from';
    const message = `Are you sure you want to ${action} ${user.name}?`;
    
    showConfirmModal(message, async () => {
        try {
            const response = await fetch(`/api/users/${userId}/superuser`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ superuser: makeSuperuser })
            });
            
            if (response.ok) {
                const result = await response.json();
                showSuccess(result.message);
                await loadUsers(); // Reload to get updated data
            } else {
                const error = await response.json();
                showError(error.error || 'Failed to update user role');
            }
        } catch (error) {
            console.error('Error updating superuser role:', error);
            showError('Error updating user role');
        }
    });
}

// Show loading state
function showLoading(show) {
    const loading = document.getElementById('loading');
    const usersTable = document.getElementById('usersTable');
    const usersCards = document.getElementById('usersCards');
    
    if (show) {
        loading.classList.remove('hidden');
        usersTable.classList.add('hidden');
        usersCards.classList.add('hidden');
    } else {
        loading.classList.add('hidden');
        usersTable.classList.remove('hidden');
        usersCards.classList.remove('hidden');
    }
}

// Show confirmation modal
function showConfirmModal(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const messageEl = document.getElementById('confirmMessage');
    const confirmOk = document.getElementById('confirmOk');
    
    messageEl.textContent = message;
    modal.classList.remove('hidden');
    
    // Remove any existing event listeners
    confirmOk.replaceWith(confirmOk.cloneNode(true));
    const newConfirmOk = document.getElementById('confirmOk');
    
    newConfirmOk.addEventListener('click', () => {
        hideConfirmModal();
        onConfirm();
    });
}

// Hide confirmation modal
function hideConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.classList.add('hidden');
}

// Show success message
function showSuccess(message) {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.innerHTML = `
        <i class="fas fa-check-circle"></i>
        ${message}
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

// Show error message
function showError(message) {
    // Create a toast notification
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        ${message}
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 5000);
}