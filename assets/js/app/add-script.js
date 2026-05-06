/**
 * ADD-SCRIPT.JS
 * Пункт 4: редагування команд і проєктів
 * - Кнопка ✏️ поруч із кожною командою/проєктом
 * - Інлайн-форма з полем назви та завантаженням нового лого/обкладинки
 * - Збереження через updateDoc у Firestore
 * - У коді присутні: делегування подій, джс єкспресс, адаптивність
 */

import { db }                          from "../core/firebase-config.js";
import { compressImage, base64SizeKB } from "../core/image-utils.js";
import {
    buildCreateMeta,
    buildUpdateMeta,
    userProjectDocRef,
    userProjectsCollectionRef,
    userTeamDocRef,
    userTeamsCollectionRef
} from "../core/data-model.js";
import {
    addDoc, updateDoc, deleteDoc,
    onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let uid = null;

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

function toInlineArg(value) {
    return JSON.stringify(value ?? "");
}

// ── Drag-and-drop зоны загрузки ───────────────────────────────────────────────
function setupDropZone(zoneId, inputId, previewId, maxMB, maxW, maxH, quality) {
    const zone  = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const prev  = document.getElementById(previewId);
    if (!zone) return;
    zone.addEventListener("click",     () => input.click());
    zone.addEventListener("dragover",  e  => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop",      e  => { e.preventDefault(); zone.classList.remove("drag-over"); handleFile(e.dataTransfer.files[0], prev, maxMB, maxW, maxH, quality); });
    input.addEventListener("change",   e  => handleFile(e.target.files[0], prev, maxMB, maxW, maxH, quality));
}

async function handleFile(file, previewEl, maxMB, maxW, maxH, quality) {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > maxMB * 1024 * 1024) { alert(`Максимум ${maxMB} МБ.`); return; }
    try {
        const compressed = await compressImage(file, maxW, maxH, quality);
        previewEl.src = compressed;
        previewEl.classList.add("has-image");
        previewEl.dataset.base64 = compressed;
    } catch (err) { console.error(err); alert("Не вдалося обробити зображення."); }
}

setupDropZone("drop-zone-team",    "file-team",    "preview-team",    2, 350,  350,  0.80);
setupDropZone("drop-zone-project", "file-project", "preview-project", 8, 800, 1100,  0.78);

// ── Зберегти нову команду ─────────────────────────────────────────────────────
window.saveTeam = async function () {
    if (!uid) return alert("Зачекайте...");
    const name = document.getElementById("team-name")?.value.trim();
    if (!name) return alert("Введіть назву команди!");
    const prev    = document.getElementById("preview-team");
    const logoURL = prev?.dataset.base64 || null;
    if (logoURL && base64SizeKB(logoURL) > 700) { alert("Логотип занадто великий."); return; }
    const btn = document.querySelector('[onclick="saveTeam()"]');
    if (btn) btn.disabled = true;
    try {
        await addDoc(userTeamsCollectionRef(db, uid), {
            name,
            logoURL,
            ...buildCreateMeta(uid)
        });
        document.getElementById("team-name").value = "";
        if (prev) { prev.src = ""; prev.classList.remove("has-image"); delete prev.dataset.base64; }
    } catch (err) { console.error(err); alert("Не вдалося зберегти."); }
    finally { if (btn) btn.disabled = false; }
};

// ── Зберегти новий проєкт ─────────────────────────────────────────────────────
window.saveProject = async function () {
    if (!uid) return alert("Зачекайте...");
    const title  = document.getElementById("project-title")?.value.trim();
    const selEl  = document.getElementById("select-team-for-project");
    const teamId = selEl?.value;
    const team   = selEl?.selectedOptions[0]?.text || "";
    if (!title)  return alert("Введіть назву проєкту!");
    if (!teamId) return alert("Виберіть команду!");
    const prev     = document.getElementById("preview-project");
    const coverURL = prev?.dataset.base64 || null;
    if (coverURL && base64SizeKB(coverURL) > 900) { alert("Обкладинка занадто велика."); return; }
    const btn = document.querySelector('[onclick="saveProject()"]');
    if (btn) btn.disabled = true;
    try {
        await addDoc(userProjectsCollectionRef(db, uid), {
            title,
            teamId,
            team,
            coverURL,
            ...buildCreateMeta(uid)
        });
        document.getElementById("project-title").value = "";
        if (prev) { prev.src = ""; prev.classList.remove("has-image"); delete prev.dataset.base64; }
    } catch (err) { console.error(err); alert("Не вдалося зберегти."); }
    finally { if (btn) btn.disabled = false; }
};

// ── Видалити команду ──────────────────────────────────────────────────────────
window.deleteTeam = async function (id, name) {
    try { await deleteDoc(userTeamDocRef(db, uid, id)); }
    catch (err) { alert("Не вдалося видалити."); }
};

// ── Видалити проєкт ───────────────────────────────────────────────────────────
window.deleteProject = async function (id, title) {
    try { await deleteDoc(userProjectDocRef(db, uid, id)); }
    catch (err) { alert("Не вдалося видалити."); }
};

// ── Редагувати команду — інлайн-форма ────────────────────────────────────────
window.editTeam = function (id, currentName, currentLogo) {
    const item = document.querySelector(`.existing-item[data-id="${id}"]`);
    if (!item) return;

    item.innerHTML = `
        <div class="edit-inline-form">
            <div class="edit-inline-logo-wrap" id="edit-logo-wrap-${id}">
                ${currentLogo
                    ? `<img src="${escapeAttribute(currentLogo)}" class="edit-logo-preview" id="edit-logo-${id}">`
                    : `<div class="edit-logo-preview edit-logo-ph" id="edit-logo-${id}">${escapeHTML(currentName[0])}</div>`}
                <button class="edit-logo-btn" type="button" onclick="document.getElementById('edit-file-${id}').click()" title="Змінити лого">
                    <i class="fas fa-camera"></i>
                </button>
                <input type="file" id="edit-file-${id}" accept="image/*" hidden>
            </div>
            <input class="edit-inline-input" id="edit-name-${id}" type="text" value="${escapeAttribute(currentName)}" maxlength="40">
            <button class="btn-inline-save"   onclick="saveEditTeam('${id}')"><i class="fas fa-check"></i></button>
            <button class="btn-inline-cancel" onclick="cancelEditTeam('${id}')"><i class="fas fa-times"></i></button>
        </div>`;

    // Обработчик смены лого
    const fileInput = document.getElementById(`edit-file-${id}`);
    const logoEl    = document.getElementById(`edit-logo-${id}`);
    fileInput?.addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert("Максимум 2 МБ."); return; }
        try {
            const compressed = await compressImage(file, 350, 350, 0.80);
            if (logoEl.tagName === "IMG") {
                logoEl.src = compressed;
            } else {
                // заменяем placeholder на img
                const img = document.createElement("img");
                img.src = compressed;
                img.className = "edit-logo-preview";
                img.id = `edit-logo-${id}`;
                logoEl.replaceWith(img);
            }
            document.getElementById(`edit-logo-${id}`).dataset.base64 = compressed;
        } catch (err) { alert("Помилка обробки зображення."); }
    });
};

