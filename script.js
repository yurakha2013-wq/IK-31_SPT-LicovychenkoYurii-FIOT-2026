import { db } from "./firebase-config.js";
import {
    buildCreateMeta,
    buildUpdateMeta,
    userArchivedTasksCollectionRef,
    userProjectsCollectionRef,
    userTaskDocRef,
    userTasksCollectionRef,
    userTeamsCollectionRef
} from "./data-model.js";
import {
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    getDocs,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TASK_TYPES = ["Переклад", "Редакт", "Клін", "Тайп", "Едіт", "Звуки", "Клін зі звуками", "Бета"];
const ENTRY_TYPES = {
    chapter: "Глава",
    weekly: "Щотижневик",
    single: "Сингл"
};

const taskIcons = {
    "Переклад": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6M4 14l6-6M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>`,
    "Перевод": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8l6 6M4 14l6-6M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/></svg>`,
    "Редакт": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    "Клін": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    "Клин": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
    "Тайп": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>`,
    "Едіт": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
    "Эдит": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
    "Звуки": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`,
    "Клін зі звуками": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    "Клин со звуками": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    "Бета": `<svg class="task-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3"/></svg>`
};

let uid = null;
let teamLogos = {};
let allTeams = [];
let allProjects = [];
let currentStatsTeam = "all";
let archivedCache = [];
let activeTasksCache = [];
let currentTaskSearch = "";
let teamDropdownCloseHandler = null;
let taskSearchFrame = 0;
let taskListInteractionsBound = false;
const EMPTY_MARK = "-";
const LEGACY_EMPTY_MARK = "\u2014";

function tasksCollection() {
    return userTasksCollectionRef(db, uid);
}

function archivedTasksCollection() {
    return userArchivedTasksCollectionRef(db, uid);
}

function getInitial(value = "") {
    const normalized = value.trim();
    return normalized ? normalized[0].toUpperCase() : "?";
}

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

function normalizeSearchValue(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\s+/g, " ")
        .trim();
}

function buildTaskSearchText(data) {
    return normalizeSearchValue([
        normalizeTextValue(data.team),
        normalizeTextValue(data.project),
        normalizeTextValue(data.taskType),
        data.chapter
    ].join(" "));
}

function ensureTaskSearchEmptyRow(taskList) {
    let row = document.getElementById("task-search-empty-row");
    if (row || !taskList) return row;

    row = document.createElement("tr");
    row.id = "task-search-empty-row";
    row.innerHTML = `
        <td colspan="9" class="task-search-empty-cell">
            Нічого не знайдено. Спробуй проєкт, задачу або номер глави.
        </td>
    `;
    taskList.appendChild(row);
    return row;
}

function applyTaskSearch() {
    const taskList = document.getElementById("task-list");
    if (!taskList) return;

    const rows = [...taskList.querySelectorAll("tr[data-id]")];
    const query = normalizeSearchValue(currentTaskSearch);
    const tokens = query ? query.split(" ").filter(Boolean) : [];
    const emptyRow = document.getElementById("task-search-empty-row");

    if (!rows.length) {
        emptyRow?.remove();
        return;
    }

    let visibleCount = 0;

    rows.forEach(row => {
        const haystack = row.dataset.search || "";
        const matches = !tokens.length || tokens.every(token => haystack.includes(token));
        row.style.display = matches ? "" : "none";
        if (matches) visibleCount += 1;
    });

    if (tokens.length && visibleCount === 0) {
        ensureTaskSearchEmptyRow(taskList).style.display = "";
        return;
    }

    emptyRow?.remove();
}

function initTaskSearch() {
    const searchInput = document.getElementById("task-search");
    if (!searchInput || searchInput.dataset.bound === "true") return;

    searchInput.dataset.bound = "true";
    currentTaskSearch = searchInput.value || "";
    searchInput.addEventListener("input", () => {
        currentTaskSearch = searchInput.value;
        if (taskSearchFrame) cancelAnimationFrame(taskSearchFrame);
        taskSearchFrame = requestAnimationFrame(() => {
            taskSearchFrame = 0;
            applyTaskSearch();
        });
    });
}

