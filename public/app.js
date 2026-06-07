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

// Reduced motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Toast notification system
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    container.appendChild(toast);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
        // Fallback removal for reduced-motion (animation may be instant)
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 400);
    }, 3000);
}

// Scroll-to-top button and sticky header shadow
(function initScrollFeatures() {
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    const headerEl = document.querySelector('#gallery-screen header');

    if (!scrollTopBtn) return;

    const handleScroll = debounce(() => {
        const scrollY = window.scrollY || window.pageYOffset;

        // Show/hide scroll-to-top button
        if (scrollY > 300) {
            scrollTopBtn.classList.remove('hidden');
        } else {
            scrollTopBtn.classList.add('hidden');
        }

        // Sticky header shadow
        if (headerEl) {
            if (scrollY > 10) {
                headerEl.classList.add('scrolled');
            } else {
                headerEl.classList.remove('scrolled');
            }
        }
    }, 50);

    window.addEventListener('scroll', handleScroll, { passive: true });

    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
})();

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

// Filter/search state
let searchQuery = '';
let typeFilter = 'all'; // 'all' | 'images' | 'videos' | 'favorites'

// Slideshow state
let slideshowTimer = null;
let slideshowPlaying = false;
const SLIDESHOW_INTERVAL_MS = 4000;

// Breadcrumb dropdown cache (path -> folder listing)
const breadcrumbSiblingCache = new Map();

// Dark mode is initialized by dark-mode.js (loaded before this script)

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
const medienNavBtn = document.getElementById('medien-nav-btn');
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
const previewCloseBtn = document.getElementById('preview-close-btn');
const previewCounter = document.getElementById('preview-counter');
const previewFilename = document.getElementById('preview-filename');
const previewHints = document.getElementById('preview-hints');
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
const rubberBand = document.getElementById('rubber-band');

