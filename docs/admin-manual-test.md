# Admin panel — setup and manual test guide

What each tab does, how to check it, and which kinds of testing prove what. Nothing here needs a real email.

## Start locally

```bash
cd backend && go run .          # http://localhost:8080
cd frontend && npm run dev      # http://localhost:5173 (open this address)
```

`backend/.env` needs `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (and `ADMIN_EMAILS` only for the first-admin command).
`frontend/.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Real values stay in those git-ignored files; the
`.env.example` files hold placeholders only.

## Database and storage setup (order)

1. Start the API once: it applies migrations `001`–`006` in order (all additive; nothing is dropped or rewritten) and, the first time,
   imports the bundled blog posts, heritage places and gallery pictures into the editorial tables so they stay visible and become editable.
2. Run `cd backend && go run . storage-setup` once. It creates the public-read buckets `executive-photos` and `site-media`
   (5 MB, JPEG/PNG only) and the admin-only upload policies. If it reports a permission error, paste
   `backend/storage/executive_photos.sql` into Supabase → SQL Editor instead.
3. First admin: register, confirm the email, put it in `ADMIN_EMAILS`, then `go run . bootstrap-admin` (preview) and
   `go run . bootstrap-admin --apply`.

Storage rules: anyone can read the buckets, only verified admins can upload (the API forwards the admin's own token, no service key exists),
and there is no update/delete policy, so uploaded files are never overwritten or deleted by the app. Archiving content hides it on the site; the file
stays in the bucket (remove unreferenced files by hand in Supabase → Storage if you ever want to).

## What each section does

| Section | URL | Notes |
|---|---|---|
| Dashboard | `/admin` | Counts come from the database. Cards link to the matching list with the filter applied. "Contact messages" shows `—` because the contact form writes to a log file, not the database. |
| Admin management | `/admin?tab=roles` | Search, role filter, promote/demote with confirmation, role-change history. Rules (verified accounts only, no self-promotion, last admin protected) are enforced by the API and the database. |
| Executive Committee | `/admin?tab=committee` | See `docs/executive-committee.md`. |
| Students | `/admin/students` | Registered members: search, filters (status, department, batch, email verified, profile complete, active/deactivated), edit, approve/reject/reset, deactivate/reactivate, bulk review, CSV export. Second tab: the imported directory (read-only). |
| Heritage places | `/admin/heritage` | Draft/publish/unpublish/archive/restore, bilingual names, location, facts, sources, several images, preview. |
| Blog | `/admin/blog` | Markdown editor with toolbar, preview, categories/tags, featured image, SEO fields, draft/publish/archive. No scheduler: publishing is manual. |
| Gallery | `/admin/gallery` | Albums, multi-file upload with progress, captions/credit/license, hide/show, archive, reorder, move between albums. |
| Activity | `/admin/activity` | Read-only timeline of admin actions from the audit tables, filterable by area and text. |

## The list toolbar (every admin list)

- **Search** (debounced), **quick views** (tabs such as Pending/Approved or Draft/Published/Archived), the main filters inline, the rest behind **Filters**
  (a draft panel: nothing is applied until you press *Apply*), a **sort** menu, and **Saved views**.
- Every active filter is a **chip** that can be removed on its own; "Clear filters" removes all. The line "Showing 21–40 of 126" always matches the server's total.
- All state lives in the URL (shareable, survives refresh and back/forward); a changed filter returns to page 1. Lists are filtered, sorted and paged by the API
  (sort fields are allow-listed; anything else is a 400), and a slow old response can never overwrite a newer one.
- **Saved views** are stored in this browser only, per admin and per section (max 12). They are a convenience, never used for permissions.
- **Quick search**: `Ctrl/Cmd+K` anywhere in the admin jumps to a section or finds students, posts, places and albums by name.
- **Stale-save guard**: if another admin saved a post/place/image after you opened it, your save is refused with a clear message and your text stays in the form.

Archive means "hidden everywhere and kept"; there is intentionally no permanent delete button. Deactivating a member keeps the account and profile.

## Manual checks

1. **Dashboard.** Open `/admin`; numbers match the lists. Create a blog draft; the draft count goes up. Publish it; published goes up.
2. **Blog.** `/admin/blog/new`: type an English title (the URL name fills itself). Use the toolbar, open Preview, Save draft, Publish (confirm),
   open the public page `/blog/<url-name>` in a private window. Archive it: the public page returns "not found".
3. **Heritage.** `/admin/heritage/new`: enter a latitude of `120` and a source of `javascript:alert(1)`; Save shows red notes and keeps what you typed.
   Fix them, save, publish; the place appears on `/heritage` and its upazila's place count goes up. Archive it; both revert.
4. **Gallery.** Upload one or two images: each shows progress and ends as "added as hidden". Edit one (caption, credit), press "Show on site"; open `/gallery`
   in a private window. Put it in a hidden album: it disappears publicly. Archive it.
5. **Students.** Search a name, filter by status, open a member, change the phone to `123` (the server rejects it, your input stays), fix it and save.
   Deactivate a member (confirm): they can no longer use the site and leave the directory; reactivate them. Export CSV: no emails; "with contact details" asks to confirm
   and is written to the audit trail.
6. **Roles.** In Admin management promote a second *verified* member; an unverified one has a disabled button. Open "Role change history".
   Try to demote the only admin: refused.
7. **Navigation.** Every sidebar item works, the current section is highlighted, refresh/back/forward keep filters (they live in the URL), the menu collapses on a phone.
8. **Toolbar.** On Blog: pick *Archived*, open *Filters*, set *From* to a far-future date (nothing changes until *Apply*), apply it (a chip appears, the count says "No results"), remove just that chip, save the search as a view, clear everything, apply the saved view, delete it. Press `Ctrl+K`, type a post title, press Enter.
9. **Language and theme.** Toggle Bangla/English and light/dark on each page.

## What the automated checks prove (and what they do not)

- `cd backend && go vet ./... && go test ./... -count=1` — authorization of every admin endpoint (401 without a token, 403 for members, 403 for unverified accounts),
  validation, slug rules, status flow, public visibility (only published content is public), uploads (content is decoded, re-encoded; fake files and Drive failures are refused),
  member rules (cannot edit roles through the student editor, cannot deactivate admins or yourself, deactivated accounts are refused), audit entries, CSV protections.
  These run on the in-memory store with a fake Supabase and fake storage.
- `LIVE_TEMP_TABLES=1 go test -run TestPostgresStoresInTempTables ./...` — runs the committee and editorial suites against the **real PostgreSQL engine** on
  temporary tables that exist on one connection only and shadow the real ones, so no real row is read or written. It reads `DATABASE_URL` from `backend/.env`.
- `cd frontend && npm test && npm run build` — unit tests for the pure helpers (auth error mapping, Markdown blocks, URL names) and a production build.
- `frontend/src/lib/filters.js` (chips, ranges, saved views) has unit tests; the rest of the toolbar, tables and dialogs have no automated component tests.
- **Not automated:** React components and full browser journeys have no automated suite (no DOM test harness or Playwright is installed). They were checked by hand in the
  browser against the live local app, as described above (all admin routes crawled for console errors, unlabeled controls, horizontal overflow and broken images; phone, tablet
  and laptop widths; Bangla and English).
- **Live Supabase behaviour verified by hand:** real image uploads to the `site-media` bucket by an admin (new picture, and replacing one), the public URL loading, the public gallery showing it,
  an anonymous upload straight to Supabase being refused by the row-level-security policy, and an API upload without a token being a 401. Browser-side refusal of a wrong file type and an oversize
  file (no request is sent). **Not verified:** real email delivery, and an upload by a signed-in *non-admin* member directly against Supabase (the API refuses non-admins first, and the policy is admin-only).

## Before production

- Set `COOKIE_SECURE=true`, `FRONTEND_URL`, `CORS_ORIGIN` and a verified email sender; keep `APP_ENV=production`.
- Re-run `storage-setup`, then check Storage → both buckets show as Public and have a 5 MB limit.
- Decide how to clean unreferenced files in the buckets and who may have the admin role.
- Database access uses the backend's own privileged connection, which bypasses row level security. The tables have RLS enabled with no policies (so the public
  key cannot read them); the Go API is what enforces who may read or change what, and the tests above prove those rules.
