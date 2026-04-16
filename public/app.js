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

// Filter/search state
let searchQuery = '';
let typeFilter = 'all'; // 'all' | 'folders' | 'images' | 'videos'

// Slideshow state
let slideshowTimer = null;
let slideshowPlaying = false;
const SLIDESHOW_INTERVAL_MS = 4000;

// Breadcrumb dropdown cache (path -> folder listing)
const breadcrumbSiblingCache = new Map();

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

// New feature DOM elements
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const typeFilterBtns = document.querySelectorAll('.type-filter-btn');
const shortcutsHelpBtn = document.getElementById('shortcuts-help-btn');
const shortcutsModal = document.getElementById('shortcuts-modal');
const closeShortcuts = document.getElementById('close-shortcuts');
const slideshowToggle = document.getElementById('slideshow-toggle');
const previewCounter = document.getElementById('preview-counter');
const rubberBand = document.getElementById('rubber-band');

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

    loadImages();
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

    // Reset search/filter when navigating to a new folder
    if (searchInput && searchInput.value) {
        searchInput.value = '';
        if (searchClear) searchClear.classList.add('hidden');
    }
    searchQuery = '';

    try {
        const url = `/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load media');

        const data = await response.json();
        folders = data.folders || [];
        images = data.files || [];
        currentPath = data.currentPath || '';
        // Update cache for this path's folders (they are siblings of any child)
        breadcrumbSiblingCache.set(currentPath || '', folders);
        renderGallery();
    } catch (error) {
        errorMessage.textContent = 'Medien konnten nicht geladen werden';
        log('Load media error:', error);
    } finally {
        loading.classList.add('hidden');
    }
}

// Apply current search + type filter to an array of items (with a `name` property)
function matchesFilters(item, kind) {
    // kind: 'folder' | 'image' | 'video'
    if (typeFilter === 'folders' && kind !== 'folder') return false;
    if (typeFilter === 'images' && kind !== 'image') return false;
    if (typeFilter === 'videos' && kind !== 'video') return false;
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!item.name.toLowerCase().includes(q)) return false;
    }
    return true;
}

// Render gallery
function renderGallery() {
    gallery.innerHTML = '';

    // Render breadcrumb
    renderBreadcrumb();

    // Filter folders and files according to current search/type filter
    const filtersActive = searchQuery !== '' || typeFilter !== 'all';
    const visibleFolders = folders.filter(f => matchesFilters(f, 'folder'));
    const visibleFiles = images.filter(f => matchesFilters(f, f.type));

    // Show back button if not in root (always, so user can escape even while filtering)
    if (currentPath) {
        const backCard = createBackButton();
        gallery.appendChild(backCard);
    }

    // Render folders
    visibleFolders.forEach(folder => {
        const card = createFolderCard(folder);
        gallery.appendChild(card);
    });

    // Render files. Keep the original index so preview navigation works on the
    // full list; the preview modal still iterates `images` in order.
    images.forEach((fileObj, index) => {
        if (!matchesFilters(fileObj, fileObj.type)) return;
        const card = createMediaCard(fileObj, index);
        gallery.appendChild(card);
    });

    // Empty states
    if (visibleFolders.length === 0 && visibleFiles.length === 0) {
        const message = document.createElement('p');
        if (filtersActive) {
            message.className = 'gallery-empty-filter';
            message.textContent = 'Keine Treffer';
        } else if (!currentPath) {
            message.textContent = 'Keine Medien im Verzeichnis gefunden';
        } else {
            // Subfolder but empty -> let back button carry navigation, nothing else
            return updateSelectedCount();
        }
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

    // Home/root — wrapped so we can attach a dropdown of top-level folders
    const homeWrapper = document.createElement('span');
    homeWrapper.className = 'breadcrumb-item-wrapper';

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
    homeWrapper.appendChild(home);

    // Only add a dropdown toggle when this level isn't the active/current one
    if (currentPath) {
        const toggle = createBreadcrumbDropdownToggle('', 'Start', null);
        homeWrapper.appendChild(toggle);
    }
    breadcrumb.appendChild(homeWrapper);

    // Path parts
    parts.forEach((part, index) => {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = ' / ';
        breadcrumb.appendChild(separator);

        pathSoFar += (pathSoFar ? '/' : '') + part;
        const isLast = index === parts.length - 1;

        const wrapper = document.createElement('span');
        wrapper.className = 'breadcrumb-item-wrapper';

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

        wrapper.appendChild(item);

        // Non-active segments get a sibling dropdown
        if (!isLast) {
            // Parent path is one level up from this segment
            const parentPath = parts.slice(0, index).join('/');
            const toggle = createBreadcrumbDropdownToggle(parentPath, part, pathSoFar);
            wrapper.appendChild(toggle);
        }

        breadcrumb.appendChild(wrapper);
    });
}

// Creates the little ▾ button that opens a dropdown of sibling folders at a
// particular breadcrumb level. `parentPath` is the path whose children we
// should list; `currentSegmentPath` is the path currently represented at this
// breadcrumb level (used to mark "current" in the dropdown).
function createBreadcrumbDropdownToggle(parentPath, label, currentSegmentPath) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'breadcrumb-dropdown-toggle';
    toggle.innerHTML = '▾';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', `Geschwister-Ordner von ${label} anzeigen`);

    toggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Close any other open breadcrumb dropdown first
        closeAllBreadcrumbDropdowns(toggle);

        const wrapper = toggle.parentElement;
        const existing = wrapper.querySelector('.breadcrumb-dropdown');
        if (existing) {
            existing.remove();
            toggle.setAttribute('aria-expanded', 'false');
            return;
        }

        toggle.setAttribute('aria-expanded', 'true');
        const dropdown = document.createElement('div');
        dropdown.className = 'breadcrumb-dropdown';
        dropdown.setAttribute('role', 'menu');
        dropdown.innerHTML = '<div class="breadcrumb-dropdown-empty">Wird geladen…</div>';
        wrapper.appendChild(dropdown);

        try {
            const siblings = await fetchBreadcrumbSiblings(parentPath);
            dropdown.innerHTML = '';
            if (siblings.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'breadcrumb-dropdown-empty';
                empty.textContent = 'Keine weiteren Ordner';
                dropdown.appendChild(empty);
            } else {
                siblings.forEach(folder => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'breadcrumb-dropdown-item';
                    btn.setAttribute('role', 'menuitem');
                    btn.textContent = folder.name;
                    if (currentSegmentPath && folder.path === currentSegmentPath) {
                        btn.classList.add('current');
                    }
                    btn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        closeAllBreadcrumbDropdowns();
                        loadImages(folder.path);
                    });
                    dropdown.appendChild(btn);
                });
            }
        } catch (err) {
            log('Breadcrumb siblings error:', err);
            dropdown.innerHTML = '<div class="breadcrumb-dropdown-empty">Fehler beim Laden</div>';
        }
    });

    return toggle;
}

async function fetchBreadcrumbSiblings(parentPath) {
    const cacheKey = parentPath || '';
    if (breadcrumbSiblingCache.has(cacheKey)) {
        return breadcrumbSiblingCache.get(cacheKey);
    }
    const url = `/api/browse${parentPath ? `?path=${encodeURIComponent(parentPath)}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load siblings');
    const data = await response.json();
    const folderList = data.folders || [];
    breadcrumbSiblingCache.set(cacheKey, folderList);
    return folderList;
}

function closeAllBreadcrumbDropdowns(exceptToggle) {
    document.querySelectorAll('.breadcrumb-dropdown').forEach(dd => dd.remove());
    document.querySelectorAll('.breadcrumb-dropdown-toggle[aria-expanded="true"]').forEach(t => {
        if (t !== exceptToggle) t.setAttribute('aria-expanded', 'false');
    });
}

// Close breadcrumb dropdowns on outside click or Esc
document.addEventListener('click', (e) => {
    if (!e.target.closest('.breadcrumb-item-wrapper')) {
        closeAllBreadcrumbDropdowns();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllBreadcrumbDropdowns();
    }
});

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
    pauseSlideshow();
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
        // Slideshow should not auto-advance through videos — pause it so the
        // user can choose to watch or manually skip.
        if (slideshowPlaying) {
            pauseSlideshow();
        }
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

    // Update counter
    if (previewCounter) {
        previewCounter.textContent = `${currentPreviewIndex + 1} / ${images.length}`;
    }
}

function showPrevImage(fromSlideshow = false) {
    if (!fromSlideshow) pauseSlideshow();
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        updatePreview();
    }
}

function showNextImage(fromSlideshow = false) {
    if (!fromSlideshow) pauseSlideshow();
    if (currentPreviewIndex < images.length - 1) {
        currentPreviewIndex++;
        updatePreview();
        // If slideshow reached the last item, stop (don't loop).
        if (fromSlideshow && currentPreviewIndex === images.length - 1) {
            // Allow the last slide to display, then pause
            clearTimeout(slideshowTimer);
            slideshowTimer = setTimeout(() => pauseSlideshow(), SLIDESHOW_INTERVAL_MS);
        }
    } else if (fromSlideshow) {
        pauseSlideshow();
    }
}

// ============================================
// Slideshow
// ============================================
function startSlideshow() {
    if (slideshowPlaying) return;
    // Don't start on the last item
    if (currentPreviewIndex >= images.length - 1) return;
    slideshowPlaying = true;
    updateSlideshowUI();
    scheduleNextSlide();
}

function pauseSlideshow() {
    if (!slideshowPlaying) {
        // Still sync UI in case state got out of step
        if (slideshowToggle) updateSlideshowUI();
        return;
    }
    slideshowPlaying = false;
    clearTimeout(slideshowTimer);
    slideshowTimer = null;
    updateSlideshowUI();
}

function toggleSlideshow() {
    if (slideshowPlaying) {
        pauseSlideshow();
    } else {
        startSlideshow();
    }
}

function scheduleNextSlide() {
    clearTimeout(slideshowTimer);
    slideshowTimer = setTimeout(() => {
        if (!slideshowPlaying) return;
        // Stop if we're at the end
        if (currentPreviewIndex >= images.length - 1) {
            pauseSlideshow();
            return;
        }
        showNextImage(true);
        if (slideshowPlaying) scheduleNextSlide();
    }, SLIDESHOW_INTERVAL_MS);
}

function updateSlideshowUI() {
    if (!slideshowToggle) return;
    const icon = slideshowToggle.querySelector('.slideshow-icon');
    const label = slideshowToggle.querySelector('.slideshow-label');
    if (slideshowPlaying) {
        slideshowToggle.classList.add('playing');
        slideshowToggle.setAttribute('aria-pressed', 'true');
        slideshowToggle.setAttribute('aria-label', 'Diashow pausieren');
        if (icon) icon.textContent = '⏸';
        if (label) label.textContent = 'Pause';
    } else {
        slideshowToggle.classList.remove('playing');
        slideshowToggle.setAttribute('aria-pressed', 'false');
        slideshowToggle.setAttribute('aria-label', 'Diashow starten');
        if (icon) icon.textContent = '▶';
        if (label) label.textContent = 'Diashow';
    }
}

if (slideshowToggle) {
    slideshowToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSlideshow();
    });
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
        pauseSlideshow();
        showNextImage(); // Swipe left
    } else if (touchEndX > touchStartX + swipeThreshold) {
        pauseSlideshow();
        showPrevImage(); // Swipe right
    }
}

// Enhanced keyboard navigation
document.addEventListener('keydown', (e) => {
    // Don't interfere with form inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const shortcutsOpen = shortcutsModal && !shortcutsModal.classList.contains('hidden');

    // Shortcuts modal handling (takes priority)
    if (shortcutsOpen) {
        if (e.key === 'Escape' || e.key === '?') {
            e.preventDefault();
            closeShortcutsModal();
        }
        return;
    }

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
        } else if (e.key === ' ') {
            // Space toggles slideshow (only when focus isn't on an input/button that wants space)
            const tag = e.target.tagName;
            if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') {
                e.preventDefault();
                toggleSlideshow();
            }
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
        } else if (e.key === '?') {
            e.preventDefault();
            openShortcutsModal();
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

// ============================================
// Search + type filter wiring
// ============================================
const applySearch = debounce((value) => {
    searchQuery = value.trim();
    renderGallery();
}, 200);

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (searchClear) searchClear.classList.toggle('hidden', val === '');
        applySearch(val);
    });

    // Esc in search input clears it
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchInput.value) {
            searchInput.value = '';
            searchClear.classList.add('hidden');
            searchQuery = '';
            renderGallery();
            e.stopPropagation();
        }
    });
}

if (searchClear) {
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        searchQuery = '';
        renderGallery();
        searchInput.focus();
    });
}

typeFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        if (filter === typeFilter) return;
        typeFilter = filter;
        typeFilterBtns.forEach(b => {
            const isActive = b === btn;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        renderGallery();
    });
});

// ============================================
// Shortcuts help modal
// ============================================
function openShortcutsModal() {
    if (!shortcutsModal) return;
    shortcutsModal.classList.remove('hidden');
}

function closeShortcutsModal() {
    if (!shortcutsModal) return;
    shortcutsModal.classList.add('hidden');
}

if (shortcutsHelpBtn) {
    shortcutsHelpBtn.addEventListener('click', openShortcutsModal);
}
if (closeShortcuts) {
    closeShortcuts.addEventListener('click', closeShortcutsModal);
}
if (shortcutsModal) {
    shortcutsModal.addEventListener('click', (e) => {
        if (e.target === shortcutsModal) closeShortcutsModal();
    });
}

// ============================================
// Drag-to-select (rubber band) — desktop only
// ============================================
if (!isTouchDevice && rubberBand) {
    let rbActive = false;
    let rbStartX = 0;
    let rbStartY = 0;
    let rbShiftAdd = false;
    // Snapshot of selection at drag start (used for Shift+drag additive mode)
    let rbBaseSelection = null;

    // Only start a rubber band when the mouse goes down on the gallery
    // background — not on a card, button, or interactive element.
    gallery.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left click only
        // Ignore clicks on cards or any interactive children
        if (e.target.closest('.image-card, .folder-card, button, a, input, .checkbox-overlay')) return;
        // Ignore when any modal is open
        if (!previewModal.classList.contains('hidden')) return;
        if (!changePasswordModal.classList.contains('hidden')) return;
        if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) return;

        rbActive = true;
        rbShiftAdd = e.shiftKey;
        rbBaseSelection = new Set(selectedImages);
        rbStartX = e.clientX;
        rbStartY = e.clientY;

        rubberBand.style.left = rbStartX + 'px';
        rubberBand.style.top = rbStartY + 'px';
        rubberBand.style.width = '0px';
        rubberBand.style.height = '0px';
        rubberBand.classList.remove('hidden');
        document.body.classList.add('rubber-banding');

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!rbActive) return;
        const x = Math.min(e.clientX, rbStartX);
        const y = Math.min(e.clientY, rbStartY);
        const w = Math.abs(e.clientX - rbStartX);
        const h = Math.abs(e.clientY - rbStartY);

        rubberBand.style.left = x + 'px';
        rubberBand.style.top = y + 'px';
        rubberBand.style.width = w + 'px';
        rubberBand.style.height = h + 'px';

        // Hit-test all media cards against the rubber band rect.
        // We only include image-cards (not folder-cards) because folders
        // aren't "selectable" in the selection model.
        const bandRect = { left: x, top: y, right: x + w, bottom: y + h };
        const cards = gallery.querySelectorAll('.image-card');
        cards.forEach(card => {
            const r = card.getBoundingClientRect();
            const intersects = !(r.right < bandRect.left || r.left > bandRect.right ||
                                 r.bottom < bandRect.top || r.top > bandRect.bottom);
            const path = card.dataset.path;
            if (!path) return;
            if (intersects) {
                if (!selectedImages.has(path)) {
                    selectedImages.add(path);
                    card.classList.add('selected');
                }
            } else {
                // If shift-adding, leave the pre-drag base selection alone;
                // otherwise remove cards no longer inside the band.
                if (rbShiftAdd) {
                    if (!rbBaseSelection.has(path) && selectedImages.has(path)) {
                        selectedImages.delete(path);
                        card.classList.remove('selected');
                    }
                } else {
                    if (selectedImages.has(path)) {
                        selectedImages.delete(path);
                        card.classList.remove('selected');
                    }
                }
            }
        });
        updateSelectedCount();
    });

    function endRubberBand() {
        if (!rbActive) return;
        rbActive = false;
        rbBaseSelection = null;
        rubberBand.classList.add('hidden');
        document.body.classList.remove('rubber-banding');
    }

    document.addEventListener('mouseup', endRubberBand);
    // If the mouse leaves the viewport, cancel the drag
    document.addEventListener('mouseleave', endRubberBand);
    window.addEventListener('blur', endRubberBand);
}