window.saveEditTeam = async function (id) {
    const nameEl  = document.getElementById(`edit-name-${id}`);
    const logoEl  = document.getElementById(`edit-logo-${id}`);
    const newName = nameEl?.value.trim();
    if (!newName) { alert("Введіть назву!"); return; }

    const newLogo = logoEl?.dataset.base64 || null; // null = не менялся

    const updateData = { name: newName };
    if (newLogo) updateData.logoURL = newLogo;
    Object.assign(updateData, buildUpdateMeta(uid));

    try {
        await updateDoc(userTeamDocRef(db, uid, id), updateData);
        // onSnapshot перерисует список
    } catch (err) { console.error(err); alert("Не вдалося зберегти."); }
};

window.cancelEditTeam = function (id) {
    // onSnapshot был подписан — просто инвалидируем чтобы он перерисовал
    // Но проще — вызвать renderTeams с последними данными (они в DOM не изменились)
    // Firestore сам восстановит через onSnapshot при любом изменении
    // Для немедленного восстановления — просто тригерим re-render через snapshot
    // Костыль: перезагружаем страницу не нужен — onSnapshot сам обновит при следующем изменении
    // Поэтому просто скрываем форму и восстанавливаем из последних данных через lastTeams
    if (window._lastTeams) renderTeams(window._lastTeams);
};

