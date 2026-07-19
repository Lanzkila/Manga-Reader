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

        let currentMode = 'list'; 
        let totalPages = 0;
        let activePageIndex = 0;
        let currentWidth = 900;

        // Logik scroll hide HANYA berfungsi pada Scroll Mode sahaja
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            if (currentMode === 'book') return;
            const currentScroll = window.pageYOffset;
            if (currentScroll > lastScroll && currentScroll > 50) {
                header.classList.add('hide');
            } else {
                header.classList.remove('hide');
            }
            lastScroll = currentScroll;
        });

        fileInput.onchange = (e) => handleFile(e.target.files[0]);

        async function handleFile(file) {
            if (!file) return;
            status.style.display = 'block';
            status.innerText = "Sila tunggu, Kirin sedang memproses fail...";

            try {
                const zip = await JSZip.loadAsync(file);
                const files = [];

                zip.forEach((path, entry) => {
                    if (entry.name.match(/\.(jpg|jpeg|png|webp|gif)$/i) && !entry.name.includes('__MACOSX')) {
                        files.push(entry);
                    }
                });

                files.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));

                totalPages = files.length;
                updatePageIndicator();

                let index = 0;
                for (let fileObj of files) {
                    const blob = await fileObj.async("blob");
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    img.loading = "lazy"; 
                    img.setAttribute('data-index', index);
                    if (index === 0) img.classList.add('active');
                    viewer.appendChild(img);
                    index++;
                }

                setup.style.display = 'none';
                topControls.style.display = 'flex';
                window.scrollTo(0, 0);

            } catch (err) {
                alert("Fail rosak atau tidak disokong: " + err);
                location.reload();
            }
        }

        function updatePageIndicator() {
            if (currentMode === 'list') {
                pageCounter.innerText = `${totalPages} Pgs`;
            } else {
                pageCounter.innerText = `${activePageIndex + 1} / ${totalPages}`;
            }
        }

        modeListBtn.onclick = () => {
            currentMode = 'list';
            modeListBtn.classList.add('active');
            modeBookBtn.classList.remove('active');
            viewer.classList.remove('book-mode');
            
            navPrev.style.display = 'none';
            navNext.style.display = 'none';
            header.classList.remove('hide'); // Pastikan header muncul balik
            
            const images = viewer.querySelectorAll('img');
            images.forEach(img => img.classList.remove('active'));
            
            updatePageIndicator();
        };

        modeBookBtn.onclick = () => {
            currentMode = 'book';
            modeBookBtn.classList.add('active');
            modeListBtn.classList.remove('active');
            viewer.classList.add('book-mode');
            
            navPrev.style.display = 'block';
            navNext.style.display = 'block';
            
            // FIX: KOD HIDE HEADER SECARA OTOMATIK SUDAH DIBUANG SINI
            header.classList.remove('hide'); 
            
            const images = viewer.querySelectorAll('img');
            if (images.length > 0) {
                images.forEach((img, idx) => {
                    if (idx === activePageIndex) img.classList.add('active');
                    else img.classList.remove('active');
                });
            }

            updatePageIndicator();
        };

        // Kebolehan memanggil menu jika ter-scroll tersembunyi kekal dikekalkan untuk keselamatan
        const showHeaderActions = (clientY) => {
            if (currentMode === 'book' && clientY < 60) {
                header.classList.remove('hide');
            }
        };
        window.addEventListener('mousemove', (e) => showHeaderActions(e.clientY));
        window.addEventListener('touchstart', (e) => showHeaderActions(e.touches[0].clientY));

        function changePage(next = true) {
            const images = viewer.querySelectorAll('img');
            if (images.length === 0) return;

            images[activePageIndex].classList.remove('active');

            if (next) {
                if (activePageIndex < totalPages - 1) activePageIndex++;
            } else {
                if (activePageIndex > 0) activePageIndex--;
            }

            images[activePageIndex].classList.add('active');
            updatePageIndicator();
            
            // FIX: KOD HIDE HEADER SELEPAS TUKAR HALAMAN SUDAH DIBUANG SINI
        }

        navNext.onclick = (e) => { e.stopPropagation(); changePage(true); };
        navPrev.onclick = (e) => { e.stopPropagation(); changePage(false); };

        window.addEventListener('keydown', (e) => {
            if (currentMode !== 'book') return;
            if (e.key === 'ArrowRight') changePage(true);
            if (e.key === 'ArrowLeft') changePage(false);
        });

        // Touch Swipe detector HP
        let touchStartX = 0;
        let touchEndX = 0;

        viewer.addEventListener('touchstart', (e) => {
            if (currentMode !== 'book') return;
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        viewer.addEventListener('touchend', (e) => {
            if (currentMode !== 'book') return;
            touchEndX = e.changedTouches[0].screenX;
            handleSwipeGesture();
        }, { passive: true });

        function handleSwipeGesture() {
            const swipeThreshold = 50;
            if (touchStartX - touchEndX > swipeThreshold) {
                changePage(true);
            }
            if (touchEndX - touchStartX > swipeThreshold) {
                changePage(false);
            }
        }

        zoomIn.onclick = () => {
            if (currentWidth < 1400) {
                currentWidth += 100;
                document.documentElement.style.setProperty('--manga-max-width', `${currentWidth}px`);
            }
        };
        zoomOut.onclick = () => {
            if (currentWidth > 500) {
                currentWidth -= 100;
                document.documentElement.style.setProperty('--manga-max-width', `${currentWidth}px`);
            }
        };

        const dropArea = document.getElementById('dropArea');
        dropArea.ondragover = (e) => { e.preventDefault(); dropArea.style.borderColor = "#8ab4f8"; };
        dropArea.ondragleave = () => { dropArea.style.borderColor = "#333"; };
        dropArea.ondrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };
