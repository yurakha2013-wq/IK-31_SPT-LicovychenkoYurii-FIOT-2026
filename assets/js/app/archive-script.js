/**
 * ARCHIVE-SCRIPT.JS
 * Виправлення: чекбокс "вибрати все" у thead не потрапляє у вибірку рядків
 */

import { db } from "../core/firebase-config.js";
import {
    buildCreateMeta,
    userArchivedTaskDocRef,
    userArchivedTasksCollectionRef,
    userTasksCollectionRef,
    userTeamsCollectionRef
} from "../core/data-model.js";
import {
    deleteDoc, addDoc,
    onSnapshot, query, orderBy, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let uid          = null;
let teamLogos    = {};
let archivedDocs = [];
const EMPTY_MARK = "-";
const LEGACY_EMPTY_MARK = "\u2014";

const taskIcons = {
    "Переклад": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6M4 14l6-6M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>`,
    "Перевод": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6M4 14l6-6M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>`,
    "Редакт":  `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    "Клін":    `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    "Клин":    `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    "Тайп":    `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`,
    "Едіт":    `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
    "Эдит":    `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
    "Звуки":   `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`,
    "Клін зі звуками": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    "Клин со звуками": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    "Бета":    `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3"/></svg>`
};

function normalizeTextValue(value) {
    const normalized = String(value ?? "").trim();
    return normalized && normalized !== LEGACY_EMPTY_MARK ? normalized : "";
}

function displayTextValue(value) {
    const normalized = normalizeTextValue(value);
    return normalized || EMPTY_MARK;
}

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

function getRowCheckboxes() {
    // ТОЛЬКО чекбоксы внутри tbody — не трогаем thead
    return document.querySelectorAll("#archive-list .row-select");
}

function updateExportFilter(docs) {
    const sel = document.getElementById("export-team-filter");
    if (!sel) return;
    const teams = [...new Set(docs.map(d => normalizeTextValue(d.data.team)).filter(Boolean))];
    sel.innerHTML = '<option value="all">Усі команди</option>';
    teams.forEach(t => { sel.innerHTML += `<option value="${escapeAttribute(t)}">${escapeHTML(t)}</option>`; });
}

function updateDeleteBtn() {
    const count = getRowCheckboxes().length > 0
        ? [...getRowCheckboxes()].filter(c => c.checked).length
        : 0;
    const btn = document.getElementById("btn-delete-selected");
    if (btn) btn.style.display = count > 0 ? "flex" : "none";
}

function renderArchive(docs) {
    archivedDocs = docs;
    const list     = document.getElementById("archive-list");
    const countEl  = document.getElementById("archive-count");
    const checkAll = document.getElementById("check-all");
    if (!list) return;

    if (countEl) countEl.textContent = docs.length ? `${docs.length} записів` : "";

    if (!docs.length) {
        list.innerHTML = `<tr><td colspan="9"><div class="empty-archive">
            <i class="fas fa-archive"></i><p>Архів порожній</p>
        </div></td></tr>`;
        if (checkAll) checkAll.checked = false;
        updateDeleteBtn();
        updateExportFilter([]);
        return;
    }

    list.innerHTML = "";

    docs.forEach(({ id, data }) => {
        const teamName = displayTextValue(data.team);
        const projectName = displayTextValue(data.project);
        const taskName = displayTextValue(data.taskType);
        const chapterValue = data.chapter && String(data.chapter) !== "0" ? String(data.chapter) : EMPTY_MARK;
        const archiveDate = displayTextValue(data.archiveDate);
        const priceValue = parseInt(data.price, 10) || 0;
        const row  = document.createElement("tr");
        row.dataset.fsid = id;
        const normalizedTeamName = normalizeTextValue(data.team);
        const logo = teamLogos[normalizedTeamName]
            ? `<img src="${escapeAttribute(teamLogos[normalizedTeamName])}" class="team-logo-sm" alt="">`
            : `<div class="team-logo-placeholder">${escapeHTML((teamName || "?")[0])}</div>`;

        row.innerHTML = `
            <td><input type="checkbox" class="row-select custom-checkbox" data-fsid="${id}"></td>
            <td><div class="team-cell">${logo}<span>${escapeHTML(teamName)}</span></div></td>
            <td style="text-align:left">${escapeHTML(projectName)}</td>
            <td><div class="task-cell">${taskIcons[data.taskType] || ""}<span>${escapeHTML(taskName)}</span></div></td>
            <td>${escapeHTML(chapterValue)}</td>
            <td>${escapeHTML(archiveDate)}</td>
            <td>${priceValue}₴</td>
            <td><span class="status-badge ${data.isPaid ? "paid" : "unpaid"}">${data.isPaid ? "Оплачено" : "Не оплачено"}</span></td>
            <td>
                <div class="row-actions">
                    <button class="btn-row-restore" data-fsid="${id}" title="Повернути в поточні"><i class="fas fa-undo"></i></button>
                    <button class="btn-row-delete" data-fsid="${id}" title="Видалити"><i class="fas fa-trash"></i></button>
                </div>
            </td>`;

        list.appendChild(row);
    });

    // Чекбоксы ТОЛЬКО в tbody
    getRowCheckboxes().forEach(cb => {
        cb.addEventListener("change", () => {
            cb.closest("tr").classList.toggle("selected-row", cb.checked);
            // Синхронізуємо "вибрати все"
            const all  = getRowCheckboxes();
            const done = [...all].filter(c => c.checked);
            if (checkAll) checkAll.checked = all.length > 0 && done.length === all.length;
            updateDeleteBtn();
        });
    });

    list.querySelectorAll(".btn-row-restore").forEach(btn => {
        btn.addEventListener("click", () => restoreSingle(btn.dataset.fsid, archivedDocs));
    });

    list.querySelectorAll(".btn-row-delete").forEach(btn => {
        btn.addEventListener("click", () => deleteSingle(btn.dataset.fsid));
    });

    updateExportFilter(docs);
    updateDeleteBtn();
}

async function restoreSingle(fsId, docs) {
    const entry = docs ? docs.find(d => d.id === fsId) : null;
    if (!entry) {
        alert("Не вдалося знайти задачу.");
        return;
    }

    const taskData = {
        ...entry.data,
        team: normalizeTextValue(entry.data.team),
        project: normalizeTextValue(entry.data.project),
        date: normalizeTextValue(entry.data.date)
    };
    delete taskData.archiveDate;
    delete taskData.archivedAt;
    taskData.isReady = false;
    taskData.isPaid = false;
    taskData.createdAt = serverTimestamp();
    Object.assign(taskData, buildCreateMeta(uid));

    try {
        await addDoc(userTasksCollectionRef(db, uid), taskData);
        await deleteDoc(userArchivedTaskDocRef(db, uid, fsId));
    } catch (err) {
        console.error(err);
        alert("Не вдалося повернути задачу.");
    }
}

async function deleteSingle(fsId) {
    try {
        await deleteDoc(userArchivedTaskDocRef(db, uid, fsId));
    } catch (err) {
        console.error(err);
        alert("Не вдалося видалити запис.");
    }
}

async function deleteSelected() {
    const checked = [...getRowCheckboxes()].filter(c => c.checked);
    if (!checked.length) return;
    try {
        const batch = writeBatch(db);
        checked.forEach(cb => batch.delete(userArchivedTaskDocRef(db, uid, cb.dataset.fsid)));
        await batch.commit();
    } catch (err) {
        console.error(err);
        alert("Помилка під час видалення.");
    }
}

window.exportToExcel = function () {
    if (typeof XLSX === "undefined") { alert("XLSX не загружен."); return; }
    const selTeam = document.getElementById("export-team-filter")?.value || "all";
    let data = archivedDocs.map(d => d.data);
    if (selTeam !== "all") data = data.filter(t => t.team === selTeam);
    if (!data.length) { alert("Немає даних для експорту."); return; }
    const rows = data.map(t => ({
        "Команда": displayTextValue(t.team), "Проєкт": displayTextValue(t.project),
        "Задача": displayTextValue(t.taskType), "№ глави": t.chapter || EMPTY_MARK,
        "Дата архіву": displayTextValue(t.archiveDate),
            "Ціна (грн.)": parseInt(t.price) || 0,
        "Виконано": t.isReady ? "Так" : "Ні",
        "Оплачено":  t.isPaid  ? "Так" : "Ні"
    }));
    const total = data.reduce((s, t) => s + (parseInt(t.price) || 0), 0);
    rows.push({ "Команда": "Усього", "Ціна (грн.)": total });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{wch:18},{wch:22},{wch:16},{wch:10},{wch:14},{wch:14},{wch:12},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selTeam === "all" ? "Архів" : selTeam.slice(0, 30));
    const d = new Date().toLocaleDateString("uk-UA").replace(/\./g, "-");
    XLSX.writeFile(wb, `Архів_${selTeam === "all" ? "усі" : selTeam}_${d}.xlsx`);
};

document.addEventListener("DOMContentLoaded", () => {
    const checkAll = document.getElementById("check-all");

    // "Вибрати все" — лише рядки в tbody
    checkAll?.addEventListener("change", () => {
        getRowCheckboxes().forEach(cb => {
            cb.checked = checkAll.checked;
            cb.closest("tr").classList.toggle("selected-row", checkAll.checked);
        });
        updateDeleteBtn();
    });

    document.getElementById("btn-delete-selected")?.addEventListener("click", deleteSelected);
});

document.addEventListener("userReady", e => {
    uid = e.detail.uid;

    onSnapshot(userTeamsCollectionRef(db, uid), snap => {
        teamLogos = {};
        snap.docs.forEach(d => { const t = d.data(); if (t.logoURL) teamLogos[t.name] = t.logoURL; });
    });

    onSnapshot(
        query(userArchivedTasksCollectionRef(db, uid), orderBy("archivedAt", "desc")),
        snap => renderArchive(snap.docs.map(d => ({ id: d.id, data: d.data() })))
    );
});