// ── Редагувати проєкт — інлайн-форма ─────────────────────────────────────────
window.editProject = function (id, currentTitle, currentCover, currentTeam) {
    const item = document.querySelector(`.existing-item[data-id="${id}"]`);
    if (!item) return;

    const teamOpts = (window._lastTeams || [])
        .map(t => `<option value="${escapeAttribute(t.id)}" ${t.name === currentTeam ? "selected" : ""}>${escapeHTML(t.name)}</option>`)
        .join("");

    item.innerHTML = `
        <div class="edit-inline-form">
            <div class="edit-inline-logo-wrap" id="edit-cover-wrap-${id}">
                ${currentCover
                    ? `<img src="${escapeAttribute(currentCover)}" class="edit-cover-preview" id="edit-cover-${id}">`
                    : `<div class="edit-cover-preview edit-cover-ph" id="edit-cover-${id}"><i class="fas fa-book"></i></div>`}
                <button class="edit-logo-btn" type="button" onclick="document.getElementById('edit-cfile-${id}').click()" title="Змінити обкладинку">
                    <i class="fas fa-camera"></i>
                </button>
                <input type="file" id="edit-cfile-${id}" accept="image/*" hidden>
            </div>
            <input class="edit-inline-input" id="edit-ptitle-${id}" type="text" value="${escapeAttribute(currentTitle)}" maxlength="80" style="flex:2;">
            <select class="edit-inline-select" id="edit-pteam-${id}">
                ${teamOpts}
            </select>
            <button class="btn-inline-save"   onclick="saveEditProject('${id}')"><i class="fas fa-check"></i></button>
            <button class="btn-inline-cancel" onclick="cancelEditProject()"><i class="fas fa-times"></i></button>
        </div>`;

    const fileInput = document.getElementById(`edit-cfile-${id}`);
    fileInput?.addEventListener("change", async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) { alert("Максимум 8 МБ."); return; }
        try {
            const compressed = await compressImage(file, 800, 1100, 0.78);
            const coverEl = document.getElementById(`edit-cover-${id}`);
            if (coverEl.tagName === "IMG") {
                coverEl.src = compressed;
            } else {
                const img = document.createElement("img");
                img.src = compressed;
                img.className = "edit-cover-preview";
                img.id = `edit-cover-${id}`;
                coverEl.replaceWith(img);
            }
            document.getElementById(`edit-cover-${id}`).dataset.base64 = compressed;
        } catch (err) { alert("Помилка обробки зображення."); }
    });
};

window.saveEditProject = async function (id) {
    const titleEl  = document.getElementById(`edit-ptitle-${id}`);
    const teamSelEl = document.getElementById(`edit-pteam-${id}`);
    const coverEl  = document.getElementById(`edit-cover-${id}`);

    const newTitle  = titleEl?.value.trim();
    const newTeamId = teamSelEl?.value;
    const newTeam   = teamSelEl?.selectedOptions[0]?.text || "";
    const newCover  = coverEl?.dataset.base64 || null;

    if (!newTitle)  { alert("Введіть назву!"); return; }
    if (!newTeamId) { alert("Виберіть команду!"); return; }

    const updateData = { title: newTitle, teamId: newTeamId, team: newTeam };
    if (newCover) updateData.coverURL = newCover;
    Object.assign(updateData, buildUpdateMeta(uid));

    try {
        await updateDoc(userProjectDocRef(db, uid, id), updateData);
    } catch (err) { console.error(err); alert("Не вдалося зберегти."); }
};

