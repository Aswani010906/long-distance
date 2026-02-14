// 1. Security Check
const user = JSON.parse(sessionStorage.getItem('activeUser'));

if (!user) {
    // If not logged in, go to login folder -> login.html
    window.location.href = "../login/login.html";
} else {
    document.getElementById('greeting').textContent = `Welcome, ${user.username}`;
}

// 2. Animations
gsap.from(".card", { opacity: 0, y: 30, duration: 0.8, stagger: 0.2, ease: "power2.out" });


// 3. Navigation
document.getElementById('capsuleCard').addEventListener('click', () => {
    // Navigates to distance app folder -> index.html
    window.location.href = "../distance app/index.html";
});

document.getElementById('moodCard').addEventListener('click', () => {
    // Navigates to mood folder -> index.html (ensure mood folder has an index.html!)
    window.location.href = "../mood/index.html";
});

// Quiz navigation
const quizCard = document.getElementById('quizCard');
if (quizCard) {
    quizCard.addEventListener('click', () => {
        window.location.href = "../quiz/quiz.html";
    });
    quizCard.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.location.href = "../quiz/quiz.html"; });
}

// VDO navigation
const vdoCard = document.getElementById('vdoCard');
if (vdoCard) {
    vdoCard.addEventListener('click', () => {
        window.location.href = "../vdo/index.html";
    });
    vdoCard.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.location.href = "../vdo/index.html"; });
}

// 4. Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = "../login/login.html";
});
