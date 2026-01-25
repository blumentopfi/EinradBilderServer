// State management
let images = [];
let folders = [];
let currentPath = '';
let selectedImages = new Set();
let currentPreviewIndex = -1;
let currentUser = null;

// DOM elements
const loginScreen = document.getElementById('login-screen');
const galleryScreen = document.getElementById('gallery-screen');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');
const userInfo = document.getElementById('user-info');
const adminBtn = document.getElementById('admin-btn');
const faqBtn = document.getElementById('faq-btn');
const gallery = document.getElementById('gallery');
const loading = document.getElementById('loading');
const errorMessage = document.getElementById('error-message');
const selectedCount = document.getElementById('selected-count');
const downloadBtn = document.getElementById('download-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const logoutBtn = document.getElementById('logout-btn');
const changePasswordBtn = document.getElementById('change-password-btn');
const changePasswordModal = document.getElementById('change-password-modal');
const changePasswordForm = document.getElementById('change-password-form');
const closeChangePassword = document.getElementById('close-change-password');
const cancelChangePassword = document.getElementById('cancel-change-password');
const changePasswordError = document.getElementById('change-password-error');
const previewModal = document.getElementById('preview-modal');
const previewImage = document.getElementById('preview-image');
const previewVideo = document.getElementById('preview-video');
const closeModal = document.querySelector('.close-modal');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

// Check authentication on load
checkAuth();

async function checkAuth() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();
        if (data.authenticated) {
            currentUser = data.user;
            showGallery();
        } else {
            showLogin();
        }
    } catch (error) {
        showLogin();
    }
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    galleryScreen.classList.add('hidden');
    currentUser = null;
}

function showGallery() {
    console.log('showGallery called');
    console.log('loginScreen:', loginScreen);
    console.log('galleryScreen:', galleryScreen);
    loginScreen.classList.add('hidden');
    galleryScreen.classList.remove('hidden');
    console.log('Classes updated - loginScreen:', loginScreen.className, 'galleryScreen:', galleryScreen.className);

    // Update user info display
    if (currentUser) {
        console.log('Current user:', currentUser);
        console.log('User role:', currentUser.role);
        userInfo.textContent = `Angemeldet als: ${currentUser.displayName}`;

        // Show admin button if user is admin or uploader
        if (currentUser.role === 'admin' || currentUser.role === 'uploader') {
            console.log('Showing admin button for role:', currentUser.role);
            adminBtn.classList.remove('hidden');
            // Change button text for uploaders
            if (currentUser.role === 'uploader') {
                adminBtn.textContent = 'Upload-Bereich';
            } else {
                adminBtn.textContent = 'Admin-Bereich';
            }
        } else {
            console.log('Hiding admin button for role:', currentUser.role);
            adminBtn.classList.add('hidden');
        }
    }

    loadImages();
}

// Login handling
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
        console.log('Attempting login...');
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        console.log('Login response:', response.status, response.ok);

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            console.log('Login successful, showing gallery...');
            loginError.textContent = '';
            usernameInput.value = '';
            passwordInput.value = '';
            showGallery();
        } else {
            console.log('Login failed');
            const errorData = await response.json();
            loginError.textContent = errorData.error || 'Ungültiger Benutzername oder Passwort';
        }
    } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = 'Verbindungsfehler';
    }
});

// Admin button handling
adminBtn.addEventListener('click', () => {
    window.location.href = '/admin.html';
});

// FAQ button handling
faqBtn.addEventListener('click', () => {
    window.location.href = '/faq.html';
});

// Change password handling
changePasswordBtn.addEventListener('click', () => {
    changePasswordModal.classList.remove('hidden');
    changePasswordForm.reset();
    changePasswordError.textContent = '';
});

closeChangePassword.addEventListener('click', () => {
    changePasswordModal.classList.add('hidden');
});

cancelChangePassword.addEventListener('click', () => {
    changePasswordModal.classList.add('hidden');
});

changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    changePasswordError.textContent = '';

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password-input').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;

    if (newPassword !== confirmPassword) {
        changePasswordError.textContent = 'Neue Passwörter stimmen nicht überein';
        return;
    }

    if (newPassword.length < 8) {
        changePasswordError.textContent = 'Neues Passwort muss mindestens 8 Zeichen lang sein';
        return;
    }

    try {
        const response = await fetch('/api/profile/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Passwort erfolgreich geändert!');
            changePasswordModal.classList.add('hidden');
            changePasswordForm.reset();
        } else {
            changePasswordError.textContent = data.error || 'Fehler beim Ändern des Passworts';
        }
    } catch (error) {
        console.error('Change password error:', error);
        changePasswordError.textContent = 'Verbindungsfehler';
    }
});