window.cancelEditProject = function () {
    if (window._lastProjects) renderProjects(window._lastProjects);
};

// ── Рендер команд ─────────────────────────────────────────────────────────────
function renderTeams(teams) {
    window._lastTeams = teams; // сохраняем для cancel
    const c   = document.getElementById("teams-list");
    const sel = document.getElementById("select-team-for-project");

    // Обновляем селект
    if (sel) {
        sel.innerHTML = teams.length
            ? '<option value="" disabled selected>Виберіть команду</option>'
            : '<option value="" disabled selected>Спочатку створіть команду</option>';
        teams.forEach(t => { sel.innerHTML += `<option value="${escapeAttribute(t.id)}">${escapeHTML(t.name)}</option>`; });
    }

    if (!c) return;
    if (!teams.length) { c.innerHTML = ""; return; }

    c.innerHTML = `<div class="existing-list-title">Ваші команди (${teams.length})</div>`;
    teams.forEach(t => {
        const logo = t.logoURL
            ? `<img src="${escapeAttribute(t.logoURL)}" class="existing-item-logo" alt="">`
            : `<div class="existing-item-logo-ph">${escapeHTML(t.name[0])}</div>`;

        const safeId = escapeAttribute(t.id);
        const safeNameArg = toInlineArg(t.name);
        const safeLogoArg = t.logoURL ? toInlineArg(t.logoURL) : "null";

        const div = document.createElement("div");
        div.className = "existing-item";
        div.dataset.id = t.id;
        div.innerHTML = `
            ${logo}
            <span class="existing-item-name">${escapeHTML(t.name)}</span>
            <button class="btn-edit-item"   onclick='editTeam("${safeId}",${safeNameArg},${safeLogoArg})' title="Редагувати"><i class="fas fa-pen"></i></button>
            <button class="btn-delete-item" onclick='deleteTeam("${safeId}",${safeNameArg})' title="Видалити"><i class="fas fa-times"></i></button>`;
        c.appendChild(div);
    });
}

// ── Рендер проєктів ───────────────────────────────────────────────────────────
function renderProjects(projects) {
    window._lastProjects = projects; // сохраняем для cancel
    const c = document.getElementById("projects-list");
    if (!c) return;
    if (!projects.length) { c.innerHTML = ""; return; }

    c.innerHTML = `<div class="existing-list-title">Ваші проєкти (${projects.length})</div>`;
    projects.forEach(p => {
        const cover = p.coverURL
            ? `<img src="${escapeAttribute(p.coverURL)}" class="existing-item-cover" alt="">`
            : `<div class="existing-item-cover-ph"><i class="fas fa-book" style="font-size:9px;color:#b1a191;"></i></div>`;

        const safeId = escapeAttribute(p.id);
        const safeTitleArg = toInlineArg(p.title);
        const safeCoverArg = p.coverURL ? toInlineArg(p.coverURL) : "null";
        const safeTeamArg = toInlineArg(p.team || "");

        const div = document.createElement("div");
        div.className = "existing-item";
        div.dataset.id = p.id;
        div.innerHTML = `
            ${cover}
            <span class="existing-item-name">${escapeHTML(p.title)}</span>
            <span class="existing-item-meta">${escapeHTML(p.team || "")}</span>
            <button class="btn-edit-item"   onclick='editProject("${safeId}",${safeTitleArg},${safeCoverArg},${safeTeamArg})' title="Редагувати"><i class="fas fa-pen"></i></button>
            <button class="btn-delete-item" onclick='deleteProject("${safeId}",${safeTitleArg})' title="Видалити"><i class="fas fa-times"></i></button>`;
        c.appendChild(div);
    });
}

// ── Подписки Firestore ────────────────────────────────────────────────────────
function subscribeToData() {
    onSnapshot(query(userTeamsCollectionRef(db, uid), orderBy("createdAt")),
        snap => renderTeams(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(userProjectsCollectionRef(db, uid), orderBy("createdAt")),
        snap => renderProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

document.addEventListener("userReady", e => { uid = e.detail.uid; subscribeToData(); });