// Upload feature DOM elements
const uploadBtn = document.getElementById('upload-btn');
const uploadFileInput = document.getElementById('upload-file-input');
const uploadDropOverlay = document.getElementById('upload-drop-overlay');
const uploadDropTarget = document.getElementById('upload-drop-target');
const uploadQueueCard = document.getElementById('upload-queue-card');
const uploadQueueList = document.getElementById('upload-queue-list');
const uploadQueueClose = document.getElementById('upload-queue-close');

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
            if (medienNavBtn) medienNavBtn.classList.remove('hidden');
        } else {
            adminBtn.classList.add('hidden');
            if (medienNavBtn) medienNavBtn.classList.add('hidden');
        }

        // Show upload button if user is admin or uploader
        if (uploadBtn) {
            if (canUpload()) {
                uploadBtn.classList.remove('hidden');
            } else {
                uploadBtn.classList.add('hidden');
            }
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

if (medienNavBtn) medienNavBtn.addEventListener('click', () => {
    window.location.href = '/medien.html';
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
            showToast('Passwort erfolgreich geändert!', 'success');
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
        if (uploadBtn) uploadBtn.classList.add('hidden');
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

        // Honor a pending #preview=<path> hash set by the global search palette.
        // The hash is consumed (cleared) so reloads don't reopen the preview.
        maybeOpenPendingPreview();
    } catch (error) {
        errorMessage.textContent = 'Medien konnten nicht geladen werden';
        log('Load media error:', error);
    } finally {
        loading.classList.add('hidden');
    }
}

// Check for a pending preview target in the URL hash. If the target file lives
// in the current folder, open the preview and clear the hash.
function maybeOpenPendingPreview() {
    const hash = window.location.hash || '';
    const match = hash.match(/^#preview=(.+)$/);
    if (!match) return;
    let target;
    try {
        target = decodeURIComponent(match[1]);
    } catch {
        return;
    }
    const idx = images.findIndex(img => img.path === target);
    if (idx >= 0) {
        // Clear hash without triggering navigation
        history.replaceState(null, '', window.location.pathname + window.location.search);
        openPreview(idx);
    }
}

// Apply current search + type filter to an item
function matchesFilters(item, kind) {
    // kind: 'folder' | 'image' | 'video'
    if (typeFilter === 'images' && kind !== 'image') return false;
    if (typeFilter === 'videos' && kind !== 'video') return false;
    if (typeFilter === 'favorites') {
        if (kind === 'folder' || !favorites.has(item.path)) return false;
    }
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

    // Collect all cards for staggered animation
    const allCards = [];

    // Filter folders and files
    const filtersActive = searchQuery !== '' || typeFilter !== 'all';
    const visibleFolders = folders.filter(f => matchesFilters(f, 'folder'));
    const visibleFiles = images.filter(f => matchesFilters(f, f.type));

    // Show back button if not in root (always, so user can escape even while filtering)
    if (currentPath) {
        const backCard = createBackButton();
        gallery.appendChild(backCard);
        allCards.push(backCard);
    }

    // Render folders
    visibleFolders.forEach(folder => {
        const card = createFolderCard(folder);
        gallery.appendChild(card);
        allCards.push(card);
    });

    // Render files, preserving the original index so preview navigation still
    // operates on the full images array.
    images.forEach((fileObj, index) => {
        if (!matchesFilters(fileObj, fileObj.type)) return;
        const card = createMediaCard(fileObj, index);
        gallery.appendChild(card);
        allCards.push(card);
    });

    // Render upload card as the last grid item for admin/uploader users.
    // Skip it when filters are active so the result list stays focused.
    if (canUpload() && !filtersActive) {
        const uploadCard = createUploadCard();
        gallery.appendChild(uploadCard);
        allCards.push(uploadCard);
    }

    // Empty states
    if (visibleFolders.length === 0 && visibleFiles.length === 0) {
        const message = document.createElement('p');
        if (typeFilter === 'favorites') {
            message.className = 'gallery-empty-filter';
            message.textContent = 'Keine Favoriten in diesem Ordner';
        } else if (filtersActive) {
            message.className = 'gallery-empty-filter';
            message.textContent = 'Keine Treffer';
        } else if (!currentPath && !canUpload()) {
            message.textContent = 'Keine Medien im Verzeichnis gefunden';
        } else {
            // Empty subfolder, or empty root for uploaders — the upload
            // card (or back button) carries the conversation forward,
            // no empty-state text needed.
            return updateSelectedCount();
        }
        gallery.appendChild(message);
    }

    // Staggered card entrance animation
    if (!prefersReducedMotion) {
        allCards.forEach((card, i) => {
            card.classList.add('card-enter');
            const delay = Math.min(i, 20) * 50; // Cap stagger at 20 cards
            setTimeout(() => {
                requestAnimationFrame(() => {
                    card.classList.add('card-visible');
                });
            }, delay);
        });
    }

    // Update item count display
    const itemCountEl = document.getElementById('item-count');
    if (itemCountEl) {
        const parts = [];
        if (folders.length > 0) {
            parts.push(`${folders.length} ${folders.length === 1 ? 'Ordner' : 'Ordner'}`);
        }
        if (images.length > 0) {
            parts.push(`${images.length} ${images.length === 1 ? 'Datei' : 'Dateien'}`);
        }
        itemCountEl.textContent = parts.length > 0 ? `· ${parts.join(', ')}` : '';
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

// Create upload card — dashed-border tile rendered last in the grid for
// admin/uploader users. Clicking it opens the native file picker; the
// existing upload pipeline handles the rest.
function createUploadCard() {
    const card = document.createElement('div');
    card.className = 'upload-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Dateien in diesen Ordner hochladen');

    const label = document.createElement('div');
    label.className = 'upload-card-label';
    label.textContent = 'Hochladen';
    card.appendChild(label);

    const triggerPicker = () => {
        if (!canUpload()) return;
        if (!uploadFileInput) return;
        uploadFileInput.value = '';
        uploadFileInput.click();
    };

    card.addEventListener('click', triggerPicker);
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            triggerPicker();
        }
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
        mediaElement.preload = 'metadata';
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
    nameDiv.title = fileObj.name;

    wrapper.appendChild(mediaElement);
    wrapper.appendChild(favBtn);
    wrapper.appendChild(checkbox);
    card.appendChild(wrapper);
    card.appendChild(nameDiv);

    // Click anywhere on card → open preview. Selection is via the checkbox.
    card.addEventListener('click', (e) => {
        if (e.target.closest('.favorite-btn, .checkbox-overlay')) return;
        openPreview(index);
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
        downloadBtn.textContent = 'Wird heruntergeladen…';

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
        showToast('Download fehlgeschlagen. Bitte versuchen Sie es erneut.', 'error');
        log('Download error:', error);
        downloadBtn.textContent = 'Ausgewählte herunterladen';
        downloadBtn.disabled = false;
    }
});

// Preview modal
let previewHintsTimeout = null;

// ----- View-Transition helpers (gallery thumb ↔ preview morph + slideshow crossfade) -----
// `prefersReducedMotion` is a module-level const declared near the top of this file.

const supportsViewTransitions = () =>
    typeof document.startViewTransition === 'function' && !prefersReducedMotion;

function preloadMedia(src) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = src;
        if (img.complete) resolve();
    });
}

