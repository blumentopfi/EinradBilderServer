// DOM Elements
const faqUserInfo = document.getElementById('faq-user-info');
const faqUserMenuBtn = document.getElementById('faq-user-menu-btn');
const faqUserDropdown = document.getElementById('faq-user-dropdown');
const backToGalleryBtn = document.getElementById('back-to-gallery-btn');
const adminNavBtn = document.getElementById('admin-nav-btn');
const faqChangePasswordBtn = document.getElementById('faq-change-password-btn');
const faqLogoutBtn = document.getElementById('faq-logout-btn');
const createFaqBtn = document.getElementById('create-faq-btn');
const faqLoading = document.getElementById('faq-loading');
const faqError = document.getElementById('faq-error');
const faqList = document.getElementById('faq-list');
const noFaq = document.getElementById('no-faq');
const faqNoResults = document.getElementById('faq-no-results');
const faqSearchInput = document.getElementById('faq-search-input');
const faqSearchClear = document.getElementById('faq-search-clear');
const faqCategories = document.getElementById('faq-categories');

const faqModal = document.getElementById('faq-modal');
const faqForm = document.getElementById('faq-form');
const confirmModal = document.getElementById('confirm-modal');

let currentUser = null;
let allFaqItems = [];
let editingFaqId = null;

// Filter state
let currentSearchQuery = '';
let currentCategoryFilter = 'all';
let expandedFaqIds = new Set();
let searchDebounceTimer = null;
let firstRenderDone = false;
const FAQ_DEFAULT_CATEGORY = 'Allgemein';

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
    faqNoResults.classList.add('hidden');

    if (allFaqItems.length === 0) {
        noFaq.classList.remove('hidden');
        faqCategories.classList.add('hidden');
        return;
    }

    noFaq.classList.add('hidden');

    // Open first item by default on very first render (only if no search/filter active)
    if (!firstRenderDone) {
        if (allFaqItems.length > 0) {
            expandedFaqIds.add(allFaqItems[0].id);
        }
        firstRenderDone = true;
    }

    // Render category tabs
    renderCategoryTabs();

    // Apply search + category filters
    applyFilters();
}

function getUniqueCategories() {
    const set = new Set();
    allFaqItems.forEach(item => {
        if (item.category && item.category.trim() !== '') {
            set.add(item.category.trim());
        }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
}

function renderCategoryTabs() {
    const categories = getUniqueCategories();

    // Hide tabs row entirely if there are zero categories
    if (categories.length === 0) {
        faqCategories.classList.add('hidden');
        faqCategories.innerHTML = '';
        return;
    }

    faqCategories.classList.remove('hidden');
    faqCategories.innerHTML = '';

    // Reset filter if current selection no longer exists
    if (currentCategoryFilter !== 'all' && !categories.includes(currentCategoryFilter)) {
        currentCategoryFilter = 'all';
    }

    const tabs = [
        { value: 'all', label: 'Alle' },
        ...categories.map(c => ({ value: c, label: c }))
    ];

    tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'faq-tab';
        btn.textContent = tab.label;
        btn.setAttribute('role', 'tab');
        btn.dataset.category = tab.value;
        const isActive = currentCategoryFilter === tab.value;
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive) btn.classList.add('active');
        btn.addEventListener('click', () => {
            currentCategoryFilter = tab.value;
            // Update active state
            faqCategories.querySelectorAll('.faq-tab').forEach(t => {
                const active = t.dataset.category === currentCategoryFilter;
                t.classList.toggle('active', active);
                t.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            applyFilters();
        });
        faqCategories.appendChild(btn);
    });
}

function matchesSearch(item, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const question = (item.question || '').toLowerCase();
    const answer = (item.answer || '').toLowerCase();
    const category = (item.category || '').toLowerCase();
    return question.includes(q) || answer.includes(q) || category.includes(q);
}

function matchesCategory(item) {
    if (currentCategoryFilter === 'all') return true;
    return (item.category || '') === currentCategoryFilter;
}

function applyFilters() {
    faqList.innerHTML = '';

    const filtered = allFaqItems.filter(item =>
        matchesCategory(item) && matchesSearch(item, currentSearchQuery)
    );

    if (filtered.length === 0) {
        faqNoResults.classList.remove('hidden');
        return;
    }

    faqNoResults.classList.add('hidden');

    // Group filtered items by category
    const grouped = {};
    filtered.forEach(item => {
        const category = (item.category && item.category.trim() !== '')
            ? item.category
            : FAQ_DEFAULT_CATEGORY;
        if (!grouped[category]) {
            grouped[category] = [];
        }
        grouped[category].push(item);
    });

    Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'de')).forEach(category => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'faq-category';

        // Only show category heading when "Alle" is selected and there are multiple categories
        const uniqueCats = getUniqueCategories();
        if (currentCategoryFilter === 'all' && uniqueCats.length > 0) {
            const categoryTitle = document.createElement('h2');
            categoryTitle.className = 'faq-category-title';
            categoryTitle.textContent = category;
            categoryDiv.appendChild(categoryTitle);
        }

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
    const answerId = `faq-answer-${item.id}`;
    const isExpanded = expandedFaqIds.has(item.id);
    if (isExpanded) div.classList.add('expanded');

    const header = document.createElement('div');
    header.className = 'faq-item-header';

    // Question as a button for accessibility
    const questionBtn = document.createElement('button');
    questionBtn.type = 'button';
    questionBtn.className = 'faq-question-btn';
    questionBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    questionBtn.setAttribute('aria-controls', answerId);

    const question = document.createElement('span');
    question.className = 'faq-question';
    question.textContent = item.question;
    questionBtn.appendChild(question);

    const chevron = document.createElement('span');
    chevron.className = 'faq-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▼';
    questionBtn.appendChild(chevron);

    questionBtn.addEventListener('click', () => toggleFaqItem(item.id, div, questionBtn));
    // Enter/Space are handled natively on <button>, but keep for safety
    questionBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleFaqItem(item.id, div, questionBtn);
        }
    });

    header.appendChild(questionBtn);
    div.appendChild(header);

    // Answer wrapper (for smooth grid animation)
    const wrapper = document.createElement('div');
    wrapper.className = 'faq-answer-wrapper';

    const inner = document.createElement('div');
    inner.className = 'faq-answer-inner';

    const answer = document.createElement('div');
    answer.className = 'faq-answer';
    answer.id = answerId;
    answer.innerHTML = renderMarkdown(item.answer);

    inner.appendChild(answer);

    // Voting row — inside the collapsible area so it animates with the answer
    const voteRow = createVoteRow(item);
    inner.appendChild(voteRow);

    // Admin edit/delete buttons — moved into the collapsible area to keep
    // collapsed cards uncluttered.
    if (currentUser && currentUser.role === 'admin') {
        const actions = document.createElement('div');
        actions.className = 'faq-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'faq-action-btn edit';
        editBtn.textContent = 'Bearbeiten';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editFaqItem(item.id);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'faq-action-btn delete';
        deleteBtn.textContent = 'Löschen';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFaqItem(item.id);
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        inner.appendChild(actions);
    }

    wrapper.appendChild(inner);
    div.appendChild(wrapper);

    return div;
}

