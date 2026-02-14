let isLoginMode = false;
const authBtn = document.getElementById('authBtn');
const toggleMsg = document.getElementById('toggleMsg');
const keyWrapper = document.getElementById('keyWrapper');
const hasGsap = typeof window.gsap !== "undefined";

function normalizePartnerKey(value) {
    return value.trim().toUpperCase();
}

function parseStoredUser(username) {
    try {
        return JSON.parse(localStorage.getItem(`user_${username}`));
    } catch {
        return null;
    }
}

// GSAP Entrance
if (hasGsap) {
    gsap.from(".auth-card", { duration: 1, y: 50, opacity: 0, ease: "power3.out" });
}

toggleMsg.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    
    // Smooth toggle animation
    const applyModeCopy = () => {
        document.getElementById('formTitle').textContent = isLoginMode ? "Welcome Back" : "Create Sanctuary";
        keyWrapper.style.display = isLoginMode ? "none" : "block";
        authBtn.querySelector('.btn-text').textContent = isLoginMode ? "Sign In" : "Enter the Vault";
        toggleMsg.innerHTML = isLoginMode ? "Need an account? <span>Sign Up</span>" : "Already have a sanctuary? <span>Sign In</span>";
    };

    if (hasGsap) {
        gsap.to(".input-stack", { opacity: 0, y: 5, duration: 0.2, onComplete: () => {
            applyModeCopy();
            gsap.to(".input-stack", { opacity: 1, y: 0, duration: 0.2 });
        }});
    } else {
        applyModeCopy();
    }
});

authBtn.addEventListener('click', () => {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const key = normalizePartnerKey(document.getElementById('partnerKey').value);

    if (!user || !pass) return alert("Fill in your details!");

    if (isLoginMode) {
        const savedUser = parseStoredUser(user);
        if (savedUser && savedUser.password === pass) {
            // Backward compatibility: normalize legacy stored keys on login.
            savedUser.partnerKey = normalizePartnerKey(savedUser.partnerKey || "");
            sessionStorage.setItem('activeUser', JSON.stringify(savedUser));
            window.location.href = "../dashboard/index.html"; 
        } else {
            alert("Wrong credentials!");
        }
    } else {
        if (!key) return alert("Partner key required!");
        if (parseStoredUser(user)) return alert("Username already exists. Please sign in.");
        const userData = { username: user, password: pass, partnerKey: key };
        localStorage.setItem(`user_${user}`, JSON.stringify(userData));
        sessionStorage.setItem('activeUser', JSON.stringify(userData));
        window.location.href = "../dashboard/index.html";
    }
});