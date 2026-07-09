# Shared Base Folder — Design

**Date:** 2026-07-09  
**Status:** Implemented  
**Audience:** Technical writers, engineers, product

---

## Problem

Technical writers need a clear boundary between **internal API work** and **customer-facing documentation**. Today:

- **Share Folder** (`workspaceShares`) gives internal team access via `/shared-workspace/{token}` — auth required, editable.
- **Publish docs** (`collection.isPublic`) exposes the **entire collection** at `/collection-docs/{slug}` — no folder-level scope.

There is no way to say: *“Only this folder subtree is what customers see.”*

---

## Goal

Introduce a **Shared Base** folder designation that serves **both** purposes:

1. **Team collaboration** — writers and engineers work in the same folder (using existing Share Folder flow).
2. **Customer publishing** — when enabled, public docs include only the shared base subtree.

### Non-goals

- Replacing or merging with `workspaceShares` (share links stay separate).
- Auto-creating share links when marking a folder as shared base.
- Changing workspace-level `isShared` (ownership indicator) semantics.
- Scoping API definition docs (`/docs/{slug}`) — collection docs only.

---

## Terminology (avoid “shared” collision)

| Term | Layer | Meaning |
|------|-------|---------|
| **Shared workspace** | Access | Workspace you don’t own (`isShared` on tree) |
| **Share Folder** | Access | Token link for registered users (`workspaceShares`) |
| **Shared Base** | Content | Folder marked as customer-docs boundary (`isSharedBase`) |
| **Publish scope** | Publishing | Whether public docs show full collection or shared base only |

These are **orthogonal**. A folder can be a Shared Base *and* have Share Folder links — different axes (what vs who).

---

## Data Model

### `folders`

```ts
isSharedBase: boolean  // default false
```

**Constraints:**

- Max **one** `isSharedBase = true` folder per collection.
- Only **root-level** folders (no `parentFolderId`) may be marked.
- Descendants inherit the publish boundary implicitly (no per-child flag).

### `collections`

```ts
publishScope: 'full' | 'shared_base'  // default 'full'
```

| Value | Public docs include |
|-------|---------------------|
| `full` | Entire collection (current behavior) |
| `shared_base` | Shared base subtree only + collection-level intro doc blocks |

**Backward compatibility:** `publishScope` defaults to `full`. Existing published collections are unchanged.

---

## Publish Filter Logic

When `GET /api/public/collection-docs/[slug]` runs:

```
if publishScope === 'full':
  return all folders, requests, doc blocks (unchanged)

if publishScope === 'shared_base':
  base = root folder where isSharedBase === true
  if !base → 404 or empty response with clear error
  folders = subtree(base)
  requests = requests in subtree (+ none at collection root unless explicitly allowed later)
  docBlocks = blocks where folderId in subtree
              OR folderId IS NULL (collection-level intro — see decision below)
```

### Decision: collection-level intro blocks

**Include collection-level doc blocks** (`folderId = null`) even when scoped to shared base. Intro content (“Welcome to our API”) sits above the folder tree and should not require living inside the base folder.

---

## API Changes

| Endpoint | Change |
|----------|--------|
| `PATCH /api/admin/folders/[id]` | Set/unset `isSharedBase`; enforce one-per-collection + root-only |
| `PUT /api/admin/collections/[id]` | Accept `publishScope`; validate `shared_base` requires a base folder when `isPublic` |
| `GET /api/admin/tree` / `tree-light` | Return `isSharedBase` on folders, `publishScope` on collections |
| `GET /api/public/collection-docs/[slug]` | Apply scope filter when `publishScope === 'shared_base'` |

No changes to `workspaceShares` CRUD or `/api/shared-workspace/*`.

---

## UI Changes

### Folder tree

- Badge: **“Docs Base”** (teal/green) — distinct from purple **“Shared”** workspace badge.
- Context menu: **“Set as Customer Docs Base”** / **“Remove Customer Docs Base”**.
- Keep **Share Folder** unchanged directly below.

### Publish Collection Docs modal

- New control: **Publish scope** — `Full collection` | `Customer docs base only`.
- Block publish when `shared_base` selected but no base folder exists.
- Show preview hint: “Customers will see N endpoints in shared base.”

### Share Workspace modal (folder context)

- Info line when folder is shared base: *“This folder is the customer documentation base.”*
- No change to share link creation behavior.

---

## Writer Workflow

```
Collection
├── Internal / Dev        ← never in scoped public docs
├── Draft                 ← writer WIP
└── 📤 Customer Docs Base ← isSharedBase = true
    ├── Getting Started
    ├── Authentication
    └── API Reference
```

1. Mark root folder as **Customer Docs Base**.
2. Organize endpoints and doc blocks underneath.
3. **Share Folder** → invite team (existing flow).
4. **Publish docs** → scope = `Customer docs base only`.
5. Share `/collection-docs/{slug}` with customers.

---

## Backward Compatibility

| Existing behavior | After change |
|-------------------|--------------|
| Published collections | Unchanged (`publishScope = full`) |
| Share links | Unchanged |
| Folders without flag | Internal; irrelevant until scoped publish is chosen |
| Workspace `isShared` | Unchanged |
| RequestBuilder “Shared” badge | Unchanged |

---

## Implementation Phases

### Phase 1 — Schema & API
- Migration: `folders.is_shared_base`, `collections.publish_scope`
- Folder PATCH + collection PUT validation
- Public collection-docs filter

### Phase 2 — Admin UI
- Folder badge + context menu
- Publish modal scope toggle
- Share modal info line

### Phase 3 — Polish
- Publish preview count
- Empty-state messaging when base folder missing
- Cache invalidation on tree APIs after flag changes

---

## Testing Checklist

- [ ] `publishScope = full` matches current public output exactly
- [ ] `publishScope = shared_base` excludes sibling folders and their requests
- [ ] Collection-level intro doc blocks still appear when scoped
- [ ] Only one shared base per collection enforced
- [ ] Share Folder on a shared base folder still creates valid `/shared-workspace/{token}` links
- [ ] Existing share links and published URLs unaffected after migration

---

## Commands (after implementation)

```bash
npm run db:generate
npm run db:push
npm run dev
```
