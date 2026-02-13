// --- DOM Elements ---
const saveBtn = document.getElementById('saveBtn');
const titleInput = document.getElementById('capsuleTitle');
const messageInput = document.getElementById('capsuleMessage');
const dateInput = document.getElementById('unlockDate');
const container = document.getElementById('capsuleContainer');
const feedback = document.getElementById('formFeedback');

// --- Core Logic ---

// 1. Initialize App
document.addEventListener('DOMContentLoaded', () => {
    displayCapsules();
    // Start the global countdown refresh
    setInterval(displayCapsules, 60000); // Refresh every minute
});

// 2. Save Capsule
saveBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    const message = messageInput.value.trim();
    const unlockDate = new Date(dateInput.value);
    const now = new Date();

    // Validation
    if (!title || !message || !dateInput.value) {
        showFeedback("Please fill in all fields.", "error");
        return;
    }

    if (unlockDate <= now) {
        showFeedback("Unlock date must be in the future!", "error");
        return;
    }

    const newCapsule = {
        id: Date.now(),
        title,
        message,
        unlockDate: dateInput.value
    };

    const existingCapsules = JSON.parse(localStorage.getItem('capsules') || '[]');
    existingCapsules.push(newCapsule);
    localStorage.setItem('capsules', JSON.stringify(existingCapsules));

    showFeedback("Capsule sealed and buried!", "success");
    clearForm();
    displayCapsules();
});

// 3. Render Dashboard
function displayCapsules() {
    const capsules = JSON.parse(localStorage.getItem('capsules') || '[]');
    container.innerHTML = '';

    if (capsules.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888;">No memories stored yet.</p>';
        return;
    }

    capsules.forEach(cap => {
        const timeLeft = calculateTimeLeft(cap.unlockDate);
        const isUnlocked = timeLeft.total <= 0;

        const card = document.createElement('div');
        card.className = `capsule-card ${isUnlocked ? 'unlocked' : ''}`;
        
        card.innerHTML = `
            <h3>${cap.title}</h3>
            ${isUnlocked 
                ? `<p class="message-content"><strong>Unlocked Message:</strong><br>${cap.message}</p>`
                : `<p class="countdown">Unlocks in: ${timeLeft.days}d ${timeLeft.hours}h ${timeLeft.minutes}m</p>`
            }
        `;
        container.appendChild(card);
    });
}

// 4. Helper: Time Calculation
function calculateTimeLeft(targetDate) {
    const total = Date.parse(targetDate) - Date.parse(new Date());
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));

    return { total, days, hours, minutes };
}

// 5. Helper: UI Utilities
function showFeedback(msg, type) {
    feedback.textContent = msg;
    feedback.className = type;
    setTimeout(() => { feedback.className = 'hidden'; }, 3000);
}

function clearForm() {
    titleInput.value = '';
    messageInput.value = '';
    dateInput.value = '';
}