// Admin Panel JavaScript
// Version 2.0.1 - Fixed variable conflict

// State
let currentUser = null;
let allUsers = [];
let currentUploadPath = '';
let editingUserId = null;

// Bulk selection state
let selectedUserIds = new Set();

// Audit log state
let auditEntries = [];
let auditTotal = 0;
let auditOffset = 0;
const AUDIT_PAGE_SIZE = 50;

// DOM Elements
const adminUserInfo = document.getElementById('admin-user-info');
const adminUserMenuBtn = document.getElementById('admin-user-menu-btn');
const adminUserDropdown = document.getElementById('admin-user-dropdown');
const backToGalleryBtn = document.getElementById('back-to-gallery-btn');
const adminFaqBtn = document.getElementById('admin-faq-btn');
const adminChangePasswordBtn = document.getElementById('admin-change-password-btn');
const adminLogoutBtn = document.getElementById('admin-logout-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Users tab
const createUserBtn = document.getElementById('create-user-btn');
const usersLoading = document.getElementById('users-loading');
const usersError = document.getElementById('users-error');
const usersTbody = document.getElementById('users-tbody');

// Modals
const userModal = document.getElementById('user-modal');
const passwordModal = document.getElementById('password-modal');
const folderModal = document.getElementById('folder-modal');
const confirmModal = document.getElementById('confirm-modal');

// Forms
const userForm = document.getElementById('user-form');
const passwordForm = document.getElementById('password-form');
const folderForm = document.getElementById('folder-form');

// Upload
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadBreadcrumb = document.getElementById('upload-breadcrumb');
const uploadFolders = document.getElementById('upload-folders');
const createFolderBtn = document.getElementById('create-folder-btn');
const uploadQueueEl = document.getElementById('upload-queue');
const uploadItems = document.getElementById('upload-items');
const cancelAllBtn = document.getElementById('cancel-all-btn');

// Initialize
checkAuth();

async function checkAuth() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();

        console.log('Auth check:', data);
        console.log('User role:', data.user?.role);

        if (!data.authenticated || !data.user || (data.user.role !== 'admin' && data.user.role !== 'uploader')) {
            // Not authenticated or no admin/upload access
            console.log('Access denied, redirecting to home');
            window.location.href = '/';
            return;
        }

        currentUser = data.user;
        adminUserInfo.textContent = `Angemeldet als: ${currentUser.displayName}`;

        // Hide admin-only tabs for uploaders
        if (currentUser.role === 'uploader') {
            const adminOnlyTabs = ['dashboard', 'users', 'audit'];
            adminOnlyTabs.forEach(name => {
                const tab = document.querySelector(`[data-tab="${name}"]`);
                if (tab) tab.style.display = 'none';
            });

            // Switch to upload tab by default for uploaders
            switchTab('upload');
        } else {
            // Admin: default tab is Dashboard
            switchTab('dashboard');
            loadDashboard();
            loadUsers();
        }

        loadUploadFolders();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/';
    }
}

// ===== TAB NAVIGATION =====

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        switchTab(targetTab);
    });
});

function switchTab(tabName) {
    // Update buttons
    tabButtons.forEach(btn => {
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update content
    tabContents.forEach(content => {
        if (content.id === `${tabName}-tab`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });

    // Lazy-load tab data
    if (tabName === 'audit' && auditEntries.length === 0) {
        loadAuditLog(true);
    }
}

// ===== HEADER ACTIONS =====

backToGalleryBtn.addEventListener('click', () => {
    window.location.href = '/';
});

adminFaqBtn.addEventListener('click', () => {
    window.location.href = '/faq.html';
});

// User menu dropdown handling
adminUserMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    adminUserDropdown.classList.toggle('hidden');
    adminUserMenuBtn.classList.toggle('active');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!adminUserMenuBtn.contains(e.target) && !adminUserDropdown.contains(e.target)) {
        adminUserDropdown.classList.add('hidden');
        adminUserMenuBtn.classList.remove('active');
    }
});

