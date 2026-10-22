# Admin design system

Everything lives in `frontend/src/admin/admin.css`, scoped to `.adm`, so the public site is untouched.

- **Frame:** `admin/Shell.jsx`. One left sidebar (groups: Overview, People, Content; search at the top; language, theme and account at the bottom).
  It collapses to a 64px icon rail (remembered in the browser) and becomes a drawer below 900px. There is no top navigation; the admin renders outside the public layout.
- **Tokens:** `--a-*` (surfaces, text, hairlines, one forest-green accent, green/amber/red for meaning only). Light and dark are both defined, following the site's theme switch.
- **Buttons:** `btn-dark` = the single primary action; `btn-outline` = useful secondary; `btn-ghost` = quiet (row and toolbar actions);
  `btn-ok` = a positive confirmation (Approve); `btn-danger` = destructive confirmations only.
- **Status** (`StatusBadge`): a dot plus the word. Green = published/approved, amber = draft/pending, grey = archived/rejected. Record status is never shown as a button.
- **Tables** (`admin/DataTable.jsx`): `table-layout: fixed`, explicit column widths, names wrap at word boundaries (two lines), email/URLs are cut with an ellipsis and a tooltip,
  hairline row dividers, sticky header. Below 720px of *container* width a row becomes a labelled card.
- **Overlays:** menus and palette pop in (120ms), dialogs scale in, record editors open as a right-hand drawer. All motion is CSS and is disabled by `prefers-reduced-motion`.
- **Gotcha worth remembering:** do not put `container-type`, `transform` or a lingering animation on an ancestor of a `position: fixed` element (menus, dialogs):
  it becomes their containing block. Row menus are portalled into `.adm` for this reason.

## Fourth pass: nested sidebar, favorites and neutral theme

- **Theme**: cool neutral surfaces, charcoal primary button (light) / near-white (dark), indigo only for focus and selection, semantic green/amber/red. Section icons (Lucide, one stroke weight) sit on faint tinted tiles (`.ni-*`).
- **Sidebar** (`admin/Sidebar.jsx`, destinations in `admin/nav.js`): Dashboard and Activity, collapsible *Community* and *Content* groups (animated grid-row disclosure, chevrons, a group holding the current page reopens itself), then **Favorites**. Ctrl/Cmd+B toggles the icon rail; below 900px it is a drawer.
- **Favorites** (`lib/favorites.js`, `admin/favorites.jsx`): per-admin, stored in this browser only (`jk-fav:<user id>`), never used for authorization. Star beside any page title adds that exact view (path + filters) with a name and folder. Folders can be created, renamed, deleted (only shortcuts go), collapsed; shortcuts can be renamed, moved up/down, moved between folders or removed through the ⋮ menu, or dragged. Targets are validated against the real admin routes on add and on load; unknown or hostile entries are dropped.
- **E2E**: `npm run e2e` (Playwright, installed Chrome/Edge). It starts an in-memory API on :8090 with `JK_NO_DOTENV=1` and Vite on :5199 with empty Supabase settings, so it cannot reach the real database or Supabase.

### Nested views and My profile

- **View mapping** (`admin/nav.js`, covered by `lib/nav.test.js`): Students: All = no filter, Pending/Approved/Rejected = `status=`, Incomplete profiles = `complete=no`. Admin management (`?tab=roles`): Everyone = no `role`, Admin/Member = `role=`. Blog and Gallery: All = `status=all`, Active = no `status` (everything not archived), Draft/Published/Archived = `status=`; Gallery "Hidden" = `status=draft` (an image that is saved but not shown publicly). A child is current only when the address shows exactly that view; page, page size and search never change it. Following a child only changes the query, never a record.
- **My profile** (`admin/ProfileModal.jsx`): opened from the account button (black-and-white initials badge). Reads `/auth/me`; saves with `PATCH /me/profile`, which the server restricts to phone, blood group and directory/contact visibility. Role, name, batch, department and status are shown read-only, and `TestProfilePatchCannotChangeProtectedFields` proves they cannot be changed through it. Unsaved edits ask before discarding. There is no avatar upload because the profile model has no photo field. Email changes are not offered here (they go through the Supabase verification flow).
- **Menus**: `RowMenu` is the shared action menu (icons, hints, checked state, separators, flips above when short of room, stays inside the viewport, arrow-key navigation, Escape returns focus).

### Member editing and the imported directory

- **Member editor** (`StudentsAdmin.jsx` drawer, `PATCH /admin/students/{id}`): every profile field the schema stores is editable by an admin: name, batch, department, upazila, union, phone, blood group and directory listing, with backend validation, a stale-save guard and an unsaved-changes prompt. The schema has no gender, biography or photo field for members, so none are shown (nothing was invented). A member's own privacy levels (who sees their phone, email, blood group) stay the member's choice and are not editable by admins. Password, email, role and account lifecycle go through their own protected flows.
- **Verified mark** beside a registered member's name appears only when the membership is approved **and** Supabase has confirmed the email; its tooltip says so.
- **Imported directory** (`/admin/students?tab=imported`, sidebar "Imported directory": All / Awaiting review / Verified): imported records are directory entries, not accounts. "Verify" stores `imported_reviews` (migration 008): who verified, when, and optionally the registered account of the same person. One account links to at most one record (409 otherwise). Verifying or linking never changes the account's approval, role, name or email confirmation, and the imported mark's tooltip says it is a directory record. Verification can be withdrawn; every change is audited.
