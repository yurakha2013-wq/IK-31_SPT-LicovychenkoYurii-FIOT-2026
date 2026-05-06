import { db, storage }                 from "./firebase-config.js";
import { compressImage, base64SizeKB } from "./image-utils.js";
import {
    buildUpdateMeta,
    userArchivedTasksCollectionRef,
    userProfileDocRef,
    userProjectsCollectionRef,
    userTeamsCollectionRef
} from "./data-model.js";
import {
    setDoc, getDoc,
    onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getDownloadURL,
    ref,
    uploadBytes
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let uid = null;
const DEFAULT_AVATAR_URL = "avatar-default.svg";
let currentProfileState = {
    nickname: "",
    subtitle: "",
    avatarURL: "",
    themePreference: "coffee"
};

function escapeHTML(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value = "") {
    return escapeHTML(value).replace(/`/g, "&#96;");
}

function normalizeThemePreference(theme) {
    if (window.themeManager?.normalizeTheme) {
        return window.themeManager.normalizeTheme(theme);
    }
    return theme === "dark" ? "dark" : "coffee";
}

function getThemeLabel(theme) {
    const labels = {
        coffee: "Кавова тема",
        dark: "Темна тема",
        ocean: "Футуристична тема",
        forest: "Енергійна тема"
    };
    const resolvedTheme = normalizeThemePreference(theme);
    return window.themeManager?.getThemeMeta?.(resolvedTheme)?.label || labels[resolvedTheme] || labels.coffee;
}

function syncThemePicker(theme) {
    const resolvedTheme = normalizeThemePreference(theme);

    document.querySelectorAll("[data-theme-option]").forEach(button => {
        const isActive = button.dataset.themeValue === resolvedTheme;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
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

function applyThemePreference(theme, options = {}) {
    const resolvedTheme = normalizeThemePreference(theme);
    const { syncPicker = true } = options;
    const note = document.getElementById("profile-theme-note");

    currentProfileState = {
        ...currentProfileState,
        themePreference: resolvedTheme
    };

    if (window.themeManager?.setTheme) {
        window.themeManager.setTheme(resolvedTheme);
    } else {
        document.documentElement.setAttribute("data-theme", resolvedTheme);
        localStorage.setItem("siteTheme", resolvedTheme);
        document.documentElement.style.colorScheme = resolvedTheme === "coffee" ? "light" : "dark";
    }

    if (syncPicker) {
        syncThemePicker(resolvedTheme);
    }

    if (note) {
        note.textContent = getThemeLabel(resolvedTheme);
    }
}

async function persistThemePreference(theme) {
    if (!uid) return;

    try {
        await setDoc(userProfileDocRef(db, uid), {
            themePreference: normalizeThemePreference(theme),
            ...buildUpdateMeta(uid)
        }, { merge: true });
    } catch (err) {
        console.error("Не вдалося зберегти тему:", err);
    }
}

function initThemePicker() {
    const picker = document.getElementById("profile-theme-picker");
    if (!picker || picker.dataset.bound === "true") return;

    applyThemePreference(localStorage.getItem("siteTheme") || window.themeManager?.getPreferredTheme?.() || "coffee");

    picker.querySelectorAll("[data-theme-option]").forEach(button => {
        button.addEventListener("click", async () => {
            const nextTheme = normalizeThemePreference(button.dataset.themeValue);
            applyThemePreference(nextTheme, { syncPicker: false });
            syncThemePicker(nextTheme);
            await persistThemePreference(nextTheme);
        });
    });

    picker.dataset.bound = "true";
}

function getProfileRank(archivedCount) {
    if (archivedCount >= 500) return "Машина";
    if (archivedCount >= 200) return "Продвинутый";
    if (archivedCount >= 100) return "Опытный";
    if (archivedCount >= 50) return "Сканлейтер";
    if (archivedCount >= 20) return "Користувач";
    if (archivedCount >= 10) return "Новичок";
    return "Начинающий";
}

function updateProfileIdentity({
    nickname = currentProfileState.nickname,
    subtitle = currentProfileState.subtitle,
    avatarURL = currentProfileState.avatarURL
} = {}) {
    const displayName = document.getElementById("profile-display-name");
    const displaySubtitle = document.getElementById("profile-display-email");
    const avatar = document.getElementById("profile-avatar-img");

    currentProfileState = {
        ...currentProfileState,
        nickname: normalizeNickname(nickname),
        subtitle,
        avatarURL: normalizeAssetURL(avatarURL, {
            allowDataImage: true,
            fallback: DEFAULT_AVATAR_URL
        })
    };

    if (displayName && currentProfileState.nickname) {
        displayName.textContent = currentProfileState.nickname;
    }

    if (displaySubtitle) {
        displaySubtitle.textContent = subtitle;
    }

    if (avatar) {
        avatar.src = currentProfileState.avatarURL;
    }
}

function updateProfileRank(archivedCount) {
    updateProfileIdentity({
        subtitle: getProfileRank(archivedCount)
    });
}

async function uploadAvatarGif(file) {
    const extension = (file.name.split(".").pop() || "gif").toLowerCase();
    const fileRef = ref(storage, `avatars/${uid}/${Date.now()}.${extension}`);
    await uploadBytes(fileRef, file, { contentType: file.type || "image/gif" });
    return getDownloadURL(fileRef);
}

function getTeamAccent(name = "") {
    const palette = ["#7c4f2a", "#c56b3d", "#587b6a", "#a44a3f", "#5f7ea3", "#8b6d52", "#c08a2e"];
    const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return palette[hash % palette.length];
}

function initProjectsSlider(slider, prevBtn, nextBtn) {
    if (!slider) return;

    const updateArrows = () => {
        if (prevBtn) prevBtn.disabled = slider.scrollLeft <= 4;
        if (nextBtn) nextBtn.disabled = slider.scrollLeft + slider.clientWidth >= slider.scrollWidth - 4;
    };

    if (!slider.dataset.sliderBound) {
        let isDragging = false;
        let startX = 0;
        let startScrollLeft = 0;

        slider.addEventListener("scroll", updateArrows);

        slider.addEventListener("mousedown", e => {
            if (e.button !== 0) return;
            isDragging = true;
            startX = e.pageX;
            startScrollLeft = slider.scrollLeft;
            slider.classList.add("dragging");
        });

        slider.addEventListener("mousemove", e => {
            if (!isDragging) return;
            e.preventDefault();
            slider.scrollLeft = startScrollLeft - (e.pageX - startX);
        });

        const stopDragging = () => {
            isDragging = false;
            slider.classList.remove("dragging");
        };

        slider.addEventListener("mouseleave", stopDragging);
        slider.addEventListener("mouseup", stopDragging);
        slider.addEventListener("dragstart", e => e.preventDefault());
        slider.dataset.sliderBound = "true";
    }

    updateArrows();
}

window.saveProfile = async function () {
    if (!uid) return alert("Ви не авторизовані.");

    const nick = normalizeNickname(document.getElementById("profile-nickname")?.value);
    const imgSrc = document.getElementById("profile-avatar-img")?.src || "";
    if (!nick) return alert("Введіть нікнейм.");

    const btn = document.querySelector(".btn-profile-save");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Збереження...';
    }

    try {
        let avatarURL = null;
        const normalizedImgSrc = normalizeAssetURL(imgSrc, {
            allowDataImage: true,
            fallback: DEFAULT_AVATAR_URL
        });

        if (normalizedImgSrc.startsWith("data:image")) {
            const sizeKB = base64SizeKB(normalizedImgSrc);
            if (sizeKB > 600) {
                alert(`Аватар занадто великий (${sizeKB} КБ).`);
                return;
            }
            avatarURL = normalizedImgSrc;
        } else if (normalizedImgSrc && !normalizedImgSrc.endsWith(`/${DEFAULT_AVATAR_URL}`) && normalizedImgSrc !== DEFAULT_AVATAR_URL) {
            avatarURL = normalizedImgSrc;
        }

        const data = {
            nickname: nick,
            themePreference: normalizeThemePreference(currentProfileState.themePreference)
        };

        if (avatarURL) {
            data.avatarURL = avatarURL;
        }

        await setDoc(userProfileDocRef(db, uid), {
            ...data,
            ...buildUpdateMeta(uid)
        }, { merge: true });

        localStorage.setItem("profileNickname", nick);
        localStorage.setItem("siteTheme", normalizeThemePreference(currentProfileState.themePreference));
        if (avatarURL) {
            localStorage.setItem("profileAvatar", avatarURL);
        }

        document.querySelectorAll("#user-name, #user-name-mobile").forEach(el => {
            if (el) el.textContent = nick;
        });

        updateProfileIdentity({
            nickname: nick,
            subtitle: currentProfileState.subtitle,
            avatarURL: avatarURL || DEFAULT_AVATAR_URL
        });

        if (avatarURL) {
            const safeAvatarURL = normalizeAssetURL(avatarURL, {
                allowDataImage: true,
                fallback: DEFAULT_AVATAR_URL
            });
            document.querySelectorAll("#user-avatar, #user-avatar-mobile").forEach(el => {
                if (el) el.src = safeAvatarURL;
            });
        }

        alert("Профіль збережено.");
    } catch (err) {
        console.error(err);
        alert("Не вдалося зберегти профіль.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Зберегти профіль';
        }
    }
};

function initAvatarUpload() {
    const wrap = document.getElementById("avatar-wrap");
    const input = document.getElementById("avatar-file-input");
    const img = document.getElementById("profile-avatar-img");
    if (!wrap || !input) return;

    wrap.addEventListener("click", () => input.click());
    input.addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file || !file.type.startsWith("image/")) return;

        try {
            if (file.type === "image/gif") {
                if (file.size > 5 * 1024 * 1024) {
                    alert("GIF-аватар має бути не більше 5 МБ.");
                    return;
                }
                const gifURL = await uploadAvatarGif(file);
                if (img) img.src = gifURL;
                return;
            }

            if (file.size > 3 * 1024 * 1024) {
                alert("Звичайний аватар має бути не більше 3 МБ.");
                return;
            }

            const compressed = await compressImage(file, 200, 200, 0.82);
            if (img) img.src = compressed;
        } catch (err) {
            alert("Помилка обробки зображення.");
        } finally {
            input.value = "";
        }
    });
}

async function loadProfile() {
    try {
        const snap = await getDoc(userProfileDocRef(db, uid));
        if (snap.exists()) {
            const { nickname, avatarURL, themePreference } = snap.data();
            const safeNickname = normalizeNickname(nickname);
            const safeAvatarURL = normalizeAssetURL(avatarURL, {
                allowDataImage: true,
                fallback: DEFAULT_AVATAR_URL
            });

            if (safeNickname) {
                document.getElementById("profile-nickname").value = safeNickname;
                localStorage.setItem("profileNickname", safeNickname);
            }

            if (safeAvatarURL) {
                document.querySelectorAll("#user-avatar, #user-avatar-mobile").forEach(el => {
                    if (el) el.src = safeAvatarURL;
                });
                localStorage.setItem("profileAvatar", safeAvatarURL);
            }

            applyThemePreference(themePreference || localStorage.getItem("siteTheme") || window.themeManager?.getPreferredTheme?.() || "coffee");
            updateProfileIdentity({
                nickname: safeNickname || localStorage.getItem("profileNickname") || "",
                avatarURL: safeAvatarURL || localStorage.getItem("profileAvatar") || DEFAULT_AVATAR_URL
            });
        } else {
            applyThemePreference(localStorage.getItem("siteTheme") || window.themeManager?.getPreferredTheme?.() || "coffee");
            updateProfileIdentity({
                nickname: localStorage.getItem("profileNickname") || "",
                avatarURL: localStorage.getItem("profileAvatar") || DEFAULT_AVATAR_URL
            });
        }
    } catch (err) {
        console.error("Помилка завантаження профілю:", err);
    }
}

function renderProfileTeams(teams) {
    const container = document.getElementById("profile-teams-list");
    if (!container) return;

    if (!teams.length) {
        container.innerHTML = '<div class="mini-empty">Немає команд</div>';
        return;
    }

    container.innerHTML = teams.map(team => {
        const accent = getTeamAccent(team.name || "");
        const safeName = team.name || "Без названия";
        const coverURL = normalizeAssetURL(team.logoURL, { allowDataImage: true });
        const safeCover = coverURL ? `url('${coverURL.replace(/'/g, "\\'")}')` : "none";
        const logo = coverURL
            ? `<img src="${escapeAttribute(coverURL)}" class="mini-logo" alt="">`
            : `<div class="mini-logo-ph">${escapeHTML(safeName[0])}</div>`;

        return `<div class="mini-item" style="--team-accent:${accent};--team-cover:${safeCover};">
            <div class="mini-card-top">
                ${logo}
                <span class="mini-badge">${escapeHTML(safeName)}</span>
            </div>
        </div>`;
    }).join("");
}