adminChangePasswordBtn.addEventListener('click', () => {
    window.location.href = '/?changePassword=true';
});

adminLogoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// ===== USER MANAGEMENT =====

async function loadUsers() {
    usersLoading.classList.remove('hidden');
    usersError.textContent = '';

    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();

        if (response.ok) {
            allUsers = data.users;
            renderUsers();
        } else {
            usersError.textContent = data.error || 'Fehler beim Laden der Benutzer';
        }
    } catch (error) {
        console.error('Load users error:', error);
        usersError.textContent = 'Verbindungsfehler';
    } finally {
        usersLoading.classList.add('hidden');
    }
}

function renderUsers() {
    usersTbody.innerHTML = '';

    // Prune selections that reference users no longer present
    const currentIds = new Set(allUsers.map(u => u.id));
    selectedUserIds.forEach(id => {
        if (!currentIds.has(id)) selectedUserIds.delete(id);
    });

    if (allUsers.length === 0) {
        usersTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #666;">Keine Benutzer gefunden</td></tr>';
        updateBulkUI();
        return;
    }

    allUsers.forEach(user => {
        const row = document.createElement('tr');
        const isChecked = selectedUserIds.has(user.id);
        if (isChecked) row.classList.add('row-selected');
        row.innerHTML = `
            <td class="col-checkbox">
                <input type="checkbox" class="user-select-checkbox" data-user-id="${user.id}" ${isChecked ? 'checked' : ''} aria-label="Benutzer ${escapeHtml(user.username)} auswählen">
            </td>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.displayName)}</td>
            <td>
                <span class="role-badge ${user.role}">
                    ${user.role === 'admin' ? 'Administrator' : user.role === 'uploader' ? 'Uploader' : 'Benutzer'}
                </span>
            </td>
            <td>
                <span class="status-badge ${user.isActive ? 'active' : 'inactive'}">
                    ${user.isActive ? 'Aktiv' : 'Inaktiv'}
                </span>
            </td>
            <td>${formatDate(user.createdAt)}</td>
            <td>${user.lastLogin ? formatDate(user.lastLogin) : 'Noch nie'}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit-user-btn" data-user-id="${user.id}">Bearbeiten</button>
                    <button class="action-btn reset-password-btn" data-user-id="${user.id}">Passwort</button>
                    <button class="action-btn danger delete-user-btn" data-user-id="${user.id}" data-username="${escapeHtml(user.username)}">Löschen</button>
                </div>
            </td>
        `;

        // Add event listeners
        const editBtn = row.querySelector('.edit-user-btn');
        const resetBtn = row.querySelector('.reset-password-btn');
        const deleteBtn = row.querySelector('.delete-user-btn');
        const checkbox = row.querySelector('.user-select-checkbox');

        editBtn.addEventListener('click', () => editUser(user.id));
        resetBtn.addEventListener('click', () => resetPassword(user.id));
        deleteBtn.addEventListener('click', () => deleteUser(user.id, user.username));
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedUserIds.add(user.id);
                row.classList.add('row-selected');
            } else {
                selectedUserIds.delete(user.id);
                row.classList.remove('row-selected');
            }
            updateBulkUI();
        });

        usersTbody.appendChild(row);
    });

    updateBulkUI();
}

createUserBtn.addEventListener('click', () => {
    editingUserId = null;
    document.getElementById('user-modal-title').textContent = 'Neuer Benutzer';
    document.getElementById('password-group').style.display = 'block';
    document.getElementById('user-password').setAttribute('required', 'required');
    document.getElementById('user-username').disabled = false;
    userForm.reset();
    openModal(userModal);
});

function editUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    editingUserId = userId;
    document.getElementById('user-modal-title').textContent = 'Benutzer bearbeiten';
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-username').disabled = false; // Allow username editing
    document.getElementById('user-displayname').value = user.displayName;
    document.getElementById('user-role').value = user.role;

    // Hide and disable password field for editing
    const passwordField = document.getElementById('user-password');
    const passwordGroup = document.getElementById('password-group');
    passwordGroup.style.display = 'none';
    passwordField.removeAttribute('required');
    passwordField.value = ''; // Clear value to prevent validation issues

    openModal(userModal);
}

userForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('user-username').value.trim();
    const password = document.getElementById('user-password').value;
    const displayName = document.getElementById('user-displayname').value.trim();
    const role = document.getElementById('user-role').value;

    try {
        let response;

        if (editingUserId) {
            // Update existing user
            response = await fetch(`/api/admin/users/${editingUserId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, displayName, role })
            });
        } else {
            // Create new user
            response = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, displayName, role })
            });
        }

        const data = await response.json();

        if (response.ok) {
            closeModal(userModal);
            document.getElementById('user-username').disabled = false;
            loadUsers();
            showSuccess(editingUserId ? 'Benutzer aktualisiert' : 'Benutzer erstellt');
        } else {
            alert(data.error || 'Fehler beim Speichern');
        }
    } catch (error) {
        console.error('Save user error:', error);
        alert('Verbindungsfehler');
    }
});

function resetPassword(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('password-user-id').value = userId;
    passwordForm.reset();
    openModal(passwordModal);
}

passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('password-user-id').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        alert('Passwörter stimmen nicht überein');
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            closeModal(passwordModal);
            showSuccess('Passwort erfolgreich zurückgesetzt');
        } else {
            alert(data.error || 'Fehler beim Zurücksetzen');
        }
    } catch (error) {
        console.error('Reset password error:', error);
        alert('Verbindungsfehler');
    }
});

function deleteUser(userId, username) {
    showConfirm(
        'Benutzer löschen',
        `Möchten Sie den Benutzer "${username}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
        async () => {
            try {
                const response = await fetch(`/api/admin/users/${userId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();

                if (response.ok) {
                    loadUsers();
                    showSuccess('Benutzer gelöscht');
                } else {
                    alert(data.error || 'Fehler beim Löschen');
                }
            } catch (error) {
                console.error('Delete user error:', error);
                alert('Verbindungsfehler');
            }
        }
    );
}

// ===== FILE UPLOAD =====

async function loadUploadFolders(path = '') {
    currentUploadPath = path;

    try {
        const response = await fetch(`/api/browse?path=${encodeURIComponent(path)}`);
        const data = await response.json();

        if (response.ok) {
            renderUploadBreadcrumb(path);
            renderUploadFolders(data.folders, data.files || []);
            updateUploadDestination(path);
        } else {
            console.error('Load folders error:', data.error);
        }
    } catch (error) {
        console.error('Load folders error:', error);
    }
}

function updateUploadDestination(path) {
    const destEl = document.getElementById('upload-destination-path');
    if (destEl) {
        destEl.textContent = `/media${path ? '/' + path : ''}`;
    }
}

function renderUploadBreadcrumb(path) {
    uploadBreadcrumb.innerHTML = '';

    const parts = path ? path.split('/') : [];
    let currentPath = '';

    // Home
    const homeLink = document.createElement('span');
    homeLink.className = 'breadcrumb-item';
    homeLink.textContent = '🏠 Start';
    homeLink.style.cursor = 'pointer';
    homeLink.addEventListener('click', () => loadUploadFolders(''));
    uploadBreadcrumb.appendChild(homeLink);

    // Path parts
    parts.forEach((part, index) => {
        const separator = document.createElement('span');
        separator.textContent = ' / ';
        separator.style.margin = '0 8px';
        uploadBreadcrumb.appendChild(separator);

        currentPath += (index > 0 ? '/' : '') + part;
        const pathLink = document.createElement('span');
        pathLink.className = 'breadcrumb-item';
        pathLink.textContent = part;
        pathLink.style.cursor = 'pointer';

        const pathToLoad = currentPath;
        pathLink.addEventListener('click', () => loadUploadFolders(pathToLoad));
        uploadBreadcrumb.appendChild(pathLink);
    });
}

function renderUploadFolders(folders, files = []) {
    uploadFolders.innerHTML = '';

    // Add back button if not at root
    if (currentUploadPath) {
        const backCard = document.createElement('div');
        backCard.className = 'folder-card back-folder';
        backCard.innerHTML = `
            <div class="folder-icon">⬅️</div>
            <div class="folder-name">Zurück</div>
        `;
        const parentPath = currentUploadPath.split('/').slice(0, -1).join('/');
        backCard.addEventListener('click', () => loadUploadFolders(parentPath));
        uploadFolders.appendChild(backCard);
    }

    if (folders.length === 0 && files.length === 0 && !currentUploadPath) {
        uploadFolders.innerHTML = '<p style="color: #666; padding: 20px;">Keine Unterordner oder Dateien vorhanden</p>';
        return;
    }

    // Render folders first
    folders.forEach(folder => {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.innerHTML = `
            <div class="folder-icon">📁</div>
            <div class="folder-name">${escapeHtml(folder.name)}</div>
        `;
        card.addEventListener('click', () => loadUploadFolders(folder.path));
        uploadFolders.appendChild(card);
    });

    // Render files (read-only, no click action)
    files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'folder-card file-card';
        const icon = file.type === 'video' ? '🎥' : '🖼️';
        card.innerHTML = `
            <div class="folder-icon">${icon}</div>
            <div class="folder-name">${escapeHtml(file.name)}</div>
        `;
        card.style.cursor = 'default';
        card.style.opacity = '0.7';
        uploadFolders.appendChild(card);
    });
}

createFolderBtn.addEventListener('click', () => {
    document.getElementById('folder-name').value = '';
    document.getElementById('folder-current-path').textContent = `/media${currentUploadPath ? '/' + currentUploadPath : ''}`;
    openModal(folderModal);
});

folderForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const folderName = document.getElementById('folder-name').value.trim();

    try {
        const response = await fetch('/api/admin/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folderName,
                parentPath: currentUploadPath
            })
        });

        const data = await response.json();

        if (response.ok) {
            closeModal(folderModal);
            loadUploadFolders(currentUploadPath);
            showSuccess('Ordner erstellt');
        } else {
            alert(data.error || 'Fehler beim Erstellen des Ordners');
        }
    } catch (error) {
        console.error('Create folder error:', error);
        alert('Verbindungsfehler');
    }
});

// Drag and drop
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
        return validTypes.includes(file.type) || /\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|mov|avi|mkv)$/i.test(file.name);
    });

    if (validFiles.length === 0) {
        alert('Keine gültigen Dateien ausgewählt');
        return;
    }

    validFiles.forEach(file => addToUploadQueue(file));
    fileInput.value = '';
}

function addToUploadQueue(file) {
    const uploadId = Date.now() + Math.random();

    uploadQueueEl.classList.remove('hidden');

    const item = document.createElement('div');
    item.className = 'upload-item';
    item.dataset.uploadId = uploadId;
    item.innerHTML = `
        <div class="upload-thumbnail"></div>
        <div class="upload-item-info">
            <div class="upload-filename">${escapeHtml(file.name)}</div>
            <div class="upload-size">${formatFileSize(file.size)}</div>
        </div>
        <div class="upload-progress">
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="upload-status">Warte…</div>
        </div>
        <button class="remove-upload-btn" data-upload-id="${uploadId}">×</button>
    `;

    // Add cancel button event listener
    const cancelBtn = item.querySelector('.remove-upload-btn');
    cancelBtn.addEventListener('click', () => cancelUpload(uploadId));

    uploadItems.appendChild(item);

    // Generate thumbnail for images
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const thumbnail = item.querySelector('.upload-thumbnail');
            thumbnail.style.backgroundImage = `url(${e.target.result})`;
            thumbnail.style.backgroundSize = 'cover';
            thumbnail.style.backgroundPosition = 'center';
        };
        reader.readAsDataURL(file);
    } else {
        const thumbnail = item.querySelector('.upload-thumbnail');
        thumbnail.textContent = '🎬';
        thumbnail.style.fontSize = '32px';
        thumbnail.style.display = 'flex';
        thumbnail.style.alignItems = 'center';
        thumbnail.style.justifyContent = 'center';
    }

    // Start upload
    uploadFile(file, uploadId);
}

async function uploadFile(file, uploadId) {
    const item = document.querySelector(`[data-upload-id="${uploadId}"]`);
    if (!item) return;

    const progressFill = item.querySelector('.progress-fill');
    const statusText = item.querySelector('.upload-status');

    console.log('Starting upload:', file.name, 'to path:', currentUploadPath);

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('targetPath', currentUploadPath);

        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = percent + '%';
                statusText.textContent = `${percent}% (${formatFileSize(e.loaded)} / ${formatFileSize(e.total)})`;
            }
        });

        xhr.addEventListener('load', () => {
            console.log('Upload complete. Status:', xhr.status, 'Response:', xhr.responseText);
            if (xhr.status === 200) {
                item.classList.add('success');
                statusText.textContent = '✓ Erfolgreich hochgeladen';
                setTimeout(() => item.remove(), 3000);
            } else {
                item.classList.add('error');
                const errorData = JSON.parse(xhr.responseText);
                statusText.textContent = '✗ ' + (errorData.error || 'Fehler');
                console.error('Upload error:', errorData);
            }
        });

        xhr.addEventListener('error', () => {
            item.classList.add('error');
            statusText.textContent = '✗ Verbindungsfehler';
        });

        xhr.open('POST', '/api/admin/upload');
        xhr.send(formData);

    } catch (error) {
        console.error('Upload error:', error);
        item.classList.add('error');
        statusText.textContent = '✗ Fehler';
    }
}

function cancelUpload(uploadId) {
    const item = document.querySelector(`[data-upload-id="${uploadId}"]`);
    if (item) item.remove();

    // Hide queue if empty
    if (uploadItems.children.length === 0) {
        uploadQueueEl.classList.add('hidden');
    }
}

cancelAllBtn.addEventListener('click', () => {
    uploadItems.innerHTML = '';
    uploadQueueEl.classList.add('hidden');
});

// ===== MODAL HANDLING =====

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modalId = e.target.dataset.modal;
        const modal = document.getElementById(modalId);
        if (modal) closeModal(modal);
    });
});

document.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modalId = e.target.dataset.modal;
        const modal = document.getElementById(modalId);
        if (modal) closeModal(modal);
    });
});

function openModal(modal) {
    modal.classList.remove('hidden');
}

function closeModal(modal) {
    modal.classList.add('hidden');
}

function showConfirm(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;

    const confirmOk = document.getElementById('confirm-ok');
    const confirmCancel = document.getElementById('confirm-cancel');

    const handleConfirm = () => {
        onConfirm();
        closeModal(confirmModal);
        cleanup();
    };

    const handleCancel = () => {
        closeModal(confirmModal);
        cleanup();
    };

    const cleanup = () => {
        confirmOk.removeEventListener('click', handleConfirm);
        confirmCancel.removeEventListener('click', handleCancel);
    };

    confirmOk.addEventListener('click', handleConfirm);
    confirmCancel.addEventListener('click', handleCancel);

    openModal(confirmModal);
}

function showSuccess(message) {
    // Simple alert for now - could be enhanced with a toast notification
    alert(message);
}

// ===== DASHBOARD =====

const dashboardLoading = document.getElementById('dashboard-loading');
const dashboardError = document.getElementById('dashboard-error');
const reloadDashboardBtn = document.getElementById('reload-dashboard-btn');

if (reloadDashboardBtn) {
    reloadDashboardBtn.addEventListener('click', () => loadDashboard());
}

async function loadDashboard() {
    if (!dashboardLoading) return;
    dashboardLoading.classList.remove('hidden');
    dashboardError.textContent = '';

    try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();

        if (!response.ok) {
            dashboardError.textContent = data.error || 'Fehler beim Laden der Statistiken';
            return;
        }

        renderDashboard(data);
    } catch (error) {
        console.error('Load dashboard error:', error);
        dashboardError.textContent = 'Verbindungsfehler beim Laden der Statistiken';
    } finally {
        dashboardLoading.classList.add('hidden');
    }
}

function renderDashboard(stats) {
    const u = stats.users || {};
    setText('stat-users-total', u.total);
    setText('stat-users-admin', u.admin);
    setText('stat-users-uploader', u.uploader);
    setText('stat-users-user', u.user);
    setText('stat-users-active7', u.activeLast7Days);

    const f = stats.faq || {};
    setText('stat-faq-total', f.total);
    setText('stat-faq-total-2', f.total);
    setText('stat-faq-categories', f.categories);

    const m = stats.media || {};
    setText('stat-media-files', m.totalFiles);
    setText('stat-media-files-2', m.totalFiles);
    setText('stat-media-folders', m.totalFolders);
    setText('stat-media-storage', formatBytes(m.storageBytes));

    const a = stats.activity || {};
    setText('stat-media-uploads7', a.uploadsLast7Days);

    const fav = stats.favorites || {};
    setText('stat-favorites-total', fav.total);
    setText('stat-favorites-total-2', fav.total);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (value === undefined || value === null) {
        el.textContent = '–';
    } else {
        el.textContent = value;
    }
}

function formatBytes(bytes) {
    if (bytes === undefined || bytes === null) return '–';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2) + ' ' + sizes[i];
}

// ===== BULK USER ACTIONS =====

const selectAllCheckbox = document.getElementById('users-select-all');
const bulkActionBar = document.getElementById('bulk-action-bar');
const bulkSelectedCount = document.getElementById('bulk-selected-count');
const bulkActivateBtn = document.getElementById('bulk-activate-btn');
const bulkDeactivateBtn = document.getElementById('bulk-deactivate-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const bulkClearBtn = document.getElementById('bulk-clear-btn');
const bulkMessage = document.getElementById('bulk-message');

if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        // Only operate on visible checkboxes
        const checkboxes = usersTbody.querySelectorAll('.user-select-checkbox');
        checkboxes.forEach(cb => {
            const userId = cb.dataset.userId;
            cb.checked = checked;
            const row = cb.closest('tr');
            if (checked) {
                selectedUserIds.add(userId);
                if (row) row.classList.add('row-selected');
            } else {
                selectedUserIds.delete(userId);
                if (row) row.classList.remove('row-selected');
            }
        });
        updateBulkUI();
    });
}

if (bulkClearBtn) {
    bulkClearBtn.addEventListener('click', () => {
        selectedUserIds.clear();
        usersTbody.querySelectorAll('.user-select-checkbox').forEach(cb => {
            cb.checked = false;
            const row = cb.closest('tr');
            if (row) row.classList.remove('row-selected');
        });
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        updateBulkUI();
    });
}

if (bulkActivateBtn) bulkActivateBtn.addEventListener('click', () => bulkAction('activate'));
if (bulkDeactivateBtn) bulkDeactivateBtn.addEventListener('click', () => bulkAction('deactivate'));
if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', () => bulkAction('delete'));

function updateBulkUI() {
    const count = selectedUserIds.size;
    if (bulkSelectedCount) bulkSelectedCount.textContent = count;
    if (bulkActionBar) {
        if (count > 0) bulkActionBar.classList.remove('hidden');
        else bulkActionBar.classList.add('hidden');
    }

    // Sync header checkbox state
    if (selectAllCheckbox) {
        const checkboxes = usersTbody.querySelectorAll('.user-select-checkbox');
        const total = checkboxes.length;
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        if (total === 0 || checkedCount === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCount === total) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
}

function bulkAction(action) {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return;

    // Gather affected usernames for the confirmation
    const affectedUsers = allUsers.filter(u => selectedUserIds.has(u.id));
    const namesList = affectedUsers.map(u => `• ${u.username}`).join('\n');

    const actionLabels = {
        activate: 'aktivieren',
        deactivate: 'deaktivieren',
        delete: 'löschen'
    };
    const actionTitle = {
        activate: 'Benutzer aktivieren',
        deactivate: 'Benutzer deaktivieren',
        delete: 'Benutzer löschen'
    };

    const verb = actionLabels[action] || action;
    const title = actionTitle[action] || 'Bulk-Aktion';
    const warn = action === 'delete'
        ? '\n\nDiese Aktion kann nicht rückgängig gemacht werden.'
        : '';
    const message = `Möchten Sie die folgenden ${ids.length} Benutzer wirklich ${verb}?\n\n${namesList}${warn}`;

    showConfirm(title, message, async () => {
        try {
            const response = await fetch('/api/admin/users/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: ids, action })
            });

            const data = await response.json();

            if (!response.ok) {
                showBulkMessage(data.error || 'Fehler bei der Bulk-Aktion', 'error');
                return;
            }

            const affected = data.affected ?? 0;
            const skipped = data.skipped ?? 0;
            let msg = `${affected} erfolgreich, ${skipped} übersprungen`;
            if (Array.isArray(data.errors) && data.errors.length > 0) {
                const errSummary = data.errors
                    .slice(0, 5)
                    .map(e => typeof e === 'string' ? e : (e.message || e.error || JSON.stringify(e)))
                    .join('; ');
                msg += ` — Fehler: ${errSummary}`;
                if (data.errors.length > 5) msg += ` … (+${data.errors.length - 5} weitere)`;
            }

            showBulkMessage(msg, affected > 0 ? 'success' : 'warning');

            // Reset selection and refresh
            selectedUserIds.clear();
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            }
            loadUsers();
        } catch (error) {
            console.error('Bulk action error:', error);
            showBulkMessage('Verbindungsfehler bei der Bulk-Aktion', 'error');
        }
    });
}

function showBulkMessage(text, variant = 'success') {
    if (!bulkMessage) {
        alert(text);
        return;
    }
    bulkMessage.textContent = text;
    bulkMessage.classList.remove('hidden', 'success', 'warning', 'error');
    bulkMessage.classList.add(variant);
    // Auto-hide after 8s
    clearTimeout(showBulkMessage._t);
    showBulkMessage._t = setTimeout(() => {
        bulkMessage.classList.add('hidden');
    }, 8000);
}

// ===== AUDIT LOG =====

const auditLoading = document.getElementById('audit-loading');
const auditError = document.getElementById('audit-error');
const auditTbody = document.getElementById('audit-tbody');
const auditCounter = document.getElementById('audit-counter');
const auditLoadMoreBtn = document.getElementById('audit-load-more-btn');
const reloadAuditBtn = document.getElementById('reload-audit-btn');

if (reloadAuditBtn) {
    reloadAuditBtn.addEventListener('click', () => loadAuditLog(true));
}
if (auditLoadMoreBtn) {
    auditLoadMoreBtn.addEventListener('click', () => loadAuditLog(false));
}

async function loadAuditLog(reset = false) {
    if (!auditTbody) return;

    if (reset) {
        auditEntries = [];
        auditOffset = 0;
        auditTbody.innerHTML = '';
    }

    if (auditLoading) auditLoading.classList.remove('hidden');
    if (auditError) auditError.textContent = '';

    try {
        const url = `/api/admin/audit-log?limit=${AUDIT_PAGE_SIZE}&offset=${auditOffset}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            auditError.textContent = data.error || 'Fehler beim Laden des Audit-Logs';
            return;
        }

        const entries = Array.isArray(data.entries) ? data.entries : [];
        auditTotal = Number.isFinite(data.total) ? data.total : entries.length + auditOffset;
        auditEntries = auditEntries.concat(entries);
        auditOffset += entries.length;

        entries.forEach(entry => auditTbody.appendChild(buildAuditRow(entry)));

        updateAuditFooter();
    } catch (error) {
        console.error('Load audit log error:', error);
        if (auditError) auditError.textContent = 'Verbindungsfehler beim Laden des Audit-Logs';
    } finally {
        if (auditLoading) auditLoading.classList.add('hidden');
    }
}

function updateAuditFooter() {
    if (auditCounter) {
        auditCounter.textContent = `${auditEntries.length} von ${auditTotal} Einträgen`;
    }
    if (auditLoadMoreBtn) {
        if (auditEntries.length < auditTotal) {
            auditLoadMoreBtn.classList.remove('hidden');
        } else {
            auditLoadMoreBtn.classList.add('hidden');
        }
    }
}

function buildAuditRow(entry) {
    const row = document.createElement('tr');

    const timeCell = document.createElement('td');
    timeCell.className = 'col-time';
    timeCell.textContent = entry.timestamp
        ? new Date(entry.timestamp).toLocaleString('de-DE')
        : '–';

    const userCell = document.createElement('td');
    userCell.className = 'col-user';
    userCell.textContent = entry.username || entry.userId || '–';

    const actionCell = document.createElement('td');
    actionCell.className = 'col-action';
    const badge = document.createElement('span');
    badge.className = 'audit-badge ' + auditBadgeClass(entry.action);
    badge.textContent = entry.action || '–';
    actionCell.appendChild(badge);

    const targetCell = document.createElement('td');
    targetCell.className = 'col-target';
    targetCell.textContent = entry.targetUser || '–';

    const detailsCell = document.createElement('td');
    detailsCell.className = 'col-details';
    detailsCell.appendChild(renderAuditDetails(entry.details));

    row.appendChild(timeCell);
    row.appendChild(userCell);
    row.appendChild(actionCell);
    row.appendChild(targetCell);
    row.appendChild(detailsCell);
    return row;
}

function auditBadgeClass(action) {
    if (!action) return 'audit-badge-default';
    const a = String(action).toUpperCase();
    if (a.includes('LOGIN')) return 'audit-badge-login';
    if (a.includes('LOGOUT')) return 'audit-badge-logout';
    if (a.includes('DELETE') || a.includes('DELETED')) return 'audit-badge-delete';
    if (a.includes('CREATE') || a.includes('CREATED')) return 'audit-badge-create';
    if (a.includes('UPDATE') || a.includes('UPDATED') || a.includes('EDIT')) return 'audit-badge-update';
    if (a.includes('ACTIVATE') || a.includes('ACTIVATED')) return 'audit-badge-activate';
    if (a.includes('DEACTIVATE') || a.includes('DEACTIVATED')) return 'audit-badge-deactivate';
    if (a.includes('UPLOAD')) return 'audit-badge-upload';
    if (a.includes('PASSWORD')) return 'audit-badge-password';
    return 'audit-badge-default';
}

function renderAuditDetails(details) {
    const wrap = document.createElement('div');
    wrap.className = 'audit-details-wrap';

    if (details === undefined || details === null || details === '') {
        wrap.textContent = '–';
        return wrap;
    }

    let text;
    if (typeof details === 'string') {
        text = details;
    } else {
        try {
            text = JSON.stringify(details);
        } catch {
            text = String(details);
        }
    }

    const MAX = 80;
    if (text.length <= MAX) {
        wrap.textContent = text;
        return wrap;
    }

    const truncated = text.slice(0, MAX) + '…';
    const short = document.createElement('span');
    short.className = 'audit-details-short';
    short.textContent = truncated;

    const full = document.createElement('span');
    full.className = 'audit-details-full hidden';
    full.textContent = text;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'audit-details-toggle';
    toggle.textContent = 'Mehr';
    toggle.addEventListener('click', () => {
        const expanded = !full.classList.contains('hidden');
        if (expanded) {
            full.classList.add('hidden');
            short.classList.remove('hidden');
            toggle.textContent = 'Mehr';
        } else {
            full.classList.remove('hidden');
            short.classList.add('hidden');
            toggle.textContent = 'Weniger';
        }
    });

    wrap.appendChild(short);
    wrap.appendChild(full);
    wrap.appendChild(document.createTextNode(' '));
    wrap.appendChild(toggle);
    return wrap;
}

// ===== UTILITY FUNCTIONS =====

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