function isInViewport(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 &&
           r.top < window.innerHeight && r.left < window.innerWidth;
}

function findCardForIndex(index) {
    return document.querySelector(`.image-card[data-index="${index}"]`);
}

function findCardMedia(card) {
    return card?.querySelector('.image-wrapper img, .image-wrapper video');
}

function openPreview(index) {
    const sourceCard = findCardForIndex(index);
    const sourceMedia = findCardMedia(sourceCard);

    const apply = () => {
        currentPreviewIndex = index;
        updatePreview(false);
        previewModal.classList.remove('hidden');
        previewModal.classList.remove('closing');
        // Hand the view-transition-name off to the preview element so we
        // don't end up with two elements claiming the same name.
        if (sourceMedia) sourceMedia.style.viewTransitionName = '';
    };

    const runHintsAnimation = () => {
        if (!previewHints) return;
        previewHints.style.animation = 'none';
        void previewHints.offsetWidth;
        previewHints.style.animation = 'hintsAppear 3s 0.5s ease forwards';
    };

    if (sourceMedia && supportsViewTransitions() && isInViewport(sourceMedia)) {
        sourceMedia.style.viewTransitionName = 'preview-anchor';
        document.startViewTransition(apply).finished.finally(runHintsAnimation);
    } else {
        apply();
        runHintsAnimation();
    }
}

function closePreview() {
    if (!previewVideo.classList.contains('hidden')) {
        previewVideo.pause();
    }
    pauseSlideshow();

    const targetCard = findCardForIndex(currentPreviewIndex);
    const targetMedia = findCardMedia(targetCard);

    const apply = () => {
        previewModal.classList.add('hidden');
        currentPreviewIndex = -1;
        // After hide: hand the anchor back to the thumbnail so the morph
        // captures it as the new state.
        if (targetMedia) targetMedia.style.viewTransitionName = 'preview-anchor';
    };

    if (targetMedia && supportsViewTransitions() && isInViewport(targetMedia)) {
        document.startViewTransition(apply).finished.finally(() => {
            targetMedia.style.viewTransitionName = '';
        });
    } else {
        apply();
        // No transition, but clean up the inline style if we set one earlier.
        if (targetMedia) targetMedia.style.viewTransitionName = '';
    }
}

function updatePreview(crossfade) {
    if (currentPreviewIndex < 0 || currentPreviewIndex >= images.length) return;

    const fileObj = images[currentPreviewIndex];
    const mediaPath = `/api/media/${encodeURIComponent(fileObj.path)}`;

    const applyChange = () => {
        if (fileObj.type === 'video') {
            previewImage.classList.add('hidden');
            previewImage.src = '';
            previewVideo.classList.remove('hidden');
            previewVideo.src = mediaPath;
            previewVideo.load();
            // Slideshow should not auto-advance through videos.
            if (slideshowPlaying) pauseSlideshow();
        } else {
            previewVideo.classList.add('hidden');
            previewVideo.pause();
            previewVideo.src = '';
            previewImage.classList.remove('hidden');
            previewImage.src = mediaPath;
            previewImage.alt = fileObj.name;
        }
        previewCounter.textContent = `${currentPreviewIndex + 1} / ${images.length}`;
        previewFilename.textContent = fileObj.name;
        prevBtn.disabled = currentPreviewIndex === 0;
        nextBtn.disabled = currentPreviewIndex === images.length - 1;
    };

    const useTransition = crossfade && supportsViewTransitions();

    if (useTransition && fileObj.type !== 'video') {
        // Preload so the post-transition snapshot has actual image content.
        preloadMedia(mediaPath).then(() => {
            document.startViewTransition(applyChange);
        });
    } else if (useTransition) {
        // Videos: skip preload (would need a separate strategy); still wrap
        // for a clean crossfade between video poster frames.
        document.startViewTransition(applyChange);
    } else {
        applyChange();
    }
}

