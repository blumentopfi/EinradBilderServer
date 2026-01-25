// Admin Panel JavaScript
// Version 2.0.1 - Fixed variable conflict

// State
let currentUser = null;
let allUsers = [];
let currentUploadPath = '';
let editingUserId = null;

// DOM Elements
const adminUserInfo = document.getElementById('admin-user-info');
const backToGalleryBtn = document.getElementById('back-to-gallery-btn');
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

        // Hide user management tab for uploaders
        if (currentUser.role === 'uploader') {
            const usersTab = document.querySelector('[data-tab="users"]');
            if (usersTab) usersTab.style.display = 'none';

            // Switch to upload tab by default for uploaders
            switchTab('upload');
        } else {
            // Load initial data for admins
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
}

// ===== HEADER ACTIONS =====

backToGalleryBtn.addEventListener('click', () => {
    window.location.href = '/';
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

    if (allUsers.length === 0) {
        usersTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #666;">Keine Benutzer gefunden</td></tr>';
        return;
    }

    allUsers.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
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

        editBtn.addEventListener('click', () => editUser(user.id));
        resetBtn.addEventListener('click', () => resetPassword(user.id));
        deleteBtn.addEventListener('click', () => deleteUser(user.id, user.username));

        usersTbody.appendChild(row);
    });
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
    document.getElementById('user-username').disabled = true;
    document.getElementById('user-displayname').value = user.displayName;
    document.getElementById('user-role').value = user.role;
    document.getElementById('password-group').style.display = 'none';
    document.getElementById('user-password').removeAttribute('required');

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
                body: JSON.stringify({ displayName, role })
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
            <div class="upload-status">Warte...</div>
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
