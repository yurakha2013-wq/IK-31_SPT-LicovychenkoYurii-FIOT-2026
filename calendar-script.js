/**
 * CALENDAR-SCRIPT.JS
 * - Переключение недель
 * - Готово: при наведенні на обкладинку з’являється кавовий напівпрозорий кружок
 *   із зеленою галочкою. Клік змінює isReady. Окремої кнопки "Готово" немає.
 *   Якщо isReady=true — кружок із галочкою видно завжди.
 */

import { db } from "./firebase-config.js";
import {
    buildUpdateMeta,
    userProjectsCollectionRef,
    userTaskDocRef,
    userTasksCollectionRef
} from "./data-model.js";
import {
    updateDoc,
    onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let uid        = null;
let tasks      = [];
let projects   = {};
let weekOffset = 0;
const EMPTY_MARK = "-";
const LEGACY_EMPTY_MARK = "\u2014";

const DAY_NAMES = ["ПН","ВТ","СР","ЧТ","ПТ","СБ","НД"];

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

function normalizeAssetURL(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    if (raw.startsWith("data:image/") || raw.startsWith("blob:")) return raw;

    try {
        const parsed = new URL(raw, window.location.href);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.href;
        }
    } catch (_) {
    }

    return "";
}

function jsToMon(d) { return d === 0 ? 6 : d - 1; }

function getWeekDates(offset) {
    const today = new Date(); today.setHours(0,0,0,0);
    const dow   = jsToMon(today.getDay());
    const mon   = new Date(today);
    mon.setDate(today.getDate() - dow + offset * 7);
    return Array.from({length:7}, (_, i) => {
        const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
}

function fmtDate(d) {
    return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
}

function fmtLabel(d) {
    return `${d.getDate()} ${d.toLocaleString("uk-UA",{month:"short"}).toUpperCase()}`;
}

function updateWeekControls() {
    const days = getWeekDates(weekOffset);
    const lbl  = document.getElementById("week-label");
    if (lbl)  lbl.textContent = `${fmtLabel(days[0])} - ${fmtLabel(days[6])} ${days[6].getFullYear()}`;
}

function buildCalendar() {
    const grid = document.getElementById("calendar-grid");
    if (!grid) return;

    const weekDays = getWeekDates(weekOffset);
    const today    = new Date(); today.setHours(0,0,0,0);
    updateWeekControls();
    grid.innerHTML = "";

    weekDays.forEach((dayDate, idx) => {
        const isToday  = dayDate.getTime() === today.getTime();
        const dateStr  = fmtDate(dayDate);
        const dayTasks = tasks.filter(t => t.date === dateStr);

        const col = document.createElement("div");
        col.className = "day-col" + (isToday ? " today" : "");
        col.innerHTML = `
            <div class="day-header">
                <div class="day-name">${DAY_NAMES[idx]}</div>
                <div class="day-date">${dayDate.getDate()}</div>
            </div>
            <div class="day-tasks"></div>`;
        grid.appendChild(col);

        const tc = col.querySelector(".day-tasks");
        if (!dayTasks.length) {
            tc.innerHTML = `<div class="day-empty"><i class="fas fa-check" style="display:block;margin-bottom:5px;opacity:0.25;"></i>Порожньо</div>`;
            return;
        }
        dayTasks.forEach(task => tc.appendChild(buildCard(task)));
    });
}

function buildCard(task) {
    const projectTitle = normalizeTextValue(task.project);
    const teamName = normalizeTextValue(task.team);
    const cover = projectTitle ? projects[projectTitle] || null : null;
    const projName = projectTitle || teamName || EMPTY_MARK;
    const chap = (task.chapter && String(task.chapter) !== "0") ? `Глава ${task.chapter}` : "";
    const isDone   = !!task.isReady;

    const card = document.createElement("div");
    card.className = "cal-card" + (isDone ? " cal-card-done" : "");

    let chips = "";
    if (task.taskType) chips += `<span class="cal-chip task">${escapeHTML(task.taskType)}</span>`;
    if (task.price && parseInt(task.price) > 0) chips += `<span class="cal-chip price">${parseInt(task.price, 10)}₽</span>`;

    card.innerHTML = `
        <div class="cal-card-cover">
            <div class="cal-overlay"></div>
            <!-- Кружок галочки: всегда виден если isDone, иначе только при hover -->
            <div class="cal-check-badge ${isDone ? "is-done" : ""}">
                <i class="fas fa-check"></i>
            </div>
            <div class="cal-card-cover-text">
                <div class="cal-project-name">${escapeHTML(displayTextValue(projName))}</div>
                ${chap ? `<div class="cal-chapter-line">${escapeHTML(chap)}</div>` : ""}
            </div>
        </div>
        ${chips ? `<div class="cal-card-body"><div class="cal-meta">${chips}</div></div>` : ""}`;

    const coverNode = card.querySelector(".cal-card-cover");
    if (coverNode) {
        const safeCover = normalizeAssetURL(cover);
        if (safeCover) {
            coverNode.style.backgroundImage = `url("${safeCover}")`;
        } else {
            coverNode.style.backgroundColor = "var(--light-bg)";
        }
    }

    // Клик по обложке — переключает isReady
    card.querySelector(".cal-card-cover").addEventListener("click", async () => {
        if (!task._id) return;
        try {
            await updateDoc(userTaskDocRef(db, uid, task._id), {
                isReady: !isDone,
                ...buildUpdateMeta(uid)
            });
        } catch (err) { console.error(err); }
    });

    return card;
}

function initWeekButtons() {
    document.getElementById("btn-week-prev")?.addEventListener("click", () => {
        weekOffset--;
        buildCalendar();
    });
    document.getElementById("btn-week-next")?.addEventListener("click", () => {
        weekOffset++; buildCalendar();
    });
}

document.addEventListener("userReady", e => {
    uid = e.detail.uid;
    initWeekButtons();

    onSnapshot(
        query(userTasksCollectionRef(db, uid), orderBy("createdAt","desc")),
        snap => {
            tasks = snap.docs.map(d => ({
                _id: d.id,
                ...d.data(),
                team: normalizeTextValue(d.data().team),
                project: normalizeTextValue(d.data().project),
                date: normalizeTextValue(d.data().date)
            }));
            buildCalendar();
        }
    );

    onSnapshot(userProjectsCollectionRef(db, uid), snap => {
        projects = {};
        snap.docs.forEach(d => {
            const p = d.data();
            const title = normalizeTextValue(p.title);
            if (title && p.coverURL) projects[title] = p.coverURL;
        });
        buildCalendar();
    });
});