function createScheduleId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `weekly-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function parseDisplayDate(value) {
    const normalized = normalizeTextValue(value);
    if (!normalized) return null;
    const [day, month, year] = normalized.split(".").map(Number);
    if (!day || !month || !year) return null;
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return EMPTY_MARK;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

function inputDateToDisplay(value) {
    if (!value) return EMPTY_MARK;
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
}

function displayDateToInput(value) {
    const parsed = parseDisplayDate(value);
    if (!parsed) return "";
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addWeeksToDisplayDate(value, weeksCount) {
    const parsed = parseDisplayDate(value);
    if (!parsed) return EMPTY_MARK;
    const next = new Date(parsed);
    next.setDate(next.getDate() + (7 * weeksCount));
    return formatDisplayDate(next);
}

function clampNumber(value, min, max) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return min;
    return Math.min(Math.max(parsed, min), max);
}

function normalizeEntryType(value) {
    return ENTRY_TYPES[value] ? value : "chapter";
}

function compareTaskSequence(a, b) {
    const aChapter = parseInt(a.chapter, 10) || 0;
    const bChapter = parseInt(b.chapter, 10) || 0;
    if (aChapter !== bChapter) return aChapter - bChapter;
    const aDate = parseDisplayDate(a.date)?.getTime() || 0;
    const bDate = parseDisplayDate(b.date)?.getTime() || 0;
    return aDate - bDate;
}

function buildNextWeeklyTask(seed) {
    return {
        team: normalizeTextValue(seed.team),
        project: normalizeTextValue(seed.project),
        taskType: seed.taskType,
        chapter: Math.min((parseInt(seed.chapter, 10) || 0) + 1, 9999),
        date: addWeeksToDisplayDate(seed.date, 1),
        price: parseInt(seed.price, 10) || 0,
        isReady: false,
        isPaid: false,
        entryType: "weekly",
        scheduleId: seed.scheduleId,
        weeklyStopped: false
    };
}

async function stopWeeklyChain(scheduleId, currentFsId) {
    if (!scheduleId) return;
    const activeSnap = await getDocs(query(tasksCollection(), where("scheduleId", "==", scheduleId)));
    const updates = activeSnap.docs
        .filter(docSnap => docSnap.id !== currentFsId)
        .map(docSnap => updateDoc(userTaskDocRef(db, uid, docSnap.id), {
            weeklyStopped: true,
            ...buildUpdateMeta(uid)
        }));
    await Promise.all(updates);
}

async function ensureWeeklyTaskQueue(taskData) {
    if (normalizeEntryType(taskData.entryType) !== "weekly" || !taskData.scheduleId || taskData.weeklyStopped) return;

    const [activeSnap, archivedSnap] = await Promise.all([
        getDocs(query(tasksCollection(), where("scheduleId", "==", taskData.scheduleId))),
        getDocs(query(archivedTasksCollection(), where("scheduleId", "==", taskData.scheduleId)))
    ]);

    const activeTasks = activeSnap.docs.map(d => ({
        ...d.data(),
        team: normalizeTextValue(d.data().team),
        project: normalizeTextValue(d.data().project),
        date: normalizeTextValue(d.data().date)
    }));
    const archivedTasks = archivedSnap.docs.map(d => ({
        ...d.data(),
        team: normalizeTextValue(d.data().team),
        project: normalizeTextValue(d.data().project),
        date: normalizeTextValue(d.data().date)
    }));
    const allScheduleTasks = [...activeTasks, ...archivedTasks];

    if (allScheduleTasks.some(task => task.weeklyStopped)) return;
    if (!allScheduleTasks.length || activeTasks.length >= 3) return;

    let latestTask = allScheduleTasks.reduce((best, current) => (
        compareTaskSequence(current, best) > 0 ? current : best
    ), allScheduleTasks[0]);

    let activeCount = activeTasks.length;
    while (activeCount < 3) {
        latestTask = buildNextWeeklyTask(latestTask);
        await addDoc(tasksCollection(), {
            ...latestTask,
            ...buildCreateMeta(uid)
        });
        activeCount += 1;
    }
}

async function archiveTask(fsId, taskData, options = {}) {
    const shouldStopWeeklyChain = Boolean(
        options.stopWeeklyChain &&
        taskData.scheduleId &&
        normalizeEntryType(taskData.entryType) === "weekly"
    );

    if (shouldStopWeeklyChain) {
        await stopWeeklyChain(taskData.scheduleId, fsId);
    }

    await addDoc(archivedTasksCollection(), {
        ...taskData,
        team: normalizeTextValue(taskData.team),
        project: normalizeTextValue(taskData.project),
        date: normalizeTextValue(taskData.date),
        weeklyStopped: shouldStopWeeklyChain ? true : Boolean(taskData.weeklyStopped),
        archiveDate: new Date().toLocaleDateString("uk-UA"),
        archivedAt: serverTimestamp(),
        ...buildUpdateMeta(uid)
    });
    await deleteDoc(userTaskDocRef(db, uid, fsId));
    if (!shouldStopWeeklyChain) {
        await ensureWeeklyTaskQueue(taskData);
    }
}

function teamLogoHTML(teamName) {
    const normalizedTeamName = normalizeTextValue(teamName);
    const src = teamLogos[normalizedTeamName];
    if (src) return `<img src="${escapeAttribute(src)}" class="team-logo-sm" alt="">`;
    return `<div class="team-logo-placeholder">${escapeHTML(getInitial(normalizedTeamName))}</div>`;
}

function buildCustomSelect(teams) {
    const wrapper = document.getElementById("custom-team-select");
    if (!wrapper) return;

    const options = [
        { value: "all", label: "Усі команди", logo: null },
        ...teams.map(team => ({ value: team.name, label: team.name, logo: teamLogos[team.name] || null }))
    ];

    function logoHTML(option, isTrigger) {
        const imageClass = isTrigger ? "trigger-logo" : "option-logo";
        const placeholderClass = isTrigger ? "trigger-logo-placeholder" : "option-logo-placeholder";
        if (option.value === "all") return `<div class="${placeholderClass}" style="font-size:12px;">★</div>`;
        if (option.logo) return `<img src="${escapeAttribute(option.logo)}" class="${imageClass}" alt="">`;
        return `<div class="${placeholderClass}">${escapeHTML(getInitial(option.label))}</div>`;
    }

    wrapper.innerHTML = `
        <div class="custom-team-trigger" id="team-trigger"></div>
        <div class="custom-team-dropdown" id="team-dropdown"></div>
    `;

    const trigger = document.getElementById("team-trigger");
    const dropdown = document.getElementById("team-dropdown");

    const open = () => {
        trigger.classList.add("open");
        dropdown.classList.add("visible");
    };
    const close = () => {
        trigger.classList.remove("open");
        dropdown.classList.remove("visible");
    };

    function renderTrigger() {
        const option = options.find(item => item.value === currentStatsTeam) || options[0];
        trigger.innerHTML = `
            ${logoHTML(option, true)}
            <span class="trigger-label">${escapeHTML(option.label)}</span>
            <svg class="trigger-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M6 9l6 6 6-6"/>
            </svg>
        `;
    }

    function renderDropdown() {
        dropdown.innerHTML = "";
        options.forEach(option => {
            const item = document.createElement("div");
            item.className = "dropdown-option" + (option.value === currentStatsTeam ? " selected" : "");
            item.innerHTML = `${logoHTML(option, false)}<span>${escapeHTML(option.label)}</span>`;
            item.addEventListener("click", () => {
                currentStatsTeam = option.value;
                close();
                renderTrigger();
                renderDropdown();
                updateStats();
            });
            dropdown.appendChild(item);
        });
    }

    trigger.addEventListener("click", event => {
        event.stopPropagation();
        if (trigger.classList.contains("open")) close();
        else open();
    });

    if (teamDropdownCloseHandler) {
        document.removeEventListener("click", teamDropdownCloseHandler);
    }

    teamDropdownCloseHandler = event => {
        if (!wrapper.contains(event.target)) {
            close();
        }
    };

    document.addEventListener("click", teamDropdownCloseHandler);
    renderTrigger();
    renderDropdown();
}

function updateStats() {
    let earned = 0;
    let paid = 0;

    activeTasksCache.forEach(task => {
        const taskTeam = normalizeTextValue(task.team);
        if (currentStatsTeam !== "all" && taskTeam !== currentStatsTeam) return;
        const price = parseInt(task.price, 10) || 0;
        if (task.isReady) earned += price;
        if (task.isPaid) paid += price;
    });

    archivedCache.forEach(task => {
        const taskTeam = normalizeTextValue(task.team);
        if (currentStatsTeam !== "all" && taskTeam !== currentStatsTeam) return;
        const price = parseInt(task.price, 10) || 0;
        earned += price;
        if (task.isPaid) paid += price;
    });

    const earnedEl = document.getElementById("stat-earned");
    const paidEl = document.getElementById("stat-paid");
    const debtEl = document.getElementById("stat-debt");

    if (earnedEl) earnedEl.innerText = `${earned}₽`;
    if (paidEl) paidEl.innerText = `${paid}₽`;
    if (debtEl) debtEl.innerText = `${earned - paid}₽`;
}

function findTaskInCache(fsId) {
    return activeTasksCache.find(task => task.id === fsId) || null;
}

function bindTaskListInteractions() {
    const taskList = document.getElementById("task-list");
    if (!taskList || taskListInteractionsBound) return;

    taskListInteractionsBound = true;

    taskList.addEventListener("change", async event => {
        const checkbox = event.target.closest(".custom-checkbox");
        if (!checkbox) return;

        const row = checkbox.closest("tr[data-id]");
        const fsId = row?.dataset.id;
        if (!row || !fsId) return;

        const task = findTaskInCache(fsId);
        if (!task) return;

        const isReady = row.querySelector(".is-ready")?.checked || false;
        const isPaid = row.querySelector(".is-paid")?.checked || false;

        task.isReady = isReady;
        task.isPaid = isPaid;
        updateStats();

        try {
            await updateDoc(userTaskDocRef(db, uid, fsId), {
                isReady,
                isPaid,
                ...buildUpdateMeta(uid)
            });
        } catch (error) {
            console.error(error);
            return;
        }

        if (isReady && isPaid && row.dataset.archiving !== "true") {
            row.dataset.archiving = "true";
            row.style.transition = "opacity 0.5s";
            row.style.opacity = "0.4";

            setTimeout(async () => {
                try {
                    const latestTask = findTaskInCache(fsId);
                    if (!latestTask || !latestTask.isReady || !latestTask.isPaid) {
                        return;
                    }

                    await archiveTask(fsId, {
                        ...latestTask,
                        isReady: true,
                        isPaid: true
                    });
                } catch (error) {
                    console.error(error);
                    row.style.opacity = "1";
                    delete row.dataset.archiving;
                }
            }, 600);
        }
    });

    taskList.addEventListener("click", async event => {
        const archiveButton = event.target.closest(".btn-archive");
        if (archiveButton) {
            const row = archiveButton.closest("tr[data-id]");
            const fsId = row?.dataset.id;
            const task = fsId ? findTaskInCache(fsId) : null;
            if (!row || !fsId || !task) return;

            try {
                await archiveTask(fsId, {
                    ...task,
                    isReady: row.querySelector(".is-ready")?.checked || false,
                    isPaid: row.querySelector(".is-paid")?.checked || false
                }, {
                    stopWeeklyChain: true
                });
            } catch (error) {
                console.error(error);
                alert("Помилка архівації.");
            }
            return;
        }

        const editButton = event.target.closest(".btn-edit");
        if (editButton) {
            const row = editButton.closest("tr[data-id]");
            const fsId = row?.dataset.id;
            const task = fsId ? findTaskInCache(fsId) : null;
            if (!row || !fsId || !task) return;
            openEditRow(row, task, fsId);
        }
    });
}

function createTaskRow(data, fsId) {
    const teamName = displayTextValue(data.team);
    const projectName = displayTextValue(data.project);
    const taskName = displayTextValue(data.taskType);
    const chapterValue = data.chapter && String(data.chapter) !== "0" ? String(data.chapter) : EMPTY_MARK;
    const dateValue = displayTextValue(data.date);
    const priceValue = parseInt(data.price, 10) || 0;
    const row = document.createElement("tr");
    row.dataset.id = fsId;
    row.dataset.team = normalizeTextValue(data.team);
    row.dataset.search = buildTaskSearchText(data);

    row.innerHTML = `
        <td><div class="team-cell">${teamLogoHTML(data.team)}<span>${escapeHTML(teamName)}</span></div></td>
        <td style="text-align:left">${escapeHTML(projectName)}</td>
        <td><div class="task-cell">${taskIcons[data.taskType] || ""}<span class="task-name-text">${escapeHTML(taskName)}</span></div></td>
        <td>${escapeHTML(chapterValue)}</td>
        <td>${escapeHTML(dateValue)}</td>
        <td class="price-tag" data-price="${priceValue}">${priceValue}₽</td>
        <td><input type="checkbox" class="custom-checkbox is-ready" ${data.isReady ? "checked" : ""}></td>
        <td><input type="checkbox" class="custom-checkbox is-paid" ${data.isPaid ? "checked" : ""}></td>
        <td>
            <div style="display:flex;gap:4px;justify-content:center;">
                <button class="btn-edit" title="Редагувати"><i class="fas fa-pen"></i></button>
                <button class="btn-archive" title="В архів"><i class="fas fa-folder-plus"></i></button>
            </div>
        </td>
    `;

    return row;
}

function openEditRow(row, data, fsId) {
    const teamOptions = allTeams
        .map(team => `<option value="${escapeAttribute(team.name)}" ${team.name === data.team ? "selected" : ""}>${escapeHTML(team.name)}</option>`)
        .join("");

    const projectOptions = allProjects
        .filter(project => !normalizeTextValue(data.team) || project.team === normalizeTextValue(data.team))
        .map(project => `<option value="${escapeAttribute(project.title)}" ${project.title === data.project ? "selected" : ""}>${escapeHTML(project.title)}</option>`)
        .join("");

    const taskOptions = TASK_TYPES
        .map(type => `<option value="${escapeAttribute(type)}" ${type === data.taskType ? "selected" : ""}>${escapeHTML(type)}</option>`)
        .join("");

    row.innerHTML = `
        <td colspan="9" class="edit-td">
            <div class="edit-row-form">
                <select class="edit-field ef-team"><option value="">-</option>${teamOptions}</select>
                <select class="edit-field ef-project"><option value="">-</option>${projectOptions}</select>
                <select class="edit-field ef-task">${taskOptions}</select>
                <input class="edit-field ef-chapter" type="number" value="${data.chapter || 0}" min="0" max="9999" placeholder="№ глави">
                <input class="edit-field ef-date" type="date" value="${displayDateToInput(data.date)}">
                <input class="edit-field ef-price" type="number" value="${data.price || 0}" min="0" max="9999999" placeholder="Ціна">
                <button class="btn-edit-save"><i class="fas fa-check"></i> Зберегти</button>
                <button class="btn-edit-cancel"><i class="fas fa-times"></i></button>
            </div>
        </td>
    `;

    const teamSelect = row.querySelector(".ef-team");
    const projectSelect = row.querySelector(".ef-project");

    teamSelect.addEventListener("change", () => {
        const selectedTeam = teamSelect.value;
        projectSelect.innerHTML = `<option value="">-</option>` + allProjects
            .filter(project => !selectedTeam || project.team === selectedTeam)
            .map(project => `<option value="${escapeAttribute(project.title)}">${escapeHTML(project.title)}</option>`)
            .join("");
    });

    row.querySelector(".btn-edit-cancel").onclick = () => {
        row.replaceWith(createTaskRow(data, fsId));
        applyTaskSearch();
    };

    row.querySelector(".btn-edit-save").onclick = async () => {
        const newTask = row.querySelector(".ef-task").value;
        if (!newTask) {
            alert("Вибери тип задачі.");
            return;
        }

        const saveButton = row.querySelector(".btn-edit-save");
        saveButton.disabled = true;

        try {
            await updateDoc(userTaskDocRef(db, uid, fsId), {
                team: normalizeTextValue(row.querySelector(".ef-team").value),
                project: normalizeTextValue(row.querySelector(".ef-project").value),
                taskType: newTask,
                chapter: clampNumber(row.querySelector(".ef-chapter").value, 0, 9999),
                date: inputDateToDisplay(row.querySelector(".ef-date").value),
                price: clampNumber(row.querySelector(".ef-price").value, 0, 9999999),
                ...buildUpdateMeta(uid)
            });
        } catch (error) {
            console.error(error);
            alert("Не вдалося зберегти.");
            saveButton.disabled = false;
        }
    };
}

function loadQuickAdd() {
    const teamSelect = document.getElementById("new-team");
    const projectSelect = document.getElementById("new-project");
    if (!teamSelect || !projectSelect) return;

    const teamOptions = allTeams
        .map(team => `<option value="${escapeAttribute(team.name)}">${escapeHTML(team.name)}</option>`)
        .join("");
    teamSelect.innerHTML = `<option value="">Команда</option>${teamOptions}`;

    function filterProjects() {
        const selectedTeam = teamSelect.value;
        const projectOptions = allProjects
            .filter(project => !selectedTeam || project.team === selectedTeam)
            .map(project => `<option value="${escapeAttribute(project.title)}">${escapeHTML(project.title)}</option>`)
            .join("");
        projectSelect.innerHTML = `<option value="">Проєкт</option>${projectOptions}`;
    }

    teamSelect.onchange = filterProjects;
    filterProjects();
}

function subscribeToTeamsAndProjects() {
    onSnapshot(userTeamsCollectionRef(db, uid), snapshot => {
        allTeams = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        teamLogos = {};
        allTeams.forEach(team => {
            if (team.logoURL) teamLogos[team.name] = team.logoURL;
        });
        buildCustomSelect(allTeams);
        loadQuickAdd();
    });

    onSnapshot(userProjectsCollectionRef(db, uid), snapshot => {
        allProjects = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        loadQuickAdd();
    });
}

function subscribeToTasks() {
    const taskList = document.getElementById("task-list");
    if (!taskList) return;

    bindTaskListInteractions();

    onSnapshot(
        query(tasksCollection(), orderBy("createdAt", "desc")),
        snapshot => {
            activeTasksCache = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
                team: normalizeTextValue(docSnap.data().team),
                project: normalizeTextValue(docSnap.data().project),
                date: normalizeTextValue(docSnap.data().date)
            }));
            taskList.innerHTML = "";
            if (snapshot.empty) {
                taskList.innerHTML = `
                    <tr>
                        <td colspan="9" style="text-align:center;color:#b1a191;padding:30px;font-weight:700;">
                            Задач поки немає, додай першу!
                        </td>
                    </tr>
                `;
            } else {
                const fragment = document.createDocumentFragment();
                activeTasksCache.forEach(task => fragment.appendChild(createTaskRow(task, task.id)));
                taskList.appendChild(fragment);
            }
            applyTaskSearch();
            updateStats();
        }
    );
}

async function createWeeklyTasks(baseData) {
    await Promise.all(Array.from({ length: 3 }, (_, index) => (
        addDoc(tasksCollection(), {
            ...baseData,
            chapter: Math.min((parseInt(baseData.chapter, 10) || 0) + index, 9999),
            date: addWeeksToDisplayDate(baseData.date, index),
            ...buildCreateMeta(uid)
        })
    )));
}

function resetQuickAddFields() {
    const chapterInput = document.getElementById("new-chapter");
    const dateInput = document.getElementById("new-date");
    const priceInput = document.getElementById("new-price");
    if (chapterInput) chapterInput.value = "";
    if (dateInput) dateInput.value = "";
    if (priceInput) priceInput.value = "";
}

function initCreateButton() {
    const button = document.getElementById("add-task-btn");
    if (!button) return;

    button.onclick = async () => {
        const taskType = document.getElementById("new-task").value;
        const chapterInput = document.getElementById("new-chapter");
        const dateInput = document.getElementById("new-date");
        const priceInput = document.getElementById("new-price");
        const entryTypeSelect = document.getElementById("new-entry-type");

        if (!taskType) {
            alert("Вибери задачу.");
            return;
        }

        const entryType = normalizeEntryType(entryTypeSelect?.value);
        const chapterRaw = chapterInput?.value.trim() || "";
        const dateRaw = dateInput?.value || "";

        if (entryType === "weekly" && (!chapterRaw || !dateRaw)) {
            alert("Для щотижневика обов’язково вкажи № глави та дедлайн.");
            return;
        }

        const chapter = clampNumber(chapterRaw, 0, 9999);
        const price = clampNumber(priceInput?.value, 0, 9999999);

        const baseData = {
            team: normalizeTextValue(document.getElementById("new-team").value),
            project: normalizeTextValue(document.getElementById("new-project").value),
            taskType,
            chapter,
            date: inputDateToDisplay(dateRaw),
            price,
            isReady: false,
            isPaid: false,
            entryType
        };

        button.disabled = true;
        try {
            if (entryType === "weekly") {
                await createWeeklyTasks({
                    ...baseData,
                    entryType: "weekly",
                    scheduleId: createScheduleId()
                });
            } else {
                await addDoc(tasksCollection(), {
                    ...baseData,
                    ...buildCreateMeta(uid)
                });
            }
            resetQuickAddFields();
        } catch (error) {
            console.error(error);
            alert("Не вдалося створити задачу.");
        } finally {
            button.disabled = false;
        }
    };
}

function subscribeToArchived() {
    onSnapshot(archivedTasksCollection(), snapshot => {
        archivedCache = snapshot.docs.map(docSnap => ({
            ...docSnap.data(),
            team: normalizeTextValue(docSnap.data().team),
            project: normalizeTextValue(docSnap.data().project),
            date: normalizeTextValue(docSnap.data().date)
        }));
        updateStats();
    });
}

document.addEventListener("userReady", event => {
    uid = event.detail.uid;
    initTaskSearch();
    subscribeToTeamsAndProjects();
    subscribeToTasks();
    subscribeToArchived();
    initCreateButton();
});
