function getActiveUser() {
    try {
        return JSON.parse(sessionStorage.getItem('activeUser'));
    } catch {
        return null;
    }
}

const user = getActiveUser();
if (!user) {
    window.location.href = "../login/login.html";
}
const hasGsap = typeof window.gsap !== "undefined";
const username = user?.username;
const partnerKey = (user?.partnerKey || "").trim().toUpperCase();

const moodCards = document.querySelectorAll('.mood-card');
const partnerEmoji = document.getElementById('partnerEmoji');
const partnerText = document.getElementById('partnerText');
const suggestionsDiv = document.getElementById('suggestions');
let lastPartnerMoodTimestamp = 0;

// 2. Set My Mood
moodCards.forEach(card => {
    card.addEventListener('click', () => {
        if (!username || !partnerKey) return;

        const mood = card.dataset.mood;
        const emoji = card.dataset.emoji;

        // Visual update
        moodCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        // Store data using the Partner Key as a unique channel
        const moodUpdate = {
            sender: username,
            mood: mood,
            emoji: emoji,
            timestamp: Date.now()
        };
        
        localStorage.setItem(`mood_sync_${partnerKey}`, JSON.stringify(moodUpdate));
        if (hasGsap) {
            gsap.from(card, { scale: 1.2, duration: 0.3, ease: "back.out" });
        }
    });
});

const latestMood = partnerKey ? localStorage.getItem(`mood_sync_${partnerKey}`) : null;
if (latestMood) {
    try {
        const parsedMood = JSON.parse(latestMood);
        if (parsedMood && parsedMood.sender !== username) {
            lastPartnerMoodTimestamp = parsedMood.timestamp || Date.now();
            updatePartnerUI(parsedMood);
        }
    } catch {
        // Ignore malformed local data
    }
}

// 3. Listen for Partner's Mood (Real-Time)
window.addEventListener('storage', (e) => {
    if (!partnerKey || !username) return;

    // Only respond to changes matching our specific Partner Key
    if (e.key === `mood_sync_${partnerKey}` && e.newValue) {
        let data = null;
        try {
            data = JSON.parse(e.newValue);
        } catch {
            return;
        }
        
        // Don't update if we are the one who sent it
        if (data && data.sender !== username) {
            lastPartnerMoodTimestamp = data.timestamp || Date.now();
            updatePartnerUI(data);
        }
    }
});

// Fallback sync for browsers where `storage` events are not consistently emitted.
setInterval(() => {
    if (!partnerKey || !username) return;
    const value = localStorage.getItem(`mood_sync_${partnerKey}`);
    if (!value) return;

    let parsed = null;
    try {
        parsed = JSON.parse(value);
    } catch {
        return;
    }

    if (!parsed || parsed.sender === username) return;
    const ts = parsed.timestamp || 0;
    if (ts > lastPartnerMoodTimestamp) {
        lastPartnerMoodTimestamp = ts;
        updatePartnerUI(parsed);
    }
}, 1200);

function updatePartnerUI(data) {
    const actions = {
        happy: ["Dance together! 💃", "Send a high five 🖐️", "Celebrate! 🎉"],
        romantic: ["Send a kiss back 💋", "Write a love note 💌", "Plan a date 🌹"],
        sad: ["Send a warm hug 🤗", "Ask 'Want to talk?' 📞", "Remind them you love them ❤️"],
        stressed: ["Remind them to breathe 🧘", "You got this! 💪", "Offer a distraction 📺"],
        lonely: ["Call immediately 📱", "Send a cute photo 🤳", "Reminisce together 💭"],
        angry: ["Give some space 🧘", "Send a calm message ❤️", "Offer a virtual treat 🍦"]
    };

    // Update the Display
    partnerEmoji.textContent = data.emoji;
    partnerText.innerHTML = `Your partner is feeling <strong>${data.mood}</strong>`;
    
    // Refresh Suggestions
    suggestionsDiv.innerHTML = '';
    const selectedActions = actions[data.mood] || ["Send some love ❤️"];
    
    selectedActions.forEach(text => {
        const span = document.createElement('span');
        span.className = 'action-pill';
        span.textContent = text;
        suggestionsDiv.appendChild(span);
    });

    // Burst animation for partner emoji (no external libs required)
    try { triggerEmojiBurst(partnerEmoji, data.emoji); } catch (err) { /* ignore */ }

    // Notify user with a GSAP animation
    if (hasGsap) {
        gsap.fromTo("#partnerStatus", 
            { scale: 0.95, boxShadow: "0 0 0px rgba(255,77,109,0)" }, 
            { scale: 1, boxShadow: "0 15px 40px rgba(255, 77, 109, 0.3)", duration: 0.5, yoyo: true, repeat: 1 }
        );
    }
}

// Create a short-lived burst of emojis radiating from the given element
function triggerEmojiBurst(anchorEl, emoji, count = 12) {
    if (!anchorEl || !emoji) return;
    const rect = anchorEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const container = document.createElement('div');
    container.className = 'emoji-burst-container';
    document.body.appendChild(container);

    for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.className = 'burst-emoji';
        span.textContent = emoji;
        // start at center
        span.style.left = `${centerX}px`;
        span.style.top = `${centerY}px`;
        // small random size
        span.style.fontSize = `${14 + Math.floor(Math.random() * 24)}px`;
        container.appendChild(span);

        // animate to random direction
        (function(s) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 60 + Math.random() * 140;
            const destX = Math.cos(angle) * distance;
            const destY = Math.sin(angle) * distance;
            const rotate = Math.floor((Math.random() * 360) - 180);
            const scale = 0.6 + Math.random() * 0.9;
            const duration = 600 + Math.floor(Math.random() * 900);

            // apply transitions
            s.style.transition = `left ${duration}ms cubic-bezier(.2,.9,.2,1), top ${duration}ms cubic-bezier(.2,.9,.2,1), opacity ${duration}ms linear, transform ${duration}ms ease`;

            // trigger on next frame
            requestAnimationFrame(() => {
                s.style.left = `${centerX + destX}px`;
                s.style.top = `${centerY + destY}px`;
                s.style.opacity = '0';
                s.style.transform = `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;
            });

            // cleanup
            setTimeout(() => { try { s.remove(); } catch (e) {} }, duration + 200);
        })(span);
    }

    // remove container after animations
    setTimeout(() => { try { container.remove(); } catch (e) {} }, 2600);
}