function showPrevImage(fromSlideshow = false) {
    if (!fromSlideshow) pauseSlideshow();
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        updatePreview(true);
    }
}

function showNextImage(fromSlideshow = false) {
    if (!fromSlideshow) pauseSlideshow();
    if (currentPreviewIndex < images.length - 1) {
        currentPreviewIndex++;
        updatePreview(true);
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
previewCloseBtn.addEventListener('click', closePreview);
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
// Password Visibility Toggle
// ============================================
const togglePasswordBtn = document.getElementById('toggle-password');
if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
        const input = document.getElementById('password-input');
        const eyeIcon = togglePasswordBtn.querySelector('.eye-icon');
        if (input.type === 'password') {
            input.type = 'text';
            eyeIcon.classList.add('visible');
            togglePasswordBtn.setAttribute('aria-label', 'Passwort verbergen');
        } else {
            input.type = 'password';
            eyeIcon.classList.remove('visible');
            togglePasswordBtn.setAttribute('aria-label', 'Passwort anzeigen');
        }
    });
}

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
    document.addEventListener('mouseleave', endRubberBand);
    window.addEventListener('blur', endRubberBand);
}

// ============================================
// Drag-and-drop upload (admin + uploader roles)
// ============================================
function canUpload() {
    return !!currentUser && (currentUser.role === 'admin' || currentUser.role === 'uploader');
}

function isGalleryVisible() {
    return galleryScreen && !galleryScreen.classList.contains('hidden');
}

