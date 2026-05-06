import { auth, db } from "../core/firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { userProfileDocRef } from "../core/data-model.js";

const AUTH_PAGES = ["login.html", "register.html"];
const PUBLIC_PAGES = ["index.html", "faq.html", "404.html", ...AUTH_PAGES];
const HOME_PAGE = "main.html";
const DEFAULT_AVATAR_URL = "assets/images/avatars/avatar-default.svg";
const isPublicPage = PUBLIC_PAGES.some(page => window.location.pathname.endsWith(page));
const isAuthPage = AUTH_PAGES.some(page => window.location.pathname.endsWith(page));

function normalizeThemePreference(theme) {
    if (window.themeManager?.normalizeTheme) {
        return window.themeManager.normalizeTheme(theme);
    }
    return theme === "dark" ? "dark" : "coffee";
}

function normalizeNickname(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
}

function normalizeAssetURL(value, options = {}) {
    const { allowDataImage = false, fallback = "" } = options;
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return fallback;
    if (allowDataImage && raw.startsWith("data:image/")) return raw;
    if (raw.startsWith("blob:")) return raw;

    try {
        const parsed = new URL(raw, window.location.href);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.href;
        }
    } catch (_) {
    }

    return fallback;
}

function applyThemePreference(theme) {
    const normalizedTheme = normalizeThemePreference(theme);

    if (window.themeManager?.setTheme) {
        window.themeManager.setTheme(normalizedTheme);
        return;
    }

    document.documentElement.setAttribute("data-theme", normalizedTheme);
    document.documentElement.style.colorScheme = normalizedTheme === "coffee" ? "light" : "dark";
}

function applyGuestState() {
    document.querySelectorAll(".logout-link, .logout-btn").forEach(el => {
        el.style.display = "none";
    });

    document.querySelectorAll(".user-pill, .mobile-user-pill").forEach(el => {
        el.setAttribute("href", "login.html");
    });

    document.querySelectorAll("#user-name, #user-name-mobile").forEach(el => {
        if (el) el.textContent = "Увійти";
    });

    document.querySelectorAll("#user-avatar, #user-avatar-mobile").forEach(el => {
        if (el) el.src = DEFAULT_AVATAR_URL;
    });
}

function applyAuthorizedState() {
    document.querySelectorAll(".logout-link, .logout-btn").forEach(el => {
        el.style.display = "";
    });

    document.querySelectorAll(".user-pill, .mobile-user-pill").forEach(el => {
        el.setAttribute("href", "profile.html");
    });
}

(function applyCache() {
    const nickname = normalizeNickname(localStorage.getItem("profileNickname"));
    const avatar = normalizeAssetURL(localStorage.getItem("profileAvatar"), {
        allowDataImage: true,
        fallback: DEFAULT_AVATAR_URL
    });
    const theme = normalizeThemePreference(
        localStorage.getItem("siteTheme") || window.themeManager?.getPreferredTheme?.() || "coffee"
    );

    if (nickname) {
        document.querySelectorAll("#user-name, #user-name-mobile").forEach(el => {
            if (el) el.textContent = nickname;
        });
    }

    document.querySelectorAll("#user-avatar, #user-avatar-mobile").forEach(el => {
        if (el) el.src = avatar;
    });

    applyThemePreference(theme);
})();

onAuthStateChanged(auth, async user => {
    if (!user) {
        applyGuestState();
        if (!isPublicPage) {
            window.location.href = "login.html";
        }
        return;
    }

    if (isAuthPage) {
        window.location.href = HOME_PAGE;
        return;
    }

    window.currentUserId = user.uid;
    applyAuthorizedState();

    try {
        const profileRef = userProfileDocRef(db, user.uid);
        const snap = await getDoc(profileRef);

        let nickname = normalizeNickname(localStorage.getItem("profileNickname") || user.displayName || user.email || "Користувач") || "Користувач";
        let avatarURL = normalizeAssetURL(localStorage.getItem("profileAvatar"), {
            allowDataImage: true,
            fallback: ""
        }) || normalizeAssetURL(user.photoURL, { fallback: DEFAULT_AVATAR_URL }) || DEFAULT_AVATAR_URL;
        let themePreference = normalizeThemePreference(
            localStorage.getItem("siteTheme") || window.themeManager?.getPreferredTheme?.() || "coffee"
        );

        if (snap.exists()) {
            const data = snap.data();
            if (data.nickname) {
                nickname = normalizeNickname(data.nickname) || nickname;
            }
            if (data.avatarURL) {
                avatarURL = normalizeAssetURL(data.avatarURL, {
                    allowDataImage: true,
                    fallback: avatarURL
                });
            }
            if (data.themePreference) {
                themePreference = normalizeThemePreference(data.themePreference);
            }
        }

        localStorage.setItem("profileNickname", nickname);
        localStorage.setItem("profileAvatar", avatarURL);
        localStorage.setItem("siteTheme", themePreference);

        document.querySelectorAll("#user-name, #user-name-mobile").forEach(el => {
            if (el) el.textContent = nickname;
        });
        document.querySelectorAll("#user-avatar, #user-avatar-mobile").forEach(el => {
            if (el) el.src = avatarURL;
        });

        applyThemePreference(themePreference);
    } catch (error) {
        console.warn("Не вдалося завантажити профіль:", error);
    }

    document.dispatchEvent(new CustomEvent("userReady", { detail: { uid: user.uid } }));
});

async function handleLogout(event) {
    event?.preventDefault();
    localStorage.removeItem("profileNickname");
    localStorage.removeItem("profileAvatar");

    try {
        await signOut(auth);
    } catch (_) {
    }

    window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", () => {
    // Делегування подій: один обробник працює для всіх кнопок виходу.
    document.addEventListener("click", event => {
        const logoutButton = event.target.closest(".logout-link, .logout-btn");
        if (logoutButton) {
            handleLogout(event);
        }
    });

    const burgerBtn = document.getElementById("burger-btn");
    const mobileNav = document.getElementById("mobile-nav");

    if (burgerBtn && mobileNav) {
        burgerBtn.addEventListener("click", event => {
            event.stopPropagation();
            mobileNav.classList.toggle("open");
        });

        document.addEventListener("click", event => {
            if (!mobileNav.contains(event.target) && event.target !== burgerBtn) {
                mobileNav.classList.remove("open");
            }
        });
    }
});


