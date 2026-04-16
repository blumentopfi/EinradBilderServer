// Utility functions
const DEBUG = false;
const log = (...args) => DEBUG && console.log(...args);

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

async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// Device detection
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// State management
let images = [];
let folders = [];
let currentPath = '';
let selectedImages = new Set();
let currentPreviewIndex = -1;
let currentUser = null;
let favorites = new Set();
let typeFilter = 'all'; // 'all' | 'folders' | 'images' | 'videos' | 'favorites'

// DOM elements
const loginScreen = document.getElementById('login-screen');
const galleryScreen = document.getElementById('gallery-screen');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');
const userInfo = document.getElementById('user-info');
const userMenuBtn = document.getElementById('user-menu-btn');
const userDropdown = document.getElementById('user-dropdown');
const adminBtn = document.getElementById('admin-btn');
const gameNavBtn = document.getElementById('game-nav-btn');
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

// Favorites API
async function loadFavorites() {
    try {
        const response = await fetch('/api/favorites');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        favorites = new Set(Array.isArray(data.favorites) ? data.favorites : []);
        log('Loaded favorites:', favorites.size);
    } catch (error) {
        log('Failed to load favorites:', error);
        favorites = new Set();
    }
}

async function addFavorite(path) {
    const response = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function removeFavorite(path) {
    const response = await fetch('/api/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

function showGallery() {
    log('showGallery called');
    loginScreen.classList.add('hidden');
    galleryScreen.classList.remove('hidden');

    // Update user info display
    if (currentUser) {
        log('Current user:', currentUser.displayName, 'Role:', currentUser.role);
        userInfo.textContent = `Angemeldet als: ${currentUser.displayName}`;

        // Show admin button if user is admin or uploader
        if (currentUser.role === 'admin' || currentUser.role === 'uploader') {
            adminBtn.classList.remove('hidden');
        } else {
            adminBtn.classList.add('hidden');
        }
    }

    // Check if we should open change password modal
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('changePassword') === 'true') {
        changePasswordModal.classList.remove('hidden');
        changePasswordForm.reset();
        changePasswordError.textContent = '';
        // Clean up URL
        window.history.replaceState({}, '', '/');
    }

    // Load favorites (non-blocking for rest of UI) then load images
    loadFavorites().finally(() => loadImages());
}

// Login handling
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
        log('Attempting login for user:', username);
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            log('Login successful');
            loginError.textContent = '';
            usernameInput.value = '';
            passwordInput.value = '';
            showGallery();
        } else {
            const errorData = await response.json();
            loginError.textContent = errorData.error || 'Ungültiger Benutzername oder Passwort';
        }
    } catch (error) {
        log('Login error:', error);
        loginError.textContent = 'Verbindungsfehler';
    }
});

// Admin button handling
adminBtn.addEventListener('click', () => {
    window.location.href = '/admin.html';
});

// Game button handling
gameNavBtn.addEventListener('click', () => {
    window.location.href = '/game.html';
});

// FAQ button handling
faqBtn.addEventListener('click', () => {
    window.location.href = '/faq.html';
});

// User menu dropdown handling
userMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = userDropdown.classList.toggle('hidden');
    userMenuBtn.classList.toggle('active');
    userMenuBtn.setAttribute('aria-expanded', !isExpanded);
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.classList.add('hidden');
        userMenuBtn.classList.remove('active');
        userMenuBtn.setAttribute('aria-expanded', 'false');
    }
});

// Change password handling
changePasswordBtn.addEventListener('click', () => {
    userDropdown.classList.add('hidden');
    userMenuBtn.classList.remove('active');
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
        log('Change password error:', error);
        changePasswordError.textContent = 'Verbindungsfehler';
    }
});

// Logout handling
logoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/logout', { method: 'POST' });
        selectedImages.clear();
        favorites.clear();
        typeFilter = 'all';
        images = [];
        currentUser = null;
        gallery.innerHTML = '';
        showLogin();
    } catch (error) {
        log('Logout error:', error);
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
        log('Load media error:', error);
    } finally {
        loading.classList.add('hidden');
    }
}