function renderProfileProjects(projects) {
    const slider = document.getElementById("projects-slider");
    const prevBtn = document.getElementById("slider-prev");
    const nextBtn = document.getElementById("slider-next");
    if (!slider) return;

    if (!projects.length) {
        slider.innerHTML = '<div style="color:#b1a191;font-size:13px;font-weight:700;padding:10px 0;">Немає проєктів</div>';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    slider.innerHTML = projects.map(project => {
        const coverURL = normalizeAssetURL(project.coverURL, { allowDataImage: true });
        const cover = coverURL
            ? `<img class="proj-slide-cover" src="${escapeAttribute(coverURL)}" alt="${escapeAttribute(project.title)}">`
            : `<div class="proj-slide-cover-ph">рџ–ј</div>`;

        return `<div class="proj-slide">
            ${cover}
            <div class="proj-slide-info">
                <div class="proj-slide-title">${escapeHTML(project.title)}</div>
                <div class="proj-slide-team">${escapeHTML(project.team || "")}</div>
            </div>
        </div>`;
    }).join("");

    initProjectsSlider(slider, prevBtn, nextBtn);
}

function subscribeToData() {
    onSnapshot(query(userTeamsCollectionRef(db, uid), orderBy("createdAt")),
        snap => renderProfileTeams(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    onSnapshot(query(userProjectsCollectionRef(db, uid), orderBy("createdAt")),
        snap => renderProfileProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    onSnapshot(userArchivedTasksCollectionRef(db, uid),
        snap => updateProfileRank(snap.size));
}

document.addEventListener("userReady", async e => {
    uid = e.detail.uid;
    initAvatarUpload();
    initThemePicker();
    await loadProfile();
    subscribeToData();
});
