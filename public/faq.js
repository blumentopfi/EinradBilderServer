// DOM Elements
const faqUserInfo = document.getElementById('faq-user-info');
const faqUserMenuBtn = document.getElementById('faq-user-menu-btn');
const faqUserDropdown = document.getElementById('faq-user-dropdown');
const backToGalleryBtn = document.getElementById('back-to-gallery-btn');
const faqGameBtn = document.getElementById('faq-game-btn');
const adminNavBtn = document.getElementById('admin-nav-btn');
const faqChangePasswordBtn = document.getElementById('faq-change-password-btn');
const faqLogoutBtn = document.getElementById('faq-logout-btn');
const createFaqBtn = document.getElementById('create-faq-btn');
const faqLoading = document.getElementById('faq-loading');
const faqError = document.getElementById('faq-error');
const faqList = document.getElementById('faq-list');
const noFaq = document.getElementById('no-faq');

const faqModal = document.getElementById('faq-modal');
const faqForm = document.getElementById('faq-form');
const confirmModal = document.getElementById('confirm-modal');

let currentUser = null;
let allFaqItems = [];
let editingFaqId = null;

// Initialize
checkAuth();

async function checkAuth() {
    try {
        const response = await fetch('/check-auth');
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/';
            return;
        }

        currentUser = data.user;
        faqUserInfo.textContent = `Angemeldet als: ${currentUser.displayName}`;

        // Show create button only for admins
        if (currentUser.role === 'admin') {
            createFaqBtn.classList.remove('hidden');
        }

        // Show admin button for admins and uploaders
        if (currentUser.role === 'admin' || currentUser.role === 'uploader') {
            adminNavBtn.classList.remove('hidden');
        }

        loadFaqItems();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/';
    }
}

function getRoleName(role) {
    const roles = {
        admin: 'Administrator',
        uploader: 'Uploader',
        user: 'Benutzer'
    };
    return roles[role] || role;
}

// Navigation
backToGalleryBtn.addEventListener('click', () => {
    window.location.href = '/';
});

faqGameBtn.addEventListener('click', () => {
    window.location.href = '/game.html';
});

adminNavBtn.addEventListener('click', () => {
    window.location.href = '/admin.html';
});

// User menu dropdown handling
faqUserMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    faqUserDropdown.classList.toggle('hidden');
    faqUserMenuBtn.classList.toggle('active');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!faqUserMenuBtn.contains(e.target) && !faqUserDropdown.contains(e.target)) {
        faqUserDropdown.classList.add('hidden');
        faqUserMenuBtn.classList.remove('active');
    }
});

faqChangePasswordBtn.addEventListener('click', () => {
    window.location.href = '/?changePassword=true';
});