// Filter predicates
function matchesFilters(item, kind) {
    // kind: 'folder' | 'image' | 'video'
    if (typeFilter === 'all') return true;
    if (typeFilter === 'folders') return kind === 'folder';
    if (typeFilter === 'images') return kind === 'image';
    if (typeFilter === 'videos') return kind === 'video';
    if (typeFilter === 'favorites') {
        // Only files can be favorites, not folders
        return kind !== 'folder' && favorites.has(item.path);
    }
    return true;
}

// Render gallery
function renderGallery() {
    gallery.innerHTML = '';

    // Render breadcrumb
    renderBreadcrumb();

    // Show back button if not in root (always visible regardless of filter)
    if (currentPath) {
        const backCard = createBackButton();
        gallery.appendChild(backCard);
    }

    // Filter folders (hidden in favorites filter mode)
    const visibleFolders = folders.filter(folder => matchesFilters(folder, 'folder'));
    visibleFolders.forEach(folder => {
        const card = createFolderCard(folder);
        gallery.appendChild(card);
    });

    // Filter files by type and (if favorites filter) favorites membership
    const visibleImages = images.filter(fileObj => matchesFilters(fileObj, fileObj.type));
    visibleImages.forEach((fileObj) => {
        // Use original index from images array so preview navigation still works
        const originalIndex = images.indexOf(fileObj);
        const card = createMediaCard(fileObj, originalIndex);
        gallery.appendChild(card);
    });

    // Empty state messaging
    const nothingVisible = visibleFolders.length === 0 && visibleImages.length === 0;
    if (nothingVisible) {
        if (typeFilter === 'favorites') {
            const message = document.createElement('p');
            message.className = 'empty-state';
            message.textContent = 'Keine Favoriten in diesem Ordner';
            gallery.appendChild(message);
        } else if (folders.length === 0 && images.length === 0 && !currentPath) {
            const message = document.createElement('p');
            message.textContent = 'Keine Medien im Verzeichnis gefunden';
            gallery.appendChild(message);
        } else if (typeFilter !== 'all' && !currentPath) {
            const message = document.createElement('p');
            message.className = 'empty-state';
            message.textContent = 'Keine Inhalte für diesen Filter';
            gallery.appendChild(message);
        }
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
        home.setAttribute('tabindex', '0');
        home.setAttribute('role', 'button');
        home.setAttribute('aria-label', 'Zur Startseite navigieren');
        home.addEventListener('click', () => loadImages(''));
        home.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                loadImages('');
            }
        });
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
            item.setAttribute('tabindex', '0');
            item.setAttribute('role', 'button');
            item.setAttribute('aria-label', `Zu ${part} navigieren`);
            item.addEventListener('click', () => loadImages(itemPath));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    loadImages(itemPath);
                }
            });
        }

        breadcrumb.appendChild(item);
    });
}