function formatUploadSize(bytes) {
    if (!bytes || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Upload queue state — survives folder navigation
const uploadQueue = new Map(); // id -> { file, targetPath, status, xhr, itemEl }
let uploadIdCounter = 0;
let dragDepth = 0; // track nested dragenter/dragleave correctly

function ensureUploadQueueVisible() {
    if (uploadQueueCard) uploadQueueCard.classList.remove('hidden');
}

function showDropOverlay() {
    if (!uploadDropOverlay) return;
    const label = currentPath && currentPath.length > 0 ? currentPath : 'Start';
    if (uploadDropTarget) uploadDropTarget.textContent = label;
    uploadDropOverlay.classList.remove('hidden');
}

function hideDropOverlay() {
    if (uploadDropOverlay) uploadDropOverlay.classList.add('hidden');
}

function createUploadItem(entry) {
    const li = document.createElement('li');
    li.className = 'upload-queue-item';
    li.dataset.uploadId = String(entry.id);

    const top = document.createElement('div');
    top.className = 'upload-queue-item-top';

    const name = document.createElement('span');
    name.className = 'upload-queue-item-name';
    name.textContent = entry.file.name;
    name.title = entry.file.name;

    const size = document.createElement('span');
    size.className = 'upload-queue-item-size';
    size.textContent = formatUploadSize(entry.file.size);

    top.appendChild(name);
    top.appendChild(size);

    const progress = document.createElement('div');
    progress.className = 'upload-queue-progress';
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', '0');
    progress.setAttribute('aria-label', `Upload-Fortschritt für ${entry.file.name}`);

    const fill = document.createElement('div');
    fill.className = 'upload-queue-progress-fill';
    progress.appendChild(fill);

    const bottom = document.createElement('div');
    bottom.className = 'upload-queue-item-bottom';

    const status = document.createElement('span');
    status.className = 'upload-queue-item-status';
    status.textContent = 'Upload läuft…';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'upload-queue-item-retry hidden';
    retryBtn.textContent = 'Erneut versuchen';
    retryBtn.setAttribute('aria-label', `Upload von ${entry.file.name} erneut versuchen`);
    retryBtn.addEventListener('click', () => retryUpload(entry.id));

    bottom.appendChild(status);
    bottom.appendChild(retryBtn);

    const target = document.createElement('div');
    target.className = 'upload-queue-item-target';
    const targetLabel = entry.targetPath && entry.targetPath.length > 0 ? entry.targetPath : 'Start';
    target.textContent = `Ziel: ${targetLabel}`;
    target.title = target.textContent;

    li.appendChild(top);
    li.appendChild(progress);
    li.appendChild(bottom);
    li.appendChild(target);

    entry.itemEl = li;
    entry.progressEl = progress;
    entry.progressFillEl = fill;
    entry.statusEl = status;
    entry.retryEl = retryBtn;

    return li;
}

function setUploadStatus(entry, text, state) {
    if (!entry || !entry.itemEl) return;
    entry.itemEl.classList.remove('success', 'error');
    if (state === 'success') entry.itemEl.classList.add('success');
    if (state === 'error') entry.itemEl.classList.add('error');
    if (entry.statusEl) entry.statusEl.textContent = text;
    if (entry.retryEl) {
        if (state === 'error') entry.retryEl.classList.remove('hidden');
        else entry.retryEl.classList.add('hidden');
    }
}

function startUpload(entry) {
    entry.status = 'uploading';
    setUploadStatus(entry, 'Upload läuft… 0%', 'uploading');
    if (entry.progressFillEl) entry.progressFillEl.style.width = '0%';
    if (entry.progressEl) entry.progressEl.setAttribute('aria-valuenow', '0');

    const formData = new FormData();
    formData.append('file', entry.file);
    formData.append('targetPath', entry.targetPath);

    const xhr = new XMLHttpRequest();
    entry.xhr = xhr;

    xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const percent = Math.round((e.loaded / e.total) * 100);
        if (entry.progressFillEl) entry.progressFillEl.style.width = percent + '%';
        if (entry.progressEl) entry.progressEl.setAttribute('aria-valuenow', String(percent));
        const loadedStr = formatUploadSize(e.loaded);
        const totalStr = formatUploadSize(e.total);
        if (entry.statusEl) entry.statusEl.textContent = `Upload läuft… ${percent}% (${loadedStr} / ${totalStr})`;
    });

    xhr.addEventListener('load', () => {
        entry.xhr = null;
        if (xhr.status >= 200 && xhr.status < 300) {
            entry.status = 'success';
            if (entry.progressFillEl) entry.progressFillEl.style.width = '100%';
            if (entry.progressEl) entry.progressEl.setAttribute('aria-valuenow', '100');
            setUploadStatus(entry, 'Fertig', 'success');
            onUploadSuccess(entry);
        } else {
            let message = 'Fehler beim Upload';
            try {
                const data = JSON.parse(xhr.responseText);
                if (data && data.error) message = data.error;
            } catch (_) { /* ignore */ }
            entry.status = 'error';
            setUploadStatus(entry, 'Fehler: ' + message, 'error');
        }
    });

    xhr.addEventListener('error', () => {
        entry.xhr = null;
        entry.status = 'error';
        setUploadStatus(entry, 'Fehler: Verbindungsfehler', 'error');
    });

    xhr.addEventListener('abort', () => {
        entry.xhr = null;
        entry.status = 'error';
        setUploadStatus(entry, 'Abgebrochen', 'error');
    });

    xhr.open('POST', '/api/admin/upload');
    xhr.send(formData);
}

function onUploadSuccess(entry) {
    // If user is still viewing the folder the file was uploaded into, refresh.
    if (isGalleryVisible() && currentPath === entry.targetPath) {
        loadImages(currentPath);
    }
}

function retryUpload(id) {
    const entry = uploadQueue.get(id);
    if (!entry) return;
    startUpload(entry);
}

function enqueueUpload(file, targetPath) {
    const id = ++uploadIdCounter;
    const entry = {
        id,
        file,
        targetPath: targetPath || '',
        status: 'queued',
        xhr: null,
        itemEl: null
    };
    uploadQueue.set(id, entry);
    const li = createUploadItem(entry);
    if (uploadQueueList) uploadQueueList.appendChild(li);
    ensureUploadQueueVisible();
    startUpload(entry);
}

function handleFiles(fileList) {
    if (!canUpload()) return;
    if (!fileList || fileList.length === 0) return;
    const target = currentPath || '';
    for (const file of fileList) {
        enqueueUpload(file, target);
    }
}

