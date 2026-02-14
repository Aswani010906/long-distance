// 1. GLOBAL VARIABLES - Ensure these are at the VERY top
const user = JSON.parse(sessionStorage.getItem('activeUser'));
if (!user) window.location.href = "../login/login.html";

let db;
let currentQuestions = [];
let currentIndex = 0;
let score = 0;

// 2. DATABASE INITIALIZATION
const dbRequest = indexedDB.open("QuizDB", 1);

dbRequest.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("questions")) {
        db.createObjectStore("questions", { keyPath: "id", autoIncrement: true });
    }
};

dbRequest.onsuccess = (e) => {
    db = e.target.result;
    console.log("Quiz Database Ready");
};

// 3. VIEW SWITCHER (Makes buttons feel smooth)
function switchView(view) {
    const views = ['setupView', 'createView', 'solveView'];
    
    // Hide all views first
    views.forEach(v => document.getElementById(v).style.display = 'none');
    
    // Show the chosen view with GSAP
    const target = document.getElementById(view + 'View');
    target.style.display = 'block';
    
    gsap.from(target, { opacity: 0, scale: 0.9, duration: 0.5, ease: "back.out(1.7)" });

    if (view === 'solve') {
        loadQuestions();
    }
}

// 4. ADD QUESTION LOGIC (The "Set Questions" button)
function saveQuestion() {
    const text = document.getElementById('qText').value;
    const ans = document.getElementById('qAns').value.toLowerCase().trim();

    if (!text || !ans) {
        gsap.to(".glass-card", { x: 10, repeat: 3, yoyo: true, duration: 0.05 });
        return;
    }

    const tx = db.transaction("questions", "readwrite");
    const store = tx.objectStore("questions");
    
    const newQuestion = { 
        text: text, 
        ans: ans, 
        partnerKey: user.partnerKey // This links it to your partner
    };

    store.add(newQuestion);

    tx.oncomplete = () => {
        document.getElementById('qText').value = '';
        document.getElementById('qAns').value = '';
        const status = document.getElementById('qStatus');
        status.innerText = "Question Saved! Add another or go back.";
        gsap.from(status, { opacity: 0, y: 5 });
    };
}

// 5. ATTEND LOGIC (The "Take the Quiz" button)
function loadQuestions() {
    const tx = db.transaction("questions", "readonly");
    const store = tx.objectStore("questions");
    const request = store.getAll();

    request.onsuccess = () => {
        // Only get questions meant for this specific couple
        currentQuestions = request.result.filter(q => q.partnerKey === user.partnerKey);
        
        if (currentQuestions.length === 0) {
            document.getElementById('displayQ').innerText = "No questions found for your key.";
        } else {
            currentIndex = 0;
            score = 0;
            showQuestion();
        }
    };
}

function showQuestion() {
    const q = currentQuestions[currentIndex];
    document.getElementById('displayQ').innerText = q.text;
    gsap.from("#displayQ", { opacity: 0, x: -20, duration: 0.4 });
}

function nextQuestion() {
    const userAns = document.getElementById('solverAns').value.toLowerCase().trim();
    
    if (userAns === currentQuestions[currentIndex].ans) {
        score++;
    }

    currentIndex++;
    document.getElementById('solverAns').value = '';

    if (currentIndex < currentQuestions.length) {
        showQuestion();
    } else {
        showResults();
    }
}

// 6. RESULTS & CLEANUP
function showResults() {
    document.getElementById('questionContainer').style.display = 'none';
    const resultDiv = document.getElementById('resultContainer');
    resultDiv.style.display = 'block';

    const percent = Math.round((score / currentQuestions.length) * 100);
    document.getElementById('scoreText').innerText = `Compatibility: ${percent}%`;
    
    gsap.to("#progressFill", { width: percent + "%", duration: 2, ease: "expo.out" });
    
    let msg = percent > 70 ? "Soulmates! ❤️" : "Let's learn more about each other! 😊";
    document.getElementById('compatibilityMsg').innerText = msg;

    // Finally, clear them so you can set fresh questions next time
    clearUsedQuestions();
}

function clearUsedQuestions() {
    const tx = db.transaction("questions", "readwrite");
    const store = tx.objectStore("questions");

    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            // Check if key matches current user session
            if (cursor.value.partnerKey === user.partnerKey) {
                cursor.delete();
            }
            cursor.continue();
        }
    };
}