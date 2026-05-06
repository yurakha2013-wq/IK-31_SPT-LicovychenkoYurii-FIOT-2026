import {
    collection,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const SCHEMA_VERSION = 1;

export const CURRENT_SCHEMA = Object.freeze({
    users: "users",
    profile: "profile",
    teams: "teams",
    projects: "projects",
    tasks: "tasks",
    archivedTasks: "archivedTasks"
});

export const FUTURE_SCHEMA = Object.freeze({
    users: "users",
    workspaces: "workspaces",
    memberships: "memberships",
    teams: "teams",
    teamMembers: "teamMembers",
    projects: "projects",
    projectMembers: "projectMembers",
    tasks: "tasks",
    taskComments: "taskComments",
    taskActivity: "taskActivity",
    conversations: "conversations",
    messages: "messages",
    notifications: "notifications"
});

export function userRootDocRef(db, uid) {
    return doc(db, CURRENT_SCHEMA.users, uid);
}

export function userProfileDocRef(db, uid) {
    return doc(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.profile, "data");
}

export function userTeamsCollectionRef(db, uid) {
    return collection(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.teams);
}

export function userTeamDocRef(db, uid, teamId) {
    return doc(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.teams, teamId);
}

export function userProjectsCollectionRef(db, uid) {
    return collection(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.projects);
}

export function userProjectDocRef(db, uid, projectId) {
    return doc(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.projects, projectId);
}

export function userTasksCollectionRef(db, uid) {
    return collection(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.tasks);
}

export function userTaskDocRef(db, uid, taskId) {
    return doc(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.tasks, taskId);
}

export function userArchivedTasksCollectionRef(db, uid) {
    return collection(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.archivedTasks);
}

export function userArchivedTaskDocRef(db, uid, taskId) {
    return doc(db, CURRENT_SCHEMA.users, uid, CURRENT_SCHEMA.archivedTasks, taskId);
}

export function buildCreateMeta(ownerId) {
    return {
        ownerId,
        schemaVersion: SCHEMA_VERSION,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
}

export function buildUpdateMeta(ownerId) {
    return {
        ownerId,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp()
    };
}