faqLogoutBtn.addEventListener('click', async () => {
    try {
        await fetch('/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// Load FAQ items
async function loadFaqItems() {
    faqLoading.classList.remove('hidden');
    faqError.textContent = '';

    try {
        const response = await fetch('/api/faq');
        const data = await response.json();

        if (response.ok) {
            allFaqItems = data.items;
            renderFaqItems();
        } else {
            faqError.textContent = data.error || 'Fehler beim Laden';
        }
    } catch (error) {
        console.error('Load FAQ error:', error);
        faqError.textContent = 'Verbindungsfehler';
    } finally {
        faqLoading.classList.add('hidden');
    }
}

function renderFaqItems() {
    faqList.innerHTML = '';

    if (allFaqItems.length === 0) {
        noFaq.classList.remove('hidden');
        return;
    }

    noFaq.classList.add('hidden');

    // Group by category
    const grouped = {};
    allFaqItems.forEach(item => {
        const category = item.category || 'Allgemein';
        if (!grouped[category]) {
            grouped[category] = [];
        }
        grouped[category].push(item);
    });

    // Render each category
    Object.keys(grouped).sort().forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'faq-category';

        const categoryTitle = document.createElement('h2');
        categoryTitle.className = 'faq-category-title';
        categoryTitle.textContent = category;
        categoryDiv.appendChild(categoryTitle);

        grouped[category].forEach(item => {
            const itemDiv = createFaqItemElement(item);
            categoryDiv.appendChild(itemDiv);
        });

        faqList.appendChild(categoryDiv);
    });
}

function createFaqItemElement(item) {
    const div = document.createElement('div');
    div.className = 'faq-item';

    const header = document.createElement('div');
    header.className = 'faq-item-header';

    const question = document.createElement('h3');
    question.className = 'faq-question';
    question.textContent = item.question;
    header.appendChild(question);

    // Add edit/delete buttons for admins
    if (currentUser && currentUser.role === 'admin') {
        const actions = document.createElement('div');
        actions.className = 'faq-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'faq-action-btn edit';
        editBtn.textContent = 'Bearbeiten';
        editBtn.addEventListener('click', () => editFaqItem(item.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'faq-action-btn delete';
        deleteBtn.textContent = 'Löschen';
        deleteBtn.addEventListener('click', () => deleteFaqItem(item.id));

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        header.appendChild(actions);
    }

    div.appendChild(header);

    const answer = document.createElement('p');
    answer.className = 'faq-answer';
    answer.innerHTML = linkifyText(item.answer);
    div.appendChild(answer);

    return div;
}

// Create/Edit FAQ
createFaqBtn.addEventListener('click', () => {
    editingFaqId = null;
    document.getElementById('faq-modal-title').textContent = 'Neue Frage';
    faqForm.reset();
    openModal(faqModal);
});

function editFaqItem(itemId) {
    const item = allFaqItems.find(i => i.id === itemId);
    if (!item) return;

    editingFaqId = itemId;
    document.getElementById('faq-modal-title').textContent = 'Frage bearbeiten';
    document.getElementById('faq-question').value = item.question;
    document.getElementById('faq-answer').value = item.answer;
    document.getElementById('faq-category').value = item.category || '';
    document.getElementById('faq-order').value = item.display_order || 0;

    openModal(faqModal);
}

faqForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const question = document.getElementById('faq-question').value.trim();
    const answer = document.getElementById('faq-answer').value.trim();
    const category = document.getElementById('faq-category').value.trim() || null;
    const displayOrder = parseInt(document.getElementById('faq-order').value) || 0;

    try {
        let response;

        if (editingFaqId) {
            // Update existing
            response = await fetch(`/api/faq/${editingFaqId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answer, category, displayOrder })
            });
        } else {
            // Create new
            response = await fetch('/api/faq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answer, category, displayOrder })
            });
        }

        const data = await response.json();

        if (response.ok) {
            closeModal(faqModal);
            loadFaqItems();
            showSuccess(editingFaqId ? 'FAQ-Eintrag aktualisiert' : 'FAQ-Eintrag erstellt');
        } else {
            alert(data.error || 'Fehler beim Speichern');
        }
    } catch (error) {
        console.error('Save FAQ error:', error);
        alert('Verbindungsfehler');
    }
});

function deleteFaqItem(itemId) {
    const item = allFaqItems.find(i => i.id === itemId);
    if (!item) return;

    showConfirm(
        'FAQ-Eintrag löschen',
        `Möchten Sie die Frage "${item.question}" wirklich löschen?`,
        async () => {
            try {
                const response = await fetch(`/api/faq/${itemId}`, {
                    method: 'DELETE'
                });

                const data = await response.json();

                if (response.ok) {
                    loadFaqItems();
                    showSuccess('FAQ-Eintrag gelöscht');
                } else {
                    alert(data.error || 'Fehler beim Löschen');
                }
            } catch (error) {
                console.error('Delete FAQ error:', error);
                alert('Verbindungsfehler');
            }
        }
    );
}

// Modal helpers
function openModal(modal) {
    modal.classList.remove('hidden');
}

function closeModal(modal) {
    modal.classList.add('hidden');
}

// Close modal buttons
document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modalId = e.target.dataset.modal;
        if (modalId) {
            closeModal(document.getElementById(modalId));
        } else {
            closeModal(faqModal);
        }
    });
});

// Confirmation modal
function showConfirm(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;

    const confirmOk = document.getElementById('confirm-ok');
    const confirmCancel = document.getElementById('confirm-cancel');

    const newConfirmOk = confirmOk.cloneNode(true);
    confirmOk.parentNode.replaceChild(newConfirmOk, confirmOk);

    newConfirmOk.addEventListener('click', () => {
        closeModal(confirmModal);
        onConfirm();
    });

    confirmCancel.onclick = () => closeModal(confirmModal);

    openModal(confirmModal);
}

function showSuccess(message) {
    const temp = document.createElement('div');
    temp.style.cssText = 'position:fixed;top:20px;right:20px;background:#4caf50;color:white;padding:15px 20px;border-radius:4px;z-index:10000;';
    temp.textContent = message;
    document.body.appendChild(temp);

    setTimeout(() => temp.remove(), 3000);
}

// Escape HTML helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Convert URLs in text to clickable links
function linkifyText(text) {
    // First escape HTML to prevent XSS
    const escaped = escapeHtml(text);

    // Regex to match URLs
    const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

    // Replace URLs with anchor tags
    return escaped.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}
