let isLoginMode = false;
const authBtn = document.getElementById('authBtn');
const toggleMsg = document.getElementById('toggleMsg');
const partnerKeyInput = document.getElementById('partnerKey');

// 1. Initial Animation
gsap.from(".auth-box", { opacity: 0, y: 30, duration: 1, ease: "power2.out" });

// 2. Toggle between Sign Up and Sign In
toggleMsg.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    
    // Animate the height change
    gsap.to(".auth-box", { duration: 0.3, height: "auto" });

    if (isLoginMode) {
        document.getElementById('formTitle').textContent = "Welcome Back";
        document.getElementById('formSubtitle').textContent = "Sign in to see your shared memories.";
        partnerKeyInput.style.display = "none";
        authBtn.textContent = "Sign In";
        toggleMsg.innerHTML = "Need an account? <span>Sign Up</span>";
    } else {
        document.getElementById('formTitle').textContent = "Create Sanctuary";
        document.getElementById('formSubtitle').textContent = "Enter your details to begin your journey.";
        partnerKeyInput.style.display = "block";
        authBtn.textContent = "Enter the Vault";
        toggleMsg.innerHTML = "Already have a sanctuary? <span>Sign In</span>";
    }
});

// 3. Handle Authentication
authBtn.addEventListener('click', () => {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const key = partnerKeyInput.value.trim();

    if (!user || !pass) return alert("Username and Password are required!");

    if (isLoginMode) {
        // --- SIGN IN LOGIC ---
        const savedUser = JSON.parse(localStorage.getItem(`user_${user}`));
        
        if (savedUser && savedUser.password === pass) {
            // Save temporary session
            sessionStorage.setItem('activeUser', JSON.stringify(savedUser));
            
            gsap.to(".auth-box", { opacity: 0, scale: 0.9, duration: 0.5, onComplete: () => {
                window.location.href = "../dashboard/index.html"; 
            }});
        } else {
            alert("Invalid username or password.");
        }
    } else {
        // --- SIGN UP LOGIC ---
        if (!key) return alert("A Partner Key is required to link with your partner!");

        const userData = {
            username: user,
            password: pass,
            partnerKey: key
        };

        // Save to permanent local storage (The User Database)
        localStorage.setItem(`user_${user}`, JSON.stringify(userData));
        
        // Save to session storage (The Login Pass)
        sessionStorage.setItem('activeUser', JSON.stringify(userData));

        gsap.to(".auth-box", { opacity: 0, y: -20, duration: 0.5, onComplete: () => {
            window.location.href = "../dashboard/index.html";
        }});
    }
});