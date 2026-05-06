# Firestore Blueprint

## Current Live Shape

The live site still uses per-user subcollections:

- `users/{uid}/profile/data`
- `users/{uid}/teams/{teamId}`
- `users/{uid}/projects/{projectId}`
- `users/{uid}/tasks/{taskId}`
- `users/{uid}/archivedTasks/{taskId}`

This keeps the current app stable and does not expose any new UI.

## Invisible Scaffold Added

New and updated documents should now carry:

- `ownerId`
- `schemaVersion`
- `updatedAt`
- `createdAt` on create flows

That metadata makes the database easier to reason about in Firestore and gives us a clean base for future migrations.

## Recommended Next-Stage Schema

When the product grows into multi-user collaboration, the target should move toward top-level collections and membership links:

- `users/{uid}`
  - auth/profile shell
- `workspaces/{workspaceId}`
  - future shared space for teams and projects
- `memberships/{membershipId}`
  - `workspaceId`, `userId`, `role`, `status`
- `teams/{teamId}`
  - `workspaceId`, `ownerId`, `title`, `visibility`
- `teamMembers/{membershipId}`
  - `teamId`, `userId`, `role`
- `projects/{projectId}`
  - `workspaceId`, `teamId`, `ownerId`, `title`, `status`
- `tasks/{taskId}`
  - `workspaceId`, `projectId`, `teamId`, `ownerId`, `assigneeIds`, `status`
- `taskComments/{commentId}`
  - `taskId`, `authorId`, `body`
- `taskActivity/{activityId}`
  - immutable audit log
- `conversations/{conversationId}`
  - shared user communication
- `messages/{messageId}`
  - `conversationId`, `authorId`, `body`
- `notifications/{notificationId}`
  - per-user delivery feed

## Migration Strategy

Phase 1:

- Keep the current live structure.
- Write metadata fields to every new/updated document.
- Centralize path builders in `data-model.js`.

Phase 2:

- Introduce top-level shared collections in parallel.
- Start dual-write only after rules and indexes are ready.
- Migrate reads page-by-page behind data-layer helpers, not through UI rewrites.

Phase 3:

- Backfill historical documents.
- Switch reads fully to the shared model.
- Freeze legacy nested collections as archival compatibility data.

## Rule of Thumb

If a document may later be searched, shared, assigned, mentioned in chat, or filtered across users, it should eventually live in a top-level collection with explicit foreign keys instead of only inside a user subtree.
