// --- 1. LOCAL DATABASE (IndexedDB) ---
let db;
const hasGsap = typeof window.gsap !== "undefined";
const dbRequest = indexedDB.open("DistanceLoveDB", 1);

dbRequest.onupgradeneeded = (e) => {
    db = e.target.result;
    db.createObjectStore("capsules", { keyPath: "id", autoIncrement: true });
};

dbRequest.onsuccess = (e) => {
    db = e.target.result;
    renderVault();
    setInterval(renderVault, 1000); 
};
dbRequest.onerror = () => {
    alert("Could not open local memory vault storage.");
};

// --- 2. GSAP ENTRANCE ---
window.addEventListener('load', () => {
    const container = document.querySelector(".container");
    if (!container) return;
    if (hasGsap) {
        gsap.to(container, { opacity: 1, duration: 1 });
    } else {
        container.style.opacity = "1";
    }
});

// --- 3. FILE FEEDBACK ---
function setupFilePreview(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;

    input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
            label.classList.add('selected');
            label.querySelector('.label-text').textContent = "Attached ✓";
            if (hasGsap) {
                gsap.from(label, { scale: 1.1, duration: 0.3 });
            }
        }
    });
}
setupFilePreview('imageInput', 'imageLabel');
setupFilePreview('mediaInput', 'mediaLabel');

// --- 4. SAVE TO LOCALHOST DATABASE ---
document.getElementById('saveBtn').addEventListener('click', async () => {
    if (!db) {
        alert("Vault is still loading. Please wait a moment.");
        return;
    }

    const title = document.getElementById('capsuleTitle').value;
    const message = document.getElementById('capsuleMessage').value;
    const unlockDate = document.getElementById('unlockDate').value;
    const imageFile = document.getElementById('imageInput').files[0];
    const mediaFile = document.getElementById('mediaInput').files[0];

    if (!title || !unlockDate) return alert("Title and Unlock Date are required!");

    const unlockAt = new Date(unlockDate).getTime();
    if (Number.isNaN(unlockAt)) return alert("Please choose a valid unlock date.");

    const capsule = {
        title, message,
        unlockAt,
        image: imageFile || null,
        media: mediaFile || null,
        created: Date.now()
    };

    const tx = db.transaction("capsules", "readwrite");
    tx.objectStore("capsules").add(capsule);
    tx.oncomplete = () => {
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.textContent = "Sealed Locally! ✨";
        if (hasGsap) {
            gsap.to(saveBtn, { backgroundColor: "#28a745", duration: 0.3 });
        } else {
            saveBtn.style.backgroundColor = "#28a745";
        }

        document.getElementById('capsuleTitle').value = '';
        document.getElementById('capsuleMessage').value = '';
        document.getElementById('unlockDate').value = '';
        document.getElementById('imageInput').value = '';
        document.getElementById('mediaInput').value = '';
        renderVault();

        setTimeout(() => {
            saveBtn.textContent = "Seal This Memory";
            saveBtn.style.backgroundColor = '';
        }, 1200);
    };
});

// --- 5. RENDER FROM DATABASE ---
function renderVault() {
    const container = document.getElementById('capsuleContainer');
    if (!db || !container) return;

    const tx = db.transaction("capsules", "readonly");
    const store = tx.objectStore("capsules");
    const getRequest = store.getAll();

    getRequest.onsuccess = () => {
        const capsules = getRequest.result;
        capsules.sort((a, b) => b.created - a.created);
        
        if (container.children.length !== capsules.length) {
            container.innerHTML = '';
            capsules.forEach((cap, i) => {
                const card = document.createElement('div');
                card.className = 'capsule-card';
                container.appendChild(card);
                updateCardContent(cap, card);
                if (hasGsap) {
                    gsap.to(card, { opacity: 1, y: 0, duration: 0.5, delay: i * 0.1 });
                }
            });
        } else {
            capsules.forEach((cap, i) => updateCardContent(cap, container.children[i]));
        }
    };
}

function updateCardContent(cap, cardElement) {
    if (!cardElement) return;

    const now = Date.now();
    const diff = cap.unlockAt - now;
    const isUnlocked = diff <= 0;

    if (isUnlocked) {
        if (cardElement.dataset.status !== "open") {
            cardElement.dataset.status = "open";
            cardElement.innerHTML = '';

            const title = document.createElement('h3');
            title.textContent = cap.title;
            cardElement.appendChild(title);

            const body = document.createElement('p');
            body.textContent = cap.message || '';
            cardElement.appendChild(body);

            if (cap.image) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(cap.image);
                cardElement.appendChild(img);
            }

            if (cap.media) {
                const mediaUrl = URL.createObjectURL(cap.media);
                if (cap.media.type.includes('video')) {
                    const video = document.createElement('video');
                    video.src = mediaUrl;
                    video.controls = true;
                    cardElement.appendChild(video);
                } else {
                    const audio = document.createElement('audio');
                    audio.src = mediaUrl;
                    audio.controls = true;
                    cardElement.appendChild(audio);
                }
            }
            // Purge previously released notes/media from older/unlocked capsules
            try {
                purgePreviousReleases(cap.id);
            } catch (e) {
                console.warn('Could not purge previous releases', e);
            }
            // Schedule this unlocked capsule (and any other unlocked items) to be
            // removed when the page is closed, as requested by the user.
            try {
                schedulePurgeOnExit(cap.id);
            } catch (e) {
                console.warn('Could not schedule purge on exit', e);
            }
        }
    } else {
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        cardElement.innerHTML = `<h3>${cap.title} 🔒</h3><p class="timer">Opens in: ${d}d ${h}h ${m}m ${s}s</p>`;
    }
}

// Remove message/image/media from other capsules that are already unlocked
function purgePreviousReleases(currentId) {
    if (!db) return;
    const now = Date.now();
    const tx = db.transaction('capsules', 'readwrite');
    const store = tx.objectStore('capsules');
    const req = store.getAll();
    req.onsuccess = () => {
        const items = req.result || [];
        items.forEach(item => {
            if (!item || item.id === currentId) return;
            if ((item.unlockAt || 0) <= now) {
                // If already purged, skip
                const needsPurge = (item.message && item.message.length) || item.image || item.media;
                if (needsPurge) {
                    item.message = '';
                    item.image = null;
                    item.media = null;
                    store.put(item);
                }
            }
        });
    };
}

// Keep a session-only list of capsule ids (or simply mark unlocked items)
// that should be deleted when the page/window is closed.
function schedulePurgeOnExit(id) {
    try {
        const key = 'purge_on_exit_ids';
        const raw = sessionStorage.getItem(key);
        const list = raw ? JSON.parse(raw) : [];
        if (!list.includes(id)) {
            list.push(id);
            sessionStorage.setItem(key, JSON.stringify(list));
        }
    } catch (e) {
        console.warn('schedulePurgeOnExit error', e);
    }
}

// Delete all capsules that are unlocked (unlockAt <= now) when the page unloads.
function purgeUnlockedOnExit() {
    if (!db) return;
    const tx = db.transaction('capsules', 'readwrite');
    const store = tx.objectStore('capsules');
    const req = store.getAll();
    req.onsuccess = () => {
        const items = req.result || [];
        const now = Date.now();
        items.forEach(it => {
            if (!it) return;
            if ((it.unlockAt || 0) <= now) {
                try { store.delete(it.id); } catch (e) { console.warn('delete failed', e); }
            }
        });
    };
}

// Attach handler to remove unlocked capsules on page unload.
window.addEventListener('beforeunload', () => {
    try { purgeUnlockedOnExit(); } catch (e) { console.warn(e); }
});