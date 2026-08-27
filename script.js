/* KIRIN READER ADDON PACK v2 */
        document.getElementById('currentYear').innerText = new Date().getFullYear();

        const fileInput = document.getElementById('fileInput');
        const status = document.getElementById('status');
        const viewer = document.getElementById('viewer');
        const setup = document.getElementById('setup');
        const header = document.getElementById('mainHeader');
        const topControls = document.getElementById('topControls');
        const pageCounter = document.getElementById('pageCounter');

        const modeListBtn = document.getElementById('modeListBtn');
        const modeBookBtn = document.getElementById('modeBookBtn');
        const navPrev = document.getElementById('navPrev');
        const navNext = document.getElementById('navNext');
        const zoomIn = document.getElementById('zoomIn');
        const zoomOut = document.getElementById('zoomOut');

        const recentContainer = document.getElementById('recentContainer');
        const recentList = document.getElementById('recentList');
        const clearAllBtn = document.getElementById('clearAllBtn');
        const recentCount = document.getElementById('recentCount');
        const historyCount = document.getElementById('historyCount');
        const clearLinkHistoryBtn = document.getElementById('clearLinkHistoryBtn');
        const recentTabBtn = document.getElementById('recentTabBtn');
        const historyTabBtn = document.getElementById('historyTabBtn');
        const librarySlidePrev = document.getElementById('librarySlidePrev');
        const librarySlideNext = document.getElementById('librarySlideNext');
        const libraryActiveClear = document.getElementById('libraryActiveClear');
        let activeLibraryTab = 'recent';

        const thumbBtn = document.getElementById('thumbBtn');
        const toolsBtn = document.getElementById('toolsBtn');
        const openNewBtn = document.getElementById('openNewBtn');
        const toolsPanel = document.getElementById('toolsPanel');
        const thumbPanel = document.getElementById('thumbPanel');
        const toolsClose = document.getElementById('toolsClose');
        const thumbClose = document.getElementById('thumbClose');
        const thumbGrid = document.getElementById('thumbGrid');

        const readerProgress = document.getElementById('readerProgress');
        const readerProgressFill = document.getElementById('readerProgressFill');
        const readerToastWrap = document.getElementById('readerToastWrap');
        const globalDropOverlay = document.getElementById('globalDropOverlay');
        const autoScrollBadge = document.getElementById('autoScrollBadge');

        const dirRtlBtn = document.getElementById('dirRtlBtn');
        const dirLtrBtn = document.getElementById('dirLtrBtn');
        const singlePageBtn = document.getElementById('singlePageBtn');
        const doublePageBtn = document.getElementById('doublePageBtn');
        const widthRange = document.getElementById('widthRange');
        const widthValue = document.getElementById('widthValue');
        const brightnessRange = document.getElementById('brightnessRange');
        const brightnessValue = document.getElementById('brightnessValue');
        const autoSpeedRange = document.getElementById('autoSpeedRange');
        const autoSpeedValue = document.getElementById('autoSpeedValue');
        const autoScrollBtn = document.getElementById('autoScrollBtn');
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const jumpInput = document.getElementById('jumpInput');
        const jumpBtn = document.getElementById('jumpBtn');
        const fileInfoBox = document.getElementById('fileInfoBox');
        const resetSettingsBtn = document.getElementById('resetSettingsBtn');

        const RECENT_KEY = 'kirin_recents_v2';
        const PROGRESS_KEY = 'kirin_progress_v2';
        const PREFS_KEY = 'kirin_reader_prefs_v2';
        const DB_NAME = 'KirinReaderLibrary';
        const DB_STORE = 'files';

        let currentMode = 'list';
        let totalPages = 0;
        let activePageIndex = 0;
        let currentWidth = 900;
        let activeFile = null;
        let activeFileKey = '';
        let timerInterval = null;
        let readingDirection = 'rtl';
        let doublePage = false;
        let brightness = 100;
        let readerBg = '#000000';
        let autoScrollSpeed = 70;
        let autoScrollRunning = false;
        let autoScrollFrame = 0;
        let autoScrollLastTime = 0;
        let objectUrls = [];
        let scrollRafPending = false;
        let progressSaveTimer = 0;

        loadPrefs();
        applyPrefsToUI();
        loadRecentReads();
        startTimerInterval();

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function toast(message) {
            const el = document.createElement('div');
            el.className = 'reader-toast';
            el.textContent = message;
            readerToastWrap.appendChild(el);
            setTimeout(() => el.remove(), 2600);
        }

        function formatBytes(bytes) {
            if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
            const units = ['B','KB','MB','GB'];
            const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
            return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
        }

        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function makeFileKey(file) {
            return `${file.name}::${file.size || 0}::${file.lastModified || 0}`;
        }

        function cleanupObjectUrls() {
            objectUrls.forEach(url => {
                try { URL.revokeObjectURL(url); } catch (_) {}
            });
            objectUrls = [];
        }

        /* IndexedDB: simpan CBZ/ZIP supaya Recent Read boleh dibuka semula */
        function openLibraryDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(DB_STORE)) {
                        db.createObjectStore(DB_STORE, {keyPath: 'key'});
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async function libraryPutFile(key, file) {
            try {
                if (navigator.storage && navigator.storage.persist) {
                    navigator.storage.persist().catch(() => {});
                }
                const db = await openLibraryDB();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(DB_STORE, 'readwrite');
                    tx.objectStore(DB_STORE).put({
                        key,
                        blob: file,
                        name: file.name,
                        type: file.type || 'application/zip',
                        lastModified: file.lastModified || Date.now()
                    });
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
                db.close();
                return true;
            } catch (err) {
                console.warn('Library save failed', err);
                return false;
            }
        }

        async function libraryGetFile(key) {
            try {
                const db = await openLibraryDB();
                const record = await new Promise((resolve, reject) => {
                    const tx = db.transaction(DB_STORE, 'readonly');
                    const req = tx.objectStore(DB_STORE).get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => reject(req.error);
                });
                db.close();
                if (!record || !record.blob) return null;
                return new File([record.blob], record.name || 'manga.cbz', {
                    type: record.type || 'application/zip',
                    lastModified: record.lastModified || Date.now()
                });
            } catch (err) {
                console.warn('Library read failed', err);
                return null;
            }
        }

        async function libraryDeleteFile(key) {
            try {
                const db = await openLibraryDB();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(DB_STORE, 'readwrite');
                    tx.objectStore(DB_STORE).delete(key);
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
                db.close();
            } catch (_) {}
        }

        async function libraryClear() {
            try {
                const db = await openLibraryDB();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(DB_STORE, 'readwrite');
                    tx.objectStore(DB_STORE).clear();
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
                db.close();
            } catch (_) {}
        }

        function readPrefs() {
            try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
            catch (_) { return {}; }
        }

        function loadPrefs() {
            const prefs = readPrefs();
            currentWidth = clamp(Number(prefs.width || 900), 500, 1400);
            readingDirection = prefs.direction === 'ltr' ? 'ltr' : 'rtl';
            doublePage = !!prefs.doublePage;
            brightness = clamp(Number(prefs.brightness || 100), 50, 130);
            readerBg = ['#000000','#161616','#201b16'].includes(prefs.readerBg) ? prefs.readerBg : '#000000';
            autoScrollSpeed = clamp(Number(prefs.autoScrollSpeed || 70), 20, 180);
        }

        function savePrefs() {
            localStorage.setItem(PREFS_KEY, JSON.stringify({
                width: currentWidth,
                direction: readingDirection,
                doublePage,
                brightness,
                readerBg,
                autoScrollSpeed
            }));
        }

        function applyPrefsToUI() {
            document.documentElement.style.setProperty('--manga-max-width', `${currentWidth}px`);
            document.documentElement.style.setProperty('--reader-brightness', String(brightness / 100));
            document.documentElement.style.setProperty('--reader-bg', readerBg);

            widthRange.value = currentWidth;
            widthValue.textContent = `${currentWidth}px`;
            brightnessRange.value = brightness;
            brightnessValue.textContent = `${brightness}%`;
            autoSpeedRange.value = autoScrollSpeed;
            autoSpeedValue.textContent = String(autoScrollSpeed);

            dirRtlBtn.classList.toggle('active', readingDirection === 'rtl');
            dirLtrBtn.classList.toggle('active', readingDirection === 'ltr');
            singlePageBtn.classList.toggle('active', !doublePage);
            doublePageBtn.classList.toggle('active', doublePage);

            document.querySelectorAll('[data-bg]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.bg === readerBg);
            });
        }

        function readAllProgress() {
            try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); }
            catch (_) { return {}; }
        }

        function getFileProgress(key) {
            return key ? (readAllProgress()[key] || null) : null;
        }

        function saveCurrentProgress(immediate = false) {
            if (!activeFileKey || !totalPages) return;

            const doSave = () => {
                const all = readAllProgress();
                all[activeFileKey] = {
                    page: activePageIndex,
                    pages: totalPages,
                    mode: currentMode,
                    width: currentWidth,
                    direction: readingDirection,
                    doublePage,
                    brightness,
                    readerBg,
                    updatedAt: Date.now()
                };
                localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
                updateRecentProgress(activeFileKey);
            };

            clearTimeout(progressSaveTimer);
            if (immediate) doSave();
            else progressSaveTimer = setTimeout(doSave, 250);
        }

        function restoreProgressForActiveFile() {
            const p = getFileProgress(activeFileKey);

            if (p) {
                activePageIndex = clamp(Number(p.page || 0), 0, Math.max(0, totalPages - 1));
                currentMode = p.mode === 'book' ? 'book' : 'list';
                currentWidth = clamp(Number(p.width || currentWidth), 500, 1400);
                readingDirection = p.direction === 'ltr' ? 'ltr' : 'rtl';
                doublePage = !!p.doublePage;
                brightness = clamp(Number(p.brightness || brightness), 50, 130);
                readerBg = ['#000000','#161616','#201b16'].includes(p.readerBg) ? p.readerBg : readerBg;
                applyPrefsToUI();
                toast(`Resume halaman ${activePageIndex + 1}`);
            } else {
                activePageIndex = 0;
            }

            setMode(currentMode, false, true);
        }

        function readRecents() {
            try {
                const recents = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
                if (Array.isArray(recents)) return recents;
            } catch (_) {}
            return [];
        }

        async function makeThumbDataUrl(blob) {
            try {
                const url = URL.createObjectURL(blob);
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = url;
                });

                const scale = Math.min(90 / img.naturalWidth, 130 / img.naturalHeight, 1);
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                return canvas.toDataURL('image/jpeg', .68);
            } catch (_) {
                return '';
            }
        }

        function saveRecentRead(file, key, thumb, pages) {
            let recents = readRecents().filter(x => x.key !== key && x.name !== file.name);
            const p = getFileProgress(key);

            recents.unshift({
                key,
                name: file.name,
                thumb: thumb || '',
                pages,
                page: p ? p.page || 0 : 0,
                size: file.size || 0,
                time: Date.now()
            });

            localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, 8)));
            loadRecentReads();
        }

        function updateRecentProgress(key) {
            const p = getFileProgress(key);
            if (!p) return;

            const recents = readRecents();
            const item = recents.find(x => x.key === key);
            if (!item) return;

            item.page = p.page || 0;
            item.pages = p.pages || item.pages || 0;
            item.time = Date.now();
            localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
        }

        function formatTimeAgo(timestamp) {
            const seconds = Math.max(0, Math.floor((Date.now() - Number(timestamp || Date.now())) / 1000));
            if (seconds < 5) return 'Baru saja';
            if (seconds < 60) return `${seconds} saat lalu`;
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes} minit lalu`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours} jam lalu`;
            const days = Math.floor(hours / 24);
            if (days < 30) return `${days} hari lalu`;
            const months = Math.floor(days / 30);
            if (months < 12) return `${months} bulan lalu`;
            return `${Math.floor(months / 12)} tahun lalu`;
        }

        function loadRecentReads() {
            const recents = readRecents();
            recentList.classList.add('library-horizontal-track');

            recentContainer.style.display = 'block';
            if (recentCount) recentCount.textContent = String(recents.length);

            if (!recents.length) {
                recentList.innerHTML =
                    '<div class="home-data-empty">Belum ada Recent Read. Buka CBZ, ZIP atau PDF untuk mula.</div>';
                return;
            }

            recentList.innerHTML = '';

            recents.forEach(data => {
                const item = document.createElement('div');
                item.className = 'recent-item';

                const pages = Math.max(0, Number(data.pages || 0));
                const page = clamp(Number(data.page || 0), 0, Math.max(0, pages - 1));
                const percent = pages ? Math.round(((page + 1) / pages) * 100) : 0;

                item.innerHTML = `
                    ${data.thumb
                        ? `<img src="${data.thumb}" class="recent-thumb" alt="Cover"/>`
                        : `<div class="recent-thumb"></div>`}
                    <div class="recent-info">
                        <span class="recent-name" title="${escapeHtml(data.name)}">${escapeHtml(data.name)}</span>
                        <span class="recent-meta">
                            ${pages} Halaman • Page ${pages ? page + 1 : 0}
                            • <span class="time-counter" data-time="${data.time || Date.now()}">${formatTimeAgo(data.time)}</span>
                        </span>
                        <div class="recent-progress"><span style="width:${percent}%"></span></div>
                        <span class="recent-open-note">Klik untuk sambung bacaan</span>
                    </div>
                    <button class="recent-delete-btn" title="Padam item ini">&#215;</button>
                `;

                item.addEventListener('click', () => reopenRecent(data));

                item.querySelector('.recent-delete-btn').addEventListener('click', event => {
                    event.stopPropagation();
                    deleteRecentItem(data);
                });

                recentList.appendChild(item);
            });
        }

        async function reopenRecent(data) {
            status.style.display = 'block';
            status.innerText = 'Membuka semula dari Kirin Library...';

            const file = await libraryGetFile(data.key);
            if (!file) {
                status.style.display = 'none';
                toast('Fail tidak lagi ada dalam Library. Pilih fail semula.');
                fileInput.click();
                return;
            }

            await handleFile(file, {persist: false});
        }

        async function deleteRecentItem(data) {
            localStorage.setItem(RECENT_KEY, JSON.stringify(readRecents().filter(x => x.key !== data.key)));
            await libraryDeleteFile(data.key);

            const all = readAllProgress();
            delete all[data.key];
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));

            loadRecentReads();
            toast('Bacaan dipadam');
        }

        function startTimerInterval() {
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                document.querySelectorAll('.time-counter').forEach(el => {
                    el.innerText = formatTimeAgo(parseInt(el.dataset.time || '0', 10));
                });
            }, 30000);
        }

        clearAllBtn.onclick = async () => {
            if (!confirm('Padam semua Recent Read Local Reader, fail Library dan progress tersimpan?')) return;

            localStorage.removeItem(RECENT_KEY);
            localStorage.removeItem(PROGRESS_KEY);
            await libraryClear();

            loadRecentReads();
            toast('Recent Read dipadam');
        };

        fileInput.onchange = event => {
            const file = event.target.files[0];
            if (file) handleFile(file);
            fileInput.value = '';
        };

        async function handleFile(file, options = {}) {
            if (!file) return;
            if (!/\.(cbz|zip)$/i.test(file.name || '')) {
                alert('Kirin Reader hanya menerima fail .cbz atau .zip');
                return;
            }

            stopAutoScroll();
            closePanels();
            cleanupObjectUrls();

            activeFile = file;
            activeFileKey = makeFileKey(file);

            status.style.display = 'block';
            status.innerText = 'Sila tunggu, Kirin sedang memproses fail...';

            try {
                const zip = await JSZip.loadAsync(file);
                const files = [];

                zip.forEach((path, entry) => {
                    if (!entry.dir &&
                        entry.name.match(/\.(jpg|jpeg|png|webp|gif)$/i) &&
                        !entry.name.includes('__MACOSX')) {
                        files.push(entry);
                    }
                });

                if (!files.length) throw new Error('Tiada imej sah di dalam arkib.');

                files.sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'})
                );

                totalPages = files.length;
                viewer.innerHTML = '';
                thumbGrid.innerHTML = '';

                let firstBlob = null;

                for (let index = 0; index < files.length; index++) {
                    const blob = await files[index].async('blob');
                    if (index === 0) firstBlob = blob;

                    const url = URL.createObjectURL(blob);
                    objectUrls.push(url);

                    const img = document.createElement('img');
                    img.src = url;
                    img.loading = index < 3 ? 'eager' : 'lazy';
                    img.decoding = 'async';
                    img.dataset.index = String(index);
                    viewer.appendChild(img);
                }

                const thumb = firstBlob ? await makeThumbDataUrl(firstBlob) : '';

                if (options.persist !== false) {
                    const saved = await libraryPutFile(activeFileKey, file);
                    if (!saved) toast('Reader berjalan, tapi fail tidak sempat disimpan dalam Library browser.');
                }

                saveRecentRead(file, activeFileKey, thumb, totalPages);

                setup.style.display = 'none';
                status.style.display = 'none';
                topControls.style.display = 'flex';
                readerProgress.classList.add('active');

                buildThumbnails();
                updateFileInfo();
                restoreProgressForActiveFile();
                updatePageIndicator();
                updateReaderProgress();

            } catch (err) {
                console.error(err);
                status.style.display = 'none';
                alert('Fail rosak atau tidak disokong: ' + err.message);
            }
        }

        function updateFileInfo() {
            if (!activeFile) {
                fileInfoBox.innerHTML = 'Belum ada fail dibuka.';
                return;
            }

            fileInfoBox.innerHTML = `
                <b>${escapeHtml(activeFile.name)}</b><br/>
                ${formatBytes(activeFile.size || 0)} • ${totalPages} halaman<br/>
                Mode: ${currentMode.toUpperCase()} • ${readingDirection.toUpperCase()} • ${doublePage ? '2 Page' : '1 Page'}
            `;
        }

        function setMode(mode, persist = true, restoring = false) {
            currentMode = mode === 'book' ? 'book' : 'list';
            stopAutoScroll();

            modeListBtn.classList.toggle('active', currentMode === 'list');
            modeBookBtn.classList.toggle('active', currentMode === 'book');
            modeBookBtn.textContent = `BOOK (${readingDirection.toUpperCase()})`;

            if (currentMode === 'book') {
                viewer.classList.add('book-mode');
                viewer.classList.toggle('double-page', doublePage);
                navPrev.style.display = 'block';
                navNext.style.display = 'block';
                header.classList.remove('hide');
                applyBookDirection();
                renderBookPages();
                window.scrollTo(0, 0);
            } else {
                viewer.classList.remove('book-mode','double-page','direction-rtl','direction-ltr');
                viewer.style.direction = '';
                navPrev.style.display = 'none';
                navNext.style.display = 'none';
                header.classList.remove('hide');

                viewer.querySelectorAll('img').forEach(img => img.classList.remove('active','active-pair'));

                if (totalPages) {
                    requestAnimationFrame(() => {
                        viewer.querySelector(`img[data-index="${activePageIndex}"]`)?.scrollIntoView({block:'start'});
                    });
                }
            }

            updatePageIndicator();
            updateReaderProgress();
            updateFileInfo();
            if (persist) saveCurrentProgress();
        }

        function applyBookDirection() {
            viewer.classList.toggle('direction-rtl', readingDirection === 'rtl');
            viewer.classList.toggle('direction-ltr', readingDirection === 'ltr');

            if (readingDirection === 'rtl') {
                navNext.style.left = '0';
                navNext.style.right = 'auto';
                navPrev.style.right = '0';
                navPrev.style.left = 'auto';
            } else {
                navPrev.style.left = '0';
                navPrev.style.right = 'auto';
                navNext.style.right = '0';
                navNext.style.left = 'auto';
            }
        }

        function setDirection(direction) {
            readingDirection = direction === 'ltr' ? 'ltr' : 'rtl';
            dirRtlBtn.classList.toggle('active', readingDirection === 'rtl');
            dirLtrBtn.classList.toggle('active', readingDirection === 'ltr');
            modeBookBtn.textContent = `BOOK (${readingDirection.toUpperCase()})`;
            applyBookDirection();
            savePrefs();
            saveCurrentProgress();
            updateFileInfo();
        }

        function setDoublePage(enabled) {
            doublePage = !!enabled;
            singlePageBtn.classList.toggle('active', !doublePage);
            doublePageBtn.classList.toggle('active', doublePage);
            viewer.classList.toggle('double-page', currentMode === 'book' && doublePage);
            renderBookPages();
            savePrefs();
            saveCurrentProgress();
            updateFileInfo();
        }

        function renderBookPages() {
            if (currentMode !== 'book') return;

            const images = viewer.querySelectorAll('img');
            images.forEach(img => img.classList.remove('active','active-pair'));
            if (!images.length) return;

            activePageIndex = clamp(activePageIndex, 0, images.length - 1);
            images[activePageIndex].classList.add('active');

            if (doublePage && activePageIndex + 1 < images.length) {
                images[activePageIndex + 1].classList.add('active-pair');
            }

            updateThumbnailsActive();
        }

        modeListBtn.onclick = () => setMode('list');
        modeBookBtn.onclick = () => setMode('book');
        dirRtlBtn.onclick = () => setDirection('rtl');
        dirLtrBtn.onclick = () => setDirection('ltr');
        singlePageBtn.onclick = () => setDoublePage(false);
        doublePageBtn.onclick = () => setDoublePage(true);

        function changePage(next = true) {
            if (!totalPages) return;

            const step = doublePage && currentMode === 'book' ? 2 : 1;
            const nextIndex = next
                ? clamp(activePageIndex + step, 0, totalPages - 1)
                : clamp(activePageIndex - step, 0, totalPages - 1);

            if (nextIndex === activePageIndex) {
                toast(next ? 'Sudah halaman terakhir' : 'Sudah halaman pertama');
                return;
            }

            activePageIndex = nextIndex;

            if (currentMode === 'book') renderBookPages();
            else viewer.querySelector(`img[data-index="${activePageIndex}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});

            updatePageIndicator();
            updateReaderProgress();
            saveCurrentProgress();
        }

        function jumpToPage(pageNumber) {
            if (!totalPages) return;

            activePageIndex = clamp(Number(pageNumber || 1) - 1, 0, totalPages - 1);

            if (currentMode === 'book') renderBookPages();
            else viewer.querySelector(`img[data-index="${activePageIndex}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});

            updatePageIndicator();
            updateReaderProgress();
            updateThumbnailsActive();
            saveCurrentProgress();
        }

        navNext.onclick = event => { event.stopPropagation(); changePage(true); };
        navPrev.onclick = event => { event.stopPropagation(); changePage(false); };

        jumpBtn.onclick = () => jumpToPage(jumpInput.value);
        pageCounter.onclick = () => {
            if (!totalPages) return;
            openToolsPanel();
            jumpInput.value = String(activePageIndex + 1);
            setTimeout(() => { jumpInput.focus(); jumpInput.select(); }, 80);
        };
        jumpInput.onkeydown = event => {
            if (event.key === 'Enter') jumpToPage(jumpInput.value);
        };

        function updatePageIndicator() {
            if (!totalPages) {
                pageCounter.textContent = '0 Pgs';
                return;
            }

            const end = currentMode === 'book' && doublePage
                ? Math.min(totalPages, activePageIndex + 2)
                : activePageIndex + 1;

            pageCounter.textContent = currentMode === 'book' && doublePage
                ? `${activePageIndex + 1}-${end} / ${totalPages}`
                : `${activePageIndex + 1} / ${totalPages}`;

            jumpInput.max = String(totalPages);
            jumpInput.value = String(activePageIndex + 1);
        }

        function updateReaderProgress() {
            if (!totalPages) return readerProgressFill.style.width = '0%';

            const end = currentMode === 'book' && doublePage
                ? Math.min(totalPages, activePageIndex + 2)
                : activePageIndex + 1;

            readerProgressFill.style.width = `${(end / totalPages) * 100}%`;
        }

        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            if (currentMode === 'book') return;

            const currentScroll = window.pageYOffset;
            if (currentScroll > lastScroll && currentScroll > 50) header.classList.add('hide');
            else header.classList.remove('hide');
            lastScroll = currentScroll;

            if (!scrollRafPending) {
                scrollRafPending = true;
                requestAnimationFrame(() => {
                    updateScrollActivePage();
                    scrollRafPending = false;
                });
            }
        }, {passive:true});

        function updateScrollActivePage() {
            if (currentMode !== 'list' || !totalPages) return;

            const center = window.innerHeight * .45;
            let best = activePageIndex;
            let bestDistance = Infinity;

            viewer.querySelectorAll('img').forEach((img, index) => {
                const rect = img.getBoundingClientRect();
                const distance = Math.abs(((rect.top + rect.bottom) / 2) - center);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = index;
                }
            });

            if (best !== activePageIndex) {
                activePageIndex = best;
                updatePageIndicator();
                updateReaderProgress();
                updateThumbnailsActive();
                saveCurrentProgress();
            }
        }

        const showHeaderActions = y => {
            if (currentMode === 'book' && y < 60) header.classList.remove('hide');
        };
        window.addEventListener('mousemove', event => showHeaderActions(event.clientY));
        window.addEventListener('touchstart', event => {
            if (event.touches[0]) showHeaderActions(event.touches[0].clientY);
        }, {passive:true});

        let touchStartX = 0;
        let touchEndX = 0;

        viewer.addEventListener('touchstart', event => {
            if (currentMode === 'book') touchStartX = event.changedTouches[0].screenX;
        }, {passive:true});

        viewer.addEventListener('touchend', event => {
            if (currentMode !== 'book') return;
            touchEndX = event.changedTouches[0].screenX;
            const delta = touchEndX - touchStartX;
            if (Math.abs(delta) < 50) return;

            if (readingDirection === 'rtl') {
                delta > 0 ? changePage(true) : changePage(false);
            } else {
                delta < 0 ? changePage(true) : changePage(false);
            }
        }, {passive:true});

        function setReaderWidth(width) {
            currentWidth = clamp(Number(width), 500, 1400);
            document.documentElement.style.setProperty('--manga-max-width', `${currentWidth}px`);
            widthRange.value = currentWidth;
            widthValue.textContent = `${currentWidth}px`;
            savePrefs();
            saveCurrentProgress();
        }

        zoomIn.onclick = () => setReaderWidth(currentWidth + 100);
        zoomOut.onclick = () => setReaderWidth(currentWidth - 100);
        widthRange.oninput = () => setReaderWidth(widthRange.value);

        brightnessRange.oninput = () => {
            brightness = clamp(Number(brightnessRange.value), 50, 130);
            document.documentElement.style.setProperty('--reader-brightness', String(brightness / 100));
            brightnessValue.textContent = `${brightness}%`;
            savePrefs();
            saveCurrentProgress();
        };

        document.querySelectorAll('[data-bg]').forEach(button => {
            button.onclick = () => {
                readerBg = button.dataset.bg;
                document.documentElement.style.setProperty('--reader-bg', readerBg);
                document.querySelectorAll('[data-bg]').forEach(btn => btn.classList.toggle('active', btn === button));
                savePrefs();
                saveCurrentProgress();
            };
        });

        function startAutoScroll() {
            if (currentMode !== 'list') return toast('Auto Scroll hanya untuk mode SCROLL.');
            if (autoScrollRunning) return;

            autoScrollRunning = true;
            autoScrollLastTime = performance.now();
            autoScrollBtn.classList.add('active');
            autoScrollBtn.textContent = 'STOP AUTO';
            autoScrollBadge.classList.add('active');

            const loop = now => {
                if (!autoScrollRunning) return;

                const delta = Math.min(50, now - autoScrollLastTime);
                autoScrollLastTime = now;
                window.scrollBy(0, (autoScrollSpeed / 1000) * delta);

                if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
                    stopAutoScroll();
                    return toast('Auto Scroll selesai');
                }

                autoScrollFrame = requestAnimationFrame(loop);
            };

            autoScrollFrame = requestAnimationFrame(loop);
        }

        function stopAutoScroll() {
            autoScrollRunning = false;
            cancelAnimationFrame(autoScrollFrame);
            autoScrollBtn.classList.remove('active');
            autoScrollBtn.textContent = 'START AUTO';
            autoScrollBadge.classList.remove('active');
        }

        function toggleAutoScroll() {
            autoScrollRunning ? stopAutoScroll() : startAutoScroll();
        }

        autoScrollBtn.onclick = toggleAutoScroll;
        autoSpeedRange.oninput = () => {
            autoScrollSpeed = clamp(Number(autoSpeedRange.value), 20, 180);
            autoSpeedValue.textContent = String(autoScrollSpeed);
            savePrefs();
        };

        async function toggleFullscreen() {
            try {
                if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
                else await document.exitFullscreen();
            } catch (_) {
                toast('Fullscreen tidak disokong browser ini');
            }
        }

        fullscreenBtn.onclick = toggleFullscreen;
        document.addEventListener('fullscreenchange', () => {
            fullscreenBtn.classList.toggle('active', !!document.fullscreenElement);
            fullscreenBtn.textContent = document.fullscreenElement ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
        });

        function closePanels() {
            toolsPanel.classList.remove('open');
            thumbPanel.classList.remove('open');
            toolsBtn.classList.remove('active');
            thumbBtn.classList.remove('active');
        }

        function openToolsPanel() {
            thumbPanel.classList.remove('open');
            thumbBtn.classList.remove('active');
            toolsPanel.classList.add('open');
            toolsBtn.classList.add('active');
        }

        function openThumbPanel() {
            if (!totalPages) return;
            toolsPanel.classList.remove('open');
            toolsBtn.classList.remove('active');
            thumbPanel.classList.add('open');
            thumbBtn.classList.add('active');
            updateThumbnailsActive();
            requestAnimationFrame(() => thumbGrid.querySelector('.thumb-item.active')?.scrollIntoView({block:'center'}));
        }

        toolsBtn.onclick = () => toolsPanel.classList.contains('open') ? closePanels() : openToolsPanel();
        thumbBtn.onclick = () => thumbPanel.classList.contains('open') ? closePanels() : openThumbPanel();
        toolsClose.onclick = closePanels;
        thumbClose.onclick = closePanels;
        openNewBtn.onclick = () => fileInput.click();

        function buildThumbnails() {
            thumbGrid.innerHTML = '';
            viewer.querySelectorAll('img').forEach((img, index) => {
                const button = document.createElement('button');
                button.className = 'thumb-item';
                button.type = 'button';
                button.dataset.index = String(index);
                button.innerHTML = `<div class="v4-thumb-shell"><img src="${img.src}" alt="Page ${index + 1}" loading="lazy"/></div><div class="selector-page-copy"><b>Page ${index + 1}</b><span>Click to open</span></div>`;
                button.onclick = () => {
                    jumpToPage(index + 1);
                    closePanels();
                };
                thumbGrid.appendChild(button);
            });
            updateThumbnailsActive();
        }

        function updateThumbnailsActive() {
            thumbGrid.querySelectorAll('.thumb-item').forEach((item, index) => {
                const active = index === activePageIndex ||
                    (currentMode === 'book' && doublePage && index === activePageIndex + 1);
                item.classList.toggle('active', active);
            });
        }

        resetSettingsBtn.onclick = () => {
            if (!confirm('Reset reader settings ke default? Progress manga tidak dipadam.')) return;

            localStorage.removeItem(PREFS_KEY);
            currentWidth = 900;
            readingDirection = 'rtl';
            doublePage = false;
            brightness = 100;
            readerBg = '#000000';
            autoScrollSpeed = 70;

            applyPrefsToUI();
            setMode(currentMode, false);
            saveCurrentProgress(true);
            toast('Reader settings direset');
        };

        window.addEventListener('keydown', event => {
            if (['input','textarea'].includes(document.activeElement?.tagName?.toLowerCase())) return;
            const key = event.key.toLowerCase();

            if (key === 'escape') {
                closePanels();
                stopAutoScroll();
                return;
            }

            if (!totalPages) return;

            if (currentMode === 'book') {
                if (readingDirection === 'rtl') {
                    if (event.key === 'ArrowLeft') changePage(true);
                    if (event.key === 'ArrowRight') changePage(false);
                } else {
                    if (event.key === 'ArrowRight') changePage(true);
                    if (event.key === 'ArrowLeft') changePage(false);
                }
            }

            if (key === 'm') setMode(currentMode === 'list' ? 'book' : 'list');
            if (key === 't') openThumbPanel();
            if (key === 'f') toggleFullscreen();
            if (key === 'a') toggleAutoScroll();
            if (key === 'd') setDoublePage(!doublePage);
            if (key === 'r') setDirection(readingDirection === 'rtl' ? 'ltr' : 'rtl');
            if (key === 'g') {
                openToolsPanel();
                jumpInput.value = String(activePageIndex + 1);
                setTimeout(() => { jumpInput.focus(); jumpInput.select(); }, 50);
            }
            if (key === '+' || key === '=') setReaderWidth(currentWidth + 100);
            if (key === '-') setReaderWidth(currentWidth - 100);
        });


        /* =====================================================
           V3 DUAL READER / SETTINGS / PAGE SELECTOR
           ===================================================== */
        const V3_KEY = 'kirin_reader_v3_ui';
        const LINK_HISTORY_KEY = 'kirin_link_history_v3';

        const homeBtn = document.getElementById('homeBtn');
        const linkInput = document.getElementById('linkInput');
        const linkOpenBtn = document.getElementById('linkOpenBtn');
        const linkChapters = document.getElementById('linkChapters');
        const linkHistoryBox = document.getElementById('linkHistoryBox');
        const pageSelector = document.getElementById('pageSelector');
        const selectorHandle = document.getElementById('selectorHandle');
        const selectorTitle = document.getElementById('selectorTitle');
        const selectorSource = document.getElementById('selectorSource');
        const selectorPageDisplay = document.getElementById('selectorPageDisplay');
        const selectorPrev = document.getElementById('selectorPrev');
        const selectorNext = document.getElementById('selectorNext');
        const selectorFirst = document.getElementById('selectorFirst');
        const selectorLast = document.getElementById('selectorLast');
        const selectorThumbs = document.getElementById('selectorThumbs');
        const selectorSettings = document.getElementById('selectorSettings');
        const selectorThumbList = document.getElementById('selectorThumbList');
        const settingsTitle = document.getElementById('settingsTitle');
        const preloadRange = document.getElementById('preloadRange');
        const preloadValue = document.getElementById('preloadValue');
        const keyboardScrollRange = document.getElementById('keyboardScrollRange');
        const keyboardScrollValue = document.getElementById('keyboardScrollValue');
        const doubleOddBtn = document.getElementById('doubleOddBtn');
        const thumbSettingsBtn = document.getElementById('thumbSettingsBtn');
        const exportHistoryBtn = document.getElementById('exportHistoryBtn');
        const importHistoryBtn = document.getElementById('importHistoryBtn');
        const historyImportInput = document.getElementById('historyImportInput');
        const clearCacheBtn = document.getElementById('clearCacheBtn');

        let v3SourceType = 'local';
        let v3SourceUrl = '';
        let v3SourceTitle = '';
        let v3Fit = 'width';
        let v3SpreadOdd = false;
        let v3Preload = 3;
        let v3KeyboardScroll = 25;
        let v3ResetPageScroll = true;
        let v3ClickTurn = true;
        let v3VerticalArrows = false;
        let v3SwipeEnabled = true;
        let v3SelectorPosition = 'left';
        let v3PinSelector = true;
        let v3ShowPageNumber = true;
        let v3ShowSidebar = true;
        let v3ShowPreviews = true;
        let v3Accent = '#8ab4f8';

        function v3ReadPrefs() {
            try { return JSON.parse(localStorage.getItem(V3_KEY) || '{}'); }
            catch (_) { return {}; }
        }

        function v3LoadPrefs() {
            const p = v3ReadPrefs();
            v3Fit = ['original','width','height'].includes(p.fit) ? p.fit : 'width';
            v3SpreadOdd = !!p.spreadOdd;
            v3Preload = clamp(Number(p.preload || 3), 1, 10);
            v3KeyboardScroll = clamp(Number(p.keyboardScroll || 25), 5, 100);
            v3ResetPageScroll = p.resetPageScroll !== false;
            v3ClickTurn = p.clickTurn !== false;
            v3VerticalArrows = !!p.verticalArrows;
            v3SwipeEnabled = p.swipeEnabled !== false;
            v3SelectorPosition = p.selectorPosition === 'bottom' ? 'bottom' : 'left';
            v3PinSelector = p.pinSelector !== false;
            v3ShowPageNumber = p.showPageNumber !== false;
            v3ShowSidebar = p.showSidebar !== false;
            v3ShowPreviews = p.showPreviews !== false;
            v3Accent = ['#e42d32','#8ab4f8','#65d46e'].includes(p.accent) ? p.accent : '#8ab4f8';
        }

        function v3SavePrefs() {
            localStorage.setItem(V3_KEY, JSON.stringify({
                fit: v3Fit, spreadOdd: v3SpreadOdd, preload: v3Preload, keyboardScroll: v3KeyboardScroll,
                resetPageScroll: v3ResetPageScroll, clickTurn: v3ClickTurn, verticalArrows: v3VerticalArrows,
                swipeEnabled: v3SwipeEnabled, selectorPosition: v3SelectorPosition, pinSelector: v3PinSelector,
                showPageNumber: v3ShowPageNumber, showSidebar: v3ShowSidebar, showPreviews: v3ShowPreviews,
                accent: v3Accent
            }));
        }

        function v3ToggleState(name) {
            const map = {
                resetPageScroll: v3ResetPageScroll,
                clickTurn: v3ClickTurn,
                verticalArrows: v3VerticalArrows,
                swipeEnabled: v3SwipeEnabled,
                pinSelector: v3PinSelector,
                showPageNumber: v3ShowPageNumber,
                showSidebar: v3ShowSidebar,
                showPreviews: v3ShowPreviews
            };
            return !!map[name];
        }

        function v3SetToggle(name, value) {
            value = !!value;
            if (name === 'resetPageScroll') v3ResetPageScroll = value;
            if (name === 'clickTurn') v3ClickTurn = value;
            if (name === 'verticalArrows') v3VerticalArrows = value;
            if (name === 'swipeEnabled') v3SwipeEnabled = value;
            if (name === 'pinSelector') v3PinSelector = value;
            if (name === 'showPageNumber') v3ShowPageNumber = value;
            if (name === 'showSidebar') v3ShowSidebar = value;
            if (name === 'showPreviews') v3ShowPreviews = value;
            v3ApplyPrefs();
            v3SavePrefs();
        }

        function v3ApplyPrefs() {
            document.documentElement.style.setProperty('--ui-accent', v3Accent);
            preloadRange.value = String(v3Preload);
            preloadValue.textContent = String(v3Preload);
            keyboardScrollRange.value = String(v3KeyboardScroll);
            keyboardScrollValue.textContent = `${v3KeyboardScroll}px`;

            document.querySelectorAll('[data-fit]').forEach(btn => btn.classList.toggle('active', btn.dataset.fit === v3Fit));
            document.querySelectorAll('[data-selector-position]').forEach(btn => btn.classList.toggle('active', btn.dataset.selectorPosition === v3SelectorPosition));
            document.querySelectorAll('[data-accent]').forEach(btn => btn.classList.toggle('active', btn.dataset.accent === v3Accent));
            document.querySelectorAll('[data-toggle]').forEach(pair => {
                const value = v3ToggleState(pair.dataset.toggle);
                pair.querySelector('.on')?.classList.toggle('active', value);
                pair.querySelector('.off')?.classList.toggle('active', !value);
            });

            pageSelector.classList.toggle('position-bottom', v3SelectorPosition === 'bottom');
            v3ApplyFit();
            v3UpdateSelector();
        }

        function v3ApplyFit() {
            viewer.querySelectorAll('img').forEach(img => {
                img.style.width = '';
                img.style.maxWidth = '';
                img.style.maxHeight = '';
                if (v3Fit === 'original') {
                    img.style.width = 'auto';
                    img.style.maxWidth = 'none';
                } else if (v3Fit === 'height') {
                    img.style.width = 'auto';
                    img.style.maxWidth = '100vw';
                    img.style.maxHeight = currentMode === 'book' ? '85vh' : '100vh';
                } else {
                    img.style.width = '100%';
                    img.style.maxWidth = 'var(--manga-max-width)';
                }
            });
        }

        function v3GoHome() {
            stopAutoScroll();
            closePanels();
            pageSelector.classList.remove('active');
            viewer.style.display = 'none';
            setup.style.display = 'flex';
            topControls.style.display = 'none';
            readerProgress.classList.remove('active');
            header.classList.remove('hide');
            window.scrollTo({top:0, behavior:'smooth'});
        }
        homeBtn.onclick = v3GoHome;

        function v3EnterReader() {
            setup.style.display = 'none';
            viewer.style.display = 'flex';
            topControls.style.display = 'flex';
            readerProgress.classList.add('active');
            v3UpdateSelector();
        }

        function v3SourceLabel() { return v3SourceType === 'link' ? 'Link Reader' : 'Local Reader'; }

        function v3UpdateInfo() {
            if (!activeFileKey) return;
            const title = v3SourceTitle || activeFile?.name || 'Kirin Manga';
            selectorTitle.textContent = title;
            selectorSource.textContent = v3SourceLabel();
            if (v3SourceType === 'link') {
                fileInfoBox.innerHTML = `<b>${escapeHtml(title)}</b><br/>Link Reader • ${totalPages} halaman<br/>Mode: ${currentMode.toUpperCase()} • ${readingDirection.toUpperCase()} • ${doublePage ? (v3SpreadOdd ? '2 Page Odd' : '2 Page') : '1 Page'}`;
            }
        }

        /* Wrap core functions */
        const v3OriginalHandleFile = handleFile;
        handleFile = async function(file, options = {}) {
            v3SourceType = 'local';
            v3SourceUrl = '';
            v3SourceTitle = file?.name || 'Local Manga';
            const result = await v3OriginalHandleFile(file, options);
            if (totalPages > 0) {
                v3EnterReader();
                v3BuildSelectorThumbs();
                v3ApplyFit();
                v3UpdateInfo();
            }
            return result;
        };

        const v3OriginalSetMode = setMode;
        setMode = function(mode, persist = true, restoring = false) {
            const result = v3OriginalSetMode(mode, persist, restoring);
            v3ApplyFit();
            v3UpdateSelector();
            v3UpdateInfo();
            return result;
        };

        const v3OriginalUpdatePageIndicator = updatePageIndicator;
        updatePageIndicator = function() {
            v3OriginalUpdatePageIndicator();
            selectorPageDisplay.textContent = v3ShowPageNumber ? pageCounter.innerText : 'PAGE';
            v3UpdateSelectorThumbActive();
            v3PreloadNearby();
        };

        const v3OriginalBuildThumbnails = buildThumbnails;
        buildThumbnails = function() {
            v3OriginalBuildThumbnails();
            v3BuildSelectorThumbs();
            v3ApplyFit();
        };

        const v3OriginalRenderBookPages = renderBookPages;
        renderBookPages = function() {
            v3OriginalRenderBookPages();
            if (doublePage && v3SpreadOdd && activePageIndex === 0) {
                viewer.querySelectorAll('.active-pair').forEach(img => img.classList.remove('active-pair'));
            }
            v3UpdateSelectorThumbActive();
        };

        const v3OriginalChangePage = changePage;
        changePage = function(next = true) {
            if (currentMode === 'book' && doublePage && v3SpreadOdd && totalPages > 0) {
                let nextIndex;
                if (next) nextIndex = activePageIndex === 0 ? 1 : activePageIndex + 2;
                else nextIndex = activePageIndex <= 1 ? 0 : activePageIndex - 2;
                nextIndex = clamp(nextIndex, 0, totalPages - 1);
                if (nextIndex === activePageIndex) return;
                activePageIndex = nextIndex;
                renderBookPages();
                if (v3ResetPageScroll) window.scrollTo(0,0);
                updatePageIndicator();
                updateReaderProgress();
                saveCurrentProgress();
                return;
            }
            const result = v3OriginalChangePage(next);
            if (currentMode === 'book' && v3ResetPageScroll) window.scrollTo(0,0);
            return result;
        };

        singlePageBtn.onclick = () => { v3SpreadOdd = false; setDoublePage(false); v3SavePrefs(); };
        doublePageBtn.onclick = () => { v3SpreadOdd = false; setDoublePage(true); v3SavePrefs(); };
        doubleOddBtn.onclick = () => {
            v3SpreadOdd = true;
            setDoublePage(true);
            singlePageBtn.classList.remove('active');
            doublePageBtn.classList.remove('active');
            doubleOddBtn.classList.add('active');
            renderBookPages();
            v3SavePrefs();
        };

        function v3PreloadNearby() {
            viewer.querySelectorAll('img').forEach((img, index) => {
                img.loading = Math.abs(index - activePageIndex) <= v3Preload ? 'eager' : 'lazy';
            });
        }

        /* Page selector */
        function v3UpdateSelector() {
            const visible = totalPages > 0 && v3ShowSidebar && setup.style.display === 'none';
            pageSelector.classList.toggle('active', visible);
            if (visible && v3PinSelector) pageSelector.classList.remove('collapsed');
            pageSelector.classList.toggle('position-bottom', v3SelectorPosition === 'bottom');
            selectorPageDisplay.textContent = v3ShowPageNumber ? pageCounter.innerText : 'PAGE';
            selectorTitle.textContent = v3SourceTitle || activeFile?.name || 'Kirin Manga Reader';
            selectorSource.textContent = v3SourceLabel();
            selectorThumbList.style.display = v3ShowPreviews ? '' : 'none';
        }

        function v3BuildSelectorThumbs() {
            selectorThumbList.innerHTML = '';
            if (!v3ShowPreviews) return;
            viewer.querySelectorAll('img').forEach((img, index) => {
                const button = document.createElement('button');
                button.className = 'thumb-item';
                button.type = 'button';
                button.dataset.selectorIndex = String(index);
                button.innerHTML = `<img src="${img.src}" alt="Page ${index + 1}" loading="lazy"/><span class="thumb-number">${index + 1}</span>`;
                button.onclick = () => jumpToPage(index + 1);
                selectorThumbList.appendChild(button);
            });
            v3UpdateSelectorThumbActive();
        }

        function v3UpdateSelectorThumbActive() {
            let activeButton = null;
            selectorThumbList.querySelectorAll('[data-selector-index]').forEach(button => {
                const active = Number(button.dataset.selectorIndex) === activePageIndex;
                button.classList.toggle('active', active);
                if (active) activeButton = button;
            });

            if (activeButton && pageSelector.classList.contains('active')) {
                const listRect = selectorThumbList.getBoundingClientRect();
                const itemRect = activeButton.getBoundingClientRect();
                if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
                    activeButton.scrollIntoView({block:'nearest', inline:'nearest'});
                }
            }
        }

        selectorHandle.onclick = () => pageSelector.classList.toggle('collapsed');
        selectorPrev.onclick = () => changePage(false);
        selectorNext.onclick = () => changePage(true);
        selectorFirst.onclick = () => jumpToPage(1);
        selectorLast.onclick = () => jumpToPage(totalPages);
        selectorThumbs.onclick = openThumbPanel;
        selectorSettings.onclick = openToolsPanel;

        /* Settings tabs */
        document.querySelectorAll('.settings-tab-btn').forEach(button => {
            button.onclick = () => {
                document.querySelectorAll('.settings-tab-btn').forEach(x => x.classList.remove('active'));
                document.querySelectorAll('.settings-tab').forEach(x => x.classList.remove('active'));
                button.classList.add('active');
                document.querySelector(`[data-settings-panel="${button.dataset.settingsTab}"]`)?.classList.add('active');
                settingsTitle.textContent = button.textContent.trim();
            };
        });

        document.querySelectorAll('[data-toggle]').forEach(pair => {
            pair.querySelector('.on').onclick = () => v3SetToggle(pair.dataset.toggle, true);
            pair.querySelector('.off').onclick = () => v3SetToggle(pair.dataset.toggle, false);
        });

        document.querySelectorAll('[data-fit]').forEach(button => {
            button.onclick = () => { v3Fit = button.dataset.fit; v3ApplyPrefs(); v3SavePrefs(); };
        });

        document.querySelector('[data-layout-scroll]').onclick = () => setMode('list');
        document.querySelectorAll('[data-selector-position]').forEach(button => {
            button.onclick = () => { v3SelectorPosition = button.dataset.selectorPosition; v3ApplyPrefs(); v3SavePrefs(); };
        });
        document.querySelectorAll('[data-accent]').forEach(button => {
            button.onclick = () => { v3Accent = button.dataset.accent; v3ApplyPrefs(); v3SavePrefs(); };
        });

        preloadRange.oninput = () => { v3Preload = Number(preloadRange.value); preloadValue.textContent = String(v3Preload); v3SavePrefs(); v3PreloadNearby(); };
        keyboardScrollRange.oninput = () => { v3KeyboardScroll = Number(keyboardScrollRange.value); keyboardScrollValue.textContent = `${v3KeyboardScroll}px`; v3SavePrefs(); };
        thumbSettingsBtn.onclick = openThumbPanel;

        /* Stop old nav click when disabled */
        navPrev.addEventListener('click', e => { if (!v3ClickTurn) e.stopImmediatePropagation(); }, true);
        navNext.addEventListener('click', e => { if (!v3ClickTurn) e.stopImmediatePropagation(); }, true);
        viewer.addEventListener('touchend', e => { if (!v3SwipeEnabled && currentMode === 'book') e.stopImmediatePropagation(); }, true);

        window.addEventListener('keydown', event => {
            const tag = document.activeElement?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            if (currentMode === 'list' && totalPages > 0) {
                if (v3VerticalArrows && event.key === 'ArrowRight') { event.preventDefault(); changePage(true); }
                else if (v3VerticalArrows && event.key === 'ArrowLeft') { event.preventDefault(); changePage(false); }
                else if (!v3VerticalArrows && event.key === 'ArrowDown') { event.preventDefault(); window.scrollBy({top:v3KeyboardScroll,behavior:'smooth'}); }
                else if (!v3VerticalArrows && event.key === 'ArrowUp') { event.preventDefault(); window.scrollBy({top:-v3KeyboardScroll,behavior:'smooth'}); }
            }
        });

        /* Link Reader */
        function v3NormalizeImages(value) {
            if (!Array.isArray(value)) return [];
            return value.map(item => typeof item === 'string' ? item : (item?.url || item?.src || '')).filter(url => /^https?:\/\//i.test(url));
        }

        function v3ExtractChapters(json) {
            if (!json || typeof json !== 'object' || !json.chapters || typeof json.chapters !== 'object') return [];
            return Object.entries(json.chapters).map(([key, chapter]) => {
                let pages = v3NormalizeImages(chapter.pages || chapter.images || []);
                let group = '';
                if (!pages.length && chapter.groups && typeof chapter.groups === 'object') {
                    for (const [name, value] of Object.entries(chapter.groups)) {
                        const candidate = v3NormalizeImages(value);
                        if (candidate.length) { pages = candidate; group = name; break; }
                    }
                }
                return {key, title: chapter.title || `Chapter ${key}`, group, pages};
            }).filter(ch => ch.pages.length);
        }

        function v3ReadLinkHistory() {
            try { return JSON.parse(localStorage.getItem(LINK_HISTORY_KEY) || '[]'); }
            catch (_) { return []; }
        }

        function v3SaveLinkHistory(item) {
            let list = v3ReadLinkHistory().filter(x => x.url !== item.url);
            list.unshift({...item, time:Date.now()});
            localStorage.setItem(LINK_HISTORY_KEY, JSON.stringify(list.slice(0,8)));
            v3RenderLinkHistory();
        }

        function v3RenderLinkHistory() {
            const list = v3ReadLinkHistory();
            linkHistoryBox.classList.add('library-horizontal-track');

            if (historyCount) historyCount.textContent = String(list.length);

            if (!list.length) {
                linkHistoryBox.innerHTML =
                    '<div class="home-data-empty">Belum ada History. Buka manga melalui Link Reader untuk mula.</div>';
                return;
            }

            linkHistoryBox.innerHTML = list.slice(0, 8).map((item, index) => `
                <div class="link-history-item" data-link-history="${index}">
                    <div class="link-history-thumb">
                        ${item.thumb
                            ? `<img src="${escapeHtml(item.thumb)}" alt="Cover"/>`
                            : ''}
                    </div>
                    <div class="link-history-main">
                        <div class="link-history-title">${escapeHtml(item.title || item.url)}</div>
                        <div class="link-history-meta">
                            ${Number(item.pages || 0)} halaman
                            • <span class="time-counter" data-time="${item.time || Date.now()}">${formatTimeAgo(item.time)}</span>
                        </div>
                    </div>
                    <button class="link-history-delete" type="button" data-link-delete="${index}" title="Padam">&#215;</button>
                </div>
            `).join('');

            linkHistoryBox.querySelectorAll('[data-link-history]').forEach(row => {
                row.onclick = () => {
                    const item = list[Number(row.dataset.linkHistory)];
                    linkInput.value = item.url;
                    v3OpenLink(item.url);
                };
            });

            linkHistoryBox.querySelectorAll('[data-link-delete]').forEach(btn => {
                btn.onclick = event => {
                    event.stopPropagation();
                    const index = Number(btn.dataset.linkDelete);
                    const next = list.filter((_, i) => i !== index);
                    localStorage.setItem(LINK_HISTORY_KEY, JSON.stringify(next));
                    v3RenderLinkHistory();
                    toast('History item dipadam');
                };
            });
        }

        async function v3LoadRemoteImages(urls, title, sourceUrl) {
            if (!urls.length) throw new Error('Tiada image URL yang boleh dibaca.');
            stopAutoScroll(); closePanels(); cleanupObjectUrls();
            activeFile = {name:title || 'Link Manga', size:0};
            activeFileKey = `link::${sourceUrl}`;
            v3SourceType = 'link'; v3SourceUrl = sourceUrl; v3SourceTitle = title || 'Link Manga';
            totalPages = urls.length; viewer.innerHTML = '';
            urls.forEach((url,index) => {
                const img = document.createElement('img'); img.src = url; img.referrerPolicy = 'no-referrer';
                img.loading = index <= v3Preload ? 'eager' : 'lazy'; img.decoding = 'async'; img.dataset.index = String(index); viewer.appendChild(img);
            });
            buildThumbnails(); v3EnterReader(); restoreProgressForActiveFile(); updatePageIndicator(); updateReaderProgress(); v3UpdateInfo();
            v3SaveLinkHistory({url:sourceUrl,title:v3SourceTitle,pages:totalPages,thumb:urls[0] || ''});
            toast(`Link Reader: ${totalPages} halaman`);
        }

        async function v3OpenLink(rawUrl) {
            const url = String(rawUrl || '').trim();
            if (!/^https?:\/\//i.test(url)) { toast('Masukkan URL http/https yang sah.'); return; }
            linkChapters.classList.remove('open'); linkChapters.innerHTML = '';
            status.style.display = 'block'; status.textContent = 'Link Reader sedang membaca sumber...';
            try {
                if (/\.(jpg|jpeg|png|webp|gif)(?:\?|#|$)/i.test(url)) {
                    await v3LoadRemoteImages([url], new URL(url).pathname.split('/').pop() || 'Image', url); status.style.display = 'none'; return;
                }
                const response = await fetch(url, {cache:'no-store'});
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const type = (response.headers.get('content-type') || '').toLowerCase();
                if (/\.(cbz|zip|pdf)(?:\?|#|$)/i.test(url) ||
                    type.includes('application/zip') ||
                    type.includes('application/x-cbz') ||
                    type.includes('application/pdf')) {

                    const blob = await response.blob();
                    const fallbackName = type.includes('application/pdf') ? 'remote-manga.pdf' : 'remote-manga.zip';
                    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || fallbackName);
                    const file = new File([blob], name, {
                        type: blob.type || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/zip'),
                        lastModified: 1
                    });

                    await handleFile(file, {
                        persist: false,
                        sourceType: 'link',
                        sourceUrl: url,
                        sourceTitle: name
                    });

                    v3SaveLinkHistory({url,title:name,pages:totalPages,thumb:''});
                    status.style.display = 'none';
                    return;
                }
                let json;
                try { json = await response.json(); } catch (_) { throw new Error('Sumber bukan archive, image atau JSON yang disokong.'); }
                const direct = v3NormalizeImages(Array.isArray(json) ? json : (json.pages || json.images || []));
                if (direct.length) { await v3LoadRemoteImages(direct, json.title || 'Link Manga', url); status.style.display = 'none'; return; }
                const chapters = v3ExtractChapters(json);
                if (chapters.length) {
                    linkChapters.innerHTML = chapters.map((ch,index) => `<button class="link-chapter-btn" type="button" data-chapter="${index}"><b>${escapeHtml(ch.key)}</b><span>${escapeHtml(ch.title)}${ch.group ? ` • ${escapeHtml(ch.group)}` : ''} • ${ch.pages.length} pages</span></button>`).join('');
                    linkChapters.classList.add('open');
                    linkChapters.querySelectorAll('[data-chapter]').forEach(btn => btn.onclick = () => {
                        const ch = chapters[Number(btn.dataset.chapter)];
                        v3LoadRemoteImages(ch.pages, `${json.title || 'Manga'} - ${ch.title}`, `${url}#chapter=${encodeURIComponent(ch.key)}`);
                    });
                    status.style.display = 'none'; toast('Pilih chapter untuk mula membaca.'); return;
                }
                throw new Error('JSON ada, tetapi tiada pages/images yang disokong.');
            } catch (err) {
                console.error('Link Reader Error', err);
                status.style.display = 'block';
                status.textContent = `Link Reader gagal: ${err.message}. Jika host blok CORS, guna raw JSON/direct archive yang membenarkan browser access.`;
            }
        }
        linkOpenBtn.onclick = () => v3OpenLink(linkInput.value);
        linkInput.onkeydown = event => { if (event.key === 'Enter') v3OpenLink(linkInput.value); };

        /* History export/import */
        exportHistoryBtn.onclick = () => {
            const data = {version:3, exportedAt:new Date().toISOString(), localRecents:readRecents(), linkHistory:v3ReadLinkHistory(), progress:readAllProgress(), prefs:readPrefs(), v3Prefs:v3ReadPrefs()};
            const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'}); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `kirin-reader-history-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
        };
        importHistoryBtn.onclick = () => historyImportInput.click();
        historyImportInput.onchange = async event => {
            const file = event.target.files[0]; if (!file) return;
            try {
                const data = JSON.parse(await file.text());
                if (Array.isArray(data.localRecents)) localStorage.setItem(RECENT_KEY, JSON.stringify(data.localRecents));
                if (Array.isArray(data.linkHistory)) localStorage.setItem(LINK_HISTORY_KEY, JSON.stringify(data.linkHistory));
                if (data.progress) localStorage.setItem(PROGRESS_KEY, JSON.stringify(data.progress));
                if (data.prefs) localStorage.setItem(PREFS_KEY, JSON.stringify(data.prefs));
                if (data.v3Prefs) localStorage.setItem(V3_KEY, JSON.stringify(data.v3Prefs));
                loadRecentReads(); v3RenderLinkHistory(); v3LoadPrefs(); v3ApplyPrefs(); toast('History berjaya diimport');
            } catch (_) { toast('Fail history tidak sah'); }
            historyImportInput.value = '';
        };
        clearCacheBtn.onclick = async () => { if (confirm('Padam fail Local Reader yang disimpan dalam browser cache?')) { await libraryClear(); toast('Library cache dipadam'); } };

        const v3OldReset = resetSettingsBtn.onclick;
        resetSettingsBtn.onclick = () => {
            localStorage.removeItem(V3_KEY);
            v3LoadPrefs(); v3ApplyPrefs();
            if (typeof v3OldReset === 'function') v3OldReset();
        };

        /* Close/open settings overlay without locking home */
        const v3OldOpenTools = openToolsPanel;
        openToolsPanel = function() { v3OldOpenTools(); document.body.style.overflow = 'hidden'; };
        const v3OldClosePanels = closePanels;
        closePanels = function() { v3OldClosePanels(); document.body.style.overflow = ''; };

        clearLinkHistoryBtn.onclick = () => {
            const list = v3ReadLinkHistory();
            if (!list.length) return toast('History sudah kosong.');
            if (!confirm('Padam semua History Link Reader?')) return;

            localStorage.removeItem(LINK_HISTORY_KEY);
            v3RenderLinkHistory();
            toast('History Link Reader dipadam');
        };


        /* Recent Read / History compact tabs */
        function setLibraryTab(name) {
            activeLibraryTab = name === 'history' ? 'history' : 'recent';

            document.querySelectorAll('[data-library-tab]').forEach(button => {
                button.classList.toggle('active', button.dataset.libraryTab === activeLibraryTab);
            });

            document.querySelectorAll('[data-library-panel]').forEach(panel => {
                panel.classList.toggle('active', panel.dataset.libraryPanel === activeLibraryTab);
            });

            requestAnimationFrame(() => {
                const track = getActiveLibraryTrack();
                if (track) track.scrollLeft = 0;
            });
        }

        function getActiveLibraryTrack() {
            return activeLibraryTab === 'history' ? linkHistoryBox : recentList;
        }

        function slideLibrary(direction) {
            const track = getActiveLibraryTrack();
            if (!track) return;

            const firstCard =
                track.querySelector('.recent-item, .link-history-item');

            const cardWidth = firstCard
                ? firstCard.getBoundingClientRect().width
                : Math.min(320, track.clientWidth * .82);

            track.scrollBy({
                left: direction * (cardWidth + 9),
                behavior: 'smooth'
            });
        }

        recentTabBtn.onclick = () => setLibraryTab('recent');
        historyTabBtn.onclick = () => setLibraryTab('history');

        librarySlidePrev.onclick = () => slideLibrary(-1);
        librarySlideNext.onclick = () => slideLibrary(1);

        libraryActiveClear.onclick = () => {
            if (activeLibraryTab === 'history') {
                clearLinkHistoryBtn.click();
            } else {
                clearAllBtn.click();
            }
        };

        /* Mouse wheel can move the active horizontal slider without hijacking
           normal page scrolling unless Shift is held. */
        [recentList, linkHistoryBox].forEach(track => {
            track.addEventListener('wheel', event => {
                if (!event.shiftKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
                event.preventDefault();
                track.scrollLeft += event.deltaY;
            }, {passive:false});
        });

        setLibraryTab('recent');

        v3LoadPrefs(); v3ApplyPrefs(); v3RenderLinkHistory();
        viewer.style.display = 'none';
        setup.style.display = 'flex';

        const dropArea = document.getElementById('dropArea');
        dropArea.ondragover = event => {
            event.preventDefault();
            dropArea.style.borderColor = '#8ab4f8';
        };
        dropArea.ondragleave = () => dropArea.style.borderColor = '#333';
        dropArea.ondrop = event => {
            event.preventDefault();
            dropArea.style.borderColor = '#333';
            const file = event.dataTransfer.files[0];
            if (file) handleFile(file);
        };

        let dragDepth = 0;
        window.addEventListener('dragenter', event => {
            event.preventDefault();
            dragDepth++;
            globalDropOverlay.classList.add('active');
        });
        window.addEventListener('dragover', event => event.preventDefault());
        window.addEventListener('dragleave', event => {
            event.preventDefault();
            dragDepth = Math.max(0, dragDepth - 1);
            if (!dragDepth) globalDropOverlay.classList.remove('active');
        });
        window.addEventListener('drop', event => {
            event.preventDefault();
            dragDepth = 0;
            globalDropOverlay.classList.remove('active');

            const file = event.dataTransfer.files[0];
            if (file && /\.(cbz|zip|pdf)$/i.test(file.name || '')) handleFile(file);
        });


        /* =====================================================
           KIRIN READER v4 PERFORMANCE ENGINE
           - Lazy ZIP/CBZ extraction
           - Lazy PDF rendering
           - Memory window / object URL release
           - Number-first lazy thumbnails
           ===================================================== */

        const V4_BLANK_IMAGE =
            'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        const V4_PDFJS_URL =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        const V4_PDF_WORKER_URL =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const V4_LIBRARY_SAVE_LIMIT = 120 * 1024 * 1024;

        const v4PerformanceBadge = document.getElementById('v4PerformanceBadge');

        let v4SourceKind = 'none';       // none | zip | pdf | remote
        let v4ZipEntries = [];
        let v4PdfDoc = null;
        let v4PdfLoadingTask = null;
        let v4PdfFileUrl = '';
        let v4LazyObserver = null;
        let v4PageUrls = new Map();
        let v4PagePromises = new Map();
        let v4PerformanceMode = false;
        let v4ReleaseTimer = 0;

        function v4ShowPerformanceBadge(message = 'PERFORMANCE MODE') {
            if (!v4PerformanceBadge) return;
            v4PerformanceBadge.textContent = message;
            v4PerformanceBadge.classList.add('show');
            clearTimeout(v4PerformanceBadge._timer);
            v4PerformanceBadge._timer = setTimeout(
                () => v4PerformanceBadge.classList.remove('show'),
                2300
            );
        }

        function v4DestroySource() {
            if (v4LazyObserver) {
                v4LazyObserver.disconnect();
                v4LazyObserver = null;
            }

            v4PagePromises.clear();

            for (const url of v4PageUrls.values()) {
                try { URL.revokeObjectURL(url); } catch (_) {}
            }
            v4PageUrls.clear();

            if (v4PdfLoadingTask && typeof v4PdfLoadingTask.destroy === 'function') {
                try { v4PdfLoadingTask.destroy(); } catch (_) {}
            }

            if (v4PdfDoc && typeof v4PdfDoc.destroy === 'function') {
                try { v4PdfDoc.destroy(); } catch (_) {}
            }

            if (v4PdfFileUrl) {
                try { URL.revokeObjectURL(v4PdfFileUrl); } catch (_) {}
            }

            v4ZipEntries = [];
            v4PdfDoc = null;
            v4PdfLoadingTask = null;
            v4PdfFileUrl = '';
            v4SourceKind = 'none';
        }

        function v4PrepareReaderSource(file, options = {}) {
            stopAutoScroll();
            closePanels();
            cleanupObjectUrls();
            v4DestroySource();

            activeFile = file;

            const isLink = options.sourceType === 'link';
            v3SourceType = isLink ? 'link' : 'local';
            v3SourceUrl = options.sourceUrl || '';
            v3SourceTitle = options.sourceTitle || file.name;

            activeFileKey = isLink && v3SourceUrl
                ? `link::${v3SourceUrl}`
                : makeFileKey(file);

            activePageIndex = 0;
            totalPages = 0;
            viewer.innerHTML = '';
            thumbGrid.innerHTML = '';
            selectorThumbList.innerHTML = '';

            status.style.display = 'block';
            status.innerText = 'Menyediakan reader...';
        }

        function v4CreateLazyPages(count) {
            const fragment = document.createDocumentFragment();

            for (let index = 0; index < count; index++) {
                const img = document.createElement('img');
                img.src = V4_BLANK_IMAGE;
                img.alt = `Page ${index + 1}`;
                img.decoding = 'async';
                img.loading = 'lazy';
                img.dataset.index = String(index);
                img.className = 'v4-lazy-page';
                fragment.appendChild(img);
            }

            viewer.appendChild(fragment);
        }

        function v4SetupObserver() {
            if (v4LazyObserver) v4LazyObserver.disconnect();

            v4LazyObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    const index = Number(entry.target.dataset.index);
                    v4EnsurePageLoaded(index);
                    v4WarmAround(index);
                });
            }, {
                root: null,
                rootMargin: v4PerformanceMode ? '850px 0px' : '1350px 0px',
                threshold: 0.01
            });

            viewer.querySelectorAll('img.v4-lazy-page').forEach(img => {
                v4LazyObserver.observe(img);
            });
        }

        function v4GetPageElement(index) {
            return viewer.querySelector(`img[data-index="${index}"]`);
        }

        function v4MemoryRadius() {
            const preload = Math.max(1, Number(v3Preload || 3));
            if (v4PerformanceMode) {
                return currentMode === 'book'
                    ? Math.max(3, preload + 1)
                    : Math.max(5, preload + 2);
            }

            return currentMode === 'book'
                ? Math.max(5, preload + 2)
                : Math.max(8, preload + 4);
        }

        function v4WarmAround(center) {
            if (!['zip','pdf'].includes(v4SourceKind) || totalPages <= 0) return;

            const radius = Math.max(1, Number(v3Preload || 3));
            const start = Math.max(0, center - radius);
            const end = Math.min(totalPages - 1, center + radius);

            for (let i = start; i <= end; i++) {
                v4EnsurePageLoaded(i);
            }

            clearTimeout(v4ReleaseTimer);
            v4ReleaseTimer = setTimeout(() => v4ReleaseFarPages(center), 450);
        }

        function v4ReleaseFarPages(center) {
            if (!['zip','pdf'].includes(v4SourceKind)) return;

            const radius = v4MemoryRadius();

            for (const [index, url] of Array.from(v4PageUrls.entries())) {
                if (Math.abs(index - center) <= radius) continue;

                const img = v4GetPageElement(index);
                if (img) {
                    img.src = V4_BLANK_IMAGE;
                    img.classList.remove('v4-ready', 'v4-page-error');
                }

                try { URL.revokeObjectURL(url); } catch (_) {}
                v4PageUrls.delete(index);
                v4ResetThumb(index);
            }
        }

        async function v4EnsurePageLoaded(index) {
            index = Number(index);

            if (!Number.isFinite(index) || index < 0 || index >= totalPages) return null;
            if (!['zip','pdf'].includes(v4SourceKind)) return v4GetPageElement(index)?.src || null;
            if (v4PageUrls.has(index)) return v4PageUrls.get(index);
            if (v4PagePromises.has(index)) return v4PagePromises.get(index);

            const promise = (async () => {
                const img = v4GetPageElement(index);
                if (!img) return null;

                try {
                    let blob;

                    if (v4SourceKind === 'zip') {
                        const entry = v4ZipEntries[index];
                        if (!entry) throw new Error('ZIP page missing');
                        blob = await entry.async('blob');
                    } else {
                        blob = await v4RenderPdfPageBlob(index);
                    }

                    if (!blob) throw new Error('Page render failed');

                    const url = URL.createObjectURL(blob);
                    v4PageUrls.set(index, url);

                    img.onload = () => v5OnPageImageLoaded(index, img);
                    img.src = url;
                    img.classList.add('v4-ready');
                    img.classList.remove('v4-page-error');

                    v4UpdateThumb(index, url);
                    return url;

                } catch (err) {
                    console.error('Page load error', index + 1, err);
                    img.classList.add('v4-page-error');
                    return null;
                } finally {
                    v4PagePromises.delete(index);
                }
            })();

            v4PagePromises.set(index, promise);
            return promise;
        }

        async function v4RenderPdfPageBlob(index) {
            if (!v4PdfDoc) throw new Error('PDF document unavailable');

            const sourceIndex = Number.isInteger(v5PageOrder[index]) ? v5PageOrder[index] : index;
            const page = await v4PdfDoc.getPage(sourceIndex + 1);
            const base = page.getViewport({scale: 1});

            const cssTargetWidth = Math.max(
                320,
                Math.min(currentWidth || 900, window.innerWidth || 900)
            );

            const dpr = Math.min(window.devicePixelRatio || 1, v4PerformanceMode ? 1.15 : 1.45);
            const scale = Math.min(
                v4PerformanceMode ? 1.35 : 1.75,
                Math.max(.72, (cssTargetWidth / base.width) * dpr)
            );

            const viewport = page.getViewport({scale});
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', {alpha: false});

            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));

            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
                canvasContext: context,
                viewport
            }).promise;

            if (typeof page.cleanup === 'function') page.cleanup();

            const blob = await new Promise(resolve => {
                canvas.toBlob(
                    result => resolve(result),
                    'image/jpeg',
                    v4PerformanceMode ? .88 : .92
                );
            });

            canvas.width = 1;
            canvas.height = 1;
            return blob;
        }

        function v4BuildLazyThumbs() {
            thumbGrid.innerHTML = '';

            for (let index = 0; index < totalPages; index++) {
                const button = document.createElement('button');
                button.className = 'thumb-item';
                button.type = 'button';
                button.dataset.index = String(index);
                button.innerHTML =
                    `<div class="v4-thumb-shell" data-v4-thumb="${index}">` +
                    `<span>${index + 1}</span></div>`;

                button.onclick = () => {
                    jumpToPage(index + 1);
                    closePanels();
                };

                thumbGrid.appendChild(button);
            }

            updateThumbnailsActive();
        }

        function v4BuildLazySelectorThumbs() {
            selectorThumbList.innerHTML = '';
            if (!v3ShowPreviews) return;

            for (let index = 0; index < totalPages; index++) {
                const button = document.createElement('button');
                button.className = 'thumb-item';
                button.type = 'button';
                button.dataset.selectorIndex = String(index);
                button.innerHTML =
                    `<div class="v4-thumb-shell" data-v4-selector-thumb="${index}">` +
                    `<span>${index + 1}</span></div>` +
                    `<div class="selector-page-copy"><b>Page ${index + 1}</b><span>Click to open</span></div>`;

                button.onclick = () => jumpToPage(index + 1);
                selectorThumbList.appendChild(button);
            }

            v3UpdateSelectorThumbActive();
        }

        function v4UpdateThumb(index, url) {
            const normal = thumbGrid.querySelector(`[data-v4-thumb="${index}"]`);
            const selector = selectorThumbList.querySelector(`[data-v4-selector-thumb="${index}"]`);

            for (const shell of [normal, selector]) {
                if (!shell) continue;
                shell.innerHTML =
                    `<img src="${url}" alt="Page ${index + 1}"/>` +
                    `<span>${index + 1}</span>`;
            }
        }

        function v4ResetThumb(index) {
            const normal = thumbGrid.querySelector(`[data-v4-thumb="${index}"]`);
            const selector = selectorThumbList.querySelector(`[data-v4-selector-thumb="${index}"]`);

            for (const shell of [normal, selector]) {
                if (!shell) continue;
                shell.innerHTML = `<span>${index + 1}</span>`;
            }
        }

        async function v4MaybePersistLocalFile(file, options = {}) {
            if (options.persist === false || options.sourceType === 'link') return false;

            if ((file.size || 0) > V4_LIBRARY_SAVE_LIMIT) {
                toast('Fail besar: Library cache dimatikan supaya reader lebih ringan.');
                return false;
            }

            return await libraryPutFile(activeFileKey, file);
        }

        async function v4FinalizeLocalReader(file, options = {}) {
            buildThumbnails();
            v3BuildSelectorThumbs();
            v3EnterReader();

            restoreProgressForActiveFile();
            updatePageIndicator();
            updateReaderProgress();
            v3UpdateInfo();

            v4WarmAround(activePageIndex);

            if (options.sourceType !== 'link') {
                saveRecentRead(file, activeFileKey, '', totalPages);
            }

            status.style.display = 'none';

            if (v4PerformanceMode) {
                v4ShowPerformanceBadge(`${totalPages} PAGES • LAZY MODE`);
            }

            v5AfterBookOpen(file, options);
        }

        async function v4HandleZipFile(file, options = {}) {
            v4PrepareReaderSource(file, options);
            v4SourceKind = 'zip';

            status.innerText = 'Membaca struktur CBZ/ZIP tanpa extract semua page...';

            const zip = await JSZip.loadAsync(file);
            v5ActiveComicInfo = await v5ParseComicInfoFromZip(zip);
            v5ApplyComicInfoPreference(v5ActiveComicInfo, file.name);

            const entries = [];

            zip.forEach((path, entry) => {
                if (!entry.dir &&
                    /\.(jpg|jpeg|png|webp|gif)$/i.test(entry.name) &&
                    !entry.name.includes('__MACOSX')) {
                    entries.push(entry);
                }
            });

            if (!entries.length) throw new Error('Tiada imej sah di dalam arkib.');

            entries.sort((a, b) =>
                a.name.localeCompare(
                    b.name,
                    undefined,
                    {numeric: true, sensitivity: 'base'}
                )
            );

            v5ZipNaturalEntries = entries.slice();
            v5PageOrder = v5GetSavedPageOrder(activeFileKey, entries.length);
            v4ZipEntries = v5PageOrder.map(index => v5ZipNaturalEntries[index]).filter(Boolean);
            totalPages = v4ZipEntries.length;
            v4PerformanceMode =
                totalPages > 24 ||
                (file.size || 0) > 45 * 1024 * 1024;

            v4CreateLazyPages(totalPages);
            v4SetupObserver();

            await v4MaybePersistLocalFile(file, options);
            await v4FinalizeLocalReader(file, options);
        }

        function v4LoadPdfJs() {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = V4_PDF_WORKER_URL;
                return Promise.resolve(window.pdfjsLib);
            }

            if (v4LoadPdfJs._promise) return v4LoadPdfJs._promise;

            v4LoadPdfJs._promise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = V4_PDFJS_URL;
                script.async = true;

                script.onload = () => {
                    if (!window.pdfjsLib) {
                        reject(new Error('PDF.js gagal dimuatkan.'));
                        return;
                    }

                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = V4_PDF_WORKER_URL;
                    resolve(window.pdfjsLib);
                };

                script.onerror = () => reject(new Error('PDF.js gagal dimuatkan dari CDN.'));
                document.head.appendChild(script);
            });

            return v4LoadPdfJs._promise;
        }

        async function v4HandlePdfFile(file, options = {}) {
            v4PrepareReaderSource(file, options);
            v4SourceKind = 'pdf';
            v5ActiveComicInfo = v5MetadataFromFilename(file.name);
            v5ApplyComicInfoPreference(v5ActiveComicInfo, file.name);

            status.innerText = 'Memuat PDF engine...';
            const pdfjs = await v4LoadPdfJs();

            status.innerText = 'Membaca struktur PDF...';

            v4PdfFileUrl = URL.createObjectURL(file);
            v4PdfLoadingTask = pdfjs.getDocument({
                url: v4PdfFileUrl,
                disableAutoFetch: false,
                disableStream: false,
                disableRange: false
            });

            v4PdfDoc = await v4PdfLoadingTask.promise;
            totalPages = v4PdfDoc.numPages;

            if (!totalPages) throw new Error('PDF tidak mempunyai halaman.');
            v5PageOrder = v5GetSavedPageOrder(activeFileKey, totalPages);

            v4PerformanceMode =
                totalPages > 20 ||
                (file.size || 0) > 35 * 1024 * 1024;

            v4CreateLazyPages(totalPages);
            v4SetupObserver();

            await v4MaybePersistLocalFile(file, options);
            await v4FinalizeLocalReader(file, options);
        }

        /* Final Local Reader dispatcher */
        handleFile = async function(file, options = {}) {
            if (!file) return;

            const name = String(file.name || '').toLowerCase();
            const isZip = /\.(cbz|zip)$/i.test(name);
            const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';

            if (!isZip && !isPdf) {
                alert('Kirin Reader menyokong .cbz, .zip dan .pdf.');
                return;
            }

            try {
                if (isPdf) {
                    await v4HandlePdfFile(file, options);
                } else {
                    await v4HandleZipFile(file, options);
                }
            } catch (err) {
                console.error('Reader open error:', err);
                status.style.display = 'block';
                status.textContent = `Gagal membuka fail: ${err.message}`;
                if (!totalPages) {
                    setup.style.display = 'flex';
                    viewer.style.display = 'none';
                }
            }
        };

        /* Replace eager thumbnail builders */
        buildThumbnails = function() {
            v4BuildLazyThumbs();

            for (const [index, url] of v4PageUrls.entries()) {
                v4UpdateThumb(index, url);
            }
        };

        v3BuildSelectorThumbs = function() {
            v4BuildLazySelectorThumbs();

            for (const [index, url] of v4PageUrls.entries()) {
                v4UpdateThumb(index, url);
            }
        };

        /* Replace fake preload with actual lazy page warm-up */
        v3PreloadNearby = function() {
            v4WarmAround(activePageIndex);
        };

        /* Book pages are not visible to IntersectionObserver, so load them explicitly. */
        const v4PreviousRenderBookPages = renderBookPages;
        renderBookPages = function() {
            const result = v4PreviousRenderBookPages();

            if (['zip','pdf'].includes(v4SourceKind)) {
                v4EnsurePageLoaded(activePageIndex);

                if (doublePage) {
                    const pair = activePageIndex + 1;
                    if (!(v3SpreadOdd && activePageIndex === 0) && pair < totalPages) {
                        v4EnsurePageLoaded(pair);
                    }
                }

                v4WarmAround(activePageIndex);
            }

            return result;
        };

        const v4PreviousJumpToPage = jumpToPage;
        jumpToPage = function(pageNumber) {
            const index = clamp(Number(pageNumber || 1) - 1, 0, Math.max(0, totalPages - 1));

            if (['zip','pdf'].includes(v4SourceKind)) {
                v4EnsurePageLoaded(index);
                v4WarmAround(index);
            }

            return v4PreviousJumpToPage(pageNumber);
        };

        const v4PreviousUpdatePageIndicator = updatePageIndicator;
        updatePageIndicator = function() {
            const result = v4PreviousUpdatePageIndicator();

            if (['zip','pdf'].includes(v4SourceKind)) {
                v4WarmAround(activePageIndex);
            }

            return result;
        };

        /* Make thumbnails load a preview only when user explicitly opens navigator. */
        const v4PreviousOpenThumbPanel = openThumbPanel;
        openThumbPanel = function() {
            v4PreviousOpenThumbPanel();

            if (['zip','pdf'].includes(v4SourceKind)) {
                const start = Math.max(0, activePageIndex - 2);
                const end = Math.min(totalPages - 1, activePageIndex + 5);

                for (let i = start; i <= end; i++) {
                    v4EnsurePageLoaded(i);
                }
            }
        };

        /* Keep fit changes smooth for already-created placeholders. */
        const v4OldSetReaderWidth = setReaderWidth;
        setReaderWidth = function(width) {
            const result = v4OldSetReaderWidth(width);

            if (v4SourceKind === 'pdf') {
                // Existing PDF pages stay cached; newly loaded pages use the new width.
                v4ShowPerformanceBadge('PDF WIDTH UPDATED');
            }

            return result;
        };

        /* When returning home, release decompressed/rendered page cache. */
        const v4PreviousGoHome = v3GoHome;
        v3GoHome = function() {
            saveCurrentProgress(true);
            v4DestroySource();
            return v4PreviousGoHome();
        };
        homeBtn.onclick = v3GoHome;

        /* Rebind drop validation so PDF is accepted everywhere. */
        dropArea.ondrop = event => {
            event.preventDefault();
            dropArea.style.borderColor = '#333';

            const file = event.dataTransfer.files[0];
            if (file && /\.(cbz|zip|pdf)$/i.test(file.name || '')) {
                handleFile(file);
            }
        };

        /* Refresh visible page cache after mode switches. */
        const v4PreviousSetMode = setMode;
        setMode = function(mode, persist = true, restoring = false) {
            const result = v4PreviousSetMode(mode, persist, restoring);
            if (['zip','pdf'].includes(v4SourceKind)) {
                v4EnsurePageLoaded(activePageIndex);
                v4WarmAround(activePageIndex);
            }
            return result;
        };

        /* Cleanup v4 resources too. */


        /* =====================================================
           KIRIN READER v5 — FULL ADDON ENGINE
           ===================================================== */

        const V5_LIBRARY_META_KEY = 'kirin_reader_library_v5';
        const V5_PREFS_KEY = 'kirin_reader_v5_prefs';
        const V5_PAGE_BOOKMARK_KEY = 'kirin_reader_page_bookmarks_v5';
        const V5_PAGE_ORDER_KEY = 'kirin_reader_page_order_v5';
        const V5_ROTATION_KEY = 'kirin_reader_rotation_v5';
        const V5_SESSION_KEY = 'kirin_reader_sessions_v5';

        const modeWebtoonBtn = document.getElementById('modeWebtoonBtn');
        const multiFileBtn = document.getElementById('multiFileBtn');
        const folderBtn = document.getElementById('folderBtn');
        const multiFileInput = document.getElementById('multiFileInput');
        const folderInput = document.getElementById('folderInput');

        const libraryTabBtn = document.getElementById('libraryTabBtn');
        const sessionsTabBtn = document.getElementById('sessionsTabBtn');
        const libraryCount = document.getElementById('libraryCount');
        const sessionsCount = document.getElementById('sessionsCount');
        const libraryShelf = document.getElementById('libraryShelf');
        const sessionShelf = document.getElementById('sessionShelf');
        const librarySearch = document.getElementById('librarySearch');
        const librarySort = document.getElementById('librarySort');

        const selectorBookmark = document.getElementById('selectorBookmark');
        const comicInfoBox = document.getElementById('comicInfoBox');
        const pageBookmarkList = document.getElementById('pageBookmarkList');
        const prevChapterBtn = document.getElementById('prevChapterBtn');
        const nextChapterBtn = document.getElementById('nextChapterBtn');
        const pageManagerBtn = document.getElementById('pageManagerBtn');
        const openLibraryHomeBtn = document.getElementById('openLibraryHomeBtn');

        const smartSpreadOn = document.getElementById('smartSpreadOn');
        const smartSpreadOff = document.getElementById('smartSpreadOff');
        const memoryNormalBtn = document.getElementById('memoryNormalBtn');
        const memoryLowBtn = document.getElementById('memoryLowBtn');

        const contrastRange = document.getElementById('contrastRange');
        const contrastValue = document.getElementById('contrastValue');
        const invertBtn = document.getElementById('invertBtn');
        const rotateLeftBtn = document.getElementById('rotateLeftBtn');
        const rotateRightBtn = document.getElementById('rotateRightBtn');
        const imageResetBtn = document.getElementById('imageResetBtn');

        const pageManagerOverlay = document.getElementById('pageManagerOverlay');
        const pageManagerList = document.getElementById('pageManagerList');
        const pageManagerClose = document.getElementById('pageManagerClose');
        const pageManagerCancel = document.getElementById('pageManagerCancel');
        const pageManagerReset = document.getElementById('pageManagerReset');
        const pageManagerApply = document.getElementById('pageManagerApply');

        const chapterEndOverlay = document.getElementById('chapterEndOverlay');
        const chapterEndText = document.getElementById('chapterEndText');
        const chapterEndPrev = document.getElementById('chapterEndPrev');
        const chapterEndNext = document.getElementById('chapterEndNext');
        const chapterEndHome = document.getElementById('chapterEndHome');
        const chapterEndClose = document.getElementById('chapterEndClose');

        let v5ActiveComicInfo = {};
        let v5ZipNaturalEntries = [];
        let v5PageOrder = [];
        let v5PageManagerWorking = [];
        let v5SmartSpread = true;
        let v5LowMemory = false;
        let v5Webtoon = false;
        let v5Contrast = 100;
        let v5Invert = false;
        let v5SessionStart = 0;
        let v5SessionVisited = new Set();
        let v5SessionTimer = 0;
        let v5CurrentLibraryItem = null;
        let v5ChapterEndShown = false;
        const v5SessionFiles = new Map();

        function v5ReadJson(key, fallback) {
            try {
                const value = JSON.parse(localStorage.getItem(key) || 'null');
                return value === null ? fallback : value;
            } catch (_) {
                return fallback;
            }
        }

        function v5WriteJson(key, value) {
            localStorage.setItem(key, JSON.stringify(value));
        }

        function v5LoadPrefs() {
            const p = v5ReadJson(V5_PREFS_KEY, {});
            v5SmartSpread = p.smartSpread !== false;
            v5LowMemory = !!p.lowMemory;
            v5Contrast = clamp(Number(p.contrast || 100), 60, 160);
            v5Invert = !!p.invert;
            v5ApplyPrefs();
        }

        function v5SavePrefs() {
            v5WriteJson(V5_PREFS_KEY, {
                smartSpread: v5SmartSpread,
                lowMemory: v5LowMemory,
                contrast: v5Contrast,
                invert: v5Invert
            });
        }

        function v5ApplyPrefs() {
            document.documentElement.style.setProperty('--v5-contrast', String(v5Contrast / 100));
            document.documentElement.style.setProperty('--v5-invert', v5Invert ? '1' : '0');
            document.body.classList.toggle('v5-low-memory', v5LowMemory);

            smartSpreadOn.classList.toggle('active', v5SmartSpread);
            smartSpreadOff.classList.toggle('active', !v5SmartSpread);
            memoryNormalBtn.classList.toggle('active', !v5LowMemory);
            memoryLowBtn.classList.toggle('active', v5LowMemory);
            contrastRange.value = String(v5Contrast);
            contrastValue.textContent = `${v5Contrast}%`;
            invertBtn.classList.toggle('active', v5Invert);
        }

        /* ---------------- ComicInfo.xml ---------------- */
        function v5XmlText(doc, tag) {
            return doc.querySelector(tag)?.textContent?.trim() || '';
        }

        function v5ParseNumber(value) {
            const n = Number.parseFloat(String(value || '').replace(/[^\d.]+/g, ''));
            return Number.isFinite(n) ? n : null;
        }

        function v5MetadataFromFilename(fileName, relativePath = '') {
            const base = String(fileName || 'Untitled')
                .replace(/\.(cbz|zip|pdf)$/i, '')
                .trim();

            const chapterMatch =
                base.match(/(?:chapter|ch|c)[\s._-]*(\d+(?:\.\d+)?)/i) ||
                base.match(/[\s._-](\d+(?:\.\d+)?)$/);

            const volumeMatch = base.match(/(?:volume|vol|v)[\s._-]*(\d+(?:\.\d+)?)/i);

            let series = base
                .replace(/\[[^\]]+\]/g, ' ')
                .replace(/\([^)]*\d{4}[^)]*\)/g, ' ')
                .replace(/(?:chapter|ch|c)[\s._-]*\d+(?:\.\d+)?/ig, ' ')
                .replace(/(?:volume|vol|v)[\s._-]*\d+(?:\.\d+)?/ig, ' ')
                .replace(/[\s._-]+/g, ' ')
                .trim();

            if (relativePath && relativePath.includes('/')) {
                const folderSeries = relativePath.split('/')[0].trim();
                if (folderSeries && folderSeries !== fileName) series = folderSeries;
            }

            return {
                Title: base,
                Series: series || base,
                Number: chapterMatch ? chapterMatch[1] : '',
                Volume: volumeMatch ? volumeMatch[1] : '',
                Writer: '',
                Genre: '',
                Year: '',
                Summary: '',
                Manga: '',
                LanguageISO: ''
            };
        }

        async function v5ParseComicInfoFromZip(zip) {
            const fallback = v5MetadataFromFilename(activeFile?.name || '');
            if (!zip) return fallback;

            let comicEntry = null;
            zip.forEach((path, entry) => {
                if (!comicEntry && !entry.dir && /(^|\/)ComicInfo\.xml$/i.test(entry.name)) {
                    comicEntry = entry;
                }
            });

            if (!comicEntry) return fallback;

            try {
                const xml = await comicEntry.async('text');
                const doc = new DOMParser().parseFromString(xml, 'application/xml');

                if (doc.querySelector('parsererror')) return fallback;

                return {
                    Title: v5XmlText(doc, 'Title') || fallback.Title,
                    Series: v5XmlText(doc, 'Series') || fallback.Series,
                    Number: v5XmlText(doc, 'Number') || fallback.Number,
                    Volume: v5XmlText(doc, 'Volume') || fallback.Volume,
                    Writer: v5XmlText(doc, 'Writer'),
                    Penciller: v5XmlText(doc, 'Penciller'),
                    Inker: v5XmlText(doc, 'Inker'),
                    Colorist: v5XmlText(doc, 'Colorist'),
                    Publisher: v5XmlText(doc, 'Publisher'),
                    Genre: v5XmlText(doc, 'Genre'),
                    Year: v5XmlText(doc, 'Year'),
                    Summary: v5XmlText(doc, 'Summary'),
                    Manga: v5XmlText(doc, 'Manga'),
                    LanguageISO: v5XmlText(doc, 'LanguageISO'),
                    PageCount: v5XmlText(doc, 'PageCount')
                };
            } catch (err) {
                console.warn('ComicInfo parse failed:', err);
                return fallback;
            }
        }

        function v5ApplyComicInfoPreference(info, fileName) {
            const meta = info && Object.keys(info).length
                ? info
                : v5MetadataFromFilename(fileName);

            v5ActiveComicInfo = meta;

            if (meta.Title) {
                v3SourceTitle = meta.Title;
            }

            const manga = String(meta.Manga || '').toLowerCase();
            if (manga.includes('righttoleft')) {
                setDirection('rtl');
            }
        }

        function v5RenderComicInfo() {
            const info = v5ActiveComicInfo || {};
            const fields = [
                ['Title', info.Title],
                ['Series', info.Series],
                ['Chapter', info.Number],
                ['Volume', info.Volume],
                ['Writer', info.Writer],
                ['Artist', info.Penciller],
                ['Genre', info.Genre],
                ['Year', info.Year],
                ['Language', info.LanguageISO],
                ['Direction', info.Manga]
            ];

            const cells = fields
                .filter(([, value]) => value)
                .map(([label, value]) =>
                    `<div class="comic-info-cell"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`
                );

            if (info.Summary) {
                cells.push(
                    `<div class="comic-info-cell comic-info-summary"><strong>Summary</strong><span>${escapeHtml(info.Summary)}</span></div>`
                );
            }

            comicInfoBox.innerHTML = cells.length
                ? cells.join('')
                : '<div class="page-bookmark-empty">Metadata belum tersedia.</div>';
        }

        /* ---------------- Page order / manager ---------------- */
        function v5ReadPageOrders() {
            return v5ReadJson(V5_PAGE_ORDER_KEY, {});
        }

        function v5GetSavedPageOrder(key, count) {
            const stored = v5ReadPageOrders()[key];

            if (
                Array.isArray(stored) &&
                stored.length === count &&
                stored.every(index => Number.isInteger(index) && index >= 0 && index < count) &&
                new Set(stored).size === count
            ) {
                return stored.slice();
            }

            return Array.from({length: count}, (_, index) => index);
        }

        function v5SavePageOrder() {
            if (!activeFileKey || !v5PageOrder.length) return;
            const all = v5ReadPageOrders();
            all[activeFileKey] = v5PageOrder.slice();
            v5WriteJson(V5_PAGE_ORDER_KEY, all);
        }

        function v5PageSourceLabel(sourceIndex) {
            if (v4SourceKind === 'zip' && v5ZipNaturalEntries[sourceIndex]) {
                return v5ZipNaturalEntries[sourceIndex].name;
            }
            return `Source page ${sourceIndex + 1}`;
        }

        function v5OpenPageManager() {
            if (!totalPages) return toast('Belum ada manga dibuka.');

            v5PageManagerWorking =
                v5PageOrder.length === totalPages
                    ? v5PageOrder.slice()
                    : Array.from({length: totalPages}, (_, i) => i);

            v5RenderPageManager();
            pageManagerOverlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function v5ClosePageManager() {
            pageManagerOverlay.classList.remove('open');
            document.body.style.overflow = '';
        }

        function v5RenderPageManager() {
            pageManagerList.innerHTML = v5PageManagerWorking.map((sourceIndex, displayIndex) => `
                <div class="page-manager-item"
                     draggable="true"
                     data-manager-index="${displayIndex}">
                    <div class="page-manager-num">${displayIndex + 1}</div>
                    <div class="page-manager-name">${escapeHtml(v5PageSourceLabel(sourceIndex))}</div>
                    <div class="page-manager-actions">
                        <button type="button" data-move-up="${displayIndex}">&#8593;</button>
                        <button type="button" data-move-down="${displayIndex}">&#8595;</button>
                    </div>
                </div>
            `).join('');

            pageManagerList.querySelectorAll('[data-move-up]').forEach(btn => {
                btn.onclick = () => v5MoveManagerItem(Number(btn.dataset.moveUp), -1);
            });

            pageManagerList.querySelectorAll('[data-move-down]').forEach(btn => {
                btn.onclick = () => v5MoveManagerItem(Number(btn.dataset.moveDown), 1);
            });

            let dragFrom = -1;

            pageManagerList.querySelectorAll('.page-manager-item').forEach(item => {
                item.addEventListener('dragstart', () => {
                    dragFrom = Number(item.dataset.managerIndex);
                    item.classList.add('dragging');
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    dragFrom = -1;
                });

                item.addEventListener('dragover', event => event.preventDefault());

                item.addEventListener('drop', event => {
                    event.preventDefault();
                    const to = Number(item.dataset.managerIndex);
                    if (dragFrom < 0 || dragFrom === to) return;

                    const [moved] = v5PageManagerWorking.splice(dragFrom, 1);
                    v5PageManagerWorking.splice(to, 0, moved);
                    v5RenderPageManager();
                });
            });
        }

        function v5MoveManagerItem(index, delta) {
            const to = clamp(index + delta, 0, v5PageManagerWorking.length - 1);
            if (to === index) return;
            const [item] = v5PageManagerWorking.splice(index, 1);
            v5PageManagerWorking.splice(to, 0, item);
            v5RenderPageManager();
        }

        function v5ClearLoadedPages() {
            for (const url of v4PageUrls.values()) {
                try { URL.revokeObjectURL(url); } catch (_) {}
            }
            v4PageUrls.clear();
            v4PagePromises.clear();

            viewer.querySelectorAll('img[data-index]').forEach(img => {
                img.src = V4_BLANK_IMAGE;
                img.classList.remove('v4-ready', 'v4-page-error');
                delete img.dataset.v5Landscape;
            });

            buildThumbnails();
            v3BuildSelectorThumbs();
        }

        function v5ApplyManagerOrder(order) {
            if (!Array.isArray(order) || order.length !== totalPages) return;

            v5PageOrder = order.slice();
            v5SavePageOrder();

            if (v4SourceKind === 'zip' && v5ZipNaturalEntries.length) {
                v4ZipEntries = v5PageOrder
                    .map(sourceIndex => v5ZipNaturalEntries[sourceIndex])
                    .filter(Boolean);
            }

            activePageIndex = 0;
            v5ClearLoadedPages();
            updatePageIndicator();
            updateReaderProgress();
            v4WarmAround(0);
            toast('Page order disimpan');
        }

        pageManagerBtn.onclick = v5OpenPageManager;
        pageManagerClose.onclick = v5ClosePageManager;
        pageManagerCancel.onclick = v5ClosePageManager;
        pageManagerApply.onclick = () => {
            v5ApplyManagerOrder(v5PageManagerWorking);
            v5ClosePageManager();
        };
        pageManagerReset.onclick = () => {
            v5PageManagerWorking = Array.from({length: totalPages}, (_, i) => i);
            v5RenderPageManager();
        };

        /* ---------------- Library metadata ---------------- */
        function v5ReadLibrary() {
            const data = v5ReadJson(V5_LIBRARY_META_KEY, []);
            return Array.isArray(data) ? data : [];
        }

        function v5WriteLibrary(items) {
            v5WriteJson(V5_LIBRARY_META_KEY, items.slice(0, 600));
            v5RenderLibrary();
        }

        function v5LibraryItemProgress(item) {
            const p = getFileProgress(item.key);
            if (!p || !p.pages) return 0;
            return Math.round(((Number(p.page || 0) + 1) / Number(p.pages)) * 100);
        }

        function v5LibrarySortItems(items) {
            const sort = librarySort.value;

            if (sort === 'az') {
                return items.sort((a, b) =>
                    String(a.title || a.name).localeCompare(String(b.title || b.name), undefined, {numeric:true})
                );
            }

            if (sort === 'progress') {
                return items.sort((a, b) => v5LibraryItemProgress(b) - v5LibraryItemProgress(a));
            }

            if (sort === 'series') {
                return items.sort((a, b) => {
                    const s = String(a.series || '').localeCompare(String(b.series || ''), undefined, {numeric:true});
                    if (s) return s;
                    return (Number(a.chapter) || 0) - (Number(b.chapter) || 0);
                });
            }

            return items.sort((a, b) => Number(b.updatedAt || b.addedAt || 0) - Number(a.updatedAt || a.addedAt || 0));
        }

        function v5RenderLibrary() {
            let items = v5ReadLibrary();
            const q = String(librarySearch.value || '').trim().toLowerCase();

            if (q) {
                items = items.filter(item =>
                    [item.title, item.series, item.name, item.chapter, item.volume]
                        .join(' ')
                        .toLowerCase()
                        .includes(q)
                );
            }

            items = v5LibrarySortItems(items.slice());
            libraryCount.textContent = String(v5ReadLibrary().length);

            if (!items.length) {
                libraryShelf.innerHTML =
                    '<div class="home-data-empty">Library kosong atau tiada hasil carian.</div>';
                return;
            }

            libraryShelf.innerHTML = items.map(item => {
                const progress = v5LibraryItemProgress(item);
                return `
                    <article class="library-shelf-card" data-library-key="${escapeHtml(item.key)}">
                        <div class="library-shelf-cover">
                            ${item.thumb
                                ? `<img src="${item.thumb}" alt="${escapeHtml(item.title || item.name)}"/>`
                                : `<span>${item.type === 'pdf' ? 'PDF' : 'CBZ'}</span>`}
                        </div>
                        <span class="library-shelf-badge">${progress}%</span>
                        <div class="library-shelf-info">
                            <div class="library-shelf-title">${escapeHtml(item.title || item.name)}</div>
                            <div class="library-shelf-meta">
                                ${escapeHtml(item.series || 'Unknown Series')}
                                ${item.chapter ? ` • Ch ${escapeHtml(item.chapter)}` : ''}
                                ${item.cached ? ' • Cached' : ' • Session'}
                            </div>
                        </div>
                    </article>`;
            }).join('');

            libraryShelf.querySelectorAll('[data-library-key]').forEach(card => {
                card.onclick = () => v5OpenLibraryItem(card.dataset.libraryKey);
            });
        }

        async function v5LibraryMetadataForFile(file) {
            const relative = file.webkitRelativePath || '';
            const fallback = v5MetadataFromFilename(file.name, relative);
            let info = fallback;
            let thumb = '';

            if (/\.(cbz|zip)$/i.test(file.name)) {
                try {
                    const zip = await JSZip.loadAsync(file);
                    const oldActive = activeFile;
                    activeFile = file;
                    info = await v5ParseComicInfoFromZip(zip);
                    activeFile = oldActive;

                    const images = [];
                    zip.forEach((path, entry) => {
                        if (!entry.dir &&
                            /\.(jpg|jpeg|png|webp)$/i.test(entry.name) &&
                            !entry.name.includes('__MACOSX')) {
                            images.push(entry);
                        }
                    });

                    images.sort((a,b) =>
                        a.name.localeCompare(b.name, undefined, {numeric:true, sensitivity:'base'})
                    );

                    if (images[0]) {
                        const blob = await images[0].async('blob');
                        thumb = await makeThumbDataUrl(blob);
                    }
                } catch (err) {
                    console.warn('Library metadata parse failed:', err);
                }
            }

            return {info, thumb};
        }

        async function v5RegisterFiles(fileList, options = {}) {
            const files = Array.from(fileList || [])
                .filter(file => /\.(cbz|zip|pdf)$/i.test(file.name || ''));

            if (!files.length) {
                toast('Tiada CBZ/ZIP/PDF ditemui.');
                return;
            }

            let library = v5ReadLibrary();
            let added = 0;
            let duplicate = 0;

            status.style.display = 'block';

            for (let index = 0; index < files.length; index++) {
                const file = files[index];
                status.textContent = `Library ${index + 1}/${files.length}: ${file.name}`;

                const key = makeFileKey(file);
                v5SessionFiles.set(key, file);

                const same = library.find(item =>
                    item.key === key ||
                    (item.name === file.name && Number(item.size || 0) === Number(file.size || 0))
                );

                if (same) {
                    duplicate++;
                    same.updatedAt = Date.now();
                    continue;
                }

                const {info, thumb} = await v5LibraryMetadataForFile(file);
                let cached = false;

                if ((file.size || 0) <= V4_LIBRARY_SAVE_LIMIT) {
                    cached = await libraryPutFile(key, file);
                }

                const type = /\.pdf$/i.test(file.name) ? 'pdf' : 'archive';

                library.push({
                    key,
                    name: file.name,
                    title: info.Title || file.name,
                    series: info.Series || file.name,
                    chapter: info.Number || '',
                    volume: info.Volume || '',
                    writer: info.Writer || '',
                    genre: info.Genre || '',
                    summary: info.Summary || '',
                    type,
                    size: file.size || 0,
                    relativePath: file.webkitRelativePath || '',
                    thumb,
                    cached,
                    addedAt: Date.now(),
                    updatedAt: Date.now()
                });

                added++;
                v5WriteJson(V5_LIBRARY_META_KEY, library);
            }

            status.style.display = 'none';
            v5WriteLibrary(library);
            setLibraryTab('library');
            toast(`${added} ditambah${duplicate ? ` • ${duplicate} duplicate dilepas` : ''}`);
        }

        async function v5OpenLibraryItem(key) {
            const item = v5ReadLibrary().find(x => x.key === key);
            if (!item) return toast('Library item tidak ditemui.');

            let file = v5SessionFiles.get(key) || null;
            if (!file) file = await libraryGetFile(key);

            if (!file) {
                toast('Fail tidak cached. Tambah semula file/folder asal.');
                return;
            }

            v5CurrentLibraryItem = item;
            await handleFile(file);
        }

        async function v5EnsureActiveInLibrary(file) {
            if (!file || v3SourceType === 'link') return null;

            let library = v5ReadLibrary();
            let item = library.find(x => x.key === activeFileKey);

            if (!item) {
                const info = v5ActiveComicInfo || v5MetadataFromFilename(file.name);
                item = {
                    key: activeFileKey,
                    name: file.name,
                    title: info.Title || file.name,
                    series: info.Series || file.name,
                    chapter: info.Number || '',
                    volume: info.Volume || '',
                    writer: info.Writer || '',
                    genre: info.Genre || '',
                    summary: info.Summary || '',
                    type: /\.pdf$/i.test(file.name) ? 'pdf' : 'archive',
                    size: file.size || 0,
                    thumb: '',
                    cached: (file.size || 0) <= V4_LIBRARY_SAVE_LIMIT,
                    addedAt: Date.now(),
                    updatedAt: Date.now()
                };
                library.push(item);
            } else {
                item.updatedAt = Date.now();
                item.title = v5ActiveComicInfo.Title || item.title;
                item.series = v5ActiveComicInfo.Series || item.series;
                item.chapter = v5ActiveComicInfo.Number || item.chapter;
                item.volume = v5ActiveComicInfo.Volume || item.volume;
            }

            v5SessionFiles.set(activeFileKey, file);
            v5WriteLibrary(library);
            return item;
        }

        multiFileBtn.onclick = () => multiFileInput.click();
        folderBtn.onclick = () => folderInput.click();

        multiFileInput.onchange = async event => {
            await v5RegisterFiles(event.target.files);
            event.target.value = '';
        };

        folderInput.onchange = async event => {
            await v5RegisterFiles(event.target.files, {folder:true});
            event.target.value = '';
        };

        librarySearch.oninput = v5RenderLibrary;
        librarySort.onchange = v5RenderLibrary;

        /* ---------------- Smart chapter navigation ---------------- */
        function v5SeriesItems() {
            if (!v5CurrentLibraryItem) return [];
            const series = String(v5CurrentLibraryItem.series || '').trim().toLowerCase();

            return v5ReadLibrary()
                .filter(item => String(item.series || '').trim().toLowerCase() === series)
                .sort((a, b) => {
                    const ac = v5ParseNumber(a.chapter) ?? v5ParseNumber(a.volume) ?? 999999;
                    const bc = v5ParseNumber(b.chapter) ?? v5ParseNumber(b.volume) ?? 999999;
                    if (ac !== bc) return ac - bc;
                    return String(a.name).localeCompare(String(b.name), undefined, {numeric:true});
                });
        }

        function v5SiblingChapter(delta) {
            const items = v5SeriesItems();
            if (!items.length || !v5CurrentLibraryItem) return null;

            const index = items.findIndex(item => item.key === v5CurrentLibraryItem.key);
            if (index < 0) return null;
            return items[index + delta] || null;
        }

        function v5RefreshChapterButtons() {
            const prev = v5SiblingChapter(-1);
            const next = v5SiblingChapter(1);

            prevChapterBtn.disabled = !prev;
            nextChapterBtn.disabled = !next;
            chapterEndPrev.disabled = !prev;
            chapterEndNext.disabled = !next;

            chapterEndPrev.textContent = prev ? `← ${prev.title}` : 'Previous Chapter';
            chapterEndNext.textContent = next ? `${next.title} →` : 'Next Chapter';
        }

        prevChapterBtn.onclick = () => {
            const item = v5SiblingChapter(-1);
            if (item) v5OpenLibraryItem(item.key);
        };

        nextChapterBtn.onclick = () => {
            const item = v5SiblingChapter(1);
            if (item) v5OpenLibraryItem(item.key);
        };

        openLibraryHomeBtn.onclick = () => {
            closePanels();
            v3GoHome();
            setLibraryTab('library');
        };

        /* ---------------- Page bookmarks ---------------- */
        function v5ReadPageBookmarks() {
            return v5ReadJson(V5_PAGE_BOOKMARK_KEY, {});
        }

        function v5CurrentBookmarks() {
            const all = v5ReadPageBookmarks();
            const arr = all[activeFileKey];
            return Array.isArray(arr) ? arr.slice().sort((a,b) => a-b) : [];
        }

        function v5TogglePageBookmark() {
            if (!activeFileKey || !totalPages) return;

            const all = v5ReadPageBookmarks();
            let pages = Array.isArray(all[activeFileKey]) ? all[activeFileKey].slice() : [];
            const found = pages.indexOf(activePageIndex);

            if (found >= 0) {
                pages.splice(found, 1);
                toast(`Bookmark page ${activePageIndex + 1} dibuang`);
            } else {
                pages.push(activePageIndex);
                pages.sort((a,b) => a-b);
                toast(`Page ${activePageIndex + 1} dibookmark`);
            }

            all[activeFileKey] = pages;
            v5WriteJson(V5_PAGE_BOOKMARK_KEY, all);
            v5RenderPageBookmarks();
            v5UpdateBookmarkButton();
        }

        function v5UpdateBookmarkButton() {
            const bookmarked = v5CurrentBookmarks().includes(activePageIndex);
            selectorBookmark.classList.toggle('bookmarked', bookmarked);
            selectorBookmark.innerHTML = bookmarked ? '&#9733;' : '&#9734;';
        }

        function v5RenderPageBookmarks() {
            const pages = v5CurrentBookmarks();

            if (!pages.length) {
                pageBookmarkList.innerHTML =
                    '<span class="page-bookmark-empty">Belum ada page bookmark.</span>';
                return;
            }

            pageBookmarkList.innerHTML = pages.map(page =>
                `<button class="page-bookmark-chip" type="button" data-bookmark-page="${page}">Page ${page + 1}</button>`
            ).join('');

            pageBookmarkList.querySelectorAll('[data-bookmark-page]').forEach(btn => {
                btn.onclick = () => {
                    jumpToPage(Number(btn.dataset.bookmarkPage) + 1);
                    closePanels();
                };
            });
        }

        selectorBookmark.onclick = v5TogglePageBookmark;

        /* ---------------- Reading sessions ---------------- */
        function v5ReadSessions() {
            const sessions = v5ReadJson(V5_SESSION_KEY, []);
            return Array.isArray(sessions) ? sessions : [];
        }

        function v5StartSession() {
            v5EndSession(false);
            v5SessionStart = Date.now();
            v5SessionVisited = new Set([activePageIndex]);

            clearInterval(v5SessionTimer);
            v5SessionTimer = setInterval(() => v5RenderSessions(), 30000);
        }

        function v5MarkPageRead() {
            if (!v5SessionStart || !totalPages) return;
            v5SessionVisited.add(activePageIndex);
        }

        function v5EndSession(completed = false) {
            if (!v5SessionStart) return;

            const duration = Date.now() - v5SessionStart;
            if (duration > 3000 || v5SessionVisited.size > 1) {
                const sessions = v5ReadSessions();
                sessions.unshift({
                    key: activeFileKey,
                    title: v3SourceTitle || activeFile?.name || 'Reader',
                    source: v3SourceType || 'local',
                    durationMs: duration,
                    pagesRead: v5SessionVisited.size,
                    completed: !!completed,
                    time: Date.now()
                });
                v5WriteJson(V5_SESSION_KEY, sessions.slice(0, 120));
            }

            v5SessionStart = 0;
            v5SessionVisited = new Set();
            clearInterval(v5SessionTimer);
            v5SessionTimer = 0;
            v5RenderSessions();
        }

        function v5DurationText(ms) {
            const minutes = Math.max(1, Math.round(ms / 60000));
            if (minutes < 60) return `${minutes} min`;
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return `${h}h ${m}m`;
        }

        function v5RenderSessions() {
            const sessions = v5ReadSessions();
            sessionsCount.textContent = String(sessions.length);

            const todayKey = new Date().toDateString();
            const today = sessions.filter(s => new Date(s.time).toDateString() === todayKey);
            const todayMs = today.reduce((sum, s) => sum + Number(s.durationMs || 0), 0);
            const todayPages = today.reduce((sum, s) => sum + Number(s.pagesRead || 0), 0);
            const completed = sessions.filter(s => s.completed).length;

            const summary = [
                `<div class="session-summary-card"><b>Hari ini</b><strong>${v5DurationText(todayMs)}</strong><span>${todayPages} page dibaca</span></div>`,
                `<div class="session-summary-card"><b>Completed</b><strong>${completed}</strong><span>chapter/session selesai</span></div>`
            ];

            const recent = sessions.slice(0, 10).map(s => `
                <div class="session-summary-card">
                    <b>${escapeHtml(s.title)}</b>
                    <strong>${v5DurationText(s.durationMs)}</strong>
                    <span>${s.pagesRead} pages • ${s.completed ? 'Completed' : 'Stopped'} • ${formatTimeAgo(s.time)}</span>
                </div>
            `);

            sessionShelf.innerHTML = [...summary, ...recent].join('');
        }

        /* ---------------- Smart Spread / landscape ---------------- */
        function v5OnPageImageLoaded(index, img) {
            if (!img) return;

            const landscape =
                img.naturalWidth > 0 &&
                img.naturalHeight > 0 &&
                img.naturalWidth / img.naturalHeight > 1.18;

            img.dataset.v5Landscape = landscape ? '1' : '0';
            v5ApplyPageImageState(index);

            if (currentMode === 'book' && v5SmartSpread &&
                (index === activePageIndex || index === activePageIndex + 1)) {
                renderBookPages();
            }
        }

        function v5IsLandscape(index) {
            return v4GetPageElement(index)?.dataset.v5Landscape === '1';
        }

        function v5BookCurrentSingle() {
            if (!doublePage) return true;
            if (!v5SmartSpread) return false;
            if (activePageIndex === 0) return true;
            if (v5IsLandscape(activePageIndex)) return true;
            if (v5IsLandscape(activePageIndex + 1)) return true;
            return false;
        }

        smartSpreadOn.onclick = () => {
            v5SmartSpread = true;
            v5SavePrefs();
            v5ApplyPrefs();
            renderBookPages();
        };

        smartSpreadOff.onclick = () => {
            v5SmartSpread = false;
            v5SavePrefs();
            v5ApplyPrefs();
            renderBookPages();
        };

        /* Full replacement of Book rendering to support smart spreads. */
        renderBookPages = function() {
            if (currentMode !== 'book') return;

            const images = viewer.querySelectorAll('img');
            images.forEach(img => img.classList.remove('active','active-pair'));
            if (!images.length) return;

            activePageIndex = clamp(activePageIndex, 0, images.length - 1);
            images[activePageIndex].classList.add('active');

            v4EnsurePageLoaded(activePageIndex);

            let pair = -1;

            if (doublePage && !v5BookCurrentSingle()) {
                pair = activePageIndex + 1;

                if (v3SpreadOdd && activePageIndex === 0) pair = -1;

                if (
                    pair >= 0 &&
                    pair < images.length &&
                    !(v5SmartSpread && v5IsLandscape(pair))
                ) {
                    images[pair].classList.add('active-pair');
                    v4EnsurePageLoaded(pair);
                }
            }

            updateThumbnailsActive();
            v3UpdateSelectorThumbActive();
            v4WarmAround(activePageIndex);
        };

        /* Smart book navigation + chapter end. */
        const v5OldChangePage = changePage;
        changePage = function(next = true) {
            if (!totalPages) return;

            if (currentMode !== 'book') {
                if (next && activePageIndex >= totalPages - 1) {
                    v5ShowChapterEnd();
                    return;
                }
                return v5OldChangePage(next);
            }

            if (next) {
                const step = doublePage && !v5BookCurrentSingle() ? 2 : 1;
                const target = activePageIndex + step;

                if (target >= totalPages) {
                    v5ShowChapterEnd();
                    return;
                }

                activePageIndex = target;
            } else {
                if (activePageIndex <= 0) return toast('Sudah halaman pertama');

                let target = Math.max(0, activePageIndex - 1);

                if (
                    doublePage &&
                    activePageIndex > 1 &&
                    !(v5SmartSpread && (target === 0 || v5IsLandscape(target)))
                ) {
                    target = Math.max(0, activePageIndex - 2);
                }

                activePageIndex = target;
            }

            if (resetPageScroll) window.scrollTo(0, 0);
            renderBookPages();
            updatePageIndicator();
            updateReaderProgress();
            saveCurrentProgress();
            v5MarkPageRead();
        };

        /* ---------------- Webtoon ---------------- */
        function v5SetWebtoon(enabled) {
            v5Webtoon = !!enabled;

            if (v5Webtoon) {
                setMode('list');
                viewer.classList.add('webtoon-mode');
                modeWebtoonBtn.classList.add('active');
                modeListBtn.classList.remove('active');
                modeBookBtn.classList.remove('active');
                stopAutoScroll();
                requestAnimationFrame(() =>
                    viewer.querySelector(`img[data-index="${activePageIndex}"]`)
                        ?.scrollIntoView({block:'start'})
                );
            } else {
                viewer.classList.remove('webtoon-mode');
                modeWebtoonBtn.classList.remove('active');
                modeListBtn.classList.toggle('active', currentMode === 'list');
            }
        }

        modeWebtoonBtn.onclick = () => v5SetWebtoon(!v5Webtoon);

        const v5OldModeListClick = modeListBtn.onclick;
        modeListBtn.onclick = () => {
            v5Webtoon = false;
            viewer.classList.remove('webtoon-mode');
            modeWebtoonBtn.classList.remove('active');
            if (typeof v5OldModeListClick === 'function') v5OldModeListClick();
        };

        const v5OldModeBookClick = modeBookBtn.onclick;
        modeBookBtn.onclick = () => {
            v5Webtoon = false;
            viewer.classList.remove('webtoon-mode');
            modeWebtoonBtn.classList.remove('active');
            if (typeof v5OldModeBookClick === 'function') v5OldModeBookClick();
        };

        /* ---------------- Low Memory ---------------- */
        memoryNormalBtn.onclick = () => {
            v5LowMemory = false;
            v5SavePrefs();
            v5ApplyPrefs();
            toast('Memory Mode: Normal');
        };

        memoryLowBtn.onclick = () => {
            v5LowMemory = true;
            v5SavePrefs();
            v5ApplyPrefs();
            v4ReleaseFarPages(activePageIndex);
            toast('Memory Mode: Low');
        };

        v4MemoryRadius = function() {
            const preload = Math.max(1, Number(v3Preload || 3));

            if (v5LowMemory) {
                return currentMode === 'book' ? 2 : 4;
            }

            if (v4PerformanceMode) {
                return currentMode === 'book'
                    ? Math.max(3, preload + 1)
                    : Math.max(5, preload + 2);
            }

            return currentMode === 'book'
                ? Math.max(5, preload + 2)
                : Math.max(8, preload + 4);
        };

        const v5OldWarmAround = v4WarmAround;
        v4WarmAround = function(center) {
            if (!v5LowMemory) return v5OldWarmAround(center);

            if (!['zip','pdf'].includes(v4SourceKind) || totalPages <= 0) return;

            const radius = 1;
            for (let i = Math.max(0, center - radius); i <= Math.min(totalPages - 1, center + radius); i++) {
                v4EnsurePageLoaded(i);
            }

            clearTimeout(v4ReleaseTimer);
            v4ReleaseTimer = setTimeout(() => v4ReleaseFarPages(center), 180);
        };

        /* ---------------- Image controls ---------------- */
        function v5ReadRotations() {
            return v5ReadJson(V5_ROTATION_KEY, {});
        }

        function v5PageRotation(index) {
            const all = v5ReadRotations();
            return Number(all[activeFileKey]?.[index] || 0);
        }

        function v5SetPageRotation(index, degrees) {
            if (!activeFileKey) return;

            const all = v5ReadRotations();
            if (!all[activeFileKey]) all[activeFileKey] = {};
            all[activeFileKey][index] = ((degrees % 360) + 360) % 360;
            v5WriteJson(V5_ROTATION_KEY, all);
            v5ApplyPageImageState(index);
        }

        function v5ApplyPageImageState(index) {
            const img = v4GetPageElement(index);
            if (!img) return;

            const rotation = v5PageRotation(index);
            img.style.transform = rotation ? `rotate(${rotation}deg)` : '';
            img.style.transformOrigin = 'center center';
        }

        contrastRange.oninput = () => {
            v5Contrast = clamp(Number(contrastRange.value), 60, 160);
            v5ApplyPrefs();
            v5SavePrefs();
        };

        invertBtn.onclick = () => {
            v5Invert = !v5Invert;
            v5ApplyPrefs();
            v5SavePrefs();
        };

        rotateLeftBtn.onclick = () =>
            v5SetPageRotation(activePageIndex, v5PageRotation(activePageIndex) - 90);

        rotateRightBtn.onclick = () =>
            v5SetPageRotation(activePageIndex, v5PageRotation(activePageIndex) + 90);

        imageResetBtn.onclick = () => {
            v5Contrast = 100;
            v5Invert = false;
            v5SetPageRotation(activePageIndex, 0);
            v5ApplyPrefs();
            v5SavePrefs();
        };

        const v5OldEnsurePageLoaded = v4EnsurePageLoaded;
        v4EnsurePageLoaded = async function(index) {
            const url = await v5OldEnsurePageLoaded(index);
            v5ApplyPageImageState(Number(index));
            return url;
        };

        /* ---------------- Chapter end ---------------- */
        function v5ShowChapterEnd() {
            if (chapterEndOverlay.classList.contains('open')) return;

            v5EndSession(true);
            v5RefreshChapterButtons();

            const next = v5SiblingChapter(1);
            chapterEndText.textContent = next
                ? `Selesai ${v3SourceTitle || 'chapter ini'}. Next: ${next.title}`
                : 'Kau sudah sampai ke halaman terakhir.';

            chapterEndOverlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function v5CloseChapterEnd() {
            chapterEndOverlay.classList.remove('open');
            document.body.style.overflow = '';
        }

        chapterEndClose.onclick = v5CloseChapterEnd;
        chapterEndHome.onclick = () => {
            v5CloseChapterEnd();
            v3GoHome();
        };
        chapterEndPrev.onclick = () => {
            const item = v5SiblingChapter(-1);
            if (!item) return;
            v5CloseChapterEnd();
            v5OpenLibraryItem(item.key);
        };
        chapterEndNext.onclick = () => {
            const item = v5SiblingChapter(1);
            if (!item) return;
            v5CloseChapterEnd();
            v5OpenLibraryItem(item.key);
        };

        /* ---------------- Homepage tabs extended ---------------- */
        setLibraryTab = function(name) {
            const valid = ['recent','history','library','sessions'];
            activeLibraryTab = valid.includes(name) ? name : 'recent';

            document.querySelectorAll('[data-library-tab]').forEach(button => {
                button.classList.toggle('active', button.dataset.libraryTab === activeLibraryTab);
            });

            document.querySelectorAll('[data-library-panel]').forEach(panel => {
                panel.classList.toggle('active', panel.dataset.libraryPanel === activeLibraryTab);
            });

            if (activeLibraryTab === 'library') v5RenderLibrary();
            if (activeLibraryTab === 'sessions') v5RenderSessions();

            requestAnimationFrame(() => {
                const track = getActiveLibraryTrack();
                if (track) track.scrollLeft = 0;
            });
        };

        getActiveLibraryTrack = function() {
            if (activeLibraryTab === 'history') return linkHistoryBox;
            if (activeLibraryTab === 'library') return libraryShelf;
            if (activeLibraryTab === 'sessions') return sessionShelf;
            return recentList;
        };

        libraryTabBtn.onclick = () => setLibraryTab('library');
        sessionsTabBtn.onclick = () => setLibraryTab('sessions');

        libraryActiveClear.onclick = () => {
            if (activeLibraryTab === 'history') {
                clearLinkHistoryBtn.click();
                return;
            }

            if (activeLibraryTab === 'library') {
                if (!confirm('Padam semua metadata Library dan cache file?')) return;
                v5WriteJson(V5_LIBRARY_META_KEY, []);
                libraryClear();
                v5SessionFiles.clear();
                v5RenderLibrary();
                toast('Library dipadam');
                return;
            }

            if (activeLibraryTab === 'sessions') {
                localStorage.removeItem(V5_SESSION_KEY);
                v5RenderSessions();
                toast('Reading sessions dipadam');
                return;
            }

            clearAllBtn.click();
        };

        [libraryShelf, sessionShelf].forEach(track => {
            track.addEventListener('wheel', event => {
                if (!event.shiftKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
                event.preventDefault();
                track.scrollLeft += event.deltaY;
            }, {passive:false});
        });

        /* Recent clear no longer deletes the Library itself. */
        clearAllBtn.onclick = () => {
            if (!confirm('Padam Recent Read sahaja? Library manga masih kekal.')) return;
            localStorage.removeItem(RECENT_KEY);
            loadRecentReads();
            toast('Recent Read dipadam');
        };

        /* ---------------- Open hook ---------------- */
        async function v5AfterBookOpen(file, options = {}) {
            v5ChapterEndShown = false;
            v5Webtoon = false;
            viewer.classList.remove('webtoon-mode');
            modeWebtoonBtn.classList.remove('active');

            if (options.sourceType !== 'link') {
                v5CurrentLibraryItem = await v5EnsureActiveInLibrary(file);
            } else {
                v5CurrentLibraryItem = null;
            }

            v5RenderComicInfo();
            v5RenderPageBookmarks();
            v5UpdateBookmarkButton();
            v5RefreshChapterButtons();
            v5StartSession();
            v5RenderLibrary();
            v5RenderSessions();

            if (v5LowMemory) {
                v4ReleaseFarPages(activePageIndex);
            }
        }

        /* Render first-page thumbnail into Library after it becomes available. */
        async function v5UpdateActiveLibraryThumb() {
            if (!v5CurrentLibraryItem || v5CurrentLibraryItem.thumb) return;

            try {
                let thumb = '';

                if (v4SourceKind === 'zip' && v4ZipEntries[0]) {
                    const blob = await v4ZipEntries[0].async('blob');
                    thumb = await makeThumbDataUrl(blob);
                } else if (v4SourceKind === 'pdf' && v4PdfDoc) {
                    const blob = await v4RenderPdfPageBlob(0);
                    thumb = await makeThumbDataUrl(blob);
                }

                if (!thumb) return;

                const library = v5ReadLibrary();
                const item = library.find(x => x.key === v5CurrentLibraryItem.key);
                if (item) {
                    item.thumb = thumb;
                    v5CurrentLibraryItem.thumb = thumb;
                    v5WriteLibrary(library);
                }
            } catch (_) {}
        }

        const v5OldPageLoadedHook = v5OnPageImageLoaded;
        v5OnPageImageLoaded = function(index, img) {
            v5OldPageLoadedHook(index, img);
            if (index === 0) v5UpdateActiveLibraryThumb();
        };

        /* Session/page hooks */
        const v5OldUpdatePageIndicator = updatePageIndicator;
        updatePageIndicator = function() {
            const result = v5OldUpdatePageIndicator();
            v5MarkPageRead();
            v5UpdateBookmarkButton();
            return result;
        };

        /* Scroll-mode chapter end with a small debounce. */
        let v5ScrollEndTimer = 0;
        window.addEventListener('scroll', () => {
            if (!totalPages || currentMode === 'book' || setup.style.display !== 'none') return;

            const nearBottom =
                window.innerHeight + window.scrollY >=
                document.documentElement.scrollHeight - 8;

            clearTimeout(v5ScrollEndTimer);

            if (nearBottom) {
                v5ScrollEndTimer = setTimeout(() => {
                    if (!chapterEndOverlay.classList.contains('open')) {
                        v5ShowChapterEnd();
                    }
                }, 650);
            }
        }, {passive:true});

        /* End session when returning home. */
        const v5OldGoHome = v3GoHome;
        v3GoHome = function() {
            v5EndSession(false);
            return v5OldGoHome();
        };
        homeBtn.onclick = v3GoHome;


        /* =====================================================
           KIRIN READER v6 — PREMIUM ADDON ENGINE
           ===================================================== */

        const V6_PROFILE_KEY = 'kirin_reader_profiles_v6';
        const V6_CROP_KEY = 'kirin_reader_crop_v6';

        const cropOffBtn = document.getElementById('cropOffBtn');
        const cropAutoBtn = document.getElementById('cropAutoBtn');
        const cropManualBtn = document.getElementById('cropManualBtn');
        const cropManualRange = document.getElementById('cropManualRange');
        const cropManualValue = document.getElementById('cropManualValue');
        const cropStatusNote = document.getElementById('cropStatusNote');

        const mangaProfileTitle = document.getElementById('mangaProfileTitle');
        const mangaProfileState = document.getElementById('mangaProfileState');
        const mangaProfileDetail = document.getElementById('mangaProfileDetail');
        const saveMangaProfileBtn = document.getElementById('saveMangaProfileBtn');
        const resetMangaProfileBtn = document.getElementById('resetMangaProfileBtn');

        const seriesProgressStrip = document.getElementById('seriesProgressStrip');
        const libraryStatusFilter = document.getElementById('libraryStatusFilter');

        const storageUsageValue = document.getElementById('storageUsageValue');
        const storageQuotaValue = document.getElementById('storageQuotaValue');
        const storageMeterFill = document.getElementById('storageMeterFill');
        const storageReaderValue = document.getElementById('storageReaderValue');
        const storageList = document.getElementById('storageList');
        const refreshStorageBtn = document.getElementById('refreshStorageBtn');
        const removeAllCachedBtn = document.getElementById('removeAllCachedBtn');

        const touchZonesOn = document.getElementById('touchZonesOn');
        const touchZonesOff = document.getElementById('touchZonesOff');
        const touchZoneRange = document.getElementById('touchZoneRange');
        const touchZoneValue = document.getElementById('touchZoneValue');
        const touchZoneLayer = document.getElementById('touchZoneLayer');
        const touchZonePrev = document.getElementById('touchZonePrev');
        const touchZoneCenter = document.getElementById('touchZoneCenter');
        const touchZoneNext = document.getElementById('touchZoneNext');

        let v6CropMode = 'auto';
        let v6ManualCrop = 2;
        let v6CropCache = new Map();
        let v6ProfileSaveTimer = 0;

        let v6TouchEnabled = true;
        let v6TouchSide = 31;
        let v6ReaderChromeHidden = false;

        function v6ReadProfiles() {
            return v5ReadJson(V6_PROFILE_KEY, {});
        }

        function v6ReadCropPrefs() {
            return v5ReadJson(V6_CROP_KEY, {});
        }

        function v6SaveCropPrefs() {
            v5WriteJson(V6_CROP_KEY, {
                mode: v6CropMode,
                manual: v6ManualCrop,
                touchEnabled: v6TouchEnabled,
                touchSide: v6TouchSide
            });
        }

        function v6LoadGlobalAddonPrefs() {
            const p = v6ReadCropPrefs();
            v6CropMode = ['off','auto','manual'].includes(p.mode) ? p.mode : 'auto';
            v6ManualCrop = clamp(Number(p.manual ?? 2), 0, 12);
            v6TouchEnabled = p.touchEnabled !== false;
            v6TouchSide = clamp(Number(p.touchSide ?? 31), 20, 42);
            v6ApplyAddonPrefsUI();
        }

        function v6ApplyAddonPrefsUI() {
            cropOffBtn.classList.toggle('active', v6CropMode === 'off');
            cropAutoBtn.classList.toggle('active', v6CropMode === 'auto');
            cropManualBtn.classList.toggle('active', v6CropMode === 'manual');

            cropManualRange.value = String(v6ManualCrop);
            cropManualValue.textContent = `${v6ManualCrop}%`;

            touchZonesOn.classList.toggle('active', v6TouchEnabled);
            touchZonesOff.classList.toggle('active', !v6TouchEnabled);
            touchZoneRange.value = String(v6TouchSide);
            touchZoneValue.textContent = `${v6TouchSide}%`;
            document.documentElement.style.setProperty('--v6-touch-side', `${v6TouchSide}%`);

            if (v6CropMode === 'auto') {
                cropStatusNote.innerHTML =
                    '<b>Auto</b> • scan kecil per halaman; remote image yang blok canvas akan dibiarkan tanpa crop.';
            } else if (v6CropMode === 'manual') {
                cropStatusNote.innerHTML =
                    `<b>Manual</b> • crop ${v6ManualCrop}% pada setiap sisi.`;
            } else {
                cropStatusNote.innerHTML =
                    '<b>Off</b> • gambar dipaparkan tanpa crop.';
            }

            v6RefreshTouchZones();
        }

        /* ---------------- Auto Crop Margin ---------------- */
        function v6SetCropMode(mode) {
            v6CropMode = ['off','auto','manual'].includes(mode) ? mode : 'auto';
            v6CropCache.clear();
            v6SaveCropPrefs();
            v6ApplyAddonPrefsUI();

            viewer.querySelectorAll('img[data-index]').forEach(img => {
                const index = Number(img.dataset.index);
                v6ApplyCrop(index, img);
            });

            v6ScheduleProfileSave();
        }

        cropOffBtn.onclick = () => v6SetCropMode('off');
        cropAutoBtn.onclick = () => v6SetCropMode('auto');
        cropManualBtn.onclick = () => v6SetCropMode('manual');

        cropManualRange.oninput = () => {
            v6ManualCrop = clamp(Number(cropManualRange.value), 0, 12);
            v6SaveCropPrefs();
            v6ApplyAddonPrefsUI();

            if (v6CropMode === 'manual') {
                viewer.querySelectorAll('img[data-index]').forEach(img => {
                    v6ApplyCrop(Number(img.dataset.index), img);
                });
            }

            v6ScheduleProfileSave();
        };

        function v6ClearCrop(img) {
            if (!img) return;
            img.style.clipPath = '';
            img.style.webkitClipPath = '';
            img.classList.remove('v6-crop-active');
        }

        function v6ApplyCropInset(img, crop) {
            if (!img || !crop) return;

            const top = clamp(Number(crop.top || 0), 0, 18);
            const right = clamp(Number(crop.right || 0), 0, 18);
            const bottom = clamp(Number(crop.bottom || 0), 0, 18);
            const left = clamp(Number(crop.left || 0), 0, 18);

            if (top + right + bottom + left < .3) {
                v6ClearCrop(img);
                return;
            }

            const inset = `inset(${top.toFixed(2)}% ${right.toFixed(2)}% ${bottom.toFixed(2)}% ${left.toFixed(2)}%)`;
            img.style.clipPath = inset;
            img.style.webkitClipPath = inset;
            img.classList.add('v6-crop-active');
        }

        function v6DetectCrop(img) {
            if (!img || !img.naturalWidth || !img.naturalHeight) return null;

            const maxDim = 150;
            const scale = Math.min(
                1,
                maxDim / Math.max(img.naturalWidth, img.naturalHeight)
            );

            const width = Math.max(24, Math.round(img.naturalWidth * scale));
            const height = Math.max(24, Math.round(img.naturalHeight * scale));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', {willReadFrequently:true});

            try {
                ctx.drawImage(img, 0, 0, width, height);
                const data = ctx.getImageData(0, 0, width, height).data;

                function rgbAt(x, y) {
                    const i = (y * width + x) * 4;
                    return [data[i], data[i+1], data[i+2], data[i+3]];
                }

                const samples = [
                    rgbAt(1,1),
                    rgbAt(width-2,1),
                    rgbAt(1,height-2),
                    rgbAt(width-2,height-2),
                    rgbAt(Math.floor(width/2),1),
                    rgbAt(Math.floor(width/2),height-2)
                ].filter(v => v[3] > 20);

                if (!samples.length) return null;

                const bg = [0,1,2].map(channel =>
                    samples.reduce((sum, px) => sum + px[channel], 0) / samples.length
                );

                const threshold = 36;
                let minX = width, minY = height, maxX = -1, maxY = -1;

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const i = (y * width + x) * 4;
                        if (data[i+3] < 20) continue;

                        const dr = data[i] - bg[0];
                        const dg = data[i+1] - bg[1];
                        const db = data[i+2] - bg[2];
                        const distance = Math.sqrt(dr*dr + dg*dg + db*db);

                        if (distance > threshold) {
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }

                if (maxX < 0 || maxY < 0) return null;

                const pad = 1;
                minX = Math.max(0, minX - pad);
                minY = Math.max(0, minY - pad);
                maxX = Math.min(width - 1, maxX + pad);
                maxY = Math.min(height - 1, maxY + pad);

                const crop = {
                    left: (minX / width) * 100,
                    right: ((width - 1 - maxX) / width) * 100,
                    top: (minY / height) * 100,
                    bottom: ((height - 1 - maxY) / height) * 100
                };

                for (const key of Object.keys(crop)) {
                    crop[key] = clamp(crop[key], 0, 16);
                    if (crop[key] < .7) crop[key] = 0;
                }

                return crop;

            } catch (_) {
                /* Cross-origin image without CORS: leave uncropped. */
                return null;
            } finally {
                canvas.width = 1;
                canvas.height = 1;
            }
        }

        function v6ApplyCrop(index, img) {
            if (!img) return;

            if (v6CropMode === 'off') {
                v6ClearCrop(img);
                return;
            }

            if (v6CropMode === 'manual') {
                v6ApplyCropInset(img, {
                    top:v6ManualCrop,
                    right:v6ManualCrop,
                    bottom:v6ManualCrop,
                    left:v6ManualCrop
                });
                return;
            }

            if (img.dataset.v4Ready === '0') return;

            if (!v6CropCache.has(index)) {
                const detected = v6DetectCrop(img);
                v6CropCache.set(index, detected || false);
            }

            const crop = v6CropCache.get(index);
            if (!crop) v6ClearCrop(img);
            else v6ApplyCropInset(img, crop);
        }

        /* v5 already receives all page-load events. Extend it, don't replace reader loading. */
        const v6OldOnPageLoaded = v5OnPageImageLoaded;
        v5OnPageImageLoaded = function(index, img) {
            if (typeof v6OldOnPageLoaded === 'function') {
                v6OldOnPageLoaded(index, img);
            }
            img.dataset.v4Ready = '1';
            v6ApplyCrop(Number(index), img);
        };

        /* ---------------- Per-Manga Reader Profiles ---------------- */
        function v6CurrentProfileSnapshot() {
            return {
                mode: v5Webtoon ? 'webtoon' : currentMode,
                direction: readingDirection,
                doublePage: !!doublePage,
                spreadOdd: !!v3SpreadOdd,
                smartSpread: !!v5SmartSpread,
                fit: v3Fit,
                width: currentWidth,
                brightness,
                contrast: v5Contrast,
                invert: !!v5Invert,
                readerBg,
                lowMemory: !!v5LowMemory,
                cropMode: v6CropMode,
                manualCrop: v6ManualCrop,
                savedAt: Date.now()
            };
        }

        function v6ProfileForCurrent() {
            if (!activeFileKey) return null;
            return v6ReadProfiles()[activeFileKey] || null;
        }

        function v6SaveCurrentProfile(showToast = false) {
            if (!activeFileKey || setup.style.display !== 'none') return;

            const all = v6ReadProfiles();
            all[activeFileKey] = v6CurrentProfileSnapshot();
            v5WriteJson(V6_PROFILE_KEY, all);
            v6RenderProfileStatus();

            if (showToast) toast('Manga profile disimpan');
        }

        function v6ScheduleProfileSave() {
            clearTimeout(v6ProfileSaveTimer);
            v6ProfileSaveTimer = setTimeout(
                () => v6SaveCurrentProfile(false),
                350
            );
        }

        async function v6ApplyProfile(profile) {
            if (!profile) return false;

            if (profile.direction) {
                readingDirection = profile.direction === 'ltr' ? 'ltr' : 'rtl';
            }

            doublePage = !!profile.doublePage;
            v3SpreadOdd = !!profile.spreadOdd;
            v5SmartSpread = profile.smartSpread !== false;

            if (['original','width','height'].includes(profile.fit)) {
                v3Fit = profile.fit;
            }

            currentWidth = clamp(Number(profile.width || currentWidth), 500, 1400);
            brightness = clamp(Number(profile.brightness || brightness), 50, 130);
            v5Contrast = clamp(Number(profile.contrast || v5Contrast), 60, 160);
            v5Invert = !!profile.invert;

            if (['#000000','#161616','#201b16','#101823'].includes(profile.readerBg)) {
                readerBg = profile.readerBg;
            }

            v5LowMemory = !!profile.lowMemory;

            if (['off','auto','manual'].includes(profile.cropMode)) {
                v6CropMode = profile.cropMode;
            }
            v6ManualCrop = clamp(Number(profile.manualCrop ?? v6ManualCrop), 0, 12);

            applyPrefsToUI();
            v3ApplyPrefs();
            v5ApplyPrefs();
            v6ApplyAddonPrefsUI();
            setReaderWidth(currentWidth);

            if (profile.mode === 'webtoon') {
                v5SetWebtoon(true);
            } else {
                v5SetWebtoon(false);
                setMode(profile.mode === 'book' ? 'book' : 'list', false, true);
            }

            viewer.querySelectorAll('img[data-index]').forEach(img =>
                v6ApplyCrop(Number(img.dataset.index), img)
            );

            return true;
        }

        function v6RenderProfileStatus() {
            if (!activeFileKey) {
                mangaProfileTitle.textContent = 'Belum ada manga dibuka';
                mangaProfileState.textContent = 'GLOBAL';
                mangaProfileState.classList.remove('saved');
                mangaProfileDetail.textContent =
                    'Bila manga dibuka, setting reader manga itu akan diingat sendiri.';
                return;
            }

            const profile = v6ProfileForCurrent();
            mangaProfileTitle.textContent =
                v3SourceTitle || v5CurrentLibraryItem?.title || activeFile?.name || 'Current Manga';

            mangaProfileState.textContent = profile ? 'SAVED' : 'NEW';
            mangaProfileState.classList.toggle('saved', !!profile);

            if (!profile) {
                mangaProfileDetail.textContent =
                    'Belum ada profile khas. Setting semasa akan disimpan automatik bila kau ubah reader.';
                return;
            }

            mangaProfileDetail.textContent =
                `${String(profile.mode || 'list').toUpperCase()} • ` +
                `${String(profile.direction || 'rtl').toUpperCase()} • ` +
                `${profile.doublePage ? '2 PAGE' : '1 PAGE'} • ` +
                `${profile.fit || 'width'} • ${profile.width || 900}px • ` +
                `Brightness ${profile.brightness || 100}%`;
        }

        function v6ResetCurrentProfile() {
            if (!activeFileKey) return;

            const all = v6ReadProfiles();
            if (!all[activeFileKey]) return toast('Manga ini belum ada profile tersimpan.');

            delete all[activeFileKey];
            v5WriteJson(V6_PROFILE_KEY, all);
            v6RenderProfileStatus();
            toast('Manga profile dibuang. Global setting akan digunakan pada buka seterusnya.');
        }

        saveMangaProfileBtn.onclick = () => v6SaveCurrentProfile(true);
        resetMangaProfileBtn.onclick = v6ResetCurrentProfile;

        /* Save profile after existing controls have applied their state. */
        toolsPanel.addEventListener('click', () => {
            setTimeout(v6ScheduleProfileSave, 0);
        });

        toolsPanel.addEventListener('input', () => {
            setTimeout(v6ScheduleProfileSave, 0);
        });

        [
            modeListBtn, modeBookBtn, modeWebtoonBtn,
            zoomIn, zoomOut
        ].forEach(btn => {
            btn?.addEventListener('click', () => setTimeout(v6ScheduleProfileSave, 0));
        });

        /* ---------------- Series Progress ---------------- */
        function v6ItemProgress(item) {
            return v5LibraryItemProgress(item);
        }

        function v6ItemStatus(item) {
            const p = v6ItemProgress(item);
            if (p >= 98) return 'completed';
            if (p > 0) return 'reading';
            return 'unread';
        }

        function v6BuildSeriesProgress(items) {
            const groups = new Map();

            items.forEach(item => {
                const name = String(item.series || item.title || item.name || 'Unknown Series').trim();
                const key = name.toLowerCase();

                if (!groups.has(key)) {
                    groups.set(key, {
                        name,
                        items: [],
                        read: 0,
                        completed: 0,
                        progressSum: 0
                    });
                }

                const group = groups.get(key);
                const progress = v6ItemProgress(item);
                group.items.push(item);
                group.progressSum += progress;
                if (progress > 0) group.read++;
                if (progress >= 98) group.completed++;
            });

            return Array.from(groups.values()).map(group => {
                const total = group.items.length;
                const percent = total
                    ? Math.round(group.progressSum / total)
                    : 0;

                let status = 'unread';
                if (group.completed === total && total > 0) status = 'completed';
                else if (group.read > 0) status = 'reading';

                return {...group, total, percent, status};
            }).sort((a,b) => {
                if (a.status !== b.status) {
                    const rank = {reading:0, unread:1, completed:2};
                    return rank[a.status] - rank[b.status];
                }
                return b.percent - a.percent || a.name.localeCompare(b.name);
            });
        }

        function v6RenderSeriesProgress(allItems) {
            const groups = v6BuildSeriesProgress(allItems);

            if (!groups.length) {
                seriesProgressStrip.innerHTML =
                    '<div class="home-data-empty">Series progress akan muncul selepas Library mempunyai manga.</div>';
                return;
            }

            seriesProgressStrip.innerHTML = groups.map(group => `
                <div class="series-progress-card">
                    <div class="series-progress-top">
                        <div class="series-progress-title">${escapeHtml(group.name)}</div>
                        <div class="series-progress-percent">${group.percent}%</div>
                    </div>
                    <div class="series-progress-meta">
                        ${group.completed} / ${group.total} chapter completed
                        • ${group.read} started
                    </div>
                    <div class="series-progress-bar"><span style="width:${group.percent}%"></span></div>
                    <span class="series-status-chip ${group.status}">
                        ${group.status === 'completed' ? 'COMPLETED' : group.status === 'reading' ? 'READING' : 'UNREAD'}
                    </span>
                </div>
            `).join('');
        }

        /* Replace Library renderer with same shelf + series progress + status filter. */
        const v6OldRenderLibrary = v5RenderLibrary;
        v5RenderLibrary = function() {
            let items = v5ReadLibrary();
            v6RenderSeriesProgress(items);

            const q = String(librarySearch.value || '').trim().toLowerCase();
            const status = libraryStatusFilter.value || 'all';

            if (q) {
                items = items.filter(item =>
                    [item.title, item.series, item.name, item.chapter, item.volume]
                        .join(' ')
                        .toLowerCase()
                        .includes(q)
                );
            }

            if (status !== 'all') {
                items = items.filter(item => v6ItemStatus(item) === status);
            }

            items = v5LibrarySortItems(items.slice());
            libraryCount.textContent = String(v5ReadLibrary().length);

            if (!items.length) {
                libraryShelf.innerHTML =
                    '<div class="home-data-empty">Tiada manga untuk filter/carían ini.</div>';
                return;
            }

            const seriesGroups = v6BuildSeriesProgress(v5ReadLibrary());
            const seriesMap = new Map(
                seriesGroups.map(group => [group.name.toLowerCase(), group])
            );

            libraryShelf.innerHTML = items.map(item => {
                const progress = v5LibraryItemProgress(item);
                const group = seriesMap.get(
                    String(item.series || item.title || item.name).trim().toLowerCase()
                );

                return `
                    <article class="library-shelf-card" data-library-key="${escapeHtml(item.key)}">
                        <div class="library-shelf-cover">
                            ${item.thumb
                                ? `<img src="${item.thumb}" alt="${escapeHtml(item.title || item.name)}"/>`
                                : `<span>${item.type === 'pdf' ? 'PDF' : 'CBZ'}</span>`}
                        </div>
                        <span class="library-shelf-badge">${progress}%</span>
                        <div class="library-shelf-info">
                            <div class="library-shelf-title">${escapeHtml(item.title || item.name)}</div>
                            <div class="library-shelf-meta">
                                ${escapeHtml(item.series || 'Unknown Series')}
                                ${item.chapter ? ` • Ch ${escapeHtml(item.chapter)}` : ''}
                                ${group ? ` • Series ${group.completed}/${group.total}` : ''}
                                ${item.cached ? ' • Cached' : ' • Session'}
                            </div>
                        </div>
                    </article>`;
            }).join('');

            libraryShelf.querySelectorAll('[data-library-key]').forEach(card => {
                card.onclick = () => v5OpenLibraryItem(card.dataset.libraryKey);
            });
        };

        libraryStatusFilter.onchange = v5RenderLibrary;

        /* ---------------- Storage Manager ---------------- */
        async function v6StorageEstimate() {
            try {
                if (!navigator.storage?.estimate) return null;
                return await navigator.storage.estimate();
            } catch (_) {
                return null;
            }
        }

        function v6CachedLibraryItems() {
            return v5ReadLibrary()
                .filter(item => item.cached)
                .sort((a,b) => Number(b.size || 0) - Number(a.size || 0));
        }

        async function v6RefreshStorageManager() {
            const estimate = await v6StorageEstimate();
            const cached = v6CachedLibraryItems();
            const readerBytes = cached.reduce((sum, item) => sum + Number(item.size || 0), 0);

            if (estimate) {
                const usage = Number(estimate.usage || 0);
                const quota = Number(estimate.quota || 0);
                const percent = quota ? Math.min(100, (usage / quota) * 100) : 0;

                storageUsageValue.textContent = formatBytes(usage);
                storageQuotaValue.textContent =
                    quota ? `of ${formatBytes(quota)} browser quota` : 'Browser storage';
                storageMeterFill.style.width = `${percent}%`;
            } else {
                storageUsageValue.textContent = formatBytes(readerBytes);
                storageQuotaValue.textContent = 'Kirin cached files';
                storageMeterFill.style.width = '0%';
            }

            storageReaderValue.textContent =
                `Kirin Library cache: ${formatBytes(readerBytes)} • ${cached.length} cached file(s). ` +
                `Progress/history tidak dikira sebagai fail cache.`;

            if (!cached.length) {
                storageList.innerHTML =
                    '<div class="home-data-empty">Tiada CBZ/ZIP/PDF yang cached dalam browser.</div>';
                return;
            }

            storageList.innerHTML = cached.map(item => `
                <div class="storage-item" data-storage-key="${escapeHtml(item.key)}">
                    <div class="storage-item-main">
                        <div class="storage-item-title">${escapeHtml(item.title || item.name)}</div>
                        <div class="storage-item-meta">${escapeHtml(item.series || 'Library')}</div>
                    </div>
                    <div class="storage-item-size">${formatBytes(Number(item.size || 0))}</div>
                    <button class="storage-remove-btn" type="button" data-remove-cache="${escapeHtml(item.key)}">Remove</button>
                </div>
            `).join('');

            storageList.querySelectorAll('[data-remove-cache]').forEach(btn => {
                btn.onclick = async () => {
                    const key = btn.dataset.removeCache;
                    await libraryDeleteFile(key);

                    const library = v5ReadLibrary();
                    const item = library.find(x => x.key === key);
                    if (item) item.cached = false;
                    v5WriteJson(V5_LIBRARY_META_KEY, library);

                    v5RenderLibrary();
                    await v6RefreshStorageManager();
                    toast('Cached file dibuang. Progress & metadata kekal.');
                };
            });
        }

        refreshStorageBtn.onclick = v6RefreshStorageManager;

        removeAllCachedBtn.onclick = async () => {
            const cached = v6CachedLibraryItems();
            if (!cached.length) return toast('Tiada cached file.');

            if (!confirm(`Remove ${cached.length} cached file? Progress, history dan Library metadata akan kekal.`)) {
                return;
            }

            await libraryClear();

            const library = v5ReadLibrary();
            library.forEach(item => item.cached = false);
            v5WriteJson(V5_LIBRARY_META_KEY, library);

            v5RenderLibrary();
            await v6RefreshStorageManager();
            toast('Semua cached file dibuang');
        };

        /* Refresh storage when Library settings is opened. */
        document.querySelector('[data-settings-tab="library"]')?.addEventListener(
            'click',
            () => setTimeout(v6RefreshStorageManager, 50)
        );

        /* ---------------- Touch Zones ---------------- */
        function v6RefreshTouchZones() {
            const isReading =
                totalPages > 0 &&
                setup.style.display === 'none' &&
                currentMode === 'book';

            touchZoneLayer.classList.toggle(
                'active',
                !!(v6TouchEnabled && isReading)
            );

            document.documentElement.style.setProperty(
                '--v6-touch-side',
                `${v6TouchSide}%`
            );
        }

        function v6SetTouchEnabled(enabled) {
            v6TouchEnabled = !!enabled;
            v6SaveCropPrefs();
            v6ApplyAddonPrefsUI();
            v6ScheduleProfileSave();
        }

        touchZonesOn.onclick = () => v6SetTouchEnabled(true);
        touchZonesOff.onclick = () => v6SetTouchEnabled(false);

        touchZoneRange.oninput = () => {
            v6TouchSide = clamp(Number(touchZoneRange.value), 20, 42);
            v6SaveCropPrefs();
            v6ApplyAddonPrefsUI();
            v6ScheduleProfileSave();
        };

        touchZonePrev.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            changePage(false);
        };

        touchZoneNext.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            changePage(true);
        };

        function v6ToggleReaderChrome() {
            v6ReaderChromeHidden = !v6ReaderChromeHidden;
            header.classList.toggle('hide', v6ReaderChromeHidden);

            if (v6ReaderChromeHidden) {
                pageSelector.classList.add('collapsed');
            } else {
                pageSelector.classList.remove('collapsed');
            }
        }

        touchZoneCenter.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            v6ToggleReaderChrome();
        };

        /* Keep zones synced with mode/home changes. */
        const v6OldSetMode = setMode;
        setMode = function(mode, persist = true, restoring = false) {
            const result = v6OldSetMode(mode, persist, restoring);
            requestAnimationFrame(v6RefreshTouchZones);
            return result;
        };

        const v6OldSetWebtoon = v5SetWebtoon;
        v5SetWebtoon = function(enabled) {
            const result = v6OldSetWebtoon(enabled);
            requestAnimationFrame(v6RefreshTouchZones);
            return result;
        };

        /* ---------------- Open/Profile hook ---------------- */
        const v6OldAfterBookOpen = v5AfterBookOpen;
        v5AfterBookOpen = async function(file, options = {}) {
            await v6OldAfterBookOpen(file, options);

            v6CropCache.clear();

            const profile = v6ProfileForCurrent();
            if (profile) {
                await v6ApplyProfile(profile);
                toast('Per-manga reader profile dipulihkan');
            }

            v6RenderProfileStatus();
            v6RenderSeriesProgress(v5ReadLibrary());
            v6RefreshTouchZones();
            v6RefreshStorageManager();

            viewer.querySelectorAll('img[data-index]').forEach(img =>
                v6ApplyCrop(Number(img.dataset.index), img)
            );
        };

        /* Home closes touch layer but keeps profiles. */
        const v6OldGoHome = v3GoHome;
        v3GoHome = function() {
            touchZoneLayer.classList.remove('active');
            v6ReaderChromeHidden = false;
            return v6OldGoHome();
        };
        homeBtn.onclick = v3GoHome;

        /* Profile status should follow settings page opening. */
        document.querySelector('[data-settings-tab="library"]')?.addEventListener(
            'click',
            () => v6RenderProfileStatus()
        );


        /* =====================================================
           KIRIN READER v6.1 — HOMEPAGE DASHBOARD ENGINE
           ===================================================== */
        const V7_HOME_PREFS_KEY = 'kirin_reader_home_prefs_v61';
        const V7_PINNED_KEY = 'kirin_reader_pinned_v61';
        const V7_ACTIVE_SESSION_KEY = 'kirin_reader_active_session_v61';

        const homeSearchSection = document.getElementById('homeSearchSection');
        const homeGlobalSearch = document.getElementById('homeGlobalSearch');
        const homeSearchResults = document.getElementById('homeSearchResults');
        const homeResumeBar = document.getElementById('homeResumeBar');
        const homeResumeTitle = document.getElementById('homeResumeTitle');
        const homeResumeMeta = document.getElementById('homeResumeMeta');
        const homeResumeBtn = document.getElementById('homeResumeBtn');
        const homeResumeDismiss = document.getElementById('homeResumeDismiss');
        const continueReadingHero = document.getElementById('continueReadingHero');
        const continueCover = document.getElementById('continueCover');
        const continueTitle = document.getElementById('continueTitle');
        const continueMeta = document.getElementById('continueMeta');
        const continueProgressFill = document.getElementById('continueProgressFill');
        const continueReadBtn = document.getElementById('continueReadBtn');
        const homeQuickActions = document.getElementById('homeQuickActions');
        const quickOpenFile = document.getElementById('quickOpenFile');
        const quickOpenFolder = document.getElementById('quickOpenFolder');
        const quickPasteLink = document.getElementById('quickPasteLink');
        const quickLibrary = document.getElementById('quickLibrary');
        const quickResume = document.getElementById('quickResume');
        const quickRandom = document.getElementById('quickRandom');
        const homeWelcomeState = document.getElementById('homeWelcomeState');
        const homePinnedSection = document.getElementById('homePinnedSection');
        const homePinnedTrack = document.getElementById('homePinnedTrack');
        const homeRecentlyAddedSection = document.getElementById('homeRecentlyAddedSection');
        const homeRecentlyAddedTrack = document.getElementById('homeRecentlyAddedTrack');
        const homeSeriesSection = document.getElementById('homeSeriesSection');
        const homeSeriesTrack = document.getElementById('homeSeriesTrack');
        const homeSummarySection = document.getElementById('homeSummarySection');
        const homeReadingChip = document.getElementById('homeReadingChip');
        const homeCompletedChip = document.getElementById('homeCompletedChip');
        const homeUnreadChip = document.getElementById('homeUnreadChip');
        const homeStorageValue = document.getElementById('homeStorageValue');
        const homeStorageMeta = document.getElementById('homeStorageMeta');
        const homeStorageFill = document.getElementById('homeStorageFill');
        const homeStorageOpen = document.getElementById('homeStorageOpen');

        let v7ContinueTarget = null;
        let v7SearchCache = [];
        let v7HomePrefs = {
            search:true, continue:true, quick:true, pinned:true,
            recentAdded:true, series:true, summary:true
        };

        function v7ReadHomePrefs() {
            const saved = v5ReadJson(V7_HOME_PREFS_KEY, {});
            v7HomePrefs = {...v7HomePrefs, ...(saved && typeof saved === 'object' ? saved : {})};
            return v7HomePrefs;
        }

        function v7SaveHomePrefs() {
            v5WriteJson(V7_HOME_PREFS_KEY, v7HomePrefs);
        }

        function v7ReadPinned() {
            const p = v5ReadJson(V7_PINNED_KEY, []);
            return Array.isArray(p) ? p : [];
        }

        function v7TogglePin(key) {
            if (!key) return;
            let pinned = v7ReadPinned();
            const index = pinned.indexOf(key);
            if (index >= 0) {
                pinned.splice(index, 1);
                toast('Pinned dibuang');
            } else {
                pinned.unshift(key);
                toast('Manga dipin ke homepage');
            }
            v5WriteJson(V7_PINNED_KEY, pinned.slice(0, 80));
            v7RenderHomeDashboard();
            v7DecorateLibraryPins();
        }

        function v7LibraryCardHtml(item, pinned = false) {
            const progress = v5LibraryItemProgress(item);
            return `
                <article class="home-mini-card" data-home-library-key="${escapeHtml(item.key)}">
                    <button class="home-pin-btn" data-home-pin-key="${escapeHtml(item.key)}" title="${pinned ? 'Unpin' : 'Pin'}" type="button">${pinned ? '&#9733;' : '&#9734;'}</button>
                    <div class="home-mini-cover">
                        ${item.thumb ? `<img loading="lazy" decoding="async" src="${item.thumb}" alt="${escapeHtml(item.title || item.name)}"/>` : `<span>${item.type === 'pdf' ? 'PDF' : 'CBZ'}</span>`}
                    </div>
                    <div class="home-mini-info">
                        <div class="home-mini-title">${escapeHtml(item.title || item.name)}</div>
                        <div class="home-mini-meta">${progress}% • ${escapeHtml(item.series || 'Library')}${item.chapter ? ` • Ch ${escapeHtml(item.chapter)}` : ''}</div>
                    </div>
                </article>`;
        }

        function v7BindHomeLibraryTrack(track) {
            track.querySelectorAll('[data-home-library-key]').forEach(card => {
                card.onclick = () => v5OpenLibraryItem(card.dataset.homeLibraryKey);
            });
            track.querySelectorAll('[data-home-pin-key]').forEach(btn => {
                btn.onclick = event => {
                    event.stopPropagation();
                    v7TogglePin(btn.dataset.homePinKey);
                };
            });
        }

        function v7ContinueCandidate() {
            const recents = readRecents();
            if (recents.length) {
                const r = recents[0];
                const pages = Math.max(0, Number(r.pages || 0));
                const page = clamp(Number(r.page || 0), 0, Math.max(0, pages - 1));
                return {
                    kind:'recent', data:r, title:r.name || 'Recent Manga', thumb:r.thumb || '',
                    page, pages, percent:pages ? Math.round(((page + 1) / pages) * 100) : 0,
                    time:Number(r.time || 0)
                };
            }

            const library = v5ReadLibrary();
            const candidates = library.map(item => {
                const p = getFileProgress(item.key);
                const pages = Number(p?.pages || 0);
                const page = Number(p?.page || 0);
                return {item,p,pages,page,percent:pages ? Math.round(((page+1)/pages)*100) : 0};
            }).filter(x => x.pages > 0 && x.percent > 0 && x.percent < 100)
              .sort((a,b) => Number(b.p?.updatedAt || b.item.updatedAt || 0) - Number(a.p?.updatedAt || a.item.updatedAt || 0));

            if (!candidates.length) return null;
            const c = candidates[0];
            return {
                kind:'library', data:c.item, title:c.item.title || c.item.name, thumb:c.item.thumb || '',
                page:c.page, pages:c.pages, percent:c.percent, time:Number(c.p?.updatedAt || c.item.updatedAt || 0)
            };
        }

        function v7RenderContinue() {
            v7ContinueTarget = v7ContinueCandidate();
            const show = !!v7ContinueTarget && !!v7HomePrefs.continue;
            continueReadingHero.classList.toggle('show', show);
            if (!show) return;

            const c = v7ContinueTarget;
            continueCover.innerHTML = c.thumb ? `<img loading="lazy" decoding="async" src="${c.thumb}" alt="Cover"/>` : 'K';
            continueTitle.textContent = c.title;
            continueMeta.textContent = `Page ${c.page + 1} / ${c.pages} • ${c.percent}%`;
            continueProgressFill.style.width = `${c.percent}%`;
        }

        async function v7OpenContinueTarget() {
            const c = v7ContinueTarget;
            if (!c) return toast('Tiada bacaan untuk disambung.');
            if (c.kind === 'recent') await reopenRecent(c.data);
            else await v5OpenLibraryItem(c.data.key);
        }
        continueReadBtn.onclick = v7OpenContinueTarget;

        function v7ActiveCheckpoint() {
            return v5ReadJson(V7_ACTIVE_SESSION_KEY, null);
        }

        function v7SaveActiveCheckpoint() {
            if (!activeFileKey || !totalPages || setup.style.display !== 'none') return;
            v5WriteJson(V7_ACTIVE_SESSION_KEY, {
                key: activeFileKey,
                sourceType: v3SourceType || 'local',
                sourceUrl: v3SourceUrl || '',
                title: v3SourceTitle || activeFile?.name || 'Manga',
                page: activePageIndex,
                pages: totalPages,
                time: Date.now()
            });
        }

        function v7ClearActiveCheckpoint() {
            localStorage.removeItem(V7_ACTIVE_SESSION_KEY);
            v7RenderResumeBar();
        }

        function v7RenderResumeBar() {
            const cp = v7ActiveCheckpoint();
            const valid = cp && cp.key && Date.now() - Number(cp.time || 0) < 1000 * 60 * 60 * 24 * 14;
            homeResumeBar.classList.toggle('show', !!valid);
            if (!valid) return;
            homeResumeTitle.textContent = cp.title || 'Resume last session';
            homeResumeMeta.textContent = `Page ${Number(cp.page || 0) + 1} / ${Number(cp.pages || 0)} • ${formatTimeAgo(cp.time)}`;
        }

        async function v7ResumeCheckpoint() {
            const cp = v7ActiveCheckpoint();
            if (!cp) return v7OpenContinueTarget();
            try {
                if (cp.sourceType === 'link' && cp.sourceUrl) {
                    await v3OpenLink(cp.sourceUrl);
                } else {
                    await v5OpenLibraryItem(cp.key);
                }
                if (totalPages) jumpToPage(clamp(Number(cp.page || 0) + 1, 1, totalPages));
            } catch (_) {
                toast('Sesi terakhir tak dapat dipulihkan.');
            }
        }
        homeResumeBtn.onclick = v7ResumeCheckpoint;
        homeResumeDismiss.onclick = v7ClearActiveCheckpoint;

        function v7RenderPinned() {
            const library = v5ReadLibrary();
            const pinnedKeys = v7ReadPinned();
            const items = pinnedKeys.map(key => library.find(item => item.key === key)).filter(Boolean);
            const show = items.length > 0 && v7HomePrefs.pinned;
            homePinnedSection.classList.toggle('v7-home-hidden', !show);
            if (!show) { homePinnedTrack.innerHTML = ''; return; }
            homePinnedTrack.innerHTML = items.slice(0,12).map(item => v7LibraryCardHtml(item, true)).join('');
            v7BindHomeLibraryTrack(homePinnedTrack);
        }

        function v7RenderRecentlyAdded() {
            const items = v5ReadLibrary().slice().sort((a,b) => Number(b.addedAt || 0) - Number(a.addedAt || 0)).slice(0,12);
            const show = items.length > 0 && v7HomePrefs.recentAdded;
            homeRecentlyAddedSection.classList.toggle('v7-home-hidden', !show);
            if (!show) { homeRecentlyAddedTrack.innerHTML = ''; return; }
            const pinned = new Set(v7ReadPinned());
            homeRecentlyAddedTrack.innerHTML = items.map(item => v7LibraryCardHtml(item, pinned.has(item.key))).join('');
            v7BindHomeLibraryTrack(homeRecentlyAddedTrack);
        }

        function v7RenderHomeSeries() {
            const groups = v6BuildSeriesProgress(v5ReadLibrary()).slice(0,8);
            const show = groups.length > 0 && v7HomePrefs.series;
            homeSeriesSection.classList.toggle('v7-home-hidden', !show);
            if (!show) { homeSeriesTrack.innerHTML = ''; return; }

            homeSeriesTrack.innerHTML = groups.map(group => `
                <article class="home-series-card" data-home-series="${escapeHtml(group.name)}">
                    <div class="home-series-title">${escapeHtml(group.name)}</div>
                    <div class="home-series-meta">${group.completed} / ${group.total} chapters completed • ${group.read} started</div>
                    <div class="home-series-progress"><span style="width:${group.percent}%"></span></div>
                    <div class="home-series-bottom"><span class="home-series-percent">${group.percent}%</span><span class="home-series-status">${group.status}</span></div>
                </article>`).join('');

            homeSeriesTrack.querySelectorAll('[data-home-series]').forEach(card => {
                card.onclick = () => {
                    librarySearch.value = card.dataset.homeSeries;
                    libraryStatusFilter.value = 'all';
                    v5RenderLibrary();
                    setLibraryTab('library');
                    document.querySelector('.reader-library-tabs')?.scrollIntoView({behavior:'smooth', block:'start'});
                };
            });
        }

        async function v7RenderSummary() {
            const items = v5ReadLibrary();
            let unread = 0, reading = 0, completed = 0;
            items.forEach(item => {
                const status = v6ItemStatus(item);
                if (status === 'completed') completed++;
                else if (status === 'reading') reading++;
                else unread++;
            });
            homeReadingChip.textContent = `${reading} Reading`;
            homeCompletedChip.textContent = `${completed} Completed`;
            homeUnreadChip.textContent = `${unread} Unread`;
            homeSummarySection.classList.toggle('v7-home-hidden', !v7HomePrefs.summary || items.length === 0);

            const cached = v6CachedLibraryItems();
            const readerBytes = cached.reduce((sum,item) => sum + Number(item.size || 0), 0);
            homeStorageValue.textContent = formatBytes(readerBytes);
            const estimate = await v6StorageEstimate();
            if (estimate?.quota) {
                const usage = Number(estimate.usage || 0), quota = Number(estimate.quota || 0);
                homeStorageMeta.textContent = `${cached.length} cached • browser ${formatBytes(usage)}`;
                homeStorageFill.style.width = `${quota ? Math.min(100, usage / quota * 100) : 0}%`;
            } else {
                homeStorageMeta.textContent = `${cached.length} cached file(s)`;
                homeStorageFill.style.width = cached.length ? '18%' : '0%';
            }
        }

        function v7OpenLibraryWithStatus(status) {
            libraryStatusFilter.value = status;
            librarySearch.value = '';
            v5RenderLibrary();
            setLibraryTab('library');
            document.querySelector('.reader-library-tabs')?.scrollIntoView({behavior:'smooth', block:'start'});
        }
        homeReadingChip.onclick = () => v7OpenLibraryWithStatus('reading');
        homeCompletedChip.onclick = () => v7OpenLibraryWithStatus('completed');
        homeUnreadChip.onclick = () => v7OpenLibraryWithStatus('unread');
        homeStorageOpen.onclick = () => {
            openToolsPanel();
            document.querySelector('[data-settings-tab="library"]')?.click();
            setTimeout(() => document.getElementById('storageUsageValue')?.scrollIntoView({block:'center'}), 80);
        };

        function v7RenderWelcome() {
            const empty = v5ReadLibrary().length === 0 && readRecents().length === 0 && v3ReadLinkHistory().length === 0;
            homeWelcomeState.classList.toggle('show', empty);
        }

        function v7DecorateLibraryPins() {
            const pinned = new Set(v7ReadPinned());
            libraryShelf.querySelectorAll('.library-shelf-card[data-library-key]').forEach(card => {
                let btn = card.querySelector('.home-pin-btn');
                if (!btn) {
                    btn = document.createElement('button');
                    btn.className = 'home-pin-btn';
                    btn.type = 'button';
                    card.appendChild(btn);
                }
                const key = card.dataset.libraryKey;
                btn.dataset.homePinKey = key;
                btn.innerHTML = pinned.has(key) ? '&#9733;' : '&#9734;';
                btn.title = pinned.has(key) ? 'Unpin' : 'Pin to homepage';
                btn.onclick = event => { event.stopPropagation(); v7TogglePin(key); };
            });
        }

        function v7RenderHomeDashboard() {
            v7ReadHomePrefs();
            homeSearchSection.classList.toggle('v7-home-hidden', !v7HomePrefs.search);
            homeQuickActions.classList.toggle('v7-home-hidden', !v7HomePrefs.quick);
            v7RenderContinue();
            v7RenderResumeBar();
            v7RenderPinned();
            v7RenderRecentlyAdded();
            v7RenderHomeSeries();
            v7RenderSummary();
            v7RenderWelcome();
            v7DecorateLibraryPins();
        }

        /* Global Search */
        function v7BuildSearchResults(query) {
            const q = String(query || '').trim().toLowerCase();
            if (!q) return [];
            const results = [];
            const seen = new Set();

            v5ReadLibrary().forEach(item => {
                const hay = [item.title,item.series,item.name,item.chapter,item.volume].join(' ').toLowerCase();
                if (hay.includes(q) && !seen.has(`lib:${item.key}`)) {
                    seen.add(`lib:${item.key}`);
                    results.push({kind:'library', title:item.title || item.name, meta:`${item.series || 'Library'}${item.chapter ? ` • Ch ${item.chapter}` : ''}`, item});
                }
            });

            readRecents().forEach(item => {
                if (String(item.name || '').toLowerCase().includes(q) && !seen.has(`recent:${item.key || item.name}`)) {
                    seen.add(`recent:${item.key || item.name}`);
                    results.push({kind:'recent', title:item.name, meta:`Page ${Number(item.page || 0)+1} / ${Number(item.pages || 0)}`, item});
                }
            });

            v3ReadLinkHistory().forEach(item => {
                const hay = [item.title,item.url].join(' ').toLowerCase();
                if (hay.includes(q) && !seen.has(`link:${item.url}`)) {
                    seen.add(`link:${item.url}`);
                    results.push({kind:'link', title:item.title || item.url, meta:`${Number(item.pages || 0)} pages • Link Reader`, item});
                }
            });
            return results.slice(0,18);
        }

        function v7RenderSearch(query) {
            v7SearchCache = v7BuildSearchResults(query);
            if (!String(query || '').trim()) {
                homeSearchResults.classList.remove('open');
                homeSearchResults.innerHTML = '';
                return;
            }
            homeSearchResults.classList.add('open');
            if (!v7SearchCache.length) {
                homeSearchResults.innerHTML = '<div class="home-data-empty">Tiada hasil ditemui.</div>';
                return;
            }
            homeSearchResults.innerHTML = v7SearchCache.map((r,index) => `
                <button class="home-search-item" type="button" data-home-search-index="${index}">
                    <span class="home-search-item-icon">${r.kind === 'link' ? 'URL' : r.kind === 'recent' ? 'REC' : 'LIB'}</span>
                    <span><strong>${escapeHtml(r.title)}</strong><span>${escapeHtml(r.meta)}</span></span>
                    <span class="home-search-kind">${r.kind}</span>
                </button>`).join('');
            homeSearchResults.querySelectorAll('[data-home-search-index]').forEach(btn => {
                btn.onclick = async () => {
                    const r = v7SearchCache[Number(btn.dataset.homeSearchIndex)];
                    homeSearchResults.classList.remove('open');
                    if (!r) return;
                    if (r.kind === 'library') await v5OpenLibraryItem(r.item.key);
                    else if (r.kind === 'recent') await reopenRecent(r.item);
                    else await v3OpenLink(r.item.url);
                };
            });
        }
        homeGlobalSearch.oninput = () => v7RenderSearch(homeGlobalSearch.value);
        homeGlobalSearch.onkeydown = event => {
            if (event.key === 'Escape') homeSearchResults.classList.remove('open');
            if (event.key === 'Enter' && v7SearchCache[0]) {
                event.preventDefault();
                homeSearchResults.querySelector('[data-home-search-index="0"]')?.click();
            }
        };
        document.addEventListener('click', event => {
            if (!homeSearchSection.contains(event.target)) homeSearchResults.classList.remove('open');
        });

        /* Quick Actions */
        quickOpenFile.onclick = () => fileInput.click();
        quickOpenFolder.onclick = () => folderInput.click();
        quickPasteLink.onclick = async () => {
            try {
                const clip = await navigator.clipboard?.readText?.();
                if (clip && /^https?:\/\//i.test(clip.trim())) linkInput.value = clip.trim();
            } catch (_) {}
            linkInput.focus();
            linkInput.scrollIntoView({behavior:'smooth', block:'center'});
        };
        quickLibrary.onclick = () => {
            setLibraryTab('library');
            document.querySelector('.reader-library-tabs')?.scrollIntoView({behavior:'smooth', block:'start'});
        };
        quickResume.onclick = () => v7ActiveCheckpoint() ? v7ResumeCheckpoint() : v7OpenContinueTarget();
        quickRandom.onclick = () => {
            const library = v5ReadLibrary();
            if (!library.length) return toast('Library masih kosong.');
            const unread = library.filter(item => v6ItemStatus(item) === 'unread');
            const reading = library.filter(item => v6ItemStatus(item) === 'reading');
            const pool = unread.length ? unread : (reading.length ? reading : library);
            const item = pool[Math.floor(Math.random() * pool.length)];
            v5OpenLibraryItem(item.key);
        };

        /* Homepage personalization */
        document.querySelectorAll('[data-home-toggle]').forEach(pair => {
            const key = pair.dataset.homeToggle;
            const on = pair.querySelector('.on');
            const off = pair.querySelector('.off');
            const apply = () => {
                const enabled = v7HomePrefs[key] !== false;
                on?.classList.toggle('active', enabled);
                off?.classList.toggle('active', !enabled);
            };
            on?.addEventListener('click', () => {
                v7HomePrefs[key] = true; v7SaveHomePrefs(); apply(); v7RenderHomeDashboard();
            });
            off?.addEventListener('click', () => {
                v7HomePrefs[key] = false; v7SaveHomePrefs(); apply(); v7RenderHomeDashboard();
            });
            pair._v7Apply = apply;
        });

        function v7ApplyHomeToggleUI() {
            document.querySelectorAll('[data-home-toggle]').forEach(pair => pair._v7Apply?.());
        }

        /* Extend existing Library render to keep homepage in sync and add star buttons. */
        const v7OldRenderLibrary = v5RenderLibrary;
        v5RenderLibrary = function() {
            const result = v7OldRenderLibrary();
            v7DecorateLibraryPins();
            if (setup.style.display !== 'none') v7RenderHomeDashboard();
            return result;
        };

        /* Save active session checkpoint whenever page changes. */
        const v7OldUpdatePageIndicator = updatePageIndicator;
        updatePageIndicator = function() {
            const result = v7OldUpdatePageIndicator();
            v7SaveActiveCheckpoint();
            return result;
        };

        /* Open hook refreshes homepage-backed data. */
        const v7OldAfterBookOpen = v5AfterBookOpen;
        v5AfterBookOpen = async function(file, options = {}) {
            await v7OldAfterBookOpen(file, options);
            v7SaveActiveCheckpoint();
        };

        /* Manual Home means intentional exit, so crash-resume checkpoint can be cleared. */
        const v7OldGoHome = v3GoHome;
        v3GoHome = function() {
            localStorage.removeItem(V7_ACTIVE_SESSION_KEY);
            const result = v7OldGoHome();
            setTimeout(() => { v7RenderHomeDashboard(); v7ApplyHomeToggleUI(); }, 0);
            return result;
        };
        homeBtn.onclick = v3GoHome;


        /* =====================================================
           v6.1.1 PERFORMANCE HOTFIX
           ===================================================== */

        /* A. Cache big localStorage JSON.
           Before this hotfix, v5LibraryItemProgress() caused the whole
           progress JSON to be parsed again for practically every card. */
        let v81ProgressRaw = null;
        let v81ProgressCache = {};
        let v81LibraryRaw = null;
        let v81LibraryCache = [];

        const v81OriginalReadAllProgress = readAllProgress;
        readAllProgress = function() {
            const raw = localStorage.getItem(PROGRESS_KEY) || '{}';

            if (raw === v81ProgressRaw) {
                return v81ProgressCache;
            }

            v81ProgressRaw = raw;

            try {
                const parsed = JSON.parse(raw);
                v81ProgressCache =
                    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                        ? parsed
                        : {};
            } catch (_) {
                v81ProgressCache = {};
            }

            return v81ProgressCache;
        };

        getFileProgress = function(key) {
            if (!key) return null;
            return readAllProgress()[key] || null;
        };

        const v81OriginalV5ReadLibrary = v5ReadLibrary;
        v5ReadLibrary = function() {
            const raw = localStorage.getItem(V5_LIBRARY_META_KEY) || '[]';

            if (raw === v81LibraryRaw) {
                return v81LibraryCache;
            }

            v81LibraryRaw = raw;

            try {
                const parsed = JSON.parse(raw);
                v81LibraryCache = Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                v81LibraryCache = [];
            }

            return v81LibraryCache;
        };

        /* B. One progress snapshot per dashboard render.
           Functions below use the cached localStorage object automatically. */

        /* C. Coalesce homepage refreshes into one animation frame.
           Several library/profile updates used to trigger the same full
           dashboard render in the same tick. */
        let v81HomeFrame = 0;
        let v81HomePending = false;
        let v81HomeRenderRunning = false;

        const v81HeavyRenderHomeDashboard = v7RenderHomeDashboard;

        function v81ScheduleHomeDashboard() {
            if (setup.style.display === 'none') return;

            v81HomePending = true;
            if (v81HomeFrame) return;

            v81HomeFrame = requestAnimationFrame(() => {
                v81HomeFrame = 0;

                if (!v81HomePending || setup.style.display === 'none') return;
                v81HomePending = false;

                if (v81HomeRenderRunning) {
                    v81HomePending = true;
                    return v81ScheduleHomeDashboard();
                }

                v81HomeRenderRunning = true;

                try {
                    v81HeavyRenderHomeDashboard();
                } finally {
                    v81HomeRenderRunning = false;
                }

                if (v81HomePending) v81ScheduleHomeDashboard();
            });
        }

        v7RenderHomeDashboard = v81ScheduleHomeDashboard;

        /* D. Throttle Storage API on homepage.
           navigator.storage.estimate() is async; overlapping calls caused
           unnecessary work while sections were being refreshed. */
        let v81StorageEstimateCache = null;
        let v81StorageEstimateAt = 0;
        let v81StorageEstimatePromise = null;

        async function v81GetStorageEstimate() {
            const now = Date.now();

            if (
                v81StorageEstimateCache &&
                now - v81StorageEstimateAt < 15000
            ) {
                return v81StorageEstimateCache;
            }

            if (v81StorageEstimatePromise) {
                return v81StorageEstimatePromise;
            }

            v81StorageEstimatePromise = (async () => {
                try {
                    const value = await v6StorageEstimate();
                    v81StorageEstimateCache = value;
                    v81StorageEstimateAt = Date.now();
                    return value;
                } finally {
                    v81StorageEstimatePromise = null;
                }
            })();

            return v81StorageEstimatePromise;
        }

        let v81SummaryToken = 0;

        v7RenderSummary = async function() {
            const token = ++v81SummaryToken;
            const items = v5ReadLibrary();

            let unread = 0;
            let reading = 0;
            let completed = 0;

            /* readAllProgress is cached now, so this loop no longer
               reparses localStorage for every item. */
            items.forEach(item => {
                const status = v6ItemStatus(item);
                if (status === 'completed') completed++;
                else if (status === 'reading') reading++;
                else unread++;
            });

            homeReadingChip.textContent = `${reading} Reading`;
            homeCompletedChip.textContent = `${completed} Completed`;
            homeUnreadChip.textContent = `${unread} Unread`;

            const visible =
                !!v7HomePrefs.summary &&
                items.length > 0;

            homeSummarySection.classList.toggle(
                'v7-home-hidden',
                !visible
            );

            if (!visible) return;

            const cached = v6CachedLibraryItems();
            const readerBytes = cached.reduce(
                (sum, item) => sum + Number(item.size || 0),
                0
            );

            homeStorageValue.textContent = formatBytes(readerBytes);
            homeStorageMeta.textContent = `${cached.length} cached file(s)`;

            /* Paint summary first, then storage quota when browser is idle. */
            const runEstimate = async () => {
                const estimate = await v81GetStorageEstimate();

                if (
                    token !== v81SummaryToken ||
                    setup.style.display === 'none'
                ) {
                    return;
                }

                if (estimate?.quota) {
                    const usage = Number(estimate.usage || 0);
                    const quota = Number(estimate.quota || 0);

                    homeStorageMeta.textContent =
                        `${cached.length} cached • browser ${formatBytes(usage)}`;

                    homeStorageFill.style.width =
                        `${quota ? Math.min(100, usage / quota * 100) : 0}%`;
                } else {
                    homeStorageFill.style.width =
                        cached.length ? '18%' : '0%';
                }
            };

            if ('requestIdleCallback' in window) {
                requestIdleCallback(
                    () => runEstimate(),
                    {timeout: 900}
                );
            } else {
                setTimeout(runEstimate, 100);
            }
        };

        /* E. Don't render hundreds of Library cards while the Library tab
           is hidden. Counts and homepage stay current; full shelf renders
           only when the user actually selects Library. */
        const v81FullRenderLibrary = v5RenderLibrary;

        v5RenderLibrary = function() {
            const homepageVisible = setup.style.display !== 'none';
            const libraryTabVisible =
                homepageVisible &&
                typeof activeLibraryTab !== 'undefined' &&
                activeLibraryTab === 'library';

            if (homepageVisible && !libraryTabVisible) {
                const items = v5ReadLibrary();
                libraryCount.textContent = String(items.length);

                /* Keep series data current, but avoid building the full
                   hidden Library shelf DOM. */
                if (typeof v6RenderSeriesProgress === 'function') {
                    v6RenderSeriesProgress(items);
                }

                v81ScheduleHomeDashboard();
                return;
            }

            return v81FullRenderLibrary();
        };

        /* F. Search input debounce. */
        let v81SearchTimer = 0;
        homeGlobalSearch.oninput = () => {
            clearTimeout(v81SearchTimer);
            const value = homeGlobalSearch.value;

            v81SearchTimer = setTimeout(
                () => v7RenderSearch(value),
                110
            );
        };

        /* G. Pinned toggle should request one dashboard update only. */
        v7TogglePin = function(key) {
            if (!key) return;

            let pinned = v7ReadPinned();
            const index = pinned.indexOf(key);

            if (index >= 0) {
                pinned.splice(index, 1);
                toast('Pinned dibuang');
            } else {
                pinned.unshift(key);
                toast('Manga dipin ke homepage');
            }

            v5WriteJson(V7_PINNED_KEY, pinned.slice(0, 80));
            v81ScheduleHomeDashboard();

            /* Library shelf only needs star decoration if it is visible. */
            if (
                typeof activeLibraryTab !== 'undefined' &&
                activeLibraryTab === 'library'
            ) {
                v7DecorateLibraryPins();
            }
        };

        /* H. Initial rendering waits for first frame; optional sections
           below are scheduled after the main layout becomes visible. */

        /* =====================================================
           KIRIN READER v6.2 — MANGA INFO GATEWAY ENGINE
           ===================================================== */

        const mangaInfoScreen = document.getElementById('mangaInfoScreen');
        const mangaInfoBack = document.getElementById('mangaInfoBack');
        const mangaInfoCancel = document.getElementById('mangaInfoCancel');
        const mangaInfoRead = document.getElementById('mangaInfoRead');
        const mangaInfoScroll = document.getElementById('mangaInfoScroll');
        const mangaInfoCover = document.getElementById('mangaInfoCover');
        const mangaInfoSource = document.getElementById('mangaInfoSource');
        const mangaInfoChips = document.getElementById('mangaInfoChips');
        const mangaInfoTitle = document.getElementById('mangaInfoTitle');
        const mangaInfoSeries = document.getElementById('mangaInfoSeries');
        const mangaInfoSummary = document.getElementById('mangaInfoSummary');
        const mangaInfoMetaGrid = document.getElementById('mangaInfoMetaGrid');
        const mangaInfoSourceSection = document.getElementById('mangaInfoSourceSection');
        const mangaInfoSourceText = document.getElementById('mangaInfoSourceText');
        const mangaInfoProgressLabel = document.getElementById('mangaInfoProgressLabel');
        const mangaInfoProgressPercent = document.getElementById('mangaInfoProgressPercent');
        const mangaInfoProgressBar = document.getElementById('mangaInfoProgressBar');
        const mangaInfoFooterTitle = document.getElementById('mangaInfoFooterTitle');
        const mangaInfoFooterMeta = document.getElementById('mangaInfoFooterMeta');
        const mangaInfoError = document.getElementById('mangaInfoError');

        const v82RealHandleFile = handleFile;
        const v82RealOpenLink = v3OpenLink;
        const v82RealLoadRemoteImages = v3LoadRemoteImages;

        let v82Pending = null;
        let v82InfoToken = 0;
        let v82BypassInfo = false;
        let v82ResumePage = null;

        function v82SafeText(value, fallback = '—') {
            const text = String(value ?? '').trim();
            return text || fallback;
        }

        function v82ProgressForKey(key, pagesHint = 0) {
            const progress = key ? getFileProgress(key) : null;
            const pages = Math.max(
                0,
                Number(progress?.pages || pagesHint || 0)
            );
            const page = pages
                ? clamp(Number(progress?.page || 0), 0, pages - 1)
                : 0;

            return {
                page,
                pages,
                percent: pages
                    ? Math.round(((page + 1) / pages) * 100)
                    : 0
            };
        }

        function v82InfoFromLibraryItem(item) {
            if (!item) return {};

            const progress = v82ProgressForKey(item.key, item.pages || 0);

            return {
                key: item.key,
                sourceType: 'local',
                type: item.type === 'pdf' ? 'PDF' : 'CBZ / ZIP',
                title: item.title || item.name,
                series: item.series || '',
                chapter: item.chapter || '',
                volume: item.volume || '',
                writer: item.writer || '',
                genre: item.genre || '',
                year: item.year || '',
                summary: item.summary || '',
                language: item.language || '',
                direction: item.direction || '',
                thumb: item.thumb || '',
                size: Number(item.size || 0),
                pages: progress.pages,
                page: progress.page,
                progress: progress.percent,
                cached: !!item.cached,
                source: item.relativePath || item.name || '',
                libraryItem: item
            };
        }

        function v82InfoFromRecent(data) {
            if (!data) return {};

            const progress = v82ProgressForKey(
                data.key,
                Number(data.pages || 0)
            );

            const libraryItem =
                v5ReadLibrary().find(item => item.key === data.key);

            if (libraryItem) {
                const info = v82InfoFromLibraryItem(libraryItem);
                info.page = progress.page;
                info.pages = progress.pages || Number(data.pages || 0);
                info.progress = info.pages
                    ? Math.round(((info.page + 1) / info.pages) * 100)
                    : 0;
                info.thumb = info.thumb || data.thumb || '';
                return info;
            }

            return {
                key: data.key,
                sourceType: 'local',
                type: 'LOCAL',
                title: data.name || 'Manga',
                series: '',
                chapter: '',
                volume: '',
                writer: '',
                genre: '',
                year: '',
                summary: '',
                thumb: data.thumb || '',
                size: 0,
                pages: progress.pages || Number(data.pages || 0),
                page: progress.page,
                progress: progress.percent,
                cached: true,
                source: data.name || ''
            };
        }

        function v82InfoFromLink(url, historyItem = null) {
            const clean = String(url || '').trim();
            let title = historyItem?.title || '';

            if (!title) {
                try {
                    const parsed = new URL(clean);
                    title = decodeURIComponent(
                        parsed.pathname.split('/').filter(Boolean).pop() ||
                        parsed.hostname
                    );
                } catch (_) {
                    title = 'Link Manga';
                }
            }

            const key = `link::${clean}`;
            const progress = v82ProgressForKey(
                key,
                Number(historyItem?.pages || 0)
            );

            return {
                key,
                sourceType: 'link',
                type: 'LINK',
                title,
                series: 'Link Reader',
                chapter: '',
                volume: '',
                writer: '',
                genre: '',
                year: '',
                summary: '',
                thumb: historyItem?.thumb || '',
                size: 0,
                pages: progress.pages || Number(historyItem?.pages || 0),
                page: progress.page,
                progress: progress.percent,
                cached: false,
                source: clean
            };
        }

        function v82InfoFromFileFast(file, options = {}) {
            const sourceType =
                options.sourceType === 'link' ? 'link' : 'local';

            const key = sourceType === 'link' && options.sourceUrl
                ? `link::${options.sourceUrl}`
                : makeFileKey(file);

            const libraryItem =
                v5ReadLibrary().find(item => item.key === key);

            if (libraryItem) {
                const info = v82InfoFromLibraryItem(libraryItem);
                info.sourceType = sourceType;
                info.source =
                    options.sourceUrl ||
                    libraryItem.relativePath ||
                    file.name;
                return info;
            }

            const meta = v5MetadataFromFilename(
                file.name,
                file.webkitRelativePath || ''
            );

            const progress = v82ProgressForKey(key, 0);

            return {
                key,
                sourceType,
                type: /\.pdf$/i.test(file.name || '')
                    ? 'PDF'
                    : 'CBZ / ZIP',
                title: meta.Title || file.name,
                series: meta.Series || '',
                chapter: meta.Number || '',
                volume: meta.Volume || '',
                writer: meta.Writer || '',
                genre: meta.Genre || '',
                year: meta.Year || '',
                summary: meta.Summary || '',
                language: meta.LanguageISO || '',
                direction: meta.Manga || '',
                thumb: '',
                size: Number(file.size || 0),
                pages: progress.pages,
                page: progress.page,
                progress: progress.percent,
                cached: false,
                source:
                    options.sourceUrl ||
                    file.webkitRelativePath ||
                    file.name
            };
        }

        function v82MetaCell(label, value) {
            if (
                value === undefined ||
                value === null ||
                String(value).trim() === ''
            ) {
                return '';
            }

            return `
                <div class="manga-info-meta">
                    <b>${escapeHtml(label)}</b>
                    <span>${escapeHtml(String(value))}</span>
                </div>`;
        }

        function v82RenderInfo(info) {
            const title = v82SafeText(info.title, 'Manga');
            const series = v82SafeText(
                info.series,
                info.sourceType === 'link'
                    ? 'Link Reader'
                    : 'Kirin Manga Library'
            );

            mangaInfoSource.textContent =
                info.sourceType === 'link'
                    ? 'LINK READER'
                    : 'LOCAL READER';

            mangaInfoTitle.textContent = title;
            mangaInfoSeries.textContent = series;
            mangaInfoFooterTitle.textContent = title;

            const chips = [];

            if (info.type) chips.push(info.type);
            if (info.chapter) chips.push(`CH ${info.chapter}`);
            if (info.volume) chips.push(`VOL ${info.volume}`);
            if (info.genre) {
                String(info.genre)
                    .split(',')
                    .slice(0, 3)
                    .forEach(genre => {
                        const clean = genre.trim();
                        if (clean) chips.push(clean);
                    });
            }

            mangaInfoChips.innerHTML = chips
                .slice(0, 6)
                .map(chip =>
                    `<span class="manga-info-chip">${escapeHtml(chip)}</span>`
                )
                .join('');

            const summary = String(info.summary || '').trim();
            mangaInfoSummary.textContent =
                summary ||
                'Tiada ringkasan tersedia. Jika CBZ mempunyai ComicInfo.xml, metadata akan cuba dimuat secara automatik.';
            mangaInfoSummary.classList.toggle('empty', !summary);

            const meta = [
                v82MetaCell('Series', info.series),
                v82MetaCell('Chapter', info.chapter),
                v82MetaCell('Volume', info.volume),
                v82MetaCell('Writer', info.writer),
                v82MetaCell('Genre', info.genre),
                v82MetaCell('Year', info.year),
                v82MetaCell('Language', info.language),
                v82MetaCell('Direction', info.direction),
                v82MetaCell('Pages', info.pages || ''),
                v82MetaCell(
                    'File Size',
                    info.size ? formatBytes(info.size) : ''
                ),
                v82MetaCell(
                    'Library',
                    info.sourceType === 'link'
                        ? 'Remote source'
                        : (info.cached ? 'Cached' : 'Local / Session')
                )
            ].filter(Boolean);

            mangaInfoMetaGrid.innerHTML = meta.length
                ? meta.join('')
                : v82MetaCell('Reader', info.type || 'Manga');

            mangaInfoSourceText.textContent =
                info.source || 'Local manga';

            const pages = Math.max(0, Number(info.pages || 0));
            const page = pages
                ? clamp(Number(info.page || 0), 0, pages - 1)
                : 0;

            const percent = pages
                ? Math.round(((page + 1) / pages) * 100)
                : Math.max(0, Number(info.progress || 0));

            mangaInfoProgressPercent.textContent = `${percent}%`;
            mangaInfoProgressBar.style.width = `${percent}%`;

            if (pages && percent > 0) {
                mangaInfoProgressLabel.textContent =
                    `Page ${page + 1} / ${pages}`;
                mangaInfoFooterMeta.textContent =
                    `Continue from page ${page + 1} • ${percent}%`;
                mangaInfoRead.textContent = 'CONTINUE READING';
            } else if (pages) {
                mangaInfoProgressLabel.textContent =
                    `${pages} pages • belum dibaca`;
                mangaInfoFooterMeta.textContent =
                    `${pages} pages • ready to read`;
                mangaInfoRead.textContent = 'READ NOW';
            } else {
                mangaInfoProgressLabel.textContent = 'Belum dibaca';
                mangaInfoFooterMeta.textContent = 'Ready to read';
                mangaInfoRead.textContent = 'READ NOW';
            }

            if (info.thumb) {
                mangaInfoCover.innerHTML =
                    `<img loading="eager" decoding="async" src="${info.thumb}" alt="${escapeHtml(title)}"/>`;
            } else {
                mangaInfoCover.innerHTML =
                    info.type === 'PDF'
                        ? '<span>PDF</span>'
                        : '<span>K</span>';
            }
        }

        function v82ShowInfo(info, pending) {
            v82InfoToken++;
            v82Pending = pending;
            v82Pending.info = info;

            status.style.display = 'none';
            mangaInfoError.classList.remove('show');
            mangaInfoError.textContent = '';

            v82RenderInfo(info);
            mangaInfoScreen.classList.add('open');
            document.body.classList.add('manga-info-open');
            mangaInfoScroll.scrollTop = 0;

            mangaInfoRead.disabled = false;

            return v82InfoToken;
        }

        function v82CloseInfo() {
            v82InfoToken++;
            mangaInfoScreen.classList.remove('open');
            document.body.classList.remove('manga-info-open');
            mangaInfoError.classList.remove('show');
            mangaInfoRead.disabled = false;
            v82Pending = null;
        }

        mangaInfoBack.onclick = v82CloseInfo;
        mangaInfoCancel.onclick = v82CloseInfo;

        document.addEventListener('keydown', event => {
            if (
                event.key === 'Escape' &&
                mangaInfoScreen.classList.contains('open')
            ) {
                v82CloseInfo();
            }
        });

        function v82ScheduleIdle(task) {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(
                    () => task(),
                    {timeout: 700}
                );
            } else {
                setTimeout(task, 120);
            }
        }

        async function v82EnrichZipInfo(file, token) {
            if (
                !file ||
                !/\.(cbz|zip)$/i.test(file.name || '')
            ) {
                return;
            }

            try {
                const zip = await JSZip.loadAsync(file);

                if (
                    token !== v82InfoToken ||
                    !mangaInfoScreen.classList.contains('open')
                ) {
                    return;
                }

                const fallback = v5MetadataFromFilename(
                    file.name,
                    file.webkitRelativePath || ''
                );

                let comicEntry = null;
                const images = [];

                zip.forEach((path, entry) => {
                    if (
                        !comicEntry &&
                        !entry.dir &&
                        /(^|\/)ComicInfo\.xml$/i.test(entry.name)
                    ) {
                        comicEntry = entry;
                    }

                    if (
                        !entry.dir &&
                        /\.(jpg|jpeg|png|webp|gif)$/i.test(entry.name) &&
                        !entry.name.includes('__MACOSX')
                    ) {
                        images.push(entry);
                    }
                });

                images.sort((a,b) =>
                    a.name.localeCompare(
                        b.name,
                        undefined,
                        {numeric:true, sensitivity:'base'}
                    )
                );

                const info = {
                    ...(v82Pending?.info || {})
                };

                info.pages = images.length || info.pages || 0;

                if (comicEntry) {
                    try {
                        const xml = await comicEntry.async('text');
                        const doc = new DOMParser().parseFromString(
                            xml,
                            'application/xml'
                        );

                        if (!doc.querySelector('parsererror')) {
                            info.title =
                                v5XmlText(doc, 'Title') ||
                                info.title ||
                                fallback.Title;
                            info.series =
                                v5XmlText(doc, 'Series') ||
                                info.series ||
                                fallback.Series;
                            info.chapter =
                                v5XmlText(doc, 'Number') ||
                                info.chapter ||
                                fallback.Number;
                            info.volume =
                                v5XmlText(doc, 'Volume') ||
                                info.volume ||
                                fallback.Volume;
                            info.writer =
                                v5XmlText(doc, 'Writer') ||
                                info.writer;
                            info.genre =
                                v5XmlText(doc, 'Genre') ||
                                info.genre;
                            info.year =
                                v5XmlText(doc, 'Year') ||
                                info.year;
                            info.summary =
                                v5XmlText(doc, 'Summary') ||
                                info.summary;
                            info.language =
                                v5XmlText(doc, 'LanguageISO') ||
                                info.language;
                            info.direction =
                                v5XmlText(doc, 'Manga') ||
                                info.direction;
                        }
                    } catch (_) {}
                }

                if (
                    !info.thumb &&
                    images[0] &&
                    file.size < 180 * 1024 * 1024
                ) {
                    try {
                        const blob = await images[0].async('blob');
                        info.thumb = await makeThumbDataUrl(blob);
                    } catch (_) {}
                }

                const progress = v82ProgressForKey(
                    info.key,
                    info.pages
                );

                info.page = progress.page;
                info.progress = progress.percent;

                if (
                    token !== v82InfoToken ||
                    !mangaInfoScreen.classList.contains('open')
                ) {
                    return;
                }

                if (v82Pending) v82Pending.info = info;
                v82RenderInfo(info);

            } catch (err) {
                console.warn('Manga Info metadata scan:', err);
            }
        }

        /* ---------------- Universal local gateway ---------------- */
        handleFile = async function(file, options = {}) {
            if (!file) return;

            if (
                v82BypassInfo ||
                options.__infoBypass === true
            ) {
                const cleanOptions = {...options};
                delete cleanOptions.__infoBypass;
                return v82RealHandleFile(file, cleanOptions);
            }

            const info = v82InfoFromFileFast(file, options);
            const token = v82ShowInfo(info, {
                kind: 'file',
                file,
                options: {...options}
            });

            if (/\.(cbz|zip)$/i.test(file.name || '')) {
                v82ScheduleIdle(
                    () => v82EnrichZipInfo(file, token)
                );
            }
        };

        /* ---------------- Library gateway ---------------- */
        v5OpenLibraryItem = async function(key) {
            const item = v5ReadLibrary().find(x => x.key === key);

            if (!item) {
                toast('Library item tidak ditemui.');
                return;
            }

            v5CurrentLibraryItem = item;

            const info = v82InfoFromLibraryItem(item);

            v82ShowInfo(info, {
                kind: 'library',
                key,
                item
            });
        };

        /* ---------------- Recent gateway ---------------- */
        reopenRecent = async function(data) {
            if (!data) return;

            const info = v82InfoFromRecent(data);

            v82ShowInfo(info, {
                kind: 'recent',
                data
            });
        };

        /* ---------------- Link gateway ---------------- */
        v3OpenLink = async function(rawUrl) {
            const url = String(rawUrl || '').trim();

            if (!/^https?:\/\//i.test(url)) {
                toast('Masukkan URL http/https yang sah.');
                return;
            }

            if (v82BypassInfo) {
                return v82RealOpenLink(url);
            }

            const historyItem =
                v3ReadLinkHistory().find(item => item.url === url) ||
                null;

            const info = v82InfoFromLink(url, historyItem);

            v82ShowInfo(info, {
                kind: 'link',
                url
            });
        };

        /* Cubari/JSON chapter selected after manifest discovery. */
        v3LoadRemoteImages = async function(urls, title, sourceUrl) {
            if (v82BypassInfo) {
                return v82RealLoadRemoteImages(
                    urls,
                    title,
                    sourceUrl
                );
            }

            const key = `link::${sourceUrl}`;
            const progress = v82ProgressForKey(
                key,
                urls?.length || 0
            );

            const info = {
                key,
                sourceType: 'link',
                type: 'LINK CHAPTER',
                title: title || 'Link Manga',
                series: 'Link Reader',
                chapter: '',
                volume: '',
                writer: '',
                genre: '',
                year: '',
                summary: '',
                thumb: urls?.[0] || '',
                size: 0,
                pages: urls?.length || 0,
                page: progress.page,
                progress: progress.percent,
                cached: false,
                source: sourceUrl
            };

            v82ShowInfo(info, {
                kind: 'remoteImages',
                urls,
                title,
                sourceUrl
            });
        };

        async function v82LoadPendingFile(pending) {
            if (pending.kind === 'file') {
                return {
                    file: pending.file,
                    options: pending.options || {}
                };
            }

            if (pending.kind === 'library') {
                let file =
                    v5SessionFiles.get(pending.key) ||
                    null;

                if (!file) {
                    file = await libraryGetFile(pending.key);
                }

                if (!file) {
                    throw new Error(
                        'Fail manga tidak lagi cached. Tambah semula file/folder asal ke Library.'
                    );
                }

                v5CurrentLibraryItem =
                    pending.item ||
                    v5ReadLibrary().find(
                        item => item.key === pending.key
                    ) ||
                    null;

                return {
                    file,
                    options: {}
                };
            }

            if (pending.kind === 'recent') {
                const key = pending.data?.key;

                let file =
                    v5SessionFiles.get(key) ||
                    null;

                if (!file) {
                    file = await libraryGetFile(key);
                }

                if (!file) {
                    throw new Error(
                        'Fail Recent Read tidak lagi ada dalam cache. Pilih fail asal semula.'
                    );
                }

                return {
                    file,
                    options: {persist:false}
                };
            }

            return null;
        }

        mangaInfoRead.onclick = async () => {
            const pending = v82Pending;
            if (!pending) return;

            mangaInfoRead.disabled = true;
            mangaInfoError.classList.remove('show');

            try {
                if (
                    pending.kind === 'file' ||
                    pending.kind === 'library' ||
                    pending.kind === 'recent'
                ) {
                    mangaInfoRead.textContent = 'LOADING...';

                    const target = await v82LoadPendingFile(
                        pending
                    );

                    v82BypassInfo = true;

                    try {
                        v82CloseInfo();

                        await v82RealHandleFile(
                            target.file,
                            {
                                ...(target.options || {}),
                                __infoBypass: true
                            }
                        );
                    } finally {
                        v82BypassInfo = false;
                    }

                } else if (pending.kind === 'link') {
                    mangaInfoRead.textContent = 'LOADING LINK...';
                    v82BypassInfo = true;

                    try {
                        v82CloseInfo();
                        await v82RealOpenLink(
                            pending.url
                        );
                    } finally {
                        v82BypassInfo = false;
                    }

                } else if (pending.kind === 'remoteImages') {
                    mangaInfoRead.textContent = 'OPENING...';
                    v82BypassInfo = true;

                    try {
                        v82CloseInfo();

                        await v82RealLoadRemoteImages(
                            pending.urls,
                            pending.title,
                            pending.sourceUrl
                        );
                    } finally {
                        v82BypassInfo = false;
                    }
                }

                if (
                    v82ResumePage !== null &&
                    totalPages > 0
                ) {
                    const page = clamp(
                        Number(v82ResumePage) + 1,
                        1,
                        totalPages
                    );

                    v82ResumePage = null;
                    jumpToPage(page);
                }

            } catch (err) {
                console.error('Manga Info read error:', err);

                mangaInfoError.textContent =
                    err?.message ||
                    'Manga gagal dibuka.';
                mangaInfoError.classList.add('show');
                mangaInfoRead.disabled = false;

                const progress = v82Pending?.info?.progress || 0;
                mangaInfoRead.textContent =
                    progress > 0
                        ? 'CONTINUE READING'
                        : 'READ NOW';
            }
        };

        /* Crash-resume also passes through Manga Info, then resumes the
           checkpoint page only after READ is pressed. */
        v7ResumeCheckpoint = async function() {
            const cp = v7ActiveCheckpoint();

            if (!cp) {
                return v7OpenContinueTarget();
            }

            v82ResumePage = Number(cp.page || 0);

            if (
                cp.sourceType === 'link' &&
                cp.sourceUrl
            ) {
                await v3OpenLink(cp.sourceUrl);
            } else {
                await v5OpenLibraryItem(cp.key);
            }
        };

        /* Going Home should close Manga Info if it happens to be open. */
        const v82GoHome = v3GoHome;
        v3GoHome = function() {
            if (mangaInfoScreen.classList.contains('open')) {
                v82CloseInfo();
            }
            return v82GoHome();
        };
        homeBtn.onclick = v3GoHome;

        /* Initial homepage render */
        function v81InitialHomepageRender() {
            v7ReadHomePrefs();
            v7ApplyHomeToggleUI();
            v81ScheduleHomeDashboard();
        }

        v81InitialHomepageRender();


        /* =====================================================
           v6.2.1 — SAFE BOOK MODE / RTL-LTR SWITCH
           ===================================================== */

        let v621ModeSwitching = false;
        let v621DirectionFrame = 0;
        let v621CenterPointerStart = null;

        /* Full-screen Touch Zone overlay is retired.
           The existing left/right .manga-nav elements are now the touch
           zones, so nothing transparent can cover the entire reader. */
        v6RefreshTouchZones = function() {
            const bookActive =
                totalPages > 0 &&
                setup.style.display === 'none' &&
                currentMode === 'book';

            touchZoneLayer.classList.remove('active');
            touchZoneLayer.style.display = 'none';
            touchZoneLayer.style.pointerEvents = 'none';

            const side = clamp(Number(v6TouchSide || 31), 20, 42);
            document.documentElement.style.setProperty(
                '--v6-touch-side',
                `${side}%`
            );

            if (bookActive && v6TouchEnabled) {
                navPrev.style.width = `${side}%`;
                navNext.style.width = `${side}%`;
                navPrev.style.pointerEvents = 'auto';
                navNext.style.pointerEvents = 'auto';
            } else if (bookActive) {
                /* Touch Zones OFF: keep the classic smaller Book click area. */
                navPrev.style.width = '24%';
                navNext.style.width = '24%';
                navPrev.style.pointerEvents = 'auto';
                navNext.style.pointerEvents = 'auto';
            } else {
                navPrev.style.pointerEvents = '';
                navNext.style.pointerEvents = '';
            }
        };

        /* Safe direction setter.
           It does not call setMode(), avoiding mode/profile/render loops. */
        setDirection = function(direction) {
            const nextDirection = direction === 'ltr' ? 'ltr' : 'rtl';

            if (readingDirection === nextDirection) {
                dirRtlBtn.classList.toggle('active', readingDirection === 'rtl');
                dirLtrBtn.classList.toggle('active', readingDirection === 'ltr');
                modeBookBtn.textContent = `BOOK (${readingDirection.toUpperCase()})`;
                applyBookDirection();
                v6RefreshTouchZones();
                return;
            }

            readingDirection = nextDirection;

            dirRtlBtn.classList.toggle('active', readingDirection === 'rtl');
            dirLtrBtn.classList.toggle('active', readingDirection === 'ltr');
            modeBookBtn.textContent = `BOOK (${readingDirection.toUpperCase()})`;

            /* Reposition the two real Book nav zones immediately. */
            applyBookDirection();
            v6RefreshTouchZones();

            /* Render only once on the next frame. Multiple rapid clicks
               collapse into one render. */
            cancelAnimationFrame(v621DirectionFrame);
            v621DirectionFrame = requestAnimationFrame(() => {
                if (currentMode === 'book' && totalPages > 0) {
                    renderBookPages();
                    updatePageIndicator();
                    updateReaderProgress();
                }
            });

            savePrefs();
            saveCurrentProgress();
            v3SavePrefs?.();
            v5SavePrefs?.();
            v6ScheduleProfileSave?.();
            updateFileInfo();
            v3UpdateInfo?.();
        };

        /* Rebind direction buttons explicitly after all addon layers. */
        dirRtlBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setDirection('rtl');
        };

        dirLtrBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setDirection('ltr');
        };

        /* Guard final mode chain against rapid/re-entrant Book switching.
           Existing v3/v4/v5/v6 behavior still runs, but only one transition
           can execute at a time. */
        const v621PreviousSetMode = setMode;
        setMode = function(mode, persist = true, restoring = false) {
            const target = mode === 'book' ? 'book' : 'list';

            if (v621ModeSwitching) {
                return;
            }

            /* Already in this mode: just refresh UI; don't rerun every layer. */
            if (currentMode === target && !restoring) {
                if (target === 'book') {
                    applyBookDirection();
                    renderBookPages();
                    v6RefreshTouchZones();
                }
                return;
            }

            v621ModeSwitching = true;
            document.body.classList.add('v621-book-switching');

            try {
                const result = v621PreviousSetMode(
                    target,
                    persist,
                    restoring
                );

                if (target === 'book') {
                    applyBookDirection();
                    v6RefreshTouchZones();
                } else {
                    touchZoneLayer.classList.remove('active');
                    touchZoneLayer.style.display = 'none';
                    touchZoneLayer.style.pointerEvents = 'none';
                    navPrev.style.width = '';
                    navNext.style.width = '';
                }

                return result;
            } finally {
                requestAnimationFrame(() => {
                    v621ModeSwitching = false;
                    document.body.classList.remove('v621-book-switching');
                    v6RefreshTouchZones();
                });
            }
        };

        /* Rebind BOOK/LIST after the final safe setMode wrapper. */
        modeListBtn.onclick = event => {
            event.preventDefault();
            v5Webtoon = false;
            viewer.classList.remove('webtoon-mode');
            modeWebtoonBtn.classList.remove('active');
            setMode('list');
        };

        modeBookBtn.onclick = event => {
            event.preventDefault();
            v5Webtoon = false;
            viewer.classList.remove('webtoon-mode');
            modeWebtoonBtn.classList.remove('active');
            setMode('book');
        };

        /* Touch Zones center action no longer needs a full-screen button.
           On coarse/mobile pointers, a short tap in the free center of the
           actual viewer toggles the UI. Side taps are handled by manga-nav. */
        viewer.addEventListener('pointerdown', event => {
            if (
                currentMode !== 'book' ||
                !v6TouchEnabled ||
                event.pointerType === 'mouse'
            ) {
                v621CenterPointerStart = null;
                return;
            }

            v621CenterPointerStart = {
                x: event.clientX,
                y: event.clientY,
                time: performance.now()
            };
        }, {passive:true});

        viewer.addEventListener('pointerup', event => {
            const start = v621CenterPointerStart;
            v621CenterPointerStart = null;

            if (
                !start ||
                currentMode !== 'book' ||
                !v6TouchEnabled ||
                event.pointerType === 'mouse'
            ) {
                return;
            }

            const dx = Math.abs(event.clientX - start.x);
            const dy = Math.abs(event.clientY - start.y);
            const dt = performance.now() - start.time;

            if (dx > 18 || dy > 18 || dt > 420) return;

            const sidePercent = clamp(Number(v6TouchSide || 31), 20, 42) / 100;
            const ratio = event.clientX / Math.max(1, window.innerWidth);

            /* Only the free center zone toggles UI. */
            if (
                ratio > sidePercent &&
                ratio < (1 - sidePercent)
            ) {
                v6ToggleReaderChrome();
            }
        }, {passive:true});

        /* Prevent the retired overlay buttons from firing if a browser keeps
           an old pointer target during a transition. */
        [touchZonePrev, touchZoneCenter, touchZoneNext].forEach(btn => {
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
        });

        /* If a previous bad state left the page "blocked", normalize it. */
        touchZoneLayer.classList.remove('active');
        touchZoneLayer.style.display = 'none';
        touchZoneLayer.style.pointerEvents = 'none';
        document.body.classList.remove('v621-book-switching');
        document.body.style.pointerEvents = '';


        /* =====================================================
           v6.2.2 — CLEAN / CANONICAL BOOK ENGINE
           Do not call any previous Book wrappers from here.
           ===================================================== */

        let v622NavLock = false;
        let v622PointerNavAt = 0;

        function v622PageImages() {
            return Array.from(
                viewer.querySelectorAll('img[data-index]')
            );
        }

        function v622Landscape(index) {
            if (
                index < 0 ||
                index >= totalPages
            ) {
                return false;
            }

            const img = v4GetPageElement?.(index);
            if (!img) return false;

            if (img.dataset.v5Landscape === '1') return true;

            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                return img.naturalWidth / img.naturalHeight > 1.18;
            }

            return false;
        }

        function v622SingleAt(index) {
            if (!doublePage) return true;

            /* Cover remains a single page when smart spread is enabled. */
            if (v5SmartSpread && index === 0) return true;

            /* 2-page odd explicitly keeps first page single. */
            if (v3SpreadOdd && index === 0) return true;

            /* Wide spread should stand alone. */
            if (
                v5SmartSpread &&
                (
                    v622Landscape(index) ||
                    v622Landscape(index + 1)
                )
            ) {
                return true;
            }

            return false;
        }

        function v622BookStarts() {
            const starts = [];

            if (!totalPages) return starts;

            let index = 0;
            let guard = 0;

            while (
                index < totalPages &&
                guard < totalPages + 4
            ) {
                starts.push(index);

                index += v622SingleAt(index)
                    ? 1
                    : 2;

                guard++;
            }

            return starts;
        }

        function v622NormalizeBookIndex(index = activePageIndex) {
            if (!totalPages) return 0;

            const target = clamp(
                Number(index || 0),
                0,
                totalPages - 1
            );

            const starts = v622BookStarts();
            if (!starts.length) return target;

            let best = starts[0];

            for (const start of starts) {
                if (start > target) break;
                best = start;
            }

            return best;
        }

        function v622ApplyDirection() {
            const rtl = readingDirection !== 'ltr';
            readingDirection = rtl ? 'rtl' : 'ltr';

            viewer.classList.toggle(
                'direction-rtl',
                rtl
            );
            viewer.classList.toggle(
                'direction-ltr',
                !rtl
            );

            viewer.style.direction = rtl ? 'rtl' : 'ltr';

            dirRtlBtn.classList.toggle(
                'active',
                rtl
            );
            dirLtrBtn.classList.toggle(
                'active',
                !rtl
            );

            modeBookBtn.textContent =
                `BOOK (${readingDirection.toUpperCase()})`;

            /* Physical page-turn zones follow reading direction. */
            if (rtl) {
                navNext.style.left = '0';
                navNext.style.right = 'auto';
                navPrev.style.right = '0';
                navPrev.style.left = 'auto';
            } else {
                navPrev.style.left = '0';
                navPrev.style.right = 'auto';
                navNext.style.right = '0';
                navNext.style.left = 'auto';
            }
        }

        applyBookDirection = v622ApplyDirection;

        renderBookPages = function() {
            if (
                currentMode !== 'book' ||
                totalPages <= 0
            ) {
                return;
            }

            const images = v622PageImages();
            if (!images.length) return;

            activePageIndex = v622NormalizeBookIndex(
                activePageIndex
            );

            images.forEach(img => {
                img.classList.remove(
                    'active',
                    'active-pair'
                );
            });

            const primary =
                v4GetPageElement?.(activePageIndex) ||
                images[activePageIndex];

            if (primary) {
                primary.classList.add('active');
                v4EnsurePageLoaded?.(activePageIndex);
            }

            if (!v622SingleAt(activePageIndex)) {
                const pairIndex = activePageIndex + 1;

                if (pairIndex < totalPages) {
                    const pair =
                        v4GetPageElement?.(pairIndex) ||
                        images[pairIndex];

                    if (pair) {
                        pair.classList.add('active-pair');
                        v4EnsurePageLoaded?.(pairIndex);
                    }
                }
            }

            viewer.classList.toggle(
                'double-page',
                !!doublePage
            );

            v622ApplyDirection();

            v4WarmAround?.(activePageIndex);
            updateThumbnailsActive?.();
            v3UpdateSelectorThumbActive?.();
            v5UpdateBookmarkButton?.();
        };

        function v622SyncBookUI(save = true) {
            updatePageIndicator?.();
            updateReaderProgress?.();
            updateFileInfo?.();
            v3UpdateInfo?.();
            v5MarkPageRead?.();

            if (save) {
                saveCurrentProgress?.();
            }
        }

        changePage = function(next = true) {
            if (!totalPages) return;

            /* Keep list mode behavior straightforward. */
            if (currentMode !== 'book') {
                const target = clamp(
                    activePageIndex + (next ? 1 : -1),
                    0,
                    totalPages - 1
                );

                if (target === activePageIndex) {
                    if (next && activePageIndex >= totalPages - 1) {
                        v5ShowChapterEnd?.();
                    }
                    return;
                }

                activePageIndex = target;

                v4EnsurePageLoaded?.(activePageIndex);

                viewer
                    .querySelector(
                        `img[data-index="${activePageIndex}"]`
                    )
                    ?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });

                v622SyncBookUI(true);
                return;
            }

            if (v622NavLock) return;
            v622NavLock = true;

            try {
                const starts = v622BookStarts();
                if (!starts.length) return;

                activePageIndex =
                    v622NormalizeBookIndex(
                        activePageIndex
                    );

                let position =
                    starts.indexOf(activePageIndex);

                if (position < 0) {
                    position = 0;
                }

                const targetPosition =
                    position + (next ? 1 : -1);

                if (
                    targetPosition < 0 ||
                    targetPosition >= starts.length
                ) {
                    if (next) {
                        v5ShowChapterEnd?.();
                    } else {
                        toast('Sudah halaman pertama');
                    }
                    return;
                }

                activePageIndex =
                    starts[targetPosition];

                renderBookPages();
                window.scrollTo(0, 0);
                v622SyncBookUI(true);

            } finally {
                requestAnimationFrame(() => {
                    v622NavLock = false;
                });
            }
        };

        jumpToPage = function(pageNumber) {
            if (!totalPages) return;

            const target = clamp(
                Number(pageNumber || 1) - 1,
                0,
                totalPages - 1
            );

            activePageIndex =
                currentMode === 'book'
                    ? v622NormalizeBookIndex(target)
                    : target;

            v4EnsurePageLoaded?.(activePageIndex);
            v4WarmAround?.(activePageIndex);

            if (currentMode === 'book') {
                renderBookPages();
                window.scrollTo(0, 0);
            } else {
                viewer
                    .querySelector(
                        `img[data-index="${activePageIndex}"]`
                    )
                    ?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
            }

            v622SyncBookUI(true);
        };

        setDirection = function(direction) {
            readingDirection =
                direction === 'ltr'
                    ? 'ltr'
                    : 'rtl';

            v622ApplyDirection();

            if (currentMode === 'book') {
                renderBookPages();
            }

            savePrefs?.();
            v3SavePrefs?.();
            v5SavePrefs?.();
            saveCurrentProgress?.();
            v6ScheduleProfileSave?.();
            updateFileInfo?.();
            v3UpdateInfo?.();
        };

        setDoublePage = function(enabled) {
            doublePage = !!enabled;

            if (!doublePage) {
                v3SpreadOdd = false;
            }

            singlePageBtn.classList.toggle(
                'active',
                !doublePage
            );
            doublePageBtn.classList.toggle(
                'active',
                doublePage && !v3SpreadOdd
            );
            doubleOddBtn?.classList.toggle(
                'active',
                doublePage && !!v3SpreadOdd
            );

            viewer.classList.toggle(
                'double-page',
                currentMode === 'book' && doublePage
            );

            if (currentMode === 'book') {
                activePageIndex =
                    v622NormalizeBookIndex(
                        activePageIndex
                    );
                renderBookPages();
            }

            savePrefs?.();
            v3SavePrefs?.();
            saveCurrentProgress?.();
            v6ScheduleProfileSave?.();
            updateFileInfo?.();
        };

        setMode = function(mode, persist = true, restoring = false) {
            const target =
                mode === 'book'
                    ? 'book'
                    : 'list';

            stopAutoScroll?.();

            currentMode = target;

            modeListBtn.classList.toggle(
                'active',
                target === 'list'
            );
            modeBookBtn.classList.toggle(
                'active',
                target === 'book'
            );

            viewer.classList.remove(
                'webtoon-mode'
            );
            modeWebtoonBtn?.classList.remove(
                'active'
            );
            v5Webtoon = false;

            touchZoneLayer.classList.remove('active');
            touchZoneLayer.style.display = 'none';
            touchZoneLayer.style.pointerEvents = 'none';

            if (target === 'book') {
                document.body.classList.add(
                    'v622-book-active'
                );

                viewer.classList.add(
                    'book-mode'
                );
                viewer.classList.toggle(
                    'double-page',
                    !!doublePage
                );

                navPrev.style.display = 'block';
                navNext.style.display = 'block';

                /* The old v3 capture blocker checks this variable. */
                if (typeof v3ClickTurn !== 'undefined') {
                    v3ClickTurn = true;
                }

                header.classList.remove('hide');

                activePageIndex =
                    v622NormalizeBookIndex(
                        activePageIndex
                    );

                v622ApplyDirection();
                renderBookPages();
                window.scrollTo(0, 0);

            } else {
                document.body.classList.remove(
                    'v622-book-active'
                );

                viewer.classList.remove(
                    'book-mode',
                    'double-page',
                    'direction-rtl',
                    'direction-ltr'
                );
                viewer.style.direction = '';

                navPrev.style.display = 'none';
                navNext.style.display = 'none';

                navPrev.style.left = '';
                navPrev.style.right = '';
                navNext.style.left = '';
                navNext.style.right = '';

                header.classList.remove('hide');

                v622PageImages().forEach(img => {
                    img.classList.remove(
                        'active',
                        'active-pair'
                    );
                });

                if (totalPages) {
                    v4EnsurePageLoaded?.(
                        activePageIndex
                    );

                    requestAnimationFrame(() => {
                        viewer
                            .querySelector(
                                `img[data-index="${activePageIndex}"]`
                            )
                            ?.scrollIntoView({
                                block: 'start'
                            });
                    });
                }
            }

            v6RefreshTouchZones?.();
            v622SyncBookUI(
                persist && !restoring
            );
        };

        /* ---------- FINAL BUTTON BINDINGS ---------- */

        modeListBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setMode('list');
        };

        modeBookBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setMode('book');
        };

        dirRtlBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setDirection('rtl');
        };

        dirLtrBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setDirection('ltr');
        };

        singlePageBtn.onclick = event => {
            event.preventDefault();
            v3SpreadOdd = false;
            setDoublePage(false);
        };

        doublePageBtn.onclick = event => {
            event.preventDefault();
            v3SpreadOdd = false;
            setDoublePage(true);
        };

        if (doubleOddBtn) {
            doubleOddBtn.onclick = event => {
                event.preventDefault();
                v3SpreadOdd = true;
                doublePage = true;
                activePageIndex =
                    v622NormalizeBookIndex(
                        activePageIndex
                    );
                setDoublePage(true);
            };
        }

        /* Old click listeners can be blocked by the v3 capture setting.
           Pointer-up is used as the canonical physical/touch Book nav,
           while onclick is neutralized to prevent double turns. */
        navPrev.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
        };

        navNext.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
        };

        navPrev.onpointerup = event => {
            if (
                currentMode !== 'book' ||
                event.button > 0
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const now = performance.now();
            if (now - v622PointerNavAt < 180) return;
            v622PointerNavAt = now;

            changePage(false);
        };

        navNext.onpointerup = event => {
            if (
                currentMode !== 'book' ||
                event.button > 0
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const now = performance.now();
            if (now - v622PointerNavAt < 180) return;
            v622PointerNavAt = now;

            changePage(true);
        };

        /* ---------- FINAL KEYBOARD ROUTER ----------
           Capture phase + stopImmediatePropagation means older Book key
           listeners cannot double-run or swallow the page turn. */
        window.addEventListener(
            'keydown',
            event => {
                if (
                    mangaInfoScreen?.classList.contains('open') ||
                    pageManagerOverlay?.classList.contains('open') ||
                    chapterEndOverlay?.classList.contains('open')
                ) {
                    return;
                }

                const tag =
                    document.activeElement
                        ?.tagName
                        ?.toLowerCase();

                if (
                    tag === 'input' ||
                    tag === 'textarea' ||
                    tag === 'select' ||
                    document.activeElement?.isContentEditable
                ) {
                    return;
                }

                if (
                    currentMode !== 'book' ||
                    !totalPages
                ) {
                    return;
                }

                let handled = false;

                if (event.key === 'ArrowLeft') {
                    handled = true;

                    changePage(
                        readingDirection === 'rtl'
                    );
                } else if (
                    event.key === 'ArrowRight'
                ) {
                    handled = true;

                    changePage(
                        readingDirection !== 'rtl'
                    );
                }

                if (handled) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            },
            true
        );

        /* If this build is loaded while an old Book state is persisted,
           normalize it once after all final functions exist. */
        requestAnimationFrame(() => {
            touchZoneLayer.classList.remove('active');
            touchZoneLayer.style.display = 'none';
            touchZoneLayer.style.pointerEvents = 'none';

            if (
                currentMode === 'book' &&
                totalPages > 0
            ) {
                setMode('book', false, true);
            }
        });


        /* =====================================================
           v6.2.3 — SAFE PAGE SELECTOR
           ===================================================== */

        function v623SyncSelectorHandle() {
            const collapsed =
                pageSelector.classList.contains('collapsed');

            const bottom =
                pageSelector.classList.contains('position-bottom');

            selectorHandle.innerHTML = bottom
                ? (collapsed ? '&#8743;' : '&#8744;')
                : (collapsed ? '&#8250;' : '&#8249;');

            selectorHandle.setAttribute(
                'aria-expanded',
                collapsed ? 'false' : 'true'
            );

            selectorHandle.title = collapsed
                ? 'Open page selector'
                : 'Close page selector';
        }

        function v623CloseSelector() {
            pageSelector.classList.add('collapsed');
            v623SyncSelectorHandle();

            /* A sidebar button must never keep arrow-key focus. */
            if (
                document.activeElement &&
                pageSelector.contains(document.activeElement)
            ) {
                document.activeElement.blur();
            }
        }

        function v623OpenSelector() {
            pageSelector.classList.remove('collapsed');
            v623SyncSelectorHandle();
        }

        /* The old v3 updater automatically expanded a pinned selector.
           Preserve the user's current collapsed/open state instead. */
        const v623OldUpdateSelector = v3UpdateSelector;

        v3UpdateSelector = function() {
            const wasCollapsed =
                pageSelector.classList.contains('collapsed');

            const result = v623OldUpdateSelector();

            if (wasCollapsed) {
                pageSelector.classList.add('collapsed');
            }

            v623SyncSelectorHandle();
            return result;
        };

        /* Replace old one-line toggle. Prevent button focus from lingering. */
        selectorHandle.tabIndex = -1;

        selectorHandle.onclick = event => {
            event.preventDefault();
            event.stopPropagation();

            if (
                pageSelector.classList.contains('collapsed')
            ) {
                v623OpenSelector();
            } else {
                v623CloseSelector();
            }

            selectorHandle.blur();
        };

        /* Most important part:
           every NEW manga/reader session starts with selector CLOSED.
           v4FinalizeReaderSource calls v5AfterBookOpen dynamically, so
           this final wrapper covers Local, Library, Recent, PDF and Link. */
        const v623OldAfterBookOpen = v5AfterBookOpen;

        v5AfterBookOpen = async function(file, options = {}) {
            const result = await v623OldAfterBookOpen(
                file,
                options
            );

            v623CloseSelector();

            /* Keep it closed after delayed selector/thumb updates too. */
            requestAnimationFrame(v623CloseSelector);
            setTimeout(v623CloseSelector, 80);

            return result;
        };

        /* Opening Book manually also starts clean if selector was left open
           in Scroll mode. This is an event hook, not another setMode wrapper. */
        modeBookBtn.addEventListener('click', () => {
            requestAnimationFrame(v623CloseSelector);
        });

        /* If reader loads from saved state, normalize selector once. */
        requestAnimationFrame(() => {
            if (
                setup.style.display === 'none' &&
                totalPages > 0
            ) {
                v623CloseSelector();
            } else {
                v623SyncSelectorHandle();
            }
        });

        /* Init v6 */
        v6LoadGlobalAddonPrefs();
        v6RenderProfileStatus();
        v6RenderSeriesProgress(v5ReadLibrary());
        v6RefreshStorageManager();


        /* ---------------- Initialization ---------------- */
        v5LoadPrefs();
        v5RenderLibrary();
        v5RenderSessions();
        v5RenderComicInfo();
        v5RenderPageBookmarks();


        window.addEventListener('beforeunload', () => {
            v5EndSession(false);
            saveCurrentProgress(true);
            v4DestroySource();
            cleanupObjectUrls();
        });