function toggleFaqItem(itemId, itemDiv, btn) {
    const isExpanded = itemDiv.classList.toggle('expanded');
    if (isExpanded) {
        expandedFaqIds.add(itemId);
    } else {
        expandedFaqIds.delete(itemId);
    }
    btn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
}

// Search handling (debounced ~200ms)
if (faqSearchInput) {
    faqSearchInput.addEventListener('input', () => {
        const val = faqSearchInput.value;
        if (val.length > 0) {
            faqSearchClear.classList.remove('hidden');
        } else {
            faqSearchClear.classList.add('hidden');
        }
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            currentSearchQuery = val.trim();
            applyFilters();
        }, 200);
    });
}

if (faqSearchClear) {
    faqSearchClear.addEventListener('click', () => {
        faqSearchInput.value = '';
        currentSearchQuery = '';
        faqSearchClear.classList.add('hidden');
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        applyFilters();
        faqSearchInput.focus();
    });
}

function createVoteRow(item) {
    const row = document.createElement('div');
    row.className = 'faq-vote-row';
    row.dataset.itemId = item.id;

    const label = document.createElement('span');
    label.className = 'faq-vote-label';
    label.textContent = 'War diese Antwort hilfreich?';
    row.appendChild(label);

    const buttons = document.createElement('div');
    buttons.className = 'faq-vote-buttons';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'faq-vote-btn faq-vote-up';
    upBtn.dataset.voteType = 'up';
    upBtn.innerHTML = `<span class="faq-vote-icon">👍</span> <span class="faq-vote-count">${item.upvotes || 0}</span>`;
    applyVoteButtonState(upBtn, item.userVote || 0, 1);
    upBtn.addEventListener('click', () => handleVote(item.id, 1));

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'faq-vote-btn faq-vote-down';
    downBtn.dataset.voteType = 'down';
    downBtn.innerHTML = `<span class="faq-vote-icon">👎</span> <span class="faq-vote-count">${item.downvotes || 0}</span>`;
    applyVoteButtonState(downBtn, item.userVote || 0, -1);
    downBtn.addEventListener('click', () => handleVote(item.id, -1));

    buttons.appendChild(upBtn);
    buttons.appendChild(downBtn);
    row.appendChild(buttons);

    const errorEl = document.createElement('span');
    errorEl.className = 'faq-vote-error hidden';
    errorEl.setAttribute('role', 'alert');
    row.appendChild(errorEl);

    return row;
}

