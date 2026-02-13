// 1. Database Setup
let db;
const dbRequest = indexedDB.open("TimeCapsuleDB", 1);

dbRequest.onupgradeneeded = (e) => {
    db = e.target.result;
    db.createObjectStore("capsules", { keyPath: "id", autoIncrement: true });
};

dbRequest.onsuccess = (e) => {
    db = e.target.result;
    displayCapsules();
};

// 2. Helper: Convert File to Blob (Standard for Databases)
const getFileData = (inputElement) => {
    return inputElement.files[0] || null;
};

// 3. Save Logic
document.getElementById('saveBtn').addEventListener('click', async () => {
    const title = document.getElementById('capsuleTitle').value;
    const message = document.getElementById('capsuleMessage').value;
    const unlockDate = document.getElementById('unlockDate').value;
    const imageFile = getFileData(document.getElementById('imageInput'));
    const mediaFile = getFileData(document.getElementById('mediaInput'));

    if (!title || !unlockDate) return alert("Title and Date are required!");

    const capsule = {
        title,
        message,
        unlockDate,
        imageFile, // Storing the actual file object
        mediaFile, 
        createdAt: new Date().getTime()
    };

    const transaction = db.transaction(["capsules"], "readwrite");
    const store = transaction.objectStore("capsules");
    store.add(capsule);

    transaction.oncomplete = () => {
        alert("Memory Sealed!");
        location.reload(); // Refresh to show new capsule
    };
});

// 4. Display Logic
function displayCapsules() {
    const container = document.getElementById('capsuleContainer');
    const transaction = db.transaction(["capsules"], "readonly");
    const store = transaction.objectStore("capsules");
    const request = store.getAll();

    request.onsuccess = () => {
        const capsules = request.result;
        container.innerHTML = capsules.length ? '' : '<p>The vault is empty.</p>';

        capsules.forEach(cap => {
            const now = new Date();
            const unlockT = new Date(cap.unlockDate);
            const isUnlocked = now >= unlockT;

            const card = document.createElement('div');
            card.className = 'capsule-card';
            
            let content = `<h3>${cap.title}</h3>`;

            if (isUnlocked) {
                content += `<p>${cap.message}</p>`;
                if (cap.imageFile) {
                    const imgUrl = URL.createObjectURL(cap.imageFile);
                    content += `<img src="${imgUrl}">`;
                }
                if (cap.mediaFile) {
                    const mediaUrl = URL.createObjectURL(cap.mediaFile);
                    const isVideo = cap.mediaFile.type.includes('video');
                    content += isVideo 
                        ? `<video src="${mediaUrl}" controls></video>` 
                        : `<audio src="${mediaUrl}" controls></audio>`;
                }
            } else {
                content += `<p class="locked-hint">🔒 Locked until ${cap.unlockDate}</p>`;
            }

            card.innerHTML = content;
            container.appendChild(card);
        });
    };
}