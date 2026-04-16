(function () {
    'use strict';

    // Extract token from pathname: /share/:token
    function getToken() {
        const match = window.location.pathname.match(/^\/share\/([a-f0-9]{32})\/?$/i);
        return match ? match[1].toLowerCase() : null;
    }

    const token = getToken();

    const el = {
        title: document.getElementById('share-title'),
        loading: document.getElementById('share-loading'),
        errorView: document.getElementById('share-error'),
        errorTitle: document.getElementById('share-error-title'),
        errorMessage: document.getElementById('share-error-message'),
        fileView: document.getElementById('share-file-view'),
        fileName: document.getElementById('share-file-name'),
        image: document.getElementById('share-image'),
        video: document.getElementById('share-video'),
        folderView: document.getElementById('share-folder-view'),
        folderName: document.getElementById('share-folder-name'),
        folderCount: document.getElementById('share-folder-count'),
        grid: document.getElementById('share-grid'),
        folderEmpty: document.getElementById('share-folder-empty'),
        lightbox: document.getElementById('share-lightbox'),
        lightboxClose: document.getElementById('share-lightbox-close'),
        lightboxPrev: document.getElementById('share-lightbox-prev'),
        lightboxNext: document.getElementById('share-lightbox-next'),
        lightboxImage: document.getElementById('share-lightbox-image'),
        lightboxVideo: document.getElementById('share-lightbox-video'),
        lightboxCaption: document.getElementById('share-lightbox-caption')
    };

    let folderFiles = [];
    let lightboxIndex = -1;

    function showError(title, message) {
        el.loading.classList.add('hidden');
        el.fileView.classList.add('hidden');
        el.folderView.classList.add('hidden');
        el.errorTitle.textContent = title;
        el.errorMessage.textContent = message;
        el.errorView.classList.remove('hidden');
    }

    function mediaUrl(filename) {
        return `/api/share/${token}/media/${encodeURIComponent(filename)}`;
    }

    function renderFile(data) {
        el.loading.classList.add('hidden');
        el.fileName.textContent = data.displayName;
        document.title = `${data.displayName} - Einrad Bildergalerie`;

        const url = mediaUrl(data.displayName);

        if (data.type === 'video') {
            el.video.src = url;
            el.video.classList.remove('hidden');
            el.image.classList.add('hidden');
        } else {
            el.image.src = url;
            el.image.alt = data.displayName;
            el.image.classList.remove('hidden');
            el.video.classList.add('hidden');
        }

        el.fileView.classList.remove('hidden');
    }

    function renderFolder(data) {
        el.loading.classList.add('hidden');
        el.folderName.textContent = data.displayName;
        document.title = `${data.displayName} - Einrad Bildergalerie`;

        folderFiles = data.files || [];

        if (folderFiles.length === 0) {
            el.folderCount.textContent = '';
            el.folderEmpty.classList.remove('hidden');
            el.folderView.classList.remove('hidden');
            return;
        }

        el.folderCount.textContent = folderFiles.length === 1
            ? '1 Datei'
            : `${folderFiles.length} Dateien`;

        const fragment = document.createDocumentFragment();

        folderFiles.forEach((file, index) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'share-card';
            card.setAttribute('role', 'listitem');
            card.setAttribute('aria-label', `${file.name} öffnen`);

            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'share-thumb-wrapper';

            const url = mediaUrl(file.name);

            if (file.type === 'video') {
                const video = document.createElement('video');
                video.className = 'share-thumb';
                video.src = url;
                video.muted = true;
                video.preload = 'metadata';
                video.playsInline = true;
                thumbWrap.appendChild(video);

                const badge = document.createElement('span');
                badge.className = 'share-video-badge';
                badge.textContent = 'Video';
                thumbWrap.appendChild(badge);
            } else {
                const img = document.createElement('img');
                img.className = 'share-thumb';
                img.src = url;
                img.alt = file.name;
                img.loading = 'lazy';
                thumbWrap.appendChild(img);
            }

            const nameEl = document.createElement('div');
            nameEl.className = 'share-card-name';
            nameEl.textContent = file.name;
            nameEl.title = file.name;

            card.appendChild(thumbWrap);
            card.appendChild(nameEl);
            card.addEventListener('click', () => openLightbox(index));

            fragment.appendChild(card);
        });

        el.grid.appendChild(fragment);
        el.folderView.classList.remove('hidden');
    }

    function openLightbox(index) {
        if (index < 0 || index >= folderFiles.length) return;
        lightboxIndex = index;
        updateLightbox();

        el.lightbox.classList.remove('hidden');
        el.lightbox.classList.toggle('single-item', folderFiles.length <= 1);
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        el.lightbox.classList.add('hidden');
        document.body.style.overflow = '';

        // Stop any playing video
        el.lightboxVideo.pause();
        el.lightboxVideo.removeAttribute('src');
        el.lightboxVideo.load();
        el.lightboxImage.src = '';
    }

    function updateLightbox() {
        const file = folderFiles[lightboxIndex];
        if (!file) return;

        const url = mediaUrl(file.name);
        el.lightboxCaption.textContent = file.name;

        if (file.type === 'video') {
            el.lightboxImage.classList.add('hidden');
            el.lightboxImage.src = '';
            el.lightboxVideo.src = url;
            el.lightboxVideo.classList.remove('hidden');
        } else {
            el.lightboxVideo.pause();
            el.lightboxVideo.removeAttribute('src');
            el.lightboxVideo.load();
            el.lightboxVideo.classList.add('hidden');
            el.lightboxImage.src = url;
            el.lightboxImage.alt = file.name;
            el.lightboxImage.classList.remove('hidden');
        }
    }

    function showPrev() {
        if (folderFiles.length <= 1) return;
        lightboxIndex = (lightboxIndex - 1 + folderFiles.length) % folderFiles.length;
        updateLightbox();
    }

    function showNext() {
        if (folderFiles.length <= 1) return;
        lightboxIndex = (lightboxIndex + 1) % folderFiles.length;
        updateLightbox();
    }

    // Lightbox events
    el.lightboxClose.addEventListener('click', closeLightbox);
    el.lightboxPrev.addEventListener('click', showPrev);
    el.lightboxNext.addEventListener('click', showNext);
    el.lightbox.addEventListener('click', (e) => {
        // Click on backdrop closes
        if (e.target === el.lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
        if (el.lightbox.classList.contains('hidden')) return;
        if (e.key === 'Escape') closeLightbox();
        else if (e.key === 'ArrowLeft') showPrev();
        else if (e.key === 'ArrowRight') showNext();
    });

    // Fetch and render
    async function loadShare() {
        if (!token) {
            showError('Share-Link nicht gefunden', 'Der Link ist ungültig.');
            return;
        }

        try {
            const response = await fetch(`/api/share/${token}/data`);

            if (response.status === 410) {
                showError('Link abgelaufen', 'Dieser Share-Link ist abgelaufen und kann nicht mehr verwendet werden.');
                return;
            }

            if (response.status === 404) {
                showError('Link nicht gefunden', 'Dieser Share-Link existiert nicht oder wurde widerrufen.');
                return;
            }

            if (!response.ok) {
                showError('Fehler', 'Der Share-Link konnte nicht geladen werden.');
                return;
            }

            const data = await response.json();

            if (data.kind === 'file') {
                renderFile(data);
            } else if (data.kind === 'folder') {
                renderFolder(data);
            } else {
                showError('Fehler', 'Unbekannter Share-Typ.');
            }
        } catch (err) {
            console.error('Share load error:', err);
            showError('Fehler', 'Der Share-Link konnte nicht geladen werden. Bitte versuchen Sie es später erneut.');
        }
    }

    loadShare();
})();