function applyVoteButtonState(btn, userVote, buttonVote) {
    const isActive = userVote === buttonVote;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

    if (buttonVote === 1) {
        btn.setAttribute('aria-label', isActive ? 'Hilfreich (aktiviert)' : 'Hilfreich markieren');
    } else {
        btn.setAttribute('aria-label', isActive ? 'Nicht hilfreich (aktiviert)' : 'Nicht hilfreich markieren');
    }
}

async function handleVote(itemId, clickedVote) {
    const item = allFaqItems.find(i => i.id === itemId);
    if (!item) return;

    const row = faqList.querySelector(`.faq-vote-row[data-item-id="${itemId}"]`);
    if (!row) return;

    const upBtn = row.querySelector('.faq-vote-up');
    const downBtn = row.querySelector('.faq-vote-down');
    const upCountEl = upBtn.querySelector('.faq-vote-count');
    const downCountEl = downBtn.querySelector('.faq-vote-count');
    const errorEl = row.querySelector('.faq-vote-error');

    // If user clicks their active vote, send 0 (remove); else send clickedVote
    const prevUserVote = item.userVote || 0;
    const prevUp = item.upvotes || 0;
    const prevDown = item.downvotes || 0;

    const newVote = prevUserVote === clickedVote ? 0 : clickedVote;

    // Optimistic counts
    let optimisticUp = prevUp;
    let optimisticDown = prevDown;

    // Undo previous vote
    if (prevUserVote === 1) optimisticUp = Math.max(0, optimisticUp - 1);
    if (prevUserVote === -1) optimisticDown = Math.max(0, optimisticDown - 1);
    // Apply new vote
    if (newVote === 1) optimisticUp += 1;
    if (newVote === -1) optimisticDown += 1;

    // Apply optimistic UI
    item.userVote = newVote;
    item.upvotes = optimisticUp;
    item.downvotes = optimisticDown;
    upCountEl.textContent = optimisticUp;
    downCountEl.textContent = optimisticDown;
    applyVoteButtonState(upBtn, newVote, 1);
    applyVoteButtonState(downBtn, newVote, -1);
    errorEl.classList.add('hidden');
    errorEl.textContent = '';

    upBtn.disabled = true;
    downBtn.disabled = true;

    try {
        const response = await fetch(`/api/faq/${itemId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vote: newVote })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Server is source of truth
            item.upvotes = typeof data.upvotes === 'number' ? data.upvotes : item.upvotes;
            item.downvotes = typeof data.downvotes === 'number' ? data.downvotes : item.downvotes;
            item.userVote = typeof data.userVote === 'number' ? data.userVote : item.userVote;

            upCountEl.textContent = item.upvotes;
            downCountEl.textContent = item.downvotes;
            applyVoteButtonState(upBtn, item.userVote, 1);
            applyVoteButtonState(downBtn, item.userVote, -1);
        } else {
            throw new Error(data.error || 'Fehler beim Abstimmen');
        }
    } catch (error) {
        console.error('Vote error:', error);
        // Revert optimistic update
        item.userVote = prevUserVote;
        item.upvotes = prevUp;
        item.downvotes = prevDown;
        upCountEl.textContent = prevUp;
        downCountEl.textContent = prevDown;
        applyVoteButtonState(upBtn, prevUserVote, 1);
        applyVoteButtonState(downBtn, prevUserVote, -1);

        errorEl.textContent = error.message || 'Verbindungsfehler';
        errorEl.classList.remove('hidden');

        setTimeout(() => {
            errorEl.classList.add('hidden');
            errorEl.textContent = '';
        }, 4000);
    } finally {
        upBtn.disabled = false;
        downBtn.disabled = false;
    }
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

// Validate that a URL is safe (only http/https; rejects javascript:, data:, etc.)
function isSafeUrl(url) {
    const trimmed = String(url).trim();
    // Disallow control characters (including newlines, tabs) in URLs
    if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false;
    // Must start with http:// or https:// (case-insensitive)
    return /^https?:\/\//i.test(trimmed);
}

// Render a restricted, safe subset of Markdown to HTML.
// Strategy: HTML-escape ALL input first, then operate on the escaped string.
// Because raw user input can never produce raw "<" or ">" after escaping,
// every "<"/">" we introduce later is guaranteed to be structural HTML we
// produced ourselves — making this safe against XSS (including payloads like
// "<script>alert(1)</script>", which become literal "&lt;script&gt;..." text).
//
// Supported:
//   **bold**, *italic*, `code`
//   [text](url)  -- only http/https URLs; other schemes are rendered as text
//   - / * list items  (unordered)
//   1. 2. 3. list items  (ordered)
//   ---  horizontal rule (alone on line)
//   ## / ###  headings
//   blank line = paragraph break, single newline inside paragraph = <br>
function renderMarkdown(text) {
    if (text === null || text === undefined) return '';
    const src = String(text);

    // STEP 1: HTML-escape everything. From here on we only operate on the
    // escaped string, so user input can never produce a raw tag.
    let escaped = escapeHtml(src);

    // STEP 2: Extract inline code spans (`code`) first so their contents
    // don't get further parsed for bold/italic/links. Replace with placeholders.
    const codeSpans = [];
    escaped = escaped.replace(/`([^`\n]+)`/g, (_m, code) => {
        codeSpans.push(code);
        return `\u0000CODE${codeSpans.length - 1}\u0000`;
    });

    // STEP 3: Split into lines for block-level parsing.
    // Normalize line endings.
    const lines = escaped.replace(/\r\n?/g, '\n').split('\n');

    const out = [];
    let i = 0;

    // Helper: apply inline transformations (bold, italic, links) to a line.
    // Runs AFTER HTML-escaping, so matches only against safe text.
    function renderInline(line) {
        let s = line;

        // Links: [text](url) — escaped chars in URL are fine; we validate scheme.
        // The URL may contain characters like "&amp;" (from escaping "&") which
        // is fine because we're inserting it back as an attribute value where
        // "&amp;" is the correct representation.
        s = s.replace(/\[([^\]\n]+)\]\(([^)\n\s]+)\)/g, (match, linkText, rawUrl) => {
            // rawUrl is already HTML-escaped (step 1), so it is safe to insert
            // directly as an attribute value (contained " would already be
            // &quot;, & would already be &amp;, etc.). Do NOT re-escape.
            // Scheme check doesn't need unescaping — "http"/"https" don't contain
            // any escapable characters.
            if (!isSafeUrl(rawUrl)) {
                // Unsafe scheme — render the original (escaped) markdown as text.
                return match;
            }
            // linkText was already escaped in step 1.
            return `<a href="${rawUrl}" rel="noopener noreferrer" target="_blank">${linkText}</a>`;
        });

        // Bold: **text**  (non-greedy, must not span empty)
        s = s.replace(/\*\*([^\*\n]+?)\*\*/g, '<strong>$1</strong>');

        // Italic: *text*  (single star; avoid matching leftover ** by requiring
        // non-star on both sides of the content).
        s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

        return s;
    }

    function flushInlineLine(line) {
        return renderInline(line);
    }

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Blank line — skip
        if (trimmed === '') {
            i++;
            continue;
        }

        // Horizontal rule: exactly --- (or more dashes) on its own line
        if (/^-{3,}$/.test(trimmed)) {
            out.push('<hr>');
            i++;
            continue;
        }

        // Heading: ### or ## (not single #)
        let m = /^(#{2,3})\s+(.+)$/.exec(trimmed);
        if (m) {
            const level = m[1].length; // 2 or 3
            out.push(`<h${level}>${renderInline(m[2])}</h${level}>`);
            i++;
            continue;
        }

        // Unordered list: consecutive lines starting with "- " or "* "
        if (/^[-*]\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
                const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
                items.push(`<li>${renderInline(itemText)}</li>`);
                i++;
            }
            out.push(`<ul>${items.join('')}</ul>`);
            continue;
        }

        // Ordered list: consecutive lines starting with "N. "
        if (/^\d+\.\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
                const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
                items.push(`<li>${renderInline(itemText)}</li>`);
                i++;
            }
            out.push(`<ol>${items.join('')}</ol>`);
            continue;
        }

        // Paragraph: gather consecutive non-blank, non-block lines.
        // Single newline inside a paragraph becomes <br>.
        const paraLines = [];
        while (i < lines.length) {
            const l = lines[i];
            const t = l.trim();
            if (t === '') break;
            if (/^-{3,}$/.test(t)) break;
            if (/^(#{2,3})\s+/.test(t)) break;
            if (/^[-*]\s+/.test(t)) break;
            if (/^\d+\.\s+/.test(t)) break;
            paraLines.push(flushInlineLine(l));
            i++;
        }
        out.push(`<p>${paraLines.join('<br>')}</p>`);
    }

    let html = out.join('');

    // STEP 4: Restore code spans (escape their contents - they were already
    // escaped in step 1, so we can insert them as-is).
    html = html.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx) => {
        const code = codeSpans[Number(idx)];
        return `<code>${code}</code>`;
    });

    return html;
}
