import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { buildCreateMeta, buildUpdateMeta, userProfileDocRef } from "./data-model.js";

const firebaseConfig = {
    apiKey: "AIzaSyA2OHUZpaYuObF6zwZXcdSeO2EfE2WV0Ss",
    authDomain: "siafutracker.firebaseapp.com",
    projectId: "siafutracker",
    storageBucket: "siafutracker.firebasestorage.app",
    messagingSenderId: "281604476235",
    appId: "1:281604476235:web:5588abd4f202564cc06cce"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const MIN_PASSWORD_LENGTH = 8;
const MAX_NICKNAME_LENGTH = 30;

function normalizeThemePreference(theme) {
    if (window.themeManager?.normalizeTheme) {
        return window.themeManager.normalizeTheme(theme);
    }
    return theme === "dark" ? "dark" : "coffee";
}

function normalizeNickname(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NICKNAME_LENGTH);
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value ?? "").trim());
}

function clearUserCache() {
    localStorage.removeItem("profileNickname");
    localStorage.removeItem("profileAvatar");
}

function onLoginSuccess() {
    window.location.href = "main.html";
}

async function ensureProfile(uid, nickname, email) {
    const themePreference = normalizeThemePreference(
        localStorage.getItem("siteTheme")
        || window.themeManager?.getPreferredTheme?.()
        || "coffee"
    );

    try {
        const ref = userProfileDocRef(db, uid);
        const snap = await getDoc(ref);
        const safeNickname = normalizeNickname(nickname) || "Користувач";
        const safeEmail = String(email ?? "").trim().toLowerCase();

        if (!snap.exists()) {
            await setDoc(ref, {
                nickname: safeNickname,
                email: safeEmail,
                themePreference,
                ...buildCreateMeta(uid)
            });
        } else if (!snap.data()?.themePreference) {
            await setDoc(ref, {
                themePreference,
                ...buildUpdateMeta(uid)
            }, { merge: true });
        }
    } catch (error) {
        console.warn("Не вдалося створити профіль:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const passInput = document.getElementById("password");
    const toggleIcon = document.getElementById("togglePassword");
    const authForm = document.getElementById("authForm");
    const googleBtn = document.getElementById("googleBtn");

    if (toggleIcon && passInput) {
        toggleIcon.addEventListener("click", () => {
            const isPassword = passInput.type === "password";
            passInput.type = isPassword ? "text" : "password";
            toggleIcon.src = isPassword ? "eye-show-svgrepo-com.svg" : "eye-off-svgrepo-com.svg";
        });
    }

    if (googleBtn) {
        googleBtn.addEventListener("click", async () => {
            googleBtn.disabled = true;
            try {
                const result = await signInWithPopup(auth, provider);
                const user = result.user;
                clearUserCache();
                await ensureProfile(user.uid, user.displayName, user.email);
                onLoginSuccess();
            } catch (error) {
                console.error(error);
                alert("Помилка Google: " + error.message);
                googleBtn.disabled = false;
            }
        });
    }

    if (authForm) {
        authForm.addEventListener("submit", async event => {
            event.preventDefault();

            const email = event.target.email.value.trim().toLowerCase();
            const password = event.target.password.value;
            const nicknameInput = document.getElementById("nickname");
            const submitBtn = authForm.querySelector("button[type=submit]");

            if (!isValidEmail(email)) {
                alert("Введіть коректний email.");
                return;
            }

            if (password.length < MIN_PASSWORD_LENGTH) {
                alert(`Пароль має містити щонайменше ${MIN_PASSWORD_LENGTH} символів.`);
                return;
            }

            const nickname = nicknameInput ? normalizeNickname(nicknameInput.value) : "";
            if (nicknameInput && !nickname) {
                alert("Введіть нікнейм.");
                return;
            }

            if (submitBtn) submitBtn.disabled = true;
            if (googleBtn) googleBtn.disabled = true;

            try {
                clearUserCache();

                if (nicknameInput) {
                    const res = await createUserWithEmailAndPassword(auth, email, password);
                    await ensureProfile(res.user.uid, nickname, email);
                } else {
                    await signInWithEmailAndPassword(auth, email, password);
                }

                onLoginSuccess();
            } catch (error) {
                console.error(error);

                const messages = {
                    "auth/user-not-found": "Користувача не знайдено.",
                    "auth/wrong-password": "Неправильний пароль.",
                    "auth/email-already-in-use": "Email уже зареєстрований.",
                    "auth/weak-password": "Пароль занадто простий.",
                    "auth/invalid-email": "Некоректний email.",
                    "auth/too-many-requests": "Занадто багато спроб. Спробуйте пізніше.",
                    "auth/invalid-credential": "Неправильний email або пароль."
                };

                event.target.password.value = "";
                alert(messages[error.code] || ("Помилка: " + error.message));
                if (submitBtn) submitBtn.disabled = false;
                if (googleBtn) googleBtn.disabled = false;
            }
        });
    }
});