// Create back button card
function createBackButton() {
    const card = document.createElement('div');
    card.className = 'folder-card back-button';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Zurück zum übergeordneten Ordner');

    const icon = document.createElement('div');
    icon.className = 'folder-icon back-icon';
    icon.innerHTML = '←';
    icon.setAttribute('aria-hidden', 'true');

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
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ordner ${folder.name} öffnen`);

    const icon = document.createElement('div');
    icon.className = 'folder-icon';
    icon.innerHTML = '📁';
    icon.setAttribute('aria-hidden', 'true');

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

// Lazy loading observer
const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const media = entry.target;
            const wrapper = media.parentElement;

            if (media.dataset.src) {
                wrapper.classList.add('loading');
                media.src = media.dataset.src;

                media.addEventListener('load', () => {
                    wrapper.classList.remove('loading');
                    media.classList.add('loaded');
                }, { once: true });

                media.addEventListener('loadeddata', () => {
                    wrapper.classList.remove('loading');
                    media.classList.add('loaded');
                }, { once: true });

                delete media.dataset.src;
            }
            imageObserver.unobserve(media);
        }
    });
}, { rootMargin: '100px' });

// Create media card (image or video)
function createMediaCard(fileObj, index) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.dataset.index = index;
    card.dataset.path = fileObj.path;
    card.dataset.name = fileObj.name;
    card.dataset.type = fileObj.type;
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${fileObj.name} - ${fileObj.type === 'video' ? 'Video' : 'Bild'}`);

    const wrapper = document.createElement('div');
    wrapper.className = 'image-wrapper';

    let mediaElement;
    if (fileObj.type === 'video') {
        mediaElement = document.createElement('video');
        mediaElement.dataset.src = `/api/media/${encodeURIComponent(fileObj.path)}`;
        mediaElement.muted = true;
        mediaElement.loop = true;
        mediaElement.playsInline = true;
        mediaElement.preload = 'none';
        mediaElement.setAttribute('aria-label', fileObj.name);

        // Add play icon overlay
        const playIcon = document.createElement('div');
        playIcon.className = 'play-icon';
        playIcon.innerHTML = '▶';
        playIcon.setAttribute('aria-hidden', 'true');
        wrapper.appendChild(playIcon);

        // Desktop: hover to play / Mobile: tap play icon
        if (!isTouchDevice) {
            card.addEventListener('mouseenter', () => {
                if (mediaElement.src) {
                    mediaElement.play().catch(() => {});
                }
            });
            card.addEventListener('mouseleave', () => {
                mediaElement.pause();
                mediaElement.currentTime = 0;
            });
        } else {
            playIcon.style.pointerEvents = 'auto';
            playIcon.style.cursor = 'pointer';
            playIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                if (mediaElement.paused) {
                    mediaElement.play().catch(() => {});
                    playIcon.style.opacity = '0';
                } else {
                    mediaElement.pause();
                    playIcon.style.opacity = '1';
                }
            });
        }

        // Lazy load video when visible
        imageObserver.observe(mediaElement);
    } else {
        mediaElement = document.createElement('img');
        mediaElement.dataset.src = `/api/media/${encodeURIComponent(fileObj.path)}`;
        mediaElement.alt = fileObj.name;

        // Use Intersection Observer for lazy loading
        imageObserver.observe(mediaElement);
    }

    // Error handling
    mediaElement.addEventListener('error', () => {
        const errorOverlay = document.createElement('div');
        errorOverlay.className = 'media-error';
        errorOverlay.innerHTML = `
            <div class="media-error-icon" aria-hidden="true">⚠️</div>
            <div>Fehler beim Laden</div>
            <button class="retry-btn">Erneut versuchen</button>
        `;
        wrapper.appendChild(errorOverlay);

        errorOverlay.querySelector('.retry-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            errorOverlay.remove();
            const src = mediaElement.dataset.src || mediaElement.src;
            mediaElement.src = '';
            mediaElement.dataset.src = src;
            imageObserver.observe(mediaElement);
        });
    });

    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox-overlay';

    // Favorite star (top-left)
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'favorite-btn';
    const isFav = favorites.has(fileObj.path);
    favBtn.classList.toggle('is-favorite', isFav);
    favBtn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    favBtn.setAttribute('aria-label', isFav ? 'Favorit entfernen' : 'Als Favorit markieren');
    favBtn.dataset.path = fileObj.path;
    favBtn.innerHTML = `<span class="favorite-icon" aria-hidden="true">${isFav ? '★' : '☆'}</span>`;
    favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavorite(fileObj.path, favBtn, card);
    });
    // Prevent star key activation from bubbling to card
    favBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
        }
    });

    const nameDiv = document.createElement('div');
    nameDiv.className = 'image-name';
    nameDiv.textContent = fileObj.name;

    wrapper.appendChild(mediaElement);
    wrapper.appendChild(favBtn);
    wrapper.appendChild(checkbox);
    card.appendChild(wrapper);
    card.appendChild(nameDiv);

    // Click on card to toggle selection
    card.addEventListener('click', (e) => {
        // Ignore clicks that originated on the favorite button
        if (e.target.closest('.favorite-btn')) return;
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

    // Reflect selected state (useful when re-rendering with filters)
    if (selectedImages.has(fileObj.path)) {
        card.classList.add('selected');
    }

    return card;
}

// Toggle favorite (optimistic update, revert on error)
async function toggleFavorite(path, btn, card) {
    const wasFavorite = favorites.has(path);
    const nextFavorite = !wasFavorite;

    // Optimistic UI
    if (nextFavorite) {
        favorites.add(path);
    } else {
        favorites.delete(path);
    }
    applyFavoriteUI(btn, nextFavorite);

    // Animation pulse
    btn.classList.remove('pulse');
    // Force reflow to restart animation
    void btn.offsetWidth;
    btn.classList.add('pulse');

    try {
        if (nextFavorite) {
            await addFavorite(path);
        } else {
            await removeFavorite(path);
        }
    } catch (error) {
        log('Favorite toggle failed, reverting:', error);
        // Revert
        if (wasFavorite) {
            favorites.add(path);
        } else {
            favorites.delete(path);
        }
        applyFavoriteUI(btn, wasFavorite);
    }

    // If favorites filter is active, re-render to add/remove the card from view
    if (typeFilter === 'favorites') {
        renderGallery();
    }
}

function applyFavoriteUI(btn, isFavorite) {
    btn.classList.toggle('is-favorite', isFavorite);
    btn.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
    btn.setAttribute('aria-label', isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren');
    const icon = btn.querySelector('.favorite-icon');
    if (icon) icon.textContent = isFavorite ? '★' : '☆';
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

// Select all (only visible files under the active filter)
selectAllBtn.addEventListener('click', () => {
    const visible = images.filter(fileObj => matchesFilters(fileObj, fileObj.type));
    visible.forEach(fileObj => selectedImages.add(fileObj.path));
    document.querySelectorAll('.image-card').forEach(card => {
        card.classList.add('selected');
    });
    updateSelectedCount();
});

// Type filter buttons (Alle / Ordner / Bilder / Videos / Favoriten)
document.querySelectorAll('.type-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        if (!filter || filter === typeFilter) return;
        typeFilter = filter;
        // Update button states
        document.querySelectorAll('.type-filter-btn').forEach(b => {
            const isActive = b.dataset.filter === typeFilter;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        renderGallery();
    });
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
        log('Download error:', error);
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

// Touch gestures for mobile
let touchStartX = 0;
let touchEndX = 0;

previewModal.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

previewModal.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    const swipeThreshold = 50;
    if (touchEndX < touchStartX - swipeThreshold) {
        showNextImage(); // Swipe left
    } else if (touchEndX > touchStartX + swipeThreshold) {
        showPrevImage(); // Swipe right
    }
}

// Enhanced keyboard navigation
document.addEventListener('keydown', (e) => {
    // Don't interfere with form inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (!previewModal.classList.contains('hidden')) {
        // Preview modal shortcuts
        if (e.key === 'Escape') {
            closePreview();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            showPrevImage();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            showNextImage();
        }
    } else if (!changePasswordModal.classList.contains('hidden')) {
        // Change password modal shortcuts
        if (e.key === 'Escape') {
            changePasswordModal.classList.add('hidden');
        }
    } else {
        // Gallery shortcuts
        if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            selectAllBtn.click();
        } else if (e.key === 'Escape') {
            if (selectedImages.size > 0) {
                deselectAllBtn.click();
            }
        } else if (e.key === 'd' && (e.ctrlKey || e.metaKey) && selectedImages.size > 0) {
            e.preventDefault();
            downloadBtn.click();
        }
    }
});

// Keyboard activation for cards (Enter/Space)
document.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('image-card') || e.target.classList.contains('folder-card')) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.target.click();
        }
    }
});