// Logout handling
logoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/logout', { method: 'POST' });
        selectedImages.clear();
        images = [];
        currentUser = null;
        gallery.innerHTML = '';
        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// Load images, videos, and folders
async function loadImages(path = '') {
    loading.classList.remove('hidden');
    errorMessage.textContent = '';
    currentPath = path;

    try {
        const url = `/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load media');

        const data = await response.json();
        folders = data.folders || [];
        images = data.files || [];
        currentPath = data.currentPath || '';
        renderGallery();
    } catch (error) {
        errorMessage.textContent = 'Medien konnten nicht geladen werden';
        console.error('Load media error:', error);
    } finally {
        loading.classList.add('hidden');
    }
}

// Render gallery
function renderGallery() {
    gallery.innerHTML = '';

    // Render breadcrumb
    renderBreadcrumb();

    // Show back button if not in root
    if (currentPath) {
        const backCard = createBackButton();
        gallery.appendChild(backCard);
    }

    // Render folders
    folders.forEach(folder => {
        const card = createFolderCard(folder);
        gallery.appendChild(card);
    });

    // Render files
    images.forEach((fileObj, index) => {
        const card = createMediaCard(fileObj, index);
        gallery.appendChild(card);
    });

    // Show message only if nothing to display (no folders, no files, and not in a subfolder with back button)
    if (folders.length === 0 && images.length === 0 && !currentPath) {
        const message = document.createElement('p');
        message.textContent = 'Keine Medien im Verzeichnis gefunden';
        gallery.appendChild(message);
    }

    updateSelectedCount();
}

// Render breadcrumb navigation
function renderBreadcrumb() {
    const header = document.querySelector('header');
    let breadcrumb = document.getElementById('breadcrumb');

    if (!breadcrumb) {
        breadcrumb = document.createElement('div');
        breadcrumb.id = 'breadcrumb';
        breadcrumb.className = 'breadcrumb';
        header.appendChild(breadcrumb);
    }

    breadcrumb.innerHTML = '';

    const parts = currentPath ? currentPath.split('/') : [];
    let pathSoFar = '';

    // Home/root
    const home = document.createElement('span');
    home.className = 'breadcrumb-item' + (currentPath ? '' : ' active');
    home.textContent = '🏠 Start';
    if (currentPath) {
        home.style.cursor = 'pointer';
        home.addEventListener('click', () => loadImages(''));
    }
    breadcrumb.appendChild(home);

    // Path parts
    parts.forEach((part, index) => {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = ' / ';
        breadcrumb.appendChild(separator);

        pathSoFar += (pathSoFar ? '/' : '') + part;
        const isLast = index === parts.length - 1;

        const item = document.createElement('span');
        item.className = 'breadcrumb-item' + (isLast ? ' active' : '');
        item.textContent = part;

        if (!isLast) {
            const itemPath = pathSoFar;
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => loadImages(itemPath));
        }

        breadcrumb.appendChild(item);
    });
}

// Create back button card
function createBackButton() {
    const card = document.createElement('div');
    card.className = 'folder-card back-button';

    const icon = document.createElement('div');
    icon.className = 'folder-icon back-icon';
    icon.innerHTML = '←';

    card.appendChild(icon);

    card.addEventListener('click', () => {
        const parentPath = currentPath.split('/').slice(0, -1).join('/');
        loadImages(parentPath);
    });

    return card;
}

// Create folder card
function createFolderCard(folder) {
    const card = document.createElement('div');
    card.className = 'folder-card';

    const icon = document.createElement('div');
    icon.className = 'folder-icon';
    icon.innerHTML = '📁';

    const name = document.createElement('div');
    name.className = 'folder-name';
    name.textContent = folder.name;

    card.appendChild(icon);
    card.appendChild(name);

    card.addEventListener('click', () => {
        loadImages(folder.path);
    });

    return card;
}

// Create media card (image or video)
function createMediaCard(fileObj, index) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.dataset.index = index;
    card.dataset.path = fileObj.path;
    card.dataset.name = fileObj.name;
    card.dataset.type = fileObj.type;

    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';

    let mediaElement;
    if (fileObj.type === 'video') {
        mediaElement = document.createElement('video');
        mediaElement.src = `/api/media/${encodeURIComponent(fileObj.path)}`;
        mediaElement.muted = true;
        mediaElement.loop = true;
        mediaElement.playsInline = true;
        mediaElement.preload = 'metadata';

        // Add play icon overlay
        const playIcon = document.createElement('div');
        playIcon.className = 'play-icon';
        playIcon.innerHTML = '▶';
        wrapper.appendChild(playIcon);

        // Hover to play preview
        card.addEventListener('mouseenter', () => {
            mediaElement.play().catch(() => {});
        });
        card.addEventListener('mouseleave', () => {
            mediaElement.pause();
            mediaElement.currentTime = 0;
        });
    } else {
        mediaElement = document.createElement('img');
        mediaElement.src = `/api/media/${encodeURIComponent(fileObj.path)}`;
        mediaElement.alt = fileObj.name;
        mediaElement.loading = 'lazy';
    }

    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox-overlay';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'image-name';
    nameDiv.textContent = fileObj.name;

    wrapper.appendChild(mediaElement);
    wrapper.appendChild(checkbox);
    card.appendChild(wrapper);
    card.appendChild(nameDiv);

    // Click on card to toggle selection
    card.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG' || e.target.tagName === 'VIDEO' || e.target.classList.contains('play-icon')) {
            // Click on media opens preview
            openPreview(index);
        } else {
            // Click elsewhere toggles selection
            toggleSelection(fileObj.path, card);
        }
    });

    // Checkbox click
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelection(fileObj.path, card);
    });

    return card;
}

// Toggle selection
function toggleSelection(imageName, card) {
    if (selectedImages.has(imageName)) {
        selectedImages.delete(imageName);
        card.classList.remove('selected');
    } else {
        selectedImages.add(imageName);
        card.classList.add('selected');
    }
    updateSelectedCount();
}

// Update selected count
function updateSelectedCount() {
    const count = selectedImages.size;
    selectedCount.textContent = `${count} ausgewählt`;
    downloadBtn.disabled = count === 0;
}

// Select all
selectAllBtn.addEventListener('click', () => {
    images.forEach(fileObj => selectedImages.add(fileObj.path));
    document.querySelectorAll('.image-card').forEach(card => {
        card.classList.add('selected');
    });
    updateSelectedCount();
});

// Deselect all
deselectAllBtn.addEventListener('click', () => {
    selectedImages.clear();
    document.querySelectorAll('.image-card').forEach(card => {
        card.classList.remove('selected');
    });
    updateSelectedCount();
});

// Download selected images
downloadBtn.addEventListener('click', async () => {
    if (selectedImages.size === 0) return;

    const imagesToDownload = Array.from(selectedImages);

    try {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Wird heruntergeladen...';

        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: imagesToDownload })
        });

        if (!response.ok) throw new Error('Download failed');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bilder.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        downloadBtn.textContent = 'Ausgewählte herunterladen';
        downloadBtn.disabled = false;
    } catch (error) {
        alert('Download fehlgeschlagen. Bitte versuchen Sie es erneut.');
        console.error('Download error:', error);
        downloadBtn.textContent = 'Ausgewählte herunterladen';
        downloadBtn.disabled = false;
    }
});

// Preview modal
function openPreview(index) {
    currentPreviewIndex = index;
    updatePreview();
    previewModal.classList.remove('hidden');
}

function closePreview() {
    // Pause video if playing
    if (!previewVideo.classList.contains('hidden')) {
        previewVideo.pause();
    }
    previewModal.classList.add('hidden');
    currentPreviewIndex = -1;
}

function updatePreview() {
    if (currentPreviewIndex < 0 || currentPreviewIndex >= images.length) return;

    const fileObj = images[currentPreviewIndex];

    if (fileObj.type === 'video') {
        // Show video, hide image
        previewImage.classList.add('hidden');
        previewImage.src = ''; // Clear image source
        previewVideo.classList.remove('hidden');
        previewVideo.src = `/api/media/${encodeURIComponent(fileObj.path)}`;
        previewVideo.load();
    } else {
        // Show image, hide video
        previewVideo.classList.add('hidden');
        previewVideo.pause();
        previewVideo.src = ''; // Clear video source
        previewImage.classList.remove('hidden');
        previewImage.src = `/api/media/${encodeURIComponent(fileObj.path)}`;
        previewImage.alt = fileObj.name;
    }

    prevBtn.disabled = currentPreviewIndex === 0;
    nextBtn.disabled = currentPreviewIndex === images.length - 1;
}

function showPrevImage() {
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        updatePreview();
    }
}

function showNextImage() {
    if (currentPreviewIndex < images.length - 1) {
        currentPreviewIndex++;
        updatePreview();
    }
}

// Modal event listeners
closeModal.addEventListener('click', closePreview);
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        closePreview();
    }
});

prevBtn.addEventListener('click', showPrevImage);
nextBtn.addEventListener('click', showNextImage);

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (!previewModal.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closePreview();
        } else if (e.key === 'ArrowLeft') {
            showPrevImage();
        } else if (e.key === 'ArrowRight') {
            showNextImage();
        }
    }
});