// Wire up the "+ Hochladen" button -> hidden file input
if (uploadBtn && uploadFileInput) {
    uploadBtn.addEventListener('click', () => {
        if (!canUpload()) return;
        uploadFileInput.value = '';
        uploadFileInput.click();
    });

    uploadFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFiles(files);
        }
        uploadFileInput.value = '';
    });
}

// Close / dismiss the upload queue card
if (uploadQueueClose && uploadQueueCard) {
    uploadQueueClose.addEventListener('click', () => {
        uploadQueueCard.classList.add('hidden');
        // Abort any in-flight uploads and drop finished entries
        for (const entry of uploadQueue.values()) {
            if (entry.xhr) {
                try { entry.xhr.abort(); } catch (_) { /* ignore */ }
            }
        }
        uploadQueue.clear();
        if (uploadQueueList) uploadQueueList.innerHTML = '';
    });
}

// Window-level drag & drop — guarded to only fire in the gallery view for uploaders
function dragEventHasFiles(e) {
    if (!e.dataTransfer) return false;
    const types = e.dataTransfer.types;
    if (!types) return false;
    // types is a DOMStringList or Array; external file drags always contain 'Files'
    // (Firefox may also expose 'application/x-moz-file').
    for (let i = 0; i < types.length; i++) {
        const t = types[i];
        if (t === 'Files' || t === 'application/x-moz-file') return true;
    }
    return false;
}

