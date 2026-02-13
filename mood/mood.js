// 1. Session & Setup
const user = JSON.parse(sessionStorage.getItem('activeUser'));
if (!user) window.location.href = "../login/login.html";

const moodCards = document.querySelectorAll('.mood-card');
const nudgeBtn = document.getElementById('nudgeBtn');
const partnerEmoji = document.getElementById('partnerEmoji');
const partnerText = document.getElementById('partnerText');
const suggestionsDiv = document.getElementById('suggestions');

// 2. Entrance Animation
gsap.from(".mood-card", { opacity: 0, scale: 0.8, stagger: 0.1, duration: 0.5 });

// 3. Updating MY Mood
moodCards.forEach(card => {
    card.addEventListener('click', () => {
        const mood = card.dataset.mood;
        const emoji = card.dataset.emoji;

        moodCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        const moodUpdate = {
            sender: user.username,
            mood: mood,
            emoji: emoji,
            time: Date.now()
        };
        
        localStorage.setItem(`mood_sync_${user.partnerKey}`, JSON.stringify(moodUpdate));
        gsap.from(card, { scale: 1.2, duration: 0.3, ease: "back.out" });
    });
});

// 4. Sending a Nudge
nudgeBtn.addEventListener('click', () => {
    const nudgeData = {
        sender: user.username,
        type: 'nudge',
        time: Date.now()
    };
    localStorage.setItem(`nudge_sync_${user.partnerKey}`, JSON.stringify(nudgeData));
    
    // UI Feedback for sender
    gsap.to(nudgeBtn, { scale: 0.9, duration: 0.1, yoyo: true, repeat: 1 });
});

// 5. Listening for Partner (Real-Time Storage Event)
window.addEventListener('storage', (e) => {
    // Listen for Moods
    if (e.key === `mood_sync_${user.partnerKey}`) {
        const data = JSON.parse(e.newValue);
        if (data.sender !== user.username) updatePartnerMood(data);
    }
    
    // Listen for Nudges
    if (e.key === `nudge_sync_${user.partnerKey}`) {
        const data = JSON.parse(e.newValue);
        if (data.sender !== user.username) receiveNudge();
    }
});

function updatePartnerMood(data) {
    const actions = {
        happy: ["Dance! 💃", "High five 🖐️"],
        stressed: ["Big hug 🤗", "You got this!"],
        lonely: ["Call now 📞", "Cute photo 🤳"],
        excited: ["Celebrate! 🎉", "Tell me more! 🎤"]
    };

    partnerEmoji.textContent = data.emoji;
    partnerText.innerHTML = `Partner is feeling <strong>${data.mood}</strong>`;
    
    suggestionsDiv.innerHTML = '';
    actions[data.mood].forEach(act => {
        const span = document.createElement('span');
        span.className = 'action-pill';
        span.textContent = act;
        suggestionsDiv.appendChild(span);
    });

    gsap.from("#partnerStatus", { backgroundColor: "#ffebef", duration: 0.5 });
}

function receiveNudge() {
    // Shake Screen
    document.body.classList.add('shake-screen');
    setTimeout(() => document.body.classList.remove('shake-screen'), 500);

    // Visual Pulse Flare
    const flare = document.createElement('div');
    flare.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,77,109,0.2); pointer-events:none; z-index:999; opacity:0;";
    document.body.appendChild(flare);

    gsap.to(flare, { 
        opacity: 1, 
        duration: 0.2, 
        repeat: 3, 
        yoyo: true, 
        onComplete: () => flare.remove() 
    });
}