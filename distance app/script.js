// --- 1. LOCAL DATABASE (IndexedDB) ---
let db;
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

// --- 2. GSAP ENTRANCE ---
window.addEventListener('load', () => {
    gsap.to(".container", { opacity: 1, duration: 1 });
});

// --- 3. FILE FEEDBACK ---
function setupFilePreview(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
            label.classList.add('selected');
            label.querySelector('.label-text').textContent = "Attached ✓";
            gsap.from(label, { scale: 1.1, duration: 0.3 });
        }
    });
}
setupFilePreview('imageInput', 'imageLabel');
setupFilePreview('mediaInput', 'mediaLabel');

// --- 4. SAVE TO LOCALHOST DATABASE ---
document.getElementById('saveBtn').addEventListener('click', async () => {
    const title = document.getElementById('capsuleTitle').value;
    const message = document.getElementById('capsuleMessage').value;
    const unlockDate = document.getElementById('unlockDate').value;
    const imageFile = document.getElementById('imageInput').files[0];
    const mediaFile = document.getElementById('mediaInput').files[0];

    if (!title || !unlockDate) return alert("Title and Unlock Date are required!");

    const capsule = {
        title, message,
        unlockAt: new Date(unlockDate).getTime(),
        image: imageFile || null,
        media: mediaFile || null,
        created: Date.now()
    };

    const tx = db.transaction("capsules", "readwrite");
    tx.objectStore("capsules").add(capsule);
    tx.oncomplete = () => {
        gsap.to("#saveBtn", { backgroundColor: "#28a745", textContent: "Sealed Locally! ✨" });
        setTimeout(() => location.reload(), 1000);
    };
});

// --- 5. RENDER FROM DATABASE ---
function renderVault() {
    const container = document.getElementById('capsuleContainer');
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
                gsap.to(card, { opacity: 1, y: 0, duration: 0.5, delay: i * 0.1 });
            });
        } else {
            capsules.forEach((cap, i) => updateCardContent(cap, container.children[i]));
        }
    };
}

function updateCardContent(cap, cardElement) {
    const now = Date.now();
    const diff = cap.unlockAt - now;
    const isUnlocked = diff <= 0;

    if (isUnlocked) {
        if (cardElement.dataset.status !== "open") {
            cardElement.dataset.status = "open";
            let mediaHtml = '';
            if (cap.image) mediaHtml += `<img src="${URL.createObjectURL(cap.image)}">`;
            if (cap.media) {
                const url = URL.createObjectURL(cap.media);
                mediaHtml += cap.media.type.includes('video') ? `<video src="${url}" controls></video>` : `<audio src="${url}" controls></audio>`;
            }
            cardElement.innerHTML = `<h3>${cap.title}</h3><p>${cap.message}</p>${mediaHtml}`;
        }
    } else {
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        cardElement.innerHTML = `<h3>${cap.title} 🔒</h3><p class="timer">Opens in: ${d}d ${h}h ${m}m ${s}s</p>`;
    }
}