window.addEventListener('dragenter', (e) => {
    if (!canUpload() || !isGalleryVisible()) return;
    if (!dragEventHasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    showDropOverlay();
});

window.addEventListener('dragover', (e) => {
    if (!canUpload() || !isGalleryVisible()) return;
    if (!dragEventHasFiles(e)) return;
    // Must preventDefault on dragover at window level so browser doesn't
    // navigate to the file when dropped.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', (e) => {
    if (!canUpload() || !isGalleryVisible()) return;
    if (!dragEventHasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hideDropOverlay();
});

window.addEventListener('drop', (e) => {
    if (!canUpload() || !isGalleryVisible()) {
        // Still prevent the browser from navigating away if a stray file drop occurs
        if (dragEventHasFiles(e)) e.preventDefault();
        return;
    }
    if (!dragEventHasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    hideDropOverlay();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) handleFiles(files);
});

// Safety: if the drag is cancelled (e.g. dropped outside window), reset state
window.addEventListener('dragend', () => {
    dragDepth = 0;
    hideDropOverlay();
});

// ============================================
// Global search palette (command palette)
// ============================================
(function initGlobalSearch() {
    const palette = document.getElementById('search-palette');
    const paletteInput = document.getElementById('search-palette-input');
    const paletteResults = document.getElementById('search-palette-results');
    const paletteStatus = document.getElementById('search-palette-status');
    const paletteClose = document.getElementById('search-palette-close');
    const openBtn = document.getElementById('global-search-btn');

    if (!palette || !paletteInput || !paletteResults) return;

    // Active selection index within the flat list of result rows.
    // -1 means no row selected yet.
    let activeIndex = -1;
    // Current flat list of result entries used for keyboard navigation + Enter.
    // Each entry: { kind: 'file'|'faq', data: {...} }
    let currentEntries = [];
    // Latest request token to discard stale responses
    let requestToken = 0;

    function isPaletteOpen() {
        return !palette.classList.contains('hidden');
    }

    function openPalette() {
        if (isPaletteOpen()) return;
        palette.classList.remove('hidden');
        paletteInput.value = '';
        activeIndex = -1;
        currentEntries = [];
        renderHint();
        if (paletteStatus) paletteStatus.textContent = '';
        // Autofocus on next frame so animation starts cleanly
        requestAnimationFrame(() => {
            paletteInput.focus();
        });
    }

    function closePalette() {
        if (!isPaletteOpen()) return;
        palette.classList.add('hidden');
        paletteInput.value = '';
        paletteResults.innerHTML = '';
        activeIndex = -1;
        currentEntries = [];
        if (paletteStatus) paletteStatus.textContent = '';
    }

    function renderHint() {
        paletteResults.innerHTML = '';
        const hint = document.createElement('div');
        hint.className = 'search-palette-hint';
        hint.textContent = 'Geben Sie mindestens 2 Zeichen ein, um zu suchen.';
        paletteResults.appendChild(hint);
    }

    function renderLoading() {
        paletteResults.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'search-palette-loading';
        el.textContent = 'Suchen…';
        paletteResults.appendChild(el);
    }

    function renderEmpty(query) {
        paletteResults.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'search-palette-empty';
        el.textContent = `Keine Ergebnisse für „${query}“`;
        paletteResults.appendChild(el);
    }

    function renderError(message) {
        paletteResults.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'search-palette-error';
        el.textContent = message;
        paletteResults.appendChild(el);
    }

    function getFolderFromPath(filePath) {
        const idx = filePath.lastIndexOf('/');
        return idx >= 0 ? filePath.substring(0, idx) : '';
    }

    function fileIcon(type) {
        return type === 'video' ? '🎬' : '🖼';
    }

    function renderResults(data, query) {
        paletteResults.innerHTML = '';
        currentEntries = [];
        activeIndex = -1;

        const files = Array.isArray(data.files) ? data.files : [];
        const faq = Array.isArray(data.faq) ? data.faq : [];

        if (files.length === 0 && faq.length === 0) {
            renderEmpty(query);
            return;
        }

        // Files section
        if (files.length > 0) {
            const section = document.createElement('div');
            section.className = 'search-palette-section';

            const title = document.createElement('div');
            title.className = 'search-palette-section-title';
            title.textContent = `Dateien (${files.length})`;
            section.appendChild(title);

            files.forEach(file => {
                const entry = { kind: 'file', data: file };
                const row = buildResultRow({
                    icon: fileIcon(file.type),
                    name: file.name,
                    context: getFolderFromPath(file.path) || 'Start',
                    entry
                });
                section.appendChild(row);
                currentEntries.push({ ...entry, element: row });
            });

            paletteResults.appendChild(section);
        }

        // FAQ section
        if (faq.length > 0) {
            const section = document.createElement('div');
            section.className = 'search-palette-section';

            const title = document.createElement('div');
            title.className = 'search-palette-section-title';
            title.textContent = `FAQ (${faq.length})`;
            section.appendChild(title);

            faq.forEach(item => {
                const entry = { kind: 'faq', data: item };
                const row = buildResultRow({
                    icon: '❓',
                    name: item.question || '(ohne Titel)',
                    context: item.category ? `Kategorie: ${item.category}` : 'FAQ',
                    entry
                });
                section.appendChild(row);
                currentEntries.push({ ...entry, element: row });
            });

            paletteResults.appendChild(section);
        }

        // Select first row by default for immediate Enter-to-go
        if (currentEntries.length > 0) {
            setActiveIndex(0, false);
        }
    }

    function buildResultRow({ icon, name, context, entry }) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'search-palette-result';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', 'false');

        const iconEl = document.createElement('span');
        iconEl.className = 'search-palette-result-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = icon;
        row.appendChild(iconEl);

        const body = document.createElement('span');
        body.className = 'search-palette-result-body';

        const nameEl = document.createElement('span');
        nameEl.className = 'search-palette-result-name';
        nameEl.textContent = name;
        body.appendChild(nameEl);

        const ctxEl = document.createElement('span');
        ctxEl.className = 'search-palette-result-context';
        ctxEl.textContent = context;
        body.appendChild(ctxEl);

        row.appendChild(body);

        row.addEventListener('click', () => activate(entry));
        row.addEventListener('mouseenter', () => {
            const idx = currentEntries.findIndex(e => e.element === row);
            if (idx >= 0) setActiveIndex(idx, false);
        });

        return row;
    }

    function setActiveIndex(index, scrollIntoView) {
        if (currentEntries.length === 0) {
            activeIndex = -1;
            return;
        }
        if (index < 0) index = 0;
        if (index >= currentEntries.length) index = currentEntries.length - 1;
        activeIndex = index;

        currentEntries.forEach((e, i) => {
            if (i === activeIndex) {
                e.element.classList.add('is-active');
                e.element.setAttribute('aria-selected', 'true');
                if (scrollIntoView) {
                    e.element.scrollIntoView({ block: 'nearest' });
                }
            } else {
                e.element.classList.remove('is-active');
                e.element.setAttribute('aria-selected', 'false');
            }
        });
    }

    function activate(entry) {
        if (!entry) return;
        if (entry.kind === 'file') {
            const file = entry.data;
            const folder = getFolderFromPath(file.path);
            // Set hash so loadImages can open the preview once the folder loads
            try {
                history.replaceState(null, '', `#preview=${encodeURIComponent(file.path)}`);
            } catch {
                window.location.hash = `preview=${encodeURIComponent(file.path)}`;
            }
            closePalette();
            if (folder === currentPath) {
                // Already in the right folder — open preview immediately
                maybeOpenPendingPreview();
            } else {
                loadImages(folder);
            }
        } else if (entry.kind === 'faq') {
            const item = entry.data;
            closePalette();
            const id = item && item.id ? encodeURIComponent(item.id) : '';
            window.location.href = `/faq.html${id ? `?highlight=${id}` : ''}`;
        }
    }

    async function runSearch(query) {
        const token = ++requestToken;
        renderLoading();
        if (paletteStatus) paletteStatus.textContent = '…';

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);

            // Discard if newer query superseded this one
            if (token !== requestToken) return;

            if (!response.ok) {
                if (response.status === 401) {
                    renderError('Nicht authentifiziert. Bitte erneut anmelden.');
                } else if (response.status === 400) {
                    renderHint();
                } else {
                    renderError('Fehler bei der Suche');
                }
                if (paletteStatus) paletteStatus.textContent = '';
                return;
            }

            const data = await response.json();
            if (token !== requestToken) return;

            renderResults(data, query);
            if (paletteStatus) {
                const total = (data.files ? data.files.length : 0) + (data.faq ? data.faq.length : 0);
                paletteStatus.textContent = total > 0 ? `${total}` : '';
            }
        } catch (err) {
            if (token !== requestToken) return;
            log('Search error:', err);
            renderError('Fehler bei der Suche');
            if (paletteStatus) paletteStatus.textContent = '';
        }
    }

    const debouncedSearch = debounce((query) => {
        runSearch(query);
    }, 250);

    paletteInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (value.length < 2) {
            // Reset state — don't hit the server
            requestToken++; // invalidate any in-flight request
            currentEntries = [];
            activeIndex = -1;
            if (paletteStatus) paletteStatus.textContent = '';
            renderHint();
            return;
        }
        debouncedSearch(value);
    });

    // Keyboard navigation within the palette
    paletteInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closePalette();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentEntries.length > 0) {
                setActiveIndex(activeIndex + 1, true);
            }
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentEntries.length > 0) {
                setActiveIndex(activeIndex - 1, true);
            }
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && activeIndex < currentEntries.length) {
                activate(currentEntries[activeIndex]);
            }
            return;
        }
        if (e.key === 'Home' && currentEntries.length > 0) {
            e.preventDefault();
            setActiveIndex(0, true);
            return;
        }
        if (e.key === 'End' && currentEntries.length > 0) {
            e.preventDefault();
            setActiveIndex(currentEntries.length - 1, true);
            return;
        }
    });

    // Click on backdrop closes the palette
    palette.addEventListener('click', (e) => {
        if (e.target === palette) closePalette();
    });

    if (paletteClose) {
        paletteClose.addEventListener('click', () => closePalette());
    }

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            if (isPaletteOpen()) {
                closePalette();
            } else {
                openPalette();
            }
        });
    }

    // Determine whether an element swallows typing keys (so we don't steal `/`)
    function isTypingTarget(el) {
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function anyModalOpen() {
        if (previewModal && !previewModal.classList.contains('hidden')) return true;
        if (changePasswordModal && !changePasswordModal.classList.contains('hidden')) return true;
        if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) return true;
        return false;
    }

    // Global keyboard: `/` and Ctrl/Cmd+K open the palette
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd+K from anywhere (except while another modal is active)
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
            // Don't fight browsers' own chord in form fields that truly need it — but
            // for our app, Ctrl+K has no other meaning, so take it everywhere.
            if (isPaletteOpen()) {
                // Toggle off
                e.preventDefault();
                closePalette();
                return;
            }
            if (anyModalOpen()) return;
            e.preventDefault();
            openPalette();
            return;
        }

        // `/` only when not typing and no other modal is open
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (isPaletteOpen()) return; // let the input receive `/`
            if (isTypingTarget(e.target)) return;
            if (anyModalOpen()) return;
            e.preventDefault();
            openPalette();
        }
    });
})();
